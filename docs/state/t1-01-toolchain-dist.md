# t1-01-toolchain-dist

## Goal

`npm install && npm run build` produces a `dist/` folder that Chrome accepts as an unpacked MV3
extension: manifest + popup bundle (Angular) + options bundle (Angular) + content bundle (Preact-capable,
no Angular). No feature behavior yet — placeholders only.

## AC (numbered, copied into the brief)

1. `package.json` exists with `build`, `test` scripts; runtime deps are only `@angular/*` and `preact`; dev deps are toolchain only (typescript, vitest, esbuild, `@types/chrome`). No other runtime dependency, no network library.
2. `npm run build` writes `dist/manifest.json` (`manifest_version: 3`, content script registered for `<all_urls>`, `action.default_popup`, `options_page`) and every file referenced by the manifest exists inside `dist/`.
3. `src/manifest.json` declares no `host_permissions` and no permissions beyond what the loaded extension needs (`storage`).
4. Popup and options boot real Angular standalone components and render a Russian placeholder string from a constants module.
5. The content bundle imports no `@angular/*` (verified by grep over `src/content/` and over `dist/`), Preact is allowed.
6. `npm test` runs Vitest green with at least one pure `src/core/` smoke test.
7. `node scripts/check-agent-config.mjs` reports 0 errors.

## Stage plan

Stage 1 (toolchain + pure domain rules). Next: `t1-02-core-pagekey`, `t1-03-core-entry-store`.

## Attempts log

- attempt 1: brief issued (below), status: delegated.

Brief (attempt 1):
- Task: build the MV3 toolchain so `dist/` is loadable in `chrome://extensions`.
- Input paths: `docs/project-profile.md`, `docs/specs/content-overlay-ui.md`, `docs/specs/inline-comment-model.md`, `AGENTS.md`, `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.
- Output artifact: `docs/state/t1-01-engineer.md` + code in `package.json`, `tsconfig*.json`, `angular.json`, `scripts/build-extension.mjs` (PM-approved `A3`), `src/manifest.json`, `src/core/`, `src/content/`, `src/popup/`, `src/options/`, `tests/`.
- Acceptance criterion: AC 1–7 above, each with a self-check line.
- Constraints: Angular only in `src/popup/` + `src/options/`; Preact only in `src/content/`; TS strict, no `any`; no `fetch`/XHR/WebSocket; no new runtime dep; UI strings Russian from a constants module; commit the task with `git add`/`git commit` after gates are green.
- Report must contain a `Commands run` section quoting `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 2 (engineer, reviewer). At the ceiling; the task is closed.

## Verdicts

- engineer report: `accepted` quality evidence — gates quoted (`npm test` 13/13, `npm run build` self-check, checker 0 errors). Artifact: `…/subagent-artifacts/outputs/9f105195-f393-4468-b2a8-713461a5fb20/docs/state/t1-01-engineer.md`.
- reviewer verdict: **accepted**, no blocking findings, 8 non-blocking remarks. Artifact: `…/subagent-artifacts/outputs/9f29d344-b507-454e-9cbc-ac5ae27e6e87/docs/state/t1-01-review.md`. Reviewer re-ran the checker: 0 errors, byte-identical to the engineer quote.
- PM decision: task closed at attempt 1/2; commit `68a7362` is final.

## Handoff items taken into t1-02

- reviewer remark 1: `src/content/overlay/host.ts` `all: initial` breaks `[hidden] { display: none }`, so the placeholder card is painted at the page's top-left — fixed in t1-02 (the user loads `dist/` by hand).
- reviewer remark 2 / engineer open question 1: PM rules `content_scripts.matches` = `http://*/*` + `https://*/*`; the ruling needs one line in `docs/specs/content-overlay-ui.md` in the same commit.
- reviewer remark 4 (duplicate host id on a page that already owns it) → t3-01.
- shadow root mode: PM ruling `open` for v1 (dev-tool inspectability of the human verification loop); recorded as `Assumption:`, t3-01 owns the widget.

## Open questions

- `A3` build wiring applied as the default (Angular builder + esbuild + assembly script); accepted as-is.
- Stage 1 done-criterion still needs the human `chrome://extensions` → "Load unpacked" confirmation (stock Chrome refuses `--load-extension`).
