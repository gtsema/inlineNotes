import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { entryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { SyncTransport } from '../src/core/sync-client';
import { POPUP_STRINGS } from '../src/popup/text';
import type { PageEntriesSource } from '../src/popup/page-entries-service';
import { PageEntriesService } from '../src/popup/page-entries-service';
import type { SyncPressSource } from '../src/popup/sync-button-service';
import { PopupSyncPress, pressSync, syncAvailable } from '../src/popup/sync-button-service';
import { codeOnly } from './support/build-script-guards';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The popup's sync button (Stage 17, `t17-01` AC4, AC5, AC6).
 *
 * What is pinned here:
 *
 * - **who gets the button** (`A161`, `A166`): the current author's row only, and only
 *   when the record says synchronization is on with a usable address;
 * - **what a press sends** (`A161`): one `POST` to `/notes/page/<encoded key>`, with
 *   `author_id` = the settings name and a `notes` array that holds the current author's
 *   entries and nothing else;
 * - **what a press answers** (`A162`): a result the component turns into one of three
 *   visual states, with no timer anywhere — which this file pins as a source fact,
 *   because "there is no `setTimeout` in the popup" cannot be observed from a promise.
 *
 * The transport is a recorder, so the wire is inspected byte for byte and no socket is
 * opened: the file runs in the default Node environment.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const PAGE_URL = 'https://example.com/a?utm_source=newsletter';
const PAGE_KEY = 'https://example.com/a';
const OWN_NAME = 'reader-one';

/** One request as the transport saw it. */
interface Call {
  url: string;
  method: string;
  body: string;
}

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

/** A record with a name, a page of stored notes and the two sync fields. */
function portOf(overrides: Record<string, unknown> = {}): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
  port.seed(
    entryStorageKey(PAGE_KEY),
    slotValue([
      storedEntry({ id: 'own001', authorName: OWN_NAME, createdAt: '2026-01-01T00:00:00.000Z' }),
      storedEntry({
        id: 'own002',
        authorName: OWN_NAME,
        createdAt: '2026-01-02T00:00:00.000Z',
        text: 'second',
      }),
      storedEntry({ id: 'their01', authorName: 'Вася', createdAt: '2026-01-03T00:00:00.000Z' }),
    ]),
  );
  port.seed(SETTINGS_KEY, {
    name: OWN_NAME,
    serverUrl: 'http://localhost:8080',
    syncEnabled: true,
    ...overrides,
  });
  return port;
}

function sourceOf(port: MemoryStoragePort, transport: SyncTransport): SyncPressSource {
  return { port, pageUrl: async (): Promise<string | null> => PAGE_URL, transport };
}

function entriesSourceOf(port: MemoryStoragePort): PageEntriesSource {
  return {
    port,
    pageUrl: async (): Promise<string | null> => PAGE_URL,
    openOptions: (): void => undefined,
    // `A167`: this suite is about the sync **button**, so the page is asked and answers
    // that it holds no foreign rows and that its automatic load did not fail. The foreign
    // half of the row list lives in `tests/popup-foreign-rows.spec.ts`.
    page: {
      sendMessage: async (): Promise<unknown> => ({ rows: [], syncFailed: false }),
    },
  };
}

describe('AC5 one press sends the current author\'s notes of this page, and nothing else (A161)', () => {
  it('posts to /notes/page/<encoded key> with `author_id` = the settings name', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { saved: 2 } });

    const result = await pressSync(sourceOf(port, transport), OWN_NAME);
    expect(result).toEqual({ ok: true, saved: 2 });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe(`http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}`);

    const body = JSON.parse(call?.body ?? '{}') as {
      author_id: string;
      notes: { id: string; text: string }[];
    };
    expect(body.author_id).toBe(OWN_NAME);
    // The foreign record of the page is stored locally (its author deleted nothing) and
    // must never travel: `A161` is a filter, not a convention.
    expect(body.notes.map((note) => note.id)).toEqual(['own001', 'own002']);
    // And each note is the server's `model.NoteInput`: the author names the set once, and
    // no note repeats a field the server owns.
    for (const note of body.notes) {
      expect(Object.keys(note).sort()).toEqual(['anchor', 'comment', 'id', 'text']);
    }
  });

  it('sends the notes in creation order, so two presses of an unchanged page send one body', async () => {
    const port = portOf();
    const first = transportOf({ body: { saved: 2 } });
    const second = transportOf({ body: { saved: 2 } });

    await pressSync(sourceOf(port, first.transport), OWN_NAME);
    await pressSync(sourceOf(port, second.transport), OWN_NAME);
    expect(first.calls[0]?.body).toBe(second.calls[0]?.body);
  });

  it('writes nothing to storage and sends no message: a press is a network call only', async () => {
    const port = portOf();
    const before = JSON.stringify(port.snapshot());
    const { transport } = transportOf({ body: { saved: 2 } });

    await pressSync(sourceOf(port, transport), OWN_NAME);
    expect(JSON.stringify(port.snapshot())).toBe(before);
    expect(port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('sends nothing at all when the author has no note of their own on the page', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { saved: 0 } });

    const result = await pressSync(sourceOf(port, transport), 'другой-читатель');
    expect(result).toEqual({ ok: false, code: 'nothin_to_send', saved: 0 });
    expect(calls).toEqual([]);
  });

  it('reads the notes at press time, so a note saved a second ago is in the payload', async () => {
    const port = portOf();
    const service = new PageEntriesService(entriesSourceOf(port));
    await service.open();
    port.seed(
      entryStorageKey(PAGE_KEY),
      slotValue([
        storedEntry({ id: 'own001', authorName: OWN_NAME }),
        storedEntry({ id: 'fresh01', authorName: OWN_NAME, text: 'written after the popup opened' }),
      ]),
    );
    const { transport, calls } = transportOf({ body: { saved: 2 } });

    await pressSync(sourceOf(port, transport), OWN_NAME);
    const body = JSON.parse(calls[0]?.body ?? '{}') as { notes: { id: string }[] };
    expect(body.notes.map((note) => note.id)).toEqual(['own001', 'fresh01']);
  });
});

