// Handler tests of the sync server.
//
// They drive the real router (`net/http.ServeMux`) through `httptest` and use an
// in-memory fake for the storage port, because these tests own the HTTP rules:
// status codes, JSON shapes, path decoding (`A153`) and the validation boundary
// (`A158`). The database rules are covered by `internal/store` against a real
// PostgreSQL (AC 12).
package api_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"inlinenotes/server/internal/api"
	"inlinenotes/server/internal/model"
)

/* ------------------------------- fake store -------------------------------- */

type savedCall struct {
	pageID   string
	authorID string
	notes    []model.NoteInput
}

type deleteCall struct {
	pageID   string
	authorID string
}

type authorCall struct {
	authorID string
	limit    int
	offset   int
}

type fakeStore struct {
	rows      map[string][]model.Note
	pingErr   error
	saveErr   error
	readErr   error
	deleteErr error

	saves   []savedCall
	deletes []deleteCall
	reads   []authorCall
}

func newFakeStore() *fakeStore {
	return &fakeStore{rows: map[string][]model.Note{}}
}

func (f *fakeStore) Ping(context.Context) error { return f.pingErr }

func (f *fakeStore) SaveNotes(_ context.Context, pageID, authorID string, notes []model.NoteInput) (int, error) {
	if f.saveErr != nil {
		return 0, f.saveErr
	}
	f.saves = append(f.saves, savedCall{pageID: pageID, authorID: authorID, notes: notes})

	key := pageID + "\x00" + authorID
	index := map[string]int{}
	for i, note := range f.rows[key] {
		index[note.ID] = i
	}
	for _, note := range notes {
		row := model.Note{
			ID:        note.ID,
			PageID:    pageID,
			AuthorID:  authorID,
			Text:      note.Text,
			Comment:   note.Comment,
			Anchor:    note.Anchor,
			CreatedAt: "2026-11-19T12:00:00Z",
			UpdatedAt: "2026-11-19T12:00:01Z",
		}
		if at, ok := index[note.ID]; ok {
			row.CreatedAt = f.rows[key][at].CreatedAt
			f.rows[key][at] = row
			continue
		}
		f.rows[key] = append(f.rows[key], row)
	}
	return len(notes), nil
}

func (f *fakeStore) NotesForPage(_ context.Context, pageID string) ([]model.Note, error) {
	if f.readErr != nil {
		return nil, f.readErr
	}
	notes := make([]model.Note, 0)
	for key, rows := range f.rows {
		if strings.HasPrefix(key, pageID+"\x00") {
			notes = append(notes, rows...)
		}
	}
	return notes, nil
}

func (f *fakeStore) NotesForAuthor(_ context.Context, authorID string, limit, offset int) ([]model.Note, error) {
	if f.readErr != nil {
		return nil, f.readErr
	}
	f.reads = append(f.reads, authorCall{authorID: authorID, limit: limit, offset: offset})

	notes := make([]model.Note, 0)
	for key, rows := range f.rows {
		if strings.HasSuffix(key, "\x00"+authorID) {
			notes = append(notes, rows...)
		}
	}
	if offset >= len(notes) {
		return []model.Note{}, nil
	}
	notes = notes[offset:]
	if limit < len(notes) {
		notes = notes[:limit]
	}
	return notes, nil
}

func (f *fakeStore) DeleteAuthorNotesOnPage(_ context.Context, pageID, authorID string) (int, error) {
	if f.deleteErr != nil {
		return 0, f.deleteErr
	}
	f.deletes = append(f.deletes, deleteCall{pageID: pageID, authorID: authorID})

	key := pageID + "\x00" + authorID
	removed := len(f.rows[key])
	delete(f.rows, key)
	return removed, nil
}

/* -------------------------------- helpers ---------------------------------- */

func newTestServer(store api.NoteStore) http.Handler {
	return api.New(store, log.New(io.Discard, "", 0))
}

