---
name: delivery-planning
description: |
  Decompose a request into stages and one-slice tasks, write delegation briefs and task state files,
  and enforce the orchestration budgets. Use when planning work, when a task is too big for one slice,
  when a second attempt is needed, or when the delegation counter approaches its ceiling.
license: MIT
metadata:
  audience: project-manager
  domain: orchestration
---

## What I do

- Split a request into ≤3 stages, each with a done-criterion expressed as an observable result.
- Split each stage into ≤3 tasks: one executor, one verifiable slice, one output artifact.
- Write briefs in a fixed ≤10-line form: Task / Input paths / Output artifact path / Acceptance criterion / Constraints.
- Keep `docs/state/<task-id>.md` as the memory of the task: AC, attempts, delegation count, verdicts, open questions.
- Track the budgets and stop at the ceiling instead of retrying silently.
- Report to the user: done, artifacts, risks, Definition of Done status.

## Budget table (hard)

| Budget | Limit | Action at the limit |
|---|---|---|
| Tasks per stage | 3 | renegotiate with the user |
| Stages per request | 3 | renegotiate with the user |
| Attempts per task | 2 | stop and ask; the 2nd attempt must carry a changed brief |
| Parallel children | 1 | queue; one writer per worktree |
| Delegations | expected ×2 | stop and report the counter |

## Brief rules

- Paths in a brief are concrete: the task id and the topic are already substituted, never a literal `<topic>` or `<task-id>` placeholder.
- Acceptance criterion is copied from the spec's numbered criterion, not paraphrased into vibes.
- Constraints quote the profile limits (256 characters, 20 entries per page, no network, Angular for UI layers, Preact for the overlay).
- No literal commands that depend on the runtime; link to the green gates in `docs/project-profile.md`.
- Fast path: single file plus no contract change → merge spec and implementation into one task, review afterwards.

## Slice size and timeouts (learned in Stage 1 of this repo)

- A timed-out run counts as an attempt. Do not re-issue the same brief: the second brief is a **completion brief** —
  the hand-over is already in the working tree, so the order is: run the test gate first, fix, audit AC coverage,
  edit the spec, run all gates, commit, report. State explicitly that a committed green state with a short report is
  accepted and an uncommitted perfect one is not.
- A slice that touches **two layers at once** (domain + adapter/UI + a new test harness) is the shape that overruns
  the runtime ceiling. Keep such a slice at ≤5 substantive AC, or split it into one-layer tasks; single-layer slices
  of the same size finish inside the ceiling.
- **Carried fixes count toward the slice budget.** A brief with 5 AC plus 4 carried review findings is 9 work items
  even though the AC count is legal — that is the shape that killed `t2-03` at the ceiling. If a review produces more
  than 2 carried fixes, plan a separate small cleanup slice instead of stacking them onto the next task.
- Put the work order into every brief, not into a follow-up message: the child session does not see the negotiation.
- Carry review findings forward by name (`N2`, `R6`, residual risk 4): the next brief repeats them, because the next
  engineer session has no memory of the previous review.
- Copy each review artifact into `docs/state/<task-id>-review.md`; a brief may only name paths that exist in the repo.

## Not for:

- Writing the spec content itself — see `requirements-spec`.
- Deciding product behavior or silently choosing defaults in place of the user.
- Verifying code quality — the verdict belongs to `code-reviewer`.

## Output style

- `docs/state/<task-id>.md` sections: Goal, AC (numbered, copied), Stage plan, Attempts log, Delegation count, Verdicts, Open questions.
- One line per delegation: role, task, output path, status.
- Never include another role's text; include the path to its artifact.
