# Task `t5-04-focus-on-open` — opening a card puts the caret in the note field

Stage 6, task 1. Owner: `extension-engineer`. Ruling: **`A97`** (overturns `A74`) plus the shape ruling **`A105`** below.
Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` (the `focus on open` Terms row, the Rules bullet at `:129`,
AC17 at `:253`).

## Goal

The user asked for the intrusion: select text → the caret is already in the note field; click a tooltip → the caret is already in
the field with the comment. `A74` ("opening the card takes no focus") is **overturned**, and with it the keyboard-path debt from
browser verification item 1.

## Shape the PM chose (`A105` — do not redesign)

- Focus goes to the **`textarea`** of the create card and of the editor, on open.
- Both call sites pass **`preventScroll: true`**. The overlay host is `position: fixed`, so a scroll would be the page moving
  under the reader; `preventScroll` is the API-level guard and it is pinned at the call shape, because jsdom cannot show a scroll.
- **Closing restores the focus** the page had before the open — cancel, `Esc`, a successful save, and a delete all hand focus back
  to the element that had it, **if that element is still connected**. If it is gone, focus is left where the browser puts it; do
  not force `body` or `documentElement`. Rationale (this is a PM decision, not the user's word, so it is recorded as an
  `Assumption:`): without it, closing a card would leave the document's active element inside a removed shadow tree and the
  reader would have to tab through the whole page again to get back.
- No `tabindex` is introduced anywhere: the rendered order stays the tab order (`t3-02b` AC1 survives).

## Acceptance criteria (observable)

1. Opening the create card makes its `textarea` the active element inside the overlay host.
2. Opening the editor through a tooltip click (`t5-03`) makes its `textarea` the active element, with the stored comment already
   in it.
3. Both focus calls pass `preventScroll: true` — pinned on the call shape (a spy over the focus method recording its argument),
   since no test DOM can demonstrate a scroll.
4. Cancel, `Esc`, a successful save and a delete each restore the previously focused element when it is still in the document;
   when it is not, nothing is forced and the test asserts exactly that.
5. `Esc` closes and writes nothing; `Ctrl/Cmd+Enter` saves — the existing pins survive unchanged.
6. No control carries a `tabindex`; the rendered order `textarea` → `Сохранить` → `Отмена` is still the tab order.
7. Every pin that asserted "no focus moves" is **rewritten to the new rule, not deleted**; the report lists each rewritten pin by
   file and line. Deleting one of them is a blocking finding.
8. The spec carries no leftover `A74` promise: the Terms row, the Rules bullet and AC17 all state the `A97` rule, and the word
   `Assumption:` appears where the focus-restore half is my decision rather than the user's.
9. No new Russian string; `src/popup/`, `src/options/`, `src/manifest.json`, `src/core/`, `src/content/paint/**` untouched.

## Boundaries

- Allowed: `src/content/overlay/**`, `src/content/main.ts` only if a call site needs it, `tests/`,
  `docs/specs/content-overlay-ui.md`.
- Forbidden: `src/core/`, `src/content/paint/**` (except the comment line of carried item 1), `src/content/create/**`,
  `src/content/editor/**`, `src/popup/`, `src/options/`, `src/manifest.json`, dependencies, harness files, the other PM-owned
  specs (`A76`, `A89`).
- Do not touch the task state file `docs/state/t5-04-focus-on-open.md`; write your report to your own artifact.

## Carried-fix checklist (`A72`)

1. `src/content/paint/paint-plan.ts:105` still points at `editor/painted-selection.ts`, a module deleted in `t5-03`. Fix the
   sentence (one comment line, no code). Report `done` + `path:line`.
2. `src/content/overlay/contained-own-selection.ts:87` cites `src/content/anchor/anchor-resolve.ts` — a path that has **never**
   existed in this repository; the rule it means lives at `src/core/anchor-resolve.ts`. One comment line.
3. `src/content/overlay/editor.tsx:5-7` points at "Flow / Sequence 5-6" and at the Rules sentence "The editor is opened by a
   selection, never by a foreign entry" — `t5-03` deleted that rule and renumbered the flows. Point the header at the shipped
   rule ("opened by a click on the `tooltip`, never by a page `selection`"). Comment text only.
4. `src/content/overlay/create-card.tsx:22` cites `create-card-controller.ts`; the file is `.tsx`.
5. Stale AC numbers in shipped comments: `src/content/overlay/tooltip-style.ts:9` and `:41` and `src/content/overlay/tooltip.tsx:31`
   cite "task `t5-03` AC7" for the single-opacity rule, which is AC1 of that task. Comment text only.
6. Stale AC numbers in five test names: `tests/content-editor-controller.spec.ts:480` ("t5-03 AC1" → AC2 material), `:505`
   (AC2 → AC3), `:523` (AC3 → AC7), `:563` (AC8 → AC3/AC9), and `tests/content-tooltip.spec.ts:472` ("AC8" → AC2 material).
   Rename to the AC they actually pin; do not touch the assertions.

Every item above is a **comment line**; report each as `done` + `path:line` or `skipped` + reason (`A72`).

**Boundary exception (`A90` naming rule):** items 1–5 are **comment-only** changes in `src/content/paint/paint-plan.ts`,
`src/content/overlay/contained-own-selection.ts`, `src/content/overlay/editor.tsx`, `src/content/overlay/create-card.tsx`,
`src/content/overlay/tooltip-style.ts` and `src/content/overlay/tooltip.tsx`; item 6 changes **test names only**. No shipped
string, no code, no signature, no rule, no assertion. Cite the carried number in the commit message.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec first (`A74` → `A97` in all three places), commit at green.
2. Behavior + rewritten pins, commit at green.
3. New pins for AC3–AC6, commit at green.
4. Carried items, commit at green.
Every gate with its own exit status, `echo "exit=$?"` on the line right after the command. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: **2 of 4** — engineer (five commits, no escalation), reviewer.

## Attempts log

- **attempt 1 delivered** in five commits: `d3ca568` (spec), `729695c` (behavior — new owner
  `src/content/overlay/focus-handoff.ts`), `b770066` (pins: 8 focus-handoff + 4 editor + 3 create-card, support recorder
  `tests/support/focus-calls.ts`), `0d0c749` (carried 1–6), `4a630c8` (one comment rewrap). PM-measured gates: typecheck exit 0,
  `npm test` exit 0 → **872 / 44 files** (+15 over `t5-03`), checker exit 0 → 0/0/106, build exit 0 → `dist/` 10 files, tree clean.
  The `A74` pins were rewritten in place rather than deleted, and the engineer left my `t5-06` card untracked instead of sweeping
  it into its commit.
- **review verdict: `accepted`** (`docs/state/t5-04-review.md`) — 9/9 AC pass, 0 blocking, carried 1–5 done and 6 delivered as
  name-only renames; 8 non-blocking remarks, of which **five** are carried forward (stale AC citations in test names and headers,
  the `restore` call's `preventScroll` half missing from the spec, two unpinned close paths, browser items a–d).
- **PM closed two of the reviewer's own findings about my briefs**: `docs/project-profile.md:101` still carried the pre-`A97`
  "or steal focus" constraint (fixed personally — the profile states constraints and it is PM-owned), and the AC6 grep claim
  `grep -rn tabindex src/` is not literally satisfiable because a doc comment matches; future briefs must state the criterion
  (no **control** carries a `tabindex`), not a grep that over-matches comments.
