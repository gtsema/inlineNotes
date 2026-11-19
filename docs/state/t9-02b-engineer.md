# t9-02b — engineer report (copied by the PM from the run artifact; the role routed it to its run directory instead of the repo)

# t9-02b — engineer report (spec-test debt: AC 1–9)

Task: close the carried findings of the `t9-01` and `t9-02` reviews — no spec sentence states an unobserved
observable as fact, and every rule an AC names gets a pin or is narrowed. Brief:
`docs/state/t9-02b-spec-test-debt.md`.

This run is a **verification run over an already-landed commit**, not a new implementation. The engineer session
that produced the commit died twice while writing this report. Nothing in the repository was changed here: every
statement below is backed by a file read in this run or a command run in this run.

## Commits

| Commit | Content |
|---|---|
| `4c49f8a` — `test(specs,tests) t9-02b (AC1-AC9): the spec stops claiming what nobody measured, and five unpinned rules get pins` | The whole slice: 1 spec file + 2 test files + 1 new test-support module. `git show --stat 4c49f8a` → `4 files changed, 639 insertions(+), 11 deletions(-)`. |
| parent `d8685bc` (PM) | The brief that closed the task state file; carries the PM's own PNG decode numbers. |

Verified in this run:

- `git diff --name-only d8685bc 4c49f8a` → exactly `docs/specs/content-overlay-ui.md`,
  `tests/options-window-look.spec.ts`, `tests/support/build-script-guards.ts`,
  `tests/toolchain-contract.spec.ts`. **Nothing under `src/`**
  (`git diff --name-only d8685bc 4c49f8a -- src/` → empty), so the pinned PNG, the palette literals and the
  shipped component are the same bytes the `t9-02` review measured.
- The working tree was clean at the start of this run (`git status --porcelain` → empty) and holds no change of
  mine at the end.

## Changed paths

| Path | Delta (from `git show --stat 4c49f8a`) | Role in this slice |
|---|---|---|
| `docs/specs/content-overlay-ui.md` | 14 lines touched (6 bullets + item 28) | AC 1, 3, 4, 5, 6 wording made honest: pinned halves named, vacuous half narrowed, measured PNG facts stated, sight left with Run 6. |
| `tests/options-window-look.spec.ts` | +411 / −… (now 765 lines, 26 `it(` blocks) | AC 2 width pin, AC 3 asset-guard run, AC 5 PNG decoder + circle pin, AC 6 derived pair set, AC 7 rule-shaped binding pin, AC 8 `messageClass()` mapping. |
| `tests/support/build-script-guards.ts` | +101 (new) | Lifts the shipped build guards out of `scripts/build-extension.mjs` and runs them with injected stubs (AC 3). |
| `tests/toolchain-contract.spec.ts` | +124 (now 758 lines, 41 `it(` blocks) | AC 3 manifest-reference guard run + order/exit-code pin, AC 4 source scans + manifest-absence pin. |

## Commands run

Profile order (ruling `A62`): `npm run build` → `npm test` → `node scripts/check-agent-config.mjs`, plus
`npm run typecheck`. Exit codes are the real ones from this run. No full test log is printed here.

