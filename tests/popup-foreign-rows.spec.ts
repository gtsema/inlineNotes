import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { ForeignAuthorView, PageNotesQueryResult } from '../src/core/page-notes-query';
import { EMPTY_PAGE_NOTES_QUERY_RESULT, NOTES_QUERY_MESSAGE } from '../src/core/page-notes-query';
import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { PageEntriesSource } from '../src/popup/page-entries-service';
import {
  PageEntriesService,
  foreignGroupsOf,
  isForeignAuthor,
  mergeAuthorRows,
} from '../src/popup/page-entries-service';
import type { RuntimeMessageSenderLike } from '../src/popup/page-notes-channel';
import {
  askPage,
  createChromeRuntimeMessageSender,
  dismissPageAuthor,
  switchPageAuthor,
} from '../src/popup/page-notes-channel';
import { POPUP_STRINGS } from '../src/popup/text';
import { codeOnly } from './support/build-script-guards';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The popup's foreign rows (Stage 17, `t17-02` AC2-AC5, AC7; rulings `A167`, `A168`,
 * `A169`).
 *
 * The gap this file closes: the popup read `chrome.storage.local` and nothing else, and
 * foreign notes never reach storage (`A163`), so the notes the page painted had no row in
 * the popup — the reader could not list them, hide them or delete them, although the user
 * asked for exactly that and the spec claimed it. The rows now come from the **page**,
 * through one message, and this file is the whole of that contract:
 *
 * - **asked, not read** (`A167`): one question per view build, answered by the page; no
 *   storage read of any kind fetches them, and no `fetch` exists on this side.
 * - **routed, not guessed** (`A168`): a foreign row's checkbox and `Удалить` are messages,
 *   and a stored row's two controls are still the one core write each — the routing is one
 *   question, asked in one place.
 * - **stated from the page's answer** (`A169`): the failure notice renders when the page
 *   says its automatic load failed, and never otherwise.
 *
 * The port is the in-memory one, so "no storage write, no storage read for this half" is
 * checked against the port's own call log and not against a comment.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const PAGE_URL = 'https://example.com/a?utm_source=newsletter';
const PAGE_KEY = 'https://example.com/a';
const OWN_NAME = 'reader-one';

/** One row of the page's answer. */
function foreignRow(authorName: string, count = 1, allVisible = true): ForeignAuthorView {
  return { authorName, count, allVisible };
}

/** A page channel that records what was sent and answers with one pinned result. */
function pageOf(answer: Partial<PageNotesQueryResult> = {}): {
  channel: { sendMessage: RuntimeMessageSenderLike };
  sent: unknown[];
} {
  const sent: unknown[] = [];
  const resolved: PageNotesQueryResult = {
    rows: answer.rows ?? [],
    syncFailed: answer.syncFailed ?? false,
  };
  return {
    channel: {
      sendMessage: async (message: unknown): Promise<unknown> => {
        sent.push(message);
        return resolved;
      },
    },
    sent,
  };
}

interface Fixture {
  port: MemoryStoragePort;
  service: PageEntriesService;
  sent: unknown[];
}

