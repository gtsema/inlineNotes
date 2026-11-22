# t17-06, part 1 — the server: `DELETE …/note/{note_id}` (ruling `A181`)

Scope: `server/` plus `docs/specs/sync-server.md`. Nothing under `src/`, `tests/`, `scripts/`,
`package.json` was touched. One commit. The extension half (`A182`–`A184`, AC 7–12) is a separate
task and is **not** part of this report.

## What was built

| File | Change |
|---|---|
| `server/internal/store/store.go` | `DeleteOneNote(ctx, pageID, authorID, noteID) (int, error)` — one `DELETE … WHERE page_id AND author_id AND id`, returns `RowsAffected`. The predicate is the whole primary key, so the reach is one row by construction. |
| `server/internal/api/server.go` | handler `handleDeleteOneNote` on `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}`; `NoteStore` gained `DeleteOneNote`; register comment explains why the two DELETEs never compete. |
| `server/internal/model/note.go` | `ValidateNoteID` — the path's `note_id` goes through the same `validateRequiredRunes(…, MaxIDRunes)` rule as `notes[i].id`, but the `400` names `note_id` (the field the client actually sent). |
| `server/internal/store/store_test.go` | 5 new tests against a real PostgreSQL. |
| `server/internal/api/server_test.go` | 7 new handler tests plus the fake store's `DeleteOneNote`. |
| `server/internal/model/note_test.go` | 3 new validator tests. |
| `docs/specs/sync-server.md` | new section "Delete exactly one note (ruling `A181`)", flow step 6a, the API contract row, three new edge cases, AC 8a and its test mapping, the `id`/`note_id` validation line, test count corrected `56 → 103`. |
| `server/README.md` | the endpoint in the API table, a `curl` example of both answers, the "`POST` never deletes" reasoning, the `note_id` validation line. |

Deliberately **not** done: `POST` unchanged (it stays the non-destructive upsert of `A155`);
the page-scoped `DELETE …/author/{author_id}` unchanged (`{"deleted": N}` unchanged); no new
migration (the primary key already is the triple); no new dependency; no host-toolchain Go.

A missing row answers `200 {"deleted": 0}`, never `404`: the request's goal — "this note is not on
the server" — is already true, so a retried delete is not a failure. `store.ErrNotFound` /
`writeStoreError` play no part here.

## Commands run (real exit codes)

| Command (cwd) | Exit |
|---|---|
| `MSYS_NO_PATHCONV=1 docker build -t inlinenotes-server ./server` (repo root) | **0** (final image 8 860 228 bytes = 8.4 MiB) |
| `MSYS_NO_PATHCONV=1 docker compose up -d --build` (`server/`) | **0** — `db` healthy, `server` healthy |
| `MSYS_NO_PATHCONV=1 docker run --rm -v …/server:/src -w /src golang:1.25-alpine sh -c 'go build ./... && go vet ./...'` | **0** |
| `MSYS_NO_PATHCONV=1 docker compose run --rm test` (`server/`) — `go test ./...` with `TEST_DATABASE_URL` set | **0** — `ok api`, `ok model`, `ok store` |
| `MSYS_NO_PATHCONV=1 docker compose run --rm test go test ./... -v` | **0** — **103** top-level tests, **103 PASS**, **0 SKIP**, **0 FAIL** (before this task: 56 tests / the spec said 56; the count grew by 26 top-level cases incl. subtests run under their parent) |
| live walk-through against the compose stack (`node /tmp/live_a181.mjs`) | **0** — transcript below |
| `npm run build` (repo root) | **0** — `dist/` 12 files, self-contained MV3 folder |
| `npm test` | **0** — 58 files, **1266 tests passed** |
| `npm run typecheck` | **0** |
| `node scripts/check-agent-config.mjs` | **0** — 0 errors, 0 warnings, 207 info |

Go never ran on the host: every `go` command ran inside `golang:1.25-alpine`.

## AC self-check (AC 1–6 of the brief)

