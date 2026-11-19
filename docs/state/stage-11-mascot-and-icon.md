# Stage 11 — the mascot is replaced, and the extension finally has an icon

Opened by the user's request (2026-11-19): «Замени маскот на cat-mascot_new и перенеси с экрана настроек в шапку и его же
сделай значком приложения. Если нужно — сконвертируй или сожми», and his three answers to the PM's question pool:

1. the icon set is **128 only** — one file, no `16/32/48`;
2. the mascot stays **in the settings header, where the title is**; nothing is added to the popup, and he expects the
   icon change may be visible there by itself;
3. **yes**, `cat-mascot_new.png` (1254×1254) is the artwork he means.

The brief is `docs/state/t11-01-mascot-and-icon.md`. This file records the stage: measurements, rulings, ledger.

## What the PM measured before writing any brief

The source the user pointed at exists **only inside the ignored build output**, `dist/options/assets/cat-mascot_new.png`
(1 306 640 bytes, `1254×1254`, 8-bit RGBA, non-interlaced, chunks `IHDR sRGB gAMA pHYs tEXt eXIf IDAT×20 IEND`). It is
not tracked by git and no test names it. Everything below was measured by decoding that file in Node (`zlib.inflateSync`
over `IDAT`, scanlines unfiltered, alpha walked) — no third-party decoder, no new dependency.

### The artwork is not square-filling, and a circle clips real art

| Measurement | Value |
|---|---|
| Painted pixels (alpha ≥ 8) | **1 192 383** of 1 572 516 — **75.8 %** |
| Painted bounding box | x `6…1245`, y `0…1221` |
| Corner 40×40 blocks | **0** painted pixels in all four |
| Painted pixels on the outer 1-pixel frame | **62** |
| Painted pixels **outside** the inscribed circle | 816 |
| Painted pixels outside **at alpha ≥ 200** | **816** — i.e. **no anti-aliasing at all** |
| Alpha histogram outside the circle | `255: 816` (one value, nothing else) |
| Where they sit | top edge only: rows `0…333`, columns `73…987`; `top 477 / bottom 0 / left 0 / right 0` in the outer 40 px |
| Sample colour of that band | `#010b19`, `#021225`, `#041a33` — near-black navy |
| Dominant opaque colours | `#fcfcf6` 7.1 %, `#ace9f6` 1.5 %, `#011c38` 1.4 %, `#fe6b02` 0.9 % |

The `A125` palette sampled from the **old** artwork (`#b8480d` action, `#a6cbdc` decorative, `#fdf7ee` page) is not the
new artwork's palette: the new orange is `#fe6b02`, its blue is `#ace9f6`, its outline `#011c38`, its background
`#fcfcf6`. **The palette ruling therefore still holds and the artwork no longer matches it.** Nothing is changed by
that yet — it is ledger row `S11-1`, and the owner decides.

### The current rule would cut the cat's hat off

`src/options/options.component.ts` ships `.mascot { width: 80px; height: 80px; border-radius: 50%; object-fit: cover;
object-position: center; border: 2px solid #a6cbdc }`. `object-fit: cover` crops the **shorter** axis, so the visible
window is a centred square of side 1254 × (1221/1254) ≈ **1221**, i.e. a crop of about **16.5 px off the top** of the
1254 source — and the measured top band of opaque art is exactly there. The pinned `t9-02b` pixel claim was written for
the old artwork, where everything outside the circle was anti-aliasing (`max alpha 156`, `162` pixels, `0` opaque).
On this artwork it is false: `816` fully opaque pixels sit outside the circle.

So the stage has one visual decision the PM will not make silently: **how the artwork is framed** — crop the top band
away (a `--object-position`/scale change), keep the circle and accept a cut, or drop the circular clip. All three are
observable and all three need the owner's word.

## Rulings

| Ruling | Decision |
|---|---|
| `A130` | The icon is **one 128×128 PNG**, converted and compressed **once** by the PM from the owner's `cat-mascot_new.png` and committed as a real file; no build-time image processing, no new dependency, no committed original. The conversion is a faithful downscale of the owner's file, and the report records the exact command and the hash of both ends. |
| `A131` | The icon file is **`src/icons/icon-128.png`** — a new top-level `src/icons/`, not `src/options/assets/`, because the artwork is the extension's icon rather than an options-page asset. `src/manifest.json` names it in both `icons` and `action.default_icon`. |
| `A132` | The mascot element keeps `src="assets/cat-mascot.png"` and its `class="mascot"`; the file at that path is replaced by the owner's new artwork. No new URL, no new asset directory, no `web_accessible_resources`. |
| `A133` | The popup gains **no** artwork and **no** new string. The popup's only appearance change is the one Chrome makes itself for a manifest-declared `action.default_icon`. |

## Tasks

