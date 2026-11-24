# t26-02 — focused review: `t26-01` / commit `b7aa8b9` (the A204 tooltip pixel guard)

Task: `docs/state/stage-26-tooltip-pixel-guard.md` -> "t26-01 brief", `t26-02` (focused review).
Reviewed range: `b7aa8b9` (`t26-01: the tooltip confirms the pointer is on the painted pixels (A204)`),
parent `f55dc78`. Spec: `docs/specs/content-overlay-ui.md` -> "Tooltip hit-testing" (the `A204` paragraph,
L85), Flow 3 (L67), the `caret hit-test` term (L45), AC 30 (L385). Engineer report: `docs/state/t26-01-engineer.md`.

Reader tools: `read, grep, find, ls, bash` (read-only git + the checker + the gates). No repository file was
edited, created or deleted by this review. The artifact path below is the briefed output path, not a repo file.

## Verdict

**changes requested** — 1 blocking finding (AC 30’s pin sentence names a file that does not carry the
`A204` describe). Everything else in the slice is correct and verified: the guard, the `MeasuredRange`
extension, the caret rule, the fixture re-geometry, the throw enumeration and the catch-table row.

## Acceptance criteria (AC 30, `docs/specs/content-overlay-ui.md` L385)

AC 30 line, quoted: "(A204) The `tooltip` opens only when the pointer is on the painted pixels of the entry:
the `caret hit-test` names the candidate and the hover point must fall inside a client rect of one of its
`text fragment`s, measured at hover time through the placement seam with one pixel of tolerance. An entry that
ends a line does not open from the empty tail of that line or from the line-height band beside it, the right
half of its last letter still opens it, and a fragment the page refuses to measure is no hover. Pinned by
`tests/content-tooltip.spec.ts` -> the `A204` describe."

| AC 30 clause | Verdict | Evidence |
|---|---|---|
| the `tooltip` opens only when the pointer is on the painted pixels | pass | `src/content/overlay/tooltip-controller.tsx` L148-L153 + `pixelGuardOf` L314-L333; `tests/content-tooltip-pixel-guard.spec.ts` -> "opens the tooltip for a point inside a painted rect" |
| the `caret hit-test` names the candidate | pass | `tooltip-hit-test.ts` has a 0-byte diff in `b7aa8b9` (`git show b7aa8b9 -- src/content/overlay/tooltip-hit-test.ts` is empty); the same file’s first case asserts `entryAtCaret` still names the entry at the tail offset |
| the hover point must fall inside a client rect of one of its `text fragment`s | pass | `rectsOf()` L296-L311 prefers `getClientRects()`; "accepts a point in any of a wrapped fragment’s rects, and no point between them" |
| measured at hover time through the placement seam | pass | `rangeFor` is read inside `hoverAt`; no `PaintedFragment.box` read in the guard; the first case asserts `seam.rectReads() > 0` |
| with one pixel of tolerance | pass | `PIXEL_TOLERANCE = 1` L269, `coversPoint` L279-L287; "still opens one pixel off the right edge" + "refuses a point two pixels past the right edge" |
| an entry that ends a line does not open from the empty tail / the line-height band | pass | `TAIL` (L219) and `BAND_BELOW` (L240) cases, both negative |
| the right half of its last letter still opens it | pass | the `right` and `right + 1` axes of the edge case (L262) |
| a fragment the page refuses to measure is no hover | pass | `'unmeasurable'` L332-L333; "opens nothing when the measurement throws, and keeps the tooltip it already had (A66)" (L308) |
| "Pinned by `tests/content-tooltip.spec.ts` -> the `A204` describe" | **fail** | the `A204` describe is `tests/content-tooltip-pixel-guard.spec.ts` L217; `tests/content-tooltip.spec.ts` carries zero `A204` cases and zero guard assertions (its only `A204` mentions — L105-L106, L210-L211, L330, L935, L953 — are comments) |

## The six requested checks

1. **Rect confirmation through `rangeFor`, 1px, throw = `unmeasurable`, rest of `hoverAt` untouched — pass.**
   `hoverAt` is L136-L160; the inserted block is L148-L153, between `entryAtCaret` (L141) and
   `hoverAnchorOf` (L154). `rectsOf` L308-L311 calls `rangeFor(fragment.node, fragment.start, fragment.end)`
   per `PaintedFragment` and reads `getClientRects()`; the bounding-box fallback is L302-L304.
   `coversPoint` L279-L287 is inclusive on all four edges. The `try` of `pixelGuardOf` L328-L335 is scoped
   to the measurement and answers `'unmeasurable'` (L340-L341); the caller hides on anything but
   `'inside'`. The named `PIXEL_TOLERANCE` constant carries the doc that a literal would hide.
   `rangeFor` is captured once at construction (L126), the same seam the placement uses — a hover never
   sees a different mode of measurement than the placement does.

