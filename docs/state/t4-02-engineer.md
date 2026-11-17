# t4-02-options-name — engineer report (attempt 1)

## Commits

- `1cee49a` — `feat(t4-02): author name in options over the core API`
  (`src/options/author-name-service.ts` new, `src/options/options.component.ts`,
  `src/options/text.ts`, `tests/options-author-name.spec.ts` new,
  `tests/toolchain-contract.spec.ts`, `src/core/settings-store.ts` comment-only,
  `tsconfig.app.json`)
- `b872d4a` — `docs(t4-02): author-name UI rules`
  (`docs/specs/content-overlay-ui.md`, `docs/specs/inline-comment-model.md`, plus the
  one test that pins the options sentences to the spec table)

Work order followed as ordered (`A53`): component + service + tests → `npm test` green →
commit 1 → spec lines → gates → commit 2. Nothing was staged or committed out of that order.

## Gates, quoted

1. `npm run build`

```
Application bundle generation complete. [1.352 seconds]  (popup)
Application bundle generation complete. [1.408 seconds]  (options)
[build] manifest references resolved: content.js, popup/index.html, options/index.html
[build] dist/ is a self-contained MV3 folder (10 files)
```

2. `npm test`

```
Test Files  34 passed (34)
     Tests  650 passed (650)
```

   Baseline handed over by `t4-01` was 626 tests / 33 files. This task adds 24 tests in 1
   new file (`tests/options-author-name.spec.ts`, 18) and 6 assertions-groups inside the
   existing `tests/toolchain-contract.spec.ts`. 626 + 24 = 650.

3. `node scripts/check-agent-config.mjs`

```
0 error(s), 0 warning(s), 36 info(s)
```

   Every INFO is the checker's standing "planned path not created yet" token for a
   backticked `src/…` or `tests/…` path inside a spec; this task's spec lines added five
   such tokens (`src/options/author-name-service.ts` ×2, `src/options/text.ts`,
   `src/content/store/chrome-storage-port.ts`, `tests/toolchain-contract.spec.ts`). No new
   error or warning class.

4. `npm run typecheck` (not a gate, run anyway because the task moves a file into the app
   program): `tsc -p tsconfig.content.json && tsc -p tsconfig.app.json && tsc -p
   tsconfig.spec.json` → exit 0.

## AC self-check

### AC1 — the page loads the name through `loadSettings`, no direct storage read; a damaged or empty record shows an empty field plus the Russian hint, not the raw stored bytes

Implemented, with one deviation in *what* the unusable state shows (see Deviation D1):

- `src/options/author-name-service.ts:112` `open()` — one `loadSettings` call, no other port
  use; `src/options/author-name-service.ts:116` shows the core-normalized name.
- `src/options/options.component.ts:3,13,18` — the only storage surface is
  `createChromeLocalStoragePort()` behind the `AUTHOR_NAME_SOURCE` token; no `chrome.*`, no
  key name anywhere under `src/options/`.
- Raw bytes are never rendered: the component only ever renders `view().name` /
  `draft().value`, and both are produced by `loadSettings` + `validateAuthorName`.
- Unusable record → `first-run name` (AC3, ruling `A54`), not an empty field with a hint —
  `A54` overrides that AC clause. The genuine empty-field-with-hint state is the unreadable
  store: `src/options/author-name-service.ts:119-123` → `''` + `Хранилище недоступно`, zero
  writes.
- Tests: `tests/options-author-name.spec.ts:64` (read shape + one `get` of `settings:v1`),
  `:75` (nine damaged shapes, none of them rendered), `:99` (unreadable store: empty field,
  message, `writesOf(port) === []`).

### AC2 — `Сохранить` calls `saveSettings(port, { name })` and nothing else; a refused name renders the matching message from the options-layer constants module

- `src/options/author-name-service.ts:164` `save()` — the single write path; it calls
  `saveSettings` and no other port method. The component has no other write:
  `src/options/options.component.ts:152-158`.
- Port-call proof is in the test, not in prose: `tests/options-author-name.spec.ts:116`
  asserts the whole call log is `[{ get settings:v1 }, { set settings:v1 }]` and that the
  stored value's own key list is `['name']`.
