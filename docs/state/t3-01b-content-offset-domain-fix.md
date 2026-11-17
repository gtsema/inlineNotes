# t3-01b-content-offset-domain-fix

A fix slice for the single blocking finding of `t3-01-content-create-card` plus the three small rulings its review
produced. Created instead of a third engineer attempt on the parent task, per the user's choice (2026-11-16) and the
`A48` precedent: review findings that do not fit the closed task get their own slice.

## Goal

Stop the capture path from mixing the two offset domains, so a note never loses characters and never fails to open
because of something the reader selected far above the article.

## Parent task and evidence

- Parent: `docs/state/t3-01-content-create-card.md` (verdict `changes requested`).
- Finding and its evidence: `docs/state/t3-01-content-create-card-review.md` → Blocking findings 1.
- Offending code: `src/content/capture/selection-span.ts:186-198` (`trimStreamRange` probes `streamText.charAt(begin)`
  and `charAt(finish - 1)` with **code-point** offsets), reached from `:73, 92, 96`. The doc-comment at `:180-185`
  claims the opposite of what the code does and must be rewritten, not kept.

## User-confirmed rulings this slice implements

- `A64` (confirmed 2026-11-16): if measuring the selection throws because the page shrank the text node during the
  settle delay, the card **closes**. No card without coordinates.
- `A65` (confirmed 2026-11-16): a zero-area fragment box does not participate in placement; when **every** box is
  zero-area, placement uses the viewport rule instead of the top-left gutter.
- `A63` (PM, this slice): the settle delay value is pinned in the spec and asserted against the constant, like the 8 px
  gutter and the 240-code-point warning threshold already are.

## AC (5, one of them a bundle of two small ones)

1. **The trim lives in the code-point domain.** `trimStreamRange` (or its replacement) never indexes the stream with a
   raw UTF-16 offset: it steps separators through code points. End-to-end assertion for a stream that contains an
   astral code point **before** the selection:
   `sliceCodePoints(stream.text, candidate.start, candidate.end) === anchor.text === normalizeText(selectedText)`.
   The doc-comment is corrected in the same commit.
2. **Regression fixtures that would have failed before.** At minimum: an astral character before a multi-word selection
   (text no longer loses its first character); an astral character before a **one-word** selection (the card opens — this
   is the case that used to degenerate the range and return `null` / `selection_lost`); and a re-selection of the same
   text on such a page answers **`duplicate`**, not `overlap` (`A23`).
3. `A64`: the measurement-failure path closes the card; the overlay spec gets the Edge Case line; a test drives the throw
   and asserts no mounted-but-unpositioned card and no storage write.
4. `A65`: zero-area fragment boxes are ignored by placement; the all-zero case uses the viewport rule. Tests for both.
5. `A63`: `SELECTION_SETTLE_MS` (or its renamed constant) is named in the spec Terms with its value, and the test
   asserts the constant equals the pinned value instead of merely `> 0`.

Gates green and quoted, in the `A62` order: `npm run build`, `npm test`, `node scripts/check-agent-config.mjs`.

Work order (`A53`): fix + tests → gates → **commit 1** `fix(t3-01b): trim the selection span in the code-point domain` →
spec lines (`A63`–`A65`, the Edge Case for measurement failure) → gates → **commit 2**
`docs(t3-01b): settle delay, measurement failure and zero-area fragment rules`.

## Inputs the engineer reads

`docs/state/t3-01-content-create-card-review.md` (blocking finding 1 + remarks 1–3),
`src/content/capture/selection-span.ts`, `src/content/capture/fragment-rect.ts`,
`src/content/overlay/card-events.ts`, `src/content/overlay/card-placement.ts`,
`src/core/text-normalize.ts` (`sliceCodePoints`, `codePointOffsetAt`), `tests/content-selection-capture.spec.ts`,
`docs/specs/content-overlay-ui.md` (Terms row `settle delay`, Edge Cases), `docs/specs/inline-comment-model.md`
("Anchor domains" rule).

## Explicitly out of scope

Painting and tooltip (`t3-02`), the editor (`t3-03`), popup/options, `storage.onChanged`/SPA refresh, any `src/core/`
change (the core offset helpers are correct; report, do not fix), the keyboard-focus remark 4 and the `A29`
mutate-between-open-and-save coverage gap of remark 5 — both carried to `t3-02` where the paint pass reuses the same
measurement, manifest, dependencies, `.pi/`, `docs/project-profile.md`, `docs/state/*`.

