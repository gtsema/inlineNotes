# t9-01 — settings open as a window, not a tab (Stage 9)

## Rulings of Stage 9 (user's answers, 2026-11-19)

| Ruling | Decision | Source |
|---|---|---|
| `A118` | The settings surface becomes a **Chrome window**: the manifest replaces `"options_page"` with `"options_ui": { "page": "options/index.html", "open_in_tab": false }`. Chrome owns the dialog box and its size; the page never sizes it. `options_page` and `options_ui` never coexist (Chrome rejects the pair). | user, answer 1 |
| `A119` | **No new entry point** is added to the popup. The entry to the settings window is Chrome's own extension-settings UI (puzzle menu → Manage extensions → Settings, or the extension's gear). | user, answer 2 |
| `A120` | The settings-window artwork is a **file asset shipped inside the extension package**, license-clean, under the options app. Which file — open question below (the CC0 pack the PM verified has no cat). | user, answer 3 + PM finding |
| `A121` | Look of the window: a cat **mascot in the header**, a warm pastel gradient background with a subtle paw/ear hint, one light theme (no `prefers-color-scheme`), **static** art (no animation), WCAG-AA text contrast, the whole layout fits the fixed dialog box with no scroll. The window keeps exactly one new Russian line of explanation and nothing else in behavior. Popup, page overlay and the extension icon are untouched. | user, answers 4–10 (defaults) |
| `A122` | `Assumption:` the popup's «Укажите имя в настройках» line keeps its existing navigation (ruling `A83` untouched). `A119` forbids **adding** entries; deleting the one that already exists was not asked for and would strand a reader who has no author name. If the user wants that link removed, a later ruling restates `A83`. | PM assumption, flagged to the user |

## Goal

`chrome.runtime.openOptionsPage()` — and Chrome's own extension-settings entry — open the settings **dialog window**
instead of a tab, and every mechanical gate still proves the shipped `dist/` is a valid MV3 folder: the manifest
reference check in the build script and the manifest contract in `tests/` both move to the `options_ui` shape instead of
quietly stopping checking anything.

Done-criterion (observable): clicking the extension's settings in Chrome shows the author-name field inside a Chrome
window, not a new tab; `npm run build` still fails if `dist/options/index.html` disappears.

## AC (numbered; the engineer wrote lines 1–5 into `docs/specs/content-overlay-ui.md` verbatim — commit 1 carries code and tests,
commit 2 carries the spec and README, per `A53`)

1. **Settings window.** `src/manifest.json` declares `options_ui` with `page` = `options/index.html` and
   `open_in_tab` = `false`, and declares no `options_page` key. Chrome renders the settings surface as a window whose
   box it sizes itself; the page never resizes it and never calls `window.close()`.
2. **Entry points.** The entry the reader uses is Chrome's extension-settings UI (`A119`). The popup's `name-required`
   line keeps its existing `chrome.runtime.openOptionsPage()` call (`A122`); no popup control is added, and no
   `src/content/` module names the settings surface.
3. **Build verification covers the new shape.** The `dist/` reference check in `scripts/build-extension.mjs` resolves
   `options_ui.page` (a missing `dist/options/index.html` fails the build), and the same check keeps resolving the
   popup, the content script and any icon the manifest names.
4. **The contract test pins the shape.** `tests/toolchain-contract.spec.ts` asserts
   `manifest.options_ui.page === 'options/index.html'`, `manifest.options_ui.open_in_tab === false` and
   `manifest.options_page === undefined`; the permission pin (`storage` + `tabs`, no `host_permissions`) is unchanged.
5. **Dialog-box layout rule.** The options page renders its field, counter, `Сохранить` and message line inside a box
   no wider than the Chrome dialog and never produces a horizontal scrollbar at the dialog's own width.
6. **Gates.** `npm run build` → `npm test` → `node scripts/check-agent-config.mjs` (plus `npm run typecheck`) exit 0,
   quoted in the engineer report together with the `dist/` file count.

