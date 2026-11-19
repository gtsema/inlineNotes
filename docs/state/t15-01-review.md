# t15-01 — code review

Artifact path: `C:\Users\user\.pi\agent\sessions\--C--Users-user-Desktop-test-inlineNotes--\subagent-artifacts\outputs\7959e790-010e-45fc-86ee-dc054dd743c5\docs\state\t15-01-review.md`
Reviewed range: `6bdd9ed` (report `607d0d9`, brief `docs/state/t15-01-page-widget-palette.md`, rulings `A150`–`A153` in `docs/state/stage-14-popup-look.md:601–649`). Read-only; no file touched, no script run.

## Verdict: **accepted**

## Acceptance criteria (one line each)

1. **AC 1 — card takes the `A125` palette, no invented literal, retired values gone (`A150`)** — `pass`. Code-only hex set of `src/content/overlay/card-style.ts` is exactly `#1b2a33 #a6cbdc #7b6a55 #b8480d #b3261e #eef4f7 #e3c3aa #fdf7ee #ffffff`; zero hits for all eleven retired literals. The four `#ffffff` occurrences are exactly the brief's two allowances: `card-style.ts:129` (`textarea` background) and `card-style.ts:188` (primary label).
2. **AC 2 — tooltip takes the same palette (`A152`)** — `pass`. `tooltip-style.ts:68–70` cream/ink/decorative, `:86` foreign header `#7b6a55`; declared set is exactly `#1b2a33 #7b6a55 #a6cbdc #fdf7ee`; no `#14171a/#b9bec4/#444c56/#ffffff`.
3. **AC 3 — disabled state is colours on both surfaces, `opacity` genuinely gone (`A153`)** — `pass`. `card-style.ts:196–200` and `options.component.ts:212–216` both ship `#1b2a33` label / `#e3c3aa` fill / `#a6cbdc` border; `grep -n opacity src/options/options.component.ts` returns comments only — there is no second rule to shadow it, and no other `disabled` rule exists. Ratios recomputed from the literals: label-on-fill **8.875**, fill-vs-card **1.558**, enabled-vs-card **4.965** → the report's 8.88 / 1.56 / 4.97 are arithmetically right.
4. **AC 4 — nothing but colours moves** — `pass`. Every hunk in the two overlay files and in `options.component.ts` is a colour declaration, a comment, or the swap `opacity: 0.45` → three colours + the `cursor: default` the rule already carried. No size/padding/radius/position/hit-box/shadow/font/animation line appears in the diff; the enabled `.save` keeps `padding: 6px 14px; border: 0; border-radius: 6px`; the geometry pins were not edited to accommodate anything.
5. **AC 5 — highlight slots untouched (`A151`)** — `pass`. `git diff --quiet 6bdd9ed^ 6bdd9ed -- src/content/paint/paint-palette.ts tests/content-paint-palette.spec.ts` → identical; `git diff --stat -- src/content/paint/` empty.
6. **AC 6 — pins follow, none weakened or dropped** — `pass`. The five literals in `tests/content-card-actions.spec.ts:531–543` are rewritten in place at least as strongly (same `toContain` shape, role value); the new absence test `:556–601` adds a total literal-set equality, which is stronger than the old presence-only pin; `tests/content-tooltip.spec.ts:468–519` adds three cases (presence+absence, exact set, geometry unchanged) where before there was no tooltip colour pin at all; `tests/options-window-look.spec.ts:93,109,126,139,1243` adds `DISABLED_FILL` to the pinned set and pair list without dropping a row and adds four cases (`:1570–1640`). No assertion reworded into vagueness; nothing deleted.
7. **AC 7 — spec follows in the same commit** — `pass`. `content-overlay-ui.md:31–32` (two Terms rows), `:96` (`A125` bullet extended to every surface with `A151` named as the one place outside), `:159` (corrected "nothing else about the card moved"), `:160–176` (colour table, disabled bullet with contrast, tooltip/author-slots bullet), `:323` (AC 29). Each references `A150`–`A153`.
8. **AC 8 — gates green, counts quoted, `dist/` 12** — `pass` on quoted evidence. Report quotes `build` exit 0 / 12 files, `test` exit 0 / 1060 / 47, checker exit 0 / 176 info, `typecheck` exit 0; `ls tests/*.ts` today is 47 files, consistent with the quote and with baseline+9. No `src/manifest.json`, `src/icons/`, assets, `scripts/`, `src/core/`, `package.json` or `*text.ts` path in the commit; no network call, no new dependency.

## Blocking findings

None.

## Non-blocking findings (debt ledger)

1. **`docs/specs/content-overlay-ui.md:96`** — the `A125` bullet now claims the popup's retired `#1f1f1f` / `#6b6b6b` / `#e3e3e3` "appear nowhere in the shipped source", but no suite scans `src/popup/` for them; today's grep finds zero, so the sentence rests on a reader's grep rather than a pin. Ledger as the popup-side analogue of the `S14-47` gap the brief already carries.
2. **`docs/specs/content-overlay-ui.md:159,176`** — "the highlight palette … its module keeps its six slots byte-identical" reads as though one module owns those colours; in fact `paint-palette.ts` holds them as `rgba(...)` declarations and `paint-style.ts` writes the block. True today and `A151` is correctly scoped, but a future reader may expect the literals in one file. Wording precision only.

## The recurring defect (question 7)

No ninth sentence. Checked the three cited spots: the "every extension surface" claim is true of `src/popup/` (hex set `#1b2a33 #7b6a55 #a6cbdc #b3261e #b8480d #fdf7ee`), `src/options/` (adds `#e3c3aa #eef4f7 #ffffff #0f5f7a`, all ruled/pre-existing), the two overlay files, and it explicitly exempts the highlight palette; the disabled-state sentence is accurate on both surfaces and correctly says the two layers are *not* pinned in step (`:176`, `S14-47`); the tooltip's `opacity` is distinguished — `tooltip-style.ts:19–24` states it is the shown state and not a disabled one, and `tests/content-tooltip.spec.ts:393` still pins exactly one `opacity: 1` declaration, so the `A153` removal did not silently cover it.

## One line on the palette

The extension now speaks one palette on every surface it should: page card, editor and tooltip joined the popup and settings window on `A125`, the disabled action is the same three colours on both layers, and the only colours deliberately outside it are the six authorship highlight slots, which `A151` names.