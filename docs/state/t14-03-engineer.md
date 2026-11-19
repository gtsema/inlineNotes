# t14-03 engineer report — the rounding moves to the document box

Commit **`f62fa9b`** — `style(popup): the rounding moves to the document box (t14-03, A145 supersedes A144)`.
Four files, `+229 / −89`. Working tree clean after the commit, nothing staged.

## Changed paths

| Path | What changed |
|---|---|
| `src/popup/index.html` | The single `<style>` block becomes the popup's **surface rule**. `body` gains `width: 100%`, `min-height: 100vh`, `box-sizing: border-box`, `background: #fdf7ee`, `border-radius: 12px`, `overflow: hidden`, and keeps `margin: 0`. The HTML comment is rewritten: it says why the surface lives in the document (Chrome clips a popup to a rectangle and paints `body` white, so `body` **is** the box the reader sees), why `overflow: hidden` is not decoration (paint and clip must be the same box), and that no frame may appear. No `border`, no `outline`, no `box-shadow`, no colour outside `A125`, no new literal. |
| `src/popup/popup.component.ts` | `.popup` stops being the surface: it **loses** `width: 320px` and `background: #fdf7ee`, and keeps `box-sizing: border-box`, `padding: 16px`, `font: 13px/1.45 system-ui, sans-serif`, `color: #1b2a33`. `:host` loses its cream fill and keeps `display: block`. The class doc comment's look paragraph is rewritten for `A145` (the component is not the surface; the paint lives in exactly one place; no frame anywhere; `A144` was right about the corruption and wrong about the direction). Nothing else moved: the row separator, `.row:first-child`, `.row--foreign .author`, `.toggle`, the checkbox rule, `.author`, `.delete`, `.delete svg`, `.empty`, `.title`, `button.notice` are byte-identical. |
| `tests/popup-window-look.spec.ts` | The document pin is **rewritten, not dropped** (AC 6), two new cases are added, and two existing cases are re-pointed at the box that now owns the paint and the width. Details below. |
| `docs/specs/content-overlay-ui.md` | The `Popup look` lead bullet and the `Card shape` bullet (now `Surface shape`) state that the **document box** carries the fill and the rounded shape, that the component is content inside it, that no drawn frame exists, and that `A145` supersedes `A144`. The «one rule, one declaration» claim is corrected in both places it stood, and the options document's philosophy is marked as its own (`S14-20`). The look-suite bullet follows. |

No `src/content/`, `src/core/`, `src/options/`, manifest, asset, icon or `scripts/` change. No new dependency, no network call, no new Russian string (`POPUP_STRINGS` unchanged, six keys). `dist/` stays **12 files**.

### The width constant: which rule owns it now, and why

**No width constant stays in the component.** `320px` was `.popup`'s width, and `.popup` is no longer the surface: the box that is the surface is the document box, and that box spans the panel (`width: 100%`), so the cream reaches both edges and the rounded corners are the window's corners. A `320px` on the document box would have re-created the defect in a new place — a fixed-width cream rectangle inside a wider panel — so the number is not re-homed, it is **retired**, and the pin that read it (`POPUP_WIDTH`) went with the declaration that carried it (the brief allows this explicitly: «If you keep a width constant in the component…» — I did not).

What the pin asserts instead is the half that still matters: the document box is `width: 100%`, the component declares **no** `width` on `.popup` or on `:host`, and the settings `360px` appears nowhere in the component, in the document's stripped text, or in the document's raw text. The test constant `POPUP_WIDTH` is deleted; `SETTINGS_WIDTH = '360px'` stays and is now read against three texts instead of two.

## The pins: what was rewritten, what was added, what was re-pointed

