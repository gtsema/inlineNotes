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

## Stage 5 — per-author overlap, colours, the tooltip as the way in (2026-11-18)

- **What worked:** the reviewer's `blocked` verdict did its job for the first time — `t5-03` passed all nine AC yet carried a
  spec-vs-code contradiction inside its own commit, and the reviewer refused to pick a side instead of accepting a green tree.
- **What failed (brief, not code):** I wrote `A106` as an **outcome** ("a stale selection saves cleanly") instead of a **rule**,
  and the engineer's pin attempt found the code disagreeing with it. Rule for future rulings: state the predicate (what counts as
  a `re-selection`), never the resulting verdict; `A107` is that predicate.
- **What failed (brief, again):** the `t5-03` brief said "do not touch code, the code already implements this" while its own AC
  implied a different outcome. A brief must not assert what the code does from memory — measure the file or drop the claim.
- **Recurring defect class:** four dead or stale comment pointers in one task (a deleted module, a path that never existed, a
  deleted rule name, a `.ts`/`.tsx` suffix), plus stale AC numbers in comments and test names. Carried into `t5-04` as six
  numbered comment-only items. Standing cheap mitigation: grep every cross-file path a comment names before committing.
- **Process:** the 60-minute wall hit `t5-03` attempt 1 with nothing committed; the same-session resume with three
  commit-per-green checkpoints delivered everything (`A80` a second time, `A73` proved again).

## Stage 6 — focus on open, no popup address, popup author groups (2026-11-18)

- **What worked:** the `A80` recovery pattern paid for itself twice. `t5-03` and `t5-06` both hit the 60-minute wall with
  commit-per-green checkpoints already in place, so the recovery cost was a finish-only resume, not a re-run — and neither cost an
  attempt.
- **What failed (planning, not code):** `t5-06` was one task too large for one slice on this model (spec + two new core
  operations + a popup refactor). Splitting it into `core aggregates` and `popup projection` at open time would have avoided the
  wall. Rule: a task that names changes in two layers gets two cards from the start.
- **What failed (ruling wording):** `A106` was written as an outcome, and the code disagreed with it; the engineer's escalation
  turned it into the predicate `A107`. Rule for every future ruling: state **what counts as X**, never **what happens to X**.
- **Recurring defect class, still alive:** README factual drift (a stage line frozen at «Стадии 1–4», an internal number
  disagreement) and stale comment/AC pointers. Both were caught by review, both cost a carried slice. Cheap mitigation now in
  practice: re-grep the limits and counts instead of trusting the previous README, and grep every cross-file path a comment names.
- **Debt this stage added knowingly:** the blank-author popup row is pinned as unreachable-but-inert (`A110`) rather than fixed;
  the aggregate cross-tab repaint and the `onChanged` record count have no real-Chrome proof yet — they are Run 2 items 7 and 8.

## Stage 7 — one defect the browser found and 907 tests could not (2026-11-18)

- **The browser pass paid for itself on its second run.** Run 2 passed 9 of 10 items and surfaced one real defect (`B7`) that no
  unit test could ever show: jsdom does not drop a page selection when focus enters an editable element, so the whole class of
  "the caret eats the selection" was invisible to the suite. Rule kept: a green suite never substitutes for the runtime check.
- **What failed (ruling shape):** `A97` traded away the artifact the reader was holding at that moment. A ruling that touches a
  gesture which **is** the input to the operation must name what survives of that gesture, or it will be reversed. `A111` states
  the predicate per widget instead of per feature.
- **What worked:** keeping the focus behavior in one owner module (`focus-handoff.ts`) made the reversal a two-call deletion with
  no new logic. Cross-cutting behavior in a single owner keeps later reversals cheap — this is the third time that design paid.
- **What failed (proof honesty):** a pin that asserts "no focus call" can be **inert** — once `focus.open` is gone, a leftover
  `focus.restore()` changes nothing observable, so the test comment at `tests/content-create-card-controller.spec.ts:1215` claimed
  a behavioral proof it cannot give. When a call is deleted, the proof is static (deleted import, `grep` 0, typecheck 0) and the
  comment must say so.
