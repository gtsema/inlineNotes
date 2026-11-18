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
  groupsOf,
  isInjectableUrl,
  rowClass,
} from '../src/popup/page-entries-service';
import type { PageEntriesSource } from '../src/popup/page-entries-service';
import {
  AUTHOR_ROW_COUNT_SEPARATOR,
  POPUP_NOTICE_TEXT,
  POPUP_STRINGS,
  authorRowLabel,
  ownershipHeaderText,
} from '../src/popup/text';
import type { PortCall } from './support/memory-storage-port';
import { MemoryStoragePort, indexValue, slotValue, storedEntry, storedIndexOf } from './support/memory-storage-port';

/**
 * The popup entry list (`t4-01-popup-list`, AC1-AC5 of that card) in the row shape of
 * `t5-06` (AC1-AC10 of that card): one row per **author** of the page, one aggregate
 * checkbox and one `Удалить` per row, each of them **one** core call.
 *
 * Everything here runs against the in-memory port and a fake active-tab read, because
 * the popup owns no rule of its own: `PageEntriesService` is the wiring of
 * `loadSettings` / `loadEntries` / `setVisibleForAuthor` / `deleteEntriesOfAuthor` /
 * `sortByCreatedAtAsc` / `canEdit` / `isSameAuthor`, and these tests are what make the
 * criteria observable. The Angular component holds no branch, exactly like the options
 * page of `t4-02`, so its shape is pinned by the greps in
 * `tests/toolchain-contract.spec.ts` and its behavior is pinned here.
 *
 * Rulings under test: `A49` (the address comes from the active tab, `tabs`
 * permission), `A98` (that address is read but never rendered: the popup shows no
 * page address in any state), `A50` (the checkbox writes storage and messages nobody), `A25` (every
 * row is deletable, no edit affordance for a foreign one), `A1`/`A12` (a checkbox
 * never reorders the list), `A81` (the restricted-page line), `A82` (the ownership
 * header plus a row class), `A83` (notice above a list that still renders), and for
 * `t5-06`: `A95` (one row per author, no expansion), `A108` (the row label, the
 * aggregate checkbox, one commit per press, `visible` still a per-entry field), `A99`
 * (the author filter of a group), `A86` (a stale entry is counted), `A84` (a refused
 * write is silent).
 *
 * AC1's scan half — "no `chrome.storage` in `src/popup/`" and "permissions are exactly
 * `storage` + `tabs`" — is a source-shape claim and lives in
 * `tests/toolchain-contract.spec.ts`, next to the greps it extends. So does the pin
 * that the popup imports neither per-entry write, which is what turns "one core call
 * per press" from a test result into a fact of the layer.
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

/**
 * Every storage write the popup made, as `op:key` lines in port order. This is how
 * ruling `A108` is measured here: one press of a row control must answer **two** lines
 * (the page slot, then `pages:v1`), and a popup that looped a per-entry core write over
 * the group would answer one pair per entry.
 */
function writeLines(f: Fixture): string[] {
  return f.calls
    .filter((call) => call.op === 'set' || call.op === 'remove')
    .map((call) => `${call.op}:${call.keys.join(',')}`);
}

