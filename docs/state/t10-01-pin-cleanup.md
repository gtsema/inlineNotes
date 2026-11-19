# t10-01 — pin cleanup: make the pins mean what their sentences claim (Stage 10)

**Stage 10 opened** by the user's word «Да, доделывай» (2026-11-19), choosing the pin-cleanup slice offered at Stage 9's close.
No new observable behavior is requested or permitted in this stage.

Source of work: `docs/state/stage-9-review-debt.md` — **D1, D2, D3, D4, D6**. **D5** (the disabled `Сохранить`) is excluded: the
ruling `A128` was never issued, so shipped `opacity: 0.45` stands and nobody touches that rule. **D7** is already closed.

## Task

One slice, one commit pair. Close the five debt items by adding or fixing **pins and sentences**, never behavior.

## Acceptance criteria

1. **D1 — the failure half of the build guards stops being assumed.** `tests/support/build-script-guards.ts` injects a throwing
   `fail`; the shipped `fail` (`scripts/build-extension.mjs:31-33`) is never executed, and nothing pins that a failed check becomes
   a **non-zero exit**. Fix it with the same extraction technique the module already uses: execute the shipped `fail` itself, and
   pin how `main()` turns a thrown failure into an exit code. The pin must fail if someone makes `fail` log-and-continue, or makes
   `main()` swallow the throw. No `scripts/` file may be edited to make the test pass.
2. **D2 — remove the word «pinned» from what is not pinned, or pin it.** Two places in
   `docs/specs/content-overlay-ui.md` claim pinning that no assertion backs: the 84 px footprint (`A127` rests on the **absence**
   of `box-sizing` on `.mascot`), and the edge of the palette bullet's pair-list wording. For the first, add one assertion that the
   shipped `.mascot` rule declares no `box-sizing` (assert the absence — do not add the property to `src/`); for the second, narrow
   the sentence. Do not do both.
3. **D3 — one comment-stripping helper, not three.** `codeOnly` is exported from the support module and unused, while
   `tests/toolchain-contract.spec.ts:60` and `tests/options-window-look.spec.ts:104` keep local copies. One helper, both files
   importing it, local copies deleted, and the behavior of both copies preserved (one of them also strips `<!-- -->`).
4. **D4 — state the real coverage of the negative scans, or widen it.** The AC 4 negatives read only `.ts/.tsx/.html/.json` and
   match names, so a future `src/**/*.mjs` or an indirect call escapes them. Either widen the extension set and add one structural
   negative, **or** narrow the spec sentence to name the limit. Choose one, say which and why in the report.
5. **D6 — README quick start says the order.** Two guard tests read `dist/`, so `npm test` on a clean clone is red before
   `npm run build`. One line in the quick start: build first, then test (`A62` gate order). Do not touch the forbidden README
   wording any test checks.
6. **Nothing moved that should not move.** No file under `src/`, no change to any shipped style rule, no new dependency, no
   network call, `dist/` stays 11 files, and the disabled-button rule is untouched.
7. **Gates.** `npm run build` → `npm test` → `node scripts/check-agent-config.mjs` (plus `npm run typecheck`) exit 0, quoted in
   `docs/state/t10-01-engineer.md`. The test count only grows from 991 / 46.

## Ordering the PM imposes because of Stage 9's infrastructure deaths

Two engineer sessions died after committing, while writing their reports. So work in this order:

1. implement, 2. run the gates, 3. **commit** the code/tests/spec, 4. only then write `docs/state/t10-01-engineer.md` in **one
   `write` call** (no `edit` calls on it), 5. end the final message with the report text as well, so the PM can restore it if the
   file does not land. A crash after step 3 loses nothing but the report.

## Constraints

- No behavior change, no `src/` edit, no `scripts/` edit. If an AC can only be closed by changing shipped code, **stop and report**
  instead of doing it.
- Do not touch `src/options/options.component.ts`'s disabled state, the palette literals, the mascot asset, or `angular.json`.
- Existing pins are never weakened or deleted; the count only grows.
- Commit order: the code/tests and the spec edit may share one commit here (a pins-and-sentences slice), the README line may join
  it; the report is committed by the PM.
- `docs/state/*` except your own report is the PM's.
- Print no full test log.

## Attempts log

| # | Child | Result |
|---|---|---|
| 1 | `extension-engineer` `cc5c38a7-5bbf-447d-93dc-3a9fc178e80c` | delivered `196ec0c` (5 files, no `src/`, no `scripts/`): D1 executes the shipped `fail` and the shipped entry handler, D2 absence pin + narrowed palette sentence, D3 one shared helper, D4 widened negative scans, D6 README order line. Gates green: **1002 / 46**, `dist/` 11, checker 166 info. Report copied to `docs/state/t10-01-engineer.md`. |
| 2 | `code-reviewer` `af0c05b3-772d-4f02-aa54-fcfaa67c3fc4` | **blocked** — 2 blocking findings; verdict copied to `docs/state/t10-01-review.md` |
| 3 | `extension-engineer` `a91880a5-dea2-4359-bda7-cbfab5422c7d` (attempt 2, AC 8 only) | delivered `92eece2`: mascot pin widened to every selector that can reach the `img`, extraction reads comment-stripped line-anchored source with six decoy cases built from the shipped text, tautological entry pin replaced by two that can fail, spec sentence cites `A129`. **1013 tests / 46 files**, `dist/` 11, checker 167 info. Report copied to `docs/state/t10-01b-engineer.md`. |
| 4 | `code-reviewer` `ae97efeb-5f05-4f17-b198-235aa0f3f0c7` | **accepted** — both blocking findings **closed**; 11 non-blocking findings, all routed to `docs/state/stage-10-review-debt.md`. Verdict copied to `docs/state/t10-01b-review.md` |

