I verified everything against code and my own commands. No write-capable tool is available to this role (read/grep/find/ls + read-only bash), so here is the complete artifact for the briefed path `docs/state/reviewer-report.md`.

---

# t4-02-options-name — code review (attempt 1)

Range reviewed: `git log b912f4f..HEAD` → `1cee49a` (code+tests), `b872d4a` (specs). `c68c0fc` is PM state bookkeeping, not implementation.
Read: `docs/state/t4-02-options-name.md`, `docs/state/t4-02-engineer.md`, `docs/specs/INDEX.md`, `docs/specs/code-review-flow.md`, `docs/specs/content-overlay-ui.md`, `docs/specs/inline-comment-model.md`, and the shipped/test files themselves. Nothing was reviewed against the engineer's prose.

## Verdict

**accepted** — 0 blocking findings.

## Gates, re-run by the reviewer in the `A62` order (not copied from the report)

1. `npm run build` → `Application bundle generation complete` (popup, options), `[build] manifest references resolved: content.js, popup/index.html, options/index.html`, `[build] dist/ is a self-contained MV3 folder (10 files)`.
2. `npx vitest run --reporter=basic` → `Test Files 34 passed (34)` / `Tests 650 passed (650)`.
3. `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 36 info(s)`.
4. `npm run typecheck` → exit 0.

Delta confirmed independently: `grep -c "^  it(" tests/options-author-name.spec.ts` = **18**, added `it(` in the new describe of `tests/toolchain-contract.spec.ts` = **6** → **+24**, consistent with 626 → 650. `src/manifest.json`, `package.json`, `package-lock.json` are untouched in the range (`git diff --stat b912f4f..HEAD -- src/manifest.json package.json package-lock.json` → empty); no `.pi/`, `scripts/`, `docs/project-profile.md`, `docs/specs/INDEX.md` file is in the range, so the harness needed no re-verification beyond the checker.
Remark on method: `code-review-flow` → Rules says the reviewer may re-run only the checker; this brief explicitly ordered me to re-run all gates myself and distrust the report's numbers, so I ran the build too. `dist/` is gitignored (`.gitignore:2`) and `git status --porcelain` is clean after the run — no tracked file was mutated.

## Acceptance criteria (one line each)

