---
name: chrome-mv3-extension-ts
description: |
  Build and verify Chrome Manifest V3 extension code in TypeScript: content script with a shadow-DOM
  overlay, CSS Highlight API painting, chrome.storage.local persistence, popup and options messaging.
  Use when a task touches src/manifest.json, src/content/, src/popup/, src/options/, src/core/, MV3
  permissions, chrome.* APIs, selection ranges, or the "load unpacked" verification loop.
license: MIT
metadata:
  audience: extension-engineer, code-reviewer
  domain: chrome-extension-typescript
---

## What I do

- Lay out an MV3 extension as separate bundles: content script, popup, options, service worker only when needed.
- Keep domain rules out of Chrome APIs: pure functions in `src/core/`, thin adapters where `chrome.*` is called.
- Paint user ranges with the CSS Highlight API instead of wrapping DOM nodes.
- Isolate injected widgets in one shadow host so page CSS cannot reach them and their CSS cannot leak out.
- Wire messaging between the content script and the extension UI, and keep storage access in one module.
- Verify the built bundle by loading `dist/` unpacked in `chrome://extensions` and walking the observable behavior list.

## Layout guardrails

- `src/manifest.json`: MV3, `manifest_version: 3`, minimal permissions (`storage`, `activeTab` when needed, `scripting` only if injection is dynamic). No `host_permissions` unless a task explicitly orders it.
- Content script matches `http`/`https` only. It is never registered on `chrome://`, the Web Store, or the PDF viewer.
- `src/core/` has no DOM and no `chrome.*` imports, so unit tests run in plain Node/Vitest.
- Storage: one key per page plus one settings key. Whole-list writes only. No `chrome.storage.sync` in this project.
- Build produces a loadable folder with `manifest.json` at its root and no absolute paths.

## Selection and painting

- Convert a selection to an ordered fragment list `(element, startOffset, endOffset)`; support ranges that cross block and inline elements.
- Register one `Highlight` per entry in `CSS.highlights`; style with `::highlight(name)`; never append marker elements to the page.
- Anchor entries by normalized text plus a small prefix/suffix window; store DOM offsets only as a hint.
- Listen for SPA URL changes: patch `history.pushState`/`replaceState`, listen to `popstate` and `hashchange`, and fall back to a 500 ms URL poll.
- Ignore selections made inside the overlay host; guard against re-entrancy when the widget is focused.

## Not for:

- Product rules and limits (page key, caps, authorship, overlap) — those live in `docs/specs/inline-comment-model.md`.
- UI look and feel decisions, popup wording, or interaction flow — those live in `docs/specs/content-overlay-ui.md`.
- Cross-browser support, Firefox `browser.*` polyfills, MV2 migrations.

## Output style

- Report changed paths grouped by bundle: `src/core/`, `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`, `tests/`.
- State the exact commands run (`npm test`, `npm run build`) and their outcome.
- List every `chrome.*` API used, with the permission that grants it, so the reviewer can reject an unapproved permission.
- Keep a "manual verification" block with the page type used and the steps performed in Chrome.
