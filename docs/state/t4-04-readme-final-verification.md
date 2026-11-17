# t4-04-readme-final-verification

## Goal

Make the extension verifiable by a human: a Russian README that a stranger can follow from `git clone` to a loaded
`dist/`, a clean documentation surface (no dangling task ids, no duplicated rules, no spec sentence wider than its tests),
and one recorded run of the whole observable behavior list of Stages 3–4.

Split off from `t4-03` by a PM scope split (2026-11-17): `t4-03` keeps the content-layer code (SPA re-resolve,
`storage.onChanged`, name-change pickup) plus CF1; this card owns documentation and verification. Reason: a slice that
carries code AC **and** docs **and** a human verification run overruns the runtime ceiling (`t3-03` lesson in
`docs/retro.md`).

## AC (4 substantive + gates)

1. `README.md` (Russian) covers: what the extension does in two sentences; `npm ci`/`npm install`, `npm run build`, loading
   `dist/` unpacked via `chrome://extensions` → «Загрузить распакованное расширение»; what `storage` and `tabs` are for and
   why the install warning appears (`A49` — the Russian line the `t4-01` reviewer routed here); the limits 256 chars per
   comment, 40 code points for the author name, 20 entries per page; and the accepted v1 limitations in plain Russian:
   the cross-tab write race (`A60`), repeated-text anchoring, iframes and page-owned shadow roots out of scope, the popup
   list is a snapshot while open, a refused write is silent (`A84`).
2. `docs/specs/INDEX.md` and the specs contain no dangling task ids and no rule written twice: R3 (the "shapes generated
   over" enumeration exists verbatim in two specs — one becomes a cross-reference).
3. R2 — one story for the empty-name path: the options UI disables `Сохранить` for an empty trimmed value, so the
   `Имя обязательно` sentence is unreachable there; the spec line at `docs/specs/content-overlay-ui.md:53` is amended to say
   the `name_required` sentence belongs to the popup and the content layer. Spec wording only, no code change.
4. R4 — either pin a 40-code-point name written through `saveSettings` (the astral case) or drop "and saved" from AC19 in
   `docs/specs/content-overlay-ui.md:154`; the PM's default is to **add the write**, because the sentence is a promise about
   storage, not about validation.

Gates green and quoted in the `A62` order: `npm run build`, then `npm test`, then `node scripts/check-agent-config.mjs`.

## Verification run (PM-owned, not the engineer's)

The browser list owned by `docs/state/t4-03-spa-refresh-docs.md` (items 1–6: `Tab` walk, `pointermove` cost, detached-node
save, editor-vs-create-card handover, popup against a real page including the install warning, checkbox repaint) is run by
the PM with the user and quoted here item by item. A missing human answer is recorded as `not verified`, never as passed.

**Deferred by the user (2026-11-17): «прогон будет позже»**. This card therefore closes on its documentation AC only; the
verification run stays open as a named pending item in the README status section and in the plan ledger until the user sits
down at Chrome. No task may claim it as passed.

## Inputs the engineer reads

`docs/project-profile.md` (commands, limits, runtime model — the source of truth for the README numbers), `README.md` as it
stands, `docs/specs/INDEX.md`, `docs/specs/inline-comment-model.md`, `docs/specs/content-overlay-ui.md`,
`docs/state/t4-02-options-name.md` (remarks R2–R4), `src/options/text.ts`, `src/options/author-name-service.ts`.

## Explicitly out of scope

Any behavior change in `src/core/`, `src/content/`, `src/popup/`, `src/options/`; `src/manifest.json`; new dependencies;
harness files; the browser run itself.

## Attempts log

- attempt 1: not started. Card opened by the `t4-03` scope split.
- **2026-11-17: delivered in five commits**, one per green step (`A73`): `e6e7918` README rewritten in Russian, `414e72b`
  R2 empty-name wording, `e097166` R3 dedup + the INDEX covered-paths sweep, `5993ac7` R4 the 40-code-point astral write
  through `saveSettings`, `88c8303` README honesty follow-up (the no-network claim scoped to the extension's own code,
  because Angular ships an unused `XhrFactory` into the popup/options bundles). No file under `src/`, no manifest, no
  dependency, no new Russian UI string.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **1**. Remaining: 1 (the reviewer).

## Verdicts

- engineer report: delivered, copied to `docs/state/t4-04-engineer.md` — AC1–AC4 answered by number, every number in the
  README traced to where it was measured, 4 deviations, 3 residual risks, no open observable question
- reviewer verdict: not started
- **PM gates re-run personally** (`A77`): `npm run build` green (10 files), `npm test` **790/790** over 41 files (the +1 is
  the AC4 write), `node scripts/check-agent-config.mjs` 0 errors / 0 warnings / **87 INFO** (the engineer's own spec
  sentence added one backticked `tests/…` token — measured, not copied from the brief), `npm run typecheck` exit 0, clean
- **PM spot-checks of README facts**: «8 символов» = `GENERATED_AUTHOR_NAME_LENGTH = 8` (`src/core/entry-rules.ts:34`);
  «через 150 мс» = `SELECTION_SETTLE_MS = 150` (`src/content/overlay/card-events.ts:42`); popup `Удалить` =
  `src/popup/text.ts:45`; the 1000 ms address poll lives in `src/content/refresh/url-change-watch.ts`

## `A89` — the `code-review-flow.md` edit: process breach, content ratified

`e097166` changed one line of `docs/specs/code-review-flow.md`, which is owned by `project-manager` and reachable by an
engineer only under a numbered ruling that names the file (`A76`). The brief ordered a sweep for dead paths and never
excluded PM-owned specs, and the commit cites no ruling — so this is a **breach of `A76`** and is recorded as one.

The edit is **kept**: the old sentence pointed reviews at `.pi/reviews/<task-id>-review.md`, a path that has never existed
in this repo, while the shipped practice across Stages 2–4 is `docs/state/<task-id>-review.md` with the runtime-managed
output directory winning. A spec that names a dead location is the worse defect. Revert target if the PM ever disagrees:
that single line at `docs/specs/code-review-flow.md:30`.

Rule going forward: a "sweep for dead paths / fix stale references" item in a brief must name the PM-owned spec files it
must **not** touch, unless a numbered ruling names the file. Recorded in `docs/retro.md` (Stage 4).

## Open questions

- None blocking. If the user overturns `A84` (a message for a refused popup write), the string + spec line + test belong
  here, not to `t4-01`.
