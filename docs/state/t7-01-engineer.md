# Engineer report — `t7-01-card-compact-actions`, attempt 1

Role: extension-engineer. Ruling: `A114`. Spec: `docs/specs/content-overlay-ui.md` (Terms `action row` +
`icon-only button`, Rules "Compact `action row`", AC27).

## Commits (three, one per checkpoint, each made at green)

| CP | commit | content |
| --- | --- | --- |
| CP1 | `922b068` | spec + README only: Terms rows, Rules bullet, AC27, every sentence that named `Отмена` as a control rewritten to a surviving close path |
| CP2 | `f20ec92` | code + tests: icon-only row, cancel removal, rewritten pins, new `tests/content-card-actions.spec.ts`, source scans in the boundaries file, spec/README gate numbers |
| CP3 | `f1a5fc0` | carried `A72` items 1–2 + dead-pointer sweep over shipped prose |

Range under review: `0321303..f1a5fc0`.

## Files changed

Shipped code:

- `src/content/text.ts` — `cancel: 'Отмена'` deleted; `save` / `delete` documented as accessible names, not
  visible text.
- `src/content/overlay/action-icons.tsx` (**new**) — `SaveActionIcon` (check mark), `DeleteActionIcon`
  (trash can): inline `<svg>`, `class="icon"`, `width`/`height` from `ACTION_ICON_PX`, `viewBox`, `fill="none"`,
  `stroke="currentColor"`, `stroke-width`, line caps, `aria-hidden="true"`, `focusable="false"`. No image file,
  no font glyph, no emoji, no dependency.
- `src/content/overlay/card-style.ts` — `CARD_ICON_CLASS`, `ACTION_HIT_BOX_PX = 24`, `ACTION_ICON_PX = 16`;
  `.actions` gap `8px → 4px`; `.actions button` `padding: 0`, `width/height/min-width/min-height: 24px`,
  `inline-flex` centering; new `.actions .icon` rule (size, `fill: none`, `stroke: currentColor`). Untouched
  rules verified: card `width: 300px`, `font-size: 13px`, counter colors `#5b6470`/`#8a4b08`, refusal
  `#a4262c`, frame colors.
- `src/content/overlay/create-card.tsx` — cancel button deleted; the one save button is icon-only with
  `aria-label` + `title` = `Сохранить`.
- `src/content/overlay/editor.tsx` — cancel button deleted; save and delete are icon-only with `aria-label` +
  `title` = `Сохранить` / `Удалить`; both still gated by `canEdit`, delete unrendered for a foreign entry.
- `src/content/overlay/card-events.ts`, `editor-controller.tsx`, `editor-events.ts`,
  `create-card-controller.tsx` — comments only (carried item 1, stale pointers, tab-index wording).

Tests:

- `tests/content-card-actions.spec.ts` (**new**, 16 tests) — AC1/AC3/AC4/AC5/AC6/AC7/AC8 of the task.
- `tests/content-create-card-boundaries.spec.ts` (+3 tests) — the textual scans: no `Отмена` in any shipped
  content module, no tab-index setter and no `Tab` interception in code, no `<svg`/glyph class under
  `src/popup` or `src/options` plus the two words that must survive there; `CONTENT_STRINGS` has no `cancel`
  key and no value `Отмена`.
- `tests/content-create-card-widget.spec.ts`, `tests/content-create-card-controller.spec.ts`,
  `tests/content-editor-controller.spec.ts`, `tests/content-save-throw-safety.spec.ts` — every pin that pressed
  `Отмена` or read a button by `textContent` was **rewritten**, never deleted (see AC2 below).

Docs: `docs/specs/content-overlay-ui.md`, `README.md`.

## Gates (each run with `echo "exit=$?"` on the next line, never behind a pipe)

