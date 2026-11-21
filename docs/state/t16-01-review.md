# t16-01 review — Stage 16 sync server (commit `32c3428`, `32c3428~1..32c3428`)

Reviewer: `code-reviewer`, read-only. Artifacts read: `docs/state/stage-16-sync-server.md`
(rulings `A153`–`A158`, 14 AC, PM verification section), `docs/specs/sync-server.md`,
`server/**` at `32c3428`, the diff. Engineer report `docs/state/t16-01-engineer.md` **does not exist**
in the repo (`docs/state/` holds no `t16-01-engineer.md`); the commit message carries the command
evidence and the PM re-verified every gate on the real stack, so the review proceeds on the
diff + the PM's quoted gates. Recorded as remark R0, not a finding: `code-review-flow.md`
"Flow / Sequence" step 2 asks for a report file, and its absence is not an AC of this brief.
`Carried-fix checklist`: none stated in the brief.

## Verdict

**accepted.** No AC fails, no ruling is violated in code, no injection, no forbidden dependency,
no extension file touched. The two known defects (invalid UTF-8 in a path → `500` instead of `400`;
invalid UTF-8 in a body stored as U+FFFD) are **deferred to the ledger (`S16-1`, `S16-2`), not
blocking**: neither is an AC of this brief, and `A158`'s validation list is met for the encodings a
JSON client actually sends. `S16-3` (duplicate migration) is also non-blocking.

## 1. Acceptance criteria — one line each

| AC | Verdict | Evidence |
|---|---|---|
| 1 layout + module path | pass | `server/go.mod:1` `module inlinenotes/server`; all 12 briefed paths exist (`cmd/server/main.go`, `internal/{api,store,model}/`, `migrations/`, `Dockerfile`, `docker-compose.yml`, `README.md`, `.env.example`). |
| 2 image < 40 MB | pass | `server/Dockerfile:30-34` runtime = `alpine:3.21` + one static binary; PM measured 31.8 MB. |
| 3 compose up, both healthy, `/health` 200 | pass | `server/docker-compose.yml:14-22,33-42` both healthchecks; `server/internal/api/server.go:85-93`; PM: `db:healthy`, `server:healthy`, `200 {"status":"ok"}`. |
| 4 idempotent schema on start | pass | `server/internal/store/store.go:74-91` + `migrations/0001_init.sql:12-30` (`IF NOT EXISTS`); test `store_test.go:408`. |
| 5 re-post keeps `created_at`, moves `updated_at` | pass | `store.go:133-140` (`DO UPDATE ... updated_at = now()`, `created_at` untouched); test `store_test.go:115`. |
| 6 two authors, one `id` → two rows | pass | `store.go:137` `ON CONFLICT (page_id, author_id, id)`; test `store_test.go:161`. |
| 7 page read = both authors, that page only | pass | `store.go:161-166` `WHERE page_id = $1`; test `store_test.go:193`. |
| 8 delete = named author on that page only | pass | `store.go:203` `WHERE page_id = $1 AND author_id = $2`; tests `store_test.go:229`, `api/server_test.go:348`. |
| 9 all-pages, newest first, `limit`/`offset` | pass | `store.go:174-185` `ORDER BY updated_at DESC, page_id ASC, id ASC LIMIT $2 OFFSET $3`; handler clamp `server.go:151-168`; tests `store_test.go:277`, `api/server_test.go:377,399`. |
| 10 four bad bodies → 400, nothing written | pass | `model/note.go:135-186`; `api/server_test.go:282` asserts `400` **and** `len(store.saves) == 0`. |
| 11 `page_id` with `/ ? & #` round-trips | pass | `api/server_test.go:423` (`url.PathEscape` in, literal `#` back), `store_test.go:338`, `api/server_test.go:460` (not normalized). |
| 12 `go test ./...` green, store on real PostgreSQL | pass | PM quote `39 tests, 0 skips, 0 failures`; store suite runs through `pgxpool` (`store_test.go:41-80`) with `TEST_DATABASE_URL` set by `docker-compose.yml:57`. |
| 13 `server/README.md` documents run/API/no-auth | pass | `server/README.md:21-38` (run), `:64-120` (API), `:139-155` (no-auth posture), in Russian as required. |
| 14 nothing outside `server/` changes | pass | `git show 32c3428 --name-only` outside `server/`: `AGENTS.md`, `README.md`, `docs/specs/INDEX.md`, `docs/specs/sync-server.md` only — exactly the four permitted; `docs/state/` untouched by this commit (allowed). |

## 2. Rulings in the code

- `A153` — pass. No normalization anywhere: `store.go:161,203,214` use `page_id` verbatim; the only
  `TrimSpace` calls touch `author_id`/`id` (`server.go:120,139,167`, `store.go:148`), never `page_id`.
- `A155` — pass. Triple conflict target `store.go:137`; the batch is one transaction (`store.go:127-155`);
  no `DELETE` in `SaveNotes`, so absent rows and other authors' rows survive.
- `A156` — pass. `store.go:203`; `author_id` comes from the path (`server.go:134`).
- `A157` — pass. `server.go:61`, `store.go:174`; nothing in `src/` calls it (`git diff` empty for `src/`).
- `A158` — pass. `model/note.go` is the validation layer and every handler runs it before the store
  (`server.go:101,115-121,135-138,146-149`); CORS `server.go:246-259`.

