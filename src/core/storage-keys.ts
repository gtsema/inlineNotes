/**
 * Storage key vocabulary of the entry store.
 *
 * Pure module: no DOM, no `chrome.*`, no Node APIs. The key layout is owned by
 * `docs/specs/inline-comment-model.md` (Rules / Semantics -> Storage).
 *
 * Page identity itself (`pageKey` normalization and the path-only fallback) is a
 * separate rule and arrives in task `t1-02`; this module only composes keys.
 */

/** Prefix of every per-page entry list key: `notes:v1:<pageKey>`. */
export const ENTRY_KEY_PREFIX = 'notes:v1:';

/** Single settings key holding `{ name }`. */
export const SETTINGS_KEY = 'settings:v1';

/** Builds the storage key of the entry list for an already normalized `pageKey`. */
export function entryStorageKey(pageKey: string): string {
  const normalized = pageKey.trim();
  if (normalized.length === 0) {
    throw new Error('entryStorageKey: pageKey must not be empty');
  }
  return `${ENTRY_KEY_PREFIX}${normalized}`;
}

/** Reads the `pageKey` back out of a storage key, `null` for non-entry keys. */
export function pageKeyFromStorageKey(storageKey: string): string | null {
  if (!storageKey.startsWith(ENTRY_KEY_PREFIX)) {
    return null;
  }
  const pageKey = storageKey.slice(ENTRY_KEY_PREFIX.length).trim();
  return pageKey.length > 0 ? pageKey : null;
}
