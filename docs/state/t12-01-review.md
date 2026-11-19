I have all I need. The output path directory may not exist, and I have no write tool — I'll return the artifact in full as instructed.

---

# Review — `t12-01`

**Task:** `t12-01` — the settings header becomes a centred column (`A134`), the name hint an italic parenthetical after the `Имя` label (`A135`, `A136`).
**Range:** `846b798` (code + tests + spec), report in `149d753`.
**Spec section:** `docs/specs/content-overlay-ui.md` — Terms row `name explanation line` (`:51`), Settings-window bullets (`:92`, `:93`, `:94`), item `28` (`:292`).
**Reviewer reads:** brief `docs/state/t12-01-settings-header-layout.md`, stage record `docs/state/stage-12-settings-header-layout.md`, report `docs/state/t12-01-engineer.md`, `docs/specs/code-review-flow.md`, `docs/specs/INDEX.md`, the three-file diff and the shipped tree. Read-only; no file was edited. `node scripts/check-agent-config.mjs` re-run by me.

## Verdict

**accepted**

Every acceptance criterion is `pass`, there is no blocking finding, and the gate output is quoted in the report and corroborated on the tree (`dist/` 12 files, checker 176 info / 0 errors / 0 warnings, both re-read by me; the brief also quotes the PM's own re-runs of build/test/typecheck at exit 0).

`Carried-fix checklist`: **none** — the brief states no carried fixes, and the report leaves no numbered deliverable unanswered.

## Acceptance criteria — one line each

1. **AC 1 — header is a centred column** — `pass`. Shipped `.header` (`src/options/options.component.ts:121-127`) is `display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 0 0 8px`; the template keeps `<img class="mascot">` first and `<h1 class="title">` second inside one `<header class="header">` (`:64-67`). Pinned by `tests/options-window-look.spec.ts:756-783`: header child tags in order equal `['img','h1']`, `flex-direction: column` present with `flex-direction: row` pinned absent, `align-items: center` present.
2. **AC 2 — mascot frame untouched** — `pass`. `.mascot` (`:129-137`) is byte-identical to the parent commit (`width:80px; height:80px; flex:none; border-radius:50%; object-fit:contain; object-position:center; border:2px solid #a6cbdc`); the diff touches no line of it. The existing `t9-02`/`t11-01` geometry case is untouched and green.
3. **AC 3 — title styling unchanged** — `pass`. `.title` (`:139-144`) is `min-width:0; margin:0; font-size:15px; font-weight:600`, byte-identical to `HEAD~1`.
4. **AC 4 — gap vertical and still `12px`, bottom margin `8px`** — `pass`. `gap: 12px` and `margin: 0 0 8px` are read from the stripped `.header` body by the header case (`tests/options-window-look.spec.ts:781-783`); the column direction makes the gap vertical.
5. **AC 5 — italic parenthetical, one space, brackets in presentation** — `pass`. Markup is `<span class="hint">({{ nameHint }})</span>` after the label inside `<p class="label-line">` (`src/options/options.component.ts:69-72`); `.hint` carries `font-style: italic` with the unchanged `#7b6a55` (`:150-153`). The rendered string is `Имя (Это имя подписывает каждую заметку)` (`Q3` one space) and `OPTIONS_STRINGS.nameHint` has no bracket. Pinned at `tests/options-window-look.spec.ts:1359-1386`.
6. **AC 6 — `src/options/text.ts` not touched** — `pass`. `git show --name-only 846b798` lists three files and no `text.ts`; `git diff 846b798~1 846b798 -- src/options/text.ts` is empty. `OPTIONS_STRINGS.nameHint` is still `Это имя подписывает каждую заметку` (`src/options/text.ts:49`), and the `t9-02` AC 4 pin (`tests/options-window-look.spec.ts:1157-1172`) still asserts the exact key set `['nameHint','nameLabel','save','saved','title']` plus the four pre-existing strings verbatim.
7. **AC 7 — label, input, counter, save behave unchanged** — `pass`. `for="author-name"`, `id="author-name"`, `[value]="draft().value"`, `(input)="onInput($event)"`, `<p class="counter">`, the save button and its `[disabled]="!draft().canSave"`, and the message `@if` keep their pins in the same case (`tests/options-window-look.spec.ts:1326-1334`). The input follows the label line immediately, pinned by `template.indexOf('</p>', …) < template.indexOf('<input')` (`:1353-1356`).
8. **AC 8 — the three pins rewritten, not deleted** — `pass`, and it is the criterion the verdict rests on. Details in the section below.
9. **AC 9 — spec follows in the same commit** — `pass`. `docs/specs/content-overlay-ui.md:51` (Terms row) and `:94` (bullet) no longer say "under the header"; `:92` (mascot bullet) and `:292` (item `28`) were restated. All four reference `A134`/`A135`/`A136`. No other sentence in that spec still describes the old row layout or the old hint paragraph (checked by reading every `hint`/`label`/`explanation line`/`header` occurrence).
10. **AC 10 — nothing else moves** — `pass`. The commit touches exactly three files; no popup/content/core/manifest/asset/palette file appears. `.mascot`/`.options` keep `#a6cbdc`, `.hint` keeps `#7b6a55`, so the pinned palette set is unchanged. No new Russian string (the template carries none), no new dependency (`package.json`/manifest not in the diff), no `fetch`/`XMLHttpRequest`/`WebSocket` in `src/options/`.
11. **AC 11 — gates green, counts quoted** — `pass`. The report quotes build exit 0 with `dist/` = 12 files, `npm test` exit 0 with 1032 tests / 46 files (baseline 1031), checker exit 0 with 176 info, typecheck exit 0; the PM re-ran all four at those numbers. I re-verified independently: `find dist -type f` = 12; `node scripts/check-agent-config.mjs` = `0 error(s), 0 warning(s), 176 info(s)`, exit 0.

## AC 8 in detail — the three rewritten pins

- **Header case, `tests/options-window-look.spec.ts:750-761` before → `:752-783` after.** The new assertion is **stronger**. It keeps every old claim (mascot before title by string index, the exact `img`/`h1` markup, both `alt=""` assertions) and adds the order/containment claim (`children` of the header equal `['img','h1']`) plus `flex-direction: column`, `flex-direction: row` absent, `align-items: center`, `gap: 12px`, `margin: 0 0 8px`. Nothing the old pin checked was quietly dropped; the stale "row" title was replaced.
- **Label-and-hint case, `:1293-1302` before → `:1326-1386` after.** The old case pinned the bindings plus `<p class="hint">{{ nameHint }}</p>`. The rewritten bindings case keeps every binding assertion and drops only the now-false `<p class="hint">` line, which the new dedicated case re-covers as an absence (`expect(template).not.toMatch(/<p class="hint"/)`), keeps the one-label/one-input counts verbatim, holds the "template owns no wording" property in the untouched sibling case (`:1391-1415`, still green), and adds the parenthetical shape, the italic rule, the hint ink, the label-line margin and `display: inline`. The rewrite is at least as strong; the only thing it stopped pinning is the old literal shape, which no longer exists.
- **Rule-to-component map, `:107` before → `:112-120` after.** Every prior row (`.options`, `.hint`, `.counter`, `.input`, `.save`, `.message--saved`, `.message--refusal`) is kept; `.label-line → .options` is added. No row was dropped.
- **The new case** (`renders the name explanation line as an italic parenthetical on the label line, not as a paragraph of its own`, `:1344`) is a real pin and does guard the obvious regression: `not.toMatch(/<p class="hint"/)` plus `indexOf('class="hint"') > indexOf('</header>')` make "hint moved back to a paragraph under the header" a red test; the counterfactual table in the report confirms it fired.

## Blocking findings

**None.**

## Non-blocking findings (debt ledger)

1. `tests/options-window-look.spec.ts:1359-1368` — the `Q3` "one space before `(`" is pinned only through a whitespace-collapsing read (`replaceAll(/\s+/g,' ')` then `toBe('ИМЯ (ЭТО_ИМЯ)')`), so a two-space or newline gap between `</label>` and `<span class="hint">` still passes both `toMatch` regexes and the rendered assertion (I simulated the two-space markup: all three checks stay green). The shipped bytes do carry exactly one space, so behaviour is right; the pin is looser than the AC wording. A future task could pin the exact single-space shape once.
2. `tests/options-window-look.spec.ts:115` — the new `'.label-line': '.options'` map row is never exercised: `.label-line` declares no `color:`, so the pair walk (`:1239-1264`, which looks a rule up only after `declaredTextColors`) never reaches it and adds no pair. Harmless and permissive; recorded so the row is not mistaken for coverage.
3. `src/options/options.component.ts:104` — `:host { padding: 16px }` means the centred column is centred on the `.options` content box, not on the dialog box; the engineer states this openly in the report's deviations and did not change it. Whether the mascot should sit on the dialog-box axis is a `:host`/`.options` decision outside this brief.

## Old-arrangement claims surviving in prose or test names

**None survives.** The pre-change prose and pin title (`next to the existing title`, `under the header`, `a paragraph of its own`) is gone from `docs/specs/content-overlay-ui.md` and `tests/options-window-look.spec.ts`; the only remaining occurrences are the two intentional comment references the PM found — `tests/options-window-look.spec.ts:105` (history phrased as "`.hint` used to be the `<p class="hint">` under the header and is now…") and `:1378-1379` (a comment introducing the `not.toMatch(/<p class="hint"/)` absence claim) — plus `tests/options-window-look.spec.ts:1032`, the `'main > .hint'` entry, which is a negative fixture selector in the `box-sizing` scan (it asserts a fixture with that selector cannot reach an `img`), not a claim about the shipped arrangement. All three are intentional and correct.

## Evidence path

- Verdict recorded to: this artifact (briefed runtime output path).
- Code: `src/options/options.component.ts:64-72, 121-153`.
- Tests: `tests/options-window-look.spec.ts:105-120, 752-783, 1157-1172, 1322-1386`.
- Spec: `docs/specs/content-overlay-ui.md:51, 92, 93, 94, 292`.
- Report: `docs/state/t12-01-engineer.md`; stage record: `docs/state/stage-12-settings-header-layout.md`.
- Gate corroboration (mine): `find dist -type f` = 12; `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 176 info(s)`, exit 0.