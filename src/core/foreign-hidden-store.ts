/**
 * The `foreign-hidden:v1` record: which foreign authors the reader hid on which
 * page (ruling `A184`, task `t18-01`).
 *
 * Rule owner: `docs/specs/sync-integration.md`
 * (Rules / Semantics -> "The hidden author flag survives a reload").
 *
 * Why this record exists: the foreign notes of a page live in the content
 * script's memory (`A163`), so a popup checkbox pressed to hidden was lost on
 * every reload and the reader had to press it again. What is persisted here is
 * **one flag per foreign author per page**, never a note: the note itself is
 * still memory only, never written to `chrome.storage.local`, never in a
 * payload. The record is a best-effort shadow of the memory, never a gate:
 *
 * - a read never throws — an absent value, an unreadable value and a failed read
 *   all answer `[]`, because "I could not read the flags" is "no author is
 *   hidden" for a load that must paint either way (`A164` posture);
 * - a malformed record is overwritten by the next write, not preserved, for the
 *   same reason a slot's malformed value is replaceable;
 * - a write failure propagates to the caller, and the page swallows it — the
 *   in-memory answer it already gave is the truth the reader sees.
 *
 * Key layout: one single record under `FOREIGN_HIDDEN_KEY`, the page key stored
 * verbatim inside `pages`. The slot-key machinery of `notes:v1:` is deliberately
 * not reused: this record needs no per-page key, no index and no cross-page
 * enumeration, and the page keys stored here are the keys the paint pass
 * resolved — the same keys the entry slots are filed under — never an address
 * derived in the content layer.
 *
 * Author names are stored and matched verbatim through `isSameAuthor` at the
 * callers' side (`content/sync/foreign-notes.ts` -> `replace`); this module owns
 * the record shape and the read/write discipline and nothing about foreignness.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no network. The only impure
 * collaborator is the injected `StoragePort`.
 */

import type { StoragePort } from './storage-port';
import { attemptWrite } from './storage-port';
import { FOREIGN_HIDDEN_KEY } from './storage-keys';

/** Stored value of `foreign-hidden:v1`. */
export interface ForeignHiddenValue {
  version: 1;
  /** Hidden author names per resolved page key. An absent page answers none. */
  pages: Record<string, string[]>;
}

/** The empty record: every foreign author visible on every page. */
export function emptyForeignHiddenValue(): ForeignHiddenValue {
  return { version: 1, pages: {} };
}

/**
 * `true` when the value really is a record of this key.
 *
 * An unknown shape — an older build's leftover, a damaged value, a different
 * extension's record — is not read as flags: the shape check at the boundary is
 * what keeps a `pages` of `undefined` from being indexed.
 */
function isForeignHiddenValue(value: unknown): value is ForeignHiddenValue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record['version'] !== 1 || typeof record['pages'] !== 'object' || record['pages'] === null) {
    return false;
  }
  const pages = record['pages'] as Record<string, unknown>;
  return Object.values(pages).every(
    (authors) =>
      Array.isArray(authors) && authors.every((name) => typeof name === 'string' && name !== ''),
  );
}

/**
 * The hidden author names of one page, `[]` when none are.
 *
 * Never throws (`A184`): a failed read, an absent value and a malformed record
 * all answer the empty array, because a load that must paint cannot be gated by
 * a flag it could not read. A page key that is absent from the record answers
 * `[]` too — the array is only as long as the reader hid.
 */
export async function loadHiddenAuthorsOfPage(
  port: StoragePort,
  pageKey: string,
): Promise<string[]> {
  try {
    const stored = await port.get([FOREIGN_HIDDEN_KEY]);
    const value = stored[FOREIGN_HIDDEN_KEY];
    if (!isForeignHiddenValue(value)) {
      return [];
    }
    const authors = value.pages[pageKey];
    return Array.isArray(authors) ? [...authors] : [];
  } catch {
    // A read that throws answers `[]`: the flags are a shadow of the memory, and
    // a load that cannot read them still paints and still answers the popup.
    return [];
  }
}

/**
 * The guarded write of one author's flag (`A184`).
 *
 * One read, then one write of the whole record — the same guarded-read shape
 * every other core write uses, because a blind write would drop every other
 * page's flags. A malformed or absent record is rebuilt from the empty record,
 * never preserved. `hidden: true` adds the author (deduplicated, appended at the
 * end), `hidden: false` removes them; removing a name that is not stored is a
 * no-op that still writes nothing.
 *
 * The write failure propagates: the page is what swallows it, because the
 * in-memory switch already answered the popup and the persistence is a
 * best-effort shadow (`A164` posture), not a gate.
 */
export async function setForeignAuthorHidden(
  port: StoragePort,
  input: { pageKey: string; authorName: string; hidden: boolean },
): Promise<void> {
  let current: ForeignHiddenValue;
  try {
    const stored = await port.get([FOREIGN_HIDDEN_KEY]);
    const value = stored[FOREIGN_HIDDEN_KEY];
    current = isForeignHiddenValue(value) ? value : emptyForeignHiddenValue();
  } catch {
    // "I could not read the flags" is not "the flags are gone": the write is
    // built over the empty record so one other page's flags may be lost rather
    // than every write refusing forever. This is the read-half's `[]` posture
    // carried to the write: the flags are a shadow, not a ledger.
    current = emptyForeignHiddenValue();
  }
  const authors = current.pages[input.pageKey] ?? [];
  let next: string[];
  if (input.hidden) {
    next = authors.includes(input.authorName) ? authors : [...authors, input.authorName];
  } else {
    if (!authors.includes(input.authorName)) {
      return;
    }
    next = authors.filter((name) => name !== input.authorName);
  }
  const pages: Record<string, string[]> = { ...current.pages };
  if (next.length === 0) {
    delete pages[input.pageKey];
  } else {
    pages[input.pageKey] = next;
  }
  const result = await attemptWrite(() =>
    port.set({ [FOREIGN_HIDDEN_KEY]: { version: 1, pages } as ForeignHiddenValue }),
  );
  if (!result.ok) {
    throw new Error(`foreign-hidden write failed: ${result.code}`);
  }
}
