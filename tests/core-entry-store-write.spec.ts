import { describe, expect, it } from 'vitest';

import type { Entry, EntryAnchor } from '../src/core/entry';
import type { CodePointRange, ResolvedSpans } from '../src/core/entry-overlap';
import type { RandomSource } from '../src/core/entry-rules';
import { MAX_ENTRIES_PER_PAGE, setEntryVisibility } from '../src/core/entry-rules';
import { ISO_UTC_TIMESTAMP_PATTERN, loadEntries } from '../src/core/entry-store-read';
import type { CreateEntryOnPageInput } from '../src/core/entry-store-write';
import {
  appendedRecord,
  clearPage,
  createEntryOnPage,
  deleteEntry,
  entrySlotValue,
  removedRecord,
  replacedRecord,
  setVisible,
  updateEntryComment,
} from '../src/core/entry-store-write';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
  storedIndexOf,
} from './support/memory-storage-port';

/**
 * The entry write path of task `t1-06` (AC1-AC5).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow / Sequence 5, 7, 8 and
 * Rules / Semantics -> "Index write policy", "Index write guard", "Decode on
 * write", "Normalized text", "Timestamps", "Page lookup", "Quota". Every case runs
 * on the hand-written in-memory port, so the failure matrix is observed in the port
 * snapshot and the call log instead of asserted by prose.
 */

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';
const PAGE_C = 'https://example.com/c';
const SLOT_A = entryStorageKey(PAGE_A);
const SLOT_B = entryStorageKey(PAGE_B);
const SLOT_C = entryStorageKey(PAGE_C);

const NAME = 'reader-one';
const ID = 'a1b2c3d4e5f6';
const NOW = '2026-03-04T05:06:07.008Z';
const LATER = '2026-03-05T08:09:10.011Z';
const ANCHOR: EntryAnchor = { text: 'selected text', prefix: 'the ', suffix: ' here', fragmentCount: 2 };
const ZERO_RNG: RandomSource = () => 0;
const ZERO_ID = '000000000000';
const CORRUPT = { id: 'broken', authorName: 'reader-one', nonsense: true };

/** A record of a create that would succeed, with per-test overrides. */
interface CreateOverrides {
  url?: string;
  text?: string;
  comment?: string;
  anchor?: EntryAnchor;
  currentName?: string;
  spans?: ResolvedSpans;
  now?: string;
  rng?: RandomSource;
}

/**
 * The one way a test builds `ResolvedSpans` (`A46` makes it a required argument of
 * the write API): the candidate range plus the resolved range of the listed entry
 * ids. An id that is absent from the map is read as stale (`A24`), and that is what
 * the default of `createInput` does — it resolves no existing entry — because the
 * pre-existing cases of this file are about the storage contract, and an unresolved
 * page blocks nothing in either direction.
 */
function spansOf(
  candidate: CodePointRange,
  ranges: readonly (readonly [string, CodePointRange])[] = [],
): ResolvedSpans {
  return { candidate, byEntryId: new Map<string, CodePointRange>(ranges) };
}

const CANDIDATE_SPAN: CodePointRange = { start: 0, end: 13 };

function createInput(overrides: CreateOverrides = {}): CreateEntryOnPageInput {
  return {
    url: overrides.url ?? PAGE_A,
    text: overrides.text ?? 'selected text',
    comment: overrides.comment ?? 'my note',
    anchor: overrides.anchor ?? ANCHOR,
    currentName: overrides.currentName ?? NAME,
    spans: overrides.spans ?? spansOf(CANDIDATE_SPAN),
    now: overrides.now ?? NOW,
    rng: overrides.rng ?? ZERO_RNG,
  };
}

function create(port: MemoryStoragePort, overrides: CreateOverrides = {}): Promise<unknown> {
  return createEntryOnPage(port, createInput(overrides));
}

/** A stored record re-read as an `Entry`, for the pure helpers. */
function entryRecord(overrides: Record<string, unknown> = {}): Entry {
  return storedEntry({ createdAt: NOW, updatedAt: NOW, ...overrides }) as unknown as Entry;
}

function seedIndex(port: MemoryStoragePort, value: unknown): void {
  port.seed(PAGE_INDEX_KEY, value);
}

function indexedPort(pageKeys: readonly string[] = []): MemoryStoragePort {
  const port = new MemoryStoragePort();
  seedIndex(port, indexValue(pageKeys));
  return port;
}

function seedSlot(port: MemoryStoragePort, pageKey: string, records: readonly unknown[]): void {
  port.seed(entryStorageKey(pageKey), slotValue(records));
}

