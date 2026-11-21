# t16-02 — engineer report: reject invalid UTF-8 instead of storing it or answering 500

Owner: `extension-engineer`. Brief: `docs/state/t16-02-utf8-validation.md`. Rulings: `A159`, `A160`, `A161`.
Status: implemented, all gates run green, one commit.

## What changed, in one paragraph

One helper — `model.RequireValidUTF8(field string, value []byte) error`, built on `utf8.Valid` —
is now the only place in the server that decides "is this valid UTF-8" (AC 11). Every validator
calls it: `ValidatePageID` (`page_id`), `ValidateAuthorID` (`author_id`),
`validateRequiredRunes` (note `id`), and `validateNoteInput` (note `text`, note `comment`). The
JSON body is additionally judged **before** `encoding/json` can repair it: `api.decodeJSON` reads
the raw bytes, calls the same helper with the field name `body`, and only then decodes. The
`storage failure` branch is untouched and still `500` (A161).

## The measured root cause, confirmed by a test

The brief's root cause is right, and it is stronger than the brief states for the body case:

- `utf8.RuneCountInString` counts an invalid byte as one `RuneError`, so a Windows-1251 string
  passes the length caps.
- For a **path** segment the invalid bytes arrive intact, so a helper on the path value is enough.
- For a **body** the invalid bytes never reach the model at all: `encoding/json` replaces each
  invalid byte inside a JSON string with `U+FFFD` **in the decoded struct**. A check placed after
  `Decode` therefore sees a well-formed Go string, answers `200`, and the store writes `U+FFFD` × 4
  — exactly the observed `200 {"saved":1}` with the row `efbfbd` × 4.

That is why the fix has two call sites for one rule: the path is checked where it arrives, and the
body is checked on its raw bytes before decoding. `api.TestRawBodyFixtureCarriesTheInvalidBytesVerbatim`
pins this mechanism (it asserts the decoder really turns `c0 ed ed e0` into four `U+FFFD`), so if a
future Go version changes that behavior the premise of the raw-bytes gate is re-examined rather than
silently lost.

Consequence for the response body: an invalid **body** is a `400` with the field `body`, not
`notes[i].<field>`, because the offending JSON is refused before it is parsed. The per-note field
names still exist in `model.ValidateSaveRequest` (AC 3) and are covered at that layer by
`model.TestValidateSaveRequestRejectsInvalidUTF8InEveryNoteField` and
`...NamesTheOffendingNoteIndex`; a directly-constructed request with invalid bytes in `id`, `text`
or `comment` is refused as `notes[i].<field>`. `A159` requires the request to be valid UTF-8, and a
body that is not is a single refusal.

## Acceptance criteria 1–14

