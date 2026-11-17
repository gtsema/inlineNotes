I have all evidence. Note: I have no write-capable tool (read-only role tools), so here is the complete artifact for the briefed output path.

---

# Code review — `t3-03-content-editor`, attempt 1

Reviewer: `code-reviewer` (read-only). Range reviewed: `cc91a56..14c58a7` (engineer work: `8861e6f`, `e25ef91`, `14c58a7`); `9e91960` is PM bookkeeping + two PM spec rulings and is **not** counted against the engineer. HEAD `9e91960`, working tree clean. Brief: `docs/state/t3-03-content-editor.md`. Report: `docs/state/t3-03-engineer.md` (verified against code, never against its prose).

## Verdict

**`changes requested`** — one blocking finding (a spec rule with no pin at all). Everything else in the slice is sound: the editor itself is well built and well pinned, both carried fixes are answered, and all four gates are green on my own re-run.

## Acceptance criteria (one line each)

- **AC1** — `pass` for both named halves of the widget rule, **`not covered by tests` for the "instead of a create card" handover**: `tests/content-editor-controller.spec.ts:406-511` — own entry → editor prefilled with the stored comment, `N/256` counter, three controls in the spec's rendered order (`:407-437`); foreign painted text → `openFor` claims the selection but renders **no widget at all** (no `.inlinenotes-card-input`, and neither «Сохранить» nor «Удалить» anywhere in the shadow root, no non-`get` port call — `:440-455`, ruling `A25` satisfied); boundary-crossing selection not claimed (`:456`); collapsed caret and stale entry claim nothing (`:466-489`); claim answered from the paint pass, not a second resolve (`:491-510`). The "no create card" half is blocking finding **1**.
- **AC2** — `pass`: `tests/content-editor-controller.spec.ts:513-583`; save goes only through core `updateEntryComment` (`src/content/editor/edit-entry.ts:164-171`), `comment`+`updatedAt` move, `createdAt`/`authorName`/`text`/`anchor`/`id` do not, port log is exactly `[[entrySlot], [pageIndex]]` with zero `remove` (`:545-555`), `visible` survives an unchanged save (`:558`), a `quota` write shows the refusal and keeps the draft (`:570`).
- **AC3** — `pass`: `tests/content-editor-controller.spec.ts:585-712`; the loop over `Отмена` / `Esc` / outside asserts `port.calls.filter(set|remove) === []` and the stored comment unchanged on every iteration (`:599-603`); a `pointerdown` inside the host is ignored (`:616`); scroll closes and `selectionchange` deliberately does not (`:626`); unmeasurable entry is claimed but gets no widget (`:687`).
- **AC4** — `pass` (with remark 4): `tests/content-editor-controller.spec.ts:714-745`; one press of `Удалить` removes the own record and leaves the foreign one, `onDeleted` fires, widget gone, host hidden (`:715-731`); a refused removal keeps the editor open with its refusal line (`:733`); no `Удалить` is ever rendered for a foreign entry (`:440-455`, `:827-836`).
- **AC5** — `pass`: `tests/content-editor-controller.spec.ts:747-837`; a move onto another entry answers `«Выделение пересекается с существующей записью»`, writes nothing, keeps the editor open with its draft (`:748-766`); self-exclusion proven — a re-selection of the entry's own span is a plain save (`:768-782`, code `edit-entry.ts:147-156` `removeById` on the scanned list); an unresolvable re-selection answers `selection_lost` and writes nothing (`:807-825`).
- **Gates** — `pass` (see "Gates" — all four re-run by me).
- **Carried fixes 1 and 2** — both `done` (see "Carried fixes").

## Blocking findings

