# t16-02 — review: reject invalid UTF-8

Reviewer: `code-reviewer` (read-only). Range: `68074bc` (`68074bc^..68074bc`). Brief: `docs/state/t16-02-utf8-validation.md`.
Report: `docs/state/t16-02-engineer.md`. Spec: `docs/specs/sync-server.md`. Carried-fix checklist: none in the brief.
**Verdict: `accepted`** — 14 / 14 AC `pass`, no blocking finding.

## AC (one line each)

1. pass — `note.go:99` `ValidatePageID` → `RequireValidUTF8("page_id", …)`; test `model.TestValidatePageIDRejectsInvalidUTF8` (`note_test.go:212`).
2. pass — `note.go:114` `ValidateAuthorID` checks the trimmed value; test `note_test.go:218`, incl. the sub-cap `notUTF8+"x"` case.
3. pass — `note.go:159` (`id` via `validateRequiredRunes`) and `note.go:168,171` (`text`, `comment`); `ValidateSaveRequest` (`note.go:156`) rewrites the field to `notes[i].<field>`; tests `note_test.go:226,252`.
4. pass — `server.go:116-119` validates before the store; `api.TestGetPageNotesRejectsInvalidUTF8InThePath` (`server_test.go:424`) asserts 400 + `page_id` + `len(store.reads)==0`, with `readErr` injected so a 500 would have won.
5. pass — `api.TestAllPagesRejectsInvalidUTF8Author` (`server_test.go:463`): 400 + `author_id` + zero store reads.
6. pass — `server.go:143-150` validates `page_id` then `author_id`; `api.TestDeleteRejectsInvalidUTF8Author` (`server_test.go:477`).
7. pass — `server.go:230-234` refuses the raw body before decode; test case `author_id in the body` in `api.TestSaveRejectsInvalidUTF8BeforeTheStore` (`server_test.go:509`) checks `len(store.saves)==0`.
8. pass — same test cases `comment`, `text`, `note id`, `second note only`, `unknown field`; `api.TestSaveRejectsInvalidUTF8InTextBeforeTheStore`.
9. pass — the four `storage failure` branches are unchanged (`server.go:104,133,157,180`); `api.TestGenuineStorageFailuresStillAnswerFiveHundred` (`server_test.go:585`) covers all four endpoints with injected `readErr/saveErr/deleteErr`.
10. pass — `model.TestValidateSaveRequestAcceptsCyrillicEverywhere` (256 Cyrillic runes), `api.TestPostAcceptsCyrillicBodyAndPath`; the pre-existing happy-path tests are untouched.
11. pass — one helper, `note.go:239` `RequireValidUTF8`, the only `utf8.Valid` in shipped code (`grep -rn "utf8.Valid" server/` → shipped hit only `note.go:240`; other hits are tests). Six call sites: `server.go:232`, `note.go:99,114,168,171,214`.
12. pass — `sync-server.md:80` (Validation bullet), the new `#### UTF-8 rule (A159) / 400-before-store (A160)` section (`:91-97`), Terms row `:25`, Edge Cases `:169-172`.
13. pass — green gates and the live walk-through are quoted in the brief's PM verification and the report's command table.
14. pass — `git show --name-only 68074bc` lists only `server/**`, `docs/specs/sync-server.md`, `docs/state/t16-02-engineer.md`. `docs/specs/INDEX.md` correctly untouched (no new spec file).

## The eight questions

