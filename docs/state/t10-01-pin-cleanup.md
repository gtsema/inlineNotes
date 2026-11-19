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
| — | not launched yet | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
