/**
 * The box the create card is placed next to (ruling `A30`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card placement"; the offset-domain rule of `docs/specs/inline-comment-model.md`
 * -> "Anchor domains", restated for this call site by the `t2-02` hand-over:
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
 */

import type { TextFragment } from '../anchor/text-stream';

/** A viewport-aligned box in CSS pixels. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What the measurement needs from a range: its bounding box. */
export interface MeasuredRange {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

/** Builds a range over node-local UTF-16 offsets of `node`. */
export type RangeForFragment = (node: Text, start: number, end: number) => MeasuredRange;

/**
 * The box of the first fragment of a resolved span: the anchor point of the card.
 * `null` when there is no fragment to place anything against.
 */
export function firstFragmentBox(
  fragments: readonly TextFragment[],
  rangeFor: RangeForFragment,
): Box | null {
  if (fragments.length === 0) {
    return null;
  }
  const fragment = fragments[0];
  const box = rangeFor(fragment.node, fragment.start, fragment.end).getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** The range factory of a real page. */
export function documentRangeForFragment(
  doc: Document,
): RangeForFragment {
  return (node: Text, start: number, end: number): MeasuredRange => {
    const range = doc.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range;
  };
}
