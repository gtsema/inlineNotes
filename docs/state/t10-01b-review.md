# Review of t10-01 attempt 2 — copied verbatim by the PM from the reviewer run artifact

I have completed the review. No write-capable tool is available to this role, so here is the complete artifact for the authoritative path (`…\subagent-artifacts\outputs\ae97efeb-5f05-4f17-b198-235aa0f3f0c7\docs\state\t10-01b-review.md`). Nothing in the repository was modified (`git status --porcelain` still shows only the untracked engineer report).

```markdown
# t10-01 attempt 2 — focused code review (AC 8 only, commit `92eece2`)

Reviewed range: `git show 92eece2` — 4 files: `docs/specs/content-overlay-ui.md`,
`tests/options-window-look.spec.ts`, `tests/support/build-script-guards.ts`,
`tests/toolchain-contract.spec.ts`. Parent artifact: `docs/state/t10-01-review.md`
(blocking findings 1 and 2, answers 1–7). Brief: `docs/state/t10-01-pin-cleanup.md` → AC 8,
ruling `A129`. Reports: `docs/state/t10-01-engineer.md` (attempt 1), `docs/state/t10-01b-engineer.md`
(attempt 2). Scope of this review: does AC 8 close the two blocking findings, and did attempt 2
weaken anything else. Attempt 1's accepted halves are not re-litigated.

## Verdict

**accepted.** Both blocking findings of `t10-01-review.md` are **closed**. No blocking finding in
attempt 2: every AC 8 item is met, no `src/`, `scripts/` or `README.md` path is in the commit,
no dependency or network call appears, no pin or assertion was removed except the one tautological
assertion AC 8 item 3 named, and all four gates re-verified by this review are green.
Eleven non-blocking findings are numbered at the end; each names a closer.

## Carried fixes — the two blocking findings of `docs/state/t10-01-review.md`

1. **Finding 1 — the mascot `box-sizing` pin could not see the declaration that moves the frame,
   and the spec sentence carried an unattributed CSS claim: CLOSED.** The pin is no longer one rule
   body: `boxSizingSelectorsReachingMascot` (`tests/options-window-look.spec.ts:266-270`) walks
   every rule of **both** shipped option stylesheets (`:678-680`) and keeps only rules whose selector
   can reach the element (`selectorCanReachMascot`, `:248-263`); the narrow attempt-1 pin
   `expect(mascot).not.toMatch(/\bbox-sizing\b/)` (`:665`) is kept, not weakened. The scan's own
   non-vacuity is pinned from both sides: `names exactly one shipped rule as able to reach the mascot`
   → `['.mascot']` (`:693-699`) and `leaves every selector that cannot reach the element alone`
   (`:735-756`, 12 negatives including the two real `border-box` rules `:host` and `.options`).
   The spec sentence now attributes the mechanism to `A129` and quotes the Chrome 157 measurement
   (`docs/specs/content-overlay-ui.md`, mascot bullet: "Measured in Chrome 157 on the built page of
   `196ec0c` … `img.mascot` computes `box-sizing: content-box` … **paints 84×84**"), and item 28 was
   brought into step. The attempt-1 CSS premise of finding 1 was wrong (see answer 2); `A129` stands.
2. **Finding 2 — the D1 extraction read unstripped source and took the leftmost match, so a comment
   copy of `fail` / the entry handler was what the pins executed: CLOSED.** `buildScriptFunctionSourceFrom`
   (`tests/support/build-script-guards.ts:112-119`) and `buildScriptEntryStatementFrom` (`:209-216`)
   search `codeOnly(source)` with `^[ \t]*` + `m` line anchoring; `buildScriptMainBodyFrom` (`:84-96`)
   searches `codeOnly(source)`; `loadBuildFailFromScript` (`:130-137`), `loadBuildGuardFromScript`
   (`:155-185`, `fail` injected from the **same** text at `:180`) and `runBuildScriptEntryFromScript`
   (`:232-262`) all go through those extractors; every shipped-source entry point is now a delegate
   (`:98`, `:142`, `:192`, `:219`, `:270`). The decoy is a case, not a remark:
   `describe('the extraction runs live code, never a comment copy …')`
   (`tests/toolchain-contract.spec.ts:351-557`), three fixtures built from `buildScriptSource()` by
   replacing one live declaration (`:372-421`), each case first proving with the old unstripped pattern
   that the comment copy was the leftmost match (`:440-441`, `:478-479`, `:500-501`). Cross-checked
   against the PM's shipped-script mutations (M1 = report M4: 9 tests red; M2 = the no-false-positive
   control: 89 green) — the finding 2 scenario now fails loudly on the shipped script.

## AC 8 check (one line per item, AC quoted from `docs/state/t10-01-pin-cleanup.md`)

1. "**Widen the mascot pin** across the whole shipped stylesheet: no rule whose selector can match
   the mascot (`.mascot`, `img`, `*`, `.header img`) may declare `box-sizing`. No `src/` edit." —
   **pass** for the four named shapes and every descendant chain inside the component chain
   (`tests/options-window-look.spec.ts:706-733` proves `.mascot`, `img`, `*`, `.header img`,
   `header > img`, `.options img`, `main .header img`, `:host .mascot`, `img.mascot`,
   `img[alt=""]`, `.mascot:hover` and an `@media`-wrapped rule); limits that remain are findings
   2–4, all outside the four shapes the item names.
2. "**Close the extraction's silent mode**: `buildScriptFunctionSource` and `buildScriptEntryStatement`
   must run against comment-stripped source and anchor the function pattern to a line start, and the
   decoy case becomes a test …" — **pass** (`tests/support/build-script-guards.ts:112-119, 209-216`;
   `tests/toolchain-contract.spec.ts:437-523`), with one partial named in finding 7
   (`buildScriptMainBodyFrom` is stripped but anchored by `indexOf`, not a line anchor).
3. "**Remove or fix the tautological assertion** at `tests/toolchain-contract.spec.ts:330` …" —
   **pass**: it is the only assertion line removed in the diff, replaced inside the same case by two
   falsifiable ones (`tests/toolchain-contract.spec.ts:343-347`), and the first is proven to bite by
   the report's M5 (a second live `main().catch(() => {})` → 1 red). Finding 5 records that the same
   case class reappears elsewhere in the new describe.
4. "**Correct the spec sentence** to state the ruled mechanism (`A129`, with the measurement above),
   not an unattributed CSS claim." — **pass** (`docs/specs/content-overlay-ui.md`, mascot bullet and
   behavior item 28), with one factual slip in that sentence (finding 1) and one over-absolute
   qualifier (finding 2).
5. "Pins only grow; no `src/`, no `scripts/`; `dist/` stays 11; gates quoted in
   `docs/state/t10-01b-engineer.md` …" — **pass**: `git show 92eece2 --name-only` lists 4 files
   (1 spec, 3 test), `git log --oneline 196ec0c..HEAD -- README.md` empty, `find dist -type f | wc -l`
   → `11`, gates quoted in the report and re-run by this review (Evidence). Report accuracy is
   finding 9.

## Attempt-1 AC 1–7 after `92eece2` (re-checked, not re-litigated)

1. **D1** (failure half executed, pin must fail on log-and-continue or a swallowing handler): **pass**,
   strengthened — the executed chain now also goes red on a decoy'd script
   (`tests/toolchain-contract.spec.ts:455-475`); no `scripts/` file was edited to make it pass.
2. **D2** («pinned» removed or pinned, one branch only): **pass**, widened branch; still one branch
   (the absence, never a `src/` property).
3. **D3** (one helper, two importers): **pass**, unchanged — the pin that both contract suites import
   rather than copy is still green (`tests/toolchain-contract.spec.ts:605-614`).
4. **D4** (widen or state): **pass**, unchanged (`SHIPPED_TEXT_EXTENSIONS`, blind-spot list);
   attempt-1 remark 1 survives as finding 11.
5. **D6** (README build → test order): **pass** — `README.md:61-63` intact, forbidden-wording pins
   green (`npx vitest run tests/content-card-events.spec.ts` → 32 passed).
6. **Nothing moved that should not move**: **pass** — no `src/`, `scripts/`, `package.json`,
   `angular.json`, `README.md` in the range; `dist/` 11; the disabled-button rule untouched.
7. **Gates**: **pass** — re-run by this review: `npm test` exit 0 (`Test Files 46 passed (46)` /
   `Tests 1013 passed (1013)`), `npm run typecheck` exit 0,
   `node scripts/check-agent-config.mjs` exit 0 (`0 error(s), 0 warning(s), 167 info(s)`);
   `npm run build` not re-run (read-only), quoted by the report and the PM as 11 files.

## The six answers

1. **Finding 2 — closed.** Every shipped-source extraction path runs over comment-stripped text:
   `buildScriptFunctionSourceFrom` `:113`, `buildScriptEntryStatementFrom` `:210`,
   `buildScriptMainBodyFrom` `:85`, `loadBuildFailFromScript` `:131`,
   `loadBuildGuardFromScript` `:170` + `:180`, `runBuildScriptEntryFromScript` `:242`; and every
   shipped-script *text* assertion in the suites is wrapped in `codeOnly`
   (`tests/options-window-look.spec.ts:607`, `tests/toolchain-contract.spec.ts:145, 233, 343`).
   **No path reads unstripped shipped script text.** Two caveats, both named as findings: the
   `main()`-body anchor is an unanchored `indexOf` on stripped text (finding 7), and the
   "leftmost match" ambiguity survives for **live** duplicate declarations, pinned only for the entry
   half (finding 6). The fixtures are the real shipped text, not imitations:
   `logAndContinueScript` / `swallowingEntryScript` (`tests/toolchain-contract.spec.ts:372-403`)
   replace the exact chunk the shipped extractor lifts from `buildScriptSource()`, and
   `swappedOrderScript` (`:409-421`) edits shipped literals. Each fixture is self-validating — if the
   replacement ever missed, the case's own assertion inverts and goes red (`:444-445`, `:458`,
   `:483-485`, `:505-506`), so a fixture that quietly degenerated into the shipped script cannot pass.
2. **Finding 1 (accepted half) — closed, with stated and unstated edges.** The widened scan covers
   every shape that can match the mascot in the shipped markup today: class, tag, `*`,
   `img.mascot`, `:host .mascot`, `:hover`, and attribute selectors — an attribute compound is
   treated as *able* to match (`tests/options-window-look.spec.ts:221` + the loop at `:222-233`), so
   `img[alt=""]` is inside, not outside; descendant chains are inside for `header.header`,
   `main.options` and the `:host` (`:173-177`); an `@media` wrapper is reached by the flat rule scan
   (`:729-733`). The spec sentence states the combinator/attribute/pseudo-class limit explicitly
   ("That scan reads compounds rather than a CSS engine …"). Still **outside** the scan: document-level
   ancestors (`body img`, `html img` in `src/options/index.html` — `MASCOT_ANCESTORS` stops at
   `app-root`), `#id` compounds (`:227` returns false unconditionally), a **second** `<style>` block
   in `src/options/index.html` (`:201` takes the first match only), and an inline `style=""` on the
   template's `<img>` (the scan reads stylesheets only). The first two are implied by code comments,
   not stated in the spec, and the last two are not stated anywhere — while the sentence claims the
   scan is able "only to flag more rules, never fewer", which is false for `#id` and for `body img`.
   `A129` attribution itself is done: the unattributed "because `box-sizing` is not inherited by
   `img`" is gone, replaced by "(ruling `A127`, mechanism ruled `A129`)" plus the measured numbers.
