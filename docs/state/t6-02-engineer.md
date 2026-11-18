# Task `t6-02-typing-enters-card` — engineer report (attempt 1)

Ruling implemented: **`A112`**. Spec edited in the same change: `docs/specs/content-overlay-ui.md`
(the `focus on open` Terms row, the `focus restore` Terms row, the keyboard-reachability bullet, the
`focus on open` Rules bullet, AC17) plus the README keyboard prose.

## Commits

| commit | content |
| --- | --- |
| `a98e753` | CP1 — spec + README only (three-part split, `A112` named, the false `Tab` sentence deleted, Run 4 pointed at) |
| `38a3e4a` | CP2 — implementation + pins (28 new tests) |

Both commits were made at green (gate output below).

## Implementation map

- `src/content/overlay/card-events.ts`
  - `:56-73` — `isTypingEntryKey(event)`: a modifier (`ctrlKey` / `metaKey` / `altKey`) returns
    `false`; otherwise `event.key.length === 1 && event.key !== ' '`. Module-private, not exported:
    the door is pinned through the listener, which is the observable surface.
  - `:132-151` — `onKeyDown`: three guards, one per AC — `!controller.isOpen()` (AC4),
    `!isTypingEntryKey(event)` (AC3), `isInsideOverlayHost(doc.activeElement, host)` (AC4). Then
    `controller.takeCaretForTyping()`. **No `preventDefault()` anywhere in this file** (AC2).
  - `:155-158` — `doc.addEventListener('keydown', onKeyDown)` in the **bubble** phase: the page's own
    handler runs first and a page that consumes the keystroke keeps it. `Tab` is intercepted nowhere.
  - `:165` — teardown removes the listener (pinned by the detach case).
- `src/content/overlay/create-card-controller.tsx`
  - `:154-160` — `CreateCardController.takeCaretForTyping(): void`.
  - `:179-184` — `const focus = createFocusHandoff(doc, overlay)`: one handover per controller, the
    same owner the editor uses. No `focus()` call is written in this module.
  - `:216-227` — `open()` still makes **no focus call** (`A111` untouched); comment now states why the
    keystroke, not the open, is the focus moment.
  - `:230-241` — `takeCaretForTyping()`: re-guards `session === null`, then `focus.open(wrapper)` →
    the page element held before the keystroke is recorded and the field is focused with
    `FIELD_FOCUS_OPTIONS` (`preventScroll: true`).
  - `:252-257` — `close()` calls `focus.restore()` after the unmount and the host hide. For a card
    nobody typed into the handover was never opened, so this restores nothing and forces nothing: the
    `t6-01` AC1 zero-call proof stands (proved by the existing A111 cases, still green).
