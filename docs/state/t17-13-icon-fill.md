# t17-13 — the toolbar icon already fills the circle; no change

## The reader's request

«нужно сделать иконку во весь кругляш кнопки расширения».

## Measured

The shipped `src/icons/icon-128.png` (byte-identical to `src/options/assets/cat-mascot.png`):

| Fact | Value |
|---|---|
| painted width at the horizontal centre line | **128 of 128 px — 100 %** |
| painted height at the vertical centre line | 125 of 128 px — 98 % |
| widest painted row | **128 px**, at y = 58 |
| corners | all four 3×3 blocks fully transparent |
| painted outside the inscribed circle | 189 px, of which **30 are opaque** |
| farthest painted pixel | radius **64.55** against a circle radius of 63.5 — it overhangs by **1.05 px** |

**The artwork already fills the circle.** There is no margin to remove and no room to grow: the
painted area reaches both side edges and the top.

What the measurement does show is the opposite of the request: the art **overhangs the circle by one
pixel**, so Chrome clips about thirty opaque pixels at the rim — most likely the tips of the ears or
the hat.

## The reader's decision

**Keep it as it is.** Two per cent smaller would fit the circle exactly and clip nothing, and that was
offered; the reader chose the shipped size instead. A one-pixel rim clip is ordinary for an icon, and
it keeps the cat as large as the circle allows.

## What this closes

- No asset change, no manifest change, no code change.
- The measurement is recorded so the question is not re-opened from a guess: the icon is **not** too
  small, and «make it bigger» is not achievable without redrawing the artwork to crop the padding
  inside the PNG.
- If the reader ever wants a visibly larger cat, the change is **the artwork** (crop the transparent
  margin inside the source), not the icon size — and the `A130` provenance rule would then need a new
  conversion record.
