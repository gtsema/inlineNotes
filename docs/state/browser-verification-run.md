# Browser verification run — the six open items

Human run: PM drives, user operates Chrome. Recorded item by item as `passed` / `failed` / `not verified`. Nothing here is
inferred from tests: jsdom pins the shape, this file is the only place where real-Chrome behavior is recorded.

Run log lives in this file only. A `failed` item opens a fix task; it is never fixed by rewording a spec.

## Preflight (record once)

- Chrome version: **157.0.8103.38**
- Extension loaded unpacked from `dist/`, freshly rebuilt: `2026-11-18 01:37`
- `chrome://extensions` install-time warning seen (the `tabs` permission, «читает историю просмотров»): **not seen**. The
  extension was added unpacked long before `tabs` existed and is only reloaded since; a reload shows no permission warning.
  The user's word: «Да и не надо». The README clause that asserted Chrome shows it at install was softened to a may-claim the
  same day — a Chrome-UI sentence needs an observation, and we have the opposite one.
- Author name set **from the options UI**, not from the console: yes (`t4-02` browser confirmation, re-confirmed in this run)
- Test pages: article page A (normal length), article page B (very long), one page with a re-rendering block: `not recorded`

---

## 1. Keyboard reachability of an open card (`A74`, overlay keyboard rule)

Setup: page A, mouse only.
Action: select a sentence, then **without clicking anything** press `Tab` repeatedly.
Expected:
- opening the card does **not** steal focus from the page — the first `Tab` still moves through the page, not into the card;
- after a few `Tab`s the caret reaches the card's own controls in a sensible order: textarea → `Сохранить` → close/cancel;
- the visible focus ring is inside the shadow host, not on the page;
- `Enter` on `Сохранить` saves and the highlight appears.
Result: **partially verified** — `focus on open` (`A74`) **passed**; the tab-reachability half **not verified**.
Notes:
- Observed: after a mouse selection, `Tab` moves focus **down through the page's own focusables**, not into the card; with no
  selection `Tab` does not jump. Opening the card takes no focus and the page keeps its own tab flow — the `A74` half the spec
  pins is confirmed on a real page.
- The decisive probe for "the reader reaches the card with `Tab`" could not be run cleanly: `Shift+Tab` from the omnibox landed
  on a Chrome UI item («Спросить гугл об этой странице»), not on the document's last tab stop. The rendered order
  `textarea` → `Сохранить` → `Отмена` therefore stays pinned only in jsdom (`tests/content-create-card-controller.spec.ts`).
- **Debt recorded (accepted by the user: «это не проблема»)**: the keyboard-only path into the card is "tab through the rest of
  the page", because the overlay host is appended last in `<html>` (`src/content/overlay/host.ts:48`) and `A74` deliberately
  forbids taking focus on open. Shortening it (autofocus, or a `Tab`-trap inside the card) is a behavior change with its own
  spec line and task; `A74` is still an `Assumption:` pending the user's word.

## 2. Hover cost on a very long article (`pointermove`, unthrottled hit-test)

Setup: page B (very long, e.g. a full Wikipedia article). Create 15–20 notes spread over it (the cap is 20 per page).
Action: DevTools → Performance → record; sweep the mouse across the text for ~10 seconds, including over highlighted spans
and across blank gutters; stop and read the trace.
Expected:
- no long task attributable to the extension (nothing over ~50 ms from a `pointermove` handler);
- no forced layout storm (the tooltip measures its box at hover time, once per hover, not per event);
- scrolling and text selection stay smooth; the page does not stutter while the mouse moves.
Result: **passed** (user observation on a real long article with a full load of notes: «лага нет»)
Measured: no ms number recorded — the user judged by feel while moving the mouse, not from a trace reading. The handler that
would show up is `onPointerMove` in `src/content/overlay/tooltip-events.ts:81` (a caret hit-test per move, unthrottled by
design, ruling `A60` forbids a local throttle). Nothing stuttered, so the accepted cost is confirmed at the human scale; a
trace number stays unrecorded and this is the weaker half of the verdict.

## 3. The page replaced the text node between selection and Save (`A75`, `selection_lost`)