- **What worked (process):** the reversal was offered as four labeled options with consequences and one recommendation; the user
  picked in one line. A decision block beats an open question.

## Stage 7b — the stage reopened by its own browser pass (B8, `A112`, `A113`)

- **What the stage proved:** a rule can be accepted by review and still be wrong in Chrome. `A111` shipped 8/8 AC and left the
  keyboard with no door, because the spec sentence it wrote — "`Tab` is now the only way in" — was an assumption about browser
  tab order, not an observation. Run 3 caught it as item 2 `failed`. Rule kept: a documentation claim about keyboard behavior is
  a may-claim until a probe names it.
- **What worked:** the fix was chosen from four labeled options in one line, and the chosen one (`A112`, typing enters the field)
  needed no knowledge of *why* `Tab` misses. Deliberately leaving the cause unmeasured kept the slice small: no `tabindex`, no host
  move, no key interception. Not every defect owes you its root cause before you can ship a correct behavior.
- **What failed (harness plumbing, `A113`):** the `t6-02` engineer delivered two green commits and a complete report, and the run
  still ended `failed` because its acceptance-report used an unsupported field name. The tree was measured and accepted on its own
  merits. Rule kept: a child dying in plumbing spends no attempt.
- **My own slip, same class as `A101`:** in one chained command a failing `sed` short-circuited the checker, and the `echo
  "exit=$?"` printed `sed`'s status while the tail line shown was a stale log. A compound command is not one gate; run each gate on
  its own line.
- **Open debt the stage hands to the next one:** the bubble-phase comment at `src/content/overlay/card-events.ts:156-157`
  overstates the guarantee, and the two event-driven closes of a typed card pin the restore count without its
  `{ preventScroll: true }` option (`tests/content-create-card-controller.spec.ts:1408`).

## Stage 8 — the compact row, and a claim of mine that never existed (B-class: my own)

- **What was cheap and why:** deleting a control cost one commit because the rule behind it (authorship, caps, close paths) lives in
  `src/core/` and the widgets only render. The expensive part of such tasks is never the change, it is the **pins that referenced
  the deleted thing** — so the review instruction was a destruction audit: name the surviving assertion for every removed `it(`.
  That audit is now a standing review tool for any removal task.
- **The reviewer's `blocked` was right twice over.** `t7-01` passed 9 of 10 AC and was still blocked: one rule was written in two
  specs and only one was edited. Cheap to fix (`A115`), expensive to miss — a reader of the model spec would rebuild the button.
- **My own defect (`A117`, the lesson of the stage).** I wrote into the task card that the empty action row produced "a visible band
  of dead space under a read-only note", told the user the band would disappear, and the engineer faithfully moved that sentence
  into the spec. In the shipped wiring the state is **unreachable**: a foreign entry's tooltip click opens nothing at all (`A96`).
  A brief must not contain a browser claim that no run produced; a claim about what the reader will see needs a run number or it is
  written as a may-claim.
- **Dead pointers, again, mine.** `A115` put `tests/content-card-actions.spec.ts:395-397` into the model spec and the very next
  commit moved that pin to `:451-463`. A pointer into a test file is a liability the size of the test file: name the test, keep the
  line only when it is cheap to re-grep at the next touch.

## Stage 9 — the settings window, the cat, and two sentences I wrote as facts (2026-11-19)

Tasks: `t9-01-options-window` (accepted after changes requested), `t9-02-settings-window-look` (accepted after changes
requested), `t9-02b-spec-test-debt` (accepted, no blocking finding). Stage 9 spent its delegation ceiling on infrastructure, not
on wrong code: 2 engineer runs + 2 reviewer runs for `t9-01`/`t9-02`, then 4 engineer runs + 1 reviewer for `t9-02b`, of which
**two engineer runs died on the runtime** (one overlapping `edit` call after a compaction, one `verify: layer 7 never rang — an
illegal memory access`) with the work already committed.