- `src/content/overlay/focus-handoff.ts` — **comment only** (the brief's allowance): the header now
  names the two shipped call sites and states that the keystroke decision belongs to `card-events.ts`.
  No code, no signature, no option-object change.
- `tests/support/focus-calls.ts` — **unchanged**; the recorder needed no widening.

## Acceptance criteria, one by one

- **AC1 — satisfied.** `tests/content-card-events.spec.ts:447-468`: four cases (`п`, `a`, `7`, `,`) —
  after `document.dispatchEvent(keydown)` the shadow root's active element is the card's `textarea`,
  `document.activeElement` is the overlay host (retargeting), and the recorder over
  `HTMLElement.prototype.focus` shows exactly one call on the field with
  `options` equal to `{ preventScroll: true }`. Fixture `:229-241` puts a page control in the document
  caret before the selection, i.e. the Run 3 state.
- **AC2 — satisfied.** `tests/content-card-events.spec.ts:470-490`: case 1 asserts
  `event.defaultPrevented === false` **and** that `dispatchEvent` returned `true` while the field is
  focused; case 2 greps the shipped module and asserts no `.preventDefault(` call exists in
  `src/content/overlay/card-events.ts`.
- **AC3 — satisfied.** `tests/content-card-events.spec.ts:492-529`: nine **separate** cases —
  `Space`, `Tab`, `Enter`, `Backspace`, `Escape`, `ArrowDown`, `a`+`ctrlKey`, `п`+`metaKey`,
  `a`+`altKey`. Each one asserts the shadow root answers `null`, `document.activeElement` is still the
  page control, the recorder saw **zero** focus calls, the keystroke was not prevented, and the card is
  still open with one card element.
- **AC4 — satisfied.** `tests/content-card-events.spec.ts:531-586`: (a) printable keystroke after the
  card was closed by a page scroll → zero focus calls, card still closed; (b) after
  `wiring.dispose()` → zero calls; (c) once the caret stands inside the host, three further printable
  keystrokes (on `document`, on the field, on the shadow root) produce **no second** focus call, and
  the field keeps the caret and the card stays open.
- **AC5 — satisfied.** `tests/content-create-card-controller.spec.ts:1245-1348`: after a typing entry
  the rendered order is still `textarea` → `Сохранить` → `Отмена`, every control's `tabindex` is
  `null`, `[tabindex]` count in the shadow root is `0`, the host carries none; `Esc` closes and writes
  nothing (`created` empty, no port write); `Ctrl+Enter` saves (`created` length 1).
- **AC6 — satisfied.** `tests/content-create-card-controller.spec.ts:1350-1440`: the `Отмена`, `Esc`
  and successful-save closes, and the two event-driven closes (`pointerdown` outside the host, page
  scroll), each hand the caret back to the page control with one focus call carrying
  `{ preventScroll: true }`; when that control was removed, the recorder sees **no call at all** and
  `document.activeElement` is neither the control, nor the host, nor `documentElement`.
- **AC7 — satisfied.** The three spec places state the split and name `A112`:
  `docs/specs/content-overlay-ui.md:44` (Terms `focus on open`: open takes nothing → the printable
  keydown takes the caret through `FIELD_FOCUS_OPTIONS` → `Tab` is not the door), `:45`
  (Terms `focus restore`: the restore applies to a card once it took the caret), `:130-134`
  (keyboard bullet + `focus on open` bullet + a dedicated **The typing door** paragraph naming the
  three parts, the non-triggers, `defaultPrevented === false`, the `Assumption:` about a page shortcut,
  and the visual-selection limit again + the `focus restore` `Assumption:` + the "what did not change"
  paragraph with the two call sites), and `:262` (AC17). No sentence anywhere claims the card takes
  focus **on open**: the card sentences are all conditioned on "at its open" / "a card nobody typed
  into". The sentence `Tab` is now the only way in` is gone (grep for `is now the only way in`,
  `the only way the card puts it anywhere`, README `единственный` → no hits), and
  `tests/content-card-events.spec.ts:588-604` pins that state in both artifacts.
- **AC8 — satisfied.** `README.md:12-20` states the shipped behavior: no focus call at the open, the
  door is the first printable key (except `Space` and modified combinations), the keystroke is not
  cancelled, `Tab` does not lead into the card and is not intercepted, no `tabindex` was added and the
  host was not moved, the close returns the caret after such an entry, the tab order inside the card is
  `textarea` → `Сохранить` → `Отмена`, all focus calls carry `preventScroll`. `README.md:133-145`
  replaces the old Run 1 keyboard sentence with the measured Run 3 `failed` item, the new door, and the
  Run 4 re-check list. `README.md:47` and `:122-123` carry the corrected gate counts (935 tests in 44
  files, 115 info lines) because README numbers are reviewed as facts.