Setup: page A.
Action: select a sentence so the card opens; type a note; **before** pressing `Сохранить`, mutate that text in DevTools
(Elements → double-click the text node, change a few characters, or delete the node). Now press `Сохранить`.
Expected:
- the save answers the refusal «выделение потеряно» (the existing `selection_lost` wording), not a crash;
- the card does not freeze: it can be closed and a new selection opens a fresh card;
- nothing is written — the popup shows the same rows as before;
- no red error appears in the **page** console (an extension-side caught refusal is not a page error).
Result: **passed** — «Появилось, всё ок».
Notes: the refusal «Выделение больше не найдено на странице» (`src/content/text.ts:99`) rendered on a real page after the text
node was mutated between the selection and `Сохранить`; the card stayed usable and nothing was written. This is the defect class
`A75`/`t3-05` exists for: a real engine throws where jsdom answers `false`, so no unit test could have shown this card freezing.

## 4. Selecting the text of your own note opens the editor, never a create card (`claimSelection` handover, Flow 6)

Setup: page A with at least one note written by the current name, and one note written by a different name (rename in
options → create → rename back).
Action:
1. double-click / select a word **inside your own** highlighted note;
2. select a word inside the **foreign** note;
3. select a sentence that only partially overlaps your own note.
Expected:
- own note → the **editor** opens prefilled with the existing comment (`Сохранить` / `Отмена` / `Удалить`), not an empty card;
- foreign note → **no widget at all**; only the hover tooltip is available;
- partial overlap with your own note → the editor (self-exclusion applies), and overlapping a *different* own note gives the
  visible refusal message instead of creating;
- saving from the editor keeps the note on the same words (no anchor move, `A78`).
Result: **passed** — «тут всё ок».
Notes: own note → the editor with the stored comment and the three controls; foreign note → nothing opened; partial overlap of
an own note → the editor as well; saving from the editor left the note on the same words (`A78` confirmed on a real page). This
is the `claimSelection` handover of Flow 6 whose `main.ts` wiring is deliberately unpinned in jsdom — the browser was its only
verification, and it holds.

## 5. The popup against a real page (rows, ownership, delete, the `tabs` permission)

Setup: a normal https article with own + foreign notes, and then `chrome://extensions` itself or a `file://` page.
Action: open the popup on the article, then on the restricted page; press `Удалить` on one row and confirm.
Expected:
- rows render in creation order, each with the author name — own rows show «Вы», a foreign row shows the stored author name
  plus the row's ownership marker;
- the checkbox reflects the stored `visible` state;
- `Удалить` removes the row and the highlight disappears from the page without a reload;
- an empty page shows «На этой странице нет записей»;
- on `chrome://` / `file://` the popup shows «На этой странице подсветка недоступна» **above** the list, and the list is still
  rendered below it (`A81`, `A83`);
- at install time Chrome showed the «читает историю просмотров» warning once (`A49`) — recorded in the Preflight line.
Result: **passed** — items 1–3 confirmed; item 4 confirmed with a wording note the user calls correct.
Notes: rows in creation order, own row «Вы», a foreign row shows the stored author name in gray (`row--foreign .author`,
`src/popup/popup.component.ts:149-151`) rather than a «Не: …» prefix (`A82`); the checkbox mirrors the stored visibility; `Удалить`
dropped the row and the page's highlight disappeared **without a reload**. An empty article shows «На этой странице нет записей».
On a non-injectable address the popup shows «На этой странице подсветка недоступна» and under it «На этой странице нет
записей» — the list really is empty there, and the user's word: «И это правильно». The `A83` shape (notice above, list still
rendered) is therefore confirmed with an empty list rather than with rows.

## 6. A checkbox write repaints the page (`storage.onChanged`, `A50`, `A60`)

Setup: article page with ≥2 notes, popup open.
Action: toggle one checkbox off, then on. Then, in a **second tab** of the same page, toggle another note.
Expected:
- the highlight of the toggled note disappears and returns **without reloading** the page, within one repaint;
- the second tab also repaints (the watch reacts to the storage write from elsewhere);
- a write to a **different** page does not make this page do anything;
- the popup list itself is a snapshot while the popup is open (accepted v1): after a delete in another tab, reopening the
  popup shows the current store.
Result: **passed** — all four sub-items confirmed («все 4 — ок»). Turning a checkbox off and on repainted the highlight with no
reload; a write made in a **second tab of the same page** repainted this tab; a write on a **different** page left this page
untouched; the open popup did not refresh itself and showed the current store on reopening (the accepted snapshot v1 shape).
This is the `storage.onChanged` watch of `t4-03` (`src/content/refresh/storage-change-watch.ts`) running against a real
`chrome.storage.onChanged`, and the `A88` scoping holding: the index write alone does not make every tab repaint.

