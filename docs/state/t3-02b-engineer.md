# Engineer report — `t3-02b-carried-test-fixes`, attempt 1

Brief: tests and spec only. No file under `src/` was changed, and none needed to be:
`git show --name-only` for both commits lists exactly
`tests/content-create-card-controller.spec.ts`, `docs/specs/code-review-flow.md`,
`docs/specs/content-overlay-ui.md`.

## 0. Commits (briefed order, both present, tree clean)

```
3462d2a docs(t3-02b): keyboard reachability and the carried-fix checklist rule
a6997f9 test(t3-02b): pin card tab order and the save-moment re-derive
bb3cbb1 docs(state): t3-02b fix slice opened (user approved); A74 no-focus-theft; ...
```

`git status --porcelain` after the second commit: empty (0 modified, 0 staged).
`dist/` is gitignored, so the build left nothing to commit.

## 1. Carried-fix checklist, answered by number (ruling `A72`)

1. `done` — `tests/content-create-card-controller.spec.ts:707` (describe
   `an open card is reachable by the keyboard (t3-02b AC1, t3-01 remark 4)`; tests at
   `:714` open-moves-no-focus, `:741` rendered tab order, `:778` `Esc` cancels,
   `:795` `Ctrl+Enter` saves, `:812` `Cmd+Enter` saves; block ends `:825`), and the
   shipped rule is stated in `docs/specs/content-overlay-ui.md:95-96` (Terms row
   `:36`, new AC `:135`).
2. `done` — `tests/content-create-card-controller.spec.ts:827` (describe
   `the page moved its words between the open and the save (t3-02b AC2, ruling A29)`;
   `:846` stores the span the mutated document gives, `:903` gone text answers
   `selection_lost` and writes nothing; block ends `:925`). Both drives
   `CreateCardController.submit()` through the card's own `Сохранить` button; neither
   calls `createNote` directly.
3. `done` — `docs/specs/code-review-flow.md:41` (Rules: a carried fix is a
   deliverable, not a remark, ruling `A72`), with the mechanism written into Flow
   steps 1, 2 and 5 at `:26`, `:27`, `:30`, the blocking condition at `:43`, AC 8 at
   `:74`, and the `carried fix` Terms row at `:22`. This report answers the checklist
   by number in this very section, as the new rule requires.

## 2. Gates, in the `A62` order, quoted from the committed tree

1. `npm run build`

```
[build] manifest references resolved: content.js, popup/index.html, options/index.html
[build] dist/content.js (100259 bytes)
[build] dist/ is a self-contained MV3 folder (10 files)
```

2. `npm test` (`--reporter=basic`, filtered; the full log was never printed)

```
Test Files  33 passed (33)
      Tests  626 passed (626)
```

   619 → 626 tests: the seven new cases are the five of AC 1 and the two of AC 2.

3. `node scripts/check-agent-config.mjs`

```
0 error(s), 0 warning(s), 30 info(s)
```

   Info count moved 29 → 30: the new spec prose backticks
   `tests/content-create-card-controller.spec.ts`, which the checker reports as a
   "planned path" mention. Same class as the 29 existing infos (it already reports
   `tests/content-create-card-boundaries.spec.ts` the same way although that file
   exists). No new error or warning.

Extra (not part of the `A62` trio, run because test sources changed):
`npm run typecheck` → exit 0.

## 3. AC self-check

- **AC1 — keyboard behavior pinned, and the shipped rule written in the spec.**
  `tests/content-create-card-controller.spec.ts:714` opens the card while a page
  button holds the focus and asserts `document.activeElement` is still that button,
  that it is not the overlay host, and that `root.activeElement` is `null` — i.e.
  `open()` moved no focus (`A74`). `:741` reads the rendered tab order as
  `textarea` → `Сохранить` → `Отмена`, asserts each is enabled, that no element in
  the shadow tree or the host carries a `tabindex`, and that focusing each control in
  that order answers `root.activeElement` with the control and `document.activeElement`
  with the single host. `:778` `Esc` closes the card, hides the host and writes
  nothing (no storage write, `entries` still empty). `:795`/`:812` `Ctrl+Enter` and
  `Cmd+Enter` perform the save through the real create path (`created` seam +
  `loadEntries` read-back). The same three keys were already pinned one level down at
  the widget (`tests/content-create-card-widget.spec.ts:291`); the new cases add the
  open-card answers, the tab order and the focus rule. Spec:
  `docs/specs/content-overlay-ui.md:96` states the shipped no-focus-taken rule with its
  rationale and marks it `Assumption:` pending the user's word; `:95` fixes the `Tab`
  order wording; `:135` adds AC 17 in observable terms; Terms `:36` gives the English
  grep anchor `focus on open`.
