# t1-04 — code review (attempt 1)

Task: `t1-04-entry-model-rules`. Reviewer: `code-reviewer`, read-only.
Range reviewed: `git diff e2966a0..b550fc4` — one commit `b550fc4 feat(t1-04): entry model, caps and authorship rules`.
Changed paths in range (verified with `git diff --name-status`): `docs/specs/inline-comment-model.md` (M), `src/core/entry.ts` (A), `src/core/entry-rules.ts` (A), `tests/entry-model.spec.ts` (A), `tests/entry-rules.spec.ts` (A).
Working tree at review time: clean (`git status --porcelain` empty).

## Verdict

**accepted**

Every AC is `pass`, no blocking finding, no spec/code conflict, and the three green-gate outputs are quoted in the engineer report ("Commands run" 1–3), as `docs/specs/code-review-flow.md` → Rules requires.

## Acceptance criteria (one line each)

- **AC1 — pass.** `Entry` has exactly the nine fields incl. `visible` (`src/core/entry.ts:36-56`), `createEntry` applies `visible: draft.visible ?? true` (`src/core/entry.ts:89`), `EntryAnchor = { text, prefix, suffix, fragmentCount }` is declared only, no codec (`src/core/entry.ts:24-31`); the spec gained `visible` in the same commit (Terms row, Flow 4 step 4, Rules bullet `docs/specs/inline-comment-model.md:21,32,56` — confirmed in `git show b550fc4 -- docs/specs/inline-comment-model.md`); tests assert the exact key set and the default/explicit values (`tests/entry-model.spec.ts:39,62,68`).
- **AC2 — pass.** `validateComment` returns `{ ok, codePointLength, normalized }` (`src/core/entry-rules.ts:78-88`); length is `Array.from(value).length` (`src/core/entry-rules.ts:70-71`); the surrogate-pair case is pinned by a test that asserts `'😀'.length === 2` but `codePointLength === 1`, plus 256 astral pass / 257 astral fail (`tests/entry-rules.spec.ts:105-117`), and 256-vs-257 for BMP text (`tests/entry-rules.spec.ts:95-103`); empty-after-trim rejected (`tests/entry-rules.spec.ts:134`).
- **AC3 — pass.** `validateAuthorName` non-empty trimmed + ≤40 code points (`src/core/entry-rules.ts:92-101`, tests `:141-153` incl. astral name), `isSameAuthor` trimmed and case-sensitive (`src/core/entry-rules.ts:107-115`, tests `:155-168`), `generateAuthorName` 8 lowercase base36 and `randomId` 12 lowercase base36 (`src/core/entry-rules.ts:122-130`, tests `:170-197` assert length, charset, exact replayed values and exactly 8/12 rng calls); randomness is injected as `RandomSource = () => number` (`src/core/entry-rules.ts:44`) and the purity test forbids `Math.random`, `crypto`, `Date`, DOM, `chrome.`, network and framework imports in both new modules (`tests/entry-rules.spec.ts:343-377`); grep over `src/core/entry*.ts` finds `chrome.` only inside comments.
- **AC4 — pass.** `canEdit` delegates to trimmed comparison (`src/core/entry-rules.ts:117-120`, test `:219-227`); `assertCreatable` returns exactly one of the four codes or `null` (`src/core/entry-rules.ts:57,137-156`); each code has its own test — `name_required` `:228-233`, `comment_empty` `:236-239`, `comment_too_long` `:241-251`, `page_limit` `:253-261` (`page_limit` at 20 existing entries and at 21, `null` at 19); precedence test `:264-273`.
- **AC5 — pass.** `sortByCreatedAtAsc` ascending, stable, non-mutating (`src/core/entry-rules.ts:162-170`, tests `:284-305` assert order, input untouched, equal-`createdAt` order kept); `removeById` and `clearPageEntries` are `filter`-based (`src/core/entry-rules.ts:172-183`), tests assert input length unchanged and element identity (`tests/entry-rules.spec.ts:307-314`, `:316-338`); the three constants are asserted by test (`tests/entry-rules.spec.ts:89-92`).
- **AC6 — pass (quote present and complete).** The report quotes `npm test` (122/122, 8 files), `npm run build` (self-contained `dist/`), and `node scripts/check-agent-config.mjs` ("0 error(s), 0 warning(s), 4 info(s)"). Per `code-review-flow.md` → Edge Cases the reviewer verifies the quote is present, not truthful; I additionally verified the checker's 4 INFO lines are the standing "planned path" rule, which fires unconditionally for `src/`|`tests/`|`dist/` prefixes (`scripts/check-agent-config.mjs:359`), so the engineer's explanation of them is accurate. `npm run typecheck` is quoted as extra, not a gate.

