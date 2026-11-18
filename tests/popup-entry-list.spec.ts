import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { sortByCreatedAtAsc } from '../src/core/entry-rules';
import { loadEntries } from '../src/core/entry-store-read';
import { pageKeyFromUrl } from '../src/core/page-key';
import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import {
  FOREIGN_ROW_CLASS,
  INJECTABLE_SCHEMES,
  OWN_ROW_CLASS,
  PageEntriesService,
  isInjectableUrl,
  rowClass,
} from '../src/popup/page-entries-service';
import type { PageEntriesSource } from '../src/popup/page-entries-service';
import { POPUP_NOTICE_TEXT, POPUP_STRINGS, ownershipHeaderText } from '../src/popup/text';
import type { PortCall } from './support/memory-storage-port';
import { MemoryStoragePort, indexValue, slotValue, storedEntry, storedIndexOf } from './support/memory-storage-port';

/**
 * The popup entry list (`t4-01-popup-list`, AC1-AC5 of the task card).
 *
 * Everything here runs against the in-memory port and a fake active-tab read, because
 * the popup owns no rule of its own: `PageEntriesService` is the wiring of
 * `loadSettings` / `loadEntries` / `setVisible` / `deleteEntry` / `sortByCreatedAtAsc`
 * / `canEdit`, and these tests are what make AC1-AC5 observable. The Angular component
 * holds no branch, exactly like the options page of `t4-02`, so its shape is pinned by
 * the greps in `tests/toolchain-contract.spec.ts` and its behavior is pinned here.
 *
 * Rulings under test: `A49` (the address comes from the active tab, `tabs`
 * permission), `A98` (that address is read but never rendered: the popup shows no
 * page address in any state), `A50` (the checkbox writes storage and messages nobody), `A25` (every
 * row is deletable, no edit affordance for a foreign one), `A1`/`A12` (a checkbox
 * never reorders the list), `A81` (the restricted-page line), `A82` (the ownership
 * header plus a row class), `A83` (notice above a list that still renders).
 *
 * AC1's scan half — "no `chrome.storage` in `src/popup/`" and "permissions are exactly
 * `storage` + `tabs`" — is a source-shape claim and lives in
 * `tests/toolchain-contract.spec.ts`, next to the greps it extends.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** The page the fake active tab reports, and the key core normalizes it to. */
const PAGE_URL = 'https://example.com/a?utm_source=newsletter';
const PAGE_KEY = 'https://example.com/a';

/** A second name, so a row can be made foreign without touching the records. */
const OWN_NAME = 'reader-one';

interface Fixture {
  port: MemoryStoragePort;
  service: PageEntriesService;
  /** The fake `chrome.runtime.openOptionsPage` (`A83`). */
  openOptions: ReturnType<typeof vi.fn>;
  /** Storage calls in the order the port saw them. */
  calls: PortCall[];
}

/** Seeds one page slot plus the settings name, and points the fake tab at `url`. */
function fixture(options: {
  url?: string | null;
  records?: readonly unknown[];
  pageKey?: string;
  indexed?: readonly string[];
  name?: string | null;
}): Fixture {
  const port = new MemoryStoragePort();
  const pageKey = options.pageKey ?? PAGE_KEY;

  const indexed = options.indexed ?? (options.records === undefined ? [] : [pageKey]);
  if (indexed.length > 0) {
    port.seed(PAGE_INDEX_KEY, indexValue(indexed));
  }
  if (options.records !== undefined) {
    port.seed(entryStorageKey(pageKey), slotValue(options.records));
  }
  if (options.name !== null) {
    port.seed(SETTINGS_KEY, { name: options.name ?? OWN_NAME });
  }

  const openOptions = vi.fn();
  const url = options.url === undefined ? PAGE_URL : options.url;
  const source: PageEntriesSource = {
    port,
    pageUrl: async (): Promise<string | null> => url,
    openOptions,
  };

  return { port, service: new PageEntriesService(source), openOptions, calls: port.calls };
}

/** The stored records of one page slot, for the "what did the write store" claims. */
function storedRecords(port: MemoryStoragePort, pageKey: string = PAGE_KEY): Record<string, unknown>[] {
  const slot = port.snapshot()[entryStorageKey(pageKey)];
  if (typeof slot !== 'object' || slot === null || !Array.isArray((slot as { entries: unknown[] }).entries)) {
    return [];
  }
  return (slot as { entries: Record<string, unknown>[] }).entries;
}

