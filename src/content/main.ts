/**
 * MV3 content script entry point.
 *
 * Boots the page-side slices of Stage 3 that exist so far (`t3-01`, `t3-02`, `t3-03`):
 * the single shadow host, the selection capture, the create card, the load-time paint
 * pass, the hover tooltip, the editor of an existing entry, the same-document URL
 * watch and the storage-change watch of `t4-03`. Not booted: the popup and the options
 * page, which are their own documents.
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
 * `onEntryClick` is Flow 4 (the click on a `tooltip` asks the editor of that entry to
 * open, over the range the paint pass produced — rulings `A96` and `A104`), and
 * `isHostBusy` is ruling `A68` (no widget turns off the overlay host another widget is
 * using). The create card consults the paint pass for one question only — the
 * `contained own selection` silence of ruling `A103` — and no controller asks another
 * one about a selection. The hooks close over bindings declared below them, which is
 * sound because every one of them is called from a page event, after `boot()` has
 * finished.
 */

import {
  createChromeLocalStorageChangeSource,
  createChromeLocalStoragePort,
} from './store/chrome-storage-port';
import { ensureOverlayHost } from './overlay/host';
import { attachCreateCardEvents } from './overlay/card-events';
import { createCreateCardController } from './overlay/create-card-controller';
import { createPagePainter } from './paint/page-painter';
import { createTooltipController } from './overlay/tooltip-controller';
import { attachTooltipEvents } from './overlay/tooltip-events';
import { createEditorController } from './overlay/editor-controller';
import { attachEditorEvents } from './overlay/editor-events';
import { attachUrlChangeWatch } from './refresh/url-change-watch';
import { attachStorageChangeWatch } from './refresh/storage-change-watch';

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
    // The `contained own selection` silence of ruling `A103` (task `t5-03` AC4): the
    // card consults the output of the last paint pass, so the answer cannot disagree
    // with the highlight on the screen, and it resolves no anchor a second time. A
    // selection wholly inside one of the reader's own painted entries opens nothing; a
    // selection inside a foreign entry opens the card, because creating there is legal
    // since ruling `A93`.
    paintedEntries: painter.paintedEntries,
  });

  attachCreateCardEvents(controller, document, window, overlay.host);

  // Flow 4 and 5 of the overlay spec, task `t3-03` and the opening half of `t5-03`: the
  // editor of an existing entry. Ruling `A104` gives it its range: the entry it opens is
  // the `PaintedEntry` the last paint pass produced, so the editor never resolves an
  // anchor of its own, never asks the page for a span, and never moves a stored range;
  // it writes only through the core edit and delete APIs (`editor/edit-entry.ts`).
  const editor = createEditorController(document, overlay, {
    port,
    pageUrl,
    clock: (): string => new Date().toISOString(),
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

  // Flow 3-4 of the overlay spec, task `t3-02` AC3/AC4 and task `t5-03` AC1-AC3,
  // AC7-AC9: hovering painted text shows the comment and the author of the entry, opaque
  // from the first hover, and a click on that tooltip opens the editor of the entry it
  // describes. The two reads it needs are the paint pass's own answers, so the tooltip
  // never decides anything about painting or about authorship by itself, and
  // `isHostBusy` is the `A68` coexistence rule: closing or opening the card does not
  // own the tooltip's host, and showing a tooltip does not own the card's.
  const tooltip = createTooltipController(document, overlay, {
    paintedEntries: painter.paintedEntries,
    authorName: painter.authorNameOfPass,
    isHostBusy: (): boolean => controller.isOpen() || editor.isOpen(),
    // Flow 4 (ruling `A96`). The entry handed over is the `PaintedEntry` of the pass,
    // which is the range ruling `A104` opens the editor over — no selection is asked
    // for, and nothing is re-resolved. The name is the one that pass read, the same one
    // the `ownership header` compared, so the author answer of the click and the one
    // the reader saw in the header cannot drift apart (`A31`, `A25`).
    onEntryClick: (entry): void => {
      const authorName = painter.authorNameOfPass();
      if (authorName === null) {
        // No usable name: every entry of the page is foreign to the reader, so the
        // click opens nothing and the tooltip stays (`A25`).
        return;
      }
      editor.openFromPaintedEntry(entry, authorName);
    },
  });

  attachTooltipEvents(tooltip, document, window, overlay.host);

  // Task `t4-03` AC1 and AC2/AC3: the page keeps telling the truth about itself after
  // it changed under the notes. Both watches do one thing only — ask the same paint
  // pass to run again — so neither can disagree with what is on the screen: the pass
  // rebuilds the `page text stream`, re-resolves every anchor against it (`A29`) and
  // tears down the `paint name`s of the page that is no longer shown (`A39`). No entry
  // record is written by either path, so a note whose text the site deleted is
  // unpainted and still stored, listed and deletable (`A24`, `A36`).
  //
  // `A59` is the polling default applied here: a content script cannot see the page
  // calling `history.pushState`, so the address is compared on an interval as well as
  // on `popstate`, `hashchange` and `visibilitychange`. One tick is one string compare,
  // and `URL_POLL_MS` is the constant the overlay spec names.
  attachUrlChangeWatch(window, document, {
    url: pageUrl,
    onUrlChange: (): void => {
      void painter.refresh();
    },
  });

  // `A60`: a cross-tab write is a repaint, not a merge. The key decision is core's
  // (`storageChangeConcernsPage`), so a change to another page's slot or to the page
  // index is not work for this page, and `painter.pageKeyOfPass` keeps the answer
  // pointed at the page this document is showing after an SPA move. The settings key
  // is in that set for AC3: the author name the last pass read is what the `ownership
  // header` of a tooltip compares against, so a name change repaints the page instead
  // of leaving the old author on screen (`A31`, `A25`).
  attachStorageChangeWatch(createChromeLocalStorageChangeSource(), {
    pageKey: painter.pageKeyOfPass,
    onRepaint: (): void => {
      void painter.refresh();
    },
  });

  void painter.refresh();
}

boot();
