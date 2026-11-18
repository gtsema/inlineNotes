# `t5-03` engineer report — attempt 2 (the `A106` baseline, amended by `A107`)

Task: `t5-03`, review verdict `blocked` on a spec-vs-code contradiction inside the task's own commit.
Spec owner: `docs/specs/content-overlay-ui.md`. Rulings in force: `A106` (the baseline is the painted
entry) as amended by `A107` (a page selection already present at the open moment is never a
`re-selection`), both from the supervisor reply of this run.
Commit: **`8f84a0b`** — `fix(t5-03) CP5: the re-selection baseline is the entry's own painted span, and the
selection the click found is exempt (A106, A107)`. One commit, three files, at green.

## Deviation from the brief, stated up front

The brief said "do not touch code under `src/` — the code already implements this", and its item 2 said a
page that already holds a stale selection "saves cleanly, no refusal line". Those two statements are not
both true: the shipped code compares the page selection at the press with the painted span and ignores the
age of the selection, so a **stale selection lying across another note of the reader's own** was refused with
«Выделение пересекается с существующей записью». That is the only state where the two baseline readings store
different bytes, so it is the only state whose pin can stop the drift.

I reported that before writing it (`contact_supervisor`, `need_decision`). The answer was ruling **`A107`**,
which amends `A106`: the painted-span baseline survives, **and** a page selection already present at the open
moment is exempt whatever it lies across; a `re-selection` is a selection that **appears or changes while the
editor stands**. The reply authorized a narrowed `src/` change (`src/content/overlay/editor-controller.tsx`
only) and reordered the pins. Everything below is that decision, not my own.

## Item-by-item report

### 1. `re-selection` Terms row and the editor-range bullet rewritten to the `A106`/`A107` baseline — **done**

| Artifact | Path:line |
| --- | --- |
| Terms row, `re-selection` | `docs/specs/content-overlay-ui.md:19` |
| Rules bullet, "The editor keeps its range unless the reader re-selects" | `docs/specs/content-overlay-ui.md:95` |

Terms row now reads: "a page selection that **appears or changes while the editor stands**, i.e. one whose
boundary points differ from **both** boundary states the editor recorded at its open moment: the
`PaintedEntry`'s own `resolved span` as the `paint pass` registered it (ruling `A106`), and the page selection
the `tooltip` click found — `null` when the page held none (ruling `A107`)". The closing sentence is the
anti-drift statement: "The page's selection at the click is never a baseline of its own and never a move:
`A106` fixes what the note's own words are, `A107` exempts what the reader did not do".

Kept **verbatim**, not paraphrased, as the brief required:

- `A45` self-exclusion — "It is the only page state that asks an `overlap` question for an existing entry, and
  that check excludes the entry being edited (ruling `A45`)";
- `A100` author filter — "and scans only entries of the current author (`A93`, `A99`, `A100`)" in the row, and
  the untouched closing sentence of `:95`: "The same list is filtered to the entries of the current author
  before the check (`A100`), so moving one's own note across a `foreign entry`'s words is allowed and moving it
  across a note of one's own is refused";
