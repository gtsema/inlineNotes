import { describe, expect, it, vi } from 'vitest';

import type { PageNotesQueryResult } from '../src/core/page-notes-query';
import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { SyncTransport } from '../src/core/sync-client';
import type { PageEntriesSource } from '../src/popup/page-entries-service';
import { PageEntriesService } from '../src/popup/page-entries-service';
import { POPUP_NOTICE_TEXT } from '../src/popup/text';
import { MemoryStoragePort, indexValue, slotValue, storedEntry, storedIndexOf } from './support/memory-storage-port';

/**
 * The popup's own row delete reaches the server (Stage 25, ruling `A203` of
 * `docs/specs/sync-integration.md` -> "The popup's own row deletes on the server too").
 *
 * The gap this file closes: the popup's row `Удалить` was the one delete of the reader's
 * **own** notes that stopped at `chrome.storage.local`. The row left the popup, the page
 * dropped its highlight, and the server kept the row — so the next automatic load
 * re-adopted it (`A197`) and the note came back. The editor's one-note delete (`A182`) and
 * the «Мои заметки» row delete (`A192`) always had their server half; this is the third.
 *
 * What is pinned here, in the ruling's own order:
 *
 * - the **page key is read before the local write**, so a page deleted down to nothing
 *   still sends the key its notes lived under;
 * - exactly **one** author-scoped `DELETE`, with the settings name, and none when
 *   `syncTargetOf` answers `null` (`A166`);
 * - a **foreign** row keeps the `A168` dismissal and calls no server;
 * - a stored row of a **previous** author name is local only (`A173` leaves the old name's
 *   server rows alone);
 * - a **failed** server call never undoes the local deletion: the row leaves the list and
 *   the view states `server_delete_failed`;
 * - `{"deleted": 0}` is a **success** (`A181` posture), so no notice appears.
 *
 * The transport is a recorder and the port is the in-memory one, so the wire and the
 * storage writes are both inspected and no socket is opened.
 */

const PAGE_URL = 'https://example.com/a?utm_source=newsletter';
const PAGE_KEY = 'https://example.com/a';
const OWN_NAME = 'reader-one';
const SERVER_URL = 'http://localhost:8080';

/** One request as the transport saw it. */
interface Call {
  url: string;
  method: string;
  body: string;
}

/** A transport that records every call and answers one pinned response. */
function transportOf(answer: { ok?: boolean; status?: number; body?: unknown } = {}): {
  transport: SyncTransport;
  calls: Call[];
} {
  const calls: Call[] = [];
  const transport: SyncTransport = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
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

/** A page channel that never reaches a browser: no foreign rows, no failed load. */
function pageChannelOf(): { sendMessage: (message: unknown) => Promise<PageNotesQueryResult> } {
  return {
    sendMessage: async (): Promise<PageNotesQueryResult> => ({ rows: [], syncFailed: false }),
  };
}

interface Fixture {
  port: MemoryStoragePort;
  service: PageEntriesService;
  calls: Call[];
}

/**
 * One page of stored notes plus the settings record, and the recorder's call log.
 *
 * `sync: null` writes no sync fields at all, which is the `A166` "synchronization off"
 * state the ruling asks about: `syncTargetOf` reads a record without the two fields as
 * `serverUrl: ''` and `syncEnabled: false`.
 */
function fixture(options: {
  records?: readonly unknown[];
  name?: string;
  sync?: { serverUrl: string; syncEnabled: boolean } | null;
  answer?: { ok?: boolean; status?: number; body?: unknown };
} = {}): Fixture {
  const port = new MemoryStoragePort();
  if (options.records !== undefined) {
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(entryStorageKey(PAGE_KEY), slotValue(options.records));
  }
  // The settings record is always seeded: the name is what makes a row own, and the two
  // sync fields decide whether there is a server to call. An absent record would read as
  // `name_required`, which is a different state and not what these cases are about.
  port.seed(SETTINGS_KEY, {
    name: options.name ?? OWN_NAME,
    ...(options.sync === null ? {} : (options.sync ?? { serverUrl: SERVER_URL, syncEnabled: true })),
  });
  const { transport, calls } = transportOf(options.answer ?? { body: { deleted: 2 } });
  const source: PageEntriesSource = {
    port,
    pageUrl: async (): Promise<string | null> => PAGE_URL,
    openOptions: vi.fn(),
    page: pageChannelOf(),
    transport,
  };
  return { port, service: new PageEntriesService(source), calls };
}

/** The stored records of the page slot, for the "what did the write store" claims. */
function storedRecords(port: MemoryStoragePort): Record<string, unknown>[] {
  const slot = port.snapshot()[entryStorageKey(PAGE_KEY)];
  if (typeof slot !== 'object' || slot === null) {
    return [];
  }
  const entries: unknown = (slot as { entries?: unknown }).entries;
  return Array.isArray(entries) ? (entries as Record<string, unknown>[]) : [];
}

/** Every storage write the popup made, as `op:key` lines in port order. */
function writeLines(port: MemoryStoragePort): string[] {
  return port.calls
    .filter((call) => call.op === 'set' || call.op === 'remove')
    .map((call) => `${call.op}:${call.keys.join(',')}`);
}

/** Two notes of the reader and one of somebody else, in creation order. */
function mixed(): unknown[] {
  return [
    storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
    storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'Вася', createdAt: '2026-02-02T00:00:00.000Z' }),
    storedEntry({ id: 'ccc3c3c3c3c3', authorName: OWN_NAME, createdAt: '2026-03-03T00:00:00.000Z' }),
  ];
}

