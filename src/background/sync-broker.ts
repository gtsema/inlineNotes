/**
 * The background broker: the one place the page's sync calls are performed (Stage 23,
 * rulings `A200`-`A202`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Where the page's
 * network lives (rulings `A200`-`A202`)".
 *
 * Why this module exists: a `fetch` started by the content script is a subresource
 * request of the **article's page**, so Chrome blocks an `http://` one on an `https://`
 * article as Mixed Content — the reader's own console error. An MV3 service worker is an
 * extension context, not the article's page, so the same request is allowed there. The
 * page sends `SYNC_FETCH_MESSAGE` (`src/core/sync-broker-message.ts`) and this listener
 * runs the call.
 *
 * Three properties, each one a ruling:
 *
 * - **it builds no URL** (`A201`). The request arrives complete — `url`, `method`,
 *   headers, body — and is handed to `fetch` as it is, **except** that the body key is
 *   omitted on `GET` and `HEAD`, because `fetch` refuses one there (`TypeError: Request
 *   with GET/HEAD method cannot have body`) and the page's own adapter always carried
 *   that rule. The address still comes from `settings:v1` through core `syncTargetOf`,
 *   the routes from core `notesPageUrl` / `noteDeleteUrl`, so "the extension sends a
 *   request to no address but the one in settings" stays a property of the shipped file
 *   list.
 * - **it keeps no state** (`A201`). Nothing is read, nothing is remembered, so the
 *   worker's termination between two calls changes nothing: the next message starts a
 *   fresh worker and runs its own request. There is no timer, no retry and no log.
 * - **a failure is an answer, not a throw** (`A202`). A `fetch` that throws — a refused
 *   connection, a blocked request, an aborted one — is answered as
 *   `{ ok: false, status: 0, body: null }`, so the page's transport has one failure
 *   vocabulary and the core client's `A164` `network` code keeps its meaning. A body
 *   that is not readable JSON is answered as `body: null`.
 *
 * The listener is declared structurally rather than as `chrome.runtime.onMessage`:
 * `createSyncFetchListener` returns the same shape Chrome's event takes, and the wiring
 * in `src/background/service-worker.ts` is the one place that names the API. That keeps
 * the whole rule testable without a browser and without a `chrome` stub.
 */

import type { SyncFetchAnswer, SyncFetchRequest } from '../core/sync-broker-message';
import { SYNC_FETCH_FAILURE_ANSWER, syncFetchRequestOf } from '../core/sync-broker-message';

/**
 * A `chrome.runtime.onMessage` listener, declared structurally.
 *
 * The listener model is Chrome's own: a sender is answered **only** when the listener
 * returns `true` and calls the `respond` callback later, which is why the fetch path
 * answers asynchronously through that callback. A message this listener does not know is
 * answered with `undefined` and no response at all, so another listener — or the default
 * "no receiver" answer — stays in charge.
 */
export type SyncFetchListener = (
  message: unknown,
  sender: unknown,
  respond: (answer: unknown) => void,
) => boolean | undefined;

/**
 * The `fetch` this broker runs. Injected, so a test drives it without a network.
 *
 * `body` is optional because the broker omits it on `GET` and `HEAD` (`A201`): `fetch`
 * refuses a body on those methods (`TypeError: Request with GET/HEAD method cannot have
 * body`), so the key must be absent rather than empty.
 */
export type SyncFetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * The listener the worker registers: one request in, one answer out.
 *
 * `fetchImpl` is the only collaborator. The shipped worker passes `fetch`; a test passes
 * a recorder. No URL is built and no state is kept between calls (`A201`).
 */
export function createSyncFetchListener(fetchImpl: SyncFetchImpl): SyncFetchListener {
  return (message, _sender, respond) => {
    const request = syncFetchRequestOf(message);
    if (request === null) {
      // Not ours: no response, no `true`. Another listener (or Chrome's default) answers.
      return undefined;
    }
    // Returning `true` keeps the response channel open for the asynchronous answer below.
    void answerOf(fetchImpl, request).then(respond);
    return true;
  };
}

/** Runs one request and answers it; a thrown `fetch` is the failure shape, never a rejection. */
async function answerOf(fetchImpl: SyncFetchImpl, request: SyncFetchRequest): Promise<SyncFetchAnswer> {
  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      // `fetch` refuses a body on `GET` and `HEAD`, so the key is left out entirely
      // there (`A201`) — the same rule the page's own adapter always carried.
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: request.body }),
    });
  } catch {
    return SYNC_FETCH_FAILURE_ANSWER;
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or non-JSON body: the page's transport reads `body: null` as "nothing to
    // parse", exactly as a rejected `response.json()` used to read.
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}
