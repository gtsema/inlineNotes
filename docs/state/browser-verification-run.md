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
