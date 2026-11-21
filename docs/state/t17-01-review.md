# Review — `t17-01` (Stage 17, the extension talks to the sync server)

Reviewer: `code-reviewer`. Mode: read-only. Range: `git diff 672bdb4..HEAD` (8 commits, 42 files).
Authorities: `docs/state/stage-17-sync-integration.md` (rulings A160–A166, 14 AC), `docs/specs/sync-integration.md`,
`docs/specs/code-review-flow.md`.

## Verdict

**blocked.**

Two blocking findings, both evidence/contract failures rather than code-quality objections:

1. **The engineer report does not exist.** `docs/state/t17-01-engineer.md` is absent from the working tree and from
   every commit (`git log --all -- docs/state/t17-01-engineer.md` → empty; `git ls-files | grep t17` → empty).
   `code-review-flow.md:27` makes the report mandatory and `code-review-flow.md:63` says "a report file that names
   paths that do not exist" is a `blocked` condition; the inverse — a brief that names a report path that does not
   exist — is the same hole. The PM's appended verification covers the gates, but it is not the artifact the flow
   requires, and `docs/specs/sync-integration.md:193` (Test mapping, AC 18) points at "the task's engineer report
   under `docs/state/`" — a dangling pointer in a spec that this task shipped.
2. **Spec-vs-code conflict on the A164 popup notice and on the foreign-row controls.** `docs/specs/sync-integration.md`
   §"A failed load never blocks the page" (line 121), Edge Cases line 150, and AC 16 claim the popup states the failure
   with the non-blocking notice «Не удалось связаться с сервером синхронизации», and §"Hiding and deleting a foreign
   row" (line 113) plus Flow step 6 claim the popup's checkbox and `Удалить` act on foreign rows. The code cannot do
   either. Per `code-review-flow.md:45` a spec-vs-code conflict is `blocked`, never resolved silently.

The code itself is in good shape: the three invariants the brief names as decisive all hold (findings 2–4), the layer
discipline is intact (finding 5), and no test assertion was deleted (finding 9). The defects are (a) one delivered
capability that is wired to nothing, (b) one spec that overstates the code, and (c) a missing report artifact.

## Findings

### 1. AC-by-AC — pass/fail with evidence

The brief's AC list (`stage-17-sync-integration.md` → "Acceptance criteria") is the authority. One line per AC.

