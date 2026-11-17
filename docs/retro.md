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
- What failed: the **PM session died of an uncompactable context** mid-`t3-02`, and the running engineer child died with
  it, leaving a whole slice **uncommitted** (5 modules, 4 test files, 5 red tests, no report). Root cause: the parent kept
  pulling large child artifacts and full test logs into its own context. Fix encoded (`A73`): PM reads artifacts by
  section and copies child reports with `cp`; children must pipe gates through `--reporter=basic` + `grep`/`tail` and read
  big files by range; every brief orders an **interim commit at each green checkpoint**. The attempt-2 brief repeated the
  attempt-1 tree inventory instead of asking the child to rediscover it.
- What failed: a **completion brief shipped four clean commits and silently dropped two carried fixes** listed in its own
  text, and the engineer report neither delivered nor declared them (`t3-02` findings 1–3, all three of that one shape).
  Size was not the cause — AC1–AC5 and every boundary check passed. Fix encoded (`A72`): briefs carry a numbered
  carried-fix checklist, the report answers each number `done`/`skipped`, and the reviewer lists carried fixes one line
  per number; a missing named deliverable is blocking regardless of the AC verdict.

## Stage 3 — closed (2026-11-17)

Accepted: `t3-01-settings-read-core`, `t3-01b`, the `t3-01` card, `t3-02`, `t3-02b`, `t3-03`, `t3-04`, `t3-05`.
697 unit tests over 38 files; the paint/tooltip/editor loop is confirmed by the user in a real Chrome, not only in jsdom.

- What failed: **sequencing, not code.** Stage 3's done-criterion (select → card → save → highlight → tooltip) was
  unreachable for a whole stage because the author-name gate lives in the content layer and the options page that satisfies
  it sat in Stage 4. The user's first smoke attempt produced "nothing happens on selection" and it looked like a defect.
  Fix: `t4-02` was pulled forward ahead of `t3-03`. A stage is ordered by the observable loop it must produce, not by layer.
- What failed: `t3-03` attempt 1 **hit the 60-minute ceiling with the entire editor uncommitted** — 5 substantive AC plus
  new modules plus spec edits in one slice, on a slow quantized runtime. Recovered by `resume` (`A80`) into three green
  commits. The same run then died on a failed `edit` into a file its brief had excluded by directory (`docs/state/*`) while
  its role writes its report into that directory — a brief-wording bug of the PM, now a rule: exclude the task state file
  by name.
- What failed: a rule **implemented in code and pinned nowhere** — the Flow 6 `claimSelection` handover
  (`create-card-controller.tsx:266`, wired in `main.ts:78-79`) passed a whole AC-by-AC review and was caught only by the
  reviewer's grep (`claimSelection` → 0 hits in tests). Deleting the hook would keep the suite green and break the editor
  handover on a real page. Search shape for future reviews: a hook/handover wired in one module and consumed in another.
- What failed: the **PM's own spec rename** (rewriting the `A78` open question into a ruling) left two dead pointers in
  shipped comments. After renaming a spec section, grep its title repo-wide in the same commit.
- What went right: the numbered carried-fix checklist (`A72`) worked on every task it was applied to; the fix-slice +
  parent-closure re-check pattern closed `t3-02` without a forbidden third attempt; and `A75` turned a review remark into a
  fix for a defect **jsdom could not reproduce** (a real engine throws where jsdom answers `false`).

## Stage 4 — popup, options, refresh, docs (2026-11-17)

Accepted: `t4-01-popup-list`, `t4-02-options-name`, `t4-03-spa-refresh-docs`, `t4-03b-watch-pins`; `t4-04` delivered,
review pending. 790 unit tests over 41 files; the page loop and the options screen are confirmed by the user in real Chrome;
the six-item browser list is deliberately still open (`прогон будет позже`).

- What went right and saved the stage: `t4-03` was **split before delegation** (code slice vs `t4-04` docs+verification),
  because the card as written carried 5 AC plus a README plus a human verification run. The code slice finished inside one
  hour; the unsplit shape is exactly what killed `t3-03` attempt 1 at the ceiling. A slice that ends with "and then a human
  checks it in a browser" is two slices.
