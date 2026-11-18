# Task `t7-01b-actions-row-cleanup` — the leftovers of the compact row

Stage 8, task 2. Owner: `extension-engineer`. Ruling: **`A115`** (with the reviewer's non-blocking remarks 1–2 from
`docs/state/t7-01-review.md`). Small slice, comment/test-scale plus one real UI fix.

## Carried-fix checklist (`A72`) — three numbered items, each answered by number in the report

1. **The dead strip (a real UI defect, remark 4).** `src/content/overlay/editor.tsx:148-173`: for a **foreign** entry neither Save
   nor Delete is rendered, but the `.actions` container still is — with `margin-top: 8px` and a 24px row height it shows as an
   empty band under a read-only note, which is exactly the clutter ruling `A114` set out to remove. Fix: **an action row with no
   controls is not rendered at all.** AC: the editor DOM for a foreign entry contains **no** `.actions` node; for the reader's own
   entry the row exists and holds exactly the two icon buttons. The authorship rule itself is untouched (model AC8: no Save/Delete
   for a foreign entry), and the read-only editor still opens, shows the note and closes.
2. **Frame colors are claimed but unpinned (remark 1).** `src/content/overlay/card-style.ts:98-103` declares
   `border: 1px solid #b9bec4`, `box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18)`, `background: #ffffff`, and
   `docs/specs/content-overlay-ui.md` says the frame colors are unchanged — while `grep "b9bec4" tests/` returns nothing. Add the
   three declarations to the stylesheet-text pin at `tests/content-card-actions.spec.ts:448-456`.
3. **AC labels in the new test file are off by one family (remark 2).** `tests/content-card-actions.spec.ts:338` labels the tab
   order "AC6" (it is task AC7), `:383` labels the disabled/`Ctrl+Enter`/`Esc` block "AC7" (task AC6), `:446` labels the
   stylesheet pin "AC8" (task AC9), and the header at `:4` says "AC1-AC8". Relabel to the task's numbers; **do not touch the
   assertions**.

## Also true after this task (do not break)

- Icon-only buttons keep `aria-label`/`title`, the 24×24 hit box and the explicit SVG geometry (`A114`).
- `Esc` and a `pointerdown` outside the host remain the only closes; `Ctrl/Cmd+Enter` saves; no `tabindex`.
- Model AC2 as corrected by `A115`: Save stays enabled at `256/256`, disabled only while the trimmed comment is empty.

## Boundaries

- Allowed: `src/content/overlay/editor.tsx`, `src/content/overlay/card-style.ts` (a comment only if needed), `tests/**`,
  `docs/specs/content-overlay-ui.md` (the action-row line), `README.md` (counts only).
- Forbidden: `src/core/`, `src/popup/`, `src/options/`, `src/manifest.json`, `src/content/text.ts`, `package.json`, harness files,
  `docs/specs/inline-comment-model.md` and `docs/specs/code-review-flow.md` (PM-owned, `A76`), and this task state file.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Item 1 (spec line + the empty-row fix + its pins), commit at green.
2. Items 2–3 (pins and labels, assertions untouched), commit at green.
   Each gate with `echo "exit=$?"` on the line right after the command, never after a pipe, never inside a `&&` chain; tails only.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