| AC | Verdict | Evidence |
|---|---|---|
| 1 — old `{ name }` decodes without loss, `syncEnabled: false`, `serverUrl: ""` | **pass** | `src/core/settings-store.ts:152-183` — `settingsFromStorageValue` returns `...defaults` on every early return and decodes both fields defensively; `tests/core-settings-store.spec.ts` covers the old record. |
| 2 — server URL field + «синхронизация» checkbox, persisted, Russian strings in the options text module | **pass** | `src/options/options.component.ts:109-131` (field + checkbox), `src/options/text.ts:22-27` (`serverLabel`, `serverHint`, `syncLabel`, `syncCheckbox`); `src/options/author-name-service.ts:207-235` writes through core `saveSettings`. |
| 3 — invalid URL refused with a visible message and not saved | **pass** | `src/options/author-name-service.ts:216-221` returns the refusal without calling `saveSettings`; `src/options/options.component.ts:328-332` renders `serverAddressText(code)`; `tests/options-sync-settings.spec.ts` covers it. |
| 4 — button in the current author's row only, absent when sync off or URL empty | **pass** | `src/popup/popup.component.ts:501-503` (`showsSyncButton` = `view().syncEnabled && row.isOwn`); `src/popup/page-entries-service.ts:331` (`syncEnabled = syncTargetOf(settings) !== null`); `tests/popup-sync-button.spec.ts:182-238`. |
| 5 — `POST /notes/page/{page_id}` with only the current author's entries, `author_id` = settings name | **pass** | `src/core/sync-client.ts:201-209` (`syncPayloadOf` filters by `isSameAuthor`), `src/core/sync-client.ts:234-236`; `tests/popup-sync-button.spec.ts:106-180`. |
| 6 — three states, driven by request outcome, not a timer | **pass** | `src/popup/popup.component.ts:559` sets `running`, `:567` sets `idle`/`error` from the result; `syncState` has exactly two writers (`grep syncState.set` → lines 559, 567) and no `setTimeout`; CSS `animation: sync-spin 0.9s linear infinite` (`:411`) is `infinite`, so it cannot stop on its own; `tests/popup-sync-button.spec.ts:280` pins "keeps no timer". |
| 7 — automatic `GET /notes/page/{page_id}` on page open, foreign row shown | **pass** | `src/content/main.ts:207` (`void painter.refresh().then(sync.afterPaint)`), `src/content/sync/sync-notes.ts:98-135`; `tests/content-sync-notes.spec.ts`. |
| 8 — foreign entries never in `chrome.storage.local`, never in a payload | **pass** | `src/content/sync/` contains no storage write (only comments mention `chrome.storage.local`, `foreign-notes.ts:16,121`); `syncPayloadOf` filter excludes them; `tests/content-create-card-boundaries.spec.ts:158-172` pins the settings-write absence. |
| 9 — foreign entries not editable, author colour, tooltip names the author | **pass** | `src/content/overlay/tooltip.tsx:77-97` (`headerStyleOf` inline colour on the header span, own header keeps stylesheet ink); edit gate unchanged; `tests/content-foreign-notes.spec.ts`. |
| 10 — deleting a foreign row removes it locally without calling the server | **fail** | The memory API exists (`src/content/sync/foreign-notes.ts:83-87` `dismiss`) but **no UI calls it**: `grep -rn "\.dismiss(\|setNoteVisible(\|\.authors()" src/` returns only the interface and its implementation. The popup cannot reach the content script's memory (separate documents, and `A50` keeps the storage write as the only channel), so no delete control can reach a foreign row. See finding 2. |
| 11 — failed automatic load leaves the page working, shows a non-blocking notice | **fail** | The page half passes (`src/content/main.ts:207` fire-and-forget; `src/content/sync/sync-notes.ts:118-121` records the failure and returns). The popup half does not: `sync_failed` is declared (`src/popup/page-entries-service.ts:80`), has wording (`src/popup/text.ts:87`) and is asserted as a map key (`tests/popup-entry-list.spec.ts:712`), but **nothing ever pushes it** — `viewOf` pushes only `name_required` and `page_not_injectable` (`:303,306`). See finding 2. |
| 12 — `host_permissions` for `http://*/*` and `https://*/*` | **pass** | `src/manifest.json:6`; `tests/toolchain-contract.spec.ts:175-215` pins the exact two strings and the whole manifest key set. |
| 13 — every gate green, test count only grows | **pass (per PM)** | PM measured build 0, test 0 with 1165/52 (was 1060/47), typecheck 0, checker 0 with 203 info; I re-ran the read-only checker: `0 error(s), 0 warning(s), 203 info(s)`. The engineer's quote is absent because the report is absent (finding 1). |
| 14 — new spec documents the four things; `INDEX.md` gains its row | **pass, with a stale pointer** | `docs/specs/sync-integration.md` covers settings fields, button states, memory-only rule, failure behaviour; `docs/specs/INDEX.md:12` has the row; `AGENTS.md:104` has the row. But the spec's Test mapping (line 193) points at a report that does not exist. |

**Score: 12 pass, 2 fail (AC 10, AC 11).**

### 2. Blocking — `A164` popup notice and the foreign-row controls are declared but unreachable

`docs/specs/sync-integration.md:121` — "The popup states the failure as the non-blocking notice «Не удалось связаться
с сервером синхронизации»: above the list, never replacing it" — and `:113` / Flow step 6 (`:41`) — "The popup's
checkbox hides the foreign author's highlights … `Удалить` removes the author's rows" — and AC 16 (`:179`).

