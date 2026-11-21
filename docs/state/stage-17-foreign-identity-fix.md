# t17-03 — foreign notes must not become the reader's own when the name changes

## The defect the user found

The user changed the name in settings for a test and found that **other people's notes got
written into the main storage**. Reproduced in the code, not guessed:

| Where | What it does | Why the name change breaks it |
|---|---|---|
| `src/core/entry-rules.ts:127` `isSameAuthor(a, b)` | string comparison of author names | "foreign" is **derived from the current name**, so a name change reclassifies every note |
| `src/content/sync/foreign-notes.ts:119` | skips a remote note when `isSameAuthor(entry.authorName, mine)` | after a rename, a previously foreign note is "mine" and is dropped from memory |
| `src/popup/page-entries-service.ts:381` `routesToPage(authorName, url)` | decides "stored row" vs "foreign row" by name | after a rename, a foreign row routes to the **stored** branch |
| `src/popup/page-entries-service.ts:404` `removeAllOfAuthor` | stored branch calls `deleteEntriesOfAuthor(port, …)` | a foreign row's delete reaches **storage** |
| `src/popup/page-entries-service.ts:386` `setVisibilityForAuthor` | stored branch calls `setVisibleForAuthor(port, …)` | a foreign row's checkbox reaches **storage** |

So the defect is not "a stray write". It is the **identity model**: whether a note is foreign is
computed from the reader's current name, and that name is a mutable user setting. Any rename
silently re-owns other people's notes.

## Why the current model cannot be patched by renaming

`isSameAuthor` is the core identity comparison used by the edit gate, the popup rows, the paint
palette and the sync payload. It is correct for **authorship within one reader's own store** — that
is what `A99` decided. It is wrong for **provenance**: a note that came from the server was never
written by this reader, whatever the reader is called today.

The two questions must be answered by two different facts:

| Question | Correct fact | Current answer |
|---|---|---|
| "Did I write this note?" | the note's author name vs the settings name | same — keep |
| "Did this note come from the server?" | **where the note came from** | the settings name — wrong |

## Ruling A170 — provenance is a property of the note, not of the name

A note's origin is stored on the note itself, at the moment it enters memory, and never recomputed
from the settings name.

- A note loaded from the server's `GET` response is marked **`origin: 'server'`**.
- A note read from `chrome.storage.local` is marked **`origin: 'local'`**.
- A note the reader creates is **`origin: 'local'`** by construction.
- The mark is a field on the in-memory record. It is **not** written to `chrome.storage.local` and
  **not** sent to the server.

Consequences, each one an acceptance criterion:

1. A server note stays foreign **whatever the settings name is**, before or after a rename.
2. A server note is never routed to the stored branch of the popup, so its checkbox and delete can
   never reach storage.
3. A server note is never included in a sync payload, even when its author name equals the settings
   name after a rename — because the payload filters by origin, not by name.
4. A server note whose author name happens to equal the settings name is **still shown as foreign**
   and still not editable. The server's copy of a note the reader also has locally is the one
   duplicate case: the local copy wins and the server copy is dropped, decided by the **id**, not by
   the name.

## Ruling A171 — the popup routes by origin, not by name

`routesToPage` becomes `isFromServer`, reading the row's origin. A row whose notes all came from the
server takes the memory branch; a row whose notes came from storage takes the storage branch. A row
that mixes both cannot exist: a server row is built only from server notes.

## Ruling A172 — a rename must not change what the reader owns

When the settings name changes, the page repaints. Stored notes keep their authorship comparison
(`A99` unchanged) — a stored note whose author name no longer matches becomes read-only, which is
correct and already specified. Server notes keep their origin and stay foreign. Nothing is written
to storage as a result of a rename.

## Acceptance criteria

1. `ForeignNote` (or its replacement) carries an explicit origin mark; a server note is `server`
   and a stored note is `local` (`A170`).
2. A unit test proves a server note whose `authorName` equals the settings name is **still** treated
   as foreign (`A170` consequence 4).
3. A unit test proves a rename does not route a server row to the storage branch (`A171`).
4. A unit test proves `removeAllOfAuthor` on a server row performs **no storage write** — the port
   records zero calls (`A170` consequence 2).
5. A unit test proves `setVisibilityForAuthor` on a server row performs **no storage write**.
6. A unit test proves `syncPayloadOf` excludes a server note even when its name matches the settings
   name (`A170` consequence 3).
7. A unit test proves a rename leaves `chrome.storage.local` byte-identical (no write happens).
8. The existing 1210 tests stay green; the four gates pass; the new tests are additions, not
   replacements.
9. The spec `docs/specs/sync-integration.md` states the origin model in its own section, and the
   sentence "foreign is decided by the author name" is corrected wherever it appears.
10. `docs/specs/inline-comment-model.md` states that authorship (`A99`) is unchanged and that origin
    is a separate fact.

## What must NOT change

- `isSameAuthor` stays the authorship comparison (`A99`). It is not replaced and not weakened.
- The edit gate stays name-based: a stored note whose name no longer matches is read-only.
- The server contract is untouched: no new field on the wire, no migration.
- `chrome.storage.local` gains no field. The origin mark lives in memory only.

## Constraints

- Layer discipline: the origin mark belongs to `src/core/` if it is read by more than one layer;
  otherwise it stays in the layer that owns it. State the choice in the report.
- One commit for the slice; the PM writes the bookkeeping.
- Restore anything you mutate from a copy, never with `git checkout`.

## Gates

```
npm run build
npm test
npm run typecheck
node scripts/check-agent-config.mjs
```

The PM runs all four on the committed tree and reports the exit codes. The report's claims are not
accepted as evidence: the last slice claimed "1210 green" while not compiling.
