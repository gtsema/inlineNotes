/**
 * Writing one page's entry list through the storage seam.
 *
 * `entry-store-read.ts` guarantees that nothing unreadable reaches a rule; this
 * module is the other half of the store. It turns one user action (create, save,
 * delete, clear, checkbox) into one whole-list write under the policy of
 * `writeSlotThenIndex` / `removeSlotThenIndex`, and it refuses rather than
 * publishing anything its own reader would reject.
 *
 * Ruling `A108` added the two **aggregate author** writes — `setVisibleForAuthor` and
 * `deleteEntriesOfAuthor` — behind the popup's one-row-per-author controls. They are
 * built from the same primitives as the single-entry writes, so one call is still one
 * commit: one page-slot write and exactly one `pages:v1` update, and an author that
 * owns nothing on that page causes no write at all. The grouping itself is not stored
 * anywhere: `visible` stays a per-entry field and no key, record shape or cap moved.
 *
 * Rule owner: `docs/specs/inline-comment-model.md`
 * (Flow / Sequence -> 5, 7, 8; Rules / Semantics -> "Index write policy",
 * "Index write guard", "Decode on write", "Normalized text", "Timestamps",
 * "Page lookup", "Quota").
 *
 * Rulings `A197`-`A199` of `sync-integration.md` (task `t20-01`) added the one writer
 * that is not a user action: `adoptOwnNotes`, which merges the server's copy of the
 * reader's own notes into this page's stored list. It is built from the same
 * primitives as every other write, so one call is still one whole-list commit, and it
 * writes nothing at all when no record changes.
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
  MAX_ENTRIES_PER_PAGE,
  assertCreatable,
  canEdit,
  isSameAuthor,
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
   * produced by one re-resolve pass. Required by ruling `A46`: without resolved
   * numbers those two checks cannot answer, so a caller that forgets them fails to
   * compile instead of creating over an existing span with no refusal. The page-side
   * create supplies the spans built from the same page read the write performs, and
   * it excludes nothing, because a create has no entry of its own yet.
   */
  spans: ResolvedSpans;
  /** Injected clock: one UTC ISO-8601 `Z` stamp used for both fields (`A9`). */
  now: string;
  /** Injected random source for the entry id. */
  rng: RandomSource;
  /**
   * Optional page title (`A190` of `all-notes-page.md`): the caller's
   * `document.title`, already trimmed and capped by the content layer. An absent
   * or empty one stores no field.
   */
  pageTitle?: string;
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

/**
 * Input of `setVisibleForAuthor` — the popup's aggregate checkbox (ruling `A108`).
 * No author check: the author rule governs editing, never filtering (`A1`).
 */
export interface SetVisibleForAuthorInput {
  url: string;
  /** Author of the group; the records it covers are chosen by `isSameAuthor` (`A99`). */
  authorName: string;
  visible: boolean;
}

/**
 * Input of `deleteEntriesOfAuthor` — the popup's group `Удалить` (ruling `A108`).
 * No author check: delete is not an edit (`A25`), so a foreign group is deletable.
 */
export interface DeleteEntriesOfAuthorInput {
  url: string;
  /** Author of the group; the records it covers are chosen by `isSameAuthor` (`A99`). */
  authorName: string;
}

/**
 * Input of `adoptOwnNotes` — the adoption half of the automatic load
 * (rulings `A197`-`A199` of `sync-integration.md`, task `t20-01`).
 *
 * `remote` is the server's answer already mapped by `entryFromRemoteNote`, so every
 * row is an `Entry` with `visible: true` and no `title`. The core re-checks the two
 * facts adoption owns: the row is the reader's own (`isSameAuthor`) and it names the
 * page this pass asked about (`row.pageKey === context.pageKey`).
 */
export interface AdoptOwnNotesInput {
  /** Page address the load used; the page key is resolved through the index. */
  url: string;
  /** Author name from options; a row of another author is skipped. */
  currentName: string;
  /** Server rows of this page, already mapped to the stored entry shape. */
  remote: readonly Entry[];
}

/**
 * Result of `adoptOwnNotes`: how many rows became stored records (`adopted`) and how
 * many were dropped (`skipped`: another author, another page, a refused comment, or
 * over the per-page cap). `adopted: 0` is a successful answer for a call that had
 * nothing to write, including the idempotent second call (`A199`).
 */
