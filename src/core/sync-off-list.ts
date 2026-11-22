/**
 * The off list of the sync rows: which foreign authors this reader has switched off
 * on which page (Stage 17, task `t17-14`, rulings `A187`, `A188`, `A189`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "The off list",
 * "Where the notes live" (`A163` unchanged).
 *
 * What this record **is**: the fact «this author is switched off on this page», per
 * page key, author names only. That is the whole of it — no note text, no note id, no
 * anchor, no comment. `A163` keeps every foreign note in the document's memory and out
 * of `chrome.storage.local`; this record is not a note, it is the reader's own display
 * decision about a name, which is why storing it does not touch that ruling. The note
 * itself still arrives from the server on every load and is still never persisted.
 *
 * Stored shape (`SYNC_OFF_KEY`): `{ version: 1, pages: { [pageKey]: string[] } }`.
 * Names are kept in first-appearance order, duplicates are removed, and a page key
 * whose list becomes empty is **removed** from the record, so a page on which the
 * reader switched everybody back on leaves nothing behind (`A187`).
 *
 * Read discipline: every read is defensive. A value that is not the expected shape —
 * absent, `null`, an array, a primitive, a wrong version, a page list that is not an
 * array — is an empty list, and nothing here throws. That is the same posture
 * `settings-store.ts` takes with its record, and it is what makes a damaged value cost
 * the reader a checkbox and not a page.
 *
 * Write discipline: exactly one key. A write reads the current record first and
 * rewrites it with the new page list, because a merge into another page's list would
 * silently switch another page's authors off; a read that throws writes nothing and
 * answers the failure code, so the caller can stay silent without pretending it stored
 * anything.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The only impure
 * collaborator is the injected `StoragePort`.
 */

import { isSameAuthor } from './entry-rules';
import type { StorageFailureCode, StoragePort } from './storage-port';
import { attemptWrite } from './storage-port';
import { SYNC_OFF_KEY } from './storage-keys';

/**
 * Stored value of `SYNC_OFF_KEY`.
 *
 * `pages` maps a normalized page key (`page-key.ts`) to the author names switched off
 * on that page. A page key with an empty list is never written: the key is absent.
 */
export interface SyncOffListValue {
  version: 1;
  pages: Record<string, readonly string[]>;
}

/** What one read found: the off list of one page, and whether the record was usable. */
export interface SyncOffListRead {
  /** Author names switched off on the asked page, first-appearance order, unique. */
  readonly authorNames: readonly string[];
  /**
   * `true` when the stored value was not the expected shape. The reader's answer is
   * unaffected (`authorNames` is empty), and the flag is what a diagnostic can report;
   * nothing in the extension rewrites a damaged record on its own.
   */
  readonly malformed: boolean;
}

/** The off list of a page that has never had one, and of a damaged record. */
export const EMPTY_SYNC_OFF_READ: SyncOffListRead = { authorNames: [], malformed: false };

/** Result of `saveOffAuthorNames`: the list that was written, or a storage failure. */
export type SyncOffListWrite =
  | { readonly ok: true; readonly authorNames: readonly string[] }
  | { readonly ok: false; readonly code: StorageFailureCode };

/**
 * One page's author names, cleaned: whitespace trimmed, blanks dropped, duplicates
 * (by core `isSameAuthor`, the comparison the rest of the extension uses) removed, and
 * the first appearance of a name kept.
 *
 * The stored name is otherwise left as core gives it: `replace` in the page's memory
 * already writes the server's `author_id` verbatim, and this function must not become a
 * second opinion about what an author is called.
 */
export function uniqueAuthorNames(authorNames: readonly string[]): string[] {
  const kept: string[] = [];
  for (const raw of authorNames) {
    if (typeof raw !== 'string') {
      continue;
    }
    const name = raw.trim();
    if (name === '') {
      continue;
    }
    if (kept.some((candidate: string) => isSameAuthor(candidate, name))) {
      continue;
    }
    kept.push(name);
  }
  return kept;
}

/** The record with no page in it: what a store that never wrote the key holds. */
export function emptySyncOffList(): SyncOffListValue {
  return { version: 1, pages: {} };
}

/**
 * The stored record as the write path sees it, plus the damage flag of `A187`.
 *
 * A page list that is not an array of strings is dropped page by page rather than
 * failing the whole record: one damaged page must not lose the reader's decisions on
 * the others, and a page list with a non-string element keeps the strings it does have.
 */
export function syncOffListFromStorageValue(value: unknown): {
  readonly value: SyncOffListValue;
  readonly malformed: boolean;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { value: emptySyncOffList(), malformed: true };
  }
  const record = value as Record<string, unknown>;
  const storedVersion = record['version'];
  const storedPages = record['pages'];
  if (typeof storedPages !== 'object' || storedPages === null || Array.isArray(storedPages)) {
    return { value: emptySyncOffList(), malformed: true };
  }

  let malformed = storedVersion !== 1;
  const pages: Record<string, readonly string[]> = {};
  for (const [pageKey, storedNames] of Object.entries(storedPages as Record<string, unknown>)) {
    if (pageKey === '') {
      malformed = true;
      continue;
    }
    if (!Array.isArray(storedNames)) {
      malformed = true;
      continue;
    }
    const names = uniqueAuthorNames(
      (storedNames as readonly unknown[]).filter(
        (name: unknown): name is string => typeof name === 'string',
      ),
    );
    if (names.length !== (storedNames as readonly unknown[]).length) {
      malformed = true;
    }
    if (names.length === 0) {
      // `A187`: a page with no name on it is not in the record at all.
      continue;
    }
    pages[pageKey] = names;
  }
  return { value: { version: 1, pages }, malformed };
}

