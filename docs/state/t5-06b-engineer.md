# `extension-engineer` report — task `t5-06b-carried-fixes` (attempt 1)

Brief read from: `docs/project-profile.md` + `docs/state/t5-06b-carried-fixes.md` (the four `A72` items, five AC, the
`A110` ruling, the `src/`-free boundary, the `A62` gate order).

Tree at start: `c569c63` (clean). Tree at end: `81ad1f1` (clean, **nothing staged**).
Commit chain of this task: `8ece789` (items 1–3, `tests/`) → `81ad1f1` (item 4, `README.md`).
No `src/` file, no behavior spec, no harness file, no state card was touched:

```
git diff --name-only c569c63..HEAD            → README.md, tests/content-cross-tab-refresh.spec.ts, tests/popup-entry-list.spec.ts
git diff --name-only c569c63..HEAD -- src | wc -l       → 0
git diff --name-only c569c63..HEAD -- docs/specs | wc -l → 0
```

## 1. Gates (`A62` order, each `echo "exit=$?"` on the line right after the command, never after a pipe; tails only)

| Gate | Exit | Tail |
|---|---|---|
| `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (10 files)` (independent count: `find dist -type f | wc -l` → `10`) |
| `npm test` | **0** | `Test Files 44 passed (44)` / `Tests 906 passed (906)` |
| `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 113 info(s)` |
| `npm run typecheck` | **0** | `tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit` (no diagnostics) |

Baseline measured before any edit, same order: build 0 / test 0 (**901**, 44 files) / checker 0 (`113` info) /
typecheck 0. Test count moved **901 → 906**: `tests/content-cross-tab-refresh.spec.ts` 17 → 18 (item 1 adds one pin, the
existing one is kept), `tests/popup-entry-list.spec.ts` 41 → 45 (item 3 adds four pins; item 2 rewrote assertions inside
one existing test, so no count change). File count stays 44, so the README count lines were updated to `906 тестов в 44
файлах` — the numeral case was re-read (`901 тест` → `906 тестов`).

## 2. Items by number (`done` + `path:line` at `81ad1f1`)

### Item 1 — done: the page-layer repaint pin now has an aggregate driver, next to the per-entry one

