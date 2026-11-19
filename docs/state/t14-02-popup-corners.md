# t14-02 — the popup stops drawing a frame and lets the window own the shape

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, ruling `A144`). The reader's Run 10 report: «у неё чёрная рамка и
из-за этого видны углы, хотя у нас скруглённая внутренняя рамка. Как-то можно сделать так, чтобы окно выглядело с
закруглёнными углами?» — and his choice of the three options the PM offered: **«давай попробуем 1»**, i.e. remove the card's
frame and radius and let Chrome's own window corners show.

## The mechanism, measured

```css
:host   { display: block; background: #fdf7ee; }              /* a rectangle */
.popup  { border: 1px solid #a6cbdc; border-radius: 12px; }   /* a rounded card inside it */
```

Three shapes disagree at the four corners: the popup window's own radius, the host's square corner, and the card's `12px`
arc. The `#a6cbdc` border traces the arc and then stops, leaving the host's square corner visible outside it — the outline
the reader sees, against the window's dark edge.

## Acceptance criteria

1. **The card loses its frame and its radius.** In `src/popup/popup.component.ts`, the `.popup` rule **keeps** `width:
   320px`, `box-sizing: border-box`, `padding: 16px`, `background: #fdf7ee`, `font: 13px/1.45 system-ui, sans-serif` and
   the `A125` ink — and **loses** `border: 1px solid #a6cbdc` and `border-radius: 12px`. No `outline`, no `box-shadow`, no
   replacement frame: the window owns the shape (`A144`).
2. **`:host` keeps the cream fill and nothing else changes about it.** It must not gain a radius, an `overflow`, a border
   or a shadow: the surface fills the window, and the window rounds it.
3. **Nothing else about the popup's look moves.** The row separator `border-top: 1px solid #a6cbdc`, the checkbox's
   `border: 1px solid #a6cbdc` with its `3px` radius, the icon-only delete control and its `24`/`16` sizes, the `A125`
   palette, the `320px` width, the `16px` padding and the type scale all stay exactly as `t14-01` shipped them. **`A144`
   touches one rule.**
4. **The look suite is rewritten, not deleted.** `tests/popup-window-look.spec.ts` currently pins the card's
   `border: 1px solid #a6cbdc` and, in the same case, reads `src/options/options.component.ts` to assert the settings card
   declares the same thing. After this change the two surfaces deliberately disagree about the frame, so:
   - the popup's card frame and radius are pinned **absent** (an absence pin that can fail — name in the report what
     mutation turns it red);
   - the **settings** card's frame stays pinned **present**, still read from the options file, so the settings half of the
     old claim is not lost with the popup half;
   - the half that is still shared — `padding: 16px`, `font: 13px/1.45 system-ui, sans-serif`, the palette roles, and the
     popup's own `320px` versus the settings `360px` — stays pinned as before;
   - the case title and its doc comment say what the new rule is and why (`A144`), and name the shapes that now differ on
     purpose.
5. **The document's rule is untouched.** `src/popup/index.html` keeps exactly one `<style>` block with the one rule
   `body { margin: 0; }`.
6. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the `Popup look` bullet states the card's
   palette, padding and type scale **without** a frame, says the window owns the rounded shape, and references `A144` and
   the amendment of `A141`. Check the popup contract bullet (`:155`) and AC 22/AC 26 for any sentence that now claims a
   drawn frame, and correct it if so.
7. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently
   **176 info**), `npm run typecheck`. `dist/` stays **12 files**. Baseline **1048 tests / 47 files**; the count may only
   grow. `README.md` is the PM's.

## Out of scope

- The reader's other Run 10 items (`S14-13`): the colours, the trash glyph against the page editor's drawing (`S14-4`), the
  checkbox, «nothing else moved». They were not answered before this change and are not answered by it.
- `S11-1`/`S12-1`/`S14-1` (the `A125` palette's provenance).
- The settings window's own frame — it stays, it is a card inside a dialog box Chrome sizes.

## Constraints

- Never weaken or delete a pin other than the two declarations AC 4 explicitly re-pins as absent. Deleting the case would
  drop the settings half with it — rewrite it.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t14-02-engineer.md` in one `write` call → paste the report
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
