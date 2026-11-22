# sync-server

## Purpose / Goal

Define the sync server that lets readers of the `inlineNotes` extension share their notes: a Go service with a PostgreSQL database, running in a Docker container, that stores notes by page and by author so a second reader opening the same article sees the first reader's notes. The extension is not integrated in this stage: the server is implemented and tested on its own, and the extension integration is a later stage.

## Scope

In scope: the HTTP API contract, the database schema, the validation boundary, the storage semantics of an upsert and a delete, the Docker packaging (image + compose), and the security posture of a server that has no authentication.
Out of scope: any change to the extension (`src/`, `tests/`, `src/manifest.json`); a sync button or a network call from the extension; authentication, accounts, tokens, rate limiting; merge of two authors' concurrent edits on one note; deleting another author's notes on the server; deployment manifests beyond `docker compose`.

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `page_id` | — | the extension's `pageKey` verbatim: a normalized URL that contains `/`, `?`, `&` and `#`; opaque to the server (ruling `A153`) |
| `author_id` | «имя автора» | the note's author; in the extension it is the options author name, at most 40 code points there and at most 64 here |
| `note` | «заметка» | one row: `id`, `page_id`, `author_id`, `text`, `comment`, `anchor`, `created_at`, `updated_at` |
| `anchor` | — | the extension's text anchor (normalized text plus a context window), stored as opaque `jsonb` (ruling `A154`) |
| `comment cap` | «256 символов» | the note body limit, 256 code points, the same number the extension enforces |
| `per-request cap` | «20 записей на страницу» | at most 20 notes in one POST body, reusing the extension's per-page cap |
| `upsert triple` | — | the identity of a note: `(page_id, author_id, id)`; the primary key (ruling `A155`) |
| `all-pages hook` | — | `GET /notes/author/{author_id}/all-pages`, implemented and tested for a future "my notes" view (ruling `A157`) |
| `no authentication` | — | the server accepts every request; a ruling, not an oversight (ruling `A156`, `A158`) |
| `valid UTF-8` | — | every request-derived string is well-formed UTF-8; enforced once by `model.RequireValidUTF8` (ruling `A159`) |

The Russian column is empty for the server itself: the server renders no UI, so it ships no user-visible strings. The Russian wordings above are the extension's, quoted so the same concept is greppable in both layers.

## Flow / Sequence

1. **Startup.** The entrypoint reads `DATABASE_URL` and `PORT` from the environment, opens a `pgxpool` and retries until PostgreSQL answers (a compose cold start starts both services at once).
2. **Migration.** The embedded `.sql` files run in file-name order. Every statement is `IF NOT EXISTS`, so a second start is a no-op rather than a failure (AC 4).
3. **Serve.** `net/http`'s `ServeMux` routes five endpoints. A permissive CORS policy wraps the whole tree; `OPTIONS` short-circuits with `204`.
4. **Read a page.** `GET /notes/page/{page_id}` returns every author's notes on that page.
5. **Write one author's set.** `POST /notes/page/{page_id}` validates the body, then upserts `(page_id, author_id, id)` for the author named in the body.
6. **Delete one author's set.** `DELETE /notes/page/{page_id}/author/{author_id}` removes the rows matching that page and that author.
6a. **Delete one note.** `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` removes exactly one row and answers `{"deleted": 1}`, or `{"deleted": 0}` when that row is not there (ruling `A181`).
7. **Read across pages.** `GET /notes/author/{author_id}/all-pages` returns one author's notes, newest first.

## Rules / Semantics

### `page_id` is opaque (ruling `A153`)

- `page_id` is the extension's `pageKey` from `src/core/page-key.ts` and arrives **already normalized**: tracking noise dropped, the hash dropped, the remaining query parameters sorted.
- The server never normalizes, never re-orders parameters, never drops the hash and never lowercases. A second normalization implementation would drift from the tested one, and two readers arriving through different tracking links must land on the same key.
- `pageKey` is a URL: it contains `/`, `?`, `&` and `#`. The client must `encodeURIComponent` it into the path segment; the server decodes the path value. `#` travels as `%23` and is returned as the literal `#`.
- There is no `origin + pathname` fallback on the server. The extension's fallback lookup stays in `src/core/page-index.ts`, where it is tested. A near-miss key is a different page here.

### `anchor` is opaque (ruling `A154`)