- **My defect, twice in one stage, is the same one `A117` named.** I wrote «never produces a horizontal scrollbar» into the spec
  in `t9-01`, and then — while closing that very finding — wrote that the mascot renders «whole, including the lifebuoy» inside a
  `border-radius: 50%` clip. Both were browser claims with no run behind them, and the reviewer blocked both
  (`t9-01` finding 2, `t9-02` finding 1). The rule is not new; my writing habit is. A sentence about what the reader sees either
  names a run number or is written as a requirement whose sight a named run owes — and I now write that clause in the same edit
  that introduces the sentence, not after the review.
- **A claim about an image can be cheap to settle, if someone decodes the bytes.** The lifebuoy question took a scratch script
  (inflate `IDAT`, unfilter, walk the alpha channel): 13 054 painted pixels, 162 of them beyond the clip circle, **none above
  alpha 156** — anti-aliasing, not artwork. That turned a reviewer's reasonable «no evidence path at all» into a pin the suite now
  holds (`tests/options-window-look.spec.ts`, artwork vs circle). When the artifact is a file, measure the file.
- **Pinning a script by grep is not pinning it.** Both `t9-01` R2 and `t9-02` R2 landed as substring scans; `t9-02b` fixed it by
  **extracting the shipped guard's own text and calling it** with injected stubs, so a missing `dist/` file answers with the
  failure. My own mutation check (rename the guard, script stays valid) failed 3 tests with a named message. A pin that survives
  renaming the thing it names is worth the extraction ceremony.
- **Infrastructure failures need a rule of their own.** Two dead engineer runs were not charged as task attempts (the code was
  committed and green); the fresh sessions were told to **verify and report only**, never to re-implement. That kept the
  two-attempt budget honest and prevented a second engineer from rewriting a landed slice.
- **The reviewer cannot be given images on this runtime.** One review run died in the vision encoder (`503`) after opening the
  screenshot. Fix: visual claims reach a review as measured numbers (computed styles, ratios, painted box sizes) and the brief
  forbids opening image files. Recorded here so the next stage's brief starts that way.
- **The stage closed on a blanket sight.** Run 6 arrived as «Я всё проверил - этого достаточно», and that is exactly how the six
  items are recorded: `passed (blanket)`. A blanket confirmation closes an acceptance criterion; it does not manufacture a
  measurement. So the spec now says the page fits the dialog box **and** that no artifact holds the box's pixel size or a
  screenshot of it — the only image stays the options page in a tab.
- **A question I asked three times and never got an answer to is not a decision.** `A128` (the disabled `Сохранить`) stayed
  unissued, so shipped `opacity: 0.45` stands and the item is written into `docs/state/stage-9-review-debt.md` as `D5`. Silence
  keeps the current behavior; it never changes it.

## Stage 10 — pin cleanup (`t10-01`, accepted on attempt 2)

- **What the stage was for.** Nothing shipped changed: Stage 9 left five sentences that said «pinned» where no assertion sat, and one
  assertion whose subject was its own helper.
- **The defect that cost the second attempt.** Attempt 1 closed the debt and still left a **silent** failure mode: the extractor read
  unstripped source and took the leftmost match, so a commented-out copy of `fail` is what the pins executed. The reviewer found it by
  building a decoy; my own check (`9` red with a decoy over a broken live `fail`, `89` green with the same decoy over an intact one)
  proved the fix. Lesson kept: **an extraction helper is a parser; a parser gets decoy cases, or it is not pinned.**
- **A tautology removed can be re-imported.** Item 3 deleted `expect(x).toMatch(/^main\(\)\.catch\(/)` because the helper either returns
  that text or throws; attempt 2 added `toBe` between two calls that are the same call. The review caught it (`S10-1`). Lesson: after
  deleting an unfailable assertion, re-read the new ones for the same shape.
