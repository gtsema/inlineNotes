# t10-01 — engineer report (copied by the PM from the run artifact; the role routed it to its run directory instead of the repo)

# t10-01 — engineer report: pin cleanup (D1, D2, D3, D4, D6)

Task: make the existing pins mean what their sentences claim. Pins and sentences only — no behavior.
Brief: `docs/state/t10-01-pin-cleanup.md`. Debt source: `docs/state/stage-9-review-debt.md` (D5 excluded, D7 already closed).

## Commit

One commit, as the brief allows for a pins-and-sentences slice:

```
196ec0c t10-01: make the build-guard and settings-window pins mean what their sentences claim
 README.md                            |  10 +-
 docs/specs/content-overlay-ui.md     |  12 +-
 tests/options-window-look.spec.ts    |  42 +++++--
 tests/support/build-script-guards.ts | 120 ++++++++++++++++---
 tests/toolchain-contract.spec.ts     | 221 +++++++++++++++++++++++++++++++++--
 5 files changed, 364 insertions(+), 41 deletions(-)
```

`git status --porcelain` after the commit: empty. `git status --porcelain src scripts`: empty — **no file under `src/` or
`scripts/` is touched by the commit**; the only edits are `tests/**`, `tests/support/**`, one spec, README.

## What each debt item became

### D1 — the failure half of the build guards is executed, not assumed

`tests/support/build-script-guards.ts`:

- `buildScriptFunctionSource(name)` (private) lifts **any** top-level function of the shipped script out **as text** by name —
  the extraction technique the module already used for the guards, now reusable. Renaming or inlining `fail` is a failing test.
- `loadBuildFail()` **executes the shipped `fail`**. `loadBuildGuard` injects it instead of the previous hand-written
  throwing stand-in, so every guard case now depends on the shipped failure half.
- `buildScriptEntryStatement()` extracts the shipped `main().catch(...)` statement;
  `runBuildScriptEntry(failingMain)` runs it with only `main`, `console` and `process` replaced, and returns
  `{ exitCode, logged }` (`BuildScriptEntryRun`). Everything the handler does — reading the error, logging it, setting
  `process.exitCode` — is shipped code.
- `buildScriptMainBody()` now returns `codeOnly(mainBody)`: an order or error-handling claim can no longer be satisfied by prose
  (the same reason the other scans strip comments; `t9-02b` R2b).

