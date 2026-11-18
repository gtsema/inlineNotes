# Engineer report — task `t5-05-popup-host-line`, attempt 1

Ruling `A98` (display removed) with ruling `A49` (the active-tab read and the `tabs` permission stay).
Spec edited with the change: `docs/specs/content-overlay-ui.md`. `README.md` was checked and needed no edit (proof below).

## Commits (`A73`: one commit per green step, `A62` order: spec first)

| step | hash | content |
| --- | --- | --- |
| CP1 spec | `c5964aa` | `docs/specs/content-overlay-ui.md`: the popup-contract sentence loses "title with the page host" and gains "no page address anywhere … in any state" while the read/permission sentence stays; AC22 states the same fact; carried 3 of the checklist (`focus restore` + `preventScroll`, `:44` `:131` `:257` + the pin list at `:132`). |
| CP2 code + popup tests | `5bc2580` | `src/popup/page-entries-service.ts`, `src/popup/popup.component.ts`, `src/popup/text.ts`, `tests/popup-entry-list.spec.ts`: the host line, its `.host` style, the `hostOf` function and the `host` field of `PageEntriesView` are gone; the address stays only as the input to the core key rules. |
| CP3 carried tests | `fe43182` | `tests/content-editor-controller.spec.ts`, `tests/content-create-card-controller.spec.ts`, `tests/content-tooltip.spec.ts`: carried 1, 2, 4 of the checklist. No `src/content/` file touched. |
| CP4 popup test additions | `64d0c48` | `tests/popup-entry-list.spec.ts`: the AC1 state walk (entries / IDN punycode page / not-injectable page that keeps its list / empty list / no-name notice), the template scan, and the "no Russian string smuggles an address" check. |

## Gates (each run bare, `echo "exit=$?"` on the line right after the command, never after a pipe; tails only)

Run on the final tree (after CP4):

```
npm run typecheck                                   exit=0
npm run build                                       exit=0   [build] dist/ is a self-contained MV3 folder (10 files)
npm test                                            exit=0   Test Files 44 passed (44) / Tests 875 passed (875)
node scripts/check-agent-config.mjs                 exit=0   0 error(s), 0 warning(s), 108 info(s)
```

Baseline before the change: `npm test` → 44 files / **872** tests, exit 0. Final: 44 files / **875** tests
(+1 popup state walk, +1 template scan, +1 create-card event-close pin, +1 editor event-close pin, −1 deleted host assertion test).
The same four gates were run green before each of the four commits.

## Acceptance criteria, self-check by number

