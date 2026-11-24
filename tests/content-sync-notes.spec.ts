// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { Entry } from '../src/core/entry';
import type { RemoteNote, SyncTransport } from '../src/core/sync-client';
import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { ExtraEntry } from '../src/content/paint/paint-plan';
import { createForeignNotes, loadIntoMemory } from '../src/content/sync/foreign-notes';
import { adoptOwnNotesOfLoad } from '../src/content/sync/adopt-own-notes';
import { attachSyncNotes } from '../src/content/sync/sync-notes';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';
import { setForeignAuthorHidden } from '../src/core/foreign-hidden-store';
import { FOREIGN_HIDDEN_KEY } from '../src/core/storage-keys';

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

/** One adoption pass as the loader hands it to the seam. */
interface AdoptCall {
  url: string;
  currentName: string;
  notes: readonly RemoteNote[];
}

/**
 * An adoption seam that records its calls instead of writing, and answers what the
 * caller tells it to answer.
 *
 * It is deliberately **not** a stub over the core write: these cases are about the
 * loader's half of `A197` — the pass happens once, in the right order, with the rows
 * the server returned — while the write itself is `tests/core-own-notes-adopt.spec.ts`
 * and `tests/content-adopt-own-notes.spec.ts`.
 */
function adoptRecorder(
  answer: unknown = { ok: true, adopted: 0, skipped: 0 },
): { adopt: (pass: AdoptCall) => Promise<unknown>; calls: AdoptCall[] } {
  const calls: AdoptCall[] = [];
  return {
    calls,
    adopt: async (pass: AdoptCall): Promise<unknown> => {
      calls.push(pass);
      return answer;
    },
  };
}

/** The shipped adopter, driven with a real port: the store is the assertion. */
function shippedAdopter(port: MemoryStoragePort): (pass: AdoptCall) => Promise<unknown> {
  return async (pass: AdoptCall): Promise<unknown> =>
    await adoptOwnNotesOfLoad({
      port,
      url: pass.url,
      currentName: pass.currentName,
      notes: pass.notes,
    });
}