- Refusals: `:144` `name_required` → `Имя обязательно` and `writesOf(port) === []`;
  `:161` `quota` → `Хранилище переполнено`, stored JSON unchanged, field re-shows `Аня`;
  `:176` `serialization`/`unavailable` → `Не удалось сохранить имя`.
- One message map per UI layer (`A33`): `src/options/text.ts:44` is
  `OPTIONS_MESSAGE_TEXT: Readonly<Record<OptionsMessageCode, string>>`, keyed by the union in
  `src/options/author-name-service.ts:57-60`, so the compiler rejects a missing entry.
  `tests/options-author-name.spec.ts:193` pins the key set; `:208` pins that every sentence
  also appears in the spec table that fixes it.
- One wording per surface: `tests/toolchain-contract.spec.ts:218` rejects `Укажите имя`,
  `Задайте имя`, `Введите имя` as string literals in `src/options/text.ts`, and
  `tests/options-author-name.spec.ts:144` pins `Имя обязательно`.

### AC3 — first run per `A54`: an unusable stored name produces a generated name in the field, saved through core, equal to what `loadSettings` returns afterwards

- `src/options/author-name-service.ts:132` `generateOnFirstRun()` — `generateAuthorName(rng)`
  → `saveSettings`, in the same open that read it; the generated value is what the field then
  shows (`src/options/options.component.ts:168` `apply()` moves field and store together).
- Coverage of "unusable": a fresh install (`settings_malformed`), a non-record, a non-string
  `name`, an empty-after-trim name, and a 41-code-point name —
  `tests/options-author-name.spec.ts:224`, `:240`, `:251`.
- Read-back equality is asserted, not assumed: `:224` calls `loadSettings(port)` again and
  compares, and `:240` asserts the rewritten record carries only `name` (foreign fields die).
- `A54`'s exception is implemented and tested: a read that failed is **not** generated over
  (`src/options/author-name-service.ts:119-123`), because a fresh identity written into an
  area the page could not read would decide the edit rights of every stored entry.
- `:263` covers the remaining edge: the first-run write itself refused → empty field +
  `Не удалось сохранить имя`, and `validateAuthorName('')` is false, i.e. the content gate
  (`A31`) still refuses to open a card.

### AC4 — input cap per `A55`: counter and refusal agree with core at the boundary (40 accepted, 41 refused) and count a surrogate pair as one

- `src/options/author-name-service.ts:148` `draft()` uses `sliceCodePoints` and
  `codePointLength` from `src/core/text-normalize.ts`; `String.prototype.length` appears
  nowhere in `src/options/` (`tests/toolchain-contract.spec.ts:208` greps the layer for
  `sliceCodePoints`, `codePointLength` and for any `.length <`/`.length >` comparison).
- The counter is one shared measurement: `src/options/text.ts:69`
  `nameCounterText(codePoints)` prints `${codePoints}/${MAX_AUTHOR_NAME_CODE_POINTS}`, and
  `tests/options-author-name.spec.ts:319` asserts the cap is read from the core constant, not
  written in the UI.
- Boundary tests: `:276` (40 ASCII code points → `{ overCap: false, canSave: true }`; 41 →
  cut to 40, `overCap: true`, and a direct `save(41)` is refused with `name_required` and no
  port call — the same boundary core enforces); `:302` (40 astral emoji = 80 UTF-16 units →
  `codePointCount: 40`; 41 → `overCap: true`).
- The `t1-01` stub's `maxlength="40"` is gone, on purpose and by name: it counted UTF-16
  units, so it would have accepted 41 emoji and cut a 40-emoji name in half. The refusal now
  lives in `draft()` and in the disabled button
  (`src/options/options.component.ts:62`). `Сохранить` is disabled while the value is empty
  after the trim (`canSave` = `validateAuthorName(value).ok`).

### AC5 — no second reader/writer of `settings:v1` in `src/`; the options layer touches storage only through `createChromeLocalStoragePort()`

`tests/toolchain-contract.spec.ts:173-241`, a new describe block inside the existing layer
greps:

- `:177` — no file under `src/options/` contains `chrome.storage`; none imports
  `SETTINGS_KEY`; `modulesHoldingLiteral('settings:v1')` is still exactly
  `['src/core/storage-keys.ts']`.
