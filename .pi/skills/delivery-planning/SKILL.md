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

## Not for:

- Writing the spec content itself — see `requirements-spec`.
- Deciding product behavior or silently choosing defaults in place of the user.
- Verifying code quality — the verdict belongs to `code-reviewer`.

## Output style

- `docs/state/<task-id>.md` sections: Goal, AC (numbered, copied), Stage plan, Attempts log, Delegation count, Verdicts, Open questions.
- One line per delegation: role, task, output path, status.
- Never include another role's text; include the path to its artifact.
