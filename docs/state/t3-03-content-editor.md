# t3-03-content-editor

## Goal

The in-place editor for an **existing** entry: open it by selecting painted text, edit the comment, save through core,
delete the entry. Closes Stage 3 and with it the last creation-rule AC of the model spec (AC8, "an edited entry may
not overlap another entry").

## PM rulings this task implements

- `A42` **Click outside the editor = cancel, not save.** Matches the spec's `Отмена`/click-outside equivalence
  (overlay Flow 5); saving only through the button. Applied as default because it matches Flow 5 wording.
- `A43` **`Esc` = cancel** (same path as `Отмена`), closes the editor without writing.
- `A44` **`Удалить` deletes immediately, no confirmation, no undo** in v1. Cheapest reversible-by-hand action: the user
  can re-select and re-type. If the user wants a confirm step, it is one component.
- `A45` **The editor may move the range.** Saving keeps the entry's own range unless the user re-selected inside the
  editor, in which case the new resolved range is checked for overlap **excluding the entry being edited** (the
  self-exclusion argument comes from `docs/state/t2-03-review.md` → residual risks for `t3-03`).
- `A25` (already issued): core does not gate `deleteEntry`/`clearPage` by authorship; the **UI hides `Удалить`** on a
  foreign entry's editor and never opens an editor for a foreign entry at all.

## AC (5 substantive + gates)

1. Selecting text that belongs to **your own** painted entry opens the editor prefilled with its `comment` instead of a
   create card (overlay AC5); selecting foreign painted text opens no editor and shows only the read-only tooltip
   (model AC7).
2. `Сохранить` writes through core `updateEntryComment` only; the comment changes and `updatedAt` moves; the anchor is
   untouched unless `A45` applies (model AC6/AC7).
3. `Отмена`, `Esc` and a click outside all close without writing anything: a test asserts the storage port received no
   `set`/`remove` call at all (overlay Flow 5, rulings `A42`/`A43`).
4. `Удалить` calls core `deleteEntry`; the entry disappears from storage, its highlight and tooltip are removed, and
   the popup row goes away on reopen (overlay AC4, model AC11). A foreign row exposes no `Удалить` (`A25`).
5. Overlap on save (model AC8): a moved range that intersects another entry's resolved range is refused with
   `Выделение пересекается с существующей записью` and the editor stays open with its text intact; self-overlap is
   excluded (`A45`, `A37`).

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): editor module + tests → `npm test` early → spec lines (`docs/specs/content-overlay-ui.md`:
click-outside semantics, delete-without-confirm, self-exclusion on save) → gates →
commit `feat(t3-03): in-place editor and delete`. Commit as soon as green.

## Inputs the engineer reads

`docs/state/t3-02-review.md` (its `t3-03` readiness paragraph and residual risks — this brief will quote them when the
review lands), `docs/state/t2-03-review.md` (residual risks for `t3-03-content-editor`: how to exclude the edited
entry from its own overlap check), `docs/specs/content-overlay-ui.md` (Flow 5, AC4/AC5/AC6),
`docs/specs/inline-comment-model.md` (AC7/AC8/AC11, authorship), `src/core/entry-store-write.ts`
(`updateEntryComment`, `deleteEntry`), `src/content/overlay/`.

## Explicitly out of scope

Popup and options (Stage 4), SPA URL watching and `storage.onChanged` (`t4-03`), per-entry highlight names (owned by
`t3-02`), any storage call that is not a core API call.

## Attempts log

- attempt 1: brief prepared; delegated after `t3-02` acceptance.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A42`–`A45` are PM defaults applied without an answer from the user.
- Whether the editor re-anchors after a page re-render while it is open — v1 default: the editor keeps the entry id it
  opened with and re-resolves on save; if the anchor went stale meanwhile, the save still writes the comment but paints
  nothing (staleness rule). Recorded as an assumption.