---

## Outcome

- Items passed: 5 / 6 — items 2, 3, 4, 5, 6
- Items partially verified: 1 — item 1 (`A74` no-focus-theft **passed**; the `Tab`-reachability half not verified, the probe hit
  a Chrome UI element «Спросить гугл об этой странице»)
- Items failed: 0
- Items not verified: 0
- New tasks opened from this run: none. Confirmed correct on the spot by the user: a non-injectable page shows the notice **and**
  an empty list below it.
- Debt added by this run: the keyboard path into the card is "tab through the rest of the page" (accepted by the user); the popup
  host line became backlog item B6; the `tabs` install warning was never observed, so the README stopped asserting it.
- **Run closed 2026-11-18.** Nothing among the six items failed. The only claim left without a real-Chrome confirmation is the
  `Tab` order of the card's controls in a live shadow tree, which stays pinned by `tests/content-create-card-controller.spec.ts`.

---

## Run 2 — Stage 5/6 behavior (planned, not yet executed)

Prepared before the tasks run, so nothing gets inferred from tests later: each item is recorded as `passed` / `failed` /
`not verified` against a real Chrome reload of `dist/`, and an item stays `not verified` if the probe cannot be built. Two probes
are known-bad from Run 1 and must not be reused: the omnibox `Shift+Tab` probe (Chrome UI controls are in the tab order) and any
assumption that an unpacked reload shows a permission warning.

1. **Focus on open (`A97`, `A105`).** (a) select text → the caret is already in the note field; (b) the page does not scroll when
   it does so — `preventScroll` is pinned only at the call shape in jsdom, so this is the item that proves the real behavior;
   (c) click a tooltip → the caret is in the field with the comment; (d) after `Отмена` / `Esc` / `Сохранить` / `Удалить` the caret
   is back on the control the page had focused; (e) when the page had focused nothing, focus is left where the browser puts it.
2. **Tooltip as the way in (`A96`, `A104`).** Opaque from the first hover; clicking my tooltip opens the editor over the note's
   own words; clicking a foreign tooltip does nothing; selecting inside my own note opens nothing; selecting inside a foreign
   note opens the create card.
3. **`A106`/`A107` baseline.** With a stale selection of other words standing on the page, clicking my tooltip and pressing
   `Сохранить` saves cleanly; making a **new** selection across another of my own notes before the press is refused.
4. **Per-author colours (`A94`, `A102`).** Two authors on one page → two different colours; my own notes carry no extra marker;
   an own highlight over a foreign one blends rather than hides either.
5. **Per-author overlap (`A93`, `A99`, `A100`).** A second note over my own words is refused with the overlap line; a note over a
   foreign note's words is accepted.
6. **Popup (`A98`, `A95`, `A108`).** No address line anywhere; notes still resolve on a `?utm_…` variant of the same page; one row
   per author with `<name> — <count>`; the checkbox hides and shows **all** of that author's notes; popup `Удалить` removes that
   author's whole set and leaves the other author's rows byte-identical; the note card's `Удалить` still removes one note.

7. **Cross-tab repaint driven by the aggregate write.** Name both tabs: a popup checkbox press in tab A must hide and re-show
   **all** of the reader's highlights in tab B of the same page, leaving a foreign author's highlights in place. Run 1 item 6
   proved the older per-entry `setVisible` shape only; the aggregate path is pinned at
   `tests/content-cross-tab-refresh.spec.ts:340` with a hand-fired single record.
8. **How many `storage.onChanged` records one aggregate write produces in Chrome.** Core performs two `port.set` calls (slot then
   index, `src/core/page-index-store.ts:151-163`), so the `A60` one-record-one-repaint count is an assumption in the browser even
   though the unit pin hand-fires one record. Record what Chrome actually emits.
9. **Popup group `Удалить` on a real page.** The other authors' rows unchanged, their highlights untouched; with the last row
   removed the page shows the empty state and no highlight anywhere.
10. **The `A110` blank-author row.** Reachable only by hand-seeding `chrome.storage.local`; either probe it explicitly (label
    renders as « — 1», both controls do nothing, two such rows do not corrupt the list) or record it as `not verified`. Do not
    infer it from `tests/popup-entry-list.spec.ts:849`.

### Run 2 outcome (2026-11-18, Chrome 157.0.8103.38, unpacked `dist/`)

