import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import type { SyncFetchAnswer, SyncFetchRequest } from '../src/core/sync-broker-message';
import { SYNC_FETCH_MESSAGE } from '../src/core/sync-broker-message';
import { createSyncTransport } from '../src/content/sync/broker-transport';

/**
 * The page's sync transport (Stage 23, rulings `A200`-`A202`).
 *
 * The content script used to call `fetch`. On an `https://` article that is a subresource
 * request of the **article's page**, so Chrome refuses an `http://` server as Mixed
 * Content whatever `host_permissions` says — which is how the automatic load and the
 * editor's one-note delete silently stopped working on the reader's own article. The
 * transport now sends `SYNC_FETCH_MESSAGE` to the background broker and reads its
 * `{ ok, status, body }` answer (`A200`).
 *
 * Three claims, one group each:
 *
 * - **a delivered message answers the request** (`A201`): the message carries exactly the
 *   four fields core built — `url`, `method`, `headers`, `body` — under the message name
 *   of `src/core/sync-broker-message.ts`, and the answer reaches the caller in the
 *   `{ ok, status, json }` shape `SyncTransport` declares, including the failure status
 *   and the `body: null` of a body the broker could not read;
 * - **an undelivered message rejects** (`A202`): a rejected `sendMessage`, a `lastError`
 *   with no answer, and an answer that is not the broker's shape all throw, so core's
 *   `send` answers `network` exactly as it did for a rejected `fetch` (`A164`), and the
 *   automatic load stays silent and non-blocking;
 * - **the module is a seam and nothing else**: no network API, no URL of its own, no
 *   state between calls, no timer and no retry.
 *
 * `chrome.runtime` is stubbed per case through `vi.stubGlobal`, so the module keeps
 * naming the real API and the suite needs no `chrome` package and no jsdom.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const REQUEST_URL = 'http://localhost:8080/notes/page/https%3A%2F%2Fexample.com%2Fa';

const INIT = { method: 'GET', headers: { 'Content-Type': 'application/json' }, body: '' };

/** The shipped message one transport call produced, in the broker's own shape. */
interface SentMessage {
  readonly type: string;
  readonly request: SyncFetchRequest;
}

/** What the stubbed `chrome.runtime.sendMessage` recorded, in the order it was called. */
interface ChromeStub {
  readonly sent: SentMessage[];
}

/** One `chrome.runtime.sendMessage` as the extension sees it: an answer, a rejection or a `lastError`. */
function stubChrome(rawAnswer: unknown): ChromeStub {
  const sent: SentMessage[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      lastError: undefined,
      sendMessage: async (message: unknown): Promise<unknown> => {
        sent.push(message as SentMessage);
        return rawAnswer;
      },
    },
  });
  return { sent };
}

/** One broker answer, as the worker would send it. */
function answer(overrides: Partial<SyncFetchAnswer> = {}): SyncFetchAnswer {
  return { ok: true, status: 200, body: { notes: [] }, ...overrides };
}

describe('the transport sends the request core built to the broker (A200, A201)', () => {
  it('sends one message under the broker\'s name, carrying url, method, headers and body', async () => {
    const chrome = stubChrome(answer());
    const transport = createSyncTransport();

    const response = await transport(REQUEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"notes":[]}',
    });

    expect(chrome.sent).toHaveLength(1);
    expect(chrome.sent[0]).toEqual({
      type: SYNC_FETCH_MESSAGE,
      request: {
        url: REQUEST_URL,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"notes":[]}',
      },
    });
    // The answer is the broker's, in the shape core `send` reads: the body arrives
    // already parsed, so `json()` resolves it and never touches a stream.
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notes: [] });
  });

  it('carries a non-2xx status and a body the broker could not read as they are', async () => {
    const transport = createSyncTransport();

    stubChrome(answer({ ok: false, status: 500, body: { error: 'boom' } }));
    const failed = await transport(REQUEST_URL, INIT);
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'boom' });

    // `body: null` is the broker's answer for a body that is not readable JSON
    // (`A202`): the caller sees a readable `null`, never a second failure path.
    stubChrome(answer({ ok: true, status: 204, body: null }));
    const empty = await transport(REQUEST_URL, INIT);
    expect(empty.ok).toBe(true);
    expect(empty.status).toBe(204);
    expect(await empty.json()).toBeNull();
  });

  it('builds no URL and keeps no state: the second call sends the second request', async () => {
    const chrome = stubChrome(answer());

    const transport = createSyncTransport();
    await transport(REQUEST_URL, INIT);
    await transport('http://localhost:8080/notes/page/other', {
      method: 'DELETE',
      headers: {},
      body: '',
    });

    expect(chrome.sent.map((message) => message.request.url)).toEqual([
      REQUEST_URL,
      'http://localhost:8080/notes/page/other',
    ]);
    expect(chrome.sent.map((message) => message.request.method)).toEqual(['GET', 'DELETE']);
  });
});

