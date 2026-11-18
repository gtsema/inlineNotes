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

## Answers and rulings (2026-11-18, the user answered the pool)

The user's word on process: «Делай все задачи и привлекай меня только для проверки после реализации всего. Если какие-то вопросы
в процессе — решай сам, но зафиксируй.» So the PM rules on the open questions below and does not interrupt the user until the
whole set is implemented and needs a browser check.

- `A93` (**B1**, answers 1–2 = defaults): the overlap and duplicate checks become **per author**. Author identity is exact
  `authorName` string equality, the same identity the edit-rights rule uses; two people named «Я» are one author. A candidate
  span is rejected only when it intersects or duplicates an entry **whose `authorName` equals the current name**. Selections over
  foreign text stay legal and may overlap foreign entries.
- `A94` (**B2**, answers 3–5 = defaults): one highlight name **per author**, colored from a fixed **6-color palette** chosen by
  a deterministic hash of `authorName`, so the same author keeps the same color across pages and reloads. Own notes get **no**
  extra page marker (the tooltip header already says «Вы»). Where an own highlight and a foreign highlight overlap, the blend the
  CSS Highlight API produces is accepted; no z-order control is invented.
- `A95` (**B3**, answers 6–9): the popup renders **one row per author on this page** — the author name (own row «Вы») plus the
  count of that author's entries («Вася — 10»). The row checkbox toggles **all** of that author's entries on the page; it reads as
  checked only when every one of them is visible. `Удалить` on a popup row deletes **every entry of that author on this page**;
  `Удалить` inside the note card deletes **only that note**. The group does not expand: the popup has no second level in v1.
  Shape decision: `visible` stays on the entry (no storage migration); the group checkbox is an **aggregate write** over that
  author's entries, and the core gains one named operation for a by-author delete so the popup does not loop deletes itself.
- `A96` (**B4**, answers 10–11): the hover tooltip is **opaque from the first hover**; clicking the tooltip **opens the editor of
  that note**. And, per the user's sentence «выделение подсвеченной части не делает ничего»: selecting text inside **one's own**
  highlighted note opens **nothing**. **Flow 6 and the `claimSelection` handover are retired** — its pins go with it. Foreign
  highlighted text is not special: selecting it opens the create card (allowed by `A93`). The tooltip keeps hiding on scroll and
  keeps not blocking text under the cursor; only the opacity and the click answer change. `src/content/overlay/tooltip-style.ts:65`
  already carries `pointer-events: auto`, so the click is reachable without touching the host's `pointer-events: none`.
- `A97` (**B5**, answers 12–13): opening the create card **and** the editor moves focus into their `textarea`. **`A74` is
  overturned** — the user asked for the intrusion. Two guard rails: the page must not scroll when focus moves (the overlay host is
  fixed-position, verify in the browser), and `Esc` / `Ctrl/Cmd+Enter` keep answering an open card. The keyboard-path debt from
  browser item 1 disappears with this ruling.
- `A98` (**B6**, answer 14): the popup's page-host line is removed entirely. The active-tab address **read** stays (`A49`), so the
  `tabs` permission stays; the popup contract spec line loses its host half.

## Status

Ruled and **scheduled**: Stage 5 = `t5-01-author-overlap`, `t5-02-author-colors`, `t5-03-tooltip-click-editor`; Stage 6 =
`t5-04-focus-on-open`, `t5-05-popup-host-line`, `t5-06-popup-author-groups`. See `docs/state/plan-implementation.md`.

## Rulings issued while `t5-01` was in flight (2026-11-18, engineer escalation — the engineer was right to stop)

- `A99` (**one author identity, everywhere**): the per-author filter uses the shipped `isSameAuthor`
  (`src/core/entry-rules.ts:125`: trim both sides, case-sensitive, an empty side never matches) — the same identity `canEdit`,
  the «Вы» tooltip label and `docs/specs/inline-comment-model.md:77` already use. My card asked for **exact `===` equality** in
  one AC line while `A93` said "the same identity as edit rights"; those cannot both hold, and a second identity would answer
  one pair of strings two different ways. Consequence: a stored record authored by `"Я "` **does** block an attempt under `"Я"`.
  `A93` is corrected by this ruling — "exact string equality" was wrong, "the identity `isSameAuthor` implements" is what is
  meant. Reachability note kept from the escalation: since `createEntryOnPage` stores a trimmed name, an untrimmed author only
  arrives through a hand-written storage record, so the choice is observable in almost no real case — which is exactly why the
  single identity wins.
