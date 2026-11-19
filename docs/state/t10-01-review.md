# Review of t10-01 — copied verbatim by the PM from the reviewer run artifact

## Review complete — artifact returned below (no write tool available; the runtime persists it at the briefed path)

```markdown
# t10-01 — code review (pin cleanup: D1, D2, D3, D4, D6)

Reviewed range: single commit `196ec0c` (`git show --stat`: `README.md`,
`docs/specs/content-overlay-ui.md`, `tests/options-window-look.spec.ts`,
`tests/support/build-script-guards.ts`, `tests/toolchain-contract.spec.ts`).
Brief: `docs/state/t10-01-pin-cleanup.md` (AC 1–7). Debt source: `docs/state/stage-9-review-debt.md`
(D1–D4, D6; D5 excluded, D7 closed). Report: `docs/state/t10-01-engineer.md`.

## Verdict

**blocked** — reason: a spec-vs-code conflict inside the sentence this commit edited
(`docs/specs/code-review-flow.md` → Rules: "Spec vs code conflict is never resolved silently:
the reviewer reports it as `blocked` and the PM decides"). The engineer is not at fault for it:
the AC asked for the assertion and the assertion is there; the spec claim it is said to back is
contradicted by shipped CSS. Blocking finding 2 (D1 extraction) is a separate, one-line, in-lane
fix. No shipped file changed, no behavior changed, all gates green.

## AC check (one line per criterion)

1. **D1 — the failure half stops being assumed**: `pass` for the two mutations the gate ran
   (shipped `fail` executed at `tests/support/build-script-guards.ts:98`, injected at `:131`;
   shipped handler executed at `:163`), **but `fail` as worded** — the requirement "the pin must
   fail if someone makes `fail` log-and-continue" has a reachable counterexample
   (blocking finding 2).
2. **D2 — «pinned» removed or pinned**: `pass` as worded (one absence assertion added at
   `tests/options-window-look.spec.ts:531`, sentence narrowed at
   `docs/specs/content-overlay-ui.md:95`, not both) — **but the reading it claims to pin
   conflicts with shipped CSS** (blocking finding 1).
3. **D3 — one comment-stripping helper for the two contract suites**: `pass` — `codeOnly`
   exported at `tests/support/build-script-guards.ts:55`, imported at
   `tests/toolchain-contract.spec.ts:10` and `tests/options-window-look.spec.ts:13`, both local
   copies deleted (they are among the only removed lines in the diff), behavior of both copies
   preserved (block + HTML + line — identical to the options copy, a superset of the toolchain
   copy). Residual 8 private copies are outside AC 3's named scope, disclosed, and fenced by
   `tests/toolchain-contract.spec.ts:369-404`.
4. **D4 — real coverage of the negative scans stated or widened**: `pass` — the widening branch
   was chosen and named in the report; `SHIPPED_TEXT_EXTENSIONS`
   (`tests/toolchain-contract.spec.ts:56`) replaces `/\.(ts|tsx|html|json)$/`, four structural
   shapes at `:433-438`, the blind-spot list at `:336-346`, and the spec sentences
   (`docs/specs/content-overlay-ui.md:88-90`) say what is scanned. Two residual over-claims are
   remarks 1 and 2.
5. **D6 — README says the order**: `pass` — `README.md:61-63` states `build → test` with the
   reason (`A62`, three tests read the built `dist/`); forbidden wording stayed out and its pins
   still hold (`tests/content-card-events.spec.ts:595-603`: «единственный» 0 matches, «Дверь в
   карточку — **набор текста**» and `A112` present).
6. **Nothing moved that should not move**: `pass` — diff scope 5 files, no `src/`, no
   `scripts/`, no `package.json`; `dist/` is 11 files (`find dist -type f | wc -l` → `11`); no
   `it(`, `describe(` or `expect(` line was removed anywhere in the diff; per-file counts only
   grew (`tests/toolchain-contract.spec.ts` 51, `tests/options-window-look.spec.ts` 27, matching
   the report's 41→51 / 26→27); disabled-button rule untouched (no `src/` file in the range).
7. **Gates quoted**: `pass` — `docs/state/t10-01-engineer.md` quotes all four with exit 0;
   three were re-run by this review (quoted in Evidence); `npm run build` was not re-run
   (reviewer is read-only) and its quoted `11 files` matches the working tree.

## Carried fixes (one line per number)

- **D1** — done, with a hole: `tests/support/build-script-guards.ts:83-104, 145-190`;
  `tests/toolchain-contract.spec.ts:254-331`; `tests/options-window-look.spec.ts:479-495`
  (see blocking finding 2).
- **D2** — done as AC 2 chose: absence asserted at `tests/options-window-look.spec.ts:531`,
  sentence narrowed at `docs/specs/content-overlay-ui.md:95` (see blocking finding 1).
- **D3** — done: `tests/support/build-script-guards.ts:55`, imports at
  `tests/toolchain-contract.spec.ts:10` / `tests/options-window-look.spec.ts:13`, pinned at
  `tests/toolchain-contract.spec.ts:348-404`.
- **D4** — done, widening branch: `tests/toolchain-contract.spec.ts:56-58, 336-346, 433-447`;
  `docs/specs/content-overlay-ui.md:88-90`.
- **D6** — done: `README.md:61-63`.
- **D5 / D7** — correctly out of scope (`A128` never issued; D7 closed): no shipped style rule
  is in the range.

## Blocking findings

1. **`docs/specs/content-overlay-ui.md:92` and `:292` claim a footprint the shipped stylesheet
   contradicts, and the new pin cannot see it.** The bullet (edited by this commit) says the
   80 px is the image box "because `box-sizing` is not inherited by `img`, so the painted
   footprint is 84 px", and adds: "the shipped `.mascot` rule declares **no** `box-sizing` of
   its own, so giving it `box-sizing: border-box` … is a failing test. That is the pinned
   reading of `A124`". Shipped CSS declares `box-sizing: border-box` on **ancestors** of
   `<img class="mascot">` — `src/options/options.component.ts:96` (`:host`) and
   `src/options/options.component.ts:103` (`.options`, the img's parent at
   `src/options/options.component.ts:58`) — and `box-sizing` is an **inherited** CSS property,
   so the mascot's computed value is already `border-box`. Those two ancestor declarations are
   themselves pinned at `tests/options-window-look.spec.ts:681-682`. The new assertion
   (`expect(mascot).not.toMatch(/\bbox-sizing\b/)`, `tests/options-window-look.spec.ts:531`) is
   scoped to `ruleBody(styles, '.mascot')` (`:129-137`), i.e. to one rule body, so it cannot
   observe the value that actually applies. Consequence: the pin does not pin the 84 px reading
   it is said to pin, and the sentence's counterfactual ("adding it would move the frame inside
   the 80 px") describes the shipped state, not a hypothetical. This review does not choose
   which side is right (fix the CSS, or restate A127's number) — the PM rules.
2. **The D1 extraction reads unstripped source and takes the leftmost match, so a comment copy
   of `fail` or of the entry handler is what the pins execute.**
   `tests/support/build-script-guards.ts:84`
   (`` new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`) ``) and `:146`
   (`/\nmain\(\)\.catch\([\s\S]*?\n\}\);/`) both run against `buildScriptSource()`, which keeps
   comments (`:41-44`) — unlike `buildScriptMainBody()` at `:79`, which this same commit made
   comment-free. Verified read-only: with a decoy `/* … function fail(message) { throw … } */`
   above a live `function fail(message) { console.error(message); }`, the regex returns the
   comment copy, `loadBuildFail()` throws, and a guard built by `loadBuildGuard` throws too — so
   all six D1 pins and the options-suite chain stay green while the real build logs and exits 0.
   The same holds for the entry statement: a block-commented copy of the shipped
   `main().catch(...)` block is the leftmost match, so `runBuildScriptEntry` executes dead text
   while a live `main().catch(() => {});` swallows the failure. **The single easiest edit**:
   comment out the shipped `main().catch(...)` block (or `fail`) and ship a live replacement the
   regex cannot anchor (`main().catch(() => {});` on a fresh line is itself unmatched once a
   commented throwing copy precedes it). Every other shape fails loudly: rename or arrow-const
   `fail` → `buildScriptFunctionSource` throws (`:86-88`); `) {` reformatted → throws;
   `void main().catch(...)` or a named handler → `buildScriptEntryStatement` throws (`:147-149`);
   a truncated slice or a guard that reaches an uninjected binding → `SyntaxError` /
   `ReferenceError` inside `new Function`, which the pins then fail. In-lane fix: extract from
   `codeOnly(buildScriptSource())` and anchor the function regex to a line start.

## The seven answers

1. **D1 extraction honesty** — see blocking finding 2 for the one silent mode and the named edit;
   every other mutation class (rename, arrow conversion, reformat, entry-statement rewrite,
   truncation, uninjected binding) throws loudly. The extraction is not anchored to a line
   start and is not comment-stripped; that is the only way it slices the wrong text and the
   suite still passes.
2. **Is the shipped `fail` the thing under test?** Yes. `loadBuildGuard` injects
   `loadBuildFail()` (`tests/support/build-script-guards.ts:131`), and `GuardStubs`
   (`:29-37`) has no `fail` field, so no caller can inject a stand-in: all seven call sites
   (`tests/toolchain-contract.spec.ts:202, 212, 221, 281, 299`;
   `tests/options-window-look.spec.ts:451, 457, 486`) go through the shipped one. No test keeps
   an injected throwing `fail` — the only such stand-in was the three-line closure deleted from
   `tests/support/build-script-guards.ts`. Caveat: `runBuildScriptEntry` stubs `main`
   (`:163-176`), so the shipped `main()` body is never executed; that link is still held by the
   textual order pins at `tests/toolchain-contract.spec.ts:234-247` plus the new
   `try`/`catch`/`finally`/`allSettled` absence at `:323-327`.
3. **D2** — the assertion is a scoped absence:
   `expect(mascot).not.toMatch(/\bbox-sizing\b/)` (`tests/options-window-look.spec.ts:531`) over
   `ruleBody(styles, '.mascot')`, so an honest refactor of any other rule cannot break it — but
   it also cannot see the operative, inherited value (blocking finding 1). The palette sentence
   now matches the code. Before: "the test walks every shipped rule that declares a `color:`,
   … and fails when the resulting pair set is not exactly the pair list the test keeps beside it
   — the list this bullet names, and no other — so a pair nobody thought to write down cannot
   escape the check". After: "the test walks every shipped rule **whose selector the scan can
   name** — a class or a pseudo-class, which is the only selector shape this stylesheet uses —
   … The edge of that walk is stated rather than glossed …: a text color declared on a **bare
   element selector** (`p { color: … }`, `img { color: … }`) sits outside the walk, and widening
   the walk is the work a later task owes the day such a rule ships; a class-shaped text role
   that is not in the role table makes the test throw". That is exactly what
   `declaredTextColors` does (`tests/options-window-look.spec.ts:172-181` requires a `.`- or
   `:`-prefixed selector) and what `textRoleOwning` throws for (`:196-205`).
4. **D3** — single for the two suites named by AC 3: exported at
   `tests/support/build-script-guards.ts:55`, imported by both, both copies deleted, three comment
   forms pinned (`tests/toolchain-contract.spec.ts:348-361`); the HTML-comment clause is present,
   so the stronger copy's behavior is preserved (and it strengthens the toolchain scans: the only
   HTML comment in `src/` is prose, `src/options/index.html:6-11`). Local variants that remain:
   eight, at `tests/content-anchor-boundaries.spec.ts:49`,
   `tests/content-create-card-boundaries.spec.ts:73`, `tests/content-overlay-host.spec.ts:26`,
   `tests/content-spa-refresh.spec.ts:127`, `tests/core-storage-keys.spec.ts:38`,
   `tests/core-storage-port.spec.ts:28`, `tests/entry-rules.spec.ts:98`,
   `tests/page-key.spec.ts:55` — the new pin at `tests/toolchain-contract.spec.ts:394-404` names
   exactly those eight plus the support module, and the list matches the tree. The engineer's
   reason for not folding `content-create-card-boundaries.spec.ts:73` is correct: it takes a
   path, reads the file and replaces with `''`, not `' '`.
