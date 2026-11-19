# t14-05b — engineer report: the `:host` sentence, and the three rows that share its defect

Task: attempt 2 of `t14-05`, comment-and-prose only, after review
`6962de32-62da-4cb3-866b-3edf2ba93902` (`docs/state/t14-05-review.md`) verdicted **changes requested**
on one blocking finding: a sentence that outlived the code it describes. One commit: **`45ff3e1`**.

## What changed

| Path | Change |
|---|---|
| `tests/popup-window-look.spec.ts` | Four **comment** blocks, zero assertions: the falsified `:host` sentence (`leaves the paint to the document box…`), the `A149` describe's doc comment («one case, one presence claim» → **two** cases), the describe's mutation paragraph (now names the PM's three stronger mutations and stops implying the `:host` was ever `padding`-free), and a new row in the «which assertion goes red» list for the `:host` geometry claim. |
| `docs/state/t14-05-engineer.md` | The `S14-41` paragraph: the PM's three stronger mutations (inset **dropped**, **moved onto `body`**, changed to **`8px`**) added as a table beside the local `4px → 5px` reproduction, attributed to the PM. |

`git diff --stat HEAD~1 HEAD` → `2 files changed, 44 insertions(+), 12 deletions(-)`, all insertions
inside `/* … */` or `// …` comments and inside the one report file.

**Untouched, verified:** every assertion (`expect(` count is **152** before and after; `it(` count is
**18** before and after — the pins were 16 → 18 in `t14-05` and did not move here), every `describe`/`it`
title, `src/popup/popup.component.ts` and every other shipped stylesheet, `docs/specs/`,
`README.md`, `test_img/`, the build script.

## Finding 1 (blocking, `t14-05-review.md`) — the sentence now says what the rule says

`tests/popup-window-look.spec.ts:520-524` (was `:514`) read:

> «`:host` is content inside the box and declares **no geometry of its own at all**: no width, no
> radius, no clip and no margin.»

Against the shipped `src/popup/popup.component.ts:215-218` (`:host { display: block; padding: 4px; }`)
the «no geometry … at all» half is false. It now reads:

> «`:host` is content inside the box and declares no width, no radius, no clip and no margin, which is
> what the four absences below read. It is not declaration-free: since `A149` it declares exactly one
> thing, the `4px` inset padding that sets the card off the window edge, **present**-pinned in the
> `A149` describe near the end of this file and deliberately not asserted absent here.»

So the comment states exactly the four absences the four `expect`s below it read, names the `4px`
inset as the one runtime geometry `:host` owns, and points at the place where it is **pinned
present**. The paragraph's original point is intact: `.popup` is the **one** box that sizes and frames
itself (`A147`'s `320px`, `A148`'s `2px` border and `12px` radius), and a **clip** or a **margin** is
what must stay off it, while the card's radius is asserted **present** rather than absent. No new
claim is made: every fact in the replacement sentence is one of the four `not.toMatch` assertions
directly below it, the one `toMatch` set in the `A149` describe, or the shipped stylesheet.

`grep -n "no geometry" tests/popup-window-look.spec.ts` → **no match**. The only surviving
occurrence of the phrase in the touched files is in `docs/state/t14-05-engineer.md:12`, where it is a
**true** statement about `b077061`'s own spec edit («the `:host` sentence no longer claims the box has
no geometry») — a record of a past change, not a claim about the current tree.

## Finding 2 (`S14-39`) — «one case» against two cases

The `A149` doc comment claimed «One case, one presence claim, and the counter-claims…» while the
describe ships two `it` blocks. It now opens:

> «**Two cases**: one presence claim — the inset is on `:host` and it is `4px` — and one set of
> counter-claims that make it a pin rather than a restatement… The presence is stated once, so a case
> that merely repeated it would pin nothing new; the counter-claims are the half that names the boxes
> the gap must **not** appear on.»

The rest of that doc comment (its four bullets) was already accurate and is unchanged.

## Finding 3 (`S14-40`) — the «which assertion goes red» list

The list gained the `A149` row last time but not the `:host` geometry claim. New row, placed after it:

> «**`:host` claimed a geometry it does not own** — it gained a `width`, a `border-radius`, an
> `overflow` (a clip) or a `margin` → `leaves the paint to the document box and keeps the width on
> the component`, whose `:host` half is exactly those four absences. Its `padding` is **not** one of
> them: since `A149` the inset is the one geometry `:host` declares, and it is pinned **present** in
> the `A149` describe named in the row above, so a reader must not expect that row to cover it.»

