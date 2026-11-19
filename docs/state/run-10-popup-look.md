# Run 10 — the popup in the settings window's design, in the reader's own Chrome

Stage 14 (`docs/state/stage-14-popup-look.md`, task `t14-01`) changed the popup's look. The PM verified the markup, the
palette and the pins mechanically; whether it **reads** right is the reader's call, because the PM's `chrome_devtools`
session drives a different Chrome instance from the one holding the unpacked extension (Run 6,
`docs/state/run-6-settings-window.md`).

## Verified mechanically (no reader needed)

- `npm run build` exit 0, `dist/` **12 files**; `npm test` exit 0 — **1048 tests / 47 files** (one new suite,
  `tests/popup-window-look.spec.ts`, is the first look pin the popup has ever had); checker exit 0 — **176 info**;
  `npm run typecheck` exit 0.
- The three retired colours `#1f1f1f`, `#6b6b6b`, `#e3e3e3` appear **zero** times in the popup; the palette in use is
  `#fdf7ee`, `#1b2a33`, `#7b6a55`, `#a6cbdc`, `#b8480d`, `#b3261e` — all `A125` roles, no invented literal.
- The card is `width: 320px; padding: 16px; border: 1px solid #a6cbdc; border-radius: 12px; font: 13px/1.45 system-ui`;
  `360px` appears only inside a comment explaining why the popup is not the settings width.
- The row's delete control is icon-only: one inline `<svg>`, `Удалить` in `aria-label` **and** `title`, the glyph
  `aria-hidden`/`focusable="false"`, hit box `24px` with a `16px` glyph.
- Four PM mutations on the shipped file, each restored from a copy: a palette role changed → **3 red**; the width changed
  to `360px` → **1 red**; the accessible name removed → **1 red**; the glyph replaced by visible text → **2 red**.
- The delete behaviour is untouched: one press still reaches exactly **one** core call for the whole author group.

## What needs the reader's eyes (answer «да» / «нет» / «иначе: …»)

1. **The card.** The popup opens as a cream card with the same border and rounded corners as the settings window, filling
   the panel edge to edge — not a white page with a floating tile and a browser margin around it.
2. **The colours.** Text reads dark on cream; the secondary line (the empty state) is the warm grey; nothing looks like the
   old grey-on-white popup.
3. **The delete control.** Each row ends with a small trash **icon**, not the word `Удалить`. Hovering it shows the tooltip
   `Удалить`.
4. **The delete still works.** Pressing the trash removes that author's rows on this page, exactly as the labelled button
   did — own rows and other people's rows alike.
5. **The checkbox.** The show/hide box is a real checkbox, drawn in the same palette, and still toggles the row's
   highlights.
6. **Nothing else moved.** The title, the notices (`Укажите имя в настройках` opens the settings window; the
   not-injectable line) and the empty state are where they were; no new text appeared anywhere.

## One thing to look at specifically

The trash glyph is **re-drawn inside the popup** rather than shared with the page widgets, because the popup is Angular and
the page overlay is Preact and the layer boundary forbids the import (`S14-4`). So it is worth a glance: does the popup's
trash look like the same glyph the page editor shows, or visibly different? If it reads as a different icon, that is a
ruling — either the drawing is corrected to match, or the two are deliberately allowed to differ.

## Outcome

Pending the reader's answer.