| AC | Verdict | Evidence |
|---|---|---|
| 1 | PASS | `model.ValidatePageID` rejects invalid UTF-8 with `Field == "page_id"`. Test `model.TestValidatePageIDRejectsInvalidUTF8`. Command: `docker compose run --rm test go test ./internal/model/ ./internal/api/ -count=1` → exit 0. |
| 2 | PASS | `model.ValidateAuthorID` rejects invalid UTF-8 with `Field == "author_id"`, including a value far below the 64-code-point cap. Test `model.TestValidateAuthorIDRejectsInvalidUTF8` (exit 0). |
| 3 | PASS | `model.ValidateSaveRequest` rejects invalid `id`, `text`, `comment` with `notes[i].<field>`, and the index is the offending note's. Tests `model.TestValidateSaveRequestRejectsInvalidUTF8InEveryNoteField`, `model.TestValidateSaveRequestNamesTheOffendingNoteIndex` (exit 0). |
| 4 | PASS | `GET /notes/page/<invalid utf8>` → **400** naming `page_id`, store never called. Tests `api.TestGetPageNotesRejectsInvalidUTF8InThePath`, `api.TestGetPageNotesRejectsRawInvalidUTF8InThePath` (exit 0). Live: `curl http://localhost:8080/notes/page/%C0%ED%ED%E0` → `http=400 {"error":"page_id: must be valid UTF-8; ..."}`. |
| 5 | PASS | `GET /notes/author/<invalid utf8>/all-pages` → **400**, not the measured 500. Test `api.TestAllPagesRejectsInvalidUTF8Author` (exit 0). Live: `curl "http://localhost:8080/notes/author/%C0%ED%ED%E0/all-pages"` → `http=400 {"error":"author_id: must be valid UTF-8; ..."}` (was `500 {"error":"storage failure"}`). |
| 6 | PASS | `DELETE /notes/page/<valid>/author/<invalid utf8>` → **400**, store never called. Test `api.TestDeleteRejectsInvalidUTF8Author` (exit 0). Live: `curl -X DELETE "http://localhost:8080/notes/page/<valid>/author/%C0%ED%ED%E0"` → `http=400 {"error":"author_id: ..."}`. |
| 7 | PASS | `POST` with a Windows-1251 `author_id` → **400** and **zero rows**. Test `api.TestSaveRejectsInvalidUTF8BeforeTheStore/author_id_in_the_body` (fake records no `SaveNotes` call, exit 0). Live: `POST` the hand-built CP1251 body → `http=400 {"error":"body: must be valid UTF-8; ..."}`, then `psql -c "SELECT count(*) ..."` on a fresh page → `0` before and `0` after. |
| 8 | PASS | `POST` with invalid `text` or `comment` → **400**, zero rows, and the valid note of the same batch is not written either (`A160` all-or-nothing). Tests `api.TestSaveRejectsInvalidUTF8BeforeTheStore` (`comment`, `text`, `note id`, `second note only`, `unknown field`), `api.TestSaveRejectsInvalidUTF8InTextBeforeTheStore` (exit 0). Live: `http=400`, row count on the fresh page `0`. |
| 9 | PASS | A genuine storage failure is still **500** `storage failure`, proven by injected store errors (never a live outage) on all four endpoints. Test `api.TestGenuineStorageFailuresStillAnswerFiveHundred` (exit 0). The branch itself is untouched; only when it is reached narrowed. |
| 10 | PASS | The Cyrillic happy path is unchanged: `model.TestValidateSaveRequestAcceptsCyrillicEverywhere` (256 Cyrillic code points still accepted), `api.TestPostAcceptsCyrillicBodyAndPath`, plus every pre-existing happy-path test (`api.TestPostThenGetRoundTrip`, `store.Test*`). Live: `Анна` and `Борис` POST with the same note id → `200 {"saved":1}` twice, `GET` returns both rows, `GET all-pages` returns Анна's rows, `DELETE Анна` → `{"deleted":1}` with Борис's row surviving. |
| 11 | PASS | Exactly **one** helper: `model.RequireValidUTF8(field string, value []byte) error`, the only call site of `utf8.Valid`/`utf8.ValidString`/`utf8.ValidRune` in the server. Verified: `grep -rn "utf8.Valid" server/` → one occurrence, inside the helper. All five validators plus `api.decodeJSON` call it. |
| 12 | PASS | `docs/specs/sync-server.md` states the UTF-8 rule and the 400-before-store guarantee: the new `#### UTF-8 rule (ruling A159) and the 400-before-store guarantee (ruling A160)` subsection, the extended Validation list, the `valid UTF-8` Terms row, four new Edge Cases, and a new test-mapping table. |
| 13 | PASS | All gates green, exit codes below. |
| 14 | PASS | `git status --short` shows only `docs/specs/sync-server.md`, `server/README.md`, `server/internal/api/server.go`, `server/internal/api/server_test.go`, `server/internal/model/note.go`, `server/internal/model/note_test.go` (plus this `docs/state/` report). `src/`, `tests/`, `scripts/`, `package.json` are untouched. `git diff --name-only | grep -E '^(src/|tests/|scripts/|package.json)'` → no match. |

## Commands run, with exit codes

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm run build` | 0 | `dist/` is a self-contained MV3 folder (12 files) |
| 2 | `npm test` | 0 | 47 test files passed, 1060 tests passed |
| 3 | `npm run typecheck` | 0 | `tsc` over the three projects, no errors |
| 4 | `node scripts/check-agent-config.mjs` | 0 | 0 errors, 0 warnings, 181 info |
| 5 | `MSYS_NO_PATHCONV=1 docker build -t inlinenotes-server ./server` | 0 | image built, `size_mb=8.4` (< 40 MB) |
| 6 | `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/server:/usr/src/app" -w /usr/src/app golang:1.25-alpine gofmt -l .` | 0 | no files listed |
| 7 | `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/server:/usr/src/app" -w /usr/src/app golang:1.25-alpine go vet ./...` | 0 | clean |
| 8 | `MSYS_NO_PATHCONV=1 docker compose run --rm test go test ./... -count=1 -v` | 0 | `ok` api, model, store; 56 top-level tests, 0 skips (store ran against real PostgreSQL) |
| 9 | `MSYS_NO_PATHCONV=1 docker compose up -d --build` | 0 | `db` and `server` both `healthy`; `curl /health` → `http=200 {"status":"ok"}` |
| 10 | live walk-through (below) | 0 | every case as specified |
| 11 | `MSYS_NO_PATHCONV=1 docker compose down` | 0 | containers, network and volume removed |