The `padding` exclusion is stated **because** it is the trap the blocking finding fell into: a reader
who believes the `:host` case guards the inset would believe the inset is guarded by an absence, when
it is guarded by a presence two describes later. Verified against the code: the `:host` half of that
case (`tests/popup-window-look.spec.ts:529-532`) is `width` / `border-radius` / `overflow` / `margin`,
and nothing else.

## Finding 4 (`S14-41`) — the report's proof was the weaker mutation

`docs/state/t14-05-engineer.md` quoted only `4px → 5px`. Added after that block, as a table, with
explicit attribution:

| Mutation | What goes red |
|---|---|
| the `4px` inset **dropped** from `:host` (`padding: 4px;` deleted, `display: block` kept) | the same two `A149` cases |
| the inset **moved onto `body`** (`padding: 4px` added to the document rule) | the same two `A149` cases |
| the inset **changed to `8px`** | the same two `A149` cases |

Framed as the stronger evidence and for the right reason: they vary the **owner** and the **size** of
the gap, not one digit of it, so they show the pin is about the claim `A149` makes. Attributed to the
PM («applied and observed on the PM's side»), exactly as the brief states; the report does not claim
this session ran them.

## Finding 5 (not named by the reviewer, same defect class) — one extra sentence

The `A149` describe's mutation paragraph ended: «…; the `:host` was **not** `padding`-free when proved,
so the further mutations that turn it red are the two `not.toContain`/absence halves below.» That was
an awkward hedge that still implied a `padding`-free heritage and mis-described *which* half carries
the red (in the `5px` run the **counter-claim** case goes red through the stylesheet-wide
`padding: 4px` count, not through both absence halves). Rewritten to say what the recorded run shows
and to name the PM's three mutations. **Reported here rather than folded in silently** — if the PM
prefers that sentence kept as it was, it is a comment-only revert.

## Whether my new sentences are true — checked one by one

| Sentence | How it was checked |
|---|---|
| «`:host` … declares no width, no radius, no clip and no margin» | the shipped rule is `display: block; padding: 4px;` (`src/popup/popup.component.ts:215-218`) and the four `not.toMatch` at `:529-532` enforce it; green. |
| «since `A149` it declares exactly one thing, the `4px` inset padding» | the same rule body, whole: two declarations, one of which is `display: block` (a display, not a geometry), and the `A149` case asserts `(host.match(/padding/g)).toHaveLength(1)`. |
| «**present**-pinned in the `A149` describe near the end of this file» | `declares the 4px inset on :host and keeps display: block there` at `:674`; it is the last describe but one. |
| «`.popup` is the one box that sizes and frames itself (`A147`'s `320px`, `A148`'s `2px` border and `12px` radius)» | unchanged from the original paragraph; the two cases above the comment pin it. |
| «two cases: one presence claim … one set of counter-claims» | two `it` blocks in that describe (`:674`, `:688`). |
| «the counter-claim case fails … through the stylesheet-wide `padding: 4px` count» | from the `t14-05` run log recorded in `docs/state/t14-05-engineer.md` (`expected [] to have a length of 1`), which is that `expect` at `:693`. |
| «the same two cases go red» for the PM's three mutations | quoted from the PM's review record (`docs/state/t14-05-review.md`, and the ledger note «the PM's three restorations plus the report's own `4px → 5px` each turn exactly those two cases red»). Attributed, not re-run here. |

## Gates (profile order, on the committed tree, `45ff3e1`)

| # | Command | Exit | Count quoted |
|---|---|---|---|
| 1 | `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f \| wc -l` = **12** |
| 2 | `npm test` | **0** | `Test Files 47 passed (47)`; `Tests 1051 passed (1051)` — baseline 1051/47 **unchanged**, as a comment-only change must be |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 176 info(s)` — baseline 176 info **unchanged** |
| 4 | `npm run typecheck` | **0** | three `tsc --noEmit` projects (content, app, spec), no diagnostics |

## Commands run

```
cp tests/popup-window-look.spec.ts /tmp/t14-05b/popup-window-look.spec.ts.orig
cp docs/state/t14-05-engineer.md   /tmp/t14-05b/t14-05-engineer.md.orig
git diff --stat                          # 2 files changed, 44 insertions(+), 12 deletions(-)
git diff -U0 tests/popup-window-look.spec.ts | grep -E '^[+-]' | grep -E 'expect\(|describe\(|it\('   # empty: no assertion or case title touched
grep -c 'expect(' (both revisions)       # 152 / 152
grep -cE '^\s+it\(' (both revisions)     # 18 / 18
grep -n 'no geometry' tests/popup-window-look.spec.ts   # no match
npm run build                            # exit 0, "self-contained MV3 folder (12 files)"
find dist -type f | wc -l                # 12
npm test                                 # exit 0, 47 files / 1051 tests passed
node scripts/check-agent-config.mjs      # exit 0, 0 error(s), 0 warning(s), 176 info(s)
npm run typecheck                        # exit 0, all three projects clean
git add tests/popup-window-look.spec.ts docs/state/t14-05-engineer.md && git commit   # 45ff3e1
git diff --cached --name-only            # empty: nothing staged after the commit
git status --short                       # only the PM's pre-existing ?? test_img/
```

`src/popup/popup.component.ts` was **never mutated in this session**. The `cp` copies exist because
the brief forbids a `git checkout` recovery; they were not needed and no mutation was applied, so
nothing had to be restored. No `git checkout`, no `git reset`, no destructive command.

## AC self-check (brief, line by line)

1. **«`:host` declares no width, no radius, no clip and no margin»** — satisfied, `:521`.
2. **«since `A149` it does declare one thing — the `4px` inset padding — which is pinned in the `A149` describe»** —
   satisfied, `:522-524` (names the describe and says the pin is a **presence** one).
3. **«Keep the rest of the paragraph's point: the card is the one box that sizes and frames itself,
   and a clip or a margin is what must stay off it»** — satisfied, unchanged at `:525-529`; the final
   clause «the radius is asserted **present** there rather than absent here» is kept verbatim.
4. **`S14-39`: «One case, one presence claim» → say what is actually there** — satisfied, `:641-646`
   now says **two cases**, one presence claim and one set of counter-claims.
5. **`S14-40`: add the `:host` geometry claim to the «which assertion goes red» list** — satisfied,
   `:98-103`, with the named case and the explicit `padding` exclusion.
6. **`S14-41`: add the PM's three stronger mutations, attributed to the PM** — satisfied,
   `docs/state/t14-05-engineer.md`, the `S14-41` table plus the attribution paragraph.
7. **No assertion added/changed/weakened/deleted** — satisfied: `expect(` 152 → 152, `it(` 18 → 18,
   and `git diff` over the spec contains no line matching `expect(`, `describe(` or `it(`.
8. **No shipped stylesheet rule touched** — satisfied: `src/` is absent from `git show --stat HEAD`.
9. **Spec, `README.md`, `test_img/` untouched** — satisfied: neither path is in the commit;
   `git status --short` shows only the PM's pre-existing `?? test_img/`.
10. **Baseline unchanged: 1051 tests / 47 files, `dist/` 12 files, checker 176 info** — satisfied,
    gate table above.
11. **Gates in profile order with exit codes and counts** — satisfied, gate table above.
12. **One commit; anything mutated restored from a `cp` copy, never `git checkout`** — satisfied,
    `45ff3e1` is the only commit; nothing was mutated; no `git checkout` in the session.
13. **Report at the briefed path, after the commit, in one `write`, and pasted into the final
    message** — satisfied.
14. **No comment or report sentence in the touched files claims something the shipped rules do not
    do; in particular none claims `:host` has no geometry** — satisfied: `grep -n "no geometry"
    tests/popup-window-look.spec.ts` returns nothing; the sole surviving occurrence of the phrase is
    the report's true record of `b077061`'s spec edit; every new claim is tabulated with its check
    above.

## Open questions / notes for the PM

- **Finding 5 is mine.** Rewriting the describe's mutation paragraph was not named in the brief; I
  treated it as the same defect class (it still implied a `padding`-free `:host`). Comment-only, one
  sentence group, reverted in a second if the PM prefers the original wording.
- **`S14-41` is quoted, not re-run.** The PM's three mutations are recorded here as the PM's own
  observation, per the brief («attributed to the PM»). If a reviewer needs them reproduced by an
  engineer, that is a fresh run and a `src/` mutation this task was told not to make.
- **The rendered look is still owed by a manual load.** `4px` remains a source fact; whether the gap
  reads right in a real popup window is the reader's eye on a loaded `dist/`, as `A146`/`t14-05`
  already noted.
- `docs/state/stage-14-popup-look.md` (the ledger) is the PM's file and was not touched; `S14-39`,
  `S14-40` and `S14-41` are answered by this commit but not marked closed there.