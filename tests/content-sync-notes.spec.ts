// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { RemoteNote, SyncTransport } from '../src/core/sync-client';
import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { ExtraEntry } from '../src/content/paint/paint-plan';
import { createForeignNotes, loadIntoMemory } from '../src/content/sync/foreign-notes';
import { attachSyncNotes } from '../src/content/sync/sync-notes';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The foreign notes and the automatic load (Stage 17, `t17-01` AC7, AC8, AC10, AC11).
 *
 * Three claims, each its own group of cases:
 *
 * - **memory only** (`A163`): the list is a closure, no port is passed to it, and a
 *   delete removes rows from view without a storage write and without a request;
 * - **the automatic load** (`A163`, `A164`): one request per page key, `A166` decided
 *   before anything is asked, and every failure an answer rather than a rejection;
 * - **the wiring** (`A167` in practice): the paint pass takes the list the memory holds,
 *   and "ask once" is a property of the wiring rather than of the caller.
 *
 * The port is the in-memory one, so the "never written" half is checked against the
 * port's own call log and not against a comment.
 */

const PAGE_KEY = 'https://example.com/a';
const TARGET = {
  serverUrl: 'http://localhost:8080',
  notesPageBase: 'http://localhost:8080/notes/page/',
};

function remote(overrides: Partial<RemoteNote> = {}): RemoteNote {
  return {
    id: 'their001',
    page_id: PAGE_KEY,
    author_id: 'Вася',
    text: 'selected text',
    comment: 'their note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    created_at: '2026-01-02T03:04:05.006Z',
    updated_at: '2026-01-02T03:04:05.006Z',
    ...overrides,
  };
}


interface Call {
  url: string;
  method: string;
}

function transportOf(answer: { ok?: boolean; status?: number; body?: unknown } = {}): {
  transport: SyncTransport;
  calls: Call[];
} {
  const calls: Call[] = [];
  const transport: SyncTransport = async (url, init) => {
    calls.push({ url, method: init.method });
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: async (): Promise<unknown> => {
        if ('body' in answer) {
          return answer.body;
        }
        throw new Error('no body');
      },
    };
  };
  return { transport, calls };
}

function portOf(settings: Record<string, unknown> = {}): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
  port.seed(entryStorageKey(PAGE_KEY), slotValue([storedEntry({ id: 'own001' })]));
  port.seed(SETTINGS_KEY, {
    name: 'reader-one',
    serverUrl: 'http://localhost:8080',
    syncEnabled: true,
    ...settings,
  });
  return port;
}

