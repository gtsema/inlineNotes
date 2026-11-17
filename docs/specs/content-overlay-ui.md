# content-overlay-ui

## Purpose / Goal

Define everything the user sees and touches: the selection card, the page highlight, the hover tooltip, the in-place editor, and the extension popup contract for one page. The behavior here must be observable by a person loading `dist/` in Chrome.

## Scope

In scope: selection capture UI, highlight painting via the CSS Highlight API, tooltip, create/edit/delete widget, popup list and per-entry checkboxes, options page fields, SPA refresh, isolation from the host page.
Out of scope: storage layout, caps, authorship, anchoring rules (`inline-comment-model.md`), build tooling details.

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `selection card` | — | card that appears near a new selection with the comment input |
| `editor` | «Редактирование» | the same widget used for create and for edit |
| `tooltip` | — | semi-transparent card shown on hover over a highlight |
| `highlight` | «подсветка» | CSS Highlight painting of the entry range |
| `highlight frame` | — | translucent outline drawn around the highlighted range |
| `text fragment` | — | one contributing text node the paint is built over; the contract and both offset domains are owned by `inline-comment-model.md` |
| `page text stream` | — | the normalized stream the content layer rebuilds for every re-resolve; its construction rules are owned by `inline-comment-model.md` |
| `all-or-nothing locate` | — | the locate rule (`A36`) owned by `inline-comment-model.md`: every fragment of a resolved range or none of them |
| `entry row` | — | one popup line: author name + show/hide checkbox |
| `visibility flag` | — | per-entry boolean deciding whether its highlight is painted |
| `card placement` | — | where the selection card sits: below the first `text fragment` of the selection **that has a box**, above it otherwise, and against the viewport itself when no fragment has a box (rulings `A30`, `A65`) |
| `card gutter` | — | the 8 px distance kept between the card and the viewport edge, and between the card and the selected text (ruling `A30`) |
| `settle delay` | — | how long a selection has to stop moving before a card is opened: **150 ms**, the constant `SELECTION_SETTLE_MS` in `src/content/overlay/card-events.ts` (ruling `A63`); a test asserts the constant equals this value, and the wiring argument of the same name exists only so a test can observe a pending timer |
| `close-on-scroll` | — | the lifetime rule (ruling `A32`): a scroll closes an open card instead of chasing it |
| `settings gate` | «Укажите имя в настройках» (the popup names this state) | the core settings read that decides whether a card may open at all (ruling `A31`) |
| `refusal line` | see "Refusal message map" | the line the card shows under the input when the write refused, and the only place its wording is decided |

## Flow / Sequence

1. User selects text on the page → once the selection has stopped moving for the `settle delay`, and once the `settings gate` answers with a usable name, the selection card opens at the `card placement` of that selection with an empty textarea, a live counter `0/256`, and buttons `Сохранить` / `Отмена`. A selection that resolves to no span at all opens nothing.
2. User types and presses `Сохранить` → the span is re-derived against a freshly rebuilt `page text stream` (ruling `A29` in `inline-comment-model.md`), core validates, the entry is stored, the card closes, the highlight and its translucent frame appear.
3. User hovers a highlight → a semi-transparent tooltip appears near the range with the comment text and the author name.
4. User clicks the tooltip → the tooltip becomes fully opaque and turns into the editor: the textarea is editable, the buttons are `Сохранить`, `Отмена`, `Удалить`.
5. `Сохранить` updates the entry; `Отмена` or a click outside or `Esc` closes without changes; `Удалить` removes the entry and its highlight.
6. Selecting text that is already exactly/inside an existing entry's range opens that entry's editor instead of creating a new card.
7. The popup lists `entry rows` for the current page; each checkbox toggles that entry's `visibility flag` and repaints immediately.
8. URL changes (SPA push/replace, back/forward, hash change) → the content script re-requests entries for the new `pageKey`, drops old highlights, and paints the new set.
9. Options page: a single `Имя` field with `Сохранить`; empty value is rejected with `Имя обязательно`.

## Rules / Semantics

