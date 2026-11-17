// @vitest-environment jsdom
/**
 * The load-time resolve and measure step of the paint pass (task `t3-02` AC1, AC5;
 * rulings `A29`, `A36`, `A40`, `A66`, `A67`, `A70`).
 *
 * Pinned behaviour, from `docs/specs/content-overlay-ui.md` -> Rules / Semantics
 * ("Highlight painting", "Paint-path measurement", "Tooltip anchor") and
 * `docs/specs/inline-comment-model.md` -> Flow / Sequence 6:
 *
 * - one entry of the page becomes one named highlight, `inlinenotes-<entryId>`
 *   (ruling `A70`), whose fragments are the whole resolved span and not its first
 *   box (ruling `A36`): `placementFragmentBox` stops at the first fragment with an
 *   area, and reusing it here would leave the second half of a wrapped selection
 *   unpainted;
 * - the numbers handed to the measurement seam are node-local UTF-16 offsets. The
 *   `t2-02` hand-over warns that a stream code-point offset is the same `number` type
 *   and paints the wrong words, and an astral character in the page is what makes the
 *   two differ;
 * - a hidden entry, an entry whose text is gone and an entry the page will not
 *   measure are absent from the page and still stored (rulings `A40`, `A24`, `A66`).
 *   The measurement `catch` sits inside the loop over entries, so one bad entry costs
 *   one highlight;
 * - the tooltip anchor is the first fragment box with an area, and no area at all
 *   means no tooltip (ruling `A67`);
 * - one stream per pass, rebuilt from the live subtree. The behavioural proof is the
 *   same-shape rewrite: same length, same whitespace shape, different characters. A
 *   cached stream would still resolve that anchor and paint it; a rebuilt one reports
 *   the text as gone.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import type { Entry, EntryAnchor } from '../src/core/entry';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { buildTextStream } from '../src/content/anchor/text-stream';
import { hasArea } from '../src/content/capture/fragment-rect';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import { highlightNameOf, isPaintHighlightName } from '../src/content/paint/highlight-name';
import { buildPaintPlan, tooltipAnchorOf } from '../src/content/paint/paint-plan';
import type { PaintedFragment } from '../src/content/paint/paint-plan';

const ARTICLE =
  '<article><p id="p1">The quick brown fox jumps.</p><p id="p2">Second paragraph here.</p></article>';

const BOX_A: Box = { left: 12, top: 30, width: 120, height: 18 };
const BOX_B: Box = { left: 12, top: 60, width: 90, height: 18 };

/** A positioned box with no area: the shape a hidden or collapsed fragment measures. */
const COLLAPSED_BOX: Box = { left: 500, top: 400, width: 0, height: 0 };

function resetPage(html: string = ARTICLE): void {
  document.body.innerHTML = html;
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

/** Builds an anchor the way the capture site does: same stream, real fragment count. */
function anchorOf(needle: string, fragments = 1): EntryAnchor {
  const stream = buildTextStream(document.body);
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw new Error('fixture needle is not in the stream');
  }
  const start = codePointOffsetAt(stream.text, utf16At);
  const anchor = buildAnchor(stream.text, start, start + codePointLength(needle), { fragments });
  if (anchor === null) {
    throw new Error('fixture anchor could not be built');
  }
  return anchor;
}

function entryFor(anchor: EntryAnchor, overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'a1b2c3d4e5f6',
    pageKey: 'https://example.com/a',
    authorName: 'reader-one',
    text: anchor.text,
    comment: 'a note',
    anchor,
    visible: true,
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    ...overrides,
  };
}

/**
 * A box-only range factory: jsdom has no layout, and the plan only ever needs the
 * box, so the seam is also the place a test can watch the offset domain and inject a
 * measurement failure.
 */
