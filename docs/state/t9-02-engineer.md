# t9-02 — engineer report: the settings window gets the cat (Stage 9)

Author: `extension-engineer`. Written with the engineer's own write tool into the repository at
`docs/state/t9-02-engineer.md`. The task state file `docs/state/t9-02-settings-window-look.md` was
never written by me; it is the PM's and still shows as modified in `git status` from the PM's own edits
before this run (it appears in neither commit).

## Commits (work order: code+tests+asset first, then the spec edit — `A53`)

| # | Hash | Message |
|---|---|---|
| 1 | `978b1cb` | `feat(options,scripts,tests) t9-02 (A123, A124, A125, A126): the settings window gets the mascot, the pinned palette and the explanation line` |
| 2 | `b7d3913` | `docs(specs,readme) t9-02 (A123, A124, A125, A126): the settings window gains its two Terms rows, the mascot/palette/layout rules, AC 28, and the synced dist and test counts` |

Files touched by the two commits (`git diff --name-only HEAD~2 HEAD`) — exactly nine:

```
README.md
angular.json
docs/specs/content-overlay-ui.md
scripts/build-extension.mjs
src/options/assets/cat-mascot.png
src/options/index.html
src/options/options.component.ts
src/options/text.ts
tests/options-window-look.spec.ts
```

Commit 1 stat: 7 files, +502 / −6, `src/options/assets/cat-mascot.png` `Bin 0 -> 27414 bytes`.
Commit 2 stat: 2 files, +22 / −10.

Untouched, as AC 6 requires: `src/options/author-name-service.ts`, `src/options/main.ts`,
`src/core/`, `src/content/`, `src/popup/` (including `src/popup/text.ts`), `src/manifest.json`.

## The asset (`A123`, `A126`)

```
$ cp "C:/Users/user/Desktop/test/Mistension/img/128.png" src/options/assets/cat-mascot.png
$ sha256sum src/options/assets/cat-mascot.png C:/Users/user/Desktop/test/Mistension/img/128.png
a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4 *src/options/assets/cat-mascot.png
a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4 *C:/Users/user/Desktop/test/Mistension/img/128.png
$ stat -c%s src/options/assets/cat-mascot.png   → 27414
$ file  src/options/assets/cat-mascot.png       → PNG image data, 128 x 128, 8-bit/color RGBA, non-interlaced
$ sha256sum dist/options/assets/cat-mascot.png
a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4 *dist/options/assets/cat-mascot.png
```

The hash equals the pinned value of `A126`, and no step re-encoded, resized or cropped the file: the
test reads the PNG's own `IHDR` numbers (signature, `IHDR`, 128×128, bit depth 8, color type 6 = RGBA)
so a re-encode is a failing assertion, not a reviewer's eye. Framing is CSS only
(`src/options/options.component.ts:123` `width: 80px`, `:126` `border-radius: 50%`, plus `height: 80px`,
`object-fit: cover`, `object-position: center`, `border: 2px solid #a6cbdc`).

## Gates, in profile order (`A62`)

| Order | Command | Exit | Output quoted |
|---|---|---|---|
| 1 | `npm run build` | **0** | `[build] options asset present: dist/options/assets/cat-mascot.png`; `[build] dist/ is a self-contained MV3 folder (11 files)` |
| 2 | `npm test` | **0** | `Test Files 46 passed (46)`, `Tests 976 passed (976)`; `FAIL` appears 0 times in the log |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 156 info(s)` |
| 4 | `npm run typecheck` | **0** | three `tsc --noEmit` passes, no diagnostics |

`dist/` file count: **11** (`find dist -type f | wc -l` → 11), which is exactly **+1** over the 10 the
repository documented before this task (`README.md` line 58 and the profile said 10). The added file is
`dist/options/assets/cat-mascot.png`. The nine earlier files are unchanged in name and the manifest is
untouched.

Negative proof for AC 2 (run once, then reverted): with `src/options/assets/` moved out of the tree,
`npm run build` exits **1** with
`build-extension: dist/options/assets/cat-mascot.png is missing; angular.json must copy src/options/assets into dist/options/assets`.
After the restore the copy hashed equal to `A126` again (quoted above), and `git status` showed only the
PM's state file.

No full test log is printed here, per the brief.

## New test file

`tests/options-window-look.spec.ts` — 18 tests, one file, all green inside the 976. It pins: the copy's
hash + byte size + `IHDR` numbers (AC1); the same bytes in `dist/options/assets/` (AC1, AC2); the relative
URL and the absence of `data:`, `http(s)://`, `@import` and `web_accessible_resources` (AC1); the
`angular.json` asset entry for the options project and the popup project's absence of one, plus the
build-script check and its call site (AC2); the header markup order and `alt=""`, and the CSS framing
rules (AC3); the key set of `OPTIONS_STRINGS`, the four pre-existing strings byte-for-byte, the pinned
new sentence, the key set of `OPTIONS_MESSAGE_TEXT`, the `N/40` counter wording, and "every options
string contains Cyrillic" (AC4); every palette role's literal, the absence of any color literal outside
the pinned set, and the **recomputed** WCAG ratio of every text pair ≥ 4.5 (AC5); the untouched control
bindings and the interpolation count (AC6); the removal of the fixed `360px` column, `width: 100%` +
`max-width: 360px` + `box-sizing: border-box` + `margin: 0 auto`, `min-height: 100vh`, `body { margin: 0 }`
in `index.html`, and `styles: []` (AC7).