/** A page filled with `count` readable records with predictable ids. */
function many(pageKey: string, count: number): unknown[] {
  const records: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    records.push(
      storedEntry({
        id: String(index).padStart(12, '0'),
        pageKey,
        text: `text ${index}`,
        comment: `note ${index}`,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
  }
  return records;
}

/** The `entries` array of a stored slot, `undefined` when the value is not a slot. */
function storedRecords(port: MemoryStoragePort, storageKey: string): unknown[] | undefined {
  const value = port.snapshot()[storageKey];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = (value as Record<string, unknown>)['entries'];
  return Array.isArray(entries) ? entries : undefined;
}

function storedRaw(port: MemoryStoragePort, storageKey: string): unknown {
  return port.snapshot()[storageKey];
}

/** Every write the store attempted, in order, so ordering is observable. */
function writesOf(port: MemoryStoragePort): string[] {
  return port.calls
    .filter((call) => call.op !== 'get')
    .map((call) => `${call.op}:${call.keys.join(',')}`);
}

function readsOf(port: MemoryStoragePort): unknown[] {
  return port.calls.filter((call) => call.op === 'get');
}

describe('createEntryOnPage (AC1)', () => {
  it('stores one canonical entry under the page slot and indexes the page', async () => {
    const port = new MemoryStoragePort();

    const expected = {
      id: ZERO_ID,
      pageKey: PAGE_A,
      authorName: NAME,
      text: 'selected text',
      comment: 'my note',
      anchor: { text: 'selected text', prefix: 'the ', suffix: ' here', fragmentCount: 2 },
      visible: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(await create(port)).toEqual({ ok: true, entry: expected });
    expect(storedRecords(port, SLOT_A)).toEqual([expected]);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('reads the index first and writes the slot before the index', async () => {
    const port = new MemoryStoragePort();

    await create(port);
    expect(port.calls).toEqual([
      { op: 'get', keys: [PAGE_INDEX_KEY] },
      { op: 'get', keys: [SLOT_A] },
      { op: 'set', keys: [SLOT_A] },
      { op: 'set', keys: [PAGE_INDEX_KEY] },
    ]);
  });

  it('persists the normalized authorName and comment', async () => {
    const port = new MemoryStoragePort();

    const result = await create(port, { currentName: '   reader-one   ', comment: '\n  hello  \t' });
    expect(result).toMatchObject({ ok: true, entry: { authorName: NAME, comment: 'hello' } });
    expect(storedRecords(port, SLOT_A)).toMatchObject([{ authorName: NAME, comment: 'hello' }]);
  });

  it('takes the id from the injected rng and calls it exactly 12 times', async () => {
    const port = new MemoryStoragePort();
    let calls = 0;
    const rng: RandomSource = () => {
      calls += 1;
      return 1 / 36;
    };

    expect(await create(port, { rng })).toMatchObject({ ok: true, entry: { id: '111111111111' } });
    expect(calls).toBe(12);
  });

  it('writes both stamps from the injected now and satisfies the A9 pattern', async () => {
    const port = new MemoryStoragePort();

    const result = await create(port, { now: LATER });
    const entry = (result as { entry: { createdAt: string; updatedAt: string } }).entry;
    expect(entry.createdAt).toBe(LATER);
    expect(entry.updatedAt).toBe(LATER);
    expect(ISO_UTC_TIMESTAMP_PATTERN.test(entry.createdAt)).toBe(true);
    expect(ISO_UTC_TIMESTAMP_PATTERN.test(entry.updatedAt)).toBe(true);
  });

  it('reads back what it wrote through the core read path (round trip)', async () => {
    const port = new MemoryStoragePort();

    const result = await create(port);
    const read = await loadEntries(port, PAGE_A);
    expect(read.pageKey).toBe(PAGE_A);
    expect(read.corruptCount).toBe(0);
    expect(read.codes).toEqual([]);
    expect(read.entries).toEqual([(result as { entry: unknown }).entry]);
  });

  it('refuses in the creation order of Flow 3', async () => {
    const port = new MemoryStoragePort();

    expect(await create(port, { currentName: '   ', comment: '   ' })).toEqual({
      ok: false,
      code: 'name_required',
    });
    expect(await create(port, { comment: '    ' })).toEqual({ ok: false, code: 'comment_empty' });
    expect(await create(port, { comment: `${'x'.repeat(256)}y` })).toEqual({
      ok: false,
      code: 'comment_too_long',
    });
    expect(writesOf(port)).toEqual([]);

    const full = indexedPort([PAGE_A]);
    seedSlot(full, PAGE_A, many(PAGE_A, 20));
    expect(await create(full)).toEqual({ ok: false, code: 'page_limit' });
    expect(storedRecords(full, SLOT_A)).toHaveLength(20);
    expect(writesOf(full)).toEqual([]);
  });

  it('counts the 20-entry cap per pageKey, not per store', async () => {
    const port = indexedPort([PAGE_B]);
    seedSlot(port, PAGE_B, many(PAGE_B, 20));

    expect(await create(port)).toMatchObject({ ok: true });
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B, PAGE_A] });
    expect(storedRecords(port, SLOT_B)).toHaveLength(20);
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
  });

  it('counts decodable records of the resolved page toward the cap (A16)', async () => {
    const atCap = indexedPort([PAGE_A]);
    seedSlot(atCap, PAGE_A, [...many(PAGE_A, 20), CORRUPT, { id: '', nonsense: 1 }]);
    expect(await create(atCap)).toEqual({ ok: false, code: 'page_limit' });

    const below = indexedPort([PAGE_A]);
    seedSlot(below, PAGE_A, [...many(PAGE_A, 19), CORRUPT]);
    expect(await create(below)).toMatchObject({ ok: true });
    expect(storedRecords(below, SLOT_A)).toHaveLength(21);
  });

  it('keeps unreadable records verbatim through a create (ruling A16)', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [CORRUPT]);

    expect(await create(port)).toMatchObject({ ok: true });
    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records).toHaveLength(2);
    expect(records[0]).toBe(CORRUPT);

    const read = await loadEntries(port, PAGE_A);
    expect(read.corruptCount).toBe(1);
    expect(read.entries).toHaveLength(1);
  });

  it('writes to the slot of the indexed variant instead of forking the page (finding N5)', async () => {
    const indexed = 'https://example.com/a?b=2';
    const port = indexedPort([indexed]);
    seedSlot(port, indexed, [entryRecord({ pageKey: indexed })]);

    const result = await create(port, { url: 'https://example.com/a' });
    expect(result).toMatchObject({ ok: true, entry: { pageKey: indexed } });
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [indexed] });
    expect(storedRecords(port, entryStorageKey(indexed))).toHaveLength(2);
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
  });

  it('accepts an unnormalized legacy key the index already holds, without rewriting it', async () => {
    const legacy = 'https://example.com/a/';
    const port = indexedPort([legacy]);
    seedSlot(port, legacy, []);

    expect(await create(port)).toMatchObject({ ok: true, entry: { pageKey: legacy } });
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [legacy] });
    expect(storedRecords(port, entryStorageKey(legacy))).toHaveLength(1);
  });
});

