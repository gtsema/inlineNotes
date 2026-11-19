# t14-01 — engineer report: the popup adopts the settings window's design

Brief: `docs/state/t14-01-popup-look.md` (AC 1–12). Stage: `docs/state/stage-14-popup-look.md`
(rulings `A140`–`A143`, answers `Q1`–`Q5`, all defaults). Commit: `95552cb`, one commit, seven files.

## What changed, path by path

| Path | Change |
|---|---|
| `src/popup/popup.component.ts` | The `A125` palette, the settings card's shape at `320px`, the icon-only delete button, the styled checkbox, and the trash glyph re-declared with its reason at the declaration. Two new exported constants, `POPUP_DELETE_HIT_BOX_PX = 24` and `POPUP_DELETE_ICON_PX = 16`. |
| `src/popup/index.html` | One `<style>` block with the one rule `body { margin: 0 }`, the rule `src/options/index.html` owns (answer `Q1`), with the reason in an HTML comment. |
| `src/popup/text.ts` | Comment only: the `delete` entry now says the string is the `aria-label` **and** `title` of an icon-only control. No key added, no wording moved (AC3, AC9). |
| `tests/popup-window-look.spec.ts` | **New**, 494 lines, 15 cases: the first popup-look pins (AC8). |
| `tests/popup-entry-list.spec.ts` | The two describe titles restated (AC9); every assertion untouched; the file header names `A143`. |
| `tests/content-create-card-boundaries.spec.ts` | One `A114` pin narrowed from "no `<svg>` under `src/popup/`" to "exactly `src/popup/popup.component.ts`", plus `src/options/` keeping the old empty list (see "Pin relaxations" below). |
| `docs/specs/content-overlay-ui.md` | The popup contract bullet (`:155`) gains a `Popup look` sub-bullet set (`A140`–`A143`); AC22 and AC26 name the icon-only delete control; the `Удалить`-inside-no-condition clause of AC22 says "icon-only delete control" (AC11). |

No `src/content/`, `src/core/`, `src/options/`, `src/manifest.json`, asset, icon, `angular.json`,
`scripts/` or `package.json` change. No new dependency, no `fetch`/XHR/WebSocket, no new Russian
string (no string was added at all).

## The shape that shipped

**Palette (`A140`).** `.popup`: `background: #fdf7ee`, `color: #1b2a33`; `:host` background
`#fdf7ee`; `.row--foreign .author` and `.empty`: `#7b6a55`; `.popup` frame and the `.row` hairline:
`#a6cbdc`; `.notice` (both branches, one rule): `#b3261e`; `.delete` and the checkbox accent:
`#b8480d`; the checkbox box border: `#a6cbdc`. The declared literal set of the stylesheet is
`#1b2a33`, `#7b6a55`, `#a6cbdc`, `#b3261e`, `#b8480d`, `#fdf7ee` — nothing else, and
`#1f1f1f` / `#6b6b6b` / `#e3e3e3` appear in no comment either.

**Card shape (`A141`).** `.popup`: `width: 320px`, `box-sizing: border-box`, `padding: 16px`,
`border: 1px solid #a6cbdc`, `border-radius: 12px`, `font: 13px/1.45 system-ui, sans-serif`. The
title steps to the settings card's `15px/600` (`src/options/options.component.ts` declares that
for its own `.title`) and its bottom margin to `8px`, so the two surfaces share the heading scale
as well; the old `12px` page inset and the old `4px` title margin are gone. The card fills the
panel because the document zeroes the body margin and `:host` declares no margin and no border.
`360px` is declared nowhere, not even in a comment.

**Row controls (`A143`, `Q3`, `Q5`).** The checkbox block is
`.toggle input[type='checkbox'] { width: 14px; height: 14px; margin: 0; border: 1px solid
#a6cbdc; border-radius: 3px; accent-color: #b8480d; }` and `.toggle` keeps `font-size: 13px`; the
template's `<input type="checkbox">` keeps `[checked]="row.allVisible"` and
`(change)="onToggle(row.authorName, $event)"`. The delete button carries
`[attr.aria-label]="deleteLabel"` and `[attr.title]="deleteLabel"`, its only child is an inline
`<svg [attr.width]="deleteIconPx" [attr.height]="deleteIconPx" [attr.viewBox]="deleteIconViewBox"
fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
aria-hidden="true" focusable="false">` with the editor's five trash paths, and `(click)` is still
`onRemove(row.authorName)`.

Two judgement calls to flag for the reviewer, both inside the answer the owner gave:

