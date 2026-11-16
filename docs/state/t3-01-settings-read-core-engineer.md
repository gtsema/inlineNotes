# t3-01-settings-read-core

## Goal

The settings half of `A31`, isolated so the card task stays one layer: `loadSettings(port)` in `src/core/` with its
decode guard, so both the content script (`t3-01-content-create-card`) and the options page (`t4-02`) read the author
name through one core function instead of touching a storage key by hand.

## Why this task exists (ruling `A34`)

`A15` put the `settings:v1` decode guard in `t4-02`, but the content script needs the name earlier; `A31` moved the
read to `t3-01`. After `t2-02` overran the runtime ceiling with a two-layer slice, `A34` splits that move out into this
task, because a core-only slice of this size has never hit the ceiling (`t1-02`, `t1-04`, `t2-01` all landed inside it).

## AC (3 substantive + gates)

1. `loadSettings(port)` → `{ name, codes }` reading the single `settings:v1` key through `StoragePort`: an absent key
   or a non-object value yields `name: ''` plus a machine code (`settings_malformed`), never a throw; a stored
   non-string `name` is the same; a valid name is returned **normalized** by `validateAuthorName` (trim), and a name
   longer than `MAX_AUTHOR_NAME_CODE_POINTS` is reported with `name_required` semantics per ruling `A11` (no separate
   code in v1) while the stored value is left untouched — read never rewrites.
2. `saveSettings(port, { name })` writes the normalized value produced by `validateAuthorName` and nothing else; an
   empty or whitespace-only name refuses with `name_required` and writes nothing; a quota/serialization failure
   returns that `StorageFailureError` code and leaves the stored value byte-identical.
3. `docs/specs/inline-comment-model.md` gains the `settings:v1` record shape and these two rules in the same commit,
   and `t4-02-options-name-field` is named as the UI half only (no second storage reader).

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order: module + tests → `npm test` early → spec lines → gates → commit `feat(t3-01): settings read and write in core`. Commit as soon as green.

## Inputs the engineer reads

`docs/specs/inline-comment-model.md` (Storage seam, Terms `settings`, authorship rules), `docs/state/t3-01-settings-read-core.md`,
`src/core/storage-port.ts`, `src/core/entry-store-read.ts` (the decode-guard idiom to copy), `src/core/entry-rules.ts`
(`validateAuthorName`, `MAX_AUTHOR_NAME_CODE_POINTS`), `tests/support/memory-storage-port.ts`,
`docs/state/t1-05-review.md` (remark about keeping `chrome.storage` in exactly one shipped file).

## Explicitly out of scope

Any UI: no options page, no popup, no content script. The first-run generated name (`generateAuthorName`) gets **no**
shipped caller here; wiring it is `t4-02`.

## Attempts log

- attempt 1: brief prepared; delegated as the first task of Stage 3. Timed out at the 60-minute ceiling with the work
  uncommitted in the working tree: `src/core/settings-store.ts` (165 lines) + `tests/core-settings-store.spec.ts`
  (26 tests, 424 passing files/tests measured by PM). No spec line, no purity-scan fold, no commit.
- attempt 2 (completion brief): finished the missing parts on top of the surviving code — 5 new tests, the
  `MODULES` fold in `tests/core-storage-port.spec.ts`, the spec lines, one build fix. Committed as `e654892`
  (`feat(t3-01): settings read and write in core`), 4 paths, tree clean after commit.
  Test count moved 424 → 429.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 3 (attempt 1 timeout + attempt 2 delivery + this report).

## Verdicts

- engineer report: delivered, see "Engineer report (attempt 2)" below; gates quoted.
- reviewer verdict: not started

## Open questions

- Whether a too-long stored name should be truncated on read: **no** (read never rewrites), applied as the default;
  the options input refuses the overflow before it is stored.
- New in attempt 2: whether a settings read should distinguish "fresh install" from "damaged record". Shipped answer:
  it does not — both are `settings_malformed` with `name: ''`, so a caller has one answer for "no usable name".
  `t4-02` may add a first-run branch by testing `validateAuthorName(result.name)` rather than the code list. Recorded
  in the spec under "Settings read"; PM may override.

## Engineer report (attempt 2)

### Changed paths (committed as `e654892`)

- `src/core/settings-store.ts` — new (165 lines). Exports `SettingsValue`, `SaveSettingsInput`, `SettingsCode`,
  `SettingsReadResult`, `SettingsWriteCode`, `SettingsWriteResult`, `settingsValueOf`, `settingsFromStorageValue`,
  `loadSettings`, `saveSettings`. Attempt-2 change: removed the unused value import of
  `MAX_AUTHOR_NAME_CODE_POINTS` (it is named in doc comments only); `ng build` failed with `TS6133` before that.
