# t17-10 — the spin is not visible, and why the two attempts failed

## The reader's report

«не крутятся» — after the extension was reloaded, with the new bundle confirmed in the browser
(`linear 1` / `onSpinEnd` present in the served `popup/main.js`).

## What was measured, in the reader's own Chrome

| Fact | Value |
|---|---|
| the animation rule reaches the browser | yes: `animation: sync-spin 0.9s linear infinite` |
| forcing the class by hand | the animation is live: `0.9s`, `play-state: running` |
| a real press, sampled every 30 ms for 1.2 s | the class is `sync` at **every** sample — the running modifier is never seen |
| the document | `document.hidden: true`, `visibilityState: "hidden"` |
| a control timer, idle, in that same tab | 2 fires per second where 50 are expected |

**The tab the PM can measure is hidden, and Chrome throttles timers and does not play animations in
a hidden tab.** Every animation measurement taken there is worthless: the control measurement shows
the browser refusing to run a plain `setInterval` at its period.

## What was tried, and how each failed

1. **A `setTimeout` that held the state for a minimum.** Rejected by the shipped pin
   (`tests/popup-sync-button.spec.ts` forbids `setTimeout` in this layer), and the pin is right: a
   timer would let the red arrows turn green on their own, so the state would stop following the
   answer.
2. **Whole turns in CSS (`animation: sync-spin 900ms linear 1`).** Built and shipped. It does not
   help, and the reason is the one measured above: the class is removed when the answer arrives —
   about 4 ms — so the animation is cut off before its first frame. The turn count says how many
   turns to play, not how long the class stays.
3. **Ending the state on the animation's own `animationend`.** Built, and it **hung the button**:
   the class stayed on the running modifier forever, because a hidden tab never plays the animation
   and the event therefore never arrives. Reverted in this commit.

## What ships now

The state is driven by the answer alone, as `A162` says: `running` while the request is in flight,
`idle` or `error` when it answers. The animation is **decoration** — nothing in the stylesheet may
end the state — and the pin now asserts that no animation event appears in the template.

**Consequence, stated plainly: on a local server the arrows will not be seen turning.** The request
answers in about 4 ms and the state is honest about it. The arrows still turn on a server slow enough
to be seen, and the red state on failure is unaffected.

## The options left to the reader

- **Accept it.** The button's colour and its red failure state carry the feedback; the spin is a
  detail of a fast path. This is what ships now.
- **A minimum spin with a timer.** It works visually and it is what the reader originally asked for
  («покрутились и остановились»), but it needs `A162` **amended**: the timer would be a second source
  of truth for the state, and the amendment has to say that the spin means "the press was taken"
  rather than "the request is running".
- **A minimum spin without a timer**, if a mechanism exists that a hidden tab still runs. The two
  candidates are a CSS `transition` on a property the class change triggers, and a Web Animations
  `finished` promise — the second is the same trap as `animationend`, so it would have to be tested
  in a **visible** tab before being believed.

**The PM cannot test either in the reader's Chrome**: the popup CDP can open is a tab, and every tab
he can reach is hidden. A visible-tab measurement needs the reader.

## Gates

`npm run build` 0, `npm test` 0 — **1273 / 58**, `npm run typecheck` 0,
`node scripts/check-agent-config.mjs` 0 (207 info).

---

## Closed: the minimum spin ships, with a timer that cannot decide the outcome

The reader's objection settled it: «Сейчас при нажатии пользователь вообще не понимает происходит
что-то или нет». Feedback is not a detail — it is the whole point of the button.

**Why a timer is allowed here and was not before.** `A162` forbids a timer in this layer because a
timer that decided the outcome would let the red arrows turn green on their own. The shipped timer
cannot: it starts **after** a success has been read and only delays the return to green, while the
failure path returns **before** the timer is reached. `A185` narrows the ban to that one use instead
of lifting it.

**The pin was rewritten, not deleted.** It now asserts:
- the service — the half that owns the request — still has **no clock at all**;
- the component has exactly **one** `setTimeout` and at most two clock reads;
- the `error` branch is ordered **before** the timer in the shipped text, so red can never be held
  behind the spin.

**Verified in the reader's Chrome:**

| Press | Class sequence |
|---|---|
| server up | `sync--running` for about a second, then `sync` |
| server stopped | `sync--error`, and it stays |

## The three rejected attempts, kept as the record

1. `setTimeout` deciding the outcome — the forbidden design, and the pin rejected the first attempt.
2. Whole turns in CSS (`900ms linear 1`) — shipped and useless: a turn count says how many turns to
   play, not how long the class stays, and the class was removed by the answer after 4 ms.
3. Ending the state on `animationend` — **hung the button forever**: a hidden tab does not play
   animations, so the event never arrived. Reverted.
