# t9-02 — the settings window gets the cat (Stage 9)

Blocked until `t9-01-options-window` is accepted: the manifest shape and the build-script reference check land there.

## Rulings

| Ruling | Decision | Source |
|---|---|---|
| `A123` | The artwork is a **byte-identical copy of the user's own asset** `C:\Users\user\Desktop\test\Mistension\img\128.png` (a flat cartoon orange cat inside a lifebuoy, RGBA, 128×128, 27 KB) into `src/options/assets/cat-mascot.png`. The file is never re-encoded, cropped or edited: any framing or zoom is CSS only. Provenance (owner's own extension, no third-party license) is stated in the spec. | user ("возьми его"), `A120` closed |
| `A124` | The mascot renders at **80 CSS px** (the 128 px source is never upscaled past ~1.6×), **whole image including the lifebuoy**, in a circular frame in the header. The window palette is derived from the artwork, sampled from the asset itself in Chrome (canvas pixel read of `128.png`: cat body `#e25a00`, lifebuoy blue `#a0d0e0`, pale cream inside the ring `#fefcf5`, navy outline `#00203e`) and darkened until it passes WCAG AA. Static art, one light theme, no scroll at the Chrome dialog width. | user, «всё дефолт» |
| `A125` | The shipped palette is pinned **as literal values**: page/card cream `#fdf7ee`, ink `#1b2a33` (13.8:1 on cream), hint text `#7b6a55` (4.9:1), primary action `#b8480d` with white text (5.3:1), confirmation / border accent `#0f5f7a` on the pale band `#eef4f7` (6.4:1), decorative lifebuoy-blue border `#a6cbdc` (never carries text). Every pair that carries text is ≥ 4.5:1, pinned by a test that reads the stylesheet text. | PM ruling from `A124`, ratios measured, not estimated |
| `A126` | The asset is identified by hash: SHA-256 of the source `Mistension/img/128.png` is `a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4` (27 414 bytes). The copy in `src/options/assets/cat-mascot.png` must hash equal, and the reviewer re-computes it. | PM measurement, 2026-11-19 |
| `A127` | The pinned **80 CSS px is the image box**; the 2 px decorative frame paints **outside** it (`box-sizing` is not inherited by `img`), so the painted footprint is 84 px and the frame never eats into the artwork. | PM ruling closing `t9-02` review remark R1 |

Reuses `A118` (the settings surface is a Chrome window), `A119`/`A122` (entry points), `A121` (look defaults).

## Goal

The settings window stops looking like a bare form: a cat mascot in the header, a warm palette taken from the mascot,
one Russian line that explains what the name is for — and the asset ships inside `dist/` as a real file that the build
verification and a test both prove.

Done-criterion (observable): opening the extension's settings shows a window with the cat, the cream/orange palette, the
explanation line and the same `Имя` / `Сохранить` behavior as before.

## AC (numbered; the engineer writes 1–7 into `docs/specs/content-overlay-ui.md` in the spec's own wording style)

1. **The asset ships as a file.** `src/options/assets/cat-mascot.png` is a byte-identical copy of the source (the
   reviewer compares SHA-256), and the built extension carries `dist/options/assets/cat-mascot.png`. The options page
   reaches it through a relative URL only: no data URI, no remote URL, no `web_accessible_resources` entry.
2. **The build copies it and fails without it.** `angular.json` declares the options project's `assets` copy
   (`src/options/assets` → `dist/options/assets`), the popup project is unchanged, and `scripts/build-extension.mjs`
   fails the build when the copied file is absent.
3. **The header.** The window shows the mascot at 80 CSS px in a circular frame next to the existing title, and the
   framing/rounding is produced by CSS (`border-radius`, `object-fit`, `object-position`), never by editing the PNG.
4. **One new Russian line.** `src/options/text.ts` gains exactly one string: the explanation that this name signs every
   note. No existing string, message-map key or counter wording changes, and no string is removed.
5. **The palette is literal and derived (`A125`).** The component stylesheet declares exactly these values: cream
   `#fdf7ee`, ink `#1b2a33`, hint `#7b6a55`, primary action `#b8480d` with white text, accent `#0f5f7a` on `#eef4f7`,
   decorative border `#a6cbdc`. A test reads the shipped stylesheet text and pins the values, so a later edit cannot
   silently drop the contrast.
6. **Nothing else moves.** `src/options/author-name-service.ts`, `src/core/`, `src/content/`, `src/popup/` and
   `src/manifest.json` are untouched; the field, the `N/40` counter, the disabled-`Сохранить` rule and the message line
   behave exactly as the existing pins say.