3. **Nothing else weakened — verified.** The complete removed-line set of `92eece2` is: 3 replaced
   spec lines (the build-verification bullet, the mascot bullet, item 28), 5 comment lines in
   `tests/options-window-look.spec.ts` (the A127 comment, replaced by a corrected one), 40 internal
   lines of `tests/support/build-script-guards.ts` (each removed declaration re-appears as a
   `…From(source)` form plus a delegate — no exported name was dropped), one changed import line in
   `tests/toolchain-contract.spec.ts` (`… it }` → `… it, vi }`), one comment line, and exactly **one**
   assertion: `-    expect(buildScriptEntryStatement()).toMatch(/^\s*main\(\)\.catch\(/);`.
   `git show 92eece2 | grep -E "^-\s*(it|describe|test)\("` answers nothing; `grep -E "^-.*expect\("`
   answers that one line. Measured counts: `tests/toolchain-contract.spec.ts` 51 → 57 tests
   (`it(` 51 → 57, `describe(` 10 → 11, `expect(` 146 → 172), `tests/options-window-look.spec.ts`
   27 → 32 (`it(` 27 → 32, `describe(` 9 → 10, `expect(` 108 → 116); totals 1002/46 → **1013/46**.
   The only removal AC 8 asked for is the only removal.
4. **New pin quality.** None of the six new cases is satisfiable by a comment: three assert on text
   lifted from a fixture (`:444-445`, `:483-485`, `:505-506`), two assert on **executed** behavior of a
   guard built from the fixture (`:458`, `:468-470`, `:489-490`), and one asserts three `toThrow`
   message regexes for comment-only declarations (`:511-519`) — all falsifiable in the right
   direction. No new assertion passes because a helper throws: the throwing assertions are the point
   of `:511-519`, and every other case would error (red) if an extractor threw. Three of the six cases
   lead with a fixture-premise assertion against the *old* pattern (`:441`, `:479`, `:501`) — that is
   documentation of the bug, not a pin on shipped code, and it can only fail if the fixture builder
   changes; acceptable, but it is not coverage. **Weakest new assertion:**
   `expect(buildScriptEntryStatement()).toBe(buildScriptEntryStatementFrom(shippedScript))` and its
   sibling `expect(buildScriptMainBody()).toBe(buildScriptMainBodyFrom(shippedScript))`
   (`tests/toolchain-contract.spec.ts:529-530`) — the case named
   `drives the shipped pins through the same extraction the decoy cases drive` compares each shipped
   wrapper with the exact call the wrapper is defined as, with the same argument
   (`build-script-guards.ts:99, 219`), so it cannot fail; the same case's guard pair
   (`:540-556`) is only one step better. See finding 5.