describe('AC1 the popup lists the current page through core', () => {
  it('renders one row per author of the page, never one row per entry (A95, A108)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'ccc3c3c3c3c3', authorName: 'vasya', createdAt: '2026-03-03T00:00:00.000Z' }),
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'vasya', createdAt: '2026-02-02T00:00:00.000Z' }),
      ],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME, 'vasya']);
    expect(view.rows.map((row) => row.count)).toEqual([1, 2]);
    expect(view.rows.map((row) => row.allVisible)).toEqual([true, true]);
    expect(view.rows.map((row) => row.isOwn)).toEqual([true, false]);
  });

  it('places a row by the earliest entry of its author, never by the stored order (`A108`)', async () => {
    const records = [
      storedEntry({ id: 'ccc3c3c3c3c3', authorName: 'vasya', createdAt: '2026-03-03T00:00:00.000Z' }),
      storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'petya', createdAt: '2026-01-05T00:00:00.000Z' }),
      storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
      storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'vasya', createdAt: '2026-02-02T00:00:00.000Z' }),
    ];
    const f = fixture({ records });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME, 'petya', 'vasya']);
    // The grouping is one walk over the core order, which is the only order this layer
    // may read: the same walk over `sortByCreatedAtAsc` answers the same three names.
    const coreOrder = sortByCreatedAtAsc((await loadEntries(f.port, PAGE_URL)).entries);
    expect(view.rows).toEqual(groupsOf(coreOrder, OWN_NAME));
  });

  it('never splits one author into two rows and never merges two authors into one (`A95`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: 'vasya', createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'petya', createdAt: '2026-02-02T00:00:00.000Z' }),
        storedEntry({ id: 'ccc3c3c3c3c3', authorName: 'vasya', createdAt: '2026-03-03T00:00:00.000Z' }),
        storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'petya', createdAt: '2026-04-04T00:00:00.000Z' }),
      ],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => [row.authorName, row.count])).toEqual([
      ['vasya', 2],
      ['petya', 2],
    ]);
  });

  it('one author whose stored names differ only by a space is one row (`A99`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: 'Вася ', createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'Вася', createdAt: '2026-02-02T00:00:00.000Z' }),
      ],
    });

    const view = await f.service.open();
    expect(view.rows).toHaveLength(1);
    // The label prints the stored name of the earliest record verbatim (`A82`): the
    // grouping merged the two records, and the popup rewrote no name of its own.
    expect(view.rows[0]?.authorName).toBe('Вася ');
    expect(view.rows[0]?.count).toBe(2);
  });

  it('counts a stale entry, because the popup resolves no anchor (`A86`, `A108`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, text: 'ушёл со страницы' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: OWN_NAME, text: 'ещё здесь' }),
      ],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => row.count)).toEqual([2]);
    expect(authorRowLabel(view.rows[0])).toBe(`${POPUP_STRINGS.ownEntry} — 2`);
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
        name: OWN_NAME,
        forbidden: ['example.com', 'https://'],
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

    // No Russian string of this layer smuggles an address back in: every value is a
    // finished sentence, and none of them carries a scheme, a host or a punycode form.
    for (const sentence of [...Object.values(POPUP_STRINGS), ...Object.values(POPUP_NOTICE_TEXT)]) {
      expect(sentence).not.toMatch(/https?:|www\.|xn--|\.com|\.рф|\/\//);
    }
  });

  it('shows no row for a record the core read guard skips', async () => {
    const f = fixture({
      records: [storedEntry(), { id: 'broken', pageKey: PAGE_KEY }],
    });

    const view = await f.service.open();
    expect(view.rows.map((row) => [row.authorName, row.count])).toEqual([[OWN_NAME, 1]]);
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
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME]);
    const asked = new Set(f.calls.flatMap((call) => call.keys));
    expect(asked.has(entryStorageKey(otherKey))).toBe(true);
    expect(asked.has(entryStorageKey(PAGE_KEY))).toBe(false);
  });
});