- `tests/core-settings-store.spec.ts` — new (370 lines, 31 tests). Attempt 1 wrote 26; attempt 2 added 5 and one
  `writesOf` helper.
- `tests/core-storage-port.spec.ts` — one line: `'settings-store.ts'` added to the shared `MODULES` purity scan
  (line 141). No second list was created.
- `docs/specs/inline-comment-model.md` — Terms rows `settings record` + `settings read codes`; Rules bullets
  "Settings record", "Settings read", "Settings write"; cross-reference in the `authorName` bullet; one Edge Case;
  AC 27–30.

### Commands run

- `npm test` (before any edit, baseline check): `Test Files 22 passed (22)`, `Tests 424 passed (424)`,
  including `tests/core-settings-store.spec.ts (26 tests)`.
- `npx vitest run tests/core-settings-store.spec.ts tests/core-storage-port.spec.ts` (after the test edits):
  `2 passed`, `46 passed` — settings spec at `31 tests`, purity scan green with the new module in `MODULES`.
- `npm test` (after all edits, run twice): `Test Files 22 passed (22)`, `Tests 429 passed (429)`.
- `npm run build` (first run failed, then fixed): `TS6133: 'MAX_AUTHOR_NAME_CODE_POINTS' is declared but its value is
  never read.` in `src/core/settings-store.ts:31`; after removing the import →
  `dist/ is a self-contained MV3 folder (10 files)` (`dist/content.js` 18833 bytes, popup + options built).
- `node scripts/check-agent-config.mjs`: `0 error(s), 0 warning(s), 20 info(s)` (the 20 infos are the pre-existing
  "planned path not created yet" notes about `src/core/`, `src/content/…` and `tests/` referenced by specs).
- `npm run typecheck` (not a gate, run to prove the new spec file typechecks under `tsconfig.spec.json` strict):
  clean, no output.
- `git status --short --untracked-files=all` after commit: empty; `git log -1` → `e654892 feat(t3-01): settings read and write in core`.
  Commit contains exactly the four briefed paths; nothing pushed.

### AC self-check

1. **AC1 — read.** `{ name, codes }` from one `get([SETTINGS_KEY])`; absent key, a string/number/boolean/`null`/array
   value, `{}`, and a non-string or `null` `name` all give `{ name: '', codes: ['settings_malformed'] }` and nothing
   throws; a valid name comes back `validateAuthorName`-normalized (trim) with `codes: []`; exactly
   `MAX_AUTHOR_NAME_CODE_POINTS` (40) code points passes, and the cap is measured in code points (`😀` × 40 passes);
   41 code points returns the trimmed value and `codes: ['name_required']` — the single `A11` code, no
   `name_too_long`, no truncation (`result.name.length > MAX` is asserted). A port read rejection becomes
   `{ name: '', codes: ['storage_unavailable'] }`. **Read never writes**: the new table test asserts, for all 12
   stored shapes plus the failing-read case, that the port call log contains no `set` and no `remove`
   (`writesOf(port) === []`) and that `JSON.stringify(port.snapshot())` is byte-identical; the flagship damaged-record
   test now also asserts `port.calls === [{ op: 'get', keys: [SETTINGS_KEY] }]`, i.e. exactly one read and no write,
   not merely an unchanged value.
2. **AC2 — write.** `saveSettings` writes one key whose stored JSON is exactly `{"name":"<trimmed>"}` and nothing
   else, and the call log is exactly `[{ op: 'set', keys: [SETTINGS_KEY] }]` (so no read-modify-write, no `remove`);
   foreign fields another writer left (`theme`, `version`) are dropped by the save. An empty name, a
   whitespace-only name (`' \t\n '`) and a no-break-space + tab name return `{ ok: false, code: 'name_required' }`
   with `port.calls === []` and byte-identical store, including over a seeded whole store (index + page slot).
   `failNextWrite('quota')` → `{ ok: false, code: 'quota' }`, `failNextWrite('serialization')` → `code:
   'serialization'`, `failNextWrite('unavailable')` → `code: 'unavailable'`; in each case
   `JSON.stringify(port.snapshot())` equals the pre-call value and every key is still present (the new whole-store
   quota test proves `pages:v1` and `notes:v1:…` are untouched, not just the settings key). Round-trip test: the name
   a save wrote is the name a read returns with `codes: []`.