- `anchor` is stored in a `jsonb` column and returned byte-for-byte. The server does not resolve it, does not validate its shape, and does not re-anchor anything: anchoring is the content script's job.
- The server accepts any valid JSON value except `null`. It refuses non-JSON text (the column is `jsonb`) and `null` (the brief makes `anchor` required, and a `null` anchor is a row that can never re-anchor). This is the boundary between `A154` and `A158`.

### Upsert semantics of `POST` (ruling `A155`)

- The body is `{"author_id": "...", "notes": [...]}`. `POST` upserts **one author's** notes on that page, never "the page's set".
- For every note: `INSERT ... ON CONFLICT (page_id, author_id, id) DO UPDATE`.
- A note is identified by the triple `(page_id, author_id, id)`. Two authors may legitimately use the same `id` value; they stay two rows and neither overwrites the other.
- `updated_at` is set by the server on every write. `created_at` is preserved on update.
- Rows of the **same** author on the **same** page that are absent from the request are **not** deleted by this operation. Deletion has its own endpoint.
- The whole batch runs in one transaction: a mid-batch failure leaves the page as it was.
- `saved` in the response counts the rows the statement touched.

### Delete semantics (ruling `A156`)

- `DELETE /notes/page/{page_id}/author/{author_id}` deletes every row where `page_id` and `author_id` match the path, and reports `deleted`.
- The path `author_id` is always the caller. The popup's delete button removes **someone else's** notes locally and removes **your own** notes on the server too, so the server-side delete is "delete my own notes".
- There is no authentication, so the server cannot verify that the caller really is that author: it deletes whatever the path names. This is an accepted consequence of "no authentication", recorded as a ruling, not an oversight.
- The delete never crosses the page boundary: another page's rows of the same author are untouched.

### Delete exactly one note (ruling `A181`)

- `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` deletes **exactly one row**, named by the upsert triple `(page_id, author_id, id)` of ruling `A155`. The predicate is the whole primary key, so the reach is one row by construction.
- The answer is `{"deleted": 1}` when the row existed and was removed, and `{"deleted": 0}` when it did not. **A missing row is not an error**: the request's goal - "this note is not on the server" - is already true, so a retried or duplicated delete answers `200` rather than `404`.
- Removing one note leaves the same author's other notes on that page **byte-identical**, leaves every other author's notes untouched (including a note of another author that carries the same `id`), and never crosses the page boundary.
- `note_id` in the path is judged by the same rule as `notes[i].id` in a body: non-empty after trimming, valid UTF-8, at most 64 code points. A `400` names the field `note_id`, which is what the client sent.
- **The existing page-scoped delete of `A156` keeps its behaviour**: `{"deleted": N}` for every row of that author on that page. The two endpoints sit on different patterns and never compete.
- **This is why `POST` did not change.** Making `POST` delete whatever the body omits would turn every sync into a destructive replace: a client syncing from a stale state would delete notes it simply does not know about. `POST` stays the non-destructive upsert of `A155`.
- The extension's use of the endpoint (delete the reader's own note locally, then here; no call for a foreign note; no call when synchronization is off) is owned by `docs/specs/sync-integration.md`.

### All-pages hook (ruling `A157`)

- `GET /notes/author/{author_id}/all-pages` returns one author's notes across all pages, ordered by `updated_at` descending (newest first), then `page_id` and `id` ascending to break ties.
- `limit` defaults to `50` and is clamped to `200`; `offset` defaults to `0`. A malformed or negative value is a `400`.
- It is implemented and tested, but nothing in the extension calls it in this stage: it is a contract for a future "my notes" view.

### Validation (ruling `A158`: no authentication is not no validation)

The server refuses a body that could corrupt the table, with `400` and `{"error": "..."}`, and writes nothing:

- every request-derived string is **valid UTF-8** (ruling `A159`): the path segments `page_id` and `author_id`, the note fields `id`, `text` and `comment`, and the whole request body before it is decoded;
- `author_id` non-empty after trimming, at most 64 code points;
- `id` non-empty after trimming, at most 64 code points (`notes[i].id` in a body, `note_id` in the path of the single-note delete);
- `comment` at most 256 code points (code points, not bytes: 256 Cyrillic characters are 512 bytes);
- `text` non-empty after trimming;
- `anchor` present, valid JSON and not `null`;
- at most 20 notes per request;
- `page_id` non-empty and at most 2048 code points.

An unknown JSON field, an empty body, a non-object body and a body over 1 MiB are also `400`.

#### UTF-8 rule (ruling `A159`) and the `400`-before-store guarantee (ruling `A160`)