Ratios the test recomputes from the shipped literals, matching the state file's 13.8 / 4.9 / 5.3 / 6.4:

```
ink #1b2a33 on cream #fdf7ee        13.83
hint #7b6a55 on cream #fdf7ee        4.89
label #ffffff on action #b8480d      5.29
accent #0f5f7a on band #eef4f7       6.44
refusal #b3261e on band #eef4f7      5.89   (kept value, see deviation 1)
refusal #b3261e on cream #fdf7ee     6.14
```

## AC self-check, one line per criterion

1. **The asset ships as a file** — done. `src/options/assets/cat-mascot.png` hashes to the `A126` value
   (output above) and the built folder carries the same bytes at `dist/options/assets/cat-mascot.png`
   (hashed above). The page reaches it only as `src="assets/cat-mascot.png"`
   (`src/options/options.component.ts:58`); `baseHref: "./"` resolves it inside `dist/options/`, and
   `dist/options/main.js` still contains the literal `assets/cat-mascot.png`. No data URI, no remote URL,
   no `web_accessible_resources` key in `src/manifest.json` (pinned by the test).
2. **The build copies it and fails without it** — done. `angular.json:65-71` declares
   `{ glob: "**/*", input: "src/options/assets", output: "assets" }` for the **options** project only
   (the popup project still has no `assets` key; `styles: []` at `angular.json:63` stays empty);
   `scripts/build-extension.mjs:150-157` adds
   `verifyOptionsAssetShips()` and `:192` calls it. Proven both ways: build exits 0 with
   `options asset present`, and exits 1 when the source folder is moved away.
3. **The header** — done. `src/options/options.component.ts:57-60` renders
   `<header class="header">` with the mascot before the existing `<h1 class="title">`; the frame is CSS
   (`:123` `width: 80px`, `:126` `border-radius: 50%`, `:124` `height: 80px`, `object-fit: cover`,
   `object-position: center`). The PNG is byte-identical to the source, so the rounding is provably not
   baked into the file. The whole image is shown at 80 px (the lifebuoy is inside the circle; the source
   ring fills the frame), and 128 → 80 px is a downscale, never an upscale.
4. **One new Russian line** — done. `src/options/text.ts:42` adds
   `nameHint: 'Это имя подписывает каждую заметку'` and it is the only added string; the four previous
   strings, the six keys of `OPTIONS_MESSAGE_TEXT` and the `N/40` counter wording are pinned unchanged by
   the new test. Rendered at `src/options/options.component.ts:62`.
5. **The palette is literal and derived (`A125`)** — done. The literals are copied from the pinned table
   into the component stylesheet (`:host` background `#fdf7ee` `:99`; card text `#1b2a33`; hint and
   counter `#7b6a55`; `.save` `#b8480d` + `#ffffff`; `.message` band `#eef4f7`; `.message--saved`
   `#0f5f7a`; borders `#a6cbdc` at `:108`, `:129`, `:155` — decorative only, never a text color). The test
   reads the shipped style text, pins every role, pins that no other hex literal exists in it, and
   recomputes the ratios (values above).
6. **Nothing else moves** — done. `git diff --name-only HEAD~2 HEAD` lists nine files and none of them is
   `src/options/author-name-service.ts`, a file under `src/core/`, `src/content/`, `src/popup/`, or
   `src/manifest.json`. The field, the `N/40` counter, the disabled-`Сохранить` rule and the message line
   keep their bindings; the only addition to the message line is the class it wears for a palette role
   (`messageClass()` at `:229`), never a new wording or a new state.
7. **Fits the dialog box** — done in code and in the spec. The fixed `width: 360px` is gone; the page is
   `min-height: 100vh` with `box-sizing: border-box`, and the card is `width: 100%` +
   `max-width: 360px` + `margin: 0 auto`, with `body { margin: 0 }` in `src/options/index.html` as the
   document's only rule. The spec states the same and keeps «no horizontal scrollbar» as a Run 6 sight
   (`docs/specs/content-overlay-ui.md:95`).
