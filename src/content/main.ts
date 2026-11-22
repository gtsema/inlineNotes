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
import { createForeignNotes } from './sync/foreign-notes';
import { attachSyncNotes } from './sync/sync-notes';
import { attachPageNotesChannel } from './sync/page-notes-channel';
import type { ForeignLoadOutcome } from './sync/foreign-notes';
import { loadIntoMemory } from './sync/foreign-notes';
import { createSyncTransport } from './sync/fetch-transport';
import {
  loadHiddenAuthorsOfPage,
  setForeignAuthorHidden,
} from '../core/foreign-hidden-store';
import { PAGE_NOTES_UPDATED_MESSAGE } from '../core/page-notes-query';

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

  // The sync server's notes are memory only (ruling `A163`): `foreign` is this
  // document's whole copy of them, and `attachSyncNotes` owns the one question "is this
  // page's list already here, and am I allowed to ask?" (`A166` first, then one request
  // per page key). Nothing is fetched until the first pass has resolved the page key.
  //
  // It is declared **before** the editor, because `t17-06` gave the editor's own delete
  // two questions of this module (`A182`): where that one note's delete would go, and
  // which page key it is filed under. Both are answered by the same wiring the load uses,
  // so a delete and a load can never disagree about what "synchronization is on" means.
  const foreign = createForeignNotes();
  const transport = createSyncTransport();
  const sync = attachSyncNotes({
    painter,
    foreign,
    port,
    transport,
  });

  // Flow 4 and 5 of the overlay spec, task `t3-03` and the opening half of `t5-03`: the
  // editor of an existing entry. Ruling `A104` gives it its range: the entry it opens is
  // the `PaintedEntry` the last paint pass produced, so the editor never resolves an
  // anchor of its own, never asks the page for a span, and never moves a stored range;
  // it writes only through the core edit and delete APIs (`editor/edit-entry.ts`).
  //
  // The delete button reaches the server since `t17-06` (`A182`): `syncTarget` is the
  // settings question asked **at the press**, `transport` is the page's one `fetch`, and
  // `foreignNotes` is the memory a foreign delete (never reachable here, `A25`) would
  // have to forget. The order is the ruling's — local first, then the one-note route.
  const editor = createEditorController(document, overlay, {
    port,
    pageUrl,
    clock: (): string => new Date().toISOString(),
    transport,
    foreignNotes: foreign,
    syncTarget: async (): Promise<Awaited<ReturnType<typeof sync.deleteTarget>>['target']> => {
      const { target } = await sync.deleteTarget();
      return target;
    },
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

  // The popup's question (`A167`, `A168`, `A169`), wired here and answered by
  // `attachPageNotesChannel`.
  //
  // `loadForeignNotes` is the page's request in one line, and it is the **same** path
  // `attachSyncNotes` walks: `A166` is decided first (a switch that is off or an address
  // that is empty means no request at all), the key is the one the last paint pass
  // resolved — never a key derived here, because the stored notes may live under the
  // `origin + pathname` fallback — and the settings name keeps the reader's own notes out
  // of memory (`A161`). What the automatic load adds on top of this line is its own
  // "asked already?" bookkeeping, which must not stop a reader's press from trying again:
  // re-reading the page is exactly what the reader asked for.
  const loadPageNotes = async (): Promise<ForeignLoadOutcome> => {
    const key = painter.pageKeyOfPass();
    if (key === null) {
      return { ok: false, code: 'sync_off' };
    }
    const { target, currentName } = await sync.loadTarget();
    if (target === null) {
      // `A166` again, at the door the reader knocked on: nothing is called.
      return { ok: false, code: 'sync_off' };
    }
    // The persisted half of the checkbox (`A184`): a reader's press (the row delete press or a
    // sync reload) re-asks the server, and the authors the reader hid on this page
    // must arrive hidden. The read never throws, so the load cannot be gated by it.
    const hiddenAuthors = await loadHiddenAuthorsOfPage(port, key);
    return await loadIntoMemory(foreign, {
      transport,
      target,
      pageKey: key,
      currentName,
      hiddenAuthors,
    });
  };

  // The persisted half of a foreign row's controls (`A184`). The flag lives in the
  // `foreign-hidden:v1` record under the page key the pass resolved — the same key
  // the load is asked about — and a failed write is swallowed here, because the
  // in-memory switch already answered the popup (`A164` posture): the persistence is
  // a best-effort shadow of the memory, never a gate.
  const persistAuthorFlag = (authorName: string, hidden: boolean): void => {
    void (async (): Promise<void> => {
      const key = painter.pageKeyOfPass();
      if (key === null) {
        return;
      }
      try {
        await setForeignAuthorHidden(port, { pageKey: key, authorName, hidden });
      } catch {
        // The memory switch is the answer the reader sees; the shadow is best effort.
      }
    })();
  };

  const notesChannel = attachPageNotesChannel({
    foreign,
    painter,
    load: loadPageNotes,
    // Ruling `A184`: the checkbox press and the row delete press of a foreign row are
    // the two writers of the persisted author flag, through the one core API.
    persistAuthorFlag,
    persistAuthorRemoval: (authorName: string): void => persistAuthorFlag(authorName, false),
    // Ruling `A183`: a load that lands after the popup's one question has to reach a
    // popup that is already open, so the page **announces** that its foreign list moved.
    // The popup answers it with the same question as before (`src/popup/page-notes-
    // channel.ts` -> `listenForPageNotesUpdates`), so there is still one answer shape and
    // one answerer; nothing here polls and nothing here runs on a timer. The send is
    // guarded for the same reason the listener subscription below is: a frame without the
    // runtime API announces into nothing rather than breaking.
    announce: (update): void => {
      try {
        void chrome.runtime.sendMessage({ type: PAGE_NOTES_UPDATED_MESSAGE, ...update });
      } catch {
        // No runtime API in this frame: nobody is listening, and nothing else changes.
      }
    },
  });

  // The one `chrome.runtime.onMessage` listener of this document (`A167`). It is the
  // entry point's wiring and not the module's rule: the channel above is pure and runs in
  // a unit test with a recorder, and the delivered listener is four lines over it — the
  // message in, the answer out, `true` when the answer comes later.
  //
  // The one guard is the subscription itself, and it is the same `A75`/`A164` rule the
  // load follows: a frame without the runtime API (a test document, an unusual frame) is
  // a page that cannot be asked rather than a page that breaks, and the popup reads that
  // as "no foreign rows". A listener that throws is the channel's own business: it
  // answers codes and message shapes, and an unreadable answer is already `A166`'s empty
  // state (`src/content/sync/page-notes-channel.ts`).
  try {
    chrome.runtime.onMessage.addListener((message, sender, respond) =>
      notesChannel.onMessage(message, sender, respond),
    );
  } catch {
    // Named, not driven by a throw: `chrome.runtime` is present in every injected frame
    // of an MV3 extension, and this is what keeps a document without it silent rather
    // than broken.
  }

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
  //
  // Both watches go through `refreshThenSync` and through nothing else, so a
  // same-document navigation (`A59`) or a settings write (`A50`, `A60`) asks the sync
  // question after the repaint — and `afterPaint()` compares page keys, so a repaint of
  // the same page starts no request. There is one `attachUrlChangeWatch` call and one
  // `attachStorageChangeWatch` call in this file, each as a bare statement: `t4-03`'s
  // rule that neither watch is ever torn down in a content script is unchanged.
  const refreshThenSync = (): void => {
    void painter.refresh().then(sync.afterPaint);
  };

  attachUrlChangeWatch(window, document, {
    url: pageUrl,
    onUrlChange: refreshThenSync,
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
    onRepaint: refreshThenSync,
  });

  // Flow / Sequence 6 again, with the sync server's half on top (Stage 17): the stored
  // notes of this page are read, resolved and painted, and then — once, after the pass
  // has resolved the page key this document's notes live under — the sync server is
  // asked for the page's notes by that same key (`A163`). Painting first is what makes
  // the order harmless: a server that never answers leaves the reader with exactly the
  // page this extension shipped before this stage (`A164`).
  //
  // The foreign notes live in `foreign` and nowhere else: memory only, never
  // `chrome.storage.local` (`A163`). The two watchers below are the ones that can change
  // the question — a same-document navigation (`A59`) and a settings write, which is
  // this extension's only notification channel (`A50`, `A60`) — and the page repaint
  // those two already had stays exactly where it was.
  void painter.refresh().then(sync.afterPaint);
}

boot();
