/**
 * Storage key vocabulary of the entry store.
 *
 * Pure module: no DOM, no `chrome.*`, no Node APIs. The key layout is owned by
 * `docs/specs/inline-comment-model.md` (Rules / Semantics -> Storage).
 *
 * Layout (decision `A7`): a storage key never contains a raw URL. The page slot is
 * `notes:v1:<slotKey>`, where `<slotKey>` comes from `slot-key.ts` and uses only
 * `[A-Za-z0-9_%-]`; the page key behind a slot is read back from the `pages:v1`
 * index (`page-index.ts`), not from the key text. Page identity itself
 * (`pageKey` normalization and the path-only fallback) lives in `page-key.ts`.
 */

import { isSlotKey, slotKeyFor } from './slot-key';

/** Prefix of every per-page entry list key: `notes:v1:<slotKey>`. */
export const ENTRY_KEY_PREFIX = 'notes:v1:';

/** Single settings key holding `{ name }`. */
export const SETTINGS_KEY = 'settings:v1';

/** Single index key holding `{ version: 1, pageKeys: string[] }`. */
export const PAGE_INDEX_KEY = 'pages:v1';

/** Builds the storage key of the entry list for an already normalized `pageKey`. */
export function entryStorageKey(pageKey: string): string {
  return `${ENTRY_KEY_PREFIX}${slotKeyFor(pageKey)}`;
}

/** `true` when a storage key addresses a page entry list. */
export function isEntryStorageKey(storageKey: string): boolean {
  if (!storageKey.startsWith(ENTRY_KEY_PREFIX)) {
    return false;
  }
  return isSlotKey(storageKey.slice(ENTRY_KEY_PREFIX.length));
}

/**
 * Slot part of a page entry key, `null` for keys that are not entry lists. The
 * slot is not a page key: resolve it through the `pages:v1` index.
 */
export function slotKeyFromStorageKey(storageKey: string): string | null {
  if (!isEntryStorageKey(storageKey)) {
    return null;
  }
  return storageKey.slice(ENTRY_KEY_PREFIX.length);
}
