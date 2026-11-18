# Engineer report — `t7-01b-actions-row-cleanup`, attempt 1

Stage 8, task 2. Owner: `extension-engineer`. Ruling `A115`, carried-fix checklist `A72` items 1–3.
Base at start: `f77dd46` (clean tree, zero touched files — the prefill-death launch is not an attempt).
Two commits, each made at a green gate (`A73`):

| commit | content |
|---|---|
| `6bb0307` | item 1 — spec line + the empty-row fix + its pins + README counts |
| `fb44a02` | items 2–3 — the three frame declarations + the AC labels |

Range: `f77dd46..fb44a02`. Changed files in range: `README.md`, `docs/specs/content-overlay-ui.md`,
`src/content/overlay/editor.tsx`, `tests/content-card-actions.spec.ts`. Nothing else.

---

## Item 1 — the dead strip (UI fix, authorship rule untouched)

**Code** — `src/content/overlay/editor.tsx`:

- Before: the `<div class={CARD_ACTIONS_CLASS}>` was rendered unconditionally and each of the two
  buttons was individually guarded by `props.canEdit`. For `canEdit === false` the shadow tree held an
  empty `.actions` container: the shipped rule declares `display: flex` and `margin-top: 8px`, and the
  button rule's 24 px box gives the row its height → a visible empty band under a read-only note.
- After: the whole row is inside one `props.canEdit ? <div class={CARD_ACTIONS_CLASS}>…</div> : null`
  guard, and the two buttons are unguarded children of it (the guard moved from the controls to their
  container). Net: **no `.actions` node at all for a foreign entry**; the reader's own editor renders
  the row with exactly the two icon buttons.
- Module header comment updated: the authorship bullet now states that the row is not rendered either.
  No CSS changed — the row rules stay, because the row still exists when it has controls
  (`src/content/overlay/card-style.ts` is byte-identical in range; `git diff` for it is empty).
- `src/content/overlay/create-card.tsx` is untouched: the card always holds its save button, so its row
  always has a control and keeps rendering (pinned by `tests/content-create-card-widget.spec.ts:363`,
  still green).

