# Task `t5-06b-carried-fixes` — the leftovers of the wall-hit task

Stage 6, task 4 (a carried-fix slice, not a second attempt: `t5-06` was accepted 10/10 with 0 blocking findings). Owner:
`extension-engineer`. Ruling for item 3: **`A110`**. Specs: none of the behavior specs change in this task.

## Goal

`t5-06` ran out of wall clock after CP3 and its reviewer left five non-blocking findings. This slice closes the four that are
work, and pins one shape as accepted debt so a later refactor cannot start using it by accident.

## Items (`A72`)

1. **The page-layer repaint pin is still driven by the per-entry write.** `tests/content-cross-tab-refresh.spec.ts:317` uses
   `setVisible`. Add the same repaint proof driven by **`setVisibleForAuthor`** — the aggregate write must be what the real
   `storage.onChanged` path reacts to, since that is what the popup now performs. Do not replace the existing per-entry pin; add
   the aggregate one next to it.
2. **The popup by-identity claim is weaker than the report said.** `tests/popup-entry-list.spec.ts:733-748` compares survivors with
   `toEqual` plus `toBe` for one of three, while the full by-identity proof lives at
   `tests/core-entry-store-write.spec.ts:881-905`. Either make the popup pin assert identity for **every** surviving record, or
   state in the test's own comment that the identity claim is owned by the core pin and name that file. Pick one; do not leave the
   test asserting less than its name claims.
3. **The empty-author row becomes pinned accepted debt (`A110`).** A stored record whose `authorName` is empty or whitespace-only
   decodes (`src/core/entry-store-read.ts:132`), renders an inert popup row whose two controls write nothing
   (`groupsOf` at `src/popup/page-entries-service.ts:156-186` vs `authorRecordsOf` refusing that "author"), and two such records
   produce two rows with the same `trackBy` value. No shipped create can produce it (`src/core/entry-store-write.ts:242`
   normalizes behind `assertCreatable`). **No code change**: pin the shape instead — such a record yields a row, both controls are
   no-ops, and the create path cannot store it. That converts an unpinned accident into a documented boundary.
4. **Two stale README sentences.** `README.md:5` has a number disagreement, and `README.md:111` still says «Стадии 1–4 кода
   готовы» although Stage 5/6 code shipped. Fix both, and re-read every sentence you touch against the code — README prose is
   reviewed as a factual document (ruling `A92`: a fix must be re-read for the claim it puts in place of the one it removes).

## Acceptance criteria

1. A page-layer test exists where an aggregate `setVisibleForAuthor` write from one tab repaints another tab's highlights.
2. The popup group-delete pin either asserts identity for every survivor or names the core pin that owns that claim.
3. A test pins the empty-author shape exactly as `A110` states it (row renders, controls write nothing, create cannot store it).
4. `README.md` contains no stale stage claim and no internal number disagreement, and its counts still match the tree.
5. No `src/` file changes in this task. If an item looks impossible without a `src/` change, **stop and report** — do not change
   behavior under a carried-fix label.

## Boundaries

- Allowed: `tests/**`, `README.md`.
- Forbidden: everything under `src/`, both behavior specs, `docs/state/t5-06b-carried-fixes.md` (this card), harness files
  (`A76`, `A89`).

## Gate and commit order (`A62`, `A73`, `A101`)

Commit at each green step; every gate with `echo "exit=$?"` on the line immediately after the command, never after a pipe.
Report per item: `done` + `path:line`, and the four gates with exit codes. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