describe('AC7 foreign notes are memory only, and their rows are this document\'s (A163)', () => {
  it('decodes the server rows into entries, and memory still drops the reader\'s own', () => {
    // The memory half is unchanged by `A197`: an own row is the store's business and a
    // second copy of it in memory would register two `paint name`s over one span. What
    // changed is that the row is now **adopted** instead of thrown away, and that half
    // is asserted by the `A197` describes below.
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

describe('A184 the hidden author flag survives a reload', () => {
  it('a note of a persisted-hidden author arrives visible: false', () => {
    const memory = createForeignNotes();
    memory.replace([remote(), remote({ id: 'petya001', author_id: 'Петя' })], 'reader-one', [
      'Вася',
    ]);

    expect(memory.visibilityOf('their001')).toBe(false);
    expect(memory.visibilityOf('petya001')).toBe(true);
    expect(memory.authors()).toEqual([
      { authorName: 'Вася', count: 1, allVisible: false },
      { authorName: 'Петя', count: 1, allVisible: true },
    ]);
  });

  it('a first-ever load passes no list, so every author arrives visible', () => {
    const memory = createForeignNotes();
    memory.replace([remote()], 'reader-one');

    expect(memory.visibilityOf('their001')).toBe(true);
  });

  it('the automatic load reads the flags of the page it asks about and applies them', async () => {
    const port = portOf();
    port.seed(FOREIGN_HIDDEN_KEY, {
      version: 1,
      pages: { [PAGE_KEY]: ['Вася'] },
    });
    const { transport } = transportOf({
      body: {
        notes: [remote(), remote({ id: 'petya001', author_id: 'Петя' })],
      },
    });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });
    await sync.afterPaint();

    expect(memory.visibilityOf('their001')).toBe(false);
    expect(memory.visibilityOf('petya001')).toBe(true);
    // The write path is untouched by a load: the flags are read, never written here.
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('a press to hidden persists the flag, and the next load arrives hidden', async () => {
    const port = portOf();
    await setForeignAuthorHidden(port, {
      pageKey: PAGE_KEY,
      authorName: 'Вася',
      hidden: true,
    });
    const memory = createForeignNotes();

    const record = port.snapshot()[FOREIGN_HIDDEN_KEY] as { pages: Record<string, string[]> };
    memory.replace([remote()], 'reader-one', record.pages[PAGE_KEY]);

    expect(memory.visibilityOf('their001')).toBe(false);
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

    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });
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
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });

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
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });

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

    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });
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
      pageUrl: () => PAGE_KEY,
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
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });

    await sync.afterPaint();
    expect(stub.handed).toEqual([[{ entry: memory.all()[0]?.entry, visible: true }]]);

    stub.setKey('https://example.com/empty');
    const empty = transportOf({ body: { notes: [] } });
    const second = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport: empty.transport, pageUrl: () => 'https://example.com/empty' });
    await second.afterPaint();
    expect(stub.handed.at(-1)).toBeNull();
  });

  it('reads the settings through core once per question, and never writes them (A31)', async () => {
    const port = portOf();
    const { transport } = transportOf({ body: { notes: [remote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({ painter: stub.painter, foreign: memory, port, transport, pageUrl: () => PAGE_KEY });
    await sync.afterPaint();

    // One settings read and one foreign-hidden read (`A184`), through core, per question
    // actually asked; the second pass of the same page asks nothing and therefore reads
    // nothing.
    await sync.afterPaint();
    const reads = port.calls.filter((call) => call.op === 'get').length;
    expect(reads).toBe(2);
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
    expect(port.calls.filter((call) => call.op === 'get').map((call) => call.keys)).toEqual([
      ['settings:v1'],
      ['foreign-hidden:v1'],
    ]);
  });
});

/** The own row the loader must hand the adopter, and the foreign one it must not. */
function ownNote(): RemoteNote {
  return remote({ id: 'own001', author_id: 'reader-one', comment: 'my note', updated_at: '2026-04-01T00:00:00.000Z' });
}

describe('AC22 an automatic load adopts the reader\'s own rows (A197, t20-02)', () => {
  it('calls the adopter once with the pass\'s address, the settings name and the mapped own rows', async () => {
    const port = portOf();
    const { transport } = transportOf({ body: { notes: [remote(), ownNote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const recorder = adoptRecorder();
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: memory,
      port,
      transport,
      pageUrl: () => PAGE_KEY,
      adoptOwnNotes: recorder.adopt,
    });

    await sync.afterPaint();

    // One call, with every row the server returned — the mapping and the "is this row
    // mine?" question belong to the adopter (`A197`), because the memory below needs
    // the same map and a second one here would be a second reading of the wire row.
    expect(recorder.calls).toHaveLength(1);
    const call = recorder.calls[0];
    expect(call?.url).toBe(PAGE_KEY);
    expect(call?.currentName).toBe('reader-one');
    expect(call?.notes.map((note) => note.id)).toEqual(['their001', 'own001']);

    // And the memory half is unchanged: the own row is still not painted from memory.
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
    expect(stub.handed).toEqual([[{ entry: memory.all()[0]?.entry, visible: true }]]);
  });

  it('adopts before it fills the memory, so the row is in the store when the memory drops it', async () => {
    // The store is empty and the page index lists the key — the second-machine state of
    // `A197`. The shipped adopter runs over the real port, and the assertion is the
    // stored record: this is the end-to-end half of the rule.
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(SETTINGS_KEY, { name: 'reader-one', serverUrl: 'http://localhost:8080', syncEnabled: true });
    const { transport } = transportOf({ body: { notes: [remote(), ownNote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: memory,
      port,
      transport,
      pageUrl: () => PAGE_KEY,
      adoptOwnNotes: shippedAdopter(port),
    });

    await sync.afterPaint();

    const slot = port.snapshot()[entryStorageKey(PAGE_KEY)] as { entries: Entry[] };
    expect(slot.entries.map((entry) => entry.id)).toEqual(['own001']);
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
  });

  it('adopts nothing for a load that failed, and nothing for a page with nowhere to file', async () => {
    const port = portOf();
    const failing = transportOf({ ok: false, status: 503, body: {} });
    const recorder = adoptRecorder();
    const memory = createForeignNotes();
    const stub = painterStub();
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: memory,
      port,
      transport: failing.transport,
      pageUrl: () => PAGE_KEY,
      adoptOwnNotes: recorder.adopt,
    });

    await sync.afterPaint();
    expect(recorder.calls).toEqual([]);

    // A pass that resolved no page key asks nothing at all (`A163`), so there is
    // nothing to adopt either.
    stub.setKey(null);
    await sync.afterPaint();
    expect(recorder.calls).toEqual([]);
  });

  it('does not adopt while synchronization is off, and adopts again for a new page key', async () => {
    const off = portOf({ syncEnabled: false });
    const offRecorder = adoptRecorder();
    const offSync = attachSyncNotes({
      painter: painterStub().painter,
      foreign: createForeignNotes(),
      port: off,
      transport: transportOf({ body: { notes: [ownNote()] } }).transport,
      pageUrl: () => PAGE_KEY,
      adoptOwnNotes: offRecorder.adopt,
    });
    await offSync.afterPaint();
    expect(offRecorder.calls).toEqual([]);

    // A same-document navigation re-asks, and the second answer is adopted for the page
    // the pass is on — the pass's address, not one remembered from the first load.
    const port = portOf();
    const recorder = adoptRecorder();
    const { transport } = transportOf({ body: { notes: [ownNote()] } });
    const stub = painterStub();
    let url = PAGE_KEY;
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: createForeignNotes(),
      port,
      transport,
      pageUrl: () => url,
      adoptOwnNotes: recorder.adopt,
    });
    await sync.afterPaint();
    url = 'https://example.com/other';
    stub.setKey('https://example.com/other');
    await sync.afterPaint();

    expect(recorder.calls.map((call) => call.url)).toEqual([
      PAGE_KEY,
      'https://example.com/other',
    ]);
  });
});

describe('AC24 a refused adoption is swallowed (A199, t20-02)', () => {
  it('leaves the outcome ok when the adoption write refuses', async () => {
    // The seam answers a refusal. `A199`: the row is simply not in the store this load,
    // the paint is not blocked, and the next load tries again.
    const port = portOf();
    const { transport } = transportOf({ body: { notes: [remote(), ownNote()] } });
    const memory = createForeignNotes();
    const stub = painterStub();
    const recorder = adoptRecorder({ ok: false, code: 'storage_unavailable' });
    const outcomes: unknown[] = [];
    const sync = attachSyncNotes({
      painter: stub.painter,
      foreign: memory,
      port,
      transport,
      pageUrl: () => PAGE_KEY,
      adoptOwnNotes: recorder.adopt,
      onLoad: (outcome): void => {
        outcomes.push(outcome);
      },
    });

    await expect(sync.afterPaint()).resolves.toBeUndefined();

    expect(recorder.calls).toHaveLength(1);
    // The memory still gets the foreign rows, and the page still repaints.
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
    expect(stub.handed).toHaveLength(1);
    expect(stub.refreshes()).toBe(1);
    // The outcome the popup reads is the load's, and the load succeeded (`A169`).
    expect(outcomes).toEqual([{ ok: true, added: 1 }]);
  });

  it('keeps the load ok when the port under the shipped adopter throws', async () => {
    // A port that throws is a refusal too (`A199`), and the shipped adopter swallows it:
    // this case runs the whole chain — loader, seam, adopter, core write, throwing port —
    // and the load still answers `ok`, the memory still holds the foreign row and the page
    // still repaints. The seam does not need a `try` at the loader for that: a `get` that
    // rejects is answered `storage_unavailable` by the core write itself.
    const { transport } = transportOf({ body: { notes: [remote(), ownNote()] } });
    const memory = createForeignNotes();
    const failingPort = {
      get: async (): Promise<Record<string, unknown>> => await Promise.reject(new Error('port down')),
      set: async (): Promise<void> => await Promise.reject(new Error('port down')),
      remove: async (): Promise<void> => await Promise.reject(new Error('port down')),
    };

    const outcome = await loadIntoMemory(memory, {
      transport,
      target: TARGET,
      pageKey: PAGE_KEY,
      pageUrl: PAGE_KEY,
      currentName: 'reader-one',
      adoptOwnNotes: async (pass): Promise<unknown> =>
        await adoptOwnNotesOfLoad({ ...pass, port: failingPort }),
    });

    expect(outcome).toEqual({ ok: true, added: 1 });
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
  });

  it('adopts through the same seam on the popup-driven load (both load paths)', async () => {
    // `src/content/main.ts` builds the popup's reload over `loadIntoMemory` with the same
    // seam, so this states the contract that wiring keeps: one seam, one adopter, and the
    // adoption still happens before the memory is filled.
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(SETTINGS_KEY, { name: 'reader-one' });
    const { transport } = transportOf({ body: { notes: [ownNote(), remote()] } });
    const memory = createForeignNotes();

    const outcome = await loadIntoMemory(memory, {
      transport,
      target: TARGET,
      pageKey: PAGE_KEY,
      pageUrl: PAGE_KEY,
      currentName: 'reader-one',
      adoptOwnNotes: shippedAdopter(port),
    });

    expect(outcome).toEqual({ ok: true, added: 1 });
    const slot = port.snapshot()[entryStorageKey(PAGE_KEY)] as { entries: Entry[] };
    expect(slot.entries.map((entry) => entry.id)).toEqual(['own001']);
    expect(memory.all().map((note) => note.entry.id)).toEqual(['their001']);
  });
});
