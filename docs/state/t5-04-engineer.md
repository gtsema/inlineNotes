# Engineer report — task `t5-04-focus-on-open`

Role: `extension-engineer`. Stage 6, task 1.
Ruling: **`A97`** (overturns `A74`), shape **`A105`**. Carried checklist answered by number under `A72`.
Tree at report time: `HEAD = 4a630c8`, working tree clean apart from one foreign untracked file (see OQ-6).

---

## 1. What ships

New rule owner: **`src/content/overlay/focus-handoff.ts`** (119 lines, framework-free DOM code, no entry, no storage, no `chrome.*`).

- `FIELD_FOCUS_OPTIONS: FocusOptions = { preventScroll: true }` — the one focus shape of the overlay.
- `createFocusHandoff(doc, overlay): FocusHandoff` with `open(wrapper)` / `restore()`:
  - `open` records what the page had focused, then focuses the note field
    (`wrapper.querySelector('.' + CARD_INPUT_CLASS)`) with `FIELD_FOCUS_OPTIONS`. A wrapper
    that rendered no field focuses nothing.
  - `restore` focuses the recorded element **only if it is still connected**; otherwise it
    returns without a call. It never records and never focuses `document.body` or
    `documentElement`, because the document's default answer is not a control the reader
    had focused.
  - The record goes one tree deeper when the document answers the overlay **host**
    (shadow retargeting): it takes `overlay.root.activeElement`, so a widget opened over
    another open widget hands the caret back to that other widget's field instead of to an
    unfocusable `div`.

Two call sites only, both in `src/content/overlay/`:

| file | place | line |
| --- | --- | --- |
| `src/content/overlay/create-card-controller.tsx` | `open()` — after `setOverlayHostHidden(overlay, false)` and `positionCard` | `:198` (`focus.open(wrapper)`) |
| `src/content/overlay/create-card-controller.tsx` | `close()` — after `render(null, wrapper)` and the hide | `:213` (`focus.restore()`) |
| `src/content/overlay/editor-controller.tsx` | `openFromPaintedEntry` — after `setOverlayHostHidden(overlay, false)` and `positionEditor` | `:274` (`focus.open(wrapper)`) |
| `src/content/overlay/editor-controller.tsx` | `close()` — after the unmount and the `isHostBusy` hide | `:358` (`focus.restore()`) |

Order is part of the rule and is commented at both sites: **reveal, then focus** (a field
inside a hidden host takes no focus — verified by a scratch probe before implementing:
jsdom refuses focus inside a `display: none` host), and **unmount, then restore** (or the
unmount takes the caret back again).

Comment text rewritten with the ruling (no rule change): `create-card-controller.tsx`
header, `editor-controller.tsx` header (the old "**No focus is taken** (ruling `A74`…)"
paragraph), `editor-events.ts` header (the old "`Esc` sits on the document **because of
ruling `A74`**" rationale, replaced by the still-true rationale: the page may hold focus
before the handover and after a restore that found its element gone).

Test helper: `tests/support/focus-calls.ts` — `recordFocusCalls()` spies over
`HTMLElement.prototype.focus`, calls through to the real method, and exposes
`calls() / callsOn(element) / restore()`. Needed because AC3 is a promise about an
argument, not an outcome; every case restores the spy explicitly (the repo runs no global
`restoreMocks`).

No `tabindex` was introduced anywhere (pinned again in both controller specs). No Russian
string was added; `src/content/text.ts` is untouched and the one-module Russian-string scan
(`tests/content-create-card-boundaries.spec.ts:336`) is green.

---

## 2. Commits (one per green step, `A73`)