## Boundary checks for this slice

- Caps vs spec, both directions: `MAX_COMMENT_CODE_POINTS = 256` / spec line 47; `MAX_ENTRIES_PER_PAGE = 20` / line 48; `MAX_AUTHOR_NAME_CODE_POINTS = 40` / line 49; `GENERATED_AUTHOR_NAME_LENGTH = 8` / line 49 ("random 8-character name (lowercase base36)"); `ENTRY_ID_LENGTH = 12` / Flow 4 step 4 ("random 12-char base36"). No drift in either direction (`src/core/entry-rules.ts:23-38`).
- Code-point counting: the comment cap and the author-name cap both go through `codePointLength` (`src/core/entry-rules.ts:71`), and both astral cases are pinned by tests (`tests/entry-rules.spec.ts:105-117`, `:149-153`). The only other `.length` reads in the module are `left.length === 0` / `right.length === 0` (`src/core/entry-rules.ts:110`, zero UTF-16 units ⟺ zero code points, so encoding-safe), `BASE36_ALPHABET.length` (`:186`, ASCII-only literal) and `attempt.entries.length` (`:150`, array). No `.length` is used where a code-point count is required.
- Purity: no `Math.random`, `crypto`, `Date`, DOM, `chrome.*`, `any`, `@ts-ignore`, `@angular/*` or `preact` in `src/core/entry.ts` or `src/core/entry-rules.ts`; the only import is the relative `./entry` type import; randomness is injected. Test-enforced (`tests/entry-rules.spec.ts:343-377`).
- `assertCreatable` order matches spec Flow 3 (`docs/specs/inline-comment-model.md:31`): name → comment non-empty → comment cap → entry count. Overlap and duplicate-selection absence is **referenced, not silently missing**: the code comment states they are later anchor-stage checks (`src/core/entry-rules.ts:131-136`), the state file's AC4 pins the four-code set, and the report's handoff note says "checks 5 and 6 belong to the anchor stage" (`t2-03` scope). Flow 3 step 2 (`selection not empty`) is not representable in `CreateAttempt` — see remark R1.
- `visible` vs `docs/specs/content-overlay-ui.md`: no contradiction. `content-overlay-ui.md:22,32,48` already require a per-entry `visibility flag` "persisted per entry id in the entry record"; the new model-spec bullet (`inline-comment-model.md:56`) restricts it to painting only and keeps edit rights untouched, matching `content-overlay-ui.md:61`.
- Boundaries clean: no storage adapter or `chrome.*` in the diff; `package.json`/`package-lock.json` untouched in the range (no new dependency, no jsdom); no Russian UI string in `src/core/` — test-enforced (`tests/entry-rules.spec.ts:378-383`); Russian appears only in test fixtures. No harness path (`.pi/`, `scripts/`, `docs/project-profile.md`, `docs/state/`) is in the range, so the harness-vs-`code-review-flow.md` check (frontmatter, `timeoutMs`, overrides) is not applicable to this commit.
- Slice size: 5 substantive AC + gates, inside the `src/core/` limit in `code-review-flow.md` → Rules.

## Blocking findings

None.

## Non-blocking remarks

