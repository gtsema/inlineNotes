# t14-04 engineer report — the popup width goes back to the component, and the frame comes back thicker

**Task:** `t14-04` (Stage 14 follow-up). **Brief:** `docs/state/t14-04-popup-width-back.md`.
**Rulings:** `A146` (the popup cannot be rounded — measurement), `A147` (the width goes back to the
component), `A148` (the card carries a `2px` `#a6cbdc` frame with a `12px` radius).
**Commit:** `7b30271` — `t14-04: return the 320px to the popup card and give it a thicker A148 frame`.
**One commit, four files.** `dist/` **12 files**, `test_img/` and `README.md` untouched.

---

## 1. What changed and why

### 1.1 `src/popup/popup.component.ts` — the card owns the width and the frame

`.popup` now reads:

```css
.popup {
  box-sizing: border-box;
  width: 320px;
  border: 2px solid #a6cbdc;
  border-radius: 12px;
  padding: 16px;
  font: 13px/1.45 system-ui, sans-serif;
  color: #1b2a33;
}
```

`width: 320px` is the `A147` revert. `A145` moved the width with the surface and put `width: 100%`
on `body`; in a popup that percentage resolves against a narrow initial containing block, so the
surface collapsed to `100px` with `66px` of content and the title, the notice and the empty state
each wrapped to three lines. The old `320px` was doing real work, so it comes back **on the
component**, as the brief orders. `box-sizing: border-box` stays, so the `320px` still includes the
`16px` padding and the `2px` border.

`border: 2px solid #a6cbdc` and `border-radius: 12px` are `A148`: the reader's answer to `A146`
was «верни скруглённую рамку, но сделай её потолще чем была». The colour is the `A125` decorative
role, not a new literal. The `2px` width is a **PM default** — the reader's word «потолще» carries
no number — and it is stated here as the brief requires: **`2px solid #a6cbdc`, `12px` radius**.
The header comment gained the two new paragraphs (`A147` width, `A146`/`A147` document-paints rule,
`A148` frame) and the old "the component is not the surface" narrative was rewritten to match.

### 1.2 `src/popup/index.html` — the document paints, it does not shape

```css
body {
  margin: 0;
  background: #fdf7ee;
}
```

`border-radius`, `overflow: hidden`, `width: 100%` and `min-height: 100vh` are gone. **`box-sizing:
border-box` is gone too**: with no width, padding or border on this box it is a no-op, and `S14-21`
is the row about a declaration nothing measures. **No geometry remains on `body` at all** — the
brief's "if you keep any geometry on `body`, say which declaration and name the measurement" is
therefore answered by "none". The cream fill stays: that half of `A145` was a real improvement and
it removes the white band at the edges. A block `body` with `width: auto` and `margin: 0` already
fills the panel, so the cream reaches both edges without a geometry declaration.

The HTML comment was rewritten to record the measurement and to narrow the "no frame" sentence to
**this document**: no `border`, no `outline`, no `box-shadow` here; the drawn frame lives on the
card (`A148`).

### 1.3 `tests/popup-window-look.spec.ts` — both falsified pins rewritten, not deleted

**16 cases, unchanged in count** (none added, none dropped); the assertion count inside the
rewritten cases grew. The case names now say what each case actually pins:

| Case | What it now claims |
|---|---|
| `declares every A125 role the surface uses as a literal` | unchanged, except the comment that called the card's frame "what `A144` removes" now points at the `A148` frame case. |
| `declares no colour outside the five A125 roles and the kept refusal colour` | unchanged. |
| `retires the three literals of the popup's own former palette` | unchanged. |
| `gives the component its own 320px width and never the settings 360px` | **rewritten.** The width is `.popup`'s again: `width: 320px` pinned present on the card, read from the shipped stylesheet; the document declares no width; `:host` declares no width; `360px` absent from both files; no `max-width` on the card. |
| `draws the 2px A148 frame and its radius on the card while the settings card keeps its own 1px` | **rewritten.** The card's frame and radius are pinned **present** (`POPUP_FRAME`, `CARD_RADIUS`), the settings `1px` string is pinned **absent** from the card and the popup's `2px` string absent from the settings card, exactly one `border` and one `border-radius` in the card's rule, no `outline`/`box-shadow` as a second edge, and the verbatim `rest` scan still refuses a second owner of a drawn edge. |
| `leaves the paint to the document box and keeps the width on the component` | **rewritten.** The paint stays the document's alone; `:host` keeps no geometry at all; the card keeps no clip and no margin; the card's width and frame are excluded from the absence loop and pinned present in the two cases above. |
| `the document box paints the window: the cream fill, the zero margin, no shape and no frame` | **rewritten.** One `<style>` block, one `body` rule, the cream paint and the zero margin stay; the five `A147`-withdrawn declarations are pinned **absent**; the document's frame declarations are pinned absent in both the stripped and the verbatim read. |
| the remaining 9 cases | untouched. |

