# Engineer report — `t3-02-content-highlight-tooltip`, attempt 2 completion

Engineer role. Working tree at report time: **clean**, nothing staged. Branch state: 4 commits on top
of `faecd71 docs(state): t3-02 attempt 1 crash log…`.
`docs/state/*.md` were read only; no state file was edited. No `git push`, no dependency change, no
`src/core/` change, no editor UI, no popup/options work, no SPA / `storage.onChanged` work.

## 1. Commits

| Hash | Message | Content |
|---|---|---|
| `bc2106c` | `fix(t3-02): paint pass over one stream, pins widened` | Attempt-1 working-tree slice committed as crash insurance, with the five red tests made green (see §5). |
| `0f1e496` | `feat(t3-02): hover tooltip and ownership header` | AC3 + AC4: `src/content/overlay/tooltip-style.ts`, `tooltip.tsx`, `tooltip-hit-test.ts`, `tooltip-controller.tsx`, `tooltip-events.ts`; wiring in `src/content/main.ts`; two strings in `src/content/text.ts`; `FragmentOffsets` shape in `capture/fragment-rect.ts`; `tests/content-tooltip.spec.ts` (27 cases). |
| `bd9ac81` | `docs(t3-02): painting, teardown and tooltip rules` | `docs/specs/content-overlay-ui.md`: Terms rows, Flow 3/4, five new Rules bullets, three new Edge Cases, AC3 split, AC15 + AC16 added. |
| `ebb8caa` | `fix(t3-02): fixture argument types under tsconfig.spec` | `npm run typecheck` was red (3 of those errors came in with `bc2106c`): `recordFor(… , 2)` passed a number where an overrides record was expected, and `port.failNextRead('storage_unavailable')` used a page-load code instead of the port code `unavailable`. Test-only. |

The brief asked for three commits; the fourth is the typecheck fix described above and is kept separate
so the three briefed checkpoints stay readable.

## 2. Gates (quoted, in the `A62` order, run on the final tree)

```
npm run build
[build] built dist/content.js with esbuild
[build] manifest references resolved: content.js, popup/index.html, options/index.html
[build] dist/content.js (100259 bytes)
[build] dist/ is a self-contained MV3 folder (10 files)

npm test
 Test Files  33 passed (33)
      Tests  619 passed (619)

node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 29 info(s)
```

Extra gate, not required by `A62`, run because it was red inside this slice:

```
npm run typecheck        # content + app + spec projects
(no output → green)
```

`dist/content.js` contains the tooltip code (`grep -c "caretPositionFromPoint\|inlinenotes-tooltip-root" dist/content.js` → `2`).

Test count moved `592 → 619` (the 27 new cases), files `32 → 33`.

## 3. Which `A41` variant shipped

