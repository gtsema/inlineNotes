# t17-14 — engineer report: a switched-off foreign author persists across reloads

Brief: `docs/state/t17-14-hidden-authors-persist.md` (rulings `A187`–`A189`, 11 AC, the reader's
choice `1a`). Spec edited in the same change: `docs/specs/sync-integration.md`.

## What the slice does, in one paragraph

A new stored key `sync-off:v1` holds `{ version: 1, pages: { [pageKey]: string[] } }` — **author
names only**, per page key, first-appearance order, duplicates removed, and a page whose list becomes
empty is removed from the record (the whole key goes when no page is left). What is stored is the fact
«this author is switched off on this page», never the note: no note text, id, anchor or comment is in
the record, and a foreign note is still never written to `chrome.storage.local` (`A163` unchanged;
the new key is named beside it in the spec and in a pin). The automatic load reads the page's list
once and starts those authors' notes at `visible: false`, everyone else at `visible: true` (`A188`),
filtered to the authors the load actually answered with. A press of a foreign row changes the memory,
repaints, answers the popup and then writes the record (`A189`); a delete of a foreign row removes
that author from the record, so the next load shows them again, checked on (the reader's `1a`).

## Files touched

| Path | Change | Ruling |
|---|---|---|
| `src/core/storage-keys.ts` | new constant `SYNC_OFF_KEY = 'sync-off:v1'`, documented beside the other three keys | `A187` |
| `src/core/sync-off-list.ts` | **new** pure module: the record's shape, its decode (`syncOffListFromStorageValue`, `offListOfPage`), the one-page read/write through the port (`loadOffAuthorNames`, `saveOffAuthorNames`), and the list algebra (`uniqueAuthorNames`, `withAuthorOff`, `offListOfLoad`, `authorNamesOf`, `isAuthorOff`) | `A187`, `A188` |
| `src/content/sync/foreign-notes.ts` | `replace(notes, authorName, offAuthors?)` starts a note `visible: false` when its author is on an already-filtered list; `loadIntoMemory` reads the page's list through the new optional `offListPort` and narrows it to the answer's authors | `A188`, `A189` |
| `src/content/sync/page-notes-channel.ts` | wiring takes `port?: StoragePort` and `pageKey: () => string \| null`; the switch branch repaints and answers **first**, then writes the record; the dismiss branch removes the author from the record | `A168` unchanged, `A187`–`A189` |
| `src/content/main.ts` | passes `offListPort: port` to the load and `port` + `pageKey: painter.pageKeyOfPass` to the channel | `A188`, `A189` |
| `docs/specs/sync-integration.md` | Terms row `off list`; Flow 6/7 rewritten; "Hiding and deleting a foreign row" corrected for `A186`; new section "The off list"; three new Edge Cases; AC 19–23 + test mapping | AC11 |
| `tests/core-sync-off-list.spec.ts` | **new**, 14 cases | `A187`, `A188` |
| `tests/content-sync-notes.spec.ts` | +8 cases: the load applies the off list | `A188` |
| `tests/content-page-notes.spec.ts` | +9 cases: the press writes the record, the delete clears it; one pin **rewritten** | `A187`–`A189` |
| `tests/toolchain-contract.spec.ts` | +1 pin: `A163` named with the new key | AC9 |

### Assertions rewritten, and the ruling that ordered each

1. **`tests/content-page-notes.spec.ts` → "offers no handle for a storage write: the module holds no
   port at all"** → now **"reaches no storage API and writes no note: the record is the off list, not
   a note (A163, A187)"**. The old case asserted `expect(source).not.toMatch(/StoragePort/)` on
   `page-notes-channel.ts`, i.e. that the channel could not write anything. `A187` orders the press
   of a foreign row to write the record, so the channel must hold a port; the pin keeps the two
   things `A163` protects — no `chrome.storage` call in the module, no entry-write import — and no
   longer claims the absence of a port.
2. **`tests/content-page-notes.spec.ts` → `attach()` helper** gained the optional `port` and
   `pageKey` seams (a wiring change, not a claim change); the channel test file's cases otherwise
   stand as they were.
3. **`tests/content-sync-notes.spec.ts` → the "AC7 foreign notes are memory only" cases** were left
   as they were; the new load cases live in their own describe. The `Object.keys(memory)` shape
   assertion still passes unchanged: the memory gained no operation.

No assertion was weakened to get green. Two of the new pins are the teeth of the `1a` choice: the
delete writes nothing when the author was not off, and a stored name the page no longer holds is
dropped by the next press.

## Acceptance criteria, line by line

| AC | Verdict | Evidence |
|---|---|---|
| 1 — a press writes the author under the page key, checking back removes them, an empty list removes the page's entry | **met** | `tests/core-sync-off-list.spec.ts` → "adds a name, removes it again, and removes the page when nothing is left" (asserts the stored value after each write, and `{ op: 'remove', keys: ['sync-off:v1'] }` when the last name leaves) and "is idempotent…"; `tests/content-page-notes.spec.ts` → "records the author on the press off, and removes them on the press on", "keeps another page's list when this page's list changes" |
| 2 — no note text, id, anchor or comment in `sync-off:v1`, by reading the value **and** by a scan of the writing module | **met** | `tests/content-page-notes.spec.ts` → "writes author names only: the stored value carries no note" (the stored value is compared to `{ version: 1, pages: { 'https://example.com/a': ['Вася'] } }` and scanned for `their note`, `selected text`, `their001`, `anchor`, `comment`); `tests/core-sync-off-list.spec.ts` → "writes nothing but the author name it was given, whatever the row held" (code-only scan of `src/core/sync-off-list.ts` for `comment`, `anchor`, `createdAt`, `updatedAt`, `text`, plus the same scan of the stored value); `tests/toolchain-contract.spec.ts` → "keeps every foreign note out of storage, and names the one key that is stored" (`\bcomment\b`, `\banchor\b`, `\btext\b`, … absent from the module's code) |
| 3 — a stored list starts its authors' notes at `visible: false` and every other note at `true` | **met** | `tests/content-sync-notes.spec.ts` → "starts the named authors off and everybody else on (AC3)" (per-author, two notes of one author, and the `paintInput()` flags that make the note absent per `A186`) |
| 4 — a first load starts **every** note visible | **met** | `tests/content-sync-notes.spec.ts` → "starts every note visible on a first load, when the record names nobody (AC4)", including the "no port at all" case |
| 5 — deleting a foreign row removes that author from the list, so the next load shows them | **met** | `tests/content-page-notes.spec.ts` → "removes the author from the record on delete, so the next load shows them (1a)" (record becomes `{ pages: { [PAGE_KEY]: ['Петя'] } }`, memory keeps only `Петя`, `a.loads() === 0` so the server was not called) and "writes nothing at all when the deleted author was not switched off"; the reload half is AC4's and AC3's combined behaviour of `replace` over the narrowed list |
| 6 — the list is filtered to the authors the load answered with | **met** | `tests/content-sync-notes.spec.ts` → "narrows the list to the authors the answer named, so a departed name does not survive (AC6)"; `tests/content-page-notes.spec.ts` → "drops a stored name the page no longer holds when the reader presses another one"; `tests/core-sync-off-list.spec.ts` → "drops a name the load did not return, and keeps the order of the answer" |
| 7 — a malformed value is an empty list and never throws | **met** | `tests/core-sync-off-list.spec.ts` → "never throws on a value that is not the record" (13 malformed shapes, each asserted `[]` + `malformed: true`), "keeps the readable half of a partly damaged record", "never throws and never writes when the port refuses the read"; `tests/content-sync-notes.spec.ts` → "reads an unreadable record as an empty list and never throws (AC7, A187)" |
| 8 — the memory is not re-read on a switch; the press moves the memory and the record in that order, and the paint pass follows the memory | **met** | `tests/content-page-notes.spec.ts` → "keeps the memory as the truth: the press reads the record, it never re-reads the notes (A189)": the answered state and `handed[0] === memory.paintInput()` are the switched-off list, `a.loads() === 0` proves no load ran, and the write happens after `respond`. Structurally, the press path calls `loadOffAuthorNames` only to merge the record, never `replace` on the memory |
| 9 — `A163` holds unchanged; the pin stays green; the new key is named beside it | **met** | `tests/toolchain-contract.spec.ts` → "keeps every foreign note out of storage, and names the one key that is stored (ruling A163, A187)": `modulesHoldingLiteral('sync-off:v1')` is exactly `['src/core/storage-keys.ts']`, `importersOf('SYNC_OFF_KEY')` is exactly `['src/core/sync-off-list.ts']`, the memory module writes no note (`port.set(`/`port.remove(`/`chrome.storage` absent). `tests/content-foreign-notes.spec.ts`, `tests/content-sync-notes.spec.ts` "foreign notes are memory only" and the popup/options pins all still green (1303 tests, 0 failures) |
| 10 — every gate green, test count only grows | **met** | `npm run build` exit **0**; `npm test` exit **0** — **1303** tests in **59** files, up from **1273** in 58; `npm run typecheck` exit **0**; `node scripts/check-agent-config.mjs` exit **0** (0 errors, 0 warnings, 213 infos) |
| 11 — `docs/specs/sync-integration.md` states the off list, what it holds, and that a deleted row comes back switched on | **met** | new section "The off list (rulings `A187`, `A188`, `A189`)", Terms row `off list`, Flow 6/7 and the Edge Case "An author switched off, then deleted", AC 19–23 and their test mapping |

`A168` unchanged: neither operation calls the server (`a.loads() === 0` in both the switch and the
dismiss cases), and the popup's half is untouched — the message shape is the one it already sends.
`A186` unchanged: an off note is `visible: false` in the paint input, which the pass skips (the
existing `tests/content-foreign-notes.spec.ts` `A186` cases stay green). The server, the manifest and
the reader's own notes are untouched (`git diff --stat` touches neither `server/` nor
`src/manifest.json`).

## Commands run, with real exit codes

```
$ npm run build
[build] dist/ is a self-contained MV3 folder (12 files)
exit 0

$ npm test
Test Files  59 passed (59)
     Tests  1303 passed (1303)
exit 0

$ npm run typecheck
> tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit
exit 0

$ node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 213 info(s)
exit 0
```

The build ran **first**, in the order `A62` fixes. Test count before this slice: 1273 / 58 files;
after: 1303 / 59 files — it only grew.

## Open questions / deviations to report

1. **The filtered list is not written back by the load.** `A188` says the list the load applies is
   filtered to the authors the load answered with; it does not say the narrowed list is persisted.
   I read `A187`'s "**nothing else writes it**" strictly and **only the press writes** (switch and
   delete). The visible behaviour of AC6 is identical — a departed name is never applied and can
   never re-hide anybody — but the stale name survives in storage until the reader's next press on
   that page. If the PM wants the load to prune the record as well, that is one line in
   `loadIntoMemory` (`saveOffAuthorNames` after `offListOfLoad`), and it would need `A187`'s "nothing
   else writes it" narrowed.
2. **The page key the record is filed under comes from the paint pass**
   (`painter.pageKeyOfPass`, read per press). It is `null` before the first pass, and then nothing is
   stored — the same `null` the load seam already answers `sync_off` for. No new rule was added for
   that case.
3. **A storage failure on a press is silent** (no Russian string was added, because a popup row has
   no line to report one). The memory and the page keep the reader's choice; only its survival
   across a reload is lost. This is a deliberate default, not a spec line — flag it if the reader
   wants a message.