**Authorship rule stays where it lives.** `model AC8` / ruling `A25` ("no Save/Delete for a foreign
entry", the absence of the control **is** the rule) is unchanged in code and in
`docs/specs/inline-comment-model.md` (0 diff lines in that file). The pin of that rule
(`tests/content-card-actions.spec.ts` → "renders no save and no delete node at all for a foreign entry
(A25)") is unchanged and still green.

**Pins added** — `tests/content-card-actions.spec.ts`, new `describe('t7-01b item 1: an action row with
no control is not rendered at all')`, three `it`s:

1. `renders no action row node for a foreign entry (no empty band, A115 / remark 4)` —
   `container.querySelector('.actions')` is `null` (not an empty node), `querySelectorAll('button')`
   length 0, the `textarea` of the note body is still present (the row left, not the card).
2. `keeps that read-only editor open, showing its note, and closing on Esc` — the mounted widget shows
   the stored comment (`textarea.value === 'a note'`) and its counter (`6/256`), and `Esc` calls
   `onCancel` exactly once while `saved` stays `[]` and `deleted()` stays `0`.
3. `renders the row of an own entry, holding exactly the two icon buttons` — the `.actions` node exists,
   has exactly 2 children, each is a `BUTTON` whose first child is an `svg`, and their accessible names
   are `Сохранить` then `Удалить`.

**Interpretation stated, not invented:** "the read-only editor still opens, shows the note and closes"
is pinned at the **component** level (`canEdit: false` mount). No shipped page path opens this widget
for a foreign entry — `src/content/overlay/editor-controller.tsx` calls `render(<EntryEditor canEdit …)`
only, and `content-overlay-ui.md` (Flow 4 / the `editor widget` rule) says a `tooltip` click on a foreign
entry opens **nothing at all** (that is `A25` itself). The `canEdit: false` render is the second line of
the same rule, exactly as the pre-existing pin in the same file treats it. If the PM meant a page-level
read-only editor, that would contradict `A25` and the overlay spec; I did not change either side.

**Spec** — `docs/specs/content-overlay-ui.md`, the action-row lines only:

- Terms / Aliases, `action row` row: added — "The row itself is rendered **only when it holds a
  control**: the read-only `editor` of a `foreign entry` has no `action row` node at all (task `t7-01b`)".
- Rules / Semantics → "Compact `action row`": "Three rules hold this shape" → "Four rules hold this
  shape", plus the new bullet **"An `action row` with no control is not rendered"** (names the defect,
  the mechanism, the Run 5 item 6 browser observation, and states explicitly that the authorship rule
  of `inline-comment-model.md` → "Edit rights" / `A25` / model AC8 does not move).
- Acceptance criterion 27: one clause — "Since task `t7-01b` the `action row` itself is unrendered when
  it holds no control, so that read-only widget shows no empty band where the buttons would be; the
  authorship rule is unchanged by it."

**README (counts only)** — `954 → 957` tests (line 52 and line 127) and `134 → 135` info lines (line
128): the +1 info is the checker reading the new `tests/content-card-actions.spec.ts` reference in the
spec bullet as a planned path. Measured, not typed in.

---

## Item 2 — the frame colors get their pin

`tests/content-card-actions.spec.ts`, inside the existing
`it('keeps the non-action visual rules of the card in the stylesheet')` of the (now) `AC9` describe —
the same pin the reviewer named (`:448-456` at review time). The pin keeps reading the **shipped
stylesheet text** (`expect(CARD_CSS).toContain(declaration)`); the three declarations were added to the
array that loop feeds it:

- `'background: #ffffff;'`
- `'border: 1px solid #b9bec4;'`
- `` 'box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);' ``

Each string is the shipped declaration verbatim (`src/content/overlay/card-style.ts:94, 95, 97`).
One extra array entry, `` `.${WIDGET_ROOT_CLASS} .${CARD_CLASS} {` `` (the frame rule's own selector,
the same idiom the pin already uses for `.${CARD_REFUSAL_CLASS} {`): without that marker the frame rule
could be deleted and the border/background assertions would still pass, because the identical
`border`/`background` strings are also declared for the `textarea` (`:113-114`) and for a button of the
row (`:144`). Stated in a comment in the test.

**The pin bites (mutation check, not prose):** changing `box-shadow: 0 6px 24px …` to
`0 6px 20px …` in `src/content/overlay/card-style.ts` made that `it` fail
(`npx vitest run tests/content-card-actions.spec.ts -t 'keeps the non-action visual rules'` →
`Test Files 1 failed`, `Tests 1 failed | 18 skipped`, `exit=1`). The source was then restored with
`git checkout -- src/content/overlay/card-style.ts`; `grep "0 6px 24px" src/content/overlay/card-style.ts`
→ line 97, and `git status --short` afterwards showed only the test file. After the restore,
`dist/content.js` contains the literal `box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);` and 4 occurrences
of `b9bec4`, so the pinned text is the shipped text.

**No test was added or removed by item 2** — the runtime total stayed 957.

---

## Item 3 — AC labels

Relabeled to the task's numbers (`t7-01` brief → "Acceptance criteria"):

| position | before | after | what the block asserts |
|---|---|---|---|
| header comment `:4` | `task t7-01 AC1-AC8` | `task t7-01 AC1, AC3-AC7, AC9` | the file's real coverage (AC2 lives in the controller files, AC8 in the boundaries scan, AC10 in docs) |
| `describe` `:405` | `AC6: the rendered order is textarea then save, then delete` | `AC7: …` | task AC7 = tab order |
| `describe` `:450` | `AC7: the behavior the compaction must not have touched` | `AC6: …` | task AC6 = disabled / `Ctrl+Enter` / `Esc` |
| `describe` `:513` | `AC8: the rules that did not move…` | `AC9: …` | task AC9 = the non-action visual rules |

**Complete changed-line set of `tests/content-card-actions.spec.ts` in commit `fb44a02`:**
line 4 (header comment), line 405 (`describe` label), line 450 (`describe` label), line 513
(`describe` label), and lines 524–533 (six comment lines + four new entries **inside** the
`for (const declaration of […])` array of the item-2 pin). Nothing else in the file changed in that commit.

**No `expect(` line changed.** The file's `git diff` for commit `fb44a02` shows the pin's single
assertion `expect(CARD_CSS).toContain(declaration);` as unchanged context; the three frame declarations
are new array entries. Assertion count in the file: 16 `it`s before, 19 after (`+3`, all from item 1);
no `it`/`describe` was deleted, renamed away from an outcome, skipped or made `.only`/`.each`.

Left deliberately alone: the trailing comment "The third half of **AC8** — the popup and the options page
gained no icon control and lost no word — is a source scan and lives in
`tests/content-create-card-boundaries.spec.ts`". That sentence names task **AC8** correctly (popup/options
untouched) and the reviewer's remark 2 did not list it.

