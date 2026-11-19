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

## Verdict: accepted on attempt 2

Attempt 2 (`c0eae45`, two files, four lines) closed the only blocking finding; the confirming review `f4cda879-f76d-4fb9-85c3-16d44e8bb59b`
returned **accepted** with zero blocking findings and no fourth contradicting sentence in the spec. Its verdict line: the spec and
the popup code now agree about the popup's controls.

All seven non-blocking rows it re-listed are the same `S14-6`…`S14-12` already ledgered; it added none.

Final gates on `c0eae45` (re-run by the PM): `npm run build` 0, `dist/` **12 files**; `npm test` 0 — **1048 tests / 47 files**;
checker 0 — **176 info**; `npm run typecheck` 0. `README.md` synced by the PM: 1048 tests, 47 files, «Стадии 1–14», and a
Stage 14 note on the popup's new look.

### Retro, Stage 14

- **The same defect class, fourth time this week.** `A143` deliberately falsified two spec sentences — «the popup's buttons keep
  their words» and «neither surface gained an inline glyph» — and both survived the commit that made them false. The reviewer
  caught them by reading the spec, not the tests, because **no test reads the spec for a claim about a control's shape**.
- **An absence pin that a ruling makes false is narrowed, not deleted.** `tests/content-create-card-boundaries.spec.ts` asserted
  «no `<svg>` under `src/popup/`»; the popup now legitimately carries one. The pin became «exactly `src/popup/popup.component.ts`»,
  the `CARD_ICON_CLASS` half stayed empty, and `src/options/` kept both halves empty. The reviewer judged the narrowing acceptable
  and in scope as an AC consequence — but the engineer flagged it in its own report as the one pin it loosened, which is what let
  the PM ask the question instead of discovering it later.
- **A self-contradicting comment is a defect the tests cannot see.** `deleteIconPx` said «the number is 24 and the box is 16» while
  the constants were `16` and `24`. Nothing fails, and a later reader trusts it.
- **The PM's mutation checks are what make a look suite credible.** Four mutations on the shipped popup file — a palette role
  changed (3 red), the width changed to `360px` (1 red), the accessible name removed (1 red), the glyph swapped for visible text
  (2 red) — each proved a specific assertion is load-bearing rather than decorative.

## Follow-up after Run 10: the corners (2026-11-19)

The reader's Run 10 report: «у неё чёрная рамка и из-за этого видны углы, хотя у нас скруглённая внутренняя рамка. Как-то
можно сделать так, чтобы окно выглядело с закруглёнными углами?»

### What the PM measured, and the mechanism

The rule chain shipped by `t14-01` is:

```css
:host   { display: block; background: #fdf7ee; }                       /* a rectangle */
.popup  { border: 1px solid #a6cbdc; border-radius: 12px; }            /* a rounded card inside it */
```

The rounded card sits **on top of** a rectangular cream host, and Chrome's popup window has its own rounded corners and its
own edge. Three shapes therefore disagree at the four corners: the window's radius, the host's square corner, and the
card's `12px` arc. The `#a6cbdc` border traces the arc and then stops, and the host's square corner shows outside it —
which is what the reader sees. The card's border is not «black»; it is `#a6cbdc` against the window's own dark edge, which
reads as an outline that does not follow the window.

**Ruling.**

| Ruling | Decision |
|---|---|
| `A144` | **The popup's card loses its frame and its radius; the window owns the shape.** `.popup` keeps `width: 320px`, `box-sizing`, `padding: 16px`, the `A125` cream background, the `13px/1.45 system-ui` scale and the ink; `border: 1px solid #a6cbdc` and `border-radius: 12px` come off it. `:host` keeps the cream fill and loses nothing else. Chrome draws the window's rounded corners itself, so the surface reads as a rounded panel without any element claiming a shape the window disagrees with. |

`A141` is **amended, not overturned**: the popup still shares the settings surface's palette, type scale and inner padding,
and the two surfaces still differ in width on purpose. What stops being shared is the drawn frame — the settings window is
a dialog box Chrome sizes and our page draws a card inside, while the popup **is** the window.

### Consequences the task must carry

- `tests/popup-window-look.spec.ts` has a case that pins the card's `border: 1px solid #a6cbdc` **and** asserts the same
  declaration exists on the settings card, reading `src/options/options.component.ts` for it. That case is what made the two
  shapes «shared by construction»; it is rewritten for the new rule (the popup's frame is pinned **absent**, the settings
  card's frame stays pinned **present**, and the still-shared half — padding, radius-free scale, palette, width — is pinned
  as before). Deleting it would drop the settings half with it.