- **AC1** — **pass**: `src/options/author-name-service.ts:112` `open()` performs exactly one `loadSettings` and returns core's normalized name; `tests/options-author-name.spec.ts:64` pins the whole port log as one `get settings:v1`; `:75` feeds nine damaged shapes and asserts none reaches the field. The AC clause "empty record shows an empty field plus the Russian hint" is superseded by `A54`/AC3 of the same brief — shipped shape is the `first-run name`, and the genuine empty-field-plus-message state is the unreadable store (`author-name-service.ts:119-124`, test `:99`); the spec now says exactly that at `docs/specs/content-overlay-ui.md:53,102-103,153` (AC18). See remark R1.
- **AC2** — **pass**: the only write site is `src/options/author-name-service.ts:165` (`saveSettings(port, { name })`), pinned by `tests/options-author-name.spec.ts:116` (full call log `[{get settings:v1},{set settings:v1}]`, stored key list `['name']`); refusals render from the single map — `:144` `name_required` → `Имя обязательно` + zero writes, `:161` `quota` → `Хранилище переполнено`, `:176` `serialization`/`unavailable` → `Не удалось сохранить имя`; map lives in the layer constants module `src/options/text.ts:44-58`, totality pinned at `tests/options-author-name.spec.ts:193` and the union-keyed type at `author-name-service.ts:57-60`.
- **AC3** — **pass**: `author-name-service.ts:132-141` calls core `generateAuthorName(this.rng)` then core `saveSettings`; `tests/options-author-name.spec.ts:224` asserts the field value, the stored record `{ name }`, and that a fresh `loadSettings(port)` returns the identical name with `codes: []`; `:240` proves a damaged record is rewritten and foreign fields die; `:251` covers empty-after-trim and 41-code-point stored names; `:263` covers the refused first-run write (empty field, `validateAuthorName('').ok === false`, so the `A31` content gate still holds). Only the options layer generates: `grep -rn "generateAuthorName(" src/` → `src/core/entry-rules.ts:140` (definition) + `src/options/author-name-service.ts:133` (the single call site).
- **AC4** — **pass**: boundary is code-point based — `author-name-service.ts:149` `sliceCodePoints(raw, 0, MAX_AUTHOR_NAME_CODE_POINTS)` and `:153` `codePointLength(raw)`; `tests/options-author-name.spec.ts:276` (40 → `overCap:false, canSave:true`; 41 → cut, `overCap:true`, and a direct `save(41)` refused with `name_required` and **no port call**), `:302` (40 emoji = 80 UTF-16 units → `codePointCount: 40`, accepted; 41 → `overCap:true`, counter prints `40/40`), `:319` (cap read from `MAX_AUTHOR_NAME_CODE_POINTS`, not hardcoded). `A55`'s surrogate-pair case is pinned by a running test, and the `t1-01` `maxlength="40"` is gone from shipped code — `grep -rn maxlength src/` hits only a comment (`src/options/options.component.ts:41`), pinned by `tests/toolchain-contract.spec.ts:208` (`not.toMatch(/maxlength/i)`, `not.toMatch(/\.length\s*[<>]/)`). The guard is real input refusal: `[value]="draft().value"` + `(input)="onInput($event)"` (`options.component.ts:57-58`) re-render the cut value.
- **AC5** — **pass**, verified with my own greps, not the report's: `grep -rn "SETTINGS_KEY" src/` → `src/core/storage-keys.ts:20` + `src/core/settings-store.ts:41,133,137,162` only; the literal `'settings:v1'` occurs in exactly `src/core/storage-keys.ts:20`; `grep -rn "chrome\." src/options/` → one comment (`author-name-service.ts:36`), no code site; `createChromeLocalStoragePort` in `src/options/` → `options.component.ts:3,18` only (the single port construction, behind `AUTHOR_NAME_SOURCE`), pinned at `tests/toolchain-contract.spec.ts:192`; `importersOf('saveSettings')`/`importersOf('generateAuthorName')` are exactly `['src/options/author-name-service.ts']` (own grep + `tests/toolchain-contract.spec.ts:199`); whole-tree `chrome.storage` code site remains exactly `src/content/store/chrome-storage-port.ts` (own grep + `tests/toolchain-contract.spec.ts:143-150`). Note for the record: `src/content/create/create-note.ts` imports `loadSettings`, i.e. it reads the settings *record* through the core API (`A31`, spec `content-overlay-ui.md:78`) — it is not a second reader of the key, which is what AC5 pins.

## Ruling checks

- **`A55`** — satisfied at the boundary and in the astral case (evidence above); `String.prototype.length` is not a guard anywhere in `src/options/`.
- **`A54`** — satisfied: generated by core, saved through core, read back equal, and generation is confined to the options layer; the `storage_unavailable` exception is implemented (`author-name-service.ts:119`) and tested (`options-author-name.spec.ts:99`), and it is spec'd at `content-overlay-ui.md:103` and `inline-comment-model.md:76`.
- **`A56`** — satisfied, not a fake write: `author-name-service.ts:164-170` always goes through `saveSettings`; `tests/options-author-name.spec.ts:326` counts two real `set` calls for two unchanged saves and asserts `message: 'saved'` → `Имя сохранено` (`src/options/text.ts:36`).
- **Network / host DOM / dependencies**: `grep -rn "fetch(|XMLHttpRequest|WebSocket|navigator.sendBeacon" src/` → none; the new code touches no host page (options page only, no painting); no new dependency (`package.json` untouched, `@types/chrome` was already a devDependency).

## Residual risks handed over by `t3-01-settings-read-core` — one line per bullet of that brief section

