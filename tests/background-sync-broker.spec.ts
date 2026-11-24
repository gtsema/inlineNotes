import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SyncFetchAnswer } from '../src/core/sync-broker-message';
import {
  SYNC_FETCH_FAILURE_ANSWER,
  SYNC_FETCH_MESSAGE,
  syncFetchRequestOf,
} from '../src/core/sync-broker-message';
import type { SyncFetchImpl } from '../src/background/sync-broker';
import { createSyncFetchListener } from '../src/background/sync-broker';

/**
 * The background broker (Stage 23, rulings `A200`-`A202`).
 *
 * The broker is the extension's answer to the reader's console error: a `fetch` started
 * by the content script is a subresource request of the article's page, so Chrome blocks
 * an `http://` one on an `https://` article as Mixed Content. An MV3 service worker is an
 * extension context, so the page sends it a message and the worker runs the call.
 *
 * Three claims, one group each:
 *
 * - **the answer shape** (`A201`, `A202`): the broker runs `fetch` with exactly the
 *   request it was handed — no URL built, no argument added — and answers
 *   `{ ok, status, body }` with the parsed JSON;
 * - **a thrown fetch is an answer** (`A202`): a refused connection, a blocked request or
 *   an aborted one is answered `{ ok: false, status: 0, body: null }` and never rejects;
 * - **an unknown message is ignored** (`A201`): the listener answers `undefined` and
 *   calls the response callback not at all, so another listener stays in charge.
 *
 * The `fetch` is injected, so every case runs without a network and without a browser:
 * the whole rule is a function of its argument.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const REQUEST = {
  url: 'http://localhost:8080/notes/page/https%3A%2F%2Fexample.com%2Fa',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{"notes":[]}',
};

/** One message in the shipped shape, with its request replaced per case. */
function messageOf(request: unknown = REQUEST): unknown {
  return { type: SYNC_FETCH_MESSAGE, request };
}

/** One `fetch` call the broker made, as the case needs to see it. */
interface Call {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

/** A `fetch` that answers one body and records its calls. */
function fetchOf(
  answer: { ok?: boolean; status?: number; json?: () => Promise<unknown> } = {},
): { fetchImpl: SyncFetchImpl; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: SyncFetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: answer.json ?? (async () => ({ saved: 1 })),
    };
  };
  return { fetchImpl, calls };
}

/** The answer one listener produced for one message, or `null` when it answered nothing. */
async function answerFor(
  listener: ReturnType<typeof createSyncFetchListener>,
  message: unknown,
): Promise<{ returned: boolean | undefined; answer: SyncFetchAnswer | null }> {
  const answers: unknown[] = [];
  const returned = listener(message, {}, (answer) => {
    answers.push(answer);
  });
  // The listener answers asynchronously through the callback when it returns `true`;
  // one macrotask is enough for the resolved `fetch` and the resolved `json`.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    returned,
    answer: answers.length === 0 ? null : (answers[0] as SyncFetchAnswer),
  };
}

