# Improvement backlog — user-requested changes (2026-11-18)

Recorded during the browser run, **after** it finishes. Nothing here is implemented; nothing here overrides a ruling until the
PM issues a numbered ruling for it. Each item is one candidate task; several are coupled (noted per item).

Every item below is an **observable-behavior change**: it needs a spec line, an acceptance-criteria update, a test, and — where
a ruling stands against it — an explicit overturning ruling. The PM does not implement any of them.

| # | Request (user's word) | Current shipped rule and who owns it | Conflict to overturn | Coupling |
|---|---|---|---|---|
| B1 | «не могли пересекаться только заметки одного человека» — different users' notes may overlap | `findOverlappingEntry` (`src/core/entry-overlap.ts:133`) rejects any candidate span that intersects any entry of the page, **regardless of author**; the refusal «Выделение пересекается с существующей записью» is `overlap` in `src/content/text.ts:76`; the rule is spec'd in `docs/specs/inline-comment-model.md` | `A26` (overlap rejection at creation) narrows to per-author | needs B2: two overlapping painted ranges in one highlight name collapse visually |
| B2 | «заметки разных пользователей подсвечивались разными цветами» | One paint name for every entry (`PAINT_NAME_PREFIX = 'inlinenotes'`, `src/content/paint/highlight-name.ts:26`) and one `::highlight()` rule in the adopted stylesheet | `A28` (all entries share one highlight name and one rule) | depends on B1 (overlaps must be visible side by side); touches the paint plan and the style surface |
| B3 | «в попап окне были записи только для разных пользователей … если у пользователя1 10 заметок, а у пользователя2 — 3, отображается две записи» | The popup renders **one row per entry** in creation order, each with its own `Удалить` and its own visibility checkbox (`visible: boolean` on the entry, `src/core/entry.ts:58`); the contract is spec'd in `docs/specs/content-overlay-ui.md` (popup AC) and confirmed by `t4-01` | none directly, but it moves `visible` from entry → (author, page) and changes what a row is | see the open questions: delete semantics, counts, per-note access |
| B4 | «при наведении окно было сразу непрозрачным и на него не надо было кликать» | The hover tooltip is translucent until clicked; the click only makes it opaque and changes nothing else — browser-confirmed in Stage 3, spec'd in `docs/specs/content-overlay-ui.md` (AC3 / Flow 4) | the click-to-opaque half of AC3 disappears, so the click needs a new meaning or must do nothing | cheap on its own (a style constant), but it rewrites an AC the user already verified |
| B5 | «при выделении фокус ввода сразу переносился в окно ввода заметки» | `A74` — opening the card takes **no** focus, nothing inside the overlay host is focused, the reader reaches the controls with `Tab` | **`A74` outright** (currently an `Assumption:`, explicitly marked as pending the user's word — this is that word) | closes the keyboard-path debt from browser item 1; needs a check that focusing a control inside the end-of-`<html>` host does not scroll the page |
| B6 | «убрать адрес страницы из попап-окна — там всё равно какие-то кракозябры» | The popup prints the page host under the title: `@if (view().host !== null) { <p class="host">…</p> }` (`src/popup/popup.component.ts:61-63`), fed by `hostOf()` = `new URL(url).host` (`src/popup/page-entries-service.ts:138-146`) | the popup-contract spec line "title with the page host" loses its host half | display only — the address **read** stays (`A49`), so the `tabs` permission stays too |

## Open questions the PM must ask before B1–B3 can be specified

B1 (per-author overlap):
1. Is authorship for the overlap check the **stored `authorName` string** (exact match) or the current-name identity used
   elsewhere? Two people named «Я» are then one author.
2. Do foreign overlapping notes still block *duplicate* text (`duplicate` refusal), or is the duplicate check per-author too?

B2 (per-author colors):
3. Colors chosen by whom — a fixed palette assigned in order of first appearance of an author, or derived deterministically
   from the name? A reader must recognize «это заметки Васи», so the mapping must be stable across pages and reloads.
4. How many distinct colors before the palette cycles? What marks the **current** user's notes (own rows in the popup say «Вы»)?
5. Overlapping own+foreign text: which color wins visually, or is a blend acceptable?

B3 (popup grouped by author):
6. What does the grouped row show — the author name plus a count («Вася — 10»)?
7. What does the checkbox toggle: **all** notes of that author on this page?
8. What does `Удалить` do on a grouped row — delete all of that author's notes on the page (destructive, no undo)? Or does the
   row expand into the individual notes and deletion stays per note?
9. Do we still need access to individual notes (edit, delete one)? If yes, the grouping needs a second level, which the popup
   has never had.

B4 (tooltip opaque on hover):
10. Then what does a click on the tooltip do — nothing, or open the editor (that would merge hover-card and editor)?
11. Is the tooltip still dismissed on scroll, and does it still block text selection under the cursor?

B5 (focus into the card on open):
12. Focus into the `textarea` on open — accepted as a page intrusion now explicitly wanted? Does the same apply to the **editor**
    (opening an existing note) and to the tooltip?
13. If the note is on a page whose text is a form field, focus moves away from the field — acceptable?

B6 (the host line):
14. Drop the line completely, or replace it with something a reader can read (the page's title, or the host only when it is
    ASCII)? The line exists to answer «это список какой страницы?» — removing it leaves the title «Заметки на этой странице»
    with no page identity at all.

## Sequencing the PM proposes (not started, awaiting the user's answers)

1. **B4 + B5 + B6** together: all three are small UI-surface changes (a style constant, a focus call, a template line) that
   overturn or amend rulings the user is overriding by word (`A74`, the click half of AC3, the popup host line). One task, one
   spec edit.
2. **B1 + B2** together: overlap model and paint names are one change — a core rule (per-author overlap) plus the paint surface
   (per-author highlight names). This is a `src/core/` change and needs its own stage.
3. **B3** last: it changes the data model shape of visibility and the popup contract, and its open questions are the most
   expensive to get wrong (destructive delete).

## Status

Not started. The browser run (`docs/state/browser-verification-run.md`) finishes first. B6 was added by the user during the run
on the same date.
