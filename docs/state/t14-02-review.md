# t14-02 — review: the popup's card loses its frame and its radius so the window owns the shape (`A144`)

**Verdict: `accepted`.** All seven acceptance criteria pass, no blocking finding, and the settings half of the old shared-shape claim survived the rewrite and is load-bearing.

## Acceptance criteria — one line each

| AC | Verdict | Evidence |
|---|---|---|
| **1** `.popup` keeps the six named declarations and loses exactly the frame and the radius, no replacement frame | **pass** | `src/popup/popup.component.ts:178-185` — `width: 320px; box-sizing: border-box; padding: 16px; background: #fdf7ee; font: 13px/1.45 system-ui, sans-serif; color: #1b2a33` and nothing else. No `border`, no `border-radius`, no `outline`, no `box-shadow` in that rule, and no wrapper element carries a frame: the template's only ancestor of `.popup` is `:host` (`:174-177`), which has none. |
| **2** `:host` keeps the cream fill and gains nothing | **pass** | `:174-177` is `display: block; background: #fdf7ee;` — no radius, no `overflow`, no border, no shadow. The untouched case at `tests/popup-window-look.spec.ts:355-357` still asserts `host` carries no `margin:`, no `border:` and does match `background: #fdf7ee;`; the new case's `rest` scan (`:291-295`) finds no `border-radius:` anywhere outside the separator and the checkbox. |
| **3** nothing else about the popup's look moves; `A144` touches one rule | **pass** | Read against the diff: row separator `border-top: 1px solid #a6cbdc` (`:221`), `.row:first-child { border-top: 0 }` (`:224-226`), checkbox `border: 1px solid #a6cbdc; border-radius: 3px; accent-color: #b8480d` (`:246-248`), `.delete` `24px`/`16px` box (`:263-268`) with the `16px` glyph (`:274-277`), the six `A125` literals, `320px`, `16px`, the `13px/1.45` scale and the `15px` title step all stand. **Nothing else in the popup moved**: the `git diff` of the component is one comment block plus two deleted declarations, and no other rule, selector or literal changed. |
| **4** the look suite is rewritten, not deleted; absence pin that can fail; settings frame still present; shared half as before; title and doc comment honest | **pass** | `tests/popup-window-look.spec.ts:269-339`. The popup's frame and radius are pinned **absent** twice — on the comments-stripped `.popup` body (`:283-288`) and on the verbatim stylesheet with the three untouched rule bodies cut out (`:289-295`) — and the settings card's frame and radius are pinned **present**, read from `src/options/options.component.ts` (`:329-338`). `options.component.ts:125-126` really declares `border: 1px solid #a6cbdc; border-radius: 12px;` on `.options`, so the "present" half is a true reading. The shared half (`padding: 16px`, the type scale, the two palette roles) is asserted per rule body and exactly once on the card (`:318-326`); the `320px` versus `360px` case (`:234-267`) is untouched. The case title (`:269`, `draws no frame and no radius on the card while the settings card keeps its own`) and the file header's third claim (`:22-27`) state the rule, cite `A144` amending `A141`, and name the two surfaces that now differ on purpose. The named-reds bullet (`:46-51`) names the case and both reads. |
| **5** `src/popup/index.html` keeps one `<style>` block with the one `body { margin: 0 }` rule | **pass** | The file is not in `git diff --name-only 1cc38ae^ 1cc38ae`; `grep -c "<style"` → `1`; the block is `body { margin: 0; }` and nothing else. The pre-existing case `:340-364` still normalises exactly that one block to `body { margin: 0; }`. |
| **6** the spec follows in the same commit and no sentence still claims a drawn popup frame | **pass** | `docs/specs/content-overlay-ui.md:158` — `Card shape (A141, amended by A144, task t14-02)`: palette, padding and type scale without a frame, "The card draws no frame of its own … The window owns the rounded shape", `:host` gaining nothing, the settings window named as the deliberate other case, and the controls named as controls. `:162` describes the rewritten suite as the spec now ships. `:155` (popup contract) and AC 22 (`:294`) and AC 26 (`:298`) name row content, controls and grouping — **no** sentence among them claims a drawn popup frame, so nothing needed correcting there. |
| **7** gates green, counts quoted | **pass** | The PM's measured tree `1cc38ae`: `npm run build` 0, `dist/` **12 files**; `npm test` 0, **1048 tests / 47 files**; checker 0, **176 info**; `npm run typecheck` 0. Baseline unchanged at 1048 / 47 — the case was rewritten, not added. `git status --short` is empty. |