5. **D4** — the chosen branch is widening, and the widened scan really covers what the spec now
   claims for **that** bullet: 19 text types
   (`tests/toolchain-contract.spec.ts:56-57`) over every file under `src/` recursively, four
   structural shapes (`:433-438`), and a named list for everything outside the set
   (`:336-346`, today exactly `src/options/assets/cat-mascot.png`). Two sentences still imply
   more than the code provides: `docs/specs/content-overlay-ui.md:88` lists seven method names
   for the bracket shape and then says "an alias of one of those methods", while the alias shape
   covers five (`tests/toolchain-contract.spec.ts:437`, no `open`, no `openOptionsPage`) —
   remark 1; and the same coverage gap the item closes still stands in the other shipped-source
   suites — remark 2.
6. **Lane and counts** — verified by diff scope: `git show --stat 196ec0c` lists five files, no
   `src/`, no `scripts/`; the complete set of removed lines in `tests/` is two import lines, the
   two `codeOnly` helper declarations, one extension-regex line and the support-module internals
   that were replaced — no `it(`, `describe(` or `expect(` line is removed, so no pin or
   assertion was deleted or weakened; the only removals AC 3 required. README gained the
   build→test paragraph plus three count syncs (`991`→`1002` twice, `162`→`166`), and the count
   claims are measured true (1002 / 46 / 166). Forbidden wording absent (grep for «единственный»
   → 0), required phrases present. `dist/` = 11 files.
