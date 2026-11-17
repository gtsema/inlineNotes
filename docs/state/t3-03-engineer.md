# Engineer report — t3-03 content editor (revived run, attempt 1) — DELIVERED

Slice: `docs/state/t3-03-content-editor.md` — the in-place editor of a painted entry in
the content layer. Revived after the 60-minute timeout of the first pass of run
`75810528-f013-4af7-aab5-c87ff8437cae`.

## 1. Commits

| commit | content |
|---|---|
| `8861e6f refactor(t3-03): retire the unused PaintedEntry.tooltipBox` | carried fix 2: `src/content/paint/paint-plan.ts`, `tests/content-paint-plan.spec.ts`, `src/content/overlay/tooltip-controller.tsx` (doc) |
| `e25ef91 feat(t3-03): in-place editor and delete` | AC1–AC5: 6 new shipped modules, 3 modified content modules, `src/content/main.ts` wiring, `src/content/text.ts`, the spec, 1 new test file (22 cases), 2 widened pin files |
| `14c58a7 test(t3-03): name the AC5 suite after the rule it pins, not a span move` | label-only amendment to the AC5 `describe` title, so the suite name matches §5 instead of implying a span move. HEAD; all gates below were re-measured on it |

`git status --porcelain` after each commit: empty. HEAD is `14c58a7`. The scratch file
`tests/scratch-probe.spec.ts` was deleted before anything was staged and never entered
history.

## 2. AC status (all shipped, all pinned, all green)

| AC | shipped | pinned by | state |
|---|---|---|---|
| **AC1** selecting the text of one's own painted entry opens the editor prefilled with the stored comment; a foreign entry claims the selection and opens **no widget**, so the tooltip stays the only affordance | `overlay/editor-controller.tsx` `openFor`, `editor/painted-selection.ts` | `tests/content-editor-controller.spec.ts` → AC1, 5 cases (prefill + counter + three buttons in order; foreign entry claims and renders no input/label; a boundary-crossing selection is not a claim; collapsed caret and stale entry claim nothing; the claim is answered from the paint pass) | green |
| **AC2** `Сохранить` writes only through core `updateEntryComment` | `editor/edit-entry.ts` `saveEntryComment` | AC2, 3 cases: read back through core `loadEntries`, `comment`/`updatedAt` move, `createdAt`/`authorName`/`text`/`anchor`/`id` do not, port log is exactly `[[entrySlot], [pageIndex]]` with no `remove`; unchanged-comment save keeps `visible`; a `quota` write failure shows the refusal line and keeps the draft | green |
| **AC3** `Отмена`, `Esc`, click outside = one cancel path with no write; no focus steal (`A74`) | `editor-events.ts`, `editor-controller.tsx` `close`, `overlay/editor.tsx` | AC3, 7 cases: a loop over the three cancel actions asserts `port.calls.filter(set\|remove) === []` and the stored comment unchanged each time; a pointerdown inside the host is ignored; scroll closes and `selectionchange` does **not** (`A32` vs `A45`); `document.activeElement` and `shadowRoot.activeElement` unchanged on open; placement follows the card rule and the viewport rule (`A30`, `A65`); an entry the page will not measure at press time is claimed but gets no widget | green |
| **AC4** `Удалить` removes entry, highlight and tooltip at once, no confirmation, no undo (`A44`); no delete affordance for a foreign entry (`A25`) | `editor/edit-entry.ts` `removeEntryFromPage` → core `deleteEntry`; `overlay/editor.tsx` renders no save/delete when `canEdit === false` | AC4, 2 cases (one press removes the own record and leaves the foreign one, `onDeleted` fired, host hidden; a refused removal keeps the editor open with the refusal line) plus the AC1 foreign case (no control rendered at all) | green |
| **AC5** overlap answered on save with the edited entry self-excluded (`A45`) | `editor/edit-entry.ts` (`removeById` on the entry list handed to `findOverlappingEntry`) | AC5, 5 cases: a move onto another entry answers «Выделение пересекается с существующей записью», writes nothing, keeps the editor open with its draft; a re-selection of the entry's own span is a plain save; a free-span re-selection writes comment + `updatedAt` and keeps the anchor (see §5); a re-selection the page cannot resolve answers `selection_lost` with nothing written; the editor is the only shipped delete caller and never opens for a foreign entry | green |

## 3. Gates, quoted

- `npm run build` → `[build] dist/ is a self-contained MV3 folder (10 files)`,
  `[build] dist/content.js (117218 bytes)`.
- `npm test` → `Test Files 38 passed (38)` / `Tests 695 passed (695)`.
- `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 65 info(s)`.
- `npx tsc -p tsconfig.spec.json --noEmit` → no output.
- Measured at the intermediate commit too: after the pin fixes and before the editor test
  file existed, `Test Files 37 passed (37)` / `Tests 673 passed (673)`.

## 4. Carried fixes, answered by number

