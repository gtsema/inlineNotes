# Task `t5-01-author-overlap` — the overlap and duplicate gates become per-author

Stage 5, task 1. Owner: `extension-engineer`. Ruling: `A93` (`docs/state/improvement-backlog.md` → Answers and rulings).
Spec to edit in the same commit: `docs/specs/inline-comment-model.md`.

## Goal

Two notes of **different** authors may occupy the same words on a page; two notes of the **same** author may not. Today
`assertCreatable` (`src/core/entry-rules.ts:163`) rejects a candidate span against **every** entry of the page:
`findOverlappingEntry` / `findDuplicateEntry` (`src/core/entry-overlap.ts:133`) never look at `authorName`.

## Shape the PM chose (do not redesign it)

Keep `entry-overlap.ts` pure and unchanged. Add one exported core projection — `entriesOfAuthor(entries, currentName)` in
`src/core/entry-rules.ts`, built on the shipped `isSameAuthor` — and feed **both** finders from it. Author identity is the
identity the product already uses: `isSameAuthor` (`src/core/entry-rules.ts:125`), which trims both sides, is case-sensitive and
never matches an empty side. Ruling `A99` retires the phrase "exact string equality" from the first draft of this card: one
identity everywhere, so `canEdit`, the «Вы» tooltip label and `docs/specs/inline-comment-model.md:77` keep answering the same
way. Ruling `A100` puts the same filter at the editor call site as well (see Boundaries).

## Acceptance criteria (observable)

1. Same author, identical comment on identical words → `duplicate` (unchanged).
2. Same author, intersecting span → `overlap` (unchanged).
3. **Different author**, identical comment on identical words → `null`, the entry may be created (new).
4. **Different author**, intersecting span → `null` (new).
5. A mix on one page: own + foreign entries, candidate intersects only the foreign one → `null`; intersects only an own one →
   the corresponding code.
6. `page_limit` still counts **every** entry of the page regardless of author (`MAX_ENTRIES_PER_PAGE` unchanged).
7. Hidden own entries (`visible: false`) still block an own creation (`A22` unchanged); stale entries still do not block
   (`A24` unchanged).
8. Author identity is `isSameAuthor`: an entry authored by `"Я "` (trailing space) **does** block an attempt under `"Я"` — the
   trimmed halves are one author. The existing pin `tests/entry-rules.spec.ts:177` (`isSameAuthor('а', 'а ') === true`) must stay
   green, and the new case is pinned positively: same author with an untrimmed stored record → refused with the right code; a
   foreign record in the same position → allowed.
10. The **editor** path (`src/content/editor/edit-entry.ts:153`) answers overlap per-author too (`A100`): with the edited entry
    self-excluded (`A45` unchanged), a re-derived range intersecting only a **foreign** entry is not refused, and intersecting
    another entry **of the same author** is.
9. The refusal strings in `src/content/text.ts` are untouched — «Выделение пересекается с существующей записью» keeps its
   meaning, it just applies to fewer cases.

## Boundaries

- No change to `entry-overlap.ts`, `anchor-build.ts`, `entry-store-write.ts`, the paint layer, the popup, the options, the
  manifest, dependencies, or the harness files — **except** `src/content/editor/edit-entry.ts`, which this brief authorizes by
  name for the author filter only (ruling `A100`, the `A90` naming rule). No other `src/content/` file, and no other reason.
- Spec `docs/specs/inline-comment-model.md:79` is rewritten in one commit so the per-author sentence honestly covers **both**
  halves (a new range and a moved/re-derived one). Do not leave it half-true.
- No new Russian string, no new storage key.
- Do not touch the task state file `docs/state/t5-01-author-overlap.md`; write your own report to your report artifact.
- `docs/specs/code-review-flow.md` and the other PM-owned specs are out of scope (ruling `A76`, `A89`).

## Carried-fix checklist

None.

## Gate and commit order (`A62`, `A73`)

1. Spec edit first (`inline-comment-model.md`: the overlap and duplicate rules become per-author, cite `A93`; keep the
   `Terms / Aliases` Russian wording).
2. Then the gate change + tests in `tests/entry-rules.spec.ts` and, if you need span-level cases, `tests/core-entry-overlap.spec.ts`.
3. `npm run build` → `npm test` → `node scripts/check-agent-config.mjs` green, then commit. Commit again at each green
   checkpoint.
4. Report: the commit hashes, quoted gate tails (never a full test log), and the nine AC numbers one per line with `path:line`.

## Attempts log

- **attempt 1 running.** The engineer stopped before writing anything and escalated two blockers (2026-11-18): AC8 contradicted
  the card's own "same identity as edit rights" sentence, and the brief scoped the rule to one call site while the spec sentence
  covers new **and** moved ranges. The PM answered as rulings `A99` (one identity, `isSameAuthor`; AC8 flipped) and `A100` (the
  filter at both call sites, `src/content/editor/edit-entry.ts` authorized by name), and amended this card before the child
  wrote code. Not an attempt cost: a correct escalation that prevented a half-true spec line.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: **3** — engineer, the same session resumed for the red
`npm run typecheck` (a gate repair is unfinished work, not an attempt, `A80`-class), reviewer.

## Verdicts and closure

- PM gates on the delivered tree (`731ea9c` + `f1093f3`): `npm run build` → `dist/` self-contained, 10 files; `npm test` →
  **807 passed / 41 files**; `node scripts/check-agent-config.mjs` → 0 errors / 0 warnings / 90 INFO; `npm run typecheck` →
  **exit 0** (exit 2 at `731ea9c`, which is why `f1093f3` exists).
- reviewer verdict: **accepted**, 0 blocking findings, 3 remarks (`docs/state/t5-01-review.md`). All ten AC `pass`. The reviewer
  checked non-vacuity case by case (naming which assertion flips if the author filter is removed), that
  `src/core/entry-overlap.ts` has an empty diff, that the two finders have exactly two shipped call sites and both are fed by
  `entriesOfAuthor`, and that the gate repair kept its proof (`toHaveLength(2)` before the indexed read).
- **PM closed reviewer remark 1 personally**: one half-true clause in `docs/specs/inline-comment-model.md:82` (after `A100` the
  editor pass resolves only the own half, not the whole page). Remarks 2 and 3 were judged correct calls, not findings — the
  engineer declared the extra test files and the overlay-spec edit as deviations, and both were needed to keep the two specs true.
- **task status: accepted.** Commits: `7fb52ea` (specs), `731ea9c` (core + editor + 17 tests), `f1093f3` (test-only repair).
  The escalation that produced `A99`/`A100` cost no attempt and prevented a half-true spec line.