- **PostgreSQL's `TEXT` columns are UTF-8.** A non-UTF-8 string therefore has only two possible fates: PostgreSQL rejects the statement (`500`, SQLSTATE 22021) or `encoding/json` has already repaired the bytes and the table silently stores `U+FFFD`. Both are refused by validation instead.
- **One decision, one function.** `model.RequireValidUTF8(field, value []byte) error` is the single owner of "is this valid UTF-8" (it calls `utf8.Valid`). Every validator calls it; there is no second copy of the rule. It takes bytes so that a body can be judged before it is decoded.
- **The body is judged before it is decoded.** `encoding/json` replaces an invalid byte inside a JSON string with `U+FFFD` instead of failing, so a check that runs after `Decode` can never see the client's mistake. `api.decodeJSON` reads the raw body, calls `model.RequireValidUTF8("body", raw)` and only then decodes. A body with invalid bytes anywhere (including in a field the server does not know) is `400` with the field `body`.
- **Path segments are judged where they arrive.** `model.ValidatePageID` and `model.ValidateAuthorID` call the same helper, so an invalid page or author in the path is `400` naming `page_id` / `author_id`, never the `500` of a PostgreSQL encoding error.
- **Note fields name themselves.** `model.ValidateSaveRequest` calls the same helper per note field, so a directly-constructed request with an invalid `id`, `text` or `comment` is `400` with the field `notes[i].<field>`. On the HTTP path the raw-body check above answers first with `body`; both levels are the same rule.
- **The rejection happens before the store is called (ruling `A160`).** A POST that fails validation writes **zero** rows - not "the valid notes of the batch". The write path stays all-or-nothing.
- **`500` stays for genuine storage failures (ruling `A161`).** The `{"error": "storage failure"}` branch is narrowed, not removed: a database outage, a lost connection or a broken statement is still a `500`, and only validation answers `400`.

### Security posture

- No authentication, no accounts, no tokens, no rate limiting. Every request is accepted (ruling `A158`).
- CORS is permissive (`Access-Control-Allow-Origin: *`, methods `GET, POST, DELETE, OPTIONS`) so a future content script can call the server from a page origin, and `OPTIONS` answers `204` rather than `405`.
- Consequence, stated once and not hidden: anyone who can reach the port can read every note on every page and delete any author's rows by naming that author. The server is an explicitly unauthenticated personal sync service, and the deployment is expected to be reachable only from a trusted network.

### Schema

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

The primary key is the triple, never `id` alone: two authors may use the same `id`, and one author's `id` must never overwrite another's row.

### API contract

