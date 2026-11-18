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
- Forbidden: `src/core/`, `src/content/paint/**`, `src/content/create/**`, `src/content/editor/**`, `src/popup/`,
  `src/options/`, `src/manifest.json`, dependencies, harness files, the other PM-owned specs (`A76`, `A89`).
- Do not touch the task state file `docs/state/t5-04-focus-on-open.md`; write your report to your own artifact.

## Carried-fix checklist (`A72`)

1. `src/content/paint/paint-plan.ts:105` still points at `editor/painted-selection.ts`, a module deleted in `t5-03`. Fix the
   sentence (one comment line, no code). Report `done` + `path:line`.
2. *(the reviewer of `t5-03` may add more dead pointers of the same class; the PM numbers them into this list before the brief is
   sent — if this line is still here when you read it, the answer is "the list is one item")*

**Boundary exception (`A90` naming rule):** item 1 is a **comment-only** change in `src/content/paint/paint-plan.ts`. Cite the
carried number in the commit message.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec first (`A74` → `A97` in all three places), commit at green.
2. Behavior + rewritten pins, commit at green.
3. New pins for AC3–AC6, commit at green.
4. Carried items, commit at green.
Every gate with its own exit status, `echo "exit=$?"` on the line right after the command. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
