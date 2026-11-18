/**
 * The page→slot mapping of the entry store.
 *
 * A `pageKey` is a whole URL, so it cannot be pasted into a `chrome.storage.local`
 * key: the layout owned by `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> Storage) puts the page identity behind an encoded slot key.
 *
 * Encoding rule: every code point outside `[A-Za-z0-9_-]` becomes its uppercase
 * `%XX` UTF-8 escape, so the output alphabet is `[A-Za-z0-9_%-]` and
 * `decodeURIComponent(slotKeyFor(pageKey)) === pageKey` for every page key. The
 * raw URL therefore never appears in a storage key.
 *
 * Length rule: an escaped key longer than `SLOT_KEY_ESCAPE_BUDGET` is replaced by
 * its first `SLOT_KEY_TRUNCATED_PREFIX` escaped characters, then
 * `SLOT_KEY_HASH_SEPARATOR`, then `slotKeyHash(pageKey)` — `fnv1a32` of the whole
 * page key in base36 padded to `SLOT_KEY_HASH_LENGTH` characters. The truncation
 * branch produces at most `SLOT_KEY_MAX_LENGTH` characters and no slot key exceeds
 * `SLOT_KEY_ESCAPE_BUDGET` (246, review finding `N2`), so `notes:v1:` (9) + slot
 * key is at most 255 characters: strictly inside the 256-character key budget,
 * with one character of headroom instead of none. A truncated slot key is not reversible: the page key
 * is read back from the `pages:v1` index (`page-index.ts`).
 *
 * Accepted trade-off: two page keys that share a `SLOT_KEY_TRUNCATED_PREFIX`
 * escaped prefix and collide in the 32-bit FNV-1a hash would share one slot. The
 * hash covers the whole page key, so the risk is documented as acceptable for a
 * personal note store; the index keeps both page keys and `resolvePageKey` still
 * prefers an exact match.
 *
 * Separator invariant: `SLOT_KEY_HASH_SEPARATOR` (`~`) is outside `[A-Za-z0-9_-]`,
 * so the escape never emits it and a page key containing `~` produces `%7E`. No
 * page key can forge the separator.
 *
 * Determinism: pure and total over well-formed strings; no DOM, no `chrome.*`,
 * no clock, no randomness, no `node:*` module. A lone surrogate code unit makes
 * `encodeURIComponent` throw; page keys come from `pageKeyFromUrl`, which only
 * emits well-formed Unicode, so the case is out of scope here.
 */

/**
 * Escaped slot keys up to this length are kept whole. 246 keeps the composed
 * storage key strictly below 256 (`ENTRY_KEY_PREFIX` is 9 characters), which is
 * the headroom review finding `N2` asked for.
 */
export const SLOT_KEY_ESCAPE_BUDGET = 246;

/** Escaped characters kept from the front of an over-budget key. */
export const SLOT_KEY_TRUNCATED_PREFIX = 200;

/** Separates the kept prefix from the hash of an over-budget key. */
export const SLOT_KEY_HASH_SEPARATOR = '~';

/** Width of the base36 hash suffix. */
export const SLOT_KEY_HASH_LENGTH = 7;

/** Longest slot key the truncation branch produces (`200 + 1 + 7`). */
export const SLOT_KEY_MAX_LENGTH = 208;

/**
 * Alphabet of the escaped part of a slot key: the safe characters plus the
 * percent escape character. `~` is deliberately absent: the escape never emits it,
 * so the only `~` in a slot key is the truncation separator.
 */
const SLOT_KEY_ESCAPE_ALPHABET = /^[A-Za-z0-9_%-]+$/;

/**
 * Whole shape of a slot key: escaped characters, optionally cut at
 * `SLOT_KEY_HASH_SEPARATOR` followed by exactly `SLOT_KEY_HASH_LENGTH` base36
 * characters. A `~` anywhere else (or a hash of another width) is not a slot key.
 */
const SLOT_KEY_SHAPE = new RegExp(
  `^[A-Za-z0-9_%-]+${SLOT_KEY_HASH_SEPARATOR}[0-9a-z]{${SLOT_KEY_HASH_LENGTH}}$`,
);

/** One code point that the escape leaves untouched. */
const SLOT_SAFE_CODE_POINT = /[A-Za-z0-9_-]/;

/**
 * `true` when a value is a slot key this module could have produced: characters
 * from the escape alphabet, at most `SLOT_KEY_ESCAPE_BUDGET` of them, and a `~`
 * only as the truncation separator in front of a fixed-width base36 hash.
 */
export function isSlotKey(value: string): boolean {
  if (value.length === 0 || value.length > SLOT_KEY_ESCAPE_BUDGET) {
    return false;
  }
  return SLOT_KEY_ESCAPE_ALPHABET.test(value) || SLOT_KEY_SHAPE.test(value);
}

/**
 * Slot key of an already normalized `pageKey`: reversible with
 * `decodeURIComponent` while the escaped form fits `SLOT_KEY_ESCAPE_BUDGET`,
 * truncated plus hashed when it does not.
 */
export function slotKeyFor(pageKey: string): string {
  const normalized = pageKey.trim();
  if (normalized.length === 0) {
    throw new Error('slotKeyFor: pageKey must not be empty');
  }

  const escaped = escapePageKey(normalized);
  if (escaped.length <= SLOT_KEY_ESCAPE_BUDGET) {
    return escaped;
  }

  return `${escaped.slice(0, SLOT_KEY_TRUNCATED_PREFIX)}${SLOT_KEY_HASH_SEPARATOR}${slotKeyHash(normalized)}`;
}

/** Base36 `fnv1a32` of a page key, padded to `SLOT_KEY_HASH_LENGTH` characters. */
export function slotKeyHash(pageKey: string): string {
  return fnv1a32(pageKey).toString(36).padStart(SLOT_KEY_HASH_LENGTH, '0');
}

/**
 * FNV-1a 32-bit over the Unicode code points of `value`. Stable across runs and
 * platforms. Two consumers, and only the second one is this file: the length rule above
 * uses it to disambiguate a truncated slot key, and ruling `A102` made it the author half
 * of the `paint slot` mapping in `src/content/paint/paint-palette.ts`, which is why the
 * function is exported and why its arithmetic may not change without moving a reader's
 * colour.
 */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (const codePoint of value) {
    hash = Math.imul(hash ^ (codePoint.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Escapes every unsafe code point of a page key. */
function escapePageKey(pageKey: string): string {
  let escaped = '';
  for (const codePoint of pageKey) {
    escaped += SLOT_SAFE_CODE_POINT.test(codePoint) ? codePoint : escapeCodePoint(codePoint);
  }
  return escaped;
}

/**
 * `%XX` escape of one code point, uppercase, one group per UTF-8 byte.
 * `encodeURIComponent` already produces that form for everything it escapes, and
 * leaves the ASCII literals `. ! ~ ' ( ) *` alone; those get an explicit escape.
 */
function escapeCodePoint(codePoint: string): string {
  const encoded = encodeURIComponent(codePoint);
  if (encoded !== codePoint) {
    return encoded;
  }
  const codeUnit = codePoint.charCodeAt(0);
  return `%${codeUnit.toString(16).toUpperCase().padStart(2, '0')}`;
}
