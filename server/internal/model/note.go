// Package model holds the wire shapes of the sync server and the validation
// rules that stand between a request body and the table.
//
// Rule owners: docs/specs/sync-server.md (Rules / Semantics -> "Validation",
// "API contract"). Ruling A158 is the reason this package exists at all: no
// authentication is not no validation.
//
// Pure Go: no database, no HTTP, no clock. Every rule below is a pure function so
// the handlers and the store can be tested against the same predicates.
package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Caps mirrored from the extension. They are the server's copy of the
// extension's own limits, not a second source of truth for the domain:
// `comment` <= 256 characters and at most 20 notes per request/page are the
// numbers of AGENTS.md and `src/core/entry-rules.ts`.
const (
	// MaxCommentRunes is the comment cap, in code points.
	MaxCommentRunes = 256
	// MaxNotesPerRequest is the per-page cap the extension enforces, reused here
	// as the per-request note cap.
	MaxNotesPerRequest = 20
	// MaxAuthorIDRunes bounds `author_id` (the extension's author name, itself
	// capped at 40 code points by the options screen).
	MaxAuthorIDRunes = 64
	// MaxIDRunes bounds a note id.
	MaxIDRunes = 64
	// DefaultLimit / MaxLimit bound the all-pages page size (ruling A157).
	DefaultLimit = 50
	MaxLimit     = 200
)