## Delegation count

Expected 2 (engineer, reviewer). **Used: 4** — attempt-1 engineer, attempt-1 reviewer, attempt-2 engineer, attempt-2 reviewer. Two
attempts is the ceiling for this task and it was not exceeded; the ceiling was reached because attempt 1 shipped a real hole rather
than a style problem.

## PM verification of the commit itself

Gates re-run: `npm run build` 0 (`dist/` 11), `npm test` 0 (**1002 tests / 46 files**), `node scripts/check-agent-config.mjs` 0
(0 / 0 / **166 info**), `npm run typecheck` 0. Two PM mutations of the shipped script, each restored with `git diff --quiet scripts/`
verified clean:

- `fail` → `console.error(...)` (log-and-continue): **8 tests fail**.
- `process.exitCode = 1;` removed from the shipped `main().catch(...)` handler: **5 tests fail**.
- after restore: 78/78 green in the two touched suites.

So the D1 requirement became real behavior, not wording.

## The Chrome measurement that settles blocking finding 1 — ruling `A129`

Measured in real Chrome 157 on the built page (`http://127.0.0.1:8124/options/index.html`, `dist/` of `196ec0c`), read-only:

```
img.mascot                 box-sizing = content-box   width/height = 80px   border = 2px solid rgb(166,203,220)   painted = 84×84
app-root (":host")         box-sizing = border-box
.header (the img's parent)  box-sizing = content-box
```

`box-sizing` is **not an inherited CSS property**: Chrome reports `content-box` on the `img` although `:host` declares `border-box`.
The shipped footprint is therefore **84 px** — an 80 px image box plus a 2 px frame painted outside it — and the `A127` reading
stands. The reviewer's finding 1 is right about one thing: the new pin `expect(mascot).not.toMatch(/\bbox-sizing\b/)` reads **only
the `.mascot` rule body**, so a `box-sizing` declared on another selector that matches the same element (`img`, `*`, `.header img`)
would move the frame inside the 80 px and the pin would stay green. **Premise rejected, pin-scope half accepted** → AC 8.

## AC 8 — what attempt 2 owes

1. **Widen the mascot pin** across the whole shipped stylesheet: no rule whose selector can match the mascot (`.mascot`, `img`,
   `*`, `.header img`) may declare `box-sizing`. No `src/` edit.
2. **Close the extraction's silent mode** (finding 2): `buildScriptFunctionSource` and `buildScriptEntryStatement` must run against
   **comment-stripped** source (`codeOnly(buildScriptSource())`) and anchor the function pattern to a **line start**, and the decoy
   case becomes a test: a block-commented throwing `fail` placed above a live log-and-continue `fail` must make the guard pins
   **fail**, not pass.
3. **Remove or fix the tautological assertion** at `tests/toolchain-contract.spec.ts:330` — `buildScriptEntryStatement()` either
   returns text starting with `main().catch(` or throws, so that `expect` cannot fail.
4. **Correct the spec sentence** to state the ruled mechanism (`A129`, with the measurement above), not an unattributed CSS claim.
5. Pins only grow; no `src/`, no `scripts/`; `dist/` stays 11; gates quoted in **`docs/state/t10-01b-engineer.md`**, written after
   the commit in a single `write` call, and pasted into the final message as well.

## PM verification of attempt 2 (`92eece2`)

Gates re-run: `npm test` 0 (**1013 / 46**), `npm run build` 0 (`dist/` 11), `node scripts/check-agent-config.mjs` 0 (0 / 0 / **167 info**),
`npm run typecheck` 0. Then the decoy check, on the shipped script, each mutation restored with `git diff --quiet scripts/` clean:

```
M1  a block-commented throwing fail above a LIVE fail that only console.errors  ->  9 tests fail  (the extractor took the live code)
M2  the same commented decoy, live fail intact                                  -> 89 passed     (no false positive)
```

Before this commit M1 would have been green — that was blocking finding 2. After it, the pins see what the build actually runs.

## Verdicts

**Reviewer (attempt 1): blocked.** Finding 1 — the 84 px sentence plus the new pin; finding 2 — the extraction reads unstripped
source and takes the leftmost match, so a comment decoy is what the pins execute. Its answers also name one tautological pin,
eight surviving local comment-stripper variants inside `tests/`, and two sentences implying more scan coverage than the code gives.

**PM: task `t10-01` ACCEPTED on attempt 2.** D1, D2, D3, D4 and D6 of `docs/state/stage-9-review-debt.md` are closed; `D5` stays
open by decision (`A128` never issued). Stage 10's own review residue is ledgered as `S10-1` … `S10-10` in
`docs/state/stage-10-review-debt.md`, and three claims inside the attempt-2 report are corrected by an annotation at its foot rather
than by rewriting it.
