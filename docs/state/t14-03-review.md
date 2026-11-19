# t14-03 — review: the rounding moves to the document box (`A145` supersedes `A144`)

**Verdict: `accepted`.** All eight acceptance criteria pass, no blocking finding, and the gate output is quoted in the brief (`f62fa9b`: build 0 / `dist/` 12 files, test 0 / 1049 tests / 47 files, checker 0 / 176 info, typecheck 0 — independently re-checked below where the reviewer is allowed a shell).

Reviewer ran on its own initiative, read-only: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 176 info(s)`, exit 0. `git status --porcelain` on `f62fa9b` is empty.

## Acceptance criteria — one line each

| AC | Verdict | Evidence |
|---|---|---|
| **1 — the document box is the surface** | **pass** | `src/popup/index.html:31-40` — one `<style>` block, one rule, selector `body`, body text `margin: 0; width: 100%; min-height: 100vh; box-sizing: border-box; background: #fdf7ee; border-radius: 12px; overflow: hidden;` (whitespace-normalised, read out of the file, not the diff). The only colour literal in the document is `#fdf7ee` = `A125` `page`; no new literal. `margin: 0` kept. Pinned by `tests/popup-window-look.spec.ts:396-460`. |
| **2 — the width moves with the surface** | **pass** | `.popup` (`src/popup/popup.component.ts:184-189`) declares `box-sizing: border-box; padding: 16px; font: 13px/1.45 system-ui, sans-serif; color: #1b2a33;` — **no** `width`. The document box is `width: 100%` (`index.html:33`). No width constant remains in the component: `POPUP_WIDTH` is deleted from the suite (`tests/popup-window-look.spec.ts:114-121`) and the report states why the number is retired rather than re-homed (`docs/state/t14-03-engineer.md:20`). Pinned by `sizes the document box by the panel and never at the settings 360px` (`:311-329`). |
| **3 — `.popup` stops being the surface** | **pass** | `:host` is `display: block;` only (`popup.component.ts:180-182`) — the cream fill is gone. `.popup` keeps exactly `box-sizing`, `padding: 16px`, the `13px/1.45 system-ui` scale and the `#1b2a33` ink, and loses `background: #fdf7ee` and `width: 320px`. Read verbatim from the file. One owner of the paint: the only `background: #fdf7ee` on this surface is the document's. Pinned by `leaves the paint and the width to the document box` (`:427-451`). |
| **4 — no frame returns** | **pass** | No `border`/`outline`/`box-shadow` declaration exists in `src/popup/index.html` (raw text: `\bborder\s*:` / `\boutline\s*:` / `\bbox-shadow\s*:` all false) or in `popup.component.ts`. The only occurrences of those words in the popup files are inside prose comments that name them as forbidden (`index.html:26-28`, `popup.component.ts:98-100`). No substitute frame, no substitute wrapper. Pinned three ways in the rewritten case (`:437-447`): the seven frame spellings absent from the stripped block, `border:`/`outline:`/`box-shadow:` absent from the raw document, and the old case's `:host` half. |
| **5 — the controls keep their own borders** | **pass** | `popup.component.ts:218-221` `.row { … border-top: 1px solid #a6cbdc; }`; `:224-226` `.row:first-child { border-top: 0; }`; `:243-250` checkbox `border: 1px solid #a6cbdc; border-radius: 3px; accent-color: #b8480d;`; `:259-278` `.delete` `24px` box with the `16px` glyph; `:229-232` `.title` `15px` step; `:184-189` `padding: 16px` and the `13px/1.45` scale. `git show --numstat f62fa9b` → the component is `+22/−19`, and the diff is one comment block plus exactly two deleted declarations on `.popup` and one on `:host`. **Nothing else moved.** |
| **6 — the document pin is rewritten, not dropped** | **pass** | `tests/popup-window-look.spec.ts:396-460`. See the section below. |
| **7 — the spec follows in the same commit** | **pass** | `docs/specs/content-overlay-ui.md` is in `f62fa9b` (`+4/−4`). See the section below. |
| **8 — gates green, counts quoted** | **pass** | The brief quotes the PM's re-run on `f62fa9b`: build 0 / `dist/` **12 files**, test 0 / **1049 tests / 47 files** (baseline 1048/47, +1), checker 0 / **176 info**, typecheck 0. The reviewer re-ran the checker itself: **0 errors, 0 warnings, 176 info**, exit 0 — matching. `git status --porcelain` empty; `dist/popup/index.html` really carries the new rule (the built artifact was inspected, not assumed). |

