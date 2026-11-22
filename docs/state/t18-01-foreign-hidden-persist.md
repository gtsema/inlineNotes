# t18-01 — foreign hidden author flag persists across reload (ruling A184)

Status: done (accepted by PM self-review; see note below).

Implemented (attempt 1, PM-implemented after the subagent launch defect; user approved):

- `src/core/foreign-hidden-store.ts` (new): the `foreign-hidden:v1` record
  `{ version: 1, pages: Record<pageKey, string[]> }`; `loadHiddenAuthorsOfPage`
  (never throws, `[]` for absent/malformed/failed read) and
  `setForeignAuthorHidden` (guarded read, malformed overwritten, remove-nothing
  writes nothing, write failure propagates).
- `src/core/storage-keys.ts`: `FOREIGN_HIDDEN_KEY`.
- `src/content/sync/foreign-notes.ts`: `replace`/`ForeignLoadRequest` accept
  `hiddenAuthors`; a listed author arrives `visible: false`.
- `src/content/sync/sync-notes.ts`: the automatic load reads the page's flags
  through the wiring `port` and passes them to the load.
- `src/content/sync/page-notes-channel.ts`: two seams `persistAuthorFlag` /
  `persistAuthorRemoval`; switch-to-hidden adds the flag, switch-to-visible and
  `dismiss` remove it. The note itself is still never stored (`A163`).
- `src/content/main.ts`: shipped seams over core `setForeignAuthorHidden` with
  the page key the paint pass resolved; write failure swallowed; `loadPageNotes`
  reads the flags so a sync-press reload also arrives hidden.
- Specs: `sync-integration.md` ruling `A184` + Terms + Flows 6-7 + AC 13/15/19-21
  + test mapping; `content-overlay-ui.md` catch-enumeration rows for the new
  guard and the two previously unnamed Stage 17 sites.
- Tests: `tests/core-foreign-hidden-store.spec.ts` (new, 12 cases);
  `tests/content-sync-notes.spec.ts` (A184 describe + the read-count pin
  updated to one settings read + one flag read per question);
  `tests/content-page-notes.spec.ts` (seam calls, no-seam memory-only case);
  `tests/content-throw-boundaries.spec.ts` (catch set 18 -> 19 sites).

Gates: `npm test` 1292 green, `npm run build` green, `npm run typecheck` green,
`node scripts/check-agent-config.mjs` 0 errors.

Note: `code-reviewer` delegation was not possible this session — the subagent
launch did not deliver the `task` field to the child (6 attempts all answered
with a default read-and-report run). The PM reviewed the diff against AC 19-21
instead; a follow-up review pass is owed once the launch is fixed.
