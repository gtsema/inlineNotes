Confirmed: `scheduleHover` cancels then sets the timer; a coordinate-less dispatch returns early via `pointer === null` without cancelling, so the timer started by `pointerMove(400,400)` is still pending at `TOOLTIP_GRACE_MS - 1`. Claim 1 is honest.

I have all evidence. Since I have no write-capable tool, I return the complete artifact in my final response for the runtime to persist.

---

# t27-02 — review of commit `09558b4` (tooltip grace 150 ms, A205)

**Verdict: `accepted`**

Reviewed range: `1af0613..09558b4` (spec commit `1af0613`, code commit `09558b4`). Spec: `docs/specs/content-overlay-ui.md` → the `tooltip grace` Terms row (line 46) and the `A194` rule sentence (line 263). Brief: `docs/state/stage-27-tooltip-grace-150.md`. Report: `docs/state/t27-01-engineer.md`. Harness: `docs/specs/code-review-flow.md`.

## Acceptance criteria — one line each

1. **pass** — `TOOLTIP_GRACE_MS` is `150` in `src/content/overlay/tooltip-events.ts:48`; the doc sentence above it (`:44-46`) names ruling `A205` and the pre-`A205` value `300`; the source diff against `1af0613` touches only those 5 lines (`3 +`, `2 -`) — the two-phase pointermove answer (`scheduleHover` at `:81`, `onPointerMove` at `:88`) and every cancellation path (`cancelGrace` at `:76`, `Esc`/scroll/pointerdown/teardown) are byte-identical.
2. **pass** — spec line 46 (Terms row) reads "the 150 ms … (ruling `A194`, value set to 150 by ruling `A205`, `TOOLTIP_GRACE_MS`)"; spec line 263 (the `A194` rule sentence) reads "`TOOLTIP_GRACE_MS` (150 ms since ruling `A205`, the `tooltip grace` of the Terms row; the pre-`A205` number was 300)"; both agree with the constant. No surviving mention of `300` as the live value: `grep -n "300" docs/specs/content-overlay-ui.md` returns only line 90 (`z-index: 2147483000`, unrelated) and line 263's deliberate "pre-`A205` number was 300".
3. **pass** — `tests/content-tooltip.spec.ts:66` imports the constant; all three timer advances read it (`:531` `TOOLTIP_GRACE_MS - 1`, `:551` and `:571` `TOOLTIP_GRACE_MS`); no magic `300` remains in the `A194` describe (the only `300`s in the file are layout boxes at `:111` and `:957-961`). Claim "still open at `TOOLTIP_GRACE_MS - 1`" is honest and actually exercised: the coordinate-less `pointermove` dispatch at `:524` is ignored by `onPointerMove` (`pointerCoordinates` returns `null`, no cancel), so the timer set by `pointerMove(400, 400)` at `:521` is genuinely still pending when `:531` advances — `expect(tooltip.isOpen()).toBe(true)` at `:532` tests the grace. Claim "hidden at `TOOLTIP_GRACE_MS`" is honest: `:551` advances the full grace and `:552` asserts `false`. The cancellation case still asserts the press answers (`:571` advances the grace after `pressOnWidget()`, `:573` asserts `editor?.isOpen()` is `true`).
4. **pass** — no other behavior changed: `git diff 1af0613 09558b4` touches only `src/content/overlay/tooltip-events.ts` (5 lines), `tests/content-tooltip.spec.ts` (14 lines) and the report file; no `package.json`/`package-lock.json` delta (no new dependency); no new timer — the single `setTimeout` at `:82` is the pre-existing one, only its duration moved; no `fetch`/XHR/WebSocket added; no host-DOM mutation for painting; no spec/code conflict (spec and constant both say 150).
5. **pass** — gates re-run and quoted below.

## Carried-fix checklist

The brief carries none (`Carried-fix checklist: none` in effect — the stage brief `docs/state/stage-27-tooltip-grace-150.md` lists no carried fixes and no earlier review artifact to close). Nothing to answer.

## Gate output (re-run by the reviewer)

```
$ npm run build
[build] dist/service-worker.js (2579 bytes)
[build] dist/ is a self-contained MV3 folder (17 files)

$ npm test
Test Files  69 passed (69)
     Tests  1427 passed (1427)

$ npm run typecheck
> tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.background.json --noEmit && tsc -p tsconfig.spec.json --noEmit
(no diagnostics)

$ node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 258 info(s)
```

All four gates green; the checker reports `0 error(s)`, matching the engineer report's quote.

## Blocking findings

None.

## Non-blocking remarks

1. **`docs/specs/code-review-flow.md:46-50` (the `A69` split ruling)** — the spec edit landed in `1af0613` and the code in `09558b4`, i.e. two commits. The `A69` exception requires the brief to mandate the `A53` commit-early sequence and to name the spec file; this brief says "One commit" and "no spec prose edit (the PM owns it)" and does not name the spec file, so the exception's letter is not met. Recorded as a remark, not a finding, because the spec edit landed **before** the code commit (not in a later range), both commits are inside the reviewed range, and the brief explicitly reserves the spec for the PM — the failure mode `A69` guards against (a spec edited after the code, or not at all) did not occur. The PM may want to note the split in the state file.
2. **`src/content/overlay/tooltip-events.ts:81-86`** — the nested `scheduleHover` doc comment still describes the grace without naming `A205`, while the constant's comment at `:44-46` does. Cosmetic; the spec's rule sentence is the authority and is correct.
3. **`tests/content-tooltip.spec.ts:524-526`** — the coordinate-less `pointermove` dispatch is dead weight carried from the pre-`A205` test: its own comment admits it "has no coordinates and is ignored". Non-blocking; the case's real assertion is the new `:531-532`.

## Evidence path

- Commit: `09558b4` (`git show 09558b4`), parent `1af0613`.
- Source: `src/content/overlay/tooltip-events.ts:44-48`, `:76-95`.
- Tests: `tests/content-tooltip.spec.ts:66`, `:509-578`.
- Spec: `docs/specs/content-overlay-ui.md:46`, `:263`.
- Brief: `docs/state/stage-27-tooltip-grace-150.md`. Report: `docs/state/t27-01-engineer.md`.
- Gate re-runs: `npm run build`, `npm test`, `npm run typecheck`, `node scripts/check-agent-config.mjs` — all green.

**Verdict: `accepted`.**