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

- attempt 1: brief prepared; delegated immediately (parent task is blocked on this slice).

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- None observable. `A63`–`A65` are settled (`A64`/`A65` by the user, 2026-11-16).