---

## Gates (order `A62`: build → test → checker; `echo "exit=$?"` on the line right after each command, never after a pipe, never in a `&&` chain; tails of log files)

Final run at HEAD `fb44a02`:

| command | exit | measured output (tail) |
|---|---|---|
| `npm run build` | `exit=0` | `[build] dist/ is a self-contained MV3 folder (10 files)` |
| `npm test` | `exit=0` | `Test Files 45 passed (45)` / `Tests 957 passed (957)` |
| `node scripts/check-agent-config.mjs` | `exit=0` | `0 error(s), 0 warning(s), 135 info(s)` |
| `npm run typecheck` (supporting, not a gate) | `exit=0` | no output |

Same triple was run green before each of the two commits (at `6bb0307`: 957/45, 135 infos; the first
checker run showed the 135 count already, because the spec bullet caused it).
Baseline before this task: 954 tests / 45 files / 134 infos. Delta: **+3 tests, +1 info, 0 new files**.

Other commands run (evidence, all read-only unless stated):

- `git log --oneline -1`, `git status --short` (clean after each commit; `git diff --cached --name-only | wc -l` → `0`), `git diff --stat`, `git diff -U2 tests/content-card-actions.spec.ts`, `git diff f77dd46..HEAD -- docs/specs/content-overlay-ui.md`.
- Forbidden-path check over the range — `git diff --name-only f77dd46..HEAD -- <path> | wc -l` for each: `src/core` 0, `src/popup` 0, `src/options` 0, `src/manifest.json` 0, `src/content/text.ts` 0, `package.json` 0, `package-lock.json` 0, `.pi` 0, `scripts` 0, `docs/specs/inline-comment-model.md` 0, `docs/specs/code-review-flow.md` 0, `docs/specs/INDEX.md` 0, `docs/state` 0. Full range name list is the 4 files in the table above.
- `grep -rn "tabindex" src/` → `exit=1` (no hit). `grep -rn "Отмена" src/` → `exit=1` (no hit).
- `grep -n "b9bec4\|0, 0, 0, 0.18\|#ffffff" src/content/overlay/card-style.ts` → `94, 95, 97, 113, 114, 144, 172`.
- `npx vitest run tests/content-card-actions.spec.ts` → `exit=0`, 19 tests.
- Mutation check + `git checkout -- src/content/overlay/card-style.ts` (the only write outside the briefed edit set, reverted in the same step).
- `grep -c "b9bec4" dist/content.js` → `4`; `grep -o "box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);" dist/content.js` → present.

---

## "Also true after this task" self-check (`t7-01b` state file)

- Icon-only buttons keep `aria-label`/`title`, the 24×24 hit box and explicit SVG geometry (`A114`): the
  `AC3, AC4` and `AC5` describes are unchanged in both commits and green; the new pins assert the same
  two buttons from the row's side.
- `Esc` and a `pointerdown` outside the host remain the only closes; `Ctrl/Cmd+Enter` saves; no
  `tabindex`: `AC6`/`AC7` describes and the `content-create-card-boundaries` scans unchanged and green;
  `grep -rn "tabindex" src/` → exit 1.
