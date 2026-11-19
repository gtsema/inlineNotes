# t10-02 — engineer report (finish-only run `08843a4f-d253-4c0e-a230-8f8aa7f459c3`)

Brief: `docs/state/t10-02-extraction-honesty.md` (rows `S10-1`, `S10-3`, `S10-4`, `S10-5`, `S10-6`, `S10-7`).
Scope as briefed: pins and sentences only, **no shipped file under `src/` or `scripts/` changes**.

## What this run touched

The slice was already in the working tree, uncommitted, restored by the PM. It was **not rewritten and not restyled**.
This run made exactly one code edit — the type annotation named in the brief — then ran the gates, then made **one commit**.

```
e1f2124  t10-02: the harness extractors cannot be satisfied around their edges (S10-1, S10-3..S10-7)
 docs/specs/content-overlay-ui.md     |   4 +-
 tests/options-window-look.spec.ts    | 119 ++++++++++++++++++-
 tests/support/build-script-guards.ts |  23 +++-
 tests/toolchain-contract.spec.ts     | 197 ++++++++++++++++++++++++++++++++-
 4 files changed, 329 insertions(+), 14 deletions(-)
```

The diffstat is identical to the pre-crash state the PM quoted (`4 files, +329/−14`): the type fix lands on a line the
slice already added, so it does not move the counts. `git show --stat HEAD` names no file under `src/` or `scripts/`.

## The one red gate this run fixed

Before the fix:

```
npm run typecheck -> exit 1
tests/toolchain-contract.spec.ts(589,5): error TS2322: Type 'RegExpMatchArray | []' is not assignable to type 'RegExpMatchArray'.
  Property '0' is missing in type '[]' but required in type 'RegExpMatchArray'.
```

Cause: the helper at `tests/toolchain-contract.spec.ts:588` promised a `RegExpMatchArray` while its value is
`code.match(/…/gm) ?? []`, and the `?? []` branch is a plain empty array with no index `0`.

Fix — the smallest honest change, the **declared return type**:

