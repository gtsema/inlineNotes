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
