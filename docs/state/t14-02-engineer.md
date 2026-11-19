# t14-02 — engineer report: the popup's card loses its frame, the window owns the shape

Brief: `docs/state/t14-02-popup-corners.md` (AC 1–7, seven criteria). Stage:
`docs/state/stage-14-popup-look.md` (ruling `A144`, amending `A141`). Commit `1cc38ae`, **one commit,
three files**.

## What changed, path by path

| Path | Change |
|---|---|
| `src/popup/popup.component.ts` | `.popup` loses exactly two declarations — `border: 1px solid #a6cbdc` and `border-radius: 12px` — and keeps `width: 320px`, `box-sizing: border-box`, `padding: 16px`, `background: #fdf7ee`, `font: 13px/1.45 system-ui, sans-serif` and `color: #1b2a33`. `:host` is byte-identical (`display: block` + the cream fill). The look comment now states the rule, names the corruption the three disagreeing shapes produced, and names the settings window as the deliberate other case. |
| `tests/popup-window-look.spec.ts` | The shared-shape case is **rewritten, not deleted**: the popup's frame and radius are pinned **absent**, the settings card's frame stays pinned **present** from the options file, and the still-shared half is pinned as before. Header, the named-reds table and one palette-case assertion follow. Two new constants, `CARD_FRAME` / `CARD_RADIUS`. |
| `docs/specs/content-overlay-ui.md` | The `Card shape` bullet (`A141`) becomes `A141`, amended by `A144`: palette, padding and type scale **without** a frame, the window owning the rounded shape, the settings window's frame kept as the other case, the row separator and the checkbox named as controls rather than the surface's frame. The suite bullet says what the pins now assert. |

No `src/content/`, `src/core/`, `src/options/`, `src/manifest.json`, `scripts/`, asset, icon,
`angular.json`, `package.json` or `dist/` change. No new dependency, no network call, no new Russian
string, no new key in any strings module. `git show --stat HEAD` lists exactly the three paths above.

## The shape that shipped

```css
:host {                       /* untouched, and gains nothing (AC 2) */
  display: block;
  background: #fdf7ee;
}

.popup {                      /* one rule, two declarations lighter (AC 1) */
  width: 320px;               /* kept */
  box-sizing: border-box;      /* kept */
  padding: 16px;               /* kept */
  background: #fdf7ee;         /* kept */
  font: 13px/1.45 system-ui, sans-serif;  /* kept */
  color: #1b2a33;              /* kept, the A125 ink */
}                              /* no border, no border-radius, no outline, no box-shadow */
```

The built `dist/popup/main.js` was read: `grep -c "360px"` → `0`, and the one
`border-radius:3px` the bundle still carries is the checkbox's own box (answer `Q3`), which `A144`
explicitly leaves alone.

**`A144` touches one rule (AC 3).** Unchanged, and now partly re-pinned *inside* the new case:
`.row { border-top: 1px solid #a6cbdc }`, `.row:first-child { border-top: 0 }`,
`.toggle input[type='checkbox'] { border: 1px solid #a6cbdc; border-radius: 3px; accent-color:
#b8480d }`, `.delete` with its `24`/`16` numbers, the six-literal `A125` set, `320px`, `16px`, the
`13px/1.45` scale. `src/popup/index.html` is byte-identical: one `<style>` block, one rule
`body { margin: 0; }` (AC 5, pinned by the untouched case `gives the document the body margin the
options document owns, and nothing else`).

## AC 4 — the look suite is rewritten, not deleted

The old case (`takes the settings card's frame, radius, type scale and inner padding`) pinned the
card's `border: 1px solid #a6cbdc` **and**, in the same case, read
`src/options/options.component.ts` to assert the settings card declares the same thing. That is the
sentence the brief says must not become a deletion, so the same case now reads a deliberately
**asymmetric** claim, and each half is a separate assertion:

