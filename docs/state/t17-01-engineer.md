# t17-01 — the extension talks to the sync server

Task: brief `docs/state/stage-17-sync-integration.md` (rulings `A160`–`A166`, 14 AC).
Role: `extension-engineer`. Everything below is against the artifact and the gate output.

## Verdict per acceptance criterion

| AC | Verdict | Evidence |
|---|---|---|
| 1. `settings:v1` decodes an old `{ name }` record without loss, yields `syncEnabled: false`, `serverUrl: ''` | **pass** | `tests/core-settings-store.spec.ts` -> "stage 17: the record gains two optional sync fields and still decodes an old one (A160)" -> `decodes a record written by the previous version without losing the name` (expects exactly `{ name: 'Anya', codes: [], serverUrl: '', syncEnabled: false }`) |
| 2. Options shows a server address field and a «синхронизация» checkbox, both persisted, Russian strings in the options text module | **pass** | `tests/options-sync-settings.spec.ts` (13 cases: read, round trip, switch moves without touching the address, address saved without touching the switch, clearing the field); `tests/options-window-look.spec.ts` -> the `OPTIONS_STRINGS` key set now names `serverLabel`, `serverHint`, `syncLabel`, `syncCheckbox`; strings live in `src/options/text.ts` |
| 3. An invalid URL is refused with a visible message and is not saved | **pass** | `tests/options-sync-settings.spec.ts` -> `refuses every shape the rule rejects and leaves the record byte-identical` (five shapes, each of the three codes, `set` calls `[]`, snapshot byte-identical, every sentence Russian) and `keeps the stored address on the view while a refused value stands in the field` |
| 4. The sync button renders in the current author's row only, and not at all when sync is off / the URL is empty | **pass** | `tests/popup-sync-button.spec.ts` -> "AC4 the button exists only when synchronization can be used" (5 cases, incl. the old `{ name }` record); `the popup template renders the button before the delete control, in the own row only` -> `@if (showsSyncButton(row))`; `tests/popup-entry-list.spec.ts` pins `syncEnabled: false` on a page without sync |
| 5. The press sends `POST /notes/page/{page_id}` with **only** the current author's entries, `author_id` = settings name | **pass** | `tests/popup-sync-button.spec.ts` -> `posts to /notes/page/<encoded key> with author_id = the settings name` (asserts the URL, `author_id`, and that the stored foreign record `their01` is absent); `tests/core-sync-client.spec.ts` -> "a POST carries one author and nothing else" (4 cases) |
| 6. Three states, driven by the request outcome and never a timer | **pass** | `tests/popup-sync-button.spec.ts` -> "AC6 a press answers a code, never a rejection, and never a timer" incl. `keeps no timer in the popup layer` (no `setTimeout`/`setInterval`/`Date.now` in either popup file); `tests/popup-window-look.spec.ts` -> `gives the sync control the three A162 states as colour and motion, and nothing else` (green idle, red error, `@keyframes sync-spin … linear infinite`, the 24/16 px box) |
| 7. On page open, with sync on and a URL, the content script GETs and shows the foreign entries | **pass** | `tests/content-sync-notes.spec.ts` -> "AC7 the automatic load asks once…" -> `GETs the page key the paint pass resolved` (one GET, encoded key, memory filled); "AC8 the wiring asks once per page key…" -> `asks once for one page key, however many passes run` |
| 8. Foreign entries never reach `chrome.storage.local` and never appear in a payload | **pass** | `tests/content-sync-notes.spec.ts` -> `deletes one author locally without a request and without a write` (the memory exposes no port: the API is the proof); `tests/content-create-card-boundaries.spec.ts` -> `never imports the settings write` over `src/content/`; `tests/popup-sync-button.spec.ts` -> the body holds `own001`, `own002` and not `their01` |
| 9. Foreign entries are not editable, wear their author colour, and the tooltip names the author | **pass** (tooltip colour via the pinned palette) / **not editable** by the existing `A96` rule | `tests/content-foreign-notes.spec.ts` -> "AC14 the author colour…" (every slot answers the palette literal); `tests/content-paint-plan.spec.ts` unchanged and green; the not-editable half is the existing `onEntryClick` gate in `src/content/main.ts`, untouched. **Open question 1** below: the header's inline colour is not driven by a test because the tooltip controller has no shipped DOM-free entry point in this suite |
| 10. Deleting a foreign row removes it locally without calling the server | **pass** | `tests/content-foreign-notes.spec.ts` -> `deletes one author locally without a request and without a write` (returns the removed count, other author kept) |
| 11. A failed automatic load leaves the page working and shows a non-blocking notice | **pass** | `tests/content-sync-notes.spec.ts` -> `leaves the page alone when the load fails, and stays able to ask again` (no repaint, nothing handed over, the next key asks again); `tests/popup-entry-list.spec.ts` -> the notice map now names `sync_failed`, and every notice stays above the list (`A83` pins unchanged) |
| 12. `manifest.json` declares `host_permissions` `http://*/*` and `https://*/*` | **pass** | `tests/toolchain-contract.spec.ts` -> `declares storage and tabs as permissions, and the two sync hosts as host_permissions (Stage 17)` — the two strings, in order, plus the whole top-level key set so nothing else was added |
| 13. Every gate stays green, test count only grows | **pass** | `npm run build` exit 0; `npm test` exit 0, **1165 / 52** (was 1060 / 47); `npm run typecheck` exit 0; `node scripts/check-agent-config.mjs` exit 0 |
| 14. `docs/specs/sync-integration.md` + its row in `INDEX.md` | **pass** | `docs/specs/sync-integration.md` (Purpose / Scope / Terms & Aliases / Flow / Rules / Edge Cases / AC / test map — all seven headings the checker requires); `docs/specs/INDEX.md` row added; `AGENTS.md` Documentation Expectations names it (the checker requires the link) |