describe('AC2 the aggregate checkbox writes the visibility of a whole author group through one core call', () => {
  /** Two records of the reader and one of another author, in creation order. */
  const mixed = (): unknown[] => [
    storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
    storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'vasya', createdAt: '2026-02-02T00:00:00.000Z' }),
    storedEntry({ id: 'ccc3c3c3c3c3', authorName: OWN_NAME, createdAt: '2026-03-03T00:00:00.000Z' }),
  ];

  it('unchecking one row writes `visible: false` for every entry of that author and for nobody else', async () => {
    const f = fixture({ records: mixed() });
    const before = await f.service.open();

    const after = await f.service.setVisibilityForAuthor(OWN_NAME, false);

    expect(storedRecords(f.port).map((record) => record['visible'])).toEqual([false, true, false]);
    expect(after.rows.map((row) => row.allVisible)).toEqual([false, true]);
    // The rows did not move: same authors, same order, same counts.
    expect(after.rows.map((row) => [row.authorName, row.count])).toEqual(
      before.rows.map((row) => [row.authorName, row.count]),
    );
  });

  it('one press is one core call: one slot write and one `pages:v1` update for a two-record group (`A108`)', async () => {
    const f = fixture({ records: mixed() });
    await f.service.open();

    await f.service.setVisibilityForAuthor(OWN_NAME, false);

    // A popup that looped core `setVisible` per entry would answer four lines here and
    // would have rewritten the index twice, which is how a page gets left half-applied.
    expect(writeLines(f)).toEqual([`set:${entryStorageKey(PAGE_KEY)}`, `set:${PAGE_INDEX_KEY}`]);
  });

  it('a half-hidden group reads as unchecked, and one press makes every entry visible (`A108`)', async () => {
    const records = mixed();
    (records[2] as Record<string, unknown>)['visible'] = false;
    const f = fixture({ records });

    const before = await f.service.open();
    expect(before.rows.map((row) => row.allVisible)).toEqual([false, true]);

    const after = await f.service.setVisibilityForAuthor(OWN_NAME, true);
    expect(storedRecords(f.port).map((record) => record['visible'])).toEqual([true, true, true]);
    expect(after.rows.map((row) => row.allVisible)).toEqual([true, true]);
  });

  it('a checkbox write moves nothing in the order and changes no stamp (`A1`, `A12`)', async () => {
    const f = fixture({ records: mixed() });
    const before = await f.service.open();
    expect(before.rows.map((row) => row.authorName)).toEqual([OWN_NAME, 'vasya']);

    const after = await f.service.setVisibilityForAuthor(OWN_NAME, false);
    expect(after.rows.map((row) => row.authorName)).toEqual(
      before.rows.map((row) => row.authorName),
    );

    const record = storedRecords(f.port)[0];
    expect(record['createdAt']).toBe('2026-01-01T00:00:00.000Z');
    expect(record['updatedAt']).toBe('2026-01-02T03:04:05.006Z');
    // `visible` is still a field of one record (`A108`): the group has no stored flag,
    // so the reader's own two notes carry two independent flags.
    expect(storedRecords(f.port).map((each) => each['visible'])).toEqual([false, true, false]);
  });

  it('a foreign group can be hidden too: authorship governs editing, not filtering', async () => {
    const records = [storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else' })];
    const f = fixture({ records });

    const view = await f.service.setVisibilityForAuthor('someone-else', false);
    expect(view.rows).toHaveLength(1);
    expect(storedRecords(f.port)[0]['visible']).toBe(false);
  });

  it('the checkbox is a storage write and nothing else (`A50`)', async () => {
    const f = fixture({ records: mixed() });
    await f.service.open();

    const view = await f.service.setVisibilityForAuthor(OWN_NAME, false);
    for (const line of writeLines(f)) {
      expect(
        line === `set:${entryStorageKey(PAGE_KEY)}` || line === `set:${PAGE_INDEX_KEY}`,
      ).toBe(true);
    }
    expect(view.rows).toHaveLength(2);
  });

  it('a refused group write is silent and the view is what the store says (`A84`, `A108`)', async () => {
    const f = fixture({ records: mixed() });
    await f.service.open();
    f.port.failWriteOn(entryStorageKey(PAGE_KEY), 'quota');

    const view = await f.service.setVisibilityForAuthor(OWN_NAME, false);

    // No new Russian sentence exists for this state: the rows come back from the store,
    // unchecked becomes checked again, and the notice set stays empty.
    expect(view.rows.map((row) => row.allVisible)).toEqual([true, true]);
    expect(storedRecords(f.port).map((record) => record['visible'])).toEqual([true, true, true]);
    expect(view.notices).toEqual([]);
    expect(Object.keys(view).sort()).toEqual(['notices', 'rows']);
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

  it('the row label is one format: the ownership word or the stored name, ` — `, the count (`A108`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: OWN_NAME, createdAt: '2026-01-02T00:00:00.000Z' }),
        storedEntry({ id: 'ccc3c3c3c3c3', authorName: OWN_NAME, createdAt: '2026-01-03T00:00:00.000Z' }),
        storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'someone-else', createdAt: '2026-02-02T00:00:00.000Z' }),
        storedEntry({ id: 'eee5e5e5e5e5', authorName: 'someone-else', createdAt: '2026-02-03T00:00:00.000Z' }),
      ],
    });

    const rows = (await f.service.open()).rows;
    expect(authorRowLabel(rows[0])).toBe(`${POPUP_STRINGS.ownEntry} — 3`);
    expect(authorRowLabel(rows[1])).toBe('someone-else — 2');
    // Nothing but the number stands after the separator: no plural word form, no
    // tooltip, no second sentence (`A108` fixes the format, and a Russian plural rule
    // would be a rule of this layer).
    expect(authorRowLabel(rows[1])).toMatch(/^someone-else — \d+$/);
    expect(AUTHOR_ROW_COUNT_SEPARATOR).toBe(' — ');
  });

  it('a row carries no entry id and no per-entry handle, so nothing can expand it (`A95`, `A108`)', async () => {
    const f = fixture({
      records: [
        storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME }),
        storedEntry({ id: 'bbb2b2b2b2b2', authorName: OWN_NAME }),
      ],
    });

    const rows = (await f.service.open()).rows;
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['allVisible', 'authorName', 'count', 'isOwn']);
    const rendered = JSON.stringify(rows);
    expect(rendered).not.toContain('aaa1a1a1a1a1');
    expect(rendered).not.toContain('bbb2b2b2b2b2');
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

    const after = await f.service.removeAllOfAuthor('someone-else');
    expect(after.rows.map((row) => row.authorName)).toEqual([OWN_NAME]);
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

