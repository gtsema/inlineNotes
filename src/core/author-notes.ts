/**
 * One author's notes across **every** page of the store: the rename half of the
 * settings contract.
 *
 * Task `t17-04`, rulings `A173` and `A174`. A rename from `A` to `B` means the
 * previous name's notes are no longer the reader's, so they are deleted from
 * `chrome.storage.local` on every page the index lists. This module owns that
 * deletion, and the options page owns the warning and the order of the two writes.
 *
 * Why this module exists beside `deleteEntriesOfAuthor`: that operation removes one
 * author's entries of **one** page and takes the page's address. A rename has no
 * address — the reader is on the settings page, not on the article — so the pages
 * have to be found through the index, and the sweep must survive a page that cannot
 * be read. Both rules are here, and neither is a new storage write: every page is
 * cleaned by the same `deleteEntriesOfAuthor` call the popup's group `Удалить`
 * makes, so the write policy, the `A16` carry-through of unreadable records and the
 * `isSameAuthor` filter are exactly the ones that already shipped.
 *
 * The three rules this module owns:
 *
 * - **the sweep covers every listed page** (`A173`). The page index is read once and
 *   its `pageKeys` are swept in order; a page key with an empty slot is answered by
 *   `deleteEntriesOfAuthor` with no write at all, so the sweep costs nothing on a
 *   page the author never wrote on.
 * - **an unreadable page does not stop the sweep, and is not silent** (`A173`,
 *   `A174`). A page whose index or slot cannot be read keeps its notes and its code
 *   is reported in `failed`, so the caller can tell the reader which state they are
 *   in. Stopping at the first failure would leave the pages after it untouched and
 *   would hide the failure; swallowing it would be a partial deletion the reader
 *   never hears about.
 * - **nothing here calls the server** (`A173`). The module imports no transport and
 *   no sync module at all: the deletion is local, and the server keeps what it has
 *   until the reader syncs.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The only
 * impure collaborator is the injected `StoragePort`.
 */

import type { Entry } from './entry';
import type { EntryWriteCode } from './entry-store-write';
import { deleteEntriesOfAuthor } from './entry-store-write';
import type { PageIndexCode } from './page-index-store';
import { readPageIndex } from './page-index-store';
import type { StorageFailureCode, StoragePort } from './storage-port';

/** One page the sweep could not clean, with the code its write answered. */
export interface AuthorSweepFailure {
  /** Page key as the index listed it. */
  pageKey: string;
  /** Why this page's notes were not deleted. */
  code: EntryWriteCode;
}

/**
 * Result of `deleteNotesOfAuthorOnAllPages`.
 *
 * `removed` lists what the sweep deleted, in the order the index listed the pages;
 * `failed` lists the pages it could not clean. A sweep that removed nothing and
 * failed nowhere is `{ ok: true, removed: [], failed: [] }` and performed no port
 * write, because there was nothing to lose.
 */
export type AuthorSweepResult =
  | {
      ok: true;
      /** Every entry the sweep deleted, in sweep order. */
      removed: Entry[];
      /** Pages whose notes stayed; empty for a complete sweep. */
      failed: AuthorSweepFailure[];
    }
  | {
      ok: false;
      /** The index itself could not be read, so no page could be swept. */
      code: PageIndexCode | StorageFailureCode;
      /** Every entry the sweep deleted, in sweep order. */
      removed: Entry[];
      /** Pages whose notes stayed; empty for a complete sweep. */
      failed: AuthorSweepFailure[];
    };

/**
 * Codes that make the stored index unusable for a sweep: the index value is another
 * layout or is not an index, or the port failed so the real index is unknown. In all
 * three cases the pages that exist are unknown, and sweeping a guessed list would
 * delete notes of a page the index never named — so the sweep refuses and writes
 * nothing, exactly like a single-page write refuses on the same codes.
 *
 * `page_key_invalid` and `page_key_unnormalized` are **not** in this set: both come
 * with a usable index, and an indexed key that is merely unnormalized still owns a
 * reachable slot, so its notes are swept like any other page's.
 */
function isUnusableIndexCode(code: PageIndexCode): boolean {
  return code === 'layout_version' || code === 'index_malformed' || code === 'storage_unavailable';
}

/**
 * Deletes every note whose `authorName` is `authorName`, on every page the stored
 * index lists (ruling `A173`).
 *
 * Each page is cleaned by one `deleteEntriesOfAuthor` call, which is the shipped
 * one-slot-write-plus-one-index-write policy and the shipped `isSameAuthor` filter:
 * notes of other authors are kept byte for byte and unreadable records are carried
 * through verbatim (`A16`). A page that cannot be read keeps its notes and is listed
 * in `failed`; the sweep continues with the next page, so one damaged page cannot
 * keep the previous name's notes on the pages after it.
 *
 * The server is never called: the deletion is local, and the server keeps what it
 * has until the reader syncs (`A173`).
 */
export async function deleteNotesOfAuthorOnAllPages(
  port: StoragePort,
  authorName: string,
): Promise<AuthorSweepResult> {
  const indexRead = await readPageIndex(port);
  const unusable = indexRead.codes.find(isUnusableIndexCode);
  if (unusable !== undefined) {
    return { ok: false, code: unusable, removed: [], failed: [] };
  }

  const removed: Entry[] = [];
  const failed: AuthorSweepFailure[] = [];
  for (const pageKey of indexRead.index.pageKeys) {
    const page = await deleteEntriesOfAuthor(port, { url: pageKey, authorName });
    if (!page.ok) {
      failed.push({ pageKey, code: page.code });
      continue;
    }
    removed.push(...page.entries);
  }

  return { ok: true, removed, failed };
}
