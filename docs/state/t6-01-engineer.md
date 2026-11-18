# Engineer report — `t6-01-focus-editor-only`, attempt 1

Branch `main`, two commits on top of `33a0686`. Worktree clean; nothing staged.

| commit | content |
| --- | --- |
| `d7f1a6a` | `docs(specs) t6-01 CP1 (A111)` — spec (3 places) + README |
| `67dd155` | `feat(content) t6-01 CP2+CP3 (A111)` — card controller + rewritten pins |

## Changed files (6, all inside the brief's allowed paths)

- `docs/specs/content-overlay-ui.md` — Terms row `focus on open` (:44), Terms row `focus restore` (:45), Rules bullet `focus on open` (:131-134), AC17 (:261-266).
- `README.md` — new behavior bullet (:12-15), the keyboard sentence of the browser-run paragraph (:129-131), the new "not yet browser-run" bullet (:134-136), test count 906 → 907 (:43, :118).
- `src/content/overlay/create-card-controller.tsx` — no `focus.open` / `focus.restore` / `createFocusHandoff` anywhere; header paragraph rewritten (:16-25); the two call sites replaced by the reason they are gone (:196-199, :210-212).
- `src/content/overlay/focus-handoff.ts` — **comment-only diff** (verified mechanically: the diff of that file contains no non-comment line); the module and both of its decisions stay.
- `tests/content-create-card-controller.spec.ts` — five `t5-04` card pins rewritten in place, one added.
- `tests/content-focus-handoff.spec.ts` — **comment-only diff** (header now names the editor as the served widget and the card spec as the owner of the negative half).

Untouched, as ordered: `src/content/overlay/editor-controller.tsx`, `src/content/overlay/card-events.ts`, `tests/content-editor-controller.spec.ts`, `tests/support/focus-calls.ts`, `src/core/**`, `src/content/paint/**`, `src/content/editor/**`, `src/popup/**`, `src/options/**`, `src/manifest.json`, `package.json`.

## Gate commands, run exactly as required

Every command was written to a file, with `echo "exit=$?"` on the line right after the command (never after a pipe), and only tails/`grep` used to read the log.

| command | exit | output |
| --- | --- | --- |
| `npm run build` | `0` | `dist/` self-contained MV3 folder, **10 files**; `dist\content.js 121.3kb` (124207 bytes, 102 bytes smaller than before the change) |
| `npm test -- --reporter=basic` | `0` | **44 test files passed, 907 tests passed** (baseline before the change: 44 / 906) |
| `node scripts/check-agent-config.mjs` | `0` | `0 error(s), 0 warning(s), 113 info(s)` |
| `npm run typecheck` | `0` | `tsc -p tsconfig.content.json && tsconfig.app.json && tsconfig.spec.json`, no diagnostics |

Baseline was measured green **before** any edit (`906/44`, exit 0 on all four), so the +1 test is this task's added pin.

## AC1 — the zero-focus-call proof, as recorder output

Not a claim. A scratch probe spec (`tests/tmp-t601-proof.spec.ts`, deleted after the run, never committed) ran `recordFocusCalls()` from `tests/support/focus-calls.ts` over `HTMLElement.prototype.focus`, started **before** `capture()` and left on through the close. Verbatim stdout:

```
PROOF open-path focus calls = 0 | document.activeElement = BUTTON | shadow root.activeElement = null
PROOF isOpen = true | root html length = 2252
PROOF after a manual Tab, focus calls = 1
PROOF after the Esc close, focus calls = 1 | elements = ["TEXTAREA"]
```

How to read it: the card was **verifiably open** (`isOpen = true`, 2252 bytes of shadow markup), the open path produced **zero** recorded focus calls, the page's own `<button>` was still `document.activeElement`, the shadow root answered no active element of its own, and the note field is `Tab`-away. The manual `field.focus()` (the reader's `Tab`) was recorded as **1** in the same case — the control that proves the recorder is not blind on this shadow tree. After `Esc` the count is still `1` and that one call is the manual `TEXTAREA` one, so the close restored nothing.

One method note worth keeping: the first probe run printed `isOpen = false` and its "0 calls" was **rejected** as proof — a card that never opened records nothing for the wrong reason (bare jsdom gives zero-area fragments, so ruling `A64` closed the card). The number is only meaningful with `isOpen = true` in the same run, which is why every committed pin asserts the card is open before asserting the count.

Committed pins carrying the same proof: `tests/content-create-card-controller.spec.ts:925` (`expect(recorder.calls()).toEqual([])` with `isOpen()` and `cardOf()` asserted first), `:1082`, `:1104`, `:1141`, `:1185`, `:1213`.

## AC self-check