1. **The Flow 6 claim handover has no pin anywhere** — `src/content/overlay/create-card-controller.tsx:266` (`if (options.claimSelection?.(selection, authorName) === true) { return; }`) wired by `src/content/main.ts:78-79`. The rule is named in the spec at `docs/specs/content-overlay-ui.md:82` ("…belongs to that entry, and **no create card is mounted for it**"), Flow 6 `:52`, and AC5 `:214`, and it is the second half of task AC1. Evidence it is unpinned: `grep -rn "claimSelection" tests` → **0 hits**; the 28 cases of `tests/content-create-card-controller.spec.ts` never pass the hook, and `tests/content-editor-controller.spec.ts:403` calls `editor.openFor(...)` directly, so nothing proves the card controller honours a `true` answer. Deleting the hook would break AC1/overlay AC5 on a real page (every re-selection of an existing note would mount a create card that core then refuses as `overlap`) with a green suite. This is logic inside a module that already has a suite, not `main.ts` glue, so the `onCreated`-handover precedent does not cover it. Fix: one case in `tests/content-create-card-controller.spec.ts` where the hook returns `true` (assert no card wrapper is mounted, no span capture, no core read/write) and one where it returns `false` (card opens).

## Non-blocking remarks (numbered, not blocking)

2. `src/content/editor/edit-entry.ts:130` names `tests/content-editor-edit-path.spec.ts`, which does not exist — report §7 claims "the two spec references that named the missing file were re-pointed at the file that exists"; exactly one survives in shipped source. Related: the `catch` at `edit-entry.ts:136` is not driven by a throw — the cited AC5 test (`tests/content-editor-controller.spec.ts:807-825`, fixture `lostSelection` at `:335-344`) hits the sibling `span === null` branch. The throw-table row (`docs/specs/content-overlay-ui.md:191`) should carry the "**named, not driven by a throw**" wording already used for `paint-style.ts:200`, with the jsdom-injection reason the code comment already gives.
3. PM-caused staleness from `9e91960` (the `A78` rewrite renamed the spec section): `src/content/editor/edit-entry.ts:29-30` still points at "Open question: what a successful re-selection stores" and says "it is not resolved in this file"; `tests/content-editor-controller.spec.ts:786-788` points at the same dead section name. Doc-only; the PM's spec fix should be followed by these two pointer edits.
4. AC4's "highlight and tooltip gone" half is pinned at the boundary rather than end-to-end: `onDeleted` fires (`:727`) and the second-pass rule is pinned in `tests/content-page-painter.spec.ts:333` (a pass drops the name of an entry no longer eligible), but the glue at `src/content/main.ts:110-113` (`tooltip.hide()` + `void painter.refresh()`) has no direct pin — same accepted shape as the `onCreated` handover.
5. The `≤ 1` widening of the fresh-stream pin (`tests/content-create-card-boundaries.spec.ts:242`) is honest but slightly weaker than before: `create/create-note.ts` left the `streamReusers` list, so nothing now pins `create-note.ts:143` and `editor/edit-entry.ts:134` at exactly one `buildTextStream` per save. Shipped code is compliant today; a count pin in `tests/content-editor-controller.spec.ts` would restore the guarantee.
6. `docs/specs/content-overlay-ui.md:212` (AC3) still says the editable half of the old tooltip sentence "**belongs to task `t3-03`**", which a new reader can take as "shipped from the tooltip"; Flow 4 `:51`, Terms `:36` and Rules `:83` mark it **not shipped** correctly, so this is wording only.
7. The `A74` editor pin (`:641-660`) proves "no focus moved" (page button still `document.activeElement`, `shadowRoot.activeElement` null) but its third assertion focuses the controls by hand rather than by tab order; the order itself is pinned by the AC1 button-order assertion (`:425-429`), so the rule is covered.

## `A78` agreement (brief item 2)

Confirmed, three ways. Spec `docs/specs/content-overlay-ui.md:90-96` ("a save writes `comment` and `updatedAt`, and the `anchor` and `text` keep the span the note was created on") = shipped code `src/content/editor/edit-entry.ts:164-171` (only `updateEntryComment`, no anchor argument anywhere) = the named pin `tests/content-editor-controller.spec.ts:784-806` (free-span re-selection: `comment` + `updatedAt` move, `anchor` and `text` byte-equal to before). No content-layer path can move an anchor: `buildAnchor` is called only in `src/content/capture/selection-span.ts:99`, and the only write that carries an anchor is `create-note.ts:163`.

