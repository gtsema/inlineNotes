# Stage 16 — Sync server (Go + PostgreSQL + Docker)

Status: opened. Owner: PM. Implementer: `extension-engineer`. Reviewer: `code-reviewer`.

## User request (verbatim intent)

The user wants existing notes to be shareable between people who have the extension installed.
The described loop:

1. The user writes notes for an article and presses a sync button in the popup.
2. At that moment the notes are sent to the server and stored in its database.
3. When the user — or anyone else — opens the page, the extension automatically asks the server
   for that page's notes, loads them and shows them on the page as someone else's notes.
4. The user can delete another person's notes for the current page from the popup.

Server requirements stated by the user:

- written in Go;
- no authentication at all;
- only the note operations: get all notes by page, save notes for a page, delete the current
  author's notes, get one author's notes across all pages (a hook for the future);
- must run in a Docker container;
- must use PostgreSQL;
- lives in a new `server/` subdirectory of this project;
- **only the server is implemented now**; the extension integration comes later.

## Environment facts measured by the PM (not assumed)

| Fact | Value |
|---|---|
| Docker engine | 28.1.1, `docker compose` v2.36.0-desktop.1, reachable from the shell |
| Docker network | hub.docker.com reachable; `docker run --rm hello-world` succeeded |
| Go image | `golang:1.25-alpine` pulled and `go version` ran inside it (`go1.25.14 linux/amd64`) |
| Cached images | `postgres:16-alpine`, `postgres:15-alpine`, `golang:1.23`, `golang:1.22-alpine` |
| System Go toolchain | **absent** — no `go` on the host. Docker is the only way to build or test the server |
| Existing gates | `npm run build`, `npm test`, `npm run typecheck`, `node scripts/check-agent-config.mjs` — all TypeScript-only |

Consequence recorded up front: the server is **outside** the existing TypeScript gates. Its gate is
`docker build` plus `go test` inside the container. If the container build cannot run, the task is
reported as "written, not verified" — never as "done".

## Rulings (binding for this stage)

### A153 — `page_id` is the extension's `pageKey`, the server does not normalize

The server treats `page_id` as an opaque string. Normalization stays in `src/core/page-key.ts`
(`pageKeyFromUrl`), which already drops tracking noise and the hash and sorts the remaining query
parameters. The client sends the **already normalized** key. The server never re-normalizes, never
strips query parameters and never lowercases anything.

Reason: a second normalization implementation would drift from the tested one. Two people opening
the same article through different tracking links must land on the same key, and the only
implementation that guarantees that is the one the extension already ships and tests.

Contract note: `pageKey` is a URL and contains `/`, `?`, `&` and `#`. The client must
`encodeURIComponent` it into the path; the server must decode the path segment. This is stated in
the API contract, not left to chance.

### A154 — `anchor` is stored as `jsonb` and never parsed by the server

The extension's `anchor` is a text anchor (normalized text plus a context window). The server
stores it as `jsonb` and returns it byte-for-byte. It does not resolve, validate the shape of, or
re-anchor anything. Anchoring is the content script's job and stays there.

### A155 — `POST` upserts one author's set for one page, never "the page's set"

`POST /notes/page/{page_id}` carries `author_id` in the body and upserts **that author's** notes on
that page. It never deletes another author's rows. Two people syncing the same page must not
overwrite each other — this is the user's own described loop ("my notes are sent").

Concrete semantics:

- for every note in the request body: `INSERT ... ON CONFLICT (page_id, author_id, id) DO UPDATE`;
- a note is identified by the triple `(page_id, author_id, id)`; two authors may legitimately use
  the same `id` value and they stay two rows;
- rows of the **same** author and page that are absent from the request are **not** deleted by this
  operation (deletion has its own endpoint, `A156`);
- `updated_at` is set by the server on every write; `created_at` is preserved on update.

### A156 — `DELETE` removes only the caller's own notes on that page

`DELETE /notes/page/{page_id}/author/{author_id}` deletes every row where `page_id` and
`author_id` match the path. The user's correction is the authority here: the popup's delete button
removes **someone else's** notes locally, and removes **your own** notes on the server too. So the
server-side delete is "delete my own notes", and `author_id` in the path is always the caller.

There is no authentication, so the server cannot verify that the caller is really that author. The
server deletes whatever the path names. This is an accepted consequence of "no authentication",
recorded as a ruling, not an oversight. A note about the security posture goes into the spec.

### A157 — `GET /notes/author/{author_id}/all-pages` is a designed hook, not a live feature

It returns every note of one author across all pages, newest first, with an optional `limit` and
`offset`. It exists so the extension's future "my notes" view has a contract to build against. It
is implemented and tested, but nothing in the extension calls it in this stage.

### A158 — no authentication, no rate limiting, no CORS preflight handling beyond a permissive policy

The user said "no authorization". The server accepts every request. It still sets CORS headers so
that a future content script can call it from a page origin, and it still validates request bodies
so a malformed note cannot corrupt the table. "No authentication" is not "no validation".

## API contract

