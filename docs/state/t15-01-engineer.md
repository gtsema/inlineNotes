# t15-01 — engineer report

Task: the page widgets take the `A125` palette (`A150`, `A152`), the disabled state stops being an `opacity`
(`A153`, closing `D5`/`A128`), colours only, the author slots stay byte-identical (`A151`).

Commit: **`6bdd9ed`** — "feat(content,options): the page widgets take the A125 palette and the disabled state stops
being an opacity (t15-01)". One commit, seven files, no manifest, no asset, no icon, no `scripts/`, no `src/core/`,
no new dependency, no network call, no new Russian string. `dist/` stays **12 files**.

## Changed paths

| Path | What changed |
|---|---|
| `src/content/overlay/card-style.ts` | Colour literals of the two cards mapped to `A125` roles; the file header and the delete-class comment state the ruling |
| `src/content/overlay/tooltip-style.ts` | Colour literals of the tooltip mapped to `A125` roles; header states `A152` and why the one `opacity` there is not a disabled state |
| `src/options/options.component.ts` | `.save:disabled` drops `opacity: 0.45` and declares the three `A153` colours; the two doc comments state the ruling and the measurement |
| `tests/content-card-actions.spec.ts` | Five colour pins rewritten to the roles; two new cases (no retired literal, the disabled state is colours) |
| `tests/content-tooltip.spec.ts` | New `describe` "the tooltip takes the A125 palette (A152)": three cases |
| `tests/options-window-look.spec.ts` | `DISABLED_FILL` added to the literal set and the pair list; new `describe` "the disabled Сохранить is colours, not an opacity (A153)": four cases |
| `docs/specs/content-overlay-ui.md` | Two Terms rows (`page widget chrome`, `disabled action`); the `A125` bullet extended to every surface; the card/tooltip/disabled bullets; AC 29 |

## The colour table as implemented (old → new)

`src/content/overlay/card-style.ts`:

| Role | Old | New |
|---|---|---|
| card background | `#ffffff` | `#fdf7ee` |
| ink (card, buttons) | `#14171a` | `#1b2a33` |
| card border | `#b9bec4` | `#a6cbdc` |
| input background | `#ffffff` | `#ffffff` (role, unchanged) |
| input border | `#b9bec4` | `#a6cbdc` |
| counter | `#5b6470` | `#7b6a55` |
| counter at the cap | `#8a4b08` | `#b8480d` |
| button background | `#f3f4f6` | `#eef4f7` |
| button border | `#b9bec4` | `#a6cbdc` |
| primary label / background | `#ffffff` / `#1f6feb` | `#ffffff` / `#b8480d` |
| delete label / border | `#a4262c` / `#d08085` | `#b3261e` / `#a6cbdc` |
| refusal line | `#a4262c` | `#b3261e` |
| disabled label / fill / border | `#6b7280` / `#e9ecef` / `#c8cdd2` | `#1b2a33` / `#e3c3aa` / `#a6cbdc` |

`src/content/overlay/tooltip-style.ts`: background `#ffffff` → `#fdf7ee`, ink `#14171a` → `#1b2a33`, border
`#b9bec4` → `#a6cbdc`, foreign `ownership header` `#444c56` → `#7b6a55`. No grey survives; the file declares
exactly `#fdf7ee`, `#1b2a33`, `#a6cbdc`, `#7b6a55`.

`src/options/options.component.ts`: `.save:disabled { opacity: 0.45 }` → `color: #1b2a33; background: #e3c3aa;
border: 1px solid #a6cbdc;` plus the `cursor: default` the rule already carried. No colour literal was invented
anywhere; the two surviving `#ffffff` values are the `textarea` background and the primary label, both `A125` roles.

## AC self-check

1. **AC 1 — pass.** Every colour of `card-style.ts` is an `A125` role per the table above; the retired set
   (`#ffffff` as a card fill, `#14171a`, `#b9bec4`, `#f3f4f6`, `#1f6feb`, `#a4262c`, `#d08085`, `#5b6470`,
   `#8a4b08`) survives nowhere. The two `#ffffff` survivors are the input background and the primary label, and the
   new case reads both off their own rules (`textarea` background, `button.is-primary` colour).
