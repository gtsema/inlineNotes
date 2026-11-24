# t27-01 — the tooltip grace is 150 ms (A205) — PM takeover report

Task: `docs/state/stage-27-tooltip-grace-150.md` -> "t27-01 brief".

## What happened

The delegated `extension-engineer` run `77e2dc26` **hung**: 20 minutes without activity,
and the queued steer was never delivered. The PM interrupted it
(`subagent({ action: 'interrupt' })`). Its on-disk edits were already the intended change,
so the PM finished the slice (user-visible stall; same takeover posture the user approved
for `t19-01`).

## Changed paths

- `src/content/overlay/tooltip-events.ts` — `TOOLTIP_GRACE_MS` 300 → **150**, and the
  doc sentence names ruling `A205` and the pre-`A205` value. Nothing else in the module
  changed: the two-phase pointermove answer and every cancellation path are untouched.
- `tests/content-tooltip.spec.ts` — the three `A194` timer advances now read
  `TOOLTIP_GRACE_MS` instead of the magic `300`, and the "keeps an open tooltip through
  the grace" case now asserts the tooltip is **still open at `TOOLTIP_GRACE_MS - 1`**
  (the half the old test only claimed in its title).

Spec (PM, already committed in `1af0613`): `docs/specs/content-overlay-ui.md` -> the
`tooltip grace` Terms row and the `A194` rule sentence, both 150 with `A205` named.

## Commands run (in the briefed order)

1. `npx vitest run tests/content-tooltip.spec.ts tests/content-tooltip-pixel-guard.spec.ts`
   — passed: 2 files, **51 tests**.
2. `npm run build` — passed: `dist/ is a self-contained MV3 folder (17 files)`.
3. `npm test` — passed: 69 files, **1427 tests**.
4. `npm run typecheck` — passed: four projects, no diagnostics.
5. `node scripts/check-agent-config.mjs` — passed: `0 error(s), 0 warning(s), 258 info(s)`.

## AC self-check

- "`TOOLTIP_GRACE_MS` becomes 150, sentence updated" — done (`:48`).
- "the A194 timer advances read the constant" — done (three sites).
- "still open before the grace, hidden after it" — done (`TOOLTIP_GRACE_MS - 1` open;
  the sibling case advances `TOOLTIP_GRACE_MS` and expects hidden).
- "no other file, no spec prose edit by the worker" — held; the spec was the PM's.
- Gates green, in order.

## Open

Review `t27-02` (focused) is owed before acceptance.
