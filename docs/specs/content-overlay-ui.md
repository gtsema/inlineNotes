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
| `entry row` | — | one popup line: author name + show/hide checkbox |
| `visibility flag` | — | per-entry boolean deciding whether its highlight is painted |

## Flow / Sequence

1. User selects text on the page → the selection card opens next to the selection with an empty textarea, a live counter `0/256`, and buttons `Сохранить` / `Отмена`.
2. User types and presses `Сохранить` → core validates, the entry is stored, the card closes, the highlight and its translucent frame appear.
3. User hovers a highlight → a semi-transparent tooltip appears near the range with the comment text and the author name.
4. User clicks the tooltip → the tooltip becomes fully opaque and turns into the editor: the textarea is editable, the buttons are `Сохранить`, `Отмена`, `Удалить`.
5. `Сохранить` updates the entry; `Отмена` or a click outside or `Esc` closes without changes; `Удалить` removes the entry and its highlight.
6. Selecting text that is already exactly/inside an existing entry's range opens that entry's editor instead of creating a new card.
7. The popup lists `entry rows` for the current page; each checkbox toggles that entry's `visibility flag` and repaints immediately.
8. URL changes (SPA push/replace, back/forward, hash change) → the content script re-requests entries for the new `pageKey`, drops old highlights, and paints the new set.
9. Options page: a single `Имя` field with `Сохранить`; empty value is rejected with `Имя обязательно`.

## Rules / Semantics

- Highlight painting: CSS Highlight API (`CSS.highlights` + `::highlight(inline-notes)`), one named highlight per entry. Painting never mutates the host DOM and never adds elements to the page body other than the overlay host.
- Text stream and fragments: before painting, the resolved anchor range is mapped onto `text fragment`s taken from a freshly rebuilt `page text stream`. The stream construction (block boundary space, excluded subtree), the fragment contract, the code-point versus UTF-16 domains and the locate codes `anchor_not_found` / `anchor_stale` are owned by `inline-comment-model.md` -> Rules / Semantics. Painting consumes the fragments it is given, never runs a text search of its own, and never paints a range that was not resolved against the current stream.
- `highlight frame`: `outline`-like translucent border around the highlighted box set (`text-decoration`/`outline` on the highlight pseudo-element), `rgba` color, no background fill of the author's own color choice — one shared style for all entries.
- Own entries and foreign entries are visually distinguished only in the tooltip header (`Вы` vs the author name); the highlight style is identical.
- Tooltip default opacity: semi-transparent (about 0.75); after click: 1.0 and the textarea receives focus. Only one editor instance may be open at a time.
- Overlay host: a single element with `position: fixed`, `z-index: 2147483000`, isolated styles (all rules namespaced under one host with a shadow root so page CSS cannot reach the widgets and widget CSS cannot leak out).
- Registered schemes: the content script is registered for `http://*/*` and `https://*/*` only (`src/manifest.json` -> `content_scripts[0].matches`); `file://`, `chrome://`, Web Store and PDF viewer pages are never injected into.
- Selection capture ignores selections inside the overlay host and inside `chrome://`, Web Store and PDF viewer pages (content script is not registered there).
- The card and the editor must be reachable by keyboard: `Esc` = cancel, `Ctrl/Cmd+Enter` = save, `Tab` cycles the buttons.
- Counter rules: `N/256`, turns warning color at ≥240, blocks input beyond 256 code points, `Сохранить` is disabled while the comment is empty after trim or over the cap.
- Popup contract: title with the page host, one row per entry in creation order, row content = author name + checkbox (checked = painted on the page). No comment text, no date, no filter of "mine only". Empty state: `На этой странице нет записей`.
- Popup visibility state is persisted per entry id in the entry record, so a reload keeps a hidden entry hidden.
- All strings are Russian and come from one constants module per UI layer.
- Frame scope: top frame only. Closed Shadow DOM content and cross-origin iframes are out of scope for v1.

## Edge Cases

- Selection in a scrolled, sticky or transformed container: the card is positioned in viewport coordinates and repositions on scroll without detaching from the range.
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
10. With no name in options, no card opens and the popup shows `Укажите имя в настройках`.
11. A host page with a global CSS reset still renders the card and the tooltip with correct fonts and spacing.