2. **`MeasuredRange.getClientRects` optional; structural seam intact; no paint-time box; caret rule
   unchanged — pass.** `src/content/capture/fragment-rect.ts` L77 declares `getClientRects?()`.
   `Box` L55-L60 is a structural supertype of `{left,top,width,height}`, so a box-only recorder still
   satisfies `MeasuredRange`; `RangeForFragment` and `documentRangeForFragment` are untouched, and
   `placementFragmentBox`/`fragmentBox` still use only `getBoundingClientRect()`. The fallback has its own
   pin ("falls back to the bounding box when the measured range offers no getClientRects",
   `content-tooltip-pixel-guard.spec.ts` L296-L306). `tooltip-hit-test.ts` has a 0-byte diff in the commit;
   its interior-before-boundary order is intact and still pinned by `tests/content-tooltip.spec.ts` ->
   "the caret hit-test itself (AC3, AC5)", including "prefers the entry the caret is inside over one that
   only owns the boundary". Nothing reads `PaintedFragment.box` in the guard (only comments mention it).
   Non-blocking drift: `content-tooltip.spec.ts` L210-L212 mentions a `boxOnly()` helper that lives only in
   the new file (L298) — stale comment, no behaviour implied.

3. **The pre-existing suite was made pixel-coherent, not weakened — pass.** 43 `it(` cases before the
   commit and 43 after, and the sorted set of `it(` lines is byte-identical; the multiset of every
   `expect(...)` callee/argument text is likewise byte-identical (`diff` empty on both extractions), so no
   assertion changed its subject. The geometry edit is exactly what the brief ordered: `BOX_A`
   (`left: 10, top: 40, width: 120, height: 18`) became `P1_LINE` (`left: 10, top: 40, width: 300,
   height: 18`) with the hover points moved from the inter-row gap `(20, 84)` onto the painted row
   (`P1_POINT = (20, 48)`). The three placement cases (L932-L983 of the spec file) keep their `A67` meaning
   by rebinding a seam whose values the pass never saw (moved text, collapsed first fragment, tight
   viewport); the seam’s values are not changed, only which controller reads them.
   `tests/content-tooltip-pixel-guard.spec.ts` (8 cases, L217-L341) covers empty tail (L219), band below
   (L240), rect inside (L248), the 1px edge and 2px past it (L262, L275), a wrapped fragment plus the gap
   between its rects (L279), the bounding-box fallback (L296) and `unmeasurable` in both directions (L308).
   Nothing was weakened; the six requested cases exist. **Caveat, folded into finding 1:** they live in a
   file AC 30 does not name.