1. **`saveSettings` and `generateAuthorName` may be wired only here (spec `:75`)** — **closed**: call sites `src/options/author-name-service.ts:133,165`; single-importer greps pass at `tests/toolchain-contract.spec.ts:199`; reproduced by my own `grep -rln saveSettings src/` / `generateAuthorName src/`.
2. **After a failed save, re-show the previously stored name; the byte-identical guarantee is asserted** — **closed**: `author-name-service.ts:166-169` returns `this.storedName`, moved into the field by `options.component.ts:168`; asserted at `tests/options-author-name.spec.ts:144,161,176`; the core byte-identical assertions exist at `tests/core-settings-store.spec.ts:289-321` as the bullet claimed.
3. **Declare `settingsValueOf` / `settingsFromStorageValue` internal in the module header** — **closed**: `src/core/settings-store.ts:26-32` (added comment-only in `1cee49a`, verified by `git show 1cee49a -- src/core/settings-store.ts`: all 7 added lines are comment lines); **no shipped module imports them** — `grep -rn "settingsValueOf|settingsFromStorageValue" src/` hits only the definition and its own internal use at `:137,162`, plus tests; pinned by `tests/toolchain-contract.spec.ts:162-170` (`importersOf(...) === []`).
4. **`maxlength="40"` counted UTF-16 units and must not be the only guard** — **closed**: the attribute is gone from shipped code (only `options.component.ts:41` names it in prose) and the guard is `draft()`'s code-point cut + disabled button; astral behaviour pinned by a running test at `tests/options-author-name.spec.ts:302` and by the `not.toMatch(/maxlength/i)` grep at `tests/toolchain-contract.spec.ts:208`.
5. **Two Russian name-refusal strings already exist; keep one per surface, add no third** — **closed**: options uses the overlay-spec wording `Имя обязательно` (`src/options/text.ts:46`) and reuses the model-pinned quota sentence `Хранилище переполнено` (`inline-comment-model.md:103`); `src/content/text.ts:62` keeps `Укажите имя в настройках` on its own surface; `tests/toolchain-contract.spec.ts:218` rejects `Укажите имя` / `Задайте имя` / `Введите имя` as literals in `src/options/text.ts`. My own grep finds exactly two name-refusal sentences in the tree, one per surface. The two new options sentences (`Не удалось сохранить имя`, `Хранилище недоступно`) describe save-failure and read-failure states, not a name refusal, and both are fixed by the spec table at `content-overlay-ui.md:112-113`.

## Spec hygiene

- Ownership: **pass**. New overlay lines (`content-overlay-ui.md:38-40,102-114,130,153-155`) own the field/counter/wording/page-open rules; the one model line (`inline-comment-model.md:76`) extends the author-name rule it already owned and hands the UI half back to the overlay spec explicitly. The five "unusable name" shapes are enumerated in both files — remark R3, not a duplicated owner.
- Russian strings: **pass** — every new user-visible string is in `src/options/text.ts` (one map for the layer, `:44`), and `tests/options-author-name.spec.ts:208` pins that each sentence appears in the spec table that owns it.
- `src/core/settings-store.ts` changed comment-only: **true** (diff shown above).
- Behavior change and spec edit are inside the reviewed range (`1cee49a` code, `b872d4a` spec) as the `A53`/`A69` sequence requires — recorded as a remark, not a finding.
- `docs/specs/INDEX.md` needs no change (no new spec file; `src/options/` is already a covered path of `content-overlay-ui.md`).

## Build wiring

**Justified, does not weaken the checks.** `tsconfig.app.json` adds `"types": ["chrome"]` because `src/options/options.component.ts:3` imports the one port adapter, which pulls `src/content/store/chrome-storage-port.ts` into the popup/options program; `include` is unchanged. The compiler-side widening is offset mechanically: `tests/toolchain-contract.spec.ts:135-140` (core holds no `chrome.`), `:143-150` (one `chrome.storage` site in the whole tree), `:177` (options names no storage API/key), `:192` (one adapter factory in options). `npm run typecheck` green; `src/manifest.json` and `package.json` untouched; no network call in new code.

## Blocking findings

None.

## Non-blocking remarks (do not block acceptance; PM decides)

