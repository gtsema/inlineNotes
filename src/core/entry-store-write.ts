/**
 * Writing one page's entry list through the storage seam.
 *
 * `entry-store-read.ts` guarantees that nothing unreadable reaches a rule; this
 * module is the other half of the store. It turns one user action (create, save,
 * delete, clear, checkbox) into one whole-list write under the policy of
 * `writeSlotThenIndex` / `removeSlotThenIndex`, and it refuses rather than
 * publishing anything its own reader would reject.
 *
 * Rule owner: `docs/specs/inline-comment-model.md`
 * (Flow / Sequence -> 5, 7, 8; Rules / Semantics -> "Index write policy",
 * "Index write guard", "Decode on write", "Normalized text", "Timestamps",
 * "Page lookup", "Quota").
 *
 * Data discipline (PM ruling `A16`):
 * - a stored record the read guard cannot decode is carried through every write
 *   verbatim; only `clearPage` drops it;
 * - the record a successful write touches is rewritten in canonical shape, because
 *   the read guard is the only producer of a stored record (residual risk 6 of
 *   `t1-05`);
 * - a slot whose value is not a `{ version, entries }` object, or whose `version`
 *   is not `1`, refuses create / save / delete / visibility: overwriting it would
 *   be a silent delete of data the user can still clear on purpose, and `clearPage`
 *   is the one write allowed to drop such a value;
 * - a page key is resolved through the stored index, so a write refuses when that
 *   index is unreadable or unusable instead of inventing a key and forking a page
 *   (review finding `N5`; residual risks 3 and 4 of `t1-05`).
 *
 * Determinism: the clock and the random source are injected (`now`, `rng`), so the
 * whole failure matrix runs against the in-memory port. Codes are machine-readable
 * only; the Russian wording is mapped in the UI layer.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness of its own, no network.
 * The only impure collaborator is the injected `StoragePort`.
 */

import type { Entry, EntryAnchor, EntryDraft } from './entry';
import { createEntry } from './entry';
import type { CreateAttempt, CreateBlockCode, RandomSource } from './entry-rules';
import {
  MAX_COMMENT_CODE_POINTS,
  assertCreatable,
  canEdit,
  randomId,
  setEntryVisibility,
  validateAuthorName,
  validateComment,
} from './entry-rules';
import type { ResolvedSpans } from './entry-overlap';
import { decodeEntry, entryListFromStorageValue } from './entry-store-read';
import type { PageIndex } from './page-index';
import { addToIndex, removeFromIndex, resolvePageKey } from './page-index';
import type { PageIndexCode } from './page-index-store';
import { readPageIndex, removeSlotThenIndex, writeSlotThenIndex } from './page-index-store';
import { pageKeyFromUrl } from './page-key';
import type { StorageFailureCode, StoragePort, StorageWriteResult } from './storage-port';
import { entryStorageKey } from './storage-keys';
import { isNormalizedText } from './text-normalize';

/** Stored value of one page slot, produced only by `entrySlotValue`. */
export interface EntrySlotValue {
  version: 1;
  entries: unknown[];
}

/**
 * Every reason a write can refuse. The set is the union of the creation codes
 * (`assertCreatable`), the port failure codes, the index/slot codes this path
 * refuses on, and three write-only codes: `not_author`, `entry_not_found`,
 * `entry_invalid`.
 */
export type EntryWriteCode =
  | CreateBlockCode
  | StorageFailureCode
  | 'layout_version'
  | 'index_malformed'
  | 'storage_unavailable'
  | 'slot_malformed'
  | 'url_unparsable'
  | 'not_author'
  | 'entry_not_found'
  | 'entry_invalid';

/** Result of a write that produces the stored record: create, save, checkbox. */
export type EntryWriteResult = { ok: true; entry: Entry } | { ok: false; code: EntryWriteCode };