describe('AC7 foreign notes are memory only, and their rows are this document\'s (A163)', () => {
  it('decodes the server rows into entries, dropping the reader\'s own', () => {
    const memory = createForeignNotes();
    memory.replace([remote(), remote({ id: 'own001', author_id: 'reader-one' })], 'reader-one');

    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
  });

  it('keeps two authors\' notes with one id, because the server identifies a note by the triple', () => {
    const memory = createForeignNotes();
    memory.replace([remote({ id: 'same0001' }), remote({ id: 'same0001', author_id: 'Петя' })], 'reader-one');

    expect(memory.all()).toHaveLength(2);
  });

  it('skips a row it cannot read as an entry instead of inventing one', () => {
    const memory = createForeignNotes();
    memory.replace(
      [
        remote({ id: 'best0001' }),
        // A row whose anchor is a scalar can never be anchored on the page.
        remote({ id: 'bad00001', anchor: 'text' }),
        // A row with no author name is a row `createEntry` would store as an empty author,
        // which the entry rules refuse; the boundary check drops it first.
        remote({ id: 'bad00002', author_id: 42 as unknown as string }),
      ],
      'reader-one',
    );
    expect(memory.all().map((note) => note.entry.id)).toEqual(['best0001']);
  });

  it('replaces the list rather than appending: a note the server dropped is gone', () => {
    const memory = createForeignNotes();
    memory.replace([remote({ id: 'first001' })], 'reader-one');
    memory.replace([remote({ id: 'second01' })], 'reader-one');

    expect(memory.all().map((note) => note.entry.id)).toEqual(['second01']);
  });

  it('arrives visible and can be switched off in memory, which is the only place it lives', () => {
    const memory = createForeignNotes();
    memory.replace([remote()], 'reader-one');

    expect(memory.visibilityOf('their001')).toBe(true);
    expect(memory.setNoteVisible('their001', false)).toBe(true);
    expect(memory.visibilityOf('their001')).toBe(false);
    // The paint input is where the flag is read: one record and one flag (`A40`).
    expect(memory.paintInput()).toEqual([{ entry: memory.all()[0]?.entry, visible: false }]);
    // A note this page does not hold answers `false`, so a caller can tell the two apart.
    expect(memory.setNoteVisible('nobody01', false)).toBe(false);
  });

  it('deletes one author locally without a request and without a write (answer 5)', () => {
    const memory = createForeignNotes();
    memory.replace([remote(), remote({ id: 'their002' }), remote({ id: 'their003', author_id: 'Петя' })], 'reader-one');

    expect(memory.dismiss('Вася')).toBe(2);
    expect(memory.all().map((note) => note.entry.authorName)).toEqual(['Петя']);
    // Nothing to write to: this module holds no port at all, which is why the absence is
    // structural rather than observed. The assertion is the shape of the API.
    // `t17-06` adds the fifth operation, `dismissNote` (ruling `A168` applied to one
    // note instead of one author), and with it no port of any kind: the list is the same
    // closure it was, and this assertion stays structural rather than observed.
    expect(Object.keys(memory).sort()).toEqual([
      'all',
      'authors',
      'dismiss',
      'dismissNote',
      'paintInput',
      'replace',
      'setNoteVisible',
      'visibilityOf',
    ]);
  });

  it('groups its authors with the aggregate flag the popup row reads (A108)', () => {
    const memory = createForeignNotes();
    memory.replace([remote(), remote({ id: 'their002' })], 'reader-one');
    memory.setNoteVisible('their002', false);

    expect(memory.authors()).toEqual([{ authorName: 'Вася', count: 2, allVisible: false }]);
  });
});

describe('AC7 the automatic load asks once, and only when there is somewhere to ask (A163, A166)', () => {
  it('GETs the page key the paint pass resolved', async () => {
    const memory = createForeignNotes();
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });

    const outcome = await loadIntoMemory(memory, {
      transport,
      target: TARGET,
      pageKey: PAGE_KEY,
      currentName: 'reader-one',
    });

    expect(outcome).toEqual({ ok: true, added: 1 });
    expect(calls).toEqual([
      { url: `http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}`, method: 'GET' },
    ]);
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
  });

  it('makes no request at all with no target (A166)', async () => {
    const memory = createForeignNotes();
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });

    expect(
      await loadIntoMemory(memory, {
        transport,
        target: null,
        pageKey: PAGE_KEY,
        currentName: 'reader-one',
      }),
    ).toEqual({ ok: false, code: 'sync_off' });
    expect(calls).toEqual([]);
  });

  it('answers every failure as a code, including a transport that throws (A164)', async () => {
    const memory = createForeignNotes();
    const throwing: SyncTransport = async () => {
      throw new TypeError('Failed to fetch');
    };

    expect(
      await loadIntoMemory(memory, {
        transport: throwing,
        target: TARGET,
        pageKey: PAGE_KEY,
        currentName: 'reader-one',
      }),
    ).toEqual({ ok: false, code: 'network' });
    expect(
      await loadIntoMemory(memory, {
        transport: transportOf({ ok: false, status: 500, body: {} }).transport,
        target: TARGET,
        pageKey: PAGE_KEY,
        currentName: 'reader-one',
      }),
    ).toEqual({ ok: false, code: 'http' });
    expect(
      await loadIntoMemory(memory, {
        transport: transportOf({ body: { notes: 'nope' } }).transport,
        target: TARGET,
        pageKey: PAGE_KEY,
        currentName: 'reader-one',
      }),
    ).toEqual({ ok: false, code: 'response_invalid' });
    // A failed load left the memory exactly as it was.
    expect(memory.all()).toEqual([]);
  });

  it('treats an empty page as a success', async () => {
    const memory = createForeignNotes();
    const outcome = await loadIntoMemory(memory, {
      transport: transportOf({ body: { notes: [] } }).transport,
      target: TARGET,
      pageKey: PAGE_KEY,
      currentName: 'reader-one',
    });
    expect(outcome).toEqual({ ok: true, added: 0 });
  });
});

