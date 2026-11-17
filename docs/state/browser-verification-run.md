# Browser verification run — the six open items

Human run: PM drives, user operates Chrome. Recorded item by item as `passed` / `failed` / `not verified`. Nothing here is
inferred from tests: jsdom pins the shape, this file is the only place where real-Chrome behavior is recorded.

Run log lives in this file only. A `failed` item opens a fix task; it is never fixed by rewording a spec.

## Preflight (record once)

- Chrome version: `not recorded`
- Extension loaded unpacked from `dist/`, freshly rebuilt: `2026-11-18 01:37`
- `chrome://extensions` install-time warning seen (the `tabs` permission, «читает историю просмотров»): `not recorded`
- Author name set **from the options UI**, not from the console: `not recorded`
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
Result: `not verified`
Notes:

## 2. Hover cost on a very long article (`pointermove`, unthrottled hit-test)

Setup: page B (very long, e.g. a full Wikipedia article). Create 15–20 notes spread over it (the cap is 20 per page).
Action: DevTools → Performance → record; sweep the mouse across the text for ~10 seconds, including over highlighted spans
and across blank gutters; stop and read the trace.
Expected:
- no long task attributable to the extension (nothing over ~50 ms from a `pointermove` handler);
- no forced layout storm (the tooltip measures its box at hover time, once per hover, not per event);
- scrolling and text selection stay smooth; the page does not stutter while the mouse moves.
Result: `not verified`
Measured: (worst task ms / handler name)

## 3. The page replaced the text node between selection and Save (`A75`, `selection_lost`)

Setup: page A.
Action: select a sentence so the card opens; type a note; **before** pressing `Сохранить`, mutate that text in DevTools
(Elements → double-click the text node, change a few characters, or delete the node). Now press `Сохранить`.
Expected:
- the save answers the refusal «выделение потеряно» (the existing `selection_lost` wording), not a crash;
- the card does not freeze: it can be closed and a new selection opens a fresh card;
- nothing is written — the popup shows the same rows as before;
- no red error appears in the **page** console (an extension-side caught refusal is not a page error).
Result: `not verified`
Notes:

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
Result: `not verified`
Notes:

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
Result: `not verified`
Notes:

## 6. A checkbox write repaints the page (`storage.onChanged`, `A50`, `A60`)

Setup: article page with ≥2 notes, popup open.
Action: toggle one checkbox off, then on. Then, in a **second tab** of the same page, toggle another note.
Expected:
- the highlight of the toggled note disappears and returns **without reloading** the page, within one repaint;
- the second tab also repaints (the watch reacts to the storage write from elsewhere);
- a write to a **different** page does not make this page do anything;
- the popup list itself is a snapshot while the popup is open (accepted v1): after a delete in another tab, reopening the
  popup shows the current store.
Result: `not verified`
Notes:

---

## Outcome

- Items passed: 0 / 6
- Items failed: 0
- Items not verified: 6
- New tasks opened from this run: none
