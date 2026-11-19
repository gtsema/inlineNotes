# t14-04 — the width comes back, the rounding goes

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, rulings **`A146`** and **`A147`**). Two things happened: the reader's
screenshot (`test_img/Снимок экрана 2026-11-19 224902.png`) proved the popup cannot be rounded, and it exposed a width
regression the PM introduced in `A145`.

## The measurement that settles both

The PM decoded the reader's PNG and measured:

| Fact | Value |
|---|---|
| Cream surface | **100 × 264 px** at `x 96…195`, `y 72…335` |
| Content width inside it | **66 px** (`100 − 2×16` padding = 68 px available) |
| Text wrapping | title, notice and empty state each wrap to **3 lines** |
| Cream corners | `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)` all cream; `(97,73)`, `(98,74)`, `(99,75)` all cream — **no rounding rendered** |
| Window box | `x 92…199` (~108 px) on a dark `#202124` background, with `#444746` bands above and below the surface |

## Acceptance criteria

1. **The width goes back to the component.** `.popup` in `src/popup/popup.component.ts` regains `width: 320px` (with the
   `box-sizing: border-box` it already has), so the text has a real column again. The number is restored **as the component's
   own** — it was doing real work and `A145`'s «the width moves with the surface» was wrong.
2. **`body` stops claiming a shape.** `src/popup/index.html`'s rule loses `border-radius` and `overflow: hidden` (they render
   nothing — measured), loses `width: 100%` and `min-height: 100vh` (the width belongs to the component now, and `100vh` was a
   guess the ruling never named), and **keeps** `margin: 0` and the `A125` cream fill. The document paints; it does not shape.
   If you keep any geometry on `body`, say in the report which declaration and why, and name the measurement that justifies it.
3. **No frame returns anywhere.** No `border`, `outline` or `box-shadow` as a substitute — that was the reader's first
   complaint and it stands.
4. **The popup ships as a cream rectangle that fills the window.** `:host` keeps `display: block`; the cream is painted on the
   box that is the window (`body`), so no white band appears at the edges — that half of `A145` was a real improvement and stays.
5. **The controls are untouched.** The row separator, the checkbox with its `3px` radius and `#b8480d` accent, the icon-only
   delete with its `24`/`16` sizes, the palette, the type scale and the `16px` padding all stay as `t14-03` left them.
6. **The pins follow the new rule set, and none is deleted.** `tests/popup-window-look.spec.ts` currently pins the document box
   as the surface (paint, radius, clip, `width: 100%`, `min-height: 100vh`) and pins the component as having no width. Both
   halves change:
   - the document's pin keeps the **paint** and the zero margin and loses the radius/clip/geometry assertions — do not simply
     delete them; state in the case what replaced them, and keep the pin that says the document's rule set is deliberate;
   - the component's width pin returns, reading `320px` from the shipped stylesheet;
   - prove with **one mutation you apply, observe and revert from a `cp` copy** that the width pin can fail (name the mutation
     in the report).
7. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the `Popup look` bullets state that the popup is
   a **cream rectangle that fills the window**, that the **component** owns the `320px` width, that **no rounding is possible**
   in an MV3 popup (with the measurement in one clause), and reference `A146`/`A147` as superseding `A145`'s shape half. The
   sentence claiming the document box is the surface is narrowed to the paint.
8. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently **176 info**),
   `npm run typecheck`. `dist/` stays **12 files**. Baseline **1049 tests / 47 files**; the count may only grow. `README.md`
   is the PM's.

## Out of scope

- Any further attempt at rounding. `A146` closes it with a measurement; re-opening it needs new evidence that a popup window
  can be clipped, not a new CSS value.
- `S14-27` (the palette's reading, the trash glyph against the page editor's, the checkbox, «nothing else moved»).

## Constraints

- Never weaken or delete a pin. Rewriting the two the rule change falsifies is expected; the count may only grow.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t14-04-engineer.md` in one `write` call → paste the report
  into the final message as well.**
- One commit. `docs/state/` is the PM's except your own report. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