/** Result of `clearPage`; `removed` counts decodable entries, never skipped ones. */
export type ClearPageResult = { ok: true; removed: number } | { ok: false; code: EntryWriteCode };

/** Input of `createEntryOnPage`: one selection plus the caller's name, clock, rng. */
export interface CreateEntryOnPageInput {
  /** Current page URL; the page key is resolved through the index. */
  url: string;
  /** Selected text as displayed in the popup (normalized by the anchor stage). */
  text: string;
  /** Comment body as typed; the stored value is the trimmed one. */
  comment: string;
  /** Anchor of the selection; built by the anchor stage. */
  anchor: EntryAnchor;
  /** Author name from options; the stored value is the trimmed one. */
  currentName: string;
  /**
   * Flow-3 steps 5 and 6 (`A37`): the resolved code-point range of the candidate
   * selection plus the resolved range of every existing entry of this page, all
   * produced by one re-resolve pass. Absent means the caller resolved nothing, so
   * the overlap and duplicate checks do not run; the page-side create card always
   * supplies them, and it excludes nothing, because a create has no entry of its
   * own yet.
   */
  spans?: ResolvedSpans;
  /** Injected clock: one UTC ISO-8601 `Z` stamp used for both fields (`A9`). */
  now: string;
  /** Injected random source for the entry id. */
  rng: RandomSource;
}

/** Input of `updateEntryComment`. */
export interface UpdateEntryCommentInput {
  url: string;
  id: string;
  comment: string;
  currentName: string;
  /** New `updatedAt`; `createdAt` is never touched by a write. */
  now: string;
}

/** Input of `deleteEntry`. No author check: deletion is not an edit. */
export interface DeleteEntryInput {
  url: string;
  id: string;
}

/** Input of `setVisible`. No author check: the rule is editing, not filtering. */
export interface SetVisibleInput {
  url: string;
  id: string;
  visible: boolean;
}

/** Input of `clearPage`. */
export interface ClearPageInput {
  url: string;
}

/** One page as a write sees it: the key, the index, the stored records. */
interface PageWriteContext {
  /** Page key resolved through the index (`N5`). */
  pageKey: string;
  /** Index the write is derived from; never reordered. */
  index: PageIndex;
  /** Stored records in stored order, verbatim. */
  records: unknown[];
  /** `decoded[i]` is the guard's reading of `records[i]`; `null` when unreadable. */
  decoded: readonly (Entry | null)[];
  /** `true` when a value is stored under the slot key, readable or not. */
  slotPresent: boolean;
}

/** Position of the targeted entry inside the stored list. */
interface StoredEntryPosition {
  index: number;
  entry: Entry;
}

type ContextResult = { ok: true; context: PageWriteContext } | { ok: false; code: EntryWriteCode };

/**
 * Creates one entry on the page of `url` (Flow 3-5).
 *
 * The creation rules run through `assertCreatable` in the spec's order, and they
 * see only the current page's list, because the 20-entry cap is per `pageKey`
 * (residual risk 2 of `t1-04`). The stored `authorName` and `comment` are the
 * normalized values (residual risk 4 of `t1-04`), `id` comes from `randomId(rng)`
 * and both stamps come from the injected `now` (`A9`).
 *
 * Ruling `A26`: the content layer normalizes the selection at capture time, so a
 * create whose `text` is not normalized, or whose `text` is not the anchor's own
 * `text`, is refused with `entry_invalid` instead of being rewritten. A silent
 * rewrite would let the displayed text and the anchor drift apart, and the entry
 * could never be re-anchored later (residual risk 1 of `t1-06`).
 */
