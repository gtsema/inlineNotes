**Review artifact — `docs/state/t23-03-review.md`** (contract: `docs/specs/code-review-flow.md` → Rules / Semantics; format §5–6)

# t23-03 — review of Stage 23 (the background broker), `42520a3` + `46a18b4` + docs `cfd66d6`, `3910622`

Range reviewed: `7ab76ce..3910622` (18 files, +1314/−66). Spec: `docs/specs/sync-integration.md` → "Where the page's network lives (rulings `A200`-`A202`)", "One address, and no other network", AC 17, AC 25, AC 26, test mapping. Reports: `docs/state/t23-01-engineer.md`, `docs/state/t23-02-engineer.md`. Stage brief: `docs/state/stage-23-background-broker.md`.

**Carried-fix checklist: none.** The t23-01 and t23-02 briefs in the stage file contain no `Carried-fix checklist`, and no earlier review of Stage 23 exists, so there is no number to answer.

## Verdict

**accepted**

## Acceptance criteria, one line each

1. **AC 25** — `pass`. AC 25: "the content script names no network API: its sync transport sends `chrome.runtime.sendMessage` to the background broker, so the automatic load and the one-note delete work on an `https://` article with an `http://` server address; the popup's press and the «Мои заметки» delete are unchanged." `src/content/sync/broker-transport.ts:80-84` builds `{ type: SYNC_FETCH_MESSAGE, request: { url, method, headers, body } }` and sends it at `:103`; the module names no `fetch`/XHR/WS (`tests/content-broker-transport.spec.ts:185-203`), `dist/content.js` carries the message name and zero `fetch(`. Both page call sites still reach the single transport: `src/content/main.ts:119` (`transport` → `attachSyncNotes`, the automatic load) and `:150` (`transport` → `createEditorController`, the editor's one-note delete); the URL still comes from core in both paths (`src/core/sync-client.ts:275`, `:295`, `:437`). The mixed-content class is closed by construction: the request is no longer a subresource request of the article's document. `src/popup/sync-transport.ts` and `src/all-notes/fetch-transport.ts` are untouched in the diff. The field proof on a live `https://` article is not in the range — the engineer says so at `t23-02-engineer.md` → "Conflicts, deviations" 6; that is a reader/PM step the brief does not order, so it is not a finding.
2. **AC 26 / A202** — `pass`. AC 26: "A message that cannot be delivered answers the same `network` code a rejected `fetch` produced; the broker answers `{ ok, status, body }`, builds no URL and keeps no state; no timer is added anywhere." Three delivery-failure shapes reject in `broker-transport.ts:98-110` (rejected `sendMessage` at `:102`, `lastError` at `:104-106`, non-shape answer at `:108-110`), each driven by a case in `tests/content-broker-transport.spec.ts:138-176`, and core `send`'s unchanged `catch` maps them to `network` (`src/core/sync-client.ts:477-480`). The broker answers `{ ok, status, body }` (`src/background/sync-broker.ts:100-119`), answers a thrown `fetch` with `SYNC_FETCH_FAILURE_ANSWER` instead of rejecting (`:107-110`), builds no URL, holds no module binding, and starts no timer (`tests/background-sync-broker.spec.ts:228-238`).
3. **AC 17** — `pass`. AC 17: "`manifest.json` declares `host_permissions: ["http://*/*", "https://*/*"]` and `background.service_worker`; `fetch` appears in exactly three modules — the broker, the popup transport and the «Мои заметки» transport." An independent scan `grep -rnE '\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon' src/` returns exactly `src/all-notes/fetch-transport.ts:16`, `src/background/service-worker.ts:28`, `src/popup/sync-transport.ts:20`. `src/manifest.json:29-31` declares `"background": { "service_worker": "service-worker.js" }` with no `type: module`; `scripts/build-extension.mjs:168-170` adds that reference to `verifyManifestReferences`, and the built `dist/service-worker.js` exists (2043 B) and resolved in the build log.
4. **A201** — `pass`. A201: "The broker builds no URL… the message carries the request (`url`, `method`, headers, body) and the broker runs `fetch` with exactly it." `src/background/sync-broker.ts` and `src/background/service-worker.ts` name no scheme, host or route; `notes/page`, `localhost` and `127.0.0.1` are absent from both, and the URL is simply forwarded at `service-worker.ts:26-33`. The address and the routes remain core's (`src/core/sync-client.ts:275`, `:295`, `:318`) and the page reads them through `syncTargetOf` (`src/content/sync/sync-notes.ts:155`, `:249`, `:253`). Both halves of the rule are pinned mechanically at `tests/toolchain-contract.spec.ts:1694-1703`.
5. **No behavior regression** — `pass`. The existing load/adoption/delete/popup suites are unedited in the range and green: `tests/content-sync-notes.spec.ts`, `tests/content-foreign-notes.spec.ts`, `tests/content-editor-controller.spec.ts`, `tests/popup-sync-button.spec.ts`, `tests/core-sync-client.spec.ts`; `git show --stat` names none of them. The only edits outside the new files are the seam (`main.ts:58`) and the pins the rename forced (`toolchain-contract.spec.ts`, `content-throw-boundaries.spec.ts`, total 20 → 21). No new dependency (`package.json` changes only the `typecheck` script line; `dependencies`/`devDependencies` untouched). Spec and code agree: `sync-integration.md:178` names `src/content/sync/broker-transport.ts`, `:281` names `tests/background-sync-broker.spec.ts` (corrected in `cfd66d6`), and `tests/toolchain-contract.spec.ts:1682-1685` reads those paths out of the spec so drift fails the suite.
6. **Gates re-run and quoted** — `pass` (see below).

## Gates (re-run by the reviewer, from the repo root)

| # | Command | Result |
|---|---|---|
| 1 | `npm run build` | **pass** — `[build] built dist/service-worker.js with esbuild`; `manifest references resolved: content.js, popup/index.html, options/index.html, service-worker.js, icons/icon-128.png, icons/icon-128.png`; `dist/service-worker.js (2043 bytes)`; `dist/ is a self-contained MV3 folder (17 files)` |
| 2 | `npm test` | **pass** — `Test Files 67 passed (67)`, `Tests 1403 passed (1403)`, `Duration 7.43s` |
| 3 | `npm run typecheck` | **pass** — `tsc -p tsconfig.content.json … && tsc -p tsconfig.app.json … && tsc -p tsconfig.background.json … && tsc -p tsconfig.spec.json …`, no diagnostics printed |
| 4 | `node scripts/check-agent-config.mjs` | **pass** — `0 error(s), 0 warning(s), 253 info(s)` |

Both engineer reports quote all four gates (`t23-01-engineer.md` → "Commands run", `t23-02-engineer.md` → "Commands run"), and the re-run matches their counts (1392 → 1403 tests, 250 → 253 infos).

## Findings

**Blocking findings: none.**

Non-blocking remarks:

1. `tsconfig.background.json:12` — `src/background/sync-broker.ts` is typechecked only by the `background` program (a `files` entry plus `src/background/**/*.ts`), and `tsconfig.spec.json:9` includes only `tests/**/*.ts` and `src/core/**/*.ts`. So the broker module's type identity under `vitest` comes from esbuild transpilation, not `tsc`. Nothing is wrong today (`npm run typecheck` is clean and the suite is green), but a type error inside `sync-broker.ts` is caught by gate 3 alone. Non-blocking style/wiring remark, not a spec line.
2. `src/manifest.json:30` — `background.service_worker` is declared without `"type"` and the bundle is an IIFE, which is consistent as shipped; if a later change makes the worker an ESM bundle, the manifest key must gain `"type": "module"` in the same commit. Recorded only, nothing to fix now.
3. Process remark (no action): `42520a3` is the t23-01 behavior commit and `cfd66d6` carries the spec test-map correction; the task-as-a-whole rule of `code-review-flow.md` → Rules (`A69` exception) is satisfied because both commits are inside the reviewed range, and the spec sentence that `t23-01` deviated from (the four-module network set) was transiently wider than AC 17 only until `46a18b4` closed it — as the engineer flagged at `t23-01-engineer.md` → "Open questions" 1. No spec/code conflict survives at HEAD.

## Conflict check

No spec-vs-code conflict. `sync-integration.md` at HEAD matches the shipped file list on every point the six items cover: three `fetch` modules, the broker entry, `broker-transport.ts`, the test names, `background.service_worker`, and no URL built outside core.

## Boundary checks

- Host-page DOM not mutated for painting: the range touches no `src/content/overlay`, `paint`, or host-mounting module; the one content change is an import specifier (`src/content/main.ts:58`).
- No network call outside the three AC 17 modules (independent scan, item 3).
- No new runtime dependency (`package.json`, `dependencies`/`devDependencies` unchanged).
- Russian strings: `broker-transport.ts` and `sync-broker-message.ts` carry none; the new suites assert it.
- Harness (`docs/specs/`, `scripts/`) touched by `cfd66d6` only as a spec-prose correction and by `tests/` pins; `check-agent-config.mjs` re-run above: 0 errors.
- No file was modified by this review; every command run was read-only (`git log/show/diff/status`, `grep`, and the four gates, of which `npm test`, `npm run build`, `npm run typecheck` are the briefed gate re-runs).