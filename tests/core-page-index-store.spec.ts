import { describe, expect, it } from 'vitest';

import { emptyPageIndex, addToIndex } from '../src/core/page-index';
import type { PageIndex } from '../src/core/page-index';
import {
  pageIndexFromStorageValue,
  pageIndexToStorageValue,
  readPageIndex,
  removeFromIndexAndPublish,
  removeSlotThenIndex,
  writePageIndex,
  writeSlotThenIndex,
} from '../src/core/page-index-store';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import { MemoryStoragePort, indexValue, slotValue, storedIndexOf } from './support/memory-storage-port';

/**
 * The `pages:v1` storage policy of task `t1-05` (AC2).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Page index", "Index write policy", "Index repair".
 */

const SLOT_KEY = entryStorageKey('https://example.com/a');

function index(...pageKeys: string[]): PageIndex {
  return { version: 1, pageKeys };
}

describe('pageIndexFromStorageValue (AC2)', () => {
  it('reads a missing value as an empty index without a code', () => {
    expect(pageIndexFromStorageValue(undefined)).toEqual({
      index: emptyPageIndex(),
      codes: [],
    });
    expect(pageIndexFromStorageValue(null)).toEqual({ index: emptyPageIndex(), codes: [] });
  });

  it('accepts the stored shape', () => {
    expect(pageIndexFromStorageValue(indexValue(['https://example.com/a']))).toEqual({
      index: { version: 1, pageKeys: ['https://example.com/a'] },
      codes: [],
    });
  });

  it('turns a foreign version into an empty index plus layout_version, never a crash', () => {
    for (const version of [0, 2, '1', null, undefined, {}]) {
      const read = pageIndexFromStorageValue({ version, pageKeys: ['https://example.com/a'] });
      expect(read.index).toEqual(emptyPageIndex());
      expect(read.codes).toEqual(['layout_version']);
    }
  });

  it('turns a non-object value into an empty index plus index_malformed', () => {
    for (const value of ['pages', 7, [], ['https://example.com/a']]) {
      const read = pageIndexFromStorageValue(value);
      expect(read.index).toEqual(emptyPageIndex());
      expect(read.codes).toEqual(['index_malformed']);
    }
  });

  it('reports index_malformed when pageKeys is not an array', () => {
    const read = pageIndexFromStorageValue({ version: 1, pageKeys: 'https://example.com/a' });
    expect(read.index).toEqual(emptyPageIndex());
    expect(read.codes).toEqual(['index_malformed']);
  });

  it('drops an indexed element that is not a usable page key', () => {
    const read = pageIndexFromStorageValue({
      version: 1,
      pageKeys: ['https://example.com/a', 42, '', '   '],
    });
    expect(read.index.pageKeys).toEqual(['https://example.com/a']);
    expect(read.codes).toEqual(['page_key_invalid']);
  });

  it('keeps an unnormalized indexed key and reports it, so its slot stays reachable', () => {
    const read = pageIndexFromStorageValue({
      version: 1,
      pageKeys: ['https://example.com/a/', 'https://example.com/a?utm_source=x'],
    });
    expect(read.index.pageKeys).toEqual([
      'https://example.com/a/',
      'https://example.com/a?utm_source=x',
    ]);
    expect(read.codes).toEqual(['page_key_unnormalized']);
  });
});

describe('readPageIndex (AC2)', () => {
  it('reports an empty index for a store that never wrote one', async () => {
    const read = await readPageIndex(new MemoryStoragePort());
    expect(read).toEqual({ index: emptyPageIndex(), codes: [] });
  });

  it('reads the stored index and touches nothing', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(['https://example.com/a']));

    const read = await readPageIndex(port);
    expect(read.index.pageKeys).toEqual(['https://example.com/a']);
    expect(read.codes).toEqual([]);
    expect(port.calls).toEqual([{ op: 'get', keys: [PAGE_INDEX_KEY] }]);
  });

  it('reports storage_unavailable when the port fails, without throwing', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(['https://example.com/a']));
    port.failNextRead('unavailable');

    expect(await readPageIndex(port)).toEqual({
      index: emptyPageIndex(),
      codes: ['storage_unavailable'],
    });
  });
});

describe('the read path never reorders pageKeys (AC2, ruling A4)', () => {
  const UNORDERED = [
    'https://example.com/z?b=2',
    'https://example.com/a',
    'https://example.com/z?a=1',
    'https://example.com/m/',
  ];

  it('keeps insertion order on read', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(UNORDERED));

    const read = await readPageIndex(port);
    expect(read.index.pageKeys).toEqual(UNORDERED);
  });

  it('keeps the order of the survivors after a repair', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(UNORDERED));
    const read = await readPageIndex(port);
    const repaired = await removeFromIndexAndPublish(port, read.index, UNORDERED[1]);

    expect(repaired.index.pageKeys).toEqual([
      'https://example.com/z?b=2',
      'https://example.com/z?a=1',
      'https://example.com/m/',
    ]);
    expect(read.index.pageKeys).toEqual(UNORDERED);
  });

  it('keeps the order through addToIndex', () => {
    let current = index(...UNORDERED);
    current = addToIndex(current, 'https://example.com/new');
    current = addToIndex(current, UNORDERED[1]);
    expect(current.pageKeys).toEqual([...UNORDERED, 'https://example.com/new']);
  });

  it('serializes the index in the given order', () => {
    expect(pageIndexToStorageValue(index(...UNORDERED)).pageKeys).toEqual(UNORDERED);
  });
});

