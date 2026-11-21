# t16-02 — reject invalid UTF-8 instead of storing or 500-ing

Status: opened. Owner: PM. Implementer: `extension-engineer`. Reviewer: `code-reviewer`.
Parent: Stage 16, task `t16-01` (accepted, `32c3428`).

## Why this exists

The PM measured two defects on the live stack after `t16-01` was accepted. Both are the same root
cause: the server hands request bytes to PostgreSQL without checking that they are valid UTF-8.

| # | Defect | Observed | Expected |
|---|---|---|---|
| `S16-1` | Invalid UTF-8 in a **path** segment | `GET /notes/author/%C0%ED%ED%E0/all-pages` → **500** `{"error":"storage failure"}`; log: `invalid byte sequence for encoding "UTF8": 0xc0 0x21 (SQLSTATE 22021)` | **400** with a validation error naming the field |
| `S16-2` | Invalid UTF-8 in a **JSON body** | `POST` with `author_id` as Windows-1251 bytes → **200** `{"saved":1}` and the row stored `efbfbd` × 4 (`U+FFFD`) | **400**, nothing written |

The user asked for these to be fixed now, not deferred to the backlog.

## Root cause — measured by the PM, not guessed

`server/internal/model/note.go:95` `ValidatePageID` and `:106` `ValidateAuthorID` check emptiness and
length only:

```go
if utf8.RuneCountInString(pageID) > 2048 { ... }
```

`utf8.RuneCountInString` counts an invalid byte as one `RuneError`, so a Windows-1251 string passes
the length check, reaches the query, and PostgreSQL rejects it — or, for a body, `encoding/json`
replaces the invalid bytes with `U+FFFD` and the write succeeds with garbage. Nothing in the request
path asks "is this valid UTF-8".

## Rulings

### A159 — every request-derived string must be valid UTF-8 before it reaches the store

Validation rejects invalid UTF-8 with `400` and a `ValidationError` naming the field. This applies to
the path segments (`page_id`, `author_id`) and to every string in the JSON body (`author_id`, note
`id`, `text`, `comment`).

Reason: PostgreSQL's `TEXT` columns are UTF-8. Letting a non-UTF-8 string through means either a
`500` (path) or silent corruption (`U+FFFD` in a body). Neither is acceptable for a server with no
authentication: the client is the only thing that can be trusted to encode correctly, and when it
does not, the server must say so.

### A160 — a request that fails validation writes nothing

The rejection happens **before** the store is called. A `POST` with one invalid note writes zero
rows, not "the valid ones". This matches `A158`'s "no authentication is not no validation" and keeps
the write path all-or-nothing.

### A161 — the 500 stays for genuine storage failures

The `storage failure` branch stays and keeps returning `500`. The fix narrows **when** it is reached,
it does not remove it. A real database outage must still be a `500`, not a `400`.

## Acceptance criteria

1. `model.ValidatePageID` rejects a string containing invalid UTF-8 with a `ValidationError` whose
   `Field` is `page_id`.
2. `model.ValidateAuthorID` rejects a string containing invalid UTF-8 with a `ValidationError` whose
   `Field` is `author_id`.
3. Every note string in `ValidateSaveRequest` (`id`, `text`, `comment`) rejects invalid UTF-8 with a
   `ValidationError` naming the offending field as `notes[i].<field>`.
4. `GET /notes/page/<invalid utf8>` answers **400**, not 500, and the response body is a JSON
   `{"error": ...}` naming `page_id`.
5. `GET /notes/author/<invalid utf8>/all-pages` answers **400**, not 500.
6. `DELETE /notes/page/<valid>/author/<invalid utf8>` answers **400**, not 500.
7. `POST /notes/page/<valid>` with `author_id` containing invalid UTF-8 answers **400** and writes
   **zero** rows (`A160`).
8. `POST` with a note whose `comment` or `text` contains invalid UTF-8 answers **400** and writes
   zero rows.
9. A genuine storage failure still answers **500** (`A161`) — proven by a unit test that injects a
   store error, not by a live outage.
10. Valid UTF-8 in every position still works: the four existing happy-path scenarios pass unchanged
    (Cyrillic `author_id` included — the live walk-through used `Анна` and `Борис`).
11. A helper that decides "is this valid UTF-8" is written **once** and used by all validators; no
    second copy of the same rule.
12. The spec `docs/specs/sync-server.md` states the UTF-8 rule and the `400`-before-store guarantee.
13. Every gate stays green: four extension gates, `docker build`, `go vet`, `go test ./...`, and the
    live compose walk-through with the four endpoints.
