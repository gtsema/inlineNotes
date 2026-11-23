# t19-01 — the all-notes page («Мои заметки», rulings A189–A192)

Status: done. Gates green: `npm test` 1314, `npm run typecheck`, `npm run build`
(16 files incl. `dist/all-notes/`), `check-agent-config` 0 errors.

Implemented:
- `docs/specs/all-notes-page.md` (new spec; INDEX + AGENTS.md updated).
- `src/core/entry.ts` + `entry-store-read/write`: optional `Entry.title` (A190),
  captured from `document.title` (trimmed, ≤100 cp) at the create moment
  (`create-note.ts` + `create-card-controller.tsx` + `main.ts`).
- `src/core/author-pages.ts`: `authorPagesOf` (A191) — index walk, per-slot
  `loadEntries`, `isSameAuthor` filter, fresh-first rows, per-slot skip.
- `src/core/sync-client.ts`: `authorDeleteUrl` + `deleteRemoteAuthorNotes`
  (A192); **bug fixed on the way**: `deleteRemoteNote` passed the DELETE verb as
  the request body (the shipped one-note server delete was a POST) — both send
  the real verb now, pinned by new wire tests.
- `src/all-notes/` (third Angular surface in `angular.json`, `tsconfig.app.json`,
  `scripts/build-extension.mjs`): list page with `page row`s, link to the page,
  count + date, icon-only delete like the popup's; `onDelete` = local core write
  first, server author-delete second, non-blocking notice on failure; notices for
  no-name / unavailable list / empty state; Russian wording in `text.ts`.
- Entry points: popup link and options link open `notes.html` via
  `chrome.tabs.create` (manifest untouched).
- Toolchain pins updated: three `fetch` adapters, three `chrome.tabs` users in the
  popup bundle, three holders of «Укажите имя в настройках»; the check script's
  spec-count ceiling widened 5 → 7.
- Tests: `tests/core-author-pages.spec.ts`, `tests/all-notes-page.spec.ts`,
  decode-title cases, sync-client author-delete cases.

Delegation note: implemented by the PM (user-approved after the subagent-launch
defect); the code-reviewer pass remains owed.
