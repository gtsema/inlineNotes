# Project Profile — inlineNotes

Source of truth for every artifact (`AGENTS.md`, `.pi/agents/*`, `.pi/skills/*`, `docs/specs/*`, `.pi/settings.json`).
Conflict order: latest user wording → this profile → spec → code → harness default → explicit `Assumption:`.

## Project

- Name: `inlineNotes` (folder name = project name = extension name in the manifest).
- Type: greenfield. No code, no git history before harness setup.
- Purpose (one sentence): a Chrome MV3 extension that lets the user leave personal inline comments on any web article: select text, type a note, see it as a highlight on that page only.
- Scope of the current request: **harness only** (instruction system + mechanical checker + smoke runs). Extension implementation is a separate, later request; specs are written so implementation can start without re-interviewing the user.
- Target browser: **Google Chrome, Manifest V3 only**. No Firefox/Edge compatibility work.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | no `any` in domain code |
| Extension UI | **Angular** (standalone components) | popup + options page |
| Build | Angular application builder (esbuild/Vite dev server) | no hand-rolled bundler config |
| Content script | **Preact** (plain TS + Preact for the overlay widgets), no Angular bootstrap | user-approved: Angular runtime is too heavy to inject into every page; Preact is ~4 KB min |
| Highlighting | **CSS Highlight API** (`Highlight`, `::highlight()`) | no DOM mutation of the host page |
| Storage | `chrome.storage.local` only | no sync, no IndexedDB |
| Messaging | `chrome.runtime` messages between popup/options and content script | |
| Unit tests | Vitest | pure-function tests (URL key, range/anchor codec, entry store rules) |
| Lint/format | none (explicitly declined by user) | |
| Runtime deps | Angular (popup/options) + Preact (content overlay) + Vitest; nothing else; **no network requests at runtime** | two bundles: MV3 content script bundle and Angular popup/options bundle |

Planned top-level layout (for `AGENTS.md` → Expected Repository Structure):
`src/content/` `src/popup/` `src/options/` `src/core/` (framework-free domain logic) `src/manifest.json` `tests/` `docs/specs/` `docs/state/` `.pi/` `scripts/`.

Data flow (ASCII, must stay true in the constitution):
`page selection -> core (urlKey + text anchor + entry model) -> chrome.storage.local -> content overlay (CSS Highlight + tooltip/editor card) -> Angular popup/options (list, per-entry checkbox, name setting)`

## Domain rules settled by the user (binding for specs)

