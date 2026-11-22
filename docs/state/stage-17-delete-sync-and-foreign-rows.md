# t17-06 — one-note delete on the server, and foreign rows that actually reach the popup

## Defect 1 — a deleted note stays on the server (the user found it)

The user: «При удалении своей заметки и синхронизации запись остаётся на сервере и удаляется только
локально.»

Measured in the code:

| Path | What it does today | Server |
|---|---|---|
| `removeEntryFromPage` (`src/content/editor/edit-entry.ts:201`) — the editor's delete | `deleteEntry(port, { url, id })`, one note, local | **never called** |
| `removeAllOfAuthor` (`src/popup/page-entries-service.ts:401`) — the popup row's delete | one core call, local | **never called** |

And the server's `POST` cannot fix it: `SaveNotes` (`server/internal/store/store.go:123`) is an
upsert with `ON CONFLICT … DO UPDATE`. A note absent from the body is **not** removed, so a note the
reader deleted locally comes back on the next `GET`.

The user chose **option A**: delete that one note on the server.

### Ruling A181 — a new endpoint deletes one note

`DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` removes exactly one row. The
existing `DELETE /notes/page/{page_id}/author/{author_id}` stays as it is: it removes the author's
whole page, which is what the popup's row delete needs.

Why a new endpoint and not a change to `POST`: making `POST` delete whatever the body omits turns
every sync into a destructive replace. A client that syncs from a stale state would delete notes it
simply does not know about. The user rejected that reading by choosing A.

### Ruling A182 — the extension calls it when the reader deletes a note

When the reader deletes **their own** note, the extension deletes it locally and then calls the new
endpoint for that note. The order is local first: the page must react immediately, and a failed
server call must not undo the reader's action.

- Deleting a **foreign** note is unchanged: local only, no server call (`A168`).
- When synchronization is off or the address is empty, no call is made (`A166`).
- A failed server call is **not silent**: the note is gone locally and the page reports that the
  server still holds a copy. The wording is Russian and lives in the content text module.
- The popup's row delete (`removeAllOfAuthor`) keeps calling the page-scoped endpoint it already
  has, because that control means "this author's notes on this page".

## Defect 2 — foreign notes never reach the popup (the PM found it)

The user: «в попап окне не отображаются чужие заметки, но отображаются только на странице. Нужно их
отображать и иметь возможность удалить их локально из хранилища страницы.»

The wiring looks complete and the PM could not reproduce it live: the popup bundle contains the
channel, the message name and `chrome.runtime.sendMessage`, the content script registers the
listener, and `PAGE_ENTRIES_SOURCE` supplies `page: createPageNotesChannelSource()`. The PM's
`chrome_devtools` session drives a **different** Chrome instance from the one holding the unpacked
extension, so the live path cannot be exercised from here. **This defect is diagnosed, not
reproduced** — and the diagnosis must be confirmed by the reader before the fix is accepted.

### The three candidate causes, in the order they should be checked

1. **The listener is registered after the popup asks.** The popup queries on open; the content
   script attaches the listener inside `boot()`. On a page that was already open when the extension
   was reloaded, the content script may not be running at all, and a `chrome.runtime.sendMessage`
   with no listener **rejects**. The channel reads a rejection as "no rows" — which is exactly the
   symptom. `src/content/main.ts:211` guards the subscription in a `try`, and a frame without the
   runtime API answers no rows.
2. **The page holds no foreign notes at the moment of the question.** The automatic load runs after
   the first paint (`sync.afterPaint`). A popup opened before that load finishes asks a page whose
   memory is still empty.
3. **The answer is dropped at the boundary.** `isQueryResult` validates the shape; a mismatch
   answers the empty result rather than rows.

### Ruling A183 — the popup must not depend on a single question at open

The popup asks again when the answer it holds is empty and the page may still be loading, and it
re-asks when the content script announces that its foreign list changed. The mechanism is a message
from the page to the popup (`chrome.runtime.sendMessage` from the content script, which the popup
listens for while it is open), so a list that arrives late still reaches a popup that is already
open. No polling, no timer.