describe('the broker answers the request it is handed (A201, A202)', () => {
  it('runs fetch with exactly the request, and answers ok, status and the parsed body', async () => {
    const { fetchImpl, calls } = fetchOf({ status: 200, json: async () => ({ saved: 2 }) });
    const listener = createSyncFetchListener(fetchImpl);

    const { returned, answer } = await answerFor(listener, messageOf());

    // Chrome's own listener contract: `true` keeps the response channel open.
    expect(returned).toBe(true);
    expect(answer).toEqual({ ok: true, status: 200, body: { saved: 2 } });

    // The request crossed the channel unchanged: no URL built, no argument added (`A201`).
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(REQUEST.url);
    expect(calls[0]?.init).toEqual({
      method: REQUEST.method,
      headers: REQUEST.headers,
      body: REQUEST.body,
    });
  });

  it('carries the failure status and the parsed body of a non-2xx answer as they are', async () => {
    const { fetchImpl } = fetchOf({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    const listener = createSyncFetchListener(fetchImpl);

    const { answer } = await answerFor(listener, messageOf());

    expect(answer).toEqual({ ok: false, status: 500, body: { error: 'boom' } });
  });

  it('answers body null when the response body is not readable JSON', async () => {
    const { fetchImpl } = fetchOf({
      status: 204,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    const listener = createSyncFetchListener(fetchImpl);

    const { answer } = await answerFor(listener, messageOf());

    expect(answer).toEqual({ ok: true, status: 204, body: null });
  });

  it('builds no URL and keeps no state between two calls', async () => {
    // The broker reads nothing and remembers nothing (`A201`), so the second message is
    // answered on its own request and the first answer cannot leak into it.
    const { fetchImpl, calls } = fetchOf();
    const listener = createSyncFetchListener(fetchImpl);

    const first = await answerFor(listener, messageOf());
    const second = await answerFor(
      listener,
      messageOf({ ...REQUEST, url: 'http://localhost:8080/notes/page/other', method: 'GET' }),
    );

    expect(first.answer).toEqual({ ok: true, status: 200, body: { saved: 1 } });
    expect(second.answer).toEqual({ ok: true, status: 200, body: { saved: 1 } });
    expect(calls.map((call) => call.url)).toEqual([
      REQUEST.url,
      'http://localhost:8080/notes/page/other',
    ]);
    expect(calls[1]?.init.method).toBe('GET');
  });
});

describe('a thrown fetch is an answer, never a rejection (A202)', () => {
  it('answers the failure shape when fetch throws', async () => {
    const calls: string[] = [];
    const listener = createSyncFetchListener(async (url) => {
      calls.push(url);
      throw new TypeError('Failed to fetch');
    });

    const { returned, answer } = await answerFor(listener, messageOf());

    expect(returned).toBe(true);
    expect(answer).toEqual({ ok: false, status: 0, body: null });
    expect(answer).toEqual(SYNC_FETCH_FAILURE_ANSWER);
    // The one request was still attempted, so "the page's call went through the broker"
    // is a fact and not a silent skip.
    expect(calls).toEqual([REQUEST.url]);
  });

  it('answers the failure shape when the transport rejects asynchronously', async () => {
    const listener = createSyncFetchListener(
      () => Promise.reject(new Error('blocked by client')),
    );

    const { answer } = await answerFor(listener, messageOf());

    expect(answer).toEqual({ ok: false, status: 0, body: null });
  });
});

describe('a message that is not the broker\'s is ignored (A201)', () => {
  it('answers undefined and calls no response callback for an unknown message', async () => {
    const { fetchImpl, calls } = fetchOf();
    const listener = createSyncFetchListener(fetchImpl);

    const cases: unknown[] = [
      undefined,
      null,
      'inlinenotes:page-notes',
      { type: 'inlinenotes:page-notes' },
      { type: SYNC_FETCH_MESSAGE },
      { type: SYNC_FETCH_MESSAGE, request: { ...REQUEST, url: 42 } },
      { type: SYNC_FETCH_MESSAGE, request: { ...REQUEST, method: null } },
      { type: SYNC_FETCH_MESSAGE, request: { ...REQUEST, body: undefined } },
      { type: SYNC_FETCH_MESSAGE, request: { ...REQUEST, headers: 'none' } },
    ];

    for (const message of cases) {
      const { returned, answer } = await answerFor(listener, message);
      // No `true` and no answer: the channel stays closed and another listener answers.
      expect(returned, JSON.stringify(message)).toBeUndefined();
      expect(answer, JSON.stringify(message)).toBeNull();
    }
    // And no request was attempted for any of them.
    expect(calls).toEqual([]);
  });
});

describe('the message contract lives in core and the worker names the network call', () => {
  it('declares the message name and the request/answer shapes in one core module', () => {
    // The page's transport and the worker's listener are separate bundles, so the name
    // is spelled once. Reading the request through the parser is the same door the
    // listener uses, so a shape change is a failing test here.
    expect(SYNC_FETCH_MESSAGE).toBe('inlinenotes:sync-fetch');
    expect(syncFetchRequestOf(messageOf())).toEqual(REQUEST);
    expect(syncFetchRequestOf({ type: SYNC_FETCH_MESSAGE })).toBeNull();
  });

  it('registers the listener in the worker, which literally names fetch', () => {
    // The network-shape pin in `tests/toolchain-contract.spec.ts` reads this file, so the
    // worker is the one place the broker's network surface lives (`A200`).
    const worker = readFileSync(
      join(projectRoot, 'src', 'background', 'service-worker.ts'),
      'utf8',
    );
    expect(worker).toContain('chrome.runtime.onMessage.addListener(');
    expect(worker).toContain('createSyncFetchListener(');
    expect(worker).toMatch(/\bfetch\s*\(/);
    // No timer and no retry anywhere in the broker (`A202`).
    expect(worker).not.toMatch(/\bsetTimeout\b|\bsetInterval\b/);
    const broker = readFileSync(join(projectRoot, 'src', 'background', 'sync-broker.ts'), 'utf8');
    expect(broker).not.toMatch(/\bsetTimeout\b|\bsetInterval\b/);
  });
});
