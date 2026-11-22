# t17-05 — five layout and colour defects the user found in Run 16

## What the user reported, verbatim, with the measured cause

### 1. The gap is far too big, and it is in the wrong place

The user: «Зазор оч большой стал. Надо в 2 раза меньше и разделить его пополам, чтобы его
половинка была между инпутом адреса и чекбоксом, а вторая — между чекбоксом и кнопкой.»

Measured: `t17-04` added `margin: 0 0 48px` to `.save` and left `.toggle-line` at
`margin: 48px 0 0`. The requested gap is **24px**, split into two halves of **12px**:

- `12px` between the **server address input** and the **checkbox row**;
- `12px` between the **checkbox row** and the **save button**.

### 2. The checkbox row sits on the save button

The user: «Прилип к кнопке.» Follows from defect 1: the row's `margin-top` is 48px, so the row
touches the button while the input above has no gap at all.

### 3. The confirmation line pushes the window and creates a scrollbar

The user: «расстояние между появляющимся лейблом сохранено и кнопкой очень большое. И при его
появлении окно увеличивается и появляется прокрутка. Это неприемлемо.»

Measured: `.message { margin: 12px 0 0; padding: 6px 8px }` and `.rename { margin: 12px 0 0;
padding: 8px }`. The dialog box is sized by Chrome and the page must not exceed it — the
`t9-01`/`t9-02` rule. A block that appears after a press must not make the page taller than
the box.

### 4. Two «Сохранено» lines appear

The user: «появляется два лейбла "Сохранено". Нужно только один.»

Measured in the template (`src/options/options.component.ts`): two independent blocks render the
same message —

```
@if (view().message !== null) { <p class="message">{{ message() }}</p> }
@if (renameOutcome() !== null) { <p class="message">{{ renameOutcomeMessage() }}</p> }
```

Both answer `saved` after a rename save, so the reader sees the sentence twice.

### 5. Author names are invisible on the card

The user: «после изменения фона карточки — не видны имена авторов. Нужно сделать их цвет как
цвет кнопки наверное.»

Measured: `tooltip.tsx` `headerStyleOf` colours a foreign note's header with
`paintColourOfSlot(slot)`, which returns the **highlight fill** — an `rgba(…, 0.26)` background
colour. On the cream card (`#fdf7ee`) a 26 %-alpha fill is nearly invisible. The author's name
needs a colour that reads as **text**: the action colour `#b8480d` is what the user proposed.

## Rulings

### A177 — one gap, split in two

The gap between the server address input and the save button is **24px total, split 12/12**:
`.toggle-line` carries `margin: 12px 0 12px` (12 above, 12 below) and `.save` carries **no**
vertical margin of its own. The two halves are the two gaps the user named.

### A178 — an appearing block must not grow the page

Any block that appears after a press — the confirmation line and the rename warning — must fit
inside the dialog box the page already has. The page's total height must not change when the
confirmation or the warning appears, and no scrollbar may appear.

Concretely: the vertical margins around the appearing blocks are reduced so the block occupies
space the page already reserves, and the pin measures the page's declared vertical budget rather
than trusting the eye.

### A179 — one confirmation, rendered once

The confirmation is rendered by **one** block. The two `@if` blocks of defect 4 become one
source of truth: the rename outcome and the ordinary save answer are merged before rendering, so
`saved` produces exactly one line whatever path produced it.

### A180 — the foreign author name is text-coloured, not fill-coloured

A foreign note's author name in the tooltip header is coloured with the `A125` **action** colour
`#b8480d`, the colour the user proposed, and no longer with the highlight fill. The highlight
itself keeps its per-author colour: the underline on the page is unchanged.

The name is also no longer italic-and-grey (`#7b6a55`): the `#b8480d` colour is what makes it
read as a name rather than as a hint.

## Acceptance criteria

1. `.toggle-line` declares `margin: 12px 0 12px` and `.save` declares no vertical margin; the two
   12px halves are the gaps the user named (`A177`).
2. A pin reads those two declarations, so a later edit cannot change the split silently.
3. The confirmation line and the rename warning each render **once** on every path (`A179`): a
   test drives a rename save and asserts exactly one confirmation node.
4. The page's vertical size does not grow when the confirmation appears, and no scrollbar appears:
   the pin states the declared vertical budget of the page and the appearing blocks stay inside it
   (`A178`).
5. The rename warning's distance from the save button is the same 12px scale, not 48px.
6. A foreign note's tooltip header is `#b8480d` and carries no inline `rgba(` fill colour
   (`A180`).
7. The reader's own header keeps the stylesheet's ink — `A180` changes the foreign branch only.
8. The highlight colours on the page are unchanged: the palette module is untouched.
9. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
   `node scripts/check-agent-config.mjs`. The test count only grows.
10. `docs/specs/content-overlay-ui.md` states the tooltip header colour and the options page's
    vertical budget; the sentence about the author colour is corrected where it claims the
    highlight fill colours the name.

## What must not change

- The highlight palette (`A151`, `A94`, `A102`) and the per-author underline colours.
- The `A125` palette roles: `#b8480d` is already the action role, no new literal is invented.
- The rename rule (`A173`, `A174`) and its two-step confirmation.
- The server.

## Constraints

- Run all four gates and report the real exit codes. A red gate reported honestly is worth more
  than a green gate claimed.
- One commit. Restore anything you mutate from a copy, never with `git checkout`.
- Report to `docs/state/t17-05-engineer.md`, committed with the code.