describe('AC5 the group `Удалить` removes the row immediately', () => {
  /** Two records of the reader, one of `vasya`, one of `petya`, in creation order. */
  const four = (): unknown[] => [
    storedEntry({ id: 'aaa1a1a1a1a1', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
    storedEntry({ id: 'bbb2b2b2b2b2', authorName: 'vasya', createdAt: '2026-02-02T00:00:00.000Z' }),
    storedEntry({ id: 'ccc3c3c3c3c3', authorName: OWN_NAME, createdAt: '2026-03-03T00:00:00.000Z' }),
    storedEntry({ id: 'ddd4d4d4d4d4', authorName: 'petya', createdAt: '2026-04-04T00:00:00.000Z' }),
  ];

  it('removes every entry of that author on this page in one press (`A95`, `A108`)', async () => {
    const f = fixture({ records: four() });

    const view = await f.service.removeAllOfAuthor('vasya');

    expect(view.rows.map((row) => [row.authorName, row.count])).toEqual([
      [OWN_NAME, 2],
      ['petya', 1],
    ]);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual([
      'aaa1a1a1a1a1',
      'ccc3c3c3c3c3',
      'ddd4d4d4d4d4',
    ]);
  });

  it('leaves every other author\'s record untouched, byte for byte (`A108`)', async () => {
    const records = four();
    const f = fixture({ records });
    const untouched = [records[0], records[2], records[3]];

    await f.service.removeAllOfAuthor('vasya');

    // Same objects, not copies: the write carried them through the whole-list commit,
    // which is the difference between one commit and a rewrite of the page.
    expect(storedRecords(f.port)).toEqual(untouched);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual([
      'aaa1a1a1a1a1',
      'ccc3c3c3c3c3',
      'ddd4d4d4d4d4',
    ]);
    expect(storedRecords(f.port)[2]).toBe(untouched[2]);
  });

  it('one press is one core call: one slot write and one `pages:v1` update (`A108`)', async () => {
    const f = fixture({ records: four() });
    await f.service.open();

    await f.service.removeAllOfAuthor(OWN_NAME);

    // A popup that looped core `deleteEntry` per entry would answer four lines here and
    // rewrite the index twice, and an interrupted loop would leave half of the author's
    // notes behind with no control left to finish the job.
    expect(writeLines(f)).toEqual([`set:${entryStorageKey(PAGE_KEY)}`, `set:${PAGE_INDEX_KEY}`]);
  });

  it('a group that owned the whole page leaves the empty state, slot before index (`A108`)', async () => {
    const f = fixture({ records: four(), indexed: [PAGE_KEY, 'https://other.example/post'] });

    const view = await f.service.removeAllOfAuthor('vasya');
    expect(view.rows.map((row) => row.authorName)).toEqual([OWN_NAME, 'petya']);

    const own = await f.service.removeAllOfAuthor(OWN_NAME);
    const petya = await f.service.removeAllOfAuthor('petya');
    expect(petya.rows).toEqual([]);
    expect(own.rows).toHaveLength(1);

    expect(writeLines(f).slice(-2)).toEqual([
      `remove:${entryStorageKey(PAGE_KEY)}`,
      `set:${PAGE_INDEX_KEY}`,
    ]);
    expect(f.port.snapshot()[entryStorageKey(PAGE_KEY)]).toBeUndefined();
    expect(storedIndexOf(f.port)?.pageKeys ?? []).not.toContain(PAGE_KEY);
    // The other page of the index is untouched and keeps its position.
    expect(storedIndexOf(f.port)?.pageKeys).toEqual(['https://other.example/post']);
  });

  it('an author with no entry on this page is answered the current list and no write (`A108`)', async () => {
    const f = fixture({ records: four() });
    const before = await f.service.open();

    const after = await f.service.removeAllOfAuthor('такого автора нет');

    expect(after.rows.map((row) => [row.authorName, row.count])).toEqual(
      before.rows.map((row) => [row.authorName, row.count]),
    );
    expect(writeLines(f)).toEqual([]);
    expect(storedRecords(f.port).map((record) => record['id'])).toEqual([
      'aaa1a1a1a1a1',
      'bbb2b2b2b2b2',
      'ccc3c3c3c3c3',
      'ddd4d4d4d4d4',
    ]);
  });
});
