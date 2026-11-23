# t18-02 — reserved message slots in the settings window (ruling A185)

Status: done (user chose variant 1 of 4: reserve the slot instead of growing the window).

Problem (user report): the «Сохранено» confirmation, the server-address refusal and the
rename warning appeared in flow below `Сохранить`, so the Chrome dialog box grew when
they rendered. `A178`'s gap-budget did not hold in the reader's browser.

Implemented:

- `src/options/options.component.ts`:
  - bottom slot is unconditional; the rename warning is its `@if` arm and the message
    line its `@else` arm — the two blocks share one slot and never stack (`A179` kept);
  - the server-address refusal moved from a conditional `@if` to its own always-rendered
    reserved slot with `serverMessageClass()` choosing the role;
  - `messageClass()` gained the empty arm `message message--empty`;
  - stylesheet: `.message` and `.rename` both declare `min-height: 40px` (same reserve,
    same `margin: 12px 0 12px`); `.message--empty` paints no band (`background:
    transparent`, `padding: 0 8px`); `.rename` is a compact row (warning flexes, two
    buttons fixed) that fits the same reserve.
- No palette literal added; no Russian string changed; `author-name-service.ts` untouched.

Spec: `docs/specs/content-overlay-ui.md` bullet "Reserved message slots" (A185).

Tests: `tests/options-window-look.spec.ts` — the `A178` gap-budget describe rewritten as
the `A185` reserved-slot describe (shared min-height, empty arm, one-slot shape); the
three template-count pins widened from one to two message nodes (bottom slot + server
slot); the `A179` condition pin moved to the `@if (renameConfirm())` shape.

Gates: `npm test` 1293 green, `npm run build` green, `npm run typecheck` green,
`node scripts/check-agent-config.mjs` 0 errors.
