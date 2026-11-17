---
name: code-review-checklist
description: |
  Review a task diff read-only against spec acceptance criteria, tests, boundaries and repo rules, and
  produce a verdict with numbered findings. Use when reviewing an implementation task, when deciding
  accept versus changes requested, or when a spec and the code appear to disagree.
license: MIT
metadata:
  audience: code-reviewer
  domain: code-review
---

## What I do

- Read the brief, the owning spec section, the engineer report, then the code and the diff, in that order.
- Produce one line per acceptance criterion: `pass`, `fail`, or `not covered by tests`.
- Separate blocking findings from non-blocking remarks and number the blocking ones.
- Check that tests exist for every rule the spec marks testable, and that the gates were run.
- Check the brief's **carried-fix checklist** one line per numbered item. A deliverable the brief names and the diff does
  not contain is a **blocking finding even when every AC passes**, and a report that neither delivers nor declares the
  item is a finding of its own (`t3-02` findings 1–3: four clean commits, two carried fixes vanished, report silent).
- Check repo boundaries that this project cares about, listed below.
- Record the verdict as `accepted`, `changes requested`, or `blocked`.

## Review order

1. Diff scope: does the change match the briefed slice? Extra files are a finding.
2. Spec coupling: behavior changed → the owning spec in `docs/specs/` is edited in the same change.
3. Layer rules: business rules in `src/core/`, page work in `src/content/`, UI in `src/popup/` and `src/options/`.
4. Correctness against the numbered AC, including limits (256 characters, 20 entries per page) and message strings.
5. Tests: assertions on the rule, not on the mock; a rule with no test is reported `not covered by tests`.
6. Boundaries and safety: permissions, dependencies, host-page respect.
7. Verdict and findings with file and line references.

## Blocking boundary list for this repo

- Any `fetch`, `XMLHttpRequest`, `WebSocket`, beacon, or analytics endpoint in shipped code.
- New `host_permissions` or a permission that no spec or brief asked for.
- Host-page DOM mutation used to paint a highlight instead of the CSS Highlight API.
- Angular bootstrapped inside the content script, or a new runtime dependency outside Angular/Preact.
- Missing spec edit for a behavior change, or a rule duplicated across two specs.
- Russian UI strings hardcoded in many places instead of a constants module.
- Harness change without `node scripts/check-agent-config.mjs` re-run in the same task.
- `timeoutMs` changed in a role frontmatter without the change landing in `docs/project-profile.md` first.

## Not for:

- Editing code or running builds; the reviewer is read-only and quotes gate output instead.
- Deciding which of two conflicting sources (spec or code) is correct — report `blocked`.
- Planning or splitting work — see `delivery-planning`.

## Output style

- Artifact sections: Verdict, AC check (one line per numbered criterion), Carried fixes (one line per numbered item from
  the brief), Blocking findings (numbered, with `path:line` or spec section), Non-blocking remarks, Evidence (paths and
  commands quoted).
- No diff restating, no praise padding, no suggestions without a referenced finding.
- If evidence is missing, say which artifact or command output is missing and stop.