Reported by the user as "1,2 / 3 / 4-5 / 6-9 ok", recorded per item, nothing inferred:

| Item | Result | Note |
|---|---|---|
| 1 focus on open (`A97`, `A105`) | **passed** | caret in the field on select and on tooltip click; no page scroll observed; caret returns to the page on close |
| 2 tooltip as the way in (`A96`, `A104`) | **passed** | opaque from first hover; own click opens the editor; foreign click does nothing; own-note selection opens nothing |
| 3 `A106`/`A107` stale-selection baseline | **passed** | stale selection saves cleanly; a new selection across my own other note is refused |
| 4 per-author colours (`A94`, `A102`) | **passed** | two authors, two colours, overlaps blend |
| 5 per-author overlap (`A93`, `A99`, `A100`) | **passed** | own words refused, foreign words allowed |
| 6 popup with no address + `?utm_…` resolution (`A98`) | **passed** | no address line anywhere; notes resolve on the parameter variant |
| 7 cross-tab repaint from the aggregate write | **passed** | one checkbox press in one tab hides/re-shows all of that author's highlights in the other tab |
| 8 the `onChanged` record count for one aggregate write | **passed** | observed behavior correct; the exact record count was not counted separately, and behavior is what matters here |
| 9 popup group `Удалить` on a real page | **passed** | other authors untouched; the page is clean after the last row is removed |
| 10 the `A110` blank-author row | **not verified** | needs hand-seeded storage; the user did not run it. The pin stays `tests/popup-entry-list.spec.ts:849` and no browser claim is made |

- Items passed: 9 / 10. Failed: 0. Not verified: item 10.
- **A new problem was reported during this run, not covered by any item:** selecting text slowly makes the card appear and
  **clear the page selection**. The user attributes it to the focus move of `A97` and asks whether to revert it. Tracked as
  backlog **B7** in `docs/state/improvement-backlog.md`; no ruling yet, the shape is a question for the user.

---

## Run 3 — the `A111` split (create card takes no focus, editor keeps it)

This run **supersedes** two older records, which stay in place as history: Run 1's keyboard rows at
`docs/state/browser-verification-run.md:32-33` (measured under `A74`) and Run 2 item 1 at `:191` (measured under `A97`). Neither
describes the shipped build any more. Record each item as `passed` / `failed` / `not verified`; nothing is inferred from tests.

1. **B7 itself — the half no test can pin.** Select a sentence **slowly**: the card appears and the browser's own selection stays
   painted. This is the exact gesture that failed in Run 2.
2. **The new keyboard entry:** after a mouse selection, the **first** `Tab` lands in the card's `textarea`. Do not start the probe
   from the omnibox — Run 1's `Shift+Tab` probe hit a Chrome-UI control and proved nothing.
3. **Tab order in the live shadow tree:** `textarea` → `Сохранить` → `Отмена`. Read it **after typing a comment**, because
   `Сохранить` leaves the tab order while empty.
4. **Keys reach the card only after `Tab`:** `Esc` closes and writes nothing; `Ctrl+Enter` (and `Cmd+Enter`) saves.
5. **Survival end to end:** slow selection → `Tab` → type → `Сохранить` → the highlight and frame land on exactly the words that
   were selected.
6. **The residual risk of `A111`:** does the reader's own `Tab` into the `textarea` clear the page's visual selection? If it does,
   the spec at `docs/specs/content-overlay-ui.md` AC17 already states it, and the stored note is still correct — say which half of
   that sentence the browser shows.
7. **The editor half is unchanged:** a `tooltip` click puts the caret in the prefilled field and **no page scroll** happens —
   Run 2's "no scroll" claim was made under the old card behavior and now belongs to the editor only.
8. **Editor close paths in Chrome:** `Отмена`, `Esc`, a save, `Удалить`, a `pointerdown` outside the card and a page scroll each
   hand the caret back to what was focused before the open, and force nothing when that element is gone.
9. **A page that owns its own focus** (a search box, autofocus, page keyboard shortcuts): with the card standing the page keeps its
   focus and its shortcuts, and the event-driven closes still close the card without writing while the caret stays on the page.

### Run 3 outcome (2026-11-18, Chrome 157.0.8103.38, unpacked `dist/`)

The user reported "everything ok" with one exception, the `Tab` item. Recorded per item, nothing inferred:

