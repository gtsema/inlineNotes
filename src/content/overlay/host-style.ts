/**
 * Inline style of the single overlay host element.
 *
 * The style is inline so that a host page cannot restyle the host, and it is
 * built here (a DOM-free module) so the hidden state of the host is unit-testable
 * without a browser. Owner of the visible contract:
 * `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Overlay host".
 *
 * `all: initial` resets every property, including `display`, which defeats the
 * user-agent `[hidden] { display: none }` rule; therefore the `display`
 * declaration always follows it and follows the `hidden` state of the element.
 * While `hidden` is `true` nothing the extension renders can be painted.
 */

/** Bounded but dominant stacking level from the overlay spec. */
export const OVERLAY_HOST_Z_INDEX = 2147483000;

/**
 * Inline style of the host element. `hidden: true` must produce
 * `display: none`; `hidden: false` produces the painted box of `t3-01`.
 */
export function hostInlineStyle(hidden: boolean): string {
  return [
    'all: initial',
    hidden ? 'display: none' : 'display: block',
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 0',
    'height: 0',
    'margin: 0',
    'border: 0',
    'padding: 0',
    'background: transparent',
    `z-index: ${String(OVERLAY_HOST_Z_INDEX)}`,
    'pointer-events: none',
  ].join(';');
}