func do(t *testing.T, handler http.Handler, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decodeNotes(t *testing.T, rec *httptest.ResponseRecorder) []model.Note {
	t.Helper()
	var payload struct {
		Notes []model.Note `json:"notes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode notes: %v (body %s)", err, rec.Body.String())
	}
	return payload.Notes
}

func decodeCount(t *testing.T, rec *httptest.ResponseRecorder, field string) int {
	t.Helper()
	var payload map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode count: %v (body %s)", err, rec.Body.String())
	}
	return payload[field]
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error: %v (body %s)", err, rec.Body.String())
	}
	return payload.Error
}

func pagePath(pageID string) string {
	return "/notes/page/" + url.PathEscape(pageID)
}

func bodyFor(authorID string, notes ...model.NoteInput) string {
	payload := model.SaveRequest{AuthorID: authorID, Notes: notes}
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func note(id, text, comment string) model.NoteInput {
	return model.NoteInput{
		ID:      id,
		Text:    text,
		Comment: comment,
		Anchor:  json.RawMessage(`{"text":"` + text + `","prefix":"","suffix":"","fragmentCount":1}`),
	}
}

/* ------------------------------- AC 3 ------------------------------------- */

func TestHealthReturnsOK(t *testing.T) {
	rec := do(t, newTestServer(newFakeStore()), http.MethodGet, "/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.Status != "ok" {
		t.Fatalf("status body = %q, want \"ok\"", payload.Status)
	}
}

func TestHealthReportsDatabaseFailure(t *testing.T) {
	store := newFakeStore()
	store.pingErr = errors.New("connection refused")

	rec := do(t, newTestServer(store), http.MethodGet, "/health", "")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

/* ------------------------------ AC 5, AC 7 -------------------------------- */

func TestPostThenGetRoundTrip(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	rec := do(t, handler, http.MethodPost, pagePath("https://example.com/article?b=2&a=1"),
		bodyFor("Анна", note("aaaa1111", "first", "первая заметка"), note("bbbb2222", "second", "вторая заметка")))
	if rec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if got := decodeCount(t, rec, "saved"); got != 2 {
		t.Fatalf("saved = %d, want 2", got)
	}

	rec = do(t, handler, http.MethodGet, pagePath("https://example.com/article?b=2&a=1"), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	notes := decodeNotes(t, rec)
	if len(notes) != 2 {
		t.Fatalf("notes = %d, want 2", len(notes))
	}
}

func TestPostWithoutNotesSavesNothing(t *testing.T) {
	store := newFakeStore()
	rec := do(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/a"), bodyFor("Анна"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := decodeCount(t, rec, "saved"); got != 0 {
		t.Fatalf("saved = %d, want 0", got)
	}
}

/* ------------------------------ AC 10 ------------------------------------- */

func TestValidationRejectsBadBodies(t *testing.T) {
	longComment := strings.Repeat("я", model.MaxCommentRunes+1)

	tooMany := make([]model.NoteInput, 0, model.MaxNotesPerRequest+1)
	for i := 0; i <= model.MaxNotesPerRequest; i++ {
		tooMany = append(tooMany, note("id"+string(rune('a'+i%26))+string(rune('0'+i/26)), "text", "comment"))
	}

	cases := []struct {
		name string
		body string
	}{
		{name: "comment over the cap", body: bodyFor("Анна", note("aaaa1111", "first", longComment))},
		{name: "empty author_id", body: bodyFor("   ", note("aaaa1111", "first", "ok"))},
		{name: "more than twenty notes", body: bodyFor("Анна", tooMany...)},
		// `"not-json"` is a JSON string, so it is a VALID `anchor`: the server does
		// not know the anchor shape (A154). Raw text that is not JSON at all is what
		// must be refused, so the three cases below cover it.
		{name: "anchor is not JSON", body: `{"author_id":"Анна","notes":[{"id":"aaaa1111","text":"first","comment":"ok","anchor":not-json}]}`},
		{name: "anchor is missing", body: `{"author_id":"Анна","notes":[{"id":"aaaa1111","text":"first","comment":"ok"}]}`},
		{name: "anchor is null", body: `{"author_id":"Анна","notes":[{"id":"aaaa1111","text":"first","comment":"ok","anchor":null}]}`},
		{name: "empty note id", body: bodyFor("Анна", note("", "first", "ok"))},
		{name: "empty text", body: bodyFor("Анна", note("aaaa1111", "   ", "ok"))},
		{name: "not json at all", body: "{author_id: nope"},
		{name: "empty body", body: "   "},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore()
			rec := do(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/a"), tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
			}
			if message := decodeError(t, rec); message == "" {
				t.Fatalf("error body is empty: %s", rec.Body.String())
			}
			if len(store.saves) != 0 {
				t.Fatalf("a rejected body reached the store: %#v", store.saves)
			}
		})
	}
}

func TestValidationAcceptsExactlyTheCaps(t *testing.T) {
	store := newFakeStore()
	exactly256 := strings.Repeat("я", model.MaxCommentRunes)

	rec := do(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/a"),
		bodyFor("Анна", note("aaaa1111", "first", exactly256)))
	if rec.Code != http.StatusOK {
		t.Fatalf("256-char comment rejected: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAuthorIDLongerThanSixtyFourIsRejected(t *testing.T) {
	store := newFakeStore()
	rec := do(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/a"),
		bodyFor(strings.Repeat("a", model.MaxAuthorIDRunes+1), note("aaaa1111", "first", "ok")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

/* ------------------------------- AC 8 ------------------------------------- */

func TestDeleteReportsTheAuthorsRowCount(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	do(t, handler, http.MethodPost, pagePath("https://example.com/a"),
		bodyFor("Анна", note("aaaa1111", "first", "1"), note("aaaa2222", "second", "2")))
	do(t, handler, http.MethodPost, pagePath("https://example.com/a"),
		bodyFor("Борис", note("bbbb1111", "third", "3")))

	rec := do(t, handler, http.MethodDelete,
		"/notes/page/"+url.PathEscape("https://example.com/a")+"/author/"+url.PathEscape("Анна"), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := decodeCount(t, rec, "deleted"); got != 2 {
		t.Fatalf("deleted = %d, want 2", got)
	}
	if len(store.deletes) != 1 || store.deletes[0].authorID != "Анна" {
		t.Fatalf("delete did not name the caller's author: %#v", store.deletes)
	}

	rec = do(t, handler, http.MethodGet, pagePath("https://example.com/a"), "")
	if remaining := decodeNotes(t, rec); len(remaining) != 1 || remaining[0].AuthorID != "Борис" {
		t.Fatalf("foreign rows were removed: %#v", remaining)
	}
}

/* ------------------------------- AC 9 ------------------------------------- */

func TestAllPagesHonoursLimitAndOffset(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	do(t, handler, http.MethodPost, pagePath("https://example.com/a"), bodyFor("Анна", note("aaaa1111", "x", "1")))
	do(t, handler, http.MethodPost, pagePath("https://example.com/b"), bodyFor("Анна", note("bbbb1111", "x", "2")))

	rec := do(t, handler, http.MethodGet, "/notes/author/"+url.PathEscape("Анна")+"/all-pages?limit=1&offset=1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if len(store.reads) != 1 {
		t.Fatalf("reads = %d, want 1", len(store.reads))
	}
	if store.reads[0].limit != 1 || store.reads[0].offset != 1 {
		t.Fatalf("limit/offset not forwarded: %#v", store.reads[0])
	}
	if store.reads[0].authorID != "Анна" {
		t.Fatalf("author not forwarded: %q", store.reads[0].authorID)
	}
}

func TestAllPagesDefaultsLimitAndRejectsBadPaging(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	do(t, handler, http.MethodGet, "/notes/author/"+url.PathEscape("Анна")+"/all-pages", "")
	if len(store.reads) != 1 || store.reads[0].limit != model.DefaultLimit || store.reads[0].offset != 0 {
		t.Fatalf("defaults wrong: %#v", store.reads)
	}

	rec := do(t, handler, http.MethodGet, "/notes/author/"+url.PathEscape("Анна")+"/all-pages?limit=oops", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}

	rec = do(t, handler, http.MethodGet, "/notes/author/"+url.PathEscape("Анна")+"/all-pages?offset=-3", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("negative offset status = %d, want 400", rec.Code)
	}
}

/* ------------------------------ AC 11 ------------------------------------- */

// A153: a page_id carrying `/`, `?`, `&` and `#` survives the path segment.
// `#` is escaped as `%23` by the client, so the server sees the literal `#`.
func TestPageIDWithReservedCharactersSurvivesThePath(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	pageID := "https://example.com/a/b?b=2&a=1#frag"
	rec := do(t, handler, http.MethodPost, pagePath(pageID), bodyFor("Анна", note("aaaa1111", "x", "заметка")))
	if rec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if len(store.saves) != 1 {
		t.Fatalf("saves = %d, want 1", len(store.saves))
	}
	if store.saves[0].pageID != pageID {
		t.Fatalf("page_id through the path = %q, want %q", store.saves[0].pageID, pageID)
	}

	rec = do(t, handler, http.MethodGet, pagePath(pageID), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	notes := decodeNotes(t, rec)
	if len(notes) != 1 || notes[0].PageID != pageID {
		t.Fatalf("round trip lost the page id: %#v", notes)
	}

	// The response carries the key verbatim and un-normalized (A153). Go's JSON
	// encoder HTML-escapes `&` as `\u0026`, which decodes back to `&`; the assertion
	// is therefore on the decoded code points, plus one check that the frame really
	// does escape rather than drop the reserved character.
	if !strings.Contains(rec.Body.String(), `\u0026`) {
		t.Fatalf("expected the encoder to escape the ampersand rather than drop it: %s", rec.Body.String())
	}
	if notes[0].PageID != pageID {
		t.Fatalf("decoded page_id = %q, want %q", notes[0].PageID, pageID)
	}
}

func TestPageIDIsNotNormalized(t *testing.T) {
	store := newFakeStore()
	handler := newTestServer(store)

	pageID := "HTTPS://Example.COM/A/?utm_source=x&z=1"
	do(t, handler, http.MethodPost, pagePath(pageID), bodyFor("Анна", note("aaaa1111", "x", "заметка")))
	if len(store.saves) != 1 || store.saves[0].pageID != pageID {
		t.Fatalf("the server normalized the page id: %#v", store.saves)
	}
}

/* ------------------------- errors and CORS (A158) -------------------------- */

func TestStoreFailureBecomesFiveHundred(t *testing.T) {
	store := newFakeStore()
	store.readErr = errors.New("boom")
	handler := newTestServer(store)

	rec := do(t, handler, http.MethodGet, pagePath("https://example.com/a"), "")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if decodeError(t, rec) == "" {
		t.Fatalf("error body is empty")
	}
}

func TestCorsHeadersAndPreflight(t *testing.T) {
	handler := newTestServer(newFakeStore())

	options := httptest.NewRequest(http.MethodOptions, "/notes/page/x", nil)
	options.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, options)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("allow-origin = %q, want *", got)
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
		t.Fatalf("allow-methods misses DELETE: %q", rec.Header().Get("Access-Control-Allow-Methods"))
	}

	rec = do(t, handler, http.MethodGet, "/health", "")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("plain GET lost CORS: %q", got)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Fatalf("content type = %q, want application/json", got)
	}
}

func TestUnknownRouteIsNotFound(t *testing.T) {
	rec := do(t, newTestServer(newFakeStore()), http.MethodGet, "/nope", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestWrongMethodIsRejected(t *testing.T) {
	rec := do(t, newTestServer(newFakeStore()), http.MethodPut, pagePath("https://example.com/a"), bodyFor("Анна"))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}