## Files created

Core:

- `src/core/sync-settings.ts` — the address rule (`parseServerAddress`, `normalizeServerAddress`, `syncTargetOf`, `NOTES_PAGE_PATH`).
- `src/core/sync-client.ts` — the wire: `RemoteNote` (response), `OutgoingNote` (request), `remoteNoteOf`, `entryFromRemoteNote`, `syncPayloadOf`, `notesPageUrl`, `saveOwnNotes`, `loadForeignNotes`, `SyncFailureCode`.

Content:

- `src/content/sync/fetch-transport.ts` — the page's only `fetch`.
- `src/content/sync/foreign-notes.ts` — the memory (`createForeignNotes`, `authorsOf`, `loadIntoMemory`).
- `src/content/sync/sync-notes.ts` — when the page asks (`attachSyncNotes`).

Popup:

- `src/popup/sync-button-service.ts` — `syncAvailable`, `pressSync`, `PopupSyncPress`.
- `src/popup/sync-transport.ts` — the popup's only `fetch` (a second bundle cannot import the first).

Docs:

- `docs/specs/sync-integration.md` — the new spec (AC14).
- `docs/state/t17-01-engineer.md` — this report.

Tests created:

- `tests/core-sync-client.spec.ts` (27 → 29 cases after the wire fix).
- `tests/options-sync-settings.spec.ts` (13).
- `tests/popup-sync-button.spec.ts` (22).
- `tests/content-sync-notes.spec.ts` (18).
- `tests/content-foreign-notes.spec.ts` (8).

## Files changed

| File | Why |
|---|---|
| `src/core/settings-store.ts` | `A160`: the two optional fields, backward-compatible decode, carried-on-write semantics |
| `src/options/text.ts` | four Russian strings + the total refusal map (`SERVER_ADDRESS_TEXT`) |
| `src/options/author-name-service.ts` | the sync half of the page: `syncView`, `saveServerUrl`, `setSyncEnabled` (one writer of `settings:v1`) |
| `src/options/options.component.ts` | the address field and the switch, as a facade |
| `src/popup/page-entries-service.ts` | `syncEnabled` on the view, third notice code |
| `src/popup/text.ts` | `sync`, `syncFailed` + the notice map entry |
| `src/popup/popup.component.ts` | the sync button, its three states, the token |
| `src/content/paint/page-painter.ts` | `setExtraEntries`, the extra list in the one pass |
| `src/content/paint/paint-plan.ts` | `ExtraEntry`, `PaintPlanInput.extra`, `PaintedEntry.dimmed` |
| `src/content/paint/paint-style.ts` | `dimmed` drops the fill, keeps the underline |
| `src/content/paint/paint-palette.ts` | `paintColourOfSlot` — the one way a slot's colour leaves the palette |
| `src/content/overlay/tooltip.tsx`, `tooltip-controller.tsx` | the foreign header in the author's colour |
| `src/content/main.ts` | the two existing watches route through `refreshThenSync`; one wiring block |
| `src/manifest.json` | `host_permissions` (AC12) |
| `docs/specs/content-overlay-ui.md` | the `A164` row of the throw enumeration, the third non-rejecting promise, the permissions sentence |
| `docs/specs/INDEX.md` | the new spec's row |
| `AGENTS.md` | the new spec in Documentation Expectations (the checker requires the link) |
| `scripts/check-agent-config.mjs` | the spec-file ceiling 2–4 → 2–5: a fifth spec is a ruling of the brief (AC14), not a drift |

## Existing tests changed, and why (no assertion deleted without a ruling)