- **Added**: `tests/content-cross-tab-refresh.spec.ts:340` —
  `it('hides and re-shows every highlight of an author from one aggregate author write (`A108`)')`.
  Fixture is the shipped page path already used by this file (three records: two of the reader, one foreign; the real
  `PagePainter` pass onto a recording `PaintSurface`; hand-fired change records — jsdom has no
  `chrome.storage.onChanged`, which is the file's existing seam, no new one).
  What it observes, in order:
  1. `setVisibleForAuthor(port, { url, authorName: OWN_NAME, visible: false })` — **one** core aggregate write — then one
     `fire([slotKey, pages:v1])`: `repaintCount() === 1`, `paintedEntries()` is exactly the foreign entry, and the
     surface holds exactly `[FOREIGN]`, i.e. both of the reader's highlights left the page with no reload;
  2. the same path with `visible: true` + `fire([slotKey])`: `repaintCount() === 2`, all three entries are painted again
     (`paintedEntries()` is the stored order), and the surface holds the three names (asserted sorted: the recording
     surface is a `Map`, so a re-painted name keeps its old insertion position — the paint *order* is not this pin's claim);
  3. all three records are still stored (`slot.entries` length 3): the aggregate hide is not a delete.
- **The per-entry pin was not replaced**: `tests/content-cross-tab-refresh.spec.ts:319` is still the `setVisible` case
  (the card cites it as `:317`; it sits at `:319` now only because this file's header comment grew by two lines).
- Header comment updated at `tests/content-cross-tab-refresh.spec.ts:20-24` to say the AC2 flag case is pinned for **both**
  popup write shapes, and the import at `:50` gained `setVisibleForAuthor`.

### Item 2 — done: the popup group-delete pin now asserts identity for **every** survivor (option A)

- `tests/popup-entry-list.spec.ts:737` — `leaves every other author's record untouched, byte for byte (`A108`)`.
  New body: one `storedRecords(f.port)` read into `survivors` (`:748`), then `toEqual(untouched)` + the id list +
  **three** identity assertions, one per surviving record in stored order: `:755`, `:756`, `:757`
  (`expect(survivors[0]).toBe(untouched[0])` … `survivors[2]`). Before, the test compared with `toEqual` and proved
  reference identity for one of three while its name says "byte for byte".
- Chose the card's first branch (strengthen, not comment-only). The core pin that owns the same claim stays where it is:
  `tests/core-entry-store-write.spec.ts:881` (three `toBe` checks there too). The replacement comment names why three
  checks are the whole claim, so the two files no longer disagree about who proves what.

### Item 3 — done: the empty-author row is pinned as accepted debt (`A110`), no `src/` change

- New `describe('`A110` the empty-author record is pinned inert debt, not a reachable state')` at
  `tests/popup-entry-list.spec.ts:832`, with the ruling rationale in the block comment at `:813-831` (each cited
  producer line was re-grepped: `src/core/entry-store-read.ts:132` checks the **type** of `authorName`, never the value;
  `src/core/entry-rules.ts:127` `isSameAuthor` refuses an empty side; `src/core/entry-store-write.ts:535`
  `authorRecordsOf` therefore never lists such an author; `src/core/entry-store-write.ts:242` normalizes `authorName`
  **behind** `assertCreatable`; `src/popup/popup.component.ts:85` tracks by `row.authorName`;
  `src/popup/page-entries-service.ts:156` is `groupsOf`; `tests/core-settings-store.spec.ts:239` is the settings half).
  Four pins:
  1. `:849` — the record decodes and renders **one row**:
     `rows[0] === { authorName: '', count: 1, isOwn: false, allVisible: true }`, and the row label is the empty-name half
     of the shipped format (`${AUTHOR_ROW_COUNT_SEPARATOR}1`), i.e. the reader really sees a line, not a filtered phantom.
  2. `:865` — **both controls write nothing**: `setVisibilityForAuthor(row.authorName, false)` and
     `removeAllOfAuthor(row.authorName)` answer one row each, `writeLines(f) === []` (no `set`/`remove` call at all), and
     the stored slot still holds one record that is the **same object** (`toBe`) and equal (`toEqual`).
  3. `:887` — two such records are **two rows carrying the same `track` value**: `rows` length 2,
     `authorName` `['','']`, comment naming `src/popup/popup.component.ts:85` as the tracked expression. That is the
     duplicate-key collision recorded as debt, not fixed.
  4. `:905` — the **create path cannot store it**: the shipped call shape of `src/content/create/create-note.ts:157`
     with `currentName` `''`, `'   '`, `'\t'` answers `{ ok: false, code: 'name_required' }` for each, and afterwards
     `set`/`remove` calls are `[]` and `snapshot()[entryStorageKey(PAGE_KEY)]` is `undefined`.
- Non-vacuity proof (throwaway, not committed): two inverted probes in a temporary
  `tests/tmp-mutation-sanity.spec.ts` — "the blank-author controls are not no-ops" failed with `expected 0 to be greater
  than 0`, and "the blank-author row does not render" failed with `expected [ { authorName: '', count: 1, …(2) } ] to
  have a length of +0 but got 1`. Both required failures appeared, so the delivered pins are load-bearing. The file was
  deleted before the commit; `git status --short` is empty and the full suite re-ran green at 906/44 after the deletion.
- No `src/` behavior changed, so the `A110` shape stays reachable only through a hand-seeded store, exactly as the ruling
  states. Nothing in this item needs a `src/` change, so no stop-and-report was triggered.

### Item 4 — done: two stale README sentences, re-read for the claim that replaced the removed one (`A92`)

- `README.md:5-6` — removed: «Записи текущей страницы показаны в попапе одной строкой на автора» (plural subject,
  singular instrument — the number disagreement the `t5-06` review named). Added: «**Каждый автор записей текущей
  страницы показан в попапе одной строкой**; имя автора — в настройках.» Re-read against the code: `groupsOf`
  (`src/popup/page-entries-service.ts:156`) answers one row per author and `src/popup/popup.component.ts:85` renders one
  `<li>` per row, which is also what the detailed popup paragraph at `README.md:18-23` already says; the second half of
  the sentence (the name lives in the options screen) is `src/options/`. Line re-wrapped to the file's ~118-column style.
- `README.md:111` — «Стадии **1–4** кода готовы» → «Стадии **1–6** кода готовы». Checked against
  `docs/state/plan-implementation.md`: Stage 5 (`t5-01`, `t5-02`, `t5-03`) and Stage 6 (`t5-04`, `t5-05`, `t5-06`) are
  all **accepted**, and this task's own slice (`t5-06b`) changes no `src/` file, so "the code of stages 1–6 is ready" is
  the claim the tree supports. The rest of that bullet (the directory list) is unchanged and still true.
- Counts kept in sync with the tree, both places: `README.md:38` and `README.md:113-114` → `906 тестов в 44 файлах`.
  The neighbouring numbers were re-measured rather than trusted: `dist/` **10** files (`find dist -type f | wc -l`),
  checker **0 errors / 0 warnings / 113 info**. The untouched limits were re-grepped so the paragraph carries no new
  error: `256` (`src/core/entry-rules.ts:25`), `20` (`:28`), `40` (`:31`), the random 8-character name (`:34`
  `GENERATED_AUTHOR_NAME_LENGTH = 8`), the `1000 ms` address poll (`src/content/refresh/url-change-watch.ts:50`), the
  `150 ms` settle (`src/content/overlay/card-events.ts:42`).

## 3. Acceptance criteria walked (AC 1–5 of the card)

| AC | Status | Evidence |
|---|---|---|
| **1** a page-layer test where an aggregate `setVisibleForAuthor` write from one tab repaints another tab's highlights | satisfied | `tests/content-cross-tab-refresh.spec.ts:340`; the existing per-entry pin at `:319` is intact (added next to it, not in place of it) |
| **2** the popup group-delete pin asserts identity for every survivor, or names the core pin | satisfied | first branch taken: `tests/popup-entry-list.spec.ts:755-757` — three `toBe`, one per survivor; the core owner `tests/core-entry-store-write.spec.ts:881` is named in the report and stays untouched |
| **3** a test pins the empty-author shape exactly as `A110` states it (row renders, controls write nothing, create cannot store it) | satisfied | one `describe` with all three halves: `tests/popup-entry-list.spec.ts:849`, `:865`, `:887` (track collision), `:905` (create); inverted probes proved the pins fail when the claim is denied |
| **4** `README.md` has no stale stage claim and no internal number disagreement, and its counts match the tree | satisfied | `:5-6` rewritten, `:111` now `Стадии 1–6`, `:38`/`:113-114` = `906 тестов в 44 файлах`; measured: 906 / 44 / dist 10 / checker 0-0-113 |
| **5** no `src/` file changes; if an item needs one, stop and report | satisfied | `git diff --name-only c569c63..HEAD -- src` → empty; no item needed a code change, so no item was stopped |

## 4. Deviations, observations and open questions

1. **No deviation from the brief.** Allowed paths only (`tests/**`, `README.md`); forbidden paths untouched
   (`src/`, both behavior specs, this task's card, `scripts/`, `.pi/`). No new test dependency, no new seam.
2. **Item 3's create half sits in the popup test file.** The card asked for one pinned shape; a single `describe` that
   states all three halves is the least arguable reading of AC 3, so `createEntryOnPage` is imported into
   `tests/popup-entry-list.spec.ts` (a second, smaller copy of the `createInput` builder that
   `tests/core-entry-store-write.spec.ts:92` already has). If the reviewer prefers the create half in the core file,
   moving it is a mechanical change with identical behavior — flagged, not done, because AC 3 says "a test pins the shape".
3. **The A110 pin records the ugly label, it does not endorse it.** `:849` asserts the label is `« — 1»` (empty name half)
   so the debt is written down. If a later task decides to hide or filter such a row, that pin fails loudly, which is the
   point of `A110`. No Russian string, spec line or test count was invented for it.
4. **README counts have no mechanical owner.** `t5-06` engineer open question 1 is still open: `README.md:38`/`:113` are
   updated by hand every task that changes a test count (this task moved 901 → 906). Nothing in `tests/` or
   `scripts/check-agent-config.mjs` pins the number. A PM ruling would close it; this slice did not add such a pin,
   because a scan over the README's Russian prose is a new artifact, not a carried fix.
5. **Two README coverage gaps found while fact-checking, both omissions and neither a contradiction — left alone**
   (item 4 is scoped to two sentences, and adding feature prose without a ruling is the `A92` failure mode):
   the README never mentions the per-author highlight colors (`t5-02`, rulings `A94`/`A102`) nor the caret handoff into
   the note field and back (`t5-04`, rulings `A97`/`A105`). The popup-shape paragraph at `README.md:128-129` still
   honestly states that the `A95`/`A108` row form has not been browser-run, so the status section stays accurate about
   what is confirmed where.
6. **Not done in this slice (out of scope, listed, not invented)**: no state-card edit (forbidden), no attempt-log or
   delegation-counter update (PM-owned), no browser run of the popup shape (a Stage 5/6 end item, named in
   `README.md:128-129`), no `docs/retro.md` entry (PM-owned).
7. `git status --short` at the end of the run is **empty** — no staged files, no untracked leftovers (the mutation-probe
   file from item 3's non-vacuity proof was deleted before the first commit).
