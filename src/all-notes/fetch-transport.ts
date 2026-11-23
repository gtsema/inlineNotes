/**
 * The «Мои заметки» page's `fetch`, and the only network call this layer makes
 * (`A192` of `all-notes-page.md`).
 *
 * The third copy of the five-line adapter, by the same reason the second shipped:
 * the popup, the options dialog and this page are separate bundles, and the shape
 * they return is the shared `SyncTransport` of `src/core/sync-client.ts`. No retry,
 * no timeout of its own, no logging: a failure is a code the caller shows.
 */

import type { SyncTransport } from '../core/sync-client';

/** The page's transport: `fetch`, with the one header the server reads. */
export function createAllNotesSyncTransport(): SyncTransport {
  return async (url, init) =>
    await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.method === 'GET' ? {} : { body: init.body }),
    });
}
