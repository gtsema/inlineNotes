# code-review-flow

## Purpose / Goal

Define how an implementation task is reviewed and accepted in this repo: who reviews, what evidence the reviewer must look at, what verdicts exist, and how findings are closed. Review is mandatory: no implementation task is accepted without it.

## Scope

In scope: the review request format, the reviewer's read-only duties, verdict vocabulary, the re-attempt budget, the gate commands, the spec/code conflict path.
Out of scope: product behavior rules (owned by `docs/specs/inline-comment-model.md` and `docs/specs/content-overlay-ui.md`), the orchestration budgets themselves (owned by `AGENTS.md` → Orchestration Budgets).

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `task state file` | — | `docs/state/<task-id>.md`, the review ledger |
| `green gates` | «зелёные ворота» | commands that must pass before review starts |
| `blocking finding` | — | finding that prevents acceptance |
| `non-blocking finding` | — | recorded remark, does not block |
| `verdict` | — | `accepted` / `changes requested` / `blocked` |
| `re-attempt` | — | second attempt of a task with a changed brief |

## Flow / Sequence

1. The PM writes the brief: Task / Input paths / Output path / Acceptance criterion / Constraints, and the task state file `docs/state/<task-id>.md` with the expected delegation count and the task's AC copied from the spec.
2. `extension-engineer` implements, runs the gates, and writes a report file with the changed paths, the commands run, and the AC self-check.
3. The engineer runs the green gates (`npm test`, `npm run build`, `node scripts/check-agent-config.mjs`) and quotes their output in the report. The PM has no shell tool, so it verifies that the quote is present and complete; when a quote is missing or doubtful, the PM asks `code-reviewer` to re-run the read-only checker `node scripts/check-agent-config.mjs`.
4. The PM delegates to `code-reviewer` with the diff range (`git diff <base>..HEAD` or the commit list), the spec path, and the report path.
5. `code-reviewer` inspects only the artifacts, the code, the spec AC and the git diff, and writes its review to the path given in the brief (default `.pi/reviews/<task-id>-review.md` under the managed output routing).
6. Verdict is recorded in the task state file: `accepted`, `changes requested` with numbered blocking findings, or `blocked` with the reason.
7. On `changes requested` the PM re-briefs `extension-engineer` with the concrete findings (the PM never edits code itself). One re-attempt is allowed.
8. After acceptance the engineer's commit is final, the spec is confirmed as edited in the same commit when behavior changed, and the state file is closed with a one-line outcome.

## Rules / Semantics

- Green gates are blocking: a task with a failing `npm test`, a failing `npm run build`, or a failing `node scripts/check-agent-config.mjs` cannot be reviewed or accepted. Known failing baseline: none, 100% green is required.
- Every brief to a role that owns the change must require a `Commands run` section in the report. The harness acceptance gate rejects a report without command evidence. A task that deliberately forbids commands (smoke checks, read-only probes) is launched with an explicit acceptance reason instead of the default gate.
- The reviewer is read-only: `read, grep, find, ls, bash`; bash is limited to read-only git (`git log`, `git show`, `git diff`, `git status`, `git ls-files`). No edits, no `git add/commit/checkout/push`.
- The review artifact must quote the AC line it checks for every AC, and must state for each: `pass`, `fail`, or `not covered by tests`.
- A finding must name the file and the line or the spec section; "improve the code" is not a finding.
- Blocking only when: an AC is not met, a spec rule is violated, a forbidden dependency or network call appears, tests are missing for a rule the AC lists, or the change mutates host-page DOM for painting.
- Style-only remarks are non-blocking.
- Spec vs code conflict is never resolved silently: the reviewer reports it as `blocked` and the PM decides (fix code, or edit spec and re-review).
- A behavior change without a spec edit in the same commit is a blocking finding.
- Exception (ruling `A69`, from `t3-01b` review remark 6): when the brief mandates the `A53` commit-early sequence, the
  behavior commit and the spec commit are two commits, and the rule is satisfied **for the task as a whole** provided
  both commits are inside the reviewed range and the brief names the spec file. The reviewer records the split as a
  remark, not a finding; a spec edit that lands in a *later* range is still a blocking finding.
- Budgets: at most 2 attempts per task; the second attempt must carry a changed brief. A third attempt is forbidden and the PM stops and asks the user. A runtime timeout of a run counts as a failed attempt; the unfinished work may stay in the working tree and the next brief is a completion brief.
- Slice size is a review input: a `src/core/` slice carries at most 5 substantive acceptance criteria, so that one attempt fits inside the role's `timeoutMs`. The brief states the work order explicitly: run the gates first, then edit the spec, then commit.
- The reviewer role declares `acceptance: { level: "none", reason: … }` (a bare `"none"` is rejected by the runtime). A read-only reviewer emits no structured acceptance report: its evidence is the review artifact, and the PM copies the verdict into the task state file. The engineer role keeps `acceptance: checked`, because its report must carry command evidence.
- The PM accepts against the artifact and the code, never against the engineer's summary.

## Edge Cases

- No git history yet (fresh repo): the review range is the working tree diff against the initial commit; if there is no commit yet, the reviewer states that and reviews the files listed in the report.
- Task touches only docs/specs: the reviewer still reviews, but the `npm test` and `npm run build` gates are replaced by "no source file changed" and the checker gate stays mandatory.
- Task changes `.pi/agents/`, `.pi/skills/`, `docs/specs/` or `.pi/settings.json`: `node scripts/check-agent-config.mjs` must be re-run in the same task and its output quoted.
- The change to `timeoutMs` must first land in `docs/project-profile.md` → Runtime Model, then in role frontmatters in the same commit; otherwise it is a blocking finding.
- Reviewer cannot run the build (read-only): the engineer's report quotes the gate output, and the reviewer may re-run only the read-only checker `node scripts/check-agent-config.mjs`. The reviewer verifies the quote is present, not that it is truthful.
- Empty diff or a report file that names paths that do not exist: verdict `blocked`.

## Acceptance Criteria

1. Every implementation task in `docs/state/` has a review section with a verdict and a linked review artifact path.
2. Every review artifact contains one line per AC of the task's spec section with `pass` / `fail` / `not covered by tests`.
3. No task is marked `accepted` while a green gate fails.
4. A task with `changes requested` never proceeds to a third attempt: the state file shows at most 2 attempts.
5. The reviewer's tool set is read-only and the review contains no evidence of file mutation.
6. A spec-vs-code conflict appears in the state file as `blocked` with a decision recorded by the PM.
7. `node scripts/check-agent-config.mjs` reports 0 errors after any harness change, and the review of a harness task quotes it.
