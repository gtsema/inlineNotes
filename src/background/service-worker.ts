/**
 * The MV3 service worker entry point: the background broker's wiring (Stage 23,
 * rulings `A200`-`A202`).
 *
 * Declared as `background.service_worker` in `src/manifest.json`, bundled as an IIFE by
 * `scripts/build-extension.mjs` into `dist/service-worker.js` (so the manifest carries no
 * `"type": "module"`).
 *
 * This file owns exactly two things and no rule:
 *
 * - the registration — `chrome.runtime.onMessage.addListener` with the listener
 *   `src/background/sync-broker.ts` builds;
 * - the one `fetch` the worker runs. It is named literally here, and that is the point:
 *   `tests/toolchain-contract.spec.ts` scans the shipped source for network APIs and pins
 *   the set of modules that name one, so the worker's network surface is this file and
 *   nowhere else in `src/background/`.
 *
 * The worker keeps no state and starts no timer: it is started on demand by the message
 * and answers the request it is handed (`A201`). It builds no URL either — the request
 * arrives complete from the page, whose core built it from `settings:v1`.
 */

import { createSyncFetchListener } from './sync-broker';

chrome.runtime.onMessage.addListener(
  createSyncFetchListener(
    async (url, init) =>
      await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
      }),
  ),
);
