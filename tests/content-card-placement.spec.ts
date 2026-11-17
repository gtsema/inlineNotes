/**
 * Card placement in viewport coordinates (PM ruling `A30`, task `t3-01` AC3).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card placement": the card is placed against the first fragment of the resolved
 * selection span that has a box, below it when there is room and above it otherwise,
 * and it is kept inside the viewport with a gutter. A span with no box at all uses
 * the same rule against the viewport (ruling `A65`).
 *
 * The card is a `position: fixed` box inside the shadow root, so every number here
 * is a viewport coordinate and the card does not scroll with the page — which is
 * exactly why ruling `A32` answers "what happens when the page scrolls" with "the
 * card closes" instead of a follow-the-text animation.
 *
 * Plain node environment: the module is arithmetic over two boxes, and the box of
 * the selection arrives from `src/content/capture/fragment-rect.ts`, which owns the
 * only DOM read in that path.
 */

import { describe, expect, it } from 'vitest';
import {
  CARD_ANCHOR_GUTTER_PX,
  CARD_VIEWPORT_GUTTER_PX,
  placeCard,
  placeCardInViewport,
} from '../src/content/overlay/card-placement';

const SELECTION = { left: 100, top: 100, width: 200, height: 18 };
const CARD = { left: 0, top: 0, width: 300, height: 120 };
const DESKTOP = { width: 1280, height: 800 };

describe('room below the selection', () => {
  it('places the card under the first fragment, aligned to its left edge', () => {
    const position = placeCard(SELECTION, CARD, DESKTOP);
    expect(position.placement).toBe('below');
    expect(position.top).toBe(SELECTION.top + SELECTION.height + CARD_ANCHOR_GUTTER_PX);
    expect(position.left).toBe(SELECTION.left);
  });

  it('keeps the card inside the viewport at the bottom edge', () => {
    const position = placeCard(SELECTION, CARD, DESKTOP);
    expect(position.top + CARD.height).toBeLessThanOrEqual(
      DESKTOP.height - CARD_VIEWPORT_GUTTER_PX,
    );
  });
});

describe('no room below the selection', () => {
  it('flips the card above the selection', () => {
    const nearBottom = { ...SELECTION, top: 700 };
    const position = placeCard(nearBottom, CARD, DESKTOP);
    expect(position.placement).toBe('above');
    expect(position.top).toBe(nearBottom.top - CARD_ANCHOR_GUTTER_PX - CARD.height);
    expect(position.top).toBeGreaterThanOrEqual(CARD_VIEWPORT_GUTTER_PX);
  });

  it('pulls a card that fits neither below nor back into the viewport', () => {
    // A selection in the middle of a short window: below overflows, above is off
    // the top. The card is pinned to the top gutter rather than centered off-screen,
    // because the input has to stay reachable.
    const position = placeCard({ ...SELECTION, top: 100 }, CARD, { width: 1280, height: 200 });
    expect(position.placement).toBe('above');
    expect(position.top).toBe(CARD_VIEWPORT_GUTTER_PX);
  });

  it('keeps a card taller than the viewport reachable', () => {
    const position = placeCard(SELECTION, { ...CARD, height: 1000 }, DESKTOP);
    expect(position.top).toBe(CARD_VIEWPORT_GUTTER_PX);
  });
});

describe('a selection near the horizontal edges', () => {
  it('pulls the card back from the right edge', () => {
    const position = placeCard({ ...SELECTION, left: 1200 }, CARD, DESKTOP);
    expect(position.left).toBe(DESKTOP.width - CARD_VIEWPORT_GUTTER_PX - CARD.width);
  });

  it('pulls the card back from the left edge', () => {
    const position = placeCard({ ...SELECTION, left: -40 }, CARD, DESKTOP);
    expect(position.left).toBe(CARD_VIEWPORT_GUTTER_PX);
  });

  it('falls back to the gutter when the card is wider than the viewport', () => {
    const position = placeCard(SELECTION, { ...CARD, width: 1400 }, DESKTOP);
    expect(position.left).toBe(CARD_VIEWPORT_GUTTER_PX);
  });
});

describe('the gutters ruling A30 names', () => {
  it('keeps both distances at eight CSS pixels', () => {
    expect(CARD_VIEWPORT_GUTTER_PX).toBe(8);
    expect(CARD_ANCHOR_GUTTER_PX).toBe(8);
  });

  it('honours a caller-supplied distance without changing the rule', () => {
    const position = placeCard(SELECTION, CARD, DESKTOP, 20, 4);
    expect(position.top).toBe(SELECTION.top + SELECTION.height + 20);
  });
});

describe('no fragment of the span has a box (ruling A65)', () => {
  /**
   * A span whose every fragment measures zero area has no anchor point — the
   * fragments are in the stream because ruling `A1` keeps hidden text in it, and a
   * zero box has no place next to it. The card is then placed by the viewport rule,
   * which is `placeCard` with the viewport itself as the anchor box: the same
   * clamp, the same gutter, no second model. Leaving the card where the shadow host
   * starts would put it at `(0, 0)`, inside the gutter and over the page's own text.
   */
  it('places the card at the viewport gutter instead of the host corner', () => {
    const position = placeCardInViewport(CARD, DESKTOP);
    expect(position.left).toBe(CARD_VIEWPORT_GUTTER_PX);
    expect(position.top).toBe(CARD_VIEWPORT_GUTTER_PX);
    expect(position.placement).toBe('above');
  });

  it('keeps the whole card inside the viewport', () => {
    const position = placeCardInViewport(CARD, DESKTOP);
    expect(position.left + CARD.width).toBeLessThanOrEqual(
      DESKTOP.width - CARD_VIEWPORT_GUTTER_PX,
    );
    expect(position.top + CARD.height).toBeLessThanOrEqual(
      DESKTOP.height - CARD_VIEWPORT_GUTTER_PX,
    );
  });

  it('keeps a card taller than the viewport reachable', () => {
    const position = placeCardInViewport({ ...CARD, height: 1000 }, DESKTOP);
    expect(position.top).toBe(CARD_VIEWPORT_GUTTER_PX);
  });

  it('pulls a card wider than the viewport back to the gutter', () => {
    const position = placeCardInViewport({ ...CARD, width: 1400 }, DESKTOP);
    expect(position.left).toBe(CARD_VIEWPORT_GUTTER_PX);
  });

  it('obeys the same gutter as a placement that has an anchor box', () => {
    // The two cases must not disagree about the distance they keep: the only
    // difference is the anchor box, not the clamp.
    const anchored = placeCard(SELECTION, CARD, DESKTOP);
    const unanchored = placeCardInViewport(CARD, DESKTOP);
    expect(anchored.top).toBeGreaterThanOrEqual(CARD_VIEWPORT_GUTTER_PX);
    expect(unanchored.top).toBe(CARD_VIEWPORT_GUTTER_PX);
    expect(unanchored.left).toBe(CARD_VIEWPORT_GUTTER_PX);
  });
});