- `A78` — "A *successful* one moves nothing: it decides the `overlap` answer only, and moving a note to other
  words is a delete plus a create (ruling `A78`, section \"Ruling `A78`: what a successful `re-selection`
  stores\")", and in `:95` "a save with no `re-selection` changes `comment` and `updatedAt` only, leaves the
  `anchor` exactly as it was, and asks no `overlap` question".

The wrong sentences ("what the editor keeps is the page selection the page happened to hold at the `tooltip`
click", "a page that held none keeps no baseline … the stale selection a click found on the page is not one")
are gone from both places, and the spec no longer contradicts itself against `:240`.

### 2. The observable case pinned, named after the ruling — **done**

Spec home of the named case: `docs/specs/content-overlay-ui.md:170` — Edge Cases row "Rulings `A106` and
`A107`, named as one case because they are one question". It states the open-moment exemption explicitly
("**no `overlap` question is asked at all** … whichever words that selection covered, including one lying
across **another note of the reader's own**, where a painted-span baseline alone would answer «Выделение
пересекается с существующей записью» for a selection the reader never made in this editing session").

Executable pins — `tests/content-editor-controller.spec.ts`, new block at `:968`
("Rulings `A106` + `A107`: the painted span is the baseline, and the selection the click found never is"),
ending at the file's last line `:1125`; `.skip` / `.only` / `xit` count in that file: 0:

| # | Case | Path:line | Answer pinned |
| --- | --- | --- | --- |
| a | page already holds other words at the click, `Сохранить` with no new selection | `tests/content-editor-controller.spec.ts:984` | save lands, `refusalLineOf` is `null`, `anchor`/`text`/`createdAt` unmoved, `updatedAt` = stamp (`A78`) |
| c | **the state that separates the readings**: the click found a selection lying across my own other note, unchanged at the press | `tests/content-editor-controller.spec.ts:1005` | save lands, no refusal line, the other own note byte-identical (`comment`, `updatedAt`, `anchor`) |
| b | the same editor, a **new** selection across my own other note | `tests/content-editor-controller.spec.ts:1037` | `REFUSAL_TEXT.overlap` («Выделение пересекается с существующей записью»), editor open with its draft, zero `set`/`remove` calls, stored comment byte-identical |
| d1 | no selection at the open moment, a later selection over free words | `tests/content-editor-controller.spec.ts:1059` | question asked, answer free, save lands, `anchor`/`text` unmoved (`A78`) |
| d2 | no selection at the open moment, a later selection across my own other note | `tests/content-editor-controller.spec.ts:1084` | `REFUSAL_TEXT.overlap`, nothing written |
| e | `A106` half: re-selecting the note's **own painted points** (`p1` 4→15, the span its `paint name` was registered with) | `tests/content-editor-controller.spec.ts:1101` | not a `re-selection`: plain comment edit, neighbour note untouched |

Mutation evidence that case **c** really is the discriminator: with the `A107` branch neutralized in
`reselectionOf` (`if (false && sameBoundaryState(...))`, run then reverted), the whole file answers
`1 failed | 29 passed` and the single failure is `tests/content-editor-controller.spec.ts:1021` —
`expected 'Выделение пересекается с существующей…' to be null`. Every other case passes under both readings;
only **c** separates them. Source file restored immediately after that run (`git diff --stat` confirmed, and
the committed tree passes 857/857).

### 3. Code, narrowed to the one authorized file — **done** (`A107` reply item 1)

`src/content/overlay/editor-controller.tsx` — no other `src/` path has a diff line:

| Line | What |
| --- | --- |
| `:15` | the header ruling list gains `A106`, `A107` |
| `:41-68` | the "range rule" paragraph rewritten: two page states answer "no `re-selection`" (the selection the open moment found; the painted span), anything else is "a page selection that **appears or changes while the editor stands**", and neither kept state is ever resolved, painted from or written (`A37`) |
| `:108-113` | the `readSelection` seam doc now names both reads: at open (`A107`) and at the save press (`A45`, `A106`, `A107`) |
| `:160-173` | `EditorSession` keeps `boundaries` (the `PaintedEntry`'s own points, `A106`) **and** `openSelection: SelectionBoundaries | null` — "the boundary points of the page selection the editor **found at its open moment**, or `null` for 'the page held no selection'" |
| `:225-229` | `openSelectionState()` — reads the page selection at the open moment, **before** the widget is mounted, and keeps boundary points only |
| `:247` | the session is built with `openSelection: openSelectionState()` |
| `:356-376` | `reselectionOf(session)`: `null` selection → no `re-selection`; `sameBoundaryState(session.openSelection, now)` → no `re-selection` (`A107`); `sameSelectionBoundaries(session.boundaries, now)` → the note's own words, no `re-selection` (`A106`); otherwise the range is the `re-selection` |
| `:432-439` | `sameBoundaryState` — the nullable half of the comparison, kept module-local because no shipped module owns a nullable boundary comparison (`page-selection.ts` was not touched) |

No new `catch`, no new code, no new Russian string, no storage write, no page-DOM write, no permission change,
no dependency. `src/content/editor/edit-entry.ts`, `src/content/capture/page-selection.ts` and `src/core/`
have empty diffs — the overlap check, the self-exclusion and the per-author filter are exactly where `t5-01`
and `t3-03` put them.

### 4. Gates, each with its own exit status (`A101`) — **done**, run on the committed tree

```
npm run typecheck                        exit=0   tsc over tsconfig.content / tsconfig.app / tsconfig.spec, no output
npm test -- --reporter=basic             exit=0   Test Files 43 passed (43) | Tests 857 passed (857)
npm run build                            exit=0   dist/ is a self-contained MV3 folder (10 files)
node scripts/check-agent-config.mjs      exit=0   0 error(s), 0 warning(s), 104 info(s)
```

`857` is `851` (the `t5-03` CP4 figure the reviewer re-measured) plus the six pins of item 2; no case was
removed or skipped. `.skip`/`.only`/`xit` count: 0. `find dist -type f | wc -l` = 10.
The checker's info count moved 103 → 104 because the new Edge Cases row mentions
`tests/content-editor-controller.spec.ts`; the checker's "planned path not created yet" info for that path
already fires five times elsewhere. Errors and warnings: 0.

## Boundaries checked

`git show --stat 8f84a0b` → exactly three files: `docs/specs/content-overlay-ui.md`,
`src/content/overlay/editor-controller.tsx`, `tests/content-editor-controller.spec.ts`.
Empty diffs: `src/core/`, `src/content/{anchor,capture,create,editor,store,refresh,paint}`,
`src/content/main.ts`, `src/content/overlay/` (all other files), `src/popup/`, `src/options/`,
`src/manifest.json`, `package.json`, `package-lock.json`, `.pi/`, `scripts/`, `docs/project-profile.md`,
`docs/specs/inline-comment-model.md`, `docs/specs/code-review-flow.md`, `docs/specs/INDEX.md`, README.

Not staged, not committed, not touched: `docs/state/t5-03-tooltip-click-editor.md` and
`docs/state/t5-04-focus-on-open.md` were already modified in the working tree when I started (live PM edits
adding the `t5-04` carried-fix items). I left them as I found them, and my `git add` named only my three
paths. After the commit, `git status --porcelain` lists only those two PM files — nothing of mine is staged.

## Residual risks and open items (none blocking, none acted on)

1. **`A106`'s own sentence in the PM state file is the imprecise one, and it quotes a name the code does not
   use.** `docs/state/improvement-backlog.md:157-163` still states the `A106` observable consequence as "a page
   that already holds a stale selection when the tooltip is clicked saves cleanly (no overlap refusal), and only
   a **new** selection differing from the note's own words asks the own-author overlap question". After `A107`
   the first clause is true and the second needs `A107`'s wording ("appears or **changes** while the editor
   stands"), because the exemption — not the novelty of the selection — is what the rule turns on. The same
   entry names the code half `editor-controller.tsx keepBaseline`; the shipped field is `boundaries` (plus
   `openSelection` after this change). The `A107` entry at `:165` already amends the rule, so this is a wording
   cleanup, and that file is PM-owned: I did not edit it.
2. **One stale comment sentence, comment-only, in a file this brief forbade.**
   `src/content/editor/edit-entry.ts:22-23` says "The only way the span is touched is a **re-selection made
   while the editor is open**". `A107`'s definition is "appears or changes while the editor stands". The
   module's contract (`reselection: Range | null` handed by the caller) is unchanged, so this is a wording nit
   for the carried-fix list, not a rule change. `docs/state/t5-04-focus-on-open.md` already forbids
   `src/content/editor/**`, so it needs a new carried number.
3. **Reviewer remarks from `t5-03` not in this brief** (dead pointers at `contained-own-selection.ts:87`,
   `overlay/editor.tsx:5-7`, `create-card.tsx:22`, `paint-plan.ts:105`; stale AC numbers in
   `tooltip-style.ts:9`/`:41`, `tooltip.tsx:31` and in five `tests/content-editor-controller.spec.ts` case
   names) are untouched — the PM has already numbered four of them into the `t5-04` carried-fix checklist
   (`docs/state/t5-04-focus-on-open.md`, working tree).
4. **No browser verification in this run.** There is no `chrome://extensions` load here, so the `A106`/`A107`
   behavior is pinned at jsdom level only, through the injected `readSelection` seam. In a real browser a
   `pointerdown` on the `tooltip` may collapse the page selection; then the open read and the press read both
   answer `null`, which is the same "no `re-selection`" answer — so the two environments agree on the outcome
   even where they differ on the mechanism. The browser checklist item for this ruling belongs to the final
   manual verification pass.
5. **A real-browser nuance the pins cannot see:** the open-moment read is one extra `document.getSelection()`
   per editor open. It costs no DOM walk, no resolve and no storage read, and it is read before the widget is
   mounted, so a selection inside the overlay host is the `null` the shipped capture rule already answers.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Brief items 1-3 delivered, plus the three extra items the supervisor attached to ruling A107 in the reply to my need_decision. Spec: docs/specs/content-overlay-ui.md:19 (Terms row), :95 (editor-range bullet), :170 (named Edge Cases row for A106/A107); the A45 self-exclusion, A100 author filter and A78 comment+updatedAt halves are kept verbatim. Tests: tests/content-editor-controller.spec.ts:968-1125, six cases (a, b, c, d1, d2, e), with case c at :1005 named as the one that separates the two readings. Code: src/content/overlay/editor-controller.tsx only (:173 openSelection field, :225 openSelectionState(), :247 session build, :356-376 reselectionOf, :432 sameBoundaryState) - authorized by the A107 reply, which superseded the brief's no-src rule for that one file. No scope widening: commit 8f84a0b touches exactly three files."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Report at the authoritative artifact path with per-item path:line, four gates with individual exit codes (typecheck 0, test 0 with 43 files/857 cases, build 0 with dist 10 files, checker 0 with 0 errors/0 warnings), a mutation experiment proving the pin discriminates (A107 branch disabled -> exactly 1 failed test, at tests/content-editor-controller.spec.ts:1021, with the overlap sentence), boundary diff list, and git status showing no staged files of mine after the commit."
    }
  ],
  "changedFiles": [
    "docs/specs/content-overlay-ui.md",
    "src/content/overlay/editor-controller.tsx",
    "tests/content-editor-controller.spec.ts"
  ],
  "testsAddedOrUpdated": [
    "tests/content-editor-controller.spec.ts (new describe 'Rulings A106 + A107' at :968 with six cases: :984 stale free words -> save lands; :1005 stale selection across my own other note -> save lands, the discriminating pin; :1037 new selection across my own other note -> overlap refusal; :1059 later selection over free words -> asked, lands; :1084 later selection across my own other note -> refused; :1101 the note's own painted points -> not a re-selection), plus the file's pinned-behaviour header"
  ],
  "commandsRun": [
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "exit=0, three tsc projects, no diagnostics"
    },
    {
      "command": "npm test -- --reporter=basic",
      "result": "passed",
      "summary": "exit=0; Test Files 43 passed (43); Tests 857 passed (857) - 851 before plus the six new pins, none skipped"
    },
    {
      "command": "npm run build",
      "result": "passed",
      "summary": "exit=0; 'dist/ is a self-contained MV3 folder (10 files)'; find dist -type f | wc -l = 10"
    },
    {
      "command": "node scripts/check-agent-config.mjs",
      "result": "passed",
      "summary": "exit=0; 0 error(s), 0 warning(s), 104 info(s) - the +1 info is the checker's 'planned path not created yet' note for the spec mention of tests/content-editor-controller.spec.ts, which already fires five times elsewhere"
    },
    {
      "command": "npx vitest run tests/content-editor-controller.spec.ts (with the A107 branch neutralized, then reverted)",
      "result": "passed",
      "summary": "mutation check: 1 failed | 29 passed; the only failure is the discriminating case at :1021 expecting no refusal line and receiving 'Выделение пересекается с существующей записью'; source restored and re-verified green"
    },
    {
      "command": "git add docs/specs/content-overlay-ui.md src/content/overlay/editor-controller.tsx tests/content-editor-controller.spec.ts && git commit",
      "result": "passed",
      "summary": "commit 8f84a0b, 3 files changed, 283 insertions(+), 31 deletions(-); commit message cites A106 and A107"
    },
    {
      "command": "git status --porcelain",
      "result": "passed",
      "summary": "only docs/state/t5-03-tooltip-click-editor.md and docs/state/t5-04-focus-on-open.md, modified by the PM during this run; I never added, edited or committed them"
    }
  ],
  "validationOutput": [
    "npm run typecheck -> exit=0",
    "npm test -- --reporter=basic -> exit=0 | Test Files 43 passed (43) | Tests 857 passed (857)",
    "npm run build -> exit=0 | dist/ is a self-contained MV3 folder (10 files)",
    "node scripts/check-agent-config.mjs -> exit=0 | 0 error(s), 0 warning(s), 104 info(s)",
    "mutation (A107 branch disabled): FAIL tests/content-editor-controller.spec.ts > 'A107 is what separates the readings...' > AssertionError: expected 'Выделение пересекается с существующей…' to be null | Test Files 1 failed | Tests 1 failed | 29 passed",
    "git show --stat 8f84a0b -> docs/specs/content-overlay-ui.md | src/content/overlay/editor-controller.tsx | tests/content-editor-controller.spec.ts"
  ],
  "residualRisks": [
    "docs/state/improvement-backlog.md:157-163 still states A106 as 'a stale selection saves cleanly ... only a new selection ... asks the own-author overlap question', and names the code half 'keepBaseline'; after A107 the second clause needs 'appears or changes while the editor stands' and the shipped field is 'boundaries' + 'openSelection'. The A107 entry at :165 already amends the rule. PM-owned file, not edited by me.",
    "src/content/editor/edit-entry.ts:22-23 still words the rule as 'a re-selection made while the editor is open' (comment only; the module contract is unchanged). That path is forbidden by the t5-04 brief, so it needs a carried-fix number rather than an edit.",
    "No chrome://extensions verification in this run: A106/A107 are pinned at jsdom level through the injected readSelection seam. A real browser may collapse the page selection on the tooltip press, which answers 'no re-selection' by the null path instead of the open-moment path - same outcome, so the manual pass should still check it.",
    "One extra document.getSelection() read per editor open (no DOM walk, no resolve, no storage read); no rule forbids it.",
    "Reviewer's non-blocking remarks of t5-03 (four dead pointers, stale AC numbers in comments and in five test names of this file) are untouched by this brief and are already numbered into docs/state/t5-04-focus-on-open.md."
  ],
  "noStagedFiles": true,
  "diffSummary": "Spec: the re-selection Terms row (content-overlay-ui.md:19) and the editor-range bullet (:95) now state the two boundary states the open moment keeps - the PaintedEntry's painted span (A106) and the page selection the click found (A107) - with the A45 self-exclusion, A100 author filter and A78 halves kept verbatim, and a new Edge Cases row at :170 names the case after both rulings. Code (editor-controller.tsx only, authorized by A107): the open moment records the page selection it finds as boundary points, and a selection still standing there at the press answers 'no re-selection'; the painted-span equality of A106 stays as the second such answer; only a selection that appears or changes while the editor stands reaches the per-author overlap check. Tests: six cases pin every state of the rule, one of them named as the case that separates the two readings.",
  "reviewFindings": [
    "no blockers: the spec-vs-code contradiction that blocked t5-03 is closed in one commit (8f84a0b) in the direction ruling A106/A107 fixed, with a pin that fails under the rejected reading",
    "note for the reviewer: docs/state/t5-03-tooltip-click-editor.md and docs/state/t5-04-focus-on-open.md are modified in the working tree by the PM and were deliberately excluded from my commit",
    "note for the reviewer: docs/state/improvement-backlog.md still carries the pre-A107 wording of A106 (:157-163) and a code name the module does not use; that needs a PM edit, not a code or spec edit"
  ],
  "manualNotes": "The brief's 'do not touch src/' and its 'a stale selection saves cleanly' could not both hold, and the only state where the two baseline readings differ in stored bytes was unpinned in either direction. I asked before writing, the PM answered with ruling A107 (exempt a selection already present at the open moment; a re-selection is one that appears or changes while the editor stands) and authorized the narrowed src/content/overlay/editor-controller.tsx change. All three of the reply's extra items are done: pin (a) kept, pin (c) flipped to 'save lands' and named as the separator, pin (d) added in both halves, Edge Cases row added. Gates green individually, committed at green, nothing else staged."
}
```