// Note is one row of the `notes` table, in the wire shape of the API contract.
type Note struct {
	ID        string          `json:"id"`
	PageID    string          `json:"page_id"`
	AuthorID  string          `json:"author_id"`
	Text      string          `json:"text"`
	Comment   string          `json:"comment"`
	Anchor    json.RawMessage `json:"anchor"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

// NoteInput is one note inside a POST body. It has no `page_id` (that comes from
// the path) and no timestamps (the server owns them).
type NoteInput struct {
	ID      string          `json:"id"`
	Text    string          `json:"text"`
	Comment string          `json:"comment"`
	Anchor  json.RawMessage `json:"anchor"`
}

// SaveRequest is the body of `POST /notes/page/{page_id}` (ruling A155: the body
// carries the author whose set is being upserted).
type SaveRequest struct {
	AuthorID string      `json:"author_id"`
	Notes    []NoteInput `json:"notes"`
}

// ValidationError is a bad request: the handler turns it into `400` plus a JSON
// error. It carries a readable reason and never a stack trace.
type ValidationError struct {
	Field  string
	Reason string
}

func (e *ValidationError) Error() string {
	if e.Field == "" {
		return e.Reason
	}
	return fmt.Sprintf("%s: %s", e.Field, e.Reason)
}

// AsValidationError reports whether err is a *ValidationError. Handlers use it to
// separate `400` from `500`.
func AsValidationError(err error) (*ValidationError, bool) {
	var ve *ValidationError
	if errors.As(err, &ve) {
		return ve, true
	}
	return nil, false
}

// ValidatePageID checks a path page id. Empty, absurdly long and non-UTF-8 ids
// are refused; the value is otherwise opaque (ruling A153) and is never
// normalized, trimmed, lowercased or stripped.
func ValidatePageID(pageID string) error {
	if strings.TrimSpace(pageID) == "" {
		return &ValidationError{Field: "page_id", Reason: "must not be empty"}
	}
	if err := RequireValidUTF8("page_id", []byte(pageID)); err != nil {
		return err
	}
	if utf8.RuneCountInString(pageID) > 2048 {
		return &ValidationError{Field: "page_id", Reason: "must be at most 2048 characters"}
	}
	return nil
}

// ValidateAuthorID checks an author id from a path or from a body.
func ValidateAuthorID(authorID string) error {
	trimmed := strings.TrimSpace(authorID)
	if trimmed == "" {
		return &ValidationError{Field: "author_id", Reason: "must not be empty"}
	}
	if err := RequireValidUTF8("author_id", []byte(trimmed)); err != nil {
		return err
	}
	if utf8.RuneCountInString(trimmed) > MaxAuthorIDRunes {
		return &ValidationError{
			Field:  "author_id",
			Reason: fmt.Sprintf("must be at most %d characters", MaxAuthorIDRunes),
		}
	}
	return nil
}

// ValidateNoteID checks a note id from a path. It applies the same rules the
// body validator applies to `notes[i].id` (`validateRequiredRunes` with
// `MaxIDRunes`), so the id in a path and the id in a body are judged by one
// rule: non-empty after trimming, valid UTF-8, at most 64 code points.
//
// The path is the reason it exists as its own function instead of a call to
// `validateRequiredRunes`: the field name in a `400` must be `note_id`, which is
// what the client sent, not `id`, which it never sent.
func ValidateNoteID(noteID string) error {
	return validateRequiredRunes("note_id", noteID, MaxIDRunes)
}

// ValidateSaveRequest checks a whole POST body: the author, the note count and
// every note. It returns the first failure, so one bad note cannot slip past.
//
// The note count is checked first among the note rules so that an oversized array
// is refused before any per-note work happens.
func ValidateSaveRequest(req *SaveRequest) error {
	if req == nil {
		return &ValidationError{Field: "body", Reason: "must be a JSON object"}
	}
	if err := ValidateAuthorID(req.AuthorID); err != nil {
		return err
	}
	if len(req.Notes) > MaxNotesPerRequest {
		return &ValidationError{
			Field:  "notes",
			Reason: fmt.Sprintf("must contain at most %d notes", MaxNotesPerRequest),
		}
	}
	for i := range req.Notes {
		if err := validateNoteInput(&req.Notes[i]); err != nil {
			if ve, ok := AsValidationError(err); ok {
				return &ValidationError{
					Field:  fmt.Sprintf("notes[%d].%s", i, ve.Field),
					Reason: ve.Reason,
				}
			}
			return err
		}
	}
	return nil
}

func validateNoteInput(note *NoteInput) error {
	if err := validateRequiredRunes("id", note.ID, MaxIDRunes); err != nil {
		return err
	}
	if strings.TrimSpace(note.Text) == "" {
		return &ValidationError{Field: "text", Reason: "must not be empty"}
	}
	// A body is not a path: `encoding/json` silently replaces an invalid byte with
	// U+FFFD, so without this check a Windows-1251 comment would be stored as
	// garbage with a `200` (defect S16-2).
	if err := RequireValidUTF8("text", []byte(note.Text)); err != nil {
		return err
	}
	if err := RequireValidUTF8("comment", []byte(note.Comment)); err != nil {
		return err
	}
	if utf8.RuneCountInString(note.Comment) > MaxCommentRunes {
		return &ValidationError{
			Field:  "comment",
			Reason: fmt.Sprintf("must be at most %d characters", MaxCommentRunes),
		}
	}
	if err := validateAnchor(note.Anchor); err != nil {
		return err
	}
	return nil
}

// validateAnchor enforces ruling A154's boundary.
//
// The server does NOT know the anchor's shape: any JSON object, array or scalar is
// stored as it arrived and returned byte-for-byte. It does refuse two things,
// because the column is `jsonb` and because the brief makes `anchor` required:
// a value that is not JSON at all, and a JSON `null`. The extension's anchor is a
// text anchor (normalized text plus a context window) and `null` carries none of
// it, so accepting `null` would store a row that can never re-anchor - "no
// authentication is not no validation" (A158).
func validateAnchor(raw json.RawMessage) error {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return &ValidationError{Field: "anchor", Reason: "is required and must be valid JSON"}
	}
	if !json.Valid([]byte(trimmed)) {
		return &ValidationError{Field: "anchor", Reason: "must be valid JSON"}
	}
	if trimmed == "null" {
		return &ValidationError{Field: "anchor", Reason: "must not be null"}
	}
	return nil
}

func validateRequiredRunes(field, value string, max int) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return &ValidationError{Field: field, Reason: "must not be empty"}
	}
	if err := RequireValidUTF8(field, []byte(trimmed)); err != nil {
		return err
	}
	if utf8.RuneCountInString(trimmed) > max {
		return &ValidationError{Field: field, Reason: fmt.Sprintf("must be at most %d characters", max)}
	}
	return nil
}

// RequireValidUTF8 is the single owner of the "is this valid UTF-8" rule of this
// package (ruling A159, AC 11). Every request-derived string that can reach a
// `TEXT` column goes through it: the path segments `page_id` and `author_id`, the
// note fields `id`, `text` and `comment`, and the raw JSON body before it is
// decoded.
//
// It takes bytes on purpose: a body must be judged before `encoding/json` has had
// the chance to replace an invalid byte with `U+FFFD`, and a Go string is exactly
// a byte slice. There is one decision here and no second copy elsewhere in the
// server.
//
// It exists because neither check below answers this question:
// `utf8.RuneCountInString` counts an invalid byte as one `RuneError`, so a
// Windows-1251 string passes a length cap; and `encoding/json` silently repairs
// an invalid byte in a body. PostgreSQL's `TEXT` columns are UTF-8, so a
// non-UTF-8 string means either a `500` (path) or silent corruption (body).
func RequireValidUTF8(field string, value []byte) error {
	if utf8.Valid(value) {
		return nil
	}
	return &ValidationError{
		Field:  field,
		Reason: "must be valid UTF-8; the request body and path must be UTF-8 encoded",
	}
}

// MatchesCommentCap reports whether a comment survives the same cap the extension
// enforces. Exported so the store tests can assert the boundary without importing
// the handler layer.
func MatchesCommentCap(comment string) bool {
	return utf8.RuneCountInString(comment) <= MaxCommentRunes
}
