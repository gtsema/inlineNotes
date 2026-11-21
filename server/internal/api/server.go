// Package api wires the HTTP surface of the sync server: router, handlers, JSON
// helpers and CORS.
//
// Rule owners: docs/specs/sync-server.md (Rules / Semantics -> "API contract",
// "Validation", "Security posture").
//
// Routing uses `net/http`'s `ServeMux` with Go 1.22+ method patterns: no
// third-party router. Handlers decode, validate through `internal/model`, call
// `internal/store` and encode. No business rule lives here.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"inlinenotes/server/internal/model"
	"inlinenotes/server/internal/store"
)

// maxBodyBytes bounds a request body. A 20-note batch is far below this; the
// limit exists so a huge body cannot be buffered into memory (ruling A158).
const maxBodyBytes = 1 << 20 // 1 MiB

// NoteStore is the part of `store.Store` the handlers use. Declared here as an
// interface so handler tests can run against a fake when PostgreSQL is absent,
// while the store's own tests use the real database.
type NoteStore interface {
	Ping(ctx context.Context) error
	SaveNotes(ctx context.Context, pageID, authorID string, notes []model.NoteInput) (int, error)
	NotesForPage(ctx context.Context, pageID string) ([]model.Note, error)
	NotesForAuthor(ctx context.Context, authorID string, limit, offset int) ([]model.Note, error)
	DeleteAuthorNotesOnPage(ctx context.Context, pageID, authorID string) (int, error)
}

// Server holds the dependencies of the HTTP layer.
type Server struct {
	store  NoteStore
	logger *log.Logger
}

