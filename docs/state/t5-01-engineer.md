# Engineer report — `t5-01-author-overlap` (attempt 1)

Role: `extension-engineer`. Rulings cited: `A93` (card), `A99` and `A100` (issued while the task was
in flight, after this engineer's escalation — see "Escalation" below).

## Escalation (before any line was written)

Two blockers were put to the PM instead of being decided here:

1. **AC8 vs the card's own identity sentence.** The card said "exact string equality — no trimming"
   and at the same time "the same identity the edit-rights rule uses". `isSameAuthor`
   (`src/core/entry-rules.ts:125`) trims, `docs/specs/inline-comment-model.md:77` says "after
   trimming", and `tests/entry-rules.spec.ts:177` pins `isSameAuthor('а', 'а ') === true`. Both
   readings cannot hold. PM answer: **reading (A)** — one identity everywhere, `A99`, and **AC8 is
   flipped**: a record authored `"Я "` **does** block an attempt under `"Я"`.
2. **Scope: the editor call site.** Spec `inline-comment-model.md:79` scopes the rule over "a new
   **or moved** range", and the moved half is served by
   `findOverlappingEntry` in `src/content/editor/edit-entry.ts`, which bypasses the gate. PM answer:
   **option (ii)**, `A100` — the filter applies at both call sites, and the brief is amended to name
   `src/content/editor/edit-entry.ts` as the one authorized `src/content/` file.

## Commits

| Hash | Content |
|---|---|
| `7fb52ea` | `docs(specs)` — model + overlay spec made per-author, cites `A93`, `A99`, `A100` |
| `731ea9c` | `feat(t5-01)` — core projection + gate filter + editor call site + 17 tests |

## Changed paths

- `docs/specs/inline-comment-model.md` — Terms gains `own entry` («Вы») and `foreign entry`; Flow 3
  steps 5-6 scan the own half while step 4 counts every author; the Identity line names one identity
  (`A99`); "Edit rights" loses the now-false "covered by another author is refused"; "Overlap" and
  "Duplicate entry" are per-author for a new and a moved range alike (`A100`); "Hidden entries"
  narrowed to the same author; two Edge Cases lines; AC6 and AC24 amended; AC33-AC34 appended.
- `docs/specs/content-overlay-ui.md` (owner: `extension-engineer` per `docs/specs/INDEX.md`) — the
  four sentences that claimed a foreign entry blocks something were made true (`selection claim`,
  foreign-entry editor sentence, `A45` re-selection, the `A78` note); AC6 amended, AC24 appended.
  Refusal wording untouched.
- `src/core/entry-rules.ts` — new exported projection `entriesOfAuthor(entries, currentName)`
  (`:158`), built on `isSameAuthor`; `assertCreatable` (`:212-217`) feeds both finders from it;
  docblocks updated. `MAX_ENTRIES_PER_PAGE`, step 4 and every other rule unchanged.
- `src/content/editor/edit-entry.ts` — `ownOthers = entriesOfAuthor(others, input.currentName)`
  (`:162`) handed to `findOverlappingEntry`; `A45` self-exclusion kept as it was; docblocks updated.
- `tests/entry-rules.spec.ts` — 2 new describes, 11 cases.
- `tests/core-entry-store-write.spec.ts` — 2 new cases (write API, `A46` shape).
- `tests/content-editor-controller.spec.ts` — AC5 pin moved onto a second **own** entry, 1 new case,
  header pin list updated.
- `tests/content-create-card-controller.spec.ts` — `seedEntry` takes an author; 2 new page-surface
  cases; header pin list updated.

Not touched (verified by `git diff --stat HEAD~2 HEAD`): `src/core/entry-overlap.ts`,
`src/core/anchor-build.ts`, `src/core/entry-store-write.ts`, `src/content/text.ts`, the paint layer,
`src/popup/`, `src/options/`, `src/manifest.json`, `package.json`, `scripts/`,
`docs/specs/code-review-flow.md`, `docs/specs/INDEX.md`, `docs/state/t5-01-author-overlap.md`.

## Acceptance criteria, one line each

1. Same author + identical comment on identical words → `duplicate` — `tests/entry-rules.spec.ts:424`;
   write-API control `tests/core-entry-store-write.spec.ts:1029`; gate
   `src/core/entry-rules.ts:212`.
2. Same author + intersecting span → `overlap` — `tests/entry-rules.spec.ts:437`;
   page surface `tests/content-create-card-controller.spec.ts:692` (second half).
3. Different author + identical comment on identical words → `null` — `tests/entry-rules.spec.ts:450`;
   write API `tests/core-entry-store-write.spec.ts:1029` (first block); page surface
   `tests/content-create-card-controller.spec.ts:673`.
4. Different author + intersecting span → `null` — `tests/entry-rules.spec.ts:465`;
   `tests/content-create-card-controller.spec.ts:692` (first half); editor move
   `tests/content-editor-controller.spec.ts:783`.
5. Mixed page: intersects only foreign → `null`; only own → the corresponding code —
   `tests/entry-rules.spec.ts:489` (four assertions: foreign-only, foreign-identical, own-overlap,
   own-duplicate).
6. `page_limit` still counts every entry whatever its author — `tests/entry-rules.spec.ts:537` and
   `tests/core-entry-store-write.spec.ts:1006`; `MAX_ENTRIES_PER_PAGE` unchanged at
   `src/core/entry-rules.ts:28`.
7. Hidden own entries still block (`A22`); stale still does not (`A24`) —
   `tests/entry-rules.spec.ts:562`; the pre-existing `A22`/`A24` pins
   (`tests/entry-rules.spec.ts:319`, `tests/core-entry-store-write.spec.ts:963`,
   `tests/content-create-card-controller.spec.ts` stale case) still pass; the projection reads
   `authorName` only — `tests/entry-rules.spec.ts:648`.
8. **(flipped by `A99`)** a record authored `"Я "` **does** block an attempt under `"Я"`, and `"я"`
   does not — `tests/entry-rules.spec.ts:596` (overlap, duplicate under `'  Я  '`, case-sensitivity);
   write API with a stored `'  reader-one  '` record `tests/core-entry-store-write.spec.ts:1029`
   (last block); identity parity with `canEdit` `tests/entry-rules.spec.ts:663`. The
   `isSameAuthor('а','а ') === true` pin at `tests/entry-rules.spec.ts:177` is untouched.
9. `src/content/text.ts` untouched — `git diff HEAD~2 HEAD -- src/content/text.ts` is empty;
   «Выделение пересекается с существующей записью» is still pinned verbatim at
   `tests/content-create-card-boundaries.spec.ts:289`.

Extra pins added by the ruling: both call sites are filtered
(`grep -rn "find(Overlapping|Duplicate)Entry" src` returns exactly `src/core/entry-rules.ts` and
`src/content/editor/edit-entry.ts`), and the boundary pin
`contentFilesMatching(/\bfindOverlappingEntry\s*\(/) === ['src/content/editor/edit-entry.ts']`
(`tests/content-create-card-boundaries.spec.ts:206`) still passes, so no second overlap rule appeared
in the page layer.

## Commands run

| Command | Result | Tail |
|---|---|---|
| `npm run build` | passed | `[build] dist/ is a self-contained MV3 folder (10 files)` |
| `npm test -- --reporter=basic` | passed | `Test Files 41 passed (41)` / `Tests 807 passed (807)` |
| `node scripts/check-agent-config.mjs` | passed | `0 error(s), 0 warning(s), 90 info(s)` |

Re-run in the briefed order on the committed tree (`731ea9c`): `npm run build` → `npm test` →
`node scripts/check-agent-config.mjs`, same three tails; `git diff --cached` is empty (0 staged
files), the only untracked path is the PM's own `docs/state/t5-01-author-overlap.md`, untouched.

Per-file runs used while working: `tests/entry-rules.spec.ts` 43 passed,
`tests/core-entry-store-write.spec.ts` 59 passed, `tests/content-editor-controller.spec.ts` 23 passed,
`tests/content-create-card-controller.spec.ts` 32 passed. Test count moved 790 → 807 (+17); file
count 41 unchanged.

## Deviations from the card (all named, none invented)

1. `src/content/editor/edit-entry.ts` changed — authorized afterward by `A100` / the amended brief.
2. `src/content/entry-overlap.ts`, `src/content/text.ts`, the paint layer, popup, options, manifest:
   untouched, as ordered.
3. `docs/specs/content-overlay-ui.md` was edited although the card named only
   `inline-comment-model.md`. Reason: `docs/specs/INDEX.md` makes `extension-engineer` the owner of
   that spec, `AGENTS.md` requires a behavior change to edit its spec in the same commit, and four of
   its sentences became false (they promised that a foreign entry's span blocks). `A76` bans only
   `docs/specs/code-review-flow.md`, which was not touched. Revert this file if the PM wants the
   overlay spec synced by a separate task.
4. `resolvedEntryRanges(stream, root, ownOthers)` in the editor now resolves only the own entries
   instead of all others (`src/content/editor/edit-entry.ts:166`). The map is keyed and read by `id`,
   so the answer is identical; one foreign anchor resolve per saved move is simply no longer paid for.
   The create path (`src/content/create/create-note.ts`) was left resolving the whole page, so the
   model spec's "a create costs one resolve per existing entry of the page" stays literally true.
5. One existing pin was rewritten rather than kept:
   `tests/content-editor-controller.spec.ts` AC5 "refuses a move onto another entry" used the
   **foreign** entry's span (`'fox jumps'`), which `A93`/`A100` make legal. It now moves onto a second
   own entry (`'lazy dog'`, `ownSecondRecord()`), and a new case pins the foreign move as allowed.

## Open questions / residual risks

1. `docs/specs/INDEX.md` lists covered paths for `inline-comment-model.md` without
   `src/content/editor`; the model spec now owns a rule enforced in that directory. Pre-existing gap,
   not widened here; a PM decision to add the path.
2. Browser verification of the observable half (two notes of two authors on one span, both painted)
   is not done: no `chrome://extensions` run in this environment. Painting two coexisting ranges is
   the subject of `t5-02`/`A94` (per-author highlight names), and no claim about how they look is made
   in either spec.
3. `src/content/create/create-note.ts` still resolves every entry of the page before the core filter
   drops the foreign ones; a later cost-slicing task may narrow that list, but it is outside this
   brief.
