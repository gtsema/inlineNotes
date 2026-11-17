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
3. A row whose `authorName` differs from the current options name is marked as foreign and offers no edit path; `Удалить`
   is still present (`A25`). **Corrected by `A82` after delegation:** the card originally said «`Не: <name>` header wording
   per the overlay spec», but the overlay spec has no such wording — it ships the ownership header (own = «Вы», foreign =
   the stored `authorName`), which is what the popup now reuses, plus a `row--foreign` CSS marker pinned in the same test as
   the header text. The card was wrong; the spec won.
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
- attempt 1 run 1 **died on a provider stream error** ("malformed server-sent event JSON"), mid-sentence, with the popup
  source, the manifest and the toolchain pin written and **nothing committed**. `npm run typecheck` on the abandoned tree had
  exactly one error (an unused declaration in the half-written test file).
- attempt 1 run 2 = **`resume` of the same session** (`A80`, no new attempt burned), with the measured tree handed to the
  child so it would not rediscover it, and a commit-at-each-green-checkpoint order. Delivered three commits:
  `52afe39` (list over the core API), `ecf9a26` (`tabs` permission + its pins, `A49`), `6a3b3d7` (spec lines for
  `A81`–`A83`).
- the child **stopped and asked instead of inventing wording** for three states — answered as rulings `A81`, `A82`, `A83`
  while it kept working; the report quotes each one as implemented.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **2** (engineer = 1 child across a provider-error `resume`;
reviewer = 1 child across two endpoint-failure `resume`s). No further child on this card.

## Verdicts

- engineer report: delivered, copied to `docs/state/t4-01-engineer.md` — AC1–AC5 self-check shipped, 4 deviations declared
  by number, 5 residual risks, 2 questions escalated (both answered by the PM below)
- reviewer verdict: **accepted**, 0 blocking findings, 1 carried fix (`docs/state/t4-01-review.md`). AC1–AC5 `pass`; `A81`–`A84`
  implemented as ruled; manifest exactly `storage` + `tabs` with the pre-existing pin edited honestly; the `chrome.storage`
  scan test proven non-vacuous (6 popup files, comments stripped); checker re-run by the reviewer (0 errors / 79 INFO) and
  the test delta corroborated read-only (734 declarations at HEAD vs 697 at `c4abdcf`, no `.skip`/`.only`).
- **task status: accepted.** 2 of 4 children used.
- **CF1 carried to `t4-03`** (the reviewer's one open item): the row contract is pinned, but nothing pins the *placement*
  half of AC4/AC5 — that the notices render **above** the list, that the empty-state paragraph renders at all, and that the
  list block and the `Удалить` button are not hidden behind an ownership or notice condition. One grep trio in
  `tests/toolchain-contract.spec.ts`; see `docs/state/t4-01-review.md` → "Carried fixes".
- **PM gates re-run personally** (`A77`): `npm run build` green (10 files), `npm test` **734/734** over 39 files (+37),
  `node scripts/check-agent-config.mjs` 0 errors / 0 warnings / 79 INFO, `npm run typecheck` exit 0, tree clean

## PM rulings on this task (asked by the engineer, answered before delivery)

- `A81`: the not-injectable state gets a line, wording «На этой странице подсветка недоступна» — the Edge Cases sentence
  requires the popup to *state* it, so "no line" was not a legal option.
- `A82`: **the spec outranks the task card.** Foreign marking reuses the shipped ownership header (own «Вы», foreign the
  stored name) plus a CSS row marker; no «Не: » prefix — a second way of naming one fact in a second layer is exactly what
  grep anchors exist to prevent. The card's AC3 line was corrected accordingly.
- `A83`: with no usable name the notice «Укажите имя в настройках» renders **above** the list and the list still renders —
  hiding it would make stored entries invisible and undeletable; the notice itself is the keyboard-reachable control that
  calls `chrome.runtime.openOptionsPage()` and writes nothing.
- `A84` (answers the engineer's open question 1): a **refused** `setVisible`/`deleteEntry` stays silent — the popup re-reads
  the page and shows what the store says. `Assumption:` recorded because no spec line covers it and inventing a sentence for
  an unlisted state is a bigger observable change than staying silent. Overturning it = one string + one spec line + one test.

## Open questions

- none open: `A49` is decided (the `tabs` permission); the README line explaining it in Russian belongs to `t4-03`.
- `A50` is a PM default; if the user wants an instant repaint without reload, it belongs in `t4-03`, not here.
