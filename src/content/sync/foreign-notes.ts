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
 *
 * Stage 20 (`t20-02`, ruling `A197`) adds the adoption seam to the one loader below.
 * The mapping of every returned row happens here (`entryFromRemoteNote`), so the one
 * pass over the answer is also the pass that hands the reader's own rows to the adopter
 * — and the adopter is a **seam**, because this module still declares no port of its
 * own. Whatever writes the store is injected by the caller and lives in
 * `adopt-own-notes.ts`; this file cannot write even by mistake.
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
   *
   * `hiddenAuthors` is the persisted half of the checkbox (`A184`): a note whose
   * author is in that list arrives `visible: false`, so an author the reader hid
   * stays hidden across a reload. A first-ever load (an empty record) and a load
   * after the row's delete press (which cleared the flag) pass nothing, so every
   * author arrives visible.
   */
  replace(
    notes: readonly RemoteNote[],
    authorName: string | null,
    hiddenAuthors?: readonly string[],
  ): void;
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
  /**
   * Removes **one** note from this page's memory, by its author and its id (`A168`).
   *
   * The id alone would be ambiguous: two authors may legitimately share one id on one
   * page (`sync-server.md` -> the upsert triple), so a delete addressed by id only
   * could take the wrong author's note. `false` means "this page holds no such note",
   * and nothing was removed. The server is not called, nothing is stored, and the note
   * is back on the next page load — the same promise `dismiss` makes for a whole author.
   */
  dismissNote(authorName: string, entryId: string): boolean;
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

    replace(
      incoming: readonly RemoteNote[],
      authorName: string | null,
      hiddenAuthors?: readonly string[],
    ): void {
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
        const hidden =
          hiddenAuthors !== undefined &&
          hiddenAuthors.some((name) => isSameAuthor(name, entry.authorName));
        next.push({ entry, visible: !hidden });
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

    dismissNote(authorName: string, entryId: string): boolean {
      const before = notes.length;
      notes = notes.filter(
        (note) => !(note.entry.id === entryId && isSameAuthor(note.entry.authorName, authorName)),
      );
      return notes.length !== before;
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
   * The persisted hidden authors of this page (`A184`), read by the caller from
   * core `loadHiddenAuthorsOfPage`; `undefined` is a first-ever load and means
   * every author arrives visible.
   */
  readonly hiddenAuthors?: readonly string[];
  /**
   * The configured address, from core `syncTargetOf`; `null` means "do not call"
   * (ruling `A166`) — the same `null` the popup reads before it renders a sync button.
   */
  readonly target: SyncTarget | null;
  /** The page key the notes are asked for. */
  readonly pageKey: string;
  /**
   * The page address the pass is on, when the caller knows it (`A197`).
   *
   * It is the address the adoption write is addressed by, never the key: core's
   * `entry-store-write.ts` resolves the key through the stored index (`N5`), so a note
   * can never be filed under a key the store does not list. Absent falls back to
   * `pageKey`, which is the honest answer for a caller that has only the key — the
   * address *is* the key for every page the core key rule accepts.
   */
  readonly pageUrl?: string;
  /** The settings name, used to keep the reader's own notes out of memory. */
  readonly currentName: string | null;
  /**
   * The adoption seam of ruling `A197` (task `t20-02`), handed the **raw** rows the
   * server returned.
   *
   * The rows arrive unmapped and the seam maps them itself, through core
   * `entryFromRemoteNote` (`adopt-own-notes.ts`). That is one mapping pass rather than
   * two: the memory below maps a row to decide whether it is foreign, and a second map
   * at the call site would be a second reading of the same wire row.
   *
   * Absent means no adoption at all, which is the honest state of a caller with no
   * page to file into — a test that is about the memory, a popup-driven load in a
   * document whose pass resolved no key.
   *
   * **The outcome is the whole contract.** The seam cannot change what this function
   * answers, cannot stop it and cannot reach the page: a refusal is swallowed by the
   * seam itself (`A199` best effort, `adopt-own-notes.ts`), so nothing here is wrapped
   * in a `try` and no failure of it is ever reported to the reader.
   */
  readonly adoptOwnNotes?: (pass: {
    readonly url: string;
    readonly currentName: string;
    readonly notes: readonly RemoteNote[];
  }) => Promise<unknown>;
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
    await adopt(request, summary);
    memory.replace(summary.notes, request.currentName, request.hiddenAuthors);
    return { ok: true, added: memory.all().length };
  } catch {
    // A transport that throws instead of rejecting its promise is still one answer to
    // the reader, and never a broken page.
    return { ok: false, code: 'network' };
  }
}

/**
 * The adoption half of one successful load (rulings `A197`, `A199`).
 *
 * It runs **before** `memory.replace` and on the same rows that call will read, so the
 * order the spec names holds: the store learns the reader's own notes first, and the
 * memory then drops exactly those rows, because they are painted from the store.
 *
 * Nothing here has a `try` of its own: the seam owns its own swallowing
 * (`adopt-own-notes.ts`, `A199`), and this function's obligation is only that a refused
 * adoption cannot change the answer and cannot block the paint. The `await` is there
 * because adoption is a storage write and the repaint that follows this load must see the
 * page the write published.
 *
 * The enclosing `try` is the load's own (`A164`) and it is a backstop, not the rule: the
 * shipped seam resolves for every state, so the `await` cannot reach it. A seam that
 * broke that contract would answer `network` like any other throw out of a load — a
 * failure to adopt is never allowed to become a failure of the page.
 */
async function adopt(request: ForeignLoadRequest, summary: SyncLoadSummary): Promise<void> {
  const seam = request.adoptOwnNotes;
  if (seam === undefined || request.currentName === null) {
    // `A197` needs a name: with none set, no row can be the reader's own, and the
    // memory below is already the whole answer.
    return;
  }
  await seam({
    url: request.pageUrl ?? request.pageKey,
    currentName: request.currentName,
    notes: summary.notes,
  });
}
