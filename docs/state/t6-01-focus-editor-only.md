# Task `t6-01-focus-editor-only` — the caret moves only where nothing is lost

Stage 7, task 1. Owner: `extension-engineer`. Ruling: **`A111`** (the user's choice of 2026-11-18; it narrows `A97` and restores
the `A74` half for one path). Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` (the `focus on open` Terms row,
the Rules bullet, AC17) and the README sentence about the keyboard path.

## Problem this fixes (reported live in the browser pass)

Selecting text slowly makes the create card appear and **the page selection go away**. The cause is not a bug in our code: the
card reads the selection once at open (`src/content/overlay/create-card-controller.tsx:284`), the content layer never calls
`removeAllRanges` or `collapse`, and Chrome drops the page's active selection when focus enters an editable element. So
`A97`'s caret-into-the-field destroys the gesture that opened the card.

## Shape (already ruled, `A111`)

- **Create card:** opening it performs **no focus call at all**. The page keeps whatever it had focused; the reader reaches the
  controls with `Tab`, exactly as `A74` used to promise. No restore is needed because nothing was taken.
- **Editor:** unchanged from `A97`/`A105` — opening focuses its `textarea` with `preventScroll: true`, closing restores the
  page's previous element if it is still connected.
- `src/content/overlay/focus-handoff.ts` stays the single owner of the focus rules; the card controller simply stops calling it.
  Do not delete the module and do not inline a `focus()` anywhere.

## Acceptance criteria (observable)

1. The create-card path records **zero** focus calls (the recorder in `tests/support/focus-calls.ts` is the proof), and the page's
   previously focused element is still the document's active element after `open()`.
2. The editor path is untouched: its `textarea` becomes the active element on open, `preventScroll: true` is still on the call, and
   the close paths still restore.
3. The `t5-04` pins for the card are **rewritten to `A111`, not deleted** — the report lists each rewritten pin by `path:line`, and
   a deleted pin there is a blocking finding.
4. The tab-order pin survives unchanged: `textarea` → `Сохранить` → `Отмена`, no `tabindex` on any control. `Esc` closes and writes
   nothing; `Ctrl/Cmd+Enter` still saves.
5. The spec states the split in all three places and names `A111`; no sentence left anywhere claims the card takes focus. This is
   the `A92` class: re-read what you write for the claim it replaces.
6. The README keyboard sentence matches the shipped split. It is reviewed as a factual document.
7. **The "the selection survives opening the card" half is not claimed by any test.** jsdom does not drop a selection on focus, so a
   pin there would be vacuous; the report says so explicitly and names it a browser item.
8. No new Russian string; `src/core/`, `src/content/paint/**`, `src/popup/`, `src/options/`, `src/manifest.json` untouched.

## Boundaries

- Allowed: `src/content/overlay/create-card-controller.tsx`, `src/content/overlay/focus-handoff.ts` (only if a comment must stop
  claiming the card path), `tests/**`, `docs/specs/content-overlay-ui.md`, `README.md`.
- Forbidden: `src/core/`, `src/content/paint/**`, `src/content/editor/**`, `src/popup/`, `src/options/`, `src/manifest.json`,
  dependencies, harness files, the other PM-owned specs (`A76`, `A89`).
- Do not touch the task state file `docs/state/t6-01-focus-editor-only.md`; write your report to your own artifact.

## Carried-fix checklist

None yet.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec + README first, commit at green.
2. Card controller + rewritten pins, commit at green.
3. Report `done` per AC number with `path:line`, and the four gates with their own exit status (`npm run build`,
   `npm test -- --reporter=basic`, `node scripts/check-agent-config.mjs`, `npm run typecheck`), each `echo "exit=$?"` on the line
   right after the command, never after a pipe. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