| step | commit | contents | gates at that point |
| --- | --- | --- | --- |
| CP1 spec | `d3ca568` | `docs/specs/content-overlay-ui.md` only | build 0, test 0 (857), checker 0 |
| CP2 behavior + rewritten pins | `729695c` | `focus-handoff.ts` (new), two controllers, `editor-events.ts`, two specs rewritten in place | build 0, typecheck 0, test 0 (857), checker 0 |
| CP3 new pins AC3–AC6 | `b770066` | `tests/content-focus-handoff.spec.ts` (new, 8), `tests/support/focus-calls.ts` (new), +3 create-card pins, +4 editor pins | typecheck 0, test 0 (872), build 0, checker 0 |
| CP4 carried 1–6 | `0d0c749` | six comment-only fixes + five test-name fixes | typecheck 0, test 0 (872), build 0, checker 0 |
| CP4b comment wrap | `4a630c8` | one comment paragraph of `src/content/overlay/editor-events.ts:20-21` that CP2 left broken mid-sentence; no code, no rule | typecheck 0, test 0 (872), build 0, checker 0 |

Test count over the task: **857 → 872** (+15). No test was deleted: the only removed test
names in the whole range are two rewritten pins (AC7) and five renamed carried names
(carried 6), each with a replacement name; assertions of those five were not touched.

---

## 3. Acceptance criteria, one line each with its pin

1. **Create card makes its `textarea` active inside the host** —
   `tests/content-create-card-controller.spec.ts:923` (`opens with the caret in the note
   field (A97, A105, t5-04 AC1)`: `overlay.root.activeElement === inputOf(overlay)`,
   `document.activeElement === overlay.host`, not the page button). Production:
   `create-card-controller.tsx:198`.
2. **Editor opened by a `tooltip` click makes its `textarea` active, comment already in
   it** — `tests/content-editor-controller.spec.ts:729` (`opens with the caret in the
   prefilled note field (A97, A105, t5-04 AC2)`, reached through `openOwn` = the Flow 4
   click on the `PaintedEntry`): field is the shadow-root active element **and**
   `fieldOf(overlay).value === OWN_COMMENT`. Production: `editor-controller.tsx:274`.
3. **Both focus calls pass `preventScroll: true`, pinned at the call shape** —
   `tests/content-create-card-controller.spec.ts:1064` and
   `tests/content-editor-controller.spec.ts:830` (spy over the focus method;
   `callsOn(field)[0].options` deep-equals `{ preventScroll: true }`), plus
   `tests/content-focus-handoff.spec.ts:109` (the exported shape says exactly and only
   `preventScroll: true`) and `:117` (the module asks for the field with that argument).
   The restore call passes the same shape (`tests/content-focus-handoff.spec.ts:146`) — a
   focus of the overlay never scrolls, in either direction.
4. **Cancel, `Esc`, a successful save and a delete restore the previously focused element;
   when it is gone nothing is forced** —
   `tests/content-create-card-controller.spec.ts:1086` (loop over `Отмена`, `Esc`,
   `Сохранить`; after each: host hidden, `document.activeElement === control`),
   `tests/content-create-card-controller.spec.ts:1114` (page control removed mid-card →
   the recorder logs **no call at all** on the close, and the document answers neither the
   detached control nor the host nor `documentElement`),
   `tests/content-editor-controller.spec.ts:852` (loop over cancel, `Esc`, successful save,
   delete), `tests/content-editor-controller.spec.ts:882` (gone element → empty focus log),
   and at module level `tests/content-focus-handoff.spec.ts:194` and `:225` (gone element;
   document had only `body` → nothing recorded, nothing restored), `:168` (deep record),
   `:248` (one record per handover, a second restore calls nothing).
5. **`Esc` closes and writes nothing; `Ctrl/Cmd+Enter` saves — existing pins survive
   unchanged** — untouched and green:
   `tests/content-create-card-controller.spec.ts:987` (Escape → closed, host hidden, zero
   writes, empty page), `:1004` (Ctrl+Enter through the real create path), `:1021`
   (Cmd+Enter), `tests/content-editor-controller.spec.ts:674` (`Отмена` / `Esc` / outside
   `pointerdown` perform no `set` and no `remove`). Not one line of these four was edited.
