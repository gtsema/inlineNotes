The target dir doesn't exist and I'm read-only (no edit tool). I'll return the complete artifact in my final response, per instructions.

---

# t14-05 review — popup card inset `4px` on `:host`

**Verdict: `changes requested`** — one blocking finding (a recurring-defect instance inside the shipped test file).

Reviewed: `b077061` (diff read from git, not from the report), `756f612` report, brief `docs/state/t14-05-popup-card-inset.md`, spec `docs/specs/content-overlay-ui.md`, `src/popup/popup.component.ts`, `src/popup/index.html`, `tests/popup-window-look.spec.ts`.

## Acceptance criteria

1. **AC 1 — pass.** `:host` is `display: block; padding: 4px;` (`src/popup/popup.component.ts:217-218`). The `4px` appears on `:host` and nowhere else; `index.html` `body` has no padding, and `.popup` has none.
2. **AC 2 — pass.** `src/popup/index.html` still carries exactly `body { margin: 0; background: #fdf7ee; }` — paint + zero margin, no padding, no geometry, no frame. Unchanged by this commit.
3. **AC 3 — pass.** `.popup` (`popup.component.ts:222-230`) is byte-identical: `box-sizing: border-box; width: 320px; border: 2px solid #a6cbdc; border-radius: 12px; padding: 16px; font: 13px/1.45 system-ui, sans-serif; color: #1b2a33`. Confirmed from the diff: the only `styles` change is the two added `padding: 4px;` lines.
4. **AC 4 — pass (source-level).** The gap lives on `:host`, a box inside the painted `body`, so the gap shows the cream. Rendered look remains the owed manual-`dist/` item (same debt `A146` records). No white band is introduced by this change.
5. **AC 5 — fail.** See blocking finding 1. The new pins are real (2 cases, 9 `expect`s; the PM's three restores plus the report's `4px→5px` proof each turn exactly those 2 cases red), and no pre-existing assertion was deleted or reworded: cases 16 → 18, assertions 143 → 152 (+9, all in the new describe). **But** a pre-existing sentence was left standing that the shipped rules no longer support.
6. **AC 6 — pass.** Spec line 156 header gains `t14-05`/`A149`; new bullet `content-overlay-ui.md:162` states the `4px`, that `:host` owns it, why not `body`, and the standing ownership (card frames, document paints, component owns `320px`, panel `4 + 320 + 4`). The falsified clause in the pinned-by-look-suite bullet (`:host`'s absent geometry) was corrected at line 163 to absent *width, radius, clip and margin*. No contradicting sentence remains in the spec.
7. **AC 7 — pass.** Only three files changed (`docs/specs/content-overlay-ui.md`, `src/popup/popup.component.ts`, `tests/popup-window-look.spec.ts`); no `src/content/`, `src/core/`, `src/options/`, manifest, asset, icon or `scripts/` change; no new dependency; no new Russian string in `src/` (the only Cyrillic added is the quoted reader wording in a comment). `dist/` = 12 files. Counts as quoted.

## Blocking findings

1. **`tests/popup-window-look.spec.ts:514`** — the comment «`:host` is content inside the box and declares no geometry of its own at all: no width, no radius, no clip and no margin» is still standing, and the shipped `:host` now declares `padding: 4px`. This commit touched the file (header, constants, mutation list, new describe) but left this sentence untouched — verified: the exact line exists verbatim in `b077061^`. It is the seventh sentence that outlived its artifact. It is not a weakened assertion (the following `not.toMatch` set at lines 521-524 is deliberately `width/radius/overflow/margin` only, so the suite stays green and the pin is real), but it is a source claim the code contradicts: an unqualified "no geometry of its own at all" against a `:host` that now carries an inset. Either the sentence must name `padding` as the one geometry `:host` owns, or it must be corrected in this task's file the way the spec's counterpart was.

## Non-blocking findings (debt ledger)

1. **`tests/popup-window-look.spec.ts:649-655`** — the doc-comment of the new describe calls this "One case, one presence claim" while the describe ships **two** cases; the report repeats «one presence pin added (two cases, one claim)». Harmless wording drift, but it is the same class of stale-count sentence the stage keeps producing.
2. **`tests/popup-window-look.spec.ts:86-95`** — the "which assertion goes red" list gained the `A149` row (good), but the *"no geometry"* framing of the `:host` case at line 514 was not added to the mutation list. Consider listing it once finding 1 is fixed.
3. **`docs/state/t14-05-engineer.md`** — quotes the mutation `4px → 5px`. The PM measured the stronger mutations (delete, move to `body`, `8px`) and all three also go red, which the report does not state; the engineer report's proof is weaker than the PM's, though both agree the pin can fail.

## Ownership sentence

Correct in both places for the *gap*: the code (`popup.component.ts:120-135` doc, `:host { padding: 4px }`) and the spec (`content-overlay-ui.md:162-163`) both state that `:host` owns the `4px` inset, that `body` keeps only the paint and `margin: 0`, and that the card, the document and the component keep their jobs — the one exception being the stale `:host`-declares-no-geometry sentence in the test file (blocking finding 1), which the spec already corrected but the test did not.

## Evidence path

- Slice diff: `git show b077061 -- src/popup/popup.component.ts docs/specs/content-overlay-ui.md tests/popup-window-look.spec.ts`
- Stale sentence: `git show b077061^:tests/popup-window-look.spec.ts | grep -n "geometry of its own"` → `494:` (same line still present in HEAD at 514)
- Counts: cases 16 → 18, `expect(` 143 → 152; `dist/` 12 files; changed files = the three above.

Output path was missing (`…/subagent-artifacts/outputs/6962de32-…/docs/state/` does not exist) and I hold no write tool; the full artifact is returned above for the runtime to persist.