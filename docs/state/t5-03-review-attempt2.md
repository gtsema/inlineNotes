## Verdict

**`accepted`** — the attempt-1 `blocked` state **is resolved**. The spec-vs-code contradiction that blocked `t5-03` (attempt-1 blocking finding 1: `docs/specs/content-overlay-ui.md:19`/`:95` vs `src/content/overlay/editor-controller.tsx`) is closed in `8f84a0b` in the direction of ruling `A106` as amended by `A107`; no spec/code conflict remains in `HEAD`, so `docs/specs/code-review-flow.md` → Rules ("Spec vs code conflict is never resolved silently") no longer applies. **Blocking findings: none.**

## AC check — the five numbers of this brief

1. Blocking finding closed, honestly — **pass** (`docs/specs/content-overlay-ui.md:19`, `:95`, `:170` ↔ `src/content/overlay/editor-controller.tsx:225-228, 247, 356-375, 432-437`).
2. `A107` in code, `A45`/`A78`/`A100` intact, change confined to `editor-controller.tsx` — **pass** (`git diff --name-only 0eb53c2..8f84a0b -- src/` → one file).
3. The four pins exist and discriminate — **pass**; the discriminator is `tests/content-editor-controller.spec.ts:1005`, first failing assertion `:1021`.
4. Nothing else moved — **pass** (0 Cyrillic added in `src/`, `+6`/`-0` `it(`, one test file touched).
5. Gates quoted and corroborated — **pass** (checker re-run by me: `0 error(s), 0 warning(s), 104 info(s)`, `exit=0`).

Restated attempt-1 lines: attempt-1's `not covered by tests` line ("the one state where spec and code disagree … no test sets a page selection before the click") is now **covered** — `tests/content-editor-controller.spec.ts:988, 1015` set the page selection **before** `openOwn`. Attempt-1 AC1-AC9 verdicts are unchanged by this range (no file those ACs cite has a diff line except `editor-controller.tsx`, whose AC2/AC9 halves stay pinned at `tests/content-editor-controller.spec.ts:480, 590, 791, 871, 847` — untouched).

## 1. Is the blocking finding closed, and is it honest?

The two rewritten sentences, quoted:

- `docs/specs/content-overlay-ui.md:19` (Terms, `re-selection`): *"a page selection that **appears or changes while the editor stands**, i.e. one whose boundary points differ from **both** boundary states the editor recorded at its open moment: the `PaintedEntry`'s own `resolved span` as the `paint pass` registered it (ruling `A106`), and the page selection the `tooltip` click found — `null` when the page held none (ruling `A107`)."* Closing sentence: *"The page's selection at the click is never a baseline of its own and never a move: `A106` fixes what the note's own words are, `A107` exempts what the reader did not do."*
- `docs/specs/content-overlay-ui.md:95` (Rules, editor lifetime): *"**Two** boundary states are kept at the open moment, and each of them answers "no `re-selection`". … Under ruling `A107` the page selection the click **found** is kept too, `null` when the page held none, and a page selection still standing on those points at the press is not a `re-selection` whichever words it lies across … What is left is the rule: a `re-selection` is a page selection that **appears or changes while the editor stands**."*

Sentence-by-sentence against the code: "differ from **both** boundary states" = `reselectionOf` returns a `Range` only after failing `sameBoundaryState(session.openSelection, now)` (`:363`) **and** `sameSelectionBoundaries(session.boundaries, now)` (`:369`). "the page selection the `tooltip` click found — `null` when the page held none" = `openSelectionState()` (`:225-228`) → `openSelection: openSelectionState()` (`:247`), typed `SelectionBoundaries | null` (`:173`). "`null` … any selection then differs" = `sameBoundaryState` returns `false` for a kept `null` (`:433-435`). "`A106` … the same node-local UTF-16 offsets its `paint name` was registered with" = `spanBoundariesOf` (`:209`, `:449-461`) fed from `owner.fragments`. "**Neither kept state is ever resolved, painted from or written**" — verified by grep: `session.boundaries` is read at exactly one place (`:369`) and `session.openSelection` at exactly one place (`:363`); neither is a `Range` and neither reaches `saveEntryComment` (`:289-298` passes only `reselection`). "a selection inside the overlay host is not a selection of the page" holds for the new open read too, because it goes through the same seam (`:188` → `capturePageSelection`, whose host exclusion is `src/content/capture/page-selection.ts:84-87`). "a page selection sitting on those very points … for which ruling `A103` opens no card at all" holds: containment is inclusive at `src/content/overlay/contained-own-selection.ts:96` (`offset >= fragment.start && offset <= fragment.end`).