1. **No page address anywhere in the popup — done.**
   `src/popup/popup.component.ts:64-100` is the whole template: `h1.title`, the two notice branches, `.empty`, `ul.rows` — no address node;
   `grep -n host src/popup/popup.component.ts` now matches only the doc comment at `:55`.
   `src/popup/page-entries-service.ts:90-96` — `PageEntriesView` is `rows` + `notices`, no address field;
   `src/popup/page-entries-service.ts:229` — `return { rows, notices };`.
   Pinned by `tests/popup-entry-list.spec.ts:163` (five states walked, `Object.keys(view)` is exactly `['notices','rows']`, and no
   host / punycode / scheme / path fragment appears in the rendered view) and `tests/popup-entry-list.spec.ts:230` (the template
   renders no `class="host"`, no `view().host`, no `hostOf`, and none of the layer's Russian strings contains a scheme or a host).
2. **Notices unchanged — done.** `src/popup/popup.component.ts:68-77` (`notice--name` button, `notice--not-injectable` paragraph)
   and `:78-81` (`.empty` gated only by the empty check, then `ul.rows`) are untouched, byte for byte.
   The order-and-nesting pins still pass unchanged: `tests/toolchain-contract.spec.ts:446-448`, `:461-465`, `:476`, `:494`, `:498`.
   The wording constants are unchanged: `src/popup/text.ts:40` (`Укажите имя в настройках`, `A83`), `:45`
   (`На этой странице подсветка недоступна`, `A81`), `:34` (`На этой странице нет записей`), `:47` (`Вы`), `:49` (`Удалить`).
   State pins that still pass, untouched: `tests/popup-entry-list.spec.ts:429`, `:437` (the notice above a list that still
   renders), `:457` (the `A81` line keeps its list), `:479`, `:487`, `:495` (the two-line order of the restricted no-name page).
3. **Page-key half untouched — done.** No file under `src/core/` changed (`git diff --name-only … -- src/core` is empty).
   The surviving pins: `tests/popup-entry-list.spec.ts:139` (a note saved on a `?utm_…` variant is still found through the stored
   index, `A4`), `:151` (the store is asked only through the core key layout), and the rewritten `:267`, which now proves the same
   fact without the host: the row arrives under `entryStorageKey('https://other.example/post')` and the key of any other page is
   never asked for.
4. **`tabs` permission and the `chrome.tabs` read survive — done.** Grep proof below.
   `src/manifest.json:6` `"permissions": ["storage", "tabs"],` (file not in the diff at all);
   `src/popup/active-tab.ts:24` `activeTabUrl()` and `:27` `await chrome.tabs.query({ active: true, currentWindow: true })`;
   `src/popup/popup.component.ts:4` imports it and `:25` wires it into the token:
   `pageUrl: async (): Promise<string | null> => await activeTabUrl(),`.
   Pins that still pass untouched: `tests/toolchain-contract.spec.ts:111` (permissions are exactly `storage` + `tabs`) and
   `:291-298` (`src/popup/active-tab.ts` is the only shipped module naming `chrome.tabs`, and it calls `chrome.tabs.query`).
5. **Spec and README — done.** `docs/specs/content-overlay-ui.md:134` (popup contract) and `:262` (AC22) no longer promise a host
   line and now state the removal with its ruling; `grep -n "page host\|host of the page\|title with" docs/specs/*.md
   docs/project-profile.md AGENTS.md README.md` returns only the rewritten `docs/specs/content-overlay-ui.md:134`.
   `README.md` never described the line, so it was not edited: its popup paragraphs (`README.md:5`, `:22`, `:88-93`) describe the
   list, the checkbox and the notices, and `:51`/`:53` justify the `tabs` permission as "одно чтение адреса активной вкладки,
   чтобы попап понимал, о какой странице он говорит" — still true, since the read survived.
6. **No string added, none removed — done.** `git diff c5964aa~1..HEAD -- src/popup/text.ts` changes one JSDoc comment only
   (`Popup heading: host of the page…` → the `A98` wording); every value of `POPUP_STRINGS` and `POPUP_NOTICE_TEXT` is byte-identical.
   No string existed only for the host line, so nothing had to be deleted; the report lists none. The Russian-string scan in
   `tests/toolchain-contract.spec.ts` passes untouched.

## Carried-fix checklist (`A72`), answered by number

1. **Done — `tests/content-editor-controller.spec.ts`.** The name is now
   `:576 it('opens nothing for an entry the paint pass does not hold (t3-02 AC1, content-overlay-ui.md AC16, A24, A66, A104)')`:
   `t3-02` AC1 ("one pass, one stream, every anchor, `A40`/staleness produce nothing") and spec AC16
   (`docs/specs/content-overlay-ui.md:256` — a hidden, stale or unresolvable entry is neither painted nor hovered) own the fact
   "an entry the paint pass does not hold has no `tooltip` and therefore no click"; `A104` owns the consequence for the editor.
   Reconciled with the coverage header: `:5` now reads "the opening half of task `t5-03` AC2, AC3, AC7, AC9" (AC1 is the opacity
   pin of `tests/content-tooltip.spec.ts:389`, AC8 is the hide-on-scroll pin of `:781-840`, neither is in this file), and the
   `:20-26` bullet attributes the unpainted-entry fact to those owners instead of "AC8". No assertion changed in that test.
2. **Done — `tests/content-tooltip.spec.ts`.** `:460` is now
   `describe('the click of the tooltip (task t5-03 AC1, AC2, AC3; ruling A96)')` — the stale `AC8` is gone — and the comment at
   `:511-518` names `t5-03` AC2 with ruling `A104` (plus spec AC16) as the owner of "the click opens the editor over the entry the
   `paint pass` produced", and points at `the page wiring of the tooltip` (`:781-840`) as where AC8 (scroll, `pointerdown`
   outside the host) is actually pinned — that wiring pin walks `pressOnPage()` at `:794` and the `scroll` event at `:822`.
   Names and comments only; no assertion changed.
3. **Done — spec text only, `docs/specs/content-overlay-ui.md`.** `:44` (Terms `focus restore`) now enumerates six close paths and
   says the restore call "passes `preventScroll: true` exactly like the open call: one option object, `FIELD_FOCUS_OPTIONS`, at
   both call sites"; `:131` (Rules bullet) states the same and names `src/content/overlay/focus-handoff.ts` as the owner of that
   object; `:257` (AC17) adds the two event-driven paths and "that restore call passing the same `preventScroll: true` as the open
   call"; `:132` (the pin list) now lists the two event-driven closes in both controller files. No code changed for this item.