## `A74` (brief item 3)

Pinned: `tests/content-editor-controller.spec.ts:641-660`. Spec coverage for the editor added in the same commit: keyboard row `docs/specs/content-overlay-ui.md:108` (editor order `textarea → Сохранить → Отмена → Удалить`, matching `src/content/overlay/editor.tsx:139-157`) and the `focus on open` row `:109`, which names the editor's pin file.

## Throw-safety continuity (`A75`, brief item 4)

My own `grep -rn "catch" src/content/` returns **14** catch sites: `create/create-note.ts:145`, `editor/edit-entry.ts:136`, `overlay/create-card-controller.tsx:230,249`, `overlay/editor-controller.tsx:326`, `overlay/tooltip-controller.tsx:219`, `paint/page-painter.ts:175,186,222,248`, `paint/paint-plan.ts:191`, `paint/paint-style.ts:159,169`, `store/chrome-storage-port.ts:77`. The enumeration at `docs/specs/content-overlay-ui.md:188-201` has exactly one row per site (plus the `capture/selection-span.ts` "no `catch` on purpose" row), the two new rows match the two new sites, and `tests/content-throw-boundaries.spec.ts:113-132` pins the set at 14 with `total === 14`. The required pin exists: `tests/content-throw-boundaries.spec.ts:160-175` slices `async function submit(` → `function close(` — which covers **both** `submit` and `remove` bodies — asserts the slice is non-empty, and forbids `catch`. `measureEntryBox`'s catch is driven (`tests/content-editor-controller.spec.ts:687-701`); `edit-entry.ts:136` is the coverage nuance in remark 2.

## Boundary-pin widening is honest, not a loophole (brief item 5)

- Write pin (`tests/content-create-card-boundaries.spec.ts:116-131`): the import list is exactly 4 modules, and a second, stronger call-level assertion lists `create/create-note.ts` + `editor/edit-entry.ts`. The regex names all five core writes (`createEntryOnPage|updateEntryComment|deleteEntry|setVisible|clearPage`) and `setVisible` is the real export (`src/core/entry-store-write.ts:308`), so no write escapes it; a third module cannot even import the write module. No loophole.
- `A52` still constrains something real (`:190-208`): `assertCreatable` and `canCreateEntry` are banned outright; `findOverlappingEntry(` is allowed in exactly one module; local overlap predicates (`function findOverlap`, `isOverlapping`) are banned. The create path's absence from the overlap-call list is correct (`A46`: core answers inside `createEntryOnPage` from the `spans` it is handed).
- `≤ 1` stream per module (`:235-245`): `src/content/anchor/entry-ranges.ts:43-50` takes the caller's stream and builds none, so the widening cannot hide a second stream in the shared walk; shipped builds are one per flow (`paint-plan.ts:133`, `create-note.ts:143`, `edit-entry.ts:134`, `create-card-controller.tsx:248`) and the `rebuilds` assertion still forbids re-entering `locateAnchor` (`locate-anchor.ts:66`). Only remark 5 applies.
- `src/content/create/create-note.ts` diff is a pure extract-to-shared refactor (`resolvedEntryRanges` moved verbatim into `src/content/anchor/entry-ranges.ts`); no create-path behavior changed.

## Carried fixes (one line each, `A72`)

