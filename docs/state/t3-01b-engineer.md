# t3-01b-content-offset-domain-fix — engineer report

Task: `docs/state/t3-01b-content-offset-domain-fix.md`, attempt 1.
Slice: blocking finding 1 of `docs/state/t3-01-content-create-card-review.md` + rulings `A63`, `A64`, `A65`.
Status: both commits landed, all three gates green, working tree clean, nothing pushed.

## Commits

### `ec4ee45` fix(t3-01b): trim the selection span in the code-point domain

Changed paths:

- `src/content/capture/selection-span.ts` — the fix. `trimStreamRange` now crosses the
  domain once in each direction through the existing core helpers:
  `utf16IndexAt(streamText, start)` / `utf16IndexAt(streamText, end)` → separators
  stepped over in UTF-16 units → `codePointOffsetAt(...)` back to code points. No new
  offset model, no clamp against `streamText.length`, no `src/core/` change. The
  doc-comment at the old `:180-185` (which claimed the opposite of the code) is
  rewritten, as is the module-header bullet about the trim.
- `src/content/capture/fragment-rect.ts` — `firstFragmentBox` → `placementFragmentBox`
  (walks to the first fragment whose box has an area, `hasArea` = `width > 0 &&
  height > 0`; `null` only when the span has no fragment or every box is zero-area).
  `fragmentBox(fragment, rangeFor)` is now exported as the single measurement seam the
  paint pass must reuse. A throw from `rangeFor` is deliberately not caught here.
- `src/content/overlay/card-placement.ts` — new `placeCardInViewport(cardBox, viewport)`,
  which is `placeCard` with the viewport itself as the anchor box (one rule, one clamp,
  no second placement model).
- `src/content/overlay/create-card-controller.tsx` — the anchor box is measured
  **before** anything is mounted (`measureAnchorBox` returns
  `{ ok: true, box } | { ok: true, box: null } | { ok: false }`, so "threw" and "no box"
  stay two different answers); `{ ok: false }` returns from `capture` before
  `open()` → no mount, host stays hidden, no write. `positionCard(null)` uses
  `placeCardInViewport`.
- Tests: `tests/content-selection-capture.spec.ts`,
  `tests/content-card-placement.spec.ts`, `tests/content-card-events.spec.ts`,
  `tests/content-create-card-controller.spec.ts`, `tests/toolchain-contract.spec.ts`.

### `e1f0f94` docs(t3-01b): settle delay, measurement failure and zero-area fragment rules

Changed paths:

- `docs/specs/content-overlay-ui.md`
  - Terms `settle delay`: now names the shipped constant `SELECTION_SETTLE_MS` and pins
    **150 ms** (`A63`).
  - Terms `card placement`: "below the first `text fragment` of the selection **that has
    a box** … and against the viewport itself when no fragment has a box
    (rulings `A30`, `A65`)".
  - Rules "Card placement": same first-box-with-an-area wording, plus a new rule line
    "A `text fragment` box with no area takes no part in `card placement` (ruling
    `A65`)".
  - Edge Cases: two new leading lines — the measurement-failure rule (`A64`) and the
    all-zero-area span rule (`A65`).
- `src/content/overlay/card-events.ts` — comment only: `SELECTION_SETTLE_MS` now points
  at the Terms row that owns the value instead of carrying the number alone.
- `tests/content-card-events.spec.ts` — `A63` pin (see AC5).

## Commands run (A62 order)

1. `npm run build` → **passed**. `[build] dist/ is a self-contained MV3 folder (10
   files)`; manifest references resolved: `content.js`, `popup/index.html`,
   `options/index.html`.
2. `npm test` → **passed**. Before this slice: **28 files, 523 tests**. After: **28
   files, 548 tests** (+25). Touched files alone: capture 10→21, placement 10→15,
   events 10→12, controller 12→21, toolchain 26→29.
3. `node scripts/check-agent-config.mjs` → **passed**. `0 error(s), 0 warning(s),
   28 info(s)` (the infos are the checker's fixed "planned path not created yet"
   notice for every backticked `src/…`/`tests/…` token in a spec; it also lists
   pre-existing paths such as `src/content/text.ts`, so it is not a new signal).

Red-before-green evidence (run against `HEAD` before the fix, then restored):

- `git checkout HEAD -- src/content/capture/selection-span.ts` → `npx vitest run
  tests/content-selection-capture.spec.ts tests/content-create-card-controller.spec.ts`
  → **8 failed / 34 passed**, with exactly the predicted shapes: `expected 'uick brown'
  to be 'quick brown'`, `expected 'lpha' to be 'alpha'`, `expected a span for the
  one-character word`, `expected ' quick brown' to be 'quick brown'`, and
  `expected 'Выделение пересекается…' to be 'Такая заметка на этом выделении уже есть'`
  (overlap instead of duplicate).
