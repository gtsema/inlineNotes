# inlineNotes Project

Greenfield Chrome MV3 extension (`TypeScript`, `Angular`, `Preact`, `chrome.storage.local`) that lets a reader leave personal inline comments on any web article: select text, write a note, see it highlighted on that page only.

## Primary Goal

A Chrome MV3 extension in which the user sets a personal name in options, selects any text on any article, types a note (max 256 chars) in a card next to the selection, and gets that note stored under the page's normalized URL in `chrome.storage.local`; on that page the note is drawn as a CSS Highlight overlay with a hover tooltip and an in-place editor, and the extension popup lists every note of the current page as `name + per-note show/hide checkbox`, so the whole loop — create, display, filter, edit, delete, clear — works offline with no server and no network requests.

## Interaction Protocol

- The user talks **only to the PM**. The interactive PM is the main session agent, not a subagent; `.pi/agents/project-manager.md` is the reference body and the background-orchestration definition.
- Before any decomposition the PM builds a question pool from the fixed checklist (Goal / Done-criterion / In scope / Out of scope / Layers / Constraints / Options) and asks everything in one numbered block, each question with a one-line reason.
- Observable-behavior decisions (limits, empty input, click-outside semantics, ordering, delete rules) are never made silently: the PM presents "question + proposed default" and stops. No answer → least-risky default, recorded as `Assumption:` in the spec and in the state file.
- Stages → tasks → delegation by role name → acceptance against the artifact file and the code, never against a retelling. PM never rewrites code itself.
- Task state lives in `docs/state/<task-id>.md` (PM memory outside the session context; re-read after compaction).
- Project answers, commands, limits and the runtime model live in `docs/project-profile.md`; that file is the single place where `timeoutMs` is changed.
- Roles exchange only file artifacts plus a short brief (Task / Input paths / Output path / Acceptance criterion / Constraints). Sessions are never retold between roles.

## Runtime Model

- All roles run the session model: `model: inherit` everywhere. No model is pinned in roles, settings or overrides.
- Observed runtime: `dacan / qwen3.8-flash-next-iq3_s`, ~3-bit quantization → slow class, 131k context. Consequence: role and spec bodies are English with short sentences; UI strings and README are Russian.
- Thinking is **off** in every role (`thinking: off` in frontmatter, `defaultThinkingLevel: "off"`, `subagents.disableThinking: true`, `subagents.defaultThinking: "off"`, `subagents.maxThinking: "off"`, `agentOverrides.<role>.thinking: "off"`).
- Roles differ only by `tools`, `skills`, `output`, `acceptanceRole`, `maxSubagentDepth`.
- `timeoutMs: 3600000` (raised by ruling `A19`) is copied from `docs/project-profile.md` → Runtime Model into every role frontmatter; `scripts/check-agent-config.mjs` reads the value from the profile, so that file is the only change site.

## Project Priorities

1. Requirements before implementation: no code for a behavior that has no spec line.
2. Small reviewable changes: one task = one verifiable slice, committed separately.
3. Layer separation: framework-free domain logic in `src/core/` is the only place business rules live; Angular and Preact layers are thin facades over it.
4. Deterministic local run: `npm run build` produces a loadable `dist/` unpacked extension with no manual steps.
5. Docs near code: a behavior change edits its spec in the same commit.
6. Host-page respect: never break the page layout, never mutate page DOM for highlighting, no network traffic.

## Expected Repository Structure

```
src/manifest.json      MV3 manifest (no host_permissions beyond activeTab-free needs)
src/core/              framework-free domain: url key, entry store, caps, anchors, overlap rules
src/content/           content script: selection capture, Preact overlay, CSS Highlight painting
src/popup/             Angular popup: page entry list, per-entry checkbox, filters
src/options/           Angular options: author name (mandatory), defaults
tests/                 Vitest unit tests over src/core (100% green mandatory)
server/                Go + PostgreSQL sync server (own Docker gate; see docs/specs/sync-server.md)
docs/specs/            durable decisions (see Documentation Expectations)
docs/project-profile.md  source of truth: stack, gates, limits, runtime model
docs/state/            per-task state files written by the PM
docs/retro.md          what failed and why, one entry per stage
.pi/agents/            role definitions (project-manager, extension-engineer, code-reviewer)
.pi/skills/            skills loaded by roles
.pi/settings.json      wiring: thinking off, concurrency 1, compaction, skills path
scripts/               check-agent-config.mjs (mechanical harness checker)
```

## Architecture Rules

Data flow:
`page selection -> src/core (urlKey + text anchor + entry model) -> chrome.storage.local -> src/content overlay (CSS Highlight + Preact card/editor/tooltip) -> Angular popup and options (entry list, per-entry checkbox, author name)`