describe('AC4 the button exists only when synchronization can be used (A166, A161)', () => {
  it('answers no target with the switch off, whatever the address says', async () => {
    expect(await syncAvailable(portOf({ syncEnabled: false }))).toBeNull();
  });

  it('answers no target with an empty address, whatever the switch says', async () => {
    expect(await syncAvailable(portOf({ serverUrl: '' }))).toBeNull();
  });

  it('answers no target for an old record that carries neither field', async () => {
    const port = portOf();
    port.seed(SETTINGS_KEY, { name: OWN_NAME });
    expect(await syncAvailable(port)).toBeNull();
  });

  it('answers the target when both halves hold, and the same answer the content script reads', async () => {
    expect(await syncAvailable(portOf())).toEqual({
      serverUrl: 'http://localhost:8080',
      notesPageBase: 'http://localhost:8080/notes/page/',
    });
  });

  it('carries that answer into the view the popup renders its rows from', async () => {
    const on = await new PageEntriesService(entriesSourceOf(portOf())).open();
    const off = await new PageEntriesService(
      entriesSourceOf(portOf({ syncEnabled: false })),
    ).open();
    const noUrl = await new PageEntriesService(entriesSourceOf(portOf({ serverUrl: '' }))).open();

    expect(on.syncEnabled).toBe(true);
    expect(off.syncEnabled).toBe(false);
    expect(noUrl.syncEnabled).toBe(false);
    // And the rows are the same in all three: the button is a rendering decision, not a
    // change to the list (`A95`, `A108`).
    expect(on.rows.map((row) => row.authorName)).toEqual(off.rows.map((row) => row.authorName));
    // Nor does `A166` reach the failure line: with synchronization off nothing was asked
    // of the server, so there is nothing to state (`A169`).
    expect(on.syncFailed).toBe(false);
    expect(off.syncFailed).toBe(false);
    expect(noUrl.syncFailed).toBe(false);
  });

  it('answers `sync_off` from a press when the switch moved under the popup, and calls nothing', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { saved: 2 } });
    port.seed(SETTINGS_KEY, { name: OWN_NAME, serverUrl: 'http://localhost:8080', syncEnabled: false });

    expect(await pressSync(sourceOf(port, transport), OWN_NAME)).toEqual({
      ok: false,
      code: 'sync_off',
    });
    expect(calls).toEqual([]);
  });

  it('is the current author\'s row that gets it, by core `isSameAuthor` (A161)', async () => {
    const port = portOf({ name: `  ${OWN_NAME}  ` });
    const view = await new PageEntriesService(entriesSourceOf(port)).open();
    const own = view.rows.filter((row) => row.isOwn);
    expect(own.map((row) => row.authorName)).toEqual([OWN_NAME]);
    expect(view.rows.filter((row) => !row.isOwn).map((row) => row.authorName)).toEqual(['Вася']);
  });
});