5. **Lane clean.** `git show 92eece2 --name-only` → 4 files, no `src/`, no `scripts/`;
   `git log --oneline 196ec0c..HEAD -- README.md` → empty; `git show 196ec0c:README.md` vs working
   tree identical apart from the attempt-1 commit; `find dist -type f | wc -l` → **11**;
   `git status --porcelain` → `?? docs/state/t10-01b-engineer.md` only, so `scripts/` and `src/` are
   byte-identical to the commit (the PM's mutation restores are clean, and finding 2's shipped-script
   decoys are not sitting in the tree). No new dependency (`vi` from `vitest`, test-only), no
   `fetch`/`XMLHttpRequest`/`WebSocket`/beacon in the diff (the only `http` token added is the
   `content_scripts` fixture at `tests/toolchain-contract.spec.ts:366-369` and the spec's measurement
   URL). `docs/specs/INDEX.md` needs no change: no spec file was added.
6. **What remains open, and where it is recorded.** (a) The **eight** local comment-stripper copies
   are unchanged and still eight (`tests/content-anchor-boundaries.spec.ts:49`,
   `tests/content-create-card-boundaries.spec.ts:73`, `tests/content-overlay-host.spec.ts:26`,
   `tests/content-spa-refresh.spec.ts:127`, `tests/core-storage-keys.spec.ts:38`,
   `tests/core-storage-port.spec.ts:28`, `tests/entry-rules.spec.ts:98`, `tests/page-key.spec.ts:55`);
   they are recorded in the strongest place available — a named list plus a set-equality pin that makes
   a ninth copy red (`tests/toolchain-contract.spec.ts:590-624`) — and in one line of
   `docs/state/t10-01-pin-cleanup.md` → "Verdicts". (b) The **two over-claim sentences** of attempt-1
   remarks 1–2 are **unchanged by this commit** and recorded only in `docs/state/t10-01-review.md`
   §Non-blocking remarks and that same state-file line. Neither (a) nor (b) is in
   `docs/state/stage-9-review-debt.md` (its D3 line still names three copies, its D4 line still
   describes the pre-`t10-01` scan), and no Stage 10 debt ledger exists yet
   (`ls docs/state/` shows no `stage-10-*`). The new residuals from attempt 2 (findings 1–8) are
   recorded nowhere except finding 3's over-approximation direction, which the engineer report §10
   item 3 flags. The ledger is PM-owned and is the gap to close; this review cannot write it.