### AC 6 in detail — is the replacement a real pin, and can it pass vacuously?

`tests/popup-window-look.spec.ts:396-460` asserts, in order:

1. `blocks` (every `<style>` block, comments stripped) has length **1** — the one-block half survives;
2. `rules` (every `selector { body }` pair, whitespace normalised) has length **1** and `rules[0].selector === 'body'` — the one-rule half survives, and it is now a structural claim rather than a string-equality claim;
3. the body **contains** `background: #fdf7ee;`, `border-radius: 12px;`, `overflow: hidden;`, `margin: 0;` — each read as a whole declaration;
4. the body contains `width: 100%;` and `box-sizing: border-box;` — the geometry;
5. none of the seven `FRAME_DECLARATIONS` occurs in the stripped block, and `border:`/`outline:`/`box-shadow:` do not occur in the **raw** document — a commented-out frame cannot pass;
6. `body.indexOf(SURFACE_RADIUS) < body.indexOf(SURFACE_CLIP)` — the ordering of radius before clip, i.e. paint and clip on the same box;
7. `:host` carries no `margin`, no `border`, no `background`.

**Vacuity check: none of the seven can pass vacuously.** Assertions 1 and 2 are exact-length claims. Assertions 3, 4 and 6 are presence claims on a non-empty string: each names a declaration that a file which lost it would no longer contain, and assertion 6 cannot pass on an absent declaration — `indexOf` would answer `-1` for the radius and the comparison would fail. Assertion 5 is an absence over a non-empty block plus the whole raw file. Assertion 7 is a presence claim on `display: block` plus three absences. There is no `if`-guard, no optional chain and no `|| []` shortcut anywhere in the case.

**Is the case still the thing that makes the document's rule set deliberate?** Yes. It is the only assertion in the repository that fixes the popup document's rule set at all, and the brief's own mutation list is reproduced by the code: deleting the radius (M1), adding a frame (M2), deleting the paint (M3) and deleting the clip (M4) each falsify a distinct assertion in this one case. I re-derived those four falsifications against the shipped text without running the suite and each one holds. The case was **not** deleted — `git show f62fa9b -- tests/popup-window-look.spec.ts` shows the old title gone and the new one present.

The engineer also added one case the AC did not demand but which is the component's half of AC 3 (`leaves the paint and the width to the document box`, `:427-451`, new) and re-pointed the width case (`:311-329`). That is a strengthening, not a weakening.

### AC 7 in detail — the spec's sentences

`docs/specs/content-overlay-ui.md`:

- `:156` (the `Popup look` lead bullet) now reads: the popup **document box** is the surface, it carries the `A125` cream fill and the rounded shape, the component is **content inside it**, the surface draws **no frame**, and the ruling list carries **`A145`, which supersedes `A144`**. The old lead («the popup is the settings window's **card** in the `A125` palette, at the popup's own width») is gone — which also closes the `t14-02` review remark 3 (`S14-17`).
- `:158` — the bullet is renamed **`Surface shape`** and states: the surface is the document box; the single `<style>` block gives `body` the cream fill, `width: 100%` / `min-height: 100vh` / `box-sizing: border-box`, `border-radius: 12px` and `overflow: hidden` so paint and clip belong to the **same** box, and keeps `margin: 0`; the component declares **no** `background`, **no** `width`, no radius, no clip, no margin; `:host` keeps `display: block` and loses its cream fill; the old `320px` moved with the surface; the settings `360px` is still never used here; the settings window keeps its drawn frame as the deliberate other case; no frame is drawn anywhere; and an `Assumption:` line separates the rule (a fact about the source) from the sight (owed by Run 12, `S14-18`, `S14-19`).
- The **«one rule, one declaration»** sentence is corrected in both places it stood. It no longer exists anywhere in `docs/specs/`: a grep for `one rule, one declaration` / `one declaration` over `docs/specs/` returns nothing. The `Popup look` bullet and the **Dialog-box layout rule** bullet (`:95`) both now say the options document's one-rule philosophy is the settings page's own and **not** the popup's, naming `A145` and `S14-20`. The only surviving «exactly one rule» is `:95`'s, and it is a true statement about `src/options/index.html` (`src/options/index.html:14-18` really is `body { margin: 0; }` and nothing else).
- The look-suite bullet (`:162`) follows: it names the document box's rule set, the one `<style>` block, the one `body` rule, the cream paint, the radius, the clip, the zero margin, the absence of any `border` / `outline` / `box-shadow`, the absent `360px`, and the component's own absent `background` and `width`.

