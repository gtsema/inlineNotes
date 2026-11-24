# Stage 27 — the tooltip grace becomes 150 ms (A205)

Opened 2026-11-25 by the reader: «уменьшить время отображения окна подсказки после
убирания фокуса мыши. Сейчас сколько?» — answer: 300 ms (`TOOLTIP_GRACE_MS`, ruling
`A194`). The reader chose **150 ms**.

## Why 150 and not 0

The grace exists because the tooltip is placed beside the span with a gap: an instant hide
made the box unreachable, which the reader measured before `A194`. 150 ms keeps that path
reachable while halving how long the box lingers after the pointer has left.

## Spec edits (PM, done)

`docs/specs/content-overlay-ui.md`: the `tooltip grace` Terms row (300 → 150, ruling
`A205`) and the `A194` rule sentence (same value, with the pre-`A205` number named).

## Plan (2 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t27-01` | the constant and the `A194` test pins | `extension-engineer` |
| `t27-02` | focused review | `code-reviewer` |

## t27-01 brief

**Task.** `TOOLTIP_GRACE_MS` becomes `150`.

**Change.** `src/content/overlay/tooltip-events.ts`: the constant's value and the sentence
around it. Nothing else in the module changes: the two-phase pointermove answer, the
cancellation on a widget move / press / `Esc` / scroll / teardown all stay.

**Tests.** `tests/content-tooltip.spec.ts` -> the `A194` describe: make the three cases
that advance timers read the constant instead of the magic `300`, so the pin moves with
the value, and keep their two claims honest: the tooltip is still open **before** the grace
expires (advance `TOOLTIP_GRACE_MS - 1`) and hidden **after** it (advance
`TOOLTIP_GRACE_MS`); the cancellation cases keep asserting that the press answers.
If a test pinned the literal `300`, replacing it with the constant is the whole edit.

**Constraints.** No other file; no spec prose edit (the PM owns it; report a conflict).
Gates in order: `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs`. One commit:
`t27-01: the tooltip grace is 150 ms (A205)`.

## Outcome

- `t27-01` (commit `09558b4`): `TOOLTIP_GRACE_MS` = 150; the `A194` advances read the
  constant and the "through the grace" case asserts open at `TOOLTIP_GRACE_MS - 1`.
  The delegated engineer run `77e2dc26` hung (20 min, steer undelivered); interrupted,
  its on-disk edits kept, the PM finished the test and ran the gates (report:
  `docs/state/t27-01-engineer.md`). Gates: build 17 files, `npm test` 1427, typecheck,
  checker 0 errors.
- `t27-02` (`code-reviewer`, run `f7d890b7`): **accepted**, no blocking finding; spec and
  constant agree. Report: `docs/state/t27-02-review.md`.
- Stage 27 closed. `dist/` rebuilt and pushed (`09558b4`).