/** The stored record, ready to be written: the shape `syncOffListFromStorageValue` reads. */
export function syncOffListValueOf(pages: Record<string, readonly string[]>): SyncOffListValue {
  const cleaned: Record<string, readonly string[]> = {};
  for (const [pageKey, authorNames] of Object.entries(pages)) {
    const names = uniqueAuthorNames(authorNames);
    if (pageKey === '' || names.length === 0) {
      continue;
    }
    cleaned[pageKey] = names;
  }
  return { version: 1, pages: cleaned };
}

/**
 * The off list of one page, decoded from an already-read storage value.
 *
 * Split from the read so the page's memory can be filled from a value a caller already
 * holds, and so the whole decode is testable without a port.
 */
export function offListOfPage(value: unknown, pageKey: string): SyncOffListRead {
  const decoded = syncOffListFromStorageValue(value);
  const names = decoded.value.pages[pageKey];
  return {
    authorNames: names === undefined ? [] : [...names],
    malformed: decoded.malformed,
  };
}

/** `true` when `authorName` is on the list, by core `isSameAuthor` (`A99`). */
export function isAuthorOff(authorNames: readonly string[], authorName: string): boolean {
  return authorNames.some((candidate: string) => isSameAuthor(candidate, authorName));
}

/**
 * The list with one author switched off (add) or on (remove). The answer is a new
 * array, so a caller can keep the list it was given.
 *
 * A name that is already in the asked state leaves the list unchanged, which is what
 * makes a repeated press idempotent instead of growing the record.
 */
export function withAuthorOff(
  authorNames: readonly string[],
  authorName: string,
  off: boolean,
): string[] {
  const names = uniqueAuthorNames(authorNames);
  if (off) {
    return isAuthorOff(names, authorName) ? names : [...names, authorName.trim()];
  }
  return names.filter((candidate: string) => !isSameAuthor(candidate, authorName));
}

/**
 * The list reduced to the authors a load actually answered with (`A188`).
 *
 * Order is the order `answeredAuthorNames` gave, so the stored list follows the page's
 * own first-appearance order and cannot keep a departed author alive: a name the server
 * no longer returns is simply not in the answer, so it is not in the answer's list.
 */
export function offListOfLoad(
  authorNames: readonly string[],
  answeredAuthorNames: readonly string[],
): string[] {
  const answered = uniqueAuthorNames(answeredAuthorNames);
  const kept: string[] = [];
  for (const answeredName of answered) {
    if (isAuthorOff(authorNames, answeredName)) {
      kept.push(answeredName);
    }
  }
  return kept;
}

/**
 * The unique author names of one load's notes, in first-appearance order.
 *
 * The caller hands its own list in already decoded order (`ForeignNote.entry.authorName`
 * of the memory after `replace`), so this module reads the wire of no other layer.
 */
export function authorNamesOf(notes: readonly { readonly authorName: string }[]): string[] {
  return uniqueAuthorNames(notes.map((note) => note.authorName));
}

/**
 * Reads the off list of one page (`A188`). One `get` of the single key; a port that
 * throws or a value that is not the record answers an empty list, never a throw.
 */
export async function loadOffAuthorNames(
  port: StoragePort,
  pageKey: string,
): Promise<SyncOffListRead> {
  let items: Record<string, unknown>;
  try {
    items = await port.get([SYNC_OFF_KEY]);
  } catch {
    return { authorNames: [], malformed: true };
  }
  return offListOfPage(items[SYNC_OFF_KEY], pageKey);
}

/**
 * Writes the off list of one page (`A187`), merged into the record the store holds.
 *
 * An empty list **removes** the page from the record; when nothing is left the record
 * itself is removed, so the key a reader inspects holds no empty page and no vestige of
 * a page they finished with. Nothing but author names is ever written.
 *
 * A read that throws is reported as `unavailable` and writes nothing: a merge over a
 * record this function could not read would drop every other page's decisions.
 */
export async function saveOffAuthorNames(
  port: StoragePort,
  pageKey: string,
  authorNames: readonly string[],
): Promise<SyncOffListWrite> {
  let current: unknown;
  try {
    current = (await port.get([SYNC_OFF_KEY]))[SYNC_OFF_KEY];
  } catch {
    return { ok: false, code: 'unavailable' };
  }

  const pages: Record<string, readonly string[]> = {
    ...syncOffListFromStorageValue(current).value.pages,
  };
  const names = uniqueAuthorNames(authorNames);
  if (names.length === 0) {
    delete pages[pageKey];
  } else {
    pages[pageKey] = names;
  }

  if (Object.keys(pages).length === 0) {
    const removed = await attemptWrite(async () => {
      await port.remove([SYNC_OFF_KEY]);
    });
    return removed.ok ? { ok: true, authorNames: [] } : { ok: false, code: removed.code };
  }

  const written = await attemptWrite(async () => {
    await port.set({ [SYNC_OFF_KEY]: syncOffListValueOf(pages) });
  });
  return written.ok ? { ok: true, authorNames: names } : { ok: false, code: written.code };
}