export async function createEntryOnPage(
  port: StoragePort,
  input: CreateEntryOnPageInput,
): Promise<EntryWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const block = assertCreatable(creationAttemptOf(context, input));
  if (block !== null) {
    return { ok: false, code: block };
  }

  if (!isStoredTextConsistent(input.text, input.anchor)) {
    return { ok: false, code: 'entry_invalid' };
  }

  const draft: EntryDraft = {
    id: randomId(input.rng),
    pageKey: context.pageKey,
    authorName: validateAuthorName(input.currentName).normalized,
    text: input.text,
    comment: validateComment(input.comment).normalized,
    anchor: input.anchor,
    createdAt: input.now,
    updatedAt: input.now,
    visible: true,
  };

  const record = canonicalRecord(draft);
  if (record === null) {
    return { ok: false, code: 'entry_invalid' };
  }

  const write = await commitRecords(port, context, appendedRecord(context.records, record));
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entry: record };
}

/**
 * Saves a comment (Flow 7): only `comment` and `updatedAt` change, so `id`,
 * `pageKey`, `authorName`, `text`, `anchor`, `visible` and `createdAt` keep their
 * stored values. A current name that is not the entry's author gets `not_author`,
 * checked before the comment rules, because the editor never offers a save on a
 * foreign entry.
 */
export async function updateEntryComment(
  port: StoragePort,
  input: UpdateEntryCommentInput,
): Promise<EntryWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  if (!validateAuthorName(input.currentName).ok) {
    return { ok: false, code: 'name_required' };
  }

  const found = findStoredEntry(context, input.id);
  if (found === null) {
    return { ok: false, code: 'entry_not_found' };
  }
  if (!canEdit(found.entry, input.currentName)) {
    return { ok: false, code: 'not_author' };
  }

  const comment = validateComment(input.comment);
  if (comment.codePointLength === 0) {
    return { ok: false, code: 'comment_empty' };
  }
  if (comment.codePointLength > MAX_COMMENT_CODE_POINTS) {
    return { ok: false, code: 'comment_too_long' };
  }

  const record = canonicalRecord({
    ...found.entry,
    comment: comment.normalized,
    updatedAt: input.now,
  });
  if (record === null) {
    return { ok: false, code: 'entry_invalid' };
  }

  const write = await commitRecords(port, context, replacedRecord(context.records, found.index, record));
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entry: record };
}

/**
 * Deletes one entry by `id` (Flow 8). There is no author rule here: the spec makes
 * a foreign entry read-only for *editing*, while delete and clear stay available
 * so a stale entry of another name never becomes undeletable.
 */
export async function deleteEntry(port: StoragePort, input: DeleteEntryInput): Promise<EntryWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const found = findStoredEntry(context, input.id);
  if (found === null) {
    return { ok: false, code: 'entry_not_found' };
  }

  const write = await commitRecords(port, context, removedRecord(context.records, found.index));
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entry: found.entry };
}

/**
 * Turns the popup checkbox into a stored value (ruling `A1`). A foreign entry may
 * be filtered: authorship governs editing, not visibility. `updatedAt` is not a
 * save marker, so the checkbox never moves an entry in the popup order.
 */
export async function setVisible(port: StoragePort, input: SetVisibleInput): Promise<EntryWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const found = findStoredEntry(context, input.id);
  if (found === null) {
    return { ok: false, code: 'entry_not_found' };
  }

  const record = canonicalRecord(setEntryVisibility(found.entry, input.visible));
  if (record === null) {
    return { ok: false, code: 'entry_invalid' };
  }

  const write = await commitRecords(port, context, replacedRecord(context.records, found.index, record));
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entry: record };
}

/**
 * Clears one page (Flow 8): the slot key goes first, then the index stops listing
 * the page. This is the only write allowed to drop what the guard could not decode
 * (ruling `A16`), because "clear page" is an explicit user action, and it is also
 * the only way a page recovers from a slot value that is not a page slot at all.
 * Another page's slot and the order of the other index keys are never touched.
 */
export async function clearPage(port: StoragePort, input: ClearPageInput): Promise<ClearPageResult> {
  const loaded = await loadPageContext(port, input.url, true);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const listed = context.index.pageKeys.includes(context.pageKey);
  if (context.records.length === 0 && !context.slotPresent && !listed) {
    return { ok: true, removed: 0 };
  }

  const removed = decodableEntries(context).length;
  const write = await commitRecords(port, context, []);
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, removed };
}