- **AC9 — satisfied.** `git status --short` over both commits lists only: `README.md`,
  `src/content/overlay/card-events.ts`, `src/content/overlay/create-card-controller.tsx`,
  `src/content/overlay/focus-handoff.ts`, `tests/content-card-events.spec.ts`,
  `tests/content-create-card-controller.spec.ts`, `tests/content-focus-handoff.spec.ts`. `src/core/`,
  `src/content/paint/**`, `src/content/editor/**`, `src/popup/`, `src/options/`,
  `src/manifest.json`, `package.json`, `scripts/`, `.pi/` are untouched. No new Russian UI string: the
  shipped modules gained English comments only; the fixture label in the new tests is `Read more`, like
  the sibling file.

## Negative evidence (the pins bite)

`git stash push -- src/content/overlay/card-events.ts
src/content/overlay/create-card-controller.tsx src/content/overlay/focus-handoff.ts` then
`npx vitest run tests/content-create-card-controller.spec.ts tests/content-card-events.spec.ts`:
**14 failed / 64 passed**, and the 14 are exactly the AC1 (4), AC2 (1), AC4 (1) and AC5 (3) / AC6 (5)
cases. The AC3 cases stay green without the implementation by nature (they assert that nothing
happens); they are the over-trigger guard, not the door proof.

## Gates (each `echo "exit=$?"` on the line right after the command; tails only)

```
npm run build                       exit=0   dist/ is a self-contained MV3 folder (10 files)
npm test -- --reporter=basic        exit=0   Test Files 44 passed (44) · Tests 935 passed (935)
node scripts/check-agent-config.mjs exit=0   0 error(s), 0 warning(s), 115 info(s)
npm run typecheck                   exit=0   (three projects, no output)
```

The same four were run at each commit: at `a98e753` (docs only) the numbers were 907 / 44 / 115; at
`38a3e4a` and again on the clean tree after it they are 935 / 44 / 115. `npm run typecheck` was added
to the gate list because the new interface member touches a test double (`tests/content-card-events
.spec.ts` production-delay controller gained `takeCaretForTyping`).

## Deviations from the brief's letter (all inside the allowed path list)

1. `tests/content-focus-handoff.spec.ts:5-22` — header comment only, no assertion changed. Its old
   sentence ("since ruling `A111` the `editor` is the widget this handover serves") became false with
   the second call site, and `tests/**` is allowed by the brief's Boundaries section.
2. README gate counts were corrected in **CP2**, not CP1, because the counts are a fact about the test
   tree that CP2 changed. CP1 carried only the keyboard prose.
3. `FIELD_FOCUS_OPTIONS` is not imported by the new tests; the option shape is pinned by the literal
   `{ preventScroll: true }` at both card call sites, so a change of the constant breaks loudly.
4. No browser verification was performed: `npm run build` produced `dist/`, but loading it in
   `chrome://extensions` is a human step and Run 3/Run 4 belong to the PM.

## Open questions / residual risks (not implemented, not invented)

- **Run 4 browser items** now named by `docs/specs/content-overlay-ui.md:262` and `README.md:136-140`:
  does the typing door work in real Chrome, is the live tab order still
  `textarea → Сохранить → Отмена`, and does the page's **visual** selection end at the keystroke that
  enters the field? None of these is expressible as a unit test; the stored note is unaffected because
  the create path holds the `Range` captured at open.
- **A page control that is itself an editable element** (a search box, a comment field) now loses the
  caret to our card when the reader types while a card is open. `A112` says exactly this (the guard is
  only "not inside the overlay host"), so it is implemented as ruled; flagging it as a browser
  observation for Run 4, not as a change.
- **A page-level single-letter shortcut** may fire together with the caret move — accepted and recorded
  as `Assumption:` in `docs/specs/content-overlay-ui.md:132`.
- **IME / dead keys**: a composition sends `key: 'Process'` / `key: 'Dead'` (length > 1) and so does
  not open the door; the first committed character does. jsdom cannot drive a composition, so this is a
  browser observation.
- `docs/specs/content-overlay-ui.md` checker info lines rose 113 → 115 because the spec now names two
  more paths; still 0 errors, 0 warnings.