```ts
/** How many **live** declarations of one name a stripped script text carries. */
function liveDeclarationsOf(code: string, name: string): string[] {   // was: RegExpMatchArray
  return (
    code.match(new RegExp(`^[ \t]*(?:async[ \t]+)?function[ \t]+${name}[ \t]*\(`, 'gm')) ?? []
  );
}
```

`string[]` is the honest type for a global `String.prototype.match`: both branches satisfy it, and the only consumer is
`expect(liveDeclarationsOf(code, name), …).toHaveLength(1)` at `:599`, which needs a length and nothing match-shaped.
The value was not rewritten (no `… ?? []` → `[...]` reshaping), **no assertion was touched and no case name was
changed**. `npm test` was green over this error because Vitest transpiles without type checking — which is why
`npm run typecheck` is a gate and not a courtesy.

## Per AC — what the code now pins

### AC 1 — `S10-1`, no tautology by construction

Deleted, exactly the two comparisons the AC names (`git show HEAD -- tests/toolchain-contract.spec.ts`):

```ts
expect(buildScriptEntryStatement()).toBe(buildScriptEntryStatementFrom(shippedScript));
expect(buildScriptMainBody()).toBe(buildScriptMainBodyFrom(shippedScript));
```

Each compared a shipped-source wrapper with the very call the wrapper **is defined as**, on the same argument, so no
edit to the shipped script or to the support module could turn either red. The behavioral case
`drives the shipped pins through the same extraction the decoy cases drive` **stays**, with its executed comparisons
(`loadBuildFail()` vs `loadBuildFailFromScript(shippedScript)`, `loadBuildGuard` vs `loadBuildGuardFromScript`, both
required to throw the same message) intact — those can fail.

Delegation is now pinned **where it is written**, by a new case at `tests/toolchain-contract.spec.ts:729`,
`keeps every shipped-source entry point one delegate call to the script-text extractor`:

- `tests/support/build-script-guards.ts` is read as text through the same two rules the module applies to the build
  script — `codeOnly(...)` and a line-anchored, top-level `export function` extraction (`moduleFunctionBody`, `:718`).
- `SHIPPED_ENTRY_DELEGATES` (`:689`) lists all five shipped-source wrappers with their allowed whole body:
  `buildScriptMainBody`, `buildScriptEntryStatement`, `loadBuildFail`, `loadBuildGuard`, `runBuildScriptEntry`.
- For each: `expect(actual).toBe(body)` (one statement, whitespace-collapsed, so re-indenting is not a red but a second
  statement, a second source or a private copy of the pattern is), plus
  `expect(actual).toContain(`${delegate}(`)`, plus the absence pin
  `.not.toMatch(/readFileSync|require|codeOnly|new RegExp|new Function|\.exec\(|\.indexOf\(|\.search\(/)` — the wrapper
  reads, strips, anchors or evaluates nothing of its own.

**The mutation of `tests/support/build-script-guards.ts` that now makes a case red** (the acceptance sentence this AC
asks the report to name): give a shipped-source wrapper its own copy of the extraction instead of delegating — in
`buildScriptEntryStatement()`, replace the body with
`return /^[ \t]*main\(\)\.catch\([\s\S]*?\n\}\);/m.exec(buildScriptSource())![0];`. The returned text is the same text,
so every other pin in both suites stays green; only this case goes red (body no longer `toBe` the delegate call, and it
now contains `.exec(` and `new RegExp`-shaped pattern work). This is M1 below — run by the PM, red as predicted.

### AC 2 — `S10-3`, every `<style>` block is read

`tests/options-window-look.spec.ts:228` `styleBlocks(html)` = `[...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)]`,
each block run through `codeOnly`, in shipped order; `documentStyles` (`:235`) is now `blocks.join('\n')` and throws
only when the document ships **no** block. The first-block-only reader is gone.

New case `:764` `reads every <style> block the document ships, and pins that it ships exactly one` does both halves the
AC allows: `expect(styleBlocks(readSource('src/options/index.html'))).toHaveLength(1)` (the exactly-one pin, so the
widened scan cannot be narrowed back down), and a built two-block fixture with HTML comment prose between the blocks,
where `boxSizingSelectorsReachingMascot(styleBlocks(twoBlocks).join('\n'))` must answer `['img']` — proof the second
block is really read, not merely counted.

### AC 3 — `S10-4`, inline style cannot move the frame

New helper `mascotElement(template)` (`:252`) hands back the whole `<img … class="…mascot…">` tag whatever the
attribute order, and throws if the shipped template places no `img.mascot` — so the pin cannot go vacuous by renaming
the class. New case `:788` `ships no inline style attribute on the element the stylesheet scan cannot read`:
`expect(mascotElement(template)).not.toMatch(/[\s]style\s*=/i)` over the shipped
`src/options/options.component.ts` template, plus the counterfactual
`<img style="box-sizing: border-box" class="mascot" … />` which the same reader must flag — non-vacuity and
attribute-order independence pinned in the same case. An inline `style` outranks every stylesheet rule, which is why
the shape is pinned absent rather than scanned.

### AC 4 — `S10-5`, one live declaration each

`tests/toolchain-contract.spec.ts:595` `declares one live fail, one live main and one live copy of every extracted
guard`, over `codeOnly(buildScriptSource())`:

- `BUILD_SCRIPT_EXTRACTED_NAMES` (`:572`) = `fail`, `main`, `verifyManifestReferences`,
  `verifyOptionsAssetShips`, `verifyContentBundleHasNoAngular` — every name the harness lifts.
- `liveDeclarationsOf(code, name)` (`:588`, the helper whose annotation this run fixed) counts line-anchored live
  declarations; each is required `toHaveLength(1)`. Two live `function fail (…)` declarations used to leave the real
  build calling the **later** one (hoisting) while the extractor ran the **first**; now a duplicate is a failing test.
- `liveFunctionNames(code).sort()` (`:581`) is pinned against the complete top-level function set of the shipped
  script — `buildContentBundle, cleanDist, copyManifest, fail, listDistFiles, logStep, main, readDistManifest, report,
  runAngularBuild, verifyContentBundleHasNoAngular, verifyManifestReferences, verifyOptionsAssetShips` — so neither a new
  declaration the extraction could land on nor a rename escapes into an uncounted name. The pattern accepts
  indentation, so a **nested** duplicate of `fail` or `main` is counted too.

### AC 5 — `S10-6`, the last non-anchored extractor

`tests/support/build-script-guards.ts:96` — `buildScriptMainBodyFrom` now finds the header with
`code.search(/^[ \t]*(?:async[ \t]+)?function main[ \t]*\([ \t]*\)[ \t]*\{/m)` instead of
`code.indexOf('async function main() {')`, the same line-anchored shape the other three extractors use.

New case `tests/toolchain-contract.spec.ts:525` `takes the live main() body when a string literal spells the header
above it` inserts `const mainProse = 'async function main() {';` into a copy of the shipped script, pins that the old
search really lands mid-line (`code.slice(lineStart, unanchored)` is `const mainProse = '`), and requires the anchored
extraction to return the real declaration: body starts at `async function main() {`, does not contain
`const mainProse =`, and keeps `verifyOptionsAssetShips();` before `report();` — the verification order the other pins
depend on, which the old search inverted. The throw path is pinned too (`:517`-region): a `main()` that exists only in
a comment makes the extractor throw, not hand back dead text.

### AC 6 — `S10-7`, one documented stripping rule

The inconsistency is resolved by **statement**, not by silently stripping both. `componentStyles`
(`tests/options-window-look.spec.ts:128`) now carries the reason in its doc comment: everything it feeds is an
**absence** claim (no reachable rule declares `box-sizing`, no rule exceeds the dialog box, the palette owns every
literal), and for an absence claim the safe error direction is to read **more** text — a commented-out
`box-sizing: border-box` inside a reachable rule must go red so a human decides whether it is a leftover or a rule being
revived. The repository's strip-what-you-claim rule protects **presence** claims, and every presence claim about this
surface is wrapped in `codeOnly` where it is made (`documentStyles` strips because it sits next to whole-file presence
pins and its `<!-- -->` prose is dead in the document's own parse). Same file, two helpers, two directions, stated.

New case `:804` `reads a commented-out declaration of the component stylesheet instead of stripping it` makes the claim
executable: `boxSizingSelectorsReachingMascot('/* .mascot { box-sizing: border-box; } */')` must **not** answer `[]`,
and the first flagged compound contains `.mascot`.

### AC 7 — the spec sentences stay true

`docs/specs/content-overlay-ui.md` is updated in the same commit (4 changed lines, both bullets). The
**Build verification** bullet now states the line-anchored `main()` header, the exactly-one-live-declaration pin and the
one-delegate-call pin for the harness's own wrappers. The **mascot frame** bullet drops the two shapes that are now
closed ("a second `<style>` block … which the scan does not read", "an inline `style=…` on the element") and keeps the
remaining miss stated: the `#id`-shaped selector and the document-level ancestor (`body img { box-sizing: border-box }`)
stay outside the walk and stay ledged as `S10-2`. No limit that is still true was removed, so no sentence was weakened.

## Mutation checks — run by the PM on this exact slice, not repeated by this run

Each mutation was applied to one file, the two touched suites were run, and the file was restored **from a copy**, never
from git. Results as reported by the PM:

| # | Mutation | Result | Pin that answered |
|---|---|---|---|
| M1 | `tests/support/build-script-guards.ts` — `buildScriptEntryStatement()` re-implements the extraction instead of one delegate call | **1 test failed** | the delegation pin (AC 1) |
| M2 | `src/options/index.html` — a second `<style>img { box-sizing: border-box }</style>` block | **4 tests failed** | every-block scan + exactly-one-block pin (AC 2) |
| M3 | `src/options/options.component.ts` — `style="box-sizing: border-box"` on the mascot element | **2 tests failed** | the inline-style absence pin (AC 3) |
| M4 | `scripts/build-extension.mjs` — a second live `function fail (message)` declaration | **10 tests failed** | the one-live-declaration pin (AC 4) |

Every mutation is red, and M1's count (1) is the shape AC 1 wanted: the tautological pair could not answer at all, while
the delegation pin answers alone.

## Gates (profile order, re-run after the commit; no full test log printed)

| Gate | Exit | Evidence |
|---|---|---|
| `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (11 files)`; `find dist -type f \| wc -l` → **11** |
| `npm test` | **0** | **1019 tests passed / 46 test files passed** (Vitest, 8.9 s) |
| `node scripts/check-agent-config.mjs` | **0** | **0 error(s), 0 warning(s), 169 info(s)** |
| `npm run typecheck` | **0** | `tsc -p tsconfig.content.json / tsconfig.app.json / tsconfig.spec.json --noEmit`, no diagnostics |

Counts against the brief's baseline: **1013 → 1019 tests** (six new cases: three in `tests/toolchain-contract.spec.ts`
— `takes the live main() body when a string literal spells the header above it`,
`declares one live fail, one live main and one live copy of every extracted guard`,
`keeps every shipped-source entry point one delegate call to the script-text extractor`; three in
`tests/options-window-look.spec.ts` — `reads every <style> block the document ships, and pins that it ships exactly one`,
`ships no inline style attribute on the element the stylesheet scan cannot read`,
`reads a commented-out declaration of the component stylesheet instead of stripping it`), **46 → 46 files**,
`dist/` **11 → 11 files**. The only assertions removed anywhere are the two tautological comparisons AC 1 names.

## Open questions / residual risks

1. **A foreign uncommitted file is in the tree at exit.** `docs/state/t10-02-extraction-honesty.md` appeared as modified
   *during* this run (the PM's accident-and-recovery addendum plus the attempts log). It is the PM's file, so this run
   did **not** stage or commit it; `git status --porcelain` at exit is exactly ` M docs/state/t10-02-extraction-honesty.md`.
   It is uncommitted work again — worth the PM landing it, since the same accident already cost this task two runs.
2. **`S10-2` stays open by design.** `#id`-shaped selectors and document-level ancestors (`body img { … }` in
   `src/options/index.html`) are still outside the selector walk; the spec sentence says so and the row stays in the
   Stage 10 debt ledger. Nothing in this slice extends the selector model.
3. **The AC 6 choice has a deliberate cost.** Because the component stylesheet is scanned verbatim, a comment-shaped
   compound can be reported as a flagged selector (the new case shows `/* .mascot` being flagged). That is the intended
   red, and the reason is in the helper's comment; a reviewer who strips the stylesheet will make that case red.
4. **The delegation pin reads the support module as text.** Renaming a wrapper or its delegate is a red test by design
   (the `SHIPPED_ENTRY_DELEGATES` table names both halves and the exact body), so a harmless-looking refactor of that
   module has to update the table — that is the cost of pinning delegation rather than its output.
5. **M1–M4 counts are the PM's measurements**, quoted here as briefed; this run did not re-apply them, so the exact
   per-mutation failure lists are not reproduced.