| # | Command | Exit | Tail / measured output |
|---|---|---|---|
| 1 | `npm run build` | **0** | `[build] manifest references resolved: content.js, popup/index.html, options/index.html` · `[build] options asset present: dist/options/assets/cat-mascot.png` · `[build] dist/ is a self-contained MV3 folder (11 files)` |
| 1b | `find dist -type f \| wc -l` | 0 | **11** — the `dist/` file count did not change (the brief's ceiling). |
| 2 | `npm test` | **0** | `Test Files 46 passed (46)` · `Tests 991 passed (991)` · no `FAIL`. Baseline at `d8685bc` was 976 / 46 (`docs/state/t9-02-engineer.md:59`, `docs/state/t9-02-review.md:22`), so **+15 tests, 0 new files**: `tests/options-window-look.spec.ts` 18 → 26 `it(` blocks, `tests/toolchain-contract.spec.ts` 34 → 41. No existing pin was weakened. |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 162 info(s)` (156 infos at the `t9-02` review; the infos are the spec's "planned path not created yet" notes). |
| 4 | `npm run typecheck` | **0** | `tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit` — silent. |

Read-only evidence commands run for this report (no writes):

- `git show --stat 4c49f8a`, `git show 4c49f8a`, `git diff --name-only d8685bc 4c49f8a [-- src/]`,
  `git log --oneline -S "never produces a horizontal scrollbar" -- docs/specs/content-overlay-ui.md`,
  `git status --porcelain`, `git check-ignore -v dist`.
- `grep -n scrollbar docs/specs/content-overlay-ui.md` → 2 hits (`:95`, `:292`), both requirement-shaped.
- `grep -rn "split('{{')" tests/` → no match at HEAD; the same grep at `d8685bc` hits
  `tests/options-window-look.spec.ts:354` (`expect(template.split('{{').length - 1).toBe(6)`), proving AC 7
  replaced rather than duplicated the count.
- Independent PNG decode, run inline with `node -e` (no file written, no repo change):
  `{"w":128,"h":128,"painted":13054,"bounds":{"minX":0,"maxX":127,"minY":0,"maxY":127},"outside":162,"outsideOpaque":0,"maxOut":156,"maxIn":255,"farthest":"64.52"}` —
  this reproduces the PM's scratch decode and every number the spec quotes at
  `docs/specs/content-overlay-ui.md:92`.

## AC self-check

| AC | Verdict | Evidence read in this run |
|---|---|---|
| **1** — no unmeasured observable written as shipped fact | **satisfied at HEAD** (the restatement itself predates this commit — see Deviations) | `grep -n scrollbar docs/specs/content-overlay-ui.md` → only `:95` and `:292`. `:95` ends: "Whether a horizontal scrollbar appears at the dialog's own width has never been seen in Chrome: Run 6 owes that sight, and **no sentence here claims it as something the reader sees**". `:292`: "the sight of that box — and of the absence of a horizontal scrollbar — stays a Run 6 item". The flagged claim «never produces a horizontal scrollbar» is absent; `git log -S` shows the phrase left the spec in `ebb493e`. A grep for the dialog-box rule (`:95`) finds a requirement plus a pin, not a claim. |
| **2** — the layout rule `t9-02` ships is pinned mechanically | **satisfied** | `tests/options-window-look.spec.ts:677` — "sizes the card by the box and ships no fixed width beyond the cap and the mascot": `ruleBody(styles, ":host")` has no `width:` declaration; `.options` matches `width: 100%;`, has **no** `min-width:`, matches `max-width: 360px;`; `src/options/index.html` (comments stripped) contains no `width` at all. Supported by `:655` (`min-height: 100vh`, `box-sizing: border-box`, `margin: 0 auto`, `body { margin: 0; }`) and `:649` (no `width: 360px` anywhere). Spec mirror: `docs/specs/content-overlay-ui.md:95`. |
| **3** — the build-script scan pin proves the rule, not the wording | **satisfied** | New `tests/support/build-script-guards.ts`: `buildScriptSource()` :34, `codeOnly()` :41, `buildScriptMainBody()` :52, `loadBuildGuard()` :69 — extracts a named top-level guard from `scripts/build-extension.mjs` and calls it with `existsSync`, `join`, `distDir`, `fail` (→ throw), `logStep` injected. Manifest reference check now **run**: `tests/toolchain-contract.spec.ts:173` (a `dist/` where `dist/options/index.html` is hidden → throws `/manifest reference "options\/index\.html" does not exist inside dist\//`), `:183` (a reference that escapes `dist/` is refused **before** the filesystem is asked), `:189` (the real `dist/manifest.json` answers with silence), `:198` (the loop, the `existsSync(join(distDir, reference))` test, the failure message, the verification order — `verifyManifestReferences`, `verifyContentBundleHasNoAngular`, `verifyOptionsAssetShips` all before `report()` — and `main().catch(` + `process.exitCode = 1`). Shipped side read to confirm the extraction is honest: `scripts/build-extension.mjs:89`, `:119`, `:121-122`, `:150-157`, `:181-198`; every inner brace is indented, so the loader's `\n\}` boundary is the function's own closing brace. |
| **4** — the two negatives are pinned, and the vacuous half is narrowed | **satisfied** (pin chosen, narrowing applied to the vacuous half) | `tests/toolchain-contract.spec.ts:232` — no file under `src/` whose **code** (comments stripped) matches `window\s*\.\s*close\s*\(` or `resizeTo\s*\(`. `:242` — no `src/content/` file names `openOptionsPage` / `options_ui` / `options_page`, and `chrome.runtime.openOptionsPage()` has exactly one call site: `['src/popup/popup.component.ts']`. `:258` — `manifest.icons`, `manifest.action?.default_icon`, `manifest.content_scripts[0].css` are all `undefined`, so the spec's "the check also collects these" cannot rot into a vacuous truth. Spec narrowed: `docs/specs/content-overlay-ui.md:87` ("Both halves are **pinned**, not asserted"), `:88` ("pins that negative … **exactly one** call site"), `:89` ("**this manifest names none of the three**: that half of the check is coverage for a shape the extension does not use"). |
| **5** — the mascot circle gets a byte-level pin | **satisfied** | `tests/options-window-look.spec.ts:242` `pngParts` (chunk walk), `:278` `decodeMascotFrame` (inflate `IDAT` with `node:zlib`, all five PNG filters unfiltered, alpha walked; refuses any bit depth/color type other than 8-bit RGBA), thresholds at `:220` (`PAINTED_ALPHA = 8`) and `:222` (`OPAQUE_ALPHA = 200`). Pins: `:514` — grid 128×128, `paintedPixels === 13_054`, bounds `{minX: 0, maxX: 127, minY: 0, maxY: 127}`; `:523` — `outsideOpaque === 0`, `maxAlphaOutside < 200`, `maxAlphaInside === 255` (non-vacuity of the alpha threshold), `farthestPaintedRadius > 64` and `0 < outsidePainted < 1_000` (non-vacuity of the clip). My own inline decode reproduced 13 054 / 162 / 0 / 156 / 255 / 64.52 (see Commands run). PNG not edited: the commit touches no file under `src/`, and the hash+size+IHDR pins still stand at `:379`, `:384` (SHA-256 `a899a91…46b4`, 27 414 bytes). Spec mirror: `docs/specs/content-overlay-ui.md:92`. No new dependency, no second fixture, no network call (`inflateSync` is `node:zlib`). |
| **6** — the contrast claim matches what the test does | **satisfied** | The missing pair is on the list: `tests/options-window-look.spec.ts:77` — `['the author-name field ink on its own field background', PALETTE.ink, PALETTE.onAction]` = `#1b2a33` on `#ffffff`. The list is now **derived**, not hand-kept: `:171` `declaredTextColors` walks every shipped rule declaring `color:`, `:89` `TEXT_ROLE_BACKGROUND` names the carrier a new text role must join, `:186` `declaredBackground` resolves it, and `:618` throws for any shipped text role absent from the table and asserts the derived set **equals** `TEXT_PAIRS` ("and no others"). Spec sentence narrowed accordingly: `docs/specs/content-overlay-ui.md:93` ("recomputes the WCAG contrast ratio of every text pair the shipped stylesheet **itself declares** … fails when the resulting pair set is not exactly the pair list the test keeps beside it"). |
| **7** — the interpolation count is replaced by the rule it protected | **satisfied** | The count pin is gone: `grep -rn "split('{{')" tests/` → nothing at HEAD; the same grep at `d8685bc` returns `tests/options-window-look.spec.ts:354`. Replacement at `tests/options-window-look.spec.ts:710`: every interpolation matches `^[A-Za-z_$][\w$]*(\([^()]*\))?(\.[A-Za-z_$][\w$]*)*$` (a member read or a no-arg call — no literal, no inline expression), the six pinned bindings (`title`, `nameLabel`, `nameHint`, `save`, `counter()`, `message()`) all arrive as bindings, and with bindings stripped the template contains no Cyrillic. That is the failure the count stood in for, and it survives an honest extra interpolation. |
| **8** — the message color role is pinned | **satisfied** | `tests/options-window-look.spec.ts:734` + `:751`: the shipped decision is reached without constructing the component (`Object.create(OptionsComponent.prototype)` with only `view` stubbed), and the two class names are read **out of the stylesheet** — `textRoleOwning(styles, "#0f5f7a")` and `textRoleOwning(styles, "#b3261e")` (`:196`) throw unless each color is the ink of exactly one rule. Assertion: `messageClassFor('saved') === 'message message--saved'`, and every other key of `OPTIONS_MESSAGE_TEXT` → `'message message--refusal'`. Shipped code confirmed: `src/options/options.component.ts:229-231` with rules at `:185` / `:189` and the binding at `:80`. A swapped mapping now fails the gate. |
| **9** — gates quoted in the engineer's report | **satisfied for the gates; the file location is parent-owned** | The four gates were re-run in this session with the exit codes in the table above (all 0), quoted inside this report. AC 9 asks for the file at `docs/state/t9-02b-engineer.md` written by the engineer's own write tool; this run's authoritative output path is the harness artifact path, so the repo copy exists once the parent persists this artifact. I created no file under `docs/state/` in the repository (the brief makes that file the report's destination and forbids other writes). |