| AC | Verdict | Proof |
|---|---|---|
| **1** — deletes exactly that one row, `{"deleted":1}`, or `{"deleted":0}` when absent | **met** | Live: `2. DELETE one note -> status=200 body={"deleted":1}`; `3. same DELETE again -> status=200 body={"deleted":0}`; `5. unknown note id -> status=200 body={"deleted":0}`. Tests: `store.TestDeleteOneNoteRemovesExactlyThatRow`, `store.TestDeleteOneNoteAnswersZeroWhenTheRowIsAbsentAndIsRepeatable`, `api.TestDeleteOneNoteReportsOneWhenTheRowExisted`, `api.TestDeleteOneNoteAnswersZeroForAMissingRowAndIsRepeatable` |
| **2** — same author's other notes untouched | **met** | Live step 4: after deleting Анна `note-anna-1`, `Анна \| note-anna-2 \| заметка Анны 2` is still there, `AC2 ok … true`. Tests: `store.TestDeleteOneNoteLeavesTheAuthorsOtherRows` (compares the whole table's comments before/after), `api.TestDeleteOneNoteLeavesEveryOtherRowAlone` |
| **3** — other authors' notes untouched | **met** | Live step 4: both Борис rows survive, including `Борис \| note-anna-1` — a note that carries the *same id* as the deleted one. Tests: `store.TestDeleteOneNoteLeavesOtherAuthorsAndOtherPages`, `api.TestDeleteOneNoteLeavesEveryOtherRowAlone`; page boundary covered in both |
| **4** — page-scoped delete keeps `{"deleted": N}` | **met** | Live step 6: `DELETE …/author/Анна -> {"deleted":1}` (the one row she had left), step 7 shows only Борис's 2 rows left. Tests: `store.TestPageDeleteStillRemovesEveryRowOfTheAuthor`, `api.TestPageDeleteStillReportsEveryRowOfTheAuthor` (3 rows → `{"deleted":3}`, and the single-note store call stayed untouched) |
| **5** — `go test ./...` passes against a real PostgreSQL, covering all four | **met** | `docker compose run --rm test` exit **0**, `0 SKIP` in the `-v` run — the store suite really ran (`TEST_DATABASE_URL` is set by the `test` profile, and a missing variable would have printed `--- SKIP`). 5 store tests, 7 handler tests cover AC 1–4 |
| **6** — README and spec document the endpoint | **met** | `server/README.md`: new API-table row, `curl` example with both answers, the "`POST` never deletes" paragraph, `note_id` in the validation list. `docs/specs/sync-server.md`: new "Delete exactly one note (ruling `A181`)" section, flow step 6a, contract row, 3 edge cases, AC 8a + test mapping |

Extra guard beyond the brief: `api.TestPostStillDoesNotDeleteAfterTheSingleNoteEndpoint` and the
live step 8 (`POST` with one note → `{"saved":1}`, Борис still holds 2 rows) pin `A155` — the new
endpoint did not turn `POST` into a destructive replace.

## Live transcript (compose stack, new endpoint)

```
0. GET /health -> status=200 body={"status":"ok"}
1a. POST Анна x2 -> status=200 body={"saved":2}
1b. POST Борис x2 (one shared id) -> status=200 body={"saved":2}
1c. seeded: 4 row(s)
2. AC1 DELETE one note (note-anna-1) -> status=200 body={"deleted":1}
3. AC1 same DELETE again -> status=200 body={"deleted":0}
4. AC2/AC3 left after one delete: 3 row(s)
   АС2 ok (Анна note-anna-2 present): true
   AC3 ok (Борис both present): true
   AC1 ok (Анна note-anna-1 gone): true
5. unknown note id -> status=200 body={"deleted":0}
6. AC4 page-scoped DELETE (author only) -> status=200 body={"deleted":1}
7. AC4 left after the page delete: 2 row(s)  (Борис only)
8a. POST after the deletes (one note only) -> status=200 body={"saved":1}
8b. POST never deletes (A155): 2 row(s)   A155 ok: true
9. invalid note_id in path -> status=400 body={"error":"note_id: must be valid UTF-8; …"}
10a. cleanup Борис -> status=200 body={"deleted":2}
10b. cleaned page: 0 row(s)
```

A first attempt to seed the rows with `curl` from Git Bash failed with a `400`
`body: must be valid UTF-8` — the shell re-encoded the Cyrillic body, not the server. The
walk-through above therefore drives the API from one Node process (`fetch` + `Buffer.from(…, 'utf8')`),
which is also closer to how the extension will call it. Recorded because it is an easy trap for the
next reader.

## Not touched / not changed

- `POST` semantics (`A155`) — unchanged, and now pinned by a test.
- The page-scoped delete (`A156`) — unchanged, and now pinned beside the new one.
- No migration: the primary key `(page_id, author_id, id)` already names one row.
- No new Go dependency; `go.mod`/`go.sum` untouched.
- `src/`, `tests/`, `scripts/`, `package.json`, `package-lock.json`: `git diff --name-only` over
  them returns **0 lines**; the four extension gates were run anyway and all pass.
- The extension-half wording proposed in the brief («Заметка удалена здесь, но на сервере
  осталась») is not this part's code and was not added anywhere here.

## Open questions

None for this part. AC 7–12 (the extension calling this endpoint) belong to the second task and
are not claimed here.