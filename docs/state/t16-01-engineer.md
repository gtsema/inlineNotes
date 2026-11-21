# t16-01 — engineer report (Stage 16, sync server)

Commit: `32c3428` — `feat(server): Stage 16 sync server - Go + PostgreSQL + Docker in server/, no extension change`
19 files, +2661 / -1. Working tree after the commit: only the pre-existing untracked `test_img/` (not mine, present before this task).

## Per-AC verdict

| AC | Verdict | Evidence (exact command → result) |
|---|---|---|
| 1. `server/` layout + module path | **met** | `find server -type f` → all 10 briefed paths present (`go.mod` `go.sum` `cmd/server/main.go` `internal/api/` `internal/store/` `internal/model/` `migrations/` `Dockerfile` `docker-compose.yml` `README.md` `.env.example`). `head -1 server/go.mod` → `module inlinenotes/server`. |
| 2. `docker build` < 40 MB final stage | **met** | `docker build -t inlinenotes-server ./server` → exit 0. `docker images inlinenotes-server --format '{{.Size}}'` → **31.8MB**; `docker image inspect … {{.Size}}` → 8 856 774 B (8.4 MB uncompressed). Both < 40 MB. Multi-stage: `golang:1.25-alpine` build → `alpine:3.21` + one static (`CGO_ENABLED=0`, `-s -w`) binary. |
| 3. compose up: both healthy, `/health` 200 | **met** | `docker compose up -d --build` → exit 0; `docker compose ps` → `db:healthy server:healthy` (both healthy at t=5s); `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health` → **200**, body `{"status":"ok"}`. |
| 4. schema created on start, idempotent | **met** | `docker compose restart server` → logs show `schema ready` a second time with no error; health 200 after restart; rows preserved (`SELECT count(*)` → 2). Unit: `store.TestMigrateIsIdempotent` (double `Migrate`). |
| 5. POST 2 notes → 2 rows; re-POST moves `updated_at`, keeps `created_at` | **met** | Live: `{"saved":2}`; after re-POST `created_at` unchanged (`21:46:19.900305Z`) and `updated_at` moved (`21:46:19.900305Z` → `21:46:24.014516Z`). Unit: `store.TestSaveNotesInsertsRows`, `store.TestSaveNotesSecondPostKeepsCreatedAtAndMovesUpdatedAt`. |
| 6. two authors, same `id`, same page → 2 rows | **met** | Live: POST `Анна`/`aaaa1111` then `Борис`/`aaaa1111` → 3 rows on the page with two distinct `aaaa1111` rows, comments intact. Unit: `store.TestTwoAuthorsMayShareOneNoteID`. |
| 7. GET page: both authors, only that page | **met** | Live: `rows 3 ["Анна:aaaa1111:первая заметка","Анна:bbbb2222:вторая заметка","Борис:aaaa1111:заметка Бориса"]`. Unit: `store.TestNotesForPageReturnsBothAuthorsAndOnlyThatPage`, `api.TestPostThenGetRoundTrip`. |
| 8. DELETE removes exactly that author's rows on that page | **met** | Live: `DELETE …/author/Анна` → `{"deleted":2}`; remaining `rows 1 ["Борис:aaaa1111"]`; other page still `rows 1`. Unit: `store.TestDeleteRemovesOnlyTheNamedAuthorsRows`, `api.TestDeleteReportsTheAuthorsRowCount`. |
| 9. all-pages: newest first, `limit`/`offset` | **met** | Live: 4 notes → order `c1(…16.741) b1(…15.520) a1(…14.296) cccc3333(…52.184)`, `newest-first: true`; `limit=2` → `c1,b1`; `limit=2&offset=2` → `a1,cccc3333`. Unit: `store.TestNotesForAuthorAllPagesNewestFirstWithLimitAndOffset`, `api.TestAllPagesHonoursLimitAndOffset`, `api.TestAllPagesDefaultsLimitAndRejectsBadPaging`. |
| 10. bad body → 400 + JSON error, nothing written | **met** | Live 400s: empty `author_id` → `{"error":"author_id: must not be empty"}`; 21 notes → `{"error":"notes: must contain at most 20 notes"}`; 257-char comment → `{"error":"notes[0].comment: must be at most 256 characters"}`; non-JSON anchor → `{"error":"body: is not a valid JSON object (…)"}`. Row count unchanged (`rows still 3`) after all four. Unit: `api.TestValidationRejectsBadBodies`, `api.TestValidationAcceptsExactlyTheCaps`, `api.TestAuthorIDLongerThanSixtyFourIsRejected`, `model` nil/empty/broken-anchor + cap tests. |
| 11. `page_id` with `/ ? & #` round-trips | **met** | Live: POST `…/a/b?b=2&a=1#frag` → `{"saved":1}`; GET → `page_id` decodes to `https://example.com/a/b?b=2&a=1#frag` exactly (`exact match: true`); near-miss `…/a/b` → `rows 0` (no normalization, A153). Unit: `api.TestPageIDWithReservedCharactersSurvivesThePath`, `api.TestPageIDIsNotNormalized`, `store.TestPageIDSurvivesVerbatimThroughTheStore`. |
| 12. `go test ./...` green, store against **real** PostgreSQL + handlers | **met** | `docker compose run --rm test` → `go test ./...` exit 0; `-v -count=1` → **39 `--- PASS`, 0 `--- FAIL`, 0 `--- SKIP`**. Store package `ok … 0.351s` against `postgres:16-alpine` via `TEST_DATABASE_URL`. No mock substitutes the database. |
| 13. `server/README.md` (Russian): run, API, no-auth posture | **met** | `server/README.md` 171 lines, Russian: quick start (`docker compose up -d --build`, health curl, `down -v`), test commands, env table, full API table, curl examples, write rules, validation list, a dedicated **«Безопасность: аутентификации нет»** section stating anyone reaching the port can read all notes and delete any author's rows, deployment guidance (trusted network only). |
| 14. nothing outside `server/` + 4 named docs edits | **met** | `git show --stat HEAD` → only `server/**` plus `docs/specs/sync-server.md` (new), `docs/specs/INDEX.md` (1 row), `AGENTS.md` (1 row + 1 link line), `README.md` (1 section). No `src/`, `tests/`, `scripts/`, `package.json` change. `docs/state/` only this report. |