## Stage plan (Stage 9, ≤3 tasks)

| Task | Slice | Children |
|---|---|---|
| `t9-01-options-window` | manifest → window + build-script reference check + contract test + spec/README lines | engineer, reviewer |
| `t9-02-settings-window-look` | the artwork asset + the redesigned window (mascot, pastel palette, hint line) + the two `Terms / Aliases` rows | engineer, reviewer |
| `t9-02b-spec-test-debt` | the spec stops claiming an unmeasured observable, and three unpinned rules get pins | engineer, reviewer |
| Run 6 (PM, no child) | `npm run build`, reload in `chrome://extensions`, screenshot the window, write the Run row + the two stale README numbers | — |

## Brief — t9-01 (to `extension-engineer`)

- **Task.** Turn the settings surface into a Chrome window per `A118`/`A119` and make the mechanical checks prove the new shape.
- **Input paths.** `docs/project-profile.md`, `docs/specs/content-overlay-ui.md`, `src/manifest.json`, `scripts/build-extension.mjs`, `tests/toolchain-contract.spec.ts`, `src/popup/popup.component.ts` (read-only), `README.md`.
- **Output artifact.** Two commits (code+tests, then spec+README) plus `docs/state/engineer-report.md`.
- **Acceptance criterion.** AC 1–6 above, verified against the files and the quoted gate output.
- **Constraints.** Work order: reach green, **commit code+tests first**, then the spec and README edit, commit again (`A53`).
  Do not touch `src/options/` visuals, `src/content/`, `src/core/` or the permission set (exactly `storage` + `tabs`, no
  `host_permissions`); no network calls; UI strings stay Russian. The task state file `docs/state/t9-01-options-window.md`
  is the PM's — the only `docs/state/` file you write is your own report. Print no full test log.

## Attempts log

| # | Child | Result |
|---|---|---|
| 1 | `extension-engineer` | delivered 2026-11-19, two commits (`d187fbd` code+tests, `00862e2` spec+README), report `docs/state/engineer-report.md` |
| 2 | `code-reviewer` | launched 2026-11-19, read-only, output `docs/state/reviewer-report.md` |

## PM-verified gates (independent re-run, not the child's quote)

`npm run build` **0** · `npm test` **0** (958 tests / 45 files) · `node scripts/check-agent-config.mjs` **0** (0 errors, 0 warnings, 140 info) · `npm run typecheck` **0**.
`dist/` is still 10 files.

## Delegation count

Expected 2 (engineer, reviewer). Used: 2.

## Verdicts

**Reviewer (`docs/state/t9-01-review.md`): changes requested — 2 blocking findings.** AC 1-4 pass, AC 5 not covered, AC 6 fails on evidence.

| Finding | What it says | PM closure |
|---|---|---|
| 1 | The engineer report named by the brief (`docs/state/engineer-report.md`) is absent from the working tree and from git, so AC 6 has no artifact. | **Closed by the PM.** The role's `output:` path is a harness artifact, not a repo file — the child wrote it, the harness routed it to the run directory. The PM copied it to `docs/state/t9-01-engineer.md` (30+ earlier tasks use the `docs/state/<task>-engineer.md` name). Root cause is the brief, not the child: the brief must name the repo path. Fix carried into every Stage 9 brief. |
| 2 | `docs/specs/content-overlay-ui.md:89` states «never produces a horizontal scrollbar at the dialog's own width» as a shipped observable nobody measured. | **Spec half closed by the PM** (the sentence now names `A124`/`t9-02`, says the pin is owed by `t9-02`, and states that no sentence claims it as something the reader sees — the `action row` discipline). The **pin half stays owed by `t9-02` AC 7.** |

Finding 1 closed by the PM: `cp` of the run artifact into `docs/state/t9-01-engineer.md`, the repo name every earlier task uses.

