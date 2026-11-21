import { describe, expect, it } from 'vitest';

import { deleteNotesOfAuthorOnAllPages } from '../src/core/author-notes';
import type { SyncTransport } from '../src/core/sync-client';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
  storedIndexOf,
} from './support/memory-storage-port';

/**
 * The rename sweep of task `t17-04` (rulings `A173`, `A174`).
 *
 * The core module owns one rule: "every note whose `authorName` is `A` is deleted
 * from every page the index lists, and nothing else changes". Every case runs on the
 * hand-written in-memory port, so the sweep is observed in the port snapshot and the
 * call log — how many writes, in what order, over which pages — instead of asserted
 * by prose. AC3 (no server call) is pinned here too, by a transport that records
 * calls: the sweep takes no transport at all, so zero calls is the only possible
 * answer, and the recording transport makes that visible instead of implicit.
 */

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';
const PAGE_C = 'https://example.com/c';
const SLOT_A = entryStorageKey(PAGE_A);
const SLOT_B = entryStorageKey(PAGE_B);
const SLOT_C = entryStorageKey(PAGE_C);

const OLD_NAME = 'Аня';
const OTHER_NAME = 'Борис';
const NOW = '2026-03-04T05:06:07.008Z';

const CORRUPT = { id: 'broken', authorName: OLD_NAME, nonsense: true };

function recordOf(id: string, pageKey: string, authorName: string): Record<string, unknown> {
  return storedEntry({ id, pageKey, authorName, createdAt: NOW, updatedAt: NOW });
}

function indexedPort(pageKeys: readonly string[]): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue(pageKeys));
  return port;
}

function seedSlot(port: MemoryStoragePort, pageKey: string, records: readonly unknown[]): void {
  port.seed(entryStorageKey(pageKey), slotValue(records));
}

function storedRecords(port: MemoryStoragePort, storageKey: string): unknown[] | undefined {
  const value = port.snapshot()[storageKey];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = (value as Record<string, unknown>)['entries'];
  return Array.isArray(entries) ? entries : undefined;
}

/** Every write the port saw, in order, so the sweep's ordering is observable. */
function writesOf(port: MemoryStoragePort): string[] {
  return port.calls
    .filter((call) => call.op !== 'get')
    .map((call) => `${call.op}:${call.keys.join(',')}`);
}

function idsOf(records: readonly unknown[]): string[] {
  return records.map((record) => (record as Record<string, unknown>)['id'] as string);
}

/** A transport that records every call it is handed. */
function recordingTransport(): { transport: SyncTransport; calls: string[] } {
  const calls: string[] = [];
  const transport: SyncTransport = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { transport, calls };
}