describe('writePageIndex (AC2)', () => {
  it('writes exactly the documented value', async () => {
    const port = new MemoryStoragePort();
    const result = await writePageIndex(port, index('https://example.com/a', 'https://example.com/b'));

    expect(result).toEqual({ ok: true });
    expect(port.snapshot()[PAGE_INDEX_KEY]).toEqual({
      version: 1,
      pageKeys: ['https://example.com/a', 'https://example.com/b'],
    });
  });

  it('reports a failed write instead of throwing', async () => {
    const port = new MemoryStoragePort();
    port.failNextWrite('quota');

    expect(await writePageIndex(port, index('https://example.com/a'))).toEqual({
      ok: false,
      code: 'quota',
    });
    expect(port.storedKeys()).toEqual([]);
  });

  it('copies the key list, so a later mutation cannot rewrite what was stored', async () => {
    const port = new MemoryStoragePort();
    const pageKeys = ['https://example.com/a'];
    await writePageIndex(port, { version: 1, pageKeys });
    pageKeys.push('https://example.com/b');

    expect(storedIndexOf(port)).toEqual({
      version: 1,
      pageKeys: ['https://example.com/a'],
    });
  });
});

describe('writeSlotThenIndex (AC2)', () => {
  it('writes the slot before the index', async () => {
    const port = new MemoryStoragePort();
    const result = await writeSlotThenIndex(port, {
      storageKey: SLOT_KEY,
      value: { version: 1, entries: [] },
      index: index('https://example.com/a'),
    });

    expect(result).toEqual({ ok: true });
    expect(port.calls).toEqual([
      { op: 'set', keys: [SLOT_KEY] },
      { op: 'set', keys: [PAGE_INDEX_KEY] },
    ]);
    expect(port.storedKeys()).toEqual([SLOT_KEY, PAGE_INDEX_KEY]);
  });

  it('leaves the index unchanged when the slot write fails', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(['https://example.com/old']));
    port.failNextWrite('quota');

    const result = await writeSlotThenIndex(port, {
      storageKey: SLOT_KEY,
      value: { version: 1, entries: [] },
      index: index('https://example.com/old', 'https://example.com/a'),
    });

    expect(result).toEqual({ ok: false, code: 'quota' });
    expect(port.calls).toEqual([{ op: 'set', keys: [SLOT_KEY] }]);
    expect(port.snapshot()[PAGE_INDEX_KEY]).toEqual({
      version: 1,
      pageKeys: ['https://example.com/old'],
    });
    expect(port.storedKeys()).toEqual([PAGE_INDEX_KEY]);
  });

  it('reports a failed index write after the slot landed', async () => {
    const port = new MemoryStoragePort();
    port.failWriteOn(PAGE_INDEX_KEY, 'serialization');

    const result = await writeSlotThenIndex(port, {
      storageKey: SLOT_KEY,
      value: { version: 1, entries: [] },
      index: index('https://example.com/a'),
    });

    expect(result).toEqual({ ok: false, code: 'serialization' });
    expect(port.calls).toEqual([
      { op: 'set', keys: [SLOT_KEY] },
      { op: 'set', keys: [PAGE_INDEX_KEY] },
    ]);
  });
});

/**
 * The removal half of the index write policy, pinned directly (carried fix `R5`
 * of the `t1-06` review): until now `removeSlotThenIndex` was only observable
 * through `deleteEntry` and `clearPage`, and the case "the slot removal landed and
 * the index publication failed" had no test at all.
 */
describe('removeSlotThenIndex (carried fix R5 of the t1-06 review)', () => {
  it('removes the slot first and reports a failed index publication without retrying', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue(['https://example.com/a', 'https://example.com/b']));
    port.seed(SLOT_KEY, slotValue([{ id: 'a1b2c3d4e5f6' }]));
    port.failWriteOn(PAGE_INDEX_KEY, 'quota');

    const result = await removeSlotThenIndex(port, {
      storageKey: SLOT_KEY,
      index: index('https://example.com/b'),
    });

    expect(result).toEqual({ ok: false, code: 'quota' });
    expect(port.calls).toEqual([
      { op: 'remove', keys: [SLOT_KEY] },
      { op: 'set', keys: [PAGE_INDEX_KEY] },
    ]);
    expect(port.storedKeys()).toEqual([PAGE_INDEX_KEY]);
    expect(storedIndexOf(port)).toEqual({
      version: 1,
      pageKeys: ['https://example.com/a', 'https://example.com/b'],
    });

    // What this leaves behind is exactly the state the read path repairs: an index
    // that lists a page whose slot is gone. The repair keeps the order of the
    // surviving keys, so no page loses its entries and no slot is orphaned.
    const repaired = await removeFromIndexAndPublish(
      port,
      index('https://example.com/a', 'https://example.com/b'),
      'https://example.com/a',
    );
    expect(repaired.write.ok).toBe(true);
    expect(repaired.index.pageKeys).toEqual(['https://example.com/b']);
  });
});