export type AdoptOwnNotesResult =
  | { ok: true; adopted: number; skipped: number }
  | { ok: false; code: EntryWriteCode };

/**
 * Result of an aggregate author write. `entries` is what the call published
 * (`setVisibleForAuthor`) or removed (`deleteEntriesOfAuthor`), and `[]` is a
 * successful answer for an author that owns no entry on that page: nothing was
 * written, nothing had to be (`A108`).
 */
export type AuthorWriteResult = { ok: true; entries: Entry[] } | { ok: false; code: EntryWriteCode };

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

/** Position of a targeted entry inside the stored list, with the guard's reading of it. */
export interface StoredEntryPosition {
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
    ...(input.pageTitle !== undefined && input.pageTitle !== '' ? { title: input.pageTitle } : {}),
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
 * Turns the popup's **aggregate** checkbox into stored values (rulings `A1`, `A108`).
 * Every entry of `authorName` on that page gets the flag in one whole-list commit:
 * one page-slot write and exactly one `pages:v1` update, never one commit per entry,
 * because N commits rewrite the index N times and can leave the page half-applied.
 * An author with no entry on that page is answered with `entries: []` and no port
 * write of any kind. A foreign author may be filtered: authorship governs editing,
 * not visibility. `updatedAt` is not a save marker, so no entry moves in the order.
 */
export async function setVisibleForAuthor(
  port: StoragePort,
  input: SetVisibleForAuthorInput,
): Promise<AuthorWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const targets = authorRecordsOf(context.decoded, input.authorName);
  if (targets.length === 0) {
    return { ok: true, entries: [] };
  }

  const records = [...context.records];
  const published: Entry[] = [];
  for (const target of targets) {
    const record = canonicalRecord(setEntryVisibility(target.entry, input.visible));
    if (record === null) {
      return { ok: false, code: 'entry_invalid' };
    }
    records[target.index] = record;
    published.push(record);
  }

  const write = await commitRecords(port, context, records);
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entries: published };
}

/**
 * Removes **every** entry of one author of one page in one commit (ruling `A108`):
 * the popup's group `Удалить`. Like `deleteEntry` it asks no author question — the
 * spec gates editing by authorship and never a delete (`A25`) — and like every write
 * it carries an unreadable record through verbatim (`A16`), because the guard cannot
 * tell who wrote it. Every other author's record is kept by identity, and an author
 * with no entry on that page is answered with `entries: []` and no port write.
 */
export async function deleteEntriesOfAuthor(
  port: StoragePort,
  input: DeleteEntriesOfAuthorInput,
): Promise<AuthorWriteResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  const targets = authorRecordsOf(context.decoded, input.authorName);
  if (targets.length === 0) {
    return { ok: true, entries: [] };
  }

  const removed = targets.map((target: StoredEntryPosition) => target.entry);
  const write = await commitRecords(
    port,
    context,
    removedPositions(context.records, targets.map((target: StoredEntryPosition) => target.index)),
  );
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, entries: removed };
}

/**
 * Adopts the server's copy of the reader's own notes into the page's stored list
 * (rulings `A197`-`A199` of `sync-integration.md`, task `t20-01`).
 *
 * This is the extension's one extra writer of own notes, and it is deliberately a
 * whole-list write on the shipped `pages:v1` policy: the slot lands before the index,
 * an empty page drops the slot first, and a record the read guard cannot decode is
 * carried through verbatim (`A16`). The page context is resolved exactly like every
 * other write (`loadPageContext`), so a caller never resolves a page key of its own.
 *
 * Rows are filtered first: only a row of the current author (`isSameAuthor`) on the
 * asked page key is a candidate; every other row counts as `skipped`. A candidate
 * whose comment the local rules refuse (`validateComment` not `ok`) is skipped too,
 * never guessed at.
 *
 * The merge is per `(authorName, id)` — the server's upsert triple minus the page,
 * which is the asked one already (`sync-server.md` -> `A155`):
 * - no stored entry with that identity: the row is adopted (a new record);
 * - the stored entry's `text`/`comment`/`anchor` equal the row's: nothing is written
 *   for that row, so a press that only moved the server's `updated_at` does not
 *   rewrite the reader's note or its date;
 * - the content differs: the newer `updatedAt` wins, the remote copy replaces the
 *   stored record, and the stored `visible` flag is kept (the wire has no column for
 *   it); a stored `updatedAt` that is newer or equal keeps the stored record.
 *
 * New rows are adopted in `createdAt` order up to `MAX_ENTRIES_PER_PAGE`; the rest are
 * `skipped`. A merge never deletes a stored entry to make room. When no record changes,
 * no port write of any kind happens and the answer is `adopted: 0`.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness of its own, no network. The
 * only impure collaborator is the injected `StoragePort`.
 */