| Case | Change | Why |
|---|---|---|
| `the document box is the surface: one block, the cream paint, the radius, the clip, the zero margin and no frame` | **Rewritten** from `gives the document the body margin the options document owns, and nothing else` | This is AC 6's pin. It used to assert, by whitespace-normalised string equality, that the one block was exactly `body { margin: 0; }`. That is false on purpose now. The new case pins: exactly one `<style>` block; exactly one rule and its selector is `body`; the body carries `background: #fdf7ee;`, `border-radius: 12px;`, `overflow: hidden;`, `margin: 0;`, `width: 100%;`, `box-sizing: border-box;`; the radius appears **before** the clip in the body (paint and clip are the same box); no `border:` / `border-top:` / `border-left:` / `border-right:` / `border-bottom:` / `outline:` / `box-shadow:` in the stripped block; and no `border:` / `outline:` / `box-shadow:` anywhere in the raw document (a commented-out frame is a frame waiting to come back). It also keeps the old case's `:host` half: no margin, no border, **and now no background**. |
| `leaves the paint and the width to the document box` | **New** | The component's half of AC 3: no `background` on `:host` or `.popup` in the **verbatim** stylesheet (a commented-out fill is flagged), and neither rule declares `width`, `border-radius`, `overflow` or `margin`. Also keeps the old case's `padding: 16px` presence and the `12px`-inset absence. |
| `sizes the document box by the panel and never at the settings 360px` | **Re-pointed** | Was `sizes the card at the popup's own 320px…`. Now reads the document box for `width: 100%` and asserts the component declares no width and no `max-width`, plus the `360px` absence on three texts. |
| `declares every A125 role the surface uses as a literal` | **Re-pointed** | The cream fill is asserted on the **document** now (`documentStyles(DOCUMENT)` contains `background: #fdf7ee;`); the `:host`/`.popup` fill assertions are gone with the declarations. Every other role assertion is untouched. |
| `declares no colour outside the five A125 roles and the kept refusal colour` | **Re-pointed** | The document scan used to assert **no colour at all** in the document. That is false now: the document paints. It asserts the document's literal set is non-empty, contains `#fdf7ee`, and is a subset of the seven `A125` roles plus the kept refusal — so a new literal in the document is red exactly as it is in the component. |
| `draws no frame and no radius on the card while the settings card keeps its own` | **Narrowed by one entry** | The shared-half list dropped `background: #fdf7ee;` (the paint is the document's now; keeping it would pin a declaration `A145` deliberately removed). `padding: 16px`, the type scale and `color: #1b2a33` remain shared and are still asserted exactly once on the card, and the settings card's frame + radius are still pinned **present** from `src/options/options.component.ts`. The popup's absent frame/radius, the verbatim `rest` scan, the separator and the checkbox assertions are untouched. |

Everything else in the file is byte-identical: the palette literals, the retired trio, the icon-only delete control and its `24`/`16` constants, the glyph comparison, the checkbox bindings, the notices, the no-mascot case. No pin was weakened other than the one AC 6 names, plus the single shared-half entry above, which is a consequence of AC 3 and is stated here rather than discovered later.

## Mutations — applied, observed, reverted from a `cp` copy

Copies made first: `cp src/popup/index.html /tmp/t1403-index.html.bak` and `cp src/popup/popup.component.ts /tmp/t1403-component.ts.bak`. Every revert was `cp /tmp/…bak <target>` followed by `diff` against the copy (both `diff`s silent). No `git checkout` was used at any point.

| # | Mutation | Observed | Reverted |
|---|---|---|---|
| M1 | `border-radius: 12px;` deleted from the document's `body` | **1 red** — `the document box is the surface…` → `expected 'margin: 0; width: 100%; min-height: 1…' to contain 'border-radius: 12px;'` | from the `cp` copy |
| M2 | `border: 1px solid #a6cbdc;` added to the document's `body` (the frame returning) | **1 red** — same case → `border:: expected '\r\n body {\r\n margin: 0…' not to contain 'border:'` | from the `cp` copy |
| M3 | `background: #fdf7ee;` deleted from the document's `body` (the white box returning) | **3 red** — `declares every A125 role…`, `retires the three literals…` (`expected [] to include '#fdf7ee'`) and `the document box is the surface…` | from the `cp` copy |
| M4 | `overflow: hidden;` deleted from the document's `body` | **1 red** — `the document box is the surface…` → `expected '…' to contain 'overflow: hidden;'` | from the `cp` copy |
| M5 | `width: 320px;` and `background: #fdf7ee;` put back on `.popup` (the component becoming the surface again) | **2 red** — `sizes the document box by the panel…` (`expected '\r\n width: 320px;\r\n back…' not to match /(?:^|;)\s*width:/`) and `leaves the paint and the width to the document box` (`expected '\r\n :host {\r\n display: blo…' not to match /background:\s*#fdf7ee;/`) | from the `cp` copy |

After the last revert, `diff` against both copies was silent and the file passed 16/16 again before the gates were run.

**Which mutation turns the rewritten document pin red:** M1 (the radius), M2 (a frame), M3 (the paint), M4 (the clip) — each one alone, each on the pin AC 6 rewrites. M5 turns the two new component cases red instead.

## AC self-check, line by line

| AC | Verdict | Evidence |
|---|---|---|
| **1 — the document box is the surface** | done | `src/popup/index.html`: one `<style>` block, one `body` rule with `margin: 0; width: 100%; min-height: 100vh; box-sizing: border-box; background: #fdf7ee; border-radius: 12px; overflow: hidden;`. The cream is the `A125` `page` role; no other literal is introduced (the document's literal set is `{#fdf7ee}` and the palette scan asserts it is a subset of the `A125` roles). Pinned by `the document box is the surface…`; M1/M3/M4 prove the radius, the paint and the clip are load-bearing. |
| **2 — the width moves with the surface** | done | `.popup` no longer declares `width`; the document box is `width: 100%` and `box-sizing: border-box` so the padding cannot push it past the panel. **No width constant stays in the component** — the `320px` is retired rather than re-homed, and the pin that read it (`POPUP_WIDTH`) went with the declaration; the report says so above. Pinned by `sizes the document box by the panel and never at the settings 360px`; M5 is red on it. |
| **3 — `.popup` stops being the surface** | done | `.popup` = `box-sizing: border-box; padding: 16px; font: 13px/1.45 system-ui, sans-serif; color: #1b2a33;` — `background: #fdf7ee` and `width: 320px` gone. `:host` = `display: block;` — cream fill gone. Pinned by `leaves the paint and the width to the document box` (verbatim absence of the fill; no width/radius/overflow/margin on either rule) and by the re-pointed palette case. |
| **4 — no frame returns** | done | No `border`, `outline` or `box-shadow` was added anywhere. The document pin asserts all seven frame spellings absent from the stripped block and `border:`/`outline:`/`box-shadow:` absent from the raw document; the card's own rule is still pinned frame-free and radius-free; the settings card's frame is still pinned present. M2 is red on the frame. |
| **5 — the controls keep their own borders** | done | Untouched and still pinned: `.row` `border-top: 1px solid #a6cbdc`, `.row:first-child { border-top: 0 }`, the checkbox `border: 1px solid #a6cbdc; border-radius: 3px; accent-color: #b8480d`, `.delete` `24px` box with the `16px` glyph, the six `A125` literals, the `13px/1.45` scale, the `15px` title step and `padding: 16px`. The `git diff` of the component is one comment block plus exactly two deleted declarations and one deleted `:host` declaration. |
| **6 — the document pin is rewritten, not dropped** | done | The old case is replaced by `the document box is the surface: one block, the cream paint, the radius, the clip, the zero margin and no frame` — one block, one `body` rule, the paint, the radius, the clip, the zero margin, the panel geometry, and the absence of any frame declaration. Mutations M1–M4 each turn it red, applied and reverted from `cp` copies. The case was not deleted: `git show f62fa9b -- tests/popup-window-look.spec.ts` shows the old title gone and the new one present. |
| **7 — the spec follows in the same commit** | done | `docs/specs/content-overlay-ui.md` in `f62fa9b`: the `Popup look` lead bullet now says the **document box** is the surface, the component is content inside it, and no frame is drawn; the `Card shape` bullet became **`Surface shape`** and states the fill, the geometry, the radius, the clip, the zero margin, the absent frame, the absent component fill/width, the settings window as the deliberate other case, `A145` **superseding `A144`**, and the `Assumption:` that the rounded look is a sight owed by Run 12. The «one rule, one declaration» claim is corrected in both places it stood: the `Popup look` bullet and the **Dialog-box layout rule** bullet (`:95`), which now says the options document's one-rule philosophy is the settings page's own and not the popup's (`S14-20`). The look-suite bullet follows. |
| **8 — gates green, counts quoted** | done | See below. `dist/` **12 files**; **1049 tests / 47 files** (baseline 1048/47, +1); checker **176 info**; typecheck clean. |

## Commands run (profile order)

| Command | Exit | Result |
|---|---|---|
| `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f \| wc -l` → **12** |
| `npm test` | **0** | `Test Files 47 passed (47)`, `Tests 1049 passed (1049)` |
| `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 176 info(s)` |
| `npm run typecheck` | **0** | three `tsc --noEmit` projects, no output |

Also run, outside the gate list: `npx vitest run tests/popup-window-look.spec.ts` → 16/16 green before and after every mutation loop.

**A count that moved and was put back.** The first checker run after the spec edit reported **177 info**: my new spec sentence spelled the popup document's path as a backticked `src/popup/index.html`, and the checker counts any backticked `src/…` token as a *planned path not created yet* (it treats every `src/` token as a plan prefix, whether or not the file exists). I measured the delta by running the checker against the `HEAD` spec and the new spec (`diff` of the two logs: exactly one added line) and then reworded the sentence to «the popup document's single `<style>` block». The checker is back to **176 info** and no `scripts/` change was needed. The count is quoted at 176, not 177.

## The honesty requirement

**The rounded look is unverified by tests: every pin in this change is a fact about the source text, and whether a `border-radius` on the document box is visible in a real Chrome popup rests on Run 12.** `A145`'s premise is a sight, not a measurement, and the previous premise in the same family (`A144`) was wrong — so this report does not claim the corners are rounded, only that the rule set is the one the ruling names and that it is pinned. If the reader reports square corners again, the next step is to check whether Chrome clips a popup to a rectangle at all, and if it does, the honest answer is that a popup cannot be rounded and the rule is withdrawn with that finding recorded — not another CSS guess.

## Open questions / residual risks

1. **`A145`'s premise is still a sight** (`S14-19`). Nothing in this repository can settle it; Run 12 is the only instrument. The pins deliberately do not pretend otherwise.
2. **`min-height: 100vh` on the document box is a new declaration the brief did not name.** It is there so the cream reaches the bottom edge on a short list (otherwise a white band would appear below the content — the same class of defect as the white band around the card). It is `A125`-clean, it is not a colour, and it is pinned. If the PM wants the document's rule set to be exactly the four things the ruling names, this is the one declaration to strike.
3. **The component's `:host` still declares `display: block`.** It is not a surface property, and removing it would change layout; kept.
4. **Two cases were re-pointed, not merely kept** (the palette case and the width case), because the declarations they read moved. Both now read the document box, and the palette case's document scan went from «no colour at all» to «a subset of the `A125` roles» — a narrowing of an absence that `A145` made false, in the same spirit as the `t14-02` narrowing the reviewer accepted. Stated here so it is a decision, not a discovery.
5. **`S14-15`/`S14-16` are untouched**: the absence scan is still coupled to three selector names, and the `everything` alias is still the same string as `styles`.
6. **`README.md` is the PM's** and still says the popup is «при собственной ширине `320px`» (`README.md:145`), which is now false. Not touched by me, by instruction.

## No staged files

`git status --porcelain` after the commit is empty; `git diff --cached --name-only` is empty.