function recorder(boxes: readonly Box[] = [BOX_A]): {
  rangeFor: RangeForFragment;
  seen: Array<{ node: Text; start: number; end: number }>;
} {
  const seen: Array<{ node: Text; start: number; end: number }> = [];
  const rangeFor: RangeForFragment = (node, start, end) => {
    seen.push({ node, start, end });
    const box = boxes[seen.length - 1] ?? boxes[boxes.length - 1];
    if (box === undefined) {
      throw new Error('recorder was given no boxes');
    }
    return { getBoundingClientRect: () => box };
  };
  return { rangeFor, seen };
}

/** A seam that refuses one node, which is what a page does after it shrank a text. */
function refusingRangeFor(badNode: Text, boxes: readonly Box[] = [BOX_A]): RangeForFragment {
  const { rangeFor } = recorder(boxes);
  return (node, start, end) => {
    if (node === badNode) {
      throw new DOMException('The offset is out of the range.', 'IndexSizeError');
    }
    return rangeFor(node, start, end);
  };
}

beforeEach(() => {
  resetPage();
});

describe('one entry, one named highlight (AC1, A70)', () => {
  it('paints a visible resolvable entry under its own name', () => {
    const anchor = anchorOf('quick brown');
    const entry = entryFor(anchor);
    const { rangeFor, seen } = recorder([BOX_A]);

    const plan = buildPaintPlan({ entries: [entry], root: document.body, rangeFor });

    expect(plan.skipped).toEqual([]);
    expect(plan.painted).toHaveLength(1);
    const painted = plan.painted[0];
    if (painted === undefined) {
      throw new Error('fixture entry is not painted');
    }
    expect(painted.entry).toEqual(entry);
    expect(painted.name).toBe(highlightNameOf(entry.id));
    expect(painted.name).toBe(`inlinenotes-${String(entry.id)}`);
    expect(isPaintHighlightName(painted.name)).toBe(true);
    expect(painted.fragments).toHaveLength(1);
    expect(painted.fragments[0]?.box).toEqual(BOX_A);
    expect(seen).toHaveLength(1);
  });

  it('names every entry of the page differently, so one entry can be dropped alone', () => {
    const first = entryFor(anchorOf('quick brown'), { id: 'a1b2c3d4e5f6' });
    const second = entryFor(anchorOf('Second paragraph'), { id: 'b2c3d4e5f6a1' });
    const { rangeFor } = recorder();

    const plan = buildPaintPlan({ entries: [first, second], root: document.body, rangeFor });

    expect(plan.painted.map((painted) => painted.name)).toEqual([
      'inlinenotes-a1b2c3d4e5f6',
      'inlinenotes-b2c3d4e5f6a1',
    ]);
    // The prefix test must not answer `true` for a page script's own name.
    expect(isPaintHighlightName('inlinenotes')).toBe(false);
    expect(isPaintHighlightName('highlight-notes-a1b2c3d4e5f6')).toBe(false);
    expect(isPaintHighlightName('inlinenotes-a1b2c3d4e5f6')).toBe(true);
  });

  it('hands the seam node-local UTF-16 offsets, never the stream code points', () => {
    // An astral character before the span makes the two domains differ: one code
    // point is two UTF-16 units, and the normalized stream is not the node data.
    resetPage('<article><p id="p1">A 🦊 watched the quick brown fox.</p></article>');
    const node = textOf('p1');
    const anchor = anchorOf('quick brown');
    const { rangeFor, seen } = recorder();

    const plan = buildPaintPlan({
      entries: [entryFor(anchor)],
      root: document.body,
      rangeFor,
    });

    const fragment = plan.painted[0]?.fragments[0];
    if (fragment === undefined) {
      throw new Error('fixture entry is not painted');
    }
    const expectedStart = node.data.indexOf('quick brown');
    expect(expectedStart).toBeGreaterThan(0);
    expect(fragment.node).toBe(node);
    expect(fragment.start).toBe(expectedStart);
    expect(fragment.end).toBe(expectedStart + 'quick brown'.length);
    expect(seen[0]).toEqual({ node, start: fragment.start, end: fragment.end });
    // The number that would paint the wrong words, for the record: a stream offset
    // of this anchor is not the node offset, and it never reaches the seam.
    const stream = buildTextStream(document.body);
    const streamStart = codePointOffsetAt(stream.text, stream.text.indexOf('quick brown'));
    expect(streamStart).not.toBe(fragment.start);
  });

  it('keeps and measures every fragment of a span that spans two elements (A36)', () => {
    const anchor = anchorOf('jumps. Second', 2);
    const { rangeFor, seen } = recorder([BOX_A, BOX_B]);

    const plan = buildPaintPlan({
      entries: [entryFor(anchor)],
      root: document.body,
      rangeFor,
    });

    const fragments = plan.painted[0]?.fragments;
    if (fragments === undefined) {
      throw new Error('fixture entry is not painted');
    }
    expect(fragments).toHaveLength(2);
    // The contrast with `placementFragmentBox`, which would stop here after the first
    // box with an area and leave half of the selection unpainted.
    expect(seen.map((call) => ({ start: call.start, end: call.end }))).toEqual([
      { start: fragments[0]?.start ?? 0, end: fragments[0]?.end ?? 0 },
      { start: fragments[1]?.start ?? 0, end: fragments[1]?.end ?? 0 },
    ]);
    expect(fragments.map((fragment) => fragment.box)).toEqual([BOX_A, BOX_B]);
  });

  it('paints a text node the page removed and re-added, with a measured box (A29)', () => {
    // The box half of the adopted-node pin of the `t3-01b` review: `isConnected` is
    // what makes the re-added node live again, and a box is what proves the paint
    // path does not merely resolve it but puts it on the page.
    const anchor = anchorOf('quick brown');
    const paragraph = document.getElementById('p1');
    if (paragraph === null || paragraph.parentNode === null) {
      throw new Error('fixture paragraph is missing');
    }
    const parent = paragraph.parentNode;
    parent.removeChild(paragraph);
    expect(paragraph.isConnected).toBe(false);
    parent.insertBefore(paragraph, parent.firstChild);
    expect(paragraph.isConnected).toBe(true);

    const { rangeFor, seen } = recorder([BOX_A]);
    const plan = buildPaintPlan({
      entries: [entryFor(anchor)],
      root: document.body,
      rangeFor,
    });

    expect(plan.skipped).toEqual([]);
    expect(plan.painted[0]?.fragments[0]?.box).toEqual(BOX_A);
    expect(seen).toHaveLength(1);
  });
});

