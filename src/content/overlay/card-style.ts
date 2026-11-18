/**
 * The stylesheet of the create card and the class names it is written against,
 * in one module, so the markup and the rules cannot drift apart.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Overlay
 * host" (isolated styles) and AC11 (a host page with a global CSS reset still
 * renders the card correctly).
 *
 * Why every inherited property is spelled out: the single host element carries
 * `all: initial` (`src/content/overlay/host-style.ts`), so the shadow tree starts
 * from the user-agent initials, and a page cannot reach it with its own selectors.
 * That cuts both ways — the card inherits nothing useful from the page either — so
 * `font-family`, `font-size`, `line-height`, `color` and `box-sizing` are declared
 * here rather than trusted. `pointer-events: auto` undoes the host's
 * `pointer-events: none`, without which the card would be untypeable.
 *
 * The same reason reaches the glyph of an icon-only action button (ruling `A114`,
 * task `t7-01`): an inline `<svg>` inherits its size and its paint from nothing under
 * `all: initial`, so its `width`, `height`, `fill` and `stroke` are declared here as
 * well as written as attributes on the element, and the button's own hit box is
 * declared because the control no longer has a label to grow it.
 *
 * The style element is inserted into the shadow root and never into the page
 * (`docs/specs/content-overlay-ui.md` -> AC1 of task `t3-01`), so a page has no
 * element of the extension to restyle and the extension adds no style element to
 * the page.
 */

/** Attribute marking the one style element this module owns. */
export const CARD_STYLE_ATTRIBUTE = 'data-inlinenotes-card-style';

/**
 * Class every wrapper of the card widget carries, and the scope the stylesheet below
 * is written against. The spec's Terms table calls the editor "the same widget used
 * for create and for edit", so one stylesheet styles both wrappers and the two
 * cannot drift apart; each wrapper adds its own class below for identity, so a
 * controller can find its own element and a test can count one widget at a time.
 */
export const WIDGET_ROOT_CLASS = 'inlinenotes-widget-root';
/** Class of the positioned wrapper the create card is rendered into. */
export const CARD_ROOT_CLASS = 'inlinenotes-card-root';
/** Class of the positioned wrapper the editor of an existing entry is rendered into. */
export const EDITOR_ROOT_CLASS = 'inlinenotes-editor-root';
export const CARD_CLASS = 'card';
export const CARD_INPUT_CLASS = 'comment';
export const CARD_COUNTER_CLASS = 'counter';
export const CARD_ACTIONS_CLASS = 'actions';
/**
 * Class of the inline `<svg>` glyph of an icon-only action button (ruling `A114`,
 * task `t7-01`). The class exists so the stylesheet below can size and paint the
 * glyph by rule: under the host's `all: initial` an SVG this stylesheet says nothing
 * about is a box with no size holding a path with no paint.
 */
export const CARD_ICON_CLASS = 'icon';
export const CARD_REFUSAL_CLASS = 'refusal';
export const CARD_PRIMARY_CLASS = 'is-primary';
export const CARD_WARNING_CLASS = 'is-warning';
/**
 * Class of the delete button of the editor. It is the one control of this widget
 * that is not a
 * neutral action, so it is the one button with its own colour: the reader has to see
 * that the press removes the entry and its `highlight` (ruling `A44` says there is no
 * confirmation step in v1, so the button itself carries the warning).
 */
export const CARD_DELETE_CLASS = 'is-delete';

/**
 * The hit box of one icon-only action button, in CSS pixels (ruling `A114`, task
 * `t7-01` AC5). The control carries no label of its own any more, so the declared box
 * is the only thing that keeps it pressable — and it is a named constant because a
 * test reads the stylesheet **text** for it, which is the only way to pin a box that
 * no string and no visible text depends on.
 */
export const ACTION_HIT_BOX_PX = 24;

/** The glyph drawn inside that box, smaller than the box on purpose (`A114`). */
export const ACTION_ICON_PX = 16;