3. **AC3 — spec.** `docs/specs/inline-comment-model.md` now states the record shape (`settings:v1` holds exactly
   `{ name }`, no settings delete in v1), "absent or non-object or non-string `name` ⇒ `name: ''` +
   `settings_malformed`, never a throw", "read normalizes and never rewrites, exactly one `get`, no `set`/`remove`",
   "save writes only `validateAuthorName(name).normalized` and refuses before any port call", "a port rejection
   leaves the stored value byte-identical", and the `A11` one-code stance for an over-long stored name. `t4-02-options-name`
   is named as the UI half and the only shipped caller of the save and of the first-run generated name; AC 27–30 make
   the three claims checkable. Same commit as the code (`e654892`).

### Constraint compliance

- Core purity: verified mechanically — `settings-store.ts` is now inside the shared `MODULES` scan, which asserts no
  `document` / `window` / `chrome.` / `Date` / `Math.random` / `crypto` / `fetch(` / `XMLHttpRequest` / `WebSocket`,
  no `any`, no `@ts-ignore` / `@ts-expect-error`, no `@angular/` / `preact`, and only relative `./` imports. Passing.
- `tests/toolchain-contract.spec.ts` keeps core free of `chrome.`/DOM and `chrome.storage` in exactly one shipped
  adapter; `settings-store.ts` reaches storage only through the injected `StoragePort`.
- No Russian in `src/core/` (checked by a code-only Cyrillic scan: no matches). UI-facing codes are English
  machine tokens.
- No UI files, no `src/content/anchor/`, no `.pi/`, no `docs/project-profile.md`, no `docs/state/*`,
  no `src/manifest.json` were touched. No new dependency.

### Deviations

1. `MAX_AUTHOR_NAME_CODE_POINTS` is imported by name nowhere in `src/core/settings-store.ts` (it appears only in doc
   comments), because `npm run build` treats an unused value import as an error (`TS6133`). The cap is still applied
   through `validateAuthorName`, so no rule moved out of core.
2. `AC3` names `t4-02-options-name-field`; the task file and the rest of the docs use `t4-02-options-name`. The spec
   text uses `t4-02-options-name` (the task-id form) in both places. Cosmetic; PM may normalize.
3. Attempt 1's code was kept as-is except the unused import; no rewrite.

### Handoff: `t3-01-content-create-card` — what "no name" looks like

- Call `loadSettings(port)` once per create path (or cache it per page load and refresh on `onChanged`). Decide
  "is there an author" with `validateAuthorName(result.name).ok` — never by comparing `result.codes`, and never by
  reading `settings:v1` directly.
- "No name" is any of: `{ name: '', codes: ['settings_malformed'] }` (fresh install, damaged record, wrong type),
  `{ name: '', codes: ['storage_unavailable'] }` (port failure), or a **non-empty** `name` plus `['name_required']`
  (a stored value over 40 code points). All three must behave identically on the page: **the card must not open at
  all**, and the message is the `name_required` wording already pinned in the card brief
  (`Укажите имя в настройках`) — model spec AC9 and the new "Settings read" bullet.
- The read never writes: a damaged or over-long stored record is not repaired by opening the page; only the options
  save repairs it. Do not add a repair, a default or a generated name in the content layer.
- The read issues exactly one `get([SETTINGS_KEY])`; a second storage read in the card path needs a spec line.

### Handoff: `t4-02-options-name` — where `generateAuthorName` plugs in

- `t4-02` is the only shipped caller of `saveSettings(port, { name })`, and the only place the first-run generated
  name (`generateAuthorName`, `src/core/entry-rules.ts` area / injected random source per `A9`) gets a caller: on
  `loadSettings` returning `name: ''`, generate once and `saveSettings` it, so the popup, the card and the options
  page then read one value.
- Bind the input to the returned `name` (already trimmed by the read) and refuse over-length at input with
  `maxlength` / `MAX_AUTHOR_NAME_CODE_POINTS` (ruling `A11`): that is what keeps `name_required` the only code the
  user can ever see for a name.
- Map codes to Russian in `src/options/text.ts` only: `name_required` → `Укажите имя в настройках`,
  `quota` → `Хранилище переполнено`, `serialization` / `unavailable` → the storage-failure wording. A failed save must
  leave the field showing the previously stored name, because `saveSettings` guarantees the stored value is unchanged.
- A name change never rewrites entries: existing `authorName` values stay and become read-only (model spec, Edge Cases).

### Residual risks

- `settings:v1` has no `version` field (the record is `{ name }` only), unlike `pages:v1` and the page slots. A future
  settings field is therefore a layout change with no version marker; `settingsFromStorageValue` ignores unknown
  fields, which is the mitigation chosen and stated in the spec.
- A `settings:v1` value written by an older/foreign writer is indistinguishable from a fresh install on read
  (both `settings_malformed`); only the options UI could tell them apart, and only by the absence of any stored value.
- No `chrome.storage.local` `onChanged` propagation for the settings key is specified yet; until a task specifies it,
  an open popup and an open page can disagree about the current author after a name change in options.
