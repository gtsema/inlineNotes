# t9-01 — engineer report (settings open as a Chrome window)

Slice: `A118` / `A119` / `A122` of `docs/state/t9-01-options-window.md`. Two commits, code+tests first, spec+README second (`A53`).

## Commits

| # | Hash | Contents |
|---|---|---|
| 1 | `d187fbd` | `src/manifest.json`, `scripts/build-extension.mjs`, `tests/toolchain-contract.spec.ts` |
| 2 | `00862e2` | `docs/specs/content-overlay-ui.md`, `README.md` |

`git status --porcelain` right after commit 2: **empty** (nothing staged, nothing left in the working tree; `dist/` is ignored). Checked again at the end of the run: the only entry is the untracked `docs/state/t9-02-settings-window-look.md`, a file the PM created while this task ran — not mine, not staged, not touched.

## Changed paths

- `src/manifest.json` — `"options_page": "options/index.html"` replaced by `"options_ui": { "page": "options/index.html", "open_in_tab": false }`. Diff is 4 added lines + 1 removed line and nothing else: `permissions` stays exactly `["storage","tabs"]`, no `host_permissions`, no `optional_permissions`, `action`, `content_scripts`, `version`, `description` untouched.
- `scripts/build-extension.mjs` — `verifyManifestReferences()` resolved only `manifest.options_page`, so with the manifest on `options_ui` it would have resolved nothing about the settings surface. It now resolves `manifest.options_ui.page`; the popup, `content_scripts[].js`/`.css`, `background.service_worker`, `icons` and `action.default_icon` branches are unchanged.
- `tests/toolchain-contract.spec.ts` — `ManifestShape` gained `options_ui?: { page?: string; open_in_tab?: boolean }` and keeps `options_page?: string` (declared only so the absence pin compiles; typecheck failed without it). The manifest test now pins `options_ui.page === 'options/index.html'`, `options_ui.open_in_tab === false`, `options_page === undefined`. One new test reads the build script with `codeOnly()` (comments stripped) and pins that it reads `manifest.options_ui?.page`, no longer `manifest.options_page`, and still reads the popup, the content-script js and css, the service worker and the icons. No other pin was touched: the exact `['storage','tabs']` set, the two `toBeUndefined()` permission pins, the http/https scheme pin and every layer-boundary scan are byte-identical.
- `docs/specs/content-overlay-ui.md` — five spec sentences (AC items 1–5 of the state file, verbatim) inserted as bullets in **Rules / Semantics**, directly after the `Permissions:` bullet that owns the manifest contract, i.e. between the manifest rules and the card-placement rules.
- `README.md` (Russian) — the settings bullet renamed to «Окно настроек» and now says Chrome itself shows it as an окно, not a вкладка, and owns the size; the load section replaces «страница настроек открывается со страницы подробностей расширения» with the Chrome settings-UI path (меню дополнения → «Управление расширениями» → «Настройки») and states that no popup control was added while «Укажите имя в настройках» still leads into the window; the popup bullet now says «она открывает окно настроек». Test counts synced: 957 → **958** in two places. `dist/` count stays 10.

## Commands run

Run after the second commit, in the profile order (`A62`); each exit status is the pipeline's own exit code.