/** A painter stub that records what the wiring handed it. */
function painterStub(): {
  painter: {
    setExtraEntries(entries: readonly ExtraEntry[] | null): void;
    pageKeyOfPass(): string | null;
    refresh(): Promise<unknown>;
  };
  handed: (readonly ExtraEntry[] | null)[];
  refreshes: () => number;
  setKey(key: string | null): void;
} {
  let key: string | null = PAGE_KEY;
  let refreshes = 0;
  const handed: (readonly ExtraEntry[] | null)[] = [];
  return {
    painter: {
      setExtraEntries(entries): void {
        handed.push(entries);
      },
      pageKeyOfPass(): string | null {
        return key;
      },
      refresh(): Promise<unknown> {
        refreshes += 1;
        return Promise.resolve();
      },
    },
    handed,
    refreshes: (): number => refreshes,
    setKey(next: string | null): void {
      key = next;
    },
  };
}

describe('AC8 the wiring asks once per page key and hands the answer to the paint pass', () => {
  it('asks nothing while the switch is off, and clears what it held (A166)', async () => {
    const port = portOf({ syncEnabled: false });
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    memory.replace([remote()], 'reader-one');
    const stub = painterStub();

    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });
    await sync.afterPaint();

    expect(calls).toEqual([]);
    expect(stub.handed).toEqual([null]);
    expect(memory.all()).toEqual([]);
  });

  it('asks once for one page key, however many passes run (t17-01 AC7)', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });

    await sync.afterPaint();
    await sync.afterPaint();
    await sync.afterPaint();

    expect(calls).toHaveLength(1);
    expect(sync.askedKey()).toBe(PAGE_KEY);
    // One repaint per successful load, and none for the answers that asked nothing.
    expect(stub.refreshes()).toBe(1);
  });

  it('asks again for a new page key and hands that page\'s notes', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });

    await sync.afterPaint();
    stub.setKey('https://example.com/other');
    await sync.afterPaint();

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toContain(encodeURIComponent('https://example.com/other'));
  });

  it('asks nothing for a document with no page key, and never throws', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    stub.setKey(null);

    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });
    await expect(sync.afterPaint()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('leaves the page alone when the load fails, and stays able to ask again', async () => {
    const port = portOf();
    const failing = transportOf({ ok: false, status: 503, body: {} });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: memory,
      port,
      transport: failing.transport,
    });

    await sync.afterPaint();
    // No repaint, no entries handed over, nothing on the article (`A164`).
    expect(stub.refreshes()).toBe(0);
    expect(stub.handed).toEqual([]);
    expect(memory.all()).toEqual([]);

    // The next navigation asks again: a failure is not remembered as "this page is done".
    stub.setKey('https://example.com/other');
    await sync.afterPaint();
    expect(failing.calls).toHaveLength(2);
  });

  it('drops the foreign entries when the server has none for this page', async () => {
    const port = portOf();
    const { transport } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });

    await sync.afterPaint();
    expect(stub.handed).toEqual([[{ entry: memory.all()[0]?.entry, visible: true }]]);

    stub.setKey('https://example.com/empty');
    const empty = transportOf({ body: { notes: [] } });
    const second = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport: empty.transport });
    await second.afterPaint();
    expect(stub.handed.at(-1)).toBeNull();
  });

  it('reads the settings through core once per question, and never writes them (A31)', async () => {
    const port = portOf();
    const { transport } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport });
    await sync.afterPaint();

    // One settings read, through core, per question actually asked; the second pass of the
    // same page asks nothing and therefore reads nothing.
    await sync.afterPaint();
    const reads = port.calls.filter((call) => call.op === 'get').length;
    expect(reads).toBe(1);
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });
});
