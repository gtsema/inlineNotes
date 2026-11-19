# Run 12 — the popup's corners, third attempt, and the Run 10 items still unanswered

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, task `t14-03`, ruling **`A145`** which supersedes `A144`). The
reader's Run 11 answer was «углы не скруглённые вообще. прямой угол с чёрной рамкой»; `A144` had removed the card's frame
on the premise that Chrome would round the window itself, and the premise was false — the box the reader sees is `body`,
which the user agent painted white.

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1049 tests / 47 files**; checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- The document's single rule is now the surface: `body { margin: 0; width: 100%; min-height: 100vh; box-sizing: border-box;
  background: #fdf7ee; border-radius: 12px; overflow: hidden; }`. `.popup` is content inside it — no width, no paint; `:host`
  is `display: block` only.
- The only `outline` / `box-shadow` occurrences in the popup files are **prose** saying no frame may be drawn.
- Three PM mutations, each restored from a copy: the box losing `border-radius` → **1 red**; the box losing `overflow:
  hidden` → **1 red**; the card painting again → **1 red** (the pin refuses two owners of the paint).

## The honest limit

`A145`'s premise — that a `border-radius` on the document box is **visible** in a Chrome popup — is again a sight, not a
measurement, and the previous premise in this family was wrong (`S14-19`). This run is the only thing that can settle it.

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The corners (this run's reason).** The popup's four corners are now rounded, with no square step and no dark outline
   tracing a square edge.
2. **The edges.** The cream reaches all four edges — no white band on any side, and in particular none along the bottom on a
   short list.
3. **Nothing else regressed.** The palette reads the same, the trash icon is there with its `Удалить` tooltip, deleting still
   works, the checkbox still toggles, the row separators are visible.
4. **The trash glyph against the page's** (`S14-4`, open since Run 10): open a note on a page, look at the editor's delete
   glyph, and compare it with the popup's row trash. Same drawing or visibly different?
5. **The palette's reading** (`S14-13`, open since Run 10): does the popup now look like the same product as the settings
   window — same cream, same ink, same warm grey — or does something still read as a different surface?

## If the corners are still square

Then the premise is wrong for the second time and the honest next step is **not** another CSS guess: it is to check whether
Chrome clips a popup window to a rectangle at all. If it does, a rounded popup is not achievable, `A145` is withdrawn, and
that finding is recorded as the answer — with the cream fill kept, because a white band around the surface is a defect
independent of the corners.

## Outcome

Pending the reader's answer.