describe('a message that cannot be delivered rejects, as a rejected fetch did (A202)', () => {
  it('rejects when sendMessage rejects (no receiver at all)', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendMessage: async (): Promise<unknown> => {
          throw new TypeError('Could not establish connection. Receiving end does not exist.');
        },
      },
    });

    await expect(createSyncTransport()(REQUEST_URL, INIT)).rejects.toThrow(
      /Receiving end does not exist/,
    );
  });

  it('rejects when the port closed: an undefined answer and a set lastError', async () => {
    // Chrome's second failure shape: the promise **resolves** with `undefined` and leaves
    // the reason in `chrome.runtime.lastError`. Reading only the resolved value would
    // hand core a `{ ok: true }` for a call that never happened.
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: { message: 'The message port closed before a response was received.' },
        sendMessage: async (): Promise<unknown> => undefined,
      },
    });

    await expect(createSyncTransport()(REQUEST_URL, INIT)).rejects.toThrow(
      /message port closed/,
    );
  });

  it('rejects an answer that is not the broker\'s shape, instead of inventing a status', async () => {
    for (const notAnAnswer of [undefined, null, 'ok', { ok: true }, { status: 200 }]) {
      stubChrome(notAnAnswer);
      await expect(
        createSyncTransport()(REQUEST_URL, INIT),
        JSON.stringify(notAnAnswer),
      ).rejects.toThrow();
    }
  });
});

describe('the module is one seam: no network API, no URL, no state, no timer', () => {
  const source = readFileSync(
    join(projectRoot, 'src', 'content', 'sync', 'broker-transport.ts'),
    'utf8',
  );

  /** Comments stripped, so a prose sentence can never trip a negative scan. */
  function codeOnly(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('names no network API at all, which is the point of Stage 23', () => {
    const code = codeOnly(source);
    for (const token of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'sendBeacon',
    ]) {
      expect(code, token).not.toContain(token);
    }
  });

  it('builds no URL: no scheme, no host, no route literal', () => {
    const code = codeOnly(source);
    expect(code).not.toMatch(/https?:\/\//);
    expect(code).not.toMatch(/notes\/page/);
    expect(code).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('sends the request through the core message module rather than a second spelling', () => {
    expect(codeOnly(source)).toContain('SYNC_FETCH_MESSAGE');
    expect(codeOnly(source)).toMatch(
      /from\s*'\.\.\/\.\.\/core\/sync-broker-message'/,
    );
  });

  it('starts no timer and installs no retry', () => {
    const code = codeOnly(source);
    expect(code).not.toMatch(/\bsetTimeout\b/);
    expect(code).not.toMatch(/\bsetInterval\b/);
    expect(code).not.toMatch(/\brequestAnimationFrame\b/);
    expect(code).not.toMatch(/\bfor\s*\(|\bwhile\s*\(/);
    expect(code).not.toMatch(/console\./);
  });

  it('keeps no state: the factory answers a function and the module holds no binding', () => {
    // `createSyncTransport()` is called once per document and returns the call itself:
    // no cache, no queue, no counter, no module-level answer to reuse.
    expect(codeOnly(source)).toMatch(/export function createSyncTransport\(\): SyncTransport \{/);
    expect(codeOnly(source)).not.toMatch(/\bnew Map\b|\bnew Set\b|\bnew WeakMap\b|\[\]/);
  });
});
