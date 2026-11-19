# t10-02 attempt 2 — extension-engineer report (AC 8, AC 9a-e, AC 10)

Task: `t10-02`, attempt 2. Brief: `docs/state/t10-02-extraction-honesty.md` -> "Attempt 2 — AC 8-10".
Debt rows closed: `S10-11`, `S10-12`, `S10-13`, `S10-14`, `S10-15`, `S10-16` of
`docs/state/stage-10-review-debt.md`.
Commit: `01354da` (one commit, on top of `ad93d63`).
Baseline respected: **1019 → 1025 tests / 46 files** (only growing; no assertion deleted).

## 1. Changed paths

| Path | Change |
|---|---|
| `tests/options-window-look.spec.ts` | AC 8 (stripped presence accessor + re-routed presence pins + rewritten doc comment), AC 9a (attribute-tolerant `<style\b[^>]*>`), AC 9b (inline-style shapes), AC 10 (new direction-pinned describe). +240 / −47 across the file. |
| `tests/support/style-direction-fixture.txt` | **new**. A `.txt` scan fixture: a `styles:` template literal whose every declaration sits **inside a comment**. Read as text by the options suite. |
| `tests/toolchain-contract.spec.ts` | AC 9c (exported-function-name set of the support module + smuggled-wrapper decoy), AC 9d (`supportModuleSource()` + one-line-ending-shape case), AC 9e (`BUILD_SCRIPT_EXTRACTED_NAMES` → `BUILD_SCRIPT_LIFTABLE_NAMES` + the case that runs the label). |
| `tests/support/build-script-guards.ts` | AC 9d: new exported `normalizeLineEndings`, `buildScriptSource()` delegates to it, module doc comment extended. |
| `docs/specs/content-overlay-ui.md` | Five sentences updated in the same commit (see §6). |

Untouched, verified: everything under `src/`, everything under `scripts/`, `README.md`,
`package.json`, `angular.json`, `dist/` (build output only). `git show --name-only HEAD` lists no
`src/`, `scripts/` or `README` path.

## 2. AC 8 — the justification sentence is now true

`componentStyles(path)` stays **verbatim** and is the text the absence scans read. A second
accessor was added:

```ts
function componentCodeStyles(componentPath: string): string {
  return codeOnly(componentStyles(componentPath));
}
```

Presence assertions moved to it; every absence stayed on the verbatim text.

* Re-routed to the stripped read (same literals, same selectors, different accessor):
  the mascot geometry (`width: 80px`, `height: 80px`, `border-radius: 50%`, `object-fit: cover`,
  `object-position: center`, `border: 2px solid #a6cbdc`); the **ten** palette role literals
  (`:host` background, `.options` ink, `.hint`, `.counter`, `.save` action + label,
  `.message` band, `.message--saved`, `.mascot` and `.options` decorative); the dialog-box rules
  (`width: 100%`, `max-width: 360px`, `min-height: 100vh`, both `box-sizing: border-box`,
  `margin: 0 auto`, `(?:^|;)\s*width:\s*100%;`, `max-width:\s*360px;`).
* Kept verbatim (absences, deliberately): the `boxSizingSelectorsReachingMascot` walk over
  component + document stylesheets, the `box-sizing` absence inside the `.mascot` body, the
  "no shipped `width: 360px`" scan, the `:host` `width` and card `min-width` absences, the
  color-literal set that must equal the pinned palette, the declared-text-pair walk, the
  one-owner lookup of the message-line case, and `shippedRules(componentCss).length`.
* The doc comment was rewritten and now names **exactly** which reads are stripped and which are
  verbatim, including the one verbatim read that is not an absence
  (`shippedRules(componentCss).length`), so the paragraph cannot be read as more than it is.

The two required decoys:

* `/* width: 80px */` (plus the `height`/`border-radius` comments) inside a reachable `.mascot`
  rule, with the live declarations gone → the geometry pin is **red** (mutation `M1` below). It
  satisfied that pin before this change; the new case
  `expect(verbatim).toMatch(/width: 80px/)` records that fact as an assertion, so the old escape
  is visible in the diff instead of asserted away.
* a commented-out `box-sizing: border-box` in the same rule → still **flagged** by the absence
  scan (mutation `M1`, red case
  "declares no box-sizing on any shipped rule whose selector can reach the mascot").

## 3. AC 9a — every `<style>` block, attribute-tolerantly

`styleBlocks` went from `/<style>([\s\S]*?)<\/style>/gi` to `/<style\b[^>]*>([\s\S]*?)<\/style>/gi`.
The case that scans the document now also pins `<style type="text/css">img { box-sizing:
border-box }</style>` as **read** (one block, and its declaration is reported by the selector
walk) and **counted** (shipped document + that fixture = 2 blocks). The shipped document is still
pinned to the one block it ships. The spec's "every `<style>` block" is now literally true; the
spec sentence states the attribute tolerance.

