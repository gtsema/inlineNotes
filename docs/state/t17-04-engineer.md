# t17-04 — engineer report

Task: a rename deletes the previous name's notes on every page and warns first (rulings `A173`,
`A174`), plus Addendum 1 (`A175` spacing, `A176` confirmation wording).

## Gate results (measured, not asserted)

| Gate | Command | Exit code | Result |
|---|---|---|---|
| Build | `npm run build` | **0** | `dist/` is a self-contained MV3 folder (12 files) |
| Tests | `npm test` (`vitest run`) | **0** | **1255 tests in 58 files**, all passing (baseline was 1210 in 56 files) |
| Typecheck | `npm run typecheck` | **0** | three `tsc --noEmit` projects clean |
| Harness | `node scripts/check-agent-config.mjs` | **0** | 0 errors, 0 warnings, 207 info |

The test count only grows: 1210 → 1255 (+45 tests: 17 in `tests/core-author-notes.spec.ts`,
23 in `tests/options-rename.spec.ts`, 5 in `tests/options-window-look.spec.ts`).

## Acceptance criteria 1–12, verdict and evidence

| AC | Verdict | Evidence |
|---|---|---|
| 1. A rename from `A` to `B` deletes every stored note whose `authorName` is `A`, on every page the index lists | **Implemented** | `deleteNotesOfAuthorOnAllPages` in `src/core/author-notes.ts`. Tests: `tests/core-author-notes.spec.ts` → "AC1 — the rename sweep deletes every stored note of the author on every page" (3 cases: all pages swept, only-owner page loses its slot and index entry, other pages untouched); "A rename from A to B" in `tests/options-rename.spec.ts` → "the name is saved first and every page's notes are deleted second" |
| 2. Notes of other authors survive byte for byte | **Implemented** | `tests/core-author-notes.spec.ts` → "AC2 — notes of other authors survive the rename byte for byte" (2 cases, `toBe` identity checks on the surviving record objects); `tests/options-rename.spec.ts` → "keeps another author's notes untouched" |
| 3. The server is not called during a rename; a recording transport sees zero calls | **Implemented** | `src/core/author-notes.ts` imports no sync module (no `SyncTransport`, no `fetch`). Tests: `tests/core-author-notes.spec.ts` → "AC3 — the rename calls no transport" (a recording transport installed in the port; zero calls after the sweep); `tests/options-rename.spec.ts` → "the rename calls no transport" (recording transport over the service's `confirmRename`) |
| 4. The confirmation appears when a rename would delete at least one note and names the consequence | **Implemented** | `AuthorNameService.saveName` returns `{ kind: 'confirm' }`; the component renders `@if (renameConfirm())` with `OPTIONS_STRINGS.renameWarning` = «Заметки прошлого имени будут удалены на этом устройстве». Tests: `tests/options-rename.spec.ts` → "AC4 — the warning appears only when a rename would delete a note" (2 cases: appears for a rename with notes, does not appear for a no-op or a rename with no notes) |
| 5. Cancel writes nothing: the stored name and every stored note stay byte-identical | **Implemented** | `onCancelRename` clears the flag and calls nothing. Tests: `tests/options-rename.spec.ts` → "AC5 — Cancel writes nothing" (the port snapshot is deep-equal before and after; no `set`/`remove` call) |
| 6. Continue saves the name and deletes the notes, in that order | **Implemented** | `AuthorNameService.confirmRename` awaits `saveSettings` first, then `deleteNotesOfAuthorOnAllPages`. Tests: `tests/options-rename.spec.ts` → "AC6 — Continue saves the name first and deletes the notes second" (the port call log shows `set:settings:v1` before any `remove:`/`set:pages:v1`; plus the failure case where the name save fails and nothing is deleted) |
| 7. No confirmation when the store holds no note of the stored name; the save goes through | **Implemented** | `saveName` returns `{ kind: 'saved' }` when `hasStoredNotes` is `false`. Tests: `tests/options-rename.spec.ts` → "AC7 — no warning when there is nothing to lose" (2 cases: no notes at all; a name that differs only by surrounding whitespace is a no-op) |
| 8. A name save that fails leaves every note in place and reports the failure | **Implemented** | `confirmRename` returns `{ ok: false, code }` without calling the sweep. Tests: `tests/options-rename.spec.ts` → "AC8 — a failed name save deletes nothing" (port write failure on `settings:v1`; the port snapshot is byte-identical and the refusal code is reported) |
| 9. The page's memory-held foreign notes are dropped on a rename, so the next load rebuilds them | **Implemented** | The settings write is the storage change the page reacts to (`A60`); the memory layer `createForeignNotes().replace(rows, name)` rebuilds from the new name. Tests: `tests/options-rename.spec.ts` → "AC9 — the settings write is the change the page reacts to" (the first write is `set:settings:v1`) and "the memory rebuilds from the new name" (real `createForeignNotes` from `src/content/sync/foreign-notes.ts`, which this slice did not touch) |
| 10. The Russian wording of the confirmation lives in the options text module and nowhere else | **Implemented** | `OPTIONS_STRINGS.renameWarning`, `renameCancel`, `renameContinue` and `RENAME_OUTCOME_TEXT` in `src/options/text.ts`. Test: `tests/options-rename.spec.ts` → "AC10 — the wording lives in the options text module" (the literals are in `text.ts` and absent from the component's code) |
| 11. Every existing gate stays green; the test count only grows | **Implemented** | See the gate table above: 0/0/0/0, 1255 tests in 58 files |
| 12. `docs/specs/sync-integration.md` and the settings half of `docs/specs/inline-comment-model.md` state the rename rule; `docs/specs/INDEX.md` stays accurate | **Implemented** | `sync-integration.md` → "Rename calls no server" section and the `rename` term row; `inline-comment-model.md` → "Rename" rule beside "Rename calls no server"; `content-overlay-ui.md` → "Rename warning" and "Rename spacing" rules and the two new Terms rows. `INDEX.md` needed no change: no spec file was added or removed, and the three edited specs keep their owners and covered paths |

## Addendum 1 acceptance criteria 13–15

| AC | Verdict | Evidence |
|---|---|---|
| 13. `.toggle-line` declares `margin: 48px 0 0`, pinned by a test that reads the declaration | **Implemented** | `src/options/options.component.ts` `.toggle-line { margin: 48px 0 0 }`. Test: `tests/options-window-look.spec.ts` → "A175 — the checkbox row's margin is four times the shipped 12px" reads the declaration out of the stylesheet and asserts `48px 0 0` |
| 14. `OPTIONS_STRINGS.saved` is exactly `Сохранено`, and the options page renders it after a successful save; `sweep_failed` is unchanged | **Implemented** | `src/options/text.ts` `saved: 'Сохранено'`; `RENAME_OUTCOME_TEXT.sweep_failed` keeps «Имя сохранено, но часть заметок с прошлым именем удалить не удалось». Tests: `tests/options-window-look.spec.ts` → "A176 — the confirmation is exactly Сохранено" (2 cases: the literal and the rendered confirmation) |
| 15. Both changes are in the same commit as the rename rule, and the four gates stay green | **Implemented** | One commit contains all three slices; the gate table above is measured on that tree |

## Files touched

Added:
- `src/core/author-notes.ts` — `deleteNotesOfAuthorOnAllPages`: the cross-page sweep over the page index, one `deleteEntriesOfAuthor` per page, no server call.
- `tests/core-author-notes.spec.ts` — 17 tests over the memory port.
- `tests/options-rename.spec.ts` — 23 tests over the memory port and the real `createForeignNotes` memory.

Modified:
- `src/options/author-name-service.ts` — `saveName`, `confirmRename`, `storedNotesOf`, `RenameOutcome`, `SaveDecision`.
- `src/options/options.component.ts` — the rename warning block, the `.rename*` styles, the `.toggle-line` margin (`A175`), the `renameConfirm`/`renameOutcome` signals and the three handlers.
- `src/options/text.ts` — `renameWarning`, `renameCancel`, `renameContinue`, `RENAME_OUTCOME_TEXT`, `saved: 'Сохранено'` (`A176`).
- `tests/options-window-look.spec.ts` — the key set and the `saved` wording, plus the `A175`/`A176` describes.
- `docs/specs/content-overlay-ui.md` — the rename warning and rename spacing rules, the terms rows, the `A176` wording.
- `docs/specs/inline-comment-model.md` — the rename rule and the settings-half sentence.
- `docs/specs/sync-integration.md` — the "Rename calls no server" section and the term row.

Not touched, as instructed: `src/content/sync/foreign-notes.ts`, `server/`, `src/manifest.json`, `src/core/entry-store-write.ts`.

## Two deviations from the brief, both reported rather than silently taken

1. **`deleteEntriesOfAuthor` already existed per page and was reused, not reimplemented.** The brief
   said "`deleteEntriesOfAuthor` already exists per page", so the new module composes it once per
   indexed page instead of writing a second per-page deletion. That keeps one write policy and one
   `A16` carry-through rule.
2. **The confirmation's "does the store hold a note of the stored name" question needs a page key.** The
   options page has no current page (`A49` is about the popup), so the service answers it by reading
   the index and each listed page through `loadEntries`. That is a read-only pass and it runs before
   any write. A consequence worth stating: the check reads **all** pages, so a rename is warned about
   when any page holds a note of the old name, not only the page the reader is on.

## Open questions

1. **Should the warning name the count?** The brief's wording names the consequence but not how many
   notes it covers. The implementation uses the single sentence the brief fixes; a count would need a
   second string and a ruling.
2. **`A175`'s "four times" and the addendum's literal.** The addendum fixes `48px` and the test pins
   `48px`, so the number and the prose agree today; if a later ruling changes the base 12px, the
   literal will not follow. That is the addendum's choice, not a gap in this slice.
3. **`sweep_failed` naming.** The addendum keeps «Имя сохранено, но …» and the implementation keeps it
   verbatim. If the user later wants the same wording as `A176`, that is a separate ruling.
