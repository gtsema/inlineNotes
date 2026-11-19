# Run 13 — the popup's thicker frame, in the reader's own Chrome

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, task `t14-04`, rulings `A146`, `A147`, `A148`). The reader's path to
here: Run 11 said the corners were square with a dark edge, Run 12's screenshot proved the popup **window** cannot be rounded
and that the PM's `A145` had collapsed the width, and the reader then chose «верни скруглённую рамку, но сделай её потолще».

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1049 tests / 47 files**; checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- `.popup` is `width: 320px; box-sizing: border-box; border: 2px solid #a6cbdc; border-radius: 12px; padding: 16px;
  font: 13px/1.45 system-ui, sans-serif; color: #1b2a33`. The document rule is `body { margin: 0; background: #fdf7ee; }`.
  `:host` is `display: block` only.
- PM mutations, each restored from a copy: the frame at `1px` instead of `2px` → **1 red**; a `border` added to the document
  rule → **1 red** (the document is still forbidden a frame).

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The frame's thickness.** Is `2px` «потолще» enough — does the frame now read as a deliberate border rather than as a
   thin line that failed to round the window? If it is still too thin, say so: it is a one-value change (`S14-29`).
2. **The corners.** The frame is drawn with a `12px` radius inside a square window. Do the rounded corners read as intended
   now, or does the square window still show behind them?
3. **The width.** The text no longer wraps three times: the title fits on one line, the notice and the empty state read
   normally.
4. **The edges.** The cream still fills the window with no white band around the panel.
5. **Nothing else regressed.** The palette, the trash icon with its `Удалить` tooltip, deleting, the checkbox, the row
   separators.

## Two questions carried from Run 10/12, still unanswered

6. **The trash glyph against the page editor's** (`S14-4`): open a note on a page, compare the editor's delete glyph with the
   popup's row trash. Same drawing, or visibly different?
7. **The palette's reading** (`S14-13`): does the popup read as the same product as the settings window — same cream, same
   ink, same warm grey — or does something still look like a different surface?

## Recorded honestly

The rounded look of the **card** is now a rule set with pins; the **window** remains a square Chrome draws, and `A146` records
that no rounding is possible there. Nothing in this run can be settled by a test — it is the reader's eye, and the value
`2px` is a PM default for «потолще» rather than a measurement.

## Outcome

Pending the reader's answer.
