/**
 * Card placement in viewport coordinates (PM ruling `A30`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card placement". The card is a `position: fixed` box inside the shadow root, so
 * its coordinates are viewport coordinates and it never scrolls with the page —
 * which is what makes the close-on-scroll rule of ruling `A32` the honest answer
 * to "where is the card when the page moved".
 *
 * The rule in one line: below the first fragment of the selection that has a box,
 * above it when there is no room, and always inside the viewport with a gutter, so a
 * selection at the very top or bottom of the window still gets a reachable card. A
 * span with no box at all is placed by the same rule against the viewport
 * (ruling `A65`).
 *
 * Pure arithmetic over two boxes and the viewport: no DOM, no global, so the
 * placement of every case below is unit-testable with numbers.
 */

import type { Box } from '../capture/fragment-rect';

/** Distance kept between the card and the viewport edge (ruling `A30`). */
export const CARD_VIEWPORT_GUTTER_PX = 8;

/** Distance kept between the card and the selected text (ruling `A30`). */
export const CARD_ANCHOR_GUTTER_PX = 8;

/** Where the card ended up relative to the selection. */
export type CardPlacement = 'below' | 'above';

/** The fixed-box position of the card, in viewport CSS pixels. */
export interface CardPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: CardPlacement;
}

/** The viewport size the clamp works against. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Places the card next to `anchorBox`.
 *
 * A card taller than the viewport is pinned to the top gutter rather than centered
 * off-screen: the input has to stay reachable, and the user closes the card on
 * scroll anyway (`A32`).
 */
export function placeCard(
  anchorBox: Box,
  cardBox: Box,
  viewport: Viewport,
  anchorGutter: number = CARD_ANCHOR_GUTTER_PX,
  viewportGutter: number = CARD_VIEWPORT_GUTTER_PX,
): CardPosition {
  const belowTop = anchorBox.top + anchorBox.height + anchorGutter;
  const aboveTop = anchorBox.top - anchorGutter - cardBox.height;
  const fitsBelow = belowTop + cardBox.height <= viewport.height - viewportGutter;
  const placement: CardPlacement = fitsBelow ? 'below' : 'above';
  const preferredTop = fitsBelow ? belowTop : aboveTop;

  return {
    left: clampAxis(anchorBox.left, cardBox.width, viewport.width, viewportGutter),
    top: clampAxis(preferredTop, cardBox.height, viewport.height, viewportGutter),
    placement,
  };
}

/**
 * Places the card with no selection box to place it against (ruling `A65`).
 *
 * A span whose every fragment measures zero area has no anchor point, and leaving
 * the card where the shadow host happens to start is not the rule: that corner is
 * `(0, 0)`, inside the `card gutter`, and it is where a hidden paragraph would put
 * the widget. The answer is the same placement rule with the viewport itself as the
 * anchor box, so the card is clamped into the gutter exactly like any other case:
 * no room below a viewport-tall anchor, so it is pinned to the top gutter, and its
 * left edge starts at the gutter.
 *
 * One rule, one clamp: this is `placeCard` with a viewport-sized anchor, not a second
 * placement model, so the two cases can never disagree about the gutter.
 */
export function placeCardInViewport(
  cardBox: Box,
  viewport: Viewport,
  anchorGutter: number = CARD_ANCHOR_GUTTER_PX,
  viewportGutter: number = CARD_VIEWPORT_GUTTER_PX,
): CardPosition {
  return placeCard(
    { left: 0, top: 0, width: viewport.width, height: viewport.height },
    cardBox,
    viewport,
    anchorGutter,
    viewportGutter,
  );
}

/** One axis of the clamp: prefer the requested spot, never leave the gutter. */
function clampAxis(preferred: number, size: number, extent: number, gutter: number): number {
  const last = extent - gutter - size;
  if (last < gutter) {
    return gutter;
  }
  return Math.max(gutter, Math.min(preferred, last));
}
