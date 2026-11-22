/**
 * The page's half of the popup's question (Stage 17, rulings `A167`, `A168`, `A169`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "The foreign
 * notes in the popup", "Hiding and deleting a foreign row", "A failed load never blocks
 * the page".
 *
 * The popup cannot read this document's memory (`A163` keeps foreign notes out of
 * `chrome.storage.local`), so it asks for it through the `chrome.runtime` message
 * channel the project already uses between its documents. This module is the whole of
 * the page's side of that conversation:
 *
 * - **it answers one question, and it answers it about this document only.** The
 *   message name is core `NOTES_QUERY_MESSAGE`, the answer is core
 *   `pageNotesQueryResultOf` over the memory, and nothing else is sent: no comment, no
 *   anchor, no id. The popup receives a view of the rows, never the notes. The page key
 *   is never compared, because one answerer exists per document.
 * - **the answer is the memory now, not the end of a load** (`A183`, task `t17-06`). It
 *   used to answer only after `loadOnce()` resolved, which made a popup opened during a
 *   slow automatic load wait for it — and, since the popup asked once, render an empty
 *   list forever. The ask path answers in the same turn and starts (or joins) the load
 *   afterwards, and every finished load is **announced** to whatever is open. No polling
 *   and no timer: the popup hears about a late list, it does not look for one.
 * - **it performs two operations and nothing else** (`A168`). A foreign row's checkbox
 *   switches **every** note of that author in this document's memory with one call of
 *   the aggregate write, and the delete control of a foreign row drops that author's
 *   notes from this document's view with one `dismiss`. Both are local: the server is not
 *   called, and no foreign note is written anywhere.
 * - **the switched-off authors are remembered** (`A187`-`A189`, task `t17-14`). The
 *   press of a foreign row also updates the page's **off list** — the author names the
 *   reader switched off on this page, stored under `sync-off:v1` — and the delete of a
 *   foreign row removes that author from it, so a row the reader deleted comes back
 *   switched on on the next load (the reader's `1a`). What is stored is the fact, never
 *   the note: `A163` is unchanged and no note text, id or anchor reaches the record. The
 *   list is read once per load (`A188`) and never on a switch (`A189`): a press changes
 *   the memory and then the record, in that order, and the paint pass follows the
 *   memory.
 * - **it remembers the failure** (`A169`). The automatic load is run by the entry point
 *   through the injected `load` seam — the same closure the paint wiring uses, so the
 *   two cannot disagree about how a load ends — and the outcome is answered to the popup
 *   as the `A164` flag. The popup therefore states the failure sentence of
 *   `src/popup/text.ts` without making a request of its own.
 * - **it repaints through the pass** (`A29`). A switch or a delete hands the memory's
 *   current paint input back to the pass and asks for one more pass, which is exactly
 *   what a successful load does with the same list: one stream, one pass, the same
 *   `paint name`s.
 *
 * Two rules this module deliberately does **not** own:
 *
 * - the shape of the answer and the name of the message are core
 *   (`src/core/page-notes-query.ts`), because the popup's half is a different bundle and
 *   a second declaration would be a second contract;
 * - the wiring to `chrome.runtime.onMessage` is the entry point's
 *   (`src/content/main.ts`), through the listener this module returns. So the rules
 *   above run in a unit test with a recorder and no `chrome` stub at all.
 *
 * No `chrome.*`, no DOM and no Russian string lives in this file: the two seams are
 * injected and the wording of the failure line belongs to `src/popup/text.ts`.
 */

import { isSameAuthor } from '../../core/entry-rules';
import type {
  ForeignNotesSnapshot,
  PageNotesQueryResult,
  PageNotesUpdate,
} from '../../core/page-notes-query';
import {
  NOTES_QUERY_MESSAGE,
  pageNotesQueryResultOf,
  pageNotesUpdateOf,
} from '../../core/page-notes-query';
import type { StoragePort } from '../../core/storage-port';
import {
  authorNamesOf,
  isAuthorOff,
  loadOffAuthorNames,
  offListOfLoad,
  saveOffAuthorNames,
  withAuthorOff,
} from '../../core/sync-off-list';
import type { SyncFailureCode } from '../../core/sync-client';
import type { ExtraEntry } from '../paint/paint-plan';
import type { ForeignLoadOutcome, ForeignNotes } from './foreign-notes';

/**
 * A `chrome.runtime.onMessage` listener, declared structurally.
 *
 * The shipped wiring passes `chrome.runtime.onMessage.addListener`, so no `chrome` stub
 * and no `@types/chrome` value is needed here; a test passes a recorder. The listener
 * model is Chrome's own: a sender is answered **only** when the listener returns `true`
 * and calls the `respond` callback later, which is why the ask path below answers
 * asynchronously through that callback rather than by returning a promise.
 */
