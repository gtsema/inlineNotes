// @vitest-environment jsdom
/**
 * The tooltip confirms the pointer is on the painted pixels (ruling `A204`, task
 * `t26-01`, `docs/specs/content-overlay-ui.md` AC 30).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> "Tooltip hit-testing" (the `A204`
 * paragraph) and AC 30: the `caret hit-test` only **names the candidate**; the hover
 * point must also fall inside a client rect of one of that entry's `text fragment`s,
 * measured **at hover time** through the placement seam, with one pixel of tolerance.
 *
 * The defect this file pins, measured by the reader on YouTrack: a page's caret API
 * answers the **nearest** caret for a point that is over no text at all, so any point in
 * a line's empty tail clamps to the line's last character. The boundary tolerance of
 * `entryAtCaret` then accepted it, and the entry that ended the line opened its tooltip
 * from anywhere on that line's tail and line-height band.
 *
 * Why a separate file from `content-tooltip.spec.ts`: this file is the *only* thing it
 * tests — the guard, its one pixel of tolerance, the wrapped-rect walk and the `A66`
 * posture of a measurement that throws — driven straight through the controller with a
 * recorded seam, so each case states the ";a point is/is not on the pixels" fact on its own.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import type { Entry } from '../src/core/entry';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import { ensureOverlayHost } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import { createTooltipController } from '../src/content/overlay/tooltip-controller';
import type { TooltipController } from '../src/content/overlay/tooltip-controller';
import { TOOLTIP_CLASS } from '../src/content/overlay/tooltip-style';
import type { CaretAtPoint, CaretHit } from '../src/content/overlay/tooltip-hit-test';
import { entryAtCaret } from '../src/content/overlay/tooltip-hit-test';
import type { Viewport } from '../src/content/overlay/card-placement';

const PAGE_KEY = 'https://example.test/article';
const OWN_NAME = 'reader-one';
const COMMENT = 'a note on the last word of the line';
const VIEWPORT: Viewport = { width: 800, height: 600 };

/**
 * The line the entry lives on, and the entry's word on it: the reader's shape — the
 * word is the **last** word of the line, so the caret at the end of the text node is the
 * one the page clamps a point in the empty tail to.
 */
const LINE_TOP = 40;
const LINE_HEIGHT = 18;
/** Where the word starts, and how wide it is: it ends `WORD_LEFT + WORD_WIDTH` = 160. */
const WORD_LEFT = 100;
const WORD_WIDTH = 60;
/** The last word's painted pixels. */
const WORD: Box = { left: WORD_LEFT, top: LINE_TOP, width: WORD_WIDTH, height: LINE_HEIGHT };
/** A point inside the word. */
const INSIDE = { x: WORD_LEFT + 10, y: LINE_TOP + 9 } as const;
/** The empty tail to the right of the word: over no text, but the caret clamps to its end. */
const TAIL = { x: WORD_LEFT + WORD_WIDTH + 20, y: LINE_TOP + 9 } as const;
/** The band above the row, in the line's own line-height: no glyph, no pixels. */
const BAND_BELOW = { x: WORD_LEFT + 10, y: LINE_TOP + LINE_HEIGHT + 6 } as const;

/**
 * A measurement seam that answers the shape a real `Range` does — a bounding box and the
 * client rects it is the union of — and records every call and every `getClientRects`.
 */
function seamOf(rects: readonly Box[], box?: Box): {
  rangeFor: RangeForFragment;
  calls(): number;
  rectReads(): number;
  setRects: (next: readonly Box[], nextBox?: Box) => void;
} {
  let current: readonly Box[] = [...rects];
  let currentBox: Box = box ?? boundingBoxOf(rects);
  let calls = 0;
  let rectReads = 0;
  return {
    calls: (): number => calls,
    rectReads: (): number => rectReads,
    setRects: (next: readonly Box[], nextBox?: Box): void => {
      current = [...next];
      currentBox = nextBox ?? boundingBoxOf(next);
    },
    rangeFor: (): { getBoundingClientRect: () => Box; getClientRects: () => Box[] } => {
      const rectsNow = current;
      const boxNow = currentBox;
      calls += 1;
      return {
        getBoundingClientRect: (): Box => boxNow,
        getClientRects: (): Box[] => {
          rectReads += 1;
          return [...rectsNow];
        },
      };
    },
  };
}

