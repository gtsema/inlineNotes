# t11-01 — the new mascot in the settings header, and the extension's first icon

Stage 11 (`docs/state/stage-11-mascot-and-icon.md`). Owner's answers: **`1. только 128`**, **`2. Только в шапке окна
настройки — там где название приложения`**, **`3. да, это он`**, and to the framing/palette pool: **`дефолты`** — so
`Q1a` (keep the circle, zoom the art out until it fits) and `Q2a` (`src/icons/icon-128.png`, palette mismatch ledgered,
not fixed here).

## Goal

The settings header shows the owner's new cat artwork whole inside the circular frame, and the extension finally
declares an icon — one 128×128 PNG — for Chrome's toolbar and the extensions page. The popup gains nothing.

## Inputs, and what the PM already measured

- Source, the only copy that exists: `dist/options/assets/cat-mascot_new.png`, 1 306 640 bytes, `1254×1254`, 8-bit RGBA,
  non-interlaced, chunks `IHDR sRGB gAMA pHYs tEXt eXIf IDAT×20 IEND`. **Ignored by git, tracked by nothing.** Copy it
  out of `dist/` before your first `npm run build` — the build cleans `dist/`.
- Measured by decoding the PNG in Node (`zlib.inflateSync`, scanlines unfiltered): painted (alpha ≥ 8) **1 192 383**
  pixels = 75.8 %; painted bounding box x `6…1245`, y `0…1221`; all four 40×40 corners empty; **816** painted pixels
  outside the inscribed circle and **all 816 are at alpha 255** (no anti-aliasing); that band is the top rows `0…333`,
  columns `73…987`, colour `#010b19`/`#041a33`.
- Farthest painted pixel from the **image centre** `(626.5, 626.5)`: **628.00 px**, at `(410, 37)`, alpha **255**,
  colour `#010c17` — the solid navy hat band. *(Corrected in `t11-01`: the PM first measured `621.46` from the painted
  bounding-box centre `(625.5, 610.5)`, which is not the centre `object-fit` and `border-radius` work from. The
  engineer's `628.00` is the right number, and the brief's `129.1 px` consequence below was wrong.)*
- **The conversion is what satisfies the frame, not a CSS scale.** A `1254 → 128` downscale multiplies the farthest
  painted radius by `128/1254 = 0.1021`, so `628.00` becomes **64.10** against a circle radius of `64`: the full
  128×128 art lands within half a pixel of the inscribed circle. A literal CSS fit would need `40/628 = 0.0637`, i.e.
  the art drawn at `80 px` of an `80 px` box — no frame margin at all, which is not what the owner wants. So `Q1a` is
  delivered by the downscale, and the rule change is `object-fit: cover` → `contain`.

## Acceptance criteria

1. **The artwork ships, converted once, by you, and only the result is committed.** `src/options/assets/cat-mascot.png`
   is replaced by a PNG produced from the owner's file. It is a faithful downscale (no re-crop of the art beyond what
   AC 2 needs, no re-colouring, no re-drawing) and the report states the exact command and both hashes: the source
   (SHA-256 of the `cat-mascot_new.png` you copied out of `dist/`) and the committed file. The 1.3 MB source is **not**
   committed.
2. **The whole cat is visible inside the circular frame (`Q1a`).** The `128×128` downscale itself puts the painted
   content inside the inscribed circle (see the measurement above: farthest painted radius `64.10` against a circle
   radius of `64`), so **no CSS scale, no `transform`, and no second shrink is added**. The one rule change is
   `object-fit: cover` → `object-fit: contain` (keeping `object-position: center`), which is the honest statement for a
   square source that is exactly the image box. The mascot's **image box stays 80 px** and the **frame stays
   `2px solid`** the `A125` decorative colour (`A127`, `A129` are unchanged rulings).
3. **The `t9-02b` circular-frame pin is recalculated, not deleted.** `tests/options-window-look.spec.ts` decodes the
   shipped PNG and asserts `outsideOpaque === 0`. With the art pre-scaled to fit, that becomes **true again** for the
   new file — assert it against the new bytes, and keep the non-vacuity half (the art does have fully opaque content,
   the painted area is a real fingerprint). If your framing keeps opaque art outside the circle instead, **stop and
   report it** rather than weakening the assertion.
4. **The icon is one 128×128 PNG at `src/icons/icon-128.png`** (`A131`), a faithful downscale of the same artwork,
   committed as a real file. No `16/32/48` set, no `web_accessible_resources`, no `data:` URI.