describe('what stays off the page (A40, A24, A66)', () => {
  it('skips an invisible entry without measuring it, and keeps the record', () => {
    const anchor = anchorOf('quick brown');
    const entry = entryFor(anchor, { visible: false });
    const { rangeFor, seen } = recorder();

    const plan = buildPaintPlan({ entries: [entry], root: document.body, rangeFor });

    expect(plan.painted).toEqual([]);
    expect(plan.skipped).toEqual([{ entryId: entry.id, reason: 'hidden' }]);
    expect(seen).toEqual([]);
  });

  it('skips an entry whose text the page removed', () => {
    const anchor = anchorOf('Second paragraph');
    const entry = entryFor(anchor);
    const paragraph = document.getElementById('p2');
    if (paragraph !== null) {
      paragraph.remove();
    }
    const { rangeFor } = recorder();

    const plan = buildPaintPlan({ entries: [entry], root: document.body, rangeFor });

    expect(plan.painted).toEqual([]);
    expect(plan.skipped).toEqual([{ entryId: entry.id, reason: 'anchor_not_found' }]);
  });

  it('loses only the entry the page refuses to measure, and keeps the rest (A66)', () => {
    const broken = entryFor(anchorOf('quick brown'), {
      id: 'a1b2c3d4e5f6',
      comment: 'the unmeasurable one',
    });
    const healthy = entryFor(anchorOf('Second paragraph'), {
      id: 'b2c3d4e5f6a1',
      comment: 'the paintable one',
    });
    const rangeFor = refusingRangeFor(textOf('p1'), [BOX_B]);

    const plan = buildPaintPlan({
      entries: [broken, healthy],
      root: document.body,
      rangeFor,
    });

    expect(plan.skipped).toEqual([{ entryId: broken.id, reason: 'measurement_failed' }]);
    expect(plan.painted.map((painted) => painted.name)).toEqual(['inlinenotes-b2c3d4e5f6a1']);
    // The healthy entry keeps every fragment it had: the catch is per entry, so it
    // cannot arrive here with a shortened fragment list.
    expect(plan.painted[0]?.fragments).toHaveLength(1);
    expect(plan.painted[0]?.fragments[0]?.box).toEqual(BOX_B);
  });

  it('answers a measurement failure with a reason, not with a throw (A66)', () => {
    const entry = entryFor(anchorOf('quick brown'));
    const rangeFor = refusingRangeFor(textOf('p1'));

    expect(() => buildPaintPlan({ entries: [entry], root: document.body, rangeFor })).not.toThrow();
  });

  it('measures every entry again after the page moved the text it anchors on (A29)', () => {
    // The falsifier for a cached stream or cached positions: the rewrite keeps the
    // length and the whitespace shape of the node, so a reused stream would still
    // resolve this anchor and paint it. A rebuilt stream reports the text as gone.
    const entry = entryFor(anchorOf('quick brown'));
    const first = recorder();
    const before = buildPaintPlan({
      entries: [entry],
      root: document.body,
      rangeFor: first.rangeFor,
    });
    expect(before.painted).toHaveLength(1);

    const node = textOf('p1');
    const rewritten = node.data.replace('quick', 'qwick');
    expect(rewritten.length).toBe(node.data.length);
    node.data = rewritten;

    const second = recorder();
    const after = buildPaintPlan({
      entries: [entry],
      root: document.body,
      rangeFor: second.rangeFor,
    });
    expect(after.painted).toEqual([]);
    expect(after.skipped).toEqual([{ entryId: entry.id, reason: 'anchor_not_found' }]);
    expect(second.seen).toEqual([]);
  });
});