**No sentence is left claiming the popup document owns «one rule, one declaration».**

### The honesty requirement

The brief demanded one sentence saying the rounded look is unverified by tests and rests on a run. It is there and it is honest:

- `docs/state/t14-03-engineer.md:80` — «The rounded look is unverified by tests: every pin in this change is a fact about the source text, and whether a `border-radius` on the document box is visible in a real Chrome popup rests on Run 12.»
- The **spec** carries the same caveat in the bullet itself (`docs/specs/content-overlay-ui.md:158`): `Assumption:` this bullet is a rule about the **source**; whether a `border-radius` on the document box is visible in a real Chrome popup is a **sight**, not a measurement, and it rests on Run 12 (`S14-18`, `S14-19`).
- The **test file header** carries it too (`tests/popup-window-look.spec.ts:31-35`): «What this file **cannot** say: whether the rounded corners are visible in a real Chrome popup.»

**Does anything assert the sight as if it were established?** No. I read the spec bullet, both doc comments, every test title and the whole file header. Each one separates the two: the *rule* (a fact about the source, pinned) and the *sight* (owed by Run 12, attributed to a run and named as an assumption). The past-tense diagnosis («Chrome clips a popup window to a rectangle and paints the document box with the user agent's white») is written as the **measured** falsification of `A144` — it is what the reader's Run 11 answer forced — and the same paragraph then declines to extend it to `A145`'s premise. No sentence says the corners are rounded.

### The repeated failure of this family — is `A145` a rule set with the sight separated?

Yes. `A145` (`docs/state/stage-14-popup-look.md:288`) is stated as a rule about the **source** — `body` gains the fill, the geometry, `border-radius` and `overflow: hidden`; `app-root` and `.popup` become content — and the stage record states the premise separately and explicitly as a **sight** (`:304`, `S14-19` at `:312`): «`A145`'s premise — «Chrome clips a popup to a rectangle, and a `border-radius` on `body` is visible» — is **again a sight**, not a measurement.» The shipped rule is the same statement in CSS, and the pins test only the source. The unverified claim is not smuggled into a fact: it sits in an `Assumption:` line in the spec, in a `S14-19` ledger row, in the report's «honesty» section and in the test header. The next step if Run 12 reports square corners is written down too, and it is a measurement rather than another CSS guess.

## Blocking findings

**None.**

## Non-blocking findings (debt ledger)

1. **`src/popup/index.html:34` — `min-height: 100vh` is a declaration the ruling did not name.** The engineer flags it itself (`docs/state/t14-03-engineer.md:85`); it is `A125`-clean, pinned, and there for a real reason (a white band below a short list). But it is now part of the pinned rule set, so a reader comparing `A145` with the file sees one declaration more than the ruling names. Class: ruling / spec. The PM should either fold it into `A145` explicitly or strike it.
2. **`README.md:145` is false on `f62fa9b`.** It still says the popup keeps «форму карточки (рамка, скругление `12px`, …) при собственной ширине `320px`». The frame was removed by `A144` (`t14-02`) and the `320px` by `A145` (`t14-03`), so the sentence has been wrong for two tasks. The brief puts `README.md` out of scope («`README.md` is the PM's»), so it is not this task's failure — but it is the only shipped document that still describes a popup that does not exist, and it also still prints the stale baseline **1048 tests / 47 files**. Class: docs. The PM's to sync before the stage closes.
3. **`tests/popup-window-look.spec.ts:446` — the raw-document absence scan reads `readSource(DOCUMENT)` including the HTML comment.** A future comment that spells the word `border:` as CSS (not as prose) would be red even though it declares nothing. Deliberate and stated in the comment at `:445` («a commented-out frame is a frame waiting to come back»), and it is the safe direction for an absence claim. Class: test, no action owed.
4. **`tests/popup-window-look.spec.ts:443-445` — the stripped-block absence loop tests `documentCss` rather than the `body` rule body.** The block is the body rule today, so the two are the same text; the ordering of the `body` parse at `:410` and this loop at `:443` reads as if the loop belonged to the rule. Cosmetic; `rules[0].body` would be the sharper subject. Class: test style.
5. **`tests/popup-window-look.spec.ts:404-410` — the rule parser is regex-based.** `/([^{}]+)\{([^}]*)\}/g` over a comment-stripped block cannot model an at-rule or a nested block; `@media` would be read as a selector. No shipped rule uses one, and the failure would be a red case rather than a silent pass. Class: test.
6. **`docs/specs/content-overlay-ui.md:158` — `min-height: 100vh` is stated in the spec but the *reason* for it is only in the report.** The bullet lists the geometry without saying what the `100vh` buys (the cream reaching the bottom edge on a short list). A one-clause addition would keep the next reader from striking it as decoration. Class: doc.
7. **`docs/state/stage-14-popup-look.md:234` — the `A144` block still says «The popup document's single `body { margin: 0 }` rule stays.»** That is a true record of what `A144` decided, and `A145` supersedes it in the same file (`:288`), so the stage record is not contradictory when read whole. Worth a pointer beside `:234` the next time the file is touched, the same way `S14-17` was closed by `:156`. Class: docs (stage record, PM-owned).
8. **`S14-13` remains open** (`docs/state/stage-14-popup-look.md:240`): the palette's reading, the trash glyph against the page editor's drawing (`S14-4`), the checkbox and «nothing else moved» are still unanswered by a reader, and this change answered none of them. Class: look / ruling. Not this task's to close.

**Carried-fix checklist:** the brief lists none (`docs/state/t14-03-popup-window-shape.md` carries no `Carried-fix checklist` section), so there is no numbered deliverable to answer — recorded here so «nothing to answer» is written down rather than inferred (`docs/specs/code-review-flow.md`, the rule on carried fixes).

## One line on spec vs code

The spec and the code agree about **where** the popup's surface lives: the **document box** (`src/popup/index.html`'s single `body` rule) owns the fill, the geometry, the radius and the clip; `:host` and `.popup` own nothing of the surface and are content inside it — and both the spec bullet at `:156`/`:158` and the shipped stylesheets say exactly that, with no second owner of the paint anywhere in the tree.

## Evidence

- Slice: `f62fa9b` — `git show --numstat f62fa9b` → `docs/specs/content-overlay-ui.md` +4/−4, `src/popup/index.html` +27/−6, `src/popup/popup.component.ts` +22/−19, `tests/popup-window-look.spec.ts` +176/−60 — the four files and the sizes the brief names.
- Code: `src/popup/index.html:6-40`; `src/popup/popup.component.ts:180-189`, `:218-226`, `:243-250`, `:259-278`; `src/options/options.component.ts` `.options` (frame + radius present); `src/options/index.html:14-18`.
- Tests: `tests/popup-window-look.spec.ts:8-70` (header + named-reds), `:114-121` (the retired `POPUP_WIDTH`), `:125-148` (the surface constants and `FRAME_DECLARATIONS`), `:311-329`, `:396-460`, `:427-451`.
- Spec: `docs/specs/content-overlay-ui.md:95`, `:156`, `:158`, `:162`.
- Rulings: `docs/state/stage-14-popup-look.md:217` (`A144`), `:261-305` (Run 11 answered, `A145`, the sight), `:312` (`S14-19`), `:313` (`S14-20`).
- Report: `docs/state/t14-03-engineer.md`; brief: `docs/state/t14-03-popup-window-shape.md`; reader's report: `docs/state/run-11-popup-corners.md`.
- Reviewer's own read-only run: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 176 info(s)`.
- No file was edited, created or deleted by this review; `git status --porcelain` on `f62fa9b` is empty.