## Blocking findings

**None.**

## Non-blocking findings (each names a closer)

1. `docs/specs/content-overlay-ui.md`, mascot bullet, the sentence "`box-sizing` is **not an
   inherited CSS property**, so the **two** `box-sizing: border-box` declarations this surface really
   does ship — `:host` and `.options`": the shipped options stylesheet declares **three** —
   `src/options/options.component.ts:96` (`:host`), `:103` (`.options`), **`:151` (`.input`)**. The
   conclusion is unaffected (`.input` cannot reach the img, and `:693-699` proves only `.mascot` is
   reachable), but this is the same defect class the stage exists to remove: a CSS count in a spec
   sentence that the stylesheet contradicts. Closer: one word, `two` → `three`, with `.input` named.
2. Same sentence: "which makes it **wider** than real matching and therefore able only to flag more
   rules, never fewer" is false in two directions — `#id` compounds return false unconditionally
   (`tests/options-window-look.spec.ts:227`, and `:685-687` does not forbid an `id` on the mascot,
   so a template `id` plus a `#id` rule escapes), and document-level ancestors are absent from
   `MASCOT_ANCESTORS` (`:173-177`) while the document stylesheet **is** scanned (`:679`), so
   `body img { box-sizing: border-box }` in `src/options/index.html` escapes. Closer: state the two
   misses the way the palette bullet states its edge, or extend the model.
