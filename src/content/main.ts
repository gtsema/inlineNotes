/**
 * MV3 content script entry point (placeholder slice `t1-01`).
 *
 * Scope of this slice: the bundle exists, is registered in the manifest and boots
 * a Preact widget inside the single shadow host. No selection capture, no CSS
 * Highlight painting, no `chrome.storage` access yet (`t3-01`, `t3-02`, `t1-03`).
 */
import { ensureOverlayHost } from './overlay/host';
import { mountPlaceholderOverlay } from './overlay/placeholder';

function boot(): void {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    return;
  }
  mountPlaceholderOverlay(overlay);
}

boot();