| Task | Slice | Status |
|---|---|---|
| `t11-01` | `cat-mascot_new.png` becomes the shipped mascot (converted/cropped to the settings frame), the extension gains `icons` + `action.default_icon` (one 128 PNG), the build's `dist/` count and the manifest pins move with them, and the `t9-02b` pixel pin is recalculated against the new artwork | briefed |

## Ledger

| Row | What is unresolved | Class | Owner |
|---|---|---|---|
| `S11-1` | The `A125` palette was sampled from the old artwork. The new art's orange/blue/cream are different (`#fe6b02`, `#ace9f6`, `#fcfcf6`), so the decorative border `#a6cbdc` and the mascot frame no longer match the art they sit beside. | ruling + spec | owner |
| `S11-2` | The `t9-02b` circular-frame pin (`outsideOpaque === 0`, `outsidePainted < 1000`, `maxAlphaOutside < 200`) cannot hold on this artwork as shipped: `816` opaque pixels sit outside the circle. Either the framing changes so they are clipped, or the pin is restated as a measured fact about the new art. | test + spec | `t11-01` |
| `S11-3` | `README.md` and the spec both state the `dist/` file count (`11`). Adding one icon file and replacing one asset changes that count, and no test pins it. | docs | PM |
| `S11-4` | The spec sentence at `docs/specs/content-overlay-ui.md:89` says the manifest «names none of the three» (`content_scripts[0].css`, `icons`, `action.default_icon`). Two of those three stop being true. The sentence is narrowed to the one that remains, and `tests/toolchain-contract.spec.ts:1026` is replaced by a pin that the two keys **are** declared and resolve. | test + spec | `t11-01` |
| `S11-5` | The `eXIf` chunk of the owner's file carries editor/camera metadata. The PM's committed icon drops it by construction (fresh PNG, own chunks only); the decision not to commit the 1.3 MB original is recorded in `A130` rather than left implicit. | provenance | PM |
| `S11-6` | `tests/options-window-look.spec.ts` pins the mascot's exact tag as `<img class="mascot" src="assets/cat-mascot.png" alt="" />`. If the framing decision adds an attribute, that pin and the «no inline style at all» pin both move with it. | test | `t11-01` |

## Question pool for the owner (asked before any code, because both answers are observable)

**Q1 — the framing of the settings mascot.** The measured situation: the artwork is 75.8 % painted with transparent
corners, and the current rule (`border-radius: 50%` + `object-fit: cover`) would cut the cat's hat — a band of **816
fully opaque** navy pixels sits outside the circle, `16.5 px` of it inside the cover crop.

- **Q1a — keep the circle, zoom out so the art fits inside it.** The artwork would be scaled down until the inscribed
  circle covers the painted bounding box (about 82 % of the current size), leaving a cream margin inside the frame.
  Cost: the cat gets visibly smaller than the 80 px it is now.
- **Q1b — keep the circle and the size, crop to the face.** The window is already a centred 1221² crop; add an
  `object-position`/`scale` so the top band is trimmed. Cost: the hat is gone by design, and the crop is a decision
  about the owner's own art.
- **Q1c — drop the circular clip for the new art** (a rounded-square or plain frame). Cost: this is the one shape that
  the `t9-02b` pin and the `A124` «circular frame» sentence were written around; both would be restated.
- **Default if unanswered: Q1a** — it is the only option that keeps the `A124` circular frame, keeps the whole artwork
  (which the spec's lifebuoy sentence already promises in spirit), and loses nothing but size.

**Q2 — the icon file's home and the mascot's palette.**

- **Q2a — `src/icons/icon-128.png`** (ruling `A131`) and **no palette change in this stage**: the decorative border
  `#a6cbdc` no longer matches the new art's blue `#ace9f6`, and that mismatch is ledgered as `S11-1` for a later ruling
  instead of being folded into this slice.
- **Q2b — the same file location, and re-sample the palette from the new art in this stage.** Cost: a bigger slice,
  and every palette pin in `tests/options-window-look.spec.ts` moves with it.
- **Default if unanswered: Q2a** — a visual asset replacement and a palette re-ruling are two decisions, and the
  stage budget is one verifiable slice at a time.

Neither question blocks the other half of the stage: the icon (`A130`–`A133`) is independent of the framing.

## Answers to the question pool (owner, 2026-11-19)

- **Q1 → `Q1a`.** The circle stays and the artwork is scaled out until it fits inside it. Measured target: the painted
  content spans 1243 px of the 1254 source, so it must be drawn at **≈ 129 px** of the 80 px image box (scale `0.1030`)
  for the whole cat to survive the clip. The mascot gets visibly smaller; nothing else about the frame moves.
- **Q2 → `Q2a`.** The icon lands at `src/icons/icon-128.png` (`A131`) and **the palette is not re-sampled in this
  stage**. The mismatch between the `A125` decorative `#a6cbdc` and the new art's blue `#ace9f6` stays ledger row
  `S11-1` for a later ruling.
