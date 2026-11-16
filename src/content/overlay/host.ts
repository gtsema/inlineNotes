/**
 * The single shadow host every content widget is mounted into.
 *
 * Painting never mutates the host page (`docs/specs/content-overlay-ui.md` ->
 * Rules / Semantics -> Overlay host): the page receives exactly one element, an
 * isolated shadow root, and nothing else. Frame scope is the top frame only.
 */

/** Id of the one element this extension adds to the page. */
export const OVERLAY_HOST_ID = 'inlinenotes-overlay-host';

/** Bounded but dominant stacking level from the overlay spec. */
export const OVERLAY_HOST_Z_INDEX = 2147483000;

export interface OverlayHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

const HOST_RESET = [
  'all: initial',
  'position: fixed',
  'top: 0',
  'left: 0',
  'width: 0',
  'height: 0',
  `z-index: ${String(OVERLAY_HOST_Z_INDEX)}`,
  'pointer-events: none',
].join(';');

/**
 * Returns the existing shadow host or creates it.
 * `null` when the script runs in a non-top frame.
 */
export function ensureOverlayHost(): OverlayHost | null {
  if (window.top !== window.self) {
    return null;
  }

  const existing = document.getElementById(OVERLAY_HOST_ID);
  if (existing instanceof HTMLElement && existing.shadowRoot !== null) {
    return { host: existing, root: existing.shadowRoot };
  }

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.setAttribute('style', HOST_RESET);
  // Placeholder slice `t1-01`: the widget is not shown to the user yet.
  host.hidden = true;

  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);

  return { host, root };
}
