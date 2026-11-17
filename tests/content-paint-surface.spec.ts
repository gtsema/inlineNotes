// @vitest-environment jsdom
/**
 * The paint surface: ranges in, `CSS.highlights` out (task `t3-02` AC1, AC2; rulings
 * `A38`, `A70`).
 *
 * Two things are verified here, and the split between them is not accidental:
 *
 * - `paintRanges` is the shipped conversion from a plan fragment to a `Range`, and it
 *   is fully testable: jsdom has `document.createRange()`, it only has no layout. So
 *   the offset-domain contract of `docs/specs/inline-comment-model.md` -> "Anchor
 *   domains" — a `Range` speaks node-local UTF-16 and never a stream code point — is
 *   pinned here against **real** ranges, with an astral character in the page to make
 *   the two numbers differ. This is the `t2-02` hand-over contract for the paint path;
 *   `paintRanges` and the create card's measurement go through the same factory, so a
 *   second seam cannot appear.
 * - `documentPaintSurface` is the glue onto `CSS.highlights` and `Highlight`, and this
 *   environment has neither. What is pinned is the answer the absence produces: `null`
 *   and no throw, which is ruling `A38`'s "unhighlighted, still listed" with no DOM
 *   fallback. The registry call itself is a smoke check in `chrome://extensions`, and
 *   the pass is tested against an injected surface in
 *   `tests/content-page-painter.spec.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { codePointLength } from '../src/core/entry-rules';
import { documentRangeForFragment } from '../src/content/capture/fragment-rect';
import type { DocumentRangeForFragment } from '../src/content/capture/fragment-rect';
import { documentPaintSurface, paintRanges } from '../src/content/paint/paint-surface';
import type { PaintedFragment } from '../src/content/paint/paint-plan';

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

/** A fragment of a plan, expressed in the node-local domain the seam expects. */
function fragmentOf(node: Text, needle: string): PaintedFragment {
  const start = node.data.indexOf(needle);
  if (start < 0) {
    throw new Error('fixture needle is not in the node');
  }
  return {
    node,
    start,
    end: start + needle.length,
    box: { left: 0, top: 0, width: 10, height: 10 },
  };
}

function rangeText(range: Range): string {
  return range.toString();
}

beforeEach(() => {
  document.body.innerHTML =
    '<article><p id="p1">A 🦊 watched the quick brown fox.</p><p id="p2">Second paragraph here.</p></article>';
});

describe('the ranges the paint path registers (AC1, A70)', () => {
  it('hands the seam the node-local UTF-16 offsets of the fragment', () => {
    const node = textOf('p1');
    const rangeFor: DocumentRangeForFragment = documentRangeForFragment(document);

    const ranges = paintRanges([fragmentOf(node, 'quick brown')], rangeFor);

    expect(ranges).toHaveLength(1);
    const range = ranges[0];
    if (range === undefined) {
      throw new Error('fixture range is missing');
    }
    expect(range.startContainer).toBe(node);
    expect(range.endContainer).toBe(node);
    expect(range.startOffset).toBe(node.data.indexOf('quick brown'));
    expect(range.endOffset).toBe(node.data.indexOf('quick brown') + 'quick brown'.length);
    expect(rangeText(range)).toBe('quick brown');
    // The number that would have painted the wrong words: the emoji before the span
    // costs one code point but two UTF-16 units, so the code-point offset of the same
    // boundary is one lower, and a `Range` would land one character early.
    const codePointStart = codePointLength(node.data.slice(0, range.startOffset));
    expect(codePointStart).not.toBe(range.startOffset);
    expect(codePointStart).toBe(range.startOffset - 1);
  });

  it('registers one range per fragment, in document order (A36)', () => {
    const first = textOf('p1');
    const second = textOf('p2');
    const rangeFor: DocumentRangeForFragment = documentRangeForFragment(document);

    const ranges = paintRanges(
      [fragmentOf(first, 'quick brown fox'), fragmentOf(second, 'Second paragraph')],
      rangeFor,
    );

    expect(ranges.map(rangeText)).toEqual(['quick brown fox', 'Second paragraph']);
    expect(ranges[0]?.startContainer).toBe(first);
    expect(ranges[1]?.startContainer).toBe(second);
  });

  it('refuses an offset the node does not have, instead of painting the wrong span', () => {
    // The two offset domains are both `number`, so the seam is where a crossed domain
    // becomes visible. The plan measures before it paints, so an entry that reaches
    // this call with a bad offset is a bug, not a page state (ruling `A66` answers the
    // page state one step earlier).
    const node = textOf('p1');
    const rangeFor: DocumentRangeForFragment = documentRangeForFragment(document);
    const beyond = {
      node,
      start: 0,
      end: node.data.length + 40,
      box: { left: 0, top: 0, width: 10, height: 10 },
    };

    let failure: unknown = null;
    try {
      paintRanges([beyond], rangeFor);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(DOMException);
    if (failure instanceof DOMException) {
      expect(failure.name).toBe('IndexSizeError');
    }
  });
});

describe('a page without the Highlight API (A38)', () => {
  it('answers with no surface and does not throw', () => {
    expect(documentPaintSurface(document)).toBeNull();
  });

  it('leaves the page untouched when there is no surface', () => {
    const before = document.documentElement.outerHTML;
    const surface = documentPaintSurface(document);

    expect(surface).toBeNull();
    expect(document.documentElement.outerHTML).toBe(before);
    expect(document.querySelector('style')).toBeNull();
  });
});