| command | exit | output |
| --- | --- | --- |
| `npm test -- --reporter=basic` | 0 | `Test Files 45 passed (45)`, `Tests 954 passed (954)` |
| `npm run build` | 0 | `dist/ is a self-contained MV3 folder (10 files)` |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 132 info(s)` |
| `npm run typecheck` | 0 | content + app + spec projects clean |

Baseline before the change was 44 files / 935 tests / 115 infos; README now states 45 / 954 / 132.

Extra verification greps:

- `grep -rn "Отмена" src/` → exit 1, no output (the word is gone from the shipped layer).
- `grep -rn "tabindex" src/` → exit 1, no output (AC7's grep claim holds literally; the two prose sentences
  that quoted the attribute name were reworded in CP3).
- `grep -c "M5 12.5" dist/content.js` → 1, `grep -c "currentColor" dist/content.js` → 3,
  `grep -c "Отмена" dist/content.js` → 0: the glyphs ship in the built bundle.
- `git diff --stat 0321303..HEAD -- src/popup src/options src/core src/manifest.json package.json` → empty.

## Acceptance criteria self-check

1. **No cancel node, no `Отмена` in rendered output** — satisfied. New test asserts 1 action button in the
   card, 2 in the editor, and `Отмена` absent from `textContent`/`innerHTML` of both; the boundaries scan
   proves the string appears in no shipped content module.
2. **Close by outside `pointerdown` and by `Esc` still writes nothing; old pins rewritten** — satisfied. In
   `content-editor-controller.spec.ts` the AC3 loop is now `['outside','esc','save','delete']`, the caret
   handover loop the same; in `content-create-card-controller.spec.ts` both close loops are
   `['outside','esc','save']` with `attachCreateCardEvents` attached per case and detached in it;
   `content-save-throw-safety.spec.ts` presses the outside pointer through the real wiring. Every asserted
   outcome (host hidden, no `set`/`remove` on the port, draft intact, caret back on the page control) is the
   one the deleted pin asserted. No pin was deleted; test count only grew.
3. **Save: no text node, inline `<svg>`, `aria-label` = `title` = `Сохранить`** — satisfied for both widgets
   (`textContent === ''`, exactly one child element which is the `svg`).
4. **Delete: same shape with `Удалить`, absent for a foreign entry** — satisfied; `canEdit: false` renders no
   `.is-delete`, no `.is-primary`, no `.icon`, no `svg` node at all.
5. **24×24 hit box pinned from the shipped CSS text** — satisfied: the test reads the `.actions button` rule
   body out of `CARD_CSS` and asserts `width/height/min-width/min-height: 24px`, `padding: 0`, and the row's
   `gap` < 8px; the glyph rule and the SVG attributes are asserted too.
6. **Save disabled while trimmed comment empty or over 256; `Ctrl/Cmd+Enter` saves; `Esc` writes nothing** —
   satisfied in the new file, and the pre-existing pins in the controller/widget specs still pass.
7. **Tab order `textarea → save` (card), `textarea → save → delete` (editor); no `tabindex`** — satisfied:
   the order pins in both controller specs now expect 2 and 3 focusables, the new file asserts the same for
   the mounted widgets, no rendered control carries the attribute, and the source scan finds no setter and
   no `Tab` interception.
8. **Popup and options untouched** — satisfied: empty diff in range; the new scan also proves they contain no
   `<svg` and no glyph class, and still carry `delete: 'Удалить'` / `save: 'Сохранить'`.
9. **Non-action visual rules keep their pins** — satisfied: `width: 300px`, `max-width: 92vw`,
   `font-size: 13px`, both counter colors, the refusal rule and its color are asserted as stylesheet text, and
   the counter/refusal behavior is asserted on a refused create (`7/256` + the overlap sentence).
10. **Spec and README describe the shipped controls, no visual over-claim** — satisfied. The spec says
    "check mark"/"trash can" as the shape ruling names and explicitly states that no test decides how a glyph
    looks; README is Russian and makes the same limited statement.

Carried-fix checklist (`A72`): item 1 done (`card-events.ts` comment now states the real guarantee —
no `preventDefault()`, order-independent); item 2 done (the two event-driven closes of a typed card now assert
`{ preventScroll: true }` on the recorded call, not only the count).

## Deviations, and one item deliberately left alone

- **`docs/specs/inline-comment-model.md:139` (model AC7) still says "the editor offers Save/Cancel/Delete".**
  That file is on the brief's forbidden list, so I did not touch it. It now contradicts `A114` and
  `content-overlay-ui.md` AC27. **PM decision needed**: either a one-line spec edit by the PM or an explicit
  order to re-open that file.
- **`docs/state/browser-verification-run.md` is a live manual checklist and still tells a human to look for
  `Отмена`** at lines 37, 82, 157, 219, 229, 265, 266 (live tab order `textarea → Сохранить → Отмена`, and
  "press `Отмена`" as a close path). Next Chrome run will report these as false failures. `docs/state/` is
  PM-owned, so I left it; the same drift class `A112` fixed for Run 3.
- **Where the textual scans live.** The brief expected the pins in `tests/content-card-actions.spec.ts`; the
  DOM part is there, but the source-walk part had to move to
  `tests/content-create-card-boundaries.spec.ts`: that file runs in the node environment, where a `file:` URL
  for the walk exists, while `content-card-actions.spec.ts` needs jsdom (`import.meta.url` there is not a
  `file:` URL, and the walk throws). Both files are named in AC27.
- **Button identification changed.** Because a button of this row holds no text node, the rewritten pins find
  it by `aria-label`; a pin that found it by `textContent` would now match nothing.

## Residual risks / not covered by jsdom

- The 24×24 box is pinned as **declared stylesheet text**, not as a measured layout box: jsdom does no layout.
  A real-browser check is a 30-second item (`getBoundingClientRect()` on the save button ≥ 24×24).
- Glyph recognizability in Chrome (is the trash can read as delete?) is not testable here and is not claimed
  anywhere.
- `title` tooltips on the icon buttons are browser-rendered; no test asserts they appear.
- The `A112` typing door and the `Tab`-does-not-reach-the-card finding are unchanged by this task, but the row
  now has one fewer stop, so the Run 3 checklist item about tab order needs the PM update listed above.