/**
 * The stored shape of a page slot, produced here so a write cannot invent a value
 * the reader would reject (residual risk 6 of `t1-05`).
 */
export function entrySlotValue(records: readonly unknown[]): EntrySlotValue {
  return { version: 1, entries: [...records] };
}

/** Appends one canonical record; the stored records before it keep their bytes. */
export function appendedRecord(records: readonly unknown[], record: Entry): unknown[] {
  return [...records, record];
}

/**
 * Replaces the record at `index` with the canonical form of `entry`. Every other
 * stored record — readable or not — is returned untouched (`A16`).
 */
export function replacedRecord(records: readonly unknown[], index: number, record: Entry): unknown[] {
  requirePosition(records, index, 'replacedRecord');
  const next = [...records];
  next[index] = record;
  return next;
}

/** Drops the record at `index`, readable or not, and keeps the rest verbatim. */
export function removedRecord(records: readonly unknown[], index: number): unknown[] {
  requirePosition(records, index, 'removedRecord');
  const next = [...records];
  next.splice(index, 1);
  return next;
}

/**
 * Reads what a write may change: the index (refusing an unusable or unreadable
 * one), the page key through the index, and the slot verbatim with the guard's
 * reading of every record.
 *
 * `tolerateUnusableSlot` is set only by `clearPage`: dropping the whole slot key is
 * the sanctioned way to get rid of a value the store cannot read, while every
 * other write refuses rather than overwriting it.
 */
async function loadPageContext(
  port: StoragePort,
  url: string,
  tolerateUnusableSlot: boolean = false,
): Promise<ContextResult> {
  const indexRead = await readPageIndex(port);
  const unusable = unusableIndexCode(indexRead.codes);
  if (unusable !== null) {
    return { ok: false, code: unusable };
  }

  const pageKey = resolvePageKey(url, indexRead.index) ?? pageKeyFromUrl(url);
  if (pageKey === null) {
    return { ok: false, code: 'url_unparsable' };
  }

  const storageKey = entryStorageKey(pageKey);
  let items: Record<string, unknown>;
  try {
    items = await port.get([storageKey]);
  } catch {
    return { ok: false, code: 'storage_unavailable' };
  }

  const stored = items[storageKey];
  const refusal = unusableSlotCode(stored);
  if (refusal !== null && !tolerateUnusableSlot) {
    return { ok: false, code: refusal };
  }

  return { ok: true, context: slotContext(indexRead.index, pageKey, stored) };
}

/**
 * An index this write cannot be derived from must stop the write instead of being
 * worked around:
 * - `layout_version` / `index_malformed`: the decoded index is empty, so publishing
 *   it would orphan every other page's slot;
 * - `storage_unavailable`: the port failed, so the real index is unknown and the
 *   `pageKeyFromUrl` fallback would fork a page that already has entries under an
 *   indexed variant (`N5`; residual risks 3 and 4 of `t1-05`).
 *
 * A missing `pages:v1` carries no code at all, so a first write is not refused.
 */
function unusableIndexCode(codes: readonly PageIndexCode[]): EntryWriteCode | null {
  for (const code of codes) {
    if (code === 'layout_version' || code === 'index_malformed' || code === 'storage_unavailable') {
      return code;
    }
  }
  return null;
}

/**
 * A slot value that is not a page slot, or belongs to another layout, refuses the
 * write with the read guard's own code. A slot that merely holds unreadable
 * records is not refused: those records are carried through (`A16`).
 */
function unusableSlotCode(value: unknown): EntryWriteCode | null {
  if (value === undefined || value === null || isEntrySlotValueShape(value)) {
    return null;
  }
  for (const code of entryListFromStorageValue(value).codes) {
    if (code === 'layout_version' || code === 'slot_malformed') {
      return code;
    }
  }
  return 'slot_malformed';
}