- What failed: three runtime deaths in one stage, none of them a delivery failure — a wall-clock ceiling (`t3-03`), a
  malformed provider SSE stream mid-sentence (`t4-01` run 1, nothing committed), and a model endpoint that was unreachable
  twice (`t4-01` reviewer, connect timeout then `ENETUNREACH`). None cost an attempt (`A80`, `A85`). What made the recovery
  cheap was commit-per-green-step: the reviewer's death lost analysis only, never a checkpoint.
- What failed (the PM's brief again): the `t4-04` brief ordered a sweep for dead paths, and the sweep walked into
  `docs/specs/code-review-flow.md`, which is PM-owned and reachable by an engineer only under a numbered ruling naming the
  file (`A76`). The edit itself was correct (the spec pointed reviews at `.pi/reviews/`, which never existed here; practice
  is `docs/state/<task-id>-review.md`), so it is ratified as `A89` — but a sweep item must name PM-owned specs as excluded.
- What went right: the observable-behavior questions arrived **from the child as an interview** instead of being guessed by
  the PM (`A81` not-injectable wording, `A82` spec outranks the task card, `A83` notice above a still-visible list, then
  `A84` silence on a refused write). A task card that contradicts its spec is a PM bug: `A82` was that, and the card was
  corrected rather than the code.
- What went right: the docs slice caught its own over-claim. The README's "the extension makes no network requests" was
  re-scoped to "the extension's own code does", because Angular ships an unused `XhrFactory` into the popup and options
  bundles. A grep-true slogan is not a verified fact; a README number is only allowed if someone measured it in this run.
- What failed: **documentation is a delivery surface with no tests, and it lies quietly.** The `t4-04` reviewer pinned 24 of
  25 README sentences to code and found one false («адреса страниц никуда не записываются» — every record carries `pageKey`,
  and `pages:v1` stores page keys verbatim). Attempt 2 then removed that claim and put a new false one in its place («ключи
  хранилища адрес не содержат» — `decodeURIComponent(slotKeyFor(pageKey)) === pageKey`). Both survived a green build and 790
  green tests. Rule from `A92`: a README/spec sentence is accepted only with the `path:line` that makes it true, and a wording
  fix is re-read for the claim that replaced the deleted one.
- What went right: the attempt-2 fix stayed inside its ceiling (4 children, closed at 4) because the review named exactly one
  blocking finding and the PM fixed the leftover clause personally instead of opening a fifth child.

## Stage 5 — the browser verification run (2026-11-18)

- What went right: **none of the six items failed.** Hover cost on a very long article, the `selection_lost` refusal after a real
  text-node mutation, the Flow 6 handover (own → editor, foreign → nothing, `A78` no anchor move), the popup against a real page
  and the `storage.onChanged` repaint across two tabs all behaved as the specs say. The specs describe the real browser, not jsdom.
- What only the run produced: two documentation corrections. The `tabs` install warning was **never observed** (an unpacked reload
  shows none) — the README stopped asserting it; and the popup's host line reads as punycode garbage to the user, which became
  backlog item B6.
- Process failure of the PM: **the same mechanical edit bug three times in one file** — an anchor that ended on the next item's
  `## heading` swallowed that heading. Rule for docs files: an edit anchor never ends on a heading, and after editing a state file
  with several identically-shaped `Result:` blocks, re-read the boundaries.
- Probe design failure: the `Shift+Tab`-from-the-omnibox probe for the card's tab order cannot work — the omnibox has its own
  UI items («Спросить гугл об этой странице»). A probe must be validated before the run starts; an unrunnable probe leaves a
  half of an AC unverifiable, which is exactly what happened to item 1.
- The run also generated six improvement requests; they live in `docs/state/improvement-backlog.md` as B1–B6 with fourteen
  observable-behavior questions, and two of them overturn rulings (`A74`, and the click half of overlay AC3).