8. **Gates** — done. Table above: exit 0 / 0 / 0 / 0 in profile order, `dist/` = **11** files, exactly
   +1 over the previous 10.
9. **Terms / Aliases rows** — done. See the checklist answer below.
10. **The carried-fix number is answered by number in this report** — done, next section.

## Carried-fix checklist (`t9-01` review, carried fix 3 / R1)

1. **The two `Terms / Aliases` rows of AC 9** — **done**.
   - `docs/specs/content-overlay-ui.md:49` — `settings window` | «Окно настроек» | … The Russian column is
     the wording `README.md` already uses (the README bullet at line 38 begins «Окно настроек: …» and the
     "Без имени" bullet says «в это окно ведёт собственный интерфейс настроек»), so the row anchors the
     existing Russian wording rather than inventing one; the row also carries the `settings mascot` anchor
     inline, so a grep for that term lands in the Terms table.
   - `docs/specs/content-overlay-ui.md:51` — `name explanation line` | «Это имя подписывает каждую
     заметку» | … the English anchor paired with the exact new UI string.
   - Supporting rules were written in the spec's own style at
     `docs/specs/content-overlay-ui.md:91-96` (mascot ships, CSS framing, palette literal + measured,
     explanation line, dialog-box layout rule rewritten, nothing else moved) and the acceptance item is
     `docs/specs/content-overlay-ui.md:292` (item 28). `README.md` was synced in Russian: line 38-46
     mentions the explanation line and the mascot, lines 58, 59, 136, 137 carry 11 files / 976 tests in 46
     files / 156 informational lines. The forbidden substring «единственный» was checked absent
     (`tests/content-card-events.spec.ts:595` forbids it).

The other three carried fixes of that review stay out of this slice (`t9-02b-spec-test-debt`), as the
state file says.

## Deviations, gaps and open questions

1. **`A125` names no role for a refusal line.** The palette pins a *confirmation* color (`#0f5f7a` on
   `#eef4f7`) but the options page also renders refusals (`name_required`, `quota`,
   `storage_unavailable`, …). I kept the pre-existing `#b3261e` verbatim instead of inventing a seventh
   palette value, and recorded that gap in the spec (`docs/specs/content-overlay-ui.md:93`) and in the
   test (`PREEXISTING_REFUSAL`). Its measured ratios are 6.14:1 on the page background and 5.89:1 on the
   pale band, so AA holds. A PM ruling could pin a refusal role; this slice did not invent one.
2. **The mascot carries no wording: `alt=""`.** AC 4 allows exactly one new string, so the image is kept
   out of the accessibility tree rather than given a second Russian string. If the PM wants an `alt`,
   that is a new string and needs a ruling.
3. **`src/options/index.html` gained one rule** (`body { margin: 0 }`). It is inside the brief's
   "src/options/ (all five files)" input set, and without it the page background cannot reach the edge of
   the dialog box (AC 7). It declares no color, so the palette still has one owner — the component
   stylesheet, pinned by the `styles: []` assertion.
4. **No test reads the two new Terms rows.** The spec lands in commit 2 and the tests in commit 1, so a
   spec-text pin in commit 1 would have made the first gate red. AC 9 is answered by file:line here
   instead; if the reviewer wants an executable pin of the rows, that belongs in `t9-02b` test debt.
5. **Not seen in real Chrome by me.** AC 7 is pinned by stylesheet text and by the removal of the fixed
   column; the actual sight of the window at the dialog width (and the absence of a horizontal scrollbar)
   is still a Run 6 / `chrome://extensions` observation. The spec does not claim it. Same for the visual
   match of the mascot in the header: I verified the CSS numbers, not a screenshot.
6. **This report file is left untracked.** The brief budgets two commits and the `docs/state/` commit site
   is the PM's, so the file is written into the repository but not committed by me; the working tree after
   commit 2 shows only `docs/state/t9-02-settings-window-look.md` (the PM's own edit) and this untracked
   report. Nothing is staged (`git diff --cached --name-only` → empty).
7. **`check-agent-config.mjs` info count moved 140 → 156** because the new spec text backticks paths
   (`src/options/assets/cat-mascot.png`, `dist/options/assets/cat-mascot.png`,
   `tests/options-window-look.spec.ts`). Still 0 errors and 0 warnings; the checker reports existing
   paths in that category too, so it is noise, not a new gap. README's info count was stale (135) and is
   now 156.
8. **Counter wording note.** The options counter is `N/40` (`nameCounterText`), and `src/content/` keeps
   its own `N/256`. The AC 4 phrase "counter wording" was read as the options `N/40`; neither changed.
