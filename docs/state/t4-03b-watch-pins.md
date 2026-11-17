# t4-03b-watch-pins

## Goal

Close the three review remarks the accepted `t4-03` left open: two spec sentences that have **no test behind them**, and one
code comment that promises more than the code guarantees. Test-only plus one comment reword; no behavior change.

Opened by the PM after the `t4-03` acceptance (`docs/state/t4-03-review.md` → "Non-blocking remarks" 2, 4, 5). A separate
small slice instead of a stack-on, because `t4-04` already carries three items (R2–R4) and the budget rule says a review with
more than two carried fixes gets its own slice.

## AC (3 substantive + gates)

1. **Pin the absence of the triggers the spec rules out.** `docs/specs/content-overlay-ui.md` says `pagehide` / `pageshow`
   are deliberately not triggers and that neither watch is ever torn down; `tests/content-spa-refresh.spec.ts:590-599` pins
   one interval and the two address listeners but not the **absence of any other listener**. Extend the pin so a future
   `pagehide`/`pageshow` (or any extra event) added to `src/content/refresh/url-change-watch.ts` fails a test. Prove the pin
   is load-bearing by naming what a mutation breaks.
2. **Pin the `null` half of `PagePainter.pageKeyOfPass()`.** `src/content/paint/page-painter.ts:196,208` answer `null` before
   any pass and after an early-failing pass; nothing pins it, so the end-to-end rule "with no page key yet, only
   `settings:v1` moves me" is untested even though the core branch it feeds is covered
   (`tests/core-storage-keys.spec.ts:200-202`). Add the pin.
3. **Reword one overstated comment.** `src/core/storage-keys.ts:67-68` calls `storageChangeConcernsPage` "pure and total",
   but a lone-surrogate `pageKey` still throws through `entryStorageKey` → `slotKeyFor` → `escapeCodePoint`; that input is
   declared out of scope by `src/core/slot-key.ts:34-36`. Name the boundary in the comment. **No new guard, no behavior
   change** — adding one would be a core rule change and needs a ruling.

Gates green and quoted in the `A62` order: `npm run build`, then `npm test`, then `node scripts/check-agent-config.mjs`.

## Explicitly out of scope

Any throttle, queue or merge in the watches (that would violate `A60`/`A88` and needs a ruling, not a patch); `src/manifest.json`;
any change to a core rule; the popup, options, README; the browser verification list (`t4-04`).

## Attempts log

- attempt 1: not started. Card opened by the `t4-03` acceptance.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## PM work already done for this task

- Remarks 1 and 3 of the `t4-03` review were closed by the PM as single-clause spec edits in `docs/specs/content-overlay-ui.md`
  (the "never torn down" clause; the `pages:v1` consequence of `A88`). Checker after the edit: 0 errors / 0 warnings / 86 INFO.
- Remarks 6 (CF1 pins depend on the popup's inline template) and 7 (spec lines landed in a separate commit, `A69` exception)
  are accepted as known shape, not work.

## Open questions

- None. If the engineer believes the surrogate case deserves a real guard rather than a comment, escalate instead of adding it.
