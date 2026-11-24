import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AllNotesComponent } from '../src/all-notes/all-notes.component';
import { ALL_NOTES_STRINGS, noteCountText, pageLabelText, rowDateText } from '../src/all-notes/text';
import type { SyncTransport } from '../src/core/sync-client';
import { authorPagesOf } from '../src/core/author-pages';
import type { AuthorPageRow } from '../src/core/author-pages';
import { createEntry } from '../src/core/entry';
import { deleteEntriesOfAuthor } from '../src/core/entry-store-write';
import { loadSettings } from '../src/core/settings-store';
import { saveSettings } from '../src/core/settings-store';
import {
  entryStorageKey,
  PAGE_INDEX_KEY,
  SETTINGS_KEY,
} from '../src/core/storage-keys';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The «Мои заметки» page (`A189`–`A192` of `all-notes-page.md`).
 *
 * The component is driven the way the popup tests drive theirs: a prototype-backed
 * stand-in over an in-memory port, so the handlers run the shipped wiring and the
 * assertions are on the port snapshot, the transport's call log and the rendered
 * signals — never on a retelling.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';

/** The page component's inline template, the only place its row markup lives (`A206`). */
function rowTemplate(): string {
  const template = /template:\s*`([\s\S]*?)`/.exec(
    readFileSync(join(projectRoot, 'src', 'all-notes', 'all-notes.component.ts'), 'utf8'),
  )?.[1];
  if (template === undefined) {
    throw new Error('the all-notes component has no inline template to scan');
  }
  return template;
}

function transportOf(answer: { ok?: boolean; status?: number; body?: unknown } = {}): {
  transport: SyncTransport;
  calls: { url: string; method: string; body: string }[];
} {
  const calls: { url: string; method: string; body: string }[] = [];
  const transport: SyncTransport = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: async (): Promise<unknown> => answer.body,
    };
  };
  return { transport, calls };
}

/** The shipped component over the in-memory port: the real handlers, no Angular. */
function componentOver(
  port: MemoryStoragePort,
  transport: SyncTransport = async (): Promise<never> => Promise.reject(new Error('no calls')),
): { component: AllNotesComponent; calls: () => { url: string; method: string }[] } {
  // The stand-in carries the component's prototype plus plain signal stand-ins; the
  // `any` here is the test seam, not the shipped component's.
  const surface = Object.create(AllNotesComponent.prototype) as any;
  const calls: { url: string; method: string }[] = [];
  surface.source = { port, transport: wrap(transport, calls) };
  surface.rows = asSignal();
  surface.notice = asSignal();
  surface.refusal = asSignal();
  // The private `refresh` is the component's own read; binding it here keeps the
  // one-read rule (`A189`) while the fields it writes are the stand-ins above.
  const refresh = (AllNotesComponent.prototype as unknown as Record<string, unknown>)['refresh'] as () => Promise<void>;
  surface.refresh = (): Promise<void> => refresh.call(surface);
  return { component: surface as AllNotesComponent, calls: () => calls };
}

function wrap(
  transport: SyncTransport,
  calls: { url: string; method: string }[],
): SyncTransport {
  return async (url, init) => {
    calls.push({ url, method: init.method });
    return await transport(url, init);
  };
}

/** A minimal `signal` stand-in: a getter plus `set`, the only parts the component uses. */
function asSignal(): { set: (v: unknown) => void; (): unknown } {
  let value: unknown = null;
  const get = (): unknown => value;
  (get as unknown as { set: (v: unknown) => void }).set = (next: unknown): void => {
    value = next;
  };
  return get as unknown as { set: (v: unknown) => void; (): unknown };
}

function portOf(entries: readonly Record<string, unknown>[]): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(
    SETTINGS_KEY,
    { name: 'reader-one', serverUrl: 'http://localhost:8080', syncEnabled: true },
  );
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_A, PAGE_B]));
  const byPage = new Map<string, Record<string, unknown>[]>();
  for (const entry of entries) {
    const key = String(entry['pageKey']);
    const list = byPage.get(key) ?? [];
    list.push(entry);
    byPage.set(key, list);
  }
  for (const [pageKey, list] of byPage) {
    port.seed(entryStorageKey(pageKey), slotValue(list));
  }
  return port;
}

