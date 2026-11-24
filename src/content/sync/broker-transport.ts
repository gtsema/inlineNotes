/**
 * The page's sync transport: one message to the background broker, no request built
 * (`A200`-`A202` of `docs/specs/sync-integration.md`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Where the page's
 * network lives (rulings `A200`-`A202`)".
 *
 * Why this file replaced a five-line `fetch`: a request started by the content script is
 * a **subresource request of the article's page**, so Chrome refuses an insecure one on
 * an `https://` article as Mixed Content whatever `host_permissions` says — the reader's
 * own console error, and the reason the automatic load and the editor's one-note delete
 * never reached an `http://` server. The request now travels to
 * `src/background/service-worker.ts` as `SYNC_FETCH_MESSAGE` and the worker runs the
 * `fetch`; an MV3 service worker is an extension context, not the article's page.
 *
 * Two properties, and both are unchanged from the `fetch` this module replaced:
 *
 * - **it builds no URL.** The request arrives already built by core `notesPageUrl` /
 *   `noteDeleteUrl` from the address in `settings:v1` (`A165`, `A201`), and the message
 *   carries it verbatim — `url`, `method`, `headers`, `body`, the same four fields core
 *   handed a `fetch`. "The extension sends a request to no address but the one in
 *   settings" therefore stays a property of the shipped file list, and this module names
 *   no scheme, no host and no route.
 * - **a call that does not happen is a rejection**, exactly as a rejected `fetch` was
 *   (`A202`). A closed port, a missing receiver or a `chrome.runtime.lastError` rejects
 *   the promise, so core `send` sees the throw it has always caught and answers its
 *   `network` code (`A164`): the failed automatic load stays silent and non-blocking and
 *   the button keeps its three states. Nothing is retried, nothing is timed and nothing
 *   is logged — the callback is the only wait, exactly as the popped promise was.
 *
 * The answer is read through one conversion and nothing else: the broker's
 * `{ ok, status, body }` becomes the `{ ok, status, json }` shape `SyncTransport`
 * declares, with `json()` resolving the **already parsed** body, so a body the server
 * sent as non-JSON behaves as a body that cannot be read (`response_invalid`) rather
 * than as a second, weaker failure path. The conversion is a local function rather than
 * a shared one because the popup and the all-notes page are separate bundles that each
 * ship their own `fetch` adapter, as `A189` records.
 *
 * The whole module is one function: no state, no timer, no cache, no logging.
 */

import type { SyncTransport } from '../../core/sync-client';
import type { SyncFetchAnswer } from '../../core/sync-broker-message';
import { SYNC_FETCH_MESSAGE } from '../../core/sync-broker-message';

/** One answer as the caller reads it, `null` when the answer is not the broker's shape. */
function answerOf(value: unknown): SyncFetchAnswer | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const answer = value as Record<string, unknown>;
  const ok: unknown = answer['ok'];
  const status: unknown = answer['status'];
  if (typeof ok !== 'boolean' || typeof status !== 'number') {
    return null;
  }
  return { ok, status, body: answer['body'] };
}

/** The page's transport: the broker's answer, in the `SyncTransport` shape core reads. */
export function createSyncTransport(): SyncTransport {
  return async (url, init) => {
    const answer = await deliver({
      type: SYNC_FETCH_MESSAGE,
      request: { url, method: init.method, headers: init.headers, body: init.body },
    });
    return {
      ok: answer.ok,
      status: answer.status,
      json: async (): Promise<unknown> => answer.body,
    };
  };
}

/**
 * One message to the broker, as a promise, or a rejection when it was not delivered.
 *
 * `chrome.runtime.sendMessage` has two answers a front end can disagree about: a
 * rejected promise (no MV3 listener at all) and `undefined` with
 * `chrome.runtime.lastError` set (the worker is gone, the port closed). Both become the
 * one rejection, so the caller's failure handling has a single door.
 */
async function deliver(message: unknown): Promise<SyncFetchAnswer> {
  let answered: unknown;
  try {
    answered = await chrome.runtime.sendMessage(message);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
  const answer = answerOf(answered);
  if (answer === null) {
    throw new Error('inlinenotes: the sync broker answered no request');
  }
  return answer;
}