3. `tests/options-window-look.spec.ts:201` — `documentStyles` reads the **first** `<style>` block
   only (`/<style>([\s\S]*?)<\/style>/i.exec`). Verified against every other `index.html` pin
   (`:688`, `:910`, `:932`): adding `<style>img { box-sizing: border-box }</style>` to
   `src/options/index.html` turns **no** pin red and falsifies the 84 px footprint. Closer: `matchAll`
   over every block, or pin "exactly one `<style>` block" in the same case.
4. Inline styling is outside the scan and unstated: the scan reads only the two stylesheets
   (`:678-680`), so `<img class="mascot" style="box-sizing: border-box">` in the template
   (`src/options/options.component.ts:58`) also falsifies `A127` with everything green. Closer: one
   absence pin on `style=` in the mascot's element, plus one clause in the bullet.
5. `tests/toolchain-contract.spec.ts:529-530` (and the pair built at `:540-556`) — the delegation
   case is **tautological by construction**: `buildScriptEntryStatement()` *is*
   `buildScriptEntryStatementFrom(buildScriptSource())` (`tests/support/build-script-guards.ts:219`),
   and `shippedScript` is that same call (`:366`), so the `toBe` cannot fail; the case does not
   demonstrate what its comment claims. This is the same defect AC 8 item 3 just removed. Closer:
   delete the two `toBe` lines, or make delegation observable (pin the delegate call in the module
   text, or drive one shipped pin through an instrumented source).
6. `tests/support/build-script-guards.ts:113` takes the **leftmost** match, so a **live** duplicate
   declaration restores finding 2's silent mode in a form no pin covers: two live
   `function fail (…)` declarations make the real build call the **later** one (JS hoisting) while the
   extractor runs the **first**. The entry half is pinned (`tests/toolchain-contract.spec.ts:343-346`,
   proven by M5); nothing pins one live `fail`, one live `main()`, or one live guard. Closer: three
   `toHaveLength(1)` counts over `codeOnly(buildScriptSource())`.
7. `tests/support/build-script-guards.ts:86` — `buildScriptMainBodyFrom` anchors with
   `code.indexOf('async function main() {')`, not a line-anchored pattern, unlike the other three
   extractors. Comment copies can no longer win, but an occurrence in a string literal or an indented
   declaration would. Closer: one regex with the same `^[ \t]*` shape.
