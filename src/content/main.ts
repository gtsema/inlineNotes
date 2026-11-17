/**
 * MV3 content script entry point.
 *
 * Boots the page-side slices of Stage 3 that exist so far (`t3-01`, `t3-02`, `t3-03`):
 * the single shadow host, the selection capture, the create card, the load-time paint
 * pass, the hover tooltip and the editor of an existing entry. Not booted: the popup
 * (`t4-01`), SPA URL watching (`t4-03`).
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
 *
 * The three widget controllers are wired to each other by two hooks and nothing else,
 * and each hook is the spec's coexistence rule rather than a private arrangement:
 * `claimSelection` is Flow 6 (a selection inside an existing entry's range belongs to
 * the editor, never to a create card), and `isHostBusy` is ruling `A68` (no widget
 * turns off the overlay host another widget is using). The hooks close over bindings
 * declared below them, which is sound because every one of them is called from a page
 * event, after `boot()` has finished.
 */

import { createChromeLocalStoragePort } from './store/chrome-storage-port';
import { ensureOverlayHost } from './overlay/host';
import { attachCreateCardEvents } from './overlay/card-events';
import { createCreateCardController } from './overlay/create-card-controller';
import { createPagePainter } from './paint/page-painter';
import { createTooltipController } from './overlay/tooltip-controller';
import { attachTooltipEvents } from './overlay/tooltip-events';
import { createEditorController } from './overlay/editor-controller';
import { attachEditorEvents } from './overlay/editor-events';

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
  // empty pass when it is not. `refresh()` cannot reject (task `t3-05` AC2, ruling
  // `A75`; pinned by `tests/content-paint-throw-safety.spec.ts`, enumerated in the overlay
  // spec -> "Page-boundary throws"), so nothing here has a catch: a page whose store is
  // unreachable simply shows no highlights.
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
    // Flow 6 of the overlay spec, shipped by `t3-03`: a selection that lies inside an
    // existing entry's range belongs to that entry. The editor controller answers the
    // claim, opens its own widget when the reader wrote the note, and opens nothing
    // for somebody else's — and in every one of those states no create card is
    // mounted, because core would refuse it as an overlap and the reader would be
    // shown a note they are not allowed to write.
    claimSelection: (selection, authorName): boolean =>
      editor.openFor(selection, authorName),
  });

  attachCreateCardEvents(controller, document, window, overlay.host);

  // Flow 5 and 6 of the overlay spec, task `t3-03`: the editor of an existing entry.
  // It reads the entries the last paint pass resolved — the same node-local offsets the
  // highlights were registered with — so the question "whose text did the reader just
  // select?" can never disagree with what is on the screen, and it writes only through
  // the core edit and delete APIs (`editor/edit-entry.ts`).
  const editor = createEditorController(document, overlay, {
    port,
    pageUrl,
    clock: (): string => new Date().toISOString(),
    paintedEntries: painter.paintedEntries,
    // Ruling `A68` in the other direction: an editor that closes does not hide the
    // overlay host out from under an open create card.
    isHostBusy: controller.isOpen,
    // The editor takes the widget slot, so the tooltip of Flow 3-4 is dismissed by the
    // coordinator here rather than by the editor reaching into another widget's state.
    onOpened: (): void => {
      tooltip.hide();
    },
    // A saved comment changes what the entry looks like — the frame follows the record,
    // not the draft — and a removed entry loses its highlight and its tooltip at the
    // same moment (task `t3-03` AC4). Both handovers re-run the same paint pass, which
    // rebuilds the stream and re-resolves every anchor (`A29`).
    onSaved: (): void => {
      tooltip.hide();
      void painter.refresh();
    },
    onDeleted: (): void => {
      tooltip.hide();
      void painter.refresh();
    },
  });

  attachEditorEvents(editor, document, window, overlay.host);

  // Flow 3-4 of the overlay spec, task `t3-02` AC3/AC4: hovering painted text shows
  // the comment and the author of the entry, and a click on the tooltip makes it
  // opaque. The two reads it needs are the paint pass's own answers, so the tooltip
  // never decides anything about painting or about authorship by itself, and
  // `isHostBusy` is the `A68` coexistence rule: closing or opening the card does not
  // own the tooltip's host, and showing a tooltip does not own the card's.
  const tooltip = createTooltipController(document, overlay, {
    paintedEntries: painter.paintedEntries,
    authorName: painter.authorNameOfPass,
    isHostBusy: (): boolean => controller.isOpen() || editor.isOpen(),
  });

  attachTooltipEvents(tooltip, document, window, overlay.host);

  void painter.refresh();
}

boot();
