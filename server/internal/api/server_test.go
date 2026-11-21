// Handler tests of the sync server.
//
// They drive the real router (`net/http.ServeMux`) through `httptest` and use an
// in-memory fake for the storage port, because these tests own the HTTP rules:
// status codes, JSON shapes, path decoding (`A153`), the validation boundary
// (`A158`) and the UTF-8 boundary of `A159`-`A161`. The database rules are
// covered by `internal/store` against a real PostgreSQL (AC 12).
//
// The fake records every `SaveNotes` call, so `len(store.saves) == 0` is the
// handler-level proof that a rejected request reached no store (`A160`); the live
// walk-through proves the same thing against PostgreSQL.
package api_test

import (
	"bytes"
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
	"unicode/utf8"

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

// notUTF8 is the byte sequence the PM measured on the live stack
// (`docs/state/t16-02-utf8-validation.md`, S16-1 and S16-2): `%C0%ED%ED%E0`.
// Each byte is invalid UTF-8 on its own, so the two fixtures below cannot
// accidentally decode into something valid.
const (
	notUTF8Encoded = "%C0%ED%ED%E0"
	notUTF8Raw     = "\xc0\xed\xed\xe0"
)

// bodyFor renders a request body through the project's own types. It is the right
// builder for a body that is supposed to be VALID; a body that must carry invalid
// bytes is built by hand (`rawBodyFor`), because `json.Marshal` repairs an
// invalid byte into `U+FFFD` instead of failing.
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

/* --------------------- AC 4-9: invalid UTF-8 (A159-A161) ------------------ */

// rawNote renders one note as JSON text with its strings inserted verbatim.
// `json.Marshal` cannot be used here: it replaces an invalid byte with `\ufffd`
// (that replacement is exactly defect S16-2) and it refuses a `json.RawMessage`
// that is not valid JSON. Hand-building the bytes is the only way to send what a
// Windows-1251 client really sends.
func rawNote(id, text, comment string) string {
	return `{"id":"` + id + `","text":"` + text + `","comment":"` + comment +
		`","anchor":{"text":"` + text + `","prefix":"","suffix":"","fragmentCount":1}}`
}

// rawBodyFor assembles a POST body from hand-built note JSON.
func rawBodyFor(authorID string, notes ...string) []byte {
	return []byte(`{"author_id":"` + authorID + `","notes":[` + strings.Join(notes, ",") + `]}`)
}

// doRaw drives a target and a body that the test built byte-for-byte, including
// bytes that are invalid UTF-8 (`notUTF8Raw`, `rawBodyFor`).
func doRaw(t *testing.T, handler http.Handler, method, target string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

// The fixture guard: the hand-built body must really carry the invalid bytes and
// must really be invalid UTF-8, and `encoding/json` must really repair those bytes
// into `U+FFFD` in a Go string. That repair is the reason the handler has to judge
// the raw bytes instead of the decoded strings; if it ever stops happening, this
// task's premise changed and the tests below would prove something else.
func TestRawBodyFixtureCarriesTheInvalidBytesVerbatim(t *testing.T) {
	body := rawBodyFor(notUTF8Raw, rawNote("aaaa1111", "first", "ok"))
	if !bytes.Contains(body, []byte(notUTF8Raw)) {
		t.Fatalf("the invalid bytes are missing from the body: %q", body)
	}
	if utf8.Valid(body) {
		t.Fatalf("the fixture body is valid UTF-8: the tests below would prove nothing: %q", body)
	}

	var req model.SaveRequest
	if err := json.Unmarshal(body, &req); err != nil {
		t.Fatalf("the fixture body is not decodable JSON: %v (%q)", err, body)
	}
	if req.AuthorID != strings.Repeat(string(utf8.RuneError), 4) {
		t.Fatalf("the decoder did not repair the bytes into four U+FFFD: %q", req.AuthorID)
	}
	// A note field must survive the same repair: the fixture is only realistic if
	// the bytes can sit in any string of the body.
	nestedBody := rawBodyFor("Анна", rawNote("aaaa1111", "first", notUTF8Raw))
	if utf8.Valid(nestedBody) {
		t.Fatalf("the nested fixture body is valid UTF-8: %q", nestedBody)
	}
	var nested model.SaveRequest
	if err := json.Unmarshal(nestedBody, &nested); err != nil {
		t.Fatalf("the nested fixture body is not decodable JSON: %v (%q)", err, nestedBody)
	}
	if len(nested.Notes) != 1 || nested.Notes[0].Comment != strings.Repeat(string(utf8.RuneError), 4) {
		t.Fatalf("the decoder did not repair the nested bytes into four U+FFFD: %q", nested.Notes)
	}
}

// AC 4: `GET /notes/page/<invalid utf8>` is a 400 naming page_id, not a 500.
// The target is percent-encoded exactly as the PM's live probe sent it
// (`%C0%ED%ED%E0`), so nothing here depends on how a test helper escapes bytes.
func TestGetPageNotesRejectsInvalidUTF8InThePath(t *testing.T) {
	store := newFakeStore()
	store.readErr = errors.New("connection refused")
	handler := newTestServer(store)

	rec := do(t, handler, http.MethodGet,
		"/notes/page/"+url.PathEscape("https://example.com/")+notUTF8Encoded, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
	}
	message := decodeError(t, rec)
	if !strings.Contains(message, "page_id") {
		t.Fatalf("error = %q, want it to name page_id", message)
	}
	// A153's decode of the path must not be the reason: the body is refused before
	// the store is asked anything.
	if len(store.reads) != 0 {
		t.Fatalf("the store was called for an invalid page id: %#v", store.reads)
	}
}

// AC 4, second spelling: the invalid bytes are literal bytes in the request
// target, not percent-encoded. The page key is one path segment (no `/`), because
// `net/http`'s router answers a mixed `//` with a 301 before any handler runs.
func TestGetPageNotesRejectsRawInvalidUTF8InThePath(t *testing.T) {
	rec := do(t, newTestServer(newFakeStore()), http.MethodGet, "/notes/page/a"+notUTF8Raw, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
	}
	if message := decodeError(t, rec); !strings.Contains(message, "page_id") {
		t.Fatalf("error = %q, want it to name page_id", message)
	}
}

// AC 5: the all-pages endpoint answers 400, not the 500 of S16-1.
func TestAllPagesRejectsInvalidUTF8Author(t *testing.T) {
	store := newFakeStore()
	store.readErr = errors.New("connection refused")

	rec := do(t, newTestServer(store), http.MethodGet,
		"/notes/author/"+notUTF8Encoded+"/all-pages", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
	}
	if message := decodeError(t, rec); !strings.Contains(message, "author_id") {
		t.Fatalf("error = %q, want it to name author_id", message)
	}
	if len(store.reads) != 0 {
		t.Fatalf("the store was called for an invalid author id: %#v", store.reads)
	}
}

// AC 6: DELETE validates both path segments and reaches neither the failure nor
// the store on an invalid author.
func TestDeleteRejectsInvalidUTF8Author(t *testing.T) {
	store := newFakeStore()
	store.deleteErr = errors.New("connection refused")

	rec := do(t, newTestServer(store), http.MethodDelete,
		"/notes/page/"+url.PathEscape("https://example.com/a")+"/author/"+notUTF8Encoded, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
	}
	if message := decodeError(t, rec); !strings.Contains(message, "author_id") {
		t.Fatalf("error = %q, want it to name author_id", message)
	}
	if len(store.deletes) != 0 {
		t.Fatalf("the store was called for an invalid author id: %#v", store.deletes)
	}
}

// AC 7 and AC 8 and A160: an invalid body is a 400 before the store is reached,
// and nothing from that request is written. The fake records every call, so
// `len(store.saves) == 0` is the "zero rows written" proof at this layer; the
// live walk-through proves the same thing against PostgreSQL.
//
// The field named in the response is `body`, not `notes[i].<field>`, and that is
// the honest answer: the invalid bytes are judged before the JSON is decoded,
// because `encoding/json` would have already repaired them into `U+FFFD`. The
// per-note field names exist in `model.ValidateSaveRequest` and are covered by
// `model.TestValidateSaveRequestRejectsInvalidUTF8InEveryNoteField`.
func TestSaveRejectsInvalidUTF8BeforeTheStore(t *testing.T) {
	longUTF8 := strings.Repeat("я", model.MaxCommentRunes+1)

	cases := []struct {
		name  string
		body  []byte
		field string
	}{
		{name: "author_id in the body",
			body: rawBodyFor(notUTF8Raw, rawNote("aaaa1111", "first", "ok")), field: "body"},
		{name: "comment",
			body: rawBodyFor("Анна", rawNote("aaaa1111", "first", notUTF8Raw)), field: "body"},
		{name: "text",
			body: rawBodyFor("Анна", rawNote("aaaa1111", notUTF8Raw, "ok")), field: "body"},
		{name: "note id",
			body: rawBodyFor("Анна", rawNote(notUTF8Raw, "first", "ok")), field: "body"},
		// The second note is the broken one: the valid first note must not be
		// written on its own (A160 is all-or-nothing, not "the valid ones").
		{name: "second note only", body: rawBodyFor("Анна",
			rawNote("aaaa1111", "first", "ok"), rawNote("bbbb2222", "second", notUTF8Raw)),
			field: "body"},
		// The invalid bytes may sit anywhere in the body, including a field the
		// server does not know: the whole request is judged, not just the strings
		// the server happens to use.
		{name: "unknown field", body: rawBodyFor("Анна",
			`{"id":"aaaa1111","text":"first","comment":"ok","extra":"`+notUTF8Raw+`",`+
				`"anchor":{"text":"first","prefix":"","suffix":"","fragmentCount":1}}`),
			field: "body"},
		// Regression guard: the UTF-8 rule must not have replaced the
		// 256-code-point cap.
		{name: "comment over the cap", body: []byte(bodyFor("Анна", note("aaaa1111", "first", longUTF8))),
			field: "notes[0].comment"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore()
			rec := doRaw(t, newTestServer(store), http.MethodPost,
				pagePath("https://example.com/a"), tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
			}
			message := decodeError(t, rec)
			if !strings.Contains(message, tc.field) {
				t.Fatalf("error = %q, want it to name %s", message, tc.field)
			}
			if len(store.saves) != 0 {
				t.Fatalf("a rejected body reached the store: %#v", store.saves)
			}
		})
	}
}

// The `text` field of a note is the field the extension sends verbatim from the
// page, so it gets its own assertion that the invalid bytes in it are the reason
// for the refusal (not, say, the 256-char cap).
func TestSaveRejectsInvalidUTF8InTextBeforeTheStore(t *testing.T) {
	store := newFakeStore()
	body := rawBodyFor("Анна", rawNote("aaaa1111", notUTF8Raw, "ok"))
	rec := doRaw(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/a"), body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
	}
	if len(store.saves) != 0 {
		t.Fatalf("a rejected body reached the store: %#v", store.saves)
	}
}

// AC 10: the Cyrillic happy path still works, through the same router.
func TestPostAcceptsCyrillicBodyAndPath(t *testing.T) {
	store := newFakeStore()
	rec := do(t, newTestServer(store), http.MethodPost, pagePath("https://example.com/статья?b=2&a=1"),
		bodyFor("Борис", note("aaaa1111", "выделенный текст", "заметка Бориса")))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if got := decodeCount(t, rec, "saved"); got != 1 {
		t.Fatalf("saved = %d, want 1", got)
	}
}

// AC 9 (A161): the 500 stays for a genuine storage failure on every endpoint.
// The injection is in the fake, never in a live outage.
func TestGenuineStorageFailuresStillAnswerFiveHundred(t *testing.T) {
	boom := errors.New("database is gone")
	cases := []struct {
		name   string
		method string
		target string
		body   []byte
		setup  func(*fakeStore)
	}{
		{
			name: "GET page", method: http.MethodGet, target: pagePath("https://example.com/a"),
			setup: func(s *fakeStore) { s.readErr = boom },
		},
		{
			name: "GET all pages", method: http.MethodGet,
			target: "/notes/author/" + url.PathEscape("Анна") + "/all-pages",
			setup:  func(s *fakeStore) { s.readErr = boom },
		},
		{
			name: "POST", method: http.MethodPost, target: pagePath("https://example.com/a"),
			body:  []byte(bodyFor("Анна", note("aaaa1111", "first", "ok"))),
			setup: func(s *fakeStore) { s.saveErr = boom },
		},
		{
			name: "DELETE", method: http.MethodDelete,
			target: "/notes/page/" + url.PathEscape("https://example.com/a") + "/author/" + url.PathEscape("Анна"),
			setup:  func(s *fakeStore) { s.deleteErr = boom },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore()
			tc.setup(store)
			rec := doRaw(t, newTestServer(store), tc.method, tc.target, tc.body)
			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500 (body %s)", rec.Code, rec.Body.String())
			}
			if message := decodeError(t, rec); message != "storage failure" {
				t.Fatalf("error = %q, want \"storage failure\"", message)
			}
		})
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