## Attempts log

- attempt 1 (`67e2ea5e`): delivered in two commits as ordered — `ec4ee45` (9 files, +739/−55) and `e1f0f94`
  (3 files, +45/−10). Tree clean. PM gates on `e1f0f94` in the `A62` order: build green (self-contained `dist/`,
  10 files), `npm test` **548 passed**, checker `0 / 0 / 28 INFO`, `npm run typecheck` clean.
  Shape of the fix: `trimStreamRange` crosses the offset domain once in each direction with the existing core helpers
  (`utf16IndexAt` out, `codePointOffsetAt` back), no new model, no `src/core/` change; the false doc-comment was
  rewritten. `firstFragmentBox` became `placementFragmentBox` (skips zero-area boxes, `A65`) and `fragmentBox` is
  exported as the one measurement seam the paint pass must reuse; the anchor box is now measured **before** anything is
  mounted, with "threw" and "no box" kept as distinct answers (`A64`); `placeCardInViewport` reuses `placeCard` rather
  than adding a second placement model.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 2 (engineer ×1 + reviewer ×1 in flight).

## Verdicts

- engineer report: copied to `docs/state/t3-01b-engineer.md`.
- reviewer verdict: **accepted** (`edd47b33`), AC1–AC5 all `pass`, no blocking finding, seven non-blocking remarks;
  copied to `docs/state/t3-01b-review.md`. Test census delta `523 → 548` (+25) accounted file by file.

## PM rulings on the review remarks

- `A64` **reworded** (residual risk 2, the engineer's open question 1): the shipped behavior is **the card never opens**
  (the anchor box is measured before anything is mounted), not "opens then closes". The spec already matches the code;
  the ledger wording did not, and a future reader would have called compliant code non-compliant.
- `A66` (remark 3): in the **paint pass** a measurement throw is per entry — no highlight, no frame, no tooltip, the same
  observable state as `anchor_stale` (`A40`) — and the `catch` must wrap only that entry's measurement, never the whole
  pass: it must not remove another entry's highlights and must never touch storage. The `catch {}` shape in
  `create-card-controller.tsx:208-213` is not a template to copy.
- `A67` (readiness, an assumption without an answer): a zero-area fragment box gives the tooltip nothing to anchor to.
  The tooltip anchors to the **first fragment that has an area** (the walk `placementFragmentBox` already performs, to be
  exported for that purpose); when no fragment has an area, **no tooltip** — the entry stays listed in the popup and stays
  deletable. One sentence in the overlay spec, reversible.
- `A68` (readiness, open item from the parent review): the paint pass owns `CSS.highlights` exclusively and card
  visibility never clears it. `close()` hides the host, so without an aggregate visibility owner every card close would
  flicker the highlights.
- Remark 1 (`selection-span.ts:207-209`: "an inverted range stays inverted" — `Math.max` at `:213` makes it degenerate,
  and `:85` answers `null`) is **accepted debt**: one clause, fixed in the next commit that touches that file. This
  module's previous blocking finding was exactly a comment that asserted what the code did not do, so it is named here
  rather than left in a remark list.
- Remark 2 (the mechanical pin is name-based and vanishes if the parameter is renamed) and remark 7 (`hasArea` treats a
  negative dimension as no area, untested) are **accepted**: the behavioral fixtures are the proof, the pin is a tripwire.
- Remark 4 (the second `A63` case is wall-clock sensitive with a 40 ms margin) is **accepted debt**: fake timers in the
  next commit that touches `tests/content-card-events.spec.ts`.
- Remark 5 (the engineer report's per-file counts are internally inconsistent — `+30` by file vs the exact `+25` total,
  and the handoff names `src/content/overlay/fragment-rect.ts` where the shipped path is `src/content/capture/fragment-
  rect.ts`): transcription, the totals and after-figures are exact. Recorded here instead of editing the engineer's
  artifact.
- Remark 6 (behavior in `ec4ee45`, spec in `e1f0f94`) became rule `A69` in `docs/specs/code-review-flow.md`: the `A53`
  two-commit sequence satisfies the same-commit rule for the task as a whole when both commits are inside the reviewed
  range and the brief names the spec file.

## Open questions

- None observable. `A63`–`A65` are settled (`A64`/`A65` by the user, 2026-11-16).
