// @vitest-environment jsdom
/**
 * Selection capture: a DOM range becomes the numbers core reads (task `t3-01` AC2).
 *
 * Pinned behaviour, all of it from `docs/specs/inline-comment-model.md` -> Rules /
 * Semantics ("Anchor domains", "Anchor options domain", "Resolved range",
 * "Block boundary") plus the `t2-02` hand-over contract and rulings `A27`, `A28`:
 *
 * - one text node, three paragraphs, whitespace at the edges and a whitespace-only
 *   selection all get an answer, and the answer is a **stream code-point range**
 *   whose slice is exactly `anchor.text`;
 * - a fragment the range only touches at a boundary offset is not a fragment of the
 *   note, so `anchor.fragments` counts the pieces whose text is really in it;
 * - a `Range` is only ever handed node-local UTF-16 offsets: the capture keeps the
 *   two domains apart, and the test measures a fragment through an injected range
 *   factory so an accidental stream offset would be visible in the recorded pair.
 *
 * jsdom has no usable `document.getSelection()` for this purpose, so the ranges are
 * built with `document.createRange()` exactly as the page-side reader builds them.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildTextStream } from '../src/content/anchor/text-stream';
import { sliceCodePoints } from '../src/core/text-normalize';
import { codePointLength } from '../src/core/entry-rules';
import { captureSpan } from '../src/content/capture/selection-span';
import { firstFragmentBox } from '../src/content/capture/fragment-rect';
import type { RangeForFragment } from '../src/content/capture/fragment-rect';

const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '  <p id="p3">Third paragraph here.</p>',
  '</article>',
].join('\n');

/** Text node of an element's first child. */
function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

function rangeIn(node: Text, from: number, to: number): Range {
  const selection = document.createRange();
  selection.setStart(node, from);
  selection.setEnd(node, to);
  return selection;
}

function rangeAcross(from: Text, fromOffset: number, to: Text, toOffset: number): Range {
  const selection = document.createRange();
  selection.setStart(from, fromOffset);
  selection.setEnd(to, toOffset);
  return selection;
}

/** The offset pair a range factory receives, to pin the offset domain. */
function recorder(): { rangeFor: RangeForFragment; seen: Array<{ start: number; end: number }> } {
  const seen: Array<{ start: number; end: number }> = [];
  const rangeFor: RangeForFragment = (_node, start, end) => {
    seen.push({ start, end });
    return {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 16 }),
    };
  };
  return { rangeFor, seen };
}

beforeEach(() => {
  document.body.innerHTML = ARTICLE;
});

describe('a selection inside one text node', () => {
  it('produces the anchor text and the code-point span of the same string', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p1'), 4, 15));
    if (span === null) {
      throw new Error('expected a span for a plain word selection');
    }
    expect(span.anchor.text).toBe('quick brown');
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      span.anchor.text,
    );
    expect(span.candidate.end).toBeGreaterThan(span.candidate.start);
    expect(span.fragments.length).toBe(1);
    expect(span.anchor.fragmentCount).toBe(1);
  });

  it('keeps the code-point offsets of the stream, not the UTF-16 offsets of the node', () => {
    // The third paragraph is far into the stream, so its node-local offsets and its
    // stream offsets are different numbers by construction.
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p3'), 6, 15));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('paragraph');
    const before = stream.text.slice(0, stream.text.indexOf('Third paragraph') + 'Third '.length);
    expect(span.candidate.start).toBe(codePointLength(before));
    expect(span.candidate.start).not.toBe(6);
  });
});

describe('a selection over several elements', () => {
  it('carries one fragment per contributing text node', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeAcross(textOf('p1'), 4, textOf('p3'), 5));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.fragments.length).toBe(3);
    expect(span.anchor.fragmentCount).toBe(3);
    expect(span.anchor.text).toBe(
      'quick brown fox jumps over the lazy dog. Second paragraph of the article. Third',
    );
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      span.anchor.text,
    );
  });

  it('counts the text node the range starts inside and ends inside only once', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p2'), 0, 6));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.fragments.length).toBe(1);
    expect(span.anchor.text).toBe('Second');
  });
});

