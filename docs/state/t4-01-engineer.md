# Engineer report — `t4-01-popup-list`, attempt 1

Task: replace the Angular popup placeholder with the current page's entry list and a
per-entry show/hide checkbox, including the states that are not a list.
Branch state at start: `c4abdcf`, nothing committed.
Resume note: the first run died on a provider stream error after the popup source and
the test file were written and after the manifest/toolchain edits; no commit existed.
This run fixed one TS error, verified, split the work into three commits, wrote the
spec lines and re-ran the gates. No file was rewritten from scratch.

## Commits

| Commit | Message | Contents |
|---|---|---|
| `52afe39` | `feat(t4-01): popup entry list over the core API` | `src/popup/page-entries-service.ts`, `src/popup/active-tab.ts`, `src/popup/text.ts`, `src/popup/popup.component.ts`, `tests/popup-entry-list.spec.ts` |
| `ecf9a26` | `feat(t4-01): tabs permission for the popup address read (A49)` | `src/manifest.json` (`permissions: ["storage","tabs"]`), the new pins in `tests/toolchain-contract.spec.ts`, the spec's `- Permissions:` line |
| `6a3b3d7` | `docs(t4-01): popup row contract, ownership marker and the two notice states (A81, A82, A83)` | `docs/specs/content-overlay-ui.md` (Terms rows, Flow 7, popup contract bullets, edge case, AC22) |

`git status --porcelain` after the last commit: empty. `git log c4abdcf..HEAD` = the
three commits above.

## Files

New:
- `src/popup/page-entries-service.ts` — the wiring layer: active-tab address →
  `loadSettings` + `validateAuthorName` → `loadEntries` → `sortByCreatedAtAsc` → rows
  with `canEdit`; writes through core `setVisible` / `deleteEntry`; the notice-code
  decision; `INJECTABLE_SCHEMES`, `isInjectableUrl`, `hostOf`,
  `OWN_ROW_CLASS` / `FOREIGN_ROW_CLASS` / `rowClass`. No `chrome.*`, no DOM, no Russian
  string.
- `src/popup/active-tab.ts` — the only shipped module naming `chrome.tabs`:
  `chrome.tabs.query({ active: true, currentWindow: true })` → `tab.url` or `null`; a
  rejected query and an invisible `url` both become `null`.
- `tests/popup-entry-list.spec.ts` — 29 tests over the service and the popup strings
  module against `MemoryStoragePort` and a fake tab read.

Modified:
- `src/popup/text.ts` — `POPUP_STRINGS` (title, emptyState, nameRequired, notInjectable,
  ownEntry, delete), `POPUP_NOTICE_TEXT` (total over the code union),
  `popupNoticeText`, `ownershipHeaderText`.
- `src/popup/popup.component.ts` — `PAGE_ENTRIES_SOURCE` token (root factory:
  `createChromeLocalStoragePort()`, `activeTabUrl()`, `chrome.runtime.openOptionsPage()`),
  OnPush component with a `PageEntriesView` signal, `@for` rows, notice lines above the
  list, empty-state line. No branch worth a test.
- `src/manifest.json` — `permissions: ["storage", "tabs"]`; still no
  `host_permissions`, no `optional_permissions`.
- `tests/toolchain-contract.spec.ts` — permissions pin rewritten (8 tests added).
- `docs/specs/content-overlay-ui.md` — see the spec section below.

Unchanged on purpose: `src/core/`, `src/content/`, `src/options/`, `src/popup/main.ts`,
`src/popup/index.html`, `package.json`, `docs/project-profile.md`, `.pi/`, `scripts/`,
`docs/state/t4-01-popup-list.md`.

## Rulings, as implemented

- `A81` — restricted page: `POPUP_STRINGS.notInjectable = 'На этой странице
  подсветка недоступна'` in `src/popup/text.ts`, chosen by
  `page_not_injectable` in the service when the address is not in
  `INJECTABLE_SCHEMES` or core cannot build a page key for it. One sentence covers
  `file://`, `chrome://`, Web Store, PDF viewer, an unparsable address and a `null`
  tab read. The list still renders under it.
- `A82` — ownership: `ownershipHeaderText(row)` returns `POPUP_STRINGS.ownEntry`
  (`'Вы'`) when core `canEdit` accepts the row against the popup's own settings read,
  otherwise the stored `authorName` verbatim. No `'Не: '` string exists anywhere in
  `src/popup/` (pinned). The marker is not text-only: `rowClass` yields
  `'row row--own'` / `'row row--foreign'`, bound with `[class]="rowClassOf(row)"`, and
  the header text and the class are asserted in the same test
  (`marks ownership by the header word and the row class, never by a new sentence
  (A82)`).
- `A83` — no-name state: the `name_required` notice is rendered before the list and
  the list still renders below it; the line is a real `<button>` calling
  `openSettings()` → `chrome.runtime.openOptionsPage()`, and the test asserts it
  performs no storage write. The wording is the spec-fixed `Укажите имя в настройках`;
  no extra "open settings" string was added.

