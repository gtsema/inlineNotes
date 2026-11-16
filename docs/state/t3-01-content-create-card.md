# t3-01-content-create-card

## Goal

The first page-side slice of Stage 3: a shadow-DOM host, selection capture, and the **create card** — the counter, the
disabled Save button, the save call into core, and the refusal messages. No painting yet (`t3-02`), no editor (`t3-03`).

## PM rulings this task implements

- `A6` (already issued): the shadow root mode stays **open** for v1, for dev-tool inspectability during the manual
  verification loop.
- `A30` **Card placement.** The card is positioned in viewport coordinates next to the bounding rect of the **first
  resolved fragment** of the selection, below it when there is room, above otherwise, clamped to the viewport with an
  8 px gutter. It never scrolls with the page while open: it is closed on scroll (ruling `A32`).
- `A31` **Settings read moves here.** Ruling `A15` assigned the `settings:v1` decode guard to `t4-02`, but the content
  script cannot create an entry without the current author name. Corrected: `t3-01` owns the core read
  `loadSettings(port)` plus its decode guard (`name: string`, empty means "not set"); `t4-02` keeps only the options
  UI and the write. This closes the gap instead of faking a name.
- `A32` **A card that is open is closed, not repositioned, on page scroll or on a selection change elsewhere.** A
  half-kept card over moved text is worse than a closed one; the note is not lost because nothing was typed yet.
- `A33` **One message map per UI layer.** Refusal codes from core map to Russian strings in exactly one constants
  module in `src/content/`; no inline literals at call sites (architecture rule "all user-visible strings live in one
  constants module per UI layer").

## AC (5 substantive + gates)

1. Exactly **one** host element exists per document, appended once, with an `open` shadow root; every style lives
   inside the shadow root and is explicit about `font-family`, `line-height`, `box-sizing` and `color` so a host page
   with a global CSS reset still renders correctly (overlay AC11). A test asserts the host is created once even when
   the capture path runs twice.
2. Selection capture feeds the core anchor API correctly: it builds the stream once per capture, hands `buildAnchor`
   the offsets **of the trimmed span** and the real fragment count (the `t2-02` contract), and does not create
   anything for a whitespace-only or empty selection (model Flow 3 step 2).
3. The card shows a `N/256` counter counted in **code points**, `Сохранить` is disabled while the comment is empty or
   whitespace-only, and input beyond 256 code points is impossible — the counter never exceeds `256/256`
   (overlay AC1, AC9).
4. `Сохранить` calls core `createEntryOnPage` and nothing else; no content code touches `chrome.storage` directly,
   uses `writeSlotThenIndex`, or builds a slot value (the `t2-01` review remark `R6` boundary test lands here).
5. Refusal mapping (overlay AC6 text + model AC9/AC10): `name_required` → `Укажите имя в настройках` and, when
   `loadSettings` reports no name, **no card opens at all**; `comment_too_long` → the limit message; `page_limit` →
   the 20-entry message; `overlap` → `Выделение пересекается с существующей записью` (the code exists from `t2-03`).
   A create that returns `entry_invalid` is reported as a bug-level message, not silently swallowed.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): host + card module + tests → `npm test` early → spec lines (`docs/specs/content-overlay-ui.md`:
placement, close-on-scroll, the settings read, the message map) → gates → commit `feat(t3-01): selection capture and create card`.
Commit as soon as green; a committed green state with a short report is accepted, an uncommitted perfect one is not.

## Inputs the engineer reads

`docs/state/t2-02-review.md` (its `t3-01` readiness paragraph and residual risks — this brief will quote them when the
review lands), `docs/specs/content-overlay-ui.md` (Flow, Rules, Edge Cases, AC1/AC6/AC9/AC10/AC11),
`docs/specs/inline-comment-model.md` (Flow 3, caps, authorship), `docs/state/t3-01-content-create-card.md`,
`src/content/anchor/`, `src/core/anchor-build.ts`, `src/core/entry-store-write.ts`,
`.pi/skills/chrome-mv3-extension-ts/SKILL.md`.

## Explicitly out of scope

CSS Highlight painting and tooltips (`t3-02`), the editor and delete (`t3-03`), popup and options UI (Stage 4),
SPA URL watching and `storage.onChanged` (`t4-03`), iframes.

## Attempts log

- attempt 1: brief prepared; delegated after Stage 2 acceptance.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A30`/`A31`/`A32`/`A33` are PM defaults applied without an answer from the user; each is one function or one constant
  to change if the user prefers differently.
- Whether the card closes on `Esc` — yes, same as `Отмена` (overlay AC4 owns the editor's `Esc`, the card gets the same
  affordance for consistency). Recorded as an assumption.