function fixture(options: {
  records?: readonly unknown[];
  page?: Partial<PageNotesQueryResult>;
  name?: string | null;
  url?: string | null;
} = {}): Fixture {
  const port = new MemoryStoragePort();
  if (options.records !== undefined) {
    port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
    port.seed(entryStorageKey(PAGE_KEY), slotValue(options.records));
  }
  if (options.name !== null) {
    port.seed(SETTINGS_KEY, {
      name: options.name ?? OWN_NAME,
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
  }
  const page = pageOf(options.page);
  const url = options.url === undefined ? PAGE_URL : options.url;
  const source: PageEntriesSource = {
    port,
    pageUrl: async (): Promise<string | null> => url,
    openOptions: vi.fn(),
    page: page.channel,
  };
  return { port, service: new PageEntriesService(source), sent: page.sent };
}

/** Every storage write the popup made, in port order. */
function writeLines(port: MemoryStoragePort): string[] {
  return port.calls
    .filter((call) => call.op === 'set' || call.op === 'remove')
    .map((call) => `${call.op}:${call.keys.join(',')}`);
}

describe('AC2 the popup asks the page and renders one row per foreign author (A167)', () => {
  it('renders a page row beside the stored rows, marked foreign', async () => {
    const f = fixture({
      records: [storedEntry({ id: 'own001', authorName: OWN_NAME })],
      page: { rows: [foreignRow('Вася', 2)] },
    });

    const view = await f.service.open();

    expect(view.rows.map((row) => [row.authorName, row.count, row.isOwn, row.isForeign])).toEqual([
      [OWN_NAME, 1, true, false],
      ['Вася', 2, false, true],
    ]);
  });

  it('marks the page row with the foreign row class and prints the stored name (`A82`)', async () => {
    const f = fixture({ records: [], page: { rows: [foreignRow('Вася')] } });

    const rows = (await f.service.open()).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isOwn).toBe(false);
    expect(rows[0]?.isForeign).toBe(true);
    // No new Russian sentence names a foreign row: the class is the whole marker, exactly
    // as it is for a stored foreign group (`A82`).
    expect(foreignGroupsOf([foreignRow('Вася')])[0]).toEqual({
      authorName: 'Вася',
      count: 1,
      isOwn: false,
      allVisible: true,
      isForeign: true,
    });
  });

  it('asks exactly once per view build, and sends the one message name', async () => {
    const f = fixture({ page: { rows: [foreignRow('Вася')] } });

    await f.service.open();
    expect(f.sent).toEqual([{ type: NOTES_QUERY_MESSAGE }]);

    await f.service.open();
    expect(f.sent).toHaveLength(2);
  });

  it('reads no storage of its own for the foreign half, and writes none', async () => {
    const f = fixture({ records: [storedEntry()], page: { rows: [foreignRow('Вася')] } });

    await f.service.open();

    // The reads are exactly the three the stored half performs (`settings:v1`, the page
    // slot and the index it is found through); a foreign row adds no key to that set, and
    // the whole call log holds no write. `A167` is a message, so the page's half is not a
    // storage read of this layer at all.
    const asked = new Set(f.port.calls.flatMap((call) => call.keys));
    expect([...asked].sort()).toEqual(
      [SETTINGS_KEY, PAGE_INDEX_KEY, entryStorageKey(PAGE_KEY)].sort(),
    );
    expect(writeLines(f.port)).toEqual([]);
  });

  it('merges one name into one row, and keeps the stored row when the two lists agree', async () => {
    // A name that appears in both lists is one row, and it is the stored one: a record in
    // `chrome.storage.local` is a note this reader wrote (`A163` drops the reader's own
    // notes from the page's memory before the page answers with them).
    const f = fixture({
      records: [storedEntry({ id: 'own001', authorName: OWN_NAME })],
      page: { rows: [foreignRow(OWN_NAME), foreignRow('Вася')] },
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => [row.authorName, row.isForeign])).toEqual([
      [OWN_NAME, false],
      ['Вася', true],
    ]);
  });

  it('compares names with core `isSameAuthor`, so one author spelled with a space is one row', async () => {
    const f = fixture({
      records: [storedEntry({ id: 'own001', authorName: 'Вася ' })],
      page: { rows: [foreignRow('Вася')] },
    });

    const view = await f.service.open();
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.isForeign).toBe(false);
    // The merge is the same rule the grouping uses (`A99`), and it is asked through core.
    expect(mergeAuthorRows(foreignGroupsOf([foreignRow('Вася')]), [])).toHaveLength(1);
    expect(isForeignAuthor(foreignGroupsOf([foreignRow('Вася ')]), 'Вася')).toBe(true);
  });

  it('renders no foreign row for a page that answers nothing, and states no failure (A166)', async () => {
    const f = fixture({ page: {} });

    const view = await f.service.open();
    expect(view.rows).toEqual([]);
    expect(view.notices).toEqual([]);
  });

  it('asks no page at all when synchronization is off or the address is empty (A166)', async () => {
    // The pull half of `A166`: with nowhere to call, the page holds nothing of the server's
    // and the popup sends no message. The two halves still read one function — the same
    // `syncTargetOf` — so this case and the content script's own `A166` case cannot drift.
    for (const settings of [
      { name: OWN_NAME, serverUrl: 'http://localhost:8080', syncEnabled: false },
      { name: OWN_NAME, serverUrl: '', syncEnabled: true },
      { name: OWN_NAME },
    ]) {
      const port = new MemoryStoragePort();
      port.seed(SETTINGS_KEY, settings);
      const page = pageOf({ rows: [foreignRow('Вася')] });
      const service = new PageEntriesService({
        port,
        pageUrl: async (): Promise<string | null> => PAGE_URL,
        openOptions: vi.fn(),
        page: page.channel,
      });

      const view = await service.open();
      expect(view.rows, JSON.stringify(settings)).toEqual([]);
      expect(view.syncEnabled).toBe(false);
      expect(view.syncFailed).toBe(false);
      expect(page.sent, JSON.stringify(settings)).toEqual([]);
    }
  });

  it('asks no page for an address the content script is not registered for (A81, A166)', async () => {
    const f = fixture({ url: 'file:///home/user/article.html', page: { rows: [foreignRow('Вася')] } });

    const view = await f.service.open();
    expect(view.rows).toEqual([]);
    expect(view.notices).toEqual(['page_not_injectable']);
    expect(f.sent).toEqual([]);
  });
});