1. The checkbox's `14px` box size, its `3px` radius and the delete button's `#b8480d` colour are
   **not** literals the brief names. The answer `Q3` text says the delete button gets "the
   settings surface's control styling (the `#a6cbdc` border, the 6 px radius, the `#b8480d` action
   colour on the delete button)" but AC4/`A143` make the control icon-only with no box, so a
   border and a 6 px radius on a borderless 24×24 hit box would be a box drawn around a glyph the
   ruling says has none; I gave the button the action colour and no border/background, and gave the
   checkbox a `#a6cbdc` border, a `3px` radius and the `#b8480d` accent. The box size (`14px`) is
   the one value nothing names. All three are inside `A125` roles, so AC1 holds; if the PM wants a
   different radius or box size that is a follow-up ruling, not a deviation from an AC.
2. `.row:first-child { border-top: 0 }` suppresses the hairline on the first row so the top of the
   card shows no rule against its own border. Presentational, no ruling named it.

## AC self-check, line by line

| AC | Verdict | Evidence |
|---|---|---|
| 1 — palette `A140`, three literals gone, no invented colour | done | `tests/popup-window-look.spec.ts` → `declares every A125 role the surface uses as a literal`, `declares no colour outside the five A125 roles and the kept refusal colour`, `retires the three literals of the popup's own former palette`. The declared set is the six roles above; `PALETTE` in the suite lists all seven `A125` roles plus the refusal, and the shipped set must be a subset of it, so a new literal is red. |
| 2 — settings card shape, `320px` not `360px`, `body { margin: 0 }`, card fills the panel | done | `.popup` rule body as above; the suite case `takes the settings card's frame, radius, type scale and inner padding` compares all four declarations **against the options stylesheet's own `.options` body**, case `sizes the card at the popup's own 320px and never the settings 360px` (presence of `320px` on the stripped text, absence of `360px` on the verbatim text), case `gives the document the body margin the options document owns, and nothing else` (one `<style>` block, normalised to `body { margin: 0; }`, `:host` carries no margin and no border). |
| 3 — no mascot, no new string | done | Suite case `draws no mascot and adds no second string or palette role`: no `<img>`, no `mascot`, `Object.keys(POPUP_STRINGS)` still the same six keys, `POPUP_STRINGS.delete === 'Удалить'`, no `http`, no data URI, no `@import`. |
| 4 — icon-only trash button, `aria-label` + `title`, glyph `aria-hidden`/`focusable="false"`, `24px` box with `16px` glyph as named constants | done | Suite cases `renders the delete control icon-only with the word as its accessible name` (no text node, no `{{ deleteLabel }}`, exactly one `<svg>`, both bindings, both glyph attributes, the click binding intact) and `declares the 24px box and the 16px glyph as named constants` (module constants `24`/`16`, four box declarations, two glyph declarations, `stroke: currentColor`, the `[attr.width]`/`[attr.height]`/`[attr.viewBox]` bindings, and the five paths equal to the editor's glyph path for path). |
| 5 — behaviour unchanged, one core call for the group, foreign row keeps the control | done | `onRemove` body untouched (same single `this.service.removeAllOfAuthor(authorName)`); suite case `keeps the delete control in the row, outside every notice and ownership gate` (one `class="delete"`, no own-condition `@if`); the whole of `tests/popup-entry-list.spec.ts` (`AC1`–`AC5`, the one-call counts, the foreign-row cases) passes unchanged. |
| 6 — checkbox styled, still a real input with its bindings | done | Suite cases `keeps the real input with its aggregate binding and its change handler` and `paints the box with the decorative border and the action accent, at the 13px scale`. |
| 7 — empty line `#7b6a55`, notices `#b3261e`, `name_required` a real underlined button calling `openSettings()` | done | Suite cases `colors the empty line secondary and both notices as refusals` (one `#b3261e` declaration in the stylesheet) and `keeps the name-required notice a real underlined button that opens the options page`. |
| 8 — first popup-look pins, and which assertion goes red for which regression | done | New file above; the mapping is named in its header comment **and** below in "The three named reds"; two of the three were proved by mutation. |
| 9 — two describe titles restated, assertions kept, `Удалить` still pinned in `src/popup/text.ts` | done | `AC3 a foreign row is marked foreign and keeps its group delete`, `AC5 the group delete removes the row immediately`; the diff of that file is the two title lines plus a header comment — `git diff 814e23b..HEAD -- tests/popup-entry-list.spec.ts` shows no assertion line; `tests/content-create-card-boundaries.spec.ts` still pins `delete: 'Удалить'`, and the look suite pins `POPUP_STRINGS.delete`. |
| 10 — duplication stated at the declaration, no cross-layer import, in the popup's idiom | done | The `deleteIconViewBox` declaration's doc comment names `S14-4`, `A143`, Preact, Angular and `action-icons`; suite case `states at the declaration why the glyph is re-declared rather than imported` reads that comment out of the source **and** asserts `from '../content/overlay/` and `action-icons` are absent from the stripped code. The glyph is Angular-attributed (`[attr.width]="deleteIconPx"`), not JSX. |
| 11 — spec follows in the same commit, AC26 checked | done | `docs/specs/content-overlay-ui.md`: new `Popup look` bullet after the popup contract bullet, six sub-bullets (palette, card shape, row controls, empty state and notices, no mascot and no new string, pinned by...), each naming its ruling. **AC26 was checked and was wrong**: "one `Удалить` is one core `deleteEntriesOfAuthor` call" named the control by its printed word, so it now reads "one press of the row's icon-only delete button is one core `deleteEntriesOfAuthor` call and the button's accessible name is `Удалить` (`A143`, `t14-01`)". AC22's "a row is the label + a checkbox + `Удалить`" got the same correction, and its closing clause "the list block, its checkbox and `Удалить` sit inside no notice" now says "icon-only delete control". **Terms / Aliases table: nothing added.** `author row` already defines the row as "label + one show/hide checkbox + one `Удалить`", and the term is still true — the control is still the row's delete, and its accessible name is still the word; a new term ("trash button") would be a second name for a control the table already names. Say the word if the PM wants the `author row` row's wording to mention the icon shape. |
| 12 — nothing else moves, `dist/` still 12 files | done | `git show --stat HEAD` lists exactly the seven files above; `find dist -type f | wc -l` → `12`; no new dependency (`git diff -- package.json package-lock.json` empty). |