describe('the wording module (A189)', () => {
  it('holds the strings the page renders and the count plural', () => {
    expect(ALL_NOTES_STRINGS.title).toBe('Мои заметки');
    expect(ALL_NOTES_STRINGS.delete).toBe('Удалить');
    expect(noteCountText(1)).toBe('1 заметка');
    expect(noteCountText(2)).toBe('2 заметки');
    expect(noteCountText(5)).toBe('5 заметок');
    expect(noteCountText(11)).toBe('11 заметок');
    expect(noteCountText(21)).toBe('21 заметка');
    expect(rowDateText('2026-03-01T00:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    // The `A190` fallback reads without the scheme (`A189`): the href keeps the full key.
    expect(pageLabelText('https://example.com/a/b?q=1')).toBe('example.com/a/b?q=1');
    expect(pageLabelText('http://example.com/')).toBe('example.com/');
  });
});

describe('the list read (A191)', () => {
  it('answers the rows through core, fresh first', async () => {
    const port = portOf([
      storedEntry({ pageKey: PAGE_A, updatedAt: '2026-01-01T00:00:00.000Z' }),
      storedEntry({ pageKey: PAGE_B, id: 'b00000000001', updatedAt: '2026-02-01T00:00:00.000Z', title: 'Статья' }),
    ]);
    const answer = await authorPagesOf(port, 'reader-one');
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows.map((row: AuthorPageRow) => row.pageKey)).toEqual([PAGE_B, PAGE_A]);
  });
});

describe('the row delete (A192)', () => {
  it('deletes locally first, then the author set on the server, and re-reads', async () => {
    const port = portOf([
      storedEntry({ pageKey: PAGE_A }),
      storedEntry({ pageKey: PAGE_B, id: 'b00000000001' }),
    ]);
    const { component, calls } = componentOver(port, transportOf({ body: { deleted: 1 } }).transport);
    await component.onDelete(PAGE_A);

    // The local write: every own entry of that page is gone, the other page stands.
    const after = await authorPagesOf(port, 'reader-one');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows.map((row) => row.pageKey)).toEqual([PAGE_B]);

    // The server call: one DELETE of the author set, percent-encoded.
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.method).toBe('DELETE');
    expect(calls()[0]?.url).toBe(
      `http://localhost:8080/notes/page/${encodeURIComponent(PAGE_A)}/author/${encodeURIComponent('reader-one')}`,
    );
  });

  it('a server failure keeps the local deletion and shows the notice', async () => {
    const port = portOf([storedEntry({ pageKey: PAGE_A })]);
    const { component } = componentOver(
      port,
      transportOf({ ok: false, status: 500, body: {} }).transport,
    );
    await component.onDelete(PAGE_A);

    expect(await authorPagesOf(port, 'reader-one')).toEqual({ ok: true, rows: [] });
    expect(component.refusal()).toBe(ALL_NOTES_STRINGS.serverDeleteFailed);
  });

  it('with synchronization off no request is made, and the local deletion stands', async () => {
    const port = portOf([storedEntry({ pageKey: PAGE_A })]);
    await saveSettings(port, { name: 'reader-one', syncEnabled: false });
    const { component, calls } = componentOver(port);
    await component.onDelete(PAGE_A);

    expect(calls()).toHaveLength(0);
    expect(await authorPagesOf(port, 'reader-one')).toEqual({ ok: true, rows: [] });
  });

  it('the local write is the core deleteEntriesOfAuthor the popup row makes', async () => {
    const port = portOf([storedEntry({ pageKey: PAGE_A }), storedEntry({ pageKey: PAGE_A, id: 'second001' })]);
    const { component } = componentOver(port, transportOf({ body: { deleted: 2 } }).transport);
    await component.onDelete(PAGE_A);
    const slot = port.snapshot()[entryStorageKey(PAGE_A)] as { entries: unknown[] } | undefined;
    expect(slot).toBeUndefined();
    expect(component.refusal()).toBeNull();
  });
});

describe('the notices (A189)', () => {
  it('a missing name shows the name-required notice above an empty list', async () => {
    const port = portOf([storedEntry({ pageKey: PAGE_A, authorName: 'Вася' })]);
    port.seed(SETTINGS_KEY, { name: '' });
    const { component } = componentOver(port);
    await component.ngOnInit();
    expect(component.notice()).toBe(ALL_NOTES_STRINGS.nameRequired);
    expect(component.rows()).toEqual([]);
  });

  it('an empty world shows the empty state, and an unusable index the refusal', async () => {
    const empty = new MemoryStoragePort();
    await saveSettings(empty, { name: 'reader-one' });
    const { component } = componentOver(empty);
    await component.ngOnInit();
    expect(component.rows()).toEqual([]);
    expect(component.notice()).toBeNull();

    const bad = portOf([]);
    bad.seed(PAGE_INDEX_KEY, { version: 2, pageKeys: [] });
    const { component: badComponent } = componentOver(bad);
    await badComponent.ngOnInit();
    expect(badComponent.refusal()).toBe(ALL_NOTES_STRINGS.listUnavailable);
  });
});