describe('whitespace at the boundaries', () => {
  it('trims the span to the text the note covers (A27)', () => {
    const stream = buildTextStream(document.body);
    // Offsets 3..16 of the first paragraph are " quick brown " with both spaces.
    const span = captureSpan(stream, rangeIn(textOf('p1'), 3, 16));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('quick brown');
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      'quick brown',
    );
  });

  it('leaves a collapsed whitespace run inside the span as one code point', () => {
    document.body.innerHTML = '<p id="p1">a   b</p>';
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p1'), 0, 5));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('a b');
    expect(span.candidate.end - span.candidate.start).toBe(3);
    expect(span.fragments[0].start).toBe(0);
    expect(span.fragments[0].end).toBe(5);
  });

  it('refuses a selection whose normalized text is empty', () => {
    document.body.innerHTML = '<p id="p1">one</p> <p id="p3">two</p>';
    const gap = document.body.childNodes[1];
    if (gap === undefined) {
      throw new Error('fixture gap is missing');
    }
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(gap as Text, 0, 1));
    expect(span).toBeNull();
  });

  it('refuses a collapsed range', () => {
    const stream = buildTextStream(document.body);
    expect(captureSpan(stream, rangeIn(textOf('p1'), 4, 4))).toBeNull();
  });

  it('does not count a node the range only touches at its boundary', () => {
    document.body.innerHTML = '<p id="p1">one</p> <p id="p3">two</p>';
    const stream = buildTextStream(document.body);
    // The range starts at the end of the first paragraph and ends inside the
    // second: only the second paragraph has text in the note.
    const span = captureSpan(stream, rangeAcross(textOf('p1'), 3, textOf('p3'), 3));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('two');
    expect(span.fragments.length).toBe(1);
    expect(span.anchor.fragmentCount).toBe(1);
  });
});

describe('the anchor-options domain of a selection with astral text', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="p1">ab \u{1F600} cd</p>';
  });

  it('counts one code point for one astral character', () => {
    const stream = buildTextStream(document.body);
    // The emoji occupies node-local UTF-16 offsets 3..5.
    const span = captureSpan(stream, rangeIn(textOf('p1'), 3, 5));
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('\u{1F600}');
    expect(span.candidate.end - span.candidate.start).toBe(1);
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      '\u{1F600}'
    );
  });

  it('hands a measuring range the node-local offsets, never the stream offsets', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p1'), 0, 8));
    if (span === null) {
      throw new Error('expected a span');
    }
    const fragment = span.fragments[0];
    if (fragment === undefined) {
      throw new Error('expected a fragment');
    }
    // The two domains really differ in this fixture: the node holds 8 UTF-16 units
    // for 7 code points, so a stream offset handed to a Range would be visible.
    expect(fragment.end).toBe(8);
    expect(fragment.streamEnd - fragment.streamStart).toBe(7);

    const { rangeFor, seen } = recorder();
    const box = firstFragmentBox(span.fragments, rangeFor);
    expect(box).not.toBeNull();
    expect(seen.length).toBe(1);
    const measured = seen[0];
    if (measured === undefined) {
      throw new Error('expected one measurement');
    }
    expect(measured.start).toBe(fragment.start);
    expect(measured.end).toBe(fragment.end);
    expect(measured.end).not.toBe(fragment.streamEnd - fragment.streamStart);
  });

  it('clips the fragment box to the selection, not to the whole text node', () => {
    document.body.innerHTML = '<p id="p1">alpha beta gamma</p>';
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p1'), 6, 10));
    if (span === null) {
      throw new Error('expected a span');
    }
    const fragment = span.fragments[0];
    if (fragment === undefined) {
      throw new Error('expected a fragment');
    }
    expect(fragment.start).toBe(6);
    expect(fragment.end).toBe(10);
    expect(span.anchor.text).toBe('beta');
  });
});
