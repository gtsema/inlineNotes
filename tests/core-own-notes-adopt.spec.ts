import { describe, expect, it } from 'vitest';

import type { Entry, EntryAnchor } from '../src/core/entry';
import { MAX_ENTRIES_PER_PAGE } from '../src/core/entry-rules';
import type { AdoptOwnNotesInput } from '../src/core/entry-store-write';
import { adoptOwnNotes } from '../src/core/entry-store-write';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
  storedIndexOf,
} from './support/memory-storage-port';

/**
 * The adoption rule of task `t20-01` (rulings `A197`-`A199` of
 * `docs/specs/sync-integration.md`): one core write merges the server's copy of the
 * reader's own notes into a page's stored list, so a note created on one machine
 * becomes a stored note on a second machine whose store is empty.
 *
 * Every case runs on the hand-written in-memory `StoragePort`, so the merge outcome is
 * observed in the port snapshot and the "wrote nothing" cases are observed in the port
 * call log instead of asserted by prose.
 */

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';
const SLOT_A = entryStorageKey(PAGE_A);

const NAME = 'reader-one';
const OTHER = 'reader-two';

const ANCHOR: EntryAnchor = {
  text: 'selected text',
  prefix: '',
  suffix: '',
  fragmentCount: 1,
};

const EARLY = '2026-03-01T00:00:00.000Z';
const NOW = '2026-03-04T05:06:07.008Z';
const LATER = '2026-03-05T08:09:10.011Z';

/** A remote row (an `Entry` as `entryFromRemoteNote` maps it) with overrides. */
function row(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'a1b2c3d4e5f6',
    pageKey: PAGE_A,
    authorName: NAME,
    text: 'selected text',
    comment: 'my note',
    anchor: ANCHOR,
    visible: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function input(remote: readonly Entry[], overrides: Partial<AdoptOwnNotesInput> = {}): AdoptOwnNotesInput {
  return {
    url: overrides.url ?? PAGE_A,
    currentName: overrides.currentName ?? NAME,
    remote,
  };
}

function indexedPort(pageKeys: readonly string[] = []): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue(pageKeys));
  return port;
}

function seedSlot(port: MemoryStoragePort, pageKey: string, records: readonly unknown[]): void {
  port.seed(entryStorageKey(pageKey), slotValue(records));
}

/** The `entries` array of a stored slot, `undefined` when no slot value is stored. */
function storedRecords(port: MemoryStoragePort, storageKey: string): unknown[] | undefined {
  const value = port.snapshot()[storageKey];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = (value as { entries?: unknown }).entries;
  return Array.isArray(entries) ? entries : undefined;
}

/** Reads one stored record back out of a slot by position, for field assertions. */
function recordAt(port: MemoryStoragePort, storageKey: string, index: number): Entry {
  const records = storedRecords(port, storageKey);
  expect(records).toBeDefined();
  return records?.[index] as Entry;
}

