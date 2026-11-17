/**
 * MV3 content script entry point.
 *
 * Boots the page-side slices of Stage 3 that exist so far (`t3-01`, `t3-02`): the
 * single shadow host, the selection capture, the create card, and the load-time paint
 * pass. No editor for an existing entry (`t3-03`), no SPA URL watching (`t4-03`).
 *
 * The entry point owns exactly two things:
 * - the frame decision — `ensureOverlayHost` answers `null` outside the top frame,
 *   so no listener is attached in an iframe at all (`content-overlay-ui.md` ->
 *   "Frame scope: top frame only");
 * - the environment the page-side modules are given: the storage seam, the current URL
 *   read per use, one clock, one random source. Every rule lives in `src/core/`, and
 *   every page-side decision lives in the controller, the card and the paint pass.
 *
 * The paint pass needs no host: painting is `CSS.highlights` plus one adopted
 * stylesheet, so the page gains no element from it (ruling `A41`, task `t3-02` AC2).
 * It still boots behind the frame decision, because a note is painted once per
 * document, in the top frame only.
 */

import { createChromeLocalStoragePort } from './store/chrome-storage-port';
import { ensureOverlayHost } from './overlay/host';
import { attachCreateCardEvents } from './overlay/card-events';
import { createCreateCardController } from './overlay/create-card-controller';
import { createPagePainter } from './paint/page-painter';

function boot(): void {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    return;
  }

  const port = createChromeLocalStoragePort();
  const pageUrl = (): string => window.location.href;

  const controller = createCreateCardController(document, overlay, {
    port,
    pageUrl,
    clock: (): string => new Date().toISOString(),
    rng: (): number => Math.random(),
  });

  attachCreateCardEvents(controller, document, window, overlay.host);

  // Flow / Sequence 6 of `inline-comment-model.md`: the entries of this page are read,
  // resolved and painted once at load. `document_idle` in `src/manifest.json` is what
  // makes `document.body` a real subtree here, and `createPagePainter` answers with an
  // empty pass when it is not. `refresh()` is documented never to throw, so nothing
  // here has to catch: a page whose store is unreachable simply shows no highlights.
  const painter = createPagePainter(document, { port, url: pageUrl });
  void painter.refresh();
}

boot();
