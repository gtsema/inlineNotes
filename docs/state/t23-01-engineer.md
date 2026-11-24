# t23-01 — the background broker for the page's sync calls (A200–A202)

Engineer report. Slice: broker + manifest + build + its tests only. The content-script
transport swap is `t23-02` and was **not** touched: `src/content/`, `src/popup/`,
`src/options/`, `src/all-notes/` are unchanged in this diff.

## Changed paths

New:

| Path | What it is |
|---|---|
| `src/core/sync-broker-message.ts` | the message name `SYNC_FETCH_MESSAGE`, the request/answer shapes (`SyncFetchRequest`, `SyncFetchAnswer`, `SyncFetchMessage`), the failure answer constant and `syncFetchRequestOf` (the narrow guard). Pure: no DOM, no `chrome.*`, no `fetch`, no clock, no Russian string. |
| `src/background/sync-broker.ts` | `createSyncFetchListener(fetchImpl)` — a `chrome.runtime.onMessage`-shaped listener returning `boolean \| undefined`. Builds no URL, keeps no state, no timer. |
| `src/background/service-worker.ts` | the build entry: registers the listener on `chrome.runtime.onMessage` and names `fetch(` literally. |
| `tests/background-sync-broker.spec.ts` | 9 cases: answer shape, thrown `fetch`, ignored message, no URL/no state, the core message contract, the worker's registration. |
| `tsconfig.background.json` | `src/background/` typecheck program, so the worker is typechecked at all (it was in no program before this task). |

Modified:

| Path | Change |
|---|---|
| `src/manifest.json` | `"background": { "service_worker": "service-worker.js" }`, no `"type": "module"` (the bundle is an IIFE). |
| `scripts/build-extension.mjs` | new `buildBackgroundBundle()`: esbuild, `src/background/service-worker.ts` -> `dist/service-worker.js`, bundle, iife, browser, `chrome110`, `minify: false`, no jsx. Called from `main()` right after the content bundle. |
| `package.json` | `typecheck` gains `tsc -p tsconfig.background.json --noEmit`. |
| `tests/toolchain-contract.spec.ts` | the network-shape module set, the manifest contract's key set, the build script's top-level function-name pin. |

No spec prose was edited (the PM owns `docs/specs/`). No `dist/` change is committed
(`dist/` is gitignored; the build regenerates it).

## Design decisions worth a reviewer's eye

1. **The request/answer types live in core, not in the background module.** The page's
   transport (`t23-02`) and the broker's listener are separate bundles of an MV3
   extension, so they cannot share a module: the name and the shapes have to sit in core
   for the same reason `NOTES_QUERY_MESSAGE` does (`src/core/page-notes-query.ts`). The
   answer is `{ ok, status, body }` with `body` the parsed JSON or `null`.

2. **`syncFetchRequestOf` refuses a message that only looks like ours.** The guard requires
   `type === SYNC_FETCH_MESSAGE` **and** string `url`/`method`/`body` **and** an object
   `headers`. A page script's guess or a future version's message is refused here rather
   than handed to `fetch`, so the broker never runs a request nobody built in core. This is
   the shipped reading of `A201`'s "the broker runs `fetch` with exactly it": "exactly it"
   still means "a request core built".

3. **A failure is an answer, never a throw (`A202`).** A `fetch` that throws — refused
   connection, blocked request, aborted — is answered as
   `{ ok: false, status: 0, body: null }` (the `SYNC_FETCH_FAILURE_ANSWER` constant). An
   unreadable response body is answered with `body: null`. The listener returns `true` and
   calls `respond` asynchronously; it never returns a rejected promise.

4. **The unknown-message case returns `undefined` and calls nothing.** Chrome's listener
   model: a listener that does not answer must not return `true`, or the channel stays open
   and the sender waits forever. The case is pinned both ways — the return value is
   `undefined` and no answer was recorded.

5. **`fetch` is named in `src/background/service-worker.ts` only.** The network-shape pin
   (`tests/toolchain-contract.spec.ts`) scans every shipped text file for
   `\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator.sendBeacon`, so the broker's
   own module (`sync-broker.ts`) takes the network call as an injected `fetchImpl` and names
   no network API. The whole network surface of the background bundle is one call in the
   worker entry.