describe('updateEntryComment (AC2)', () => {
  function seededPort(original: Record<string, unknown>): MemoryStoragePort {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [original, CORRUPT]);
    return port;
  }

  const ORIGINAL = {
    id: ID,
    pageKey: PAGE_A,
    authorName: NAME,
    text: 'kept text',
    comment: 'old note',
    anchor: { text: 'kept text', prefix: 'p', suffix: 's', fragmentCount: 3 },
    visible: false,
    createdAt: NOW,
    updatedAt: NOW,
  };

  function save(port: MemoryStoragePort, comment: string, currentName: string = NAME, now: string = LATER) {
    return updateEntryComment(port, { url: PAGE_A, id: ID, comment, currentName, now });
  }

  it('changes only comment and updatedAt', async () => {
    const port = seededPort(ORIGINAL);

    expect(await save(port, '  new note  ')).toMatchObject({
      ok: true,
      entry: { id: ID, comment: 'new note', createdAt: NOW, updatedAt: LATER },
    });

    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records[0]).toEqual({ ...ORIGINAL, comment: 'new note', updatedAt: LATER });
    expect(records[1]).toBe(CORRUPT);
    expect(writesOf(port)).toEqual([`set:${SLOT_A}`, `set:${PAGE_INDEX_KEY}`]);
  });

  it('leaves every other stored byte of the port untouched when it saves (AC2 snapshot)', async () => {
    const otherPageRecord = entryRecord({ id: 'b1b1b1b1b1b1', pageKey: PAGE_B, comment: 'keep me' });
    const port = indexedPort([PAGE_B, PAGE_A]);
    seedSlot(port, PAGE_B, [otherPageRecord]);
    seedSlot(port, PAGE_A, [ORIGINAL, CORRUPT]);

    const slotBBefore = storedRaw(port, SLOT_B);
    const keysBefore = port.storedKeys();

    expect(await save(port, 'new note')).toMatchObject({ ok: true, entry: { id: ID, comment: 'new note' } });

    expect(port.storedKeys()).toEqual(keysBefore);
    expect(storedRaw(port, SLOT_B)).toBe(slotBBefore);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B, PAGE_A] });

    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records[1]).toBe(CORRUPT);
    expect(Object.keys(records[0] as Record<string, unknown>).sort()).toEqual(
      Object.keys(ORIGINAL).sort(),
    );
  });

  it('reads back the saved comment through the core read path', async () => {
    const port = seededPort(ORIGINAL);

    await save(port, 'new note');
    const read = await loadEntries(port, PAGE_A);
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].comment).toBe('new note');
    expect(read.entries[0].updatedAt).toBe(LATER);
    expect(read.entries[0].createdAt).toBe(NOW);
    expect(read.corruptCount).toBe(1);
  });

  it('refuses a foreign author with not_author and writes nothing', async () => {
    const port = seededPort(ORIGINAL);
    const before = storedRaw(port, SLOT_A);

    expect(await save(port, 'hijack', 'reader-two')).toEqual({ ok: false, code: 'not_author' });
    expect(await save(port, 'hijack', 'Reader-One')).toEqual({ ok: false, code: 'not_author' });
    expect(await save(port, 'hijack', ' reader-two ')).toEqual({ ok: false, code: 'not_author' });

    expect(storedRaw(port, SLOT_A)).toBe(before);
    expect(writesOf(port)).toEqual([]);
  });

  it('refuses an unknown id with entry_not_found and writes nothing', async () => {
    const port = seededPort(ORIGINAL);

    expect(
      await updateEntryComment(port, {
        url: PAGE_A,
        id: 'ffffffffffffff',
        comment: 'x',
        currentName: NAME,
        now: LATER,
      }),
    ).toEqual({ ok: false, code: 'entry_not_found' });
    expect(writesOf(port)).toEqual([]);
  });

  it('refuses an unreadable record by id: only clear page reaches it (A16)', async () => {
    const port = seededPort(ORIGINAL);

    expect(
      await updateEntryComment(port, {
        url: PAGE_A,
        id: 'broken',
        comment: 'x',
        currentName: 'reader-one',
        now: LATER,
      }),
    ).toEqual({ ok: false, code: 'entry_not_found' });
    expect(writesOf(port)).toEqual([]);
  });

  it('refuses an unusable name, an empty comment and an over-cap comment', async () => {
    const port = seededPort(ORIGINAL);

    expect(await save(port, 'x', '   ')).toEqual({ ok: false, code: 'name_required' });
    expect(await save(port, '   \n ')).toEqual({ ok: false, code: 'comment_empty' });
    expect(await save(port, '\u{1F600}'.repeat(257))).toEqual({ ok: false, code: 'comment_too_long' });
    expect(writesOf(port)).toEqual([]);

    const atCap = indexedPort([PAGE_A]);
    seedSlot(atCap, PAGE_A, [ORIGINAL]);
    expect(await save(atCap, `\u{1F600}${'y'.repeat(255)}`)).toMatchObject({
      ok: true,
      entry: { comment: `\u{1F600}${'y'.repeat(255)}` },
    });
  });

  it('refuses an injected stamp its own reader would reject, leaving the slot alone', async () => {
    const port = seededPort(ORIGINAL);

    expect(await save(port, 'new note', NAME, '2026-03-05 08:09:10')).toEqual({
      ok: false,
      code: 'entry_invalid',
    });
    expect(storedRecords(port, SLOT_A)).toEqual([ORIGINAL, CORRUPT]);
    expect(writesOf(port)).toEqual([]);
  });

  it('returns the quota code of a failed slot write and changes nothing', async () => {
    const port = seededPort(ORIGINAL);
    const before = port.snapshot();
    port.failNextWrite('quota');

    expect(await save(port, 'new note')).toEqual({ ok: false, code: 'quota' });
    expect(port.snapshot()).toEqual(before);
    expect(writesOf(port)).toEqual([`set:${SLOT_A}`]);
  });
});

