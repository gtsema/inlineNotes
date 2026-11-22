# t17-09 — the sync arrows turn long enough to be seen

## The reader's report

«до сих пор не работает стрелочки синхронизации. Там можно сделать анимацию или ограничимся
цветом?»

## What was measured, in the reader's own Chrome

| Fact | Value |
|---|---|
| the sync button exists, with the glyph and the accessible name | `button.sync`, `aria-label="Синхронизировать"`, one `<svg>` |
| a press really syncs | one `POST /notes/page/{pageKey}` goes out |
| the `running` state lasts | **4 ms** (measured: class changes at 1 ms and back at 5 ms) |
| the animation rule is declared | `.sync--running svg { animation: 0.9s linear infinite sync-spin }` with a `@keyframes` 0deg → 360deg |
| the animation while running | `animation-duration: 0s` — the state ends before the first frame |

**So the animation was never broken.** One turn of a 0.9 s animation cannot be seen in 4 ms, and a
`POST` to a local server answers in about that time. The reader saw a button that appeared to do
nothing while it worked perfectly.

## The reader's choice

Option **A**: the arrows turn for a **minimum** time, so the press is visibly taken.

## Ruling A185 — a minimum spin, and it is CSS, not a timer

`A162` forbids a `setTimeout` in the popup layer, and it is right to: a timer would let the red
arrows turn green on their own, and the state would stop following the answer. The minimum is
therefore expressed **in the stylesheet**: the `running` rule plays **whole turns** of the same
animation and rests at 0deg, and the state still moves only when the answer arrives.

- `SYNC_TURN_MS = 900` — one turn, the animation's own period;
- `SYNC_SPIN_MS = 600` — the shortest spin a reader can read as "taken";
- `SYNC_SPIN_TURNS = ceil(600 / 900) = 1` — whole turns, so the arrows never stop at an angle;
- the rule is `animation: sync-spin 900ms linear 1`, with the two numbers as **literals**, because
  Angular resolves `@Component.styles` **statically** and an interpolated constant fails the build.

**What the spin states, honestly:** that the press was **accepted**, not that the request is still in
flight. On a fast server the request is already done, and the finished turn reads as "taken and
done" — which is what the reader asked the animation for. A **failure does not wait**: red is the
state that asks the reader to do something, and it appears as soon as the answer says so.

## The pins

- `tests/popup-window-look.spec.ts` reads the `running` rule and requires `sync-spin 900ms linear 1`,
  forbids `infinite`, and compares the two literals with `SYNC_TURN_MS` and `SYNC_SPIN_TURNS`, so the
  stylesheet and the constants cannot drift.
- `tests/popup-sync-button.spec.ts` keeps its ban on `setTimeout`, `setInterval` and `Date.now` in
  this layer — the pin that rejected the first attempt at this fix, and correctly: a timer-based
  minimum was tried first and removed.

## Gates

`npm run build` 0, `npm test` 0 — **1273 / 58**, `npm run typecheck` 0,
`node scripts/check-agent-config.mjs` 0 (207 info).

## Not verified

The visible turn was **not** observed: the extension in the reader's Chrome was still running the
previous build (the package Chrome serves and the one on disk differ by 12 bytes), so every
measurement above comes from the old bundle. **The reader must reload the extension** and confirm
that the arrows now turn.

## Process note

Every measurement in this task was taken against a **stale bundle**, and two earlier conclusions in
this stage were wrong for the same reason. Reloading the extension after a build is not a formality:
Chrome keeps serving the loaded copy until the card is refreshed, and no measurement taken before
that refresh describes the current code.
