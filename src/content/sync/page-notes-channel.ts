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
 * - **it performs two operations and nothing else** (`A168`). A foreign row's checkbox
 *   switches **every** note of that author in this document's memory with one call of
 *   the aggregate write, and the delete control of a foreign row drops that author's
 *   notes from this document's view with one `dismiss`. Both are local: the server is not
 *   called, storage is not written, and both are gone on reload.
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
} from '../../core/page-notes-query';
import { NOTES_QUERY_MESSAGE, pageNotesQueryResultOf } from '../../core/page-notes-query';
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
}

/** What the page's channel must be given to run. */
export interface PageNotesChannelWiring {
  /** The notes held in this document's memory, and the only list it reads (`A163`). */
  readonly foreign: ForeignNotes;
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

  /** One load, remembered (`A169`): a success clears the failure the reader saw. */
  async function loadOnce(): Promise<ForeignLoadOutcome> {
    const outcome = await wiring.load();
    loadCode = outcome.ok ? null : outcome.code;
    return outcome;
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

  const onMessage: RuntimeMessageListenerLike = (message, _sender, respond) => {
    const operation = operationOf(message);
    if (operation !== null) {
      if (operation.kind === 'switch') {
        switchNotesOfAuthor(wiring.foreign, operation.authorName, operation.visible);
      } else {
        wiring.foreign.dismiss(operation.authorName);
      }
      repaint();
      respond(answerOf());
      return undefined;
    }

    if (!isNotesQuery(message)) {
      // Somebody else's message: ignored, and **no** response is produced, in both
      // meanings of the word — no `respond` call and no `true` return, so this page can
      // never become a second answer to an unrelated question.
      return undefined;
    }

    void loadOnce().then(() => {
      // The answer belongs to the question, not to the load: a failed load still answers
      // with the rows the page holds and with the `A169` flag, and one that succeeded
      // answers the same way with the flag cleared.
      respond(answerOf());
    });
    // Chrome's own model: the callback answers later.
    return true;
  };

  return {
    onMessage,
    loadCode(): SyncFailureCode | null {
      return loadCode;
    },
    result: answerOf,
  };
}
