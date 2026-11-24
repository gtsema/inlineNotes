# t23-02 — engineer report: the page's sync transport is a message to the broker

Task: `docs/state/stage-23-background-broker.md` -> "t23-02 brief (content swap)".
Rulings: `A200`-`A202` of `docs/specs/sync-integration.md` -> "Where the page's network lives".
Commit: one, `t23-02: send the page's sync calls through the broker (A200-A202)`.

## What changed

### 1. `src/content/sync/fetch-transport.ts` -> `src/content/sync/broker-transport.ts` (renamed + reimplemented)

The factory name is unchanged (`createSyncTransport`), so the wiring in `src/content/main.ts`
moved by one import specifier and nothing else.

- Sends `chrome.runtime.sendMessage({ type: SYNC_FETCH_MESSAGE, request: { url, method, headers, body } })`.
  The four request fields are exactly the four core handed the old `fetch`; this module builds no
  URL, names no scheme, no host and no route.
- Reads the broker's `{ ok, status, body }` and answers the caller's `SyncTransport` shape
  `{ ok, status, json: async () => body }`. `json()` resolves the already parsed body, so a body
  the broker could not read (`body: null`, `A202`) reaches core as a body it cannot read
  (`response_invalid`) instead of as a second failure path.
- **Delivery failure is a rejection**, in both shapes Chrome offers:
  - a `sendMessage` that rejects (no receiving end) is rethrown;
  - a `sendMessage` that resolves `undefined` with `chrome.runtime.lastError` set (closed port) is
    thrown from the `lastError` message;
  - an answer that is not the broker's shape is thrown rather than guessed at (a `{ ok: true }`
    invented for a call that never happened would be a lie to `A164`).
  Core `send` catches all three and answers its existing `network` code, so the automatic load,
  the popup notice and the button's three states are byte-for-byte the behaviour their existing
  tests already pin. No timer, no retry, no logging, no state: one function, one call.
- Module doc block rewritten to state the mixed-content cause and the two properties it keeps
  (no URL built, delivery failure = rejection). No Russian characters remain in the file (the
  content-layer "one string module" pin).

### 2. `src/content/main.ts`

One import specifier: `'./sync/fetch-transport'` -> `'./sync/broker-transport'`. The transport is
still created by the content script and still handed to `attachSyncNotes` and the editor; the URL
is still built in core from `settings:v1` (`syncTargetOf` + `notesPageUrl` / `noteDeleteUrl`).

### 3. `tests/content-broker-transport.spec.ts` (new, 11 cases)

Three groups, exactly as the brief asks:

- **a delivered message answers the request** (`A201`): one message under `SYNC_FETCH_MESSAGE`
  carrying `url`/`method`/`headers`/`body` verbatim; the answer in `{ ok, status, json }` shape;
  a non-2xx status and a `body: null` carried as they are; a second call sends the second
  request (no state).
- **an undelivered message rejects** (`A202`): a rejecting `sendMessage`; an `undefined` answer
  with `lastError` set; four non-answers (`undefined`, `null`, `'ok'`, `{ ok: true }`,
  `{ status: 200 }`).
- **the seam** (shipped-text pins over the module, comments stripped): names no network API
  (`fetch`/`XHR`/`WebSocket`/`EventSource`/`sendBeacon`), builds no URL (no scheme, no
  `notes/page`, no host), imports the core message module rather than respelling the name, starts
  no timer (`setTimeout`/`setInterval`/`rAF`) and no retry loop, logs nothing, keeps no module
  state.

`chrome.runtime` is stubbed per case with `vi.stubGlobal`, so the module keeps naming the real
API and the suite needs no `chrome` package, no jsdom, no new dependency.

### 4. `tests/toolchain-contract.spec.ts`

- The network-shape module set is now exactly
  `['src/all-notes/fetch-transport.ts', 'src/background/service-worker.ts', 'src/popup/sync-transport.ts']`
  — three files, as AC 17 and the "One address, and no other network" bullet say.
