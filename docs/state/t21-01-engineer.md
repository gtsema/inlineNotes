# t21-01 — engineer report: store the adopted comment normalized (A197)

Task: fix review remark 1 of `docs/state/t20-03-review.md` in the core adoption rule
(`adoptOwnNotes`, rulings `A197`-`A199`).

Commit: `cd3e6c3` — `t21-01: store the adopted comment normalized (A197)`.

## Changed paths

- `src/core/entry-store-write.ts` — the only production change: `adoptionDraft` now
  stores `validateComment(row.comment).normalized` instead of the raw `row.comment`.
  The row-skip check in `adoptOwnNotes` stays `validateComment(row.comment).ok` where it
  was. `text` and `anchor` are stored verbatim, so the stored text keeps matching the
  stored anchor. A short comment block on `adoptionDraft` records why (review finding 1
  of `t20-03`, "Decode on write", the adopted-comment sentence added to
  `sync-integration.md`).
- `tests/core-own-notes-adopt.spec.ts` — three new cases (see below); every existing
  case untouched and still green.

No spec prose was edited (the PM owns the spec text; the adopted-comment sentence is
already in `docs/specs/sync-integration.md`). Nothing under `src/content/` was touched.

## Tests added

`tests/core-own-notes-adopt.spec.ts`:

1. `stores an adopted padded comment trimmed, never with its padding` — row comment
   `'  spaced  '` on an empty page is adopted (1/0) and stored as `'spaced'`; `text` and
   `anchor` are stored verbatim, so the trim is limited to the comment.
2. `stores an adopted replace with the trimmed comment too` — the same normalization on
   the `A198` replace path, not only on a new row: a newer padded row replaces the
   stored record and the stored comment is `'spaced'`.
3. `skips a padded comment whose trimmed value is over 256 code points, writing nothing`
   — `'  ' + 'x'.repeat(257) + '  '` is skipped (`adopted: 0, skipped: 1`), no `set`/`remove`
   call, no slot value stored. The trim-before-measure is what makes this skip; a check
   that measured the raw string could not.

## Commands run (in the briefed order)

- `npm run build` — pass: `[build] dist/ is a self-contained MV3 folder (16 files)`.
- `npm test` — pass: `Test Files 65 passed (65)` / `Tests 1375 passed (1375)` (was 1372,
  +3 new).
- `npm run typecheck` — pass: three `tsc --noEmit` projects, no diagnostics.
- `node scripts/check-agent-config.mjs` — pass: `0 error(s), 0 warning(s), 243 info(s)`
  (info lines are the pre-existing `PLAN_PREFIXES` notes).
- Focused re-run: `npx vitest run tests/core-own-notes-adopt.spec.ts` — pass: `28 passed (28)`.

## AC self-check

- "in `adoptionDraft`, store `validateComment(row.comment).normalized` instead of the raw
  `row.comment`" — done (`src/core/entry-store-write.ts`, `adoptionDraft`), verify line:
  `comment: validateComment(row.comment).normalized,`.
- "keep the row-skip check `validateComment(row.comment).ok` where it is" — done; the
  `if (!validateComment(row.comment).ok) { skipped += 1; continue; }` guard in
  `adoptOwnNotes` is unchanged.
- "Do not normalize `text` or `anchor`" — done; both fields are copied from the row.
- "a padded own row (`'  spaced  '`) is stored with the trimmed comment" — done (case 1,
  plus case 2 for the replace path).
- "a padded comment whose trimmed value is over 256 code points is skipped and nothing is
  written" — done (case 3).
- "keep every existing case green" — done; the whole suite is green.
- "Nothing else: no change under `src/content/`, no spec prose edits" — done.
- "Gates in order: npm run build, npm test, npm run typecheck, node
  scripts/check-agent-config.mjs" — run in that order, all pass.
- "One commit: `t21-01: store the adopted comment normalized (A197)`" — done (`cd3e6c3`).

## Open questions

- none.

## Notes for the PM

- `META-INSTRUCTION-compact.md` shows as deleted (`D`) in the worktree — pre-existing,
  named as pre-existing in the `t20-03` review; it was not touched or staged by this task.
- Remarks 2 (cap counts only decodable records) and 3 (extra store reads per load) of
  `t20-03-review.md` are outside this brief and were left as they are.
