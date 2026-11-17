/**
 * MV3 content script entry point.
 *
 * Boots the page-side slice of Stage 3 (`t3-01`): the single shadow host, the
 * selection capture, and the create card. No CSS Highlight painting (`t3-02`), no
 * editor for an existing entry (`t3-03`), no SPA URL watching (`t4-03`).
 *
 * The entry point owns exactly two things:
 * - the frame decision — `ensureOverlayHost` answers `null` outside the top frame,
 *   so no listener is attached in an iframe at all (`content-overlay-ui.md` ->
 *   "Frame scope: top frame only");
 * - the environment the controller is given: the storage seam, the current URL read
 *   per attempt, one clock, one random source. Every rule lives in `src/core/`, and
 *   every page-side decision lives in the controller and its modules.
 */

import { createChromeLocalStoragePort } from './store/chrome-storage-port';
import { ensureOverlayHost } from './overlay/host';
import { attachCreateCardEvents } from './overlay/card-events';
import { createCreateCardController } from './overlay/create-card-controller';

function boot(): void {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    return;
  }

  const controller = createCreateCardController(document, overlay, {
    port: createChromeLocalStoragePort(),
    pageUrl: (): string => window.location.href,
    clock: (): string => new Date().toISOString(),
    rng: (): number => Math.random(),
  });

  attachCreateCardEvents(controller, document, window, overlay.host);
}

boot();
