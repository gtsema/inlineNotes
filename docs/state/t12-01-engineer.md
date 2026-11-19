# t12-01 — engineer report: the settings header centres, and the name hint becomes an italic parenthetical

Task `t12-01` (`docs/state/t12-01-settings-header-layout.md`), Stage 12 rulings `A134`, `A135`, `A136`.
One commit: `846b798`. Attempt 1.

## Changed paths

| Path | What changed |
|---|---|
| `src/options/options.component.ts` | `.header` gains `flex-direction: column` (keeps `display: flex`, `align-items: center`, `gap: 12px`, `margin: 0 0 8px`); the `<p class="hint">{{ nameHint }}</p>` under the header is replaced by one `<p class="label-line">` carrying `<label class="label" for="author-name">{{ nameLabel }}</label>` and `<span class="hint">({{ nameHint }})</span>`; `.label` becomes `display: inline`, `.label-line` takes the old `margin: 0 0 4px`, `.hint` loses its old `margin: 0 0 12px` and gains `font-style: italic` with the unchanged `#7b6a55` ink. The `styles` doc comment and the component banner name the new arrangement and rulings. |
| `tests/options-window-look.spec.ts` | The three pins AC 8 names are rewritten; one new case is added beside them; the rule-to-component map gains one row. |
| `docs/specs/content-overlay-ui.md` | `:51` (Terms row), `:94` (bullet), the mascot bullet, and item `28` restated for the centred column and the parenthetical, referencing `A134`/`A135`/`A136`. |

Not touched, by constraint: `src/options/text.ts`, `src/popup/`, `src/content/`, `src/core/`, `src/manifest.json`,
`src/options/assets/`, `src/icons/`, `angular.json`, `README.md`, `docs/state/` (other than this report), `dist/`.

## The shipped template, as it now reads

```
      <header class="header">
        <img class="mascot" src="assets/cat-mascot.png" alt="" />
        <h1 class="title">{{ title }}</h1>
      </header>

      <p class="label-line">
        <label class="label" for="author-name">{{ nameLabel }}</label>
        <span class="hint">({{ nameHint }})</span>
      </p>
      <input class="input" id="author-name" … />
```

Rendered text of the label line: `Имя (Это имя подписывает каждую заметку)` — the label, one space, the bracketed
sentence in italics. `src/options/text.ts` is byte-unchanged, so `OPTIONS_STRINGS.nameHint` is still
`Это имя подписывает каждую заметку` and the `t9-02` AC 4 pin keeps its meaning (`A136`).

## AC self-check, line by line

| AC | Status | Evidence |
|---|---|---|
| 1 — header is a centred column | met | `.header` = `display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 0 0 8px`. `<header class="header">` still holds `img.mascot` first and `h1.title` second. Pinned by the rewritten header case: the header's child tags in order are `['img','h1']`, and `flex-direction: column` + `align-items: center` are read from the stripped stylesheet, with `flex-direction: row` pinned absent. |
| 2 — mascot frame untouched | met | `.mascot` is byte-identical to `HEAD~1`: `width: 80px; height: 80px; flex: none; border-radius: 50%; object-fit: contain; object-position: center; border: 2px solid #a6cbdc`. The existing geometry case (`t9-02`/`t11-01`) is untouched and green. |
| 3 — title styling unchanged | met | `.title` is byte-identical: `min-width: 0; margin: 0; font-size: 15px; font-weight: 600`. `Q1` default honoured. |
| 4 — gap vertical, still `12px`; header bottom margin `8px` | met | Both pinned in the header case (`gap: 12px`, `margin: 0 0 8px` read from the stripped `.header` body). |
| 5 — parenthetical after `Имя`, italics, one space | met | `<span class="hint">({{ nameHint }})</span>` follows the label inside the same `<p class="label-line">`; the case strips the tags and asserts the rendered line normalizes to `ИМЯ (ЭТО_ИМЯ)` (label, one space, bracket, no second space), and asserts `font-style: italic` on `.hint`. Brackets live in the markup around the interpolation; the case pins `OPTIONS_STRINGS.nameHint` has no `(` or `)`. |
| 6 — `text.ts` untouched | met | `git show --name-only HEAD` lists no `text.ts`; `git diff HEAD~1 -- src/options/text.ts` is empty; the `t9-02` AC 4 key-set/verbatim pin ("adds the name explanation line and moves no existing string") is unchanged and green. |
| 7 — label/input/counter behaviour unchanged | met | `for="author-name"`, `id="author-name"`, `[value]`, `(input)`, `<p class="counter">`, the save button and the message line keep their pins in the same case; the input is pinned to follow the label line (the `</p>` of the label line sits before `<input`), one `<label>` and one `<input>` in the template. |
| 8 — the three pins rewritten, not deleted | met | Header case `:750-761` rewritten (new title, new column/centre/gap/margin assertions, `alt=""` assertions kept). Label-and-hint `:1293-1302` rewritten: the old `<p class="hint">{{ nameHint }}</p>` assertion removed from the bindings case and replaced by a dedicated case for the new label-line shape, keeping the label/input/counter/button assertions and the "template owns no wording" property (that case is untouched and green). Map at `:107`: every prior row kept, `.label-line` added. No pin was dropped; the suite grew 1031 → 1032. |
| 9 — spec follows in the same commit | met | `:51` terms row now says "parenthetical in italics on the `author-name field`'s label line"; `:94` bullet says the same in prose and names `A135`/`A136`; the mascot bullet says "above the existing title (the header is a centred column since ruling `A134`)"; item `28` was **wrong** after the change ("next to the existing title", "states the `name explanation line` under the header") and is corrected to the centred column and the label-line parenthetical with `A134`/`A135`/`A136`. |
| 10 — nothing else moves | met | No popup/content/core/manifest/asset/palette change: `.mascot` and `.options` keep `#a6cbdc`, `.hint` keeps `#7b6a55`; the colour-literal set pin ("no color outside the pinned palette") is green; no new Russian string, no new dependency, no network call (`git show --stat` = 3 files). |
| 11 — gates green, counts quoted | met | Build exit 0, `dist/` = **12 files**; test exit 0, **1032 tests / 46 files**; checker exit 0, **0 errors / 0 warnings / 176 info**; typecheck exit 0. `README.md` untouched. |