/** The union of a set of rects, the way a `Range.getBoundingClientRect` answers. */
function boundingBoxOf(rects: readonly Box[]): Box {
  if (rects.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const first = rects[0];
  let left = first.left;
  let top = first.top;
  let right = first.left + first.width;
  let bottom = first.top + first.height;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.left + rect.width);
    bottom = Math.max(bottom, rect.top + rect.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** The stored record of the fixture, built without any page. */
function entryOf(id: string): Entry {
  return {
    id,
    pageKey: PAGE_KEY,
    authorName: OWN_NAME,
    text: 'word',
    comment: COMMENT,
    anchor: { text: 'word', prefix: 'The last ', suffix: '', fragmentCount: 1 },
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    visible: true,
  };
}

/** One painted entry over one text node, with whatever boxes the case needs. */
function paintedEntryOf(
  fragments: readonly PaintedFragment[],
  id = 'a1b2c3d4e5f6',
): PaintedEntry {
  return {
    entry: entryOf(id),
    name: `inlinenotes-${id}`,
    paintSlot: 0,
    fragments,
  };
}

/** The one text node of the fixture page. */
function pageText(): Text {
  const paragraph = document.getElementById('p1');
  if (paragraph === null || paragraph.firstChild === null) {
    throw new Error('fixture paragraph is missing');
  }
  return paragraph.firstChild as Text;
}

/**
 * The fragment of the entry: the **last** word of the sentence, so its end offset is the
 * text node's own end — the boundary a clamped caret reports.
 */
function lastWordFragment(node: Text, box: Box): PaintedFragment {
  const end = node.data.length;
  const start = node.data.lastIndexOf(' ') + 1;
  return { node, start, end, box };
}

let overlay: OverlayHost;
let painted: readonly PaintedEntry[];
let carets: CaretHit | null;
/** The fixed caret answer, plus the caret seam the controller is handed. */
let caretAt: CaretAtPoint;
let seam: ReturnType<typeof seamOf>;
let tooltip: TooltipController;

/**
 * Boots the controller over one hand-built painted entry.
 *
 * The fixture is deliberately **not** a paint pass: the guard is a rule about the hover
 * path, and a real pass would add its own measurement noise to every case. The painted
 * entry is exactly the shape `buildPaintPlan` produces (record, `paint name`, slot,
 * fragments with node-local offsets), and the seam answers for it alone.
 */
function boot(rangeFor: RangeForFragment): void {
  tooltip = createTooltipController(document, overlay, {
    paintedEntries: () => painted,
    authorName: () => OWN_NAME,
    caretAt,
    rangeFor,
    viewport: () => VIEWPORT,
  });
}

beforeEach(() => {
  document.body.innerHTML = '<p id="p1">The note sits on the final word</p>';
  document.documentElement.querySelectorAll('[id^="inlinenotes-"]').forEach((node) => node.remove());
  const host = ensureOverlayHost();
  if (host === null) {
    throw new Error('the fixture document is the top frame, so the host must exist');
  }
  overlay = host;

  const node = pageText();
  const fragment = lastWordFragment(node, WORD);
  painted = [paintedEntryOf([fragment])];
  // The defect in one line: the page answers the **nearest** caret for a point in the
  // tail or the band, which for the line's last word is `offset === fragment.end`. The
  // caret test accepts that boundary by design (`A204` keeps that tolerance), so every
  // case below is a case the caret test alone used to open.
  carets = { node, offset: fragment.end };
  caretAt = (): CaretHit | null => carets;
  seam = seamOf([WORD]);
});

describe('the tooltip confirms the pointer is on the painted pixels (A204, AC 30)', () => {
  it('opens nothing from the empty tail of the line, though the caret test accepts it', () => {
    // The premise of the defect, stated on the record: the caret test alone says "this
    // is the entry". The guard is what makes the reader's tail a no-hover.
    const node = pageText();
    expect(entryAtCaret(painted, { node, offset: node.data.length })?.entry.id).toBe(
      'a1b2c3d4e5f6',
    );
    boot(seam.rangeFor);

    tooltip.hoverAt(TAIL.x, TAIL.y);

    expect(tooltip.isOpen()).toBe(false);
    expect(overlay.root.querySelector(`.${TOOLTIP_CLASS}`)).toBeNull();
    // The rects were measured: the answer came from the pixels, not from a cached box.
    expect(seam.rectReads()).toBeGreaterThan(0);
  });

  it('opens nothing from the line-height band beside the word', () => {
    boot(seam.rangeFor);

    tooltip.hoverAt(BAND_BELOW.x, BAND_BELOW.y);

    expect(tooltip.isOpen()).toBe(false);
  });

  it('opens the tooltip for a point inside a painted rect', () => {
    boot(seam.rangeFor);

    tooltip.hoverAt(INSIDE.x, INSIDE.y);

    expect(tooltip.isOpen()).toBe(true);
    expect(tooltip.openEntryId()).toBe('a1b2c3d4e5f6');
    const card = overlay.root.querySelector(`.${TOOLTIP_CLASS}`);
    expect(card?.textContent).toContain(COMMENT);
  });

  it('still opens one pixel off the right edge: the right half of the last letter is hoverable', () => {
    boot(seam.rangeFor);
    const right = WORD.left + WORD.width;

    // Exactly on the edge, then one pixel past it: both are the same letter's closing
    // half, and the caret boundary tolerance already answers there.
    tooltip.hoverAt(right, INSIDE.y);
    expect(tooltip.isOpen()).toBe(true);

    tooltip.hide();
    tooltip.hoverAt(right + 1, INSIDE.y);
    expect(tooltip.isOpen()).toBe(true);
  });

  it('refuses a point two pixels past the right edge: the tolerance is one pixel', () => {
    boot(seam.rangeFor);
    const right = WORD.left + WORD.width;

    tooltip.hoverAt(right + 1, INSIDE.y);
    expect(tooltip.isOpen()).toBe(true);

    tooltip.hoverAt(right + 2, INSIDE.y);
    expect(tooltip.isOpen()).toBe(false);
  });

  it('accepts a point in any of a wrapped fragment\u2019s rects, and no point between them', () => {
    // A wrapped `text fragment` is two rows: the second row is short, so the point in the
    // gap **under** the first row's long right half, on the second row's y, is on no
    // painted pixels — while the bounding box of the two rows covers it.
    const firstRow: Box = { left: 10, top: 40, width: 300, height: 18 };
    const secondRow: Box = { left: 10, top: 60, width: 60, height: 18 };
    const wrapped = seamOf([firstRow, secondRow]);
    boot(wrapped.rangeFor);

    // The first row's own row: painted.
    tooltip.hoverAt(250, 50);
    expect(tooltip.isOpen()).toBe(true);

    // The same x on the second row, past its width: the union (the bounding box) covers
    // this point, the client rects do not, and `A204` asks the client rects.
    tooltip.hoverAt(250, 70);
    expect(tooltip.isOpen()).toBe(false);

    // The short second row itself: painted, and it is a rect of the same fragment.
    tooltip.hoverAt(30, 70);
    expect(tooltip.isOpen()).toBe(true);
  });

  it('falls back to the bounding box when the measured range offers no getClientRects', () => {
    // The structural seam of `fragment-rect.ts` is box-only by design, so the guard must
    // answer for it rather than refuse every hover.
    const boxOnly: RangeForFragment = () => ({ getBoundingClientRect: () => WORD });
    boot(boxOnly);

    tooltip.hoverAt(INSIDE.x, INSIDE.y);
    expect(tooltip.isOpen()).toBe(true);

    tooltip.hoverAt(TAIL.x, TAIL.y);
    expect(tooltip.isOpen()).toBe(false);
  });

  it('opens nothing when the measurement throws, and keeps the tooltip it already had (A66)', () => {
    const refusing: RangeForFragment = () => {
      throw new DOMException('The offset is out of the range.', 'IndexSizeError');
    };
    boot(refusing);
    expect(tooltip.isOpen()).toBe(false);

    tooltip.hoverAt(INSIDE.x, INSIDE.y);
    expect(tooltip.isOpen()).toBe(false);

    // And from the other direction: an open tooltip is closed by an unmeasurable hover,
    // and the entry itself is untouched — still the one the pass painted.
    boot(seam.rangeFor);
    tooltip.hoverAt(INSIDE.x, INSIDE.y);
    expect(tooltip.isOpen()).toBe(true);

    rebind(refusing);
    tooltip.hoverAt(INSIDE.x, INSIDE.y);
    expect(tooltip.isOpen()).toBe(false);
    expect(painted).toHaveLength(1);
    expect(painted[0].fragments[0].box).toBe(WORD);
  });
});

/** Re-wires the same painted entry with another seam, as a page that changed would. */
function rebind(rangeFor: RangeForFragment): void {
  tooltip = createTooltipController(document, overlay, {
    paintedEntries: () => painted,
    authorName: () => OWN_NAME,
    caretAt,
    rangeFor,
    viewport: () => VIEWPORT,
  });
}