- `git stash push -- src/content/capture/fragment-rect.ts src/content/overlay/create-card-controller.tsx`
  → `npx vitest run tests/content-create-card-controller.spec.ts` → **3 failed / 18
  passed**: the `A64` case (the throw escaped `capture()` as an unhandled rejection) and
  both `A65` placement cases.
- `SELECTION_SETTLE_MS = 120` temporarily → the `A63` case fails, so the pin is not
  vacuous. Restored to 150.
- The zero-area fixtures deliberately measure `left: 500, top: 400, width: 0, height: 0`,
  so the viewport-rule assertions cannot pass through the collapsed box's own numbers.

## AC self-check

1. **The trim lives in the code-point domain.** Pinned by
   `tests/content-selection-capture.spec.ts` → `an astral character somewhere before the
   selection (t3-01b finding 1)` → `keeps the first character of a multi-word selection
   in a later paragraph`, which asserts the required identity end to end:
   `sliceCodePoints(stream.text, span.candidate.start, span.candidate.end) ===
   span.anchor.text === normalizeText(range.toString())` (plus
   `candidate.end - candidate.start === codePointLength(anchor.text)`). Also
   `leaves no stream separator inside the span when the click caught a space` and
   `trims both ends when an astral character sits inside the selection`. The
   doc-comment was rewritten in the same commit (`ec4ee45`). Machine pin:
   `tests/toolchain-contract.spec.ts` → `the capture module crosses the offset domain
   only through core helpers (t3-01b finding 1)` (imports `utf16IndexAt` /
   `codePointOffsetAt` from `../../core/text-normalize`; no `streamText.charAt(` with an
   unconverted index; no `streamText.length`).
2. **Regression fixtures that would have failed before.**
   `keeps a one-word selection whole` and `keeps a short one-word selection from
   degenerating the range` (capture), and end to end in
   `tests/content-create-card-controller.spec.ts` → `a page whose text carries an astral
   character before the selection (t3-01b AC2)`: `opens the card for a one-word selection
   and stores the whole word`, `opens the card for a one-character word after an astral
   character` (the case that used to return no span, hence no card / `selection_lost`),
   and `refuses a re-selection of the same text as a duplicate, not an overlap (A23)`
   (asserts `REFUSAL_TEXT.duplicate` **and** `not REFUSAL_TEXT.overlap`, and that the
   page still holds exactly one entry). All three controller cases were red before the
   fix (evidence above).
