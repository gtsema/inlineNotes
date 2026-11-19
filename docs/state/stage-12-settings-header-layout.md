# Stage 12 — the settings header centres, and the name hint becomes a parenthetical

Opened by the owner's request (2026-11-19): «Нужно на странице настроек картинку сделать по центру, а подпись "Настройки
inlineNotes" под ней по центру. А фразу "это имя подписывает каждую заметку" нужно сделать в скобочках курсивом после
лейбла "Имя"».

Three observable changes, all on the settings surface, none of them touching the popup or the page overlay.

## Rulings

| Ruling | Decision |
|---|---|
| `A134` | The `settings mascot` and the title become a **centred column**: the mascot on its own line, the `settings title` centred under it. The title stops sitting beside the artwork, so the header is no longer a row. |
| `A135` | The `name explanation line` moves from its own paragraph under the header to a **parenthetical in italics immediately after the `Имя` label**, on the same line. The string keeps its wording and its text exactly; the parentheses are added by the template, not by the string. |
| `A136` | The hint's placement change **does not touch `src/options/text.ts`**: `OPTIONS_STRINGS.nameHint` stays `Это имя подписывает каждую заметку` so the `t9-02` AC 4 pin (key set, four untouched strings, one added) keeps its meaning. The `(…)` and the `font-style: italic` are presentation. |

## What the change breaks, and why that is the point

Three pins were written for the old arrangement and each has to move to the new one **without being weakened**:

- `tests/options-window-look.spec.ts:750-761` pins the header as a row: the mascot before the title, inside one
  `<header>`. With a centred column the order assertion is still true but the "row" reading is not; the pin becomes
  "the mascot is the first child of the header and the title the second, each on its own line" — an order and
  containment claim, not a sibling-index claim.
- `:1293-1302` pins the label and the hint as **separate** elements with fixed markup
  (`<label class="label" …>{{ nameLabel }}</label>` and `<p class="hint">{{ nameHint }}</p>`). The hint is no longer a
  paragraph of its own, so both pins are rewritten for the new shape, and the *count* of the label and the input stays
  one each.
- `:107` maps every rule body to the component that owns it; a new `.hint` position and a new centred header mean the
  rules move between selectors, and the mapping has to follow rather than be deleted.

## Questions for the owner, each with the default the PM will take

**Q1 — the title's own styling.** With the title centred under the mascot, does it keep `font-size: 15px` and weight
`600`, or grow into a real heading (for example `18px`)? *Default: keep both exactly as they are* — the request was about
position, not size.

**Q2 — the gap between the artwork and the title.** The current header has `gap: 12px` between the two in a row. In a
centred column the same value becomes vertical. *Default: keep `12px`*, and let the header's own bottom margin stay
`8px` so the hint's old space collapses into the new arrangement.

**Q3 — the parenthetical's exact form.** «`Имя` *(*Это имя подписывает каждую заметку*)*» — with a space before the
opening parenthesis or not? *Default: one space* between the label and `(`, because the label is bold and the
parenthesis is not, and the space keeps them from touching.

**Q4 — the label line and the field.** Does the input stay directly under the label line (so the parenthetical sits
above the field, pushing it down), or does the parenthetical go **after** the label in a way that keeps the field where it
is? *Default: the input stays immediately under the label line*, which is the normal reading of "after the label".

## Verdict

**Accepted** on attempt 1 — `846b798` + report `149d753`; review `316fc3f5-27f8-4da5-bd21-0d19abcbac58` found **no blocking finding**
and confirmed that **no old-arrangement claim survives** anywhere in prose or test names (the only two remaining mentions are
intentional comments explaining the rule map's history).

Gates re-run by the PM on `846b798`: `npm run build` 0, `dist/` **12 files**; `npm test` 0 — **1032 tests / 46 files** (baseline
1031, +1 case); checker 0 — **176 info**; `npm run typecheck` 0. `src/options/text.ts` is absent from the commit's file list and
`OPTIONS_STRINGS.nameHint` is unchanged.

## Ledger

| Row | What is unresolved | Class |
|---|---|---|
| `S12-1` | `A125`'s palette is still sampled from the artwork `t11-01` replaced (`S11-1`); this stage adds no colour, so it stays untouched. | ruling + spec |
| `S12-2` | The `name explanation line` was introduced by `t9-02` AC 4 as «the only Russian sentence this surface gained», and its spec bullet said it is «rendered under the header». Corrected in `846b798`. **Closed.** | spec |
| `S12-3` | The `Q3` «one space before the parenthesis» is pinned only through a whitespace-collapsing read (`replaceAll(/\s+/g,' ')` then `toBe('ИМЯ (ЭТО_ИМЯ)')`), so a two-space or newline gap between `</label>` and `<span class="hint">` still passes. The claim is about one space; the pin cannot see two. | test |
| `S12-4` | The new `'.label-line': '.options'` row in the rule-to-component map is never exercised: `.label-line` declares no `color:`, so the pair walk never reaches it. Harmless and permissive, recorded so the row is not mistaken for a live assertion. | test |
| `S12-5` | `:host { padding: 16px }` means the centred column is centred on the `.options` **content box**, not on the dialog box's axis. The engineer stated this openly and did not change it. Whether the mascot should sit on the dialog-box axis is a `:host`/`.options` decision, and the owner has not seen it yet. | ruling + look |

## Answers (owner, 2026-11-19): `дефолты`

All four defaults stand: the title keeps `font-size: 15px` / `font-weight: 600`, the header gap stays `12px` (vertical),
there is one space before the opening parenthesis, and the input stays immediately under the label line with the
parenthetical above it. The brief is `docs/state/t12-01-settings-header-layout.md`.

`Q4`'s other reading was named in the question pool and rejected by the default: the field does **not** stay put with the
parenthetical moved elsewhere — the label line now carries both the label and the parenthetical, and the input follows it.