describe('AC3 a foreign row\'s checkbox hides that author\'s highlights on the page (A168)', () => {
  it('sends one switch message and writes no storage', async () => {
    const f = fixture({ records: [storedEntry({ id: 'own001', authorName: OWN_NAME })], page: { rows: [foreignRow('Вася', 2)] } });
    await f.service.open();
    f.sent.length = 0;

    const view = await f.service.setVisibilityForAuthor('Вася', false);

    // The switch operation, and the questions around it: the routing reads the page's
    // current answer before it decides where the press belongs (`A168`), and the view that
    // follows re-reads it — the same "ask, act, re-read" shape the stored half has.
    expect(f.sent).toContainEqual({
      type: NOTES_QUERY_MESSAGE,
      op: 'switch',
      authorName: 'Вася',
      visible: false,
    });
    expect(f.sent.filter((message) => (message as { op?: string }).op !== undefined)).toHaveLength(1);
    expect(writeLines(f.port)).toEqual([]);
    // The row still renders: switching a foreign note off hides a highlight, it does not
    // remove the row (`A168`), and the page's fresh answer is what the row reads.
    expect(view.rows.map((row) => [row.authorName, row.isForeign])).toEqual([
      [OWN_NAME, false],
      ['Вася', true],
    ]);
  });

  it('switches the whole author at once, never one note per press (`A108` applied to the page)', async () => {
    const f = fixture({ page: { rows: [foreignRow('Вася', 3)] } });
    await f.service.open();
    f.sent.length = 0;

    await f.service.setVisibilityForAuthor('Вася', true);

    // One **operation** message, addressed by the author name: there is no per-note handle
    // in a row to loop over, which is the same shape the stored aggregate write has. The
    // questions around it are reads, not operations.
    const operations = f.sent.filter(
      (message) => (message as { op?: string }).op !== undefined,
    );
    expect(operations).toHaveLength(1);
    expect((operations[0] as { authorName: string }).authorName).toBe('Вася');
  });

  it('still writes storage for a stored row: the routing did not change the other half (`A50`)', async () => {
    const f = fixture({ records: [storedEntry({ id: 'own001', authorName: OWN_NAME })], page: { rows: [foreignRow('Вася')] } });
    await f.service.open();
    f.sent.length = 0;

    await f.service.setVisibilityForAuthor(OWN_NAME, false);

    // No operation reaches the page for a stored row: the routing answer is "not foreign"
    // and the one core write is the whole press (`A50`, `A108`).
    expect(f.sent.filter((message) => (message as { op?: string }).op !== undefined)).toEqual([]);
    expect(writeLines(f.port)).toEqual([
      `set:${entryStorageKey(PAGE_KEY)}`,
      `set:${PAGE_INDEX_KEY}`,
    ]);
  });
});

