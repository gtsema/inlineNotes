// Store-level tests of the sync server.
//
// These tests run against a REAL PostgreSQL, never a mock
// (docs/specs/sync-server.md -> Acceptance Criteria, AC 12). They read
// `TEST_DATABASE_URL`; when that variable is empty the whole file is skipped, so
// `go test ./...` still builds on a machine without a database, while the CI path
// (`docker compose run --rm test`, or any container with the variable set) covers
// every rule below.
//
// One schema is created per test run and truncated between tests, so the tests do
// not depend on each other's order.
package store_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"inlinenotes/server/internal/model"
	"inlinenotes/server/internal/store"
)

const (
	pageArticle = "https://example.com/article?b=2&a=1"
	pageOther   = "https://example.com/other"
	authorAnna  = "Анна"
	authorBoris = "Борис"
)

func databaseURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set: store tests need a real PostgreSQL (AC 12)")
	}
	return url
}

func newStore(t *testing.T) *store.Store {
	t.Helper()
	ctx := context.Background()
	url := databaseURL(t)

	repository, err := store.New(ctx, url)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(repository.Close)

	if err := repository.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("open raw pool: %v", err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, "TRUNCATE notes"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return repository
}

func noteInput(id, text, comment string) model.NoteInput {
	return model.NoteInput{
		ID:      id,
		Text:    text,
		Comment: comment,
		Anchor:  json.RawMessage(`{"text":"` + text + `","prefix":"","suffix":"","fragmentCount":1}`),
	}
}

/* ------------------------------ AC 5, AC 6 -------------------------------- */

func TestSaveNotesInsertsRows(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	notes := []model.NoteInput{
		noteInput("aaaa1111", "first", "первая заметка"),
		noteInput("bbbb2222", "second", "вторая заметка"),
	}
	saved, err := s.SaveNotes(ctx, pageArticle, authorAnna, notes)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if saved != 2 {
		t.Fatalf("saved = %d, want 2", saved)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read page: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("stored rows = %d, want 2", len(stored))
	}
	if stored[0].Comment != "первая заметка" {
		t.Errorf("comment = %q, want %q", stored[0].Comment, "первая заметка")
	}
	if stored[0].AuthorID != authorAnna {
		t.Errorf("author = %q, want %q", stored[0].AuthorID, authorAnna)
	}
}

func TestSaveNotesSecondPostKeepsCreatedAtAndMovesUpdatedAt(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	notes := []model.NoteInput{
		noteInput("aaaa1111", "first", "первая заметка"),
		noteInput("bbbb2222", "second", "вторая заметка"),
	}
	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, notes); err != nil {
		t.Fatalf("first save: %v", err)
	}
	before, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read after first save: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	notes[0].Comment = "обновлённая заметка"
	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, notes); err != nil {
		t.Fatalf("second save: %v", err)
	}
	after, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read after second save: %v", err)
	}

	if len(after) != 2 {
		t.Fatalf("rows after re-post = %d, want 2", len(after))
	}
	byUpdate := map[string]model.Note{}
	for _, note := range after {
		byUpdate[note.ID] = note
	}
	first := byUpdate["aaaa1111"]
	if first.CreatedAt != before[0].CreatedAt {
		t.Errorf("created_at moved: %q -> %q", before[0].CreatedAt, first.CreatedAt)
	}
	if first.UpdatedAt <= before[0].UpdatedAt {
		t.Errorf("updated_at did not move forward: %q -> %q", before[0].UpdatedAt, first.UpdatedAt)
	}
	if first.Comment != "обновлённая заметка" {
		t.Errorf("comment = %q, want the updated body", first.Comment)
	}
}

func TestTwoAuthorsMayShareOneNoteID(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	shared := noteInput("shared01", "the words Анны", "заметка Анны")
	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{shared}); err != nil {
		t.Fatalf("save anna: %v", err)
	}

	other := noteInput("shared01", "the words Бориса", "заметка Бориса")
	if _, err := s.SaveNotes(ctx, pageArticle, authorBoris, []model.NoteInput{other}); err != nil {
		t.Fatalf("save boris: %v", err)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read page: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("rows = %d, want 2 (A155: the triple is the identity)", len(stored))
	}
	comments := map[string]string{}
	for _, note := range stored {
		comments[note.AuthorID] = note.Comment
	}
	if comments[authorAnna] != "заметка Анны" || comments[authorBoris] != "заметка Бориса" {
		t.Fatalf("two authors overwrote each other: %#v", comments)
	}
}

/* ------------------------------- AC 7 ------------------------------------- */