7. **Fits the dialog box.** The page fills the Chrome dialog box (the old fixed `width: 360px` is gone) with a centered
   card, and no shipped rule lets it exceed the dialog's width. The observation «no horizontal scrollbar» stays a Run 6 item;
   no sentence in the spec claims it as something the reader has seen.
8. **Gates.** `npm run build` → `npm test` → `node scripts/check-agent-config.mjs` (plus `npm run typecheck`) exit 0,
   quoted in the report with the `dist/` file count, which grows by exactly one file.
9. **Terms / Aliases rows (carried fix 3 of the `t9-01` review).** `docs/specs/content-overlay-ui.md` gains one row for the
   settings window anchored on the Russian wording `README.md` already uses («Окно настроек») and one row for the new
   explanation line, so the English anchor and the Russian UI string pair up in the spec.
10. **The `t9-01` review's carried fix 3 (the `Terms / Aliases` rows) is answered by number** in the report. The other three
    carried fixes of that review were moved out of this slice into `t9-02b-spec-test-debt` — the review produced more than two,
    and stacking them onto a look-and-feel slice is the shape that overruns the runtime ceiling.

## Brief — t9-02 (to `extension-engineer`)

- **Task.** Give the settings window its look per `A123`/`A124` and make the build and the tests prove the asset ships.
- **Input paths.** `docs/project-profile.md`, `docs/state/t9-02-settings-window-look.md`, `docs/specs/content-overlay-ui.md`,
  `src/options/` (all five files), `angular.json`, `scripts/build-extension.mjs`, `tests/toolchain-contract.spec.ts`,
  and the source asset `C:/Users/user/Desktop/test/Mistension/img/128.png`.
- **Output artifact.** Two commits (asset+config+component+tests, then spec edit) **plus a repo file `docs/state/t9-02-engineer.md`
  written with your own write tool** — the harness run artifact is not a repo artifact and its absence is a blocking finding
  (`t9-01` review, finding 1).
- **Acceptance criterion.** AC 1–10 above, judged against the files, the SHA-256 of the copied asset and the quoted gates.
- **Carried-fix checklist (the report must answer every number with `done` + file:line or `skipped` + reason):**
  1. The two `Terms / Aliases` rows of AC 9 (the reviewer's R1 — the settings window and its new explanation line have no
     anchor in the spec while `README.md:38` already uses «Окно настроек»).
- **Constraints.** Copy the asset with a byte copy (`cp`) and prove it: `sha256sum` of the copy must equal `A126`
  (`a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4`). Do not touch `src/content/`,
  `src/core/`, `src/popup/` or `src/manifest.json`. No network calls, no remote image, no `@import`. All UI strings
  Russian, all new strings only in `src/options/text.ts`. Do not write the substring «единственный» into `README.md` —
  `tests/content-card-events.spec.ts` forbids it. Work order: reach green, **commit code+tests+asset first**, then
  the spec edit, commit again (`A53`). The task state file `docs/state/t9-02-settings-window-look.md` is the PM's — the
  only other `docs/state/` file you write is your own report `docs/state/t9-02-engineer.md`. Print no full test log.

## Pinned values (the engineer copies them, does not invent them)

| What | Value |
|---|---|
| Asset source | `C:/Users/user/Desktop/test/Mistension/img/128.png` — 128×128 RGBA, **27 414 bytes**, the owner's own art from `Mistension` |
| Asset SHA-256 (`A126`) | `a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4` |
| Asset target | `src/options/assets/cat-mascot.png` (byte copy, hashed by a test) |
| Colors sampled from the art itself (canvas pixel read in Chrome) | cat body `#e25a00`, lifebuoy blue `#a0d0e0`, cream inside the ring `#fefcf5`, navy outline `#00203e` |
| Palette written into the stylesheet (`A125`) | page `#fdf7ee`, ink `#1b2a33`, hint `#7b6a55`, action `#b8480d` + white label, accent `#0f5f7a` on `#eef4f7`, decorative border `#a6cbdc` |
| Measured contrast of each text pair | 13.8 / 4.9 / 5.3 / 6.4 — all ≥ 4.5 (AA), computed, not eyeballed |
| Mascot size | 80 CSS px, `object-fit: cover`, circular frame |

## Palette (pinned by `A125`; the engineer does not invent values)