1. Comment body limit: **256 characters** (hard cap, live counter in the editor).
2. Entry cap: **20 entries per page**; beyond that creation is refused with a visible message.
3. Author name is **mandatory**: with no name set the feature is disabled. Default value = random 8-character sequence, generated on first run.
4. Storage key must be **loss-proof**: normalized URL = `origin + pathname` with tracking noise removed (`utm_*`, `gclid`, `fbclid`, `_ga`, `ref`, `mc_`, and the URL hash); other query params kept and sorted. Lookup additionally falls back to `origin + pathname` match so an entry never disappears because of added parameters. `Assumption:` exact matching strategy is pinned in the data-model spec.
5. Entries persist across reloads of the same page; they never appear on a different page.
6. Multi-element selections (across `<p>`, lists, inline tags) must work.
7. Overlapping highlights are **forbidden**: a new selection that intersects an existing entry's range is rejected with a message.
8. Editing rights: only the author (current name == entry author) may edit; foreign entries are read-only. Editing a foreign entry is not offered at all.
9. Popup list shows **name + per-entry checkbox only** (checkbox = show/hide this entry's highlight on the page).
10. Editor window (create and edit are the same widget): buttons **Save / Cancel / Delete**; click outside = cancel; Esc = cancel.
11. Re-selecting text of an existing entry opens **editing of that entry**, not a duplicate.
12. SPA navigation and back/forward must refresh the visible entries automatically (history patch + URL polling).
13. UI strings: **Russian**. Artifact/spec/role text: English.
14. Stale-entry policy (user delegated): an entry is anchored by normalized text, not by raw offsets. If the anchor is not found after a page change, the highlight is dropped, but the entry stays in the popup list (deletable). `Assumption:` recorded here, to be restated in the data-model spec.
15. Frame/shadow scope (user delegated): top frame only, closed Shadow DOM and cross-origin iframes are out of scope for v1. `Assumption:` recorded here.
16. Framework split (user-approved): Angular for popup + options, **Preact** for the in-page overlay. Never Angular inside the content script.

## Documentation

- `docs/project-profile.md` — this file, source of truth.
- `docs/specs/` — durable decisions, English, grep anchors in English. Planned: `inline-comment-model.md`, `content-overlay-ui.md`, `code-review-flow.md` (+ `INDEX.md`).
- `docs/state/<task-id>.md` — task state, PM memory outside the session.
- `docs/retro.md` — retro after each stage.
- `README.md` — Russian (user language): what the extension does, how to build/load it, agent config, start commands.
- Rule: a code change that alters spec behavior edits the spec **in the same commit**.

## Testing

- Levels: unit tests only (Vitest). Framework-level E2E with a loaded extension is explicitly out of scope.
- Green gate (must pass before a task is accepted): `npm test` (Vitest run), `npm run build`, `node scripts/check-agent-config.mjs`.
- Gate activation: `npm test` and `npm run build` exist only after the first implementation task creates `package.json`. Until then the only green gate is `node scripts/check-agent-config.mjs`.
- Gate ownership: those commands are run by `extension-engineer` and quoted in its report. The PM has no shell tool and only verifies that the quote exists; `code-reviewer` may re-run the read-only checker `node scripts/check-agent-config.mjs`. Every brief to the engineer requires a `Commands run` section, because the harness acceptance gate rejects a report without command evidence.
- Known failing baseline: **none — 100% green is mandatory**.
- Acceptance is done against the artifact file + code + gate output, never against a retelling.

## Process rules

- Repo: `git init`, work in commits, one commit per accepted task.
- Code review is **mandatory** before acceptance of every implementation task (reviewer is read-only, `git` read-only commands).
- Budgets (§1.5 of the meta-instruction): ≤3 tasks per stage, ≤3 stages per request, ≤2 attempts per task, one writer per worktree, delegation counter in the state file, stop and report at 2× the expected count.
- Forbidden zones: no network requests at runtime (`fetch`/XHR/`connect` in `host_permissions`), no third-party runtime libraries, no analytics, no remote code.
- `git push --force`, `rm -rf`, destructive scripts → ask first.

## Team roles

Minimal ladder (project ≤3k lines, effectively one layer):

| Role | Archetype | Mission |
|---|---|---|
| `project-manager` | read-only + `subagent` | questions → decomposition → delegation → acceptance (interactive PM = main session) |
| `extension-engineer` | full + bash | TS/MV3 implementation: content script, core domain logic, Angular popup/options, Vitest tests |
| `code-reviewer` | read-only + git-read | spec/code conformance review, exactly 2 skills |

No `system-analyst`, no separate frontend/backend roles: the project has one layer. Specs are written by the PM-briefed engineer or by the PM-approved brief until an analyst is explicitly added.

Skills (4, no overlap): `chrome-mv3-extension-ts` (technical), `requirements-spec`, `delivery-planning`, `code-review-checklist`.

## Constraints

- No network access from the extension at runtime; all data stays in `chrome.storage.local`.
- Minimal third-party dependencies (Angular/Vitest toolchain only).
- Must not break host page layout or steal focus; overlay uses isolated CSS and a high but bounded `z-index`.
- Chrome MV3 only; no `chrome.*` APIs beyond what MV3 service workers allow.

## Language & Runtime Model

- Model class: `qwen3.8-flash-next-iq3_s` on provider `dacan` — quantized (~3 bit, `iq3_s`) ⇒ **slow runtime class per §1.4**.
- Consequence for language (§1.1): role and spec bodies in **English**, short sentences, one bullet = one thought. UI strings and README in **Russian**.
- Context window: **131k tokens** → `compaction.enabled: true`, `reserveTokens: 8000`.
- Adapted `timeoutMs`: **3600000** (60 min) — settled once here, all role frontmatters copy this value. Any change → profile first, then roles in the same change, then rerun the checker (the checker reads this number, it does not hard-code it).
  History: 1800000 was enough for single-layer slices (`t1-01`, `t1-02`, `t1-04`) but three of six tasks (`t1-03`, `t1-05`, `t1-06`) died at the 30-minute mark while writing two layers at once; the ceiling was raised by PM ruling `A19` on 2026-11-16, and every cross-layer brief keeps the "commit early, commit often" instruction.
- Thinking: **off everywhere** (`thinking: off` in every role, `defaultThinkingLevel: "off"`, `subagents.disableThinking/defaultThinking/maxThinking: "off"`, matching `agentOverrides`).
- Parallelism: **1** (`parallel.concurrency: 1`, single-threaded per user).
- Model pinning: none. Every role `model: inherit`.
