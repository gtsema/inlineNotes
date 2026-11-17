# t3-02-content-highlight-tooltip

## Goal

Paint the entries of the current page with the **CSS Highlight API** and show a hover tooltip. The page DOM is never
mutated for painting: the only element the extension owns is the single overlay host.

## PM rulings this task implements

- `A38` **Painting is the CSS Highlight API, one named highlight per entry** (`inline-comment-model`/`content-overlay-ui`
  → Rules: `CSS.highlights` + `::highlight(inline-notes)`, one name per entry). If `CSS.highlights` is unavailable in
  the running Chrome, entries render unhighlighted and stay listed in the popup — never a fallback that wraps DOM nodes.
- `A41` **The extension owns exactly two page-level elements: the overlay host and one paint stylesheet.**
  A `Highlight` object cannot be styled from inside a shadow tree — `::highlight(name)` rules apply to ranges in the
  tree that owns them, and the ranges here are document ranges. So v1 must register a **document-level** style, and the
  least invasive legal way is preferred in this order:
  1. append a constructed stylesheet to `document.adoptedStyleSheets` (no element is added, so overlay AC2 stays true
     literally; append, never replace, so a page's own sheets survive);
  2. if the smoke run shows `::highlight()` rules do not apply through `adoptedStyleSheets`, fall back to exactly one
     `<style id="inlinenotes-paint">` element — which then requires overlay AC2 to read "… other than the overlay host
     and the single paint stylesheet", both with an `inlinenotes-` id prefix, both removed on teardown.
  **Which variant shipped is a Stage 3 smoke observation, not a guess**: `t3-02` must record in its report which one
  worked in the loaded `dist/`, and the spec line is edited to match. Alternative rejected for v1:
  `chrome.scripting.insertCSS` (needs a `scripting` permission the manifest does not have).
- `A39` **Teardown clears every name.** `CSS.highlights` is document-global: a paint pass removes the names it no longer
  needs (`CSS.highlights.delete`) rather than accumulating, and `clearPaint()` empties the map of `inlinenotes-…` names.
- `A40` **Hidden and stale entries are simply absent from the highlight.** No separate "dimmed" state (spec: a hidden
  entry has no highlight, no frame, no tooltip).
- `N7` (from `docs/state/t2-02-review.md`) **prefer `locateAnchor`.** Re-resolve uses `locateAnchor(root, anchor)`
  (it rebuilds the stream); `locateAnchorInStream` may be used only when the stream was built in the same pass from the
  same `root`, otherwise a same-shape in-place `node.data` rewrite passes the shape check.

## Carried fixes (three, all test-or-spec only — the budget limit is reached)

- `t3-01-content-create-card` review remark 4: keyboard reachability of the card has no test and nothing moves focus
  into the card on open.
- `t3-01-content-create-card` review remark 5: the `A29` re-derive-at-save property has no test that **mutates the DOM
  between open and save**; the paint pass reuses the same measurement, so it belongs here.

## Carried fix (one, from `docs/state/t3-04-review.md` remark 8)

- Pin the **removed-and-re-added (adopted) node** case: such a node resolves as live and must paint, not go stale. The
  behavior is correct today by walk-down/walk-up symmetry in `isInsideSubtree`; it is unpinned.

## Handover from `t3-04-content-anchor-hardening` (`docs/state/t3-04-content-anchor-hardening.md`)

- `locateAnchor` is now **all-or-nothing** (`A36`): any detached mapped node ⇒ `anchor_stale`, never a partial range.
  Painting therefore has exactly two states per entry: full set of fragments, or nothing (`A40`).
- A false `anchor_stale` has a cost beyond painting: an entry that resolves to nothing is **absent from `byEntryId`**,
  which frees its span for a new overlapping note (`A24`). Do not "repair" a stale entry by deleting or hiding it — the
  entry stays in the popup and stays deletable, and the overlap map is rebuilt from a fresh resolve on every create.
- The stream now treats `td`/`th` as boundaries (`A35`), so a table-heavy article streams differently than before
  `t3-04`; any smoke fixture with tables must be re-checked rather than trusted.

## AC (5 substantive + gates)

1. Re-resolve for one page: load the page's entries through core, build the stream **once**, resolve every anchor, and
   produce one paint pass: visible + resolvable entries become `Range`s in document order inside the single highlight
   name; `anchor_not_found` / `anchor_stale` produce nothing (spec → Staleness, ruling `A40`).
2. No page mutation beyond the two owned elements: after a paint pass, no element outside the shadow host and the
   single paint stylesheet was added, removed or attribute-changed (rulings `A38`/`A41`), and the paint stylesheet
   contains only `::highlight(…)` rules with the `inlinenotes-` prefix.
3. Hover tooltip: hovering painted text shows a semi-transparent card with `comment` + `authorName`; clicking it makes
   it opaque (overlay AC3). Tooltip content comes from the entry record, not from a DOM attribute on the page.
4. Ownership header: a tooltip/editor of an entry whose `authorName` differs from the current name shows the foreign
   header and offers no edit affordance (model AC7/AC8 UI half); `visible` never changes edit rights (`A1`).
5. Teardown honesty: `clearPaint()` removes every range and the highlight name; a second paint pass does not accumulate
   ranges; re-resolve after a DOM change rebuilds rather than reuses positions (ruling `A29`).

Gates green and quoted, in the `A62` order: `npm run build`, `npm test`, `node scripts/check-agent-config.mjs`.

Work order (`A53`, two commits): paint module + tooltip module + tests → `npm test` early → **commit 1**
`feat(t3-02): CSS Highlight painting and tooltip` → spec lines (`docs/specs/content-overlay-ui.md`: one named highlight
per entry (`A70`), teardown (`A39`), tooltip content source, the paint-path measurement rule (`A66`), the tooltip anchor
for zero-area boxes (`A67`)) → gates → **commit 2** `docs(t3-02): painting, teardown and tooltip rules`.

## Contracts from `t3-01b` (`docs/state/t3-01b-review.md` → Stage 3 readiness) — binding

- **The measurement seam is `src/content/capture/fragment-rect.ts`**: use `documentRangeForFragment` + `fragmentBox` over
  **every** fragment of an all-or-nothing locate (`A36`). Do **not** paint with `placementFragmentBox` — it skips
  fragments and would paint half a selection. Export `hasArea` for the tooltip instead of re-deriving
  `width > 0 && height > 0` in a second module.
- `A66`: a measurement throw in the paint pass is **per entry** — no highlight, no frame, no tooltip, the same observable
  state as `anchor_stale` (`A40`). The `catch` wraps only that entry's measurement, never the whole pass; it must not
  remove another entry's highlights and must never touch storage. Do not copy the bare `catch {}` from
  `create-card-controller.tsx:208-213` into a paint module.
- `A67` (assumption, one sentence in the spec): a zero-area fragment box anchors the tooltip to the **first fragment that
  has an area**; if no fragment has one, **no tooltip** — the entry stays listed in the popup and stays deletable.
- `A68`: the paint pass owns `CSS.highlights` exclusively and card visibility never clears it — `close()` hides the host,
  so an aggregate visibility owner is required or every card close flickers the highlights.
- The **load-time pass does not exist yet**: nothing in `src/content/` reads the page or the entries at load. Building
  that pass (entries → stream once → resolve all → paint) is part of this task, and it is the code path the overlay
  spec's Flow 2/8 assumes.
- The two importer-count pins in `tests/content-create-card-boundaries.spec.ts:120-130` must be widened **deliberately in
  the commit that adds the second reader**, not silently.

## Inputs the engineer reads

`docs/state/t2-02-review.md` (**`t3-01` readiness** paragraph — the fragment → `Range` rule: `start`/`end` are UTF-16
offsets inside `node.data`; `streamStart`/`streamEnd` must never reach a `Range`), `docs/specs/content-overlay-ui.md`
(Flow, Rules, AC2/AC3, the `Text stream and fragments` rule), `docs/specs/inline-comment-model.md` (Staleness,
`visible`, edit rights), `docs/state/t3-02-content-highlight-tooltip.md`, `src/content/anchor/locate-anchor.ts`,
`src/content/overlay/`, `src/core/entry-store-read.ts`, `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.

## Explicitly out of scope

The editor (save/cancel/delete, `t3-03`), popup and options (Stage 4), SPA URL watching and `storage.onChanged`
(`t4-03`), any fallback painting that touches the page DOM.

## Attempts log

- attempt 1: brief prepared; delegated after `t3-01-content-create-card` acceptance.
- attempt 1 **died mid-task (host crash, 2026-11-17 ~12:45)**: the parent session became
  uncompactable and took the child with it (see `docs/retro.md`, Stage 3 crash entry). No report
  was written, **no commit was made**. The tree still carries the whole attempt-1 slice.
- attempt 2: completion brief below; the attempt-1 code is kept, not rewritten.

## Attempt 1 delivered state (uncommitted, 2026-11-17 12:36)

- new source: `src/content/paint/highlight-name.ts`, `paint-plan.ts`, `paint-style.ts`,
  `paint-surface.ts`, `page-painter.ts`;
- modified source: `src/content/capture/fragment-rect.ts` (new `DocumentRangeForFragment` alias,
  `documentRangeForFragment` now returns a real `Range`, `hasArea` exported for `A67`),
  `src/content/main.ts` (load-time `createPagePainter(document, { port, url }).refresh()`);
- new tests: `tests/content-paint-plan.spec.ts`, `content-paint-style.spec.ts`,
  `content-paint-surface.spec.ts`, `content-page-painter.spec.ts`;
- gates as measured by the PM: `tsc -p tsconfig.content.json --noEmit` **green**;
  `node scripts/check-agent-config.mjs` **0 errors**; `npm test` **587 green / 5 red**;
  `npm run build` not re-run by the PM (the tree builds, `dist/content.js` is from 12:41).
- **not started at all**: the tooltip (AC3, AC4), the ownership header, the spec lines.

The five red tests, with the PM's diagnosis (the engineer verifies it, does not trust it):

1. `tests/content-anchor-boundaries.spec.ts:205` — “jsdom discipline > is never referenced by
   shipped source”. That pin scans the **whole file text including comments**, and
   `src/content/paint/paint-style.ts:25,30` plus `src/content/paint/paint-surface.ts:25,108`
   name the banned tool in prose. Fix by rewording the prose; **do not relax the pin** (ruling `A2`).
2. `tests/content-create-card-boundaries.spec.ts:118` — “asks core for a page read in exactly one
   module”. The paint pass is legitimately the second reader of `src/core/entry-store-read.ts`;
   this brief is the commit that widens the pin **deliberately**, as `t3-01` readiness demanded.
3. `tests/content-create-card-boundaries.spec.ts` — “uses the fresh-stream locate, never the
   per-entry stream rebuild (`A37`, `N7`)”. Either the paint call site uses the wrong locate entry
   point or the pin has to learn the new caller; the behavior required is one stream per pass.
4. `tests/content-page-painter.spec.ts:441` — “paints nothing when the store cannot be read, and
   reports the code”. A failed read must leave the surface empty: `painted` is the previous pass
   surviving instead of being dropped. Nothing may be painted from data older than this pass.
5. `tests/content-page-painter.spec.ts:503` — “keeps every highlight when the create card opens
   and closes” (`A68`). `controller.isOpen()` is `false`, so the fixture never opened a card and
   the `A68` property is not actually being tested. Fix the fixture wiring (a real selection in the
   jsdom document), not the paint module.

## Attempt 2 completion brief (PM)

Scope is **unchanged**: the 5 AC above, nothing re-scoped, nothing added.

1. Read the attempt-1 modules and their tests before touching anything; finish them in place.
   Do not rewrite a module that already satisfies its test.
2. Make the five red tests green per the diagnosis. Pins change only where this brief says so, and
   the reason goes into the test as a comment naming this task and ruling.
3. Build what attempt 1 never reached: **AC3 hover tooltip** and **AC4 ownership header**.
   - The tooltip shows `comment` + `authorName` from the entry record, never from a page attribute;
     semi-transparent on hover, opaque after a click on it (`content-overlay-ui.md` Flow 3–4, AC3).
   - The click makes it opaque **and nothing else**: no textarea, no `Сохранить`/`Отмена`/`Удалить`
     — the editor is `t3-03-content-editor`. The foreign-entry header (`Вы` vs the author name)
     exists here and offers no edit affordance (model AC7/AC8 UI half); `visible` never changes
     edit rights (`A1`).
   - The tooltip lives in the shadow host, is anchored to the **first fragment box with an area**
     (`A67`, via the exported `hasArea`), and near a viewport edge flips to the other side and never
     covers its own range (overlay → Edge Cases).
   - An entry with no area-bearing fragment gets **no tooltip**; it stays listed and deletable.
   - Hover hit-testing must not open the create card: the painted range is not a selection, and the
     `selectionchange` handler stays as `t3-01` left it (`t3-03` owns selection-inside-the-editor).
4. Commit order (`A53` plus crash insurance — this is why the split is allowed):
   - **commit 1** `fix(t3-02): paint pass over one stream, pins widened` — the attempt-1 code plus
     the five green tests. Make this commit **as soon as the five are green**, before starting the
     tooltip, so a second crash cannot lose the slice again.
   - **commit 2** `feat(t3-02): hover tooltip and ownership header` — tooltip module + tests.
   - **commit 3** `docs(t3-02): painting, teardown and tooltip rules` — spec lines in
     `docs/specs/content-overlay-ui.md`: one named highlight per entry (`A70`), teardown (`A39`),
     the paint-path measurement rule (`A66`), the tooltip anchor for zero-area boxes (`A67`), the
     tooltip content source, and **which `A41` variant shipped** (`adoptedStyleSheets` or the single
     `<style id="inlinenotes-paint">`) — record what the code does, and if the fallback shipped,
     amend AC2 in the same commit.
   Gates in `A62` order before each commit.
5. Report to `docs/state/engineer-report.md`: commits, commands quoted, AC self-check per AC1–AC5,
   deviations, and the `A41` observation. Do not edit the task state file.

Hard constraints carried from `t3-01b` (binding, restated in one line each): the measurement seam is
`documentRangeForFragment` + `fragmentBox` over **every** fragment, never `placementFragmentBox`;
`A66` per-entry `catch`, never a pass-wide one and never a storage write; `A68` the paint pass owns
`CSS.highlights` and card visibility never clears it; `A39` teardown deletes every `inlinenotes-…`
name and a second pass does not accumulate; no page DOM mutation beyond the host and the one paint
stylesheet.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **2** (attempt 1 engineer — crashed,
delivered an uncommitted tree; attempt 2 engineer — completion). Remaining: 2 (reviewer + 1 fix).

## Verdicts

- engineer report: attempt 1 crashed (no report, no commit); attempt 2 in flight
- reviewer verdict: not started

## Open questions

- `A38`–`A40` are PM defaults; each is one module to change.
- `A41` is **confirmed by the user (2026-11-16: "Да")**: try `document.adoptedStyleSheets` first (no page element is
  added, so overlay AC2 stays literally true); the single `<style id="inlinenotes-paint">` fallback is used only if the
  Stage 3 smoke shows `::highlight()` rules do not apply through an adopted sheet, and then overlay AC2 is amended in
  the same commit. `t3-02` must state in its report which variant shipped.
- Whether the tooltip follows text selection inside itself (it must not open the create card) — `t3-03` owns that
  interaction; recorded so the two slices do not collide on the `selectionchange` handler.
