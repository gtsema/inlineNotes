# t4-02-options-name

## Goal

The Angular options page owns the author name: the input, the validation, and the first-run generated name. After this
task the extension has exactly one writer of `settings:v1` and the user can see and change who signs their notes.

## PM rulings and contracts this task implements

- `A11` (already issued): there is no `name_too_long` code in v1, so the **input layer** is the only place an over-long
  name is refused. The options field must stop the user before `saveSettings` ever sees such a value.
- `A54` **First run generates the name.** When `loadSettings` answers an unusable name (`''` with `settings_malformed`
  or `name_required`), the options page calls `generateAuthorName(rng)` (`src/core/entry-rules.ts`, 8 chars lowercase
  base36, randomness injected by the caller) and saves it through `saveSettings`. It does not ask the user to invent a
  name, and no other layer may generate one (spec `:75`). The content layer never generates a name — it only refuses to
  open the card while the name is unusable (`A31`).
- `A55` **Cap is measured in code points, and the counter agrees with core.** The field shows `N/40` using
  `MAX_AUTHOR_NAME_CODE_POINTS` and code-point counting (`sliceCodePoints`/`codePointOffsetAt` from
  `src/core/text-normalize.ts`), never `String.prototype.length`; a surrogate-pair name must count correctly, matching
  what core enforces.
- `A56` **Saving the same name twice is not an error.** `saveSettings` is idempotent; the page shows a saved state
  rather than pretending a write happened when the value is unchanged — but it still calls the core save, because a
  damaged record is repaired by the next explicit save (spec `:117`).

## AC (5 substantive + gates)

1. The options page loads the current name through `loadSettings` (no direct storage read) and shows it; a damaged or
   empty record shows an empty field plus the Russian hint, not the raw stored bytes. **Superseded by `A54`/AC3 and
   amended after review (R1)**: an unusable stored record shows the **generated** name in the field, not an empty one; the
   "not the raw stored bytes" half of the sentence still holds.
2. `Сохранить` calls `saveSettings(port, { name })` and nothing else; a refused name (`name_required`, `quota`,
   `serialization`) renders the matching message from the options-layer constants module (`A33` applies to this layer
   too: one message map per UI layer).
3. First run per `A54`: an unusable stored name produces a generated name in the field, saved through core, and the
   generated value equals what `loadSettings` returns afterwards.
4. Input cap per `A55`: the counter and the refusal agree with core at the boundary (40 code points accepted, 41
   refused) and count a surrogate pair as one.
5. No second reader/writer of `settings:v1` exists in `src/` (a test greps `SETTINGS_KEY` and the literal key), and the
   options layer touches storage only through `createChromeLocalStoragePort()`.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory, `A53`): component + service + tests → `npm test` → **commit the green code immediately** → spec
lines (`content-overlay-ui.md` for the UI wording, `inline-comment-model.md` only if a rule moves) → gates → second
commit. A committed green state with a short report is accepted; an uncommitted perfect one is not.

## Inputs the engineer reads

`docs/specs/content-overlay-ui.md` (Flow 7, AC9/AC10, message strings), `docs/specs/inline-comment-model.md`
(`:58-59` settings rules, `:75` author-name rule, AC27–AC28), `src/core/settings-store.ts`,
`src/core/entry-rules.ts` (`generateAuthorName`, `validateAuthorName`, `MAX_AUTHOR_NAME_CODE_POINTS`),
`src/core/text-normalize.ts`, `src/options/`, `src/content/store/chrome-storage-port.ts`,
`docs/state/t4-01-popup-list.md` (the popup half of the same contract).

## Explicitly out of scope

The popup list (`t4-01`), `storage.onChanged` and SPA refresh (`t4-03`), any page-side widget, the `tabs` permission
(`t4-01`).

## Attempts log

- attempt 1: brief prepared while `t3-01` was reviewed.
- **2026-11-17: this task is pulled forward, ahead of `t3-03-content-editor`**, out of the Stage 4 position. Reason: the
  Stage 3 runtime loop is unreachable without it — the content layer refuses to open the card without a valid author name
  (`src/content/create/create-note.ts:99-100`, `A31` / model AC9 / overlay AC10), and `src/options/options.component.ts` is
  still the `t1-01` placeholder, so the user had to write `settings:v1` by hand from the extension console to test anything
  at all. Recorded in `docs/state/plan-implementation.md`.