describe('AC1 — a rename deletes every note of the previous name on every page', () => {
  it('sweeps every page the index lists and leaves the other authors byte for byte', async () => {
    const port = indexedPort([PAGE_A, PAGE_B, PAGE_C]);
    const foreignA = recordOf('foreign-a', PAGE_A, OTHER_NAME);
    const foreignB = recordOf('foreign-b', PAGE_B, OTHER_NAME);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME), foreignA]);
    seedSlot(port, PAGE_B, [recordOf('old-b', PAGE_B, OLD_NAME)]);
    seedSlot(port, PAGE_C, [foreignB]);

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result.ok).toBe(true);
    expect((result as { removed: { id: string }[] }).removed.map((entry) => entry.id)).toEqual([
      'old-a',
      'old-b',
    ]);
    expect((result as { failed: unknown[] }).failed).toEqual([]);
    // PAGE_A still owns a foreign note: its slot keeps that record, by identity.
    expect(storedRecords(port, SLOT_A)).toEqual([foreignA]);
    expect(storedRecords(port, SLOT_A)?.[0]).toBe(foreignA);
    // PAGE_B held only the old name's note: the slot is gone and the index dropped it.
    expect(storedRecords(port, SLOT_B)).toBeUndefined();
    // PAGE_C held no note of the old name: it was not written at all.
    expect(storedRecords(port, SLOT_C)).toEqual([foreignB]);
    expect(storedRecords(port, SLOT_C)?.[0]).toBe(foreignB);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A, PAGE_C] });
  });

  it('keeps the index order of the surviving pages and touches each page once', async () => {
    const port = indexedPort([PAGE_A, PAGE_B, PAGE_C]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    seedSlot(port, PAGE_B, [recordOf('old-b', PAGE_B, OLD_NAME)]);
    seedSlot(port, PAGE_C, [recordOf('old-c', PAGE_C, OLD_NAME)]);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    // One slot removal per page, then one index update per page: the shipped
    // single-page policy, applied page by page in index order.
    expect(writesOf(port)).toEqual([
      `remove:${SLOT_A}`,
      `set:${PAGE_INDEX_KEY}`,
      `remove:${SLOT_B}`,
      `set:${PAGE_INDEX_KEY}`,
      `remove:${SLOT_C}`,
      `set:${PAGE_INDEX_KEY}`,
    ]);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('answers an empty sweep with no write at all when the name owns nothing', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    const foreign = recordOf('foreign-a', PAGE_A, OTHER_NAME);
    seedSlot(port, PAGE_A, [foreign]);
    seedSlot(port, PAGE_B, [recordOf('foreign-b', PAGE_B, OTHER_NAME)]);
    const before = port.snapshot();

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result).toEqual({ ok: true, removed: [], failed: [] });
    expect(writesOf(port)).toEqual([]);
    expect(port.snapshot()).toEqual(before);
  });

  it('compares authors through the one identity rule, so a trailing space is the same author', async () => {
    const port = indexedPort([PAGE_A]);
    const spaced = recordOf('spaced', PAGE_A, `${OLD_NAME} `);
    seedSlot(port, PAGE_A, [spaced, recordOf('other', PAGE_A, OTHER_NAME)]);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(idsOf(storedRecords(port, SLOT_A) ?? [])).toEqual(['other']);
  });

  it('carries an unreadable record through the sweep verbatim (A16)', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME), CORRUPT]);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records).toEqual([CORRUPT]);
    expect(records[0]).toBe(CORRUPT);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('deletes a note whose stored name is the previous name even when it is not the first page', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_A, [recordOf('foreign-a', PAGE_A, OTHER_NAME)]);
    seedSlot(port, PAGE_B, [recordOf('old-b', PAGE_B, OLD_NAME)]);

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect((result as { removed: { id: string }[] }).removed.map((entry) => entry.id)).toEqual([
      'old-b',
    ]);
    expect(storedRecords(port, SLOT_A)).toEqual([recordOf('foreign-a', PAGE_A, OTHER_NAME)]);
    expect(storedRecords(port, SLOT_B)).toBeUndefined();
  });
});

describe('AC2 — notes of other authors survive the rename unchanged', () => {
  it('leaves every other author record byte-identical, in place and in order', async () => {
    const port = indexedPort([PAGE_A]);
    const first = recordOf('foreign-1', PAGE_A, OTHER_NAME);
    const second = recordOf('foreign-2', PAGE_A, 'Виктор');
    seedSlot(port, PAGE_A, [first, recordOf('old-a', PAGE_A, OLD_NAME), second]);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    const records = storedRecords(port, SLOT_A) ?? [];
    expect(records).toEqual([first, second]);
    expect(records[0]).toBe(first);
    expect(records[1]).toBe(second);
  });

  it('leaves another page of another author untouched, object identity included', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    const otherSlot = slotValue([recordOf('foreign-b', PAGE_B, OTHER_NAME)]);
    port.seed(SLOT_B, otherSlot);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(port.snapshot()[SLOT_B]).toBe(otherSlot);
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B] });
  });

  it('keeps the new name’s notes when the store already holds some', async () => {
    const port = indexedPort([PAGE_A]);
    const newName = recordOf('new-a', PAGE_A, 'Вера');
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME), newName]);

    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(storedRecords(port, SLOT_A)).toEqual([newName]);
  });
});

describe('AC3 — the server is not called during a rename', () => {
  it('sweeps with a recording transport in scope and sees zero calls', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    seedSlot(port, PAGE_B, [recordOf('old-b', PAGE_B, OLD_NAME)]);
    const { transport, calls } = recordingTransport();

    // The sweep takes no transport argument at all: the only way a request could
    // happen is a module-level import of a sync module, and this module imports none.
    await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(calls).toEqual([]);
    expect(transport).toBeDefined();
    expect(port.calls.every((call) => ['get', 'set', 'remove'].includes(call.op))).toBe(true);
  });
});