6. **No `tabindex`; the rendered order is still the tab order** — the existing card pin
   `tests/content-create-card-controller.spec.ts:950` (`renders textarea, then Сохранить,
   then Отмена, as the rendered tab order`, with the three `tabindex` assertions) is
   unchanged, and the editor half is new:
   `tests/content-editor-controller.spec.ts:913` (`still renders no tabindex, and the four
   controls keep the rendered order (t5-04 AC6)`: field → `Сохранить` → `Отмена` →
   `Удалить`, zero `[tabindex]` in the shadow tree, host without `tabindex`, each control
   really takes focus).
7. **Every "no focus moves" pin rewritten, none deleted** — see section 4.
8. **Spec carries no leftover `A74` promise** — see section 5.
9. **No new Russian string; forbidden paths untouched** — `git diff --name-only
   d3ca568^..HEAD` over the four commits touches no `src/popup/`, no `src/options/`, no
   `src/manifest.json`, no `src/core/`, and exactly one file under `src/content/paint/**`:
   `paint-plan.ts`, and that change is the comment line of carried item 1 (verified: a
   filtered diff of the six carried source files yields **no non-comment changed line**).
   `src/content/main.ts` needed no call site and was not touched.

---

## 4. Rewritten pins (AC7), each by `path:line`

| previous pin (deleted name never survives) | rewritten pin |
| --- | --- |
| `tests/content-create-card-controller.spec.ts:907` — `it('opens with the page focus exactly where it was', …)`, docstring "Ruling `A74` (assumption…): opening the card takes no focus" | `tests/content-create-card-controller.spec.ts:923` — `it('opens with the caret in the note field (A97, A105, t5-04 AC1)', …)`: same fixture, same page button focused first, **opposite** expectation (`root.activeElement` is the card `textarea`, the document answers the host, not the button). The docstring names the old pin and says this is its rewritten form. The rest of the block (tab order, `Esc`, `Ctrl/Cmd+Enter`) was kept. |
| `tests/content-editor-controller.spec.ts:725` — `it('moves no focus when it opens (A74)', …)` | `tests/content-editor-controller.spec.ts:729` — `it('opens with the caret in the prefilled note field (A97, A105, t5-04 AC2)', …)`: same fixture and same focused page button, now asserting the field is active with the stored comment, the control-focus walk kept, and the restore asserted at the close. |

Nothing else in `tests/` asserted a no-focus promise: a grep for `activeElement` across
`tests/` before the change returned exactly those two blocks plus the tab-order walks
(`tests/content-create-card-controller.spec.ts:950`, `tests/content-editor-controller.spec.ts:913`),
which assert retargeting, not absence of focus. The two production comments that stated the
same promise (`create-card-controller.tsx:15-20`, `editor-controller.tsx:72-77`,
`editor-events.ts:20-25`) were rewritten with the new rule, not deleted.

---

## 5. Spec edit (same task, CP1 commit)

`docs/specs/content-overlay-ui.md`:

- **Terms row `focus on open`** (`:43`) — now states the `A97` rule overturning `A74`, the
  caret in the widget's `textarea`, `preventScroll: true`.