New pins in `tests/toolchain-contract.spec.ts` (describe "a failed build check becomes a non-zero exit, through the shipped
code"), plus one in `tests/options-window-look.spec.ts`:

1. the shipped `fail` throws with its shipped message;
2. the reference guard answers an absent `dist/options/index.html` with that shipped failure;
3. a thrown check failure becomes `process.exitCode === 1` **in the shipped handler**, with the shipped log line;
4. a real reference check is carried all the way to exit code 1 (guard → shipped `fail` → shipped handler);
5. a build whose checks pass leaves `process.exitCode` **untouched**, and `main()` owns no error handling of its own
   (`try` / `catch` / `finally` / `allSettled` absent from the comment-stripped body), and the handler is attached to the
   shipped `main`;
6. options suite: the missing copied mascot asset ends as exit code 1 through the shipped handler.

### D2 — the word «pinned» removed from what was not pinned, and one absence asserted

- **Assertion added** (`tests/options-window-look.spec.ts`, "frames the mascot with CSS at 80 CSS px…"):
  `expect(mascot).not.toMatch(/\bbox-sizing\b/)` — the shipped `.mascot` rule declares no `box-sizing` of its own, which is
  exactly the absence ruling `A127`'s "84 px footprint" rests on. The absence is asserted; nothing was added to `src/`.
- **Sentence narrowed** (palette bullet, `docs/specs/content-overlay-ui.md`): "walks every shipped rule that declares a
  `color:`" → "walks every shipped rule **whose selector the scan can name** — a class or a pseudo-class, which is the only
  selector shape this stylesheet uses", and the bullet now states the edge: a `color:` on a **bare element selector** sits
  outside the walk, and widening the walk is the work a later task owes the day such a rule ships.
  Per AC 2 ("Do not do both"), **no** assertion was added for the palette half.
- The mascot bullet's "That is the **pinned** reading of `A124`" now points at the assertion that backs it.

### D3 — one comment-stripping helper for the two contract suites

- `codeOnly` is exported from `tests/support/build-script-guards.ts` (block comments, HTML comments, line comments);
  the local copies in `tests/toolchain-contract.spec.ts` and `tests/options-window-look.spec.ts` are deleted and both files
  import the shared one. The behavior of both copies is preserved: the shared helper is a superset of the toolchain copy
  (it also strips `<!-- -->`), and identical to the options copy.
- New pins: the three comment forms are stripped while the code between them survives; the two contract suites import the
  shared helper and declare no copy; and the **remaining** private copies are named as a fixed list so a ninth copy fails.

### D4 — the negative scans: widened (chosen branch), and the limit is pinned too

**Choice: widen the scans, not narrow the sentence.** Reason: the sentence said "scans the shipped source"; the honest fix
for a coverage gap in a *negative* scan is to make the scan see more, and the widening costs nothing today (zero hits).

- `sourceFiles('src')` now reads `ts, tsx, mts, cts, js, jsx, mjs, cjs, html, json, css, scss, svg, txt, md, xml, yml, yaml,
  webmanifest` (was `ts, tsx, html, json`).
- Structural negative "reaches the window or the options page through no computed member, bracket name or alias", four shapes,
  one assertion each, per file: computed access on `window|globalThis|self|top|parent|frames|defaultView`; a bracket access
  naming `close|resizeTo|resizeBy|moveTo|moveBy|open|openOptionsPage`; any call through a computed member `] (`; an alias of
  those methods taken without calling it.
- The scan's own blind spot is pinned: every file under `src/` outside the text set must sit on a named list — today exactly
  `src/options/assets/cat-mascot.png`.
- Spec sentences rewritten to state the widened set, the four shapes and the named-list rule (Settings window bullet,
  Entry points bullet).

### D6 — README quick start says the order

One sentence after the quick-start block: build first, then test, with the reason (`A62` gate order; the tests read the
already-built `dist/`). The forbidden README wording was not touched and the substring «единственный» was not written into
`README.md` anywhere.

Count lines synced to measured reality: `991` → `1002` in the quick start and in the status section; the status section's
agent-config info count `162` → `166` (measured), because AC 6 is about count drift.

Also updated (same commit, same behavior-neutral slice): acceptance item 28 of `docs/specs/content-overlay-ui.md` names the
two new pins (the `.mascot` `box-sizing` absence, the executed exit chain) and the stated edge of the contrast walk.

## Substitution checks (each mutation applied, measured, reverted; `src/` and `scripts/` verified clean before the commit)

| Mutation | Result |
|---|---|
| shipped `fail` logs and returns instead of throwing | **8 tests fail** (the 4 new D1 cases + the shipped failure message + the two pre-existing t9-02b guard cases + the mascot guard case) |
| shipped `main().catch(...)` handler swallows the rejection | **5 tests fail** (2 new D1 cases + the three pre-existing exit-code substring pins) |
| `main()` wraps its body in `try { … } catch {}` | **1 test fails**, and it is the new "lets `main()` swallow nothing" pin |
| `.mascot` gains `box-sizing: border-box` | **1 test fails**: "frames the mascot with CSS at 80 CSS px, never by editing the PNG" |
| shared `codeOnly` loses the `<!-- -->` clause | **1 test fails**: "strips block, line and HTML comments, and keeps the code between them" |
| probe `src/popup/t10-probe.ts` with `target['close']()` | **1 test fails**: "a bracket access that names the method as a string" |
| probe with `fns['go']()` (computed member call) | **1 test fails**: "a call through a computed member" |
| probe with `const stored = window.close;` (alias) | **1 test fails**: "an alias of the method, taken without calling it" |
| probe: `window.close()` inside a new `src/popup/*.mjs` | **1 test fails**: "ships no code that resizes or closes the settings window" — the widening is what makes it visible |
| `p { color: #1b2a33; }` added to the shipped options stylesheet | **0 tests fail** — the pair walk really is class-shaped-selector only, which is why D2's second half was closed by narrowing the sentence, per AC 2 |

After every mutation the file was restored; the commit's file list proves `src/` and `scripts/` are byte-unchanged.

## Gates (profile order, run after the final edit)

| Command | Exit | Quoted output |
|---|---|---|
| `npm run build` | 0 | `[build] dist/ is a self-contained MV3 folder (11 files)` |
| `npm test` | 0 | `Test Files 46 passed (46)` / `Tests 1002 passed (1002)` |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 166 info(s)` |
| `npm run typecheck` | 0 | no diagnostics |

Test count grew only: **991 → 1002** (+11), files unchanged at 46. Breakdown: `tests/toolchain-contract.spec.ts` 41 → 51
(+10), `tests/options-window-look.spec.ts` 26 → 27 (+1). No existing pin was weakened or deleted; the only removals are the
two duplicate helper functions (AC 3 requires their deletion) and no assertion was loosened.

## Deviations from the brief's numbers (measured, not assumed)

1. **D3 counted three copies; the repository holds nine.** Besides the support module and the two contract suites, eight
   suites keep a private `codeOnly`: `content-anchor-boundaries`, `content-create-card-boundaries`, `content-overlay-host`,
   `content-spa-refresh`, `core-storage-keys`, `core-storage-port`, `entry-rules`, `page-key`. AC 3 names the two contract
   suites, so those eight were left in place and are now **named in a test** so the set cannot grow. Seven of them are
   byte-identical to the shared helper minus the `<!-- -->` clause; the eighth
   (`content-create-card-boundaries.spec.ts:73`) has a different signature — it takes a **path**, reads the file and removes
   comments with `''` instead of `' '` — so consolidating it can change what its scans match. That is behavior work for a
   later task, not a pins-and-sentences slice.
2. **D6 counted two tests reading `dist/`; three do.** `tests/content-anchor-boundaries.spec.ts` ("is absent from every built
   bundle…", `existsSync(distDir)` + a walk of the built bundles), `tests/options-window-look.spec.ts` ("answers an absent
   copied file with the failure and a shipped one with nothing", real `existsSync`),
   `tests/toolchain-contract.spec.ts` ("accepts the manifest the shipped build really produced", reads
   `dist/manifest.json`). The README sentence says "три теста" and names the three, so the reason it gives is true.
3. **README carried a stale info count (162 vs measured 166)** in the status section; synced, because AC 6 is the count-drift
   item and leaving one stale number next to a fixed one would repeat the failure it targets.

## Residual risks and open questions

- Eight legacy `codeOnly` copies remain, fenced by name. Consolidating them is a one-line-per-file mechanical task except for
  `content-create-card-boundaries.spec.ts`; it needs its own brief because it changes what that suite's scans see.
- The structural negative is deliberately a wide text net (`] (`, aliases, computed access on `top` / `parent` / `frames`).
  A future legitimate use of those shapes in shipped code — e.g. a page-frame helper using `frames[...]` — trips it and
  becomes a review-time decision with a named reason. That is the intent of the pin, but it is a real constraint on future
  `src/` code and worth a ruling if a task ever needs those shapes.
- The bare-element-selector contrast gap is stated in the spec and measured, not closed. If a later task ships
  `p { color: … }` on the options page, the pair check will not see it until the walk is widened.
- `buildScriptEntryStatement()` is shape-anchored (`main().catch(` at line start, closed by `\n});`). If the entry is ever
  rewritten (e.g. `void main().catch(…)` or a top-level `try`), the support module **throws** — the D1 cases go red loudly
  rather than passing vacuously.
- No browser verification was run: this slice changes no shipped code, so the Run 6 items and `dist/` behavior are unchanged
  (11 files, same manifest, same styles).
