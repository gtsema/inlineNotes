/**
 * The `pages:v1` index: the ordered list of page keys the store knows about.
 *
 * Pure module: no DOM, no `chrome.*`, no clock, no randomness. The rule is owned
 * by `docs/specs/inline-comment-model.md` (Rules / Semantics -> "Page index").
 *
 * Why the index exists: a storage key carries an encoded slot key
 * (`slot-key.ts`), so a page key can no longer be read back out of a storage key,
 * and `Object.keys` order of a storage area is not authoritative. The index is the
 * single ordered source of page keys, which makes the path-only fallback
 * deterministic: PM ruling `A4` picks the oldest stored variant of a path, and
 * "oldest" means earliest in `pageKeys`.
 *
 * Every helper returns a new `PageIndex` and never mutates its input, so callers
 * can diff the result against the stored value.
 */

import { pageKeyFromUrl, pathOnlyOfPageKey, pathOnlyKey } from './page-key';

/** Value stored under `PAGE_INDEX_KEY`: `{ version: 1, pageKeys: string[] }`. */
export interface PageIndex {
  /** Layout version of the index value. */
  version: 1;
  /** Page keys in insertion order: the earliest entry is the oldest variant. */
  pageKeys: readonly string[];
}

/** Index value of a store that has no page yet. */
export function emptyPageIndex(): PageIndex {
  return { version: 1, pageKeys: [] };
}

/**
 * Appends a page key when absent and keeps the existing order. An already present
 * key leaves the order untouched, so a re-read of a page never makes a newer
 * variant win the path-only fallback.
 */
export function addToIndex(index: PageIndex, pageKey: string): PageIndex {
  const normalized = requirePageKey(pageKey, 'addToIndex');
  if (index.pageKeys.includes(normalized)) {
    return { version: index.version, pageKeys: [...index.pageKeys] };
  }
  return { version: index.version, pageKeys: [...index.pageKeys, normalized] };
}

/** Drops a page key; every other key keeps its position. */
export function removeFromIndex(index: PageIndex, pageKey: string): PageIndex {
  const normalized = pageKey.trim();
  return {
    version: index.version,
    pageKeys: index.pageKeys.filter((candidate: string) => candidate !== normalized),
  };
}

/**
 * Page key of `url` inside the index: an exact normalized match first, otherwise
 * the oldest (earliest in index order) stored key with the same
 * `origin + pathname`. The stored key is returned unchanged, so a page never forks
 * into two entry lists. `null` when nothing matches or the URL is unparsable.
 */
export function resolvePageKey(url: string, index: PageIndex): string | null {
  const exact = pageKeyFromUrl(url);
  if (exact === null) {
    return null;
  }

  for (const candidate of index.pageKeys) {
    if (candidate === exact) {
      return candidate;
    }
  }

  const pathOnly = pathOnlyKey(url);
  if (pathOnly === null) {
    return null;
  }
  for (const candidate of index.pageKeys) {
    if (pathOnlyOfPageKey(candidate) === pathOnly) {
      return candidate;
    }
  }

  return null;
}

function requirePageKey(pageKey: string, caller: string): string {
  const normalized = pageKey.trim();
  if (normalized.length === 0) {
    throw new Error(`${caller}: pageKey must not be empty`);
  }
  return normalized;
}