- **R1** — `docs/state/t4-02-options-name.md` AC1 still reads "a damaged or empty record shows an empty field plus the Russian hint", which contradicts `A54`/AC3 in the same brief and the shipped+spec'd shape (`content-overlay-ui.md:53,102,153`). The code/spec pair agrees, so this is not a spec/code conflict; the state-file AC line should be amended to record the supersession the engineer disclosed as D1.
- **R2** — `name_required`'s sentence `Имя обязательно` (`src/options/text.ts:46`) is unreachable through the shipped options UI: `Сохранить` is disabled while the value is empty after the trim (`src/options/options.component.ts:62` + `author-name-service.ts:154`), so the mapping exists and is tested at the service level (`tests/options-author-name.spec.ts:144`) but the reader can never see it, while `content-overlay-ui.md:53` still promises it as the empty-value path. Both spec clauses are implemented literally; the PM should decide whether Flow 9 or the disabled rule changes.
- **R3** — the five "shapes generated over" enumeration now appears verbatim in both `docs/specs/inline-comment-model.md:76` and `docs/specs/content-overlay-ui.md:103`; one should become a cross-reference before a future edit desynchronizes them.
- **R4** — spec AC19 (`content-overlay-ui.md:154`) says 40 code points "are accepted **and saved**" and 40 emoji "saves". Accepted is pinned at the options input (`tests/options-author-name.spec.ts:276,310`), refused is pinned (`:276`, `core-settings-store.spec.ts:134`), but no test writes a 40-code-point name — ASCII or astral — through `saveSettings` (`core-settings-store.spec.ts:104,113` seed and read; `entry-rules.spec.ts:162,168` validate only). Brief AC4 is met; the extra "saves" clause of the new spec line is `not covered by tests`.
- **R5** — `Сохранить` disabled while the value is empty after the trim has no `canSave: false` assertion in this layer (`tests/options-author-name.spec.ts:286,310` assert only `true`); the underlying rule is tested in core (`tests/entry-rules.spec.ts:159-160`), so the gap is one line of glue.
- **R6** — the component's template is pinned by source greps only, never by a render (`tests/toolchain-contract.spec.ts:208,229`); this is the engineer's D4 and needs a PM ruling if a rendered assertion is wanted (no Angular test harness exists in `package.json`).
- **R7** — `AuthorNameDraft.overCap` (`author-name-service.ts:77,153`) is computed and tested but unused by shipped code; it is the hook for the missing over-cap notice (engineer residual 2), which needs a ruling before wording is added.
- **R8** — bookkeeping: the report numbers its hand-over answers 1-7 in the order of the source review, not the order of the brief's five bullets (brief bullet 3 ↔ report item 6; brief bullet 4 is answered in the report's AC4 section; report items 2, 7 are extra). Nothing is unanswered, so `A72` is satisfied; the state file's line "the report answers the five residual-risk bullets by number" should name the mapping.
- **R9** — report wording: the baseline is `t3-02b` (626), not "`t4-01`", which has not run (already logged by the PM in the state file).

## Carried / residual risks (one line per number)

Brief hand-over bullets 1-5: **closed** (evidence in the section above, items 1-5).
Carried-fix checklist of this task: **none issued** as a numbered checklist in the brief — the hand-over list is bullet-form and is answered item-by-item above, with the numbering mismatch recorded as R8.

Risks handed forward by this task:

1. **First-run write on a read-only visit** (`author-name-service.ts:132` vs `save()` at `:164`) — **accepted as ruled** (`A54`); one call site would move it, PM decision only.
2. **No visible notice past the cap** (`content-overlay-ui.md:104`; `overCap` unused) — **open**, needs a ruling before a message code is added (R7).
3. **No refresh after a save** — `storage.onChanged` is `t4-03`; entries made under the previous name become read-only per `inline-comment-model.md` (edit-rights rule). **Open by scope**, not a defect of this task.
4. **Template verified by greps, not by a render** — **open**, gated on a ruling about an Angular test harness (R6).
5. **`tsconfig.app.json` carries `chrome` ambient types in the popup/options program** — **open but mechanically pinned** by `tests/toolchain-contract.spec.ts:135-150,177,192`; the alternative (moving the adapter to a shared directory) touches `src/content/` and `tsconfig.content.json` and is outside this brief.

Evidence path: commits `1cee49a`, `b872d4a`; files `src/options/author-name-service.ts`, `src/options/options.component.ts`, `src/options/text.ts`, `src/core/settings-store.ts`, `tests/options-author-name.spec.ts`, `tests/toolchain-contract.spec.ts`, `tsconfig.app.json`, `docs/specs/content-overlay-ui.md:38-40,53,102-114,130,153-155`, `docs/specs/inline-comment-model.md:76`.