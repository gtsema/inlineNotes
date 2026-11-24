# t26-03 — focused re-review: carried fix from `t26-02` (commit `d3da408`)

Task: `t26-02` blocking finding 1, carried as the single fix of task `t26-03`.
Reviewed range: `d3da408` (`docs: AC 30 names the pixel-guard suite (t26-02 finding 1); review artifact`),
parent `4723b56`, whose parent is `b7aa8b9` (the reviewed implementation).
Spec: `docs/specs/content-overlay-ui.md` -> "Tooltip hit-testing" (the `A204` paragraph), AC 30 (L385).
Prior artifact: `docs/state/t26-02-review.md`. Brief: `docs/state/stage-26-tooltip-pixel-guard.md` -> "Tests".

Reader tools: `read, grep, find, ls, bash` (read-only git + the checker). No repository file was edited,
created or deleted by this review. The artifact path below is the briefed output path, not a repo file.

## Verdict

**accepted** — the single carried blocking finding (finding 1 of `t26-02`) is closed, and the fix introduced
nothing new. The change is docs-only: three paths, all under `docs/`, no source, test, script or config file
touched.

## Carried-fix checklist (one line per number, per `code-review-flow.md` -> Rules)

| # | Carried fix (from `t26-02` finding 1) | Verdict | Evidence |
|---|---|---|---|
| 1 | `docs/specs/content-overlay-ui.md` AC 30 (L385) must name the file that actually carries the `A204` describe (`tests/content-tooltip-pixel-guard.spec.ts`), and the brief's Tests pointer must match | **done** | AC 30 L385 now reads "Pinned by `tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe"; `docs/state/stage-26-tooltip-pixel-guard.md` L61 now reads "**Tests.** `tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe (the pinned file; `tests/content-tooltip.spec.ts` keeps the pre-`A204` hover pins, made pixel-coherent)" |

## The four requested checks