`docker` commands are prefixed with `MSYS_NO_PATHCONV=1`; without it Git Bash rewrites `/usr/src/app`
into a Windows path.

## Live walk-through (compose, real PostgreSQL)

```
GET  /notes/page/%C0%ED%ED%E0                   -> 400 {"error":"page_id: must be valid UTF-8; ..."}
GET  /notes/author/%C0%ED%ED%E0/all-pages       -> 400 {"error":"author_id: must be valid UTF-8; ..."}
DELETE /notes/page/<valid>/author/%C0%ED%ED%E0  -> 400 {"error":"author_id: must be valid UTF-8; ..."}

POST /notes/page/<fresh>   author_id = c0 ed ed e0   -> 400 {"error":"body: must be valid UTF-8; ..."}
POST /notes/page/<fresh>   comment   = c0 ed ed e0   -> 400 {"error":"body: must be valid UTF-8; ..."}
POST /notes/page/<fresh>   text      = c0 ed ed e0   -> 400 {"error":"body: must be valid UTF-8; ..."}
SELECT count(*) FROM notes WHERE page_id = '<fresh>';  -> 0 before, 0 after

POST /notes/page/<p>  {"author_id":"Анна",  ...}     -> 200 {"saved":1}
POST /notes/page/<p>  {"author_id":"Борис", ...}     -> 200 {"saved":1}   (same note id, two rows)
GET  /notes/page/<p>                                 -> 200, both rows, comments intact, no U+FFFD
GET  /notes/author/<Анна>/all-pages?limit=5&offset=0 -> 200, Анна's rows newest first
DELETE /notes/page/<p>/author/<Анна>                 -> 200 {"deleted":1}; Борис's row survives
```

Host note: the Cyrillic `POST` bodies were sent from a file written by Node
(`--data-binary @file`), because an inline `-d '{"author_id":"Анна",...}'` in this Git Bash
mangles non-ASCII argv on the way to `curl.exe` and produced a genuine 400 for a genuinely
malformed body. The sent bytes were verified with `xxd` (`d0 90 d0 bd d0 bd d0 b0` for `Анна`).
This is a shell artifact, not a server behavior.

## Files changed

- `server/internal/model/note.go` — added the single helper `RequireValidUTF8`; `ValidatePageID`,
  `ValidateAuthorID`, `validateRequiredRunes` and `validateNoteInput` call it.
- `server/internal/api/server.go` — `decodeJSON` reads the raw body, calls
  `model.RequireValidUTF8("body", raw)` and only then decodes.
- `server/internal/model/note_test.go` — the fixture guard plus the AC 1–3 tests and the Cyrillic
  acceptance test.
- `server/internal/api/server_test.go` — the AC 4–10 tests, the raw-body and hand-built-note
  helpers, and the fixture guard that pins the `encoding/json` repair behavior.
- `docs/specs/sync-server.md` — the UTF-8 rule, the 400-before-store guarantee, the 500 narrowing,
  the Terms row, the Edge Cases and the test-mapping table.
- `server/README.md` — the Russian validation summary mentions the UTF-8 rule, why the body is
  checked as raw bytes, and that `500` stays for genuine storage failures. No documented command
  changed.
- `docs/state/t16-02-engineer.md` — this report.

## Open questions / deviations

1. **`decodeJSON` now buffers the body once** (`io.ReadAll` under the same 1 MiB `MaxBytesReader`)
   instead of streaming into the decoder. Same cap, same error, one extra copy of at most 1 MiB per
   POST; the alternative (a validating reader between the socket and the decoder) would have been a
   second place where "valid UTF-8" is decided and would have broken AC 11. Flagged, not hidden.
2. **The response field for an invalid body is `body`, not `notes[i].<field>`.** Explained above;
   AC 7 and AC 8 require only "400 and zero rows", and AC 3 is satisfied at the model layer. If the
   PM wants the field name of the offending note on the HTTP path too, that needs a pre-decode
   scanner that maps a byte offset to a JSON token — a separate task, and the reason is the JSON
   decoder's silent repair, not a defect of this fix.
3. **`rawBodyFor` hand-builds JSON** because `json.Marshal` both repairs invalid bytes and refuses a
   `json.RawMessage` that is not valid JSON; this is documented in the test file so the next reader
   does not "simplify" it back into a passing-but-meaningless test.
4. **Behaviour change to keep in view:** a request body that is valid JSON but not valid UTF-8 is now
   refused, where previously PostgreSQL would answer `500` (path) or corrupt the row (body). A client
   that legitimately sends UTF-8 is unaffected: the four endpoints and the Cyrillic happy path are
   byte-for-byte as before, verified live.