// New builds the HTTP handler tree: the four note endpoints plus `/health`.
func New(noteStore NoteStore, logger *log.Logger) http.Handler {
	if logger == nil {
		logger = log.New(io.Discard, "", 0)
	}
	s := &Server{store: noteStore, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /notes/page/{page_id}", s.handleGetPageNotes)
	mux.HandleFunc("POST /notes/page/{page_id}", s.handleSavePageNotes)
	mux.HandleFunc("DELETE /notes/page/{page_id}/author/{author_id}", s.handleDeleteAuthorNotes)
	mux.HandleFunc("GET /notes/author/{author_id}/all-pages", s.handleAuthorNotes)

	return withCORS(mux)
}

/* ------------------------------ handlers ---------------------------------- */

type healthResponse struct {
	Status string `json:"status"`
}

type notesResponse struct {
	Notes []model.Note `json:"notes"`
}

type savedResponse struct {
	Saved int `json:"saved"`
}

type deletedResponse struct {
	Deleted int `json:"deleted"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		s.logger.Printf("health: ping failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, errorResponse{Error: "database unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (s *Server) handleGetPageNotes(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("page_id")
	if err := model.ValidatePageID(pageID); err != nil {
		writeValidationError(w, err)
		return
	}

	notes, err := s.store.NotesForPage(r.Context(), pageID)
	if err != nil {
		s.logger.Printf("get page notes: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "storage failure"})
		return
	}
	if notes == nil {
		notes = []model.Note{}
	}
	writeJSON(w, http.StatusOK, notesResponse{Notes: notes})
}

func (s *Server) handleSavePageNotes(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("page_id")
	if err := model.ValidatePageID(pageID); err != nil {
		writeValidationError(w, err)
		return
	}

	var req model.SaveRequest
	if err := decodeJSON(r, &req); err != nil {
		writeValidationError(w, err)
		return
	}
	if err := model.ValidateSaveRequest(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	authorID := strings.TrimSpace(req.AuthorID)
	saved, err := s.store.SaveNotes(r.Context(), pageID, authorID, req.Notes)
	if err != nil {
		s.logger.Printf("save page notes: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "storage failure"})
		return
	}
	writeJSON(w, http.StatusOK, savedResponse{Saved: saved})
}

func (s *Server) handleDeleteAuthorNotes(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("page_id")
	if err := model.ValidatePageID(pageID); err != nil {
		writeValidationError(w, err)
		return
	}
	authorID := r.PathValue("author_id")
	if err := model.ValidateAuthorID(authorID); err != nil {
		writeValidationError(w, err)
		return
	}

	deleted, err := s.store.DeleteAuthorNotesOnPage(r.Context(), pageID, strings.TrimSpace(authorID))
	if err != nil {
		s.logger.Printf("delete author notes: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "storage failure"})
		return
	}
	writeJSON(w, http.StatusOK, deletedResponse{Deleted: deleted})
}

func (s *Server) handleAuthorNotes(w http.ResponseWriter, r *http.Request) {
	authorID := r.PathValue("author_id")
	if err := model.ValidateAuthorID(authorID); err != nil {
		writeValidationError(w, err)
		return
	}

	limit, err := intQueryParam(r, "limit", model.DefaultLimit)
	if err != nil {
		writeValidationError(w, err)
		return
	}
	if limit > model.MaxLimit {
		limit = model.MaxLimit
	}
	offset, err := intQueryParam(r, "offset", 0)
	if err != nil {
		writeValidationError(w, err)
		return
	}

	notes, err := s.store.NotesForAuthor(r.Context(), strings.TrimSpace(authorID), limit, offset)
	if err != nil {
		s.logger.Printf("get author notes: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "storage failure"})
		return
	}
	if notes == nil {
		notes = []model.Note{}
	}
	writeJSON(w, http.StatusOK, notesResponse{Notes: notes})
}

/* ------------------------------- helpers ---------------------------------- */

// intQueryParam reads a non-negative integer query parameter, falling back to a
// default when it is absent. A malformed value is a `400`, never a silent zero.
func intQueryParam(r *http.Request, name string, fallback int) (int, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return 0, &model.ValidationError{Field: name, Reason: "must be a non-negative integer"}
	}
	return value, nil
}

// decodeJSON reads one JSON object from the body. `anchor` is kept as raw bytes
// (ruling A154): the server never parses its shape.
//
// The body's bytes are checked for UTF-8 validity BEFORE they are decoded
// (ruling A159). This order is the whole fix for defect S16-2: `encoding/json`
// replaces an invalid byte in a string literal with `U+FFFD` instead of failing,
// so a check that runs after `Decode` sees a well-formed (and already corrupted)
// Go string, answers `200` and lets the store write `U+FFFD` to the table. The
// raw bytes are the only place where the client's mistake is still visible, so
// they are read once and judged before the decoder ever sees them.
func decodeJSON(r *http.Request, target *model.SaveRequest) error {
	body := http.MaxBytesReader(nil, r.Body, maxBodyBytes)
	raw, err := io.ReadAll(body)
	if err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return &model.ValidationError{Field: "body", Reason: "is too large"}
		}
		return &model.ValidationError{Field: "body", Reason: fmt.Sprintf("could not be read (%v)", err)}
	}
	if err := model.RequireValidUTF8("body", raw); err != nil {
		return err
	}

	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return &model.ValidationError{Field: "body", Reason: "is empty"}
		}
		return &model.ValidationError{Field: "body", Reason: fmt.Sprintf("is not a valid JSON object (%v)", err)}
	}
	if decoder.More() {
		return &model.ValidationError{Field: "body", Reason: "must contain a single JSON object"}
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	body, err := json.Marshal(payload)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"encoding failure"}`))
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeValidationError(w http.ResponseWriter, err error) {
	ve, ok := model.AsValidationError(err)
	if !ok {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request"})
		return
	}
	writeJSON(w, http.StatusBadRequest, errorResponse{Error: ve.Error()})
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorResponse{Error: "note not found"})
		return
	}
	writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "storage failure"})
}

// withCORS answers every request with a permissive CORS policy and short-circuits
// `OPTIONS`. A future content script calls this server from a page origin
// (ruling A158), so preflights must not 405.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