1. **Mark the shipped / not-shipped halves of the spec** — **done**: Flow 5 and Flow 6 marked "(shipped by `t3-03`)" at `docs/specs/content-overlay-ui.md:52-53`, overlay AC4/AC5 tagged `t3-03` at `:212-214`; and the tooltip-to-editor half is explicitly **not shipped** in three places: Flow 4 `:51` ("is **not shipped**… never from the tooltip"), Terms `pinned tooltip` `:36`, Rules `:83` ("the tooltip-to-editor hand-over of the old Flow 4 sentence stays unshipped"). Wording nit at remark 6.
2. **Decide the fate of `PaintedEntry.tooltipBox`** — **done**, by deletion, in its own commit `8861e6f`: field and the `tooltipAnchorOf` walk removed from `src/content/paint/paint-plan.ts`, reason recorded at `paint-plan.ts:37-45`; `grep -rn "tooltipBox" src tests docs` returns only explanatory comments and the absence pin `tests/content-paint-plan.spec.ts:372` — no live reference anywhere; the per-fragment box stays (it is the throwing call, `A66`), and the first-box-with-an-area walk now lives only in `placementFragmentBox`.

## Boundaries (brief item 7)

No `src/core/`, no `src/manifest.json`, no `package.json`/lock/tsconfig/`.pi/` file in the engineer range (`git diff --name-only cc91a56..14c58a7` filtered — empty). No new dependency. No network: `grep -rn "fetch(|XMLHttpRequest|WebSocket|sendBeacon|import(" src/content` → empty. No host-DOM mutation for painting: the editor wrapper is appended to the shadow root (`editor-controller.tsx:344-356`) and the stylesheet into the same shadow root (`card-style.ts:146-154`). The only new Russian UI string is `Удалить` in the constants module `src/content/text.ts:52` (already the spec's word; `ContentRefusalCode` widened to `CreateNoteCode | EditNoteCode`, which adds no new sentence). Terms row for `editor` at HEAD reads "— (no heading of its own)" and `src/content/overlay/editor.tsx:139-157` renders no heading — the PM's ruling is reflected.

## Escalation — spec-vs-code conflict, not resolved by me (PM decision, recommend carrying to `t4-01`)

`docs/specs/content-overlay-ui.md:150` promises that an entry hidden via its checkbox "is still editable from the page if the user selects its text again", while the shipped claim requires a **painted** entry (`:82`; `src/content/editor/painted-selection.ts:47-58` searches `PaintedEntry[]`; `src/content/paint/page-painter.ts:259-261` hands out only painted entries, and a hidden entry is skipped per `A40`) and `A22` makes that same hidden entry block a create (`src/core/entry-overlap.ts:18`) — so a re-selection of a hidden note's text today yields a create card and the `overlap` refusal. I do **not** choose which line wins. Not blocking for this task only because no shipped UI can produce the state: the popup checkbox is `t4-01` (`src/popup/popup.component.ts:8-10` placeholder) and nothing shipped calls core `setVisible`. Recommend it as a numbered carried fix for `t4-01`.

## Gates (`A77`, re-run by me at HEAD)

- `npm run build` → `[build] dist/ is a self-contained MV3 folder (10 files)`, exit 0.
- `npx vitest run --reporter=basic` → `Test Files 38 passed (38)` / `Tests 695 passed (695)`.
- `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 66 info(s)`.
- `npm run typecheck` (three projects) → exit 0, no output.
- **+23 delta since `t3-05` accounted for**: `tests/content-editor-controller.spec.ts` 0 → 22 cases, `tests/content-throw-boundaries.spec.ts` 7 → 8; `content-paint-plan` 13 → 13 and `content-create-card-boundaries` 15 → 15 (rewritten pins, no additions). Report §3 quoted 65 info; the 66th is the PM's own `docs/state` edit in `9e91960`. The engineer's §3 quotes are present and match my measurements.

## Harness

The engineer range changes no `.pi/agents/`, `.pi/skills/`, `.pi/settings.json`, no role frontmatter and no `timeoutMs`. `9e91960` (PM) touches `.pi/skills/delivery-planning/SKILL.md`; per `docs/specs/code-review-flow.md` → Edge Cases the checker was re-run and is green (0 errors), which is also AC7 of that spec.

## Process notes (not findings)

The missing final self-log in the task state file is a host event (a failed `edit` outside the child's scope after everything was committed), not a delivery gap; the report artifact survived, and the three commits are clean with an empty `git status` after each.