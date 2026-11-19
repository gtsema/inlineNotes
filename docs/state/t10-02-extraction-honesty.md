# t10-02 — extraction honesty and the two escaping shapes (Stage 10, debt rows S10-1, S10-3, S10-4, S10-5, S10-6, S10-7)

Opened by the user's word «Давай возьмём и доделаем обе» (2026-11-19). Pins and sentences only: **no shipped file changes.**
Debt source: `docs/state/stage-10-review-debt.md`. The disabled-button row (`D5` / `A128`) is **not** in this task — it belongs to
`t10-03` and is waiting on a user ruling.

## Goal

Three of the Stage 10 review findings describe pins that look like guards but cannot fail, or guards whose input can be widened
around them. Close exactly those six rows.

## Acceptance criteria

1. **S10-1 — no tautology by construction.** `tests/toolchain-contract.spec.ts:529-530` and the pair built at `:540-556` compare
   `buildScriptEntryStatement()` with `buildScriptEntryStatementFrom(buildScriptSource())`, which are the same call
   (`tests/support/build-script-guards.ts:219`, `:366`), so the `toBe` cannot fail. Either delete those two comparisons and keep the
   behavioral case, or make delegation observable (pin the delegate call in the module's own text, or drive one shipped pin through an
   instrumented source). Whichever way: **name in the report what mutation of `tests/support/build-script-guards.ts` would now make the
   case red** — that sentence is the acceptance test for this item.
2. **S10-3 — every `<style>` block is read.** `documentStyles` (`tests/options-window-look.spec.ts:201`) takes the first block only.
   Use `matchAll` over every block, or pin "the options document ships exactly one `<style>` block" in the same case that scans it.
   The mutation check is: a second block `<style>img { box-sizing: border-box }</style>` added to `src/options/index.html` must turn a
   pin red.
3. **S10-4 — inline style cannot move the frame.** Add one absence assertion: the mascot element in
   `src/options/options.component.ts:58` carries no `style=` attribute. A `style="box-sizing: border-box"` there must turn a pin red.
4. **S10-5 — one live declaration each.** `tests/support/build-script-guards.ts:113` takes the leftmost match, so two live
   `function fail(…)` declarations make the real build call the **later** one (JS hoisting) while the extractor runs the **first** —
   finding 2's silent mode in a new dress. Pin `toHaveLength(1)` over `codeOnly(buildScriptSource())` for `fail`, for `main`, and for
   each guard the module extracts.
5. **S10-6 — the last non-anchored extractor.** `buildScriptMainBodyFrom` (`tests/support/build-script-guards.ts:86`) anchors with
   `code.indexOf('async function main() {')`; make it a line-anchored pattern like the other three, so an indented declaration or a
   string-literal occurrence cannot win.
6. **S10-7 — one documented stripping rule.** `componentStyles` (`tests/options-window-look.spec.ts:110-117`) returns the stylesheet
   verbatim while `documentStyles` (`:204`) applies `codeOnly`. Either strip in both, or state in the helper why verbatim is the safe
   direction for these absence pins. No silent inconsistency.
7. The spec sentences that already name the `#id` / document-ancestor / inline-style / second-block limits stay true; if an item above
   removes a limit, the sentence is updated in the same commit.

## Carried-fix checklist (review `c7301323-e084-4b0a-b92c-308a1a415437`, rule 8 of `code-review-flow`)

| # | Finding | Where answered |
|---|---|---|
| 1 | **blocking** — the `componentStyles` doc comment (`tests/options-window-look.spec.ts:111-113`, `:120-123`) claims "everything this text feeds is an absence claim" and "every presence claim … is wrapped in `codeOnly`", and the same file refutes both (`:703-709` mascot geometry, `:938-949` the ten palette pins, `:1012-1015`, `:1035-1039` read the verbatim text through `ruleBody`, `:148-156`) | **AC 8** |
| 2 | a `<style>` **with an attribute** is invisible to both halves of the AC 2 pin (`styleBlocks`, `:229`) while the spec says "every `<style>` block" | **AC 9a** |
| 3 | the inline-style pin matches a literal `style=` only (`:795`); `[style.box-sizing]` / `[attr.style]` move the frame with the pin green | **AC 9b** |
| 4 | a wrapper the hand-maintained `SHIPPED_ENTRY_DELEGATES` table (`:689-716`) never names escapes the delegation pin | **AC 9c** |
| 5 | the verbatim-vs-stripped direction is still a comment, not a pin: `codeOnly(...)` inside `componentStyles` keeps 1019 green and inverts the documented behavior | **AC 10** |
| 6 | the delegation pin reads the module without the `\r\n` → `\n` normalization `buildScriptSource()` applies (`tests/toolchain-contract.spec.ts:730` vs `tests/support/build-script-guards.ts:58`) | **AC 9d** |
| 7 | this brief had no `Carried-fix checklist` section | closed here, by the PM |
| 8 | `BUILD_SCRIPT_EXTRACTED_NAMES` (`:572-578`) calls `verifyContentBundleHasNoAngular` "extracted" although no test lifts it | **AC 9e** |