**Carried fix 1 — AC4/AC5 and Flow 5/Flow 6 of `content-overlay-ui.md` marked shipped by
`t3-03`.** Done in `e25ef91`: the two flows and the two ACs now read shipped, the Terms
table gained `selection claim` and `re-selection`, the `editor` and `pinned tooltip` rows
describe what the code does, and the throw table gained the two editor rows
(`editor/edit-entry.ts` `saveEntryComment`, `overlay/editor-controller.tsx`
`measureEntryBox`). One spec sentence was corrected rather than quietly kept: the
previous run's text claimed a successful re-selection moves the stored `anchor` — see §5.

**Carried fix 2 — fate of `PaintedEntry.tooltipBox` (`src/content/paint/paint-plan.ts:69-77`):
deleted, not consumed.** Committed separately in `8861e6f`. Reason, recorded in the module
header and in `tests/content-paint-plan.spec.ts`: no shipped module read the field; the
tooltip measures its anchor at hover time and the editor at press time, because a box
measured in a paint pass stops describing the text it was measured against as soon as the
page scrolls (`A67`); the per-fragment box **stays** in `PaintedFragment` because that call
is the one that throws — it is where the per-entry answer of `A66` is produced — and
because the hover hit-test and the selection claim read node identity and offsets from it.
The first-box-with-an-area walk now exists in exactly one function,
`placementFragmentBox`, which the card, the editor and the tooltip all call at the moment
they need an anchor. The three old `A67` cases were rewritten to pin the new contract
(no entry-level box; the walk belongs to placement) instead of deleted.

## 5. Deviation and the one open question for the PM (reported, not resolved silently)

The spec sentence written in the first pass said a successful `re-selection` **moves the
stored `anchor`**. It cannot be implemented that way inside this slice: core
`updateEntryComment` takes `comment`, `currentName`, `now` and nothing about spans, and its
own doc states that `pageKey`, `authorName`, `text`, `anchor`, `visible` and `createdAt`
keep their stored values (accepted in `t1-05`, `t1-07`). `src/core/` is out of this brief.

Neither `inline-comment-model.md` ("Overlap" → the moved-range half) nor task AC5 asks for
a move; both ask only that a re-selection in the editor goes through the overlap check with
the edited entry excluded. So the shipped code implements the reading that needs no new
core rule: **a re-selection decides the `overlap` answer and nothing else**, and moving a
note to other words is a delete plus a create. The spec now carries a section
"Open question: what a successful re-selection stores" naming both ways out —
(a) give core an anchor-carrying editor write, which re-opens the `text`/`anchor`
consistency rule of `t1-06`, or (b) rule that the editor owns a comment and a delete only —
and `src/content/editor/edit-entry.ts` says the same at the call site. The behaviour is
pinned by a named test so a future ruling changes a test on purpose.
**This is the only place where shipped behaviour is narrower than a sentence written
earlier, and it needs a PM ruling.**

## 6. Boundary-pin widening (what a reviewer should look at)

- `tests/content-create-card-boundaries.spec.ts`: the core-write pin is now **one module
  per write flow** (`create/create-note.ts`, `editor/edit-entry.ts`), with a second,
  stronger assertion that only those two modules *call* a core write function — the two
  editor widget files appear in the import list because they name the result **type** for
  the refusal line. The page-read pin gained `editor/edit-entry.ts`. The `A52` pin now
  allows `findOverlappingEntry(` in exactly one module and explains why the create path is
  not in the list (core answers inside `createEntryOnPage` from the `spans` it is handed,
  `A46`) and why the edit path is (core `updateEntryComment` takes no spans). The
  fresh-stream locate pin lists `anchor/entry-ranges.ts` and now asserts `≤ 1` stream build
  per module, because that helper takes the caller's stream and cannot build one.
- `tests/content-throw-boundaries.spec.ts`: the shipped-catch enumeration went 12 → 14
  (`editor/edit-entry.ts: 1`, `overlay/editor-controller.tsx: 1`), matching the two new
  spec rows, and a new case pins that the **editor's `submit` and `remove` bodies hold no
  `catch`**, mirroring the existing card case (t3-05 AC3).
- `tests/content-anchor-boundaries.spec.ts` passes again: no shipped source references
  `jsdom`; the shipped comments that named Russian labels were reworded in English.

## 7. Not done (deliberate, and small)

- `tests/content-editor-edit-path.spec.ts` was **not** written. Every rule it would have
  pinned at module level is pinned end-to-end in `tests/content-editor-controller.spec.ts`
  (no-span answer, no-overlap-work, self-exclusion, delete through core), and the two spec
  references that named the missing file were re-pointed at the file that exists. If the
  reviewer wants module-level pins for the edit path, that is a small separate slice.
- `docs/specs/INDEX.md` untouched (docs bookkeeping is the PM's).
- No change to `src/manifest.json`, no popup/options work, no new dependency, no
  `src/core/` change, no `host_permissions` change, no network call.

## 8. Residual risks for the reviewer

1. The open question in §5: if the PM rules (a), the editor's save path and one test change.
2. `editor-events.ts` closes the editor on `scroll` without listening on a scrollable
   element other than `window`; a page that scrolls an inner container would leave the
   editor at stale coordinates until the next press. Same shape as the card's existing rule
   (`A32`), so it is a carried risk, not a new one.
3. The editor is claimed from the **last paint pass**. If a SPA URL change repaints between
   the press and the save, the claim refers to the old pass; SPA handling is `t4-03` and is
   out of this brief.
