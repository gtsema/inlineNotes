# t13-01 — engineer report

Task `t13-01` (`docs/state/t13-01-hint-gap-and-size.md`), stage 13
(`docs/state/stage-13-hint-spacing-and-size.md`), rulings `A137`, `A138`, `A139`, ledger row
`S12-3`. One commit: `c0c82d5`.

## What I chose, and why (AC1's "state which you chose")

**`margin-left: 4px` on the `.hint` rule**, not `gap` and not `padding-left`.

- `gap` would have required making `.label-line` a flex/grid container, which is a change to
  a **second** rule and to the line's own layout — the label line is a `<p>` whose children
  are inline, and AC3 asks that nothing else about the line move.
- `padding-left` on `.hint` is measured from the same edge as `margin-left`, so it is visually
  equivalent, but it would put the 4 px **inside** the parenthetical's own box: the box the
  `.hint` rule already paints (its `#7b6a55` ink, its `font-size: 11px`) would then claim
  background-adjacent space it does not own, and `margin-left` is the property whose name
  says "the distance between this and what precedes it", which is what the ruling describes.
- `margin-left: 4px` is one declaration on the rule the ruling names, it measures the same in
  the browser as either alternative, and it is the smallest step that is not a rounding error.

The template was **not** touched. It keeps exactly one separator between `</label>` and
`<span class="hint">` — the newline HTML already collapses to one word-space — so a second
whitespace character is absent by construction (AC1's other half), and the visible widening
comes only from the declaration.

## What I implemented

| AC | What shipped |
|---|---|
| AC1 | `.hint` gains `margin-left: 4px`. Template untouched: no second whitespace character. Chosen declaration stated above. |
| AC2 | `.hint` gains `font-size: 11px`, keeping `font-style: italic` and `color: #7b6a55`. `.options` keeps `font: 13px/1.45 system-ui, sans-serif`, so the label still inherits `13px`. |
| AC3 | The label, its `for="author-name"`, the input and its bindings, the counter, the save button, `.label-line { margin: 0 0 4px }` and `.label { display: inline }` are byte-unchanged. The rendered text stays `Имя (Это имя подписывает каждую заметку)`. |
| AC4 | `git diff -- src/options/text.ts` is **0 lines**. `OPTIONS_STRINGS.nameHint` is still exactly `Это имя подписывает каждую заметку`. |
| AC5 | New case `declares the gap after the label and the smaller size of the parenthetical`; the collapsing rendered-text assertion is kept and re-documented with its (narrower) job. Proof below. |
| AC6 | `docs/specs/content-overlay-ui.md:51` (Terms row) and `:94` (bullet) both state the declared 4 px gap and the `11px` size and reference `A137`/`A138`. |
| AC7 | No popup, `src/content/`, `src/core/`, manifest, asset, icon or palette value touched. No new Russian string, no dependency, no network call. `dist/` is still 12 files. |
| AC8 | Four gates run in profile order, exit codes quoted below. 1033 tests / 46 files, up from the 1032 / 46 baseline. |

### Where the size went in the Terms row (AC6's "say where you put it and why")

Into the **«Russian UI wording» cell**, beside the sentence, as
``«Это имя подписывает каждую заметку», drawn at **11 px** against the label's inherited **13 px**``.

Reason: that cell is the only column of the row a reader scanning for "what does the reader
see, in what words" reads, and the size is a property of the reader-visible rendering of that
one string, not of any of the mechanics the third column carries. The **gap** went into the
third column instead, because it is not a property of the string at all: it is the distance
between two elements on the line, so it belongs with the sentence that describes the line
(`Имя (…)`, one space before the bracket → a declared 4 px gap before the bracket). The row
now reads: cell 2 = the wording and its size, cell 3 = the line, the gap and the rulings.

## AC5 / `S12-3`: which assertion would go red, and the proof

**Two assertions in the new case would go red if `margin-left` were removed**, and the first is
the one that names the gap:

1. `expect(hint).toMatch(/(?:^|;)\s*margin-left:\s*4px;/)` — `tests/options-window-look.spec.ts:1425`
   (this is **the** assertion for `margin-left`; the literal is read off the stripped `.hint`
   rule body, so a commented-out `margin-left` cannot stand in for a shipped one).
2. `expect(stylesCode.match(/margin-left:/g) ?? []).toHaveLength(1)` — the "one owner" count,
   which is a red only if the property is still declared somewhere else.

The **rendered-text** assertion would stay **green** — that is the whole point of the task, and
I proved that direction too.

### Mutation 1 — remove `margin-left`, observe red, revert from a `cp` copy

Copy made first: `cp src/options/options.component.ts /tmp/copies/options.component.ts`.

Mutation applied (the one declaration removed from the `.hint` body), then
`npx vitest run tests/options-window-look.spec.ts`:

```
× the field, the counter, the button and the message line (…) > declares the gap after the
  label and the smaller size of the parenthetical (t13-01 AC1-AC3, AC5; `A137`, `A138`)
AssertionError: expected '\r\n      font-style: italic;\r\n    …' to match /(?:^|;)\s*margin-left:\s*4px;/
 Test Files  1 failed (1)
      Tests  1 failed | 45 passed (46)
```

Exactly **one** red, and it is the assertion named above. Reverted with
`cp /tmp/copies/options.component.ts src/options/options.component.ts` (never `git checkout`);
the same file re-ran green: `Test Files 1 passed (1) / Tests 46 passed (46)`.

### Mutation 2 — remove `font-size: 11px` (the same shape, for AC2)

Applied, observed, reverted from a `cp` copy:

```
AssertionError: expected '\r\n      margin-left: 4px;\r\n      …' to match /(?:^|;)\s*font-size:\s*11px;/
 Test Files  1 failed (1)
      Tests  1 failed | 45 passed (46)
```

Green again after the revert (`font-size: 11px` present once).

### Mutation 3 — a second space character in the template (the change AC1 forbids)

Applied a second space before `<span class="hint">`, then ran the whole file:

```
 Test Files  1 passed (1)
      Tests  46 passed (46)
```

**Green.** This is `S12-3` written down as a measurement rather than as prose: a second space in
the markup is invisible to every assertion on this surface — including the rendered-text one,
which collapses it to the same single space — which is exactly why the gap had to be a
declaration and why the new case reads the rule body. Reverted from the `cp` copy.

The new case also pins the absence of that non-change: the separator between `</label>` and
`<span class="hint">` must be **one newline plus its indentation and nothing else**
(`/^\r?\n[ ]+$/`, and every character past the two-character newline is a space, with no tab),
so a future second space or a second newline in the template is a red test rather than a silent
edit. That read is deliberately **line-ending agnostic** (`\r?\n`): this repository checks its
sources out with `\r\n`, and a pin on the checkout's line endings would be a pin on git config.

## The one read of the spec I rewrote, and why it is not a weakening

The rendered-text assertion keeps every character of its old claim and gains a statement of what
it can answer. It is **not** deleted, **not** narrowed and **not** weakened; the new case is
additional. The comment above it now says what the spec sentence at `:94` says: the
whitespace-collapsing read answers for the **wording** of the line, and the declaration read
answers for the **gap** and the **size**.

## Files changed

| Path | Change |
|---|---|
| `src/options/options.component.ts` | `.hint` gains `margin-left: 4px` and `font-size: 11px`; the class doc-comment gains the `t13-01` paragraph that says why they are declarations. |
| `tests/options-window-look.spec.ts` | New case + two named constants (`HINT_GAP`, `HINT_SIZE`, `SURFACE_BASE_SIZE`) + the re-documented rendered-text assertion. +84 lines. |
| `docs/specs/content-overlay-ui.md` | `:51` Terms row and `:94` bullet: declared 4 px gap, `11px` size, `A137`/`A138`, and the `S12-3`/`A139` statement of what each assertion answers. |

`src/options/text.ts`, `src/popup/`, `src/content/`, `src/core/`, `src/manifest.json`,
`src/options/index.html`, `angular.json`, `README.md`: untouched.

## Commands run

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | `dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f \| wc -l` = **12** |
| `npm test` | 0 | `Test Files 46 passed (46)`, `Tests 1033 passed (1033)` — baseline was 1032 / 46 |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 176 info(s)` — unchanged |
| `npm run typecheck` | 0 | `tsc -p tsconfig.content.json && -p tsconfig.app.json && -p tsconfig.spec.json --noEmit` |

No full test log is quoted; only the summary lines above.

## Open questions

None that block. Three notes for the PM, none of them a request:

1. `S13-2` (the `11px` value reads wrong in the real window) is a one-line change and is
   unverified by eye in this slice — no browser was loaded for a look, because the brief asks
   for the gates and the mutation proof and `dist/` was only checked for its file count.
2. `S13-1` / `S12-5` (the centred column sits on the card's content box, not the dialog box
   axis) is out of scope by the brief and is untouched.
3. The Terms row's «Russian UI wording» cell now carries a size next to the wording. If the PM
   would rather that cell stay wording-only, the size sentence is a clean move into the third
   column — the same text, one cell over, and `docs/specs/content-overlay-ui.md:51` is the only
   place to edit.
