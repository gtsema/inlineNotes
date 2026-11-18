# Task `t6-02-typing-enters-card` — typing is the way in

Stage 7, task 2. Owner: `extension-engineer`. Ruling: **`A112`** (the user chose `S4` on 2026-11-18; it adds to `A111`, it does
not undo it). Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` (the `focus on open` Terms row, the Rules bullet,
AC17) + the README keyboard sentence.

## What is broken today

`A111` left the keyboard with no door: the spec says "`Tab` is now the only way in", and in real Chrome the reader's `Tab` after a
mouse selection does **not** reach the card (the overlay host hangs off `document.documentElement`, `src/content/overlay/host.ts:47`,
so the card is last in tree order — behind every focusable of the article). The user chose to make **typing** the entry instead of
intercepting `Tab`.

## Shape (ruled `A112`)

1. Opening the create card still makes **no focus call at all** (`A111` untouched).
2. While the create card is open and the document's active element is **not** inside the overlay host, a keydown whose
   `event.key` is a single printable character (`key.length === 1`) focuses the card's `textarea`. This is layout-independent by
   construction: Cyrillic, Latin, digits, punctuation all qualify.
3. **Not** triggers: any key with `ctrlKey` / `metaKey` / `altKey` (so `Esc`, `Ctrl+Enter`, `Cmd+Enter`, `Ctrl+A`, `Alt+…` are
   untouched); `Space` (scrolling the article stays the page's); every non-printable key (`Tab`, arrows, `Enter`, `Backspace`,
   `Home/End/PageUp/PageDown`, `Delete`, `Escape`, `Shift`, function keys, `Dead`).
4. The handler **never calls `preventDefault()`**: the key is not swallowed, and the character the reader pressed lands in the
   field because the focus move happened during `keydown`. Host-page respect wins over exclusivity — if the page has its own
   single-letter shortcut, it may fire too, and that is accepted and recorded as an `Assumption:`.
5. Once the card has taken focus this way, the `A105` handover applies to its closes exactly as it does for the editor: the
   element the page held before that keystroke is handed focus back on every close path, and nothing is forced when it is gone.
   Reuse `src/content/overlay/focus-handoff.ts` and `FIELD_FOCUS_OPTIONS` (`preventScroll: true`) — do not hand-roll a `focus()`
   call and do not add a second focus owner.
6. The editor is untouched: it already takes the caret on open (`A97`/`A104`).
7. The honest limit stays and must be written again: the keystroke that enters the field is itself a focus move into an editable
   element, so the page's **visual** selection may end there. The stored note is unaffected (the create path holds the `Range`
   captured at open). No test can show this; it is a browser item.

## Acceptance criteria (observable)

1. With the card open and focus on the page, a `keydown` with `key: 'п'` (and one with `key: 'a'`) makes the card's `textarea` the
   active element inside the shadow root, through a focus call carrying `preventScroll: true`.
2. The same keydown is **not** default-prevented (`defaultPrevented === false` on the dispatched event).
3. No trigger for: `Space`, `Tab`, `Enter`, `Backspace`, `Escape`, `ArrowDown`, a key with `ctrlKey`, a key with `metaKey`, a key
   with `altKey`. Each is its own assertion, and each must still show the card received no focus.
4. No trigger when the card is closed, and no trigger when the active element is already inside the overlay host (the page's keys
   are not touched a second time).
5. `Esc` still closes and writes nothing; `Ctrl/Cmd+Enter` still saves; the tab order is still `textarea` → `Сохранить` → `Отмена`
   and no control gains a `tabindex`.
6. After a typing entry, every card close path hands focus back to the element the page held before the keystroke, and forces
   nothing when that element is gone.
7. The spec's three places state the split (open takes nothing / typing takes the caret / the restore then applies), name `A112`,
   and repeat the visual-selection limit. No sentence left anywhere claims the card takes focus **on open**, and no sentence claims
   `Tab` is "the only way in" now that typing is a way in.
8. README keyboard prose matches the shipped behavior — it is reviewed as a factual document (`A92` class).
9. `src/core/`, `src/content/paint/**`, `src/content/editor/**`, `src/popup/`, `src/options/`, `src/manifest.json` untouched; no
   new Russian string (there is no visible string in this rule).

## Boundaries

- Allowed: `src/content/overlay/card-events.ts`, `src/content/overlay/create-card-controller.tsx`,
  `src/content/overlay/focus-handoff.ts` (a comment or a widened call site only if the handover needs it), `tests/**`,
  `docs/specs/content-overlay-ui.md`, `README.md`.
- Forbidden: `src/core/`, `src/content/paint/**`, `src/content/editor/**`, `src/popup/`, `src/options/`, `src/manifest.json`,
  `package.json`, harness files, the other PM-owned specs (`A76`, `A89`).
- Do not touch `docs/state/t6-02-typing-enters-card.md`; write your report to your own artifact.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec + README, commit at green.
2. Implementation + pins, commit at green.
3. Report per AC number with `path:line`, the four gates with their own exit status (`npm run build`,
   `npm test -- --reporter=basic`, `node scripts/check-agent-config.mjs`, `npm run typecheck`), each with `echo "exit=$?"` on the
   line right after the command, never after a pipe. Tails only.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
