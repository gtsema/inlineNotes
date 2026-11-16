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
