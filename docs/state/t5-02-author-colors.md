# Task `t5-02-author-colors` — every author paints in their own color

Stage 5, task 2 (after `t5-01`). Owner: `extension-engineer`. Ruling: `A94` (`docs/state/improvement-backlog.md`), with the
shape decision `A102` below. Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` (Highlight painting).

## Goal

Today every entry gets its own `::highlight()` name (`inlinenotes-<entryId>`, ruling `A70`) but **all** of them receive the same
declarations — one blue (`src/content/paint/paint-style.ts:56`). The user wants the color to identify the author.

## Shape the PM chose (`A102` — do not redesign it)

- A palette of **exactly 6** declaration sets lives in a new paint-layer module `src/content/paint/paint-palette.ts`. Slot 0 is
  the current color, verbatim (`rgba(122, 162, 247, 0.26)`), so an unchanged page can look unchanged; five more distinguishable
  pastel backgrounds follow. All six keep the existing property set (`background-color`, `text-decoration` — the properties the
  Highlight API actually honors, see the header of `paint-style.ts`).
- The slot index is **`fnv1a32(authorName) % 6`**, reusing the shipped `fnv1a32` exported by `src/core/slot-key.ts:117`. Content
  importing core is the allowed direction, so no new core module and no core change. Deterministic: same author → same slot on
  every page and after every reload. Two different authors landing on one slot is an accepted collision (`A94`) — say so in the
  spec instead of pretending names get unique colors.
- `paint-plan.ts` attaches the slot to what it already knows (the entry's `authorName`); `paint-style.ts` emits the rule for
  `inlinenotes-<entryId>` with the declarations **of that slot**. One rule per painted entry stays as it is (`A70`); only the
  declarations vary.
- Own notes get **no** extra visual marker (`A94`): the tooltip header already says «Вы», the popup already marks ownership.

## Acceptance criteria (observable)

1. Two entries of the same author on one page → the same palette slot, therefore the same color in their two rules.
2. Two entries of different authors → the slots of their own names; when the two names collide in the palette the color is
   shared, and a test pins that a collision is possible and harmless.
3. The mapping is a pure function of the author name — pinned with literal expected slots for a few names, so a rename of the
   palette function cannot silently reshuffle everyone's color.
4. The palette has exactly six slots and slot 0 is the current color verbatim.
5. The stylesheet still carries one rule per painted entry name, all names still `inlinenotes-<entryId>`, and the number of
   rules does not grow with the palette.
6. Hidden entries paint nothing (`A22`), stale entries paint nothing (`A24`) — unchanged behavior and their pins stay green.
7. Teardown still removes **only** `inlinenotes-`-prefixed names (`A39`) and the sheet is reset the same way.
8. Overlapping ranges of different authors both get registered (no rejection at paint time) — the blend the Highlight API
   produces is accepted (`A94`); the overlap rule itself is `t5-01`'s, do not touch it.
9. No new Russian UI string; `src/content/text.ts`, the popup and the options are untouched.

## Boundaries

- Allowed: `src/content/paint/**`, `tests/` (paint suites), `docs/specs/content-overlay-ui.md`.
- Forbidden: everything under `src/core/` (import `fnv1a32`, do not edit it), `src/content/create/`, `src/content/editor/`,
  `src/content/overlay/`, `src/popup/`, `src/options/`, `src/manifest.json`, dependencies, harness files.
- The other PM-owned specs are out of scope (`A76`, `A89`). Do not touch the task state file
  `docs/state/t5-02-author-colors.md`; write your report to your own artifact.

## Carried-fix checklist

None — the one carried item from `t5-01`'s review (a half-true clause in `inline-comment-model.md:82`) was closed by the PM.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec first (painting section, cite `A94`/`A102`), commit at green.
2. Palette + plan + style + tests, commit at green.
3. Report every gate with its own exit status: `npm run build; echo "exit=$?"`, `npm test -- --reporter=basic; echo "exit=$?"`,
   `node scripts/check-agent-config.mjs; echo "exit=$?"`, `npm run typecheck; echo "exit=$?"` — **`echo` right after the
   command, never after a pipe**: a pipe reports the last command's status, which is how a red typecheck looked green in
   `t5-01`. Quote tails only, never a full test log.
4. Report: commit hashes, the four exit statuses, and the nine AC numbers one per line with `path:line`.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: **2** — engineer, reviewer.

## Attempts log

- **attempt 1 delivered**: `c43f64d` (spec), `31f2a2f` (palette + plan + style + page painter + 26 tests). No escalation, no
  gate repair — the `A101` exit-status rule from `t5-01` worked: the engineer reported four exit statuses and all four were 0,
  which the PM reproduced personally.
- PM gates on the delivered tree: build exit 0 (`dist/` 10 files), `npm test` exit 0 → **833 passed / 42 files**, checker exit 0
  → 0/0/101 INFO, `npm run typecheck` exit 0. Working tree clean apart from the PM's own artifacts.
- reviewer verdict: **accepted**, 0 blocking findings, 3 carried fixes, 4 remarks (`docs/state/t5-02-review.md`). 9/9 AC pass;
  read-only corroboration 42 spec files, 833 declarations, 0 skip/only, per-file deltas summing to +26.
- **Carried items disposition.** Item 1 (AC25 said "an unchanged page looks unchanged" — half-true for an author in slot 1–5) is
  **closed by the PM** in the same wording family the Rules bullet already uses. Items 2 and 3 (a dead comment pointer out of
  `paint-style.ts`; `src/core/slot-key.ts:115` claiming `fnv1a32` is used only for slot-key disambiguation) are **comment-only**
  and are carried into `t5-03` under an `A90`-style named exception, because core was forbidden in `t5-02` and a separate
  comment-only task would cost two children for three sentences.
- **task status: accepted.**
