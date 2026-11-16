/**
 * Preact placeholder widget of the content layer.
 *
 * Proves that the content bundle carries Preact and no Angular. Selection
 * capture, the counter and the real card arrive in `t3-01`.
 */
import { render } from 'preact';

import { CONTENT_STRINGS } from '../text';
import type { OverlayHost } from './host';

const WIDGET_CSS = `
  .card {
    font: 12px/1.4 system-ui, sans-serif;
    color: #1f1f1f;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #d2d2d2;
    border-radius: 6px;
    padding: 6px 8px;
  }
`;

function PlaceholderCard() {
  return <div class="card">{CONTENT_STRINGS.placeholderCard}</div>;
}

/** Mounts the placeholder card into the shadow host. */
export function mountPlaceholderOverlay(overlay: OverlayHost): void {
  const style = document.createElement('style');
  style.textContent = WIDGET_CSS;

  const mountPoint = document.createElement('div');
  overlay.root.append(style, mountPoint);

  render(<PlaceholderCard />, mountPoint);
}