Base path: `/notes`. All responses are JSON. Errors are `{"error": "..."}` with a matching status.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/notes/page/{page_id}` | — | `200` `{"notes": [...]}` |
| `POST` | `/notes/page/{page_id}` | `{"author_id": "...", "notes": [...]}` | `200` `{"saved": N}` |
| `DELETE` | `/notes/page/{page_id}/author/{author_id}` | — | `200` `{"deleted": N}` |
| `GET` | `/notes/author/{author_id}/all-pages?limit=&offset=` | — | `200` `{"notes": [...]}` |
| `GET` | `/health` | — | `200` `{"status": "ok"}` |

Note object, as stored and returned:

```json
{
  "id": "uuid",
  "page_id": "https://example.com/article?b=2&a=1",
  "author_id": "Анна",
  "text": "selected text",
  "comment": "note body, <= 256 chars",
  "anchor": { "text": "...", "context": "..." },
  "created_at": "2026-11-19T12:00:00Z",
  "updated_at": "2026-11-19T12:00:00Z"
}
```

Validation rules the server enforces (so a bad body cannot reach the table):

- `author_id` non-empty after trimming, `<= 64` characters;
- `id` non-empty, `<= 64` characters;
- `comment` `<= 256` characters — the same cap the extension enforces (`AGENTS.md`);
- `text` non-empty;
- `anchor` must be valid JSON (`jsonb`);
- at most **20** notes per request (the extension's per-page cap).

## Database schema

```sql
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

CREATE INDEX IF NOT EXISTS notes_page_idx   ON notes (page_id);
CREATE INDEX IF NOT EXISTS notes_author_idx ON notes (author_id, updated_at DESC);
```

The primary key is the triple, not `id` alone: two authors may use the same `id`, and one author's
`id` must never overwrite another's row (`A155`).

## Repository layout

```
server/
  go.mod
  go.sum
  cmd/server/main.go        entrypoint: read env, open the pool, run migrations, serve
  internal/api/             handlers, router, JSON helpers, CORS
  internal/store/           PostgreSQL access, migrations, queries
  internal/model/           Note, request/response types, validation
  migrations/               .sql files, embedded into the binary
  Dockerfile                multi-stage: golang:1.25-alpine build -> alpine runtime
  docker-compose.yml        server + postgres:16-alpine, healthchecks, named volume
  README.md                 how to run, how to test, what the API does
  .env.example              DATABASE_URL, PORT
```

## Acceptance criteria (testable)

1. `server/` exists with the layout above and `go.mod` module path `inlinenotes/server`.
2. `docker build server/` succeeds and produces an image smaller than 40 MB in its final stage.
3. `docker compose up -d` in `server/` brings up server **and** postgres, both healthy, and
   `GET /health` returns `200 {"status":"ok"}`.
4. The server creates its schema on start (idempotent: a second start does not fail).
5. `POST /notes/page/{page_id}` with two notes stores two rows; sending the same request again
   leaves two rows with `updated_at` moved forward and `created_at` unchanged.
6. Two authors posting the same `id` on the same page produce **two** rows (`A155`).
7. `GET /notes/page/{page_id}` returns both authors' notes, and only that page's notes.
8. `DELETE /notes/page/{page_id}/author/{author_id}` removes exactly that author's rows on that
   page and leaves the other author's rows untouched (`A156`).
9. `GET /notes/author/{author_id}/all-pages` returns that author's notes across pages, newest
   first, honoring `limit`/`offset` (`A157`).
10. A body with `comment` longer than 256 characters, an empty `author_id`, more than 20 notes, or
    an invalid `anchor` is rejected with `400` and a JSON error, and nothing is written.
11. `page_id` containing `/`, `?`, `&` and `#` survives the round trip through the path segment
    (`A153`).
12. `go test ./...` passes inside the container, and the tests cover the store layer against a real
    PostgreSQL (not a mock) plus the handlers.
13. `server/README.md` documents the run commands, the API and the "no authentication" posture.
14. No file outside `server/` changes except: `docs/specs/sync-server.md` (new spec),
    `docs/specs/INDEX.md` (one row), `AGENTS.md` (one row in Expected Repository Structure),
    `README.md` (one section), and `docs/state/` (this stage's bookkeeping).

## Gates for this stage

Run from the repository root unless stated:

```
docker build -t inlinenotes-server ./server
docker compose -f server/docker-compose.yml up -d --build
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health   # expect 200
docker compose -f server/docker-compose.yml down -v
npm run build && npm test && npm run typecheck && node scripts/check-agent-config.mjs
```

The four `npm` gates must stay green: adding `server/` must not disturb the extension. If they move,
the change is rejected.

## Out of scope for this stage

- Any change to `src/` — the extension integration is a later stage by the user's instruction.
- A sync button, a popup toggle, a background worker, a network call from the extension.
- Authentication, accounts, tokens, rate limiting.
- Merging conflicts between two authors' edits — last write wins per `(page_id, author_id, id)`.
- Deleting someone else's notes **on the server** (`A156` keeps the server delete to the caller's
  own notes; the popup deletes foreign notes locally).
