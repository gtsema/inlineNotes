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
   empty record shows an empty field plus the Russian hint, not the raw stored bytes.
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

- attempt 1: brief prepared while `t3-01` was reviewed; delegated in Stage 4.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A54`/`A55`/`A56` are PM defaults applied without an answer from the user; each is one function or one constant to
  change.