Layer responsibilities:
- `src/core/` — exclusive owner of business rules: URL key normalization, entry identity, 256-char and 20-entry caps, author/edit rights, overlap rejection, anchor resolution. No DOM, no `chrome.*` UI calls.
- `src/content/` — exclusive owner of everything inside the page: selection capture, multi-element ranges, highlight painting, tooltip, card editor, SPA URL-change detection. No persistence logic of its own.
- `src/popup/` and `src/options/` — exclusive owner of extension-UI state; they read and write entries only through the core API, never through ad hoc storage keys.
- `src/manifest.json` — exclusive owner of permissions and script registration.
- `tests/` — exclusive owner of executable rule verification.

Domain standards:
- One entry = `{ id, pageKey, authorName, text, comment, anchor, createdAt, updatedAt }`; `comment` ≤ 256 chars, ≤ 20 entries per `pageKey`.
- Page key is a normalized URL (tracking noise and hash dropped, remaining query params sorted) plus an `origin + pathname` fallback lookup, so a note never disappears because of added parameters.
- Anchoring is by normalized text plus context window, not by raw DOM offsets: moved text re-anchors, changed text goes stale (no highlight, entry stays in the popup, deletable).
- Overlapping highlights are rejected at creation time with a visible message.
- Only the entry whose `authorName` equals the current options name may be edited; foreign entries are read-only.
- Highlighting uses the CSS Highlight API; the host page DOM is never mutated for painting.
- No `fetch`/XHR/`XMLHttpRequest`/WebSocket in shipped code; no runtime third-party libraries beyond Angular and Preact.
- All user-visible strings are Russian and live in one constants module per UI layer.

## Role Routing

- `project-manager` for clarification, question pools, decomposition, briefs, delegation bookkeeping, acceptance, state files, retro; also for spec drafting when the change is a single spec slice.
- `extension-engineer` for all TypeScript implementation: `src/core/`, `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`, `tests/`, build configuration, and the spec edit that accompanies a behavior change.
- `code-reviewer` for read-only review of every implementation task, spec/code/AC conformance, git diff inspection, gate verification.

## Delivery Workflow

1. Clarify: PM runs the question pool, writes goals and criteria into `docs/project-profile.md` or the task spec.
2. Spec: the behavior is written in `docs/specs/` before code (Terms/Aliases + Acceptance Criteria mandatory).
3. Core slice: domain rules and their unit tests land in `src/core/` + `tests/` first.
4. Facade/UI slice: content overlay, then popup/options over the same core API.
5. Test and review: unit tests green, then `code-reviewer` reviews the diff against the spec's AC.
6. Sync runtime: `npm run build`, load `dist/` in `chrome://extensions`, verify the observable behavior list.
7. Update docs: spec, `docs/specs/INDEX.md`, README if commands changed; commit.

## Orchestration Budgets

- ≤3 tasks per stage, ≤3 stages per user request without renegotiation.
- ≤2 attempts per task (the second with a changed brief); then stop and ask the user. A third retry is forbidden.
- Parallelism 1 child (`parallel.concurrency: 1`); one writer per worktree/branch at a time.
- Delegation counter lives in `docs/state/<task-id>.md`; exceeding the expected count ×2 → stop and report.
- Task state file: `docs/state/<task-id>.md`. Green gates before acceptance: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`; failing baseline: none.

## Documentation Expectations

- Durable decisions go to specs, never only to chat: `docs/specs/inline-comment-model.md` (data model, storage, keys, caps, authorship, anchoring), `docs/specs/content-overlay-ui.md` (selection card, highlight painting, tooltip/editor, popup contract), `docs/specs/code-review-flow.md` (mandatory review path), `docs/specs/sync-server.md` (the Go sync server: API contract, schema, upsert/delete semantics, validation, no-authentication posture), `docs/specs/sync-integration.md` (the extension's half of it: the two settings fields, the server address rule, the sync button and its three states, the memory-only foreign notes, the failure behaviour), `docs/specs/all-notes-page.md` (the «Мои заметки» page: the author's page list, the stored `title`, the row delete that is local plus server). All are listed in `docs/specs/INDEX.md`.
- Artifact language: English for specs, roles, skills, code identifiers, commands, section names. Russian for extension UI strings, README, and PM conversation with the user.
- Grep anchors in English: every spec has a `Terms / Aliases` table pairing the English term with its Russian UI wording.
- A code change that alters specified behavior edits the spec in the same commit; a spec-vs-code conflict is reported to the PM, never resolved silently.
- `docs/retro.md` gets 3–5 lines per stage, and each failure point turns into a fix of a spec, role or skill.