export async function adoptOwnNotes(
  port: StoragePort,
  input: AdoptOwnNotesInput,
): Promise<AdoptOwnNotesResult> {
  const loaded = await loadPageContext(port, input.url);
  if (!loaded.ok) {
    return loaded;
  }
  const context = loaded.context;

  let skipped = 0;
  const candidates: Entry[] = [];
  for (const row of input.remote) {
    if (!isSameAuthor(row.authorName, input.currentName) || row.pageKey !== context.pageKey) {
      skipped += 1;
      continue;
    }
    if (!validateComment(row.comment).ok) {
      skipped += 1;
      continue;
    }
    candidates.push(row);
  }

  const records = [...context.records];
  let adopted = 0;

  // Replace pass: an existing stored record of this `(authorName, id)` either keeps
  // its bytes (equal content, or a stored stamp that is newer or equal) or is
  // replaced by the newer remote copy with the stored `visible` flag kept.
  for (const row of candidates) {
    const found = findStoredEntryOfAuthor(context, row.id, row.authorName);
    if (found === null || sameContent(found.entry, row) || found.entry.updatedAt >= row.updatedAt) {
      continue;
    }
    const record = canonicalRecord(adoptionDraft(row, found.entry.visible));
    if (record === null) {
      return { ok: false, code: 'entry_invalid' };
    }
    records[found.index] = record;
    adopted += 1;
  }

  // Adopt pass: rows the page does not hold yet, oldest `createdAt` first, up to the
  // cap. The cap counts every decodable stored record plus the rows already adopted
  // here; a replace pass never changes the page size. A row that does not fit is
  // skipped, never swapped in for a stored entry.
  const fresh = candidates.filter(
    (row: Entry) => findStoredEntryOfAuthor(context, row.id, row.authorName) === null,
  );
  let storedCount = decodableEntries(context).length;
  for (const row of orderByCreatedAt(fresh)) {
    if (storedCount >= MAX_ENTRIES_PER_PAGE) {
      skipped += 1;
      continue;
    }
    const record = canonicalRecord(adoptionDraft(row, true));
    if (record === null) {
      return { ok: false, code: 'entry_invalid' };
    }
    records.push(record);
    adopted += 1;
    storedCount += 1;
  }

  if (adopted === 0) {
    return { ok: true, adopted: 0, skipped };
  }

  const write = await commitRecords(port, context, records);
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, adopted, skipped };
}

/**
 * The draft one adopted row is written from (`A197`): the server's `id`, `createdAt`
 * and `updatedAt` are kept, `visible` is the stored flag (the reader's own display
 * state) or `true` for a new row, and `title` is dropped because the wire has no such
 * field (`A190`).
 *
 * The comment is stored **normalized**, exactly as the create path stores it
 * (review finding 1 of `t20-03`): `validateComment` measures a trimmed value, so
 * writing the raw row comment could store a record that differs from the value the
 * rules accepted and could exceed `MAX_COMMENT_CODE_POINTS` as stored, breaking
 * "Decode on write" (`inline-comment-model.md`) and the sentence just added to
 * `sync-integration.md` ("A row that passes is stored with the normalized comment").
 * `text` and `anchor` are never normalized: the stored text must keep matching the
 * stored anchor. Every row reaching this function already passed
 * `validateComment(row.comment).ok`, so the normalization here only trims.
 */
function adoptionDraft(row: Entry, visible: boolean): EntryDraft {
  return {
    id: row.id,
    pageKey: row.pageKey,
    authorName: row.authorName,
    text: row.text,
    comment: validateComment(row.comment).normalized,
    anchor: row.anchor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    visible,
  };
}