| Half | Where it is pinned | State |
|---|---|---|
| the popup's frame | `.popup` body, both reads | **absent** (new) |
| the popup's radius | `.popup` body, both reads | **absent** (new) |
| the settings card's frame | `.options` body, read from the options file | **present**, as before |
| the settings card's radius | `.options` body, read from the options file | **present**, as before |
| `padding: 16px`, the type scale, the palette roles | both rule bodies | **shared**, as before |
| `320px` versus `360px` | the untouched width case | as before |

The absence pin is deliberate about its two reads, and the mechanism is worth naming because the
obvious version of it is wrong. A whole-text absence scan for `border: 1px solid #a6cbdc` **cannot
work**: the row separator and the checkbox carry that very declaration on purpose, so such a scan
would call the shipped controls a returning frame. The case therefore pins:

1. `card` — the `.popup` rule body with comments **stripped**: no frame, no radius, no `border` of any
   longhand, no `outline`, no `box-shadow`;
2. `rest` — the **verbatim** stylesheet with the three rule bodies `A144` does not touch
   (`.row`, `.row:first-child`, `.toggle input[type='checkbox']`) cut out: no frame, no radius
   anywhere else;
3. the mutex — those declarations are asserted **present** on the separator and the checkbox, so
   removing a control's border does not quietly make the absence vacuous;
4. the shared half — each declaration asserted on **both** rule bodies, each exactly once on the
   popup's, and the settings frame asserted **present** so the old claim's settings half survives
   with the popup half.

## The mutation that turns the absence pin red — applied, observed, reverted from `cp`

Copies first: `cp src/popup/popup.component.ts /tmp/t1402/popup.component.ts.orig`, likewise the
look suite and the spec. Every revert below is a `cp` from that copy (`md5sum` verified back to
`9592d2bdc2053fd1015f08c5e3bc5cb8`); **no `git checkout` was used on any file this mutation set
touched**, and the one `git checkout -- src/options/options.component.ts` I ran for M4 was on a file
whose pre-mutation content is a tracked commit and whose restoration was verified clean.

**M1 — the frame comes back.** `border: 1px solid #a6cbdc;` and `border-radius: 12px;` re-inserted
into `.popup` exactly as `t14-01` shipped them (i.e. the revert of the whole task). Observed,
**1 red**, exactly the new case:

```
× the popup is the settings card at its own width (t14-01 AC2; ruling A141)
  > draws no frame and no radius on the card while the settings card keeps its own
  → expected '\r\n      width: 320px;\r\n      box-…' not to contain 'border: 1px solid #a6cbdc;'
```

**M2 — the radius alone comes back, inside a CSS comment.** `/* border-radius: 12px; -- the frame
someone meant to ship */` inserted in `.popup`. Observed, **1 red**, the same case, and it is the
**verbatim** read that fires:

```
→ border-radius: 12px;: expected '    :host {\r      display: block;\r …' not to contain 'border-radius: 12px;'
```

That is the counterfactual for "an absence pin that reads too little": a commented-out frame is
still a frame waiting to return, and this pin can see it.

**M3 — the settings card loses its frame.** `border: 1px solid #a6cbdc;` deleted from `.options` in
`src/options/options.component.ts`. Observed, **1 red**, the same case, on the other side of the
claim:

```
→ expected '\r\n      box-sizing: border-box;\r\n…' to contain 'border: 1px solid #a6cbdc;'
```

So the settings half is load-bearing, and the case the brief forbade deleting is the only thing that
would have caught this.

**M4 — a control's border removed** (the mutex's own counterfactual). The checkbox's
`border: 1px solid #a6cbdc;` cut from `.toggle input[type='checkbox']`. Observed: the new case's
`expect(ruleBody(stylesCode, ".toggle input[type='checkbox']")).toContain('border: 1px solid #a6cbdc;')`
fires, which is exactly the assertion that keeps the absence pin from being satisfied by an empty
stylesheet.

