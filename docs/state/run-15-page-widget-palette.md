# Run 15 — the page widgets' palette and the disabled state, in the reader's own Chrome

Stage 15 opening (`docs/state/stage-14-popup-look.md`, task `t15-01`, rulings `A150`–`A153`). The owner's request: «Теперь
осталось адаптировать цвет карточки редактирования и создания комментария. Там только изменить цвета», with «1. дефолт» for the
tooltip and «2. сделать» for the disabled state.

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1060 tests / 47 files**; checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- `src/content/overlay/card-style.ts` and `tooltip-style.ts` declare only `A125` roles; **zero** occurrences of the eleven
  retired literals. `src/content/paint/` is untouched — the six author slots are byte-identical (`A151`).
- The disabled state is `#e3c3aa` fill, `#1b2a33` label, `#a6cbdc` border on **both** surfaces, and `opacity` is gone from
  `src/options/options.component.ts` (only comments mention it). The reviewer recomputed the contrast from the literals:
  **8.875** label-on-fill, **1.558** fill-vs-card, **4.965** enabled-vs-card.
- PM mutations, each restored from a copy: a retired literal put back → **1 red**; `opacity: 0.45` put back on the disabled
  save → **1 red**.

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The create card.** Select text on a page: the card is now cream with the `#a6cbdc` border and the dark ink, like the
   settings window and the popup — not white with grey borders.
2. **The editor.** Click an existing note's tooltip: same palette, same frame colour.
3. **The tooltip.** Hover a highlight: cream, dark text, the same border. It should no longer be the one widget on the old
   greys.
4. **The counter.** It reads in the warm grey `#7b6a55`; when the text approaches the cap it turns the `#b8480d` orange.
5. **The save button.** Enabled: white glyph on the `#b8480d` orange. **Disabled (empty text): the button is now a pale
   `#e3c3aa` with a dark, readable glyph** — the point of `A153`. It must look clearly *inactive* while still being legible,
   which the old `opacity: 0.45` could not do.
6. **The delete button and the refusal line** are the `#b3261e` red.
7. **Nothing but colours changed.** The card's size, the buttons' hit boxes, the corner radii, the placement next to the
   selection — all exactly as before. If anything moved, say what.
8. **The highlights themselves are untouched** — the text highlighting on the page keeps the same author colours as before
   (`A151`).

## Recorded honestly

The disabled colours are a **legibility choice**, not a compliance fix: `WCAG 1.4.3` exempts inactive controls. The numbers
behind it are in the spec and in `A153`; the old `opacity` measured `1.42:1` on the label and could never be made readable.

## Outcome

Pending the reader's answer.