- **AC2 — controller-level re-derive under a mutated DOM.** `:846`: after `open()` and
  before `Сохранить`, a `<p>` is inserted in front of the selected paragraph and a
  word is inserted **inside** the selected words. The stored record is
  `text === 'quick very brown'` (not the `quick brown` measured at open, which the
  card's own measurement seam at `:853` proves was the open-time span), with
  `anchor.prefix === 'Advertisement: a word before The '` read off the mutated
  stream, and `locateAnchor(document.body, entry.anchor)` resolves in the mutated
  document covering exactly those words. `:903`: the selected text node is replaced by
  a fresh one, and the save answers `selection_lost` (asserted **not** `entry_invalid`,
  per ruling `A28`), keeps the card open with its draft, records no `created` call,
  leaves only the `settings` key in storage and zero entries for the page.
- **AC3 — carried-fix checklist rule in the flow spec.** See line 3 of section 1.
- **Gates row** — quoted in section 2; all three green in the `A62` order.

## 4. Deviations from the brief (reported, not resolved silently)

1. **Owner of `docs/specs/code-review-flow.md`.** `docs/specs/INDEX.md` lists that
   spec's owner as `project-manager`; the brief and ruling `A72` assign this spec edit
   to the engineer. I made the edit as briefed and flag the ownership line for the PM.
2. **Which test file.** AC1 allows "`tests/content-create-card-widget.spec.ts` **or**
   `-controller.spec.ts`". I used the controller spec only. The widget spec already
   pins `Esc`, `Ctrl+Enter` and `Cmd+Enter` one level down at
   `tests/content-create-card-widget.spec.ts:291` (`the keyboard affordances of the
   card`), but there they only reach a stub `onSubmit`/`onCancel`: no open card, no
   storage, no answer code, no focus, no tab order. The missing halves AC1 asked for are
   pinned at the controller, and the existing widget cases were left untouched.
3. **One new spec AC.** The brief asked for the shipped keyboard rule "stated in the
   spec". Besides the Rules bullet I also added AC 17 to
   `docs/specs/content-overlay-ui.md:135`, because the checker and the review flow
   both demand an observable AC per shipped rule. Delete that line if the PM counts it
   as scope.
4. **Commit history rewritten once, locally.** I made the two briefed commits, then
   found an imprecise assertion in the AC2 test. To keep exactly two commits in the
   briefed order I ran `git reset --soft HEAD~2` (non-destructive: index and working
   tree untouched) and re-committed the same two messages in the same order, folding
   the test-only correction into the `test(...)` commit. Nothing was pushed; the final
   history is exactly the briefed pair.
5. **`src/` untouched.** No production change was needed for AC1–AC3; ruling `A74`
   was already the shipped behavior, so the tests pinned what exists instead of
   forcing a source edit.

## 5. Production defects found

Nothing was fixed (tests/spec only). One **suspected** defect to route, not invented
requirements — reported because AC 2 exercises exactly this path:

- **A `Range` operation on a removed node can throw per spec, and the create path has
  no guard.** The AC 2 gone-text case (`:903`) removes the selection's text node and
  then saves. `src/content/capture/selection-span.ts` calls
  `range.intersectsNode(fragment.node)`; the DOM spec's boundary-point comparison
  throws `WrongDocumentError` when the compared points have different root nodes, while
  **jsdom returns `false`** — so the test can only pin the `selection_lost` answer, not
  a throw. If any engine throws there, `createNote` rejects, `CreateCardController.submit`
  does not catch, and `create-card.tsx` has already set `busy` — the card would sit with
  `Сохранить` disabled, no refusal line and no way out. Same family as `t3-02` review
  remark 4 ("`refresh()` never throws"). Needs a `chrome://extensions` smoke line or a
  PM ruling; not fixed here.

Also worth recording: the AC 2 first case depends on the DOM replace-data live-range
rule (a boundary inside the replaced region snaps to its start, a boundary after it
moves by the length difference). jsdom 31 implements it; the test comment at `:837-839`
names the rule so a future failure is diagnosable instead of mysterious.

## 6. Residual risks and open questions

- `A74` is still an `Assumption:`. Reversing it (focus into the textarea on open) is a
  behavior change with its own production edit; the new test at `:714` would fail first,
  which is the intent.
- jsdom has no `Tab` traversal. "`Tab` cycles the controls" is pinned as the rendered
  order + focusability + no `tabindex`, not as a real key walk. The `Tab` walk itself
  belongs to the `chrome://extensions` smoke list.
- The card is placed before any focus question is settled; nothing here changes
  placement, `close-on-scroll` or the tooltip rules.
- The task state file `docs/state/t3-02b-carried-test-fixes.md` was not edited: the
  brief gave `docs/state/engineer-report.md` as the output and left the bookkeeping and
  ruling log to the PM.

## 7. Tree state

`git status --porcelain` empty; nothing staged. Two commits ahead of `bb3cbb1`:
`a6997f9` (tests), `3462d2a` (specs). This file is the run's artifact at
`docs/state/engineer-report.md` inside the managed output directory; the repo copy is
the PM's bookkeeping step, and writing it into the working tree would have broken the
"tree clean, exactly two commits" condition of this brief.
