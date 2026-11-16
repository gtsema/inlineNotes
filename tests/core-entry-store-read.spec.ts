import { describe, expect, it } from 'vitest';

import { loadEntries } from '../src/core/entry-store-read';
import { entryStorageKey } from '../src/core/storage-keys';
import { MemoryStoragePort, indexValue, slotValue, storedEntry, storedIndexOf } from './support/memory-storage-port';

/**
 * Reading one page through the seam: task `t1-05` (AC3).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Page lookup", "Decode on read", "Index repair".
 */

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';
const URL_A = 'https://example.com/a?utm_source=x#sec';

function slotKeyOf(pageKey: string): string {
  return entryStorageKey(pageKey);
}

/** Port seeded with an index listing `pageKeys` and one slot per entry list. */
function seededPort(pageKeys: readonly string[], slots: Readonly<Record<string, unknown[]>>) {
  const port = new MemoryStoragePort();
  if (pageKeys.length > 0) {
    port.seed('pages:v1', indexValue(pageKeys));
  }
  for (const [pageKey, entries] of Object.entries(slots)) {
    port.seed(slotKeyOf(pageKey), slotValue(entries));
  }
  return port;
}

describe('loadEntries reads a page (AC3)', () => {
  it('returns the entries of the resolved page key', async () => {
    const port = seededPort([PAGE_A], { [PAGE_A]: [storedEntry(), storedEntry({ id: 'b'.repeat(12) })] });

    const result = await loadEntries(port, URL_A);
    expect(result.pageKey).toBe(PAGE_A);
    expect(result.entries.map((entry) => entry.id)).toEqual(['a1b2c3d4e5f6', 'b'.repeat(12)]);
    expect(result.corruptCount).toBe(0);
    expect(result.codes).toEqual([]);
  });

  it('reads the slot of the indexed key, not of the URL that was opened (ruling A4)', async () => {
    const stored = 'https://example.com/a?lang=ru';
    const port = seededPort([stored], { [stored]: [storedEntry({ pageKey: stored })] });

    const result = await loadEntries(port, 'https://example.com/a?utm_source=y&fbclid=1');
    expect(result.pageKey).toBe(stored);
    expect(result.entries).toHaveLength(1);
    expect(port.calls[1]).toEqual({ op: 'get', keys: [slotKeyOf(stored)] });
  });

  it('falls back to the normalized URL when the index does not know the page', async () => {
    const port = new MemoryStoragePort();

    const result = await loadEntries(port, 'https://example.com/a/?utm_source=x');
    expect(result.pageKey).toBe(PAGE_A);
    expect(result.entries).toEqual([]);
    expect(result.codes).toEqual([]);
  });

  it('reports url_unparsable without reading a slot', async () => {
    const port = new MemoryStoragePort();

    const result = await loadEntries(port, '   ');
    expect(result).toEqual({ pageKey: null, entries: [], corruptCount: 0, codes: ['url_unparsable'] });
    expect(port.calls).toEqual([{ op: 'get', keys: ['pages:v1'] }]);
  });

  it('reports storage_unavailable when the slot read fails', async () => {
    const port = seededPort([PAGE_A], { [PAGE_A]: [storedEntry()] });
    port.failReadOn(slotKeyOf(PAGE_A), 'unavailable');

    const result = await loadEntries(port, URL_A);
    expect(result).toEqual({
      pageKey: PAGE_A,
      entries: [],
      corruptCount: 0,
      codes: ['storage_unavailable'],
    });
  });

  it('reports storage_unavailable when even the index read fails', async () => {
    const port = new MemoryStoragePort();
    port.failNextRead('unavailable');

    const result = await loadEntries(port, URL_A);
    expect(result).toEqual({
      pageKey: PAGE_A,
      entries: [],
      corruptCount: 0,
      codes: ['storage_unavailable'],
    });
  });

  it('applies the visible default through the whole read path (ruling A1)', async () => {
    const { visible, ...withoutVisible } = storedEntry();
    expect(visible).toBe(true);
    const port = seededPort([PAGE_A], { [PAGE_A]: [withoutVisible] });

    const result = await loadEntries(port, URL_A);
    expect(result.entries[0]?.visible).toBe(true);
  });

  it('never lets a malformed record into the result', async () => {
    const port = seededPort([PAGE_A], {
      [PAGE_A]: [storedEntry(), { id: 'x' }, 'note', storedEntry({ id: 'c'.repeat(12) })],
    });

    const result = await loadEntries(port, URL_A);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => typeof entry.authorName === 'string')).toBe(true);
    expect(result.corruptCount).toBe(2);
    expect(result.codes).toEqual(['entry_malformed']);
  });
});

describe('loadEntries repairs an orphan index entry (AC3)', () => {
  it('drops a listed page key whose slot was never written', async () => {
    const port = seededPort([PAGE_A, PAGE_B], { [PAGE_B]: [storedEntry({ pageKey: PAGE_B })] });

    const result = await loadEntries(port, URL_A);
    expect(result.entries).toEqual([]);
    expect(result.codes).toEqual(['index_repaired']);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B] });
  });

  it('drops a listed page key whose slot holds an empty list', async () => {
    const port = seededPort([PAGE_A], { [PAGE_A]: [] });

    const result = await loadEntries(port, URL_A);
    expect(result.codes).toEqual(['index_repaired']);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('keeps the order of the surviving page keys', async () => {
    const port = seededPort(
      ['https://example.com/z?b=2', PAGE_A, 'https://example.com/z?a=1'],
      { 'https://example.com/z?b=2': [storedEntry({ pageKey: 'https://example.com/z?b=2' })] },
    );

    await loadEntries(port, URL_A);
    expect(storedIndexOf(port)?.pageKeys).toEqual([
      'https://example.com/z?b=2',
      'https://example.com/z?a=1',
    ]);
  });

  it('writes nothing when the page key is not listed in the index', async () => {
    const port = new MemoryStoragePort();

    const result = await loadEntries(port, URL_A);
    expect(result.codes).toEqual([]);
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('keeps the index entry of a slot that holds a malformed record, so nothing is silently deleted', async () => {
    const port = seededPort([PAGE_A], { [PAGE_A]: [{ id: 'unreadable' }] });

    const result = await loadEntries(port, URL_A);
    expect(result.entries).toEqual([]);
    expect(result.corruptCount).toBe(1);
    expect(result.codes).toEqual(['entry_malformed']);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('keeps the index entry of a slot with a foreign layout version', async () => {
    const port = new MemoryStoragePort();
    port.seed('pages:v1', indexValue([PAGE_A]));
    port.seed(slotKeyOf(PAGE_A), { version: 2, entries: [storedEntry()] });

    const result = await loadEntries(port, URL_A);
    expect(result.entries).toEqual([]);
    expect(result.codes).toEqual(['layout_version']);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('reports index_repair_failed when the index write fails, and keeps the entries out', async () => {
    const port = seededPort([PAGE_A], { [PAGE_A]: [] });
    port.failWriteOn('pages:v1', 'quota');

    const result = await loadEntries(port, URL_A);
    expect(result.entries).toEqual([]);
    expect(result.codes).toEqual(['index_repair_failed']);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('never deletes a corrupt slot record', async () => {
    const corrupt = { id: 'unreadable' };
    const port = seededPort([PAGE_A], { [PAGE_A]: [corrupt] });
    const before = port.snapshot();

    await loadEntries(port, URL_A);
    expect(port.snapshot()).toEqual(before);
  });
});
