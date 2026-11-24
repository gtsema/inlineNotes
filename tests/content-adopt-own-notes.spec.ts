import { describe, expect, it } from 'vitest';

import type { Entry } from '../src/core/entry';
import { adoptOwnNotesOfLoad } from '../src/content/sync/adopt-own-notes';
import type { RemoteNote } from '../src/core/sync-client';
import type { StoragePort } from '../src/core/storage-port';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The content-layer adopter of task `t20-02` (rulings `A197`-`A199` of
 * `docs/specs/sync-integration.md`).
 *
 * This file owns the half of adoption that is neither the loader
 * (`tests/content-sync-notes.spec.ts` -> the `A197` describes) nor the core merge rule
 * (`tests/core-own-notes-adopt.spec.ts`): the **mapping** of the wire rows and the
 * **best-effort contract** — the module that both load paths reach, and the only
 * content module besides the two shipped write flows that imports the core write.
 *
 * Three claims:
 *
 * - the rows are mapped once, here, through `entryFromRemoteNote`, and a row this
 *   extension cannot read is skipped rather than passed on;
 * - the write is the one core write, addressed by the page **address**, so the core rule
 *   resolves the page key through the stored index like every other write;
 * - the function **cannot reject**: a port that throws, a read that rejects, an
 *   unreadable index and an unparsable address are all answers, and none of them reaches
 *   the caller as a throw (`A199`).
 */

const PAGE_KEY = 'https://example.com/a';
const SLOT_KEY = entryStorageKey(PAGE_KEY);
const NAME = 'reader-one';

const ANCHOR = { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 };

function remote(overrides: Partial<RemoteNote> = {}): RemoteNote {
  return {
    id: 'own001',
    page_id: PAGE_KEY,
    author_id: NAME,
    text: 'selected text',
    comment: 'my note',
    anchor: ANCHOR,
    created_at: '2026-01-02T03:04:05.006Z',
    updated_at: '2026-01-02T03:04:05.006Z',
    ...overrides,
  };
}

function emptyPagePort(): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
  return port;
}

function storedIds(port: MemoryStoragePort): string[] {
  const slot = port.snapshot()[SLOT_KEY] as { entries: Entry[] } | undefined;
  return (slot?.entries ?? []).map((entry) => entry.id);
}

describe('AC22 the adopter maps the wire rows and writes them once (A197)', () => {
  it('adopts a readable own row into an empty page, addressed by the page url', async () => {
    const port = emptyPagePort();

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(storedIds(port)).toEqual(['own001']);
  });

  it('addresses the write by the url, so core resolves the key through the index (N5)', async () => {
    // The address carries query noise the way a real page does; the copy that reaches
    // the slot is the stored key, which the caller never names.
    const port = emptyPagePort();
    await adoptOwnNotesOfLoad({
      port,
      url: `${PAGE_KEY}?utm_source=newsletter#top`,
      currentName: NAME,
      notes: [remote()],
    });

    expect(storedIds(port)).toEqual(['own001']);
  });

  it('skips a row it cannot read as an entry, and adopts the readable one', async () => {
    const port = emptyPagePort();

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [
        remote({ id: 'good0001' }),
        // An anchor that is a scalar can never be resolved on the page.
        remote({ id: 'bad00001', anchor: 'text' }),
        // A row with no author name is not an entry `createEntry` would store.
        remote({ id: 'bad00002', author_id: 42 as unknown as string }),
      ],
    });

    expect(outcome).toEqual({ ok: true, adopted: 1, skipped: 0 });
    expect(storedIds(port)).toEqual(['good0001']);
  });

  it('calls no core write at all when no row is readable', async () => {
    const port = emptyPagePort();
    port.seed(SLOT_KEY, slotValue([storedEntry({ id: 'kept0001' })]));
    const before = port.calls.length;

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote({ anchor: 'text' })],
    });

    // `null` is "nothing to attempt": no core call, no port access of any kind.
    expect(outcome).toBeNull();
    expect(port.calls.length).toBe(before);
    expect(storedIds(port)).toEqual(['kept0001']);
  });

  it('leaves a foreign row to the memory: the core rule skips it', async () => {
    const port = emptyPagePort();

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote({ id: 'theirs001', author_id: 'Вася' })],
    });

    expect(outcome).toEqual({ ok: true, adopted: 0, skipped: 1 });
    expect(storedIds(port)).toEqual([]);
  });

  it('is idempotent: a second call over the same rows writes nothing', async () => {
    const port = emptyPagePort();
    const notes = [remote()];

    await adoptOwnNotesOfLoad({ port, url: PAGE_KEY, currentName: NAME, notes });
    const outcome = await adoptOwnNotesOfLoad({ port, url: PAGE_KEY, currentName: NAME, notes });

    expect(outcome).toEqual({ ok: true, adopted: 0, skipped: 0 });
    expect(storedIds(port)).toEqual(['own001']);
  });
});

describe('AC24 the adopter is best effort and cannot reject (A199)', () => {
  it('answers a refusal instead of throwing when the port rejects a read', async () => {
    const failing: StoragePort = {
      get: async () => await Promise.reject(new Error('port down')),
      set: async () => await Promise.reject(new Error('port down')),
      remove: async () => await Promise.reject(new Error('port down')),
    };

    const outcome = await adoptOwnNotesOfLoad({
      port: failing,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome).toEqual({ ok: false, code: 'storage_unavailable' });
  });

  it('answers a refusal when the port throws synchronously', async () => {
    const throwing: StoragePort = {
      get: (): Promise<Record<string, unknown>> => {
        throw new Error('port down');
      },
      set: async () => undefined,
      remove: async () => undefined,
    };

    const outcome = await adoptOwnNotesOfLoad({
      port: throwing,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome).toEqual({ ok: false, code: 'storage_unavailable' });
  });

  it('answers a refusal for an address the core key rule cannot use', async () => {
    const port = emptyPagePort();

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: 'not a url',
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome?.ok).toBe(false);
    expect(storedIds(port)).toEqual([]);
  });

  it('answers a refusal for an unreadable page index, and changes nothing', async () => {
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, { version: 1, pageKeys: 'nope' });
    port.seed(SLOT_KEY, slotValue([storedEntry({ id: 'kept0001' })]));

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome).toEqual({ ok: false, code: 'index_malformed' });
    expect(storedIds(port)).toEqual(['kept0001']);
  });

  it('answers the shipped slot refusals and keeps the slot bytes (A16)', async () => {
    // The value is not a `{ version, entries }` record, which the shipped write path
    // answers as `layout_version` and carries through untouched (`A16`): adoption reuses
    // the same guard rather than inventing a second reading of the slot.
    const port = emptyPagePort();
    port.seed(SLOT_KEY, { not: 'a page slot' });

    const outcome = await adoptOwnNotesOfLoad({
      port,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });

    expect(outcome).toEqual({ ok: false, code: 'layout_version' });
    expect(port.snapshot()[SLOT_KEY]).toEqual({ not: 'a page slot' });

    // A record the read guard can decode, written under the slot, is refused as
    // `slot_malformed` — the shape the shipped writes answer for a slot whose version
    // is right but whose entries are not a list.
    const second = emptyPagePort();
    second.seed(SLOT_KEY, { version: 1, entries: 'nope' });
    const malformed = await adoptOwnNotesOfLoad({
      port: second,
      url: PAGE_KEY,
      currentName: NAME,
      notes: [remote()],
    });
    expect(malformed).toEqual({ ok: false, code: 'slot_malformed' });
    expect(second.snapshot()[SLOT_KEY]).toEqual({ version: 1, entries: 'nope' });
  });
});