describe('deleteEntry and clearPage (AC3)', () => {
  it('deletes the last entry by removing the slot and then the index entry', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [entryRecord({ id: ID, pageKey: PAGE_A })]);

    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toMatchObject({
      ok: true,
      entry: { id: ID },
    });

    expect(port.calls).toEqual([
      { op: 'get', keys: [PAGE_INDEX_KEY] },
      { op: 'get', keys: [SLOT_A] },
      { op: 'remove', keys: [SLOT_A] },
      { op: 'set', keys: [PAGE_INDEX_KEY] },
    ]);
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('keeps the other stored records verbatim when one entry is deleted (A16)', async () => {
    const first = entryRecord({ id: ID, pageKey: PAGE_A });
    const third = entryRecord({ id: 'c3d4e5f6a1b2', pageKey: PAGE_A });
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [first, CORRUPT, third]);

    expect(await deleteEntry(port, { url: PAGE_A, id: 'c3d4e5f6a1b2' })).toMatchObject({ ok: true });
    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records).toHaveLength(2);
    expect(records[0]).toBe(first);
    expect(records[1]).toBe(CORRUPT);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('refuses an unknown id and an unreadable record with entry_not_found', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [CORRUPT]);

    expect(await deleteEntry(port, { url: PAGE_A, id: 'broken' })).toEqual({
      ok: false,
      code: 'entry_not_found',
    });
    expect(await deleteEntry(port, { url: PAGE_A, id: 'ffffffffffffff' })).toEqual({
      ok: false,
      code: 'entry_not_found',
    });
    expect(writesOf(port)).toEqual([]);
  });

  it('lets another author delete an entry: authorship governs editing, not removal', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [entryRecord({ id: ID, pageKey: PAGE_A, authorName: 'someone-else' })]);

    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toMatchObject({ ok: true });
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
  });

  it('clears one page without touching another page slot or the index order', async () => {
    const port = indexedPort([PAGE_A, PAGE_B, PAGE_C]);
    const bRecords = [entryRecord({ id: 'b1b1b1b1b1b1', pageKey: PAGE_B, comment: 'keep me' })];
    const cRecords = [entryRecord({ id: 'c2c2c2c2c2c2', pageKey: PAGE_C, comment: 'keep me too' })];
    seedSlot(port, PAGE_A, [
      entryRecord({ id: ID, pageKey: PAGE_A }),
      entryRecord({ id: 'a2b3c4d5e6f7', pageKey: PAGE_A }),
    ]);
    seedSlot(port, PAGE_B, bRecords);
    seedSlot(port, PAGE_C, cRecords);

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: true, removed: 2 });

    expect(storedRaw(port, SLOT_A)).toBeUndefined();
    expect(storedRecords(port, SLOT_B)).toEqual(bRecords);
    expect(storedRecords(port, SLOT_C)).toEqual(cRecords);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B, PAGE_C] });
    expect(writesOf(port)).toEqual([`remove:${SLOT_A}`, `set:${PAGE_INDEX_KEY}`]);
  });

  it('drops unreadable records only on clear page (ruling A16)', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [CORRUPT, { id: '', nonsense: 1 }]);

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: true, removed: 0 });
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('writes nothing when the page has no entry to clear', async () => {
    const port = indexedPort([PAGE_B]);

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: true, removed: 0 });
    expect(port.calls).toEqual([
      { op: 'get', keys: [PAGE_INDEX_KEY] },
      { op: 'get', keys: [SLOT_A] },
    ]);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B] });
  });

  it('clears a page indexed under a variant key through that slot', async () => {
    const indexed = 'https://example.com/a?b=2';
    const port = indexedPort([indexed, PAGE_B]);
    seedSlot(port, indexed, [entryRecord({ id: ID, pageKey: indexed })]);
    seedSlot(port, PAGE_B, [entryRecord({ id: 'b1b1b1b1b1b1', pageKey: PAGE_B })]);

    expect(await clearPage(port, { url: 'https://example.com/a?utm_source=x' })).toEqual({
      ok: true,
      removed: 1,
    });
    expect(storedRaw(port, entryStorageKey(indexed))).toBeUndefined();
    expect(storedRaw(port, SLOT_B)).toBeDefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B] });
  });

  it('refuses to write over an unreadable slot value but lets clear page drop it', async () => {
    const port = indexedPort([PAGE_A]);
    port.seed(SLOT_A, 'not-a-slot');

    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toEqual({ ok: false, code: 'slot_malformed' });
    expect(await create(port)).toEqual({ ok: false, code: 'slot_malformed' });
    expect(await setVisible(port, { url: PAGE_A, id: ID, visible: false })).toEqual({
      ok: false,
      code: 'slot_malformed',
    });
    expect(
      await updateEntryComment(port, { url: PAGE_A, id: ID, comment: 'c', currentName: NAME, now: LATER }),
    ).toEqual({ ok: false, code: 'slot_malformed' });
    expect(storedRaw(port, SLOT_A)).toBe('not-a-slot');
    expect(writesOf(port)).toEqual([]);

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: true, removed: 0 });
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('refuses a write over a slot of another layout version', async () => {
    const port = indexedPort([PAGE_A]);
    port.seed(SLOT_A, { version: 2, entries: [] });

    expect(await create(port)).toEqual({ ok: false, code: 'layout_version' });
    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toEqual({ ok: false, code: 'layout_version' });
    expect(storedRaw(port, SLOT_A)).toEqual({ version: 2, entries: [] });
    expect(writesOf(port)).toEqual([]);

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: true, removed: 0 });
    expect(storedRaw(port, SLOT_A)).toBeUndefined();
  });
});