- **The reviewer was wrong about CSS, and the measurement settled it in one step.** It asserted `box-sizing` is inherited, therefore the
  shipped 84 px contradicted the stylesheet. Chrome returned `content-box` on the `img` while `:host` computes `border-box`. The ruling
  `A129` and the numbers are in the state file; the part of the finding that was right — the pin could not see a declaration that would
  move the frame — was accepted and fixed. Lesson kept: **a mechanical claim from a reviewer is checked by measurement, not by rank.**
- **Spec hygiene is a count problem.** Two sentences in this stage broke on a number, not an idea: «two `box-sizing` declarations» where
  the stylesheet ships three, and «wider than real matching, never fewer» where two shapes escape. Both are now stated as limits with
  ledger rows. Lesson: a count inside a sentence is an assertion the stylesheet can outgrow; prefer naming the escape.
- **Bookkeeping that is not mechanical stays manual.** README carries the test and checker counts, and the checker's info count moves
  whenever a spec mentions a file — so every spec edit moves README. Nothing goes red when they drift. A candidate for a future gate:
  pin the counts the same way `A126` pins the asset hash.

## Stage 11 — the mascot replaced, the extension's first icon

- **A provenance ruling written as a hash does not survive the artwork being replaced.** `A126` pinned the mascot by
  SHA-256 and the spec repeated it in prose; when the owner swapped the file, the hash kept pointing at a file that no
  longer shipped, and **no test reads the spec for a hash**, so the sentence rotted silently until a reviewer read the
  line instead of the tests. Three instances of the same class in this stage: the `A126` hash, the «names none of the
  three» manifest sentence, and «exactly `cat-mascot.png`» on the unreadable-file list. The fix each time was to correct
  the sentence, never the artifact.
- **A distance is only meaningful with its origin named.** The PM reported «the farthest painted pixel» as `621.46` —
  measured from the painted bounding-box centre. `object-fit` and `border-radius` work from the **image** centre, where
  the same pixel is `628.00`. The two plausible origins differ by 6.5 px and change the required scale by 1.6×, so the
  brief asked for a CSS shrink the artwork did not need. The engineer stopped instead of choosing a side; the brief was
  the thing that was wrong.
- **An `expect` count is not evidence that the right thing broke.** In `t10-02` the PM read a red mutation as a pass
  because it did not read the failing case's name — the red came from a neighbouring exact-tag assertion. Read the case
  name, not the count.
- **A child that blocks on a contradiction is worth more than a child that resolves it.** The engineer refused to pick
  between two readings of AC 2/AC 3 and the refusal is what surfaced a wrong measurement. Stopping is the correct
  behaviour when the brief contradicts itself.
- **The build's own guard caught the icon before any test did.** `verifyManifestReferences()` already resolved `icons`
  and `action.default_icon`; moving `src/icons/icon-128.png` away failed the build with the reference named. The
  presence pin then only had to say *what* the manifest declares, because the build already says *whether it exists*.

## Stage 12 — the settings header centres, the hint becomes a parenthetical

- **A layout pin is not a look pin.** Three assertions described the old arrangement as markup (the header as a row, the
  hint as a paragraph of its own) and each was rewritten for the new one without losing strength; the reviewer's job was
  to check they got *stronger*, not merely greener. Two of the three did; the third (`Q3`'s «one space before the
  parenthesis») turned out to be pinned only through a whitespace-collapsing read, so it cannot see two spaces — ledgered
  as `S12-3` rather than left as a claim the test appears to make.
- **A claim about a single space needs a pin that can count spaces.** The same class as `t10-02`'s tautology: a pin that
  normalises its input before comparing cannot testify about the thing the sentence names.
- **The rule-to-component map can gain a row that never runs.** `'.label-line': '.options'` was added for a rule with no
  `color:` declaration, so the pair walk never reaches it. A map row is not an assertion; `S12-4` records it so the row is
  not mistaken for one.
- **Centring is relative to something, and the something has to be named.** The column centres on the card's content box,
  which is inset by the host's `16px` padding — so it is not centred on the dialog box. Nobody noticed until the reviewer
  asked; it is `S12-5` and the owner's eyes decide whether it matters.