- `NETWORK_TRANSPORT` (which pointed at the retired content `fetch` adapter) is replaced by
  `CONTENT_TRANSPORT = 'src/content/sync/broker-transport.ts'`, and the "no URL of its own" case
  is **re-aimed, not dropped**: the content transport carries the request core built and still
  builds no address, the background broker (`src/background/sync-broker.ts`) builds none either
  (`A201`), the popup adapter is unchanged, core still names no network API and core still imports
  no transport.
- New in the same case: the content transport names `SYNC_FETCH_MESSAGE` in code (so the message
  is spelled once, in core), and the three pinned paths are read out of
  `docs/specs/sync-integration.md`, which makes the prose and the mechanical list fail together
  if either drifts.
- `LEGACY_CODE_ONLY_COPIES` gains `tests/content-broker-transport.spec.ts` — the new suite keeps
  a local stripper (the two contract suites are the only files allowed to import the shared
  helper), so the "cannot grow" set must name it.

### 5. Two pins the rename forced (both mechanical drift, no behaviour)

- `tests/content-throw-boundaries.spec.ts`: every `catch` under `src/content/` is enumerated
  (t3-05 AC3). The new transport carries one `try` around `sendMessage`, so the pinned set gains
  `'sync/broker-transport.ts': 1` and the total moves 20 -> 21, with the reason written in the
  row comment.
- `docs/specs/content-overlay-ui.md` -> "Page-boundary throws" -> the `catch` table gains the
  matching row (`sync/broker-transport.ts` `deliver`, Stage 23 `t23-02`, `A200`-`A202`): the
  rejection is the contract, and the row says it is *named* (the three delivery-failure shapes are
  driven by `tests/content-broker-transport.spec.ts`).

## Conflicts, deviations, open questions

1. **No spec-prose conflict.** `sync-integration.md` already names
   `src/content/sync/broker-transport.ts` in `A200` and already lists the three-module network
   set in AC 17 / "One address, and no other network", and the test map already names
   `tests/content-broker-transport.spec.ts`. Code now matches the spec; the PM owes no edit.
2. **One spec file outside `sync-integration.md` was edited** (`content-overlay-ui.md`, the
   `catch` enumeration), because that document *owns* the enumeration and its own test
   (`tests/content-throw-boundaries.spec.ts`) refuses a code base whose `catch` sites are not
   listed there. This is the "spec and code in the same commit" rule, not a prose change to the
   broker rules. Flagged for the reviewer as the only spec edit in this commit.
3. **`lastError` handling is a `catch`-free `if`**, and the one `try` is only around the send.
   The module does catch nothing else: a non-delivered message and an unreadable answer both
   leave through the same rejection.
4. **`answerOf` accepts any `{ ok: boolean, status: number, body }`** and passes `body` through
   untouched. It does not validate the body: core's decoders (`savedCountOf`, `remoteNotesOf`,
   `deletedCountOf`) already answer `response_invalid` for a body they cannot read, which is
   where that rule lives (`src/core/` owns rules).
5. **Two dirty-worktree items are not mine** and are left untouched: `META-INSTRUCTION-compact.md`
   is recorded as deleted in the index/worktree by an earlier session (not staged or committed by
   this task), and `git status` therefore is not clean before my commit. Reported so the reviewer
   does not read it as part of my diff.
6. **Manual `chrome://extensions` load not performed**: no browser is available in this session.
   The build artifact proves the wiring (`dist/content.js` contains `inlinenotes:sync-fetch` and
   zero `fetch(`, `dist/service-worker.js` contains the `fetch(` and the listener,
   `dist/manifest.json` resolves `service-worker.js`). Field verification of the actual Mixed
   Content fix on an `https://` article with an `http://` server is the reader's / PM's step.

## Files