## Carried-fix checklist

1. **Finding 2 of the `t9-01` review (AC 1–2 here)** — **done.** Spec:
   `docs/specs/content-overlay-ui.md:95` (requirement + "no sentence here claims it as something the reader
   sees") and `:292`. Pin: `tests/options-window-look.spec.ts:677`, backed by `:649` and `:655`. Caveat recorded
   in Deviations: the sentence restatement landed in `ebb493e`; `4c49f8a` adds the pin clause and verifies the
   grep.
2. **Remark R2 of `t9-01` *and* remark R2 of `t9-02` (AC 3 — both guards, not one)** — **done.** Shared
   mechanism: `tests/support/build-script-guards.ts:69` (`loadBuildGuard`). Manifest reference check:
   `tests/toolchain-contract.spec.ts:173`, `:183`, `:189`, `:198`. Options asset guard (the substring pins the
   `t9-02` review pointed at, now `tests/options-window-look.spec.ts:435`, complemented not replaced):
   `tests/options-window-look.spec.ts:452` (absent → throws, shipped → silent) and `:463` (order +
   `process.exitCode = 1`). Spec mirror: `docs/specs/content-overlay-ui.md:89`.
3. **Remark R3 of `t9-01` (AC 4)** — **done**, with the pin chosen over the narrowing for the two real negatives
   and the narrowing applied to the vacuous half: `tests/toolchain-contract.spec.ts:232`, `:242`, `:258`;
   `docs/specs/content-overlay-ui.md:87`, `:88`, `:89`.
4. **Blocking finding 1 of `t9-02` (AC 5)** — **done.** `tests/options-window-look.spec.ts:242`, `:278`,
   `:220`, `:222`, `:514`, `:523`; spec `docs/specs/content-overlay-ui.md:92`. The PNG was not edited and the
   assertion was not softened (`outsideOpaque === 0` at `alpha ≥ 200`, with the non-vacuity guards the brief
   asked for).
5. **Remarks R3, R9, R5 of `t9-02` (AC 6–8)** — **done.** R3: `tests/options-window-look.spec.ts:77`, `:89`,
   `:171`, `:186`, `:618` + spec `:93`. R9: `tests/options-window-look.spec.ts:710` (count pin deleted). R5:
   `tests/options-window-look.spec.ts:734`, `:751` against `src/options/options.component.ts:229-231`.

No checklist item was skipped.

## Deviations and notes for the PM

1. **AC 1's restatement is not in this commit.** `git log -S "never produces a horizontal scrollbar"` shows the
   flagged sentence was replaced in `ebb493e` (the `t9-01` review close, a PM docs commit). `4c49f8a` therefore
   satisfies AC 1 by grep-verification plus the AC 2 pin clause inside the same bullet, not by rewriting the
   sentence. The AC's own criterion ("a grep for the dialog-box rule finds a requirement, not a claim") holds at
   HEAD, so I did not touch the spec.
2. **AC 9's file location.** AC 9 asks for `docs/state/t9-02b-engineer.md` as a repo file. This run was told to
   write exactly one file at the harness artifact path and to change nothing else, so the repo copy is the
   parent's persistence step. If the acceptance gate checks the repo path, that copy is the remaining action.
3. **README is now stale by 15 tests** (`README.md:59` «976 тестов в 46 файлах», `:136-137` the same pair). The
   brief forbids touching README numbers (owned by `t9-03`), and no test pins those numbers, so the stale claim
   is green. Flag for `t9-03`: 976 → **991** tests, 46 files unchanged, 11 files in `dist/`, checker infos
   156 → **162**.
4. **An untracked file appeared in the tree during this run**: `docs/state/run-6-settings-window.md`
   (3 244 bytes, 40 lines, mtime 12:14:40, i.e. while my gates were running). I did not write it and did not
   touch it; the tree at the start of this run was clean. It is not part of `4c49f8a`. Whoever owns it should
   commit or remove it before the next writer runs.
5. `check-agent-config.mjs` grew from 156 to 162 infos between the `t9-02` review and this run. Still 0 errors /
   0 warnings, exit 0; the new infos are the checker's "planned path not created yet" notes, not a regression.
6. Test growth is exactly the +15 the brief allowed (976 → 991, 46 files). `dist/` stayed at 11 files. No pin was
   deleted except the count pin AC 7 explicitly orders removed.

## Residual risks

1. **The guard pins are text-extraction based.** `loadBuildGuard` runs the shipped guard through `new Function`,
   which keeps the pin honest but couples it to the script's textual shape (a top-level
   `function name(...) { … }` closed at column 0, with the names `existsSync` / `join` / `distDir` / `fail` /
   `logStep` in scope). Renaming or inlining a guard fails loudly with a named error rather than silently —
   documented in the module header — but a future refactor of `scripts/build-extension.mjs` will need this
   module edited in the same commit.
