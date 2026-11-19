# t11-01 — engineer report

Commit **`48f3446`** — `t11-01: the owner's new mascot in the settings header, and the extension's first icon`.
One commit, 8 files, +207 / −26. Working tree clean after the commit; nothing staged.

## Order of operations, and the one thing that had to happen first

The owner's artwork existed **only** inside the ignored build output, and `cleanDist()` deletes `dist/`
on the first build. Copied out before anything else:

```
$ cp dist/options/assets/cat-mascot_new.png .t11-source/cat-mascot_new.png
$ sha256sum .t11-source/cat-mascot_new.png
0c2f1fc86c8a3e95fe25b799ba1d813279034908136806c7be259425601593e0
$ stat -c%s .t11-source/cat-mascot_new.png
1306640
```

1 306 640 bytes — the size the brief measured. `.t11-source/` is kept out of the index through
`.git/info/exclude` (a local, uncommitted ignore), so it is invisible to `git status` without a tracked
ignore-file change. **Not committed**, per `A130` and the brief.

## AC 1 — the artwork ships, converted once, only the result committed

One-off script, kept in the uncommitted `.t11-source/` workspace, never shipped and never a build step:

```
$ node .t11-source/convert.mjs
src/options/assets/cat-mascot.png: 20009 bytes
src/icons/icon-128.png: 20009 bytes
```

What it does: PNG container parsed, `IDAT` inflated with `node:zlib`, scanlines unfiltered, and the
**whole 1254×1254 grid** box-filtered into the **whole 128×128 grid** (13:1 … 14:1 cells), premultiplied by
alpha so transparent pixels cannot darken the art's edge. Then a **fresh** PNG: own `IHDR`/`IDAT`/`IEND`,
no crop, no recolour, no padding, and the source's `eXIf`/`tEXt`/`pHYs` chunks dropped by construction
(ledger `S11-5`). No dependency, no network, no build-time image processing (`A130`).

Both hashes:

| End | SHA-256 | Bytes |
|---|---|---|
| source `.t11-source/cat-mascot_new.png` | `0c2f1fc86c8a3e95fe25b799ba1d813279034908136806c7be259425601593e0` | 1 306 640 |
| committed `src/options/assets/cat-mascot.png` | `c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e` | 20 009 |
| committed `src/icons/icon-128.png` | `c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e` | 20 009 |

`IHDR` of the committed file: 128×128, bit depth 8, colour type 6 (RGBA), non-interlaced. The 1.3 MB
source is **not** committed — `git show --stat HEAD` lists neither it nor anything from `.t11-source/`.

## AC 2 — the whole cat is visible inside the circular frame (`Q1a`)

**Deviates from the brief's wording, on the PM's ruling.** The brief's AC 2 asked for an explicit framing
that scales the art to "about the measured 129 px of box". That rule cannot deliver AC 3 for a 1254-wide
asset, and the two readings of AC 2/AC 3 were in genuine conflict, so I stopped and reported it before
writing any CSS. The supervisor answered: **option 1 — no extra CSS scale; the conversion is what fits the
circle**, and corrected the brief in `d4d536f` ("Correction 1"). That is what shipped.

Measured, from the **image center** `(627, 627)` — which is the center `object-fit` and `border-radius`
both work from, unlike the painted-bounding-box center `(625.5, 610.5)` the brief used:

| Quantity | Source (1254 grid) | After the 1254→128 conversion |
|---|---|---|
| farthest painted pixel | radius **628.00** at (410, 37), alpha 255, colour `#010c17` | radius **64.10** |
| inscribed circle radius | 627 | 64 |

So the downscale itself lands the full artwork within a tenth of a pixel of the inscribed circle, and the
clip cuts only the anti-aliased edge. The one rule change in `src/options/options.component.ts` is
`object-fit: cover` → `object-fit: contain` (the honest word for a source that is exactly the box; `cover`
on a square source was a no-op crop). **No** `transform`, `scale` or `zoom`; the image box is still **80 px**,
the frame is still **`2px solid #a6cbdc`** (`A125`), and the `A127`/`A129` 84 px painted footprint is
unchanged. Pinned as an absence in the geometry case, so a later `transform` is a red test.

## AC 3 — the `t9-02b` circular-frame pin is recalculated against the new bytes

`tests/options-window-look.spec.ts` decodes the **shipped** file (same decoder, no new dependency) and the
numbers are the new artwork's, not the old ones:

| Pin | Old artwork (`A126`) | New artwork |
|---|---|---|
| `paintedPixels` | 13 054 | **12 619** |
| `bounds` | 0…127 × 0…127 | **0…127 × 0…124** |
| `outsidePainted` | 162 | **58** |
| `outsideOpaque` | 0 | **0** ✅ |
| `maxAlphaOutside` | 156 | **108** |
| `maxAlphaInside` | 255 | **255** |
| `farthestPaintedRadius` | 64.52 | **64.55** |

