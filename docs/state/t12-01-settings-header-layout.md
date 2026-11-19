# t12-01 — the settings header centres, and the name hint becomes an italic parenthetical

Stage 12 (`docs/state/stage-12-settings-header-layout.md`). Owner's answers: **`дефолты`** for all four questions —
title styling unchanged, `12px` gap, one space before the parenthesis, the input stays immediately under the label line.

## Goal

The settings window reads as a centred product screen: the mascot centred, the title centred under it, and the one
explanatory sentence moved from a paragraph of its own into an italic parenthetical after the `Имя` label.

## Acceptance criteria

1. **The header is a centred column.** `src/options/options.component.ts`'s `.header` rule lays the mascot and the title
   out **vertically, both centred on the window's horizontal axis** — the artwork on the first line, the title on the
   second. The `<header class="header">` element, the `img.mascot` element and the `h1.title` element all stay: the
   mascot is still the header's first child and the title its second, in that order.
2. **The mascot's own frame is untouched.** `width: 80px`, `height: 80px`, `border-radius: 50%`, `object-fit: contain`,
   `object-position: center` and the `2px solid` `A125` decorative border all stay exactly as they are (`A124`, `A127`,
   `A129`, and the `t11-01` framing). Only the header's layout changes.
3. **The title keeps its own styling.** `font-size: 15px`, `font-weight: 600`, `margin: 0`, `min-width: 0` — unchanged
   (`Q1`). Only its position changes.
4. **The gap is vertical and still `12px`** (`Q2`), and the header's bottom margin stays `8px`.
5. **The `name explanation line` becomes an italic parenthetical after the `Имя` label** (`A135`). The rendered text is
   `Имя (Это имя подписывает каждую заметку)` — one space between the label and the opening parenthesis (`Q3`) — and the
   parenthetical part is italic. The parentheses and the italics are **presentation owned by the template and the
   stylesheet**; they are not added to the string.
6. **`src/options/text.ts` is not touched.** `OPTIONS_STRINGS.nameHint` stays exactly
   `Это имя подписывает каждую заметку` (`A136`), so the `t9-02` AC 4 pin — the key set of `OPTIONS_STRINGS`, the four
   strings that shipped before that task, and the one it added — keeps its meaning. **If you find yourself editing
   `text.ts` to add a bracket, stop and report it.**
7. **The label, the input and the counter keep their behaviour.** `for="author-name"`, `id="author-name"`, the value
   binding, the input handler, the counter element and the save button are unchanged, and the input is still immediately
   under the label line (`Q4`).
8. **The pins that describe the old arrangement are rewritten, not deleted.** At minimum:
   - `tests/options-window-look.spec.ts:750-761` — the header case. Its claim becomes "the mascot is the header's first
     child and the title its second, each on its own line, both centred", keeping the `alt=""` assertions.
   - `:1293-1302` — the label and the hint case. The hint is no longer a paragraph of its own; pin the new shape (the
     label line carries the label and the parenthetical), keep the label/input/counter/button assertions, and keep the
     "the template owns no wording" property the same describe already pins.
   - `:107` — the rule-to-component map. Every rule this change moves or adds is mapped to the component that owns it,
     and no rule is dropped from the map.
9. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`:
   - the `name explanation line` row of the **Terms / Aliases** table (`:51`) says the line is under the header — false
     after this change; restate where it now sits;
   - the bullet at `:94` says the same thing in prose; correct it there too;
   - state the new header arrangement and the parenthetical shape as facts, and reference `A134`/`A135`/`A136`.
   - **`AC 28`** (`:292`) describes the settings window's look; check it and correct it only if it is now wrong.
10. **Nothing else moves.** No popup file, no `src/content/`, no `src/core/`, no manifest, no asset, no palette value
    (`A125` is untouched — the new elements reuse the existing hint colour `#7b6a55`). No new Russian string, no new
    dependency, no network call.
11. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs`,
    `npm run typecheck`. `dist/` stays **12 files**. Baseline **1031 tests / 46 files**; the count may only grow.
    `README.md` is the PM's.

## Out of scope

- `S11-1` / `S12-1` (the `A125` palette still sampled from the replaced artwork).
- Any change to the popup, the content overlay, the manifest or the icons.
- Any wording change to any Russian string.

## Constraints

- Never weaken or delete a pin other than the ones AC 8 names; rewriting a pin for a new layout is expected, deleting one
  is not.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t12-01-engineer.md` in one `write` call → paste the report
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
