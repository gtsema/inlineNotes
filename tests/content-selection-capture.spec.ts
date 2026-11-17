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
 *   factory so an accidental stream offset would be visible in the recorded pair;
 * - the boundary trim is computed in the **code-point** domain (`t3-01b` finding 1):
 *   an astral character anywhere before the selection used to make the trim probe a
 *   separator that is not there, so the stored text lost its first character, a
 *   one-word selection degenerated the range, and a re-selection was refused as
 *   `overlap` instead of `duplicate`;
 * - a fragment box with no area does not place anything (ruling `A65`), so the
 *   placement helper measures on to the next fragment and answers `null` only when
 *   no fragment of the span has a box at all.
 *
 * jsdom has no usable `document.getSelection()` for this purpose, so the ranges are
 * built with `document.createRange()` exactly as the page-side reader builds them.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildTextStream } from '../src/content/anchor/text-stream';
import { normalizeText, sliceCodePoints } from '../src/core/text-normalize';
import { codePointLength } from '../src/core/entry-rules';
import { captureSpan } from '../src/content/capture/selection-span';
import { placementFragmentBox } from '../src/content/capture/fragment-rect';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';

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

/**
 * A range factory that answers with `rects` in call order and records every rect it
 * returned. A zero-area rect is what a fragment in a hidden subtree measures as
 * (ruling `A1` keeps hidden text in the stream), which is the case ruling `A65`
 * settles for placement.
 */
function rectFactory(rects: readonly Box[]): {
  rangeFor: RangeForFragment;
  answers: Box[];
} {
  const answers: Box[] = [];
  const rangeFor: RangeForFragment = () => {
    const box = rects[answers.length] ?? rects[rects.length - 1];
    if (box === undefined) {
      throw new Error('rectFactory was given no rects');
    }
    answers.push(box);
    return { getBoundingClientRect: () => box };
  };
  return { rangeFor, answers };
}

/**
 * A box with no area but with a position: what a fragment of a collapsed or hidden
 * subtree measures as. Its coordinates are deliberately far from the viewport
 * gutter, so a test that expects the gutter cannot pass by coincidence through the
 * collapsed box's own numbers (ruling `A65`).
 */
const COLLAPSED_BOX: Box = { left: 500, top: 400, width: 0, height: 0 };

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
    const box = placementFragmentBox(span.fragments, rangeFor);
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