| Role | Value | Contrast on its background |
|---|---|---|
| page / card background | `#fdf7ee` | — |
| text (title, label, field) | `#1b2a33` | 13.8:1 |
| hint line, counter | `#7b6a55` | 4.9:1 |
| primary action (`Сохранить`) | `#b8480d`, white label | 5.3:1 |
| confirmation / accent text | `#0f5f7a` on `#eef4f7` | 6.4:1 |
| decorative border, mascot frame | `#a6cbdc` | carries no text |

## Attempts log

| # | Child | Result |
|---|---|---|
| 1 | `extension-engineer` `9d24b682-9314-4bdb-82cc-50528fa4f8dc` | delivered 2026-11-19: `978b1cb` (asset + `angular.json` + component + build script + `tests/options-window-look.spec.ts`) and `b7d3913` (spec + README); report written **into the repo** as `docs/state/t9-02-engineer.md` |
| — | `code-reviewer` `6079e08e-854b-4a72-8b66-65c993d1db83` | **infrastructure failure**, not a task attempt: the local vision encoder returned `503` when the reviewer opened the screenshot. Re-launched with images forbidden. Not counted against the two-attempt budget. |
| 2 | `code-reviewer` `06ddeb6a-29ad-4278-a33c-d271703e5bff` | **changes requested — 1 blocking finding**, verdict in `docs/state/t9-02-review.md` |

## Delegation count

Expected 2 (engineer, reviewer). Used: 2 (+1 infra-failed reviewer run, not charged).

## PM-verified gates and measurements

`npm run build` **0** (`options asset present: dist/options/assets/cat-mascot.png`, `dist/` = **11** files) · `npm test` **0**
(**976** tests / **46** files) · `node scripts/check-agent-config.mjs` **0** (0 / 0 / 156) · `npm run typecheck` **0**.
`sha256sum` of `src/options/assets/cat-mascot.png` and of the source: both `a899a910…d446b4` — the copy is byte-identical.
Sight of the built page in real Chrome at 500×620 (`docs/state/screenshots/t9-02-options-window.png`, the page **in a tab**, not
the Chrome dialog): no horizontal scrollbar, `app-root` background `#fdf7ee`, card 360 px with `max-width: 360px`, mascot
painted 84×84 from a 128×128 source, `border-radius: 50%`, `object-fit: cover`, border `#a6cbdc`, image loaded.
Computed ratios from the shipped computed styles: 13.83 (title/label), 4.89 (hint, counter), 14.73 (input), 5.29 (button label),
5.89 (refusal line). All ≥ 4.5.

## Verdicts

**Reviewer: changes requested — blocking finding 1: `docs/specs/content-overlay-ui.md:92` claimed the artwork renders «whole,
including the lifebuoy» inside the circular clip, with no pin and no sight behind it** (`border-radius: 50%` clips to the
inscribed circle, so whether the lifebuoy survives is a property of the artwork, and the reviewer was barred from opening the
image). AC 1–10 otherwise pass; the asset, the palette, the untouched surfaces and the string set are all verified.

**PM closure:**

- **Finding 1, spec half: closed.** The sentence is now a requirement: it names what `A124` demands, says plainly that nothing
  in the repo has established it, and states that no sentence claims it as something the reader sees — the `t9-01` discipline
  applied to itself one task later.
- **Finding 1, evidence half: carried to `t9-02b` AC 5** — decode the PNG in the test and assert every non-transparent pixel
  lies inside the circle inscribed in the 128×128 square. If it does not fit, the PM rules on the frame; nobody edits the art.
- **R1 closed by ruling `A127`:** the pinned 80 px is the **image box**; the 2 px frame paints outside it, so the footprint is
  84 px. Written into the spec; no code change.
- **R2, R3, R5, R9 → `t9-02b` AC 3, 6, 8, 7.** **R7** (README «стадии 1–8», the tab-era confirmation) stays with Run 6.
  **R8** (`A69` exception) recorded. **R6** closed here: the report, the review and the screenshot are now tracked.
- **R4 (the disabled `Сохранить` at `opacity: 0.45`, label ≈1.4:1) is an observable-behavior choice, so it goes to the user**
  rather than being decided in a docs slice. Proposed default: `opacity: 0.55`, which puts the label at `#b8480d` on the cream
  card = 5.29:1. Recorded as an open question in `docs/state/t9-02b-spec-test-debt.md`.

**PM acceptance: accepted.** The blocking finding is closed in the spec, and its evidence half is scheduled with a pin that
cannot be waved off. Stage 9 code is now: manifest window (`t9-01`) + the cat and the palette (`t9-02`).

## Open questions

- Whether the mascot should later become the extension icon too — explicitly out of scope here (`A121`).