export type RuntimeMessageListenerLike = (
  message: unknown,
  sender: unknown,
  respond: (answer: unknown) => void,
) => boolean | undefined;

/** The attached page-side channel. */
export interface PageNotesChannel {
  /** The `chrome.runtime.onMessage` listener of this document. */
  readonly onMessage: RuntimeMessageListenerLike;
  /** The failure code of the last load this channel ran, `null` while none failed. */
  loadCode(): SyncFailureCode | null;
  /** The answer the popup would get right now: the memory and the failure flag. */
  result(): PageNotesQueryResult;
  /**
   * Forgets the finished load, so the next question asks the server again (`A164`).
   *
   * The retry belongs to the reader and not to the question path: a press is the one moment
   * somebody asks for a fresh answer, and calling this from anywhere else is what made the
   * two halves loop (`t17-08`).
   */
  reload(): void;
  /**
   * Tells an open popup that this page's foreign rows moved (ruling `A183`).
   *
   * It is called by whoever changed the memory through a path that is **not** a popup
   * operation — the automatic load, mostly — because the popup asked once when it opened
   * and a list that arrives after that question would otherwise never reach it. It
   * carries no body that the popup reads: the popup answers it with the ordinary
   * question, so the answer shape stays the one of `A167` and there is still exactly one
   * answerer. A page with no `announce` seam sends nothing, which is what a test and a
   * frame without the runtime API get.
   */
  announce(): void;
}

/** What the page's channel must be given to run. */
export interface PageNotesChannelWiring {
  /**
   * The notes held in this document's memory, and the only list it reads (`A163`).
   */
  readonly foreign: ForeignNotes;
  /**
   * Where the page's off list is written (`A187`) and read (`A188`).
   *
   * **No port means no record**: a caller that has none — a test of the answer shape, a
   * frame that cannot store — keeps the memory-only behaviour of `A163` and persists
   * nothing, and the read is the one `loadIntoMemory` makes on its own.
   */
  readonly port?: StoragePort;
  /**
   * The page key the notes of this document are filed under (`A188`), read per use.
   *
   * It is the key the paint pass resolved, never one derived here: the stored notes may
   * live under the `origin + pathname` fallback, and an off list filed under a key the
   * notes do not live under would switch the wrong page's author off. `null` means
   * "this document has no page", and then nothing is stored and no list is read.
   */
  readonly pageKey: () => string | null;
  /** Where one more pass is asked for; it cannot reject (`page-painter.ts`, `A75`). */
  readonly painter: {
    setExtraEntries(entries: readonly ExtraEntry[] | null): void;
    refresh(): Promise<unknown>;
  };
  /**
   * Runs the automatic load, so this module and the page's own load cannot disagree
   * about how it ended. The shipped value is built in `src/content/main.ts` over the
   * pass's key read; a test answers with a recorder and no transport.
   */
  readonly load: () => Promise<ForeignLoadOutcome>;
  /**
   * Sends the `A183` announcement to whoever listens — `chrome.runtime.sendMessage` in
   * the shipped page, a recorder in a test, absent in a frame that has no runtime API.
   *
   * It is a seam rather than a `chrome.*` call here for the reason this whole module has
   * no `chrome.*`: the rule ("a popup that is open hears about a late list") is testable
   * without a browser, and the wiring stays four lines in `src/content/main.ts`.
   */
  readonly announce?: (message: PageNotesUpdate) => void;
}

/** One row operation the popup may send. */
type NotesOperation =
  | { readonly kind: 'switch'; readonly authorName: string; readonly visible: boolean }
  | { readonly kind: 'dismiss'; readonly authorName: string };

/**
 * `true` when the message is the one question this module answers.
 *
 * Both spellings are accepted on purpose: the bare string is what a caller with no
 * arguments sends, and the object with `type` is what a caller that needs to carry an
 * operation sends. The `type` half is the shipped one — `src/popup/page-notes-channel.ts`
 * builds it — and the bare form costs one comparison and no message of its own.
 */
function isNotesQuery(message: unknown): boolean {
  if (message === NOTES_QUERY_MESSAGE) {
    return true;
  }
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const record = message as Record<string, unknown>;
  return record['type'] === NOTES_QUERY_MESSAGE && record['op'] === undefined;
}

/**
 * The operation of a message, `null` when the message is not one.
 *
 * An unknown `op` is `null` and not "some other operation": a page script's guess or a
 * future version's message must never be read as a delete of an author named
 * `undefined`.
 */
function operationOf(message: unknown): NotesOperation | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const record = message as Record<string, unknown>;
  if (record['type'] !== NOTES_QUERY_MESSAGE) {
    return null;
  }
  const authorName = record['authorName'];
  if (typeof authorName !== 'string' || authorName === '') {
    return null;
  }
  const op = record['op'];
  if (op === 'dismiss') {
    return { kind: 'dismiss', authorName };
  }
  if (op === 'switch') {
    return { kind: 'switch', authorName, visible: record['visible'] === true };
  }
  return null;
}