## 4. AC 9b — inline style in every shape Angular ships one in

New helper `carriesInlineStyle(elementText)` covering `style=`, `[style]` / `[style.x]` and
`[attr.style]`. The accepted AC 3 assertions were **left exactly as they were** and the new
assertions were added beside them: three counterfactuals (one per binding shape) answer `true`,
and two innocent elements (attributes reordered; an attribute *value* containing the word `style`)
answer `false`, so the widened scan cannot be satisfied by a matcher that fires on everything.

## 5. AC 9c, 9d, 9e

* **9c** — `liveExportedFunctionNames` + `SUPPORT_MODULE_EXPORTED_NAMES` pin the support module's
  complete exported-function set (14 names), and the delegation table's wrappers are checked to be
  members of it. The decoy is the wrapper the review named, appended in-test to the module's own
  text: it is named, the set it produces is not the pinned one, and its body matches the named
  `PRIVATE_EXTRACTION_SHAPES` regex — the same regex the wrapper pin asserts against, now written
  once instead of inline. **Honest limit:** the pinned name list is itself hand-maintained; what
  the pin guarantees is that no exported helper of the harness can sit unread (a new name is red
  the day it ships, and keeping it green means naming it in the test that reads it). It does not
  force the delegation table to classify every export. The comment in the case says this.
* **9d** — `normalizeLineEndings` is exported from the support module, `buildScriptSource()`
  delegates to it, and the contract suite reads the module through `supportModuleSource()` =
  `normalizeLineEndings(readFileSync(...))`. A new case pins the shape on the text the pins
  consume: the script read, the module read and **every extracted wrapper body** contain no
  carriage return, plus `normalizeLineEndings('a\r\nb\r\nc') === 'a\nb\nc'`, plus the body of
  `buildScriptSource` containing the `normalizeLineEndings(` call so the two readers cannot
  revert to private `replaceAll`s.
* **9e** — chosen remedy: **restate the list as "could lift"**, not lift the guard.
  `BUILD_SCRIPT_EXTRACTED_NAMES` → `BUILD_SCRIPT_LIFTABLE_NAMES`, with a doc comment that says
  which name does not earn the label and why (`verifyContentBundleHasNoAngular`'s body calls
  `readFileSync`, and `loadBuildGuard*` injects no filesystem reader — widening that stub surface
  is not this task's decision). The label is then **run**: a new case lifts every name on the
  list out of the shipped script through one of the two extractors and requires the declaration
  text back, and refuses `verifyNoSuchGuard` with the extraction's own error. Lifting the content
  bundle guard was not done, so `S10-16`'s "no test lifts it" stays true as a fact; what changed
  is that nothing calls it "extracted" anymore.

## 6. AC 10 — the direction is a pin, not prose

New describe: *"the stylesheet is read verbatim for absences and stripped for presence (t10-02
AC8, AC10; row S10-14)"*, three cases, all against `tests/support/style-direction-fixture.txt`:

1. the verbatim accessor **flags** the commented-out `box-sizing` in a reachable rule, and the
   stripped accessor does not;
2. the verbatim read **is** satisfied by `/* width: 80px */`, and the stripped read refuses
   `width: 80px`, `height: 80px`, `border-radius: 50%`;
3. the two accessors are one stripping apart on one path: `verbatim` contains
   `/* width: 80px; */`, `stripped` contains no `width: 80px` at all but still contains
   `.mascot {` (so a helper that deleted whole rules would not pass either).

The fixture is `.txt` on purpose: `tsc` does not compile a dangling `styles:` expression, the
`codeOnly`-private-copy inventory (extension-filtered over `tests/**`) is unaffected, and it is not
a spec file, so the file count stays 46.

Spec sentences edited in the same commit (`docs/specs/content-overlay-ui.md`): (a) the mascot
bullet's "no `style` attribute at all" → "no inline style at all", naming the three shapes; (b) the
`<style>`-block sentence now states the attribute-tolerant opening tag; (c) "every guard the
harness lifts" → "every guard the harness **could** lift by name", with the claim the test runs;
(d) the delegation sentence gains the exported-function-set pin and the one-line-ending-shape
rule; (e) the palette bullet states the two reading directions and the comment-only fixture. Two
stated limits were removed by AC 9a/9b, so their sentences moved in the same commit (attempt-1
AC 7 rule).

## 7. Decoy / mutation checks (all restored from copies, never `git checkout`)

Copies were taken to `Desktop/inlinenotes-verify/t10-02b-backup/` before any mutation and each
restore was verified with `cmp` (byte-identical).