`outsideOpaque === 0` is **true again** — the assertion is recalculated, not weakened. The non-vacuity half
is kept and strengthened: `maxAlphaInside === 255` (the art does have fully opaque content),
`outsidePainted > 0` and `< 1 000`, `farthestPaintedRadius > 64`, and a new case pins the **margin** —
`farthestPaintedRadius − 64 < 1` — so a future re-crop that pushes drawn content past the circle is red
rather than green. The brief's "stop and report instead of relaxing" path was not needed: nothing was
relaxed, and the only assertion whose *value* changed is the painted-area fingerprint (a new file's real
fingerprint), plus the bounding box's `maxY` (1254→128 rounding puts the last painted row at 124).

## AC 4 — one 128×128 PNG at `src/icons/icon-128.png`

A real committed file, new top-level `src/icons/` (`A131`). Byte-identical to the mascot file by design:
same artwork, same size, one converted file per use site. No `16/32/48` set, no `.ico`, no `data:` URI, no
`web_accessible_resources` — the last two pinned as absences.

## AC 5 — the manifest declares it, and the file really reaches `dist/`

`src/manifest.json` gains both keys, both naming `icons/icon-128.png`:

```json
"icons": { "128": "icons/icon-128.png" },
"action": { ..., "default_icon": { "128": "icons/icon-128.png" } }
```

The copy mechanism follows the manifest, not `angular.json`: the icon is a file of the extension rather than
an options-page asset, and `scripts/build-extension.mjs` already owns the manifest copy and the reference
check. Added `copyIcons()` + a small `copyDir()` helper, called right after `copyManifest()` and **before**
`verifyManifestReferences()`:

```
[build] copied src/manifest.json -> dist/manifest.json
[build] copied src/icons -> dist/icons
[build] manifest references resolved: content.js, popup/index.html, options/index.html, icons/icon-128.png, icons/icon-128.png
[build] options asset present: dist/options/assets/cat-mascot.png
[build] dist/icons\icon-128.png (20009 bytes)
[build] dist/ is a self-contained MV3 folder (12 files)
```

Both keys resolved, the file present at the named path. `verifyOptionsAssetShips` is untouched and still
checks its own asset (`options/assets/cat-mascot.png`, same message, same shipped `fail` chain). Two new
top-level functions were added to the build script's pinned live-function name list in
`tests/toolchain-contract.spec.ts`, so neither can become an uncounted declaration.

## AC 6 — the absence pin is replaced by a presence pin

`tests/toolchain-contract.spec.ts` — the case that was ruling `t9-02b` R3 (`declares no icons, no
action.default_icon and no content-script css`) is now
`declares the one 128 px icon in both keys, and still no content-script css`, and it asserts:

- `manifest.icons` **equals** `{ '128': 'icons/icon-128.png' }` — declared, not absent;
- `manifest.action.default_icon` equals the same map;
- exactly one key each, so a second size or a `.ico` is red;
- `dist/icons/icon-128.png` **exists** and its `IHDR` really says 128×128;
- `content_scripts[0].css` **is** still `undefined` — the one key of the three that remains absent, kept
  pinned so the narrowed spec sentence cannot rot.

The comment above the `ManifestShape.icons` field and the docstring of the case were updated with it. No
`=== undefined` assertion on `icons` or `action.default_icon` is left anywhere:

```
$ grep -n "icons\|default_icon" tests/toolchain-contract.spec.ts
45:  action?: { default_popup?: string; default_icon?: unknown };
52:  icons?: Record<string, string>;
154:    expect(script).toMatch(/manifest\.icons/);   # the build script still reads the key — true
```
No absence assertion survives. Every other pin in the repository is untouched.

## AC 7 — the spec follows in the same commit

`docs/specs/content-overlay-ui.md`:

- **line 89 sentence narrowed**: "this manifest names none of the three" → **"names two of the three
  now"**, stating that `icons` and `action.default_icon` both name `icons/icon-128.png`, that
  `scripts/build-extension.mjs` copies `src/icons/` to `dist/icons/` so the reference check walks that path
  on every build, and that **`content_scripts[0].css` remains the one key this manifest does not name** and
  is the absence the test pins.
- **the mascot framing sentence** restated: `object-fit: contain` instead of `cover`, the measured numbers
  replaced by the new file's (58 outside / max alpha 108 / farthest radius 64.55), and a new sentence
  stating that **what keeps the art inside the circle is the conversion, not a CSS scale** — the 628.00 →
  64.10 arithmetic — with the absence of `transform`/`scale`/`zoom` and of any `width`/`height` beyond the
  80 px box pinned.