- `A100` (**the per-author rule is not one call site**): overlap is per-author **at both** call sites — the creation gate
  `assertCreatable` and the editor's direct `findOverlappingEntry` (`src/content/editor/edit-entry.ts:153`, self-exclusion `A45`
  untouched). The user's rule is about authors, not about a function; a spec line that is true for new ranges and false for
  moved/re-derived ones is the half-true documentation the previous stage just spent a task on. `src/core/entry-overlap.ts`
  stays pure and unchanged; the shared filter is one exported core projection `entriesOfAuthor(entries, currentName)` built on
  `isSameAuthor` (additive core vocabulary, `A87` precedent). The `t5-01` brief is amended to name `src/content/editor/edit-entry.ts`
  as the one authorized `src/content/` file, per the `A90` naming rule.
- Process note for the retro: the escalation arrived **before** any line was written, and it caught a contradiction inside my own
  brief (AC8 vs the card's own identity sentence) plus a scope hole the spec made visible. That is the brief-reading behavior I
  want; the fix on my side is to never write "exact equality" and "the same identity as X" in one paragraph.

## Shape rulings issued at delegation time (`A102`–`A104`)

The user's answers fix **behavior**, not implementation; a brief that leaves the shape to the engineer invites a redesign mid-task.
These three name the shape, so the engineer's only job is to implement and test it.

- `A102` (**the palette lives in the paint layer, 6 slots, index = `fnv1a32(authorName) % 6`**): a new
  `src/content/paint/paint-palette.ts` holds exactly six declaration sets; slot 0 keeps the shipped blue `rgba(122, 162, 247, 0.26)`
  verbatim so a one-author page can look unchanged. The slot index reuses the hash core already ships
  (`fnv1a32`, `src/core/slot-key.ts:117`) by **import** — content→core is the allowed direction, so no core file is edited and no
  second hash appears. `paint-plan.ts` attaches the slot from the entry's `authorName`; `paint-style.ts` keeps emitting **one rule
  per entry name** (`A70`) and only swaps the declarations. Rejected alternatives: one highlight name per author (breaks the
  per-entry hit-testing `A70` depends on), a per-author unbounded palette (a stylesheet that grows with the page), and storing the
  color in the entry (a display property in a stored record would strand old records when the palette changes).
- `A103` (**when a selection opens nothing**): only a selection **wholly inside one of my own** entry's resolved range is silent.
  A selection inside a **foreign** note opens the create card (legal since `A93`), and a selection **partially** covering my own
  note opens the create card whose save is then refused by the own-author overlap rule of `t5-01`. Narrowing the silence to the
  strictly-contained own case is what keeps one rule instead of three near-duplicates.
- `A104` (**how the editor opens with no selection**): the tooltip click opens the editor over the entry's **own resolved range
  from the paint pass**; no selection, no re-derivation, `A78` untouched (`comment` + `updatedAt` only). The re-selection overlap
  check stays where it is with the self-exclusion of `A45`/`A100` — it simply has nothing to collide with. Deleting it would be a
  silent behavior change under a task that did not ask for one.

- `A105` (**`B5` shape**): focus goes to the `textarea` of the create card **and** of the editor on open; both calls pass
  `preventScroll: true` (the host is `position: fixed`, so a scroll would move the page under the reader, and no test DOM can
  demonstrate a scroll — hence the pin is on the call shape); closing hands focus back to the element the page had focused
  **if it is still connected**, and forces nothing otherwise (no `body` hijack). No `tabindex` is introduced, so the rendered
  order stays the tab order. The focus-restore half is **my** decision, not the user's word, and is recorded in the spec with an
  `Assumption:` marker: without it, closing a card would leave the active element inside a removed shadow tree.

- `A106` (**what the editor keeps as its baseline**): the boundary points of the **`PaintedEntry` the tooltip click opened**, from
  the paint pass — never "whatever selection the page happened to hold" at the click. The `t5-03` review verdict was `blocked` on
  a spec-vs-code contradiction of exactly this kind (`content-overlay-ui.md:19` and `:95` vs `editor-controller.tsx` `keepBaseline`);
  the engineer had flagged it as an open question and my brief had not answered it, so the fault is the brief's. Observable
  consequence, pinned by name: a page that already holds a stale selection when the tooltip is clicked saves cleanly (no overlap
  refusal), and only a **new** selection differing from the note's own words asks the own-author overlap question. Rejected
  alternative: the page-selection baseline, which would let a selection the reader never made refuse a save.