| # | Command | Exit | Quoted output (tail/grep, no full log) |
|---|---|---|---|
| 1 | `npm run build` | **0** | `[build] manifest references resolved: content.js, popup/index.html, options/index.html` · `[build] dist/ is a self-contained MV3 folder (10 files)` |
| 2 | `npm test` | **0** | `Test Files 45 passed (45)` · `Tests 958 passed (958)` (no `FAIL` line) |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 140 info(s)` |
| 4 | `npm run typecheck` | **0** | three `tsc -p … --noEmit` runs, no diagnostics |

`dist/` file count: **10** (`find dist -type f | wc -l` = 10 — `manifest.json`, `content.js`, `popup/{index.html,main.js,3rdpartylicenses.txt,prerendered-routes.json}`, `options/{index.html,main.js,3rdpartylicenses.txt,prerendered-routes.json}`). The manifest change adds no file and removes none.

Extra commands, not gates:

- `git diff src/manifest.json` — only the `options_page` → `options_ui` hunk; permissions line absent from the diff.
- `grep -rn "window.close\|resizeTo" src/` → none (AC 1's "the page never resizes it and never calls `window.close()`" is true as shipped, not just as a rule).
- `grep -rn "openOptionsPage\|options_ui\|options_page" src/content/` → none (AC 2's "no `src/content/` module names the settings surface").
- `git diff HEAD~2 HEAD --stat` → the five files listed above and nothing else.
- `git diff HEAD~2 HEAD --stat -- src/popup src/options src/content src/core angular.json` → empty: the popup, the options visuals, the content layer, the core layer and the build wiring were not touched, and neither was the permission set.
- `git diff --cached --name-only` at the end of the run → empty (no staged files).
- **Negative proof for AC 3** (transient, reverted in the same command): `src/manifest.json` `options_ui.page` pointed at `options/missing.html`, `npm run build` answered `build-extension: manifest reference "options/missing.html" does not exist inside dist/` with **exit 1**; the manifest was restored from a backup and `git diff` re-verified before the gate runs above. So a missing `dist/options/index.html` really fails the build.

## AC self-check

| AC | Status | Evidence |
|---|---|---|
| 1 Settings window | satisfied | `git show HEAD:src/manifest.json` prints `options_ui` with `"page": "options/index.html"`, `"open_in_tab": false` and no `options_page` key; no `window.close` / `resizeTo` anywhere in `src/` |
| 2 Entry points | satisfied | `src/popup/` has no diff in this task, so the name-required line keeps its `chrome.runtime.openOptionsPage()` (`popup.component.ts:27`); no popup control added; `src/content/` names no settings surface (grep above) |
| 3 Build verification covers the new shape | satisfied | build log lists `options/index.html` among resolved references; the negative run above exits 1; the new grep test pins the check's shape, incl. `entry.css` and `manifest.icons` |
| 4 Contract test pins the shape | satisfied | three pins present (`page`, `open_in_tab === false`, `options_page === undefined`); the `storage` + `tabs` / `host_permissions` / `optional_permissions` pin is unmodified; 958/45 green |
| 5 Dialog-box layout rule | spec sentence only; **not browser-measured** | The rule is written into Rules / Semantics. The shipped options column is `width: 360px` with `padding: 16px` and an input at `width: 100%` + `box-sizing: border-box`, so it cannot exceed a Chrome dialog box; no `src/options/` visual was changed (the brief forbids it, and `t9-02` owns the look). Sight of the window is a `chrome://extensions` item for `t9-03` / Run 6 |
| 6 Gates | satisfied | the four exit-0 rows above, with the `dist/` count |

## Deviations and notes for the PM

1. **Two commits, not one.** The state-file AC heading says the five sentences go in "in the same commit as the manifest change", while the same file's Brief says "Two commits (code+tests, then spec+README)" and the brief ordered green gates → commit 1 → spec/README → commit 2 (`A53`). I followed the brief. The AC heading wording is the stale one; the PM may want it corrected in the state file.
2. **Spec sentences are verbatim.** The brief said "following the surrounding style", the state file says "verbatim". I kept the five sentences byte-identical and only adopted the section's one-bullet-per-rule form. Consequence: none of the five bullets carries a `(ruling …, task …)` lead-in of its own except the ruling tags already inside sentences 2 (`A119`, `A122`). If the PM wants `A118` / `t9-01` greppable from that section, it is a one-token insert in bullet 1.
3. **No Terms / Aliases row added** for the settings window: the brief listed exactly two doc edits, and a Terms row needs a Russian UI wording, which does not exist in any constants module (the dialog box is Chrome's own chrome). Flagged rather than invented.
4. **One added test beyond the brief** ("resolves the options window in the dist/ reference check, not an options tab"). Without it AC 3 is a comment claim; the project's own rule is that such a rule needs a grep, not a comment. It only adds pins, weakens nothing, and it is the single reason the count moved 957 → 958.
5. **README word choice.** The first draft said «единственный вход в окно»; `tests/content-card-events.spec.ts` (t6-02 AC8) forbids the substring «единственный» anywhere in the README, so the sentence was rephrased. The gate sequence above is the post-fix run; the intermediate red run was this sentence, not a code fault.
6. **Checker info count moved 135 → 140.** The five new sentences mention `dist/`, `src/options/`, `scripts/build-extension.mjs` and `tests/toolchain-contract.spec.ts` in backticks, and the checker reports every backticked path token under a `PLAN_PREFIXES` prefix as "planned path not created yet" — a pre-existing quirk that also fires for files that do exist. Errors and warnings stay 0, exit 0. The README status line still quotes "135 информационных"; if the PM quotes the number in the state file, it is now 140.
7. **Historical README claim left intact.** The status section still records that the user confirmed «экран настроек» in an earlier Chrome run — that was the tab shape. Nothing in the README claims the window shape has been seen in Chrome; that is Run 6 (`t9-03`).

## Residual risks

- AC 5 and the whole window-vs-tab behavior are **unverified in real Chrome** by this task: no `chrome://extensions` load was performed here. `npm run build` produces the folder; the dialog's actual size, the absence of a horizontal scrollbar and `chrome.runtime.openOptionsPage()` landing in the window rather than a tab are Run 6 items (`t9-03`, PM-owned).
- `options_ui` + `open_in_tab: false` gives a Chrome-managed dialog box; if the reader's window is narrower than the options column's 360 px, Chrome scrolls the dialog. The dialog-box layout rule of AC 5 is stated but not pinned by any test — the look is `t9-02`'s slice.
- No network call was added anywhere; the only `chrome.*` API touched by this task is the manifest's `options_ui` declaration (granted by no permission — MV3 needs none for its own options surface).
