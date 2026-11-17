# t3-02b-carried-test-fixes

Fix slice opened by ruling `A48`/`A72` because `t3-02` reached its child ceiling with two carried fixes
undelivered (review `docs/state/t3-02-review.md`, blocking findings 1–3). **Tests and spec only: this task
changes no production code.** Precedent for the shape: `t3-01b`.

## Goal

Make the two carried review findings of `t3-01` (remark 4, remark 5) actually pinned by tests, and make the
"carried fix vanished silently" failure mechanically impossible in the next task.

## PM rulings this task implements

- `A74` (**assumption, applied as the least-risky default; flagged to the user**): opening the create card
  **does not move focus**. The page keeps its focus; the user reaches the card with `Tab`. Rationale: the
  extension never mutates the host page (overlay AC2), and stealing focus from a page the user did not ask
  to change is the same class of intrusion; implementing focus-on-open would be a behavior change needing a
  spec line and a production edit, which this slice forbids. Close the finding by **pinning what ships**:
  one spec sentence saying focus is not taken, one test proving `document.activeElement` is not the card
  after `open()`, one test proving the card's controls are in the rendered tab order.
- `A72`: the engineer report of this task answers the numbered Carried-fix checklist below with
  `done` + `path:line` or `skipped` + reason. The same rule is already written into
  `.pi/skills/delivery-planning/SKILL.md` and `.pi/skills/code-review-checklist/SKILL.md` (commit `41c940e`);
  this task adds the durable line to `docs/specs/code-review-flow.md`.
- `A29` (unchanged): saving re-derives the span against a stream built at the save moment. The property has
  no test that mutates the DOM **between open and save** — that is finding 2 and it belongs here.

## AC (3 substantive + gates)

1. Keyboard reachability is pinned, not asserted in prose. In `tests/content-create-card-widget.spec.ts` or
   `-controller.spec.ts`: after `open()` the card's `<textarea>`, `Сохранить` and `Отмена` are in the
   rendered tab order (`tabindex` untouched, all focusable, order = textarea → Сохранить → Отмена),
   `Esc` cancels and closes, `Ctrl/Cmd+Enter` saves, and `document.activeElement` is **not** inside the
   shadow host (`A74`). `docs/specs/content-overlay-ui.md` ("The card and the editor must be reachable by
   keyboard…") gains the shipped rule: focus is not taken on open.
2. The `A29` save-moment property is pinned at the **card** call site: open the card over a selection,
   mutate the DOM under that selection (rewrite the text node so the selection's old node-local offsets
   now point at different words, keeping the normalized text findable elsewhere in the same subtree), press
   `Сохранить`, and assert the stored entry's anchor/span comes from the mutated document — not from the
   offsets measured at open time. Second case: mutate so the text is gone → `selection_lost`
   (`text.ts:62`) and nothing written. Neither case may call `createNote` directly; it goes through the
   controller's save path (`create-card-controller.tsx`).
3. `docs/specs/code-review-flow.md` states the checklist rule mechanically: every brief lists its carried
   fixes as numbers; the report answers every number; a carried number answered by nothing is a blocking
   finding regardless of the AC verdict; and the review artifact carries one line per number.

## Explicitly out of scope

Any change under `src/` (production code). If a test written here proves a real defect, **report it**, do not
fix it: the fix becomes its own task with its own budget. No editor work (`t3-03`), no popup/options
(`t4-01`, `t4-02`), no harness files.

## Carried-fix checklist (the report must answer each number)

1. `t3-01` review remark 4 — keyboard reachability of the card (AC1 here).
2. `t3-01` review remark 5 — DOM mutation between open and save for `A29` (AC2 here).
3. `t3-02` review finding 3 — the report must not be silent about a deliverable (AC3 here, plus this task's
   own report as the demonstration).

## Work order (`A53` + crash insurance `A73`)

1. Read the current tests named in `docs/state/t3-02-review.md` findings 1–2 before writing anything.
2. Write the tests, run `npm test` through `--reporter=basic` piped through `grep`/`tail` (never a full log).
3. **Commit 1** `test(t3-02b): pin card tab order and the save-moment re-derive` as soon as the gates are
   green.
4. Spec lines (`content-overlay-ui.md` keyboard rule + `code-review-flow.md` checklist rule) →
   **commit 2** `docs(t3-02b): keyboard reachability and the carried-fix checklist rule`.
5. Report to `docs/state/engineer-report.md`: commits, quoted gates in the `A62` order
   (`npm run build`, `npm test`, `node scripts/check-agent-config.mjs`), the Carried-fix checklist answered
   by number, an AC1–AC3 self-check, deviations.

## Attempts log

- attempt 1: brief prepared after the user approved the fix slice (2026-11-17).
- attempt 1 **delivered** (`a6997f9` tests, `3462d2a` spec; report copied to `docs/state/t3-02b-engineer.md`).
  The engineer touched no file under `src/` — verified by the file list of both commits. PM re-ran the gates
  personally: `npm run build` green, `npm test` **626/626** over 33 files (+7 tests vs `t3-02`), checker
  **0 errors**, tree clean. The Carried-fix checklist was answered by number, all three `done` — the `A72`
  rule worked on its first use.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **1** (attempt 1 engineer, delivered).
Remaining: 1 (the reviewer, who also performs the **parent-closure re-check** of `t3-02` findings 1–2 and must
state the parent verdict explicitly — precedent: `docs/state/t3-01b-review.md`).
The reviewer of this task also performs the **parent-closure re-check** of `t3-02` findings 1–2 and must
state the parent verdict explicitly (precedent: `docs/state/t3-01b-review.md`).

## Verdicts

- engineer report: attempt 1 delivered, copied to `docs/state/t3-02b-engineer.md`
- reviewer verdict: not started
- parent `t3-02` verdict: held open until this task's review re-checks findings 1–2

## Open questions

- `A74` is an assumption pending the user's word; reverting it is one spec sentence plus one production line
  in `create-card-controller.tsx` `open()`, as its own task.