describe('setVisible (AC4)', () => {
  const FOREIGN = {
    id: ID,
    pageKey: PAGE_A,
    authorName: 'someone-else',
    text: 'selected text',
    comment: 'my note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    visible: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  function foreignPort(): MemoryStoragePort {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [FOREIGN, CORRUPT]);
    return port;
  }

  it('changes visibility of a foreign entry: the author rule covers editing, not filtering', async () => {
    const port = foreignPort();

    expect(await setVisible(port, { url: PAGE_A, id: ID, visible: false })).toMatchObject({
      ok: true,
      entry: { id: ID, visible: false },
    });

    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records[0]).toEqual({ ...FOREIGN, visible: false });
    expect(records[1]).toBe(CORRUPT);
  });

  it('never changes updatedAt and keeps every other field', async () => {
    const port = foreignPort();

    await setVisible(port, { url: PAGE_A, id: ID, visible: false });
    await setVisible(port, { url: PAGE_A, id: ID, visible: true });

    expect(storedRecords(port, SLOT_A)).toEqual([FOREIGN, CORRUPT]);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('a hidden entry keeps its anchor and stays listed in the core read (ruling A1)', async () => {
    const port = foreignPort();

    await setVisible(port, { url: PAGE_A, id: ID, visible: false });
    const read = await loadEntries(port, PAGE_A);
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].visible).toBe(false);
    expect(read.entries[0].anchor).toEqual(FOREIGN.anchor);
  });

  it('refuses an unknown id and writes nothing', async () => {
    const port = foreignPort();

    expect(await setVisible(port, { url: PAGE_A, id: 'ffffffffffffff', visible: false })).toEqual({
      ok: false,
      code: 'entry_not_found',
    });
    expect(writesOf(port)).toEqual([]);
  });

  it('setEntryVisibility is pure: it flips one field and copies the anchor', () => {
    const entry = entryRecord({ id: ID, pageKey: PAGE_A, visible: true });

    const next = setEntryVisibility(entry, false);
    expect(next.visible).toBe(false);
    expect(entry.visible).toBe(true);
    expect(next.anchor).not.toBe(entry.anchor);
    expect(next.anchor).toEqual(entry.anchor);
    expect(next.updatedAt).toBe(entry.updatedAt);
    expect(next.createdAt).toBe(entry.createdAt);
    expect({ ...next, visible: true }).toEqual(entry);
  });
});

