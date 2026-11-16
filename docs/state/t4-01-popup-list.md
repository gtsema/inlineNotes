# t4-01-popup-list

## Goal

The Angular popup: the list of the current page's entries, the per-entry show/hide checkbox, and the three non-list
states (no name set, empty page, page where the content script cannot run). Popup talks to core only — it never reads a
storage key by hand.

## PM rulings and contracts this task implements

- `A25` (already issued): core does not gate `deleteEntry`/`clearPage` by authorship; the **popup** is where the user
  can remove any entry of the page (personal store, not a permission system). The row exposes `Удалить` for every
  entry, but a foreign row gets no edit affordance.
- `A49` **How the popup learns which page is current — decided by the user (2026-11-16: "берём табс").** `chrome.tabs.query` returns
  `tab.url` only with the `tabs` permission, which the manifest does not have. Two options:
  1. **Default:** add `"tabs"` to `src/manifest.json` (one line + one spec line). The popup reads the active tab's URL,
     normalizes it through core and lists the entries — and works even on pages where the content script cannot inject
     (the spec's restricted-page edge case). Cost: an install-time permission warning ("read your browsing history"),
     which for a personal-notes tool is the visible downside.
  2. Alternative, zero new permissions: the content script announces its page key, a service worker maps
     `sender.tab.id → pageKey` in `chrome.storage.session`, the popup reads that mapping by `tab.id` (ids need no
     permission). Cost: a new service worker, a new storage surface, and the popup stops working on restricted pages —
     three moving parts for one scary string in the install dialog.
  **Chosen option 1**: `"tabs"` joins `src/manifest.json` permissions, the overlay spec gains the permission line, and
  the popup keeps working on pages where the content script cannot inject. The install-time warning is accepted; it is
  the only permission this extension asks for beyond `storage`, and the README must state in Russian what it is for.
- `A50` **Checkbox writes through core, not through a page message.** Unchecking calls `setVisible(port, id, false)`
  and the page repaints because the content script listens to `storage.onChanged` (`t4-03` owns that listener); the
  popup does not message the page. Until `t4-03` lands, the checkbox still persists correctly — the repaint simply
  arrives on the next load. Recorded so `t4-01` and `t4-03` do not both invent a messaging channel.

## AC (5 substantive + gates)

1. The popup lists the current page's entries **through core** (`loadEntries` / `loadPageContext` + `pageKeyFromUrl` +
   `findPageKey`), the URL coming from `chrome.tabs.query` with the new `tabs` permission (`A49`); one test pins that
   `src/manifest.json` permissions are exactly `storage` + `tabs` so a future task cannot widen them silently; sorted by `createdAt` ascending (`sortByCreatedAtAsc`), one row per entry: author name + checkbox +
   `Удалить`. A scan test asserts no `chrome.storage` access in `src/popup/` outside the core port adapter.
2. Unchecking a row calls `setVisible(… false)` and checking calls it with `true`; the entry stays in the list either
   way and the order does not change (`A1`, `A12`, overlay AC7).
3. A row whose `authorName` differs from the current options name is marked as foreign (`Не: <name>` header wording per
   the overlay spec) and offers no edit path; `Удалить` is still present (`A25`).
4. Empty and error states: no name in options → `Укажите имя в настройках` + a link to options (overlay AC10); no
   entries for the page → the empty-page message; the page is not injectable (`http(s)` only, or a URL core refuses) →
   the message that this page cannot show highlights while the list still renders (overlay Edge Cases).
5. A delete removes the row immediately (core `deleteEntry`), and the empty state appears when the last row is deleted
   (overlay AC4 popup half).

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): popup store/service over the core API + component tests → `npm test` early → spec lines
(`docs/specs/content-overlay-ui.md`: popup row contract, foreign-row wording, the `tabs` permission line if `A49`
keeps option 1) → gates → commit `feat(t4-01): popup entry list with per-entry visibility`. Commit as soon as green; a
committed green state with a short report is accepted, an uncommitted perfect one is not.

## Inputs the engineer reads

`docs/specs/content-overlay-ui.md` (Flow 6/7, AC7, AC10, Edge Cases), `docs/specs/inline-comment-model.md` (AC1,
AC9/AC10, ordering), `docs/state/t3-01-settings-read-core.md` (`loadSettings`), `src/core/entry-store-read.ts`,
`src/core/entry-store-write.ts` (`setVisible`, `deleteEntry`), `src/popup/`, `src/content/store/chrome-storage-port.ts`
(the only shipped `chrome.storage` reference), `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.

## Explicitly out of scope

The page-side widget (Stage 3), the options page (`t4-02`), `storage.onChanged` and SPA refresh (`t4-03`), any
messaging channel to the content script (`A50`).

## Attempts log

- attempt 1: brief prepared; delegated after Stage 3 closes.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- none open: `A49` is decided (the `tabs` permission); the README line explaining it in Russian belongs to `t4-03`.
- `A50` is a PM default; if the user wants an instant repaint without reload, it belongs in `t4-03`, not here.
