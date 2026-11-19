# Stage 10 review debt

Opened by the PM on 2026-11-19 after `t10-01` was accepted. Source: `docs/state/t10-01-review.md`
(attempt 1, 11 remarks) and `docs/state/t10-01b-review.md` (attempt 2, accepted, 11 non-blocking findings).
Nothing here is a behavior defect; every row is a pin or a sentence that does not yet mean what it says.

## Rows

| # | Row | Kind | Close |
|---|---|---|---|
| S10-1 | `tests/toolchain-contract.spec.ts:529-530` (and the pair at `:540-556`): the delegation case is **tautological by construction** — `buildScriptEntryStatement()` *is* `buildScriptEntryStatementFrom(buildScriptSource())` (`tests/support/build-script-guards.ts:219`) and `shippedScript` is the same call (`:366`), so the `toBe` cannot fail. Same defect class AC 8 item 3 removed. | test | Delete the two `toBe` lines or make delegation observable (pin the delegate call in the module text, or drive one shipped pin through an instrumented source). |
| S10-2 | The mascot selector scan is **not strictly wider than CSS**: an `#id`-shaped selector is never reported as matching (`tests/options-window-look.spec.ts:227`, and no pin forbids an `id` on the mascot), and `MASCOT_ANCESTORS` (`:173-177`) stops at `.header` although the document stylesheet is scanned, so `body img { box-sizing: border-box }` in `src/options/index.html` escapes. | test (the spec now states the misses) | Extend the model (`#id` matching, document-level ancestors) or keep the stated edge and pin the shapes that would exploit it. |
| S10-3 | `documentStyles` (`tests/options-window-look.spec.ts:201`) reads the **first** `<style>` block only (`/<style>([\s\S]*?)<\/style>/i.exec`). Verified by the reviewer: a second `<style>img { box-sizing: border-box }</style>` in `src/options/index.html` turns no pin red and falsifies the 84 px footprint. | test | `matchAll` over every block, or pin "exactly one `<style>` block" in the same case. |
| S10-4 | Inline styling is outside the scan: `<img class="mascot" style="box-sizing: border-box">` (`src/options/options.component.ts:58`) also falsifies `A127` with everything green. The spec now names this as a stated limit. | test | One absence pin on `style=` in the mascot's element. |
| S10-5 | `tests/support/build-script-guards.ts:113` takes the **leftmost** match, so a **live duplicate** restores finding 2's silent mode in a new form: two live `function fail (…)` declarations make the real build call the **later** one (JS hoisting) while the extractor runs the **first**. The entry half is pinned (`tests/toolchain-contract.spec.ts:343-346`); nothing pins one live `fail`, one live `main()`, one live guard. | test | Three `toHaveLength(1)` counts over `codeOnly(buildScriptSource())`. |
| S10-6 | `buildScriptMainBodyFrom` (`tests/support/build-script-guards.ts:86`) anchors with `code.indexOf('async function main() {')`, unlike the other three extractors: comment copies can no longer win, but an occurrence inside a string literal or an indented declaration could. | test | One regex with the same `^[ \t]*` shape. |
| S10-7 | `componentStyles` (`tests/options-window-look.spec.ts:110-117`) returns the stylesheet **verbatim**, while `documentStyles` (`:204`) applies `codeOnly`. For an absence pin the direction is safe (a commented-out `box-sizing` in a reachable rule makes it **red**), but it is undocumented and inconsistent with the rule that shipped-code claims read stripped text (`t9-02b` R2b). | test | One comment in the helper, or strip. |
| S10-8 | Attempt-1 remark 1, still open: the settings-window bullet in `docs/specs/content-overlay-ui.md` lists **seven** method names for the bracket shape and then says "an alias of one of those methods", while the alias shape covers **five** (`tests/toolchain-contract.spec.ts:664` vs `:662`) — no `open`, no `openOptionsPage`. | spec or test | Name the five, or extend the alias shape to seven. |
| S10-9 | Attempt-1 remark 2, still open: narrow `.ts`/`.tsx`-shaped file sets in `tests/content-anchor-boundaries.spec.ts:37`, `tests/content-create-card-boundaries.spec.ts:69`, `tests/content-throw-boundaries.spec.ts:48`, `tests/core-storage-keys.spec.ts:56`, `tests/core-storage-port.spec.ts:157,171` sit under the code-level claim of spec item 27. | test | Fold them into the widened scan `t10-01` D4 built, or state the narrower scope in item 27. |
| S10-10 | Eight local comment-stripper variants still live inside `tests/`: `tests/content-anchor-boundaries.spec.ts:49`, `tests/content-create-card-boundaries.spec.ts:73`, `tests/content-overlay-host.spec.ts:26`, `tests/content-spa-refresh.spec.ts:127`, `tests/core-storage-keys.spec.ts:38`, `tests/core-storage-port.spec.ts:28`, `tests/entry-rules.spec.ts:98`, `tests/page-key.spec.ts:55`. A pin at `tests/toolchain-contract.spec.ts:394-404` names exactly these eight, so the list cannot rot silently. | test | Fold them into the shared helper; note that `content-create-card-boundaries.spec.ts:73` differs (path + read + replace with `''`, not `' '`), so folding it is a behavior change for that suite. |

## Closed while the ledger was opened

- **The `two` / `three` declaration count in the mascot bullet** (attempt-2 finding 1): the spec said the surface ships two
  `box-sizing: border-box` declarations; it ships **three** — `:host`, `.options`, `.input` (`src/options/options.component.ts:96, 103, 151`).
  PM fixed the word and named the third; the conclusion is unaffected, because `.input` is an `<input>` and no selector that can match
  the mascot reaches it.
- **The "wider than real matching, never fewer" claim** (attempt-2 finding 2): the sentence now states the two misses instead —
  `#id` selectors and document-level ancestors — and points at rows S10-2 and S10-3.
- **README counts** (attempt-2 finding 10): `1002 → 1013`, `166 → 167 info`; the brief forbade the engineer from touching `README.md`,
  so this was PM bookkeeping. No test pins the counts, so nothing went red — which is itself the reason the PM syncs them at acceptance.
- **False references inside `docs/state/t10-01b-engineer.md`** (attempt-2 finding 9): corrected by a PM annotation section rather than by
  silent rewriting — `tests/support/source-comments.ts` does not exist (`codeOnly` lives at `tests/support/build-script-guards.ts:66`),
  `buildScriptFunctionNames()` does not exist in the repository, and the quoted extraction pattern is not the shipped one
  (`^[ \t]*function ${name}\([^)]*\) \{` with `m`, accepting neither `async` nor `export`).

## What Stage 10 did not take

`D5` from `docs/state/stage-9-review-debt.md`: the disabled `Сохранить` rule (`opacity: 0.45`) has no ruling. `A128` was reserved and
never issued, so nothing was changed. If the user wants it taken up, the recorded proposal is `0.55` (label `#b8480d` on the cream card
at 5.29:1), and it needs a ruling first.