**Which assertions were removed and why** (the brief's "say which assertions you removed"):

1. `expect(body).toContain('box-sizing: border-box;')` on the document — removed. The declaration
   is gone from the document and is now in `WITHDRAWN_DOCUMENT_SHAPE` as an **absence** claim, so
   the pin moved direction instead of disappearing.
2. The document's `border-radius: 12px` / `overflow: hidden` / `width: 100%` / `min-height: 100vh`
   **presence** assertions — replaced by the same five strings as **absence** assertions in
   `WITHDRAWN_DOCUMENT_SHAPE`. Nothing was dropped; the direction flipped.
3. `expect(card).not.toContain(CARD_FRAME)` and `expect(card).not.toContain(CARD_RADIUS)` on the
   popup card — **deleted**, and this is the one case the brief allows: `A148` reverses the claim
   they made. Their replacement is the presence twin in the same case body, on the same rule body,
   over the same two strings, plus the stronger "exactly one `border`, exactly one `border-radius`"
   count. The settings card's matching **presence** assertions stay, so the settings half of the
   old shared sentence is still load-bearing.
4. The document's "the shape is the whole rule" comment — rewritten to name `A148`, not deleted.

The module doc comment, the constant comments and the "which assertion goes red for which
regression" list were rewritten to the new rule, including the named mutations below.

### 1.4 `docs/specs/content-overlay-ui.md` — the `Popup look` bullets follow

The lead bullet and the `Surface shape` sub-bullet now say: the popup is a **cream rectangle that
fills the window**; the **document box paints** it (cream fill, `margin: 0`, nothing else) and draws
**no frame**; the **component owns the `320px`**; the **card carries the `2px` `#a6cbdc` frame with a
`12px` radius** (`A148`); **no rounding is possible for the popup window in MV3** (`A146`), though a
rounded frame **inside** the square window is; `A146`/`A147`/`A148` supersede `A145`'s shape half.
The sentence "the document box is the surface" is narrowed to "the document box **paints**". The
`Pinned by a look suite` bullet was rewritten to the new presence/absence split. The measurement
(square corners at `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)`; no anti-aliased step at
`(97,73)`, `(98,74)`, `(99,75)`; `100 × 264 px` surface with `66 px` of content; window box `108px`
wider than the surface) is quoted in the spec so the withdrawal is documented, not asserted.

**The spec does not read as if the window were rounded**: it says the window cannot be rounded and
that the frame is drawn inside it. `A148`'s own text in `docs/state/stage-14-popup-look.md` agrees
with this wording; I did not edit that file (it is the PM's).

---

## 2. Mutation proofs

Both mutations were applied to the shipped file, observed red, and restored from a `cp` copy. **No
`git checkout` was used and no loop ended with `git checkout -- .`.** The copy used for both
restores is `/tmp/t1404/popup.component.ts.final`, taken with `cp` from the final edited state.

### Mutation 1 — the width pin (brief's required proof)

`sed -i 's/      width: 320px;/      width: 300px;/' src/popup/popup.component.ts`

Observed: **1 failed / 15 passed** of 16 — `gives the component its own 320px width and never the
settings 360px` went red. Restored: `diff -q` against the copy is silent, `grep -c "width: 320px"`
is `1`, suite back to **16 passed**.

### Mutation 2 — the `A148` frame pin (scope instruction's required proof)

`sed -i 's/      border: 2px solid #a6cbdc;/      border: 1px solid #a6cbdc;/' src/popup/popup.component.ts`

Observed: **1 failed / 15 passed** of 16 — `draws the 2px A148 frame and its radius on the card
while the settings card keeps its own 1px` went red. Restored: `diff -q` silent, suite back to
**16 passed**.

---

## 3. Gates (profile order, on the final restored state)

| Gate | Exit | Result |
|---|---|---|
| `npm run build` | **0** | `dist/` is a self-contained MV3 folder, **12 files** |
| `npm test` | **0** | **1049 tests / 47 files** passed (baseline 1049/47 — unchanged, nothing deleted) |
| `node scripts/check-agent-config.mjs` | **0** | 0 errors, 0 warnings, **176 info** |
| `npm run typecheck` | **0** | all three `tsc --noEmit` projects clean |

Built output spot-checked: `dist/popup/main.js` carries `border:2px solid #a6cbdc` and
`border-radius:12px`; `dist/popup/index.html` carries `body { margin: 0; background: #fdf7ee; }` and
no geometry.

---

## 4. Acceptance criteria self-check

| AC | Claim | Verdict |
|---|---|---|
| 1 | `320px` returns to `.popup`, with `box-sizing: border-box` kept | **met** — `src/popup/popup.component.ts:204-212`; pinned by `gives the component its own 320px width…` |
| 2 | `body` loses `border-radius`, `overflow: hidden`, `width: 100%`, `min-height: 100vh`, keeps `margin: 0` + cream fill, and no geometry remains to justify | **met** — `src/popup/index.html:40-45`; `box-sizing` also dropped as a no-op (`S14-21`); pinned by the document case |
| 3 | No `border`, `outline` or `box-shadow` on the document; the cream fill stays | **met** — the document case asserts all three absent in the stripped and the verbatim read |
| 4 | The document pin is rewritten, not deleted: paint + zero margin kept, radius/clip/geometry dropped as presence but kept as absence, deliberate rule set still pinned | **met** — case renamed `the document box paints the window…`; one block, one `body` rule, `WITHDRAWN_DOCUMENT_SHAPE` |
| 5 | The component width pin returns reading `320px` from the shipped stylesheet | **met** — `POPUP_WIDTH` read from the shipped rule body; mutation 1 proves it can fail |
| 6 | The spec's `Popup look` bullets follow in the same commit | **met** — `docs/specs/content-overlay-ui.md:156-162` |
| 7 | One commit; `dist/` 12 files; no `src/content/`, `src/core/`, `src/options/`, manifest, asset, icon or `scripts/` change; no new dependency, network call or Russian string | **met** — `git show --stat HEAD` lists four files |
| 8 | Both falsified pins proved by mutation applied, observed and reverted from a `cp` copy | **met** — mutations 1 and 2 above |

**Scope addition (`A148`, the steering instruction), self-check:**

| Item | Verdict |
|---|---|
| `.popup` regains the frame and the radius, thicker than the old `1px`; `2px solid #a6cbdc` + `12px`; colour stays the `A125` decorative role; width/padding/type/ink kept | **met** |
| The card is the frame's owner again; `body` keeps only `margin: 0` + cream paint | **met** |
| The `A144`/`A145`-era absence pins for a card frame are deleted and replaced by presence pins; the removal is named in the report; every other assertion of those cases stays | **met** — see §1.3, removals 1–4 |
| `A146` stands: the window cannot be rounded; the spec still records it and does not read as if the window were rounded | **met** |
| The document "no frame" guard stays (the document paints, the card frames) | **met** — `FRAME_DECLARATIONS` + the verbatim `border`/`outline`/`box-shadow` scan |
| The frame presence pin proved by mutation | **met** — mutation 2 |
| The spec names `A148` beside `A146`/`A147` | **met** |

---

## 5. Open questions / residual risk

1. **`2px` is a PM default** for «потолще». It is now load-bearing for a pin (`POPUP_FRAME`) and for
   a spec sentence, so if the reader's eye disagrees it is a one-value change in three places
   (component, spec, test constant `POPUP_FRAME` derives from `PALETTE.decorative`, so only the
   width literal moves). Ledger row `S14-29` already records this.
2. **The frame is drawn, not seen.** Every pin here is a fact about the source. `A146`'s
   measurement says a popup **window** cannot be rounded; whether the reader reads the `2px` frame
   as deliberate is a `chrome://extensions` load of `dist/`, which this task does not perform. The
   spec's `Assumption:` now says the look is owed only for the width column, not for the corners.
3. **`dist/popup/index.html` is Angular's built copy of `src/popup/index.html`.** The two-declaration
   `body` rule survives the build verbatim (spot-checked), so no build wiring change was needed.
4. **The `body` rule now has no `box-sizing`.** If a later change gives `body` a width or padding,
   the declaration must come back with it; the document case's absence list is what will catch a
   silent reintroduction.
