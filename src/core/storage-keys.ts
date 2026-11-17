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

/**
 * `true` when a change to `storageKey` can change what one page shows (task `t4-03`
 * AC2 and AC3, ruling `A60`).
 *
 * This is key vocabulary, not page policy: the two keys that describe a page are that
 * page's own entry slot and the single settings record, and what to do about a change
 * is decided by the caller. The page index is deliberately absent — `pages:v1` names
 * no page's records, and a write to another page's slot updates the index as well, so
 * treating the index as the signal would make every open tab repaint for every note
 * stored anywhere, which is the "a key belonging to a **different** page's slot
 * triggers no work" half of ruling `A60`.
 *
 * `pageKey` is the page key the caller's last read resolved, or `null` when that read
 * produced no page key; with no page key only the settings key can matter. The
 * comparison composes the slot key through `entryStorageKey`, so no caller has to
 * decode a slot back into a page key (`inline-comment-model.md` -> "Slot key decode
 * invariant").
 *
 * Total over every `pageKey` this extension can produce, and that is the whole
 * guarantee: an empty or whitespace-only `pageKey` answers `false` for entry keys
 * instead of reaching the `slotKeyFor` guard that refuses one, so a change record is
 * never a throw path for a listener. The boundary is malformed input, which no shipped
 * reader produces and which this module deliberately does not guard: a `pageKey`
 * holding a lone surrogate code unit still throws through `entryStorageKey` ->
 * `slotKeyFor` -> `escapeCodePoint`, exactly the input `slot-key.ts` declares out of
 * scope because page keys come from `pageKeyFromUrl`, which emits well-formed Unicode
 * only. A guard here would be a new core rule, so the exception stays where it is
 * declared and this module stays key vocabulary.
 */
export function storageChangeConcernsPage(storageKey: string, pageKey: string | null): boolean {
  if (storageKey === SETTINGS_KEY) {
    return true;
  }
  if (pageKey === null || pageKey.trim().length === 0) {
    return false;
  }
  return storageKey === entryStorageKey(pageKey);
}
