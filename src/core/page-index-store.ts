/**
 * Reading and writing the `pages:v1` index through the storage seam.
 *
 * `page-index.ts` owns the pure index rules (order, insertion, lookup); this
 * module owns the storage side of the same object: how the value is decoded
 * defensively and in which order the store is allowed to change.
 *
 * Rule owner: `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> "Page index", "Index write policy", "Index repair").
 *
 * Write policy: a page slot is written **before** `pages:v1`, and a failed slot
 * write leaves the index untouched. The index is published last, so an index that
 * lists a page always points at a slot that already landed.
 *
 * Read policy: nothing reorders `pageKeys`. PM ruling `A4` picks the oldest
 * indexed variant of a path, and "oldest" is defined by index order, so a
 * compaction or a repair must keep the surviving keys in their positions.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The only
 * impure collaborator is the injected `StoragePort`.
 */

import { emptyPageIndex, removeFromIndex } from './page-index';
import type { PageIndex } from './page-index';
import { pageKeyFromUrl } from './page-key';
import type { StoragePort, StorageWriteResult } from './storage-port';
import { attemptWrite } from './storage-port';
import { PAGE_INDEX_KEY } from './storage-keys';

/** Machine code explaining what the index read found. */
export type PageIndexCode =
  /** Stored `version` is not `1`: the value belongs to another layout. */
  | 'layout_version'
  /** Stored value is not an index object at all. */
  | 'index_malformed'
  /** An indexed element is not a non-empty string and was dropped. */
  | 'page_key_invalid'
  /** An indexed element is not a normalized page key; it is kept, not rewritten. */
  | 'page_key_unnormalized'
  /** The port itself failed; the index is reported empty. */
  | 'storage_unavailable';

/** Index value plus the codes describing what the read had to repair. */
export interface PageIndexReadResult {
  /** Index to work with; empty when the stored value is unusable. */
  index: PageIndex;
  /** Codes in the order the read produced them. */
  codes: readonly PageIndexCode[];
}

/** Serialized index value: exactly the shape pinned by the spec. */
export interface PageIndexValue {
  version: 1;
  pageKeys: string[];
}

/** A page slot plus the index that may be published after the slot lands. */
export interface SlotIndexCommit {
  /** Full storage key of the page slot (`entryStorageKey(pageKey)`). */
  storageKey: string;
  /** Value to store under `storageKey`. */
  value: unknown;
  /** Index to publish only after the slot write succeeded. */
  index: PageIndex;
}

/** Storage value of an index, copied so a later mutation cannot reach the store. */
export function pageIndexToStorageValue(index: PageIndex): PageIndexValue {
  return { version: 1, pageKeys: [...index.pageKeys] };
}

/**
 * Decodes a stored index without trusting it. A `version` other than `1` yields
 * an empty index plus `layout_version` instead of a crash, because the reader has
 * to keep working on a store written by another layout. Elements are kept in
 * stored order; a non-string element is dropped, an unnormalized page key is kept
 * so its slot stays reachable.
 */
export function pageIndexFromStorageValue(value: unknown): PageIndexReadResult {
  if (value === undefined || value === null) {
    return { index: emptyPageIndex(), codes: [] };
  }
  if (!isRecord(value)) {
    return { index: emptyPageIndex(), codes: ['index_malformed'] };
  }
  if (value['version'] !== 1) {
    return { index: emptyPageIndex(), codes: ['layout_version'] };
  }

  const storedKeys = value['pageKeys'];
  if (!Array.isArray(storedKeys)) {
    return { index: emptyPageIndex(), codes: ['index_malformed'] };
  }

  const elements: readonly unknown[] = storedKeys;
  const pageKeys: string[] = [];
  const codes: PageIndexCode[] = [];
  for (const element of elements) {
    if (typeof element !== 'string' || element.trim().length === 0) {
      pushCode(codes, 'page_key_invalid');
      continue;
    }
    pageKeys.push(element);
    if (pageKeyFromUrl(element) !== element) {
      pushCode(codes, 'page_key_unnormalized');
    }
  }

  return { index: { version: 1, pageKeys }, codes };
}

/** Reads the index; an unusable or missing value becomes an empty index. */
export async function readPageIndex(port: StoragePort): Promise<PageIndexReadResult> {
  let items: Record<string, unknown>;
  try {
    items = await port.get([PAGE_INDEX_KEY]);
  } catch {
    return { index: emptyPageIndex(), codes: ['storage_unavailable'] };
  }
  return pageIndexFromStorageValue(items[PAGE_INDEX_KEY]);
}

/** Publishes an index. A failing write is reported, never retried. */
export async function writePageIndex(port: StoragePort, index: PageIndex): Promise<StorageWriteResult> {
  return attemptWrite(async () => {
    await port.set({ [PAGE_INDEX_KEY]: pageIndexToStorageValue(index) });
  });
}

/**
 * Drops one page key from the stored index and publishes the result
 * (`removeFromIndex` keeps the position of every other key). This is the repair
 * primitive of the read path.
 */
export async function removeFromIndexAndPublish(
  port: StoragePort,
  index: PageIndex,
  pageKey: string,
): Promise<{ index: PageIndex; write: StorageWriteResult }> {
  const next = removeFromIndex(index, pageKey);
  return { index: next, write: await writePageIndex(port, next) };
}

/**
 * The index write policy as one call: the slot is written first, and the index is
 * published only when that write succeeded. A failed slot write returns the
 * failure code and leaves `pages:v1` exactly as it was, so the index can never
 * point at a slot that never landed. This is the ordering the entry write path
 * (`t1-06`) builds on; it carries no entry rule of its own.
 */
export async function writeSlotThenIndex(
  port: StoragePort,
  commit: SlotIndexCommit,
): Promise<StorageWriteResult> {
  const slotWrite = await attemptWrite(async () => {
    await port.set({ [commit.storageKey]: commit.value });
  });
  if (!slotWrite.ok) {
    return slotWrite;
  }
  return writePageIndex(port, commit.index);
}

/** A slot removal plus the index that may be published after it lands. */
export interface SlotRemovalCommit {
  /** Full storage key of the page slot that must disappear. */
  storageKey: string;
  /** Index to publish only after the removal succeeded. */
  index: PageIndex;
}

/**
 * The removal half of the same policy, used when the last entry of a page is gone:
 * the slot key is dropped **before** `pages:v1` stops listing the page, so the
 * index never keeps a pointer that was already rewritten into nothing. A failed
 * removal leaves the index untouched. If only the index publication fails, the
 * store holds an orphan index entry, which is exactly the state the read path
 * repairs (`index_repaired`), so no entry is lost either way.
 */
export async function removeSlotThenIndex(
  port: StoragePort,
  commit: SlotRemovalCommit,
): Promise<StorageWriteResult> {
  const removal = await attemptWrite(async () => {
    await port.remove([commit.storageKey]);
  });
  if (!removal.ok) {
    return removal;
  }
  return writePageIndex(port, commit.index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushCode(codes: PageIndexCode[], code: PageIndexCode): void {
  if (!codes.includes(code)) {
    codes.push(code);
  }
}
