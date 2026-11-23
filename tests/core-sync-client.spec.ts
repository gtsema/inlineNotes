import { describe, expect, it } from 'vitest';

import { createEntry } from '../src/core/entry';
import type { Entry } from '../src/core/entry';
import {
  authorDeleteUrl,
  deleteRemoteAuthorNotes,
  deleteRemoteNote,
  entryFromRemoteNote,
  loadForeignNotes,
  notesPageUrl,
  remoteNoteOf,
  saveOwnNotes,
  syncPayloadOf,
} from '../src/core/sync-client';
import type { RemoteNote, SyncTransport } from '../src/core/sync-client';
import {
  NOTES_PAGE_PATH,
  normalizeServerAddress,
  parseServerAddress,
  syncTargetOf,
} from '../src/core/sync-settings';

/**
 * The sync boundary of Stage 17: the address rule (`A165`, `A166`) and the wire
 * mapping (`A161`, `A163`, `A164`).
 *
 * Everything here is a pure function or a call over an injected transport, so the
 * file runs in the default Node environment: no jsdom, no `chrome` stub, no network.
 * The transport is a recorder; a test that wants a failure answers with one instead
 * of throwing from a real socket.
 */

/** A stored entry with the fields a sync body carries. */
function entry(overrides: Partial<Entry> = {}): Entry {
  return createEntry({
    id: 'a1b2c3d4e5f6',
    pageKey: 'https://example.com/a',
    authorName: 'Анна',
    text: 'selected text',
    comment: 'my note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    ...overrides,
  });
}