## Acceptance criteria self-check

AC1 — the popup lists the current page's entries through core.
- `renders one row per entry of the page, in creation order`
- `orders the rows with core sortByCreatedAtAsc, never by the stored order`
- `finds the page through the stored index, so tracking noise cannot hide it (A4)`
- `asks the store only through the core key layout` (every key asked is
  `pages:v1` / `settings:v1` / `notes:v1:<key>`)
- `shows the host of the page under the title`
- `shows no row for a record the core read guard skips`
- `reads the address from the injected active-tab read, not from the popup document`
- scan half: `names no storage API and no storage key of its own (t4-01 AC1)` — every
  file under `src/popup/` is scanned; a file that writes `chrome.storage` or imports a
  key name/`storage-keys` fails the suite. `reaches chrome.storage.local only through
  the one port adapter factory` pins that `createChromeLocalStoragePort` appears in
  exactly one popup module.

AC2 — the checkbox writes visibility through core and keeps the row and the order.
- `unchecking writes visible: false through core and the row stays in the list`
- `checking writes visible: true back`
- `a checkbox write moves nothing in the order and changes no stamp (A1, A12)`
- `a foreign entry can be hidden too: authorship governs editing, not filtering`
- `the checkbox is a storage write and nothing else (A50)` plus the scan
  `sends no message to the page from the checkbox (ruling A50)` (no `sendMessage`,
  no port, no `chrome.storage.onChanged` under `src/popup/`). No content-script
  `storage.onChanged` was added — that is `t4-03`.

AC3 — a foreign row is marked foreign and offers no edit affordance, but keeps `Удалить`.
- `marks ownership by the header word and the row class, never by a new sentence (A82)`
- `asks core who the author is, so changing the name in options re-owns the rows`
- `a settings state with no usable name makes every row foreign`
- `a foreign row is still deletable and disappears from storage (A25)`
- scans: `keeps the component a facade with no core rule of its own` (the component
  names no core function), `holds no comment write and no page clear, so the popup
  offers no edit path (AC3, A25)` (`updateEntryComment`, `createEntryOnPage`,
  `clearPage` absent from `src/popup/`), `renders the row contract: name, checkbox,
  Удалить, and no editor control` (`type="checkbox"`, `[checked]="row.visible"`,
  `onToggle(row.id, $event)`, `onRemove(row.id)`, `[class]="rowClassOf(row)"`,
  `<button … (click)="openSettings()"`; no `<textarea`, no `Сохранить`, no `onSave`).

AC4 — the states that are not a list.
- `names the settings-gate state with the sentence the overlay spec fixes`
- `the name-required notice does not hide the list (A83)`
- `the name-required line opens the options page and writes nothing (A83)`
- `a page the content script is not registered for gets the A81 line and keeps its list (A49)`
- `a chrome:// page is not injectable either`
- `an address core refuses gets the same single line and no list`
- `no active tab address gets the same line rather than a crash`
- `a restricted page with no name states both lines, notice order fixed (A83)`
- `a normal page with a name states nothing and shows the empty line only when empty`
  (asserts `На этой странице нет записей`)
- `the notice map is total over the notice codes`
- `the injectable schemes are the ones the manifest registers the content script for`

AC5 — a delete removes the row immediately.
- `the row is gone from the list at once and the others keep their order`
- `deleting the last row leaves the empty state and drops the page slot` (slot key gone,
  index no longer lists the page → the empty line is what the component renders for
  `rows.length === 0`)
- permissions pin: `declares no host_permissions and no permission beyond storage and
  tabs (ruling A49)` asserts `permissions` is exactly `['storage','tabs']`, no
  `host_permissions`, no `optional_permissions`, and that the spec states
  "`storage` and `tabs`".

## Commands run

| Command | Result | Quoted output |
|---|---|---|
| `npx tsc -p tsconfig.spec.json --noEmit` | passed | no output (the single `TS6133 'before' is declared but its value is never read` was fixed by using the declaration) |
| `npx tsc -p tsconfig.app.json --noEmit` | passed | no output |
| `npx vitest run tests/popup-entry-list.spec.ts --reporter=basic` | passed | `✓ tests/popup-entry-list.spec.ts (29 tests) 16ms` / `Test Files 1 passed (1)` / `Tests 29 passed (29)` |
| `npx vitest run tests/toolchain-contract.spec.ts --reporter=basic` | passed | `✓ tests/toolchain-contract.spec.ts (28 tests) 135ms` / `Tests 28 passed (28)` |
| `npm run build` | passed | `[build] manifest references resolved: content.js, popup/index.html, options/index.html` … `dist/popup\main.js (125989 bytes)` … `dist/ is a self-contained MV3 folder (10 files)` |
| `npm test` | passed | `Test Files 39 passed (39)` / `Tests 734 passed (734)` (baseline was 697: +29 popup, +8 toolchain) |
| `node scripts/check-agent-config.mjs` | passed | `0 error(s), 0 warning(s), 79 info(s)` |
| `node -e … dist/manifest.json` | passed | `["storage","tabs"]` |