**PM acceptance: the shipped shape is accepted, the task is not closed until carried fix 1 lands.** No third attempt on `t9-01` (budget): the finding is a spec sentence in the surface `t9-02` rewrites, so a separate cleanup task would be wasted work.

## Carried-fix checklist → routed by the PM after the verdict

| # | Item | Lands in |
|---|---|---|
| 1 | **Finding 2.** `docs/specs/content-overlay-ui.md:89` («never produces a horizontal scrollbar at the dialog's own width») restated as a requirement owed by Run 6, in the `action row` discipline, plus a mechanical pin of the shipped layout | `t9-02b-spec-test-debt` — it must follow `t9-02`, which rewrites that stylesheet |
| 2 | **R2.** The build-script pin proves substrings; extend it to the existence check and its failure message | `t9-02b-spec-test-debt` |
| 3 | **R1.** The `Terms / Aliases` rows for the settings window («Окно настроек») and for the new explanation line | `t9-02` — its carried fix 1, since that slice introduces the Russian strings |
| 4 | **R3.** The AC 1 / AC 2 negatives are unpinned, and the icon / `entry.css` branches the scan pins are vacuous because the shipped manifest names neither | `t9-02b-spec-test-debt` |
| 5 | **R6.** A brief with nothing to carry must literally say `Carried-fix checklist: none` (`code-review-flow` → Rules) | closed by the PM: every Stage 9 brief carries the line |

Four items from one review is more than two, so they get their own slice rather than stacking onto `t9-02` — the shape that
overran the ceiling in `t2-03`. Stage 9 is now `t9-01`, `t9-02`, `t9-02b`: three tasks, the budget holds. The real-Chrome pass
(Run 6) is the workflow's sync step, not a task.

## Remarks accepted as-is (no work)

R4 / R5 (the stale `135` and the tab-era «экран настроек» confirmation in `README.md:133,135-136`) stay deferred to `t9-03` /
Run 6 as ruled. R7 (the spec edit landed in a second commit) is the `A69` exception, recorded not punished.

## PM answers to the engineer's notes

1. **Commit count.** The engineer is right and the AC heading is the stale wording: the brief's two-commit order is the
   rule (`A53`), and both commits exist. The AC heading is corrected below and in `t9-02` the same wording is already fixed.
2. **Ruling greppability.** Accepted as-is; `A119`/`A122` are already inside the bullets and `A118` is greppable from this
   state file and the commit message. No follow-up.
3. **Missing `Terms / Aliases` row.** The reviewer's answer: not a violation of this task (no Russian string was introduced —
   the dialog caption is Chrome's), but it is a gap, and it becomes **mandatory in `t9-02`** because that slice adds the
   window's Russian explanation line. Carried fix 3.
4. **The extra test.** Accepted: an unpinned build-script rule is a comment, not a check. The 957 → 958 movement is recorded here.
5. **«единственный» in the README.** Recorded as a live trap for future briefs: `tests/content-card-events.spec.ts` forbids that
   substring in `README.md`. `t9-02`'s brief must not reintroduce it.
6. **Checker info 135 → 140.** Accepted, exit stays 0. The README's quoted count is corrected in `t9-03`, together with the
   Run 6 row, not in a separate commit.
7. **Historical README row.** Correct to leave intact (`A116` spirit: old run rows stay byte-intact); the window shape is Run 6.

## Open questions

- `A120` — which artwork file. The PM verified `kenney.nl/assets/animal-pack` (License.txt inside the downloaded zip: CC0)
  and it has **no cat**: elephant, giraffe, hippo, monkey, panda, parrot, penguin, pig, rabbit, snake. itch.io, SVGRepo,
  Pixabay and DuckDuckGo all refused automated access; Wikimedia Commons cartoon-cat files are PD-old or CC BY-SA.
  Options put to the user: generate the mascot with an available image model, take a different CC0 Kenney animal, or the
  user drops a file into the repo.
