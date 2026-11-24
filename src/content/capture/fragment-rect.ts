/**
 * The box the create card is placed next to (ruling `A30`), and the measurement
 * seam every later pass reuses.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card placement" (including the zero-area rule of ruling `A65`); the offset-domain
 * rule of `docs/specs/inline-comment-model.md` -> "Anchor domains", restated for
 * this call site by the `t2-02` hand-over:
 * `start` / `end` of a `TextFragment` are UTF-16 offsets inside `node.data` and are
 * the only numbers fit for `Range.setStart` / `setEnd`, while `streamStart` /
 * `streamEnd` are code points and must never reach a `Range`.
 *
 * That is the whole reason this module exists and takes the range factory as an
 * argument: the mistake is invisible in the types (both numbers are `number`) and
 * visible only in a test that looks at what the factory received. A page whose
 * text contains an astral character or a collapsed whitespace run gives two
 * different numbers for the same boundary, so handing a stream offset to a `Range`
 * would paint and place the card over the wrong words.
 *
 * The factory keeps the module free of a `document` read: the content entry point
 * passes the real one, a test passes a recorder.
 *
 * Two properties the later passes depend on:
 * - **a box with no area is not a placement point** (ruling `A65`). A fragment in a
 *   hidden subtree is in the stream by ruling `A1` and measures as a zero box, and
 *   a card placed against a zero box lands in the corner of the viewport instead of
 *   next to the words. The helper therefore walks to the next fragment and answers
 *   `null` only when the whole span has no box;
 * - **measurement can throw** (ruling `A64`). `setStart` / `setEnd` reject when the
 *   page shrank the text node after the fragment list was built, and this module
 *   does not swallow it: the caller owns the answer, which is "no card".
 *
 * Painting (`t3-02`) must reuse `documentRangeForFragment` and the clipped fragments
 * of the capture, never a second measurement helper: one seam means one place where
 * the two offset domains are crossed.
 */

/**
 * What a measurement needs of a `text fragment`: the text node and the node-local
 * UTF-16 offsets inside it.
 *
 * `TextFragment` of `text-stream.ts` satisfies this shape, and so does the
 * `PaintedFragment` of the paint pass, so the create card, the paint pass and the
 * tooltip anchor are measured by one function over one seam. The shape deliberately
 * has no `streamStart` / `streamEnd`: those are code points, and a measurement module
 * that could see them is a module that can hand one to `Range.setStart`.
 */
export interface FragmentOffsets {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

/** A viewport-aligned box in CSS pixels. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What the measurement needs from a range: its bounding box, and — when the page allows
 * it — the client rects that box is the union of.
 *
 * `getClientRects` is **optional**, and that is the whole of why it is a separate member:
 * the structural seam is what lets every measurement rule be verified without page
 * layout (a test injects a box-only recorder), so a required member would force every
 * such recorder to invent rects. The real `Range` always has it, and the hover hit-test
 * of ruling `A204` is the one caller that needs the exact answer rather than the union:
 * a wrapped `text fragment` is several rects, and the union of them also covers the
 * empty band beside the last line. A range that offers none answers with its bounding
 * box, which is the pre-`A204` shape of the fixture and never the shipped page.
 */
export interface MeasuredRange {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  getClientRects?(): ArrayLike<{ left: number; top: number; width: number; height: number }>;
}

/** Builds a range over node-local UTF-16 offsets of `node`. */
export type RangeForFragment = (node: Text, start: number, end: number) => MeasuredRange;

/**
 * The same signature typed to the real object it answers with.
 *
 * `RangeForFragment` is deliberately structural, so no test needs page layout: a
 * test injects a box-only recorder and the measurement rule stays verifiable. The
 * paint surface of `t3-02` cannot use that structural type, because `CSS.highlights`
 * registers ranges and not boxes, so it needs the object `createRange` returned.
 * This alias says so, and `documentRangeForFragment` below satisfies both, which
 * keeps the measurement seam and the paint seam one factory (`one seam rule`).
 */
export type DocumentRangeForFragment = (node: Text, start: number, end: number) => Range;

/**
 * The box of one fragment of a resolved span, in viewport coordinates.
 *
 * This is the only DOM read in the placement path, and it is the measurement the
 * paint pass (`t3-02`) is expected to reuse: the numbers it hands the range factory
 * are the node-local UTF-16 offsets of the clipped fragment.
 */
export function fragmentBox(fragment: FragmentOffsets, rangeFor: RangeForFragment): Box {
  const box = rangeFor(fragment.node, fragment.start, fragment.end).getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/**
 * The box the card is placed against: the box of the **first fragment that has an
 * area** (ruling `A30` for the order, ruling `A65` for the skip).
 *
 * `null` means "this span has no box at all": no fragment, or every fragment
 * measures zero area. It is not a request to place the card at the corner of the
 * shadow host — the caller answers with the viewport rule of `placeCardInViewport`,
 * which keeps the card inside the `card gutter`.
 *
 * A fragment in a hidden or detached subtree contributes text to the stream (ruling
 * `A1`) and measures as a zero box, so skipping it is what puts the card next to the
 * words the reader can actually see. The walk stops at the first box with an area:
 * a selection over twenty paragraphs is not measured to its end.
 *
 * A throw from `rangeFor` is not caught here. It means the page changed the node
 * under the fragment list between the capture and this measurement, and the caller
 * owns that decision (ruling `A64`: the card closes).
 */
export function placementFragmentBox(
  fragments: readonly FragmentOffsets[],
  rangeFor: RangeForFragment,
): Box | null {
  for (const fragment of fragments) {
    const box = fragmentBox(fragment, rangeFor);
    if (hasArea(box)) {
      return box;
    }
  }
  return null;
}

/** The range factory of a real page. */
export function documentRangeForFragment(
  doc: Document,
): DocumentRangeForFragment {
  return (node: Text, start: number, end: number): Range => {
    const range = doc.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range;
  };
}

/**
 * `true` when a box can be placed against. A zero width or a zero height is the
 * shape a `display: none` subtree, an empty text box or a detached node measures as
 * (ruling `A65`), and a negative size is not something a page reports; both answer
 * "there is nothing here to place against".
 *
 * One predicate for three jobs: the placement walk above stops at the first box that
 * passes, the paint pass of `t3-02` keeps every fragment regardless (ruling `A36`)
 * and uses this predicate only to pick the tooltip anchor (ruling `A67`), and the
 * `A204` pixel guard of the hover hit-test refuses a rect that fails it (a wrapped
 * fragment contributes the empty rects of its last line, and a point there is not on
 * painted pixels). A module that
 * re-derived `width > 0 && height > 0` could pick `>=` or a threshold, and then the
 * card and the tooltip would disagree about whether a span has a position at all.
 */
export function hasArea(box: Box): boolean {
  return box.width > 0 && box.height > 0;
}
