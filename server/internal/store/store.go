// Package store owns every SQL statement of the sync server and the migrations
// that create the schema.
//
// Rule owners: docs/specs/sync-server.md (Rules / Semantics -> "Schema", "Upsert
// semantics", "Delete semantics", "All-pages hook").
//
// The package knows nothing about HTTP: it returns domain errors and lets the
// handler map them to status codes. The one PostgreSQL driver allowed by the
// stage brief (`github.com/jackc/pgx/v5`) is used through `pgxpool`.
package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"inlinenotes/server/internal/model"
)

// Migrations are the `.sql` files compiled into the binary, so the container
// needs neither a mounted volume nor a migration tool at runtime.
//
//go:embed migrations/*.sql
var Migrations embed.FS

// ErrNotFound is returned when a note id cannot be resolved for an author.
var ErrNotFound = errors.New("note not found")

// Store is the PostgreSQL-backed repository of notes.
type Store struct {
	pool *pgxpool.Pool
}

// New opens a pool and verifies the connection.
func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

// NewFromPool wraps an existing pool. Tests use it to share one pool per suite.
func NewFromPool(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Close releases the pool.
func (s *Store) Close() {
	if s != nil && s.pool != nil {
		s.pool.Close()
	}
}

// Ping checks that the database still answers; `/health` uses it.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// Migrate executes every embedded migration in file-name order. The statements are
// idempotent (`IF NOT EXISTS`), so a second start is a no-op rather than a failure
// (AC 4).
func (s *Store) Migrate(ctx context.Context) error {
	names, err := migrationNames()
	if err != nil {
		return err
	}
	for _, name := range names {
		raw, err := Migrations.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if _, err := s.pool.Exec(ctx, string(raw)); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
	}
	return nil
}

func migrationNames() ([]string, error) {
	entries, err := Migrations.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("list migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	return names, nil
}

// SaveNotes upserts ONE author's notes on ONE page (ruling A155).
//
// Semantics, pinned by the spec:
//   - a note is identified by the triple (page_id, author_id, id);
//   - a conflicting triple gets its text/comment/anchor replaced and its
//     `updated_at` moved to `now`, while `created_at` is preserved verbatim;
//   - rows of the same author on the same page that are absent from the request
//     are NOT deleted here - deletion has its own endpoint (ruling A156);
//   - rows of another author are never touched, not even by id collision.
//
// The whole batch runs in one transaction, so a mid-batch failure leaves the page
// exactly as it was (the handler's validation already refused malformed bodies).
func (s *Store) SaveNotes(ctx context.Context, pageID, authorID string, notes []model.NoteInput) (int, error) {
	if len(notes) == 0 {
		return 0, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const query = `
		INSERT INTO notes (page_id, author_id, id, text, comment, anchor, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), now())
		ON CONFLICT (page_id, author_id, id) DO UPDATE
		SET text       = EXCLUDED.text,
		    comment    = EXCLUDED.comment,
		    anchor     = EXCLUDED.anchor,
		    updated_at = now()`

	saved := 0
	for i := range notes {
		note := &notes[i]
		tag, err := tx.Exec(ctx, query,
			pageID,
			authorID,
			strings.TrimSpace(note.ID),
			note.Text,
			note.Comment,
			anchorJSON(note.Anchor),
		)
		if err != nil {
			return 0, fmt.Errorf("upsert note %s: %w", note.ID, err)
		}
		saved += int(tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return saved, nil
}

// NotesForPage returns every author's notes on one page, oldest first (creation
// order keeps a page's list stable between reads).
func (s *Store) NotesForPage(ctx context.Context, pageID string) ([]model.Note, error) {
	const query = `
		SELECT id, page_id, author_id, text, comment, anchor, created_at, updated_at
		FROM notes
		WHERE page_id = $1
		ORDER BY created_at ASC, id ASC`

	rows, err := s.pool.Query(ctx, query, pageID)
	if err != nil {
		return nil, fmt.Errorf("select page notes: %w", err)
	}
	defer rows.Close()
	return scanNotes(rows)
}

// NotesForAuthor returns one author's notes across all pages, newest first, with
// `limit`/`offset` applied (ruling A157).
func (s *Store) NotesForAuthor(ctx context.Context, authorID string, limit, offset int) ([]model.Note, error) {
	const query = `
		SELECT id, page_id, author_id, text, comment, anchor, created_at, updated_at
		FROM notes
		WHERE author_id = $1
		ORDER BY updated_at DESC, page_id ASC, id ASC
		LIMIT $2 OFFSET $3`

	rows, err := s.pool.Query(ctx, query, authorID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("select author notes: %w", err)
	}
	defer rows.Close()
	return scanNotes(rows)
}

// DeleteAuthorNotesOnPage removes exactly the rows matching (page_id, author_id)
// and reports how many were removed. Another author's rows on the same page are
// not in the predicate at all, so they cannot be reached (ruling A156).
func (s *Store) DeleteAuthorNotesOnPage(ctx context.Context, pageID, authorID string) (int, error) {
	const query = `DELETE FROM notes WHERE page_id = $1 AND author_id = $2`
	tag, err := s.pool.Exec(ctx, query, pageID, authorID)
	if err != nil {
		return 0, fmt.Errorf("delete page author notes: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// DeleteOneNote removes exactly one row, named by the upsert triple
// (page_id, author_id, id) of ruling A155, and reports how many were removed:
// 1 when the row existed, 0 when it did not (ruling A181).
//
// A missing row is not an error. Deleting twice is what a retried request looks
// like, and the second answer must not be a failure.
//
// The predicate is the whole primary key, so the reach is one row by
// construction: the same author's other notes on the same page are not matched,
// another author's notes are not matched (even on an id collision), and another
// page is not matched.
func (s *Store) DeleteOneNote(ctx context.Context, pageID, authorID, noteID string) (int, error) {
	const query = `DELETE FROM notes WHERE page_id = $1 AND author_id = $2 AND id = $3`
	tag, err := s.pool.Exec(ctx, query, pageID, authorID, noteID)
	if err != nil {
		return 0, fmt.Errorf("delete note %s: %w", noteID, err)
	}
	return int(tag.RowsAffected()), nil
}

// CountNotesOnPage reports how many notes a page holds, regardless of author.
// Used by tests and by a possible future cap check.
func (s *Store) CountNotesOnPage(ctx context.Context, pageID string) (int, error) {
	const query = `SELECT count(*) FROM notes WHERE page_id = $1`
	var count int
	if err := s.pool.QueryRow(ctx, query, pageID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count page notes: %w", err)
	}
	return count, nil
}

func scanNotes(rows pgx.Rows) ([]model.Note, error) {
	notes := make([]model.Note, 0)
	for rows.Next() {
		var note model.Note
		var createdAt, updatedAt time.Time
		if err := rows.Scan(
			&note.ID,
			&note.PageID,
			&note.AuthorID,
			&note.Text,
			&note.Comment,
			&note.Anchor,
			&createdAt,
			&updatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan note: %w", err)
		}
		note.CreatedAt = formatTimestamp(createdAt)
		note.UpdatedAt = formatTimestamp(updatedAt)
		notes = append(notes, note)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notes: %w", err)
	}
	return notes, nil
}

// formatTimestamp renders a timestamp as RFC 3339 in UTC, the shape the API
// contract shows (`2026-11-19T12:00:00Z`).
func formatTimestamp(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

// anchorJSON keeps the stored bytes valid for the `jsonb` cast: an empty value
// would make PostgreSQL reject the statement instead of reaching validation.
func anchorJSON(raw []byte) string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return "null"
	}
	return trimmed
}