describe('adoptOwnNotes (A197-A199)', () => {
  it('adopts the own rows into an empty page as one slot write plus one index write', async () => {
    const port = indexedPort();
    const first = row({ id: 'aaaaaaaaaaaa', createdAt: EARLY, updatedAt: EARLY });
    const second = row({ id: 'bbbbbbbbbbbb', text: 'second', comment: 'second note' });

    const result = await adoptOwnNotes(port, input([first, second]));

    expect(result).toEqual({ ok: true, adopted: 2, skipped: 0 });
    expect(storedRecords(port, SLOT_A)).toEqual([first, second]);
    // The whole-list commit: one slot write, then exactly one index update.
    expect(port.calls.map((call) => call.op)).toEqual(['get', 'get', 'set', 'set']);
    expect(port.calls[2]?.keys).toEqual([SLOT_A]);
    expect(port.calls[3]?.keys).toEqual([PAGE_INDEX_KEY]);
    expect(storedIndexOf(port)?.pageKeys).toEqual([PAGE_A]);
  });

  it('skips a foreign author and a row of another page, counting both', async () => {
    const port = indexedPort();
    const own = row({ id: 'aaaaaaaaaaaa' });
    const foreign = row({ id: 'bbbbbbbbbbbb', authorName: OTHER });
    const otherPage = row({ id: 'cccccccccccc', pageKey: PAGE_B });

    const result = await adoptOwnNotes(port, input([own, foreign, otherPage]));

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 2 });
    expect(storedRecords(port, SLOT_A)).toEqual([own]);
  });

  it('skips a row whose page key is not the asked one even when it is the reader’s own', async () => {
    const port = indexedPort([PAGE_A, PAGE_B]);
    seedSlot(port, PAGE_B, []);

    const result = await adoptOwnNotes(port, input([row({ pageKey: PAGE_B })]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 1 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
    expect(storedRecords(port, SLOT_A)).toBeUndefined();
  });

  it('skips an empty and an over-long comment without touching the store', async () => {
    const port = indexedPort();
    const empty = row({ id: 'aaaaaaaaaaaa', comment: '   ' });
    const overLong = row({ id: 'bbbbbbbbbbbb', comment: 'x'.repeat(257) });

    const result = await adoptOwnNotes(port, input([empty, overLong]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 2 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
  });

  it('stores an adopted padded comment trimmed, never with its padding', async () => {
    // Review finding 1 of `t20-03`: `validateComment` measures the trimmed value, so
    // the stored record must carry that same normalized value (`A197`).
    const port = indexedPort();
    const padded = row({ id: 'aaaaaaaaaaaa', comment: '  spaced  ' });

    const result = await adoptOwnNotes(port, input([padded]));

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(recordAt(port, SLOT_A, 0).comment).toBe('spaced');
    // The rest of the row is stored as the wire gave it; only the comment is trimmed.
    expect(recordAt(port, SLOT_A, 0).text).toBe('selected text');
    expect(recordAt(port, SLOT_A, 0).anchor).toEqual(ANCHOR);
  });

  it('stores an adopted replace with the trimmed comment too', async () => {
    // The same normalization on the replace path (`A198`), not only on a new row.
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [storedEntry({ createdAt: EARLY, updatedAt: EARLY })]);

    const result = await adoptOwnNotes(
      port,
      input([row({ comment: '  spaced  ', createdAt: EARLY, updatedAt: LATER })]),
    );

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(recordAt(port, SLOT_A, 0).comment).toBe('spaced');
  });

  it('skips a padded comment whose trimmed value is over 256 code points, writing nothing', async () => {
    const port = indexedPort();
    // 257 code points once trimmed: the raw string is even longer, so a check that
    // measured the raw length or stored the raw value would wrongly accept it.
    const overLong = row({ id: 'aaaaaaaaaaaa', comment: `  ${'x'.repeat(257)}  ` });

    const result = await adoptOwnNotes(port, input([overLong]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 1 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
    expect(storedRecords(port, SLOT_A)).toBeUndefined();
  });

  it('writes nothing at all when the only row has equal content (port call log)', async () => {
    const port = indexedPort([PAGE_A]);
    const stored = storedEntry({ createdAt: EARLY, updatedAt: EARLY });
    seedSlot(port, PAGE_A, [stored]);
    port.calls.length = 0;

    // The server moved only its own `updated_at`; the content is byte-identical.
    const result = await adoptOwnNotes(port, input([row({ createdAt: EARLY, updatedAt: LATER })]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
    expect(storedRecords(port, SLOT_A)).toEqual([stored]);
  });

  it('replaces a stored record with a newer remote copy and keeps its visible:false flag', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [storedEntry({ visible: false, updatedAt: EARLY, createdAt: EARLY })]);

    const result = await adoptOwnNotes(
      port,
      input([row({ comment: 'edited remotely', createdAt: EARLY, updatedAt: LATER })]),
    );

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    const stored = recordAt(port, SLOT_A, 0);
    expect(stored.comment).toBe('edited remotely');
    expect(stored.updatedAt).toBe(LATER);
    expect(stored.createdAt).toBe(EARLY);
    expect(stored.visible).toBe(false);
  });

  it('keeps a stored record that is newer than the remote row', async () => {
    const port = indexedPort([PAGE_A]);
    const stored = storedEntry({ comment: 'local newest', updatedAt: LATER, createdAt: EARLY });
    seedSlot(port, PAGE_A, [stored]);
    port.calls.length = 0;

    const result = await adoptOwnNotes(
      port,
      input([row({ comment: 'remote older', createdAt: EARLY, updatedAt: NOW })]),
    );

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(storedRecords(port, SLOT_A)).toEqual([stored]);
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
  });

  it('keeps the stored record on equal updatedAt when the content differs', async () => {
    const port = indexedPort([PAGE_A]);
    const stored = storedEntry({ comment: 'local equal stamp', updatedAt: NOW, createdAt: EARLY });
    seedSlot(port, PAGE_A, [stored]);
    port.calls.length = 0;

    const result = await adoptOwnNotes(
      port,
      input([row({ comment: 'remote equal stamp', createdAt: EARLY, updatedAt: NOW })]),
    );

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(storedRecords(port, SLOT_A)).toEqual([stored]);
  });

  it('treats a different anchor as different content when the remote copy is newer', async () => {
    const port = indexedPort([PAGE_A]);
    seedSlot(port, PAGE_A, [storedEntry({ createdAt: EARLY, updatedAt: EARLY })]);

    const result = await adoptOwnNotes(
      port,
      input([
        row({
          createdAt: EARLY,
          updatedAt: LATER,
          anchor: { text: 'selected text', prefix: 'the ', suffix: ' here', fragmentCount: 2 },
        }),
      ]),
    );

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(recordAt(port, SLOT_A, 0).anchor).toEqual({
      text: 'selected text',
      prefix: 'the ',
      suffix: ' here',
      fragmentCount: 2,
    });
  });

  it('treats a same-id row of another author as a new entry, keeping both', async () => {
    const port = indexedPort([PAGE_A]);
    const foreign = storedEntry({ authorName: OTHER, id: 'aaaaaaaaaaaa', comment: 'their note' });
    seedSlot(port, PAGE_A, [foreign]);

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa', comment: 'my note' })]));

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    const records = storedRecords(port, SLOT_A);
    expect(records).toHaveLength(2);
    expect((records?.[0] as Entry).comment).toBe('their note');
    expect((records?.[1] as Entry).comment).toBe('my note');
  });

  it('adopts new rows in createdAt order up to the cap and skips the overflow', async () => {
    const port = indexedPort();
    const remote: Entry[] = [];
    // 21 rows: the 21st carries the newest `createdAt` and must be the skipped one.
    for (let index = 0; index < MAX_ENTRIES_PER_PAGE + 1; index += 1) {
      remote.push(
        row({
          id: String(index).padStart(12, '0'),
          comment: `note ${index}`,
          createdAt: `2026-03-01T00:00:${String(index).padStart(2, '0')}.000Z`,
          updatedAt: NOW,
        }),
      );
    }
    // The answer is shuffled, so the cap must sort, not trust the wire order.
    const shuffled = [remote[MAX_ENTRIES_PER_PAGE] as Entry, ...remote.slice(0, MAX_ENTRIES_PER_PAGE)];

    const result = await adoptOwnNotes(port, input(shuffled));

    expect(result).toEqual({ ok: true, adopted: MAX_ENTRIES_PER_PAGE, skipped: 1 });
    const records = storedRecords(port, SLOT_A);
    expect(records).toHaveLength(MAX_ENTRIES_PER_PAGE);
    // The oldest 20 landed, in createdAt order; the newest row did not.
    expect((records?.[0] as Entry).id).toBe('000000000000');
    expect((records?.[MAX_ENTRIES_PER_PAGE - 1] as Entry).id).toBe('000000000019');
    expect(records?.some((record) => (record as Entry).id === '000000000020')).toBe(false);
  });

  it('never deletes a stored entry to make room for an adopted row', async () => {
    const port = indexedPort([PAGE_A]);
    const full: unknown[] = [];
    for (let index = 0; index < MAX_ENTRIES_PER_PAGE; index += 1) {
      full.push(
        storedEntry({ id: String(index).padStart(12, '0'), comment: `stored ${index}`, createdAt: EARLY }),
      );
    }
    seedSlot(port, PAGE_A, full);
    port.calls.length = 0;

    const result = await adoptOwnNotes(port, input([row({ id: 'ffffffffffff', comment: 'new remote' })]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 1 });
    expect(storedRecords(port, SLOT_A)).toEqual(full);
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
  });

  it('replaces a record on a full page without letting the replace consume cap room', async () => {
    const port = indexedPort([PAGE_A]);
    const full: unknown[] = [];
    for (let index = 0; index < MAX_ENTRIES_PER_PAGE; index += 1) {
      full.push(
        storedEntry({
          id: String(index).padStart(12, '0'),
          comment: `stored ${index}`,
          createdAt: EARLY,
          updatedAt: EARLY,
        }),
      );
    }
    seedSlot(port, PAGE_A, full);

    const result = await adoptOwnNotes(
      port,
      input([
        // Replaces the stored record at position 0: same identity, newer content.
        row({ id: '000000000000', comment: 'edited remotely', createdAt: EARLY, updatedAt: LATER }),
        // A brand-new row: the page is full, so it is skipped.
        row({ id: 'ffffffffffff', comment: 'new remote', createdAt: LATER, updatedAt: LATER }),
      ]),
    );

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 1 });
    const records = storedRecords(port, SLOT_A);
    expect(records).toHaveLength(MAX_ENTRIES_PER_PAGE);
    expect((records?.[0] as Entry).comment).toBe('edited remotely');
  });

  it('stores no title on an adopted row, even when the remote row carries one (A190)', async () => {
    const port = indexedPort();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa', title: 'Some Page' })]));

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(recordAt(port, SLOT_A, 0)).not.toHaveProperty('title');
  });

  it('is idempotent: a second identical call writes nothing', async () => {
    const port = indexedPort();
    const remote = [row({ id: 'aaaaaaaaaaaa', createdAt: EARLY, updatedAt: EARLY })];

    const first = await adoptOwnNotes(port, input(remote));
    expect(first).toEqual({ ok: true, adopted: 1, skipped: 0 });

    port.calls.length = 0;
    const second = await adoptOwnNotes(port, input(remote));

    expect(second).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
  });

  it('answers no write for an empty remote list', async () => {
    const port = indexedPort();

    const result = await adoptOwnNotes(port, input([]));

    expect(result).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual([]);
  });

  it('refuses with storage_unavailable when the port read fails, changing nothing', async () => {
    const port = indexedPort([PAGE_A]);
    const stored = storedEntry({ createdAt: EARLY });
    seedSlot(port, PAGE_A, [stored]);
    port.failReadOn(PAGE_INDEX_KEY, 'unavailable');
    const before = port.snapshot();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'storage_unavailable' });
    expect(port.snapshot()).toEqual(before);
  });

  it('refuses with index_malformed for an unreadable index, changing nothing', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, { version: 1, pageKeys: 'not-an-array' });
    const before = port.snapshot();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'index_malformed' });
    expect(port.snapshot()).toEqual(before);
  });

  it('refuses with layout_version for an index of another layout', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, { version: 2, pageKeys: [PAGE_A] });

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'layout_version' });
  });

  it('refuses with slot_malformed for a slot value that is not a page slot, changing nothing', async () => {
    const port = indexedPort([PAGE_A]);
    port.seed(SLOT_A, { version: 1, entries: 'not-an-array' });
    const before = port.snapshot();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'slot_malformed' });
    expect(port.snapshot()).toEqual(before);
  });

  it('refuses with layout_version for a slot value of another layout, changing nothing', async () => {
    const port = indexedPort([PAGE_A]);
    port.seed(SLOT_A, { version: 2, entries: [] });
    const before = port.snapshot();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'layout_version' });
    expect(port.snapshot()).toEqual(before);
  });

  it('refuses with url_unparsable for a URL that yields no page key', async () => {
    const port = indexedPort();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })], { url: 'not a url' }));

    expect(result).toEqual({ ok: false, code: 'url_unparsable' });
  });

  it('refuses with the port failure code when the slot write fails, leaving the store untouched', async () => {
    const port = indexedPort();
    port.failWriteOn(SLOT_A, 'quota');
    const before = port.snapshot();

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: false, code: 'quota' });
    expect(port.snapshot()).toEqual(before);
    expect(storedIndexOf(port)?.pageKeys).toEqual([]);
  });

  it('carries an unreadable stored record through the write verbatim (A16)', async () => {
    const port = indexedPort([PAGE_A]);
    const corrupt = { id: 'broken', nonsense: true };
    seedSlot(port, PAGE_A, [corrupt]);

    const result = await adoptOwnNotes(port, input([row({ id: 'aaaaaaaaaaaa' })]));

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(storedRecords(port, SLOT_A)).toEqual([corrupt, row({ id: 'aaaaaaaaaaaa' })]);
  });

  it('adopts on a page whose key comes from the origin+pathname fallback', async () => {
    // The stored index lists a variant key of the same page, so the write must land
    // under the resolved key rather than forking a new page (N5).
    const variant = `${PAGE_A}?page=2`;
    const port = indexedPort([variant]);
    seedSlot(port, variant, []);

    const result = await adoptOwnNotes(
      port,
      input([row({ id: 'aaaaaaaaaaaa', pageKey: variant })], { url: PAGE_A }),
    );

    expect(result).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(storedRecords(port, entryStorageKey(variant))).toEqual([
      row({ id: 'aaaaaaaaaaaa', pageKey: variant }),
    ]);
    expect(storedRecords(port, SLOT_A)).toBeUndefined();
  });
});