### Ruling A184 — a foreign row is deletable from the popup, locally

The popup's foreign row keeps the delete control it already has, and pressing it removes that
author's notes from the page's memory for this tab. The server is not called (`A168` unchanged).

The user's words add one thing the current code does not do: the row must be **visible in the popup**
at all. That is `A183`'s job, not a new control.

## Acceptance criteria

### Server (`server/`)

1. `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` deletes exactly that one row and
   answers `{"deleted": 1}`, or `{"deleted": 0}` when no such row exists.
2. Other notes of the same author on the same page are untouched.
3. Notes of other authors are untouched.
4. The existing page-scoped delete keeps its behaviour: `{"deleted": N}` for every note of that
   author on that page.
5. `go test ./...` passes against a real PostgreSQL, with cases for all four.
6. `server/README.md` and `docs/specs/sync-server.md` document the new endpoint.

### Extension (`src/`)

7. Deleting the reader's own note calls the new endpoint with that note's id (`A182`).
8. Deleting a foreign note calls no endpoint (`A168`).
9. With synchronization off or an empty address, no call is made (`A166`).
10. A failed server call leaves the note deleted locally and reports that the server still holds a
    copy, in Russian, from the content text module (`A182`).
11. The popup asks the page again when its answer is empty and the page may still be loading, and
    re-asks when the page announces a change (`A183`).
12. A foreign row is rendered in the popup and its delete removes it locally without a server call
    (`A184`).
13. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
    `node scripts/check-agent-config.mjs`, plus the server's `docker build`, `go vet`, `go test`.
    The test count only grows.

## What must not change

- `A163` — foreign notes stay in memory and never reach `chrome.storage.local`.
- `A168` — a foreign row's controls are local only.
- `A166` — no request when synchronization is off.
- The rename rule (`A173`, `A174`).
- `POST` stays a non-destructive upsert (`A155`).

## Constraints

- Two commits: one for `server/`, one for the extension. The server change must be accepted before
  the extension depends on it.
- Run every gate and report the real exit codes.
- Restore anything you mutate from a copy, never with `git checkout`.
- Report to `docs/state/t17-06-engineer.md`, committed with the code.

## Open question the PM cannot answer alone

`A182` says a failed server delete is reported to the reader. The wording is new Russian text on the
content surface, and the project allows exactly one string per new state. The engineer proposes the
sentence in the report and the PM approves it before the spec is written as fact.

---

## Answers (owner, 2026-11-19): «запускай. везде дефолт»

1. **The failure wording** (`A182`): the default stands — «**Заметка удалена здесь, но на сервере
   осталась**». One string, in the content text module, for the one new state.
2. Everything else in the brief is accepted as written, including `A183` and `A184`.

## The diagnosis the PM could confirm without the extension

The PM could not run the extension — the Chrome instance he was given has **no extension loaded**:
`Target.getTargets` returns 10 targets, none of them `chrome-extension://`, and
`chrome.runtime` is `undefined` on the ScienceDirect page. So the live path was not exercised.

The defect was instead localised by reading the shipped code, and **two mechanisms explain the
symptom** — «заметки видны на странице, но не в попапе»:

1. **The listener answers only after the server load finishes.** In
   `src/content/sync/page-notes-channel.ts` the ask path is
   `void loadOnce().then(() => respond(answerOf()))` with `return true`. A popup that opens while the
   load is still running waits for it, and the popup asks **once** — so a slow load and a fast popup
   produce an empty list that is never refreshed.
2. **A page opened before the extension was reloaded has no content script at all.** Then
   `chrome.runtime.sendMessage` rejects, `send` (`src/popup/page-notes-channel.ts:87`) reads the
   rejection as "no rows", and the popup renders nothing.

Mechanism 1 is the one the reader's report points at: the notes **did arrive** and were painted on
the page, so the load succeeded — the popup simply asked before it finished. `A183` addresses it.

The PM states this as a **diagnosis, not a reproduction**, and the fix must be verified by the reader
in a Chrome that has the extension loaded.