7. **Weakest new pin** — `tests/toolchain-contract.spec.ts:330`:
   `expect(buildScriptEntryStatement()).toMatch(/^\s*main\(\)\.catch\(/)` is **tautological**:
   `buildScriptEntryStatement()` (`tests/support/build-script-guards.ts:145-150`) returns text
   that begins `\nmain().catch(` or throws, so the assertion cannot fail when the call returns.
   It documents intent at the cost of a false sense of a pin. No other new assertion is
   satisfiable by a comment: `buildScriptMainBody()` is comment-stripped (`:79`), which is what
   makes the `try`/`catch`/`allSettled` absence at `:323-327` real, and the `codeOnly` behavior
   pin runs the helper on a fixture. The one vacuity risk left is
   `tests/toolchain-contract.spec.ts:440-447`, which loops over `sourceFiles('src')` with no
   non-emptiness guard of its own — the sibling pin at `:338-346` covers it indirectly.

## Non-blocking remarks

1. `docs/specs/content-overlay-ui.md:88` — "an alias of one of those methods" over-claims two
   names; the alias regex at `tests/toolchain-contract.spec.ts:437` covers
   `close|resizeTo|resizeBy|moveTo|moveBy` only.
2. The widening stopped at one suite. `tests/content-anchor-boundaries.spec.ts:37`,
   `tests/content-create-card-boundaries.spec.ts:69`, `tests/content-throw-boundaries.spec.ts:48`,
   `tests/core-storage-keys.spec.ts:56`, `tests/core-storage-port.spec.ts:157,171` still scan
   `.ts`/`.tsx`-shaped sets, while `docs/specs/content-overlay-ui.md:291` (item 27) states "no
   module of `src/content/` sets one or intercepts `Tab` in code". Debt of the same class as D4,
   outside AC 4's named scope, not recorded in the report's residual risks.
