# Retro

## Harness setup (2026-11-16)

- What failed: first checker run reported 8 errors — role bodies were shorter than the 30–55 line rule,
  the `Not for:` check did not accept the `## Not for:` heading form, and a spec referenced `docs/state/`
  before that directory existed.
- Why: the line-count rule was implemented as "non-empty lines" while the bodies are written compactly;
  the `Not for:` regex assumed a bare line; directory creation was assumed to happen with the implementation.
- Fixes now encoded: checker counts body lines including blank separators and accepts a heading form of
  `Not for:`; `docs/state/README.md` exists from the harness stage; planned implementation paths
  (`src/`, `tests/`, `dist/`) are reported as info instead of error, which keeps the harness-only stage honest.
- Residual risk: the green gates `npm test` and `npm run build` reference a `package.json` that does not
  exist yet, so the first implementation task must create it before the gate rule can be enforced.
- Discovery failure found by the smoke stage: `allowedAgents: []` in a role frontmatter is parsed by Pi as the
  literal entry `"[]"`, and both specialist roles were reported as invalid definitions (not launchable).
  Fix: write `allowedAgents:` with no value; the checker now rejects the flow-style empty list form. The
  "specialists do not delegate" guarantee is carried by the missing `subagent` tool plus `maxSubagentDepth: 1`.