/**
 * Position of the entry with this `id` **and** this author among the decodable
 * records — the merge key `(authorName, id)` of `A198`, which is the server's upsert
 * triple without the page (`sync-server.md` -> `A155`). Two authors may legitimately
 * use one `id`, so an id match of another author is not this row's stored record.
 */
function findStoredEntryOfAuthor(
  context: PageWriteContext,
  id: string,
  authorName: string,
): StoredEntryPosition | null {
  for (let index = 0; index < context.decoded.length; index += 1) {
    const entry = context.decoded[index];
    if (entry !== null && entry.id === id && isSameAuthor(entry.authorName, authorName)) {
      return { index, entry };
    }
  }
  return null;
}

/**
 * The content comparison of `A198`: `text`, `comment` and `anchor` all equal. An
 * anchor is compared field by field, because two anchors with the same `text` but a
 * different context window are not the same anchor.
 */
function sameContent(stored: Entry, row: Entry): boolean {
  return (
    stored.text === row.text && stored.comment === row.comment && sameAnchor(stored.anchor, row.anchor)
  );
}

/** Field-by-field equality of two anchors (`A198`). */
function sameAnchor(a: EntryAnchor, b: EntryAnchor): boolean {
  return (
    a.text === b.text &&
    a.prefix === b.prefix &&
    a.suffix === b.suffix &&
    a.fragmentCount === b.fragmentCount
  );
}

/**
 * The rows of the cap queue in `createdAt` order (`A198`): oldest first, so the note
 * the reader wrote first is the one that survives a full page. The sort is stable, so
 * equal stamps keep the server's answer order.
 */
function orderByCreatedAt(rows: readonly Entry[]): Entry[] {
  return [...rows].sort((a: Entry, b: Entry) => {
    if (a.createdAt < b.createdAt) {
      return -1;
    }
    if (a.createdAt > b.createdAt) {
      return 1;
    }
    return 0;
  });
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
 * Drops every listed position at once — the aggregate delete of ruling `A108` — and
 * keeps every other stored record verbatim, readable or not (`A16`). Positions are
 * read against `records`, so an unreadable record shifts nothing: the caller lists
 * positions of decodable records only, and `authorRecordsOf` never lists another
 * author's slot or a record the guard could not decode.
 */
export function removedPositions(records: readonly unknown[], positions: readonly number[]): unknown[] {
  const drop = new Set<number>();
  for (const position of positions) {
    requirePosition(records, position, 'removedPositions');
    drop.add(position);
  }
  const next: unknown[] = [];
  for (let index = 0; index < records.length; index += 1) {
    if (!drop.has(index)) {
      next.push(records[index]);
    }
  }
  return next;
}

/**
 * The positions whose record the **author identity** rule accepts as `authorName`
 * (rulings `A99`, `A108`): the filter is core `isSameAuthor`, the one comparison the
 * product has, so a record authored `"Я "` belongs to the author named `"Я"` here
 * exactly as it does for edit rights and for the `own entry` label. A record the read
 * guard could not decode has no author this rule can read, so it is never listed and
 * therefore survives every aggregate write verbatim (`A16`).
 */
export function authorRecordsOf(
  decoded: readonly (Entry | null)[],
  authorName: string,
): StoredEntryPosition[] {
  const found: StoredEntryPosition[] = [];
  for (let index = 0; index < decoded.length; index += 1) {
    const entry = decoded[index];
    if (entry !== null && isSameAuthor(entry.authorName, authorName)) {
      found.push({ index, entry });
    }
  }
  return found;
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
 * comment, the current name, and the spans the input had to carry (`A46`), so the
 * write path never hands the gate an attempt whose steps 5 and 6 are silently
 * skipped. `CreateAttempt.spans` itself stays optional, because the pure gate is
 * unit-testable without a resolved map; the write path always fills it.
 */
function creationAttemptOf(context: PageWriteContext, input: CreateEntryOnPageInput): CreateAttempt {
  return {
    entries: decodableEntries(context),
    comment: input.comment,
    currentName: input.currentName,
    spans: input.spans,
  };
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
