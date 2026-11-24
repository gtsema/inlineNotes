# t26-01 — the tooltip confirms the pointer is on the painted pixels (A204) — engineer report

Task: `docs/state/stage-26-tooltip-pixel-guard.md` -> "t26-01 brief".
Rule owner: `docs/specs/content-overlay-ui.md` -> "Tooltip hit-testing" (the `A204` paragraph),
AC 30, the `caret hit-test` term, Flow 3. The ruling's prose needed **one** addition and it is
an owned table row, not new prose (see "Spec edit" below). No spec/code conflict was found.

Commit: `b7aa8b9` — `t26-01: the tooltip confirms the pointer is on the painted pixels (A204)`

## Changed paths

| Path | Change |
|---|---|
| `src/content/capture/fragment-rect.ts` | `MeasuredRange` gains an **optional** `getClientRects?(): ArrayLike<{left,top,width,height}>`. It is a separate optional member because the structural seam is what makes every measurement rule verifiable without page layout (a test injects a box-only recorder); a required member would force every such recorder to invent rects. `hasArea`'s doc now names the `A204` caller too (it refuses a zero-area rect). No behaviour change on its own. |
| `src/content/overlay/tooltip-controller.tsx` | The `A204` pixel guard. After `entryAtCaret` names the candidate, `pixelGuardOf(entry, {x,y}, rangeFor)` measures **now** through the same `rangeFor` seam: `rectsOf` calls `rangeFor(fragment.node, fragment.start, fragment.end)` and reads `getClientRects()` (`Array.from` over the `ArrayLike`, because the structural type is not iterable), falling back to `getBoundingClientRect()` when the range offers no `getClientRects`. `coversPoint` skips a zero-area rect via `hasArea` and then tests containment with `PIXEL_TOLERANCE = 1`. A `rangeFor` throw answers `'unmeasurable'`. Anything other than `'inside'` calls `hide()` and changes nothing else. `hoverAnchorOf`, `placementFragmentBox`, the caret rule in `tooltip-hit-test.ts`, the `A194` grace and the event wiring are untouched; no paint-time box is read. Header doc names ruling `A204` and task `t26-01`. |
| `tests/content-tooltip-pixel-guard.spec.ts` | **new** — the `A204` describe (8 cases). |
| `tests/content-tooltip.spec.ts` | The fixture had to become **pixel-coherent**, which is the ruling's own content: the pre-`A204` fixture hovered at `(20, 84)`, in the gap between `BOX_A` (10,40,120,18) and `BOX_B` (10,80,100,18), and relied on the caret test alone. Those points are now off the painted pixels by definition, so the suite would have asserted the very defect the ruling closes. `P1_LINE` (= `BOX_A`, widened to 300) / `P1_POINT` put the point on the painted row; the seam answers a real `MeasuredRange` (box **and** `getClientRects`, with `setRects` for wrapped cases); `rebindSeam` re-wires the three placement cases (moved text, collapsed first fragment, tight viewport) so they keep measuring a box the pass never saw, which is what `A67` is about. All 43 pre-existing cases still assert the same observable answers (43/43 green). |
| `tests/content-throw-boundaries.spec.ts` | The `t3-05` `catch` enumeration is a counter, so the new guard is a new site: `overlay/tooltip-controller.tsx` 1 → 2, total 21 → 22, case title "twenty-two sites". |
| `docs/specs/content-overlay-ui.md` | **One table row** in "Page-boundary throws": `overlay/tooltip-controller.tsx` `pixelGuardOf`. The existing row names `hoverAnchorOf` and answers "the throw at the placement read"; the guard adds the same throw at the pixel read, and that table is the single place enumerating every `catch` under `src/content/` (`A75`). No ruling prose was edited. |

No new dependency, no timer, no Russian string, no manifest change, no `host_permissions` change,
no network call.

## Implementation notes

- **Order in `hoverAt`**, unchanged except for the inserted guard: `isHostBusy()` → `caretAt` →
  `entryAtCaret` → **`pixelGuardOf`** → `hoverAnchorOf` → `show`. The caret test still names the
  entry and keeps its interior-before-boundary order; the guard runs on that one candidate only, so
  it cannot re-open an entry the caret test refused.
- **Exact rects before the union.** A wrapped `text fragment` is several client rects and the
  bounding box is their union, which also covers the empty band beside the last line — the very
  defect `A204` names. So `getClientRects()` is used whenever the range offers it, and the bounding
  box only for a range that has none (the structural fixture shape). A real `Range` always has it.
- **One pixel, and zero-area rects skipped.** `coversPoint` is inclusive on all four edges with
  `PIXEL_TOLERANCE = 1`, matching the caret boundary tolerance so a letter's closing half does not
  disagree between the two halves of the hit-test. A rect that fails `hasArea` is skipped before
  the containment test, so the empty rects a wrapped fragment reports for the rest of its last line
  contribute no hover.
- **A throw is the `A66` answer.** `pixelGuardOf` catches only its own measurement, answers
  `'unmeasurable'`, and the caller hides. The entry is not repaired, hidden, deleted or repainted,
  and no storage is touched — the same posture `hoverAnchorOf` already documents.
- **Layering kept.** No business rule enters the content layer: the guard is a page measurement and
  a geometric containment test, it names no entry from its own knowledge (the caret test does
  that), and it writes nothing.
- `tooltip-hit-test.ts` is **byte-identical** to before this task.

## Gates (run in the briefed order)

