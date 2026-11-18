/**
 * The two glyphs of the `action row` (ruling `A114`, task `t7-01`): a check mark for
 * save and a trash can for delete, drawn as inline `<svg>` so an icon-only button has
 * a child that is an element and never a text node.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Compact
 * `action row`" and AC27.
 *
 * Why the attributes repeat what `card-style.ts` declares as rules: the overlay host
 * carries `all: initial` (`src/content/overlay/host-style.ts`), which resets every
 * inherited value, so an `<svg>` whose size and paint are not stated is a box with no
 * size holding a path with no paint. The size therefore comes from
 * `ACTION_ICON_PX`, the same constant the stylesheet interpolates, so the attribute
 * and the rule cannot drift apart, and the paint is `currentColor` so the primary,
 * delete and disabled colors of the stylesheet color the drawing without a second
 * declaration per state.
 *
 * What this module does **not** own: the accessible name. The Russian string of the
 * control lives in `src/content/text.ts` and is carried by the `aria-label` and
 * `title` of the `button` in `create-card.tsx` / `editor.tsx`; the glyph itself is
 * `aria-hidden`, so a screen reader hears one name per control and not a name plus an
 * unlabeled graphic.
 */

import { ACTION_ICON_PX, CARD_ICON_CLASS } from './card-style';

/** The coordinate space both glyphs are drawn in; the glyph scales into `ACTION_ICON_PX`. */
const ICON_VIEW_BOX = '0 0 24 24';

/**
 * Every attribute both glyphs share. `as const` keeps the literals that the SVG and
 * ARIA attribute types ask for (`aria-hidden` is a `Booleanish`, not a `string`).
 */
const GLYPH_ATTRIBUTES = {
  class: CARD_ICON_CLASS,
  width: String(ACTION_ICON_PX),
  height: String(ACTION_ICON_PX),
  viewBox: ICON_VIEW_BOX,
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
} as const;

/** The glyph of the save button of both widgets: a check mark (`A114`). */
export function SaveActionIcon() {
  return (
    <svg {...GLYPH_ATTRIBUTES}>
      <path d="M5 12.5 L10 17.5 L19 6.5" />
    </svg>
  );
}

/** The glyph of the editor's delete button: a trash can (`A114`). */
export function DeleteActionIcon() {
  return (
    <svg {...GLYPH_ATTRIBUTES}>
      <path d="M4.5 7 L19.5 7" />
      <path d="M9.5 7 L9.5 4.5 L14.5 4.5 L14.5 7" />
      <path d="M6.5 7 L7.5 19.5 L16.5 19.5 L17.5 7" />
      <path d="M10 10.5 L10 16.5" />
      <path d="M14 10.5 L14 16.5" />
    </svg>
  );
}
