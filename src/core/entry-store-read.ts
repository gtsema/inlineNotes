/**
 * Reading one page's entries through the storage seam.
 *
 * This module owns the decode boundary: whatever `chrome.storage.local` hands back
 * is untrusted JSON, and nothing may reach `canEdit`, the popup list or the
 * overlap check without passing the guard here. A record that does not have the
 * stored shape is skipped and counted, never rewritten and never deleted, so a
 * future layout can still read it and the user never loses data silently.
 *
 * Rule owner: `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> "Decode on read", "Index repair", "Page lookup").
 *
 * Decode defaults (PM ruling `A1`, reviewer remark `R2` lineage):
 * - unknown fields are ignored: the decoded `Entry` carries the contract fields
 *   and nothing else;
 * - `visible` absent means `true`;
 * - `createdAt` / `updatedAt` must be UTC ISO-8601 stamps with a literal `Z`
 *   (ruling `A9`), because lexical order of those two fields is the popup order;
 * - a malformed record is skipped and counted (`corruptCount`), never removed
 *   from storage.
 *
 * Index repair on read: a `pageKey` that `pages:v1` lists while its slot holds no
 * entry at all is dropped from the index (`removeFromIndex` keeps the order of the
 * rest). A slot that still holds a malformed record keeps its index entry, because
 * dropping it would make the unreadable data unreachable, which is a silent delete.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The only
 * impure collaborator is the injected `StoragePort`. Storage is written by exactly
 * one call here: the index repair.
 */

import type { Entry, EntryAnchor } from './entry';
import { resolvePageKey } from './page-index';
import type { PageIndexCode } from './page-index-store';
import { readPageIndex, removeFromIndexAndPublish } from './page-index-store';
import { pageKeyFromUrl } from './page-key';
import type { StoragePort } from './storage-port';
import { entryStorageKey } from './storage-keys';

/**
 * Stamp shape of ruling `A9`: UTC ISO-8601 with a literal `Z`, optional
 * milliseconds. It is deliberately stricter than `Date.parse` so the lexical
 * ordering the popup relies on is guaranteed.
 */
export const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Machine code explaining what the page-slot decode found. */
export type PageSlotCode =
  /** Stored slot `version` is not `1`. */
  | 'layout_version'
  /** Stored slot is not a `{ version, entries }` object. */
  | 'slot_malformed'
  /** At least one record inside `entries` was skipped. */
  | 'entry_malformed';

/** Every code `loadEntries` can report. */
export type PageLoadCode =
  | PageIndexCode
  | PageSlotCode
  /** The URL produced no page key, so no page can be read. */
  | 'url_unparsable'
  /** An orphan index entry was dropped and the index write succeeded. */
  | 'index_repaired'
  /** An orphan index entry was found and the index write failed. */
  | 'index_repair_failed';

/** Decoded content of one page slot. */
export interface PageEntryList {
  /** Entries that passed the guard, in stored order. */
  entries: Entry[];
  /** Records that were skipped; they stay in storage untouched. */
  corruptCount: number;
  /** Codes describing the slot value itself. */
  codes: readonly PageSlotCode[];
}

/** Result of reading one page. */
export interface PageEntriesResult {
  /** Page key the entries were read under, `null` for an unparsable URL. */
  pageKey: string | null;
  /** Decoded entries in stored order; popup ordering is `sortByCreatedAtAsc`. */
  entries: Entry[];
  /** Records skipped by the guard. */
  corruptCount: number;
  /** Codes describing the whole read. */
  codes: readonly PageLoadCode[];
}

/**
 * Strict guard for a complete stored record: every contract field has its type,
 * `visible` is present. Unknown fields are allowed, because the layout may gain
 * fields before an older reader sees them. A record that only lacks `visible` is
 * not an `Entry` yet it is still decodable (ruling `A1`), so the read path uses
 * `decodeEntry`.
 */
export function isEntry(value: unknown): value is Entry {
  if (!isRecord(value) || typeof value['visible'] !== 'boolean') {
    return false;
  }
  return decodeEntry(value) !== null;
}

/**
 * Decodes one stored record into a clean `Entry`, or `null` when the record is
 * malformed. Unknown fields are dropped, `visible` falls back to `true` (ruling
 * `A1`), and every kept value is re-copied so a later mutation of the decoded
 * object cannot reach the stored value.
 */
