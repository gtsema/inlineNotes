# t14-05 — engineer report: the popup's card inset `4px` from the window edge

Task: `docs/state/t14-05-popup-card-inset.md` (Stage 14 follow-up, ruling **`A149`**,
`docs/state/stage-14-popup-look.md`). One commit: **`b077061`**.

## What changed

| Path | Change |
|---|---|
| `src/popup/popup.component.ts` | `:host` gains `padding: 4px` and keeps `display: block`. `.popup` is byte-identical: `width: 320px`, `box-sizing: border-box`, `border: 2px solid #a6cbdc`, `border-radius: 12px`, `padding: 16px`, the type scale, the ink. Class doc gains the `A149` paragraph (the gap, its owner, why not `body`) and the `S14-38` paragraph (the gap is outside the card, the panel is `4 + 320 + 4`). |
| `tests/popup-window-look.spec.ts` | Adds `POPUP_INSET = '4px'`, a two-case describe for `A149` (`declares the 4px inset on :host…`, `leaves the gap off the document box and off the card`), a header bullet, a row in the «which assertion goes red» list, and the mutation-proof sentence. **Every existing assertion is untouched** — 16 cases before, 18 after, moved nothing. |
| `docs/specs/content-overlay-ui.md` | `Popup look` header names `t14-05`/`A149`, the inset and its owner; a new sub-bullet states the `4px`, that `:host` owns it and why not `body`, and that the card/document/component ownership stands (`S14-38`); the pinned-by-look-suite bullet names the new pin and the `:host` sentence no longer claims the box has no geometry. |

No change under `src/content/`, `src/core/`, `src/options/`, `src/manifest.json`, assets, icons or
`scripts/`. No new dependency, no network call, no new Russian string. `README.md` and `test_img/`
untouched.

## The one decision: the gap is on `:host`, not on `body`

`body` keeps exactly `margin: 0` + `background: #fdf7ee` (`A147`), and the test that pins the
document to a paint and a zero margin is green, unchanged.

**I considered putting the padding on `body` and rejected it**, for the two reasons the brief names
and one more from the code:

1. `body` is painted the cream, so a `padding` there would paint the gap's own band cream and the
   card's `#a6cbdc` frame would sit **inside a coloured border** — the gap would read as part of the
   frame, not as air between the frame and the window.
2. `body` with a `padding` is the document claiming a **shape**, which the withdrawn-shape pin
   (`WITHDRAWN_DOCUMENT_SHAPE` plus the frame absence in
   `the document box paints the window…`) exists to keep off that box.
3. `:host` is the box that **contains** the card, so the gap there is between the window edge and
   the frame — the geometry the reader asked for — and the `body` cream still reaches both window
   edges, which is what makes the frame appear to float on the same surface rather than on white.

`padding` is not in the `:host` `margin`/`width`/`border-radius`/`overflow` absence set of the
`leaves the paint to the document box…` case, so that case stays green without weakening it.

## The arithmetic (unchanged card)

The gap is **outside** the card. The card's `320px` is `box-sizing: border-box` and its `16px`
padding is unchanged, so the panel becomes `4 + 320 + 4` — the accepted arithmetic (`S14-38`), not
an accident. Nothing moved the `4px` inside the `320px` (out of scope in the brief).

## The pin, and the mutation that turns it red

The presence pin is `expect(ruleBody(stylesCode, ':host')).toContain('padding: 4px;')` together with
`toMatch(/(?:^|;)\s*padding:\s*4px;/)` and `display: block`; its counter-claims are that the
document box declares **no** `padding`, that `.popup` still declares `padding: 16px;` and no `4px`,
and that the shipped stylesheet declares the standalone `4px` padding exactly once.

**The mutation that turns it red:** the shipped `padding: 4px;` on `:host` changed to
`padding: 5px;` (equivalently: deleted, or moved onto `body`/`.popup`). Applied from a `cp` copy,
observed, reverted from that same copy:

```
cp src/popup/popup.component.ts /tmp/popup.component.mutation-proof.ts
sed -i 's/^      padding: 4px;$/      padding: 5px;/' src/popup/popup.component.ts
npx vitest run tests/popup-window-look.spec.ts
  × declares the 4px inset on :host and keeps display: block there
      AssertionError: expected '\n      display: block;\n      paddin…' to match /(?:^|;)\s*padding:\s*4px;/
  × leaves the gap off the document box and off the card
      AssertionError: expected [] to have a length of 1 but got +0
  2 failed | 16 passed (18)
cp /tmp/popup.component.mutation-proof.ts src/popup/popup.component.ts   # restored from the cp copy
npx vitest run tests/popup-window-look.spec.ts  ->  18 passed
```

Exactly the two new cases go red; the other 16 stay green, which is the proof that the pin can fail
and that it is the only thing the change moved. No `git checkout` was used anywhere, and no loop
ended with `git checkout -- .`.

**The PM's three stronger mutations** (`S14-41`, added in `t14-05b`), each from its own `cp` copy of
`src/popup/popup.component.ts`, restored from that copy after observing. They are the stronger
evidence, because they vary the **owner** and the **size** of the gap rather than one digit of it,
and they were run by the PM outside this report:

