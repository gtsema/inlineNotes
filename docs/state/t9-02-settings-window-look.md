# t9-02 — the settings window gets the cat (Stage 9)

Blocked until `t9-01-options-window` is accepted: the manifest shape and the build-script reference check land there.

## Rulings

| Ruling | Decision | Source |
|---|---|---|
| `A123` | The artwork is a **byte-identical copy of the user's own asset** `C:\Users\user\Desktop\test\Mistension\img\128.png` (a flat cartoon orange cat inside a lifebuoy, RGBA, 128×128, 27 KB) into `src/options/assets/cat-mascot.png`. The file is never re-encoded, cropped or edited: any framing or zoom is CSS only. Provenance (owner's own extension, no third-party license) is stated in the spec. | user ("возьми его"), `A120` closed |
| `A124` | The mascot renders at **80 CSS px** (the 128 px source is never upscaled past ~1.6×), **whole image including the lifebuoy**, in a circular frame in the header. The window palette is derived from the artwork: cream background, orange primary action, lifebuoy-blue border and confirmation. WCAG-AA text contrast. Static art, one light theme, no scroll at the Chrome dialog width. | user, «всё дефолт» |

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
5. **The palette is literal and derived.** The component stylesheet declares the cream / orange / lifebuoy-blue palette
   as literal color values, and the label, hint and message text hold AA contrast against their background. Pinned by
   reading the stylesheet text.
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
- **Constraints.** Copy the asset with a byte copy (`cp`), never re-encode or resize it. Do not touch `src/content/`,
  `src/core/`, `src/popup/` or `src/manifest.json`. No network calls, no remote image, no `@import`. All UI strings
  Russian, all new strings only in `src/options/text.ts`. Do not write the substring «единственный» into `README.md` —
  `tests/content-card-events.spec.ts` forbids it. Work order: reach green, **commit code+tests+asset first**, then
  the spec edit, commit again (`A53`). The task state file `docs/state/t9-02-settings-window-look.md` is the PM's — the
  only other `docs/state/` file you write is your own report `docs/state/t9-02-engineer.md`. Print no full test log.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched yet (waiting for `t9-01`) | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.

## Open questions

- Whether the mascot should later become the extension icon too — explicitly out of scope here (`A121`).
