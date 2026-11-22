# t17-14 — a switched-off foreign author stays switched off across reloads

## The reader's request

«если я в попап окне снимаю галку с заметок какого-то автора, то после перезагрузки страницы она
продолжает быть снятой. Если же я загружаю их первый раз или после удаления у себя, то они должны
отображаться».

Three parts, and the third was confirmed by the reader as reading **`1a`**:

1. unchecking a foreign author's row survives a page reload;
2. the **first** load shows the author — nothing is off until the reader turns it off;
3. **deleting** the author's row at the reader's end **removes them from the off list**, so the next
   load shows them again — checked on.

## The conflict this resolves, and how

`A163` says a foreign note lives in this document's memory and is **never** written to
`chrome.storage.local`. A checkbox state that survives a reload has to be stored somewhere, so the
two seem to collide. They do not:

> **What is stored is the fact «this author is switched off on this page», never the note.**

The note still arrives from the server on every load and is never persisted. The stored record is a
list of author names per page key — data this extension owns, not a copy of another reader's notes.
`A163` is therefore unchanged in what it protects: no foreign note reaches storage.

## Ruling A187 — the off list is stored, per page, and it is the only foreign state that is

- New key `sync-off:v1`: `{ version: 1, pages: { [pageKey]: string[] } }`, author names in
  first-appearance order, duplicates removed.
- A page key with an empty list is **removed** from the record, so a page whose authors were all
  switched back on leaves no entry behind.
- The list is written when the reader unchecks a foreign row and when they check it back on.
  **Nothing else writes it**, and no note text, id or anchor is ever part of it.
- The read is defensive like every other stored record: a value that is not the expected shape is
  treated as an empty list, and the extension never throws on it.

## Ruling A188 — the off list is applied at load, and only then

`loadIntoMemory` reads the page's off list and hands it to `memory.replace`, which starts a note
`visible: false` when its author is on the list and `visible: true` otherwise. Consequences, each one
an acceptance criterion:

- **a first load shows everything** — the list is empty, so every note starts visible;
- **a reload keeps what the reader set** — the list still names the author;
- **deleting the row removes the author from the list** (`1a`), so the next load shows them;
- a name on the list that the server no longer returns is harmless: the list is filtered to the
  authors the load actually answered with, so a departed author cannot keep a stale entry alive.

## Ruling A189 — the page's memory stays the truth while the document lives

The stored list is read **once per load**, not on every switch. While the document is open, the
checkbox changes the memory (`A168` unchanged) and the stored list is updated to match; the memory is
what the paint pass and the popup read. A reload is the only thing that re-reads the list.

## Acceptance criteria

1. Unchecking a foreign row writes the author into `sync-off:v1` under the page's key, and checking it
   back on removes them; an empty list removes the page's entry entirely (`A187`).
2. No note text, id, anchor or comment appears anywhere in `sync-off:v1` — asserted by reading the
   stored value and by a scan of the module that writes it (`A187`).
3. A load whose page key has a stored off list starts those authors' notes at `visible: false` and
   every other note at `visible: true` (`A188`).
4. A load with no stored list — the first load — starts **every** note visible (`A188`).
5. Deleting a foreign row removes that author from the stored list, so the next load shows them
   (`A188`, the reader's `1a`).
6. The stored list is filtered to the authors the load answered with, so a name the server no longer
   returns does not survive (`A188`).
7. A stored value that is malformed is treated as an empty list and never throws (`A187`).
8. The page's memory is not re-read from storage on a switch: the reader's press changes the memory
   and the record, in that order, and the paint pass follows the memory (`A189`).
9. `A163` holds unchanged: no foreign note is written to `chrome.storage.local`. The pin that asserts
   it stays green, and the new key is named in the same breath so a reader can see what *is* stored.
10. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
    `node scripts/check-agent-config.mjs`. The test count only grows.
11. `docs/specs/sync-integration.md` states the off list, what it holds, and that a deleted row comes
    back switched on.

## What must not change

- `A163`: foreign notes stay in memory, and the server is the only source of their text.
- `A168`: a foreign row's controls act locally; the server is never called for them.
- `A186`: an off author's note is absent from the page, not dimmed.
- The server, the manifest, and the reader's own notes.

## The one consequence to state plainly

An author who is switched off, then **deleted**, then **returned by the server with new notes** comes
back **switched on**. That follows from the reader's `1a` choice and is recorded here so it is a
decision and not a surprise.

## Verified by the PM after the fix

In the reader's Chrome: uncheck a foreign row, reload the page, and read both halves — the note must
still be absent from `CSS.highlights` and the row must still be unchecked in the popup. Then delete
the row, reload, and confirm the author is back and visible. Finally read `sync-off:v1` out of
`chrome.storage.local` and confirm it holds **author names only**.
