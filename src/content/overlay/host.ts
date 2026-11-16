/**
 * The single shadow host every content widget is mounted into.
 *
 * Painting never mutates the host page (`docs/specs/content-overlay-ui.md` ->
 * Rules / Semantics -> Overlay host): the page receives exactly one element, an
 * isolated shadow root, and nothing else. Frame scope is the top frame only.
 *
 * The host is created hidden, so before `t3-01` nothing of the extension is
 * painted on the page. Revealing it is one call: set `hidden = false` and refresh
 * the inline style with `hostInlineStyle(false)`.
 */
import { hostInlineStyle } from './host-style';

/** Id of the one element this extension adds to the page. */
export const OVERLAY_HOST_ID = 'inlinenotes-overlay-host';

export interface OverlayHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
}

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
  // Placeholder slice `t1-01`: the widget is mounted but never painted, because
  // the inline style declares `display: none` after `all: initial` and the
  // element carries the `hidden` attribute.
  host.hidden = true;
  host.setAttribute('style', hostInlineStyle(host.hidden));

  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);

  return { host, root };
}