- Highlight painting: CSS Highlight API (`CSS.highlights` + `::highlight(inline-notes)`), one named highlight per entry. Painting never mutates the host DOM and never adds elements to the page body other than the overlay host.
- Text stream and fragments: before painting, the resolved anchor range is mapped onto `text fragment`s taken from a freshly rebuilt `page text stream`. The stream construction (block boundary space, excluded subtree), the fragment contract, the code-point versus UTF-16 domains and the locate codes `anchor_not_found` / `anchor_stale` are owned by `inline-comment-model.md` -> Rules / Semantics. Painting consumes the fragments it is given, never runs a text search of its own, and never paints a range that was not resolved against the current stream. The locate result is `all-or-nothing locate` (ruling `A36`): painting receives either every fragment of the resolved range or no fragment at all, so half of a remembered selection is never painted.
- `highlight frame`: `outline`-like translucent border around the highlighted box set (`text-decoration`/`outline` on the highlight pseudo-element), `rgba` color, no background fill of the author's own color choice — one shared style for all entries.
- Own entries and foreign entries are visually distinguished only in the tooltip header (`Вы` vs the author name); the highlight style is identical.
- Tooltip default opacity: semi-transparent (about 0.75); after click: 1.0 and the textarea receives focus. Only one editor instance may be open at a time.
- Overlay host: a single element with `position: fixed`, `z-index: 2147483000`, isolated styles (all rules namespaced under one host with a shadow root so page CSS cannot reach the widgets and widget CSS cannot leak out).
- Registered schemes: the content script is registered for `http://*/*` and `https://*/*` only (`src/manifest.json` -> `content_scripts[0].matches`); `file://`, `chrome://`, Web Store and PDF viewer pages are never injected into.
- Selection capture ignores selections inside the overlay host and inside `chrome://`, Web Store and PDF viewer pages (content script is not registered there).
- Card placement (ruling `A30`): the card is one `position: fixed` box inside the shadow root, so its coordinates are viewport coordinates and it never scrolls with the page. It is placed **below** the box of the *first* `text fragment` of the selection **that has a box** when the whole card fits above the bottom `card gutter`, and **above** that fragment otherwise; its left edge and its top edge are clamped into the same 8 px gutter, so a selection at the very edge of the window still gets a reachable card; a card taller than the viewport is pinned to the top gutter rather than centered off-screen. The anchor box is measured with the same node-local UTF-16 offsets the paint uses, and the card box is measured after the mount, because the card stylesheet — not the placement code — decides its size.
- A `text fragment` box with no area takes no part in `card placement` (ruling `A65`). A fragment in a hidden or detached subtree contributes text to the `page text stream` (ruling `A1`) and measures as a zero box, and a zero box has no place next to it, so the placement walks to the next fragment of the span and stops at the first box that has an area. When **every** fragment of the span measures zero area there is no anchor point at all, and the card is placed by the same rule against the viewport itself — clamped into the 8 px `card gutter` — never at the corner of the overlay host and never at the coordinates of the zero box. The card still opens: a span that resolved is a span the user can write a note about.
- Card lifetime (ruling `A32`): an open card is **closed, never repositioned**, when the page scrolls or when the selection moves to other boundary points; a scroll also cancels a capture that has not settled yet. After a close caused by a selection change, the settled selection opens a new card, which is Flow 1 happening again rather than a move of the old one. A `selectionchange` whose target is not the document answers nothing at all (the card's own textarea holds a selection while the user types), and a `pointerdown` inside the overlay host is not "outside": the card keeps its text. `Отмена`, `Esc` and a `pointerdown` outside the host discard the card and write nothing.
- Settings gate before the card (ruling `A31`): one capture attempt performs exactly one core `loadSettings` read, and "is there an author" is answered by core `validateAuthorName`, never by a truthiness test of the stored value. A stored name the author rule refuses — empty, or longer than the author cap — opens **no card at all** (not a card whose button can never be used), writes nothing, and shows no `refusal line`; the popup keeps its own «Укажите имя в настройках» message for the same state.
- Selection capture and save moments: a card opens only for a selection that resolves to a span, so an empty, collapsed or whitespace-only selection opens nothing and a user is never invited to type into a note that cannot exist. Saving re-derives everything from the boundaries the card kept, against a stream built at that moment (`A29`); nothing measured while opening is reused for the write. A span that no longer resolves is answered by the content layer with `selection_lost` and «Выделение больше не найдено на странице», nothing is sent to core, and the card stays open with its text — so `entry_invalid` stays a bug-level answer and is never the wording for "there was nothing to create".
- Refusal message map (rulings `A33`, `A47`): one module per UI layer maps every machine-readable code the create path can answer with to the Russian `refusal line`, and the map is total over the code union, so a call site can never invent wording and no code can be left without an answer (`src/content/text.ts` for the content layer). `duplicate` and `overlap` are two different refusals with two different sentences: the same span with the same comment already exists, while an intersecting span belongs to another note; collapsing them would hide which of the two the user has to change. The content-layer map:

  | Code | Russian refusal line |
  |---|---|
  | `name_required` | `Укажите имя в настройках` |
  | `comment_empty` | `Введите текст заметки` |
  | `comment_too_long` | `Заметка длиннее 256 символов` |
  | `page_limit` | `Достигнут лимит 20 записей на странице` |
  | `overlap` | `Выделение пересекается с существующей записью` |
  | `duplicate` | `Такая заметка на этом выделении уже есть` |
  | `quota` | `Хранилище переполнено` |
  | `serialization`, `unavailable`, `layout_version`, `index_malformed`, `storage_unavailable`, `slot_malformed`, `entry_invalid` | `Не удалось сохранить заметку` |
  | `url_unparsable` | `Не удалось определить адрес страницы` |
  | `not_author` | `Эту заметку может изменить только её автор` |
  | `entry_not_found` | `Заметка не найдена` |
  | `selection_lost` | `Выделение больше не найдено на странице` |

  The numbers inside two of those sentences are read from the core constants that enforce them, and the wordings of `overlap`, `page_limit` and `name_required` are the ones already fixed in `inline-comment-model.md`. `tests/content-create-card-boundaries.spec.ts` pins the map's totality over the code union and pins several of these sentences verbatim, so a changed word cannot slip through unnoticed.
- The card and the editor must be reachable by keyboard: `Esc` = cancel, `Ctrl/Cmd+Enter` = save, `Tab` cycles the buttons.
- Counter rules: `N/256`, turns warning color at ≥240, blocks input beyond 256 code points, `Сохранить` is disabled while the comment is empty after trim or over the cap.
- Popup contract: title with the page host, one row per entry in creation order, row content = author name + checkbox (checked = painted on the page). No comment text, no date, no filter of "mine only". Empty state: `На этой странице нет записей`.
- Popup visibility state is persisted per entry id in the entry record, so a reload keeps a hidden entry hidden.
- All strings are Russian and come from one constants module per UI layer.
- Frame scope: top frame only. Closed Shadow DOM content and cross-origin iframes are out of scope for v1.

## Edge Cases

- The anchor box is measured **before** the card is mounted, and a measurement that throws means the card does not open (ruling `A64`). `Range.setStart` / `setEnd` reject when the page shortened or replaced the selected text node during the `settle delay`, so the fragment list the capture built no longer fits the DOM. The capture then answers with nothing: no card is mounted without coordinates, the overlay host stays hidden, no read or write of an entry is attempted, and the next settled selection is a fresh capture. A card is never left on screen whose position the page could not report.
- Every `text fragment` of the resolved span measures zero area (a selection inside a `display: none` subtree, a collapsed text box, a node the page detached during the `settle delay`): the card opens and is placed by the viewport rule of ruling `A65`, inside the 8 px `card gutter`, not at the corner of the overlay host. A fragment whose box has an area later in the span is used instead, so a selection that starts in a hidden paragraph and ends in a visible one gets its card next to the visible words.
- Selection in a scrolled, sticky or transformed container: the card is positioned in viewport coordinates, and a page scroll **closes** it (ruling `A32`) instead of letting it float over text that has moved out from under it; a new selection is needed to open it again. (This line used to promise a reposition on scroll; ruling `A32` replaced that behavior in task `t3-01`, and `src/content/overlay/card-events.ts` implements the close.)
- Highlight of a range that spans several block elements must draw a frame around every fragment box, not one bounding rectangle.
- The site re-renders the article (virtual list, lazy load): a stale highlight disappears; the entry remains in the popup list.
- A locate that reports `anchor_not_found` or `anchor_stale` produces no highlight, no frame and no tooltip at all; the entry is still listed in the popup and still deletable (`inline-comment-model.md` -> Staleness).
- A tooltip near the viewport edge flips to the opposite side; it never covers the range it describes.
- Host page with an aggressive CSS reset or `all: unset`: shadow-root isolation must still render the widget correctly.
- Popup opened while the content script failed to inject (restricted page): the popup still lists the entries and states that the page cannot show highlights.
- Two tabs open on the same page: a change in one tab updates the other tab's highlights and the popup after reopen.
- Entry hidden via its checkbox: no highlight, no frame, no tooltip; the entry is still editable from the page if the user selects its text again.

## Acceptance Criteria

1. On an arbitrary article page, selecting text shows the card with a `0/256` counter and `Сохранить` disabled until at least one non-space character is typed.
2. After save, the selection is painted with a translucent frame and no page element was added or modified in the DOM other than the single overlay host.
3. Hovering the painted text shows a semi-transparent tooltip with the comment and the author name; clicking it makes it opaque and editable.
4. In the editor, `Сохранить` persists the change, `Отмена`, `Esc` and a click outside discard it, `Удалить` removes the entry and its paint.
5. Selecting the text of an existing entry opens the editor for that entry, not a create card.
6. A selection overlapping another entry shows `Выделение пересекается с существующей записью` and creates nothing.
7. The popup shows one row per entry with only the author name and a checkbox; unchecking removes the highlight immediately, checking restores it.
8. Navigating inside an SPA to a different article changes the popup list and the painted highlights without a manual reload.
9. Typing beyond 256 code points is impossible; the counter never exceeds `256/256`.
10. With no usable name in options — empty, or longer than the author cap — no card opens at all, nothing is written, and the popup shows `Укажите имя в настройках`.
11. A host page with a global CSS reset still renders the card and the tooltip with correct fonts and spacing.
12. A page scroll, a selection that moved to other words, `Отмена`, `Esc` and a pointer press outside the overlay host each close the card and write nothing, and the card is never moved to follow a selection or a scroll (`A32`).
13. A selection near the bottom or the side edge of the window gets its card above or inside the edge, and the card never comes closer to the viewport edge than the 8 px `card gutter` (`A30`).
14. Saving the same comment over the same span a second time shows `Такая заметка на этом выделении уже есть`, an intersecting selection shows `Выделение пересекается с существующей записью`, and in both cases the card stays open with the typed text (`A47`).
