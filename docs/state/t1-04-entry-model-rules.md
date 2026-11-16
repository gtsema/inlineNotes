# t1-04-entry-model-rules

## Goal

The entry and its business rules exist in `src/core/` as pure functions with tests: the 256 code-point
comment cap, the 20-entry page cap, author identity and edit rights, entry identity and ordering. No
`chrome.storage` access in this task — that is `t1-05`.

## AC (numbered, copied into the brief; 5 substantive + gates)

1. `Entry` in `src/core/entry.ts` = `{ id, pageKey, authorName, text, comment, anchor, visible, createdAt, updatedAt }`;
   `visible` defaults to `true` (PM ruling `A1`), `anchor` is the type `{ text, prefix, suffix, fragmentCount }`
   (codec arrives in Stage 2, here only the type). `docs/specs/inline-comment-model.md` gains the `visible` field
   in the same commit.
2. `validateComment(comment)` returns `{ ok, codePointLength, normalized }`; empty after trim → not ok; length is
   counted in **Unicode code points** (`Array.from`), cap 256; a test asserts an astral character (surrogate pair)
   counts as one code point and that 257 code points are rejected while 256 pass.
3. Author rules: `validateAuthorName` (non-empty after trim, max 40 code points), `isSameAuthor(a, b)` (trimmed,
   case-sensitive), `generateAuthorName(rng)` producing 8 lowercase base36 characters, and `randomId(rng)` producing
   12 lowercase base36 characters. Randomness is **injected** as an `() => number` parameter — `src/core/` stays free
   of `Math.random` and `crypto`, so every test is deterministic.
4. `canEdit(entry, currentName)` is true only when the trimmed `authorName` equals the trimmed current name;
   `assertCreatable({ entries, comment, currentName })` returns a typed error code — `name_required`,
   `comment_empty`, `comment_too_long`, `page_limit` — and the code `page_limit` appears at 20 existing entries,
   never at 19. Each code has exactly one test.
5. List helpers over `Entry[]`: `sortByCreatedAtAsc` (creation order ascending, stable), `removeById`,
   `clearPageEntries` (empty result), `MAX_ENTRIES_PER_PAGE = 20`, `MAX_COMMENT_CODE_POINTS = 256`,
   `MAX_AUTHOR_NAME_CODE_POINTS = 40`. `removeById` and `clearPageEntries` never mutate their input.
6. Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (mandatory): gates first → then the spec line → then the commit. A slice that runs out of time commits the
green state and says what is missing.

## Stage plan

Stage 1 (renegotiated to 5 tasks). Previous: `t1-03` (accepted). Next: `t1-05-entry-store` closes Stage 1.

## Attempts log

- attempt 1: brief issued, status: delegated.

Brief (attempt 1):
- Task: pure entry model + caps + authorship rules with tests.
- Input paths: `docs/project-profile.md`, `docs/specs/inline-comment-model.md`, `docs/state/t1-04-entry-model-rules.md`, `src/core/page-key.ts`, `src/core/storage-keys.ts`.
- Output artifact: `docs/state/t1-04-engineer.md` + code in `src/core/entry.ts`, `src/core/entry-rules.ts` (or an equivalent split the engineer proposes), `tests/`.
- Acceptance criterion: AC 1–6 above, each with a self-check line.
- Constraints: pure core (no DOM, no `chrome.*`, no `Math.random`, no `crypto`, no `any`); no new dependency, no jsdom; no storage adapter in this task; UI strings are NOT written here — core returns codes, the UI layer maps them to Russian strings later; do not touch `.pi/`, `docs/project-profile.md`, `docs/specs/content-overlay-ui.md`, `docs/state/*`; commit after green gates (`feat(t1-04): entry model, caps and authorship rules`).
- Report must contain a `Commands run` section quoting `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: complete, attempt 1/2; commit `b550fc4`; gates quoted — `npm test` 122/122, `npm run build` self-contained `dist/`, checker 0 errors / 0 warnings (4 INFO are the standing planned-path rule). Artifact: `…/subagent-artifacts/outputs/d3b3c66b-fbe9-4dfb-a214-4decf42a14b3/docs/state/t1-04-engineer.md`.
- reviewer verdict: **accepted**, no blocking findings, 6 non-blocking remarks (R1–R6). Artifact: `…/subagent-artifacts/outputs/078bd08b-9506-4605-9d4d-5c5b42f161d5/docs/state/t1-04-review.md`.
- PM decision: task closed at attempt 1/2. Slice size held at 5 substantive ACs and the attempt fit the time budget — the `t1-03` re-cut works.

## PM rulings on the review remarks

- `R1`, `R2` accepted: the spec will say **40 code points** for the author name, and the `assertCreatable` doc comment gains the Flow-3 step-2 mapping. Both land in `t1-05`, which edits the same spec.
- `R3`, `R4` accepted as-is; no change.
- `R5` confirmed by ruling `A11`: one code `name_required` for v1; the options page refuses an over-long name at input (`t4-02`).
- `R6` confirmed by ruling `A9`: the store writes `new Date().toISOString()`; the spec pins the format in `t1-05`.
- Residual risk 4 (author name must be persisted trimmed) is assigned to `t1-06`: the creation facade persists `validateAuthorName(...).normalized`, never the raw input.

## Open questions

- `A1` applied: `Entry.visible: boolean`, default `true`, spec edited in the same commit.
- Error codes are English identifiers; the Russian user-visible strings are mapped in `t3-03`/`t4-01`, which is where
  the spec's exact messages (`Достигнут лимит 20 записей на странице`, `Укажите имя в настройках`) become observable.