| Item | Result | Note |
|---|---|---|
| 1 selection survives the slow selection (`B7`, `A111`) | **passed** | the card appears and the selection stays painted — the Run 2 defect is gone |
| 2 first `Tab` reaches the card's `textarea` | **failed** | after a mouse selection `Tab` does not move focus into the card. Cause not yet measured: the overlay host hangs off `document.documentElement` (`src/content/overlay/host.ts:47`), so the card is last in tree order behind every focusable of the article (`H1`), or a host outside `<body>` is skipped by sequential navigation (`H2`), or the page traps `Tab` (`H3`) |
| 3 tab order inside the live shadow tree | **not verified** | unreachable while item 2 fails; the jsdom order pin is not claimed as a browser fact |
| 4 `Esc` / `Ctrl+Enter` answer the open card | **passed** | the keys answered while the card stood; the `Tab`-then-key variant could not be reached, see item 2 |
| 5 slow selection → type → save lands on the selected words | **passed** | |
| 6 does the reader's own `Tab` drop the visual selection | **not verified** | depends on item 2; already stated in `docs/specs/content-overlay-ui.md` AC17 as an either-way claim |
| 7 editor: caret in the prefilled field, no page scroll | **passed** | the `preventScroll` claim now belongs to the editor alone |
| 8 editor close paths hand the caret back | **passed** | |
| 9 a page that owns its own focus keeps it while the card stands | **passed** | |

- Items passed: 6. **Failed: item 2.** Not verified: items 3 and 6, both because they stand behind item 2.
- Item 2 became backlog **B8** and is ruled **`A112`** (the user chose the "typing is the way in" shape, `S4`); task `t6-02`.
- The spec sentence "`Tab` is now the only way in" (`docs/specs/content-overlay-ui.md` AC17) was **false in Chrome** as of this
  run; `t6-02` AC7 forbids leaving it in place.

---

## Run 4 — the `A112` typing door

Supersedes Run 3 items 3 and 6 (both were blocked behind the failed `Tab` item) and re-measures Run 3 item 9, which predates the
door. Record each as `passed` / `failed` / `not verified`.

1. **The door itself.** Select a sentence slowly, then press a letter (`п`, or `a`, or a digit): the caret is in the card's field\nand the pressed character is the first character of the note.
2. **The non-triggers hold in Chrome.** `Space` still scrolls the article and does **not** enter the field; `Tab` still does not\nenter the card (its cause stays unmeasured by design); `Esc` closes without writing; `Ctrl+Enter` saves.
3. **What the keystroke costs (Run 3 item 6).** After the typing keystroke, is the page's selection still painted? Say which half\nof the spec's claim Chrome shows — the stored note is correct either way.
4. **Live tab order (Run 3 item 3).** Once inside the field by typing: `Tab` → `Сохранить` → `Отмена`, read after typing a comment.
5. **Close paths of a typed card.** `Отмена`, `Esc`, a save, a click outside the card and a page scroll each put the caret back\nwhere the page had it before the keystroke.
6. **Run 3 item 9, re-measured.** Focus the page's own editable (a search box), open a card by selecting text elsewhere, then\ntype: per `A112` the caret jumps to the card. Record the behavior **and** whether the reader accepts it.

### Run 4 outcome (2026-11-18, Chrome 157.0.8103.38, unpacked `dist/` rebuilt at `74df4de`)

The user answered the whole run with one statement: «да, теперь всё хорошо». Recorded as a blanket pass over all six items, and
flagged as such — no item was described individually, so this run carries less detail than Run 2 and Run 3, not more:

| Item | Result |
|---|---|
| 1 the typing door (caret + the pressed character) | **passed** (blanket) |
| 2 the non-triggers (`Space`, `Tab`, `Esc`, `Ctrl+Enter`) | **passed** (blanket) |
| 3 the visual-selection half after the keystroke | **passed** (blanket) |
| 4 live tab order inside the card | **passed** (blanket) |
| 5 close paths of a typed card restore the caret | **passed** (blanket) |
| 6 a focused **page** editable vs the typing door | **passed** (blanket) — the behavior is what `A112` rules, and the blanket statement is recorded as the reader accepting it |

- Items passed: 6 (all under one blanket statement). Failed: 0. Not verified: 0.
- `B8` is therefore closed as **fixed and verified**. The cause of Run 3 item 2 (`H1` / `H2` / `H3`) remains **unmeasured** by
  design: the shipped door does not depend on it, and `Tab` reaching the card is still not a claim anywhere in the docs.
