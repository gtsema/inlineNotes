/**
 * The stylesheet of the hover tooltip and the class names it is written against, in
 * one module, so the markup and the rules cannot drift apart (the pattern of
 * `card-style.ts`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Overlay
 * host" (isolated styles inside the one shadow root), "Tooltip default opacity:
 * semi-transparent (about 0.75); after click: 1.0", and "Own entries and foreign
 * entries are visually distinguished only in the tooltip header".
 *
 * The two opacity numbers live here rather than in the controller, because opacity is
 * a *look*: the controller decides only which class the widget carries (`is-pinned`),
 * and a second writer of the same property is how a semi-transparent card ends up
 * opaque for a reason nobody chose. The spec's "about 0.75" is pinned to the constant
 * by `tests/content-tooltip.spec.ts`, exactly like the settle delay of `A63`.
 *
 * `pointer-events: auto` is what makes the tooltip clickable at all: the host element
 * carries `pointer-events: none` (`host-style.ts`), so a widget that does not undo it
 * can be seen and never pressed. The tooltip stays non-modal: it has no backdrop, and
 * a page keeps receiving its own pointer events everywhere outside the card box.
 *
 * The style element lives inside the shadow root and never in the page, so painting a
 * tooltip adds no element to the host document (task `t3-02` AC2, ruling `A41`).
 */

/** Attribute marking the one style element this module owns. */
export const TOOLTIP_STYLE_ATTRIBUTE = 'data-inlinenotes-tooltip-style';

/** Class of the positioned wrapper the tooltip is rendered into. */
export const TOOLTIP_ROOT_CLASS = 'inlinenotes-tooltip-root';
export const TOOLTIP_CLASS = 'tooltip';
export const TOOLTIP_HEADER_CLASS = 'author';
export const TOOLTIP_COMMENT_CLASS = 'comment';
/** The state a click adds: fully opaque (`content-overlay-ui.md` Flow 4). */
export const TOOLTIP_PINNED_CLASS = 'is-pinned';
/** The header state of an entry the current reader did not write. */
export const TOOLTIP_FOREIGN_CLASS = 'is-foreign';

/** Opacity of a hovered tooltip (spec: "semi-transparent (about 0.75)"). */
export const TOOLTIP_OPACITY = 0.75;

/** Opacity after a click on the tooltip (spec: "after click: 1.0"). */
export const TOOLTIP_PINNED_OPACITY = 1;

/** The tooltip stylesheet, inserted once per shadow root. */
export const TOOLTIP_CSS: string = [
  `.${TOOLTIP_ROOT_CLASS} {`,
  '  position: fixed;',
  '  box-sizing: border-box;',
  '  z-index: 1;',
  '}',
  `.${TOOLTIP_ROOT_CLASS} .${TOOLTIP_CLASS} {`,
  '  box-sizing: border-box;',
  '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;',
  '  font-size: 13px;',
  '  line-height: 1.45;',
  '  color: #14171a;',
  '  background: #ffffff;',
  '  border: 1px solid #b9bec4;',
  '  border-radius: 8px;',
  '  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);',
  '  padding: 8px 10px;',
  '  width: 280px;',
  '  max-width: 92vw;',
  '  pointer-events: auto;',
  '  text-align: start;',
  `  opacity: ${String(TOOLTIP_OPACITY)};`,
  '}',
  `.${TOOLTIP_ROOT_CLASS} .${TOOLTIP_CLASS}.${TOOLTIP_PINNED_CLASS} {`,
  `  opacity: ${String(TOOLTIP_PINNED_OPACITY)};`,
  '}',
  `.${TOOLTIP_ROOT_CLASS} .${TOOLTIP_HEADER_CLASS} {`,
  '  display: block;',
  '  font-weight: 600;',
  '  margin-bottom: 4px;',
  '}',
  `.${TOOLTIP_ROOT_CLASS} .${TOOLTIP_HEADER_CLASS}.${TOOLTIP_FOREIGN_CLASS} {`,
  '  font-weight: 400;',
  '  font-style: italic;',
  '  color: #444c56;',
  '}',
  `.${TOOLTIP_ROOT_CLASS} .${TOOLTIP_COMMENT_CLASS} {`,
  '  margin: 0;',
  '  white-space: pre-wrap;',
  '  overflow-wrap: anywhere;',
  '}',
].join('\n');

/**
 * Inserts the tooltip stylesheet into `root` once, beside the card stylesheet that
 * `ensureCardStyle` owns. Both live in the same shadow root, and the page still has
 * no style element of the extension in it.
 */
export function ensureTooltipStyle(doc: Document, root: ShadowRoot): void {
  if (root.querySelector(`style[${TOOLTIP_STYLE_ATTRIBUTE}]`) !== null) {
    return;
  }
  const style = doc.createElement('style');
  style.setAttribute(TOOLTIP_STYLE_ATTRIBUTE, '');
  style.textContent = TOOLTIP_CSS;
  root.append(style);
}