## Attempt 2 — AC 8-10 (after the review; the same six debt rows, nothing new)

8. **The justification sentence becomes true, or it goes.** The split is real and worth keeping — an **absence** scan wants the
   verbatim text (a commented-out `box-sizing: border-box` must go red), a **presence** pin wants stripped text (a commented-out
   `width: 80px` must not satisfy it). So: add a stripped accessor for the presence pins (`codeOnly` over the same component
   stylesheet), point the mascot-geometry, palette and dialog-box **presence** assertions at it, leave every absence scan on the
   verbatim text, and rewrite the doc comment so it names exactly which reads are stripped and which are not. Two decoys become
   required: `/* width: 80px */` inside a reachable `.mascot` rule must make the geometry pin **red** (it currently satisfies it),
   and a commented-out `box-sizing: border-box` must still be **flagged** by the absence scan. If any of those two decoys cannot be
   made to behave that way, stop and report it instead of relaxing the assertion.
9. The four mechanical escapes the review named, each with its own decoy so the widening is not decorative:
   - **a** `styleBlocks` (`tests/options-window-look.spec.ts:229`) matches `<style>` only; widen to an attribute-tolerant form
     (`<style\b[^>]*>`) and pin a `<style type="text/css">img { box-sizing: border-box }</style>` fixture as **read and counted**.
     The spec's "every `<style>` block" then stays literally true.
   - **b** the inline-style absence pin (`:795`) reads a literal `style=`; it must also flag `[style.` and `[attr.style]` on the
     mascot element, with a counterfactual for each, and must still not fire on an element that carries neither.
   - **c** `SHIPPED_ENTRY_DELEGATES` is hand-maintained, so a sixth exported wrapper in `tests/support/build-script-guards.ts` that
     re-implements the extraction is invisible. Pin the module's **exported function-name set** (the sibling of `liveFunctionNames`
     at `tests/toolchain-contract.spec.ts:607`), or derive the table from that set; an unnamed wrapper must be red.
   - **d** read the support module through the same `\r\n` → `\n` normalization `buildScriptSource()` performs, so both scans see
     one line-ending shape.
   - **e** `verifyContentBundleHasNoAngular` sits in `BUILD_SCRIPT_EXTRACTED_NAMES` labelled as extracted while no test lifts it:
     either lift it once through `loadBuildGuard*` or restate the list as "every name the harness **could** lift". Say which you
     chose.
10. **Pin the direction, not the prose.** AC 6 settled verbatim-vs-stripped by writing a reason down; the review showed `codeOnly(...)`
    could be added inside `componentStyles` with all 1019 green. Add a case that asserts the component-stylesheet scan really sees
    comment text (and that the new stripped accessor really does not), so the two directions cannot silently swap.

Constraints for attempt 2 are the constraints of this brief, unchanged: tests and `docs/` only, no file under `src/` or `scripts/`,
baseline **1019 / 46** with the count only growing, `dist/` 11 files, checker **169 info**, `typecheck` green, one commit, commit
before the report.

## Out of scope

- Any file under `src/` or `scripts/`. If an AC can only be closed by touching shipped code, **stop and report it**.
- `S10-2` (extending the selector model to `#id` and document-level ancestors) — the misses are stated in the spec; extending the
  model is a separate slice.
