## Review — `t6-01-focus-editor-only` (Stage 7, task 1)

Range reviewed: `33a0686..67dd155` — exactly two commits: `d7f1a6a` (spec + README), `67dd155` (card controller + pins). `88e85aa` (HEAD) is PM-only and adds `docs/state/t6-01-engineer.md` only — excluded. Worktree clean at review time.

### Verdict

**`accepted`** — 8/8 acceptance criteria `pass`, **0 blocking findings**.

### AC check (one line per criterion)

1. **pass** — the card path records zero focus calls as a *count*, with the card verifiably open: `tests/content-create-card-controller.spec.ts:925` starts `recordFocusCalls()` (`tests/support/focus-calls.ts:37`, a spy over `HTMLElement.prototype.focus` that calls through) **before** `capture()`, then asserts `isOpen() === true` and `cardOf() !== null` before `recorder.calls()).toEqual([])` (:950), and asserts the unchanged active element (`document.activeElement).toBe(pageButton)` :947, shadow root `null` :948); `:1082` wraps the whole open in the recorder via `openCard` (`:1074`, which asserts `isOpen()` inside the recorded window) and asserts both `recorder.calls()` and `recorder.callsOn(inputOf(...))` empty (:1093-1094). `grep -c "focus\." src/content/overlay/create-card-controller.tsx` → **0**; the whole of `src/` contains exactly two `.focus(` calls, both in `src/content/overlay/focus-handoff.ts:84` and `:95`, whose only shipped caller is `src/content/overlay/editor-controller.tsx:200,274,358`.
2. **pass** — empty diff in range for `src/content/overlay/editor-controller.tsx`, `src/content/overlay/card-events.ts`, `tests/content-editor-controller.spec.ts`, `tests/support/focus-calls.ts` (0 changed files each); the editor still opens its field (`editor-controller.tsx:274` after the reveal) and restores (`:358` after the unmount), both through `FIELD_FOCUS_OPTIONS = { preventScroll: true }` (`focus-handoff.ts:50`, applied at `:84` and `:95`); the editor pins stand untouched at `tests/content-editor-controller.spec.ts:730`, `:831`, `:853`, `:883`, `:959`.
3. **pass** — all five `t5-04` card pins exist under new names at the briefed lines: `:925`, `:1082`, `:1104`, `:1141`, `:1185`; the diff rewrites each in place (same fixture, same `pageControl` helper, inverted expectation) and renames the block at `:1047`; **nothing deleted**. The new pin `:1213` is additive and non-vacuous as a *behavior* pin (caret inside the card at close → `recorder.calls()).toEqual([])`, `document.activeElement` neither the page control nor the field) — see non-blocking finding 1 for the one thing it does **not** prove.
4. **pass** — `tests/content-create-card-controller.spec.ts:961` (tab order `textarea` → `Сохранить` → `Отмена`, `[tabindex]` query empty, host `tabindex` null), `:998` (`Esc` closes, `writesOtherThanSettings` empty, `loadEntries` 0), `:1015` (Ctrl+Enter saves), `:1032` (Cmd+Enter saves) are untouched by the range; `grep -rn "tabindex" src/` returns only the comment `src/content/overlay/editor.tsx:24`, `tabIndex` → no hits.
5. **pass** — the split is stated and `A111` named in all three owning places: Terms `focus on open` `docs/specs/content-overlay-ui.md:44`, Terms `focus restore` `:45`, Rules bullet `:131-133`, AC17 `:261`. Grepping the spec for `focus|preventScroll|caret` returns **no** sentence claiming the card takes focus; the only card sentence now says "makes **no focus call at all**" (`:44`, `:131`, `:261`). No rule duplicated into `inline-comment-model.md` (0 focus hits there).
6. **pass** — README states the split at `README.md:12-16`, corrects the Run 1 keyboard sentence at `:129-131` ("`Tab` — единственный клавиатурный путь … карточка каретку в поле не ставит"), and adds the not-yet-browser-run bullet `:134-136`. Counts verified against the tree: `907` tests (`:43`, `:118`), `44` files (`:43`, `:119`), `10` dist files (`:42`, `:118`), `113` info lines (`:119`) — corroborated read-only below.
7. **pass** — nothing pins selection survival (`grep -rn "survives" tests/` → only unrelated pins); the limit is stated in the spec (`:133` "What **no** test can show…", AC17 `:261` "pinned by **no** test — jsdom does not drop a selection") and in the report (AC7 paragraph, which also records that a first probe printing `isOpen = false` was **rejected** as proof).
8. **pass** — no Russian string added under `src/` (Cyrillic added lines appear only in test names/comments at `tests/content-create-card-controller.spec.ts:1104`, `:1141`); forbidden paths show 0 changed files (table below); no `fetch`/`XMLHttpRequest`/`WebSocket`/beacon, no new dependency (`create-card-controller.tsx` imports only preact + in-repo modules), no host-DOM mutation, no manifest/permission change.