1. **A159 — any string escaping?** No. `page_id` (`note.go:99`), path `author_id` (`:114`), body `author_id` (`ValidateSaveRequest:145` → `ValidateAuthorID`), `id` (`:159`), `text` (`:168`), `comment` (`:171`), plus the whole raw body (`server.go:232`, which is strictly stronger than per-field: it also covers `unknown field`).
2. **A160 — partial write?** Impossible. `handleSavePageNotes` (`server.go:115-141`) has exactly one `SaveNotes` call, at `:130`, after `ValidatePageID`, `decodeJSON`, `ValidateSaveRequest`; each failure returns before it. The store itself is atomic (`store.go:127-163`, single tx, commit at `:161`). `id` is checked before the insert loop (`note.go:159`), so no per-note late refusal.
3. **A161 — 500 reachable and tested?** Yes. Four branches unchanged, and the injected-error test hits all four (`server_test.go:585-629`). `decodeJSON`'s new read-failure path is a `400` (`server.go:229`) but it is unreachable from the direct handler, so no genuine `500` was converted to a `400`.
4. **AC 11 — one helper?** Yes, one. No second copy. The raw-body call adds a *call site*, not a second rule.
5. **Body reading — does it break a legitimate request?** No. `io.ReadAll` drains the body, so the later decode reads from `raw`, not from a consumed reader. Same 1 MiB `MaxBytesReader`, `MaxBytesError` still → `400 "is too large"` (`server.go:225`). Empty body: `raw` = `""`, `utf8.Valid("")` is `true`, decode yields `io.EOF` → `400 "is empty"` exactly as before (`server.go:238`). Chunked encoding: `http.MaxBytesReader`/`MaxBytesError` has no transfer-encoding dependency, so behaviour is identical to the old streaming path. Valid JSON is ASCII-safe structurally, so the string round trip loses nothing.
6. **Staleness — does a doc claim something the code does not do?** **Yes, two sentences; finding 1 (non-blocking).**
7. **t16-01 regression?** None seen. Four routes (`server.go:55-60`), validation order, `DELETE` trimming, `limit/offset` handling and the caps are untouched; only insertion points were added. `store.go` was not modified: `ON CONFLICT (page_id, author_id, id)` (`store.go:137`) is intact. Remaining pre-existing risk, unchanged by this commit: a POST whose JSON value is not a string, e.g. `{"author_id":5,…}`, still yields `"body: … is not a valid JSON object"`, which reads like a JSON error (non-blocking, finding 2).

## Findings

1. **`docs/specs/sync-server.md:172`** — "A body that is **not valid JSON** is `400` before any rule runs, so a broken client cannot reach the table." The code runs the UTF-8 check *before* the JSON parse (`server.go:232` then `:236`), so a body that is neither gets the UTF-8 answer (`body: must be valid UTF-8…`), not a JSON error. The same sentence calls the raw-byte check "the stricter of the two", which is the right instinct but contradicts the "before any rule runs" clause. Suggest: "a body that is not valid JSON is `400`; the UTF-8 check runs first, so a body that is both gets the UTF-8 error." Non-blocking: AC 4-8 message text is not specified, and `sync-server.md:93` already states the order correctly.
2. **`docs/specs/sync-server.md:172` precedent / `server_test.go:319-321`** — a non-string JSON scalar (`{"author_id":5,…}`) is reported as `"is not a valid JSON object"` although the JSON is valid. Pre-existing `t16-01` behaviour, outside AC, named only for the ledger.
3. **`server_test.go:433`** — the AC 4 case concatenates a `url.PathEscape`'d key with literal `%C0…` and therefore sends a path with a real `/` inside one segment; `net/http` answers 301 before any handler. The test still proves AC 4: a 301 fails its `== 400` assert, and the sibling `TestGetPageNotesRejectsRawInvalidUTF8InThePath` (`:456`) plus the live probe cover the same rule. Non-blocking.
4. **`server_test.go:465`** (AC 5) — asserts only 400 + `author_id`, not `len(store.reads)==0`. No other route can reach that handler, so the coverage gap is invisible. Non-blocking.
5. Commit message: "verified live with `GET /notes/page/%C0%ED%ED%E0`" — that URL currently answers `301` (real `/`); the measured AC 4 probe was the single-segment/encoded form, as the brief says. Wording only. Non-blocking.
6. `decodeJSON` now buffers ≤ 1 MiB per POST instead of streaming (`server.go:224`); disclosed in the report as deviation 1 and forced by AC 11. Non-blocking.

Nothing here blocks: no AC fails, no spec rule about behaviour is violated (the only staleness is a doc sentence, `finding 1`), no dependency, no network call, and the testable rules all have tests.