The code does not do it:

- `src/popup/page-entries-service.ts:80` declares `sync_failed` in `PopupNoticeCode`; `src/popup/text.ts:87` gives it
  wording; `src/popup/page-entries-service.ts:303,306` push only the two pre-existing codes. No branch anywhere
  produces `sync_failed`, so the notice is unreachable and AC 11's popup half is unimplemented.
- `src/content/sync/foreign-notes.ts:83-87` (`dismiss`), `:80` 
(`setNoteVisible`), `:89` (`authors`) have no caller in
  `src/` — the three member functions are dead code. `tests/content-sync-notes.spec.ts:131,143` exercise them at the
  memory layer only, which proves the API works but not that a control reaches it.
- The popup's "foreign row" (`src/popup/page-entries-service.ts:157,161`) is the pre-existing `A82` marker for a
  *stored* entry by another author; server foreign notes never reach the popup, so the spec's "popup's checkbox of a
  foreign author" describes a surface that does not exist.

This is exactly the `code-review-flow.md:45` case: the spec promises what the code does not do. Either the code gains
the notice push and the controls, or the spec drops those two claims and the brief re-scopes AC 10/11's popup half.
The PM decides; I do not resolve it silently.

### 3. `A161` — the payload contains only the current author's entries. **Holds.**

`src/core/sync-client.ts:201-209`:

```ts
const own = entries.filter((entry: Entry) => isSameAuthor(entry.authorName, authorName));
return { author_id: authorName, notes: sortByCreatedAtAsc(own).map(remoteNoteOf) };
```

This is the only construction of the body (`src/core/sync-client.ts:234-236` is the only `JSON.stringify` in the
POST path), and the filter is a closed whitelist over core `isSameAuthor` — the same predicate the edit gate and the
popup rows use. A foreign entry cannot reach the body: the only array the body is built from is the filtered `own`.
The popup's `pressSync` (`src/popup/sync-button-service.ts:96-125`) passes `page.entries` (the whole page), so the
filtering is not delegated to the caller — core is the enforcement point. `tests/core-sync-client.spec.ts` and
`tests/popup-sync-button.spec.ts:106-180` cover it. **No finding.**

### 4. `A163` — no foreign entry reaches `chrome.storage.local`. **Holds.**

Every module under `src/content/sync/` checked:

- `fetch-transport.ts` — 34 lines, one `fetch`, no storage, no URL literal.
- `foreign-notes.ts` — no storage write; the only `chrome.storage.local` strings are comments (`:16,121`); the memory
  is a closure (`:99`).
- `sync-notes.ts` — imports `loadSettings` and core `sync-settings` only; no `saveSettings`, no port write.

`tests/content-create-card-boundaries.spec.ts:174-179` pins "never imports the settings write" for the whole content
layer. **No finding.**

### 5. `A166` — no request when sync is off or the URL is empty. **Holds, both halves.**

- Content: `src/content/sync/sync-notes.ts:98-101` returns before building a URL when `target === null`; the decision
  is made from `syncTargetOf`, not inside the loader.
- Popup: `src/popup/page-entries-service.ts:331` sets `syncEnabled` from `syncTargetOf`, and
  `src/popup/popup.component.ts:502` renders no button when false; `src/popup/sync-button-service.ts:93-97` returns
  `sync_off` without calling the transport when the switch moved under the popup.

The two halves read the same core function, so they cannot disagree. **No finding.**

### 6. Layer discipline — `src/core/` framework-free and `chrome.*`-free. **Holds.**

`src/core/sync-client.ts` imports: `./entry`, `./entry-rules`, `./sync-settings` — nothing else. `src/core/sync-settings.ts`
imports core only. Neither names `chrome`, a DOM API or a Preact/Angular symbol; the `chrome.*` hits in both files are
comments saying the module stays pure. `tests/toolchain-contract.spec.ts:1611-1626` also pins that no `src/core/` file
names the network transport. **No finding.**