- **New Terms row `focus restore`** (`:44`) — the second half, marked **`Assumption:`**
  (the PM's decision), including "the close forces nothing, neither `body` nor
  `documentElement`".
- **Rules bullet `focus on open`** (`:130-132`) — the rule, the `preventScroll` rationale
  and why the option is pinned at the call shape, the `Assumption:` `focus restore`
  paragraph with its rationale and the deep-record detail, the explicit "`A97` did **not**
  change … no `tabindex`", the owner module, the two call sites and the three pinning test
  files.
- **AC17** (`:257`) — rewritten to the new observable behavior, citing `t5-04` AC1–AC6 and
  keeping the `t3-02b` AC1 keyboard half.

Note: the brief pointed at "AC17 at `:253`"; in the tree AC17 sat at `:254` (the `t5-03`
spec edit shifted it by one line). Same criterion, no ambiguity.

---

## 6. Carried-fix checklist (`A72`), answered by number

1. **done** — `src/content/paint/paint-plan.ts:105-107`. The pointer at
   `editor/painted-selection.ts` and "the Flow 6 selection claim" is gone; the sentence now
   says which modules read the fragment offsets (`overlay/tooltip-hit-test.ts`,
   `overlay/editor-controller.tsx`) and that the editor's `re-selection` answer comes from
   this fragment set, never from a page selection (ruling `A104`, task `t5-03` AC7).
   `grep -rn "painted-selection|claimSelection|entryOwningSelection" src tests` → **no
   hits**.
2. **done** — `src/content/overlay/contained-own-selection.ts:87`. Now cites
   `src/core/anchor-resolve.ts` (the file exists; `src/content/anchor/anchor-resolve.ts`
   never did).
3. **done** — `src/content/overlay/editor.tsx:5-8`. Header now points at
   "Flow / Sequence 4-5" (the shipped numbering: 4 = the `tooltip` click opens the editor,
   5 = save / cancel / delete) and at the shipped rule sentence "The `editor widget` is
   opened by a click on the `tooltip`, never by a page `selection`" (ruling `A96`); the
   deleted "opened by a selection, never by a foreign entry" sentence is gone.
4. **done** — `src/content/overlay/create-card.tsx:22`. Now `create-card-controller.tsx`.
5. **done** — three sites: `src/content/overlay/tooltip-style.ts:9`,
   `src/content/overlay/tooltip-style.ts:41`, `src/content/overlay/tooltip.tsx:31`. Each
   now cites task `t5-03` **AC1** for the single-opacity rule (confirmed against
   `docs/state/t5-03-engineer.md:36`, where AC1 is the opacity criterion and AC7 is the
   `claimSelection` removal).
6. **done** — five test names, assertions untouched:
   `tests/content-editor-controller.spec.ts:492` (`t5-03 AC1` → **AC2**),
   `:517` (AC2 → **AC3**), `:535` (AC3 → **AC7**), `:575` (AC8 → **AC3, AC9**), and
   `tests/content-tooltip.spec.ts:472` (`AC8` → **`t5-03` AC2**).

No carried item was skipped.

---

## 7. Commands run (each gate on its own line, `echo "exit=$?"` right after, no pipes)

Final run over the committed tree (`HEAD = 4a630c8`):

```
npm run build                                       exit=0   → dist/ is a self-contained MV3 folder (10 files)
npm test                                            exit=0   → Test Files 44 passed (44); Tests 872 passed (872)
npm run typecheck                                   exit=0   → tsconfig.content + tsconfig.app + tsconfig.spec
node scripts/check-agent-config.mjs               exit=0   → 0 error(s), 0 warning(s), 106 info(s)
```

Per-step runs of the same four gates are recorded in section 2. Single-file runs used
during implementation: `npx vitest run tests/content-focus-handoff.spec.ts` (8 passed),
`npx vitest run tests/content-editor-controller.spec.ts` (34 passed),
`npx vitest run tests/content-create-card-controller.spec.ts tests/content-editor-controller.spec.ts`
(70 passed).

The 106 checker INFOs are the standing pattern: every backticked `src/…` / `tests/…` token
in a spec is reported as "planned path not created yet" by
`scripts/check-agent-config.mjs:365` regardless of existence. My two new mentions
(`src/content/overlay/focus-handoff.ts`, `tests/content-focus-handoff.spec.ts`) add the
two INFOs that take the count from 104 to 106. Errors and warnings stayed 0.

---

## 8. Deviations, and what I did **not** touch

- **Added one test helper** (`tests/support/focus-calls.ts`) instead of inlining the same
  spy three times. Inside the allowed `tests/` path; no new dependency, `vi` only.
- **The restore focus call also passes `preventScroll: true`.** `A105` names the two open
  call sites; a restore that scrolled the page would break the same promise, so the module
  uses one shape for every overlay focus. Pinned at
  `tests/content-focus-handoff.spec.ts:146`. Flagged because it is one call beyond the two
  the ruling names.
- **Restore happens on *every* close**, not only the four AC4 paths: a page scroll or a
  `pointerdown` outside the host (card and editor) also hands the caret back. `close()` is
  the single close path of both controllers, and a scroll-close that left the caret in a
  removed field would be the same defect AC4 exists to prevent. Flagged as a superset of
  AC4, not a contradiction.
- **The recorded element is the one inside the shadow tree**, not the element the document
  answers. The ruling says "the element that had it"; for a focus inside the host the
  document answers the host (an unfocusable `div`), so recording the answer would make the
  restore a silent no-op whenever a widget opens over another widget. This is the faithful
  reading of the ruling, and it is written into the spec bullet so the reviewer can see it.
- `docs/project-profile.md`, the other specs, `docs/specs/INDEX.md`, `README`,
  `docs/retro.md` and the task state file were **not** edited (PM-owned).
- `src/content/main.ts` was not edited: both call sites are inside the controllers.
- `docs/state/t5-04-focus-on-open.md` untouched, as instructed.

---

## 9. Open questions for the PM

1. **`docs/project-profile.md` still says the extension "must not break host page layout
   or steal focus"** (Constraints). That line is the `A74` rationale and `A97` overturns
   half of it. It is outside my briefed paths, so I did not touch it; the profile needs a
   one-line PM edit, or the next reviewer will find a spec-vs-profile contradiction.
2. **Leftover stale `t5-03 AC8` citations in `tests/content-tooltip.spec.ts`** at `:460`
   (the `describe` heading "task t5-03 AC1, AC2, AC3, AC8") and `:512` (a body comment
   "`t5-03` AC8 says the click opens the editor of a *painted* entry"). Same stale family as
   carried item 6 but not on the checklist, and item 6 is limited to five test *names*, so I
   left both. Decide: add them to a carried item, or accept the inconsistency next to the
   name I renamed at `:472`.
3. **`tests/content-editor-controller.spec.ts:5`** (file header) lists "task `t5-03` AC1,
   AC2, AC3, AC7, AC8, …" as the file's coverage map. Not a test name either; left alone.
4. **Browser verification is not done.** The build is loadable and the gates are green, but
   the observable list for this rule needs a real `chrome://extensions` load of `dist/`:
   (a) select text → caret is already in the field, cursor blinking, page did **not**
   scroll; (b) click a `tooltip` → field already holds the comment; (c) after `Отмена` /
   `Esc` / `Сохранить` / `Удалить` the caret is back on the page control that had it
   (in particular: tab to a page link, open a card, cancel, `Tab` continues from that link);
   (d) with the page focused in a browser chrome control, the close leaves focus there
   instead of yanking it into the document. `preventScroll` in particular is only pinned at
   the call shape in jsdom.
5. **`docs/state/t5-06-popup-author-groups.md` is untracked in the worktree** — not mine,
   not staged, not committed. Someone else's in-flight artifact.

---

## 10. Residual risks

- A page that moves focus itself between the open and the close (a widget that re-renders
  the focused control) restores an element that is connected but no longer the intended
  target. Cheap to fix later by re-reading at close; not specified, so not implemented.
- `focus.restore()` runs after the host is hidden. In a real browser, focusing an element
  while the shadow host is hidden is harmless, but jsdom cannot prove that ordering; item
  (c) of the browser list in OQ-4 covers it.
- A page that traps `focus` with a `focusin` handler could fight the handover. No such page
  is in the verification list.
- The focus log pins (`recorder.calls()`) count **every** focus call of the page during the
  case; a future fixture that focuses something else mid-case will have to adjust the
  expected count, not the rule.