14. No file outside `server/` changes except `docs/specs/sync-server.md`, `docs/state/`, and — only
    if a command in the README changed — `server/README.md`.

## Gates

```
npm run build && npm test && npm run typecheck && node scripts/check-agent-config.mjs
docker build -t inlinenotes-server ./server
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/server:/usr/src/app" -w /usr/src/app golang:1.25-alpine go vet ./...
docker compose -f server/docker-compose.yml up -d --build
# then the four endpoints, including the invalid-UTF-8 cases of AC 4-8
docker compose -f server/docker-compose.yml down
```

Note for the shell: on this host Git Bash rewrites `/usr/src/app` to a Windows path unless
`MSYS_NO_PATHCONV=1` is set. The engineer must use that prefix or an equivalent workaround.

## Constraints

- `src/`, `tests/`, `scripts/`, `package.json` untouched — the extension is not this task.
- No new Go dependency. `unicode/utf8` is in the standard library.
- Tests must run against a real PostgreSQL where the store is involved; the validators themselves are
  pure functions and are tested directly.
- One commit. `docs/state/` is the PM's except the engineer's own report.

## Out of scope

- Rejecting other malformed inputs (wrong content types, oversized bodies, duplicate JSON keys).
- The duplicate migration `S16-3` — a separate ledger item, not this task.
- Authentication. The server stays open (`A158`).

---

## PM verification of `t16-02` (commit `68074bc`)

Measured by the PM on the real stack.

### Gates

| Gate | Result |
|---|---|
| `npm run build` | exit 0 |
| `npm test` | exit 0 — **1060 / 47** (unchanged; the extension was not touched) |
| `npm run typecheck` | exit 0 |
| `node scripts/check-agent-config.mjs` | exit 0 — 181 info |
| `go vet ./...` in `golang:1.25-alpine` | clean |
| `docker compose up -d --build` | both services healthy, `/health` 200 |

### Both defects closed, verified live

| Case | Before | After |
|---|---|---|
| `GET /notes/page/<invalid utf8>` | `500 storage failure` | **`400`** `page_id: must be valid UTF-8…` |
| `GET /notes/author/<invalid utf8>/all-pages` | `500` | **`400`** `author_id: …` |
| `DELETE …/author/<invalid utf8>` | `500` | **`400`** `author_id: …` |
| `POST` with invalid `author_id` | `200 {"saved":1}` + `U+FFFD` row | **`400`** `body: …` |
| `POST` with invalid `text` | `200` | **`400`** `body: …` |
| Rows written by a rejected POST | 1 garbage row | **zero** (`{"notes":[]}`) — `A160` |
| Valid Cyrillic happy path | worked | still works (`saved:1`, `deleted:1`) |

### Engineer finding beyond the brief

The brief named the validators as the root cause. The engineer found a second mechanism for the
**body** case: `encoding/json` replaces invalid bytes with `U+FFFD` **before** the model sees them, so
a check placed after `Decode` can never fire. The fix therefore validates the **raw bytes before
decoding** (`api.decodeJSON`) and keeps the validator check for the path. Two call sites, one helper.
The engineer pinned the mechanism with a test asserting the decoder really produces four `U+FFFD`,
so the guard cannot silently rot.

### `A161` preserved

The `storage failure` branch still returns `500` (three sites in `server.go`), and two tests assert
`StatusInternalServerError` for injected store errors.

---

## Review outcome — `t16-02` accepted

`code-reviewer` verdict on `68074bc`: **accepted**, 14 / 14 AC pass, no blocking finding. The review
is in the repo at `docs/state/t16-02-review.md`.

The reviewer confirmed the mechanisms the PM measured, and named the specific tests that keep each
one honest: the raw-body refusal happens before the store and is proven by asserting the store
recorded zero calls; the four `500` branches are unchanged and covered by an injected-error test;
the validators are reached for every request-derived string.

### Stage 16 final state

| | |
|---|---|
| Server | Go, PostgreSQL, Docker, in `server/` |
| Endpoints | `GET /notes/page/{page_id}`, `POST /notes/page/{page_id}`, `DELETE /notes/page/{page_id}/author/{author_id}`, `GET /notes/author/{author_id}/all-pages`, `GET /health` |
| Identity | the triple `(page_id, author_id, note_id)` — a same-id collision across authors cannot overwrite |
| Extension gates | green and unchanged: 1060 tests / 47 files, checker 181 info |
| Server gates | image 31.8 MB, `go vet` clean, compose healthy, `/health` 200 |
| Defects found and fixed | the two UTF-8 defects (`S16-1`, `S16-2`) |
| Debt left | `S16-3` — the duplicate migration file |
| Extension integration | **not started**, by the user's instruction |