- **R1** `src/core/entry-rules.ts:131-136` — the doc comment on `assertCreatable` names only Flow-3 step 5/6 (overlap, duplicate) as deferred; it never mentions spec step 2 (`selection not empty`, `inline-comment-model.md:31`), so a reader cannot see where that check went. One extra clause would close the mapping. Docs only.
- **R2** `docs/specs/inline-comment-model.md:49` — the author cap says "max 40 characters" without naming the counting unit, while the comment cap (`:47`) explicitly says Unicode code points. The code counts code points (`src/core/entry-rules.ts:29`), consistent with AC3 and the spec's own convention, so this is a wording gap, not a conflict. Worth one word in a later spec-touching task.
- **R3** `src/core/entry-rules.ts:110` — the empty-side rule in `isSameAuthor` goes one step beyond AC3's wording ("trimmed, case-sensitive"); it is spec-backed by `inline-comment-model.md:49` ("creation and editing are disabled" when the name is missing) and AC9, and it is tested (`tests/entry-rules.spec.ts:163-168`). No action needed.
- **R4** `src/core/entry-rules.ts:194-200` — rng clamping is a code-side decision (tested at `tests/entry-rules.spec.ts:199-208`); `generateAuthorName(() => 1)` collapsing to `z` shows the boundary is inclusive-clamped rather than rejected. Acceptable given the documented `RandomSource` contract (`:41-44`).
- **R5** `src/core/entry-rules.ts:138-140` + `tests/entry-rules.spec.ts:231-233` — an over-40-code-point name is reported as `name_required`, which merges "missing name" and "name too long" into one code while the spec's Russian message `Укажите имя в настройках` (`inline-comment-model.md:49`) is about a missing name. AC4 fixes the four-code set for this slice, so it is not a violation; if the PM wants a distinct code, it is a spec+code change in `t3-03`/`t4-01`.
- **R6** `src/core/entry-rules.ts:162-170` — chronological ordering relies on lexical comparison of ISO stamps; the spec pins "ISO strings" (`:32`) but not the offset/format. Correct as written; see residual risk 3.

## Residual risks for `t1-05-entry-store`

1. **`visible` decode default.** `inline-comment-model.md:56` requires `true` "when the field is absent", but no decode/read path exists in this slice; `createEntry` covers creation only. `t1-05` must apply the default when reading a stored page list, or the rule stays untested.
2. **`page_limit` is per-call, not per-`pageKey`.** `CreateAttempt` carries no `pageKey` (`src/core/entry-rules.ts:60-67`, `:150`), so the store must pass only the current page's list or the 20-entry cap becomes wrong. Spec rule is per `pageKey` (`:48`).
3. **Timestamp writer.** `sortByCreatedAtAsc` is correct only for same-format UTC ISO (`Z`) strings; `t1-05` must write `new Date().toISOString()`. A spec line pinning the format would make "creation order ascending" unambiguous (engineer open question 1).
4. **`authorName` normalization.** `createEntry` stores the value verbatim (`src/core/entry.ts:76-91`; asserted by `tests/entry-model.spec.ts:88-92`), while the spec requires the stored `authorName` to be a non-empty trimmed string (`:49`). The creation facade must persist `validateAuthorName(...).normalized`.
5. **No entry-shape guard.** Nothing validates a record read back from `chrome.storage.local`; a corrupt or foreign-shaped record flows straight into `canEdit` / `sortByCreatedAtAsc` / `removeById`. `t1-05` must decide whether an `isEntry` guard belongs to the store or a later core slice.
6. **`visible` mutation helper is absent** (no AC asked for it). The Stage-3 popup checkbox needs a pure update helper, or the rule will be re-implemented inside Angular.

## Evidence path

- `docs/state/t1-04-entry-model-rules.md` (AC 1–6, constraints, work order)
- engineer report: `…/subagent-artifacts/outputs/d3b3c66b-fbe9-4dfb-a214-4decf42a14b3/docs/state/t1-04-engineer.md` (gate quotes, deviations 1–9)
- code: `src/core/entry.ts`, `src/core/entry-rules.ts`, `tests/entry-model.spec.ts`, `tests/entry-rules.spec.ts`
- spec: `docs/specs/inline-comment-model.md:21,31,32,47-51,55-56`; cross-check `docs/specs/content-overlay-ui.md:22,32,48,61`
- git: `git diff --name-status e2966a0..b550fc4`, `git show b550fc4 -- docs/specs/inline-comment-model.md`
```
