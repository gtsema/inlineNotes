# Run 14 — the popup's `4px` inset, in the reader's own Chrome

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, task `t14-05`, ruling `A149`). The reader's Run 13 answer confirmed
the frame, its thickness, the corners, the width and the edges, and asked for one thing more: a gap between the frame and the
panel edge, «где-то 4px».

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1051 tests / 47 files**; checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- `:host` is `display: block; padding: 4px`. `.popup` is byte-identical (`320px`, `box-sizing: border-box`,
  `border: 2px solid #a6cbdc`, `border-radius: 12px`, `padding: 16px`, the type scale, the ink). The document rule is still
  exactly `body { margin: 0; background: #fdf7ee; }`.
- PM mutations, each restored from a copy: dropping the inset → **2 red**; moving it to `body` → **2 red**; changing it to
  `8px` → **2 red**. The second is the one that matters: the document is still forbidden a shape.

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The gap.** There is now a visible `4px` of cream between the panel edge and the `2px` frame — the frame reads as a card
   floating on the surface, not as a line glued to the window edge.
2. **All four sides.** The gap is even — top, bottom, left, right. If one side looks wider or narrower, say which.
3. **The corners.** With the inset, the rounded corners still read as intended.
4. **Nothing else moved.** The frame's thickness, the width (the text does not wrap oddly), the palette, the trash icon with
   its `Удалить` tooltip, deleting, the checkbox, the row separators.

## Recorded honestly

The gap is **outside** the card (`A149`, ledger `S14-38`), so the panel is `4 + 320 + 4` wide — the card's `320px` and its
`16px` padding are untouched. If the total width now feels too large, the alternative is a different number and a new ruling,
not a silent adjustment.

## Outcome

Pending the reader's answer.