## 3. SQL injection

**None.** Every request value reaches PostgreSQL as a bind parameter, never as string-concatenated SQL:
`store.go:133-145` (`$1..$6`), `:161-166` (`$1`), `:174-185` (`$1..$3`), `:203` (`$1,$2`),
`:214` (`$1`). All query strings are `const` literals; `fmt.Errorf` is used only for Go errors.
`page_id` is interpolated nowhere. `anchorJSON` (`store.go:257-264`) passes through `$6::jsonb`, so a
malformed anchor is a bind error, not SQL.

## 4. Store tests: real PostgreSQL or a mock?

**Real PostgreSQL.** Mechanism: `store_test.go:30-38` reads `TEST_DATABASE_URL` and `t.Skip`s when it is
empty; `newStore` (`:41-80`) calls `store.New` → `pgxpool` → `Ping`, then `Migrate`, then
`TRUNCATE notes` on a second real pool. No interface, no fake, no `sqlmock` in the package
(the only fake in the diff is the handler-level `fakeStore`, `api/server_test.go:44-124`, which is
legitimate because `internal/store` owns the SQL). `docker-compose.yml:49-59` sets
`TEST_DATABASE_URL` for the `test` profile, which is what the quoted `39 tests, 0 skips` run used.

## 5. Extension untouched

Confirmed: `git diff 32c3428~1 32c3428 -- src tests scripts package.json` is empty; the last commit
touching those paths is `6bdd9ed`. No `package.json`, no lockfile, no `src/manifest.json` change, so
`npm test`/`npm run build`/`npm run typecheck` cannot have moved — matching the PM's 1060/47 quote.

## 6. Go correctness

Checked and clean: pool closed on both paths (`main.go:66` `defer repository.Close()`,
`store.go:55-58` closes on ping failure); graceful shutdown with a 10 s context (`main.go:88-96`);
`ReadHeaderTimeout` set (`main.go:74`); every `rows` closed and `rows.Err()` checked (`store.go:245-254`);
`tx.Rollback` deferred (`store.go:131`); `decodeJSON` returns `ValidationError` on `io.EOF`, so an empty
body is `400`, never a nil-pointer panic (`server.go:216-224`); `MaxBytesReader` bounds the body
(`server.go:53,214`). Two non-blocking remarks: **R1** `server.go:186-193` `writeStoreError` and
`store.go:28` `ErrNotFound` are dead code (`ErrNotFound` is never returned) — harmless; **R2** no
server-side `WriteTimeout`/`IdleTimeout` (`main.go:71-75`), and `SaveNotes` opens a fresh transaction
per request (`store.go:127`) with no per-request timeout — both acceptable for a trusted-network
single-user service, recorded, not findings.

## 7. Staleness - sentences claiming what the code does not do

- **R3** `docs/specs/sync-server.md:164` - "**Non-UTF-8-safe body.** A body that is not valid JSON is `400`
  before any rule runs, so a broken client cannot reach the table." This is **false for a body that is
  syntactically valid JSON but not valid UTF-8**: the decoder replaces the bad bytes with U+FFFD and the
  row is written (`S16-2`, confirmed by the PM). The sentence overstates the guard. Non-blocking because
  it describes the known defect rather than a promise the AC list depends on, but it is a spec sentence
  the code does not honour and should be corrected together with `S16-2`.
- **R4** `docs/specs/sync-server.md:153` - "Database down while serving ... the note endpoints return `500`
  with a JSON error and no partial write." True for a write failure, but the sentence sits next to the
  invalid-UTF-8 path where a `500` is produced for a **client** error; same root cause as `S16-1`.
- **R5** `server/README.md:156-159` lists `migrations/` as if it were the source of the schema; the
  embedded copy is `server/internal/store/migrations/0001_init.sql` (`store.go:30`) and the top-level file
  is read by nothing (`S16-3`). The README does not claim the embedded path, so this is a wording
  ambiguity, not a false claim. No other claim in `AGENTS.md` (Expected Repository Structure row),
  the root `README.md` section, or `server/README.md` was found false against the code.

## Known defects - block or defer?

**Defer.** Both are ledgered (`S16-1`, `S16-2`) and both share one root cause, which I re-confirmed by
reading the code: the raw path/body value reaches PostgreSQL before any UTF-8 check
(`model/note.go:118-133` validates length, not encoding; `store.go:148,161,203` binds the bytes as-is).
They do not fail AC 10 - the four listed bodies are `400` and write nothing - and the shipped loop is
unaffected. `S16-2` is the more serious one (silent data corruption) and should be the next brief,
together with the `R3` spec sentence. `S16-3` is cosmetic but will drift on the first schema change.

## Blocking findings

None.

## Non-blocking remarks

R0 missing engineer report file; R1 dead `writeStoreError`/`ErrNotFound`; R2 no server write/idle timeout
and no per-request DB timeout; R3 stale "non-UTF-8-safe body" sentence; R4 ambiguous `500` sentence;
R5 `migrations/` wording in `server/README.md`.
