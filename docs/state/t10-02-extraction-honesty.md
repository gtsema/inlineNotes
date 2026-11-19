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
| 1c | `extension-engineer` `08843a4f-d253-4c0e-a230-8f8aa7f459c3` (finish-only) | told **not** to rewrite the slice: fix the one red gate (`TS2322` on `liveDeclarationsOf`), run the four gates, one commit, report in one `write` call |

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

Pending the finish-only run and the review.
