# t2-03-core-overlap

## Goal

The last two creation checks of Flow 3 live in `src/core/`: the overlap rejection and the identical-entry rejection.
After this task the whole validation chain (`name → selection → comment cap → entry cap → overlap → duplicate`)
exists in one pure function, which is what the content card and the popup will call in Stages 3–4.

## PM rulings this task implements

- `A22` **Hidden entries still block.** `visible` controls painting only (ruling `A1`), so a hidden entry's range
  participates in overlap exactly like a visible one.
- `A23` **Duplicate definition.** Two entries are identical when the resolved stream range is equal **and** the
  normalized comment is equal. Same text with a different comment is a legitimate second note only if the ranges do
  not overlap — which they would, so in practice the same selection with a new comment is refused as `overlap`, and
  `duplicate` is the more specific code reported when both match.
- `A24` **Stale entries cannot overlap.** An entry whose anchor does not resolve has no range; it is excluded from
  the overlap set, so a new note may be created over text where an old note went stale.
- `A37` (from `docs/state/t2-02-review.md` → residual risks for `t2-03`): overlap is computed on the **resolved
  half-open code-point range of the current stream**, never on the stored anchor text; a shared block-boundary
  separator code point counts as a touching boundary, not as shared content; every existing entry's range must come
  from the same re-resolve pass, so a create costs one resolve per existing entry of that page (accepted cost).

## AC (5 substantive + gates)

1. A value type for a resolved range in `src/core/`: `{ start, end }` in stream code points, plus
   `rangesIntersect(a, b)` where a shared single boundary point is **not** an intersection (spec → Overlap, AC6).
   Boundary cases tested: `[0,10)` vs `[10,20)` → no overlap; `[0,10)` vs `[9,20)` → overlap; identical range →
   overlap; zero-length candidate → no overlap.
2. `findOverlappingEntry(candidate, entries, resolvedRanges)` → the first overlapping entry or `null`; hidden entries
   participate (`A22`), stale entries are skipped (`A24`); the returned entry is the one the UI will name.
3. `assertCreatable` gains the two missing Flow-3 checks in the spec order — after the entry cap: `overlap`, then
   `duplicate` (`A23`). Existing four codes keep their behavior and their tests; the precedence test is extended so
   the whole six-step order is pinned by one table-driven case.
4. `docs/specs/inline-comment-model.md` is edited in the same commit: the duplicate definition (`A23`), the stale
   exclusion (`A24`), the hidden-entry rule (`A22`), and the wording that "a moved range" (the editor re-selecting in
   `t3-03`) goes through the same check.
5. Purity and boundaries: no DOM, no `chrome.*`, no `any`; the new module joins the `MODULES` purity scan; no
   Russian strings in `src/core/` (the Russian overlap message is mapped in `t3-03`).

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order: module + tests → `npm test` early → spec lines → gates → commit `feat(t2-03): overlap and duplicate creation checks`. Commit as soon as green.

## Inputs the engineer reads

`docs/state/t2-02-review.md` (**residual risks for `t2-03-core-overlap`**, all four), `docs/specs/inline-comment-model.md`
(Flow 3, Overlap, Edge Cases, AC6), `docs/state/t2-03-core-overlap.md`, `docs/state/t1-04-review.md` (the four-code set
and its precedence test), `src/core/anchor-resolve.ts` (range output), `src/core/entry-rules.ts`,
`src/core/entry-store-write.ts`.

## Explicitly out of scope

No DOM range math (that is `t2-02`'s output), no content-script UI, no popup, no storage writes, no message strings.

## Attempts log

- attempt 1 (`3d150ac8`): **timeout at 3600000 ms.** The code survived in the tree; the PM measured
  `npm test` → 394 passed / **1 failed**, `npm run build` green, checker 0 errors. What was missing: the spec edits
  (AC5), carried fix `R1`, the commit and the report.
  **PM error, recorded:** this brief carried 5 substantive AC **plus** four carried fixes (`A27`, `A28`, `R1`, `R2`) —
  nine work items in one slice, which breaks the slice-size rule in `docs/specs/code-review-flow.md` in spirit even
  though the AC count was legal. `attempt 2` therefore had a much smaller job.
- attempt 2 (`cb93b848`): completion slice — fix the broken `A24` fixture (`tests/core-entry-overlap.spec.ts:197-198`,
  the fixture asserts `null` for a range that really does overlap `[10,20)` — the code is right, the test is wrong),
  finish `R1`, write the AC5 spec lines, gates, commit, report.
  Result: commit `5a029c5` (11 files, +947/−73), working tree clean. PM re-ran the gates on the commit: `npm test`
  **396 passed**, `npm run build` self-contained `dist/`, checker `0 errors / 0 warnings / 19 INFO`.
- reviewer: running (`adbd5d3b`), range `02a4c73..5a029c5`. Attempt budget **2/2 used**: a `changes requested` verdict
  stops the line and goes to the user, it does not buy a third attempt.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 2 (engineer ×2 attempts; reviewer not yet delegated).

## Verdicts

- engineer report: not started
- reviewer verdict: not started

Carried fixes from the `t2-01` review (they belong to this module's neighborhood; they must not add ACs):

- `A27` — `buildAnchor` takes the `prefix`/`suffix` window at the boundaries of the **trimmed** span, so a selection
  whose raw slice starts or ends with whitespace still produces a needle that is a substring of the stream today it
  silently falls back to the bare-text step). Two tests, one spec clause.
- `A28` — an out-of-domain `contextWindow` or `fragments` value is refused (`buildAnchor` returns `null`) instead of
  being coerced to 0; the stance matches `A26`. One spec clause, one table of rejected values.
- `R1` — the spec's whitespace bullet must point at the closed enumeration the code implements, must call U+2028 and
  U+2029 line/paragraph separators rather than "space separators", and one negative test must pin that U+0085 (NEL)
  survives normalization.
- `R2` — the comments in `src/core/entry.ts` cite a spec phrase that no longer exists ("whitespace collapsed") and say
  "Up to 40" where the spec now says "default 40, caller may ask for another size". English grep anchors are a repo rule.

## Open questions

- Stale existing entries are settled by ruling `A24`: they have no range and cannot cause an overlap; the spec line
  belongs to AC4 of this task.
- Re-editing one's own entry must not collide with itself: `t3-03` passes the entry's own id to be excluded before
  the overlap check. Recorded here so the API shape leaves room for an `exceptId` argument; implemented in `t3-03`.
