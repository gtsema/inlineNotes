/**
 * The single shadow host every content widget is mounted into.
 *
 * Painting never mutates the host page (`docs/specs/content-overlay-ui.md` ->
 * Rules / Semantics -> Overlay host): the page receives exactly one element, an
 * isolated shadow root, and nothing else. Frame scope is the top frame only.
 *
 * The host is created hidden, and `setOverlayHostHidden` is the only way a widget
 * reveals it: the inline style carries the `display` rule that `all: initial`
 * would otherwise defeat, so the hidden state of the element and the painted state
 * can never disagree (task `t1-02` AC6). The owner of "which widget is open" is the
 * widget controller (`create-card-controller.tsx` for the create card), not this
 * module.
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
  // Created hidden: the inline style declares `display: none` after `all: initial`
  // and the element carries the `hidden` attribute, so a widget that has not asked
  // for the host paints nothing.
  host.hidden = true;
  host.setAttribute('style', hostInlineStyle(host.hidden));

  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);

  return { host, root };
}

/**
 * Shows or hides the one host element, keeping the `hidden` attribute and the
 * inline `display` rule in step (`hostInlineStyle` is the only writer of that
 * rule). Hiding the host is how a closed card stops painting without removing the
 * element or the shadow tree the next widget reuses.
 */
export function setOverlayHostHidden(overlay: OverlayHost, hidden: boolean): void {
  overlay.host.hidden = hidden;
  overlay.host.setAttribute('style', hostInlineStyle(hidden));
}
