# Stage 14 — the popup is brought into the settings window's design

Opened by the owner's request (2026-11-19): «теперь нужно привести в порядок дизайн попап окна. он должен соответствовать
дизайну окна настройки».

## What the PM measured before writing anything

The two surfaces are visually unrelated today, and the popup's colours are a **third palette** that belongs to neither the
settings window nor the page overlay:

| Role | Settings window (`A125`, `src/options/options.component.ts`) | Popup today (`src/popup/popup.component.ts`) |
|---|---|---|
| page / card background | `#fdf7ee` (cream) | — (browser default white) |
| ink | `#1b2a33` | `#1f1f1f` |
| secondary text | `#7b6a55` | `#6b6b6b` |
| decorative border | `#a6cbdc` | — |
| rule / separator | — | `#e3e3e3` |
| refusal | `#b3261e` | `#b3261e` (already shared) |
| primary action | `#b8480d` | — |
| confirmation band | `#0f5f7a` on `#eef4f7` | — |

Structurally the popup is a different kind of page too: `width: 320px; padding: 12px; font: 13px/1.45 system-ui`, a plain
`<h1>` with no card, no rounded corners, no border, and rows separated by a hairline. The settings window is a bordered,
rounded cream card (`max-width: 360px`, `padding: 16px`, `border: 1px solid #a6cbdc`, `border-radius: 12px`), centred, with
the `13px/1.45` type scale and the `A125` palette.

**So "match the settings design" is not one change.** It is at least: adopt the palette, adopt the card shape, decide
whether the popup gains the mascot, and decide what happens to the popup's own control shapes (the row checkbox and the
`Удалить` button are unstyled browser controls today). Four decisions, and three of them are observable.

## What the spec says today, and where it will have to move

- `docs/specs/content-overlay-ui.md:155` — the **Popup contract** sentence. It fixes the popup's *content* (title, notices,
  rows, no address anywhere, one row per author, row order, the checkbox semantics, `Удалить` for every row) and says nothing
  about colour or shape. It stays true under any look; the look rules are new text, not a rewrite of it.
- `:291` — **AC 27** pins the `action row` of the page widgets as icon-only with no cancel control. That is the **page**
  overlay, not the popup; the popup's `Удалить` is a labelled button today and stays labelled unless the owner says
  otherwise.
- `:286` — **AC 22** describes the popup's behaviour through core; unaffected.
- There is **no** AC about the popup's colours, and no test reads the popup's stylesheet for a palette. The popup look is
  therefore unruled and unpinned: whatever this stage decides becomes the first ruling about it.

## Rulings

| Ruling | Decision |
|---|---|
| `A140` | The popup adopts the **`A125` palette** rather than keeping its own `#1f1f1f` / `#6b6b6b` / `#e3e3e3` trio: cream surface, `#1b2a33` ink, `#7b6a55` secondary, `#a6cbdc` decorative, `#b3261e` refusal (already shared). No new colour is invented, and the page overlay's palette (`A94`/`A102` paint slots) is **not** touched — the popup is an extension surface, not a page surface. |
| `A141` | The popup becomes a **card in the same shape as the settings surface**: the same border, the same corner radius, the same type scale. Its width stays the popup's own (`320px` is what fits the toolbar panel; the settings card's `360px` is a dialog-box value, not a popup value) — the shape is shared, the width is not. |
| `A142` | **No mascot in the popup.** The settings window shows it because it has room for a header; the popup is a 320 px toolbar panel whose job is a list, and the owner's Stage 11 word was «только в шапке окна настройки». |

## Questions for the owner, each with the default

**Q1 — the card shape.** A card identical in shape to the settings card (border `1px solid #a6cbdc`, `border-radius: 12px`,
cream fill) **plus** the popup's own body margin, or the card only? *Default: the card*, with the document's default body
margin zeroed the way `src/options/index.html` does it, because a bordered card with a browser-default margin around it
looks like a floating tile rather than a page.

**Q2 — the mascot.** `A142` says no. If the owner wants it after all, it goes in the popup's header at a smaller size and
that is a different task. *Default: no mascot.*