func TestNotesForPageReturnsBothAuthorsAndOnlyThatPage(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "first", "заметка Анны"),
	}); err != nil {
		t.Fatalf("save anna: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageArticle, authorBoris, []model.NoteInput{
		noteInput("bbbb2222", "second", "заметка Бориса"),
	}); err != nil {
		t.Fatalf("save boris: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageOther, authorAnna, []model.NoteInput{
		noteInput("cccc3333", "third", "заметка на другой странице"),
	}); err != nil {
		t.Fatalf("save other page: %v", err)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read page: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("rows for the page = %d, want 2", len(stored))
	}
	for _, note := range stored {
		if note.PageID != pageArticle {
			t.Errorf("page_id = %q, want %q", note.PageID, pageArticle)
		}
	}
}

/* ------------------------------- AC 8 ------------------------------------- */

func TestDeleteRemovesOnlyTheNamedAuthorsRows(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "first", "заметка Анны 1"),
		noteInput("aaaa2222", "second", "заметка Анны 2"),
	}); err != nil {
		t.Fatalf("save anna: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageArticle, authorBoris, []model.NoteInput{
		noteInput("bbbb1111", "third", "заметка Бориса"),
	}); err != nil {
		t.Fatalf("save boris: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageOther, authorAnna, []model.NoteInput{
		noteInput("cccc1111", "fourth", "заметка Анны на другой странице"),
	}); err != nil {
		t.Fatalf("save other page: %v", err)
	}

	deleted, err := s.DeleteAuthorNotesOnPage(ctx, pageArticle, authorAnna)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("deleted = %d, want 2", deleted)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read page: %v", err)
	}
	if len(stored) != 1 || stored[0].AuthorID != authorBoris {
		t.Fatalf("foreign rows were touched: %#v", stored)
	}

	otherPage, err := s.NotesForPage(ctx, pageOther)
	if err != nil {
		t.Fatalf("read other page: %v", err)
	}
	if len(otherPage) != 1 {
		t.Fatalf("delete crossed the page boundary: %d rows left", len(otherPage))
	}
}

/* ------------------------------ AC 9, AC 11 ------------------------------- */

func TestNotesForAuthorAllPagesNewestFirstWithLimitAndOffset(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	pageA := "https://example.com/a"
	pageB := "https://example.com/b"
	pageC := "https://example.com/c"

	for _, page := range []string{pageA, pageB, pageC} {
		if _, err := s.SaveNotes(ctx, page, authorAnna, []model.NoteInput{
			noteInput("note"+page[len(page)-1:], "words", "заметка "+page),
		}); err != nil {
			t.Fatalf("save %s: %v", page, err)
		}
		time.Sleep(15 * time.Millisecond)
	}
	if _, err := s.SaveNotes(ctx, pageA, authorBoris, []model.NoteInput{
		noteInput("boris001", "words", "заметка Бориса"),
	}); err != nil {
		t.Fatalf("save boris: %v", err)
	}

	all, err := s.NotesForAuthor(ctx, authorAnna, model.DefaultLimit, 0)
	if err != nil {
		t.Fatalf("all pages: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("all-pages rows = %d, want 3", len(all))
	}
	for _, note := range all {
		if note.AuthorID != authorAnna {
			t.Errorf("foreign author in the all-pages list: %q", note.AuthorID)
		}
	}
	if all[0].PageID != pageC {
		t.Errorf("newest first: first row is %q, want %q", all[0].PageID, pageC)
	}
	if all[0].UpdatedAt < all[1].UpdatedAt || all[1].UpdatedAt < all[2].UpdatedAt {
		t.Errorf("rows are not ordered by updated_at desc: %q %q %q",
			all[0].UpdatedAt, all[1].UpdatedAt, all[2].UpdatedAt)
	}

	firstPage, err := s.NotesForAuthor(ctx, authorAnna, 1, 0)
	if err != nil {
		t.Fatalf("limit: %v", err)
	}
	if len(firstPage) != 1 || firstPage[0].PageID != pageC {
		t.Fatalf("limit ignored: %#v", firstPage)
	}

	secondPage, err := s.NotesForAuthor(ctx, authorAnna, 1, 1)
	if err != nil {
		t.Fatalf("offset: %v", err)
	}
	if len(secondPage) != 1 || secondPage[0].PageID != pageB {
		t.Fatalf("offset ignored: %#v", secondPage)
	}
}

// A153 round trip: the page key is a URL that carries `/`, `?`, `&` and `#`.
// The store must return exactly the bytes it was given, without normalization.
func TestPageIDSurvivesVerbatimThroughTheStore(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	pageID := "https://example.com/a/b?b=2&a=1#frag"
	if _, err := s.SaveNotes(ctx, pageID, authorAnna, []model.NoteInput{
		noteInput("roundtrip1", "words", "заметка"),
	}); err != nil {
		t.Fatalf("save: %v", err)
	}

	stored, err := s.NotesForPage(ctx, pageID)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(stored) != 1 {
		t.Fatalf("rows = %d, want 1", len(stored))
	}
	if stored[0].PageID != pageID {
		t.Fatalf("page_id mangled: %q -> %q", pageID, stored[0].PageID)
	}

	// A near-miss key must not match: the server does not fall back to origin+path.
	other, err := s.NotesForPage(ctx, "https://example.com/a/b")
	if err != nil {
		t.Fatalf("read near miss: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("near-miss page id matched %d rows; the server must not normalize", len(other))
	}
}

// A154: the anchor is stored and returned byte-for-byte.
func TestAnchorIsStoredAsOpaqueJSONB(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	anchor := json.RawMessage(`{"text":"нормализованный текст","prefix":"до","suffix":"после","fragmentCount":3}`)
	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{{
		ID:      "anchor01",
		Text:    "нормализованный текст",
		Comment: "заметка",
		Anchor:  anchor,
	}}); err != nil {
		t.Fatalf("save: %v", err)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(stored) != 1 {
		t.Fatalf("rows = %d, want 1", len(stored))
	}

	var got, want map[string]any
	if err := json.Unmarshal(stored[0].Anchor, &got); err != nil {
		t.Fatalf("returned anchor is not JSON: %v", err)
	}
	if err := json.Unmarshal(anchor, &want); err != nil {
		t.Fatalf("source anchor is not JSON: %v", err)
	}
	if got["text"] != want["text"] || got["prefix"] != want["prefix"] ||
		got["suffix"] != want["suffix"] || got["fragmentCount"] != want["fragmentCount"] {
		t.Fatalf("anchor changed in transit: %s -> %s", anchor, stored[0].Anchor)
	}
}

/* ------------------------------- AC 4 ------------------------------------- */

func TestMigrateIsIdempotent(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("first migrate: %v", err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

/* ------------------- A155: absent rows are not deleted --------------------- */

func TestSaveNotesDoesNotDeleteRowsMissingFromTheRequest(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)

	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "first", "заметка 1"),
		noteInput("bbbb2222", "second", "заметка 2"),
	}); err != nil {
		t.Fatalf("save both: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "first", "заметка 1 переписана"),
	}); err != nil {
		t.Fatalf("save one: %v", err)
	}

	stored, err := s.NotesForPage(ctx, pageArticle)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("rows = %d, want 2 (POST must not delete; A155)", len(stored))
	}
}

