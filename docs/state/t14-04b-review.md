# t14-04b review (attempt 2 of t14-04)

**Artifacts:** slice `be790be` (2 files), report `docs/state/t14-04b-engineer.md` (`5a1ce58`), prior review `docs/state/t14-04-review.md` (run `5f8024fc-7bf0-49dd-bf9d-d0819db7add3`, finding 1), brief `docs/state/t14-04-popup-width-back.md`, stage record `docs/state/stage-14-popup-look.md` (`A146`/`A147`/`A148`, ledger `S14-21`, `S14-31`…`S14-36`).
**Evidence path:** read-only — `git show be790be --stat`, `git show be790be -- <both files>`, `git status --porcelain`, `git ls-files dist`, `find dist -type f`, and the committed contents of `docs/specs/content-overlay-ui.md:158`, `src/popup/index.html:1-49`. No mutation, no script run, no PNG opened; the `A146` numbers are taken from the stage record and the prior review. Re-review scope: prior finding 1 + the new diff lines only.

## Verdict: `accepted`

## Blocking findings

None.

## Prior finding 1 (the only one): **closed**

`docs/specs/content-overlay-ui.md:158` (the `Popup look` sub-bullet) and the two references the review grouped with it are now true of the committed tree:
- heading is «**Document paint and shape ownership**»; the `Surface shape` string is gone (`grep` for it and for the old «Now superseded… `A145`» construction returns nothing).
- «**`A147` kept the paint and withdrew the shape**: the two halves of `A145` did not share a fate» replaces the false «Both halves are withdrawn».
- «What the document box keeps is the **paint** — … cream `#fdf7ee` and `margin: 0`, and **no** declaration of a shape» replaces the misleading «**nothing else**».
- «`body` is the box the window is drawn from» replaces «`body` **is** the box the reader sees», and the new negation «**Being painted does not make the document box the popup's surface**» carries the narrowed framing.
- «the two controls inside the popup **card**… not the **card's** frame» and «the two **cards** share the arc» — the two remaining document-`surface` references are gone.
No remaining sentence in `:158` says or implies the document box **is** the surface, that the cream paint was **withdrawn**, or that both halves of `A145` shared a fate. `grep` over `docs/specs/content-overlay-ui.md` for «Both halves are withdrawn», «box the reader sees», «Surface shape» returns nothing. The surviving «Both halves» hits are `:87`/`:95` in the unrelated settings-window section. `A146`'s finding is untouched and now reads «**no rounding is possible for the popup window in MV3**». → `pass`.

## Acceptance criteria (brief ACs, one line each)

1. **No sentence claims the document box is the popup's surface** — `pass` (`:158`).
2. **No sentence claims the cream paint was withdrawn** — `pass` (`:158`: «What the document box keeps is the **paint**»).
3. **No sentence claims both halves of `A145` were withdrawn** — `pass` (`:158`: «did not share a fate»).
4. **Every measurement and ruling reference survives and stays true** — `pass`: `243×387`, `100 × 264 px`, `66 px`, the three-line wrapping, `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)`, `(97,73)`, `(98,74)`, `(99,75)`, `test_img/…224902.png`, `A125`/`A140`…`A148`, `2px solid #a6cbdc`, `border-radius: 12px`, `320px`, `padding: 16px`, `13px/1.45 system-ui`, `#1b2a33`, `360px`, `display: block`, `margin: 0`, `1px`, `3px` — all present; the `A144` history and the `A141`/`A144`/`A145`/`A146`/`A147`/`A148` chain are intact in the heading.
5. **One clause says why `box-sizing` is pinned absent (ledger `S14-21`)** — `pass` (`:158`: «that one was a no-op once no width, padding or border followed it here, so it is pinned absent as an untested declaration rather than a withdrawn shape — ledger row `S14-21`»). Correct: `src/popup/index.html:48-49` declares only `margin: 0` and `background`, and `tests/popup-window-look.spec.ts` pins it absent.
6. **`src/popup/index.html` header is honest about paint/`margin: 0` vs surface/shape** — `pass`: `:9-11` names the cream and the box the window is drawn from; `:30-36` names `margin: 0` and «The document paints; it does not shape»; `:41-44` «paint is all this box owns… frame lives on the **card**».
7. **No behaviour, style or test change; `dist/` still 12 files** — `pass`: `git show --stat be790be` = 2 files, 9 insertions / 7 deletions, both prose (`docs/specs/content-overlay-ui.md` +1/−1; `src/popup/index.html` +8/−6, comment only; the `<style>` block at `:45-50` is unchanged); no `tests/` or `src/popup/*.ts` file in the commit; `find dist -type f` = 12 files; `git status --porcelain` = `?? test_img/` only (pre-existing, out of scope).
8. **No pin weakened** — `pass`: no test file is touched by the commit.

## Non-blocking findings (debt ledger)

1. `docs/state/stage-14-popup-look.md` `S14-31`…`S14-36` — rows 31, 33, 34, 36 remain open; only `S14-32` (the `box-sizing` rationale) and `S14-35` (the `index.html` header) close here. `S14-36` (`popup.component.ts:114` «a width the ruling leaves to the PM's default» vs `A148`'s «PM default for «потолще»») still stands.
2. `docs/state/t14-04b-engineer.md` §2 — the token inventory counts rule tokens only; it is not a proof that each *measurement* string survives, so the ten numbers in §2 are the load-bearing half and the counts are decoration. Not a defect.
3. `src/popup/index.html:36-38` — the `S14-21` rationale is stated in the same words as the spec, so the fact now lives in three places (`:158`, `index.html:36`, `popup.component.ts:114`); consistent, but any future re-wording of `S14-21` must move all three.

## Does the spec now agree with the rulings about who owns the shape?

Yes. The spec states once, in one place (`:158`), that the **card** (`.popup`, `A148`) owns the drawn form — the `2px`/`12px` frame — while the **document box** owns only the paint (the `A125` cream and `margin: 0`); the **component** owns the `320px` (`A147`, `A141`), and `A146` closes the window-rounding question as measured. The heading, the `Popup look` parent bullet (`:156`) and the `index.html` header now read the same way, so the document-vs-card ownership the `A146`/`A147`/`A148` chain fixed is no longer contradicted by the prose.

**Verdict recorded for the state file:** `accepted`.