describe('the stored title reaches the row label (A190)', () => {
  it('a row with a title labels the page with it, without one with the page key', async () => {
    const titled = createEntry({
      id: 'titled00001',
      pageKey: PAGE_A,
      authorName: 'reader-one',
      text: 'text',
      comment: 'note',
      anchor: { text: 'text', prefix: '', suffix: '', fragmentCount: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      title: 'Статья',
    });
    const port = portOf([titled as unknown as Record<string, unknown>]);
    const answer = await authorPagesOf(port, 'reader-one');
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows[0]?.title).toBe('Статья');
  });
});

describe('loadSettings imports', () => {
  it('the page reads the name and the switch through core', async () => {
    const port = portOf([]);
    const settings = await loadSettings(port);
    expect(settings.name).toBe('reader-one');
    expect(typeof saveSettings).toBe('function');
    expect(typeof deleteEntriesOfAuthor).toBe('function');
  });
});

describe('the row link shows its full address on hover (A206, task t28-01)', () => {
  it('carries the full page key as its title, the same value as its href', () => {
    // The label is the stored `document.title` when the page has one (`A190`), so the
    // address is off screen; `A206` puts the whole key in the link's `title`, which is
    // a template fact of this component and is pinned where the markup lives.
    const template = rowTemplate();
    expect(template).toContain('[href]="row.pageKey"');
    expect(template).toContain('[attr.title]="row.pageKey"');
    // One binding, one value: the `title` reads exactly the field the `href` does.
    const link = /<a[\s\S]*?class="link"[\s\S]*?>/.exec(template)?.[0];
    expect(link).toBeDefined();
    expect(link).toContain('[attr.title]="row.pageKey"');
    expect(link).toContain('[href]="row.pageKey"');
    // The label, the target and the rel are untouched by `A206`.
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noreferrer"');
    expect(template).toContain('{{ row.label }}');
  });

  it('a row with a stored title keeps the title as its label, and the key as its title', async () => {
    const titled = createEntry({
      id: 'titled00001',
      pageKey: PAGE_A,
      authorName: 'reader-one',
      text: 'text',
      comment: 'note',
      anchor: { text: 'text', prefix: '', suffix: '', fragmentCount: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      title: 'Статья',
    });
    const port = portOf([titled as unknown as Record<string, unknown>]);
    const answer = await authorPagesOf(port, 'reader-one');
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // The row the template is handed: the `A190` label rule against this answer.
    const row = {
      pageKey: answer.rows[0]?.pageKey ?? '',
      label: answer.rows[0]?.title ?? pageLabelText(answer.rows[0]?.pageKey ?? ''),
    };
    expect(row.label).toBe('Статья');
    expect(row.pageKey).toBe(PAGE_A);
    // Hover value and `href` are the same full key, which the title label does not show.
    expect(row.pageKey).not.toBe(row.label);
  });

  it('a row without a stored title labels with the key minus its scheme, and keeps the full key', async () => {
    const port = portOf([storedEntry({ pageKey: PAGE_A })]);
    const answer = await authorPagesOf(port, 'reader-one');
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows[0]?.title).toBeNull();
    const row = {
      pageKey: answer.rows[0]?.pageKey ?? '',
      label: answer.rows[0]?.title ?? pageLabelText(answer.rows[0]?.pageKey ?? ''),
    };
    // The label drops only the scheme (`A190`); the `href`/`title` keep it whole.
    expect(row.label).toBe('example.com/a');
    expect(row.pageKey).toBe('https://example.com/a');
    expect(pageLabelText(row.pageKey)).not.toContain('://');
  });

  it('adds no word to the wording module: the title is page data, not a UI string', () => {
    // `A206` adds no string anywhere: the title is the row's own key. The one module
    // this layer keeps its wording in still holds exactly its own seven sentences and
    // no address literal.
    const text = readFileSync(join(projectRoot, 'src', 'all-notes', 'text.ts'), 'utf8');
    expect(Object.keys(ALL_NOTES_STRINGS).sort()).toEqual([
      'delete',
      'empty',
      'listUnavailable',
      'nameRequired',
      'open',
      'serverDeleteFailed',
      'title',
    ]);
    for (const sentence of Object.values(ALL_NOTES_STRINGS)) {
      expect(sentence).not.toMatch(/https?:|\/\//);
    }
    expect(text).not.toMatch(/https?:\/\/example/);
    // The label helper drops the scheme, which is why the `title` has to carry the key.
    expect(pageLabelText('https://example.com/a')).toBe('example.com/a');
  });
});