2. **AC 2 — pass.** Tooltip cream `#fdf7ee`, ink `#1b2a33`, border `#a6cbdc`, foreign header `#7b6a55`; the case
   "states the surface in the three A125 roles and retires every grey of its own" asserts all four retired greys
   absent and all four roles present, and "declares exactly the four roles and invents no colour" pins the literal
   set to exactly those four.
3. **AC 3 — pass.** Page widgets: `button:disabled` fill `#e3c3aa`, label `#1b2a33`, border `#a6cbdc`. Settings
   window: `.save:disabled` has no `opacity` and the same three values. Measured, recomputed in the tests rather
   than quoted: label on fill **8.88:1**, fill against the card **1.56:1**, enabled fill **4.97:1**. The reason the
   `opacity` goes is in the spec and in both code comments: it fades fill and label together, so at `0.45` the label
   measured **1.42:1** and could never be legible. `WCAG 1.4.3` exempts inactive controls, so this is a legibility
   ruling, not a compliance fix.
4. **AC 4 — pass.** No geometry touched. The only new declarations are three colour properties on `.save:disabled`
   (the enabled rule keeps `border: 0`, so no enabled geometry moved). The existing geometry pins stayed green
   without edits: `card placement`, `A114`'s hit box, the Stage 12–14 layout pins, and the new "moves no geometry"
   cases in both the tooltip and the options suites.
5. **AC 5 — pass.** `src/content/paint/paint-palette.ts` and `tests/content-paint-palette.spec.ts` are absent from
   the diff (`git diff --stat` on both paths: empty) and that suite is green.
6. **AC 6 — pass, with the changed assertions named.** In `tests/content-card-actions.spec.ts` five literals were
   rewritten in place inside the existing "keeps the non-action visual rules" case and **none dropped**:
   `color: #5b6470;` → `color: #7b6a55;`, `color: #8a4b08;` → `color: #b8480d;`, the refusal's `color: #a4262c;` →
   `color: #b3261e;`, the frame's `background: #ffffff;` → `background: #fdf7ee;`, and the frame's
   `border: 1px solid #b9bec4;` → `border: 1px solid #a6cbdc;`. In `tests/content-tooltip.spec.ts` no literal was
   rewritten: that file pinned none of the four tooltip colours, so the new `describe` adds the presence and absence
   halves beside the existing geometry case. In `tests/options-window-look.spec.ts` the literal set gained
   `#e3c3aa` and the pair list gained the disabled pair; no row was dropped. No new suite file was created — the
   new cases live where the old pins already were.
7. **AC 7 — pass.** `docs/specs/content-overlay-ui.md` in the same commit: two Terms rows (`page widget chrome`,
   `disabled action`), the `A125` bullet extended to **every** extension surface with the one place outside it named
   (`A151`, the author slots), the corrected "nothing else about the card moved" sentence, the card/tooltip colour
   table, the disabled-state bullet with its measured contrast, and new AC 29. `A150`–`A153` are referenced in each.
8. **AC 8 — pass.** Gates below, exit codes and counts quoted; `dist/` 12 files; tests 1060 across 47 files against
   a baseline of 1051/47 — the count grew, none was dropped. `README.md` and `test_img/` untouched (`test_img/`
   stays untracked, as the PM's).

## Gates (profile order)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f` = 12 |
| 2 | `npm test` | **0** | `Test Files 47 passed (47)`, `Tests 1060 passed (1060)` |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 176 info(s)` |
| 4 | `npm run typecheck` | **0** | three `tsc --noEmit` projects, no output |

No full test log is reproduced here.

## One detail worth recording

The first draft of the spec text named `src/…` paths in prose, and the checker's "planned path not created yet"
info count went **176 → 196**, because it emits one info per backticked `src/`/`tests/` path token it reads. The
brief pins the count at 176, so the added prose was rewritten to name the modules by role ("the card stylesheet",
"the author palette module") instead of by path; the diff carries no deleted claim and no lost information. The
count is back to **176** and no `scripts/` change was made.

## Open questions

None. Nothing in the brief contradicted a spec line; `S14-47` (nothing pins the two layers' disabled colours staying
in step) stays ledgered and out of this task, as the brief says.