/** The card stylesheet, inserted once per shadow root. */
export const CARD_CSS: string = [
  `.${WIDGET_ROOT_CLASS} {`,
  '  position: fixed;',
  '  box-sizing: border-box;',
  '  z-index: 1;',
  '}',
  `.${WIDGET_ROOT_CLASS} * {`,
  '  box-sizing: border-box;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_CLASS} {`,
  '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;',
  '  font-size: 13px;',
  '  line-height: 1.45;',
  '  color: #14171a;',
  '  background: #ffffff;',
  '  border: 1px solid #b9bec4;',
  '  border-radius: 8px;',
  '  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);',
  '  padding: 10px 12px;',
  '  width: 300px;',
  '  max-width: 92vw;',
  '  pointer-events: auto;',
  '  text-align: start;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_INPUT_CLASS} {`,
  '  display: block;',
  '  width: 100%;',
  '  min-height: 68px;',
  '  resize: vertical;',
  '  font-family: inherit;',
  '  font-size: inherit;',
  '  line-height: inherit;',
  '  color: inherit;',
  '  background: #ffffff;',
  '  border: 1px solid #b9bec4;',
  '  border-radius: 6px;',
  '  padding: 6px 8px;',
  '  margin: 0;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_COUNTER_CLASS} {`,
  '  display: block;',
  '  margin-top: 6px;',
  '  color: #5b6470;',
  '  font-variant-numeric: tabular-nums;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_COUNTER_CLASS}.${CARD_WARNING_CLASS} {`,
  '  color: #8a4b08;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} {`,
  '  display: flex;',
  '  gap: 4px;',
  '  margin-top: 8px;',
  '}',
  // Icon-only action button (`A114`, task `t7-01` AC3-AC5): the control holds no text
  // node, so its box is declared instead of grown by a label. `min-width` /
  // `min-height` are the hit box AC5 names, `padding: 0` is the tighter row the same
  // criterion asks for, and the three flex properties center a glyph in a box the
  // host's `all: initial` left sizeless.
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} button {`,
  '  font-family: inherit;',
  '  font-size: inherit;',
  '  line-height: inherit;',
  '  color: #14171a;',
  '  background: #f3f4f6;',
  '  border: 1px solid #b9bec4;',
  '  border-radius: 6px;',
  '  padding: 0;',
  '  margin: 0;',
  '  cursor: pointer;',
  '  display: inline-flex;',
  '  align-items: center;',
  '  justify-content: center;',
  `  width: ${String(ACTION_HIT_BOX_PX)}px;`,
  `  height: ${String(ACTION_HIT_BOX_PX)}px;`,
  `  min-width: ${String(ACTION_HIT_BOX_PX)}px;`,
  `  min-height: ${String(ACTION_HIT_BOX_PX)}px;`,
  '}',
  // The glyph (`A114`). Every property that decides its size or its paint is stated,
  // because `all: initial` leaves nothing to inherit, and `currentColor` is what makes
  // the primary, delete and disabled colors of the three rules below the color of the
  // drawing as well, instead of a second declaration per state.
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} .${CARD_ICON_CLASS} {`,
  '  display: block;',
  `  width: ${String(ACTION_ICON_PX)}px;`,
  `  height: ${String(ACTION_ICON_PX)}px;`,
  '  fill: none;',
  '  stroke: currentColor;',
  '  stroke-width: 2;',
  '  stroke-linecap: round;',
  '  stroke-linejoin: round;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} button.${CARD_PRIMARY_CLASS} {`,
  '  color: #ffffff;',
  '  background: #1f6feb;',
  '  border-color: #1f6feb;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} button.${CARD_DELETE_CLASS} {`,
  '  color: #a4262c;',
  '  border-color: #d08085;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} button:disabled {`,
  '  color: #6b7280;',
  '  background: #e9ecef;',
  '  border-color: #c8cdd2;',
  '  cursor: default;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_REFUSAL_CLASS} {`,
  '  margin: 8px 0 0;',
  '  color: #a4262c;',
  '}',
].join('\n');

/**
 * Inserts the card stylesheet into `root` once. The style element lives inside the
 * shadow root and never in the page, so the page gains no element to restyle and
 * the extension gains no reach into the page (task `t3-01` AC1).
 */
export function ensureCardStyle(doc: Document, root: ShadowRoot): void {
  if (root.querySelector(`style[${CARD_STYLE_ATTRIBUTE}]`) !== null) {
    return;
  }
  const style = doc.createElement('style');
  style.setAttribute(CARD_STYLE_ATTRIBUTE, '');
  style.textContent = CARD_CSS;
  root.append(style);
}