| Mutation | What goes red |
|---|---|
| the `4px` inset **dropped** from `:host` (`padding: 4px;` deleted, `display: block` kept) | the same two `A149` cases |
| the inset **moved onto `body`** (`padding: 4px` added to the document rule) | the same two `A149` cases |
| the inset **changed to `8px`** | the same two `A149` cases |

So the pin does not merely respond to a changed digit: a gap that disappears, one that the wrong box
claims, and one of the wrong size all turn it red, and in every case the other sixteen pins of this
file stay green. The `4px → 5px` run above is kept as the local reproduction; the three rows above
are the proof that the pin is about the **claim** `A149` makes, not about the spelling `5px`.
Attributed to the PM: they were applied and observed on the PM's side, and the recovery is the `cp`
copy named above.

## Gates (profile order; run on the final tree after the restore)

| Command | Exit | Count quoted |
|---|---|---|
| `npm run build` | **0** | `dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f \| wc -l` = **12** |
| `npm test` | **0** | **47 files / 1051 tests**, all passed (baseline 47/1049 — +2, only grew) |
| `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 176 info(s)` |
| `npm run typecheck` | **0** | all three `tsc --noEmit` projects clean |

`dist/` is 12 files, `src/content/`/`src/core/`/`src/options/`/`src/manifest.json` untouched, and no
staged files remain (`git status --short` shows only the PM's untracked `test_img/`).

## AC self-check (brief, 1–7)

1. **Gap on `:host`** — satisfied. `:host { display: block; padding: 4px; }`; the case
   `declares the 4px inset on :host and keeps display: block there` asserts both, reads the
   comments-stripped text (presence claim) and reads the value against the `POPUP_INSET` constant.
2. **`body` keeps exactly paint + zero margin** — satisfied. `src/popup/index.html` is unchanged and
   the `the document box paints the window…` case is untouched and green; the new case adds
   `documentStyles(DOCUMENT)` has no `padding` at the `A149` site as well. The `body`-alternative was
   considered and rejected; reasons above.
3. **Card unchanged** — satisfied. `.popup` is byte-identical; the new case asserts
   `padding: 16px;`, `width: 320px;` and no `4px` padding on the card, and the existing width/padding
   pins are untouched. Panel is `4 + 320 + 4` (`S14-38`).
4. **Cream still fills the window** — satisfied by construction: the gap is on `:host` (a box inside
   the painted `body`), so the gap shows the `body` cream; the document keeps the fill and the card
   stays unfilled (`leaves the paint to the document box…` green, unchanged). This half is a source
   claim; the rendered look is owed by the PM's manual load of `dist/` (the same debt `A146` notes).
5. **Pins follow** — satisfied. One presence pin added (two cases, one claim), the document-shape and
   document-frame pins kept verbatim, the card's own pins and the row-control pins kept verbatim;
   nothing weakened or deleted (16 → 18 cases). Mutation named and proved from a `cp` copy above.
6. **Spec follows in the same commit** — satisfied, `b077061` carries
   `docs/specs/content-overlay-ui.md`: the `Popup look` bullets state the `4px` inset, that `:host`
   owns it, and the standing ownership (card frames, document paints, component owns the `320px`);
   `A149` is referenced in the header and the new sub-bullet. The falsified `:host`'s-absent-geometry
   clause in the pinned-by-look-suite bullet was corrected in the same commit rather than left
   standing.
7. **Gates green, counts quoted** — satisfied, table above. Not-a-`t14-05` scope: `README.md` and
   `test_img/` untouched.

## Commands run

```
npm test                                   # baseline before the change: 47 files / 1049 tests, exit 0
cp src/popup/popup.component.ts /tmp/popup.component.ts.orig
cp tests/popup-window-look.spec.ts /tmp/popup-window-look.spec.ts.orig
npx vitest run tests/popup-window-look.spec.ts   # 18 passed after the change
npm run build                              # exit 0, dist/ 12 files
npm test                                   # exit 0, 47 files / 1051 tests
node scripts/check-agent-config.mjs        # exit 0, 176 info
npm run typecheck                          # exit 0
cp src/popup/popup.component.ts /tmp/popup.component.mutation-proof.ts   # the cp copy for the mutation
# mutate padding 4px -> 5px, observe 2 failed | 16 passed, restore from that copy, observe 18 passed
npm run build && npm test && node scripts/check-agent-config.mjs && npm run typecheck  # final tree, all exit 0
```

No full test log is printed above, per the brief.

## Open questions / notes for the PM

- **The look itself is still owed by a run.** `4px` is a source fact here; whether the gap reads right
  in a real popup window is the reader's eye on a loaded `dist/`, exactly like `A146`. No test can
  measure a rendered popup.
- **`S14-38` stays open by design**: if the reader later wants the panel to total `320px` including
  the gap, that is a new ruling and a new card width, not an edit here.
- The commit message states the reader's sentence in `«…»` as it was given; the source comments stay
  English except for the quoted reader wording, which is the convention `t14-04` already used.