- The row separator `border-top: 1px solid #a6cbdc` and the checkbox's own `border: 1px solid #a6cbdc` are **not** affected:
  they are controls inside the surface, not the surface's frame. `A144` touches one rule.
- The `Popup look` spec bullet (`docs/specs/content-overlay-ui.md:157` area) states the card shape; it follows in the same
  commit.
- The popup document's single `body { margin: 0 }` rule stays. `A144` is about the card's frame, not about the document.

### Ledger

| Row | What is left | Class |
|---|---|---|
| `S14-13` | The reader's Run 10 items other than the corners are **not** answered yet: the card's colours, the trash icon against the page editor's glyph (`S14-4`), the checkbox, and «nothing else moved». `A144` changes one of them (the frame) before the rest were confirmed, which is a deliberate choice: the frame was the blocking impression. | look |
| `S14-14` | With the frame gone, the popup and the settings window no longer share a *drawn* shape — only a palette and a type scale. If the owner later wants the two to look identical again, the shared thing has to be re-declared as a rule rather than inferred from a border. | ruling |

## t14-02 accepted (2026-11-19)

Review `65b13507-8803-4ba3-90c9-e02666c60071` → **accepted**, all seven ACs pass, no blocking finding, and the honesty question
answered in the negative: no fourth disagreement between prose and code. The settings half of the old shared-shape claim survived
the rewrite and is load-bearing — the PM's second mutation (removing the settings card's frame) is 1 red, which is what proves it.

Final gates on `1cc38ae`: `npm run build` 0, `dist/` **12 files**; `npm test` 0 — **1048 tests / 47 files**; checker 0 —
**176 info**; `npm run typecheck` 0.

### Ledger additions

| Row | What is left | Class |
|---|---|---|
| `S14-15` | `tests/popup-window-look.spec.ts:289-295` — the absence scan builds its `rest` by cutting three selector strings (`.row`, `.row:first-child`, `.toggle input[type='checkbox']`) out of the verbatim text, so renaming any of them makes `ruleBody` throw inside that case. The engineer states this in the report; it is a pin coupled to three names. | test |
| `S14-16` | `tests/popup-window-look.spec.ts:271-273` — `everything` is the same string as `styles`; the alias reads as a second read but is the text already in scope. Cosmetic. | test style |
| `S14-17` | `docs/specs/content-overlay-ui.md:156` — the `Popup look` lead bullet still opens «the popup is the settings window's **card**», which a skimming reader can take as a drawn frame even though the sub-bullet two lines down states the absence. | spec |
| `S14-18` | **`A144` rests on Chrome drawing the window's own radius, and no test verifies it.** Every pin reads stylesheet text; whether the corners actually look rounded is a manual `dist/` load. This is the exact claim Run 11 exists to settle, and the reason it must be recorded rather than assumed. | browser-verification |

## Run 11 answered — the premise of `A144` is false (2026-11-19)

The reader's answer: **«1. углы не скруглённые вообще. прямой угол с чёрной рамкой»**.

That is the outcome `S14-18` was written to catch, and it falsifies `A144`'s premise. The measurement behind it is in the
shipped code: the popup document is

```html
<style>body { margin: 0; }</style>
<body><app-root></app-root></body>
```

`body` is a plain block box painted **white** by the user agent, and it is the box that fills the toolbar panel. `app-root`
and `.popup` are cream and 320 px wide **inside** it. So three things were true all along and only one of them was visible
while the card had a frame:

- the popup window does **not** round its own content — Chrome clips a popup window to a plain rectangle;
- `body` is the white rectangle the reader sees, and its corners are square by definition;
- the cream surface inside it never touched the window edge, so the white showed as a band around it.

Removing the card's frame therefore removed the only element that had ever been rounded and left a white rectangle with
black-adjacent edges. `A144` traded a rounded card for a square window — the opposite of what the reader asked for.

**Ruling.**

| Ruling | Decision |
|---|---|
| `A145` | **The rounding moves to the document box.** `body` — the box that is the window — gains the cream fill, the window-filling geometry and the rounded corners (`border-radius`, and `overflow: hidden` so the cream and the rounded clip belong to the same box). `app-root` and `.popup` stop being the surface and become content inside it: no fill, no width of their own beyond the content, no frame. The popup therefore reads as a rounded cream panel because the **document** is rounded, not because a card inside it is. |