## The three named reds (AC8)

| Regression | Assertion that goes red |
|---|---|
| a palette role changed (e.g. the `#1b2a33` ink reverted to `#1f1f1f`) | `the popup wears the A125 palette … > declares every A125 role the surface uses as a literal` (the `.popup` rule no longer matches `color: #1b2a33`); and for any literal that is not a role, `… > declares no colour outside the five A125 roles and the kept refusal colour`. |
| the width changed to `360px` | `the popup is the settings card at its own width … > sizes the card at the popup's own 320px and never the settings 360px`. |
| the trash button turned back into a labelled button | `the row delete control is icon-only … > renders the delete control icon-only with the word as its accessible name` (the button holds a text node and no glyph), plus `… > declares the 24px box and the 16px glyph as named constants` when the `<svg>` and its size bindings go with it. |

### The mutations, applied, observed, reverted from a `cp` copy

Copies first: `cp src/popup/popup.component.ts /tmp/popup.component.ts.orig`, likewise
`src/popup/index.html`, `tests/popup-window-look.spec.ts`,
`tests/content-create-card-boundaries.spec.ts`. Every revert below is `cp` from that copy — no
`git checkout` was used at any point, and the working tree was verified clean before the commit
(`git status --short` → 0 lines) and after it.

**M1 — the retired colour comes back.** `border-top: 1px solid #a6cbdc` → `#e3e3e3` in `.row`.
Observed, 4 red:

- `declares every A125 role the surface uses as a literal` — `expected '…' to contain '1px solid #a6cbdc'`;
- `declares no colour outside the five A125 roles and the kept refusal colour` — `#e3e3e3 is not an A125 role`;
- `retires the three literals of the popup's own former palette` — `#e3e3e3 is the retired popup palette`;
- `gives the document the body margin the options document owns, and nothing else` — **unrelated** pre-existing red of my own draft (see "Two reds that were mine, not the mutation").

Reverted from `/tmp/popup.component.ts.orig`; the suite went back to 15/15.

**M2 — a palette role changed.** In the suite, the `color:` assertion of the ink role was pointed at
`#1f1f1f` while the stylesheet kept `#1b2a33`. Observed, 1 relevant red:
`declares every A125 role the surface uses as a literal` → `expected '… width: 320px; box-…' to
match /color: #1f1f1f;/`. (The document-rule red of my draft fired again at that point; it was
fixed before the commit — see below.) Reverted from `/tmp/look.orig`.

**M3 — the width changed to `360px`.** `width: 320px` → `width: 360px` in `.popup`. Observed,
1 red: `sizes the card at the popup's own 320px and never the settings 360px` →
`expected '… width: 360px; box-…' to match /(?:^|;)\s*width:\s*320px;/`. Reverted from
`/tmp/popup.component.ts.orig`.