describe('an astral character somewhere before the selection (t3-01b finding 1)', () => {
  /**
   * The regression fixtures. `trimStreamRange` used to probe the stream with
   * `streamText.charAt(codePointOffset)`, which is a UTF-16 read: one astral code
   * point anywhere earlier in the same stream makes that probe answer the character
   * *before* the boundary, so the trim cut a separator that is not there. Three
   * observable consequences, and each has a test here: the stored text lost its
   * first character, a one-word selection degenerated the range (no span at all, so
   * no card), and a span that kept a stream separator was no longer equal to the
   * range of the entry stored from it, so `A23` answered `overlap` instead of
   * `duplicate`.
   *
   * Every case asserts the end-to-end identity `AC1` names:
   * `sliceCodePoints(stream.text, candidate) === anchor.text === normalizeText(selectedText)`.
   */
  it('keeps the first character of a multi-word selection in a later paragraph', () => {
    document.body.innerHTML = [
      '<article id="art">',
      '  <p id="p1">\u{1F600} heading of the article</p>',
      '  <p id="p2">The quick brown fox</p>',
      '</article>',
    ].join('\n');
    const stream = buildTextStream(document.body);
    const range = rangeIn(textOf('p2'), 4, 15);
    const span = captureSpan(stream, range);
    if (span === null) {
      throw new Error('expected a span for a two-word selection');
    }
    expect(span.anchor.text).toBe('quick brown');
    expect(span.anchor.text).toBe(normalizeText(range.toString()));
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      normalizeText(range.toString()),
    );
    expect(span.candidate.end - span.candidate.start).toBe(codePointLength(span.anchor.text));
  });

  it('keeps a one-word selection whole', () => {
    document.body.innerHTML = '<p id="p1">\u{1F600} alpha</p>';
    const stream = buildTextStream(document.body);
    // The word starts at UTF-16 offset 3 because the emoji costs two units.
    const range = rangeIn(textOf('p1'), 3, 8);
    const span = captureSpan(stream, range);
    if (span === null) {
      throw new Error('expected a span for a one-word selection');
    }
    expect(span.anchor.text).toBe('alpha');
    expect(span.anchor.text).toBe(normalizeText(range.toString()));
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe('alpha');
    const fragment = span.fragments[0];
    if (fragment === undefined) {
      throw new Error('expected a fragment to place a card against');
    }
    expect(fragment.node.data.slice(fragment.start, fragment.end)).toBe('alpha');
  });

  it('keeps a short one-word selection from degenerating the range', () => {
    // The shortest selection this can break: one code point preceded by one astral
    // code point and one separator. The mis-probe used to walk `end` back over the
    // separator as well, which made the range inverted and `captureSpan` answered
    // `null` — no card, and a save that could only answer `selection_lost`.
    document.body.innerHTML = '<p id="p1">\u{1F600} a</p>';
    const stream = buildTextStream(document.body);
    const range = rangeIn(textOf('p1'), 3, 4);
    const span = captureSpan(stream, range);
    if (span === null) {
      throw new Error('expected a span for the one-character word');
    }
    expect(span.anchor.text).toBe('a');
    expect(span.candidate.end - span.candidate.start).toBe(1);
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe('a');
  });

  it('leaves no stream separator inside the span when the click caught a space', () => {
    // The trim half of the finding: with an astral character earlier in the stream,
    // the separator at the start of the span is not where `charAt` looked for it, so
    // the span used to keep it and describe a range the entry does not cover (A27).
    document.body.innerHTML = '<p id="p1">\u{1F600} The quick brown fox jumps</p>';
    const stream = buildTextStream(document.body);
    const range = rangeIn(textOf('p1'), 6, 18);
    expect(range.toString()).toBe(' quick brown');
    const span = captureSpan(stream, range);
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('quick brown');
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      'quick brown',
    );
    expect(span.candidate.end - span.candidate.start).toBe(codePointLength('quick brown'));
  });

  it('trims both ends when an astral character sits inside the selection', () => {
    // The other direction of the same rule: the shift is not only about what comes
    // before the selection, it is about the number of astral code points before the
    // boundary being probed.
    document.body.innerHTML = '<p id="p1">one \u{1F600} two three \u{1F600} four</p>';
    const stream = buildTextStream(document.body);
    const data = textOf('p1').data;
    const from = data.indexOf('two') - 1;
    const to = data.indexOf('four');
    const range = rangeIn(textOf('p1'), from, to);
    expect(range.toString()).toBe(' two three \u{1F600} ');
    const span = captureSpan(stream, range);
    if (span === null) {
      throw new Error('expected a span');
    }
    expect(span.anchor.text).toBe('two three \u{1F600}');
    expect(sliceCodePoints(stream.text, span.candidate.start, span.candidate.end)).toBe(
      'two three \u{1F600}',
    );
  });
});

describe('a fragment box with no area does not place the card (ruling A65)', () => {
  it('measures on to the next fragment whose box has an area', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeAcross(textOf('p1'), 4, textOf('p3'), 5));
    if (span === null) {
      throw new Error('expected a span over three paragraphs');
    }
    expect(span.fragments).toHaveLength(3);

    const placed = { left: 300, top: 400, width: 40, height: 16 };
    const { rangeFor, answers } = rectFactory([COLLAPSED_BOX, COLLAPSED_BOX, placed]);
    const box = placementFragmentBox(span.fragments, rangeFor);
    expect(box).toEqual(placed);
    // Every fragment without an area was measured and skipped; the walk stops at the
    // first one that has a box, so a long selection is not measured to its end.
    expect(answers).toHaveLength(3);
  });

  it('answers null when every fragment box has zero area', () => {
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeAcross(textOf('p1'), 4, textOf('p3'), 5));
    if (span === null) {
      throw new Error('expected a span');
    }
    const { rangeFor, answers } = rectFactory([COLLAPSED_BOX]);
    expect(placementFragmentBox(span.fragments, rangeFor)).toBeNull();
    expect(answers).toHaveLength(span.fragments.length);
  });

  it('answers null for no fragment at all, without asking for a measurement', () => {
    const { rangeFor, answers } = rectFactory([COLLAPSED_BOX]);
    expect(placementFragmentBox([], rangeFor)).toBeNull();
    expect(answers).toHaveLength(0);
  });

  it('keeps measuring the fragment the range made, not the whole text node', () => {
    // The box of a placement must come from the clipped fragment, so the card goes
    // against the selected words (ruling A30) and not against the paragraph.
    const stream = buildTextStream(document.body);
    const span = captureSpan(stream, rangeIn(textOf('p1'), 4, 15));
    if (span === null) {
      throw new Error('expected a span');
    }
    const { rangeFor, answers } = rectFactory([{ left: 12, top: 34, width: 56, height: 18 }]);
    expect(placementFragmentBox(span.fragments, rangeFor)).toEqual({
      left: 12,
      top: 34,
      width: 56,
      height: 18,
    });
    expect(answers).toHaveLength(1);
  });
});
