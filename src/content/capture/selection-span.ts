/**
 * Selection capture: a DOM range becomes the numbers the core anchor API reads.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchor domains", "Anchor options domain", "Resolved range"; the hand-over
 * contract of `docs/state/t2-02-review.md` that task `t3-01` AC2 pins.
 *
 * Why this module is small on purpose: the only authority for "what was selected"
 * is the pair (stream, code-point range). Everything else — `range.toString()`,
 * `Range` offsets, `indexOf` results — is a different measurement of a different
 * string, and mixing them is the failure class the `t2-02` contract closes:
 *
 * - the caller builds **one** stream (`buildTextStream(root)`) per capture and
 *   passes it here, so the candidate and the stored entries of the same create
 *   are measured on one string (`A37`);
 * - a boundary offset is derived from the **fragment that contains it**: the
 *   node-local UTF-16 offset is converted with `nodeCodePointIndex` and added to
 *   that fragment's `streamStart`. An offset inside a node's whitespace run snaps
 *   to that run's single stream code point, which is what the map records;
 * - the span handed to `buildAnchor` is **trimmed**: leading and trailing stream
 *   separators are dropped, because `buildAnchor` leaves them out of `anchor.text`
 *   anyway and an untrimmed range would report a span the entry does not cover
 *   (`A27`). A whitespace-only selection has nothing left after the trim, so it
 *   produces no span at all and `buildAnchor` is never reached with it. The trim
 *   works in the code-point domain like every other number here: it converts the
 *   two boundary numbers to UTF-16 indices with the core helpers, steps over the
 *   separators there, and converts them back. Probing the stream with
 *   `charAt(codePointOffset)` would be a UTF-16 read, and one astral character
 *   anywhere earlier in the stream would then cut a separator that is not there and
 *   take the first character off the stored note (`t3-01` review finding 1);
 * - `options.fragments` is the real fragment count of that trimmed span, taken
 *   from the same stream, never a guess and never the count of nodes the range
 *   merely touches (`A28` refuses an out-of-domain hint instead of coercing it).
 *
 * The returned fragments are the clipped ones of the trimmed span, in document
 * order: the painting stage (`t3-02`) and the card placement (ruling `A30`) both
 * need node-local `start` / `end`, and those two numbers — not `streamStart` /
 * `streamEnd` — are what a `Range` accepts.
 *
 * Nothing here creates a `Range`, reads a global, mutates the page or searches a
 * string: the range and the stream arrive as arguments, and the string search for
 * stored anchors lives in `src/core/anchor-resolve.ts`.
 */

import { buildAnchor } from '../../core/anchor-build';
import type { CodePointRange } from '../../core/entry-overlap';
import type { EntryAnchor } from '../../core/entry';
import { codePointOffsetAt, utf16IndexAt } from '../../core/text-normalize';
import { fragmentsForRange } from '../anchor/locate-anchor';
import type { TextFragment, TextStream } from '../anchor/text-stream';
import { nodeCodePointIndex } from '../anchor/text-stream';

/** One captured selection: the anchor, its span, and the DOM pieces under it. */
export interface CapturedSpan {
  /** Anchor built from the trimmed span of the same stream (`anchor-build`). */
  readonly anchor: EntryAnchor;
  /** Half-open code-point range of the trimmed span in that same stream. */
  readonly candidate: CodePointRange;
  /** Clipped fragments of the trimmed span, in document order. */
  readonly fragments: readonly TextFragment[];
}

/**
 * Maps `range` onto `stream`.
 *
 * `null` is the answer for "there is nothing to note here": a collapsed range, a
 * range whose text normalization leaves empty, a range over excluded subtrees, or
 * a span `buildAnchor` refuses. A `null` never becomes an entry and never reaches
 * the write API, which is the card's only defence for an empty selection
 * (`t2-03` residual risk 5: core allows a degenerate candidate).
 */
export function captureSpan(stream: TextStream, range: Range): CapturedSpan | null {
  const touched = touchedFragments(stream, range);
  if (touched.length === 0) {
    return null;
  }

  const first = touched[0];
  const last = touched[touched.length - 1];
  const raw = trimStreamRange(
    stream.text,
    streamOffsetOfBoundary(first, range.startContainer, range.startOffset, 'start'),
    streamOffsetOfBoundary(last, range.endContainer, range.endOffset, 'end'),
  );
  if (raw.end <= raw.start) {
    return null;
  }

  // The fragments of the *trimmed* span, clipped to the boundaries the user
  // actually made: a node the range only touches at a boundary offset contributes
  // no code point and must not be counted as a fragment of the note (`A28`), and a
  // card placed against a whole paragraph when the selection is one word inside it
  // is placed against the wrong words (ruling `A30`).
  const fragments = clipFragments(stream, raw.start, raw.end, range);
  if (fragments.length === 0) {
    return null;
  }

  const anchor = buildAnchor(stream.text, raw.start, raw.end, { fragments: fragments.length });
  if (anchor === null) {
    return null;
  }
  return { anchor, candidate: { start: raw.start, end: raw.end }, fragments };
}