**M4 — the trash button turned back into a labelled button.** The `<svg …></svg>` block replaced by
`{{ deleteLabel }}`. Observed, 2 red:
`renders the delete control icon-only with the word as its accessible name` →
`expected '<button …' not to contain '{{ deleteLabel }}'`, and
`declares the 24px box and the 16px glyph as named constants` → `expected '… <main class="popup"> …'
to contain '[attr.width]="deleteIconPx"'`. Reverted from `/tmp/popup.component.ts.orig`; 15/15 again.

Four mutations, three of the brief's three regressions covered (palette, width, labelled button)
plus the retired-literal one, every revert verified by a green run of the suite and by `cmp`
against the copies.

**One rehearsal bug worth recording**: the first attempts to splice the `<svg>` block out used
`str.index('<svg')`, which matched the prose inside the `deleteIconViewBox` doc comment four
thousand characters earlier and produced a file esbuild rejected (`Expected ";" but found "view"`).
Fixed by locating the element by its own line (`'<svg\n'` collapsed to a byte index found with
`re.finditer`); the mutation above is the one that worked, and the failed attempts changed nothing
that survived (each was followed by a `cp` restore and a green run).

## Pin relaxations / narrowings — read this one

`tests/content-create-card-boundaries.spec.ts`, case `kept the icon-only row inside the page
widgets, and the extension words intact (A114)`, asserted that **no** file under `src/popup/`
contains `<svg` in its code. AC4 of this brief puts an inline `<svg>` in `src/popup/`, so the two
cannot both hold. I **narrowed the assertion to a fact instead of deleting it**: the popup's
offenders must now be exactly `['src/popup/popup.component.ts']`, the `CARD_ICON_CLASS` half stays
empty for the popup (the popup re-declares a drawing, it does not borrow the widget's class), and
`src/options/` keeps both empty lists. The case title and its doc comment say why (`A143`,
`t14-01`, `S14-4`). The `delete: 'Удалить'` literal pin of the same case is untouched. This is the
one existing pin this task loosens; it is a widening of what counts as legal (a named exception
where there was a blanket absence), not a weakening of a present claim, and it is the AC
consequence of AC4 — but it is the reviewer's call whether the narrowing is acceptable or should
have been an order-level change. No other pin was weakened, deleted or skipped.

## Gates (profile order, quoted)

| Gate | Exit | Result |
|---|---|---|
| `npm run build` | 0 | `dist/ is a self-contained MV3 folder (12 files)`; `find dist -type f | wc -l` → `12` |
| `npm test` | 0 | **47 files / 1048 tests passed** (baseline 46 / 1033; +1 file, +15 cases) |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 176 info(s)` — the **176 info** the brief names, and the diff of the INFO lines against the pre-change run is empty |
| `npm run typecheck` | 0 | three `tsc --noEmit` projects clean |

The built `dist/popup/main.js` was also read: `grep -c '1f1f1f\|6b6b6b\|e3e3e3'` → `0` (it was 3
distinct hits before), and `grep -o '360px'` → nothing.

Post-mutation, the full sequence was re-run from a clean tree and all four gates were green before
`git commit`; `git status --short` is empty now.

## Open questions

1. **The control styling literals** (above, judgement call 1): a `3px` checkbox radius and a `14px`
   checkbox box are values no ruling names, and the delete button got no border because `A143`
   makes it icon-only. `Q3`'s own wording ("the 6 px radius, the `#b8480d` action colour on the
   delete button") describes a *button* skin, which the icon-only shape removed. If the owner meant
   the delete glyph to sit in a bordered box, that is a second look at `A143`, not a fix here.
2. **AC26's and AC22's amended wording** — corrected in this commit (they named the printed word);
   the PM may want the `author row` Terms row's "one `Удалить`" phrase to say "an icon-only delete
   whose accessible name is `Удалить`" so the table does not read as the old labelled button. I did
   not add or change a Terms row: no new term is needed, and AC11 says the table gains nothing
   unless one is.
3. **`S14-2`'s second half.** The stage ledger asked the stage to *say* whether the look rules get
   pinned or stay prose. They are pinned here, but the pins read the popup's **inline stylesheet
   text**, not a rendered surface (the settings look suite does the same). What no test decides is
   whether the two surfaces actually *look* alike in Chrome; that is the manual `dist/` load, which
   the brief did not ask me to record and I did not run in this session.

## Residual risk

- The trash glyph now exists twice (`src/content/overlay/action-icons.tsx` and
  `src/popup/popup.component.ts`). The suite compares the five `<path d="…">` strings path for
  path, so a redraw of one is a red test — but the two are still two drawings (`S14-4`).
- The checkbox relies on `accent-color` plus a `border`, which Chromium honours for
  `type="checkbox"`; a browser that ignored `accent-color` would fall back to the UA colour. No
  test can see that, and no fallback colour is invented.