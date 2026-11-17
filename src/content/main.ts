/**
 * MV3 content script entry point.
 *
 * Boots the page-side slices of Stage 3 that exist so far (`t3-01`, `t3-02`): the
 * single shadow host, the selection capture, the create card, the load-time paint
 * pass and the hover tooltip. No editor for an existing entry (`t3-03`), no SPA URL
 * watching (`t4-03`).
 *
 * The entry point owns exactly two things:
 * - the frame decision — `ensureOverlayHost` answers `null` outside the top frame,
 *   so no listener is attached in an iframe at all (`content-overlay-ui.md` ->
 *   "Frame scope: top frame only");
 * - the environment the page-side modules are given: the storage seam, the current URL
 *   read per use, one clock, one random source. Every rule lives in `src/core/`, and
 *   every page-side decision lives in the controller, the card, the paint pass and the
 *   tooltip.
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
import { createTooltipController } from './overlay/tooltip-controller';
import { attachTooltipEvents } from './overlay/tooltip-events';

function boot(): void {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    return;
  }

  const port = createChromeLocalStoragePort();
  const pageUrl = (): string => window.location.href;

  // Flow / Sequence 6 of `inline-comment-model.md`: the entries of this page are read,
  // resolved and painted once at load. `document_idle` in `src/manifest.json` is what
  // makes `document.body` a real subtree here, and `createPagePainter` answers with an
  // empty pass when it is not. `refresh()` is documented never to throw, so nothing
  // here has to catch: a page whose store is unreachable simply shows no highlights.
  const painter = createPagePainter(document, { port, url: pageUrl });

  const controller = createCreateCardController(document, overlay, {
    port,
    pageUrl,
    clock: (): string => new Date().toISOString(),
    rng: (): number => Math.random(),
    // Flow 2 of the overlay spec: a saved note gets its highlight and its frame at the
    // moment it is saved, not at the next reload. That is the same paint pass, run
    // again; the pass rebuilds the stream and re-resolves every anchor (`A29`), so a
    // save never paints a position remembered from before the write.
    onCreated: (): void => {
      void painter.refresh();
    },
  });

  attachCreateCardEvents(controller, document, window, overlay.host);

  // Flow 3-4 of the overlay spec, task `t3-02` AC3/AC4: hovering painted text shows
  // the comment and the author of the entry, and a click on the tooltip makes it
  // opaque. The two reads it needs are the paint pass's own answers, so the tooltip
  // never decides anything about painting or about authorship by itself, and
  // `isHostBusy` is the `A68` coexistence rule: closing or opening the card does not
  // own the tooltip's host, and showing a tooltip does not own the card's.
  const tooltip = createTooltipController(document, overlay, {
    paintedEntries: painter.paintedEntries,
    authorName: painter.authorNameOfPass,
    isHostBusy: controller.isOpen,
  });

  attachTooltipEvents(tooltip, document, window, overlay.host);

  void painter.refresh();
}

boot();
