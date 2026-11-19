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

## `D5` / `A128` — the measurement that invalidated the PM's own proposal (2026-11-19)

The ledger used to record the proposal as «`opacity: 0.55`, label `#b8480d` on the cream card at `5.29:1`». **That number was wrong
and the premise with it.** The `Сохранить` button is a **filled** button: fill `#b8480d`, label **white** (5.29:1 while enabled).
`opacity` fades the fill and the label together, so no opacity value makes the label legible. Composited over the cream card
`#fdf7ee`:

| disabled style | blended fill | blended label | label vs blended fill | label vs card | fill vs card (how different the button looks) |
|---|---|---|---|---|---|
| `opacity: 0.45` (shipped) | `#dea889` | `#edcfbe` | **1.42** | 1.38 | 1.96 |
| `opacity: 0.55` (the withdrawn proposal) | `#d79772` | `#edd0c0` | **1.68** | 1.37 | 2.31 |
| enabled (for reference) | `#b8480d` | `#ffffff` | 5.29 | 1.07 | 4.97 |

So raising the opacity buys almost nothing for the label. The fix, if the user wants one, is to stop expressing the disabled state as
`opacity` and state it as colors, keeping the label at AA. Two candidates measured against the same palette:

| variant | disabled fill | disabled label | label vs fill | fill vs card |
|---|---|---|---|---|
| **A (proposed default)** | `#e3c3aa` | `#1b2a33` | **8.88** | 1.56 |
| **B** | `#d8a684` | `#1b2a33` | **6.81** | 2.03 |

Both keep the label as the same ink the rest of the surface uses, and both leave the disabled button visibly washed out against the
enabled `#b8480d` (fill-vs-card 1.56 / 2.03 against 4.97). WCAG 1.4.3 exempts inactive controls, so this is a legibility choice, not a
compliance defect — which is why it needs a ruling rather than a fix. `A128` will carry whichever the user picks; nothing ships until it
does.

## Rows added by the `t10-02` review (run `c7301323-e084-4b0a-b92c-308a1a415437`, 2026-11-19)

The review of `e1f2124` verdicted **changes requested**: AC 1-7 pass, the six rows above are genuinely closed, replay integrity is
clean, and one sentence the slice added as its own justification is false. That sentence is the blocking finding and is **not** a row —
it is fixed in attempt 2 as AC 8 of `docs/state/t10-02-extraction-honesty.md`: `componentStyles`' doc comment says "everything this text
feeds is an absence claim" and "every presence claim … is wrapped in `codeOnly`", while `:703-709`, `:938-949`, `:1012-1015` and
`:1035-1039` read the same verbatim text through `ruleBody` (`:148-156`, a `{`→`}` slice that keeps comment text). A `/* width: 80px */`
comment inside `.mascot { … }` satisfies the geometry pin while the stylesheet declares nothing — the `t9-02b` R2b pattern, cited two
lines below the claim that it is absent here.

| Row | Defect | Class | Remedy / status |
|---|---|---|---|
| S10-11 | `styleBlocks` (`tests/options-window-look.spec.ts:229`) matches `<style>` literally, so `<style type="text/css">img { box-sizing: border-box }</style>` is **neither read nor counted** (`:770` still answers 1), and no other pin over that document reads `box-sizing`. The spec at `docs/specs/content-overlay-ui.md:92` says the scan reads "every `<style>` block" without stating the limit. | test + spec | taken by **AC 9a** (attribute-tolerant pattern + decoy fixture) |
| S10-12 | The inline-style absence pin is `/[\s]style\s*=/i` (`:795`): `[style.box-sizing]="'border-box'"` or `[attr.style]="…"` on `src/options/options.component.ts:58` moves the 84 px footprint with the pin green, and an inline binding outranks every stylesheet rule. | test | taken by **AC 9b** |
| S10-13 | `SHIPPED_ENTRY_DELEGATES` (`tests/toolchain-contract.spec.ts:689-716`) is hand-maintained: add a sixth exported wrapper in `tests/support/build-script-guards.ts` that re-implements the extraction, point a shipped pin at it, and nothing reads it. The build script already has the symmetric answer (the whole-name-set pin at `:607`); the support module does not. | test | taken by **AC 9c** (pin the exported-function-name set, or derive the table from it) |
| S10-14 | The verbatim-vs-stripped choice is still prose: the AC 6 case calls `boxSizingSelectorsReachingMascot` on a literal string and never touches `componentStyles`, so adding `codeOnly(...)` **inside** `componentStyles` keeps all 1019 green while inverting the documented direction. | test | taken by **AC 10** |
| S10-15 | The delegation pin reads the support module without the `\r\n` → `\n` normalization `buildScriptSource()` performs (`tests/toolchain-contract.spec.ts:730` vs `tests/support/build-script-guards.ts:58`). Cosmetic today, one line-ending shape per scan once fixed. | test | taken by **AC 9d** |
| S10-16 | `BUILD_SCRIPT_EXTRACTED_NAMES` (`:572-578`) lists `verifyContentBundleHasNoAngular` as extracted, but no test lifts it through `loadBuildGuard*` (it appears only inside fixture `main()` bodies at `:243` and `tests/options-window-look.spec.ts:652`). Harmless, covered by the set pin, but labelled wrongly. | test | taken by **AC 9e** (lift it once, or restate the list as "could lift") |
| S10-17 | Replay fingerprint in the **worktree**, not the repo: after the PM's edit-replay, `git ls-files --eol` reported `w/mixed` for `tests/support/build-script-guards.ts` (one LF-only line) while the committed blob is pure LF. | tooling | **closed by the PM**: the worktree copy was normalized to the uniform CRLF that `core.autocrlf=true` produces; `git diff HEAD` is empty, the blob never changed, and both suites are green (95 / 95). Rule kept: normalize line endings by comparing against the blob, not by editing blind. |

The review also flagged that the brief closed six findings without a `Carried-fix checklist` section (rule 8 of
`docs/specs/code-review-flow.md`). **Closed by the PM** — the section is now in `docs/state/t10-02-extraction-honesty.md` and maps each
finding to the AC that answers it.