2. **The guard runs depend on a built `dist/`** (`dist/manifest.json`, `DIST_ROOT`). On a clean clone,
   `npm test` before `npm run build` would be red. That is already the gate order (ruling `A62`), so the risk is
   only a person running the gates out of order.
3. **The PNG numbers in the spec are prose; the test pins rules plus one exact count.** `13 054` painted pixels
   is exact; `162` outside pixels, `156` highest outside alpha and `64.52` farthest radius are pinned as bounds
   (`0 < outside < 1000`, `maxAlphaOutside < 200`, `farthestPaintedRadius > 64`). That is what the brief asked for
   ("rule-shaped"), and my independent decode confirms the quoted numbers today. Residual: a change of the pixel
   model (for example measuring to corner rather than center) could shift the prose numbers without tripping a
   gate — but any change to the file itself trips the SHA-256/size/IHDR pins first.
4. **The source scans see `.ts`, `.tsx`, `.html`, `.json` only** (`sourceFiles()` in
   `tests/toolchain-contract.spec.ts`). Today the only non-matching file under `src/` is the mascot PNG, so the
   `window.close` / `resizeTo` / `openOptionsPage` negatives are complete; a future `.mjs` module inside `src/`
   would escape them.
5. **`TEXT_PAIRS` and `TEXT_ROLE_BACKGROUND` must be edited together.** The set-equality pin at `:618` makes an
   omitted role loud (a throw), but it also means a legitimate palette change requires two coordinated edits; a
   role added with the wrong carrier silently inherits the wrong background only if the table is wrong, and the
   equality check is what catches that.
6. **Nothing in `tests/` pins the README counts**, so the 976 → 991 drift in note 3 cannot fail a gate.
7. **The unobserved half stays unobserved.** This slice buys evidence about bytes and shipped style text. The
   sight of the settings dialog in Chrome — the centered card, the 84 px mascot footprint, the absence of a
   horizontal scrollbar — is still Run 6's debt, and the spec says so at `:92`, `:95`, `:292`.