4. **Done — test only, `src/content/**` untouched.** Two new pins, one per widget, each walking both unpinned close paths and
   asserting the handover at the call shape (exactly one focus call after the recorder is armed, on the page control, with
   `{ preventScroll: true }`; `document.activeElement` is the control; the shadow root holds nothing; no storage write):
   `tests/content-create-card-controller.spec.ts:1115` (outside-`pointerdown` and scroll over the card, wiring attached by
   `attachCreateCardEvents` in the case and detached in its `finally`, because the controller fixture owns no listeners) and
   `tests/content-editor-controller.spec.ts:883` (the same two paths over the editor, whose fixture already attaches
   `attachEditorEvents`). The cited call sites — `src/content/overlay/card-events.ts:82,89,98` and
   `src/content/overlay/editor-events.ts:65,69` — are byte-identical: they are not in the diff.

## Grep proof that the active-tab URL read survived (`A49`)

```
$ grep -n '"permissions"' src/manifest.json
6:  "permissions": ["storage", "tabs"],

$ grep -n 'chrome.tabs.query' src/popup/active-tab.ts
5: * page it describes is the active tab, and `chrome.tabs.query` reports `tab.url`
27:    tabs = await chrome.tabs.query({ active: true, currentWindow: true });

$ grep -n 'pageUrl: async' src/popup/popup.component.ts
25:      pageUrl: async (): Promise<string | null> => await activeTabUrl(),

$ grep -rn 'hostOf' src/
src/popup/page-entries-service.ts:18: *   of that address — the host line under the title, with the `hostOf` derivation
```

The last line is the only `hostOf` mention left in `src/`: a prose reference in the header comment. The function, its single call
site and the `view().host` / `class="host"` render are gone (`grep -rn 'view()\.host\|class="host"' src/` → no match).

## Boundary check

```
$ git diff --stat c5964aa~1..HEAD
 docs/specs/content-overlay-ui.md             |  12 +--
 src/popup/page-entries-service.ts            |  32 ++++----
 src/popup/popup.component.ts                 |  19 ++---
 src/popup/text.ts                            |   6 +-
 tests/content-create-card-controller.spec.ts |  49 +++++++++++
 tests/content-editor-controller.spec.ts      |  62 ++++++++++++--
 tests/content-tooltip.spec.ts                |  10 ++-
 tests/popup-entry-list.spec.ts               | 118 +++++++++++++++++++++++++--

$ git diff --name-only c5964aa~1..HEAD -- src/core src/content src/options src/manifest.json package.json scripts .pi docs/state
(no output — every forbidden path is untouched, the task state card included)
```

Nothing is staged (`git diff --cached --name-only` is empty). `docs/state/browser-verification-run.md` was already modified in the
working tree by the PM before this task; it was not staged, changed or committed here.

## Deviations, observations, open questions

1. **Placement of the render-shape pin.** The template scan (`tests/popup-entry-list.spec.ts:230`) lives in the popup spec, not in
   `tests/toolchain-contract.spec.ts`, which is where the project keeps source-shape greps: that file is outside this task's
   boundary, so AC1's render half had to be pinned somewhere allowed. It reuses the `readFileSync`/`projectRoot` pattern the same
   file already uses for the manifest at `:518`. If the reviewer wants it moved, that is a one-test relocation.
2. **`AC1` left in the tooltip describe name.** Carried 2 asked only for the stale `AC8`. `tests/content-tooltip.spec.ts:460`
   still lists `AC1` (opacity), which is pinned in the neighbouring describe at `:389`. Left as-is to keep the diff to the flagged
   citation; flagged here rather than changed silently.
3. **Cosmetic residue, not changed.** `src/popup/popup.component.ts:109-113` keeps `.title { margin: 0 0 4px }` — that 4 px was
   the gap under the deleted host line. No acceptance criterion covers popup spacing, so no value was invented; a PM call if the
   heading now sits too close to the notice or the list.
4. **Unrelated stale README line, reported not fixed.** `README.md:12-13` still says «клик по тултипу делает его непрозрачным»,
   which ruling `A96` removed. README was in scope here only for the host line, so it was left for the owner of that doc-sync.
5. No spec-versus-code conflict was found: the popup contract, AC22 and the shipped popup layer agree after this change.
