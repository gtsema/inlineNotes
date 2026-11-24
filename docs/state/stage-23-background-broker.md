# Stage 23 — the page's network behind a background broker (A200–A202)

Opened 2026-11-24 from the reader's console error on `https://youtrack.medlinx.online/...`:

```
Mixed Content: The page at 'https://…' was loaded over HTTPS, but requested an insecure
resource 'http://10.10.80.36:8087/notes/page/https%3A%2F%2F…'. This content should also
be served over HTTPS.
```

## Root cause

A fetch started by the content script is a subresource request of the **article's page**;
Chrome refuses an insecure one on an HTTPS article, whatever `host_permissions` says. So
the automatic load (and the editor's one-note delete) never reached the server on HTTPS
articles, while the popup's press and the «Мои заметки» delete were fine — an extension
page's document is not the article's. The user chose option 2: move the page's calls to an
MV3 background service worker.

## Spec edits (PM, done)

`docs/specs/sync-integration.md`: new section "Where the page's network lives (rulings
`A200`-`A202`)", the `background broker` term, Scope, the rewritten "One address, and no
other network" bullets, AC 17 amended, AC 25/26 added, test mapping.
`docs/specs/INDEX.md` (sync-integration row names `src/background/`), `AGENTS.md` (the
Expected Repository Structure gains `src/background/`).

## Plan (≤3 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t23-01` | the broker: core message shape, `src/background/`, manifest key, build step, broker tests | `extension-engineer` |
| `t23-02` | the content transport swap (`fetch` → message) and the pins it moves | `extension-engineer` |
| `t23-03` | review of both diffs against AC 25/26 and AC 17 | `code-reviewer` |

Delegation counter: t23-01 = 0, t23-02 = 0. Ceiling = 2 attempts each.

## t23-01 brief (broker)

**Task.** Add the MV3 background broker and the extension-internal message it serves.

**Input paths.** `docs/specs/sync-integration.md` -> "Where the page's network lives";
`src/content/sync/fetch-transport.ts` (the shape the broker replaces);
`src/core/sync-client.ts` (`SyncTransport`); `src/manifest.json`;
`scripts/build-extension.mjs` (`buildContentBundle`, `verifyManifestReferences`);
`tests/toolchain-contract.spec.ts` (the network-shape pin, the manifest pin, the build
script's top-level function-name pin and its liftable list).

**Output paths.**
- `src/core/sync-broker-message.ts` (new, pure): `SYNC_FETCH_MESSAGE` and the request /
  answer types `{ url, method, headers, body }` -> `{ ok, status, body }`;
- `src/background/sync-broker.ts` (new, testable): `createSyncFetchListener(fetchImpl)`
  returning a `chrome.runtime.onMessage`-shaped listener; unknown messages are ignored;
- `src/background/service-worker.ts` (new, the build entry): registers the listener with
  `fetch` — it must literally name `fetch(` so the network-shape pin sees it;
- `src/manifest.json`: `"background": { "service_worker": "service-worker.js" }`, no
  `"type": "module"` (the bundle is an IIFE);
- `scripts/build-extension.mjs`: a new bundle function for `src/background/service-worker.ts`
  -> `dist/service-worker.js` (esbuild, iife, browser, no jsx/preact);
- `tests/background-sync-broker.spec.ts` (new) and the pins that move.

**Rules.** `A201`: the broker builds no URL and keeps no state — it runs `fetch` with the
request it is handed. `A202`: a transport failure is answered, not thrown; the answer is
`{ ok, status, body }` with `body` the parsed JSON or `null`. The listener returns
`undefined` for a message that is not `SYNC_FETCH_MESSAGE`.

**Acceptance.** The broker answers the given request with the fake `fetch`'s `{ ok, status,
body }`; a thrown fetch is answered with a failure shape rather than rejecting; an unknown
message is ignored; `npm run build` produces `dist/service-worker.js` and
`verifyManifestReferences` resolves it; `fetch` appears in `src/background/service-worker.ts`
and in the two extension-page transports, and in no other `src/` module; the build script's
top-level-function pin names the new function; gates green.

## t23-02 brief (content swap)

**Task.** Make the content script's transport a message to the broker.

**Output paths.** `src/content/sync/fetch-transport.ts` -> `src/content/sync/broker-transport.ts`
(same `createSyncTransport` factory name if that keeps the wiring untouched, otherwise
update `src/content/main.ts`), plus the tests and pins.

**Rules.** The transport sends `chrome.runtime.sendMessage` with the request core built and
returns `{ ok, status, json }`; a non-delivered message (`lastError`, closed port) is a
throw, exactly as a rejected `fetch` was. No timer, no retry, no logging. `src/content/`
still builds the URL through core.

**Acceptance.** `tests/content-broker-transport.spec.ts`: a message answers the request; an
undelivered message throws; the module names no network API. The automatic load and the
one-note delete behave exactly as their existing tests say (no test rewrite beyond the
transport seam). The network-shape pin lists `src/background/service-worker.ts`,
`src/popup/sync-transport.ts`, `src/all-notes/fetch-transport.ts`; the "transport holds no
URL" pin moves to the new content module. Gates green; one commit.