5. **The manifest declares it.** `src/manifest.json` gains `icons` and `action.default_icon`, both naming
   `icons/icon-128.png`. The shipped `verifyManifestReferences()` already resolves both keys and fails a build whose
   `dist/` lacks the file, so the icon must really be copied: `angular.json` or the build script must put it in `dist/`
   at the path the manifest names. Keep the copy mechanism consistent with how the options asset is copied, and keep
   `verifyOptionsAssetShips` honest about its own asset.
6. **The absence pin that forbade icons is replaced by a presence pin.** `tests/toolchain-contract.spec.ts:1026`
   currently asserts `manifest.icons === undefined` and `manifest.action?.default_icon === undefined`; that sentence
   was ruling `t9-02b` R3 and it is now false. Replace it with a pin that the two keys **are** declared, name
   `icons/icon-128.png`, and that the file exists in `dist/` (and is a PNG of the size the manifest claims).
7. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md:89` says the manifest «names none of the
   three» (`content_scripts[0].css`, `icons`, `action.default_icon`). Narrow that sentence to the one that remains true
   (`content_scripts[0].css`) and state the new facts: the icon file, its size, the two manifest keys, and the framing
   rule of AC 2. `docs/specs/INDEX.md` needs no change (no new spec file).
8. **The popup is untouched.** No file under `src/popup/` changes, no new string, no new artwork there (`A133`).
9. **Gates green and counts stated.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs`,
   `npm run typecheck`. The `dist/` file count changes (one asset replaced, one icon added) — quote the new number.
   `README.md` is the PM's to sync, not yours.

## Out of scope

- The palette re-sampling (`S11-1`): the decorative border `#a6cbdc` no longer matches the new art's blue `#ace9f6`.
  Ledgered, not fixed here.
- Anything in `src/content/`, `src/core/`, the popup, or the page overlay.
- A second icon size, an `.ico`, or a store listing image.
- Any new dependency or build-time image processing (`A130`).

## Constraints

- Never weaken or delete a pin other than the one AC 6 names. Baseline **1026 tests / 46 files**; the count may only
  grow.
- No network call in shipped code. `dist/` stays a self-contained MV3 folder.
- **Copy the source artwork out of `dist/` first** — `cleanDist()` deletes it, and it exists nowhere else.
- Restore any temporary mutation **from a copy you made**, never with `git checkout`, and never end a loop with
  `git checkout -- .`. This repository lost an uncommitted slice to exactly that.
- **Order: implement → gates → commit → then write `docs/state/t11-01-engineer.md` in one `write` call → paste the report
  in the final message as well.**
- One commit for code/tests/asset/spec. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.

## Correction 1 (PM, 2026-11-19, after the engineer's block)

The engineer stopped on AC 3 instead of choosing between two readings of AC 2, and he was right to. Both halves of the
defect were mine:

- **The measurement.** I reported the farthest painted pixel as `621.46` — measured from the painted bounding-box centre
  `(625.5, 610.5)`. `object-fit` and `border-radius` both work from the **image** centre `(626.5, 626.5)`, and from
  there the farthest painted pixel is **628.00** at `(410, 37)`, alpha `255`, colour `#010c17`. His number is correct;
  mine used the wrong centre. A literal CSS fit would need `40/628 = 0.0637` — the art drawn at `80 px` of an `80 px`
  box, leaving no frame margin at all.
- **The framing.** The `≈129 px of box` sentence was therefore wrong, and AC 2 asked for a shrink the artwork does not
  need: a `1254 → 128` downscale already multiplies the farthest painted radius by `0.1021`, turning `628.00` into
  `64.10` against a circle radius of `64`. The conversion **is** the fit; the only rule that changes is
  `object-fit: cover` → `contain`.

Ruling for the record: **the mascot is the `128×128` full-art downscale, drawn at 80 px in the circular frame with
`object-fit: contain`; no `transform`, no second conversion, no per-use-site difference.** `src/icons/icon-128.png` is
byte-identical to the mascot file by design — one artwork, one conversion, two use sites (`A130`, `A131`).

Lesson, and it is the same class as the `t10-02` one: **a distance is only meaningful with its origin named.** «The
farthest painted pixel» cost a stalled child because the centre was implicit, and the two plausible centres differ by
6.5 px — enough to change the required scale by 1.6×. Every geometric number in a brief now names the origin it was
measured from.

Measured facts from the engineer's own decode of the converted file (to be pinned in AC 3, quoted here so the brief and
the test cannot drift): painted **12 619**, bounds x `0…127`, y `0…124`, `outsidePainted` **58**, `outsideOpaque` **0**,
`maxAlphaOutside` **108**, `maxAlphaInside` **255**, `farthestPaintedRadius` **64.55**; file SHA-256
`c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e`, **20 009** bytes; source SHA-256
`0c2f1fc86c8a3e95fe25b799ba1d813279034908136806c7be259425601593e0`, `1 306 640` bytes.