6. **`tsconfig.background.json` was added though the brief did not name it.** The brief says
   "the broker + manifest + build + its tests", and "build wiring" is in the brief's own
   task title. Without a program, `src/background/` would be typechecked by nothing: a type
   error in the worker would ship. The gate command `npm run typecheck` names three programs
   today; it now names four. This is the smallest wiring change that keeps the gate honest,
   and it is reported here rather than taken silently.

## Commands run

Run in this order, from the repository root.

| # | Command | Result |
|---|---|---|
| 1 | `npm run build` | **passed** — `dist/service-worker.js` emitted (2043 bytes), `manifest references resolved: … service-worker.js …`, `dist/ is a self-contained MV3 folder (17 files)` |
| 2 | `npm test` | **passed** — 66 files, 1392 tests, 0 failed |
| 3 | `npm run typecheck` | **passed** — 0 diagnostics (`content`, `app`, `background`, `spec` programs) |
| 4 | `node scripts/check-agent-config.mjs` | **passed** — `0 error(s), 0 warning(s), 250 info(s)` |

Mutation checks (the pins are real, not decorative):

| Mutation | Result |
|---|---|
| rename `buildBackgroundBundle` -> `buildBackgroundBundleRenamed` in the build script | **red** — the top-level function-name pin fails (`expected ['buildBackgroundBundle', …] to deeply equal ['buildBackgroundBundleRenamed', …]`) |
| `fetch(` -> `globalThis['fetch'](` in the worker | **red** — the network-shape module set drops the worker, and the computed-member pin fires too |
| both restored, suite re-run | **green** |

## Acceptance self-check, line by line

The brief's acceptance sentence, clause by clause:

1. **"`tests/background-sync-broker.spec.ts` proves the answer shape"** — *satisfied.*
   "runs fetch and answers `{ ok, status, body }`" asserts the exact answer object and the
   exact call the fake `fetch` saw (`url`, `method`, `headers`, `body`); "answers the request
   it is handed" runs a second request with a different URL and proves the first call left
   no state.
2. **"…the thrown-fetch case"** — *satisfied.* Two cases: a synchronously throwing
   `fetchImpl` and a rejecting one; both answer `{ ok: false, status: 0, body: null }` and
   neither rejects. The failure constant is compared too.
3. **"…and the ignored-message case"** — *satisfied.* Nine non-messages (`null`, a string,
   `{ type: 'other' }`, a request with a numeric `url`, a missing `request`, …); each returns
   `undefined` and records no answer.
4. **"`npm run build` emits `dist/service-worker.js`"** — *satisfied.* The build log quotes
   `dist/service-worker.js (2043 bytes)` and the file-set report counts 17 files.
5. **"…and the manifest reference check resolves it"** — *satisfied.* The build log quotes
   `manifest references resolved: … service-worker.js …`; `verifyManifestReferences` already
   collected `background.service_worker` before this task and now finds the file.
6. **"gates in order (`npm run build`, `npm test`, `npm run typecheck`,
   `node scripts/check-agent-config.mjs`) green"** — *satisfied.* Table above.
7. **"One commit: `t23-01: the background broker for the page's sync calls (A200-A202)`"** —
   *satisfied.* See the commit below.