| # | Mutation (temporary) | Red it produced |
|---|---|---|
| M1 | `src/options/options.component.ts`: live `width: 80px` / `height: 80px` / `border-radius: 50%` commented out, `/* box-sizing: border-box; */` added inside `.mascot` | 2 red: "frames the mascot with CSS at 80 CSS px…" (**decoy 1 of AC 8**) and "declares no box-sizing on any shipped rule whose selector can reach the mascot" (**decoy 2**); 36 green |
| M2 | `codeOnly(...)` added inside `componentStyles` (the exact S10-14 defect) | 3 red, all in the new AC 10 describe; the other 35 cases stayed green, i.e. the pre-existing suite could not see it |
| M3 | `styleBlocks` pattern reverted to the literal `<style>` | 1 red: "reads every `<style>` block the document ships, and pins that it ships exactly one" |
| M4 | `carriesInlineStyle` reduced to the literal `style=` branch | 1 red: "ships no inline style attribute on the element the stylesheet scan cannot read" |
| M5 | sixth exported wrapper `buildScriptEntryStatementDup` added to the support module | 1 red: "names every exported function of the support module, so an unread wrapper is red" |
| M6 | `normalizeLineEndings` dropped from `buildScriptSource()` | 1 red: "scans the support module and the build script in one line-ending shape" (plus one pre-existing extraction case, which shows the normalization is not purely cosmetic) |
| M7 | a name the script does not declare added to `BUILD_SCRIPT_LIFTABLE_NAMES` | 1 red: "lifts every name on the could-lift list by name, and refuses a name the script lacks" (plus the one-live-declaration case) |

After the restores: `src/`, `scripts/`, `README.md` verified untouched (`git diff --quiet src/
scripts/ README.md`), the four restored files byte-identical to their backups, and
`git ls-files --eol` reports `i/lf w/crlf` for every touched file — no mixed worktree copy
(the `S10-17` lesson).

## 8. Gates, in profile order, on the committed state

| Command | Exit | Output |
|---|---|---|
| `npm run build` | 0 | `[build] dist/ is a self-contained MV3 folder (11 files)`; `find dist -type f \| wc -l` → **11** |
| `npm test` | 0 | **Test Files 46 passed (46) / Tests 1025 passed (1025)** (baseline 1019 / 46; +6 cases, +0 files) |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 169 info(s)` |
| `npm run typecheck` | 0 | no `error TS` line in the log |

`npm test` was re-run after the commit (1025 / 46, exit 0). No full test log printed here.
Staged files: none (`git diff --cached --name-only` → empty). `git diff --quiet HEAD` → clean.

## 9. Deviations, notes and open questions

1. **AC 9e choice stated**: restated the list as "could lift"; the guard was **not** lifted. The
   reason is the stub surface of `loadBuildGuard*` (no `readFileSync` injection) — widening it is a
   design decision this brief does not authorize. If the reviewer prefers the other branch of
   AC 9e, it is one small follow-up slice.
2. **AC 9a / 9b reds come from fixtures, not from shipped code.** The shipped document ships one
   unattributed `<style>` block and the shipped mascot element carries none of the three inline
   shapes — writing an attributed block or a `[style]` binding into `src/` to prove the red would
   violate the "no file under `src/`" constraint. The counters are pinned on fixture strings and,
   for 9a, additionally on the shipped document plus a fixture block (count 2).
3. **AC 9d mutation (`M6`) was run against `buildScriptSource()` only**, because that is the
   reader whose read the extraction cases consume. The symmetric removal from
   `supportModuleSource()` is covered by the same case's `moduleText`/extracted-body assertions,
   but it was not executed as a separate mutation.
4. **No shipped-code requirement appeared in AC 8-10**, so nothing had to be stopped and reported
   on that count. One inherited note is worth deflating: no spec sentence anywhere claims a check
   reads `dist/content/index.js` (grep over `docs/specs/` → zero hits), and the shipped script
   already fails on a missing bundle (`fail('dist/content.js is missing')`, line 133 of
   `scripts/build-extension.mjs`). `S10-14` in the ledger is the read-direction row, not a
   missing-file-check row, and it is closed here.
5. Rows deliberately **not** taken (out of scope per the brief): `S10-2`, `S10-8`, `S10-9`,
   `S10-10`, and `S10-17` (a worktree EOL artifact the PM closed).
6. **Residual risk in the stripped presence read**: `codeOnly` is a JavaScript stripper. In CSS,
   `//` is not a comment, so a shipped declaration containing `//` (for example a protocol-relative
   `url(//example.com)`) would be shortened in the stripped read while the verbatim absence scans
   would still see it. No shipped rule on this surface contains `//` today, and the geometry,
   palette and dialog literals pinned through the stripped read contain none. A CSS-aware stripper
   is not justified by this slice; the risk is stated instead.
7. The two accepted AC 3 inline-style assertions were **not** rewritten; the binding-shape
   assertions were added beside them, so the pin set is a strict superset of the accepted one.
