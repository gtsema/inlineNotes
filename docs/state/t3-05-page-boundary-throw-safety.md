# t3-05-page-boundary-throw-safety

Slice opened by ruling `A75` from `docs/state/t3-02b-review.md` remark 1 and `docs/state/t3-02-review.md` remark 4.
Both are the same shape: **a page call that can throw in a real engine has no guard and no test**, and a doc-comment
asserts the opposite. Production code changes here; no UI surface is added.

## Goal

A page that mutates under the extension may never wedge the extension: the save path refuses with a Russian line and the
card stays usable, and the load-time paint pass cannot reject.

## PM rulings this task implements

- `A75`: a throw from a page-boundary call is caught **at the content-layer call site**, converted into the existing refusal
  code, and never into a stuck widget. Core keeps throwing its own errors — the guard sits where the page is touched
  (`src/content/capture/selection-span.ts` → `create-note.ts` → `create-card-controller.tsx`), not in `src/core/`.
- jsdom cannot produce this throw, so the seam is **injected**: a range stub whose `intersectsNode` throws an
  `InvalidAccessError`-shaped object. A test that only simulates detachment (`false`) does not cover this task.
- A doc-comment may not assert more than a test pins (`t3-01` finding family, `A63`): either the claim gets a test or the
  comment states what is actually true.

## AC (3 substantive + gates)

1. Saving over a selection whose text node was detached (or whose range's root differs from the node's root) answers
   `selection_lost` (`src/content/text.ts:62`), writes nothing, and leaves the card **not** `busy`: `Сохранить` stays
   rendered and the user can still press `Отмена`/`Esc`. Today `range.intersectsNode` (`selection-span.ts:150`) throws
   `InvalidAccessError` per the DOM spec in exactly that state, `create-note.ts:104` rejects, and
   `create-card-controller.tsx:128-146` does not catch, so the card freezes with `Сохранить` disabled and no message.
   The guard is at the save call site; the test injects the throwing range.
2. `createPagePainter.refresh()` cannot reject and leaves no unhandled rejection: a storage read that throws and a
   measurement that throws both end in an empty paint plus the code in the outcome. `src/content/main.ts:57` runs
   `void painter.refresh()` with no handler, so the guarantee must hold inside the painter, and the "never throws"
   comment at `page-painter.ts:70` becomes a pinned property instead of a wish.
3. The content layer's page-boundary throws are enumerated in one spec place (`content-overlay-ui.md` → Edge Cases or
   Rules): what may throw, what the user sees when it does (no highlight / refusal line / no tooltip), and where the catch
   lives. Every shipped `catch` in `src/content/` either has a test or is named in that list.

## Explicitly out of scope

The editor (`t3-03`), popup and options (`t4-01`, `t4-02`), SPA watching and `storage.onChanged` (`t4-03`), any change of
a refusal code or a Russian wording (the vocabulary is fixed by `text.ts` and the model spec).

## Work order (`A53` + `A73`)

1. Reproduce the freeze in a test **before** fixing it (inject the throwing range; assert the frozen state fails, then make
   it pass) — a fix without a failing test is not accepted.
2. `npm test` green → **commit 1** `fix(t3-05): guard the page-boundary throws at the content call sites`.
3. Spec list + the rewritten comments → **commit 2** `docs(t3-05): page-boundary throw rules`.
4. Report to `docs/state/engineer-report.md` with the Carried-fix checklist answered by number (rule `A72`).

## Carried-fix checklist (the report must answer each number)

1. `t3-02b` review remark 1 — detached-node `intersectsNode` throw freezes the card (AC1).
2. `t3-02` review remark 4 — `refresh()` "never throws" is unguarded and unproven (AC2).
3. `t3-02` review remark 4 family — a doc-comment asserting an unpinned guarantee (AC3).

## Attempts log

- attempt 1: brief prepared (2026-11-17), not delegated yet — `t4-02-options-name` runs first because it unblocks the
  runtime loop for the user.
- attempt 1 **delivered** (`14995da` fix + tests, `6865db2` spec + comments; report copied to
  `docs/state/t3-05-engineer.md`). Mid-run the engineer stalled on exact-match edits into the 1129-line
  `tests/content-create-card-controller.spec.ts`; the PM steered it to a **new** spec file per the briefed allowance, and
  those reverted partial edits are absent from the final diff (`git diff --stat 5375011..HEAD`). The red state before the
  fix is quoted in the report, including the four unhandled `InvalidAccessError` rejections — the defect chain the review
  named. PM re-ran the gates: build green, **672/672** over 37 files (+22), checker **0 errors** (57 INFO), typecheck
  exit 0, tree clean, `src/core/` untouched.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **2 of 4** (engineer delivered, reviewer **accepted**, 0
blocking findings; the mid-run steer is not a child). Task closed.

## Verdicts

- engineer report: attempt 1 delivered, copied to `docs/state/t3-05-engineer.md`
- reviewer verdict: **accepted**, 0 blocking findings (`docs/state/t3-05-review.md`); the reviewer independently accounted
  for the +22 test delta and reproduced the red-state chain by reading the code
- **task status: accepted** (`14995da`+`6865db2`)

## PM decisions on the review remarks

1. **Spec sentence about jsdom — fixed by the PM in this slice** (`content-overlay-ui.md`, the `adoptPaintSheet` row): the
   old wording blamed jsdom, which is false (jsdom supports constructed sheets — `tests/content-paint-style.spec.ts`).
   The true reason is an injection limit: `adoptPaintSheet` is module-private and cached per document. PM authority: a
   single-sentence spec correction, no behavior change, checker re-run green (58 INFO).
2. **Stale `authorName` after an early failure return (`page-painter.ts:178,:189`) — accepted v1 debt.** Nothing shipped
   reads `authorNameOfPass()` on a failed pass (nothing is painted, so no tooltip asks for a name), so it is not
   observable today. One line to reset it when a consumer appears.
3. **Bare `catch {}` mapping any throw onto a page-state code — accepted trade-off, recorded**: it is what the spec's
   "Where the guard sits" rule orders, and the cost is diagnostic — a defect of our own code will look like a page state.
   If a future bug is hard to find for exactly that reason, the fix is a debug-only log, not a new code.
4. **Report numbering (`A72`)**: the engineer answered every number but relabelled them (its `1` = `t3-02` remark 4, its
   `2` = `t3-02b` remark 1, its `3` = `A75`) instead of echoing the brief's numbers. Mapping: brief 1 ↔ report 2,
   brief 2 ↔ report 1, brief 3 ↔ report 3. Nothing unanswered; the rule (echo the brief's numbers) stands.
5. **Brief-vs-profile conflict on reviewer gates → ruling `A77`**: the reviewer's default duty is the checker only
   (`code-review-flow.md`, `project-profile.md`); a PM brief may order all three green gates when the task shipped code,
   and when it does, the brief is followed and the extra runs are disclosed. Here the brief won, `dist/` is gitignored, so
   the reviewed tree stayed clean.

## Open questions

- Whether `Отмена`/`Esc` must also re-enable `Сохранить` for the same selection (default: the card stays open with the text
  and the user re-selects; the refusal line names the reason). One line in the spec to change.