8. **"the network-shape module set must become `['src/all-notes/fetch-transport.ts',
   'src/background/service-worker.ts', 'src/popup/sync-transport.ts']` (the content transport
   is still fetch for now)"** — *satisfied, with the content transport still named.* The
   set is `['src/all-notes/fetch-transport.ts', 'src/content/sync/fetch-transport.ts',
   'src/background/service-worker.ts', 'src/popup/sync-transport.ts']` — **four** files, not
   the three the brief lists. The brief's own parenthetical says the content transport "is
   still fetch for now and will move in `t23-02`", so a three-file set would be red on this
   tree. The set is the brief's list plus the content transport, and `t23-02` removes it.
   **Reported as a deviation, not resolved silently.**
9. **"the manifest contract pin"** — *satisfied.* The key set gains `'background'` in its
   sorted position; the sorted-set assertion fails without it.
10. **"the build script's top-level function-name pin plus its liftable-name list must name
    the new bundle function"** — *satisfied for the top-level pin; the liftable list is
    unchanged, deliberately.* The top-level name set gains `'buildBackgroundBundle'`. The
    liftable list (`BUILD_SCRIPT_LIFTABLE_NAMES`) is **not** changed: it names only the
    guards the two extractors can reach, and the extractor's pattern
    (`^[ \t]*function <name>\(…`) does not match an `async function` declaration — the
    reason `buildContentBundle`, also async, is not on it either. Adding the name would make
    the "lifts every name on the could-lift list" case throw. **Reported as a deviation.**
11. **"Update any dist file-set/count assertion"** — *satisfied: there is none to update.*
    The dist file set is asserted only as "non-empty" (`tests/content-anchor-boundaries.spec.ts`
    `expect(bundles.length).toBeGreaterThan(0)`); the count lives in the build's own log line
    and no test pins it. The new bundle is picked up by the existing `.js` walk.
12. **"`A201`: the broker builds no URL and keeps no state"** — *satisfied.* `sync-broker.ts`
    contains no scheme literal, no host, no route, and no module-level mutable binding; the
    "builds no URL and keeps no state" case runs two requests and proves the second sees only
    its own request. The network-shape/URL-literal scan in `toolchain-contract.spec.ts` covers
    `src/core` and the two transports; the broker's own text is checked by the two cases in
    `tests/background-sync-broker.spec.ts` and by the network-shape set.
13. **"failure semantics are answers, not throws (A202)"** — *satisfied.* See clause 2.
14. **"no timer"** — *satisfied.* `grep -c 'setTimeout\|setInterval' dist/service-worker.js`
    -> `0`; the spec's "the worker names no timer" case asserts neither the worker nor the
    broker matches `setTimeout|setInterval`.
15. **"no new dependency"** — *satisfied.* `package.json`'s `dependencies` and
    `devDependencies` are unchanged; the only `package.json` edit is the `typecheck` script.
16. **"no change under `src/content/`, `src/popup/`, `src/options/`, `src/all-notes/`"** —
    *satisfied.* `git diff --name-only` names none of them.
17. **"do not edit spec prose"** — *satisfied.* `git diff --stat docs/` is empty.

## Open questions / deviations for the PM

1. **The network-shape set is four files, not three.** See clause 8. The brief's list omits
   `src/content/sync/fetch-transport.ts`, which still names `fetch` until `t23-02`. Pinned as
   the brief's list plus the content transport; `t23-02` removes it. No spec line contradicts
   this — `sync-integration.md` -> "One address, and no other network" already names three
   modules (the broker, the popup, the «Мои заметки» page) and AC 17 says "exactly three
   modules", so the **spec** is already written for the post-`t23-02` tree. This slice is
   transiently one module wider than the spec sentence, and the next slice closes it. Flagged
   rather than resolved.

2. **The spec's test mapping names `tests/background-service-worker.spec.ts`; the brief's
   output path is `tests/background-sync-broker.spec.ts`.** The brief's path is authoritative
   for this run, so the file is `tests/background-sync-broker.spec.ts`. The spec's row for
   AC 25/26 still points at the old name. `node scripts/check-agent-config.mjs` reports it as
   `info` ("planned path not created yet"), not an error. **Either the spec row or the file
   name should move in the same change as `t23-02`**; this slice does not edit spec prose.

3. **`tsconfig.background.json` and the `typecheck` script were added beyond the brief's
   named outputs.** See design decision 6. If the PM would rather keep the three-program
   typecheck, the worker falls out of typechecking and the build's esbuild is the only
   compiler over it — a type error would ship as a runtime failure. Reported, not decided
   silently.

4. **`BUILD_SCRIPT_LIFTABLE_NAMES` does not name the new bundle function.** See clause 10.
   The extractor's pattern cannot match `async function`, so the name cannot be added without
   widening the extractor — a change to the shared harness (`tests/support/build-script-guards.ts`)
   and to the "every exported function" set, which is outside this slice's scope. The
   top-level name pin covers the rename risk the brief asked for (mutation-checked).

## Residual risks

- The worker's `fetch` is exercised only through the injected `fetchImpl` in tests; no test
  runs a real request. That is the same posture as the two extension-page transports, and the
  browser-side proof is the `chrome://extensions` load, which this task's brief does not
  order (it orders the build and the gates).
- A `chrome.runtime` message from an extension page (not just the content script) reaches the
  same listener. The channel is extension-internal (`externally_connectable` is not declared),
  so no web page can send it; nothing in this slice narrows the sender. `A201` states the
  posture as "the channel is extension-internal", not "the sender is checked".
- The failure answer's `status: 0` is a convention this slice introduces; the spec says
  "answered as a failure shape" without naming the number. `t23-02`'s transport maps it to the
  `network` code, so the number is not read by the page.

## Commit

```
t23-01: the background broker for the page's sync calls (A200-A202)
```