describe('A203 the own row delete is local write then one author DELETE', () => {
  it('sends exactly one DELETE to the author route, with the settings name', async () => {
    const f = fixture({ records: mixed() });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.method).toBe('DELETE');
    expect(f.calls[0]?.url).toBe(
      `${SERVER_URL}/notes/page/${encodeURIComponent(PAGE_KEY)}/author/${encodeURIComponent(OWN_NAME)}`,
    );
    expect(f.calls[0]?.body).toBe('');
    // The local half stands: the reader's rows are gone, the foreign row survives.
    expect(view.rows.map((row) => row.authorName)).toEqual(['Вася']);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual(['bbb2b2b2b2b2']);
    expect(view.notices).toEqual([]);
  });

  it('reads the page key before the local write, so the last row of a page still sends its key', async () => {
    const f = fixture({ records: [storedEntry({ id: 'own001', authorName: OWN_NAME })] });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    // The slot and the index entry are gone — the empty state is what the view says — and
    // the key the notes lived under was still the one the DELETE named.
    expect(view.rows).toEqual([]);
    expect(f.port.snapshot()[entryStorageKey(PAGE_KEY)]).toBeUndefined();
    expect(storedIndexOf(f.port)?.pageKeys ?? []).not.toContain(PAGE_KEY);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toContain(encodeURIComponent(PAGE_KEY));
    expect(f.calls[0]?.url).toContain(encodeURIComponent(OWN_NAME));
  });

  it('reads the page key before the write: the key read precedes the slot write in port order', async () => {
    const f = fixture({ records: [storedEntry({ id: 'own001', authorName: OWN_NAME })] });
    await f.service.open();
    f.port.calls.length = 0;

    await f.service.removeAllOfAuthor(OWN_NAME);

    const firstRead = f.port.calls.findIndex((call) => call.op === 'get');
    const firstWrite = f.port.calls.findIndex((call) => call.op === 'set' || call.op === 'remove');
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeLessThan(firstWrite);
    expect(f.calls).toHaveLength(1);
  });

  it('one press is one core write and one request: the slot and the index, in that order', async () => {
    const f = fixture({ records: mixed() });

    await f.service.removeAllOfAuthor(OWN_NAME);

    expect(writeLines(f.port)).toEqual([
      `set:${entryStorageKey(PAGE_KEY)}`,
      `set:${PAGE_INDEX_KEY}`,
    ]);
    expect(f.calls).toHaveLength(1);
  });
});