**The settings half survived.** Yes — and it is load-bearing, not decorative: `:329-338` reads `src/options/options.component.ts` and asserts `border: 1px solid #a6cbdc;` and `border-radius: 12px;` **present** on `.options`, so the PM's second mutation (removing the frame from the settings card → 1 red) is confirmed by the assertions as written. The old case's popup half became an absence pin; the settings half kept its presence pin in the same case.

## Blocking findings

None.

## Non-blocking findings (debt ledger)

1. **`tests/popup-window-look.spec.ts:289-295` — the absence scan is coupled to three selector strings.** `rest` is built by cutting `.row`, `.row:first-child` and `.toggle input[type='checkbox']` out of the verbatim text; a rename of any of the three makes `ruleBody` throw inside this case. The engineer states this at `docs/state/t14-02-engineer.md` "Residual risk", and the failure mode is loud (a red case naming the missing rule), so it is a coupling to record, not a defect to fix here. Class: test.
2. **`tests/popup-window-look.spec.ts:271-273` — `everything` is now the same string as `styles`.** The alias is declared and used once (`:289`); it reads as a second read but is the verbatim text already in scope. Cosmetic. Class: style.
3. **`docs/specs/content-overlay-ui.md:156` — the `Popup look` lead bullet still opens "the popup is the settings window's **card**".** A card without a frame is still a card, and the sub-bullet at `:158` states the absence plainly, so the sentence is not false; a reader skimming only the lead bullet could still picture a drawn card. Worth a phrase when the bullet is next touched. Class: doc.
4. **`A144` rests on Chrome drawing the window's own radius — unverified by any test.** Stated in `docs/state/t14-02-engineer.md` "Open questions" 2 and "Residual risk"; the pins read stylesheet text, so the reader's sight of rounded corners is a manual `dist/` load. Class: browser-verification.
5. **`S14-13` / `S14-14` remain open as the stage record states** (`docs/state/stage-14-popup-look.md:240-241`): the colours, the trash glyph against the page editor's drawing, the checkbox and «nothing else moved» are unanswered by this change, and the two surfaces no longer share a drawn declaration. Class: look / ruling.

## Honesty question — no fourth disagreement between prose and code

I read every sentence this change touches against the shipped code and found **no** claim of a shape, frame or radius the code no longer has:

- the component's look comment (`src/popup/popup.component.ts:84-94`) states the absence and names the settings window as the other case;
- the spec's `Card shape` bullet (`:158`) states the absence, names the window as the owner and cites `A144` and the `A141` amendment;
- the case title and the file header's third claim (`:22-27`, `:46-51`, `:269`) state the absence and name the two differing surfaces;
- the named-reds table's "the card's frame or its radius comes back" entry (`:47-51`) is a regression description, not a claim of current state.

The one stale text in the repository is **outside** this commit and not this task's to change: `docs/state/run-10-popup-look.md:15` still prints the card as `border: 1px solid #a6cbdc; border-radius: 12px;` and `:25` still asks the reader to confirm "the same border and rounded corners as the settings window". That is the Run 10 record of what shipped *before* `A144`, and the brief puts it out of scope; `docs/state/` is the PM's. It is the only place in the tree where prose and code still disagree about this surface, and it is a historical record, not a spec.

## Evidence

- Slice: `1cc38ae` — `git diff --name-only 1cc38ae^ 1cc38ae` → `docs/specs/content-overlay-ui.md`, `src/popup/popup.component.ts`, `tests/popup-window-look.spec.ts` (three files, as briefed).
- Code: `src/popup/popup.component.ts:174-185` (`:host`, `.popup`), `:221`, `:246-248`, `:263-277`; `src/popup/index.html:12-16`; `src/options/options.component.ts:125-126`.
- Tests: `tests/popup-window-look.spec.ts:22-27`, `:46-51`, `:108-109`, `:140-148`, `:269-339`, `:340-364`.
- Spec: `docs/specs/content-overlay-ui.md:155`, `:156`, `:158`, `:162`, `:294`, `:298`.
- Ruling: `docs/state/stage-14-popup-look.md:217` (`A144`), `:219-221` (the `A141` amendment), `:240-241` (`S14-13`, `S14-14`).
- Report: `docs/state/t14-02-engineer.md`; brief: `docs/state/t14-02-popup-corners.md`; PM's gates re-run on `1cc38ae`: build 0 / 12 files, test 0 / 1048 / 47, checker 0 / 176 info, typecheck 0.