1. **AC 30's pin sentence, the file, and the pre-`A204` pins — pass.**
   AC 30 (L385) now ends: "Pinned by `tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe."
   `tests/content-tooltip-pixel-guard.spec.ts` exists (13 325 bytes) and its single describe at L210 is
   `describe('the tooltip confirms the pointer is on the painted pixels (A204, AC 30)')`, carrying 8 `it(`
   cases (L211, L228, L236, L247, L261, L272, L295, L308). `tests/content-tooltip.spec.ts` (46 369 bytes)
   still carries 43 `it(` cases in 10 describes, none of them an `A204` describe; its six `A204` mentions
   (L105, L106, L210, L211, L330, L935, L953) are all comment text — L105-L106 and L210-L211 are the
   fixture-geometry docs, L330 and L935/L953 are the `A67` placement notes. The pre-`A204` hover pins it
   "keeps" are present and unchanged: the `A194` grace describe and the caret hit-test describe
   (L1092 "the caret hit-test itself (AC3, AC5)", L1093 "takes a caret strictly inside a fragment, and
   tolerates its last boundary", L1106 "prefers the entry the caret is inside over one that only owns the
   boundary"), plus the `A67` placement describe at L930. The claim in the new parenthetical is true of the
   shipped tree.

2. **The stage-26 brief's Tests pointer — pass.** `docs/state/stage-26-tooltip-pixel-guard.md` L61 now names
   `tests/content-tooltip-pixel-guard.spec.ts` as the pinned file and states what stays in
   `tests/content-tooltip.spec.ts`. The diff is exactly one line changed there (the whole `d3da408` stat:
   `docs/specs/content-overlay-ui.md | 2 +-`, `docs/state/stage-26-tooltip-pixel-guard.md | 2 +-`,
   `docs/state/t26-02-review.md | 162 +++++`). The pointer no longer contradicts AC 30, so the AC-vs-brief
   mismatch that grounded finding 1 is gone.

3. **No source file changed in `d3da408`, so the `t26-02` verification of `b7aa8b9` stands — pass.**
   `git show --name-only d3da408` lists exactly three paths: `docs/specs/content-overlay-ui.md`,
   `docs/state/stage-26-tooltip-pixel-guard.md`, `docs/state/t26-02-review.md`. Nothing under `src/`,
   `tests/`, `scripts/`, `package.json` or `.pi/`. `git diff --stat b7aa8b9 HEAD -- src tests scripts
   package.json` is empty, and `git diff --stat b7aa8b9 d3da408 -- src tests scripts package.json .pi` is
   empty. Every verification in `t26-02` checks 1–5 (the guard, `MeasuredRange`'s optional
   `getClientRects`, the unchanged caret rule, the pixel-coherent fixtures and 43 pre-existing cases, the
   throw enumeration and the catch-table row) therefore remains valid byte-for-byte. The spec diff in
   `d3da408` is the two-line pointer correction only — no rule paragraph, term, Flow item or AC clause text
   changed, so no spec rule was relaxed to fit the code.

4. **`node scripts/check-agent-config.mjs` re-run — pass.** Quoted from this session:
   ```
   inlineNotes agent config check — C:\Users\user\Desktop\test\inlineNotes
   roles: code-reviewer, extension-engineer, project-manager
   skills: chrome-mv3-extension-ts, code-review-checklist, delivery-plann…
   …
   0 error(s), 0 warning(s), 258 info(s)
   EXIT=0
   ```
   The `INFO` lines are the pre-existing "planned path not created yet" notes for paths named in
   `docs/specs/sync-server.md`; the checker reports no error and no warning, exit 0. This satisfies
   `code-review-flow.md` -> Rules ("a task with a failing … `node scripts/check-agent-config.mjs` cannot be
   reviewed or accepted") and AC 7 for a docs/spec change.

## Acceptance criteria (AC 30, `docs/specs/content-overlay-ui.md` L385)

AC 30 line, quoted in part: "(A204) The `tooltip` opens only when the pointer is on the painted pixels of the
entry: … a fragment the page refuses to measure is no hover. Pinned by
`tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe."

| AC 30 clause | Verdict | Evidence |
|---|---|---|
| the `tooltip` opens only when the pointer is on the painted pixels | pass | `src/content/overlay/tooltip-controller.tsx` L148-L153 + `pixelGuardOf` L314-L341; pixel-guard L236 "opens the tooltip for a point inside a painted rect" |
| the `caret hit-test` names the candidate | pass | `tooltip-hit-test.ts` 0-byte diff in `b7aa8b9`; `tests/content-tooltip.spec.ts` L1092-L1106 |
| the hover point must fall inside a client rect of one of its `text fragment`s | pass | `rectsOf()` L296-L311; pixel-guard L272 "accepts a point in any of a wrapped fragment's rects, and no point between them" |
| measured at hover time through the placement seam | pass | `rangeFor` read inside `hoverAt`; pixel-guard L236 asserts `seam.rectReads() > 0` |
| with one pixel of tolerance | pass | `PIXEL_TOLERANCE = 1` L269; pixel-guard L247 "still opens one pixel off the right edge" and L261 "refuses a point two pixels past the right edge" |
| an entry that ends a line does not open from the empty tail / the line-height band | pass | pixel-guard L211 (empty tail) and L228 (band beside the word), both negative |
| the right half of its last letter still opens it | pass | pixel-guard L247 |
| a fragment the page refuses to measure is no hover | pass | pixel-guard L308 "opens nothing when the measurement throws, and keeps the tooltip it already had (A66)"; plus L295 bounding-box fallback |
| "Pinned by `tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe" | **pass** | AC 30 L385 names that file; the file's L210 describe is the `A204` describe, 8 cases; `tests/content-tooltip.spec.ts` keeps the pre-`A204` hover pins |

## Blocking findings

None. Carried finding 1 of `t26-02` is closed and no new blocking finding was introduced by `d3da408`.

## Non-blocking remarks

1. `docs/specs/content-overlay-ui.md` L385 and `docs/state/stage-26-tooltip-pixel-guard.md` L61 are long
   single lines (the stage-26 line runs past 200 characters). Wrapping is a style call, not a finding.
2. `docs/state/t26-02-review.md` is committed inside the fix commit and carries its own "changes requested"
   verdict. That is the correct historical record — the closing verdict is this artifact's — but a future
   reader who greps for the verdict must read both files; the state file's one-line outcome should say so.
3. The pre-existing working-tree change `D META-INSTRUCTION-compact.md` is still present and unrelated to
   this range; it was not touched by this task and is not part of the verdict.

## Evidence path numbers

| Reference | Meaning here |
|---|---|
| `d3da408` | the reviewed commit, 3 paths, +164/-2, all under `docs/` |
| `b7aa8b9` | the implementation commit whose verification stands unchanged |
| `git diff --stat b7aa8b9 HEAD -- src tests scripts package.json` | empty — no source or test file moved |
| `docs/specs/content-overlay-ui.md` L385 | AC 30, pin sentence now names `tests/content-tooltip-pixel-guard.spec.ts` |
| `docs/state/stage-26-tooltip-pixel-guard.md` L61 | "**Tests.**" pointer, same file, plus the pre-`A204`-pins parenthetical |
| `tests/content-tooltip-pixel-guard.spec.ts` | 13 325 bytes; describe L210; 8 cases L211-L308 |
| `tests/content-tooltip.spec.ts` | 46 369 bytes; 10 describes; 43 cases; `A204` only in comments |
| `git status --porcelain` | one unrelated pre-existing change (`META-INSTRUCTION-compact.md`) |

## Verdict restated

**accepted** — carried finding 1 of `t26-02` is closed: AC 30 and the stage-26 brief both name
`tests/content-tooltip-pixel-guard.spec.ts`, that file exists and carries the `A204` describe, and
`tests/content-tooltip.spec.ts` still carries the pre-`A204` hover pins. The fix is docs-only, so the
`t26-02` verification of `b7aa8b9` stands, and the checker reports `0 error(s), 0 warning(s), 258 info(s)`.
The PM records this verdict in `docs/state/stage-26-tooltip-pixel-guard.md`.