**Variant 1: a constructed `CSSStyleSheet` appended to `document.adoptedStyleSheets`.**
`src/content/paint/paint-style.ts` appends the sheet (`adoptedStyleSheets = [...existing, sheet]`, never a
replacement, so a page's own adopted sheets survive) and rewrites it in place with `replaceSync`.
**No `<style id="inlinenotes-paint">` element exists in the shipped build** — the page gains **zero** style
elements; the only page-level element the extension owns is the overlay host
(`#inlinenotes-overlay-host`). Consequence for task AC2: it is literally true without amendment, because
the second of the "two owned elements" was never added. Variant 2 stays named in the code and in the spec
as "not shipped", to be used only if a real-browser smoke shows that `::highlight()` rules do not apply
through an adopted sheet (see §7, risk 1).

## 4. AC self-check (task file §"AC (5 substantive + gates)")

**AC1 — one pass, one stream, every anchor, `A40`/staleness produce nothing.**
Implemented by `src/content/paint/page-painter.ts` + `paint-plan.ts`: `loadEntries` (core) → one
`buildTextStream` per pass → `locateAnchorInStream` per entry → `buildPaintPlan` → `PaintSurface`.
A visible-and-resolvable entry becomes one `Range` per fragment of its all-or-nothing locate, in document
order, all under that entry's own name; `anchor_not_found` / `anchor_stale` / `hidden` /
`measurement_failed` land in `skipped` and paint nothing.
Pinned in `tests/content-page-painter.spec.ts`: *"paints one named highlight per visible resolvable entry"*,
*"paints every fragment of a span that wraps, and keeps them under one name (A36)"*,
*"reports an entry whose text the page lost, and keeps it stored (A24, A40)"*,
*"drops the name of an entry that went hidden and keeps the rest"*; in `tests/content-paint-plan.spec.ts`
the one-stream rule and `A36` are pinned directly.
One wording conflict is reported in §6.1 (AC1's "single highlight name" vs ruling `A70`).

**AC2 — no page mutation beyond the owned elements; the paint stylesheet holds only prefixed
`::highlight(…)` rules.**
Shipped: adopted stylesheet (variant 1) → zero added page elements; painting registers `Range`s only.
Pinned: *"leaves the document element byte-identical and adds no host"*, *"paints nothing, throws nothing and
writes no rule"*, *"removes only the names of this extension, never a page script name (A39)"*; tooltip side:
*`tests/content-tooltip.spec.ts` › "adds nothing to the page document and no style element to it"* (page
subtree byte-identical, page `<style>` count unchanged, the tooltip wrapper and its style live in the shadow
root). `tests/content-paint-style.spec.ts` pins that every generated rule is
`::highlight(inlinenotes-…)` and nothing else.

**AC3 — hover shows a semi-transparent card with `comment` + `authorName`; a click makes it opaque;
content from the record, not from a page attribute.**
`tooltip-hit-test.ts` answers "which painted entry is this caret inside"; `tooltip-controller.tsx` mounts
`Tooltip` in the existing shadow host with `entry.comment` and `entry.authorName`;
`tooltip-style.ts` holds `TOOLTIP_OPACITY = 0.75` and `TOOLTIP_PINNED_OPACITY = 1`, and the controller only
adds the `is-pinned` class.
Pinned: *"shows the stored comment and author of the entry the caret is inside"* (and the same test asserts
the comment appears nowhere in `document.body`), *"names the author of a foreign entry from the record, not
from the page"*, *"is semi-transparent on hover and opaque after a click, by the spec numbers"* (asserts the
constants equal `0.75` / `1`, the same discipline as the `settle delay` pin), *"makes the click opaque and
nothing else: no editor, no write, no repaint"*, *"never opens a create card while hovering painted text"*.

**AC4 — ownership header; foreign entry offers no edit affordance; `visible` never changes edit rights.**
`ownershipHeaderOf` / `isOwnEntry` call core `canEdit` with the author name the pass read
(`authorNameOfPass`, read once per pass); the own case is `CONTENT_STRINGS.ownEntry` («Вы»), the foreign case
prints the stored `authorName` verbatim. No name in settings ⇒ every entry is foreign.
Pinned: *"says `Вы` for an entry of the current reader"*, *"prints the stored author name for a foreign entry
and offers no edit affordance"* (no `textarea`, no `button` in the shadow root, even after a click),
*"treats every entry as foreign when the settings name no reader"*, *"re-reads the ownership of the current
pass, not of the entry"*; `A1` (visibility ≠ edit rights) is asserted inside `isOwnEntry`'s test and there is
no visibility term anywhere in the header path. The paint style is identical for own and foreign
(`paint-style.ts`, pinned by "removes only the names…"), so the header is the only difference.

**AC5 — teardown honesty: `clearPaint()` removes every range and name; a second pass does not accumulate;
re-resolve rebuilds rather than reuses positions (`A29`).**
Pinned: *"clearPaint removes every paint name and every rule of the sheet (A39)"*,
*"registers each name again and keeps one set of ranges per entry"* (no accumulation across two passes),
*"re-resolves the page on the next pass instead of trusting its last boxes (A29)"*,
*"removes only the names of this extension, never a page script name (A39)"*.
On the tooltip side the same rule is pinned by *"measures the anchor at hover time, so moved text moves the
tooltip"*: the hover does not reuse the pass's boxes.

**Gates row** — §2, quoted in `A62` order.

## 5. The five red tests of attempt 1 (commit `bc2106c`), verified not assumed

1. `tests/content-anchor-boundaries.spec.ts` (no-DOM / jsdom-name pin): shipped paint modules named the test
   DOM in prose. Prose changed to "test DOM" / "headless DOM"; **the pin itself was not touched**.
2. `tests/content-create-card-boundaries.spec.ts` importer pins (`:120-130`): widened **deliberately**, in the
   commit that adds the second reader, with comments naming `t3-02`, `A37`/`N7` — `page-painter.ts` is the
   second legitimate `loadEntries` reader, `paint-plan.ts` is the one-stream locate caller.
3. `tests/content-page-painter.spec.ts` storage-unavailable case: a pass that painted and then lost the read
   left its highlights standing. Added `UNTRUSTWORTHY_READ_CODES`
   (`storage_unavailable`, `layout_version`, `index_malformed`, `slot_malformed`, `url_unparsable`): such a
   pass tears the paint down and returns an empty result with the codes. `entry_malformed` is deliberately
   excluded and the reason is written in the file.
4–5. The remaining two failures came from the same jsdom-name and pin-scan causes; both green in the same
   commit. `A68` coexistence test additionally had to be repaired: a headless DOM gives a real `Range` no
   layout, so the fixture now injects `rangeFor: seam([BOX_A]).rangeFor` and the create card really opens and
   closes.

## 6. Deviations, decisions and corrections (nothing invented; everything listed)

1. **Hover re-measures the anchor instead of reusing `PaintedEntry.tooltipBox`.** A box measured during the
   paint pass stops describing its text after a scroll, so a tooltip placed from it lands over the wrong
   words. `placementFragmentBox` (the card's placement walk, `A67`: first fragment box with an area) is called
   at hover time. `PaintedEntry.tooltipBox` is kept as the pass snapshot and its comment now says so. The
   `t3-01b` contract *"do not paint with `placementFragmentBox`"* is respected: painting still uses
   `documentRangeForFragment` + `fragmentBox` over every fragment; `placementFragmentBox` is used for
   placement only (card and tooltip). `hasArea` is imported rather than re-derived.
   To make that possible `fragment-rect.ts` now takes a structural `FragmentOffsets` (`node`, `start`, `end`)
   instead of `TextFragment`; `TextFragment` still satisfies it, and the shape still cannot see
   `streamStart` / `streamEnd`.
2. **Hover hit-testing is a caret lookup** (`caretRangeFromPoint` / `caretPositionFromPoint`) compared with
   the node-local UTF-16 offsets the pass registered. Reason: a custom highlight is not an element — no
   box hit-test, no back reference, no attribute to read a comment from. A caret at a fragment's `end`
   answers that fragment (a caret sits between characters); an interior claim is checked before a boundary
   claim. A browser with neither API answers "no caret" — the same degradation shape as `A38`. Documented in
   the spec's new Rules bullets.
3. **Tooltip lifetime**: `pointerdown` outside the host, `scroll`, `Esc` dismiss; `pointerdown` inside pins.
   This reuses the `A32` close-not-chase rule and the card's event pattern; the `selectionchange` wiring of
   `t3-01` is untouched, so hover cannot open a create card.
4. **`A68` coexistence in both directions**: `isHostBusy` (wired to `controller.isOpen`) blocks a tooltip
   while the create card owns the host, and hiding a tooltip does not hide the host while the card needs it.
5. **Spec edits beyond pure addition.** Flow 4 and AC3 of `content-overlay-ui.md` promised that a click turns
   the tooltip into an editable card with `Сохранить` / `Отмена` / `Удалить`. That is `t3-03` and is not
   shipped. Rather than delete the decision, Flow 4 and AC3 now state the shipped half and mark the editor
   half as `t3-03`, "not shipped". If the PM wants the promise kept intact somewhere, it belongs in the
   `t3-03` spec slice; flagging it instead of choosing.
6. **Two comment-only corrections inside the slice**: `paint-style.ts` cited ruling `A43` for the ownership
   rule (`A43` is the `Esc`-cancel ruling of `t3-03`); `paint-plan.ts` asserted the visible tooltip places
   against `tooltipBox`, which the shipped code does not do. Both now say what the code does.
7. **Extra commit** `ebb8caa` (test-fixture types) — see §1.

## 7. Residual risks and open questions for the PM

1. **No Chrome smoke was run.** The `::highlight()` rules and `document.adoptedStyleSheets` are verified only
   by parsing the generated sheet in the test DOM. Whether Chrome applies `::highlight()` rules from an
   adopted sheet, and whether the frame is visible, is a `chrome://extensions` load check (delivery step 6).
   If it turns out an adopted sheet does not apply them, `A41` variant 2 plus an AC2 amendment is the path
   the task file already names.
2. **Task AC1 wording conflicts with the same file's work order.** AC1 says the ranges go "inside the single
   highlight name"; the work order and ruling `A70` say "one named highlight per entry", and the shipped and
   pinned design is per entry (`inlinenotes-<entryId>`, shared style, per-entry teardown for `A40`). I kept
   `A70` and did not change the AC line. AC1 needs a one-word PM amendment or an explicit ruling.
3. **`PaintedEntry.tooltipBox` has no shipped consumer** (it is the pass snapshot pinned by
   `tests/content-paint-plan.spec.ts`). Keep it for `t3-03`'s editor placement, or drop it — PM call.
4. **Hover cost**: one `Range` + `getBoundingClientRect` per painted fragment per `pointermove` inside an
   entry. Bounded by the 20-entry cap and the re-render guard (a move inside one open entry re-renders
   nothing), but it is real work on a page with many painted entries; a throttle was not added because no
   ruling asks for one.
5. **No repaint on external change yet** (`t4-03`): a note added or hidden in another tab, or an SPA URL
   change, is not repainted, so its tooltip cannot appear until the next pass. Out of scope here, listed so
   the reviewer does not read it as a gap of this task.
6. **Shadow retargeting of the tooltip's own pointer events** is handled with `isInsideOverlayHost`, but a
   real browser may report the host as target for page content under a `position: fixed` zero-size host;
   worth one line in the smoke checklist.
7. Long comments (256 code points) are rendered with `white-space: pre-wrap` in a 280 px card and clamped by
   the same `A30` gutter rule; no visual check was possible headless.
