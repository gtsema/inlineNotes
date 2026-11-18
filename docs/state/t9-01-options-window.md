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

## AC (numbered; the engineer writes lines 1–5 into `docs/specs/content-overlay-ui.md` verbatim, in the same commit as the manifest change)

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
| `t9-02-settings-window-look` | the artwork asset + the redesigned window (mascot, pastel palette, hint line) | engineer, reviewer — **blocked on `A120`** |
| `t9-03` (PM, no child) | `npm run build`, reload in `chrome://extensions`, screenshot the window, write Run 6 | — |

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
| 1 | `extension-engineer` | launched 2026-11-19 |

## Delegation count

Expected 2 (engineer, reviewer). Used: 1.

## Verdicts

Pending.

## Open questions

- `A120` — which artwork file. The PM verified `kenney.nl/assets/animal-pack` (License.txt inside the downloaded zip: CC0)
  and it has **no cat**: elephant, giraffe, hippo, monkey, panda, parrot, penguin, pig, rabbit, snake. itch.io, SVGRepo,
  Pixabay and DuckDuckGo all refused automated access; Wikimedia Commons cartoon-cat files are PD-old or CC BY-SA.
  Options put to the user: generate the mascot with an available image model, take a different CC0 Kenney animal, or the
  user drops a file into the repo.