`A144` is **superseded, not deleted**: its finding stands — a card drawn inside a square box cannot make the window look
rounded, and the `#a6cbdc` arc against the window edge was the artefact the reader first reported. What `A144` got wrong was
the direction: it removed the round shape instead of moving it to the box that owns the shape.

### What this task must carry

- The **width** moves with the surface. `320px` was the card's width; the document box must be the panel's width, so the
  cream reaches both edges and the rounded corners are the window's corners. `.popup` keeps its `16px` padding and the type
  scale; the `320px` constant is re-homed to the box that is now the surface, and the pin that reads it follows.
- The `body { margin: 0 }` rule stops being a one-declaration rule — it becomes the surface rule, and the spec sentence that
  says «one rule, one declaration» (and the pin that asserts exactly that) both move with it. **This is the pin most likely to
  be deleted by accident**; it must be rewritten to pin the new rule set, not dropped.
- The white `body` background is the visible defect: the new rule must paint the box, and the pin must assert the paint
  rather than the absence of a frame.
- `A145`'s premise — «Chrome clips a popup to a rectangle, and a `border-radius` on `body` is visible» — is **again a sight**,
  not a measurement. It is the second premise in a row that no test can check, so this time the task states it as a claim to
  be verified by a run **before** the pins are written as fact, and the run is named in the brief.

### Ledger

| Row | What is left | Class |
|---|---|---|
| `S14-19` | **Two premises in a row rest on how Chrome renders a popup window, and neither is testable in this repository.** `A144` was wrong; `A145` may be too. The mitigation is not a better guess but an ordered run: try it, look at it, then write the ruling as fact. | browser-verification |
| `S14-20` | The popup's surface is now the **document**, not a component. `src/popup/index.html` stops being a two-line shell and becomes a place where a visual rule lives, which is the opposite of the rule the options document follows («the only rule this document owns»). Two documents, two different philosophies, and the reason has to be written where both are. | spec + architecture |

## t14-03 accepted (2026-11-19)

Review `df3cab5f-9195-4945-a4d7-bf91fc34fe57` → **accepted**, all eight ACs pass, no blocking finding, and its one line on the
question that matters: the spec and the code agree about **where** the popup's surface lives — the document box.

Final gates on `f62fa9b`: `npm run build` 0, `dist/` **12 files**; `npm test` 0 — **1049 tests / 47 files**; checker 0 —
**176 info**; `npm run typecheck` 0.

### Ledger additions

| Row | What is left | Class |
|---|---|---|
| `S14-21` | `src/popup/index.html:34` — `min-height: 100vh` is a declaration `A145` did not name. The engineer flagged it and the reviewer confirmed the reason (a white band below a short list), but it is now part of the pinned rule set while the ruling does not mention it: a reader comparing the two finds a gap. | spec + ruling |
| `S14-22` | `tests/popup-window-look.spec.ts:446` — the raw-document absence scan reads the HTML comment too, so a future comment that spells `border:` as CSS rather than as prose goes red while declaring nothing. Deliberate and stated at `:445`. | test |
| `S14-23` | `tests/popup-window-look.spec.ts:404-410` — the rule parser is a regex over a comment-stripped block, so it cannot model an at-rule or a nested block; `@media` would be read as a selector. No shipped rule uses one, and the failure mode is a red case, not a silent pass. | test |
| `S14-24` | `docs/specs/content-overlay-ui.md:158` states `min-height: 100vh` but not what it buys (the cream reaching the bottom edge on a short list). One clause would stop the next reader from striking it as decoration. | spec |
| `S14-25` | `docs/state/stage-14-popup-look.md:234` — the `A144` block still reads «The popup document's single `body { margin: 0 }` rule stays», which was true of `A144` and is superseded by `A145` later in the same file. The record is not contradictory read whole, but it wants a pointer. | process |
| `S14-26` | `README.md:145` was false for two tasks: it still described the popup as keeping «форму карточки (рамка, скругление 12px …) при собственной ширине 320px» after `A144` removed the frame and `A145` the width. **Closed by the PM in this commit** — the note now says the window box draws the frame and the panel owns the width. | docs |

`S14-13` stays open: the reader has still not confirmed the palette's reading, the trash glyph against the page editor's
drawing (`S14-4`), the checkbox, or «nothing else moved». **Run 12** answers the corners and can answer the rest in the same
pass.