## Changed paths

**Created (under `server/`, 15 files):** `server/go.mod`, `server/go.sum`, `server/cmd/server/main.go`,
`server/internal/api/server.go`, `server/internal/api/server_test.go`,
`server/internal/model/note.go`, `server/internal/model/note_test.go`,
`server/internal/store/store.go`, `server/internal/store/store_test.go`,
`server/internal/store/migrations/0001_init.sql`,
`server/migrations/0001_init.sql`, `server/Dockerfile`, `server/docker-compose.yml`,
`server/README.md`, `server/.env.example`.

**Edited (outside `server/`, 4 files):** `docs/specs/sync-server.md` (new spec), `docs/specs/INDEX.md` (one row),
`AGENTS.md` (one `server/` row in Expected Repository Structure + the spec named in Documentation Expectations),
`README.md` (one section «Сервер синхронизации» + one spec bullet).

## Commands run (from the repository root)

| Command | Exit | Note |
|---|---|---|
| `docker build -t inlinenotes-server ./server` | 0 | final image 31.8 MB |
| `docker compose -f server/docker-compose.yml up -d --build` | 0 | both healthy |
| `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health` | — | 200, body `{"status":"ok"}` |
| `docker compose run --rm test` (`go test ./...`, real PostgreSQL) | 0 | 39 pass, 0 fail, 0 skip |
| `docker compose -f server/docker-compose.yml down -v` | 0 | stack down after every probe |
| `npm run build` | 0 | `dist/` 12 files |
| `npm test` | 0 | 1060 tests / 47 files, unchanged |
| `npm run typecheck` | 0 | three tsconfigs clean |
| `node scripts/check-agent-config.mjs` | 0 | 0 errors, 0 warnings, 181 info |
| `go vet ./...` (in container) | 0 | clean |
| `git commit` (1 commit) | 0 | `32c3428` |

Build/test of the server ran **only in Docker** (`golang:1.25-alpine`); no `go` binary exists on the host and none was used.

## Two decisions worth naming (both in the spec)

1. **`anchor: null` is refused with 400.** The brief lists "an invalid `anchor`" as a rejection case and says `anchor` must be
   valid JSON. `null` *is* valid JSON, so the two rules met in an ambiguity. I resolved it toward `A158` ("no authentication
   is not no validation"): the extension's anchor is a text anchor, so a `null` anchor is a stored row that can never
   re-anchor. Every other valid JSON value (`[]`, `"text"`, `42`, any object) is accepted and returned byte-for-byte per
   `A154`. Recorded in `docs/specs/sync-server.md` → Rules / Semantics → "`anchor` is opaque" and Edge Cases.
2. **The checker caps `docs/specs/` at 4 spec files** (`scripts/check-agent-config.mjs:337`). `sync-server.md` makes the
   fourth; the checker is green (exit 0, 0 errors). Flagging it because a fifth spec in a later stage will fail the gate
   until that bound is raised.

Also of note: Go's JSON encoder HTML-escapes `&` as `\u0026` in the response frame; it decodes back to `&`, so `page_id`
is exact after parsing. The spec states this and the test asserts on the decoded value.

## Open questions

None blocking. The two items above are decisions recorded in the spec, not conflicts with a spec line. AC 1–14 are all met.