### 7. `A162` three-state button — driven by the outcome, not a timer. **Holds.**

`src/popup/popup.component.ts:559` -> `running`; `:567` -> `idle`/`error` from the `SyncPressResult`. `syncState` has
exactly two writers and no `setTimeout`, `setInterval` or `animationend` handler anywhere in the popup layer
(`tests/popup-sync-button.spec.ts:280` pins it). The CSS `animation: sync-spin 0.9s linear infinite` (`:411`) is
infinite and is removed only when the class changes, i.e. on the request's answer — it cannot stop on its own.
`error` stays until the next press because nothing else writes the signal. Colours: idle `#1e7b3c` (green, `:398`),
error `#b3261e` (red, `:414`), same 24 px box as the delete control. **No finding.** (Minor, non-blocking: a stale
`error` survives a popup refresh within one document, since `syncState` is not reset on view change — but the ruling
says "stays red until the next press", so this is correct, not a defect.)

### 8. Security — the manifest and the request target. **Holds, one minor note.**

- `src/manifest.json:6` adds only `host_permissions: ["http://*/*", "https://*/*"]`. `permissions` stays
  `["storage", "tabs"]`; the manifest key set is pinned exactly by `tests/toolchain-contract.spec.ts:190-202`, so no
  `scripting`, `activeTab`, `optional_permissions` or `web_accessible_resources` was widened. The manifest's
  `content_scripts.matches` already registered the same two origins, so no new origin class was introduced.
- The URL is read from settings and sanitised by core `parseServerAddress` -> `syncTargetOf`
  (`src/core/sync-settings.ts`, `parseServerAddress` refuses any non-http(s) scheme, any path, any query, any
  fragment; `syncTargetOf` returns `null` for empty or unparsable). The route is core's `NOTES_PAGE_PATH`, and the
  page key is `encodeURIComponent`-ed at `src/core/sync-client.ts:212`.
- A hostile page cannot influence the target: the address comes only from `settings:v1`, and the transports build no
  URL (`tests/toolchain-contract.spec.ts:1587-1610` pins "no scheme literal, no host, no route" in both adapters).
- **Minor, non-blocking:** `host_permissions: ["http://*/*", "https://*/*"]` is a broad grant, and the brief's answer 8
  mandates it; it is not a finding against the task, but it does mean the extension is granted every origin — worth
  the PM's awareness when the user's security posture is reviewed. The spec records it (`sync-integration.md:126`).

### 9. Test honesty — no deleted assertion, all changes justified in-line. **Holds.**

- `tests/content-create-card-boundaries.spec.ts:158-179` — the settings-import pin widened from one module to two, with
  a comment naming `A166` and the reason; a new case pins "never imports the settings write". Assertion count grows.
- `tests/content-throw-boundaries.spec.ts:113-136` — pinned catch count 14 -> 15, with the new site named
  (`sync/foreign-notes.ts:1`) and the reason stated. Grows.
- `tests/options-author-name.spec.ts:122-129,233-240` — the port-call list gains a `get` because `A160` makes the save
  read first. The write is still one `set`. Grows.
- `tests/popup-entry-list.spec.ts:338,501-509,704-712` — the view key set gains `syncEnabled`; the notice map gains
  `sync_failed`. Both are additive with comments. Grows.
- `tests/toolchain-contract.spec.ts:175-215,1571-1626` — the "no host_permissions" negative became "exactly two
  strings" and the "no network" negative became "exactly two transport files", each with a comment and each still a
  failing test on a third offender. The manifest key set is now pinned more tightly than before. Grows.

No assertion was deleted without a replacement, and each change is justified in a comment at the site. The brief does
not order these changes individually (it does not name them), so the ordering requirement does not bite; the changes
are all in commits whose messages cite the ACs. **No blocking finding.** One consequence worth noting: the
`sync_failed` key is asserted as present in the map by `tests/popup-entry-list.spec.ts:712` while no code can produce
it — the test proves the map's totality, not that the notice is reachable. That is finding 2's evidence, not a
separate test-honesty failure.