/**
 * The aggregate memory write of one row (`A168`, `A108`): **every** note of that
 * author, in this document's memory and nowhere else. It returns how many flags moved,
 * which is the aggregate half the popup's stored row answers with a storage write.
 */
function switchNotesOfAuthor(
  memory: ForeignNotes,
  authorName: string,
  visible: boolean,
): number {
  let changed = 0;
  for (const note of memory.all()) {
    if (!isSameAuthor(note.entry.authorName, authorName)) {
      continue;
    }
    if (note.visible !== visible) {
      memory.setNoteVisible(note.entry.id, visible);
      changed += 1;
    }
  }
  return changed;
}

/**
 * Attaches the page's answer channel.
 *
 * Nothing is loaded and nothing is painted until a message arrives: this function only
 * builds the seam, and the memory it is given is the document's own.
 */
export function attachPageNotesChannel(wiring: PageNotesChannelWiring): PageNotesChannel {
  let loadCode: SyncFailureCode | null = null;
  /**
   * The load that is running, `null` when none is (`A183`).
   *
   * The question no longer waits for a load, but two questions a moment apart (the popup
   * opening, and the popup hearing an announcement) must not start two requests: the
   * second caller joins the load already in flight. It is one promise and not a queue,
   * because there is exactly one page per document.
   */
  let loading: Promise<void> | null = null;

  /**
   * Whether this document has already asked the server (`t17-08`).
   *
   * The answer stays valid for the life of the page: the reader's own notes do not change
   * behind their back, and the server's copy is only re-read when the reader asks for it.
   * Without this flag every question started a new request, and the question path is
   * triggered by the announcement the request itself sends — the loop measured below.
   */
  let loaded = false;

  /**
   * One load, remembered (`A169`): a success clears the failure the reader saw.
   *
   * The memory may have changed under the popup's rows, so the answer of a load is
   * announced (`A183`): a popup that is already open re-asks and renders the list that
   * arrived after its own question. The announcement is sent for a failure too, because a
   * failed load is exactly the state the popup's notice line describes.
   */
  async function loadOnce(): Promise<ForeignLoadOutcome> {
    const before = fingerprintOf();
    const outcome = await wiring.load();
    loadCode = outcome.ok ? null : outcome.code;
    // Announce **only when the answer actually moved** (`t17-08`). The popup rebuilds its
    // view by asking this page again, and every question runs `ensureLoaded` — so an
    // unconditional announcement made the two halves feed each other: question, load,
    // announcement, rebuild, question, and so on without end. The reader saw a checkbox
    // that flipped straight back and a row that would not disappear, because the loop kept
    // re-asking and re-rendering faster than a press could settle.
    if (fingerprintOf() !== before || loadCode !== null) {
      announce();
    }
    return outcome;
  }

  /**
   * What the popup would render right now, as one string.
   *
   * The rows and the failure flag are the whole answer (`page-notes-query.ts`), so the
   * fingerprint of the answer is the fingerprint of what an announcement would say: a load
   * that changes nothing announces nothing, and the loop above cannot form.
   */
  function fingerprintOf(): string {
    return JSON.stringify(answerOf());
  }

  /**
   * Starts the load if none is running, and resolves when one has finished (`A183`).
   *
   * It is **not** awaited by the ask path: the popup is answered from the memory at the
   * moment it asks, which is what makes a popup opened during a slow load show what the
   * page holds instead of waiting for nothing.
   *
   * **One load per document, unless the reader asks again.** The previous shape cleared the
   * shared promise when it settled, so the *next* question started a whole new request —
   * and the popup asks once per view build, which the announcement triggers. The two halves
   * therefore fed each other without end: measured in the reader's Chrome as **1637
   * questions and 1638 announcements in three seconds**, with the checkbox flipping back and
   * the deleted row refusing to leave, because the loop re-rendered faster than a press
   * could settle.
   *
   * A finished load is remembered. A caller that wants a fresh answer — the reader pressing
   * the sync button, which is `A164`'s retry — calls `reload()`, and nothing else does.
   */
  async function ensureLoaded(): Promise<void> {
    if (loaded) {
      return;
    }
    loading ??= loadOnce().then(
      () => {
        loaded = true;
      },
      () => {
        loaded = true;
      },
    );
    await loading;
  }

  /**
   * Forgets that a load happened, so the next question asks the server again.
   *
   * This is the retry of `A164`, and it belongs to the reader: the sync press is what calls
   * it, because a press is the one moment the reader asks for a fresh answer. Nothing on the
   * question path calls it, which is what keeps the two halves from looping.
   */
  function reload(): void {
    loaded = false;
    loading = null;
  }

  /** The `A183` announcement, if this page has a seam for it. */
  function announce(): void {
    if (wiring.announce === undefined) {
      return;
    }
    wiring.announce(pageNotesUpdateOf(wiring.foreign as ForeignNotesSnapshot));
  }

  /**
   * One more pass over the list the memory holds, exactly as the load path paints it.
   *
   * An empty memory hands the pass `null`, so the page drops the extra entries it was
   * holding — the same call `sync-notes.ts` makes when the server has no notes left.
   */
  function repaint(): void {
    const list = wiring.foreign.all();
    wiring.painter.setExtraEntries(list.length === 0 ? null : wiring.foreign.paintInput());
    // The page's own repaint path; a pass cannot reject (`A75`).
    void wiring.painter.refresh();
  }

  function answerOf(): PageNotesQueryResult {
    return pageNotesQueryResultOf(wiring.foreign as ForeignNotesSnapshot, loadCode !== null);
  }

  /**
   * The press of a foreign row's checkbox: the memory first, then the record (`A189`).
   *
   * The order is the ruling's, and it is observable: the paint pass is asked for one more
   * pass over the memory before the write is attempted, so the page follows the memory
   * whatever storage answers. The record is read **only** to merge this page's list into
   * it — never to re-decide the memory — and the authors the load did not answer with are
   * dropped from the merged list (`A188`), so a departed author cannot be kept alive by a
   * press.
   *
   * A storage failure is silent here on purpose: a switch is the reader's display
   * decision, the page and the popup both already show it, and a popup row has no line to
   * report a storage failure with. What the reader loses is one reload's worth of the
   * decision, never the note.
   */
  async function rememberSwitchedAuthor(authorName: string, visible: boolean): Promise<void> {
    const port = wiring.port;
    const pageKey = wiring.pageKey();
    if (port === undefined || pageKey === null) {
      return;
    }
    const current = await loadOffAuthorNames(port, pageKey);
    const answered = authorNamesOf(wiring.foreign.all().map((note) => note.entry));
    const kept = offListOfLoad(current.authorNames, answered);
    await saveOffAuthorNames(port, pageKey, withAuthorOff(kept, authorName, !visible));
  }

  /**
   * The delete of a foreign row: the author leaves the off list too (`A188`, `1a`).
   *
   * Deleting a row means "I do not want this author on this page"; if the reader had
   * switched them off as well, a stored off entry would hide them forever after —
   * including after the server returns them with new notes. So the delete removes the
   * name, and the next load shows that author again, checked on. The server is still not
   * called (`A168`), and no note is written (`A163`).
   */
  async function forgetSwitchedAuthor(authorName: string): Promise<void> {
    const port = wiring.port;
    const pageKey = wiring.pageKey();
    if (port === undefined || pageKey === null) {
      return;
    }
    const current = await loadOffAuthorNames(port, pageKey);
    if (!isAuthorOff(current.authorNames, authorName)) {
      // Nothing to remove, and nothing to write: a delete that leaves the record exactly
      // as it was is a delete with no storage call at all.
      return;
    }
    await saveOffAuthorNames(port, pageKey, withAuthorOff(current.authorNames, authorName, false));
  }

  const onMessage: RuntimeMessageListenerLike = (message, _sender, respond) => {
    const operation = operationOf(message);
    if (operation !== null) {
      if (operation.kind === 'switch') {
        switchNotesOfAuthor(wiring.foreign, operation.authorName, operation.visible);
        // `A189`: the memory is the truth while the document lives, so the paint pass is
        // asked for its pass **before** the record is touched, and the record write is
        // awaited by nobody who renders.
        repaint();
        respond(answerOf());
        void rememberSwitchedAuthor(operation.authorName, operation.visible);
        return undefined;
      }
      wiring.foreign.dismiss(operation.authorName);
      repaint();
      respond(answerOf());
      void forgetSwitchedAuthor(operation.authorName);
      return undefined;
    }

    if (!isNotesQuery(message)) {
      // Somebody else's message: ignored, and **no** response is produced, in both
      // meanings of the word — no `respond` call and no `true` return, so this page can
      // never become a second answer to an unrelated question.
      return undefined;
    }

    // `A183`, and this is the whole fix: the answer is the memory **as it stands now**, 
    // returned through the callback in the same turn as the question. A popup that opens
    // during the page's automatic load therefore renders the rows the page has (possibly
    // none) and does not wait for a request; when the load lands, the announcement above
    // reaches that same open popup and the list arrives after all.
    respond(answerOf());
    // The load still runs — one per document, and only after the answer — so the page's
    // foreign notes are asked for exactly as before, and a second question joins it.
    void ensureLoaded();
    return undefined;
  };

  return {
    onMessage,
    loadCode(): SyncFailureCode | null {
      return loadCode;
    },
    result: answerOf,
    reload,
    announce,
  };
}