describe('failure honesty of every write (AC5)', () => {
  it('a failed index read refuses instead of falling back to pageKeyFromUrl', async () => {
    const port = indexedPort(['https://example.com/a?b=2']);
    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');

    expect(await create(port)).toEqual({ ok: false, code: 'storage_unavailable' });
    expect(port.storedKeys()).toEqual([PAGE_INDEX_KEY]);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: ['https://example.com/a?b=2'] });
    expect(writesOf(port)).toEqual([]);
  });

  it('a failed index read refuses save, delete, visibility and clear as well', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [entryRecord({ id: ID, pageKey: PAGE_A })]);

    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');
    expect(
      await updateEntryComment(port, { url: PAGE_A, id: ID, comment: 'new note', currentName: NAME, now: LATER }),
    ).toEqual({ ok: false, code: 'storage_unavailable' });

    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');
    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toEqual({ ok: false, code: 'storage_unavailable' });

    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');
    expect(await setVisible(port, { url: PAGE_A, id: ID, visible: false })).toEqual({
      ok: false,
      code: 'storage_unavailable',
    });

    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');
    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: false, code: 'storage_unavailable' });

    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
    expect(writesOf(port)).toEqual([]);
  });

  it('a failed slot read refuses with storage_unavailable', async () => {
    const port = indexedPort([PAGE_A]);
    port.failReadOn(SLOT_A, 'unavailable');

    expect(await create(port)).toEqual({ ok: false, code: 'storage_unavailable' });
    expect(writesOf(port)).toEqual([]);
  });

  it('an unusable index stops a create instead of publishing a one-key index', async () => {
    const foreign = new MemoryStoragePort();
    const blob = { version: 2, pageKeys: ['https://example.com/z'] };
    seedIndex(foreign, blob);

    expect(await create(foreign)).toEqual({ ok: false, code: 'layout_version' });
    expect(storedRaw(foreign, PAGE_INDEX_KEY)).toBe(blob);
    expect(foreign.storedKeys()).toEqual([PAGE_INDEX_KEY]);
    expect(writesOf(foreign)).toEqual([]);

    const malformed = new MemoryStoragePort();
    seedIndex(malformed, 'pages');
    expect(await create(malformed)).toEqual({ ok: false, code: 'index_malformed' });
    expect(storedRaw(malformed, PAGE_INDEX_KEY)).toBe('pages');
    expect(writesOf(malformed)).toEqual([]);
  });

  it('the same refusal applies to save, delete, visibility and clear', async () => {
    const port = new MemoryStoragePort();
    seedIndex(port, { version: 2, pageKeys: [PAGE_A] });

    expect(
      await updateEntryComment(port, { url: PAGE_A, id: ID, comment: 'c', currentName: NAME, now: LATER }),
    ).toEqual({ ok: false, code: 'layout_version' });
    expect(await deleteEntry(port, { url: PAGE_A, id: ID })).toEqual({ ok: false, code: 'layout_version' });
    expect(await setVisible(port, { url: PAGE_A, id: ID, visible: false })).toEqual({
      ok: false,
      code: 'layout_version',
    });
    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: false, code: 'layout_version' });
    expect(writesOf(port)).toEqual([]);
  });

  it('an unparsable URL refuses with url_unparsable', async () => {
    const port = new MemoryStoragePort();

    expect(await create(port, { url: 'not a url' })).toEqual({ ok: false, code: 'url_unparsable' });
    expect(await clearPage(port, { url: '' })).toEqual({ ok: false, code: 'url_unparsable' });
    expect(readsOf(port)).toHaveLength(2);
    expect(writesOf(port)).toEqual([]);
  });

  it('a serialization failure on the slot write changes nothing at all', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, many(PAGE_A, 3));
    const before = port.snapshot();
    port.failNextWrite('serialization');

    expect(await create(port)).toEqual({ ok: false, code: 'serialization' });
    expect(port.snapshot()).toEqual(before);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
    expect(writesOf(port)).toEqual([`set:${SLOT_A}`]);
  });

  it('a quota failure on the index write leaves the slot landed and the page readable', async () => {
    const port = new MemoryStoragePort();
    port.failWriteOn(PAGE_INDEX_KEY, 'quota');

    expect(await create(port)).toEqual({ ok: false, code: 'quota' });
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);

    const read = await loadEntries(port, PAGE_A);
    expect(read.entries).toHaveLength(1);
  });

  it('a failed slot removal leaves pages:v1 exactly as it was', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_A, [entryRecord({ id: ID, pageKey: PAGE_A })]);
    port.failWriteOn(SLOT_A, 'quota');

    expect(await clearPage(port, { url: PAGE_A })).toEqual({ ok: false, code: 'quota' });
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A, PAGE_B] });
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
    expect(writesOf(port)).toEqual([`remove:${SLOT_A}`]);
  });

  it('publishes the decoded index, so a non-string element of a foreign blob disappears', async () => {
    const port = new MemoryStoragePort();
    seedIndex(port, { version: 1, pageKeys: ['https://example.com/z', 42, '   '] });

    expect(await create(port)).toMatchObject({ ok: true });
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: ['https://example.com/z', PAGE_A] });
  });

  it('refuses to publish an entry its own reader would skip (entry_invalid)', async () => {
    const port = new MemoryStoragePort();

    expect(await create(port, { now: '2026-03-04T05:06:07+03:00' })).toEqual({
      ok: false,
      code: 'entry_invalid',
    });
    expect(
      await create(port, { anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: -1 } }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(
      await create(port, {
        anchor: { text: 'selected text', prefix: 3, suffix: '', fragmentCount: 1 } as unknown as EntryAnchor,
      }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(port.storedKeys()).toEqual([]);
  });
});

/**
 * Ruling `A26` (residual risk 1 of `t1-06`): the content layer normalizes the
 * selection at capture time, so `createEntryOnPage` refuses a `text` that is not
 * normalized, or that is not the anchor's own `text`, instead of rewriting it.
 */
describe('the A26 text and anchor rule of create (t2-01, AC5)', () => {
  it('refuses a text that is not normalized, and accepts a normalized one', async () => {
    const port = new MemoryStoragePort();

    expect(
      await create(port, {
        text: 'a  b',
        anchor: { text: 'a  b', prefix: '', suffix: '', fragmentCount: 1 },
      }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(
      await create(port, {
        text: ' selected\ttext ',
        anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
      }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(port.storedKeys()).toEqual([]);

    const accepted = await create(port, {
      text: 'a b',
      anchor: { text: 'a b', prefix: '', suffix: '', fragmentCount: 1 },
    });
    expect(accepted).toMatchObject({ ok: true, entry: { text: 'a b' } });
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
  });

  it('refuses a text that is not the anchor text, and writes nothing', async () => {
    const port = new MemoryStoragePort();

    expect(await create(port, { text: 'another selection' })).toEqual({
      ok: false,
      code: 'entry_invalid',
    });
    expect(
      await create(port, { text: ANCHOR.text, anchor: { ...ANCHOR, text: 'the anchor copy' } }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(port.storedKeys()).toEqual([]);
    expect(writesOf(port)).toEqual([]);
  });

  it('refuses a create whose anchor is not there, and does not throw', async () => {
    const port = new MemoryStoragePort();

    expect(
      await createEntryOnPage(port, {
        ...createInput(),
        anchor: null as unknown as EntryAnchor,
      }),
    ).toEqual({ ok: false, code: 'entry_invalid' });
    expect(port.storedKeys()).toEqual([]);
  });

  it('runs the creation rules first, so a full page still reports page_limit', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, many(PAGE_A, MAX_ENTRIES_PER_PAGE));

    expect(await create(port, { text: 'a  b' })).toEqual({ ok: false, code: 'page_limit' });
    expect(await create(port, { comment: '   ' })).toEqual({ ok: false, code: 'comment_empty' });
  });

  it('does not re-check a stored record on a save, because Flow 7 keeps text and anchor', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [
      entryRecord({
        id: ID,
        pageKey: PAGE_A,
        text: 'legacy  text',
        anchor: { ...ANCHOR, text: 'a different copy' },
      }),
    ]);

    expect(
      await updateEntryComment(port, {
        url: PAGE_A,
        id: ID,
        comment: 'still saveable',
        currentName: NAME,
        now: LATER,
      }),
    ).toMatchObject({ ok: true, entry: { comment: 'still saveable', text: 'legacy  text' } });
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
  });
});

describe('pure slot producers of the write path (AC5, residual risk 6 of t1-05)', () => {
  it('produces the stored slot shape and copies the record list', () => {
    expect(entrySlotValue([1, 2])).toEqual({ version: 1, entries: [1, 2] });

    const records = [1];
    expect(entrySlotValue(records).entries).not.toBe(records);
    expect(entrySlotValue(records).version).toBe(1);
  });

  it('carries the stored records through by identity and never mutates the input', () => {
    const first = { id: 'first' };
    const stored = [first, CORRUPT];
    const record = entryRecord({ id: ID });

    expect(appendedRecord(stored, record)).toEqual([first, CORRUPT, record]);
    expect(replacedRecord(stored, 0, record)).toEqual([record, CORRUPT]);
    expect(removedRecord(stored, 1)).toEqual([first]);
    expect(replacedRecord(stored, 1, record)[1]).toBe(record);
    expect(removedRecord(stored, 0)[0]).toBe(CORRUPT);
    expect(stored).toEqual([first, CORRUPT]);
  });

  it('refuses a position outside the stored list', () => {
    expect(() => replacedRecord([], 0, entryRecord({ id: ID }))).toThrow('no stored record at position 0');
    expect(() => removedRecord([1], 1)).toThrow('no stored record at position 1');
    expect(() => removedRecord([1], -1)).toThrow('no stored record at position -1');
  });
});

/**
 * Flow-3 steps 5 and 6 observed through the write API rather than through the pure
 * gate (`t2-03` review remark 4, ruling `A46`): the spans are a required argument,
 * so the end-to-end refusal is reachable from `createEntryOnPage` and cannot be
 * skipped by a caller that hands over nothing.
 */
describe('the resolved-span steps of a create through the write API (t2-04, A46)', () => {
  it('refuses a candidate over the range of a hidden entry with overlap (A22)', async () => {
    const hidden = storedEntry({ id: ID, pageKey: PAGE_A, visible: false, comment: 'hidden note' });
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [hidden]);

    expect(
      await create(port, {
        comment: 'another note',
        spans: spansOf({ start: 12, end: 13 }, [[ID, { start: 10, end: 20 }]]),
      }),
    ).toEqual({ ok: false, code: 'overlap' });
    expect(storedRecords(port, SLOT_A)).toHaveLength(1);
    expect(storedRecords(port, SLOT_A)).toEqual([hidden]);
    expect(writesOf(port)).toEqual([]);

    // Control pair: the same candidate against the same stored entry, but resolved
    // onto a disjoint range, is accepted. Only the resolved range decides.
    const disjoint = await create(port, {
      comment: 'another note',
      spans: spansOf({ start: 20, end: 21 }, [[ID, { start: 10, end: 20 }]]),
    });
    expect(disjoint).toMatchObject({ ok: true, entry: { comment: 'another note' } });
    expect(storedRecords(port, SLOT_A)).toHaveLength(2);
  });

  it('reports page_limit at the cap even when the spans would also refuse (A46)', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, many(PAGE_A, MAX_ENTRIES_PER_PAGE));

    // `many` gives id `000000000000` the comment `note 0`, so a candidate on that
    // id's own range with that comment violates steps 5 AND 6. Step 4 is reported:
    // the six-step order name -> selection -> 256 -> 20 -> overlap -> duplicate holds
    // through the write API, not only through the pure gate.
    expect(
      await create(port, {
        comment: 'note 0',
        spans: spansOf({ start: 0, end: 5 }, [['000000000000', { start: 0, end: 5 }]]),
      }),
    ).toEqual({ ok: false, code: 'page_limit' });
    expect(storedRecords(port, SLOT_A)).toHaveLength(MAX_ENTRIES_PER_PAGE);
    expect(writesOf(port)).toEqual([]);
  });
});
