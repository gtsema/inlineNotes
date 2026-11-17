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
  '  gap: 8px;',
  '  margin-top: 8px;',
  '}',
  `.${WIDGET_ROOT_CLASS} .${CARD_ACTIONS_CLASS} button {`,
  '  font-family: inherit;',
  '  font-size: inherit;',
  '  line-height: inherit;',
  '  color: #14171a;',
  '  background: #f3f4f6;',
  '  border: 1px solid #b9bec4;',
  '  border-radius: 6px;',
  '  padding: 6px 10px;',
  '  margin: 0;',
  '  cursor: pointer;',
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
