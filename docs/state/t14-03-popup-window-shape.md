# t14-03 — the rounding moves to the document box

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, ruling **`A145`**). The reader's Run 11 answer: **«1. углы не
скруглённые вообще. прямой угол с чёрной рамкой»** — which falsifies the premise `A144` rested on.

## Why `A144` failed, measured

The popup document is

```html
<style>body { margin: 0; }</style>
<body><app-root></app-root></body>
```

`body` is a plain block box the user agent paints **white**, and it is the box that fills the toolbar panel. `app-root` and
`.popup` were cream and 320 px wide **inside** it. So:

- Chrome clips a popup window to a **rectangle** — it does not round its own content;
- `body` is the white rectangle the reader sees, square by definition;
- the cream never touched the window edge, so the white showed as a band around it.

Removing the card's frame removed the only element that had ever been rounded and left a square white box with a dark edge.
`A144` traded a rounded card for a square window.

## Acceptance criteria

1. **The document box is the surface.** `src/popup/index.html`'s single `<style>` block becomes the popup's surface rule:
   `body` gains the `A125` cream fill (`#fdf7ee`), the panel-filling geometry and the rounded corners — a `border-radius`
   plus `overflow: hidden` so the paint and the clip belong to the same box. It keeps `margin: 0`. No colour outside the
   `A125` set, and no new literal.
2. **The width moves with the surface.** The `320px` that was `.popup`'s width belongs to the box that is now the surface:
   the document box spans the panel, and the cream reaches both edges. `.popup` **loses** its `width: 320px` and becomes
   content inside the box. If you keep a width constant in the component, say in the report which rule owns it now and why;
   the pin that reads the constant follows it.
3. **`.popup` stops being the surface.** It keeps its `16px` padding, the `13px/1.45 system-ui` scale and the `A125` ink, and
   it **loses** `background: #fdf7ee` (the document paints now) and any width of its own. `:host` loses its cream fill for
   the same reason — the paint lives in one place, and that place is the document.
4. **No frame returns.** Nothing gains a `border`, `outline` or `box-shadow` as a substitute: the shape is the window's
   rounded box, not a drawn outline. This is the exact defect the reader reported twice.
5. **The controls keep their own borders.** The row separator `border-top: 1px solid #a6cbdc`, the checkbox's
   `border: 1px solid #a6cbdc` with its `3px` radius, the icon-only delete control with its `24`/`16` sizes, the palette, the
   type scale and the `16px` padding are untouched.
6. **The document pin is rewritten, not dropped.** `tests/popup-window-look.spec.ts` currently asserts, by whitespace-normalised
   string equality, that the document's single style block is exactly `body { margin: 0; }` and that there is exactly one
   block. That assertion becomes false; the case must be rewritten to pin the **new** rule set — one block, the cream paint on
   the box, the radius, the clip, the zero margin, and the absence of any frame declaration — with a mutation you apply,
   observe and revert **from a `cp` copy** that turns it red. Deleting the case is a failed AC: it is the only pin that says
   the popup document's rule set is deliberate.
7. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the `Popup look` bullets state that the
   **document box** carries the fill and the rounded shape, that the component is content inside it, and that no drawn frame
   exists; reference `A145` and say that it supersedes `A144`. The sentence that says the popup document owns «one rule, one
   declaration» is corrected — check `:157`-area bullets and the popup contract bullet (`:155`) for the same claim.
8. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently
   **176 info**), `npm run typecheck`. `dist/` stays **12 files**. Baseline **1048 tests / 47 files**; the count may only grow.
   `README.md` is the PM's.

## The claim this task cannot test — and how it is handled

`A145`'s premise is that a `border-radius` on the document box is visible in a Chrome popup window. **No test in this
repository can verify that**, and the previous premise in the same family was wrong (`S14-19`). So:

- the pins are written for the rule set, which is a fact about the source;
- the **sight** is owed by **Run 12**, and the report must say in one sentence that the rounded look is unverified by tests
  and rests on that run;
- if the reader reports square corners again, the next step is not another CSS guess: it is to check whether Chrome clips the
  popup to a rectangle at all, and if it does, the honest answer is that a popup cannot be rounded and the rule is withdrawn
  with that finding recorded.

## Out of scope

- The Run 10 items still unanswered (`S14-13`): the palette's reading, the trash glyph against the page editor's drawing
  (`S14-4`), the checkbox, «nothing else moved».
- `S11-1`/`S12-1`/`S14-1` (the `A125` palette's provenance).
- The settings window's own shape — it is a card inside a dialog box Chrome sizes, and `A144`'s removal of the popup's frame
  never applied to it.

## Constraints

- Never weaken or delete a pin other than the document pin AC 6 rewrites. Baseline **1048 tests / 47 files**.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t14-03-engineer.md` in one `write` call → paste the report
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
