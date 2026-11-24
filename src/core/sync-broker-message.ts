/**
 * The one message the page sends to the background broker, and its answer (Stage 23,
 * rulings `A200`-`A202`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Where the page's
 * network lives (rulings `A200`-`A202`)".
 *
 * Why this module exists at all: on an `https://` article a `fetch` started by the
 * content script is a **subresource request of the article's page**, and Chrome refuses
 * an insecure one there as Mixed Content whatever `host_permissions` says. An MV3
 * service worker is an extension context, not the article's page, so the reader's
 * `http://` server is reachable from it. The page therefore sends this message and the
 * broker runs the `fetch` (`A200`).
 *
 * What this module owns, and nothing else:
 *
 * - **the message name** (`SYNC_FETCH_MESSAGE`), so the page's transport and the
 *   broker's listener cannot drift apart by spelling it twice — the same reason
 *   `src/core/page-notes-query.ts` owns its two message names;
 * - **the request shape** (`SyncFetchRequest`): the URL, the method, the headers and the
 *   body, exactly as core built them. The broker builds no URL (`A201`): the address
 *   still comes from `settings:v1` through `syncTargetOf`, the routes from
 *   `notesPageUrl` / `noteDeleteUrl`, and this module only carries them across;
 * - **the answer shape** (`SyncFetchAnswer`): `{ ok, status, body }`, where `body` is the
 *   parsed JSON or `null` when the body is not readable. A failure is an **answer**
 *   (`A202`), never a rejection: a thrown `fetch` is answered as
 *   `{ ok: false, status: 0, body: null }`, so the page's transport has one failure
 *   vocabulary and the `A164` `network` code keeps its meaning.
 *
 * Purity: no DOM, no `chrome.*`, no `fetch`, no clock, no Russian string. The name and
 * the two shapes are the whole contract, and they are pure data — which is why the
 * broker imports them instead of declaring a second copy beside it.
 */

/**
 * The `chrome.runtime` message the page sends to the background broker.
 *
 * A constant, not a literal at each call site: the page's transport and the broker's
 * listener are separate bundles of an MV3 extension, and nothing but this module can
 * keep the two spellings equal.
 */
export const SYNC_FETCH_MESSAGE = 'inlinenotes:sync-fetch';

/** The request the page hands the broker: exactly what core built, nothing rebuilt. */
export interface SyncFetchRequest {
  /** The address core read from settings and completed with a core route (`A201`). */
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  /** The JSON body; the empty string on a `GET`, which the server ignores. */
  readonly body: string;
}

/**
 * The broker's answer: the status, the `ok` flag and the parsed body.
 *
 * `body` is `null` when the response body is not readable JSON, and `status` is `0` on a
 * request that never reached the server (`A202`). The page's transport turns the pair
 * into the `{ ok, status, json }` shape `SyncTransport` already declares, so the core
 * client's failure codes are unchanged by the move to the broker.
 */
export interface SyncFetchAnswer {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

/** The message the page sends: the type name plus the request, in one object. */
export interface SyncFetchMessage {
  readonly type: typeof SYNC_FETCH_MESSAGE;
  readonly request: SyncFetchRequest;
}

/** The failure answer of a request that never reached the server (`A202`). */
export const SYNC_FETCH_FAILURE_ANSWER: SyncFetchAnswer = {
  ok: false,
  status: 0,
  body: null,
};

/**
 * The request of a message, `null` when the message is not the broker's.
 *
 * The check is deliberately narrow: the type name must match, and the request must carry
 * a string `url`, a string `method` and a string `body`. A message that only looks like
 * ours — a page script's guess, a future version's message — is refused here rather than
 * handed to `fetch`, so the broker never runs a request nobody built in core.
 */
export function syncFetchRequestOf(message: unknown): SyncFetchRequest | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const record = message as Record<string, unknown>;
  if (record['type'] !== SYNC_FETCH_MESSAGE) {
    return null;
  }
  const request: unknown = record['request'];
  if (typeof request !== 'object' || request === null) {
    return null;
  }
  const fields = request as Record<string, unknown>;
  const url: unknown = fields['url'];
  const method: unknown = fields['method'];
  const body: unknown = fields['body'];
  const headers: unknown = fields['headers'];
  if (typeof url !== 'string' || typeof method !== 'string' || typeof body !== 'string') {
    return null;
  }
  if (typeof headers !== 'object' || headers === null) {
    return null;
  }
  return {
    url,
    method,
    headers: headers as Record<string, string>,
    body,
  };
}
