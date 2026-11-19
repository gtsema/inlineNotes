# t13-01 — a declared 4 px gap after `Имя`, and an 11 px parenthetical

Stage 13 (`docs/state/stage-13-hint-spacing-and-size.md`). Owner's answers: **`1. 4px`**, **`2. 11px`** — so `Q1a` and
`Q2a`, both measured values, no judgement left in the slice.

## Goal

The parenthetical after the `Имя` label is visibly separated from the label and visibly smaller than it, and the pin that
claims the spacing can actually see the spacing it claims.

## The measured starting point

The shipped label line is

```html
<p class="label-line">
  <label class="label" for="author-name">{{ nameLabel }}</label>
  <span class="hint">({{ nameHint }})</span>
</p>
```

The newline between the two elements **already renders as one collapsible space**, so the reader's «пробел» was a request
for a wider gap, not for a missing one. A second whitespace character would collapse to the same single space and be
invisible. `A137` therefore rules that the gap is a **declaration**.

## Acceptance criteria

1. **The gap is declared, not typed.** `.hint` gains an explicit `margin-left: 4px` (`A137`), or an equivalent declared
   space on the label line (`gap`, `padding-left`) that measures the same in the browser — state which you chose and why.
   **No second whitespace character is added to the template**: a change that only inserts a space is not a change the
   reader can see, and it is a failed AC.
2. **The parenthetical is `11px`.** `.hint` gains an explicit `font-size: 11px` (`A138`), on top of its existing
   `font-style: italic` and its unchanged `#7b6a55` ink (`A125`). The label keeps inheriting the surface's `13px`.
3. **Nothing else about the line moves.** The label, its `for="author-name"`, the input and its bindings, the counter, the
   save button, the label line's own `margin: 0 0 4px`, and `.label { display: inline }` are unchanged. The rendered text
   stays `Имя (Это имя подписывает каждую заметку)` — only the spacing between the two parts and the parenthetical's size
   change.
4. **`src/options/text.ts` is still not touched.** `OPTIONS_STRINGS.nameHint` stays exactly
   `Это имя подписывает каждую заметку` (`A136`). The gap and the size are presentation.
5. **`S12-3` closes: the pin can now see the gap it claims.** The existing assertion compares a whitespace-collapsed
   string, so it cannot distinguish one space from four pixels. Add a pin that reads the **declaration** — the `.hint`
   rule body carries the gap (and the `11px` size) — and keep the rendered-text assertion for the wording. The point is
   that a future change to the gap is a red test, not a silent edit: name in the report which assertion would go red if
   `margin-left` were removed, and prove it with a mutation you apply, observe and revert **from a `cp` copy**.
6. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the `name explanation line` row (`:51`)
   and the bullet (`:94`) both describe the parenthetical — state the declared gap and the smaller size, and reference
   `A137`/`A138`. If the Terms row's «Russian UI wording» cell is the right place for the size, put it there; if not,
   say in the report where you put it and why.
7. **Nothing else moves.** No popup, `src/content/`, `src/core/`, manifest, asset, icon, or palette value. No new Russian
   string, no new dependency, no network call. `dist/` stays **12 files**.
8. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently
   **176 info**), `npm run typecheck`. Baseline **1032 tests / 46 files**; the count may only grow. `README.md` is the
   PM's.

## Out of scope

- `S12-5` / `S13-1` (the centred column sits on the card's content box, not the dialog box axis) — the owner has not
  answered Run 8 on it.
- The `A125` palette re-sampling (`S11-1` / `S12-1`).
- Any wording change.

## Constraints

- Never weaken or delete a pin. Rewriting the spacing pin for the declaration is expected; deleting the wording pin is
  not.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t13-01-engineer.md` in one `write` call → paste the report
  into the final message as well.**
- One commit for code + tests + spec. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