/**
 * The fragments the trimmed span covers, with their node-local bounds narrowed to
 * the range the user made.
 *
 * The clip takes the `Range`'s own node-local offsets and never a number derived
 * from the trimmed stream range: the two domains differ by the whitespace the
 * stream collapsed, and only the node-local one is a number a `Range` accepts
 * (`docs/specs/inline-comment-model.md` -> "Anchor domains"). A fragment whose clip
 * is empty is a node the range touched at a boundary offset only, so it has no box
 * to place or paint and is not a fragment of the note.
 */
function clipFragments(
  stream: TextStream,
  start: number,
  end: number,
  range: Range,
): TextFragment[] {
  const clipped: TextFragment[] = [];
  for (const fragment of fragmentsForRange(stream, start, end)) {
    const from =
      fragment.node === range.startContainer
        ? Math.max(fragment.start, range.startOffset)
        : fragment.start;
    const to =
      fragment.node === range.endContainer
        ? Math.min(fragment.end, range.endOffset)
        : fragment.end;
    if (to <= from) {
      continue;
    }
    clipped.push(from === fragment.start && to === fragment.end ? fragment : { ...fragment, start: from, end: to });
  }
  return clipped;
}

/**
 * The stream fragments the range overlaps at all, in document order. A fragment
 * may be present here and absent from the trimmed span: the boundary conversion
 * decides what a boundary inside it means, so the raw list is only the search
 * space for the two boundaries.
 */
function touchedFragments(stream: TextStream, range: Range): TextFragment[] {
  const touched: TextFragment[] = [];
  for (const fragment of stream.fragments) {
    if (range.intersectsNode(fragment.node)) {
      touched.push(fragment);
    }
  }
  return touched;
}

/**
 * One boundary of the range, expressed in stream code points.
 *
 * When the boundary node is the fragment itself, its node-local UTF-16 offset goes
 * through that node's code-point map. Any other boundary container (an element, or
 * a text node the fragment list does not carry) sits outside this fragment's
 * contribution, so the near edge of the fragment is the honest answer: the range
 * starts before this fragment's text or ends after it.
 */
function streamOffsetOfBoundary(
  fragment: TextFragment,
  container: Node,
  offset: number,
  side: 'start' | 'end',
): number {
  if (container !== fragment.node) {
    return side === 'start' ? fragment.streamStart : fragment.streamEnd;
  }
  const index = nodeCodePointIndex(fragment.node.data);
  const local = Math.max(0, Math.min(offset, fragment.node.data.length));
  let codePoints = 0;
  for (const end of index.ends) {
    if (end > local) {
      break;
    }
    codePoints += 1;
  }
  return fragment.streamStart + codePoints;
}

/**
 * Drops the stream separators at both ends of `[start, end)`.
 *
 * `start` and `end` are **stream code-point offsets** — the domain of every number
 * in this module (`inline-comment-model.md` -> "Anchor domains") — and
 * `streamText` is indexed in UTF-16 units, so the two must be converted before a
 * character is looked at. Probing with `streamText.charAt(start)` reads the unit at
 * UTF-16 index `start`, which is the code point `start` minus the number of astral
 * code points before it: one emoji anywhere earlier in the article answers "no
 * separator here" when there is one and "separator here" when there is none, so the
 * trim cuts into the selection, `anchor.text` loses its first character, a short
 * selection degenerates into an empty range, and a span that keeps a separator is no
 * longer equal to the range of the entry stored from it, which turns the `duplicate`
 * answer of ruling `A23` into `overlap` (`t3-01` review finding 1).
 *
 * The fix is one crossing in each direction, through the core helpers and nowhere
 * else: `utf16IndexAt` turns the two code-point offsets into UTF-16 indices, the
 * separators are stepped over there — every separator in the stream is exactly one
 * U+0020 (`inline-comment-model.md` -> "Block boundary", "Normalized text"), one
 * UTF-16 unit, so a one-unit step never splits a surrogate pair — and
 * `codePointOffsetAt` turns the result back into code points. Offsets past the end
 * of the stream clamp through `utf16IndexAt`, and an inverted range stays inverted
 * in the code-point domain, which `captureSpan` answers with `null`.
 */
function trimStreamRange(streamText: string, start: number, end: number): CodePointRange {
  const fromUnits = utf16IndexAt(streamText, start);
  const toUnits = Math.max(fromUnits, utf16IndexAt(streamText, end));
  let beginUnits = fromUnits;
  let finishUnits = toUnits;
  while (beginUnits < finishUnits && streamText.charAt(beginUnits) === STREAM_SEPARATOR) {
    beginUnits += 1;
  }
  while (finishUnits > beginUnits && streamText.charAt(finishUnits - 1) === STREAM_SEPARATOR) {
    finishUnits -= 1;
  }
  return {
    start: codePointOffsetAt(streamText, beginUnits),
    end: codePointOffsetAt(streamText, finishUnits),
  };
}

/** The one separator character the stream ever emits. */
const STREAM_SEPARATOR = ' ';