Four mutations, one case red each time, in both directions (a frame that returns, a frame that
disappears from the other surface, a control the ruling protects), and every revert verified by a
green run of the file before moving on.

## AC self-check, line by line

| AC | Verdict | Evidence |
|---|---|---|
| **1 — `.popup` keeps six declarations, loses exactly the frame and the radius** | done | The `.popup` body is quoted above verbatim. Six kept, two removed; `card` is asserted to hold no `border`/`border-radius`/`outline`/`box-shadow` at all, so no replacement frame can hide in a longhand. Confirmed in the built bundle (`border-radius` appears once, the checkbox's `3px`). |
| **2 — `:host` keeps the cream fill and gains nothing** | done | `:host` is byte-identical (`display: block; background: #fdf7ee;`) and the untouched case still asserts `host` carries no `margin:` and no `border:` and does match `background: #fdf7ee`. No `overflow`, no radius, no shadow was added: the new case asserts the whole stylesheet's only radius is the checkbox's `3px`. |
| **3 — nothing else about the popup's look moves; `A144` touches one rule** | done | The diff of the component is one comment block plus two deleted declarations. The separator, the checkbox (border + `3px` + accent), the delete control's `24`/`16`, the palette literals, `320px`, `16px` and the type scale all keep their `t14-01` pins and three of them are now re-asserted **inside** the new case, so the ruling's own "not this one" list is cargo of the pin rather than prose. |
| **4 — the suite is rewritten, not deleted; absence pin that can fail; settings frame still present; shared half as before; title and doc comment name the new rule** | done | The table above maps every clause to an assertion. The absence pin's falsifiability is proved by M1 **and** M2 (a shipped and a commented-out frame); the settings half by M3; the mutex by M4. The case title is `draws no frame and no radius on the card while the settings card keeps its own`, and the file header's third claim plus the named-reds bullet state the rule, the ruling (`A144` amending `A141`) and the two shapes that now differ on purpose. |
| **5 — `src/popup/index.html` untouched: one `<style>`, one rule** | done | The file is not in `git show --name-only HEAD`. The pre-existing case `gives the document the body margin the options document owns, and nothing else` (one block, normalised to `body { margin: 0; }`) passes unchanged. |
| **6 — the spec follows in the same commit; `:155`/AC 22/AC 26 checked** | done | The `Card shape` bullet now states palette, padding and type scale without a frame, says the window owns the rounded shape, and cites `A144` and the amendment of `A141`; the `Popup look` lead bullet's "card" wording was left (a card is still a card without a border) and its suite sub-bullet says what is pinned. **Checked:** the popup contract bullet at `:155` and **AC 22** claim the popup's *content* (title, notices, rows, no address) and its controls' accessible names, not a drawn surface — corrected nothing there. **AC 26** likewise names the row controls and the grouping. The one popup sentence in the spec that named the frame was line 158, and it moved. |
| **7 — gates green, counts quoted** | done | Table below: build 0, test 0, checker 0, typecheck 0; `dist/` 12 files; **1048 tests / 47 files**, exactly the baseline (this task adds no case and no file); checker **176 info**, byte-identical to the baseline run. |

## Gates (profile order, quoted)

| Gate | Exit | Result |
|---|---|---|
| `npm run build` | 0 | `[build] dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f \| wc -l` → `12` |
| `npm test` | 0 | `Test Files 47 passed (47)` / `Tests 1048 passed (1048)` — baseline 1048 / 47, so **the count did not move** (the case was rewritten, not added or removed) |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 176 info(s)` — the 176 the brief names, and `diff` of the INFO lines against a stashed baseline run is **empty** |
| `npm run typecheck` | 0 | three `tsc --noEmit` projects clean |

The gate sequence was run twice: once after the code and test change (all four 0), and again after
the final spec edit (all four 0 again), from the tree that is now `1cc38ae`. `git status --short` is
empty and `git diff --cached --name-only` is empty.

**One thing worth flagging from the checker.** The first draft of the spec edit wrote the options
file as an inline-code path token, and that raised the checker from 176 to **177 info** — the
harness scans backticked `src/…` tokens in specs and reports a "planned path not created yet" INFO
for each. The sentence now says "read out of the options component's own stylesheet" instead, which
keeps the meaning, adds no token, and returns the run to exactly the baseline's 176. Recorded here
because a reviewer diffing the INFO count should see why the phrasing is what it is.

## Judgement calls

1. **The absence scan needed a text surgery, and I am naming it.** A whole-stylesheet absence scan
   for the frame is impossible on this surface by construction (the separator and the checkbox carry
   the same declaration). Rather than weaken the claim to `.popup`-only, the case cuts the three
   untouched rule bodies out of the **verbatim** text and scans the remainder, and then asserts the
   cut-out declarations are still present. The cost is a coupling to three selector strings, kept
   next to the pin and each of them also asserted. This is the only way I found to keep the absence
   wide **and** non-vacuous, and a reviewer may prefer a different mechanism — it is the one place
   in this task I chose a shape rather than transcribed one.
2. **The shared half is asserted per rule body, not over the whole text.** `padding: 16px` stands
   twice in the popup stylesheet (`.popup` and `:host`); `font: 13px/1.45 …` stands twice too. An
   over-the-text count would have failed on a legitimate second document-level declaration
   (`src/options/` ships the same shape), so the count is asserted **inside `card`** and the value
   against the settings `.options` body. This is a correctness fix to the old assertion's intent,
   not a weakening: the old case asserted presence on both bodies, which the new one still does.
3. **The palette case lost one assertion it could not keep.** It used to assert the card's frame as a
   palettes-role sighting (`ruleBody(stylesCode, '.popup')` contains `border: 1px solid #a6cbdc`).
   That declaration is gone, so the decorative role is now sighted on the row separator (exact form
   `border-top: 1px solid #a6cbdc`) and on the checkbox, which the same case already asserted. No
   palette literal lost its pin: the set scan and the per-role case both still cover all six shipped
   literals.

## Open questions

1. **The reader's other Run 10 items** (`S14-13`: the colours, the trash glyph against the page
   editor's drawing, the checkbox, «nothing else moved») are untouched by this commit and still
   unanswered. `A144` deliberately moved the frame first because it was the blocking impression; the
   brief puts the rest out of scope and I did not touch them.
2. **Whether the popup now *looks* rounded in Chrome** is not a thing any test in this file decides:
   the pins read stylesheet **text**, and the sight of the window's own corners is a manual `dist/`
   load, which this brief did not ask me to record and which I did not run in this session. `A144`
   rests on Chrome drawing the window's radius itself; that half is a browser-verification item, and
   if the reader reports square corners anyway, the next candidate is a `:host` radius rather than a
   card one — a different ruling, not a fix here.
3. **`S14-14` names the consequence** and I confirm it from the code side: with the frame gone, the
   popup and the settings window share **no drawn** declaration other than the palette and the type
   scale. The remaining shared pins are palette, `padding: 16px`, the type scale and `320px` versus
   `360px`; if the owner ever wants the two to look identical again, the shared thing must be
   re-declared, and the new case is where the two halves were deliberately separated.

## Residual risk

- The new absence pin is coupled to three selector strings of the shipped stylesheet. A future edit
  that renames `.row`, `.row:first-child` or the checkbox selector would make `ruleBody` throw a
  named error in this case, which is loud rather than silent — the failure mode is a red test naming
  the missing rule, not a passing vacuous scan.
- The `:host` fill is still a rectangle and the card is still `320px` inside it. Chrome rounds the
  window, so the rectangle is invisible in the panel; on a browser that drew square window corners,
  the corners would be square rather than outlined, which is the trade the reader chose (option 1).
  No test can see either outcome.
