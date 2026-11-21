/**
 * The one network call of the extension: `fetch`, bound to nothing else.
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "One address,
 * read from settings" and "No other network". Rulings `A165`, `A166`.
 *
 * Why this file exists at all, and why it is five lines: the shipped source is
 * scanned for network APIs (`tests/toolchain-contract.spec.ts`), and the scan is only
 * honest if the one place that names `fetch` is a file a reviewer can read in one
 * look. Both halves of the extension go through this factory — the page for its
 * automatic load, the popup for its press — so "the extension makes no request except
 * to the address in settings" is a property of one function rather than of a search.
 *
 * Nothing here builds a URL: the address arrives already parsed and validated by core
 * `syncTargetOf`, which is the only reader of `settings:v1` (`A165`). Nothing here
 * retries, times out, logs or reports: a failed call is a code the caller answers with
 * (`A164`), and `fetch` has no timeout of its own beyond the browser's.
 *
 * `Content-Type: application/json` is set on both verbs because the server validates
 * a body on `POST` and ignores it on `GET`; one header for both verbs is one fewer
 * difference between the two calls.
 */

import type { SyncTransport } from '../../core/sync-client';

/** The live transport: the page's `fetch`, with the one header the server reads. */
export function createSyncTransport(): SyncTransport {
  return async (url, init) =>
    await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.method === 'GET' ? {} : { body: init.body }),
    });
}