/** One request as the transport saw it. */
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A transport that records every call and answers with a scripted response. */
function transportOf(
  answer: { ok?: boolean; status?: number; body?: unknown } = {},
): { transport: SyncTransport; calls: Call[] } {
  const calls: Call[] = [];
  const transport: SyncTransport = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
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

const TARGET = { serverUrl: 'http://localhost:8080', notesPageBase: 'http://localhost:8080/notes/page/' };
const PAGE_KEY = 'https://example.com/a?b=2&a=1#top';

describe('server address: http(s) only, no base path, and clearing the field is legal (A165)', () => {
  it('accepts an http and an https address and stores the bare origin', () => {
    expect(parseServerAddress('http://localhost:8080')).toEqual({
      ok: true,
      serverUrl: 'http://localhost:8080',
    });
    expect(parseServerAddress('https://sync.example.com')).toEqual({
      ok: true,
      serverUrl: 'https://sync.example.com',
    });
    expect(parseServerAddress('https://sync.example.com:8443')).toEqual({
      ok: true,
      serverUrl: 'https://sync.example.com:8443',
    });
  });

  it('trims what the reader typed and drops the trailing slash', () => {
    expect(parseServerAddress('  http://192.168.0.10:8080/  ')).toEqual({
      ok: true,
      serverUrl: 'http://192.168.0.10:8080',
    });
  });

  it('reads an empty field as "not configured" rather than as an error', () => {
    expect(parseServerAddress('')).toEqual({ ok: true, serverUrl: '' });
    expect(parseServerAddress('   ')).toEqual({ ok: true, serverUrl: '' });
  });

  it('refuses a value that is not a URL at all', () => {
    // `localhost:8080` parses as a URL of the scheme `localhost:`, which is why it is
    // refused by the scheme rule rather than by this one.
    for (const raw of ['не ссылка', 'http://', '://x', 'http//x']) {
      expect(parseServerAddress(raw), raw).toEqual({ ok: false, code: 'server_invalid' });
    }
  });

  it('refuses a scheme other than http and https', () => {
    for (const raw of ['ftp://localhost:8080', 'file:///tmp/server', 'chrome://extensions', 'ws://localhost:8080']) {
      expect(parseServerAddress(raw), raw).toEqual({ ok: false, code: 'server_scheme' });
    }
  });

  it('refuses a base path, a query, a fragment and credentials', () => {
    for (const raw of [
      'http://localhost:8080/notes',
      'http://localhost:8080/?a=1',
      'http://localhost:8080/#top',
      'http://user:pass@localhost:8080',
    ]) {
      expect(parseServerAddress(raw), raw).toEqual({ ok: false, code: 'server_shape' });
    }
  });

  it('normalizes an accepted address and leaves a refused one trimmed but untouched', () => {
    expect(normalizeServerAddress(' http://localhost:8080/ ')).toBe('http://localhost:8080');
    expect(normalizeServerAddress(' not a url ')).toBe('not a url');
    expect(normalizeServerAddress('')).toBe('');
  });
});

describe('synchronization needs a switch that is on and an address that parses (A166)', () => {
  it('answers no target when the switch is off, whatever the address says', () => {
    expect(syncTargetOf({ serverUrl: 'http://localhost:8080', syncEnabled: false })).toBeNull();
  });

  it('answers no target when the address is empty, whatever the switch says', () => {
    expect(syncTargetOf({ serverUrl: '', syncEnabled: true })).toBeNull();
    expect(syncTargetOf({ serverUrl: '   ', syncEnabled: true })).toBeNull();
  });

  it('answers no target for an address that does not parse, so no request can be built from it', () => {
    expect(syncTargetOf({ serverUrl: 'ftp://localhost:8080', syncEnabled: true })).toBeNull();
    expect(syncTargetOf({ serverUrl: 'localhost:8080', syncEnabled: true })).toBeNull();
  });

  it('answers the target and the shared path prefix when both halves hold', () => {
    expect(syncTargetOf({ serverUrl: ' http://localhost:8080/ ', syncEnabled: true })).toEqual(TARGET);
    expect(TARGET.notesPageBase.endsWith(NOTES_PAGE_PATH)).toBe(true);
  });
});

describe('a POST carries one author and nothing else (A161)', () => {
  it('names the author in `author_id` and sends only that author\'s notes', () => {
    const own = entry({ id: 'own001' });
    const foreign = entry({ id: 'foreign01', authorName: 'Борис' });

    const payload = syncPayloadOf([own, foreign], 'Анна');
    expect(payload.author_id).toBe('Анна');
    expect(payload.notes.map((note) => note.id)).toEqual(['own001']);
  });

  it('keeps the core author rule: names differing by a space are one author (A99)', () => {
    const payload = syncPayloadOf([entry({ id: 'own001' })], ' Анна ');
    expect(payload.notes.map((note) => note.id)).toEqual(['own001']);
  });

  it('orders the body by creation, so two presses of one page send one body', () => {
    const later = entry({ id: 'later001', createdAt: '2026-01-03T00:00:00.000Z' });
    const earlier = entry({ id: 'early001', createdAt: '2026-01-01T00:00:00.000Z' });

    const first = syncPayloadOf([later, earlier], 'Анна');
    const second = syncPayloadOf([earlier, later], 'Анна');
    expect(first.notes.map((note) => note.id)).toEqual(['early001', 'later001']);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('sends the server\'s field names and no display flag', () => {
    const [note] = syncPayloadOf([entry({ visible: false })], 'Анна').notes;
    // The server's `model.NoteInput` and nothing more: the page is in the URL, the author
    // in the body's `author_id`, the timestamps are the server's, and `visible` has no
    // column at all. A fifth field is a `400` on a server that refuses unknown fields.
    expect(note).toEqual({
      id: 'a1b2c3d4e5f6',
      text: 'selected text',
      comment: 'my note',
      anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    });
    expect(Object.keys(note ?? {}).sort()).toEqual(['anchor', 'comment', 'id', 'text']);
  });

  it('never sends the four fields the server owns, on any entry', () => {
    // The whole body, spelled out: one `author_id` for the set, and four fields per note.
    const body = syncPayloadOf([entry(), entry({ id: 'second0001' })], 'Анна');
    const keys = new Set<string>();
    for (const note of body.notes) {
      for (const key of Object.keys(note)) {
        keys.add(key);
      }
    }
    expect([...keys].sort()).toEqual(['anchor', 'comment', 'id', 'text']);
    expect(Object.keys(body).sort()).toEqual(['author_id', 'notes']);
    // `author_id` appears once, at the top: it names the author of the whole set, and it
    // is not repeated per note.
    const serialized = JSON.stringify(body);
    expect(serialized.match(/"author_id":/g) ?? []).toHaveLength(1);
    expect(serialized.startsWith('{"author_id":')).toBe(true);
    for (const forbidden of ['page_id', 'created_at', 'updated_at', 'visible']) {
      expect(serialized).not.toContain(`"${forbidden}":`);
    }
  });

  it('reads a returned row back as an entry, losing only the display flag', () => {
    const original = entry({ visible: false });
    const rounded: RemoteNote = {
      ...remoteNoteOf(original),
      page_id: original.pageKey,
      author_id: original.authorName,
      created_at: original.createdAt,
      updated_at: original.updatedAt,
    };
    expect(entryFromRemoteNote(rounded)).toEqual({ ...original, visible: true });
  });
});

describe('the wire calls (A161, A164)', () => {
  it('posts the payload to /notes/page/<encoded key> and reads `saved`', async () => {
    const { transport, calls } = transportOf({ body: { saved: 1 } });

    const result = await saveOwnNotes(transport, TARGET, PAGE_KEY, 'Анна', [entry()]);
    expect(result).toEqual({ ok: true, value: { saved: 1 } });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe(`http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}`);
    // The page key really travels percent-encoded, because it carries `/`, `?`, `&` and `#`.
    expect(call?.url).toContain('%3F');
    expect(call?.url).not.toContain('#');
    expect(call?.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      author_id: 'Анна',
      notes: [remoteNoteOf(entry())],
    });
  });

  it('gets the page notes with GET and no body', async () => {
    const { transport, calls } = transportOf({ body: { notes: [remoteNoteOf(entry())] } });

    const result = await loadForeignNotes(transport, TARGET, PAGE_KEY);
    expect(result.ok).toBe(true);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.body).toBe('');
    expect(calls[0]?.url).toBe(`http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}`);
  });

  it('answers a refused connection with `network` instead of throwing', async () => {
    const transport: SyncTransport = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await loadForeignNotes(transport, TARGET, PAGE_KEY)).toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('answers a non-2xx status with `http`', async () => {
    const { transport } = transportOf({ ok: false, status: 500, body: { error: 'storage failure' } });
    expect(await loadForeignNotes(transport, TARGET, PAGE_KEY)).toEqual({ ok: false, code: 'http' });
    expect(await saveOwnNotes(transport, TARGET, PAGE_KEY, 'Анна', [])).toEqual({
      ok: false,
      code: 'http',
    });
  });

  it('answers a body that is not the server\'s shape with `response_invalid`', async () => {
    for (const body of [{}, { notes: 'nope' }, [], null, 42]) {
      const { transport } = transportOf({ body });
      expect(await loadForeignNotes(transport, TARGET, PAGE_KEY), JSON.stringify(body)).toEqual({
        ok: false,
        code: 'response_invalid',
      });
    }
    for (const body of [{}, { saved: 'many' }, [], null]) {
      const { transport } = transportOf({ body });
      expect(await saveOwnNotes(transport, TARGET, PAGE_KEY, 'Анна', []), JSON.stringify(body)).toEqual({
        ok: false,
        code: 'response_invalid',
      });
    }
  });

  it('answers a body json() cannot read with `response_invalid`', async () => {
    const { transport } = transportOf();
    expect(await loadForeignNotes(transport, TARGET, PAGE_KEY)).toEqual({
      ok: false,
      code: 'response_invalid',
    });
  });

  it('returns an empty note list as a success, because an empty page is not an error', async () => {
    const { transport } = transportOf({ body: { notes: [] } });
    expect(await loadForeignNotes(transport, TARGET, PAGE_KEY)).toEqual({
      ok: true,
      value: { notes: [] },
    });
  });

  it('builds the url from the configured address and the route and nothing else', () => {
    expect(notesPageUrl(TARGET, 'https://example.com/a')).toBe(
      'http://localhost:8080/notes/page/https%3A%2F%2Fexample.com%2Fa',
    );
  });
});

describe('the author-scoped delete (A192 of all-notes-page.md)', () => {
  it('sends DELETE to /notes/page/<key>/author/<encoded name> and reads deleted', async () => {
    const { transport, calls } = transportOf({ body: { deleted: 2 } });

    const result = await deleteRemoteAuthorNotes(transport, TARGET, PAGE_KEY, 'Анна');
    expect(result).toEqual({ ok: true, value: { deleted: 2 } });
    const [call] = calls;
    expect(call?.method).toBe('DELETE');
    expect(call?.url).toBe(
      `http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}/author/${encodeURIComponent('Анна')}`,
    );
  });

  it('a deleted: 0 answer is a success (A181 posture)', async () => {
    const { transport } = transportOf({ body: { deleted: 0 } });

    const result = await deleteRemoteAuthorNotes(transport, TARGET, PAGE_KEY, 'Анна');
    expect(result).toEqual({ ok: true, value: { deleted: 0 } });
  });

  it('a non-2xx and a malformed body answer the code, never a throw', async () => {
    const refused = transportOf({ ok: false, status: 500, body: {} });
    expect((await deleteRemoteAuthorNotes(refused.transport, TARGET, PAGE_KEY, 'Анна')).ok).toBe(false);

    const broken = transportOf({ body: { nope: 1 } });
    expect((await deleteRemoteAuthorNotes(broken.transport, TARGET, PAGE_KEY, 'Анна'))).toEqual({
      ok: false,
      code: 'response_invalid',
    });
  });

  it('the shipped one-note delete sends the DELETE verb too (the POST regression fixed)', async () => {
    const { transport, calls } = transportOf({ body: { deleted: 1 } });

    const result = await deleteRemoteNote(transport, TARGET, PAGE_KEY, 'Анна', 'note000001');
    expect(result).toEqual({ ok: true, value: { deleted: 1 } });
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe(
      `http://localhost:8080/notes/page/${encodeURIComponent(PAGE_KEY)}/author/${encodeURIComponent('Анна')}/note/note000001`,
    );
  });

  it('spells the route once, beside the one-note delete it extends', () => {
    expect(authorDeleteUrl(TARGET, 'https://example.com/a?q', 'Анна')).toBe(
      'http://localhost:8080/notes/page/https%3A%2F%2Fexample.com%2Fa%3Fq/author/%D0%90%D0%BD%D0%BD%D0%B0',
    );
  });
});

describe('a remote note becomes a stored entry, or is skipped (A163)', () => {
  const good: RemoteNote = {
    id: 'a1b2c3d4e5f6',
    page_id: 'https://example.com/a',
    author_id: 'Борис',
    text: 'selected text',
    comment: 'their note',
    anchor: { text: 'selected text', prefix: 'x', suffix: 'y', fragmentCount: 2 },
    created_at: '2026-01-02T03:04:05.006Z',
    updated_at: '2026-01-02T03:04:05.006Z',
  };

  it('reads a complete row as an entry, visible, with the author it names', () => {
    expect(entryFromRemoteNote(good)).toEqual({
      id: 'a1b2c3d4e5f6',
      pageKey: 'https://example.com/a',
      authorName: 'Борис',
      text: 'selected text',
      comment: 'their note',
      anchor: { text: 'selected text', prefix: 'x', suffix: 'y', fragmentCount: 2 },
      visible: true,
      createdAt: '2026-01-02T03:04:05.006Z',
      updatedAt: '2026-01-02T03:04:05.006Z',
    });
  });

  it('skips a row whose fields are not all there, instead of guessing at it', () => {
    const broken: readonly Record<string, unknown>[] = [
      { ...good, id: undefined },
      { ...good, id: '' },
      { ...good, page_id: 42 },
      { ...good, author_id: null },
      { ...good, text: 1 },
      { ...good, comment: undefined },
      { ...good, created_at: 7 },
      { ...good, updated_at: false },
      { ...good, anchor: null },
      { ...good, anchor: 'text' },
      { ...good, anchor: { text: 'x' } },
      { ...good, anchor: { text: 'x', prefix: '', suffix: '', fragmentCount: 'one' } },
      { ...good, anchor: [1, 2, 3, 4] },
    ];
    for (const row of broken) {
      expect(entryFromRemoteNote(row as unknown as RemoteNote), JSON.stringify(row)).toBeNull();
    }
  });

  it('keeps the page key the server returned, so a row cannot be filed under another page by this module', () => {
    const decoded = entryFromRemoteNote({ ...good, page_id: 'https://other.example/x' });
    expect(decoded?.pageKey).toBe('https://other.example/x');
  });
});