describe('AC1 the popup lists the current page through core', () => {
  it('renders one row per entry of the page, in creation order', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'ccc3c3c3c3c3', createdAt: '2026-03-03T00:00:00.000Z' }),
        storedEntry({ id: 'aaa1a1a1a1a1', createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', createdAt: '2026-02-02T00:00:00.000Z' }),
      ],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.id)).toEqual([
      'aaa1a1a1a1a1',
      'bbb2b2b2b2b2',
      'ccc3c3c3c3c3',
    ]);
    expect(view.rows.map((row) => row.visible)).toEqual([true, true, true]);
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME, OWN_NAME, OWN_NAME]);
  });

  it('orders the rows with core `sortByCreatedAtAsc`, never by the stored order', async () => {
    const records = [
      storedEntry({ id: 'ccc3c3c3c3c3', createdAt: '2026-03-03T00:00:00.000Z' }),
      storedEntry({ id: 'aaa1a1a1a1a1', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const f = fixture({ records });

    const view = await f.service.open();
    const coreOrder = sortByCreatedAtAsc((await loadEntries(f.port, PAGE_URL)).entries).map(
      (entry) => entry.id,
    );
    expect(view.rows.map((row) => row.id)).toEqual(coreOrder);
  });

  it('finds the page through the stored index, so tracking noise cannot hide it (`A4`)', async () => {
    const indexedKey = 'https://example.com/a?lang=ru';
    const f = fixture({
      url: 'https://example.com/a?utm_source=x&fbclid=1#bottom',
      pageKey: indexedKey,
      records: [storedEntry({ pageKey: indexedKey })],
    });

    const view = await f.service.open();
    expect(view.rows).toHaveLength(1);
  });

  it('asks the store only through the core key layout', async () => {
    const f = fixture({ records: [storedEntry()] });

    await f.service.open();
    const asked = new Set(f.calls.flatMap((call) => call.keys));
    for (const key of asked) {
      expect(
        key === PAGE_INDEX_KEY || key === SETTINGS_KEY || key === entryStorageKey(PAGE_KEY),
      ).toBe(true);
    }
  });

  it('renders no page address in any state, and carries none in the view (A98)', async () => {
    // Ruling `A98`: the line under the title printed `new URL(url).host`, which is punycode
    // for an internationalized page, and it answered no question the reader had. Every
    // state the popup can be in is walked here — a page with entries, an IDN page (the
    // shape the user called «кракозябры»), a page the content script is not registered for,
    // the no-name notice — and each one holds the list and the notices and nothing that
    // could be an address: no host, no punycode form, no origin, no scheme.
    const states: Array<{
      url: string | null;
      withEntry: boolean;
      name: string | null;
      forbidden: readonly string[];
    }> = [
      {
        url: PAGE_URL,
        withEntry: true,
        name: OWN_NAME,
        forbidden: ['example.com', 'https://example.com', 'https:', 'xn--'],
      },
      {
        url: 'https://xn--80ak6aa92e.com/',
        withEntry: true,
        name: OWN_NAME,
        forbidden: ['xn--80ak6aa92e.com', 'https://xn--'],
      },
      {
        url: 'file:///home/user/article.html',
        withEntry: true,
        name: OWN_NAME,
        forbidden: ['/home/user/article.html', 'file://'],
      },
      {
        url: PAGE_URL,
        withEntry: false,
        name: null,
        forbidden: ['example.com', 'https://'],
      },
    ];

    for (const state of states) {
      const pageKey = state.url === null ? PAGE_KEY : (pageKeyFromUrl(state.url) ?? PAGE_KEY);
      const f = fixture({
        url: state.url,
        pageKey,
        records: state.withEntry ? [storedEntry({ pageKey })] : [],
        name: state.name,
      });

      const view = await f.service.open();
      // The list is still there in the states that have one: the address line went, the
      // rows did not (ruling `A49` is what keeps them reachable here).
      expect(view.rows).toHaveLength(state.withEntry ? 1 : 0);
      // The shape itself: the view is rows plus notices, with no address field to read.
      expect(Object.keys(view).sort()).toEqual(['notices', 'rows']);
      const rendered = JSON.stringify(view);
      for (const fragment of state.forbidden) {
        expect(rendered).not.toContain(fragment);
      }
    }
  });

  it('renders no address element in the component template either (A98)', () => {
    // The render half of AC1 is a template fact, and the scan file that normally holds
    // template facts (`tests/toolchain-contract.spec.ts`) is outside this task's boundary,
    // so the deletion is pinned here: the popup document has no address node at all. The
    // title, the two notices, the empty state and the rows are still rendered.
    const template = /template:\s*`([\s\S]*?)`/.exec(
      readFileSync(join(projectRoot, 'src', 'popup', 'popup.component.ts'), 'utf8'),
    )?.[1];
    if (template === undefined) {
      throw new Error('the popup component has no inline template to scan');
    }

    expect(template).not.toMatch(/class="host"/);
    expect(template).not.toMatch(/view\(\)\.host/);
    expect(template).not.toMatch(/\bhostOf\b/);
    expect(template).toMatch(/<h1 class="title">\{\{ title \}\}<\/h1>/);
    expect(template).toMatch(/class="notice notice--name"/);
    expect(template).toMatch(/class="notice notice--not-injectable"/);
    expect(template).toMatch(/class="empty"/);
    expect(template).toMatch(/class="rows"/);
  });

  it('shows no row for a record the core read guard skips', async () => {
    const f = fixture({
      records: [storedEntry(), { id: 'broken', pageKey: PAGE_KEY }],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.id)).toEqual(['a1b2c3d4e5f6']);
  });

  it('reads the address from the injected active-tab read, not from the popup document', async () => {
    // Ruling `A98` deleted the line, not the read: the injected address is still what the
    // page key is computed from, so the row of the tab the popup was opened in arrives and
    // the key of any other page is never asked for. That is also why the `tabs` permission
    // stays in `src/manifest.json` (pinned in `tests/toolchain-contract.spec.ts`).
    const otherKey = 'https://other.example/post';
    const f = fixture({
      url: otherKey,
      pageKey: otherKey,
      records: [storedEntry({ pageKey: otherKey })],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.id)).toEqual(['a1b2c3d4e5f6']);
    const asked = new Set(f.calls.flatMap((call) => call.keys));
    expect(asked.has(entryStorageKey(otherKey))).toBe(true);
    expect(asked.has(entryStorageKey(PAGE_KEY))).toBe(false);
  });
});

describe('AC2 the checkbox writes visibility through core and keeps the order', () => {
  const three = (): unknown[] => [
    storedEntry({ id: 'aaa1a1a1a1a1', createdAt: '2026-01-01T00:00:00.000Z' }),
    storedEntry({ id: 'bbb2b2b2b2b2', createdAt: '2026-02-02T00:00:00.000Z' }),
    storedEntry({ id: 'ccc3c3c3c3c3', createdAt: '2026-03-03T00:00:00.000Z' }),
  ];

  it('unchecking writes `visible: false` through core and the row stays in the list', async () => {
    const f = fixture({ records: three() });
    const before = await f.service.open();

    const after = await f.service.setVisibility('bbb2b2b2b2b2', false);

    expect(after.rows.map((row) => row.id)).toEqual(before.rows.map((row) => row.id));
    expect(after.rows.map((row) => row.visible)).toEqual([true, false, true]);
    expect(storedRecords(f.port)[1]['visible']).toBe(false);
  });

  it('checking writes `visible: true` back', async () => {
    const records = three();
    (records[1] as Record<string, unknown>)['visible'] = false;
    const f = fixture({ records });

    const view = await f.service.setVisibility('bbb2b2b2b2b2', true);
    expect(view.rows.map((row) => row.visible)).toEqual([true, true, true]);
    expect(storedRecords(f.port)[1]['visible']).toBe(true);
  });

  it('a checkbox write moves nothing in the order and changes no stamp (`A1`, `A12`)', async () => {
    const f = fixture({ records: three() });
    const before = await f.service.open();

    const after = await f.service.setVisibility('aaa1a1a1a1a1', false);
    expect(before.rows.map((row) => row.id)).toEqual(['aaa1a1a1a1a1', 'bbb2b2b2b2b2', 'ccc3c3c3c3c3']);
    expect(after.rows.map((row) => row.id)).toEqual(before.rows.map((row) => row.id));
    expect(after.rows[0]?.visible).toBe(false);

    const record = storedRecords(f.port)[0];
    expect(record['createdAt']).toBe('2026-01-01T00:00:00.000Z');
    expect(record['updatedAt']).toBe('2026-01-02T03:04:05.006Z');
  });

  it('a foreign entry can be hidden too: authorship governs editing, not filtering', async () => {
    const records = [storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else' })];
    const f = fixture({ records });

    const view = await f.service.setVisibility('ddd4d4d4d4d4', false);
    expect(view.rows).toHaveLength(1);
    expect(storedRecords(f.port)[0]['visible']).toBe(false);
  });

  it('the checkbox is a storage write and nothing else (`A50`)', async () => {
    const f = fixture({ records: three() });
    await f.service.open();

    const view = await f.service.setVisibility('bbb2b2b2b2b2', false);
    const writes = f.calls.filter((call) => call.op === 'set' || call.op === 'remove');
    expect(writes.length).toBeGreaterThan(0);
    for (const call of writes) {
      for (const key of call.keys) {
        expect(key === PAGE_INDEX_KEY || key === entryStorageKey(PAGE_KEY)).toBe(true);
      }
    }
    expect(view.rows).toHaveLength(3);
  });
});

describe('AC3 a foreign row is marked foreign and keeps `Удалить`', () => {
  it('marks ownership by the header word and the row class, never by a new sentence (`A82`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME }),
        storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else' }),
      ],
    });

    const [own, foreign] = (await f.service.open()).rows;
    expect(own.isOwn).toBe(true);
    expect(ownershipHeaderText(own)).toBe(POPUP_STRINGS.ownEntry);
    expect(rowClass(own)).toBe(OWN_ROW_CLASS);

    expect(foreign.isOwn).toBe(false);
    expect(ownershipHeaderText(foreign)).toBe('someone-else');
    expect(ownershipHeaderText(foreign)).not.toContain(POPUP_STRINGS.ownEntry);
    expect(rowClass(foreign)).toBe(FOREIGN_ROW_CLASS);
    expect(FOREIGN_ROW_CLASS).toBe('row row--foreign');
  });

  it('asks core who the author is, so changing the name in options re-owns the rows', async () => {
    const records = [storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else' })];

    const foreign = new PageEntriesService({
      port: (() => {
        const port = new MemoryStoragePort();
        port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
        port.seed(entryStorageKey(PAGE_KEY), slotValue(records));
        port.seed(SETTINGS_KEY, { name: OWN_NAME });
        return port;
      })(),
      pageUrl: async (): Promise<string | null> => PAGE_URL,
      openOptions: vi.fn(),
    });
    const own = new PageEntriesService({
      port: (() => {
        const port = new MemoryStoragePort();
        port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
        port.seed(entryStorageKey(PAGE_KEY), slotValue(records));
        port.seed(SETTINGS_KEY, { name: 'someone-else' });
        return port;
      })(),
      pageUrl: async (): Promise<string | null> => PAGE_URL,
      openOptions: vi.fn(),
    });

    expect((await foreign.open()).rows[0]?.isOwn).toBe(false);
    expect((await own.open()).rows[0]?.isOwn).toBe(true);
  });

  it('a settings state with no usable name makes every row foreign', async () => {
    const f = fixture({ records: [storedEntry()], name: null });

    const view = await f.service.open();
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.isOwn).toBe(false);
    expect(ownershipHeaderText(view.rows[0])).toBe('reader-one');
  });

  it('a foreign row is still deletable and disappears from storage (`A25`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else', createdAt: '2026-02-02T00:00:00.000Z' }),
      ],
    });

    const after = await f.service.remove('ddd4d4d4d4d4');
    expect(after.rows.map((row) => row.id)).toEqual(['aaa1a1a1a1a1']);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual(['aaa1a1a1a1a1']);
  });
});