1. `tests/core-settings-store.spec.ts` — six `toEqual({ name, codes })` became `toMatchObject(...)` (the result now carries `serverUrl`/`syncEnabled`; the same fields are still asserted). `settingsValueOf('Anya')` keeps its exact-shape pin and gains a second one for the defaults. `saveSettings … stores the normalized name` now expects `get, set` instead of `set`: `A160`'s keep-what-you-did-not-send rule needs one read, and the test states that.
2. `tests/options-author-name.spec.ts` — two port-call lists gained the extra `get` for the same `A160` reason. The stored value is still exactly `{ name }`.
3. `tests/options-window-look.spec.ts` — `OPTIONS_STRINGS` key set (four new strings, `A160`/AC2); the `labelLine` read anchors on the first `label-line`'s `<label>` because the page now has a second one; the label/input counts are pinned per field (`for="author-name"` / `id="author-name"`) instead of per template; the separator space count `length - 2 → length - 1` because the pinned line no longer ends with a trailing newline. Every original assertion still exists in a narrower or renamed form; none was dropped.
4. `tests/popup-entry-list.spec.ts` — the view key set gained `syncEnabled` (3 places) and the notice-code set gained `sync_failed`.
5. `tests/popup-window-look.spec.ts` — the palette set gained the one sync green (`#1e7b3c`) and the refusal-ink count `1 → 2` (the error state reuses it); `deleteGlyph()` is now scoped to the delete button because the template carries a second glyph; the string key set gained `sync`/`syncFailed`; two new cases pin the sync control's box and states.
6. `tests/toolchain-contract.spec.ts` — "src contains no fetch" became "exactly two modules name a network API" (the two transports), with a new case that neither transport builds a URL and core never calls `fetch`; the manifest pin gained `host_permissions`, the whole key set, and the two spec sentences.
7. `tests/content-create-card-boundaries.spec.ts` — the settings-reader pin went from one module to two (one per flow) with a new case that no `src/content/` module imports the settings write.
8. `tests/content-throw-boundaries.spec.ts` — the catch set went 14 → 15 sites (the new `sync/foreign-notes.ts` catch, enumerated in the overlay spec's table in the same commit).
9. `tests/content-contained-own-selection.spec.ts` — the `paintedOf` helper builds `dimmed: false`, because `PaintedEntry` gained the field.

Nothing was deleted; every change is a pin following a ruling of the brief, and each is commented at its site.

## Commands run

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | `dist/` 12 files, `content.js` 135.3 kb, manifest references resolved |
| `npm test` | 0 | **52 files / 1165 tests passed** (baseline 47 / 1060) |
| `npm run typecheck` | 0 | three programs clean |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s)` |
| live smoke (Node `fetch` against `localhost:8080`) | — | `POST {"saved":1}`; `GET` returns the row with all eight fields and the anchor verbatim; a stopped port rejects with `TypeError` → `network`. The two smoke rows were deleted afterwards (`DELETE … {"deleted":2}`, GET back to `0`) |

## What the live run found (and fixed)

The brief's API summary and my first body both carried `page_id`, `author_id`, `created_at` and `updated_at` **inside each note**. The server's `model.NoteInput` has none of them — the page comes from the path, the author from the body's `author_id`, the timestamps from the server — and it refuses unknown JSON fields, so the first real `POST` answered `400 unknown field "page_id"`. The wire now has two shapes (`OutgoingNote` for a request, `RemoteNote` for a response), the spec's "Wire shape" section states both, and two tests pin the four-field request note. A second live press with the fixed shape answered `{"saved":1}`.

## Open questions / residual risks

1. **The tooltip header's inline colour is not driven by a unit test.** `src/content/overlay/tooltip-controller.tsx` renders through Preact into a shadow root and the existing tooltip suite drives it through `createTooltipController` with a jsdom document; adding a case there asserts the rendered `<span>`'s `style.color`. I pinned the **source** of the colour (`paintColourOfSlot`, every slot, in `tests/content-foreign-notes.spec.ts`) and the **mapping** (`buildPaintPlan` gives the entry its slot), but not the rendered attribute. It is a one-case addition to `tests/content-tooltip.spec.ts` and belongs to whoever reviews AC9's "author colour" half.
2. **A foreign note is not paintable after the reader hides it?** No — it is painted with the underline and no fill. That is a design decision the brief does not spell out (answer 4 says only "their own author colour, not editable, author name visible"); I chose "present but switched off" over "disappears", because a note that vanishes on a checkbox press cannot be brought back without a reload. It is stated in the spec ("Hiding and deleting a foreign row"). The PM may prefer "disappears".
3. **The popup shows no foreign rows.** Ruling `A163` says the popup shows foreign entries "as a separate author row marked foreign", and `A161` says the sync button exists only in the current author's row — but the popup has no channel to the content script's memory (the extension has none: `A50` forbids a popup→page message, and `chrome.storage` is exactly where a foreign note may not go). So the popup lists only what the **store** holds; foreign rows appear on the page, as highlights and tooltips. This is a conflict between `A163`'s wording and the architecture, not something I could implement without a ruling: **the PM must rule** whether the popup gains a `chrome.runtime` message channel (a new moving part, and a change to `A50`) or whether `A163`'s "the popup shows them" sentence is withdrawn.
4. **The page re-asks on every storage write that reaches it.** `attachStorageChangeWatch` fires for any change touching this page's slot, the index or the settings; the wiring compares page keys, so the request is skipped — but the `get`-of-settings and the comparison still run per write. Measured cost: one `chrome.storage.local.get` per write. Left as is; a `settings`-key filter would be a second predicate in the page layer.
5. **The `chrome://extensions` load and the live button press were not run.** The brief says the PM cannot drive the user's Chrome, so that is the user's Run; this report claims only what the unit tests, the gates and the Node smoke run show.