/** Builds the write context; records stay verbatim, `decoded` is the guard's view. */
function slotContext(index: PageIndex, pageKey: string, value: unknown): PageWriteContext {
  const readable = isEntrySlotValueShape(value);
  const records: unknown[] = readable ? [...value.entries] : [];
  const decoded: (Entry | null)[] = records.map((record: unknown) => decodeEntry(record));
  return {
    pageKey,
    index,
    records,
    decoded,
    slotPresent: value !== undefined && value !== null,
  };
}

/**
 * One whole-list write under the index policy: the slot lands before the index is
 * published, and the last entry of a page removes the slot before the index drops
 * the page key. The published index is the decoded index, so a non-string element
 * of a foreign blob disappears from it — a non-string element is not a page key.
 */
async function commitRecords(
  port: StoragePort,
  context: PageWriteContext,
  records: readonly unknown[],
): Promise<StorageWriteResult> {
  const storageKey = entryStorageKey(context.pageKey);

  if (records.length === 0) {
    return removeSlotThenIndex(port, {
      storageKey,
      index: removeFromIndex(context.index, context.pageKey),
    });
  }

  return writeSlotThenIndex(port, {
    storageKey,
    value: entrySlotValue(records),
    index: addToIndex(context.index, context.pageKey),
  });
}

/**
 * The only producer of a stored record: the entry is built by `createEntry` and
 * then passed through the read guard, so a write can never publish a record its
 * own reader would skip. A bad injected stamp or a malformed anchor is reported as
 * `entry_invalid` instead of writing data that decodes as corrupt.
 */
function canonicalRecord(draft: EntryDraft): Entry | null {
  return decodeEntry(createEntry(draft));
}

/**
 * Ruling `A26` — the create half of "Decode on write": the selection text is
 * normalized by the content layer at capture time, and the anchor carries the same
 * string. A create that breaks either rule is refused rather than rewritten, so a
 * stored entry always has one spelling of its text in both places. The save path
 * never runs this check, because Flow 7 keeps the stored `text` and `anchor` and a
 * record written before normalization existed must stay saveable.
 */
function isStoredTextConsistent(text: string, anchor: EntryAnchor | null): boolean {
  if (anchor === null) {
    return false;
  }
  return text === anchor.text && isNormalizedText(text);
}

/**
 * The `CreateAttempt` of one create: the current page's decodable records, the raw
 * comment, the current name, and the resolved spans when the caller supplied them.
 * `spans` is copied only when present, because a half-supplied pair would let a
 * candidate past the overlap check against an empty range map.
 */
function creationAttemptOf(context: PageWriteContext, input: CreateEntryOnPageInput): CreateAttempt {
  const attempt: CreateAttempt = {
    entries: decodableEntries(context),
    comment: input.comment,
    currentName: input.currentName,
  };
  if (input.spans !== undefined) {
    attempt.spans = input.spans;
  }
  return attempt;
}

/** Entries the guard could decode, in stored order: what the caps count. */
function decodableEntries(context: PageWriteContext): Entry[] {
  const entries: Entry[] = [];
  for (const entry of context.decoded) {
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Position of the entry with this `id` among the decodable records. */
function findStoredEntry(context: PageWriteContext, id: string): StoredEntryPosition | null {
  for (let index = 0; index < context.decoded.length; index += 1) {
    const entry = context.decoded[index];
    if (entry !== null && entry.id === id) {
      return { index, entry };
    }
  }
  return null;
}

function requirePosition(records: readonly unknown[], index: number, caller: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= records.length) {
    throw new Error(`${caller}: no stored record at position ${index}`);
  }
}

function isEntrySlotValueShape(value: unknown): value is EntrySlotValue {
  return isRecord(value) && value['version'] === 1 && Array.isArray(value['entries']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
