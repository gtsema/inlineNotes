# Run 11 — the popup's corners, and the Run 10 items still unanswered

Stage 14 follow-up (`docs/state/stage-14-popup-look.md`, task `t14-02`, ruling `A144`). The reader reported after Run 10 that
the popup's border drew square corners against the window's rounded edge; `A144` removed the card's frame and radius so
Chrome's own window shape shows. The PM verified everything mechanical; the corners themselves are a **sight**, not a
measurement — which is exactly what `S14-18` records.

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1048 tests / 47 files**; checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- `.popup` keeps `width: 320px; box-sizing: border-box; padding: 16px; background: #fdf7ee; font: 13px/1.45 system-ui;
  color: #1b2a33` and no longer declares `border` or `border-radius`; `:host` is byte-identical to before.
- The row separator and the checkbox keep their own `#a6cbdc` borders — `A144` touched one rule.
- Two PM mutations, each restored from a copy: putting the frame back on the popup card → **1 red**; removing the frame from
  the **settings** card → **1 red**. The second proves the rewritten pin still guards the settings half.

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The corners (this run's reason).** The popup now shows the window's own rounded corners with no square outline and no
   corner where a border stops. If any corner still looks square or shows a step, say which one.
2. **The edges.** The cream fills the panel edge to edge with no white sliver and no dark line around it.
3. **The row separators and the checkbox** are still visible — they kept their borders, and this change was not supposed to
   touch them.
4. **Nothing else regressed** from Run 10: the palette reads the same, the trash icon is still there with its `Удалить`
   tooltip, deleting still works, the checkbox still toggles.
5. **The trash glyph against the page's own.** Run 10 asked whether the popup's re-drawn trash looks like the one the page
   editor shows (`S14-4`); that question is still open and this run can answer it in the same pass: open a note on a page,
   look at the editor's delete glyph, compare with the popup's row trash.

## Recorded honestly

`A144`'s premise is that Chrome draws the popup window's own rounded corners. **No test can verify that** — every pin reads
stylesheet text (`S14-18`). If the reader reports the corners are still square, the premise is wrong and the next option is
the one the PM offered as number 2 (`border-radius` plus `overflow: hidden` on the host), not a return to the drawn frame.

## Outcome

Pending the reader's answer.