| Path | Change |
|---|---|
| `src/content/sync/fetch-transport.ts` | deleted (renamed) |
| `src/content/sync/broker-transport.ts` | new: `createSyncTransport` as a broker message; delivery failure rejects |
| `src/content/main.ts` | import specifier only |
| `tests/content-broker-transport.spec.ts` | new, 11 cases |
| `tests/toolchain-contract.spec.ts` | the three-module network set, `CONTENT_TRANSPORT` re-aim, `SYNC_FETCH_MESSAGE` + spec-path pins, private-copy list |
| `tests/content-throw-boundaries.spec.ts` | pinned `catch` set + total 21 |
| `docs/specs/content-overlay-ui.md` | one row in the `catch` enumeration |

## Commands run (in the briefed order)

| # | Command | Result |
|---|---|---|
| 1 | `npm run build` | **pass** — `dist/service-worker.js` (2043 B) built; `manifest references resolved: content.js, popup/index.html, options/index.html, service-worker.js, icons/icon-128.png` |
| 2 | `npm test` | **pass** — 67 files, **1403 tests** (t23-01's 1392 + the 11 new ones), 0 failed |
| 3 | `npm run typecheck` | **pass** — content, app, background and spec programs all clean |
| 4 | `node scripts/check-agent-config.mjs` | **pass** — `0 error(s), 0 warning(s), 253 info(s)` |

Supporting evidence:

- `grep -c "fetch(" dist/content.js` -> `0`; `grep -c "inlinenotes:sync-fetch" dist/content.js` -> present;
  `grep "fetch(" dist/service-worker.js` -> present, with the `onMessage` listener.
- Mutation checks (each reverted immediately, working tree restored):
  - deleting the `lastError` branch of `deliver` -> `tests/content-broker-transport.spec.ts`
    fails on the closed-port case (the pin bites);
  - putting `fetch(message)` back into `deliver` -> `tests/toolchain-contract.spec.ts` fails with
    `src/content/sync/broker-transport.ts` in the offenders list (the re-aimed set bites).

## AC self-check (sync-integration.md, the criteria this task owns)

| AC | Status | Evidence |
|---|---|---|
| 25 (`A200`) the content script names no network API; transport sends `chrome.runtime.sendMessage` to the broker; automatic load and one-note delete unaffected; popup and all-notes unchanged | **done** | `src/content/sync/broker-transport.ts` (no `fetch`/XHR/WS; one `sendMessage`); `tests/content-broker-transport.spec.ts` "names no network API at all"; `dist/content.js` has zero `fetch(`; the popup/all-notes adapters untouched; their suites still green |
| 26 (`A202`) an undelivered message answers the same `network` code; broker answers `{ ok, status, body }`, builds no URL, keeps no state; no timer anywhere | **done** | the three rejection cases in the new suite; core `send`'s unchanged `network` code (`tests/core-sync-client.spec.ts` still green); broker URL/state pins in `toolchain-contract` "no transport holds a URL of its own"; `setTimeout`/`setInterval` absent from the new module (pinned) |
| 17 (`A200` network set) `fetch` appears in exactly three modules | **done** | `tests/toolchain-contract.spec.ts` offenders `['src/all-notes/fetch-transport.ts', 'src/background/service-worker.ts', 'src/popup/sync-transport.ts']` |
| 18 gates green, test count only grows | **done** | 1392 -> 1403 tests; all four gates quoted above |
| 12 / 16 (automatic load, one-note delete behaviour unchanged; only the seam name changes) | **done** | `tests/content-sync-notes.spec.ts`, `tests/content-foreign-notes.spec.ts`, `tests/content-editor-controller.spec.ts` all green with no edit |

## Open questions for the PM

1. Should a manual `chrome://extensions` load of this `dist/` be recorded as `t23-02` acceptance
   evidence, or does the reader's own retry of the article count as the field proof? Nothing in
   the repo changes either way.
2. `META-INSTRUCTION-compact.md` is deleted-but-unstaged in the worktree from an earlier session
   (repo root, irrelevant to this task). It was left alone; someone should decide whether to
   restore or commit that deletion outside this task.