- Model AC2 as corrected by `A115` (Save **enabled** at `256/256`, disabled only while the trimmed
  comment is empty): the pin is unchanged and green — it now sits at
  `tests/content-card-actions.spec.ts:462-464` (see the stale-pointer note below).
- Frame colors unchanged in the shipped CSS: `card-style.ts` has an empty diff in range.

## AC self-check against the brief

- AC of item 1 — "the editor DOM for a foreign entry contains **no** `.actions` node": pinned
  (`querySelector('.actions')` → `null`). ✔
- AC of item 1 — "for the reader's own entry the row exists and holds exactly the two icon buttons":
  pinned (row present, 2 children, both `BUTTON` with an `svg` child, names `Сохранить`/`Удалить`). ✔
- AC of item 1 — "the authorship rule itself is untouched (model AC8)": `src/core/` and
  `docs/specs/inline-comment-model.md` diffs are empty; the A25 pin survives unchanged; the new spec
  bullet says so in words. ✔
- AC of item 1 — "the read-only editor still opens, shows the note and closes": pinned at component
  level (see interpretation note). ✔ with the level stated.
- AC of item 2 — three declarations added to the named stylesheet-text pin, read from `CARD_CSS`:
  added; mutation check proves they bite. ✔
- AC of item 3 — relabel to the task's numbers, assertions untouched: 3 `describe` labels + header;
  zero changed `expect(` lines. ✔
- Boundaries: only the 4 allowed paths changed; every forbidden path 0. ✔

## Deviations

None. No new dependency, no CSS change, no new UI string, no `src/core`/popup/options change, no test
deleted or weakened.

## Open questions / items for the PM (all in files this task is forbidden to touch)

1. **Stale line pointer created by this change (needs a one-line PM edit).**
   `docs/specs/inline-comment-model.md:134` (model AC2, ruling `A115`) cites
   `tests/content-card-actions.spec.ts:395-397`; item 1 inserted 3 `it`s above it, so that pin is now at
   **`tests/content-card-actions.spec.ts:462-464`** (the `256/256` assertion, the `disabled === false`
   assertion, and the closing brace). `inline-comment-model.md` is PM-owned (`A76`), so I reported it
   instead of editing it. The companion pointer `src/content/overlay/create-card.tsx:82-88` is still
   correct — that file was not touched. Historical `docs/state/t7-01-review.md` line references moved
   the same way; they are run records, and `A116` keeps them byte-intact, so no action is proposed.
2. **Checker info count is now 135** (was 134): the new spec bullet references
   `tests/content-card-actions.spec.ts` and the checker reports a spec-referenced path as
   "planned path not created yet". README already says 135. If the PM wants the count back down, the
   fix is in the checker's path-existence rule, not in the spec sentence.
3. **Optional spec sync the PM may or may not want:** AC27's list of pinned non-action rules still reads
   "width, `font-size`, the counter and its colors, the `refusal line`" — it does not name the frame
   colors, which are now pinned too. The claim "the frame colors are unchanged" lives in the
   "Nothing else about the card moved" rule bullet, and that bullet is now backed. I did not extend
   AC27's list because the brief scoped the spec edit to the action-row lines.
4. **Run 5 browser item 6 is still open for the user** (the dead strip was a visual claim; jsdom pins the
   DOM, not the paint). The reviewer's Run 5 list item 6 should now read: open the tooltip of a foreign
   entry — but note that per `A25` a foreign tooltip click opens **nothing**, so the case the browser can
   reach is the reader's own editor (row present) plus the confirmation that no page path shows a
   read-only editor at all.

## Residual risks

- The frame-color pin is a **stylesheet-text** pin: it proves the three declarations and the frame rule's
  selector exist in `CARD_CSS`, and the selector marker closes the "declared only for the textarea"
  hole, but jsdom measures no layout box. The measured 24×24 and the visual frame remain browser items
  (Run 5 items 2 and 6).
- The new pins mount the component directly (as the pre-existing A25 pin does). No shipped page path
  renders `canEdit === false`, so this slice cannot regress a real page state into an empty row — but it
  also means the empty-row defect could only ever have been seen in the browser, not reached from a
  tooltip click.