- `:192` — `createChromeLocalStoragePort` appears in `src/options/` exactly once, in
  `options.component.ts`; the pre-existing test at `:143` keeps the whole tree at exactly one
  `chrome.storage` file (`src/content/store/chrome-storage-port.ts`).
- `:199` — `importersOf('saveSettings')` and `importersOf('generateAuthorName')` are each
  exactly `['src/options/author-name-service.ts']`: the options page is the only writer and
  the only generator (the clause at `inline-comment-model.md:75` that `t3-01` left as a
  comment is now a grep).
- `:229` — the component contains no core rule name (`loadSettings`, `saveSettings`,
  `generateAuthorName`, `validateAuthorName`, `MAX_AUTHOR_NAME_CODE_POINTS`), which is what
  keeps the "thin facade" claim falsifiable instead of aspirational.
- Pre-existing greps still pass untouched: one `SETTINGS_KEY` importer
  (`src/core/settings-store.ts`), zero importers of the internal `settingsValueOf` /
  `settingsFromStorageValue` (`A57`).

## Deviations

- **D1 — AC1's "empty record shows an empty field plus the Russian hint" is not what ships.**
  Ruling `A54` (same brief) says the page generates and stores a name for every unusable
  stored name, so a fresh install shows the generated name, not an empty field with a hint.
  I implemented `A54` and kept the AC1 shape for the one state `A54` does not cover: a storage
  read that failed (`storage_unavailable`) → empty field + `Хранилище недоступно`, no write.
  Spec updated to say exactly that (`content-overlay-ui.md:53,102-106`, AC18 at `:153`), so
  spec and code agree; the AC text in the state file was not edited.