describe('A203 the no-request states', () => {
  it('synchronization off: no request and no notice', async () => {
    const f = fixture({ records: mixed(), sync: null });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    expect(f.calls).toEqual([]);
    expect(view.notices).toEqual([]);
    expect(view.rows.map((row) => row.authorName)).toEqual(['Вася']);
  });

  it('a switch that is on but an address that is empty: no request and no notice', async () => {
    const f = fixture({
      records: mixed(),
      sync: { serverUrl: '', syncEnabled: true },
    });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    expect(f.calls).toEqual([]);
    expect(view.notices).toEqual([]);
  });

  it('a foreign row: unchanged, the `A168` dismissal, no request and no notice', async () => {
    const f = fixture({ records: mixed() });

    const view = await f.service.removeAllOfAuthor('Вася');

    expect(f.calls).toEqual([]);
    expect(view.notices).toEqual([]);
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME]);
  });

  it('a stored row of a previous author name: local only, no request', async () => {
    const f = fixture({ records: mixed() });

    const view = await f.service.removeAllOfAuthor('Вася');

    expect(f.calls).toEqual([]);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual([
      'aaa1a1a1a1a1',
      'ccc3c3c3c3c3',
    ]);
    expect(view.notices).toEqual([]);
  });
});

describe('A203 the failure and the empty answer', () => {
  it('a failed server call keeps the local deletion and states `server_delete_failed`', async () => {
    const f = fixture({ records: mixed(), answer: { ok: false, status: 500 } });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    // The local deletion stands: the row left the list and the store.
    expect(view.rows.map((row) => row.authorName)).toEqual(['Вася']);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual(['bbb2b2b2b2b2']);
    // The non-blocking line is stated above the list that still renders (`A83`).
    expect(view.notices).toEqual(['server_delete_failed']);
    expect(POPUP_NOTICE_TEXT['server_delete_failed']).toBe('Не удалось удалить заметки на сервере');
  });

  it('a network failure is the same notice, and nothing is retried', async () => {
    const calls: string[] = [];
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(entryStorageKey(PAGE_KEY), slotValue([storedEntry({ id: 'own001', authorName: OWN_NAME })]));
    port.seed(SETTINGS_KEY, { name: OWN_NAME, serverUrl: SERVER_URL, syncEnabled: true });
    const service = new PageEntriesService({
      port,
      pageUrl: async (): Promise<string | null> => PAGE_URL,
      openOptions: vi.fn(),
      page: pageChannelOf(),
      transport: async (url): Promise<never> => {
        calls.push(url);
        throw new Error('connection refused');
      },
    });

    const view = await service.removeAllOfAuthor(OWN_NAME);

    expect(calls).toHaveLength(1);
    expect(view.notices).toEqual(['server_delete_failed']);
    expect(view.rows).toEqual([]);
  });

  it('`deleted: 0` is a success: no notice', async () => {
    const f = fixture({ records: mixed(), answer: { body: { deleted: 0 } } });

    const view = await f.service.removeAllOfAuthor(OWN_NAME);

    expect(f.calls).toHaveLength(1);
    expect(view.notices).toEqual([]);
  });

  it('a row answered by the page is not sent to the server, even under the reader\'s own name', async () => {
    // A page row is foreign by construction (`A168`), so its delete is the dismissal even
    // when its name is the reader's: the store's records are the only own rows.
    const port = new MemoryStoragePort();
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(entryStorageKey(PAGE_KEY), slotValue([storedEntry({ id: 'own001', authorName: OWN_NAME })]));
    port.seed(SETTINGS_KEY, { name: OWN_NAME, serverUrl: SERVER_URL, syncEnabled: true });
    const calls: string[] = [];
    const service = new PageEntriesService({
      port,
      pageUrl: async (): Promise<string | null> => PAGE_URL,
      openOptions: vi.fn(),
      page: {
        sendMessage: async (): Promise<PageNotesQueryResult> => ({
          rows: [{ authorName: 'Вася', count: 1, allVisible: true }],
          syncFailed: false,
        }),
      },
      transport: async (url): Promise<never> => {
        calls.push(url);
        throw new Error('no request expected');
      },
    });

    const view = await service.removeAllOfAuthor('Вася');

    expect(calls).toEqual([]);
    expect(view.notices).toEqual([]);
  });
});
