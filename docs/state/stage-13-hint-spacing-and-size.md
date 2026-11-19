# Stage 13 — a visible space after `Имя`, and a smaller parenthetical

Opened by the owner's request (2026-11-19), immediately after Run 8's look: «после Имя пробел добавь и текст в скобках
можно чуть меньше сделать».

Two tiny visual changes on the settings surface, and one of them is not what it looks like.

## What the PM measured before writing anything

The shipped label line is

```html
<p class="label-line">
  <label class="label" for="author-name">{{ nameLabel }}</label>
  <span class="hint">({{ nameHint }})</span>
</p>
```

and the **newline between the two elements already renders as one collapsible space in HTML**. So the browser already
draws `Имя (Это имя…)` — the owner's «пробел» is a request about **how much** space, not about its absence. Two facts
make that concrete:

- the rendered text is currently `ИМЯ (ЭТО_ИМЯ)` in the pin, because the pin collapses `\s+` to one space;
- the same pin therefore **cannot** testify about how many spaces the markup carries — that is already ledger row
  `S12-3`, and it is exactly the gap this request walks into.

So the honest reading of «добавь пробел» is: **make the gap wider than one word-space**, visibly. The way to do that
without depending on whitespace counting is a declaration (`margin-left` / `padding-left` / `gap` on a flex line), not a
second space character in the template — a second space in HTML collapses to the same single space and would change
nothing the reader can see.

## Rulings

| Ruling | Decision |
|---|---|
| `A137` | The gap between the `Имя` label and the parenthetical is a **declared space** (`margin-left` on `.hint`, or an equivalent explicit gap), not a second whitespace character: the owner asked for a wider visible gap, and only a declaration survives HTML whitespace collapsing. |
| `A138` | The parenthetical is **smaller than the label**: `.hint` gets an explicit `font-size` below the surface's base `13px` (proposed `11px`), keeping its italic style and its `#7b6a55` ink (`A125`). |
| `A139` | The `S12-3` gap is closed as part of this stage: the pin that claims «one space» must be able to see the gap it now declares. A pin that collapses whitespace and then asserts one space cannot be the evidence for a spacing decision. |

## Ledger

| Row | What is unresolved | Class |
|---|---|---|
| `S13-1` | `S12-5` — the centred column sits on the card's content box, not the dialog box axis. The owner has not answered Run 8 on it; it stays open. | ruling + look |
| `S13-2` | `11px` is the PM's proposal for the parenthetical. The owner said «чуть меньше», which has no measurement in it; if `11px` reads wrong in the real window, the value is a one-line change. | ruling + look |

## Question pool for the owner

**Q1 — how wide is «чуть шире»?** The label line currently renders one word-space between `Имя` and the bracket, and the
markup's newline is that space. The options the PM will implement:

- **Q1a (default)** — an explicit `margin-left: 4px` on `.hint` on top of the collapsible space, so the gap is visibly
  wider than a word-space but still reads as «Имя (…)» rather than as two separate columns.
- **Q1b** — `8px`, a clearly separated parenthetical.
- **Q1c** — no extra space at all; the owner meant «keep the space that is there», and the real complaint was the
  parenthetical's size.

*Default: `Q1a`.* A one-space gap is what already ships, so a request to «add a space» has to mean something visible, and
`4px` is the smallest step that is not a rounding error.

**Q2 — how much smaller?** The surface's base size is `13px` (`:host`/`.options` `font: 13px/1.45 system-ui`), the label
inherits it, and the parenthetical would take an explicit size:

- **Q2a (default)** — `11px`, about 15 % smaller: reads as a parenthetical without becoming hard to read at dialog scale.
- **Q2b** — `12px`, a subtler step.
- **Q2c** — leave the size alone and only widen the gap (i.e. `Q1c` as well).

*Default: `Q2a`.* The owner asked for «чуть меньше», and `11px` is the smallest value that still reads comfortably
against `13px` at the dialog's scale.

Both defaults will be implemented if no answer comes; neither changes any wording, and both are one-line values if the
real window disagrees.