- `S10-8`, `S10-9`, `S10-10` (the alias-shape count, the narrow file sets in five other suites, the eight local comment-strippers).
- `D5` / `A128` (the disabled `Сохранить` look) — task `t10-03`.

## Constraints

- Never weaken or delete an existing pin. Baseline **1013 tests / 46 files**; the count only grows, except an assertion this task is
  explicitly told to delete (AC 1), which must be named in the report.
- No new dependency, no network call. `dist/` stays **11 files**. Do not touch `README.md` (count sync is the PM's).
- Gates in profile order: `npm run build`, `npm test`, `node scripts/check-agent-config.mjs`, `npm run typecheck` — quote exit codes,
  the test count and the `dist/` count. Print no full test log.
- **Order: implement → gates → commit → then write `docs/state/t10-02-engineer.md` in one `write` call → paste the report into the
  final message as well.** Stage 9 lost two runs that died while writing a report after the work was committed.
- One commit. `docs/state/` is the PM's except your own report. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| 1 | `extension-engineer` `4816c481-af5d-4e9c-b69d-9881b99ab01a` | crashed on infrastructure (`prefill: … illegal instruction`) while running its mutation checks. The slice was written but **uncommitted**.
| 1b | resumed as `32aa76ba-28df-4958-ae14-6dda91f69ac9` | died after ~2.5 min with `the engine stopped unexpectedly (exit code -11)`; no edits, the slice stayed in the tree
| 1c | `extension-engineer` `08843a4f-d253-4c0e-a230-8f8aa7f459c3` (finish-only) | told **not** to rewrite the slice: fixed the one red gate (`TS2322` on `liveDeclarationsOf`), ran the four gates, committed `e1f2124`, wrote the report |
| 2 | `code-reviewer` `c7301323-e084-4b0a-b92c-308a1a415437` | **changes requested**: AC 1-7 all pass, replay integrity clean, no pin weakened, 1013→1019 and `dist/` 11 verified — and **one blocking finding**: the AC 6 justification sentence is false about the file it justifies. Seven non-blocking rows for the ledger |
| 2b | `extension-engineer` `b80c9186-d533-423a-8992-b3c294b0e3a2` (attempt 2, AC 8-10) | delivered `01354da`: 5 files (`docs/specs/content-overlay-ui.md`, `tests/options-window-look.spec.ts`, `tests/toolchain-contract.spec.ts`, `tests/support/build-script-guards.ts`, new `tests/support/style-direction-fixture.txt`), no `src/` or `scripts/`; **1019 → 1025 tests / 46 files**, `dist/` 11, checker 169 info, `typecheck` 0 (all re-run by the PM) |

### PM mutation checks on attempt 2 (six, each restored per file, tree clean after every one)

```
N1  src/options/options.component.ts — `width: 80px` exists **only inside a comment**
                                        -> 1 failed   (the presence pin refuses comment text; this was the blocking finding)
N2  src/options/options.component.ts — a commented-out `box-sizing: border-box` in a reachable rule
                                        -> 2 failed   (the absence scan still sees it — the direction did not collapse)
N3  src/options/index.html — a second `<style type="text/css">img { box-sizing: border-box }</style>`
                                        -> 4 failed   (AC 9a: attributed blocks are now read and counted)
N4  src/options/options.component.ts — `[style.box-sizing]="'border-box'"` on the mascot element
                                        -> 1 failed   (AC 9b: the Angular binding shape is caught)
N5  tests/support/build-script-guards.ts — an extra exported wrapper `buildScriptSneaky()` the table never names
                                        -> 1 failed   (AC 9c: the exported-name set pin)
N6  tests/options-window-look.spec.ts — `codeOnly(...)` added **inside** `componentStyles`
                                        -> 3 failed   (AC 10: the direction is a pin, not a paragraph)
```

`N1` and `N6` are the two that the review said could not be made red; both now are, and `N6`'s failure messages name the fixture
(`expected '\n .mascot { …' to contain '/* width: 80px; */'`), which is the evidence that the fixture file is what carries the claim.

### The accident and the recovery (PM, 2026-11-19) — read before trusting any t10-02 number

The slice stayed uncommitted through two crashes, which made it fragile, and the PM then broke it twice while verifying it:

1. A verification loop finished each mutation with `git checkout -- .`, which reverted **the whole uncommitted slice** rather than the
   mutation. For a moment the engineer's work existed only in its run session log.
2. Recovery: replaying the child's own `edit` calls (`type: "toolCall"`, `arguments.edits[]`, in order, LF/CRLF tolerant) rebuilt the
   slice to the same diffstat — 4 files, **+329/−14** — and `npm test` returned to **1019 tests / 46 files**.
3. A second loop restored one file with `git checkout -- tests/support/build-script-guards.ts` and lost that file's 23 lines; the same
   replay put them back and the diffstat matched again. `docs/state/t10-02-extraction-honesty.md` itself was lost in step 1 and is
   rewritten here.

Discipline adopted: a file holding uncommitted work is restored **from a copy** (`cp` from `…/inlinenotes-verify/backup`), never by
`git checkout`, and a mutation loop never ends with `git checkout -- .`. The slice is parked at
`…/inlinenotes-verify/slice-backup/` so a third accident costs nothing.

One gate was genuinely red in the slice, and the accident did not cause it: `npm run typecheck` reports
`tests/toolchain-contract.spec.ts(589,5): TS2322 — 'RegExpMatchArray | []' is not assignable to 'RegExpMatchArray'` (the helper
`liveDeclarationsOf` promises a match array and can answer `[]`). `npm test` passes over it because Vitest transpiles without type
checking — which is precisely why `typecheck` is a gate and not a courtesy.

### The four mutation checks, as run by the PM on the restored slice

Each mutation was applied to one file, the two touched suites were run, and the file was restored from a copy:

```
M1  tests/support/build-script-guards.ts — buildScriptEntryStatement() re-implements the extraction instead of one delegate call
                                            -> 1 failed  (the delegation pin caught it)
M2  src/options/index.html — a second <style>img { box-sizing: border-box }</style> block
                                            -> 4 failed  (every-block scan plus the exactly-one pin)
M3  src/options/options.component.ts — style="box-sizing: border-box" on the mascot element
                                            -> 2 failed  (the inline-style absence pin)
M4  scripts/build-extension.mjs — a second live `function fail (message)` declaration
                                            -> 10 failed (the one-live-declaration pin)
```

## Delegation count

Expected 2 (engineer, reviewer). Used: 3 engineers (two crashed runs of the same slice, one finish-only run) + the reviewer still owed.

## Verdicts

**Attempt 1: not accepted** (review `c7301323`): every acceptance criterion met, the six debt rows genuinely closed, no replay damage —
and one untrue sentence added, which is what AC 6 was supposed to eliminate. Attempt 2 is bounded to AC 8-10 of this brief.

Review artifact: `docs/state/t10-02-review.md` (copied by the PM; the role has no write tool).

## Stage 10 residue, third pass — `t10-02c` (2026-11-19)

`t10-02c` (`7a66202`) closed the hole the attempt-2 review found and I had wrongly called closed: the inline-style
absence pin over the **shipped** template now reads the widened helper, and the decoy lives in the repository as a
test instead of a one-off mutation. Verified independently: adding `[style.box-sizing]="'border-box'"` to the mascot
element turns **3** cases red, and one of them is the named absence pin itself.

Two lessons, both about my own verification rather than the code:

- **A red from a mutation is not evidence until the failing case is named.** My `N4` was red — from the *neighbouring*
  case `renders the mascot in the header, next to the existing title`, whose exact `toMatch(/<img class="mascot" src=… alt="" \/>/)`
  fires on any added attribute. The pin that was supposed to catch the binding stayed green, and I read the red as a
  pass. Reading the failing case name, not the count, is the whole discipline.
- **Widening a helper is not widening the pin.** Attempt 2 widened `carriesInlineStyle` and exercised it on hand-typed
  strings; the shipped assertion kept its own narrow literal. A widened helper plus an unwidened call site is the same
  hole with better prose, and only a mutation **of the shipped file** distinguishes the two.

The attempt-2 reviewer (`1c9e8a3c-e084-4b0a-b92c-308a1a415437`) never delivered a verdict: it looped, its output hit
1.7 MB / 17k lines with one paragraph repeated to the end, and the run was truncated. It found the defect above and
stopped; the remaining AC 8 / 9a / 9c-e / 10 checks were left unfinished and are **unverified by review** as of this
commit.