describe('AC4 the states that are not a list', () => {
  it('names the settings-gate state with the sentence the overlay spec fixes', async () => {
    const f = fixture({ records: [storedEntry()], name: null });

    const view = await f.service.open();
    expect(view.notices).toEqual(['name_required']);
    expect(POPUP_NOTICE_TEXT['name_required']).toBe('Укажите имя в настройках');
  });

  it('the name-required notice does not hide the list (`A83`)', async () => {
    const f = fixture({ records: [storedEntry({ authorName: 'someone-else' })], name: '' });

    const view = await f.service.open();
    expect(view.notices).toEqual(['name_required']);
    expect(view.rows).toHaveLength(1);
  });

  it('the name-required line opens the options page and writes nothing (`A83`)', async () => {
    const f = fixture({ records: [storedEntry()], name: null });
    await f.service.open();
    const writesBefore = f.calls.filter((call) => call.op === 'set' || call.op === 'remove').length;

    f.service.openSettings();

    expect(f.openOptions).toHaveBeenCalledTimes(1);
    const writesAfter = f.calls.filter((call) => call.op === 'set' || call.op === 'remove').length;
    expect(writesAfter).toBe(writesBefore);
  });

  it('a page the content script is not registered for gets the `A81` line and keeps its list (`A49`)', async () => {
    const fileUrl = 'file:///home/user/article.html';
    const f = fixture({
      url: fileUrl,
      pageKey: 'null/home/user/article.html',
      records: [storedEntry({ pageKey: 'null/home/user/article.html' })],
    });

    const view = await f.service.open();
    expect(view.notices).toEqual(['page_not_injectable']);
    expect(view.rows).toHaveLength(1);
    expect(POPUP_NOTICE_TEXT['page_not_injectable']).toBe('На этой странице подсветка недоступна');
  });

  it('a `chrome://` page is not injectable either', async () => {
    const f = fixture({ url: 'chrome://extensions', records: [] });

    const view = await f.service.open();
    expect(view.notices).toEqual(['page_not_injectable']);
    expect(isInjectableUrl('chrome://extensions')).toBe(false);
  });

  it('an address core refuses gets the same single line and no list', async () => {
    const f = fixture({ url: 'not a url', records: [] });

    const view = await f.service.open();
    expect(view.notices).toEqual(['page_not_injectable']);
    expect(view.rows).toEqual([]);
  });

  it('no active tab address gets the same line rather than a crash', async () => {
    const f = fixture({ url: null, records: [] });

    const view = await f.service.open();
    expect(view.notices).toEqual(['page_not_injectable']);
    expect(view.rows).toEqual([]);
  });

  it('a restricted page with no name states both lines, notice order fixed (`A83`)', async () => {
    const f = fixture({ url: 'file:///home/user/a.html', name: null, records: [] });

    const view = await f.service.open();
    expect(view.notices).toEqual(['name_required', 'page_not_injectable']);
  });

  it('a normal page with a name states nothing and shows the empty line only when empty', async () => {
    const empty = fixture({ records: [] });
    const filled = fixture({ records: [storedEntry()] });

    expect((await empty.service.open()).notices).toEqual([]);
    expect((await empty.service.open()).rows).toEqual([]);
    expect(POPUP_STRINGS.emptyState).toBe('На этой странице нет записей');
    expect((await filled.service.open()).notices).toEqual([]);
  });

  it('the notice map is total over the notice codes', async () => {
    expect(Object.keys(POPUP_NOTICE_TEXT).sort()).toEqual(['name_required', 'page_not_injectable']);
  });

  it('the injectable schemes are the ones the manifest registers the content script for', () => {
    const manifest = JSON.parse(
      readFileSync(join(projectRoot, 'src', 'manifest.json'), 'utf8'),
    ) as { content_scripts: { matches: string[] }[] };
    const registered = manifest.content_scripts[0].matches.map((pattern) =>
      pattern.slice(0, pattern.indexOf('://') + 3),
    );
    expect(INJECTABLE_SCHEMES.map((scheme: string) => `${scheme.slice(0, -1)}://`)).toEqual(
      registered,
    );
  });
});

describe('AC5 a delete removes the row immediately', () => {
  it('the row is gone from the list at once and the others keep their order', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', createdAt: '2026-02-02T00:00:00.000Z' }),
        storedEntry({ id: 'ccc3c3c3c3c3', createdAt: '2026-03-03T00:00:00.000Z' }),
      ],
    });

    const view = await f.service.remove('bbb2b2b2b2b2');
    expect(view.rows.map((row) => row.id)).toEqual(['aaa1a1a1a1a1', 'ccc3c3c3c3c3']);
  });

  it('deleting the last row leaves the empty state and drops the page slot', async () => {
    const f = fixture({ records: [storedEntry()] });

    const view = await f.service.remove('a1b2c3d4e5f6');
    expect(view.rows).toEqual([]);
    expect(f.port.snapshot()[entryStorageKey(PAGE_KEY)]).toBeUndefined();
    expect(storedIndexOf(f.port)?.pageKeys ?? []).not.toContain(PAGE_KEY);
  });
});