4. **The `content-overlay-ui.md` edit is the required table sync, not unauthorised prose — pass
   (non-blocking).** The whole spec diff is two lines (L336-L337): one added row for `pixelGuardOf` and a
   four-word disambiguation of the existing `hoverAnchorOf` row (", at the placement read"). That table is
   the `A75` enumeration whose completeness `tests/content-throw-boundaries.spec.ts` mechanically enforces
   ("every shipped catch under src/content is in the enumeration", incl. "is named by file, in a row that
   states an answer and a verification"). The guard adds a `catch` to that file, so the row is mandatory for
   the gate; its text matches the code: site `pixelGuardOf`, answer `'unmeasurable'` + hide, the same-state /
   nothing-else-changes posture, the pin path. No ruling paragraph, term, Flow item or AC text was touched,
   and the new row is 1:1 in form with the thirteen rows above it. Reading: `A75` requires it; the engineer
   flagged it in the report (Open question 3). It is at most a PM-owned single-line wording call, so it is
   recorded, not blocking.

5. **No regression elsewhere — pass.** `tooltip-events.ts` and the `A194` grace are absent from the commit
   and their pins (the `A194` describe, `content-tooltip.spec.ts` L508-L593) are green. No new dependency:
   `git show --name-only b7aa8b9` lists 6 paths, none of them `package.json` or `src/manifest.json`;
   `dependencies` is still `@angular/*` + `preact`. No timer, no `fetch`/`XHR`/`WebSocket`, no new
   `chrome.*` call, no host-DOM mutation (the guard only reads ranges; "adds nothing to the page document
   and no style element to it" stays green), no Russian string, no manifest or `host_permissions` change.
   **Correction to the brief’s wording:** `tests/content-throw-boundaries.spec.ts` is not a `N`-counter
   shape that needs a `N -> N+1` edit; it derives real `catch` tokens per file (`shippedCatchSites`, regex
   `catch\s*[({]`). `src/content/overlay/tooltip-controller.tsx` has exactly two code-level catches
   (`hoverAnchorOf` L257, `pixelGuardOf` L340); the pin reads `'overlay/tooltip-controller.tsx': 2` and
   `expect(total).toBe(22)`, which is what the code contains. The 22-site total is the mechanical
   enumeration `N`; it moved 21 -> 22 and the case title says "twenty-two sites". 

6. **Gates re-run and quoted (this session; `HEAD` = `4723b56`, a docs-only commit on top of `b7aa8b9`,
   and the source files touched by `b7aa8b9` are byte-identical between the two).**
   - `npm run build` -> passed: `[build] dist/ is a self-contained MV3 folder (17 files)`, exit 0.
   - `npm test` -> passed: `Test Files  69 passed (69)`, `Tests  1427 passed (1427)`, `Duration 7.55s`;
     `tests/content-tooltip.spec.ts (43 tests)` and `tests/content-tooltip-pixel-guard.spec.ts (8 tests)` both
     green.
   - `npm run typecheck` -> passed: four `tsc --noEmit` projects, no diagnostics, exit 0.
   - `node scripts/check-agent-config.mjs` -> `0 error(s), 0 warning(s), 258 info(s)`, exit 0.

## Blocking findings

1. **`docs/specs/content-overlay-ui.md` AC 30 (L385) names the wrong pin file, and no commit in the range
   corrects it.** The sentence "Pinned by `tests/content-tooltip.spec.ts` -> the `A204` describe" is false of
   the shipped tree: the `A204` describe is `tests/content-tooltip-pixel-guard.spec.ts` L217
   (`describe('the tooltip confirms the pointer is on the painted pixels (A204, AC 30)')`), and
   `tests/content-tooltip.spec.ts` contains no `A204` case at all. The brief inherits the same pointer
   (`docs/state/stage-26-tooltip-pixel-guard.md` -> "Tests"), and the engineer reports the deviation instead
   of resolving it (`docs/state/t26-01-engineer.md` -> Open question 1), which is the correct read-only
   posture — but the deviation is real and file-verifiable. This is an AC-vs-authorised-output mismatch:
   the acceptance criterion (and the brief built on it) name a path that does not carry the deliverable, so
   the task’s own definition of done is not met as written. The PM owns the fix — add
   `tests/content-tooltip-pixel-guard.spec.ts` to the AC 30 pin sentence (and, if desired, to the new
   catch-row verification cell) or move the cases back — and re-briefs the engineer with this number.
   No code, spec rule or assertion is wrong; only the pointer is. Note this is not the
   "behavior change without a spec edit" clause: the commit does edit the spec.

## Non-blocking remarks

2. `tests/content-tooltip.spec.ts` L210-L212 — the doc comment names `boxOnly()`, which exists only in
   `tests/content-tooltip-pixel-guard.spec.ts` L298. Comment drift; fix it if either file is touched for
   finding 1.
3. `docs/specs/content-overlay-ui.md` L336 — the added phrase ", at the placement read" is a useful
   disambiguation of the existing `hoverAnchorOf` row; recorded here so the PM can see it was read as
   intended, not as a silent rule change.
4. `src/content/capture/fragment-rect.ts` L156-L163 — the `hasArea` doc now names a third caller; the claim
   matches the code (`coversPoint` L280-L282 calls `hasArea`) and the body of `hasArea` is unchanged.
5. `tests/content-tooltip-pixel-guard.spec.ts` L187-L191 — the fixture paragraph says the sentence ends
   with the word the entry covers; in a headless DOM nothing guarantees it is also the last word of the
   rendered **line**. jsdom has no layout, so this is a fixture-fiction nit, not a code defect: the line-end
   shape is asserted through the clamped caret offset, and the pixels are the fixture box by construction.
   Stated only so the next reader does not mistake it for a broken premise.

## Evidence path numbers

| Reference | Meaning here |
|---|---|
| `b7aa8b9` | the reviewed commit, 6 paths, +583/-58 |
| `git status --porcelain` | one unrelated pre-existing working-tree change (`META-INSTRUCTION-compact.md`), outside the reviewed range and not touched by this task |
| `src/content/overlay/tooltip-controller.tsx` | L126 `rangeFor` capture; L136-L160 `hoverAt`; L148-L153 the guard call; L240-L259 `hoverAnchorOf` (catch L257); L269 `PIXEL_TOLERANCE`; L279-L287 `coversPoint`; L296-L311 `rectsOf`; L314-L341 `pixelGuardOf` (catch L340) |
| `src/content/capture/fragment-rect.ts` | L59-L78 `MeasuredRange` (optional `getClientRects` L77); L156-L171 `hasArea` |
| `tests/content-tooltip-pixel-guard.spec.ts` | 342 lines; describe L217; 8 cases L219-L341 |
| `tests/content-tooltip.spec.ts` | 1133 lines, 43 cases unchanged in subject |
| `tests/content-throw-boundaries.spec.ts` | pin L139 `'overlay/tooltip-controller.tsx': 2`; total L166 `22` |

## Verdict restated

**changes requested** — blocking finding 1 only. The pixel guard itself is correct, minimal, well pinned
and consistent with the rule text of AC 30; what fails is the AC 30 pointer to where the pins live, which no
commit in the reviewed range reconciled. The PM records the verdict in
`docs/state/stage-26-tooltip-pixel-guard.md`.