describe('the tooltip anchor (A67)', () => {
  it('takes the first fragment box that has an area, not the first fragment', () => {
    const anchor = anchorOf('jumps. Second', 2);
    const { rangeFor } = recorder([COLLAPSED_BOX, BOX_B]);

    const plan = buildPaintPlan({
      entries: [entryFor(anchor)],
      root: document.body,
      rangeFor,
    });

    expect(plan.painted[0]?.fragments).toHaveLength(2);
    expect(plan.painted[0]?.tooltipBox).toEqual(BOX_B);
  });

  it('answers null when no fragment has an area, and the entry is still painted', () => {
    const anchor = anchorOf('quick brown');
    const { rangeFor } = recorder([COLLAPSED_BOX]);

    const plan = buildPaintPlan({
      entries: [entryFor(anchor)],
      root: document.body,
      rangeFor,
    });

    expect(plan.painted).toHaveLength(1);
    expect(plan.painted[0]?.tooltipBox).toBeNull();
    // The box of an unpaintable fragment is kept in the plan, because the hover
    // hit-test decides "no tooltip" from it rather than from a second measurement.
    expect(plan.painted[0]?.fragments[0]?.box).toEqual(COLLAPSED_BOX);
  });

  it('shares one area predicate with placement, and re-derives nothing', () => {
    const painted: PaintedFragment = { node: textOf('p1'), start: 0, end: 4, box: BOX_A };
    expect(hasArea(BOX_A)).toBe(true);
    expect(hasArea(COLLAPSED_BOX)).toBe(false);
    expect(hasArea({ left: 0, top: 0, width: 10, height: 0 })).toBe(false);
    expect(hasArea({ left: 0, top: 0, width: 0, height: 10 })).toBe(false);
    expect(tooltipAnchorOf([painted])).toEqual(BOX_A);
    expect(tooltipAnchorOf([])).toBeNull();
  });
});
