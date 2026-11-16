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

- attempt 1: brief prepared; delegated as the first task of Stage 3.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 3 (engineer ×2 attempts + reviewer ×1).

## Verdicts

- engineer report: attempt 2, commit `e654892` (4 files, +547/−1); copied to `docs/state/t3-01-settings-read-core-engineer.md`.
  PM gates on the commit: `npm test` **429 passed / 22 files**, `npm run build` self-contained `dist/`, `npm run typecheck`
  clean, checker `0 / 0 / 20 INFO` (the new INFO is a planned-path token for `t4-02-options-name-field`).
- reviewer verdict: running (`36734c60`), range `c16966a..e654892`.
- note for future briefs: this task's `output` was bound to the state-file name, so the engineer report and the PM state
  file share a name in the managed artifact dir. Bind engineer output to `docs/state/<task-id>-engineer.md` instead.

## Open questions

- Whether a too-long stored name should be truncated on read: **no** (read never rewrites), applied as the default;
  the options input refuses the overflow before it is stored.