export function decodeEntry(value: unknown): Entry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value['id'];
  const pageKey = value['pageKey'];
  const authorName = value['authorName'];
  const text = value['text'];
  const comment = value['comment'];
  const createdAt = value['createdAt'];
  const updatedAt = value['updatedAt'];
  const anchor = readAnchor(value['anchor']);

  if (anchor === null) {
    return null;
  }
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  if (typeof pageKey !== 'string' || pageKey.length === 0) {
    return null;
  }
  if (typeof authorName !== 'string' || typeof text !== 'string' || typeof comment !== 'string') {
    return null;
  }
  if (!isTimestamp(createdAt) || !isTimestamp(updatedAt)) {
    return null;
  }

  const visible = value['visible'];
  return {
    id,
    pageKey,
    authorName,
    text,
    comment,
    anchor,
    visible: typeof visible === 'boolean' ? visible : true,
    createdAt,
    updatedAt,
  };
}

/**
 * Decodes the value of one page slot: `{ version: 1, entries: Entry[] }`.
 * A missing slot is an empty page, not an error. Records are decoded one by one,
 * so a single malformed record costs one entry and nothing else.
 */
export function entryListFromStorageValue(value: unknown): PageEntryList {
  if (value === undefined || value === null) {
    return { entries: [], corruptCount: 0, codes: [] };
  }
  if (!isRecord(value)) {
    return { entries: [], corruptCount: 0, codes: ['slot_malformed'] };
  }
  if (value['version'] !== 1) {
    return { entries: [], corruptCount: 0, codes: ['layout_version'] };
  }

  const storedEntries = value['entries'];
  if (!Array.isArray(storedEntries)) {
    return { entries: [], corruptCount: 0, codes: ['slot_malformed'] };
  }

  const records: readonly unknown[] = storedEntries;
  const entries: Entry[] = [];
  let corruptCount = 0;
  for (const record of records) {
    const entry = decodeEntry(record);
    if (entry === null) {
      corruptCount += 1;
    } else {
      entries.push(entry);
    }
  }

  const codes: PageSlotCode[] = corruptCount > 0 ? ['entry_malformed'] : [];
  return { entries, corruptCount, codes };
}

/**
 * Reads one page: resolve the page key through the index
 * (`resolvePageKey(url, index) ?? pageKeyFromUrl(url)`, review finding `N5`),
 * decode its slot, and repair an index entry whose slot holds nothing.
 *
 * The repair is the only storage write in this module. It is reached only when the
 * slot is absent or holds a well-formed list with zero entries: a slot with a
 * foreign `version`, a slot that is not a slot object at all, or a slot that still
 * holds a malformed record keeps its index entry, because dropping the key would
 * make the unreadable data unreachable, which is a silent delete.
 */
export async function loadEntries(port: StoragePort, url: string): Promise<PageEntriesResult> {
  const indexRead = await readPageIndex(port);
  const codes: PageLoadCode[] = [...indexRead.codes];

  const pageKey = resolvePageKey(url, indexRead.index) ?? pageKeyFromUrl(url);
  if (pageKey === null) {
    codes.push('url_unparsable');
    return { pageKey: null, entries: [], corruptCount: 0, codes };
  }

  const storageKey = entryStorageKey(pageKey);
  let items: Record<string, unknown>;
  try {
    items = await port.get([storageKey]);
  } catch {
    codes.push('storage_unavailable');
    return { pageKey, entries: [], corruptCount: 0, codes };
  }

  const slot = entryListFromStorageValue(items[storageKey]);
  codes.push(...slot.codes);

  const listedInIndex = indexRead.index.pageKeys.includes(pageKey);
  const slotHoldsNothing =
    slot.codes.length === 0 && slot.entries.length === 0 && slot.corruptCount === 0;
  if (listedInIndex && slotHoldsNothing) {
    const repair = await removeFromIndexAndPublish(port, indexRead.index, pageKey);
    codes.push(repair.write.ok ? 'index_repaired' : 'index_repair_failed');
  }

  return { pageKey, entries: slot.entries, corruptCount: slot.corruptCount, codes };
}

/** Anchor contract check: three strings plus a non-negative integer fragment count. */
function readAnchor(value: unknown): EntryAnchor | null {
  if (!isRecord(value)) {
    return null;
  }
  const text = value['text'];
  const prefix = value['prefix'];
  const suffix = value['suffix'];
  const fragmentCount = value['fragmentCount'];
  if (typeof text !== 'string' || typeof prefix !== 'string' || typeof suffix !== 'string') {
    return null;
  }
  if (typeof fragmentCount !== 'number' || !Number.isInteger(fragmentCount) || fragmentCount < 0) {
    return null;
  }
  return { text, prefix, suffix, fragmentCount };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_UTC_TIMESTAMP_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
