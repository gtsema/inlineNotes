# Stage 26 — the tooltip confirms the pointer is on the painted pixels (A204)

Opened 2026-11-25 from the reader's report, measured on YouTrack: «заметка появляется при
наведении на всю строку… важно, чтобы слово было последнее в строке — только тогда
появляется и правее». Answers: 1. hovering another word → no; 2. hovering the empty tail
→ **only when the entry is the line's last word**; 3. the tooltip appears over the whole
line height.

## Root cause (proven from the code)

`hoverAt` names the entry with the caret test alone
(`src/content/overlay/tooltip-controller.tsx` -> `caretAt` then
`entryAtCaret`). The page's caret API answers the **nearest** caret for a point that is
over no text, so anywhere in a line's tail/height clamps to the line's last character.
`entryAtCaret`'s boundary pass (`hit.offset <= fragment.end`) then accepts that caret, and
the entry whose `end` is the line's end — the last word of the line — opens its tooltip
from anywhere on that line. A non-last word never matches, which is exactly what the
reader observed.

## Spec edits (PM, done)

`docs/specs/content-overlay-ui.md`: the `caret hit-test` term, Flow 3, the "Tooltip
hit-testing" rule (new ruling `A204`) and AC 30. The rule: the caret only **names the
candidate**; the hover point must also fall inside a client rect of one of the entry's
`text fragment`s, measured **at hover time** through the placement seam, one pixel of
tolerance. The painted `box` kept by the pass is still not used (stale after a scroll).

## Plan (2 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t26-01` | the hover-time rect confirmation in the controller + tests | `extension-engineer` |
| `t26-02` | focused review | `code-reviewer` |

## t26-01 brief

**Task.** A tooltip opens only when the hover point is on the entry's painted pixels.

**Input paths.** `docs/specs/content-overlay-ui.md` -> "Tooltip hit-testing" (the `A204`
paragraph) and AC 30; `src/content/overlay/tooltip-controller.tsx` (`hoverAt`,
`hoverAnchorOf`, the `rangeFor` option); `src/content/overlay/tooltip-hit-test.ts`
(`entryAtCaret`, unchanged); `src/content/capture/fragment-rect.ts` (`RangeForFragment`,
`MeasuredRange`, `documentRangeForFragment`); `src/content/paint/paint-plan.ts`
(`PaintedFragment`); `tests/content-tooltip.spec.ts`.

**Change.**
- After `entryAtCaret` names a candidate, require the point to be inside one of that
  entry's fragment rects: for each `PaintedFragment`, take `rangeFor(fragment.node,
  fragment.start, fragment.end)` **now** and test `getClientRects()` (a wrapped fragment
  has several rects; check each), or `getBoundingClientRect()` when the measured range
  offers no `getClientRects` — extend `MeasuredRange` with an **optional**
  `getClientRects?()` so the structural test seam keeps working and the real `Range`
  supplies the exact answer.
- Tolerance: one pixel, so the right half/edge of the last letter still opens the tooltip
  (the existing boundary tolerance of the caret test is unchanged).
- A `rangeFor` that throws means no hover (`A66` posture): hide, change nothing else.
- Nothing else changes: the caret test still names the entry, the interior-before-boundary
  order stays, the placement keeps using `placementFragmentBox`, the grace (`A194`) and the
  event wiring are untouched, and no box kept by the paint pass is used.

**Tests.** `tests/content-tooltip-pixel-guard.spec.ts` -> the `A204` describe (the pinned file; `tests/content-tooltip.spec.ts` keeps the pre-`A204` hover pins, made pixel-coherent): a fragment whose rects
exclude the point (the empty tail of the line) opens nothing even when the caret test
accepts it; a point inside the rect opens the tooltip; a point within one pixel of the
rect's right edge still opens it; a wrapped fragment accepts a point in any of its rects;
a thrown measurement opens nothing and keeps the previous state; the existing `A194`/hover
pins stay green.

**Constraints.** No change to `tooltip-hit-test.ts`'s caret rule, no new dependency, no
timer, no Russian string. Gates in order: `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs`. One commit:
`t26-01: the tooltip confirms the pointer is on the painted pixels (A204)`.