**Q3 — the row's controls.** Today the row is an unstyled `<input type="checkbox">` plus a default `<button>Удалить</button>`.
Do they get the settings surface's control styling (the `#a6cbdc` border, the 6 px radius, the `#b8480d` action colour on the
delete button), or stay native? *Default: style the delete button and the checkbox's box to the `A125` palette*, because
otherwise the card looks designed and its controls do not.

**Q4 — the empty state and the notices.** The empty line takes the `#7b6a55` secondary ink; the two notices take the
`#b3261e` refusal ink (already shipped) — the `name_required` one is a button and keeps its underline. *Default: as stated.*

## Ledger

| Row | What is unresolved | Class |
|---|---|---|
| `S14-1` | The `A125` palette was sampled from the **old** mascot artwork (`S11-1`/`S12-1`); extending it to the popup spreads a palette whose own provenance is already stale. It is not this stage's job to re-sample it, but the two are now coupled: re-sampling later moves the popup too. | ruling + spec |
| `S14-2` | No test reads the popup's stylesheet, so this stage's look rules will be the first popup-look pins. If they are written the way the settings look is pinned (`tests/options-window-look.spec.ts`), the popup gets a look suite of its own; if not, the ruling is unpinned prose. The stage decides which, and says so. | test |
| `S14-3` | The popup's `320px` width and the settings card's `360px` are two numbers with no shared rule. `A141` deliberately keeps them apart; if the owner wants one width, that is a third value and a new ruling. | ruling |

## The owner's second word (2026-11-19): «кнопку удалить тоже удали как в окне добавления заметки», then «точнее не удали, а замени на значёк»

The correction matters and it is the difference between a visual change and a behaviour change. Read literally, «удали»
would have removed the row's delete control entirely — and that is **not** what the page widgets do. Measured against the
shipped code:

- `src/content/overlay/create-card.tsx` renders an `action row` whose **only** control is a save button, icon-only
  (`A114`). There is no delete control there because a card that has not been written yet has nothing to delete.
- `src/content/overlay/editor.tsx` renders **two** icon-only buttons: save (`CARD_PRIMARY_CLASS`) and delete
  (`CARD_DELETE_CLASS`, the trash glyph from `DeleteActionIcon`), both with `aria-label` and `title` carrying the Russian
  word instead of visible text.
- The glyph is an inline `<svg>` sized by `ACTION_ICON_PX` (`16`) inside an `ACTION_HIT_BOX_PX` (`24`) box, painted with
  `currentColor` so the delete colour `#a4262c` / `#d08085` colours the drawing without a second declaration.

So «как в окне добавления заметки» names the **icon-only shape of the action row**, and the editor is the widget that
actually carries a delete action. The popup's `Удалить` therefore becomes an **icon-only trash button** in that shape, not
a missing control.

### Ruling

| Ruling | Decision |
|---|---|
| `A143` | The popup's row `Удалить` becomes an **icon-only button**: an inline `<svg>` trash glyph as its only child, the Russian word `Удалить` moved from visible text to `aria-label` **and** `title`, the same shape `A114` gives the page widgets' `action row`. The button keeps its behaviour exactly (`A25`/`A108`: one core `deleteEntriesOfAuthor` for the whole author group, own or foreign). No cancel control and no second action appears in the row. |

### What this breaks, and the two things it must not

- `tests/popup-entry-list.spec.ts` has **two describe titles** that name the labelled button — `AC3 a foreign row is
  marked foreign and keeps Удалить` and `AC5 the group Удалить removes the row immediately`. Their **assertions** are
  behaviour (one core call, other authors untouched, the row disappears) and stay; the **titles** name a control that no
  longer prints a word, so they are restated. A title that outlives the artifact it names is the defect class this repo
  keeps hitting.
- The popup's accessible name must not disappear with the visible text: `aria-label` and `title` both carry `Удалить`, and
  the glyph is `aria-hidden`, exactly as `src/content/overlay/action-icons.tsx` documents for the page widgets. The popup
  cannot import that module — it is a **Preact** file under `src/content/`, and the popup is Angular with no cross-layer
  import (`tests/toolchain-contract.spec.ts` pins the boundaries) — so the glyph is re-declared inside
  `src/popup/popup.component.ts` in the popup's own idiom. That duplication is deliberate and must be stated where it
  happens.
- The row's checkbox stays a checkbox. `A143` touches one control.

### Ledger additions

