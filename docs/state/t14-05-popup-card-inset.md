# t14-05 — the popup's card is inset 4 px from the window edge

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, ruling **`A149`**). The reader's Run 13 answer: «1-5 — всё хорошо.
Можно сделать отступ от края она до линии. где-то 4px» — the frame is right, and it needs air between itself and the panel
edge.

## What the layout is today

```css
:host  { display: block; }                                    /* the card touches the window edge */
.popup { width: 320px; border: 2px solid #a6cbdc; border-radius: 12px; padding: 16px; … }
body   { margin: 0; background: #fdf7ee; }                    /* paint only (A147) */
```

The card's `2px` `#a6cbdc` line runs along the panel's own edge, which is what the reader asked to change.

## Acceptance criteria

1. **The gap is declared on `:host`.** `:host` gains `padding: 4px` and keeps `display: block`. The `4px` is the reader's
   number, so it is a value, not a judgement (`A149`).
2. **`body` keeps exactly the paint and the zero margin.** It must **not** gain the padding: `body` carries the cream and
   nothing else (`A147`), and the pin that forbids the document a shape must stay green. If the padding were put on `body`,
   the cream would paint the gap's own band and the frame would sit inside a coloured border — say so in the report if you
   considered it and why you rejected it.
3. **The card is unchanged.** `.popup` keeps `width: 320px`, `box-sizing: border-box`, `border: 2px solid #a6cbdc`,
   `border-radius: 12px`, `padding: 16px`, the type scale and the ink. The gap is **outside** the card, so the panel becomes
   `4 + 320 + 4` wide — that is the accepted arithmetic (`S14-38`), not an accident.
4. **The cream still fills the window.** The gap shows the `body` cream, so the frame appears to float on the same surface
   rather than on a white band.
5. **The pins follow.** `tests/popup-window-look.spec.ts` must pin the `4px` inset on `:host` (a presence pin that can fail —
   name the mutation in the report and prove it with one you apply, observe and revert **from a `cp` copy**), keep the pins
   that forbid the document a shape and a frame, and keep the card's own pins unchanged. **Do not weaken or delete any
   existing assertion**; this task adds one and moves nothing.
6. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the `Popup look` bullets state the `4px` inset
   and **which box owns it** (`:host`), alongside the already-stated ownership — the card frames, the document paints, the
   component owns the `320px`. Reference `A149`.
7. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently
   **176 info**), `npm run typecheck`. `dist/` stays **12 files**. Baseline **1049 tests / 47 files**; the count may only grow.
   `README.md` and `test_img/` are the PM's.

## Out of scope

- Moving the `4px` inside the `320px` (`S14-38`) — a different ruling and a different number.
- Any further shape work: `A146` closed the window-rounding question with a measurement, and the reader has accepted the
  card's frame as it is.
- The trash glyph and the palette: both were confirmed in Run 13 and are closed (`S14-4`, `S14-13`).

## Constraints

- Never weaken or delete a pin. Baseline **1049 tests / 47 files**; the count may only grow.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t14-05-engineer.md` in one `write` call → paste the report
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