| Command | Result |
|---|---|
| `npm run build` | passed — `[build] dist/ is a self-contained MV3 folder (17 files)` |
| `npm test` | passed — 69 files, 1427 tests |
| `npm run typecheck` | passed — four projects, no output (exit 0) |
| `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 258 info(s)` (exit 0) |

A first `npm test` run in this session failed one case: `content-throw-boundaries.spec.ts`
> "is exactly the pinned set of twenty-one sites" reported
`overlay/tooltip-controller.tsx: 1 → 2`. That is the `t3-05` counter doing its job, and the pin was
updated with the spec table row in the same change. Two intermediate `npm run typecheck` runs failed
on unused fixture constants the new file had left behind (`noUnusedLocals`); they are fixed and the
final run is exit 0.

## AC 30 self-check (line by line)

| AC 30 clause | Status | Evidence |
|---|---|---|
| the `tooltip` opens only when the pointer is on the painted pixels of the entry | implemented | `pixelGuardOf` in `hoverAt`; `tests/content-tooltip-pixel-guard.spec.ts` "opens nothing from the empty tail of the line, though the caret test accepts it" and "opens nothing from the line-height band beside the word"; "opens the tooltip for a point inside a painted rect" |
| the `caret hit-test` names the candidate | implemented, unchanged | `entryAtCaret` is untouched (`tooltip-hit-test.ts` byte-identical); the empty-tail case asserts on the record that `entryAtCaret` still answers the entry there, so the guard — not the caret rule — is what refuses it |
| the hover point must fall inside a client rect of one of its `text fragment`s | implemented | `rectsOf` → `getClientRects()` per `PaintedFragment`, every rect checked; "accepts a point in any of a wrapped fragment's rects, and no point between them" |
| measured at hover time through the placement seam | implemented | the guard calls the same `options.rangeFor` the placement uses and never reads `PaintedFragment.box`; the case asserts `seam.rectReads() > 0`; "measures the anchor at hover time…" still green |
| with one pixel of tolerance | implemented | `PIXEL_TOLERANCE = 1`; "still opens one pixel off the right edge" and "refuses a point two pixels past the right edge" |
| an entry that ends a line does not open from the empty tail of that line or from the line-height band beside it | implemented | the empty-tail and band cases (the fixture word is the line's last word, the shape the reader measured) |
| the right half of its last letter still opens it | implemented | the one-pixel edge case, and the existing caret boundary tolerance is unchanged |
| a fragment the page refuses to measure is no hover | implemented | "opens nothing when the measurement throws, and keeps the tooltip it already had (A66)" — both directions, and the painted entry is asserted unchanged |
| pinned by `tests/content-tooltip.spec.ts` -> the `A204` describe | implemented, **deviated** | the `A204` describe lives in `tests/content-tooltip-pixel-guard.spec.ts`. See "Open questions" |

## Open questions

1. **The AC 30 sentence names the file the pins live in, and I did not use that file for the A204
   describe.** It says "Pinned by `tests/content-tooltip.spec.ts` -> the `A204` describe". The
   `A204` cases are in the new `tests/content-tooltip-pixel-guard.spec.ts`, whose first line names
   the spec section and the ruling; `tests/content-tooltip.spec.ts` carries the **fixture
   change** (and, as a consequence, the `A204` correctness of the 43 pre-existing cases). Reason:
   the guard is one arithmetic rule and a new file states each pixel fact on its own without the
   paint-pass fixture in the way; the brief's own test list is exactly what the new file covers.
   **This is a one-word spec fix the PM owns** — either the AC 30 sentence gains
   `tests/content-tooltip-pixel-guard.spec.ts` beside the existing path, or the cases move. I did
   not edit that sentence because the brief says the PM owns the spec prose.
2. **The existing `tests/content-tooltip.spec.ts` fixture was not pixel-coherent and could not be
   left alone.** 26 of its 43 cases hovered a point in the gap between the two rows and passed only
   because the caret test was the whole answer. I changed the fixture geometry (hover points on the
   painted row, a `MeasuredRange`-shaped seam, `rebindSeam` for the placement cases) and added a
   `rebindSeam` helper; **no assertion changed its meaning**. The reviewer should read that diff as
   fixture, not as rule.
3. **One `catch` table row was added to `docs/specs/content-overlay-ui.md`.** The brief says "no
   spec prose edit"; the "Page-boundary throws" table is the place where `A75` requires every new
   `catch` under `src/content/` to be listed, and `tests/content-overlay-ui.md`-adjacent debt would
   otherwise be a review blocker. It adds a row and does not change a ruling. If the PM would
   rather own even that row, it is one line to delete.

## Note for the reviewer

- The defect's premise is asserted, not assumed: the empty-tail case reads
  `entryAtCaret(painted, { node, offset: node.data.length })` and expects the entry **before** it
  expects `hoverAt` to open nothing. A future edit that "fixes" the caret rule instead of keeping
  the guard would make that line fail first.
- `PIXEL_TOLERANCE` is a module constant with a doc comment, not arithmetic inline, because the
  number is the AC's own number and a test could pin it if the PM wants that pin.
- The `dist/` folder produced by the build is the shipped shape; no `chrome://extensions` load was
  performed for this slice (the change is not observable without a real page and a real layout
  engine, and the brief's acceptance is the AC 30 text plus the new pins). If the PM wants the
  manual half, the check is: on YouTrack, an entry that ends a line must not open from the empty
  tail, and the right edge of its last letter must still open it.
