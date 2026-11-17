# t3-04-content-anchor-hardening

## Goal

Close the `t2-02` review findings that live in `src/content/anchor/` and its tests, before the create card builds on
that directory. Created because the `t2-02` review left six findings in one directory — more than the "carry at most
two" rule in `.pi/skills/delivery-planning/SKILL.md` allows on top of another task.

## AC (5 substantive + gates)

1. `A36` all-or-nothing liveness: `locateAnchorInStream` returns `anchor_stale` when **any** mapped node of the resolved
   range is no longer inside the subtree; today it returns `ok: true` with the survivor (`t2-02` remark `N1`,
   `src/content/anchor/locate-anchor.ts:82-85` contradicting its own comment at `:66-69`). One new test: a two-fragment
   match with one node removed.
2. `A35` table cells: `td` and `th` join the `A20` block-boundary list, so `<td>a</td><td>b</td>` streams as `"a b"`;
   the spec's boundary rule and one test change together.
3. `N2` false equality removed: spec `inline-comment-model.md` (the "equals `normalizeText` applied to the raw subtree
   text" clause), the module header in `text-stream.ts`, and the fixture that proves a different claim are replaced by
   the precise statement — normalized by construction, one U+0020 per `A20` boundary, trimmed at both ends.
4. Scan hygiene bundle (`N3`, `N5`, `t2-03` remark 7, `t2-04` remark 1 / ruling `A51`): the `dist/` half of the jsdom
   scan fails when `dist/` is missing instead of passing vacuously; `docs/specs/INDEX.md` covered-paths for the model
   spec gains `src/content/anchor/`; and the purity scans are merged (`A51`, `t3-01` review remarks 2 and 7):
   - the shared list in `tests/core-storage-port.spec.ts` stops being hand-maintained and is **derived from the
     directory** (`A58`) — it covers 9 of 15 `src/core/` modules today, and a derived list makes the drift impossible
     rather than annually corrected;
   - it absorbs the stronger non-ASCII rule of the local scan in `tests/core-entry-overlap.spec.ts`, whose duplicate
     `describe` is then deleted. Prerequisite: verify `codeOnly()` strips comments (nine `src/core/` files contain
     em-dashes and arrows in comments) — if not, the rule is Cyrillic-only (`[Ѐ-ӿ]`), which is what the
     architecture rule actually forbids;
   - one grep test pins the **set of shipped modules allowed to import `SETTINGS_KEY`** to `{src/core/settings-store.ts}`
     (`t3-01` review remark 2), following the pattern already used for `chrome.storage` at
     `tests/toolchain-contract.spec.ts:123-131`; the same test asserts no shipped module imports `settingsValueOf` or
     `settingsFromStorageValue`, which are internal (`A57`, same stance as `assertCreatable` under `A52`).
5. `N4` bounded cache: the module-scoped whitespace decision map in `text-stream.ts:269` is replaced by a constant
   whitespace set (it currently grows with every distinct code point of every page the content script visits); the
   stream stays uncached (`A29`) and a test pins that two calls over a mutated DOM differ.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): `npm test` first → code+tests per AC in the order above → spec lines in the same commit → all
three gates → commit `fix(t3-04): anchor liveness, table boundaries and scan hygiene`. Commit as soon as green.

## Inputs the engineer reads

`docs/state/t2-02-review.md` (remarks `N1`–`N5`, `N8`), `src/content/anchor/text-stream.ts`,
`src/content/anchor/locate-anchor.ts`, `tests/content-anchor-*.spec.ts`, `docs/specs/inline-comment-model.md`
(Anchoring / stream rules), `docs/specs/INDEX.md`.

## Explicitly out of scope

The create card, the shadow host, painting, popup/options, any `src/core/` change (the core findings went to
`t2-04-core-create-hardening`).

## Attempts log

- attempt 1: brief prepared; delegated after `t3-01-settings-read-core` acceptance (before the create card).

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A35`/`A36` are PM defaults already recorded in `docs/state/t2-02-content-anchor-dom.md`; nothing new is decided here.
