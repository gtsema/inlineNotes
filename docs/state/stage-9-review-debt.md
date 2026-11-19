# Stage 9 review debt — what the accepted tasks left open

Stage 9 closed with three accepted tasks (`t9-01-options-window`, `t9-02-settings-window-look`, `t9-02b-spec-test-debt`). None of
the items below is a defect in shipped behavior; each is a **pin or a sentence** that a review found weaker than its wording
claims. They are collected here so the next stage can pick them as numbered work instead of re-discovering them.

| # | Source | What is weak | The fix, in one line |
|---|---|---|---|
| D1 | `t9-02b` R1 | `tests/support/build-script-guards.ts:88-90` injects a **throwing** `fail`. The shipped `fail` (`scripts/build-extension.mjs:31-33`) is never executed, and nothing pins that it throws or that a failed check becomes exit code 1 — so the guard's behavior is honest, its **exit half** is assumed. | Execute the shipped `fail` itself (same extraction technique), and pin `main()`'s mapping of a thrown failure to a non-zero exit. |
| D2 | `t9-02b` R2 | Two spec sentences say «pinned» where no assertion sits: the 84 px footprint rests on the **absence** of `box-sizing` on `.mascot` (`A127`), and the palette bullet overstates the pair list at its edge. | One assertion each (`ruleBody(...)` has no `box-sizing`), or drop the word «pinned» from that clause. |
| D3 | `t9-02b` R3 | `codeOnly` is exported from the support module and **unused**, while `tests/toolchain-contract.spec.ts:60` and `tests/options-window-look.spec.ts:104` keep their own copies. Three variants of one helper, each able to drift. | One helper, two importers; delete the local copies. |
| D4 | `t9-02b` R4 | The AC 4 negatives scan only `.ts/.tsx/.html/.json` and match names (`window\s*\.\s*close\s*\(`), so a future `src/**/*.mjs` or an indirect call escapes them. | Widen the extension set and add one structural negative (no call expression through a computed member) — or state the limit in the spec sentence instead of implying coverage. |
| D5 | `t9-02` R4 + `t9-02b` R7 | The disabled `Сохранить` (`opacity: 0.45`, label ≈1.4:1 on its own button) is a shipped state with **no ruling**: `A125` names no disabled role and no test names the opacity. WCAG 1.4.3 exempts inactive controls, so nothing is broken; the number is simply ungoverned. | Needs ruling **`A128`** and the user's word. Proposed default: `opacity: 0.55`, label `#b8480d` on the cream card = 5.29:1. Then one pin on the literal. |
| D6 | `t9-02b` R6 | Two guard tests read `dist/`, so `npm test` on a clean clone is red before `npm run build`. That is the gate order (`A62`), not a bug, but nothing says so where a newcomer would trip. | One line in README's quick start: build first, then test. |
| D7 | `t9-01` R5, `t9-02` R7 | README still carries tab-era wording about the settings surface and the stage range; both are owed by the Run 6 row. | Run 6 rewrites them with the sight behind them (`A116`: old rows stay, the new row is added). |

## Budget note

Stage 9 used its three tasks. D1–D4 are a **pin-cleanup slice** and D5 needs a ruling first, so the next stage opens with them
only if the user asks for it; nothing here blocks loading `dist/` or using the extension.