describe('AC6 a press answers a code, never a rejection, and never a timer (A162, A164)', () => {
  it('answers a transport that throws with `network`', async () => {
    const port = portOf();
    const transport: SyncTransport = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await pressSync(sourceOf(port, transport), OWN_NAME)).toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('answers a non-2xx status with `http`', async () => {
    const port = portOf();
    const { transport } = transportOf({ ok: false, status: 500, body: { error: 'storage failure' } });
    expect(await pressSync(sourceOf(port, transport), OWN_NAME)).toEqual({
      ok: false,
      code: 'http',
    });
  });

  it('answers a body it cannot read with `response_invalid`', async () => {
    const port = portOf();
    const { transport } = transportOf({ body: { saved: 'many' } });
    expect(await pressSync(sourceOf(port, transport), OWN_NAME)).toEqual({
      ok: false,
      code: 'response_invalid',
    });
  });

  it('runs the press through the class the component injects', async () => {
    const port = portOf();
    const { transport, calls } = transportOf({ body: { saved: 2 } });
    const press = new PopupSyncPress(sourceOf(port, transport));

    expect(await press.available()).toBe(true);
    expect(await press.press(OWN_NAME)).toEqual({ ok: true, saved: 2 });
    expect(calls).toHaveLength(1);
  });

  it('keeps the one timer to the minimum spin, and never lets it decide the outcome', () => {
    // A162 forbids a timer in this layer because a timer that decided the outcome would let
    // the red arrows turn green on their own. A185 narrows that ban instead of lifting it: the
    // reader must SEE that the press was taken, and a local server answers in about 4 ms —
    // measured — so the turn has to outlive the request.
    //
    // The narrowing is checked as text, because the difference between the forbidden timer and
    // the allowed one is not visible in a promise: the allowed timer runs AFTER a success has
    // been read, and the failure path returns before it is even started.
    const service = codeOnly(
      readFileSync(join(projectRoot, 'src', 'popup', 'sync-button-service.ts'), 'utf8'),
    );
    // The service — the half that owns the request — still has no clock at all.
    expect(service).not.toMatch(/\bsetTimeout\b|\bsetInterval\b|\bDate\.now\b/);

    const component = codeOnly(
      readFileSync(join(projectRoot, 'src', 'popup', 'popup.component.ts'), 'utf8'),
    );
    // Exactly one timer, and no more than two clock reads: one to stamp the press and one to
    // measure what is left of the minimum. A third would be a second way to decide when the
    // turn ends.
    expect(component.match(/\bsetTimeout\b/g) ?? []).toHaveLength(1);
    expect(component.match(/\bDate\.now\b/g) ?? []).toHaveLength(2);
    expect(component).not.toMatch(/\bsetInterval\b/);

    // And the failure returns BEFORE the timer: red is never held behind the spin.
    const press = component.slice(component.indexOf('private async press('));
    const failure = press.indexOf("this.syncState.set('error')");
    const timer = press.indexOf('setTimeout(');
    expect(failure).toBeGreaterThan(-1);
    expect(timer).toBeGreaterThan(-1);
    expect(failure, 'error must be set before the timer is reached').toBeLessThan(timer);
  });});

describe('the popup strings of the feature are Russian and live in the one module', () => {
  it('names the control and the failure with a Russian sentence each', () => {
    expect(POPUP_STRINGS.sync).toBe('Синхронизировать');
    expect(POPUP_STRINGS.syncFailed).toMatch(/[А-Яа-яЁё]/);
    // The control is icon-only: the word is an accessible name, so it is not empty and it
    // is not a glyph.
    expect(POPUP_STRINGS.sync.trim()).toBe(POPUP_STRINGS.sync);
  });
});

describe('the popup template renders the button before the delete control, in the own row only', () => {
  const template = (): string => {
    const raw = codeOnly(readFileSync(join(projectRoot, 'src/popup/popup.component.ts'), 'utf8'));
    const found = /template:\s*`([\s\S]*?)`/.exec(raw)?.[1];
    if (found === undefined) {
      throw new Error('the popup component has no inline template to scan');
    }
    return found;
  };

  it('guards the button with the one condition that names both rulings', () => {
    // One `@if`, two answers: the page has somewhere to call (`A166`) and the row is the
    // reader's own (`A161`). Both live in `showsSyncButton`, so the template cannot drift
    // from the rule.
    expect(template()).toMatch(/@if \(showsSyncButton\(row\)\) \{/);
    expect(template()).toMatch(/\(click\)="onSync\(row\.authorName\)"/);
  });

  it('draws the button between the checkbox and the delete control, inside the row', () => {
    const text = template();
    const checkbox = text.indexOf('type="checkbox"');
    const sync = text.indexOf('class="sync"');
    const remove = text.indexOf('class="delete"');
    expect(checkbox).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(checkbox);
    expect(remove).toBeGreaterThan(sync);
  });

  it('carries the accessible name and no visible text, and hides the glyph from a reader', () => {
    const text = template();
    expect(text).toMatch(/\[attr\.aria-label\]="syncLabel"/);
    expect(text).toMatch(/\[attr\.title\]="syncLabel"/);
    expect(text).toMatch(/stroke="currentColor"/);
    expect(text).toMatch(/aria-hidden="true"/);
    // The glyph is the only child: an icon-only control prints no word between its tags.
    const button = /<button\b[^>]*class="sync"[\s\S]*?<\/button>/.exec(text)?.[0] ?? '';
    const inner = button.replaceAll(/<svg\b[\s\S]*?<\/svg>/g, '');
    expect(inner.replaceAll(/<[^>]*>/g, '').trim()).toBe('');
  });

  it('binds the state as a class and disables the control while it runs', () => {
    const text = template();
    expect(text).toMatch(/\[class\]="syncButtonClass\(\)"/);
    expect(text).toMatch(/\[disabled\]="syncState\(\) === 'running'"/);
  });
});