/* ------------------ A181: one note is deleted, one row goes ---------------- */

// seedTwoAuthorsOnOnePage writes the fixture every A181 store test starts from:
// two of Анна's notes and two of Борис's on one page, plus one of Анна's notes on
// another page under a shared id. It returns nothing: the assertions read the
// table through NotesForPage.
func seedTwoAuthorsOnOnePage(t *testing.T, s *store.Store) {
	t.Helper()
	ctx := context.Background()

	if _, err := s.SaveNotes(ctx, pageArticle, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "first", "заметка Анны 1"),
		noteInput("aaaa2222", "second", "заметка Анны 2"),
	}); err != nil {
		t.Fatalf("save anna: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageArticle, authorBoris, []model.NoteInput{
		noteInput("bbbb1111", "third", "заметка Бориса 1"),
		noteInput("aaaa1111", "fourth", "заметка Бориса с тем же id"),
	}); err != nil {
		t.Fatalf("save boris: %v", err)
	}
	if _, err := s.SaveNotes(ctx, pageOther, authorAnna, []model.NoteInput{
		noteInput("aaaa1111", "fifth", "заметка Анны на другой странице"),
	}); err != nil {
		t.Fatalf("save other page: %v", err)
	}
}

// commentsBy reports the comment of every row of a page, keyed "author id", so a
// test can compare the WHOLE table state byte for byte instead of counting rows.
func commentsBy(t *testing.T, s *store.Store, pageID string) map[string]string {
	t.Helper()
	ctx := context.Background()
	notes, err := s.NotesForPage(ctx, pageID)
	if err != nil {
		t.Fatalf("read page: %v", err)
	}
	byKey := make(map[string]string, len(notes))
	for _, note := range notes {
		byKey[note.AuthorID+" "+note.ID] = note.Comment
	}
	return byKey
}

// AC 1: an existing triple is removed and the answer is 1.
func TestDeleteOneNoteRemovesExactlyThatRow(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	seedTwoAuthorsOnOnePage(t, s)

	deleted, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa1111")
	if err != nil {
		t.Fatalf("delete one: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d, want 1", deleted)
	}

	rows := commentsBy(t, s, pageArticle)
	if _, ok := rows[authorAnna+" aaaa1111"]; ok {
		t.Fatalf("the named row survived: %#v", rows)
	}
	if len(rows) != 3 {
		t.Fatalf("rows left = %d, want 3: %#v", len(rows), rows)
	}
}