| Row | What is unresolved | Class |
|---|---|---|
| `S14-4` | The trash glyph will exist **twice** in the repository — once in `src/content/overlay/action-icons.tsx` (Preact) and once in the popup (Angular) — because the layer boundary forbids the import. Nothing pins that the two drawings stay the same shape. | test + boundary |
| `S14-5` | The row's hit box. The page widgets use `24px` (`ACTION_HIT_BOX_PX`) with a `16px` glyph; the popup has no such constant yet, and a popup row is denser than a page card. The stage picks one and says why. | ruling |

## Answers (owner, 2026-11-19): «всё дефолты»

All five defaults stand, so the slice carries no judgement of its own:

| Question | Answer |
|---|---|
| Q1 — the card shape | the settings card shape **plus** the popup's own body margin zeroed (the `src/options/index.html` way) |
| Q2 — the mascot | **none** (`A142`) |
| Q3 — the row's controls | the checkbox's box and the delete button are styled to the `A125` palette |
| Q4 — the empty state and the notices | empty line in `#7b6a55`, refusal in `#b3261e` (already shipped), the `name_required` button keeps its underline |
| Q5 — the trash hit box | `24px` with a `16px` glyph, the same numbers as the page widgets' `ACTION_HIT_BOX_PX` / `ACTION_ICON_PX`, so the icon-only shape matches across surfaces (`S14-5`) |

## Review verdict and attempt 2 (2026-11-19)

Review `426e2c29-d416-495f-a8e4-035b7d31ee7b` → **changes requested**, one blocking finding, and it is the same defect
class as the whole week: **two spec sentences outlived the artifact they described.** Both say the popup's buttons «keep
their words» and that the surface «gained no inline glyph»:

- `docs/specs/content-overlay-ui.md:154` — inside the `A114`/`t7-01` card bullet's «nothing else moved» paragraph.
- `docs/specs/content-overlay-ui.md:298` — **AC 27**, the same claim written as an acceptance criterion.

`A143` made both false on purpose, so the fix is the sentence, not the code. Attempt 2 is bounded to that plus the
reviewer's row 4 (a self-contradicting doc comment: `deleteIconPx` says «the number is 24 and the box is 16» while the
constants are `16` and `24`).

The reviewer **accepted** the `content-create-card-boundaries` narrowing and judged it in scope as an AC consequence:
«`offenders === []` for `<svg` under `src/popup/`» became «exactly `src/popup/popup.component.ts`», the `CARD_ICON_CLASS`
half stays empty for the popup, and both halves stay empty for `src/options/` — a widening of what counts as legal
where a ruling made the old blanket absence false, not a weakened present claim.

### Ledger additions

| Row | What is left | Class |
|---|---|---|
| `S14-6` | `docs/specs/content-overlay-ui.md:162` says the look suite includes «a path-for-path comparison with the editor's glyph»; the suite makes a comparison, but the popup's own comment says the two drawings are **not** claimed identical. The bullet overstates what the suite proves. | spec |
| `S14-7` | `tests/popup-window-look.spec.ts` never asserts that `class="popup"` reaches the template or that `rowClassOf` yields `row--own` — every `.popup` rule assertion resolves against stylesheet text only. | test |
| `S14-8` | `docs/specs/content-overlay-ui.md:157` says «every colour the popup declares is one of the `A125` roles» and then lists five, while `A125` names seven plus the refusal. True about the shipped set, loose as a sentence. | spec |
| `S14-9` | `src/popup/popup.component.ts:260` — the delete colour is a bare literal `#b8480d` rather than a named constant, while the two sizes are constants. `A125`-clean, but a glyph that must stay recognisable is not the only thing worth naming. | source style |
| `S14-10` | `src/popup/index.html` ends without a trailing newline; `src/options/index.html` has one. Harmless, and the one byte-level asymmetry between two documents that now own the same rule. | source style |
| `S14-11` | `tests/content-create-card-boundaries.spec.ts:25-32` — the file header still opens with «the popup carries no inline glyph» and qualifies it two lines later. The exception is stated, but the opening clause is what a reader greps for. | test prose |
| `S14-12` | Report accuracy: `docs/state/t14-01-engineer.md`'s AC 7 row describes the refusal pin as «one `#b3261e` declaration in the stylesheet» while the suite reads it through its own `PREEXISTING_REFUSAL` literal. | docs |