describe('AC4 a foreign row\'s delete removes the notes from this page\'s view (A168)', () => {
  it('sends one dismiss message, calls no server and writes no storage', async () => {
    const f = fixture({ page: { rows: [foreignRow('Вася', 2)] } });
    await f.service.open();
    f.sent.length = 0;

    await f.service.removeAllOfAuthor('Вася');

    expect(f.sent).toContainEqual({
      type: NOTES_QUERY_MESSAGE,
      op: 'dismiss',
      authorName: 'Вася',
    });
    expect(f.sent.filter((message) => (message as { op?: string }).op !== undefined)).toHaveLength(1);
    expect(writeLines(f.port)).toEqual([]);
    // No stored record of that author existed, and none may appear: nothing was written.
    expect(f.port.snapshot()[entryStorageKey(PAGE_KEY)]).toBeUndefined();
  });

  it('removes every entry of a stored foreign author from storage, as it did before (`A25`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: 'someone-else' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: OWN_NAME }),
      ],
      page: {},
    });
    await f.service.open();
    f.sent.length = 0;

    const view = await f.service.removeAllOfAuthor('someone-else');

    expect(f.sent.filter((message) => (message as { op?: string }).op !== undefined)).toEqual([]);
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME]);
    expect(writeLines(f.port)).not.toEqual([]);
  });

  it('answers the page\'s fresh rows after a dismissal, so the list is what the page holds', async () => {
    // The page answers the operation with the state it has left, which is what the popup
    // renders: a page that dropped «Вася» answers no row for it, and the row goes.
    const sent: unknown[] = [];
    let rows: ForeignAuthorView[] = [foreignRow('Вася', 2)];
    const channel: { sendMessage: RuntimeMessageSenderLike } = {
      sendMessage: async (message: unknown): Promise<unknown> => {
        sent.push(message);
        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { op?: string }).op === 'dismiss'
        ) {
          rows = [];
        }
        // Every question — the ones the routing asks and the one the view asks — is
        // answered from the same state, which is what the page does.
        return { rows, syncFailed: false };
      },
    };
    const port = new MemoryStoragePort();
    // Synchronization on with an address: without it `A166` stops the question before it
    // is asked, and the page's rows would never be rendered in the first place.
    port.seed(SETTINGS_KEY, {
      name: OWN_NAME,
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
    const service = new PageEntriesService({
      port,
      pageUrl: async (): Promise<string | null> => PAGE_URL,
      openOptions: vi.fn(),
      page: channel,
    });

    expect((await service.open()).rows.map((row) => row.authorName)).toEqual(['Вася']);
    const after = await service.removeAllOfAuthor('Вася');
    expect(after.rows).toEqual([]);
  });
});

describe('AC5 the failure notice is the page\'s answer (A169)', () => {
  it('renders `sync_failed` above the list when the page says the load failed', async () => {
    const f = fixture({
      records: [storedEntry({ id: 'own001', authorName: OWN_NAME })],
      page: { rows: [], syncFailed: true },
    });

    const view = await f.service.open();
    expect(view.notices).toEqual(['sync_failed']);
    expect(view.syncFailed).toBe(true);
    // The list still renders; a notice never replaces it (`A83`).
    expect(view.rows).toHaveLength(1);
  });

  it('states the notice in the order `A83` fixes when other lines are present too', async () => {
    const port = new MemoryStoragePort();
    port.seed(SETTINGS_KEY, {
      name: '',
      serverUrl: 'http://localhost:8080',
      syncEnabled: true,
    });
    const page = pageOf({ syncFailed: true });
    const service = new PageEntriesService({
      port,
      pageUrl: async (): Promise<string | null> => 'file:///home/user/a.html',
      openOptions: vi.fn(),
      page: page.channel,
    });

    const view = await service.open();
    // The address is not injectable, so the page is never asked and the third line cannot
    // appear — the state where all three stand together is the one the popup cannot be in,
    // which is why the order is pinned as the two that can.
    expect(view.notices).toEqual(['name_required', 'page_not_injectable']);
  });

  it('renders the notice from the one string of the popup layer', async () => {
    const f = fixture({ page: { syncFailed: true } });

    const view = await f.service.open();
    expect(view.notices).toContain('sync_failed');
    expect(POPUP_STRINGS.syncFailed).toBe('Не удалось связаться с сервером синхронизации');
  });

  it('states no notice on a page whose load succeeded, and none for a page never asked', async () => {
    const f = fixture({ page: { rows: [foreignRow('Вася')] } });

    const view = await f.service.open();
    expect(view.syncFailed).toBe(false);
    expect(view.notices).toEqual([]);
  });
});