8. `tests/options-window-look.spec.ts:110-117` — `componentStyles` returns the stylesheet
   **verbatim**, while `documentStyles` (`:204`) applies `codeOnly`. For an absence pin the direction
   is safe (a commented-out `box-sizing` inside a reachable rule makes the pin **red**), but it is
   undocumented and inconsistent with the repo rule that shipped-code claims read stripped text
   (`t9-02b` R2b). Closer: one comment in the helper, or strip.
9. `docs/state/t10-01b-engineer.md` names things that do not exist and mis-quotes shipped code —
   fix before the PM commits the report: §3 line 77 cites `tests/support/source-comments.ts`
   (no such file; `codeOnly` lives at `tests/support/build-script-guards.ts:66`); §10 item 4 cites
   `buildScriptFunctionNames()` (absent from the whole repository); §3 quotes the function pattern as
   ``^[ \t]*(?:async\s+)?function\s+${name}\s*\([^)]*\)\s*\{`` "the `main()` variant also accepts the
   `export ` prefix", while the shipped pattern is `^[ \t]*function ${name}\([^)]*\) \{` with `m`
   (`:113`) and accepts neither `async` nor `export`. No AC verdict changes; a false path in a durable
   artifact does.
10. `README.md:59, 140-141` still state **1002 tests / 166 info**; the tree is 1013 / 167. The brief
    forbade touching `README.md` in this commit, and the report's §10 item 1 records it. Closer: PM
    bookkeeping, one commit. (No test pins the counts, so nothing goes red.)
11. Attempt-1 remarks 1 and 2 are untouched by AC 8 and still open:
    `docs/specs/content-overlay-ui.md`, settings-window bullet, "an alias of one of those methods"
    against an alias shape covering five of the seven names
    (`tests/toolchain-contract.spec.ts:664` vs `:662`); and the narrow `.ts`/`.tsx`-shaped sets in
    `tests/content-anchor-boundaries.spec.ts:37`, `tests/content-create-card-boundaries.spec.ts:69`,
    `tests/content-throw-boundaries.spec.ts:48`, `tests/core-storage-keys.spec.ts:56`,
    `tests/core-storage-port.spec.ts:157,171` under the spec's code-level claim in item 27. Closer: a
    Stage 10 debt ledger with these as numbered rows.

## Evidence

- `git show 92eece2` (read in full, per file), `git show 92eece2 --name-only`,
  `git show 92eece2 | grep -E "^-[^-]"` (the complete removed-line set, quoted in answer 3),
  `git log --oneline -8`, `git status --porcelain`,
  `git log --oneline 196ec0c..HEAD -- README.md` (empty).
- Counts per file: `git show 196ec0c:<f> | grep -c …` vs `git show 92eece2:<f>` →
  toolchain 51/10/146 → 57/11/172; options-look 27/9/108 → 32/10/116.
- Re-run by this review (read-only, no build):
  - `npm test` → exit 0: `Test Files 46 passed (46)` / `Tests 1013 passed (1013)`;
    per file `tests/toolchain-contract.spec.ts (57 tests)`, `tests/options-window-look.spec.ts (32 tests)`.
  - `npm run typecheck` → exit 0, no `error TS` line.
  - `node scripts/check-agent-config.mjs` → exit 0: `0 error(s), 0 warning(s), 167 info(s)`;
    the +1 info is the new `src/options/index.html` mention in the corrected mascot bullet
    (1 mention in `196ec0c`'s spec, 2 in `92eece2`'s) — the report's explanation is confirmed.
  - `find dist -type f | wc -l` → `11`; `npx vitest run tests/content-card-events.spec.ts` →
    32 passed (the README forbidden-wording pins still hold).
  - `npm run build` **not** re-run (read-only role); the report and the PM's brief both quote
    `[build] dist/ is a self-contained MV3 folder (11 files)`, and `dist/` is 11 in the tree.
- Shipped files read, unmodified: `scripts/build-extension.mjs:31-33, 181-194, 196-199`,
  `src/options/options.component.ts:58, 90-110, 144-156`, `src/options/index.html` (whole file).
- PM-held mutations M1 (9 red) / M2 (89 green) were **not** repeated; they are consistent with the
  executed chain at `tests/toolchain-contract.spec.ts:455-475` + `:478-490` and with the shipped-text
  pins at `tests/options-window-look.spec.ts:607-627`.
```