## Commands run (profile order)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm run build` | 0 | `[build] dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f` = 12 |
| 2 | `npm test` | 0 | `Test Files 46 passed (46)`, `Tests 1032 passed (1032)` |
| 3 | `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 176 info(s)` |
| 4 | `npm run typecheck` | 0 | three `tsc --noEmit` projects, no diagnostics |

The checker's 176 lines are byte-identical to the run over `HEAD~1`'s spec (verified by diffing the `INFO` lists of two
runs: one in this tree, one over a copy of the docs at `HEAD~1`). An earlier draft of the spec added **two** `INFO` lines
because it named `src/options/text.ts` a second time in a bullet and spelled a `<span class="hint">` token; both were
reworded so the info set is unchanged. Nothing was suppressed and the checker is unmodified.

## Pin proofs — every new claim fires when the code is mutated

Each mutation was applied, the file ran, and the file was restored **from a `cp` copy** (`/tmp/t1201/final.ts.orig`,
`final-text.ts.orig`, `final-spec.orig`; `diff -q` after the loop: ALL-RESTORED). No `git checkout` was used.

| Mutation | Result |
|---|---|
| `.header` loses `flex-direction: column` (back to a row) | 1 failed — the header case |
| `.hint` loses `font-style: italic` | 1 failed — the label-line case |
| `gap: 12px` → `gap: 8px` | 1 failed — the header case |
| `align-items: center` → `flex-start` | 1 failed — the header case |
| `.header` `margin: 0 0 8px` → `0 0 4px` | 1 failed — the header case |
| `({{ nameHint }})` → `{{ nameHint }}` (brackets out of the markup) | 1 failed — the label-line case |
| the hint put back as `<p class="hint">` under the header | 1 failed — the label-line case |
| brackets added to the string in `text.ts` | 2 failed — the label-line case **and** the `t9-02` AC 4 verbatim pin |

## Deviations and notes

- **`.label` changed from `display: block; margin-bottom: 4px` to `display: inline`, and the 4 px moved onto
  `.label-line`.** Without this the label would be a block and the parenthetical would wrap onto a second *visual*
  line inside the `<p>` — the template would be one line and the screen two. The 4 px is unchanged in value and still sits
  between the label line and the input, which is `Q4`'s "the input stays immediately under the label line". No palette
  value, string or permission changed.
- **The `.hint` class is reused** rather than a new class name. It keeps the `A125` hint ink `#7b6a55`, so the pinned
  colour-literal set and the contrast-pair walk need no new colour; the map
  (`TEXT_ROLE_BACKGROUND`) keeps the `.hint → .options` row and gained `.label-line → .options`.
- **`padding: 16px` on `:host` was left alone.** With the centred column the mascot sits 16 px in from the dialog box
  edge while the card's inner content sits 32 px in, so the artwork is 16 px left of the card's content axis, not exactly
  on the dialog box's centre. I did **not** touch it: the brief's AC 1 asks for "centred on the window's horizontal axis"
  within the header, AC 10 forbids anything else moving, and the horizontal padding predates this task. If the owner
  means the mascot should be centred on the *dialog box*, that is a `:host` or `.options` padding decision and needs its
  own ruling rather than a silent change here.
- **Item 28 of the spec was factually wrong after the change**, not just stale: it said "next to the existing title" and
  "states the `name explanation line` under the header". AC 9 said to correct it "only if it is now wrong" — it was, so
  both halves are restated.
- **Attempt 1 of the gates was red** on one case: I had removed the `.hint` row from `TEXT_ROLE_BACKGROUND` on the theory
  that `.hint` no longer declares an ink — it still does, so the pair walk threw. Restored the row; the final gate run is
  the one quoted above. Recorded here because the red run exists in the transcript.
- Out of scope and untouched: debt row `S12-1` (`A125`'s palette still sampled from the artwork `t11-01` replaced).

## Open questions

None blocking. One decision for the PM/owner is stated above as a deviation, not a question: whether the mascot should be
centred on the **dialog box** (which would need `:host`/`.options` padding to change) or on the **header** (as shipped).