### 10. Staleness — three stale claims. **Two blocking-adjacent, one minor.**

1. `docs/specs/sync-integration.md:121,150,179` and `:113,41` — the popup notice and the foreign-row controls, covered
   in finding 2. **Blocking (part of finding 2).**
2. `docs/specs/sync-integration.md:193` — "quoted in the task's engineer report under `docs/state/`" points at a file
   that does not exist. **Blocking (part of finding 1).**
3. `src/core/settings-store.ts:56` — "`tests/core-sync-settings.spec.ts` pins the decode". No such file exists; the
   decode is pinned in `tests/core-settings-store.spec.ts` and `tests/core-sync-client.spec.ts`. **Minor, non-blocking:**
   a stale comment reference.
4. `README.md:237-241` — the spec list under "Спецификации (`docs/specs/`, связаны в `docs/specs/INDEX.md`)" has four
   rows and no `sync-integration.md`; `README.md:243-244` still says "**Расширение пока с сервером не связано**:
   этой стадией сделан только сервер, интеграция — следующая", which this stage made false. **Minor, non-blocking:**
   the README's own spec list omits the fifth spec and its server section states the opposite of the shipped feature.
   `AGENTS.md:104` and `docs/specs/INDEX.md:12` both have the row, so the mandatory index is correct; the README is
   the user-facing duplicate that was not updated.

### 11. Non-blocking observations

- `src/popup/sync-button-service.ts:45,105` and `src/popup/popup.component.ts:565-567` — the machine code is spelled
  `'nothin_to_send'` (missing `g`). It is consistent across source, tests and spec (`sync-integration.md:87`), so it is
  not a bug, but it is a typo in an identifier that shipped into a spec. Cosmetic; no ruling requires renaming.
- `src/content/sync/fetch-transport.ts:1-27` and `src/popup/sync-transport.ts:1-25` are near-identical five-line
  adapters. The spec explains why (separate bundles) and the toolchain test pins both. Accepted as designed.
- The six-commit split leaves no commit in a state where the gates are red — **but this cannot be verified from the
  artifacts.** No commit body carries gate output (`git log --format=%b 672bdb4..HEAD` -> all bodies empty or one-line
  subjects), and the engineer report that would quote per-commit runs is missing. The PM's verification says each
  commit is "a self-contained slice with its own gate run" and the PM accepts the split as a process deviation; on
  that authority the split is accepted. What the artifacts do not support is the claim itself — the only gate evidence
  available is the PM's final run at `8fdd51a`. If the split matters, the missing report is where the per-commit
  evidence should have been.

## One-line statement on the six-commit split

The split leaves no commit red on the evidence that exists — the PM's final four-gate run at `8fdd51a` is green and
the split is accepted as a process deviation — but no commit carries its own gate output, so the per-commit claim is
unverifiable from the artifacts and would have been answered by the missing engineer report.

## What would unblock

1. Write `docs/state/t17-01-engineer.md`: changed paths, commands run with their output, and the AC self-check
   (including the AC 10/11 popup half, which is currently unimplemented). Fix `sync-integration.md:193` to point at it.
2. Either implement the `A164` popup notice (push `sync_failed` from the popup when a press or the automatic load
   fails, and wire the foreign-row checkbox/`Удалить` to `setNoteVisible`/`dismiss`) or edit
   `docs/specs/sync-integration.md:41,113,121,150,179` and the brief's AC 10/11 to state what the code actually does.
   The PM decides which; I do not.
3. Optional, non-blocking: fix the stale `tests/core-sync-settings.spec.ts` reference at `settings-store.ts:56`, add
   the fifth row to `README.md:237-241`, and correct `README.md:243-244`'s "the extension is not yet connected".
