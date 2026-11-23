/**
 * The author's pages across the whole store: the read behind the «Мои заметки»
 * page (`A191` of `docs/specs/all-notes-page.md`).
 *
 * Rule owner: `docs/specs/all-notes-page.md`
 * (Rules / Semantics -> "The author pages list").
 *
 * Why this module exists beside `page-notes-query` and `author-notes`: the rename
 * sweep (`author-notes.ts`) walks the index and **deletes**; the popup groups one
 * page and **asks it**; this module walks the index and **lists**. The three rules
 * it owns:
 *
 * - **the list is a read-side projection** (`A191`). The `pages:v1` index is read
 *   once, every listed slot is read through the same `loadEntries` the popup uses,
 *   and the entries are filtered by the same core `isSameAuthor` every "mine"
 *   answer uses. No write, no cap check, no network.
 * - **one row per page with at least one own entry**, carrying the page key, the
 *   own count, the newest `updatedAt` on that page and the first non-empty stored
 *   title of the page's own entries (`A190` fallback: rows without titles answer
 *   `null` and the page shows the page key).
 * - **rows are sorted fresh first**, by `latest` descending — the order the reader
 *   expects from a "where are my notes" list.
 *
 * An index the read guard refuses answers `{ ok: false, code }`, exactly the
 * posture the rename sweep answers with; a listed slot that cannot be read is
 * skipped, not silent-fatal: the reader loses one row, not the whole list.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no network. The only impure
 * collaborator is the injected `StoragePort`.
 */

import type { Entry } from './entry';
import { isSameAuthor } from './entry-rules';
import { loadEntries } from './entry-store-read';
import type { PageLoadCode } from './entry-store-read';
import { readPageIndex } from './page-index-store';
import type { StoragePort } from './storage-port';

/** One page that holds at least one note of the current author. */
export interface AuthorPageRow {
  /** Normalized page identity; the row's link and the delete's page key. */
  pageKey: string;
  /** How many own entries the page holds. */
  count: number;
  /** The newest `updatedAt` among the page's own entries. */
  latest: string;
  /** The first non-empty stored title of the page's own entries; `null` when none. */
  title: string | null;
}

export type AuthorPagesResult =
  | { readonly ok: true; readonly rows: readonly AuthorPageRow[] }
  | { readonly ok: false; readonly code: PageLoadCode };

/**
 * One row per page holding at least one entry of `authorName`, fresh first.
 *
 * `isUnusableIndexCode` lives in `author-notes.ts`'s own vocabulary; the same three
 * codes refuse here, read through the index answer's `codes` list — a missing
 * `pages:v1` is an empty list, not an error, exactly as the sweep answers.
 */
export async function authorPagesOf(
  port: StoragePort,
  authorName: string,
): Promise<AuthorPagesResult> {
  const indexRead = await readPageIndex(port);
  const unusable = indexRead.codes.find(
    (code) => code === 'layout_version' || code === 'index_malformed' || code === 'storage_unavailable',
  );
  if (unusable !== undefined) {
    return { ok: false, code: unusable };
  }

  const rows: AuthorPageRow[] = [];
  for (const pageKey of indexRead.index.pageKeys) {
    const page = await loadEntries(port, pageKey);
    // A slot the read guard refuses costs its own row, not the list: the same
    // partial-sweep honesty the rename sweep reports per page (`A173`).
    if (page.pageKey === null || page.codes.includes('slot_malformed')) {
      continue;
    }
    const own = page.entries.filter((entry: Entry) => isSameAuthor(entry.authorName, authorName));
    if (own.length === 0) {
      continue;
    }
    let latest = own[0]?.updatedAt ?? '';
    let title: string | null = null;
    for (const entry of own) {
      if (entry.updatedAt > latest) {
        latest = entry.updatedAt;
      }
      if (title === null && entry.title !== undefined && entry.title !== '') {
        title = entry.title;
      }
    }
    rows.push({ pageKey, count: own.length, latest, title });
  }

  rows.sort((left, right) => (left.latest > right.latest ? -1 : left.latest < right.latest ? 1 : 0));
  return { ok: true, rows };
}