- **acceptance item 28** updated: the asset is now described as the 1254→128 downscale with the new
  SHA-256 (noting `A130` supersedes `A126`'s byte-identity clause), and the icon facts — one 128×128 PNG,
  two manifest keys, copied into `dist/`, reference-checked — are added.

`docs/specs/INDEX.md` unchanged (no new spec file). `README.md` left alone (the PM's).

## AC 8 — the popup is untouched

```
$ git diff --name-only HEAD~1 -- src/popup src/content src/core | wc -l
0
```

No file under `src/popup/`, `src/content/` or `src/core/` changed; no new Russian string, no new artwork
(`A133`). The popup's only appearance change is the one Chrome makes itself for a manifest-declared
`action.default_icon`.

## AC 9 — gates green, in profile order, with exit codes and counts

| # | Command | Exit | Evidence |
|---|---|---|---|
| 1 | `npm run build` | **0** | `manifest references resolved: content.js, popup/index.html, options/index.html, icons/icon-128.png, icons/icon-128.png`; `options asset present: dist/options/assets/cat-mascot.png`; `dist/ is a self-contained MV3 folder (12 files)` |
| 2 | `npm test` | **0** | `Test Files 46 passed (46)`, `Tests 1031 passed (1031)` |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 175 info(s)` |
| 4 | `npm run typecheck` | **0** | three `tsc -p … --noEmit` projects, no output |

Baseline was **1026 tests / 46 files**; now **1031 tests / 46 files** — the count grew by 5 and no test was
deleted or skipped. `dist/` went from **11** files to **12**: one asset replaced in place
(`options/assets/cat-mascot.png`, 27 414 → 20 009 bytes) and one added (`icons/icon-128.png`), ledger `S11-3`.

`dist/` after the final build carries the same bytes as `src/`:

```
$ sha256sum dist/options/assets/cat-mascot.png dist/icons/icon-128.png
c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e  dist/options/assets/cat-mascot.png
c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e  dist/icons/icon-128.png
```

## AC self-check, line by line

| AC | Verdict | Evidence |
|---|---|---|
| 1 | ✅ | `node .t11-source/convert.mjs`; source hash `0c2f1f…` / result hash `c26769…`; source not committed |
| 2 | ✅ **with the PM's correction** | art fitted by the conversion (628.00 × 128/1254 = 64.10 < 64); `.mascot` only changes `cover` → `contain`; 80 px box, `2px solid` frame, no `transform` |
| 3 | ✅ | pin recalculated against the new bytes: `outsideOpaque === 0`, `maxAlphaOutside` 108, `outsidePainted` 58, farthest 64.55, painted 12 619; non-vacuity kept and margin added |
| 4 | ✅ | `src/icons/icon-128.png`, real file, 128×128 8-bit RGBA, no second size / `.ico` / `data:` URI / `web_accessible_resources` |
| 5 | ✅ | both manifest keys name `icons/icon-128.png`; `copyIcons()` puts it in `dist/`; the shipped reference check resolves both; `verifyOptionsAssetShips` untouched |
| 6 | ✅ | R3's absence pin replaced by a presence pin (declared, both keys, one size each, file in `dist/`, real 128 PNG); the `content_scripts[0].css` absence kept; no absence assertion left |
| 7 | ✅ | spec sentence narrowed to `content_scripts[0].css`; icon file/size/keys and the framing rule stated; INDEX untouched |
| 8 | ✅ | `git diff --name-only HEAD~1 -- src/popup src/content src/core` → 0 files |
| 9 | ✅ | four gates exit 0; 1031 tests / 46 files; `dist/` 12 files; README untouched |

## Constraints honoured

- No new dependency, no build-time image processing, no network call (`A130`): the converter is a one-off
  Node script in an uncommitted workspace; `node:zlib` and the PNG container are the whole toolchain.
- No weakening or deletion of any pin other than the one AC 6 names. The five new test cases are additions;
  the changed assertions are the `t9-02b` pixel values (recalculated, not relaxed), the `cover` → `contain`
  literal, the replaced absence pin, and the build script's live-function name list (a pin that had to name
  two new declarations or it would be the thing that rots).
- No mutation loop was run; nothing was restored with `git checkout`, and no `git checkout -- .` was ever
  issued. The only file I mutated to prove a pin was a test fixture, and it was corrected in place.
- `README.md` untouched; `docs/state/` untouched except this report; one writer; one commit.

## Open questions / residual risks

1. **`Q1a` wording.** AC 2's original sentence ("an explicit framing that scales the art to about the
   measured 129 px of box") is not what shipped; the brief was corrected in `d4d536f` on the supervisor's
   ruling. If the owner's intent was the literal extra shrink, that is a new slice — the art would be drawn
   at ~13 px of the 80 px box, a visible dot. **My reading, and the supervisor's, is that the conversion is
   the intended `Q1a`.** Flagged rather than silently decided.
2. **The 0.9 px margin is thin.** The fit rests on the painted bounding box being centred in the source
   (`bounds` x 6…1245, y 0…1221 of 1254). A future re-crop of the source could push opaque art past the
   circle; the new margin case (`farthestPaintedRadius − 64 < 1`) turns that red instead of letting it ship.
3. **Palette mismatch stays ledger `S11-1`** — the `A125` decorative `#a6cbdc` no longer matches the new
   art's `#ace9f6`; not touched here, as `Q2a` decided.
4. **`README.md` and its `dist/` file count (11 → 12)** are the PM's to sync — ledger `S11-3`.
5. **No `chrome://extensions` load** was performed: the brief's behaviour slice is verified by the shipped
   reference check resolving both icon keys against the real `dist/`, plus the byte-level pins. A manual
   load would confirm only that Chrome paints the declared icon, which no artifact here can hold.