// AC 1, second half: a triple that is not in the table is `0`, not an error, and
// deleting the same row twice answers 1 then 0.
func TestDeleteOneNoteAnswersZeroWhenTheRowIsAbsentAndIsRepeatable(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	seedTwoAuthorsOnOnePage(t, s)

	for _, missing := range []struct{ page, author, id string }{
		{pageArticle, authorAnna, "gone0000"},
		{pageArticle, "Неизвестный", "aaaa1111"},
		{"https://example.com/never-saved", authorAnna, "aaaa1111"},
	} {
		deleted, err := s.DeleteOneNote(ctx, missing.page, missing.author, missing.id)
		if err != nil {
			t.Fatalf("delete a missing row %v: %v", missing, err)
		}
		if deleted != 0 {
			t.Fatalf("deleted = %d for %v, want 0", deleted, missing)
		}
	}
	if rows := commentsBy(t, s, pageArticle); len(rows) != 4 {
		t.Fatalf("a missing row removed something: %#v", rows)
	}

	first, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa2222")
	if err != nil {
		t.Fatalf("first delete: %v", err)
	}
	second, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa2222")
	if err != nil {
		t.Fatalf("second delete: %v", err)
	}
	if first != 1 || second != 0 {
		t.Fatalf("repeat delete answered %d then %d, want 1 then 0", first, second)
	}
}

// AC 2: the same author's other notes on the same page stay byte-identical.
func TestDeleteOneNoteLeavesTheAuthorsOtherRows(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	seedTwoAuthorsOnOnePage(t, s)
	before := commentsBy(t, s, pageArticle)

	if _, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa1111"); err != nil {
		t.Fatalf("delete one: %v", err)
	}

	after := commentsBy(t, s, pageArticle)
	for _, key := range []string{authorAnna + " aaaa2222", authorBoris + " bbbb1111", authorBoris + " aaaa1111"} {
		if after[key] != before[key] {
			t.Fatalf("row %q changed: %q -> %q", key, before[key], after[key])
		}
	}
}

// AC 3: another author's notes are out of reach, including a note that carries
// the deleted id (A155: the triple is the identity) and the same author on
// another page.
func TestDeleteOneNoteLeavesOtherAuthorsAndOtherPages(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	seedTwoAuthorsOnOnePage(t, s)

	if _, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa1111"); err != nil {
		t.Fatalf("delete one: %v", err)
	}

	page := commentsBy(t, s, pageArticle)
	// Борис holds a note with the very same id `aaaa1111`: it must survive.
	if comment, ok := page[authorBoris+" aaaa1111"]; !ok || comment != "заметка Бориса с тем же id" {
		t.Fatalf("the other author's same-id note was touched: %#v", page)
	}
	if comment, ok := page[authorBoris+" bbbb1111"]; !ok || comment != "заметка Бориса 1" {
		t.Fatalf("the other author's row was touched: %#v", page)
	}

	other := commentsBy(t, s, pageOther)
	if len(other) != 1 {
		t.Fatalf("other page rows = %d, want 1: %#v", len(other), other)
	}
	if comment := other[authorAnna+" aaaa1111"]; comment != "заметка Анны на другой странице" {
		t.Fatalf("the delete crossed the page boundary: %#v", other)
	}
}

// AC 4: the page-scoped delete keeps its behaviour beside the new one and counts
// every row of the author on that page.
func TestPageDeleteStillRemovesEveryRowOfTheAuthor(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	seedTwoAuthorsOnOnePage(t, s)

	// A single-note delete first, so the leftover count is not the seeded one.
	if _, err := s.DeleteOneNote(ctx, pageArticle, authorAnna, "aaaa1111"); err != nil {
		t.Fatalf("delete one: %v", err)
	}

	deleted, err := s.DeleteAuthorNotesOnPage(ctx, pageArticle, authorAnna)
	if err != nil {
		t.Fatalf("page delete: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d, want 1 (the row not already gone)", deleted)
	}

	page := commentsBy(t, s, pageArticle)
	if len(page) != 2 {
		t.Fatalf("rows left = %d, want the other author's 2: %#v", len(page), page)
	}
	for key := range page {
		if strings.HasPrefix(key, authorAnna+" ") {
			t.Fatalf("the page delete missed the author's row %q", key)
		}
	}
	if other := commentsBy(t, s, pageOther); len(other) != 1 {
		t.Fatalf("the page delete crossed the page boundary: %#v", other)
	}
}
