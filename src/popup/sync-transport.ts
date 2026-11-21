/**
 * The popup's `fetch`, and the only network call this layer makes (Stage 17).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "One address,
 * read from settings". The address arrives from core `syncTargetOf` and this module
 * builds none, exactly like the content script's transport — the two are separate files
 * because the popup and the page are separate bundles (an MV3 popup cannot import the
 * content script), and the shape they return is the shared `SyncTransport` of
 * `src/core/sync-client.ts`, so the mapping, the failure codes and the tests are one
 * set for both halves.
 *
 * No retry, no timeout of its own, no logging: a failure is a code the caller shows.
 */

import type { SyncTransport } from '../core/sync-client';

/** The popup's transport: `fetch`, with the one header the server reads. */
export function createPopupSyncTransport(): SyncTransport {
  return async (url, init) =>
    await fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.method === 'GET' ? {} : { body: init.body }),
    });
}