### Carried-fix checklist

- Brief states `Carried-fix checklist: none.` — nothing to answer; the review confirms no numbered deliverable was silently dropped.

### Blocking findings

None.

### Non-blocking findings (numbered, with `path:line`)

1. `tests/content-create-card-controller.spec.ts:1215` — the comment "This is the pin that proves the old `focus.restore()` left `close()` and not only `open()`" overstates what that pin can show: with `open()` no longer calling `focus.open()`, the handoff's `held` stays `null` (`src/content/overlay/focus-handoff.ts:71-79`) and `restore()` no-ops (`:88-95`), so a leftover `focus.restore()` in `close()` would be **inert** and every card pin would still see zero calls. The proof that the restore call left `close()` is static, not behavioral: the import and local are deleted (diff `-import { createFocusHandoff }…`, `-const focus = createFocusHandoff…`, `-focus.open(wrapper)`, `-focus.restore()`), `grep -c "focus\."` on the file is 0, and `npm run typecheck` exits 0. Reword at the next touch; no re-brief needed.
2. `docs/project-profile.md:101-103` still says the extension "does move the caret into its own note field when the reader opens a card **or** an editor" — the only surviving sentence in the repo that contradicts `docs/specs/content-overlay-ui.md:44`. Outside the brief's allowed paths (PM-owned single-source file), and the engineer reported it as residual risk 1; it needs one PM sentence with the same split, or the profile becomes the next `A92`.
3. `docs/state/browser-verification-run.md:191` (Run 2 item 1: "caret in the field on select … passed") and `:32-33` (Run 1: "`Tab` moves focus down through the page's own focusables, not into the card") are now both records of superseded behavior; `docs/state/t5-04-focus-on-open.md` likewise. PM-owned, correctly left alone, but Run 3 must supersede them rather than leave them as the current claim.
4. Report line references are loose: AC17 is one physical line, `docs/specs/content-overlay-ui.md:261` (not `:261-266` — `:262` is AC18); the Rules bullet is `:131-133` (`:134` is `Counter rules`); the README behavior bullet is `README.md:12-16` (not `:12-15`). Cosmetic.
5. `README.md:116` `Стадии 1–6 кода готовы` — Stage 7 code now exists; PM-owned status prose (engineer's residual risk 4).
6. Spec-completeness gap, not a defect in this diff: neither `docs/specs/content-overlay-ui.md:131`/`:261` nor `README.md:12-16` states that the reader's own `Tab` into the card is itself a focus move into an editable element and can drop the page selection exactly as `A97` did. The save is safe — `submit()` uses the `Range` captured at open (`src/content/overlay/create-card-controller.tsx:161-167`, `session.range` set at `:190-195`) — so the loss would be visual. Recorded as Run 3 item 9.

### Boundary and harness evidence (reviewer-run, read-only)

- Empty diff in `33a0686..67dd155` for: `src/core`, `src/content/paint`, `src/content/editor`, `src/popup`, `src/options`, `src/manifest.json`, `package.json`, `package-lock.json`, `.pi`, `scripts`, `docs/specs/inline-comment-model.md`, `docs/specs/code-review-flow.md`, `src/content/overlay/editor-controller.tsx`, `src/content/overlay/card-events.ts`, `tests/content-editor-controller.spec.ts`, `tests/support/focus-calls.ts` — `changed files: 0` for each.
- Comment-only claim verified mechanically, not taken on trust: filtering each diff for lines that are not `+`/`-` file headers, not `*`/`/*`/`//` comment bodies and not blank leaves **0 remaining lines** for both `src/content/overlay/focus-handoff.ts` and `tests/content-focus-handoff.spec.ts`.
- Harness untouched in range, and the checker was re-run per the brief: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 113 info(s)`, `exit=0`.
- Spec commit and behavior commit are two commits inside the reviewed range, and the brief names `docs/specs/content-overlay-ui.md` — the `A69`/`A53` exception, recorded as a remark, not a finding.

### Gates (quoted from `docs/state/t6-01-engineer.md`, not re-run by the reviewer except the checker)

| command | exit | quoted output |
|---|---|---|
| `npm run build` | `0` | `dist/` self-contained MV3 folder, **10 files**; `dist\content.js 121.3kb` (124207 bytes) |
| `npm test -- --reporter=basic` | `0` | **44 test files passed, 907 tests passed** (baseline 44/906) |
| `node scripts/check-agent-config.mjs` | `0` | `0 error(s), 0 warning(s), 113 info(s)` — re-run by the reviewer, identical |
| `npm run typecheck` | `0` | three tsconfigs, no diagnostics |

Read-only corroboration (reviewer's own counts): `ls tests/*.spec.ts | wc -l` → **44**; `it(`/`test(` declarations across `tests/` → **907**; `.skip(`/`.only(`/`xit(`/`xtest(`/`.each(` → **0**; `find dist -type f | wc -l` → **10**; `dist/content.js` = **124207** bytes; `createFocusHandoff` appears **2×** in `dist/content.js` (definition + the one editor call site).

### What needs a real-Chrome re-check now that `A111` shipped (feeds Run 3)

1. **B7 itself (the half no test can pin):** select a sentence slowly; the card appears and the browser's own selection **stays** painted — the exact gesture that failed in Run 2.
2. **The new keyboard entry:** after a mouse selection, the **first** `Tab` must land in the card's `textarea` (Run 1 recorded the opposite under `A74` at `docs/state/browser-verification-run.md:32-33`); use a probe that does not start from the omnibox, since Run 1's `Shift+Tab` probe hit a Chrome-UI control.
3. **Tab order inside the live shadow tree:** `textarea` → `Сохранить` → `Отмена`, noting that `Сохранить` leaves the tab order while empty, so the order must be read after typing (mirrors `tests/content-create-card-controller.spec.ts:961`).
4. **Keyboard actions now reach the card only after `Tab`:** `Esc` closes and writes nothing; `Ctrl+Enter` and `Cmd+Enter` save — the jsdom pins fire synthetic events, the Chrome path is Tab-then-key.
5. **End-to-end survival to the save moment:** slow selection → `Tab` → type → `Сохранить`/`Ctrl+Enter` → the highlight and frame land on exactly the words selected (the span is re-derived from the `Range` held at open, `create-card-controller.tsx:161-167`).
6. **The `Tab`-drop residual risk of `A111`:** does the reader's own `Tab` into the `textarea` clear the page's visual selection? If it does, `A111` buys survival only up to the first keystroke, and the spec owes that sentence (finding 6).
7. **The editor half unchanged:** `tooltip` click → caret in the prefilled field, and **no page scroll** at either focus call — `preventScroll: true` is now observable in Chrome (`focus-handoff.ts:50`, used at `:84` and `:95`); Run 2's "no page scroll observed" claim (`:191`) was made under the old card behavior and now belongs to the editor only.
8. **Editor close paths in Chrome:** `Отмена`, `Esc`, a successful save, `Удалить`, a `pointerdown` outside the host and a page scroll each hand the caret back to the element focused before the open, and force nothing (`body`/`documentElement`) when that element is gone.
9. **A page that owns its own focus** (search box, autofocus, keyboard shortcuts): with the card standing, the page keeps its focus and its shortcuts — the card no longer interferes; and the event-driven closes (`pointerdown` outside, scroll) still close the card and write nothing while the caret stays on the page (jsdom pin `:1141`).