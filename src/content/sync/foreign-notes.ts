/**
 * The foreign notes of one page: the sync server's notes as this document remembers
 * them (Stage 17, rulings `A161`, `A163`, `A164`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Foreign notes
 * are memory only", "Deleting a foreign row is local", "A failed load never blocks the
 * page".
 *
 * Why a module rather than three fields in `main.ts`: the list has rules. A note moves
 * from memory to **nowhere** (never to storage), a reload of the page starts empty, a
 * delete removes a row without touching the server, and the paint pass needs the same
 * list in a shape it can paint. Stating them once here is what keeps `src/content/`
 * free of a second copy of them, and keeps them testable without a page.
 *
 * Why nothing here is stored: `A163` is a ruling, not an optimisation. A foreign note
 * written to `chrome.storage.local` would outlive the tab, appear on the next page
 * load as if the reader had written it, and be pushed back to the server by the next
 * sync press — which is exactly the three consequences the ruling forbids. The list
 * therefore lives in a closure that the content script drops when the document dies,
 * and this module declares no storage port at all: it cannot write even by mistake.
 *
 * Why an entry disappears from memory on delete but the server is not called: the
 * popup's row controls belong to the reader, and the answer to "I do not want to see
 * this note" must not be "I deleted somebody else's note from a shared server". That
 * is answer 5 of the brief, and the only place it is implemented is `dismiss`.
 */

import type { Entry } from '../../core/entry';
import { isSameAuthor } from '../../core/entry-rules';
import type {
  RemoteNote,
  SyncFailureCode,
  SyncLoadSummary,
  SyncTransport,
} from '../../core/sync-client';
import { entryFromRemoteNote, loadForeignNotes } from '../../core/sync-client';
import type { SyncTransport } from '../../core/sync-client';
import type { SyncTarget } from '../../core/sync-settings';
import type { ExtraEntry } from '../paint/paint-plan';

/** One foreign note as this document holds it: the record plus this tab's flag. */
export interface ForeignNote {
  /** The stored shape of the note, built by `core/sync-client.ts` from the wire row. */
  readonly entry: Entry;
  /**
   * Whether this note's highlight is drawn. `true` on arrival, and only the reader can
   * change it — it is the mirror of a stored entry's `visible`, kept in memory because
   * a foreign note has no stored field at all.
   */
  visible: boolean;
}

/** What one load did, in the popup's terms. */
export type ForeignLoadOutcome =
  | { readonly ok: true; readonly added: number }
  | { readonly ok: false; readonly code: SyncFailureCode };

/** The list itself, and the four operations the page performs on it. */
export interface ForeignNotes {
  /** The notes as they stand, in the order the server returned them. */
  all(): readonly ForeignNote[];
  /**
   * Replaces the list with what one load returned, keeping nothing of the old one:
   * a note the server no longer has is gone from this page too, and a note it has
   * again is one note, not two.
   */
  replace(notes: readonly RemoteNote[], authorName: string | null): void;
  /** The shape the paint pass takes (`page-painter.ts` -> `setExtraEntries`). */
  paintInput(): readonly ExtraEntry[];
  /** The display flag of one note, by entry id, `null` when this page holds no such note. */
  visibilityOf(entryId: string): boolean | null;
  /**
   * Switches one note's highlight on or off; `false` when no note of that id is held.
   *
   * This is the **memory** write and not a storage write: a foreign note has no stored
   * `visible` field (`A163`), so the popup's ✓ for a foreign row changes this flag in
   * this document only, and the next page load reads the note back visible. The name
   * differs from core's `setVisible` on purpose, so the content-layer pin that keeps
   * every stored-entry write out of this directory reads the boundary unchanged.
   */
  setNoteVisible(entryId: string, visible: boolean): boolean;
  /**
   * Removes every note of one author from this page's memory (answer 5). The server is
   * not called, nothing is stored, and the notes are back on the next page load.
   */
  dismiss(authorName: string): number;
  /** The authors this page currently holds notes from, in first-appearance order. */
  authors(): readonly { readonly authorName: string; readonly count: number; readonly allVisible: boolean }[];
}

/**
 * A fresh, empty memory for one document.
 *
 * `replace` takes the current settings name rather than capturing it, because a name
 * changed in the options page while the page stands must re-decide which notes are
 * foreign on the next load: a note this reader wrote on another machine is **not**
 * foreign, it is already in the local store, and painting it twice would register two
 * `paint name`s over one span.
 */
