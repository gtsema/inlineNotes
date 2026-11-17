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

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): paint module + tooltip module + tests → `npm test` early → spec lines
(`docs/specs/content-overlay-ui.md`: one highlight name, teardown, tooltip content source) → gates →
commit `feat(t3-02): CSS Highlight painting and tooltip`. Commit as soon as green; a committed green state with a short
report is accepted, an uncommitted perfect one is not.

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

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A38`–`A40` are PM defaults; each is one module to change.
- `A41` is **confirmed by the user (2026-11-16: "Да")**: try `document.adoptedStyleSheets` first (no page element is
  added, so overlay AC2 stays literally true); the single `<style id="inlinenotes-paint">` fallback is used only if the
  Stage 3 smoke shows `::highlight()` rules do not apply through an adopted sheet, and then overlay AC2 is amended in
  the same commit. `t3-02` must state in its report which variant shipped.
- Whether the tooltip follows text selection inside itself (it must not open the create card) — `t3-03` owns that
  interaction; recorded so the two slices do not collide on the `selectionchange` handler.