3. `SHIPPED_TEXT_EXTENSIONS` now pulls prose types (`md`, `txt`, `xml`, `yml`, `yaml`) into scans
   that strip only comments, and it feeds all 15 `sourceFiles` call sites
   (`tests/toolchain-contract.spec.ts:100 … 960`), not only the two D4 negatives. Net effect today
   is a strengthening (all 1002 green), but `] (` and the alias shape will trip legitimate future
   code (`frames[...]`, `const done = onClose;`) — the report names this; a ruling is owed the day
   a task needs those shapes.
4. `docs/state/t10-01-pin-cleanup.md` carries no `Carried-fix checklist` heading (the D-numbers
   live inside AC 1–7); the report answers each D in its own section, several without the
   `path:line` form `docs/specs/code-review-flow.md` → step 2 asks for. Process remark, PM side.
5. `docs/state/t10-01-engineer.md` is still untracked (`git status --porcelain` →
   `?? docs/state/t10-01-engineer.md`) — expected, the PM commits the report.
6. The D1 chain uses `new Function` in test code only; no shipped code changed, no network call,
   no new dependency, no host-DOM work — all four boundary checks clean.

## Evidence

- `git show --stat 196ec0c`, `git show 196ec0c -- <path>` (diff read in full; `src/` and
  `scripts/` absent from the file list).
- `git show 196ec0c -- tests/ | grep "^-"` — the complete removal set quoted in AC 6 above.
- Re-run by this review (read-only):
  - `npm test` → exit 0: `Test Files 46 passed (46)` / `Tests 1002 passed (1002)`
  - `npm run typecheck` → exit 0, no diagnostics
  - `node scripts/check-agent-config.mjs` → exit 0: `0 error(s), 0 warning(s), 166 info(s)`
  - `find dist -type f | wc -l` → `11`
  - `npm run build` not re-run (reviewer is read-only); the report quotes
    `[build] dist/ is a self-contained MV3 folder (11 files)`.
- Read-only regex reproduction of blocking finding 2 (in-memory `node`, no file touched): the
  leftmost match of `function fail\([^)]*\) \{[\s\S]*?\n\}` is the block-comment copy
  `"function fail(message) {\n  throw new Error('build-extension: ' + message);\n}"`, a guard
  built on it throws, and the same leftmost behavior holds for
  `/\nmain\(\)\.catch\([\s\S]*?\n\}\);/`.
- PM-held mutations cross-checked against the code, not repeated: mutation A (shipped `fail` →
  `console.error`) failing 8 tests is consistent with the executed chain at
  `tests/toolchain-contract.spec.ts:276-313` + `tests/options-window-look.spec.ts:479-495`;
  mutation B (`process.exitCode = 1` removed) failing 5 is consistent with the three surviving
  substring pins at `tests/toolchain-contract.spec.ts:245-247`,
  `tests/options-window-look.spec.ts:473-474` plus the two new executed ones.
```