Gate order followed `A62`: build → test → checker, after the last commit.

## Spec lines (`docs/specs/content-overlay-ui.md`)

- Terms: `entry row` now names the checkbox **and** `Удалить`; `ownership header` is
  declared to be the popup row label as well as the tooltip first line; new row
  `popup notice` carrying both Russian sentences with their ruling ids.
- Rules / Semantics: new `- Permissions:` bullet (exact `storage` + `tabs`, why `tabs`,
  the accepted install-time warning, the rejected service-worker alternative, the ban
  on widening without a ruling, the `INJECTABLE_SCHEMES` ↔ `content_scripts[0].matches`
  pin). Rewritten `Popup contract` bullet (row content, no edit affordance, delete for
  every row, storage only through the port adapter, no message). New `Popup ownership
  marker`, `Popup checkbox` and `Popup notices` bullets.
- Flow item 7: the checkbox writes through core and the page repaints from that storage
  write, not from a popup message; until `t4-03` the repaint lands on the next load.
- Edge Cases: the restricted-page line now names the sentence and `A49`.
- Acceptance Criteria: `AC22` added, citing `tests/popup-entry-list.spec.ts` and the
  popup scan / permissions pin.
- `docs/specs/INDEX.md` needed no change (no new spec; `src/popup/` already a covered
  path).

## Deviations from the brief

1. **Foreign-row wording.** The task card said `Не: <name>`; ruling `A82` says the spec
   outranks the card. Implemented per `A82`: header = stored `authorName`, no prefix,
   plus the `row--foreign` class pinned in the same test as the header text.
2. **`Удалить` was not in `src/popup/text.ts`.** The brief said to report a missing
   string rather than invent one. The word is not invented: it is fixed by `A25` and
   already present in the spec's Terms table and in `src/content/text.ts`. I added
   `POPUP_STRINGS.delete = 'Удалить'` (one string per layer is the rule) and report the
   addition here.
3. **Commit split.** The `- Permissions:` spec line went into commit 2, not commit 3,
   because the new permissions pin asserts the spec contains that line and `AGENTS.md`
   requires a spec edit in the same commit as the behavior change. Commit 3 carries the
   rest of the spec lines. AC4/AC5 tests are in the same file (and therefore the same
   commit) as AC1–AC3; the checkpoint split is by file, not by `describe`.
4. **An existing test was edited.** `tests/toolchain-contract.spec.ts` pinned
   `permissions` to `['storage']`; per the brief that pin had to become exactly
   `storage` + `tabs`.

## Deliberately not done

- No `storage.onChanged` listener anywhere: the content-script listener is `t4-03`; the
  popup sends no message (`A50`).
- No edit affordance, no comment write, no page clear in the popup.
- No change to `src/core/` rules, `src/content/`, `src/options/`, dependencies,
  `docs/project-profile.md`, harness files or the task state file.
- No third notice code for a refused write (`entry_not_found`, `slot_malformed`): the
  popup re-reads the page and shows what the store says. Inventing a sentence for a
  state the spec does not list would be an unbriefed observable behavior.
- No browser session: `dist/` was built but not loaded in `chrome://extensions`.

## Residual risks

1. The Angular component is never instantiated in a test — this repo has no TestBed
   harness and the options page (`t4-02`) set the same precedent. Its behavior is proven
   through `PageEntriesService` and its shape through the template greps; a template
   typo that keeps the greps true (for example a wrong `track` expression) would not be
   caught until a browser check.
2. `chrome.tabs.query` behavior is only proven against a fake. The real `tab.url`
   visibility with `tabs`, and the install-time "read your browsing history" warning
   from `A49`, need one manual load of `dist/`.
3. If the content script generates a fresh author name (`A54` first run) while the popup
   document is open, the popup keeps the name its own read returned until it is reopened;
   no ruling covers that interleaving.
4. The popup list is a snapshot: entries changed in another tab while the popup is open
   are not reflected until reopen. Not specified, and the only storage-change listener
   scheduled so far is the content script's (`t4-03`).
5. A refused visibility/delete write is silent in the UI (the list just shows the truth).
   If the PM wants a message, it needs a ruling and a spec line, not an engineer's word.

## Open questions for the PM

- Does the popup need a "write refused" line, or is the silent re-read the shipped
  answer? (No spec line either way; implemented as the silent re-read.)
- Browser verification of the popup (row rendering, checkbox repaint after `t4-03`, the
  `tabs` warning at install) is not in any task's checklist I can see; `t4-03` carries
  browser check 4 only.