- **D2 — `tsconfig.app.json` now has `"types": ["chrome"]` (was `[]`).** Importing
  `createChromeLocalStoragePort()` from the options layer pulls
  `src/content/store/chrome-storage-port.ts` into the popup/options compilation program, and
  without the chrome types both builds fail with `TS2304: Cannot find name 'chrome'` (observed
  before the change, quoted in this task's second attempt log if needed). The alternative —
  a second `chrome.storage.local` call site inside `src/options/` — would have broken the
  single-adapter invariant `t2-02` pinned, so it was rejected. `@types/chrome` is already a
  devDependency; the boundary is still mechanical, and it is now pinned harder than before
  (the new greps in AC5).
- **D3 — the rule text moved into `inline-comment-model.md` (1 line).** The brief allowed the
  model edit only "if a rule moves"; `A54` extends the first-run clause at `:75` (which name
  shapes are generated over, and the `storage_unavailable` exception), and `:75` is the line
  AC5's grep guards, so the sentence belongs there rather than only in the overlay spec.
- **D4 — no Angular component unit test.** `AuthorNameService` holds the behavior and is
  tested directly (18 tests); the component holds signal plumbing plus the template. Rendering
  an Angular standalone component inside Vitest needs JIT `@angular/compiler` (or a Vitest
  Angular plugin), which this repository does not have configured, and adding a dev dependency
  is out of a behavior slice. The template's claims are instead pinned by source greps
  (`:208`, `:229`) and by the manual step below. This is the one place where "the button is
  disabled" is not proven by a running DOM test.
- **D5 — `src/core/settings-store.ts` changed by comment only.** Its module header now states
  that `settingsValueOf` / `settingsFromStorageValue` are internal (`A57`) and points at the
  grep that enforces the ban. That is the answer to residual risk 6 below; no executable line
  in `src/core/` moved, so no core test changed.

## Residual risks handed over by `t3-01-settings-read-core`, numbered

1. **`saveSettings` had no shipped caller — the write half of the settings API was unexercised
   end to end.** **done** — `src/options/author-name-service.ts:164` (call site) and
   `src/options/author-name-service.ts:138` (first-run write); exercised by
   `tests/options-author-name.spec.ts:116,133,144,161,176,224,240,263,276,326`, and the
   single-caller claim is pinned at `tests/toolchain-contract.spec.ts:199`.
2. **The read path had a shipped caller but no UI state for a failed read.** **done** —
   `src/options/author-name-service.ts:119-123` (empty field, `storage_unavailable`, no write),
   wording `src/options/text.ts:54`, test `tests/options-author-name.spec.ts:99`. On failure the
   field re-shows the stored name rather than the typed value:
   `src/options/author-name-service.ts:167` + `src/options/options.component.ts:168`, tested at
   `tests/options-author-name.spec.ts:161,176`.
3. **`name_required` covered empty *and* over-long with no code to separate them, so the
   refusal sentence was underdetermined.** **done** — one sentence for one code
   (`src/options/text.ts:46`), and the over-long case is stopped before the save
   (`src/options/author-name-service.ts:148`, `src/options/options.component.ts:62`), tested at
   `tests/options-author-name.spec.ts:144,276`. Spec: `content-overlay-ui.md:106` (map) and
   `:104` (input cap).
4. **Nothing pinned that the options page, not another layer, owns the first-run generation.**
   **done** — `tests/toolchain-contract.spec.ts:199` (`generateAuthorName` has exactly one
   shipped importer, in the options layer) plus the sentence at
   `docs/specs/inline-comment-model.md:76` and `docs/specs/content-overlay-ui.md:103`.
5. **The settings messages existed only as codes, with no per-layer map, so a second UI surface
   would have invented its own wording.** **done** — `src/options/text.ts:44` keyed by the union
   at `src/options/author-name-service.ts:57-60`; totality pinned twice
   (`tests/options-author-name.spec.ts:193`, spec table `content-overlay-ui.md:108-114`); the
   cross-surface uniqueness grep is `tests/toolchain-contract.spec.ts:218`.
6. **`settingsValueOf` / `settingsFromStorageValue` were exported and nothing said they are
   internal.** **done** (documentation half) — `src/core/settings-store.ts:26-31` now declares
   them internal under `A57` and points at the pinning test; the executable half already existed
   at `tests/toolchain-contract.spec.ts:162` (`imports no internal settings helper anywhere`),
   which still passes. **skipped**: adding a `export type`-level enclosure (a private namespace)
   — TypeScript cannot express "exported for tests only" here without a second module, and a
   second module would create a second file naming `settings:v1`.
7. **A damaged record stayed damaged until something wrote it, and no shipped code wrote it.**
   **done** — first run rewrites it (`src/options/author-name-service.ts:132`, test
   `:240`), and an explicit unchanged save is still performed to repair it (`A56`, test `:326`).
   The store is never left with foreign fields: `:240` asserts the record is exactly `{ name }`.

## Manual verification step for the reviewer (not run by me)

`npm run build`, load `dist/` unpacked, open `chrome://extensions` → extension options:
field shows an 8-character lowercase name on a fresh profile and the record `settings:v1` is
`{ "name": "<that name>" }`; type 41 characters and the 41st never appears while the counter
sticks at `40/40`; clear the field and `Сохранить` is disabled; clear storage for
`settings:v1`, reopen, and the name is regenerated; on a `chrome://` page nothing is written.
This is the `A46` manual loop; I ran the build half only.

## Residual risks I hand over, and open questions

1. **Opening the options page now writes on first run.** `A54` requires it, so a read-only
   visit to `chrome://extensions` → options mutates `settings:v1`. If the PM would rather
   generate on the first explicit save instead, that is a ruling change against `A54`, not
   something I chose; the code keeps the two paths separate
   (`generateOnFirstRun()` at `src/options/author-name-service.ts:132` vs `save()` at `:164`)
   so the change would be one call site.
2. **No visible notice when the user types past the cap.** The extra characters never enter the
   value and the counter sticks at `40/40`, which is the refusal the spec describes
   (`content-overlay-ui.md:104`). If a sentence is wanted, `AuthorNameDraft.overCap` is already
   computed and exposed for it; adding wording would add a message code, so it needs a ruling.
3. **Nothing refreshes after the options page saves.** The content overlay and the popup keep
   the name they read at their own start; `storage.onChanged` is `t4-03`, and this task touched
   neither `src/content/` nor `src/popup/`. An existing entry made under the previous name keeps
   its stored `authorName` and becomes read-only — the behavior the model spec already fixes.
4. **The component's template is verified by greps, not by a render test** (D4). A reviewer who
   wants a rendered assertion needs a ruling on adding an Angular test harness dependency.
5. **`tsconfig.app.json` is now wider in types** (D2). If the reviewer prefers the chrome types
   out of the popup/options program, the alternative is moving the port adapter to a shared
   directory, which touches `src/content/` and `tsconfig.content.json` and is outside this brief.
