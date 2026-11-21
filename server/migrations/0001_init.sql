-- Schema of the inlineNotes sync server.
--
-- Rule owners: docs/specs/sync-server.md (Rules / Semantics -> "Schema").
-- Every statement is idempotent: the file is re-executed on every start (AC 4).
--
-- The primary key is the TRIPLE (page_id, author_id, id), never `id` alone.
-- Two authors may legitimately use the same note id, and one author's write must
-- never overwrite another author's row (ruling A155).
--
-- `page_id` is the extension's `pageKey` verbatim (ruling A153): the server never
-- normalizes it. `anchor` is opaque JSONB (ruling A154): the server stores it and
-- returns it byte-for-byte, it never parses the shape.

CREATE TABLE IF NOT EXISTS notes (
  page_id    TEXT        NOT NULL,
  author_id  TEXT        NOT NULL,
  id         TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  comment    TEXT        NOT NULL,
  anchor     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, author_id, id)
);

-- Listing one page's notes.
CREATE INDEX IF NOT EXISTS notes_page_idx ON notes (page_id);

-- The all-pages hook of one author, newest first (ruling A157).
CREATE INDEX IF NOT EXISTS notes_author_idx ON notes (author_id, updated_at DESC);
