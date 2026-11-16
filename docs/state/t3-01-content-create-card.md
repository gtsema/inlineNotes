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
- `A31` **Settings read lives in `t3-01-settings-read-core`.** Ruling `A15` assigned the `settings:v1` decode guard to
  `t4-02`, but the content script cannot create an entry without the current author name. Corrected: the core read
  `loadSettings(port)` plus its decode guard is its own task; `t4-02` keeps only the options UI and the write. This
  task consumes that API; it must not read `settings:v1` itself.
- `A32` **A card that is open is closed, not repositioned, on page scroll or on a selection change elsewhere.** A
  half-kept card over moved text is worse than a closed one; the note is not lost because nothing was typed yet.
- `A33` **One message map per UI layer.** Refusal codes from core map to Russian strings in exactly one constants
  module in `src/content/`; no inline literals at call sites (architecture rule "all user-visible strings live in one
  constants module per UI layer").

## Contract handed over by `t2-02` (from `docs/state/t2-02-review.md` → `t3-01` readiness)

- Build the stream **once per capture** with `buildTextStream(root)`, `root` at or above the selection's common
  ancestor; hand `buildAnchor` that same `stream.text` with half-open **code-point** offsets of the **trimmed** span.
- Derive every boundary offset through the fragment that contains it: find the `TextFragment` holding the boundary,
  convert the local UTF-16 offset with `nodeCodePointIndex(node.data)`, add `streamStart`; a local offset inside an
  internal whitespace run snaps to that run's `starts` entry (one stream code point can cover several node units).
- Never use `range.toString()`, `Range` offsets or `indexOf` results as anchor offsets. `options.fragments` is the real
  fragment count of the span — a stored hint only.
- `entry.text` must equal `anchor.text` and be the normalized slice of that stream, or `createEntryOnPage` refuses with
  `entry_invalid`; `buildAnchor` returns `null` for a degenerate span, so a whitespace-only selection must never reach it.
- Read back with `locateAnchor(root, anchor)`: `start`/`end` are UTF-16 offsets inside `node.data` and are the only
  numbers fit for `Range.setStart`/`setEnd`; `streamStart`/`streamEnd` are code points and must never be handed to a
  `Range`.
- Residual risk 4 of that review is now user-visible: repeated text with an unmatched window anchors to the first
  document-order copy, so a saved note can paint somewhere else on the page with no signal. Accepted v1 limitation,
  recorded in the state file and in the spec's Edge Cases.

## Carried fixes moved out (ruling `A34` follow-up + the slice-budget rule)

The `t2-02` review fixes that live in `src/content/anchor/` (`A36`, `A35`, `N2`, `N3`, `N4`, `N5`) are **not** part of
this task — they land first in `docs/state/t3-04-content-anchor-hardening.md`. The `t2-03` review fixes that live in
`src/core/` (`A46`, purity-scan line, the `A27`/`A28` spec clauses, the write-API spans tests) land in
`docs/state/t2-04-core-create-hardening.md`. This task starts from a tree where both are already accepted.

## Contract handed over by `t2-03` (`docs/state/t2-03-review.md` → `t3-01` readiness)

```ts
interface CodePointRange { start: number; end: number }             // half-open, CODE POINTS
 type ResolvedEntryRanges = ReadonlyMap<string, CodePointRange>;    // key = stored Entry.id; stale = absent
interface ResolvedSpans  { candidate: CodePointRange; byEntryId: ResolvedEntryRanges }
```

- **Always pass `spans`** to `createEntryOnPage` — after `A46` the compiler enforces it, and a half-populated
  `byEntryId` reads as "all entries stale" (`A24`), not as an error (residual risk 1).
- The map must be keyed by the **stored ids of the same page read the write performs**; a map built from a different
  page key is indistinguishable from an empty one.
- Resolve the candidate from the selection's own stream offsets and **every existing entry from one and the same
  stream** (`A37`): one `buildTextStream` per create, then `locateAnchorInStream` per entry with the same `root` (`N7`).
  A create on a full page is 21 resolves — do not re-enter `locateAnchor` per entry (residual risk 2).
- `spans.candidate` must be usable (`end > start`): core **allows** a degenerate candidate rather than refusing it
  (`t2-03` remark 6), so the card is the only line of defence for empty/whitespace selections (residual risk 5).
- `buildAnchor` now also returns `null` for an out-of-domain `fragments`/`contextWindow` (`A28`): treat that as
  "do not enable Save", never as `entry_invalid` (residual risk 4).
- `duplicate` and `overlap` are distinct refusals with distinct Russian strings (`A47`:
  `Такая заметка на этом выделении уже есть`); do not let two codes collapse into one message (`t2-03` remark 5).

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

`docs/state/t2-02-review.md` (**`t3-01` readiness** paragraph + residual risks 1–7 — that paragraph is the contract of
this task), `docs/state/t3-01-settings-read-core.md` (the settings API you consume),
`docs/specs/content-overlay-ui.md` (Flow, Rules, Edge Cases, AC1/AC6/AC9/AC10/AC11),
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
- Repeated text can make the card refuse a selection the user sees as empty of collisions, or accept one they expected
  to collide, with no UI signal (`t2-03` residual risk 6). Accepted v1 limitation, restated in the spec's Edge Cases.
