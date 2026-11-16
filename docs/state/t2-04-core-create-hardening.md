# t2-04-core-create-hardening

## Goal

Close Stage 2 by landing the `t2-03` review findings that belong to the core layer, before any UI is built on top of
them. Small, one layer, four items — created because the skill rule says more than two carried fixes need their own
slice instead of being stacked onto the next task.

## PM rulings this task implements

- `A46` **`spans` is required on the write API.** `CreateEntryOnPageInput.spans` loses its `?`, so a shipped caller
  that forgets the resolved spans fails to compile instead of silently skipping the overlap and duplicate checks
  (`t2-03` review remark 3: `src/core/entry-rules.ts:180-182` returns "allowed" when `spans` is absent, which makes
  spec AC24 observably false). `CreateAttempt.spans` **stays optional** so the pure rule gate remains unit-testable
  without a map; the spec gains the clause "every shipped create passes `spans` built from the same page read".

## AC (4 substantive + gates)

1. `createEntryOnPage` requires `spans` at the type level (`A46`); the spec (`docs/specs/inline-comment-model.md`,
   Flow 3) states the caller obligation in one sentence, and `tests/core-entry-store-write.spec.ts` gains the two
   missing end-to-end cases from `t2-03` review remark 4: a create whose candidate overlaps a hidden entry is refused
   with `overlap`, and a create at the 20-entry cap with spans still reports `page_limit` (precedence preserved).
2. `src/core/entry-overlap.ts` joins the shared `MODULES` purity scan in `tests/core-storage-port.spec.ts`
   (`t2-03` review remark 1; `t1-06` precedent `R6`) — one line, no second list allowed to drift.
3. Two spec clauses for the code that shipped in `t2-03` without them (`t2-03` review remark 2): the anchor window is
   taken at the boundaries of the **trimmed** span (`A27`), and an out-of-domain `contextWindow`/`fragments` refuses the
   anchor (`A28`, same stance as `A26`). Both must be greppable in `docs/specs/inline-comment-model.md` → Anchoring.
4. No behavior of the four existing `CreateBlockCode`s changes, and the six-step order stays
   name → selection → 256 → 20 → overlap → duplicate; `tests/core-entry-store-write.spec.ts:238` and `:875` still pass.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): `npm test` first to see the baseline → `A46` + the two tests → MODULES line → the two spec
clauses → all three gates → commit `feat(t2-04): required resolved spans and purity-scan coverage`. Commit as soon as
green; a committed green state with a short report is accepted, an uncommitted perfect one is not.

## Inputs the engineer reads

`docs/state/t2-03-review.md` (remarks 1–4 and the `t3-01` readiness paragraph with the exact
`CodePointRange` / `ResolvedEntryRanges` / `CandidateSpan` / `ResolvedSpans` shapes), `src/core/entry-store-write.ts`,
`src/core/entry-rules.ts`, `src/core/entry-overlap.ts`, `tests/core-storage-port.spec.ts`,
`tests/core-entry-store-write.spec.ts`, `docs/specs/inline-comment-model.md`.

## Explicitly out of scope

Anything in `src/content/` (the anchor-directory fixes are `t3-04-content-anchor-hardening`), UI, message strings
(`A47` lands with the message map in `t3-01-content-create-card`), storage layout, permissions, dependencies.

## Attempts log

- attempt 1 (`a3a5f33e`): **accepted on the first attempt** — the first task since `t1-04` that did not need a second
  pass, which is consistent with the slice being one-layer and 4 AC. Commit `c2cc64c` (4 files, +87/−15), tree clean,
  report copied to `docs/state/t2-04-engineer.md`. PM gates on the commit: `npm test` **398 passed**, `npm run build`
  self-contained `dist/`, `npm run typecheck` clean, checker `0 errors / 0 warnings / 19 INFO`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 2 (engineer ×1 + reviewer ×1 in flight).

## Verdicts

- engineer report: attempt 1, commit `c2cc64c`; copied to `docs/state/t2-04-engineer.md`.
- reviewer verdict: running (`7086c939`), range `c2cc64c^..c2cc64c`.

## Open questions

- `A46` is a PM default applied without an answer from the user; it is one `?` and one spec sentence to revert.