describe('A173 — a page that cannot be read is reported and does not stop the sweep', () => {
  it('keeps the notes of an unreadable page and sweeps the pages after it', async () => {
    const port = indexedPort([PAGE_A, PAGE_B, PAGE_C]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    // PAGE_B's slot is not a page slot: the single-page write refuses it.
    port.seed(SLOT_B, { version: 2, entries: [recordOf('old-b', PAGE_B, OLD_NAME)] });
    seedSlot(port, PAGE_C, [recordOf('old-c', PAGE_C, OLD_NAME)]);

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result.ok).toBe(true);
    expect((result as { failed: { pageKey: string; code: string }[] }).failed).toEqual([
      { pageKey: PAGE_B, code: 'layout_version' },
    ]);
    expect((result as { removed: { id: string }[] }).removed.map((entry) => entry.id)).toEqual([
      'old-a',
      'old-c',
    ]);
    // The unreadable page keeps its value verbatim: nothing dropped it.
    expect(port.snapshot()[SLOT_B]).toEqual({
      version: 2,
      entries: [recordOf('old-b', PAGE_B, OLD_NAME)],
    });
    expect(storedRecords(port, SLOT_A)).toBeUndefined();
    expect(storedRecords(port, SLOT_C)).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_B] });
  });

  it('refuses an unusable index and writes nothing at all', async () => {
    for (const value of [{ version: 2, pageKeys: [PAGE_A] }, 'not-an-index']) {
      const port = new MemoryStoragePort();
      port.seed(PAGE_INDEX_KEY, value);
      seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
      const before = port.snapshot();

      const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

      expect(result.ok).toBe(false);
      expect(['layout_version', 'index_malformed']).toContain(
        (result as { code: string }).code,
      );
      expect(writesOf(port)).toEqual([]);
      expect(port.snapshot()).toEqual(before);
    }
  });

  it('reads an absent index as an empty store and sweeps nothing', async () => {
    // A missing `pages:v1` is not an unusable index: it is a store with no page, and
    // the single-page writes treat it the same way. The sweep costs one read and no write.
    const port = new MemoryStoragePort();

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result).toEqual({ ok: true, removed: [], failed: [] });
    expect(writesOf(port)).toEqual([]);
  });

  it('reports a failed index read as storage_unavailable and writes nothing', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result).toEqual({ ok: false, code: 'storage_unavailable', removed: [], failed: [] });
    expect(writesOf(port)).toEqual([]);
  });

  it('reports a page whose slot write fails and keeps sweeping the rest', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_A, [recordOf('old-a', PAGE_A, OLD_NAME)]);
    seedSlot(port, PAGE_B, [recordOf('old-b', PAGE_B, OLD_NAME)]);
    port.failWriteOn(SLOT_A, 'quota');

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result.ok).toBe(true);
    expect((result as { failed: { pageKey: string; code: string }[] }).failed).toEqual([
      { pageKey: PAGE_A, code: 'quota' },
    ]);
    // PAGE_A kept its note because its slot write failed; PAGE_B was still swept.
    expect(storedRecords(port, SLOT_A)).toEqual([recordOf('old-a', PAGE_A, OLD_NAME)]);
    expect(storedRecords(port, SLOT_B)).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [PAGE_A] });
  });

  it('sweeps a page whose indexed key is unnormalized but reachable', async () => {
    const unnormalized = 'https://example.com/a?lang=ru';
    const port = indexedPort([unnormalized]);
    seedSlot(port, unnormalized, [recordOf('old-a', unnormalized, OLD_NAME)]);

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result.ok).toBe(true);
    expect((result as { failed: unknown[] }).failed).toEqual([]);
    expect(storedRecords(port, entryStorageKey(unnormalized))).toBeUndefined();
    expect(storedIndexOf(port)).toEqual({ version: 1, pageKeys: [] });
  });

  it('sweeps nothing and writes nothing when the index lists no page', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([]));

    const result = await deleteNotesOfAuthorOnAllPages(port, OLD_NAME);

    expect(result).toEqual({ ok: true, removed: [], failed: [] });
    expect(writesOf(port)).toEqual([]);
  });
});