- A Go linter configuration, CI wiring, deployment manifests beyond compose.

## Open questions the PM is NOT deciding silently

None. The user answered all five questions of the interview in this stage's opening turn:
Docker in a container (Q1), `page_id` = `pageKey` (Q2), delete semantics clarified by the user's
correction (Q3), per-note upsert (Q4), defaults for gates (Q5).

If a new observable-behavior decision appears during implementation, the engineer stops and asks
the PM; the PM asks the user. The PM does not invent a default for it.

---

## PM verification of `t16-01` (commit `32c3428`)

Measured by the PM on the real stack, not taken from the engineer's report.

### Gates — all green

| Gate | Command | Result |
|---|---|---|
| extension build | `npm run build` | exit 0, `dist/` 12 files |
| extension tests | `npm test` | exit 0, **1060 / 47** (unchanged) |
| typecheck | `npm run typecheck` | exit 0 |
| harness checker | `node scripts/check-agent-config.mjs` | exit 0, 181 info (was 176, +5 from the new spec) |
| server image | `docker build -t inlinenotes-server ./server` | exit 0, **31.8 MB** |
| server vet | `go vet ./...` in `golang:1.25-alpine` | clean |
| compose up | `docker compose up -d --build` | exit 0, `db:healthy`, `server:healthy` |
| health | `curl /health` | **200** `{"status":"ok"}` |

### Live API walk-through (valid UTF-8, driven from Python to avoid shell encoding)

| Check | Result |
|---|---|
| `POST` Анна 2 notes | `200 {"saved":2}` |
| `POST` Борис, same `id` `n1` | `200 {"saved":1}` |
| `GET /notes/page/{page}` | **3 rows**, both authors, `n1` not overwritten (`A155`) |
| `GET /notes/author/Борис/all-pages` | `200`, 1 note (`A157`) |
| `DELETE .../author/Анна` | `200 {"deleted":2}`, only Борис left (`A156`) |
| `page_id` with `/ ? & #` | survived the path segment (`A153`) |
| `comment` 257 chars | `400` |
| empty `author_id` | `400` |

### Defects found by the PM — both about invalid UTF-8, neither blocks the shipped behaviour

1. **Invalid UTF-8 in a path segment answers `500 storage failure`.** `GET /notes/author/%C0%ED%ED%E0/all-pages` → **500**. A malformed client input must be `400`, not a storage failure. Root cause: the handler passes the raw segment to PostgreSQL, and the driver's error surfaces as a storage error.
2. **Invalid UTF-8 in a JSON body is silently accepted and stored as `U+FFFD`.** A `POST` with `author_id` sent as Windows-1251 bytes (`\xc0\xed\xed\xe0`) returned `200 {"saved":1}` and wrote `efbfbd` × 4. The server neither rejects the request nor warns; the row is unrecoverable garbage.

Both are recorded as debt in the ledger (`S16-1`, `S16-2`). The first is a status-code correctness issue; the second is data integrity. Neither is in the brief's AC list, so neither fails `t16-01` — but both are real and the PM names them rather than hiding them.

### Structural finding

`server/migrations/0001_init.sql` and `server/internal/store/migrations/0001_init.sql` are **byte-identical**, and only the second is embedded (`//go:embed migrations/*.sql` in `internal/store/store.go:30`). The top-level copy is read by nothing and will drift on the first schema change. Ledgered as `S16-3`.

### Note on the shell

The PM's first API walk-through used `curl` from Git Bash, which encoded Cyrillic as Windows-1251 and produced the `U+FFFD` rows. That was the PM's tooling, not the server — proven by re-running the same scenario from Python with explicit UTF-8, where every operation behaved correctly. The server still should have rejected the bytes; that is defect 2 above.

---

## Review outcome — `t16-01` accepted

`code-reviewer` verdict on `32c3428`: **accepted**, no AC failed, no ruling violated, no injection,
no forbidden dependency, no extension file touched. The two UTF-8 defects and the duplicate
migration are **deferred to the ledger, not blocking** — none is an AC of this brief.

The reviewer raised one process remark (R0) that the PM owns: the engineer's report was not in the
repository when the review ran. The brief asked for it and the PM copied it in only after the
review. Fixed in the same commit as this note: `docs/state/t16-01-engineer.md` and
`docs/state/t16-01-review.md` are now in the repo. Cause: the PM treated the subagent's output
artifact as the delivered report and did not copy it into `docs/state/`. Standing correction for
later stages: **copy the engineer's report into `docs/state/` before launching the review**, not
after, so the reviewer reads the repo and not a promise.

### Stage 16 status

| | |
|---|---|
| Shipped | Go server in `server/`, PostgreSQL, Docker, four endpoints, spec, README |
| Gates | four extension gates green (1060/47, checker 181); image 31.8 MB; compose healthy; `/health` 200 |
| Accepted | yes, with three ledgered non-blocking items |
| Open for the user | fix the two UTF-8 defects now, or leave them in the backlog |