- Gate order in this brief predates ruling `A62`: run them as `npm run build`, then `npm test`, then
  `node scripts/check-agent-config.mjs` — one test fails when `dist/` is missing.
- This task is the first shipped consumer of `loadSettings`/`saveSettings` in the options layer and the only writer of
  `settings:v1` (`t3-01-settings-read-core` review handed the residual risks; AC5 of this task pins it).
- **2026-11-17: attempt 1 delivered** (`1cee49a` code+tests, `b872d4a` specs; report copied to
  `docs/state/t4-02-engineer.md`). PM re-ran the gates personally in the `A62` order: `npm run build` green,
  `npm test` **650/650** over 34 files (+24 vs `t3-02b`), checker **0 errors** (36 INFO, all the standing
  "planned path" tokens), `npm run typecheck` green, tree clean. Note: the report calls the handed-over baseline
  "from `t4-01`" — wrong label, `t4-01` has not run; the real baseline is `t3-02b` (626). Numbers are right, the
  attribution is a wording slip.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **2 of 4** (engineer delivered, reviewer **accepted**,
0 blocking findings). Task closed. The report answered every handed-over risk; the numbering differed from the brief's
bullets (reviewer remark R8) — the mapping: brief 1 ↔ report 1, brief 2 ↔ report 3, brief 3 ↔ report 6, brief 4 ↔ the
report's AC4 section, brief 5 ↔ report 5; report 2 and 7 are extras.

## Verdicts

- engineer report: attempt 1 delivered, copied to `docs/state/t4-02-engineer.md`
- reviewer verdict: **accepted**, 0 blocking findings (`docs/state/t4-02-review.md`); gates re-run by the reviewer, the +24
  test delta confirmed independently
- **task status: accepted** (`1cee49a`+`b872d4a`)

## Runtime confirmation (user, 2026-11-17)

The user reloaded the built `dist/`, set the author name on the options page from the UI, and re-ran the page loop:
selection → card → note → `Сохранить` → highlight → hover → tooltip, all working, no console errors — the name gate that
blocked Stage 3 is gone, no console command needed anymore.

## PM decisions on the review remarks

- **R1 — fixed now** (PM artifact): AC1 below is amended to the shipped shape.
- **R2, R3, R4 → carried into `t4-03-spa-refresh-docs`**, which owns docs and the final verification pass: decide whether
  the empty-name path is the disabled `Сохранить` (shipped) or the `name_required` sentence (spec promise) and amend the
  wording; replace the duplicated "shapes generated over" enumeration with a cross-reference; either pin the "40 code
  points **and saved**" clause with a write through `saveSettings` or drop "and saved".
- **R5, R6, R7 — accepted v1 debt, no slice**: a one-line `canSave: false` glue assertion, a rendered-template assertion
  (no Angular test harness in `package.json`, adding one for one assertion is not worth the dependency), and the unused
  `AuthorNameDraft.overCap` hook (kept as the hook for a future over-cap notice, which needs its own wording ruling).
  Each is one line to reopen, none is observable-behavior-wrong.

## Open questions

- `A54`/`A55`/`A56` are PM defaults applied without an answer from the user; each is one function or one constant to
  change.

## Residual risks handed over by `t3-01-settings-read-core` (`docs/state/t3-01-settings-read-core-review.md`)

- `saveSettings` and `generateAuthorName` may be wired **only** here (spec `:75`).
- After a failed save, re-show the previously stored name — the byte-identical guarantee is real and asserted
  (`tests/core-settings-store.spec.ts:289-321`).
- Declare `settingsValueOf` and `settingsFromStorageValue` **internal in the module header** (`t3-04` review remark 6,
  following the `assertCreatable` precedent): they stay exported for tests but no shipped module may import them.
- The stub's `maxlength="40"` in `src/options/options.component.ts:21` counts **UTF-16 units**, not code points: it must
  not be the only guard for astral names (`A55`).
- Two Russian strings already describe a name refusal on two surfaces (`Имя обязательно` in the overlay spec,
  `Укажите имя в настройках` in the model spec). Keep one per surface, each in its own constants module, and do not add
  a third for `quota` / `serialization` / `unavailable`.
