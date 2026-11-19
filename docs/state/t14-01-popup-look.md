# t14-01 — the popup adopts the settings window's design

Stage 14 (`docs/state/stage-14-popup-look.md`). Owner's word: «привести в порядок дизайн попап окна, он должен
соответствовать дизайну окна настройки», plus «кнопку удалить … замени на значёк», plus **«всё дефолты»** for the five
questions. Rulings: `A140`–`A143`.

## Goal

The popup stops being a third visual language. It becomes the same card, in the same palette, at its own width, with the
row's delete control turned into the icon-only trash button the page widgets already use.

## Measured starting point

| Role | Settings (`A125`) | Popup today |
|---|---|---|
| surface | `#fdf7ee` | browser default white |
| ink | `#1b2a33` | `#1f1f1f` |
| secondary | `#7b6a55` | `#6b6b6b` |
| decorative border | `#a6cbdc` | `#e3e3e3` (row hairline) |
| refusal | `#b3261e` | `#b3261e` (already shared) |

Structurally: popup `width: 320px; padding: 12px; font: 13px/1.45 system-ui`, plain `<h1>`, no card, no radius, no border,
rows separated by a hairline. Settings: bordered rounded cream card, `max-width: 360px`, `padding: 16px`,
`border: 1px solid #a6cbdc`, `border-radius: 12px`, centred.

**No test reads the popup's stylesheet today, and no spec sentence rules its colours or shape.** This task writes the first
popup-look pins.

## Acceptance criteria

1. **The `A125` palette replaces the popup's own trio** (`A140`). The surface becomes cream `#fdf7ee`, ink `#1b2a33`,
   secondary `#7b6a55`, decorative border `#a6cbdc`; `#b3261e` stays for refusals. **`#1f1f1f`, `#6b6b6b` and `#e3e3e3`
   must not survive anywhere in the popup's stylesheet.** No new colour literal is invented: every value is one of the
   `A125` roles.
2. **The popup is the settings card's shape** (`A141`): the same border, the same `border-radius: 12px`, the same
   `13px/1.45 system-ui` type scale, the same `padding: 16px` inside the card. Its **width stays the popup's own** —
   `320px` — and it must not become the settings `360px`. `src/popup/index.html` gains the `body { margin: 0 }` rule the
   options document already has (answer `Q1`), and the card fills the panel edge to edge.
3. **No mascot, no new string** (`A142`). No image, no new Russian sentence, no new key in `POPUP_STRINGS`.
4. **The row's `Удалить` becomes an icon-only trash button** (`A143`): its only child is an inline `<svg>` glyph, the
   Russian word `Удалить` moves to `aria-label` **and** `title`, and the glyph is `aria-hidden` with `focusable="false"` —
   the shape `src/content/overlay/action-icons.tsx` documents for the page widgets. The hit box is `24px` with a `16px`
   glyph (answer `Q5`), declared as named constants so a test can read them from the source text.
5. **The delete behaviour is unchanged.** One press still means **one** core `deleteEntriesOfAuthor` for the whole author
   group, own or foreign, and no per-entry loop (`A25`, `A108`). The row still renders for every author, and a foreign row
   keeps it.
6. **The checkbox is styled to the palette** (answer `Q3`): the box's border uses `#a6cbdc`, the accent (the checked fill)
   uses the `A125` primary action `#b8480d`, and the label keeps the `13px` scale. It stays a real `<input
   type="checkbox">` with its aggregate `checked` binding and its `change` handler — no custom control replaces it.
7. **The empty state and the notices take the `A125` inks** (answer `Q4`): the empty line in `#7b6a55`, the refusal lines
   in `#b3261e`, and the `name_required` button keeps its underline and stays a real `<button>` that calls
   `openSettings()`.
8. **The popup-look pins are written, and they are the first ones.** A new suite reads the popup's stylesheet and template
   the way `tests/options-window-look.spec.ts` reads the options surface: the palette roles by literal value, the card
   shape (border, radius, padding, the `320px` width and the **absence** of a `360px`), the absence of the three retired
   colours, the trash button's shape (`aria-label`, `title`, `aria-hidden`, the two size constants), and the styled
   checkbox. **Say in the report which of these assertions would go red for each of: a palette role changed, the width
   changed to `360px`, the trash button turned back into a labelled button** — and prove at least two of them with
   mutations you apply, observe and revert **from a `cp` copy**.
9. **The two describe titles that name the labelled button are restated.** `tests/popup-entry-list.spec.ts`:
   `AC3 a foreign row is marked foreign and keeps Удалить` and `AC5 the group Удалить removes the row immediately`. Their
   assertions are behaviour and stay; their **titles** name a control that no longer prints a word. Rewrite the titles,
   keep every assertion, and keep the `Удалить` string pinned in `src/popup/text.ts` (it is still the accessible name).
10. **The duplication is stated where it lives.** The trash glyph cannot be imported from
    `src/content/overlay/action-icons.tsx` — that is a **Preact** module under `src/content/` and the popup is Angular, and
    `tests/toolchain-contract.spec.ts` pins the boundary. Re-declare the glyph in `src/popup/popup.component.ts` in the
    popup's idiom, and put the reason in a comment at that declaration (`S14-4`). Do not add a cross-layer import.
11. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the popup contract bullet (`:155`) gains
    the look rules — palette, card shape, width, the icon-only delete, the styled checkbox — referencing `A140`–`A143`,
    and **AC 26** (`:290`, the popup group row) is checked and corrected only if it is now wrong. The Terms / Aliases
    table gains nothing unless a new term is needed; if it is, say which row and why.
12. **Nothing else moves.** No `src/content/`, `src/core/`, `src/options/`, manifest, asset or icon change. No new
    dependency, no network call. `dist/` stays **12 files**.

## Out of scope

- `S11-1`/`S12-1`/`S14-1` (the `A125` palette's provenance is the replaced artwork). Extending a stale-provenance palette
  is this task's premise, not its subject.
- The page overlay's own colours (`A94`/`A102` paint slots) — the popup is an extension surface.
- Any behaviour change: no new row control, no filter, no edit affordance.

## Constraints

- Never weaken or delete a pin. Baseline **1033 tests / 46 files**; the count may only grow.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- Gates in profile order: `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently 176 info),
  `npm run typecheck`. Quote exit codes, the test count, the `dist/` count. Print no full test log.
- `README.md` is the PM's.
- **Order: implement → gates → commit → then write `docs/state/t14-01-engineer.md` in one `write` call → paste the report
  into the final message as well.**
- One commit. `docs/state/` is the PM's except your own report. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