The attempt-1 sentences are gone: greps for `happened to hold`, `keeps no baseline` return **zero** hits in `docs/specs/` (the two remaining hits are the engineer's negations — `editor-controller.tsx:50`, `tests/content-editor-controller.spec.ts:956`). The spec's internal contradiction at attempt-1 `:240` is also gone: `docs/specs/content-overlay-ui.md:241` now reads the same direction as `:19`/`:95`/`:170`.

`A92` re-read of the replacement claim: one phrase is loose — "**The page's selection at the click is never a baseline of its own**", `content-overlay-ui.md:19`. Read literally it denies the very comparison the code performs at `:363`. It is rescued by "of its own" and by the same row's earlier "both boundary states … the page selection the `tooltip` click found" plus `:95` "is kept too", so the spec as a whole does not mis-state the code — recorded as **non-blocking remark 1**, not a finding. No wording left in the spec promises an outcome the code does not produce.

## 2. `A107` in code

Open-moment capture: `editor-controller.tsx:225-228` reads the page selection **before** `render`/mount (`:249`), keeping boundary points only; stored at `:247`. Press-time comparison: `:356-375` — `null` → no re-selection (`:358-361`); equal to the open state → no re-selection (`:363-368`, `A107`); equal to the entry's painted points → no re-selection (`:369-373`, `A106`); anything else is handed on as `current.range` (`:374`), i.e. a selection equal to the open state is **never** a `re-selection`, and any other differing selection reaches the per-author rule. `A100` per-author scan: `src/content/editor/edit-entry.ts:162` (`entriesOfAuthor`); `A45` self-exclusion: `:161` (`removeById`, no `exceptId` in core); no span work at all when `reselection` is `null`: `:127`; `A78` write: `:173` (`updateEntryComment` → `comment` + `updatedAt`). `edit-entry.ts`, `page-selection.ts` and `src/core/` have empty diffs in the range. Scope: `git diff --name-only 0eb53c2..8f84a0b -- src/` → **`src/content/overlay/editor-controller.tsx` only**; `git show --stat 8f84a0b` → exactly the three briefed files.

## 3. The four pins exist and discriminate

Block header `tests/content-editor-controller.spec.ts:968`; fixture selectors `:978` free words `p2 0-6`, `:980` my other own note `p1 35-43`, `:982` the edited note's own painted points `p1 4-15`.

- **(a)** `:984` — stale over free words: `:994` no refusal line, `:995` editor closed, `:999-1002` `anchor`/`text`/`createdAt` unmoved, `updatedAt` = stamp.
- **(b)** `:1037` — a **new** selection across my own other note (`:1045` moves it while the editor stands): `:1049` `REFUSAL_TEXT.overlap`, `:1050` editor stays open, `:1051` draft kept, `:1052-1054` zero `set`/`remove`, `:1056` stored comment unchanged.
- **(c)** `:1005` — **stale** selection across my own other note (`:1015`, set before `openOwn`, unmoved at the press): `:1021` no refusal line, `:1022` editor closed, `:1025-1028` the save landed with `anchor`/`text` unmoved, `:1032-1034` the note it lay across is byte-identical. **If the open-moment exemption (`:363-368`) is deleted, the assertion that fails is `expect(refusalLineOf(overlay)).toBeNull()` at `tests/content-editor-controller.spec.ts:1021`.** Mechanism, verified by reading: `now` = `p1 35-43` ≠ `session.boundaries` = `p1 4-15` (`:369` fails) → `Range` handed to `edit-entry.ts` → self-exclusion removes only `a1b2c3d4e5f6` (`:161`), the author filter keeps `c3d4e5f6a1b2` (`:162`) → `findOverlappingEntry` (`:163`) with `intersectsRanges` = `a.start < b.end && b.start < a.end` (`src/core/entry-overlap.ts:112`), which makes two identical ranges intersect → `{ok:false, code:'overlap'}` → the refusal line renders. `:1022`/`:1025` would fail too; vitest stops at `:1021`. This matches the engineer's quoted mutation output (`1 failed | 29 passed` — the file holds exactly **30** `it(` declarations, my count).
- **(d)** `:1059` none-then-new over free words: question reached, `:1072` no refusal, `:1079-1081` save lands with `anchor`/`text` unmoved (`A78`); its pair `:1084` none-then-new across my own other note: `:1094` refused. `sameBoundaryState`'s kept-`null` half (`:433-435`) is what makes `:1084` refuse; had it returned `true`, `:1094` would fail — so (d1)+(d2) also discriminate the exemption's **scope**, and (b) discriminates it against being over-broad.

No pin among (a)-(d) is vacuous: (c) fails without the exemption; (b) and (d2) fail if the exemption is widened.

## 4. Nothing else moved

`git diff --name-only 0eb53c2..8f84a0b` → `docs/specs/content-overlay-ui.md`, `src/content/overlay/editor-controller.tsx`, `tests/content-editor-controller.spec.ts` (engineer commit) — plus `docs/state/improvement-backlog.md`, `docs/state/t5-03-review.md`, `docs/state/t5-04-focus-on-open.md` from the three PM docs commits in the range (`42629c3`, `be8c923`, `5d4205e`); PM bookkeeping, not engineer work, same treatment as attempt-1 §Boundaries. Empty diffs verified for `src/content/text.ts`, `src/manifest.json`, `package.json`, `package-lock.json`, `.pi/`, `scripts/`, `docs/project-profile.md`, `docs/specs/INDEX.md`, `docs/specs/inline-comment-model.md`, `docs/specs/code-review-flow.md`, README. Under `src/` only `editor-controller.tsx`; added lines containing Cyrillic in that diff: **0** of 97; no shipped string changed and none added (tests use `CONTENT_STRINGS.save` / `REFUSAL_TEXT.overlap`, i.e. the constants module). Tests: only `tests/content-editor-controller.spec.ts`; `it(` **added 6, removed 0**; no test outside it touched. No network call, no host-DOM write for painting (paint path untouched), no new dependency, no harness change.

## 5. Gates

Engineer quotes (`docs/state/t5-03-engineer-attempt2.md`, "### 4. Gates", `A101`): `npm run typecheck` `exit=0`; `npm test -- --reporter=basic` `exit=0` → `Test Files 43 passed (43)`, `Tests 857 passed (857)`; `npm run build` `exit=0` → `dist/` 10 files; `node scripts/check-agent-config.mjs` `exit=0` → `0 error(s), 0 warning(s), 104 info(s)`; plus the mutation run `1 failed | 29 passed` at `:1021`. Quote present, complete, consistent with the PM's figures (851 → 857 = +6, and the 6 new `it(` are the only added declarations).

My read-only re-run (the one authorized command): `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 104 info(s)`, `CHECKER_EXIT=0` — matches. Corroboration: `ls tests/*.spec.ts | wc -l` = **43**; `it(`/`test(` declarations = **857**; `.skip(`/`.only(`/`xit(`/`.each(`/`xdescribe(` = **0**. The 103 → 104 info delta is attributable and verified: backticked `tests/content-editor-controller.spec.ts` mentions in `docs/specs/content-overlay-ui.md` go 5 → 6 across the range.

## Carried-fix checklist (`A72`)

This brief states no carried fixes for the re-review; one line per item left open by attempt 1, so nothing is dropped:

1. attempt-1 blocking finding 1 (spec/code conflict on the baseline) — **closed** by `8f84a0b`; see §1.
2. attempt-1 remark 2 (stale AC numbers `tooltip-style.ts:9`/`:41`, `tooltip.tsx:31`) — untouched here, correctly outside this brief; not yet carried anywhere.
3. attempt-1 remark 3 (stale AC numbers in five test names) — untouched here; not yet carried anywhere.
4. attempt-1 finding 4 (`contained-own-selection.ts:87` dead path) — carried, `docs/state/t5-04-focus-on-open.md:57-58` item 2.
5. attempt-1 finding 5 (`editor.tsx:5-7` stale rule pointer) — carried, same file item 3 (`:59-61`).
6. attempt-1 carried 3 (`paint-plan.ts:105`) and remark 6 (`create-card.tsx:22`) — carried, same file items 1 and 4 (`:55-56`, `:62`).

**Numbered carried fixes this review requires of a next task: none.**

## Blocking findings

None.

## Non-blocking remarks (numbered for the PM to carry or drop)

1. `docs/specs/content-overlay-ui.md:19` — "The page's selection at the click is never a baseline of its own"; the code does compare against that state (`editor-controller.tsx:363`). "never a baseline standing on its own" would be exact. One word, spec text.
2. `tests/content-editor-controller.spec.ts:1101` — this case pins the `A106` painted-span branch only in a state where the alternative answer is also free: with `:369` removed the selection `p1 4-15` becomes a re-selection, the check runs, self-exclusion (`src/content/editor/edit-entry.ts:161`) drops the edited entry and no other own entry intersects it in the fixture, so the case still lands. The branch is observable only where two own entries' resolved ranges overlap after a page mutation; that state has no pin. Coverage remark, not an AC failure.
3. `docs/state/improvement-backlog.md:161-162` still words `A106` as "only a **new** selection differing from the note's own words asks the own-author overlap question", and `:159` names the code half `editor-controller.tsx keepBaseline` — a name the shipped code does not use (`:165` `boundaries`, `:173` `openSelection`). `A107` at `:165-173` amends the rule, and `docs/state/` is not a spec, so this is a PM ledger cleanup, not a spec/code conflict.
4. `src/content/editor/edit-entry.ts:22-23` words the trigger as "a re-selection made while the editor is open" — consistent with `A107`, whose definition already excludes a selection present at open. No edit needed; if the PM wants the `A107` phrase verbatim, it needs a new carried number, because `docs/state/t5-04-focus-on-open.md:47` forbids `src/content/editor/**`.
5. `editor-controller.tsx:356` — the parameter `session` shadows the module-level `let session` at `:192`. Style only.
6. `editor-controller.tsx:226` — one extra page-selection read per editor open through the injected seam (`:188`); no DOM walk, no resolve, no storage read, no rule forbids it.
7. `A106`/`A107` are pinned at jsdom level through the `readSelection` seam only (`tests/content-editor-controller.spec.ts:962-964`). A real-browser `pointerdown` on the tooltip may collapse the page selection, which answers "no re-selection" by the `null` path (`:358-361`) instead of the open-moment path — same outcome, different mechanism. The browser checklist for this ruling belongs to the final manual-verification pass, as the engineer's residual 4 states.

## Evidence

Read: `docs/specs/INDEX.md`, `docs/specs/code-review-flow.md`, `docs/specs/content-overlay-ui.md` (`:17`, `:19`, `:56`, `:92`, `:95`, `:98-106`, `:170`, `:241`), `docs/state/improvement-backlog.md:157-173`, `docs/state/t5-03-review.md`, `docs/state/t5-03-engineer-attempt2.md`, `docs/state/t5-04-focus-on-open.md:44-66`, `src/content/overlay/editor-controller.tsx`, `src/content/editor/edit-entry.ts`, `src/content/capture/page-selection.ts`, `src/content/overlay/contained-own-selection.ts`, `src/core/entry-overlap.ts`, `tests/content-editor-controller.spec.ts`.
Commands run (read-only): `git log --oneline -8`; `git show --stat 8f84a0b`/`be8c923`/`42629c3`/`5d4205e`; `git show 8f84a0b -- <each of the three files>`; `git show 42629c3:docs/state/t5-03-review.md`; `git diff --name-only 0eb53c2..8f84a0b` (whole and per-path: `src/`, `tests/`, `src/content/text.ts src/manifest.json package.json package-lock.json .pi/ scripts/ docs/project-profile.md`); `git status --porcelain`; `grep` sweeps (`happened to hold`, `keeps no baseline`, `baseline`, `A104`, `A106`/`A107`, `removeById|entriesOfAuthor|findOverlappingEntry|updateEntryComment`, host exclusion, inclusive containment, `return a.start < b.end`); counts (`ls tests/*.spec.ts | wc -l` = 43; `it|test` declarations = 857; `.skip(`/`.only(`/`.each(`/`xit(`/`xdescribe(` = 0; per-file `it(` = 30; `+it(`/`-it(` = 6/0; added `src/` lines with Cyrillic = 0/97; spec path mentions 5 → 6); and the one authorized command `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 104 info(s)`, `exit=0`.