export function createForeignNotes(): ForeignNotes {
  let notes: ForeignNote[] = [];

  return {
    all(): readonly ForeignNote[] {
      return notes;
    },

    replace(incoming: readonly RemoteNote[], authorName: string | null): void {
      const mine = authorName === null ? null : authorName;
      const next: ForeignNote[] = [];
      const seen = new Set<string>();
      for (const remote of incoming) {
        const entry = entryFromRemoteNote(remote);
        if (entry === null) {
          // A row this extension cannot read as a note is skipped, never guessed at:
          // an unanchorable note cannot be painted, and the reader's own list must not
          // grow a row for somebody else's broken record.
          continue;
        }
        if (mine !== null && isSameAuthor(entry.authorName, mine)) {
          // The reader's own notes are the store's business; the server's copy of them
          // is already in `chrome.storage.local` and painting it twice would register
          // two `paint name`s over one span.
          continue;
        }
        // One id may legitimately appear under two authors (`sync-server.md` -> the
        // upsert triple), so the key is the pair, not the id alone.
        const key = `${entry.authorName}\u0000${entry.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        next.push({ entry, visible: true });
      }
      notes = next;
    },

    paintInput(): readonly ExtraEntry[] {
      return notes.map((note) => ({ entry: note.entry, visible: note.visible }));
    },

    visibilityOf(entryId: string): boolean | null {
      const found = notes.find((note) => note.entry.id === entryId);
      return found === undefined ? null : found.visible;
    },

    setNoteVisible(entryId: string, visible: boolean): boolean {
      const found = notes.find((note) => note.entry.id === entryId);
      if (found === undefined) {
        return false;
      }
      found.visible = visible;
      return true;
    },

    dismiss(authorName: string): number {
      const before = notes.length;
      notes = notes.filter((note) => !isSameAuthor(note.entry.authorName, authorName));
      return before - notes.length;
    },

    authors(): readonly { readonly authorName: string; readonly count: number; readonly allVisible: boolean }[] {
      return authorsOf(notes);
    },
  };
}

/** The author rows of a list, in first-appearance order, one per author (`A99`). */
export function authorsOf(
  notes: readonly ForeignNote[],
): readonly { readonly authorName: string; readonly count: number; readonly allVisible: boolean }[] {
  const rows: { authorName: string; count: number; allVisible: boolean }[] = [];
  for (const note of notes) {
    const row = rows.find((candidate) => isSameAuthor(candidate.authorName, note.entry.authorName));
    if (row === undefined) {
      rows.push({ authorName: note.entry.authorName, count: 1, allVisible: note.visible });
      continue;
    }
    row.count += 1;
    row.allVisible = row.allVisible && note.visible;
  }
  return rows;
}

/** What a caller hands the loader: the transport, the target, the page. */
export interface ForeignLoadRequest {
  /** `fetch` in the page; a recorder in a test. */
  readonly transport: SyncTransport;
  /**
   * The configured address, from core `syncTargetOf`; `null` means "do not call"
   * (ruling `A166`) — the same `null` the popup reads before it renders a sync button.
   */
  readonly target: SyncTarget | null;
  /** The page key the notes are asked for. */
  readonly pageKey: string;
  /** The settings name, used to keep the reader's own notes out of memory. */
  readonly currentName: string | null;
}

/**
 * One automatic load: `GET /notes/page/{page_id}`, then memory gets the answer.
 *
 * **Cannot reject** (`A164`): every failure — no target at all, a refused connection,
 * an error status, a body the server did not mean — comes back as `{ ok: false }`, so
 * the page keeps painting its stored notes and the popup has a code to show. The
 * `try` is here because the caller is a fire-and-forget boot step with no rejection
 * handler, exactly like `painter.refresh()`.
 */
export async function loadIntoMemory(
  memory: ForeignNotes,
  request: ForeignLoadRequest,
): Promise<ForeignLoadOutcome> {
  if (request.target === null) {
    // `A166`: nothing to call, so nothing is called — not even a request that would
    // fail. The list stays as it is.
    return { ok: false, code: 'sync_off' };
  }
  try {
    const answer = await loadForeignNotes(request.transport, request.target, request.pageKey);
    if (!answer.ok) {
      return { ok: false, code: answer.code };
    }
    const summary: SyncLoadSummary = answer.value;
    memory.replace(summary.notes, request.currentName);
    return { ok: true, added: memory.all().length };
  } catch {
    // A transport that throws instead of rejecting its promise is still one answer to
    // the reader, and never a broken page.
    return { ok: false, code: 'network' };
  }
}
