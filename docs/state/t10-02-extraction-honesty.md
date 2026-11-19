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
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