- Smoke finding: the first `project-manager` run was rejected by the automatic acceptance gate ("commands-run evidence
  missing") because the brief forbade commands while `acceptance: checked` demands command evidence, and that role has
  no bash tool at all. Fix encoded in `docs/specs/code-review-flow.md` and the PM role body: the engineer owns and
  quotes the gates, the PM verifies the quote, `code-reviewer` may re-run the read-only checker; smoke and read-only
  probes are launched with `acceptance: { level: "none", reason: ... }`. The second attempt passed.
- Smoke finding: a read-only role refuses to create its own log file and returns the artifact inline. Correct behavior;
  the PM writes such logs as bookkeeping.
- Smoke result: all three roles started, got exactly their allowlisted tools, their own skills, fresh context ("nothing
  was discussed before me"), and the session model with thinking off. Evidence: `docs/state/smoke-*.md`.

## Stage 1 — core storage rules (2026-11-16)

- What failed: three of six tasks (`t1-03`, `t1-05`, `t1-06`) died at the 1800000 ms ceiling while writing two layers
  at once; single-layer slices finished inside it. Why: the ceiling was sized for a one-layer slice, and a slice that
  mixes domain code + an adapter + a new test harness costs roughly twice as much wall time on this runtime.
  Fix encoded: `timeoutMs` raised to 3600000 (ruling `A19`, profile first, roles next, checker now reads the number
  out of the profile instead of hard-coding it) plus the "≤5 substantive AC per two-layer slice" rule in
  `docs/specs/code-review-flow.md` and in `.pi/skills/delivery-planning/SKILL.md`.
- What failed: a timed-out run left correct code uncommitted, so the next attempt had to rediscover it. Why: the brief
  put the commit at the end of a long list. Fix encoded: every cross-layer brief now states the work order
  (test gate first → AC audit → spec → gates → commit) and says a committed green state with a short report is accepted
  while an uncommitted perfect one is not.
- What failed: my own premise about the storage key was wrong twice — `notes:v1:<url>` is not a legal key, and the
  budget I computed for it was one character too large. Why: I treated a plausible Chrome constraint as a verified
  fact and derived a constant from it. Fix encoded: the constraint is recorded as a project rule, not a platform fact,
  and the empirical check (store a key with an escaped character through the real `chrome.storage.local`) is an explicit
  Stage 3 smoke item; the reviewer is told to challenge such premises.
- What failed: the `code-reviewer` run ended with "Acceptance rejected: Structured acceptance report not found" even
  though the review was complete. Why: a read-only role inherited `acceptance: checked`, which demands command
  evidence the role is not allowed to produce. Fix encoded: `acceptance: { level: none, reason: … }` in that role and
  the rule in `docs/specs/code-review-flow.md`.
- What failed: review artifacts lived only in the runtime's artifact directory, so later briefs cited paths that did
  not exist in the repo (`docs/state/t1-03-review.md`). Why: I assumed the runtime persists an output path into the
  working tree; it does not for a read-only role. Fix encoded: the PM copies every review artifact into
  `docs/state/<task-id>-review.md` and commits it; briefs may only name paths that exist.
- What went right and is worth keeping: the completion-brief pattern (the hand-over is already in the tree, so the
  second attempt runs the test gate first) turned two of the three timeouts into accepted tasks on attempt 2, and
  `t1-06` attempt 2 fixed a real bug the attempt-1 tests had already described.

## Stage 2 (anchors and overlap) — 2026-11-16

- What failed: `t2-02` and `t2-03` both hit the **raised** 60-minute ceiling. Why: `t2-02` was a two-layer slice with a
  brand-new jsdom harness, and `t2-03` carried 5 AC **plus** 4 review fixes — nine work items in one run. Fix encoded:
  the carried-fix budget rule in `.pi/skills/delivery-planning/SKILL.md` and ruling `A48` (more than two carried
  findings ⇒ their own slice: `t2-04`, `t3-04`).
- What failed: a **PM-authored contract was wrong** — the `t2-01` review told `t2-02` to map stream offsets with
  `utf16IndexAt(stream, start)`, which is incorrect for nodes with internal whitespace runs. The engineer deviated and
  was right. Fix encoded: hand-over paragraphs are labeled as contracts to be challenged, and the reviewer records the
  accepted drift (`t2-02` remark `N6`) instead of treating it as a violation.
- What failed: a test fixture asserted the opposite of the rule in its name (`A24` case expected `null` for a range that
  really overlapped `[10,20)`) — the shipped code was correct. Fix encoded: the reviewer must check that a rule-named
  test **cannot pass vacuously** and that a red test is diagnosed as code-or-fixture before it is "fixed".
- What failed: two code rules shipped with no spec clause (`A27`, `A28`) and the engineer report did not list that
  deviation. Fix encoded: `t2-04` AC3 lands the missing clauses, and review briefs now ask explicitly for
  "code rule without a grep anchor in the spec".
- What went right: the completion-brief pattern converted both timeouts on attempt 2 without losing code, and review
  artifacts copied into `docs/state/` became the actual hand-off contract (`t2-02` → the selection-to-stream contract in
  `t3-01`, `t2-03` → the `ResolvedSpans` shape), which is what the process was supposed to produce.

## Stage 3 (interim, recorded before the stage closes)

- What failed: a **whole class of offset-domain bugs survived 523 green tests** because the astral fixture put the emoji
  *inside* the selection instead of before it. Fix encoded: review briefs now ask per fixture "would this have failed on
  the pre-fix code?" and the reviewer answers it as a finding if not (`t3-01b` check list).
- What failed: the **PM brief contradicted the spec** — `t3-02` was written with "a single highlight name" while
  `content-overlay-ui.md` line 47 and `A38`/`A39` say one named highlight per entry (`A70`). Fix encoded: a brief quotes
  the spec line it implements; where they disagree, the spec wins and the brief is corrected *before* delegation.
- What failed: a **doc-comment asserted the opposite of the code** for the second time (`t3-01b` remark 1, after the
  `t3-01` finding was exactly that). Fix encoded: a fix commit rewrites the comment of the function it fixes, and the
  inaccurate clause is tracked as accepted debt, not left in a remark list.
- What failed: the engineer report's per-file test counts did not add up to the quoted total. Fix encoded: the report
  format now requires per-file counts that sum to the total (`t3-02` brief onward).
- What went right: the **fix-slice** move (`t3-01b`) closed a blocking finding without a forbidden third attempt on the
  parent task, and its review answered the parent's AC re-check explicitly — that is the first time the process closed a
  loop through a review artifact rather than through a conversation.