Base path `/notes`. All responses are JSON; errors are `{"error": "..."}` with a matching status.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/notes/page/{page_id}` | — | `200` `{"notes": [...]}` |
| `POST` | `/notes/page/{page_id}` | `{"author_id": "...", "notes": [...]}` | `200` `{"saved": N}` |
| `DELETE` | `/notes/page/{page_id}/author/{author_id}` | — | `200` `{"deleted": N}` |
| `DELETE` | `/notes/page/{page_id}/author/{author_id}/note/{note_id}` | — | `200` `{"deleted": 1}`, or `{"deleted": 0}` when the row is absent (`A181`) |
| `GET` | `/notes/author/{author_id}/all-pages?limit=&offset=` | — | `200` `{"notes": [...]}` |
| `GET` | `/health` | — | `200` `{"status": "ok"}`, or `503` when the database is unreachable |

One note as stored and returned:

```json
{
  "id": "aaaa1111",
  "page_id": "https://example.com/article?b=2&a=1",
  "author_id": "Анна",
  "text": "selected text",
  "comment": "note body, <= 256 chars",
  "anchor": {"text": "...", "prefix": "...", "suffix": "...", "fragmentCount": 1},
  "created_at": "2026-11-19T12:00:00Z",
  "updated_at": "2026-11-19T12:00:00Z"
}
```

`created_at` and `updated_at` are RFC 3339 in UTC. Go's JSON encoder HTML-escapes `&` as `\u0026`; it decodes back to `&`, so `page_id` is exact after parsing.

## Edge Cases

- **`page_id` with reserved characters.** `/`, `?`, `&` and `#` are carried percent-encoded by the client and decoded by the router; a near-miss key (`origin + pathname` of a key that carries a query) is a **different** page, because the server does not normalize (`A153`).
- **Two authors, one `id`.** Two rows on the same page; the second author's POST does not touch the first author's row (`A155`).
- **One author re-posting a subset.** Rows absent from the request survive; only the endpoint of `A156` deletes.
- **Deleting a note that is not there.** `{"deleted": 0}` with `200`, never `404`: deleting twice is not a failure (`A181`).
- **Deleting one note while the author has more.** Only the named triple goes; the author's other notes on the page and every other author's notes stay as they were (`A181`).
- **Two authors, one `id`, one delete.** Deleting `(page_id, author_id, id)` reaches that author's row only; the other author's row with the same `id` survives (`A155`, `A181`).
- **Empty note list.** `{"author_id": "...", "notes": []}` is a valid `200` with `saved: 0`: the author has nothing new to say.
- **Unknown author or page.** `GET` returns an empty `notes` array with `200`, never `404`. Absence of notes is not an error.
- **Database down at startup.** The server retries for up to 60 seconds and then exits non-zero; `docker compose` restarts it.
- **Database down while serving.** `/health` returns `503`; the note endpoints return `500` with a JSON error and no partial write.
- **`anchor: null`.** Refused with `400`, unlike any other valid JSON scalar: the brief makes `anchor` required and a `null` anchor cannot re-anchor.
- **`limit` beyond the row count.** An empty array, not an error: `offset` past the end is a valid, empty page.
- **`comment` of exactly 256 code points.** Accepted; 257 is refused. The cap counts code points, matching the extension.
- **Invalid UTF-8 in a path segment.** `400` naming `page_id` or `author_id`, never the `500` of a PostgreSQL `22021` encoding error (`A159`). Reproduced live with `GET /notes/author/%C0%ED%ED%E0/all-pages`, which used to answer `{"error":"storage failure"}` with status `500`.
- **Invalid UTF-8 in a JSON body.** `400` with the field `body` and **zero rows written** (`A160`), never `200` with the row stored as `U+FFFD`. Reproduced live with a POST whose `author_id`, `text`, `comment` or `id` carried Windows-1251 bytes: `encoding/json` repairs them to `U+FFFD`, so the check must run on the raw bytes before decoding.
- **Database reachable but refusing a statement.** Still a `500` with `{"error":"storage failure"}` (`A161`): the fix narrows when that branch is reached, it does not remove it.
- **Non-UTF-8-safe body.** A body that is not valid JSON is `400` before any rule runs, so a broken client cannot reach the table. A body that is valid JSON but not valid UTF-8 is also `400` (the raw-bytes check above), which is the stricter of the two.

## Acceptance Criteria

1. `server/` exists with the briefed layout (`go.mod`, `go.sum`, `cmd/server/main.go`, `internal/api/`, `internal/store/`, `internal/model/`, `migrations/`, `Dockerfile`, `docker-compose.yml`, `README.md`, `.env.example`) and `go.mod` module path `inlinenotes/server`.
2. `docker build server/` succeeds and the final image is smaller than 40 MB.
3. `docker compose up -d` in `server/` brings up server and postgres, both healthy, and `GET /health` returns `200 {"status":"ok"}`.
4. The server creates its schema on start; a second start does not fail (idempotent migration).
5. `POST /notes/page/{page_id}` with two notes stores two rows; re-posting the same request leaves two rows with `updated_at` moved forward and `created_at` unchanged.
6. Two authors posting the same `id` on the same page produce two rows (`A155`).
7. `GET /notes/page/{page_id}` returns both authors' notes and only that page's notes.
8. `DELETE /notes/page/{page_id}/author/{author_id}` removes exactly that author's rows on that page and leaves the other author's rows, and other pages, untouched (`A156`).
8a. `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` deletes exactly that one row and answers `{"deleted": 1}`, or `{"deleted": 0}` when no such row exists, while the same author's other notes on the page and every other author's notes stay byte-identical (`A181`).
9. `GET /notes/author/{author_id}/all-pages` returns that author's notes across pages, newest first, honoring `limit` and `offset` (`A157`).
10. A body with a `comment` longer than 256 characters, an empty `author_id`, more than 20 notes, or an invalid `anchor` is rejected with `400` and a JSON error, and nothing is written.
11. A `page_id` containing `/`, `?`, `&` and `#` survives the round trip through the path segment (`A153`).
12. `go test ./...` passes inside the container; the tests cover the store layer against a real PostgreSQL (not a mock) and the handlers.
13. `server/README.md` documents the run commands, the API and the "no authentication" posture.
14. No file outside `server/` changes except `docs/specs/sync-server.md`, `docs/specs/INDEX.md`, `AGENTS.md`, `README.md` and `docs/state/`.

