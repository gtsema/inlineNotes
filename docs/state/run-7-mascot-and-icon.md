# Run 7 — the new mascot and the extension icon, in the reader's own Chrome

Stage 11 (`docs/state/stage-11-mascot-and-icon.md`, task `t11-01`) changed two things the reader can see and one they
cannot. The PM can verify the invisible one mechanically; the two visible ones need the reader's Chrome, because the PM's
`chrome_devtools` session drives a different Chrome instance from the one holding the unpacked extension (recorded in
`docs/state/run-6-settings-window.md`).

## What the PM already verified mechanically (no reader needed)

- `npm run build` exit 0. `dist/` is **12 files**; the build prints
  `manifest references resolved: content.js, popup/index.html, options/index.html, icons/icon-128.png, icons/icon-128.png`.
- `dist/icons/icon-128.png` and `dist/options/assets/cat-mascot.png` hash to the committed bytes
  (`c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e`, 20 009 bytes each).
- Moving `src/icons/icon-128.png` away fails the build with
  `manifest reference "icons/icon-128.png" does not exist inside dist/` and exit code **1**.
- `npm test` exit 0 — **1031 tests / 46 files**; checker exit 0 — **176 info**; `npm run typecheck` exit 0.

## What needs the reader's eyes (one line each, answer «да» / «нет» / «иначе: …»)

1. **The toolbar icon.** On the Chrome toolbar, the `inlineNotes` button shows the cat's face — not a blank page, not a
   generic puzzle piece, not a blurry blob. (A puzzle piece means the icon did not reach `dist/icons/`; a blur means the
   browser is upscaling something smaller.)
2. **The extensions page.** `chrome://extensions` lists `inlineNotes` with the same cat icon at card size.
3. **The settings mascot.** Open the settings window (`chrome://extensions` → «Подробнее» → «Параметры расширения»).
   The header shows the new cat in the circular frame, **whole** — ears, face and body inside the circle, nothing cut off
   at the top, no visible square edges from the artwork's corners.
4. **The mascot's size.** It reads as a mascot next to the title, not as a speck in a large circle. (The art is now drawn
   at 80 px from a 128 px source, so it is slightly smaller than the previous file, which filled the circle more.)
5. **Nothing else moved.** The popup looks exactly as before apart from the icon Chrome itself draws for the extension;
   no new text anywhere.

## Recorded as fact, not as an open question

The icon was checked by the build, not by an eye, before this run: the manifest names the file and the build fails when it
is absent. What the run adds is only whether Chrome **draws** it acceptably at 16 px and at card size — a judgement about
the artwork, not about the wiring.

## Outcome

Pending the reader's answer. The PM cannot see this Chrome instance; the run is recorded in the reader's words, and any
negative answer becomes a ledger row rather than a silent fix.