describe('the popup\'s half of the channel is a message and nothing else', () => {
  it('sends the one message name and reads an answer, tolerating no listener', async () => {
    const sent: unknown[] = [];
    const answering: RuntimeMessageSenderLike = async (message: unknown): Promise<unknown> => {
      sent.push(message);
      return { rows: [foreignRow('Вася')], syncFailed: true };
    };

    expect(await askPage({ sendMessage: answering })).toEqual({
      rows: [foreignRow('Вася')],
      syncFailed: true,
    });
    expect(sent).toEqual([{ type: NOTES_QUERY_MESSAGE }]);

    // A popup opened on a page with no content script: `sendMessage` rejects, and the
    // answer is the empty result — no rows, no failure — never a throw.
    const rejecting: RuntimeMessageSenderLike = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };
    expect(await askPage({ sendMessage: rejecting })).toEqual(EMPTY_PAGE_NOTES_QUERY_RESULT);
    expect(await switchPageAuthor({ sendMessage: rejecting }, 'Вася', false)).toEqual(
      EMPTY_PAGE_NOTES_QUERY_RESULT,
    );
    expect(await dismissPageAuthor({ sendMessage: rejecting }, 'Вася')).toEqual(
      EMPTY_PAGE_NOTES_QUERY_RESULT,
    );
  });

  it('refuses an answer of another shape instead of reading rows out of it', async () => {
    const malformed: RuntimeMessageSenderLike = async () => ({ notes: [{ id: 'a' }] });
    expect(await askPage({ sendMessage: malformed })).toEqual(EMPTY_PAGE_NOTES_QUERY_RESULT);

    for (const answer of [null, 'rows', { rows: null, syncFailed: false }, { rows: [], syncFailed: 'no' }, { rows: [{ authorName: 1, count: 1, allVisible: true }], syncFailed: false }]) {
      const sender: RuntimeMessageSenderLike = async () => answer;
      expect(await askPage({ sendMessage: sender }), JSON.stringify(answer)).toEqual(
        EMPTY_PAGE_NOTES_QUERY_RESULT,
      );
    }
  });

  it('sends the two row operations with the author name and the flag, and nothing else', async () => {
    const sent: unknown[] = [];
    const sender: RuntimeMessageSenderLike = async (message: unknown): Promise<unknown> => {
      sent.push(message);
      return { rows: [], syncFailed: false };
    };

    await switchPageAuthor({ sendMessage: sender }, 'Вася', false);
    await dismissPageAuthor({ sendMessage: sender }, 'Петя');

    expect(sent).toEqual([
      { type: NOTES_QUERY_MESSAGE, op: 'switch', authorName: 'Вася', visible: false },
      { type: NOTES_QUERY_MESSAGE, op: 'dismiss', authorName: 'Петя' },
    ]);
  });

  it('addresses the question to the tab of the page in the one shipped factory, and reaches no network', () => {
    const source = readFileSync(join(projectRoot, 'src', 'popup', 'page-notes-channel.ts'), 'utf8');
    const code = codeOnly(source);

    // The popup's only door to the page is `chrome.tabs.sendMessage`, **addressed to the
    // tab** — `t17-08`. A runtime-wide `sendMessage` was the shipped call and it could not
    // reach a content script at all: the page's `chrome.runtime.onMessage` answers a
    // message sent to its tab, so the question went nowhere and the popup rendered no
    // foreign rows. The runtime-wide call must not come back.
    expect(code).toMatch(/chrome\.tabs\.sendMessage/);
    expect(code.match(/chrome\.tabs\.sendMessage/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/chrome\.runtime\.sendMessage/);
    expect(typeof createChromeRuntimeMessageSender).toBe('function');
    // `A167` chose the message over a second request: no network API appears here, which
    // is the same claim `tests/toolchain-contract.spec.ts` makes about the whole file set.
    for (const shape of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
      expect(code, shape).not.toContain(shape);
    }
    // And no storage: the foreign half writes nothing (`A163`, `A168`).
    expect(code).not.toContain('chrome.storage');
  });
});