### Test mapping

| AC | Test |
|---|---|
| 4 | `store.TestMigrateIsIdempotent` |
| 5 | `store.TestSaveNotesInsertsRows`, `store.TestSaveNotesSecondPostKeepsCreatedAtAndMovesUpdatedAt` |
| 6 | `store.TestTwoAuthorsMayShareOneNoteID` |
| 7 | `store.TestNotesForPageReturnsBothAuthorsAndOnlyThatPage`, `api.TestPostThenGetRoundTrip` |
| 8 | `store.TestDeleteRemovesOnlyTheNamedAuthorsRows`, `api.TestDeleteReportsTheAuthorsRowCount` |
| 8a | `store.TestDeleteOneNoteRemovesExactlyThatRow`, `store.TestDeleteOneNoteAnswersZeroWhenTheRowIsAbsentAndIsRepeatable`, `store.TestDeleteOneNoteLeavesTheAuthorsOtherRows`, `store.TestDeleteOneNoteLeavesOtherAuthorsAndOtherPages`, `store.TestPageDeleteStillRemovesEveryRowOfTheAuthor`, `api.TestDeleteOneNoteReportsOneWhenTheRowExisted`, `api.TestDeleteOneNoteAnswersZeroForAMissingRowAndIsRepeatable`, `api.TestDeleteOneNoteLeavesEveryOtherRowAlone`, `api.TestPageDeleteStillReportsEveryRowOfTheAuthor`, `api.TestDeleteOneNoteValidatesItsThreeSegments`, `api.TestDeleteOneNoteSurvivesTheReservedCharactersInThePath`, `api.TestPostStillDoesNotDeleteAfterTheSingleNoteEndpoint`, `model.TestValidateNoteID*` |
| 9 | `store.TestNotesForAuthorAllPagesNewestFirstWithLimitAndOffset`, `api.TestAllPagesHonoursLimitAndOffset`, `api.TestAllPagesDefaultsLimitAndRejectsBadPaging` |
| 10 | `api.TestValidationRejectsBadBodies`, `api.TestValidationAcceptsExactlyTheCaps`, `model.TestValidateSaveRequest*` |
| 11 | `api.TestPageIDWithReservedCharactersSurvivesThePath`, `api.TestPageIDIsNotNormalized`, `store.TestPageIDSurvivesVerbatimThroughTheStore` |
| 12 | `docker compose run --rm test` → `go test ./...`, 103 tests, 0 skips |

### Test mapping — the UTF-8 rule (`A159`-`A161`, brief `t16-02`)

| Rule | Test |
|---|---|
| the helper is `utf8.Valid` and the fixture really is invalid | `model.TestNotUTF8FixtureIsReallyInvalidUTF8`, `api.TestRawBodyFixtureCarriesTheInvalidBytesVerbatim` |
| an invalid `page_id` in a path is `400` naming `page_id` | `api.TestGetPageNotesRejectsInvalidUTF8InThePath`, `api.TestGetPageNotesRejectsRawInvalidUTF8InThePath` |
| an invalid `author_id` in a path is `400` naming `author_id` | `api.TestAllPagesRejectsInvalidUTF8Author`, `api.TestDeleteRejectsInvalidUTF8Author` |
| every note string is checked and names `notes[i].<field>` | `model.TestValidateSaveRequestRejectsInvalidUTF8InEveryNoteField`, `model.TestValidateSaveRequestNamesTheOffendingNoteIndex`, `model.TestValidateSaveRequestRejectsInvalidUTF8Author` |
| an invalid body is `400` and writes zero rows (`A160`) | `api.TestSaveRejectsInvalidUTF8BeforeTheStore`, `api.TestSaveRejectsInvalidUTF8InTextBeforeTheStore` |
| the Cyrillic happy path keeps working | `model.TestValidateSaveRequestAcceptsCyrillicEverywhere`, `api.TestPostAcceptsCyrillicBodyAndPath` |
| a genuine storage failure is still `500` (`A161`) | `api.TestGenuineStorageFailuresStillAnswerFiveHundred` |

The store suite runs against a real PostgreSQL; the validator and handler suites are pure and run everywhere.

The store tests skip when `TEST_DATABASE_URL` is empty, so `go test ./...` also builds and runs on a machine with no database. AC 12 is claimed only from the run where the variable is set.