- **AC1 — satisfied.** `src/content/overlay/create-card-controller.tsx`: `open()` ends at `positionCard(anchorBox)` (:196) with no focus call, `close()` ends at `setOverlayHostHidden(overlay, true)` (:210) with no restore, and the `createFocusHandoff` import plus its local are gone. Pinned at `tests/content-create-card-controller.spec.ts:925` (page element stays `document.activeElement`, shadow root answers `null`, recorder count `[]`) and `:1082`.
- **AC2 — satisfied, nothing touched.** `src/content/overlay/editor-controller.tsx:200` builds the handoff, `:274` `focus.open(wrapper)` (after the reveal), `:358` `focus.restore()` (after the unmount); `FIELD_FOCUS_OPTIONS` stays `src/content/overlay/focus-handoff.ts:50` = `{ preventScroll: true }`. Pins that did not move and pass unchanged: `tests/content-editor-controller.spec.ts:730` (caret in the prefilled field), `:831` (call shape `preventScroll: true`), `:853` (restore on cancel/Esc/save/delete), `tests/content-focus-handoff.spec.ts:111` (`toBe(FIELD_FOCUS_OPTIONS)`), `:119` (one call, that shape).
- **AC3 — satisfied, five rewritten, zero deleted.** See the table below.
- **AC4 — satisfied, all still pinned and unchanged:** tab order `tests/content-create-card-controller.spec.ts:961`; Esc writes nothing `:998`; `Ctrl+Enter` saves `:1015`; `Cmd+Enter` saves `:1032`. No `tabindex` was added anywhere — `:1082` and `:1104` also re-assert `host.getAttribute('tabindex')` is `null`.
- **AC5 — satisfied.** Spec: Terms row `focus on open` `docs/specs/content-overlay-ui.md:44` (editor takes the caret; the selection card "makes **no focus call at all**", `A111` restoring the `A74` half, `Tab` in rendered order is the only way in, `A97` still stands for the editor); Rules bullet `:131-133` (`A111` did not change the tab order, the `A97` rationale, or the `preventScroll` decision); AC17 `:261-266`.
- **AC6 — satisfied.** README `:12-15` states the split as behavior; `:129-131` says `Tab` is now the only keyboard path into the card because the card does not move the caret; `:134-136` records that the `A111` half has not been browser-run and that "the selection survives" is browser-only.
- **AC7 — stated out loud, and nothing pins it in jsdom.** The selection-survival half is **not** pinned by any test and cannot be: jsdom does not drop a selection when focus enters an editable element, so a jsdom pin would prove nothing about Chrome. The spec says so in AC17 (`What no test pins: that the reader's selection survives the card opening — jsdom does not drop a selection when focus enters an editable element, so this half is a browser-verification item, not a green pin`), and README `:134-136` repeats it. The mechanism **is** pinned: zero focus calls.
- **AC8 — satisfied.** `git diff --stat HEAD~2 HEAD` lists exactly the six files above. `src/core/`, `src/content/paint/**`, `src/content/editor/**`, `src/popup/**`, `src/options/**`, `src/manifest.json`, `package.json` untouched. No new dependency, no `fetch` / `XMLHttpRequest` / `WebSocket`, no `host_permissions` change, no host-page DOM mutation.

## AC3 — the rewritten `t5-04` pins, by `path:line`

All in `tests/content-create-card-controller.spec.ts`; each is an in-place rewrite of the old pin (same fixture, same helper, opposite expectation), not a deletion. The whole block was renamed: `:1047` `the card takes no focus and hands nothing back (A111, t6-01 AC1; the rewritten t5-04 AC3, AC4 pins)`.

| old pin (what it used to claim) | new pin at `path:line` |
| --- | --- |
| `opens with the caret in the note field (A97, A105, t5-04 AC1)` — was `:924` | `opens with the page focus exactly where it was, and no focus call at all (A111, t6-01 AC1)` — `tests/content-create-card-controller.spec.ts:925` |
| `asks the note field for the caret with \`preventScroll: true\` (A105, t5-04 AC3)` — was `:1065` | `makes no focus call when it opens, so \`preventScroll\` has no call to ride on (A111, t6-01 AC1; the rewritten t5-04 AC3 pin)` — `:1082` |
| `hands the caret back on \`Отмена\`, on Esc and on a successful save (A105, t5-04 AC4)` — was `:1087` | `keeps the page control focused through \`Отмена\`, Esc and a successful save (A111, t6-01 AC1; the rewritten t5-04 AC4 pin)` — `:1104` |
| `hands the caret back when a page event closes the card (t5-04 AC4, A32, t5-05 carried 4)` — was `:1118` | `takes no focus and hands nothing back when a page event closes the card (A111, t6-01 AC1; the rewritten t5-04 AC4 and t5-05 carried 4 pins)` — `:1141` |
| `forces nothing when the page control the card took the caret from is gone` — was `:1157` | `makes no focus call at all when the page control is removed while the card stands (A111, t6-01 AC1)` — `:1185` |
| *(added, no predecessor)* | `hands nothing back when the caret stood inside the card at the close (A111, t6-01 AC1)` — `:1213`; the reader had `Tab`ed into the field, so this is the pin that proves `focus.restore()` left `close()` and not only `open()` |

Supporting helper rewritten with them: `openCard(fixture, control)` at `:1074` now asserts the card is open **and** that its field holds no caret and the page control still answers the document — so every case in the block states the A111 half before it states anything else.

## Residual risks / open questions for the PM

1. **`docs/project-profile.md:101` is now stale.** It still says the card and the editor "move the caret into the note field with `preventScroll: true` … (t5-04 AC1, AC2, AC3, AC4)". The brief declared the editable scope to be the spec (3 places) + README, and the profile is the PM's single-source file, so I did **not** edit it. One PM sentence in `docs/project-profile.md` needs the same split.
2. **`docs/state/t5-04-*.md` and `docs/state/browser-verification-run.md`** still describe the card caret as implemented and browser-verified. PM-owned state files; left alone.
3. **Browser item for Stage 7 acceptance (not jsdom-able):** "the selection survives opening the card" (AC7) plus the `Tab` reachability of the card controls (`t5-03` carried 1, still blocked by the Chrome file-picker element). AC17 and README already carry both as browser-only.
4. **README `Стадии 1–6 кода готовы` (:116) left as-is** — status prose, PM-owned; a Stage 7 sentence may belong there.
5. `dist/` was rebuilt by the gate run (gitignored). `dist/content.js` shrank by 102 bytes and still contains `createFocusHandoff` twice — the definition plus the single remaining editor call site.
6. The two focus pins in `tests/content-focus-handoff.spec.ts` that drive the handover generically (open/restore over a fake widget) were kept: the module still owns the rule for the editor, so its own contract stays pinned; only its header comment changed.