3. **`A64` measurement failure.** Spec: new Edge Case line in
   `docs/specs/content-overlay-ui.md` ("The anchor box is measured **before** the card is
   mounted, and a measurement that throws means the card does not open"). Test:
   `tests/content-create-card-controller.spec.ts` → `a measurement that throws leaves the
   card closed (ruling A64)` → `mounts nothing, positions nothing and writes nothing when
   the node shrank`: the injected `rangeFor` throws an `IndexSizeError`-shaped error, and
   the case asserts `isOpen() === false`, no `.inlinenotes-card` in the shadow root,
   `host.hidden === true`, the wrapper exists but `style.left === '' && style.top === ''`
   (no mounted-but-unpositioned card), the measurement was attempted once, and
   `port.storedKeys()` is still only `settings:v1` (no entry write).
4. **`A65` zero-area fragment boxes.** Tests:
   `tests/content-selection-capture.spec.ts` → `a fragment box with no area does not
   place the card (ruling A65)` (walks to the fragment that has an area, measures on and
   stops there; `null` when every box is zero-area; `null` and no measurement for an
   empty fragment list; the box comes from the clipped fragment);
   `tests/content-card-placement.spec.ts` → `no fragment of the span has a box (ruling
   A65)` (5 cases for `placeCardInViewport`: gutter position, whole card inside the
   viewport, card taller than the viewport, card wider than the viewport, same gutter as
   an anchored placement);
   `tests/content-create-card-controller.spec.ts` → `a zero-area fragment box does not
   place the card (ruling A65)` (all boxes zero-area → wrapper at `8px/8px`, i.e. the
   viewport rule, not `500px/408px`; first fragment hidden and second visible → card at
   the second fragment's box `300px/226px` with both fragments measured).
5. **`A63` settle delay is pinned.** Spec Terms row `settle delay` names
   `SELECTION_SETTLE_MS` and **150 ms**. Test:
   `tests/content-card-events.spec.ts` → `the settle delay is a constant the spec pins
   (ruling A63)` → `keeps the shipped delay at the value the spec names`, where
   `specSettleDelayMs()` reads the Terms row out of
   `docs/specs/content-overlay-ui.md`, throws if the row loses its `**N ms**` value or
   its constant name, and the assertion is
   `expect(SELECTION_SETTLE_MS).toBe(specSettleDelayMs())` — the old `> 0` assertion is
   gone. Second case `uses the pinned delay at the production call site, where no delay
   is passed` observes the constant as the wiring default (0 captures at
   `SELECTION_SETTLE_MS - 40` ms, 1 capture after the delay).

## Deviations

- **`A64` wording vs the shipped order.** The ruling says the card "closes"; in the
  shipped code there is no moment at which a card is open and unmeasured, because the
  measurement moved *before* the mount. The observable outcome the ruling cares about —
  "no card without coordinates, no storage write" — is what the test asserts; the card
  never opens rather than opening and then closing. If the PM wants a literal
  open→close transition, that needs a different design (mount, then measure, then close)
  and would reintroduce the unpositioned-card window the review flagged.
- **The rule line and the Terms row were edited, not only Edge Cases.** The task asked
  the overlay spec for the Edge Case lines; the existing "Card placement" rule and the
  `card placement` Terms row stated the old behavior ("below the box of the *first*
  `text fragment`"), so leaving them would have made the spec contradict itself. This is
  a same-commit doc sync required by `AGENTS.md` -> Documentation Expectations, not a new
  requirement.
- **No acceptance-criterion number was added or renumbered** in
  `docs/specs/content-overlay-ui.md` (the list still ends at 14). AC13 already covers the
  gutter property; `A64`/`A65` are stated as rules and Edge Cases, which is what the
  task's AC3/AC4 asked for.
- **`firstFragmentBox` was renamed** to `placementFragmentBox` and `fragmentBox` was
  exported. The rename follows from `A65` (the contract changed), and no call site
  outside `create-card-controller.tsx` existed.
- **A mechanical pin was added to `tests/toolchain-contract.spec.ts`** for the offset
  crossing. Justified by review remark 1's suggestion that the class of mistake be
  grepped rather than commented; it is a test-only change, no new rule.
- **`src/core/` was not touched.** No core-helper defect was found: `utf16IndexAt`,
  `codePointOffsetAt` and `sliceCodePoints` behave as their specs state (clamping,
  inverse pair, half-open slice), and `inline-comment-model.md` -> "Anchor domains"
  already states the rule this slice had to follow.

## Open questions

- None blocking. Two for the PM to note, both already inside the task's out-of-scope
  list:
  1. `A64` observable wording — "the card closes" vs "the card never opens" (see
     Deviations). The test pins the substance.
  2. Whether `hasArea` should be exported from `fragment-rect.ts` for `t3-02`, or
     whether the paint pass is expected to re-derive it. See Handoff.

## Handoff notes for `t3-02-content-highlight-tooltip`

- **Reuse the measurement seam, do not build a second one.**
  `src/content/overlay/fragment-rect.ts` is the only place the two offset domains are
  crossed for geometry: `documentRangeForFragment(doc)` is the range factory,
  `fragmentBox(fragment, rangeFor)` is the one DOM read of one clipped fragment, and
  `placementFragmentBox(fragments, rangeFor)` is the placement-only wrapper over it.
  Painting must use `documentRangeForFragment` + `fragmentBox` over **every** fragment of
  the `all-or-nothing locate` result (ruling `A36`) — it must **not** use
  `placementFragmentBox`, whose job is to skip fragments, which would silently paint
  half a selection.
- **The offsets handed to a `Range` are `fragment.start` / `fragment.end`** (node-local
  UTF-16). `fragment.streamStart` / `streamEnd` are code points and must never reach
  `setStart` / `setEnd` — that is the same defect this slice fixed at the other boundary.
- **`A64` for the paint pass:** `setStart` / `setEnd` can throw for the same reason
  (the page shortened the node between locate and paint). Do not let that leave a
  partially painted range: the throw must be handled where the answer is known, and the
  answer is "this entry produces no highlight, no frame and no tooltip at all" — the
  same observable state as `anchor_stale`, with the entry still listed and deletable.
  Nothing is written to storage in a paint path anyway.
- **`A65` for the tooltip:** a zero-area box has no place next to it, so a range whose
  every fragment measures zero area gets **no tooltip** (hovering invisible text is not
  a user action), and a multi-fragment range should anchor the tooltip to the first
  fragment that has an area — the same walk `placementFragmentBox` performs for the card.
  `hasArea` is currently module-private in `fragment-rect.ts`; if the paint pass needs
  the same predicate, export it there instead of re-deriving `width > 0 && height > 0`.
- **The capture already hands clipped fragments:** `captureSpan` returns
  `span.fragments` with node-local offsets of the *selected* text only, so the paint of
  a create result can be built from the same fragments the card was placed against,
  without a second `Range` walk.
- Carried from the parent review and still open for `t3-02`: the keyboard-focus remark
  (nothing moves focus into the card on open) and the `A29` coverage gap (no test mutates
  the DOM between open and save).
