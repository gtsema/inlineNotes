# Task `t5-03-tooltip-click-editor` — the tooltip becomes the way in, re-selecting your own note stops being one

Stage 5, task 3. Owner: `extension-engineer`. Rulings: `A96` (the user's answer) plus the shape rulings **`A103`** and **`A104`**
below. Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` (AC3, Flow 4, Flow 5, Flow 6).

## Goal

Three observable changes, one surface:

1. The hover tooltip is **opaque from the first hover** — the click no longer exists to make it opaque.
2. **Clicking the tooltip opens the editor** of that note (own notes only).
3. **Selecting text inside one's own highlighted note opens nothing.** Flow 6 and the `claimSelection` handover were the only way
   the editor used to open from a selection; they are retired, code and pins together.

## Shape the PM chose (`A103`, `A104` — do not redesign)

- `A103` (**when a selection opens nothing**): a selection whose range is **wholly inside the resolved range of one of my own
  entries** opens no widget at all. Every other selection behaves exactly as before and opens the create card — including a
  selection inside a **foreign** note (creating there is legal since `A93`) and a selection that only **partially** covers my own
  note; in the partial case the save is refused with «Выделение пересекается с существующей записью» by the own-author overlap
  rule shipped in `t5-01`. So the only new silence is the strictly-contained own case.
- `A104` (**how the editor opens without a selection**): the tooltip click opens the editor over the entry's **own resolved range
  from the paint pass** — no selection is required, no re-derivation happens. `A78` is untouched: saving writes `comment` and
  `updatedAt` only and moves no stored range. The re-selection overlap check keeps running with the edited entry self-excluded
  (`A45`, `A100`) and simply has nothing to collide with; do not delete it.
- A **foreign** tooltip click does nothing (edit rights, `inline-comment-model.md` → "Edit rights"): the tooltip stays, no
  editor, no message.
- The tooltip stays clickable because `src/content/overlay/tooltip-style.ts:65` already carries `pointer-events: auto` while the
  host keeps `pointer-events: none`. Do not change either value.
- Delete what dies with Flow 6: `claimSelection` and any branch that exists only for the selection handover, plus the `t3-03`
  attempt-2 pin of that handover. Dead code kept "just in case" is a finding, not caution.

## Acceptance criteria (observable)

1. Hovering a highlight shows the tooltip **fully opaque immediately**; the old two-state (translucent → opaque) behavior is gone
   and its pin is rewritten to the single state.
2. Clicking the tooltip of an **own** entry opens the in-place editor for that entry: prefilled with the stored comment, controls
   `Сохранить` / `Отмена` / `Удалить`, anchored on the entry's own resolved range (`A104`).
3. Clicking the tooltip of a **foreign** entry changes nothing on the page — no editor, no card, no message, the tooltip remains.
4. A selection **wholly inside** my own note opens nothing (`A103`).
5. A selection **wholly inside a foreign** note opens the create card.
6. A selection that **partially** covers my own note opens the create card, and saving it is refused with the overlap string
   (own-author rule, `t5-01`).
7. `claimSelection` no longer exists anywhere in `src/` (grep evidence in the report) and no test mentions it.
8. The tooltip still hides on page scroll and on a `pointerdown` outside the host; the host keeps `pointer-events: none`, the
   tooltip keeps `pointer-events: auto`.
9. Editor behavior is otherwise unchanged: `A78` (comment + `updatedAt` only), delete removes that one note, `A39` teardown stays.

## Boundaries

- Allowed: `src/content/overlay/**`, `src/content/main.ts`, `src/content/editor/**` **only** for opening the editor without a
  selection (name every file you touch in the report), `tests/`, `docs/specs/content-overlay-ui.md`.
- Forbidden: anything under `src/core/`, `src/content/paint/**` (the palette just shipped in `t5-02`), `src/popup/`,
  `src/options/`, `src/manifest.json`, dependencies, harness files, and the other PM-owned specs (`A76`, `A89`) — **except** the
  comment-only files named in the Carried-fix checklist below.
- Do not touch the task state file `docs/state/t5-03-tooltip-click-editor.md`; write your report to your own artifact.

## Carried-fix checklist (`A72` — all three are **comment-only**, no behavior, no string)

1. `src/content/paint/paint-palette.ts:49-50` sends the reader to "the header of `paint-style.ts`" for why the frame is an
   underline and not an outline, but `t5-02` moved that rationale into `paint-palette.ts:47-51` and it is no longer in
   `paint-style.ts`. Either restore one sentence in the `paint-style.ts` header or drop the pointer. Report `done` + `path:line`.
2. `src/core/slot-key.ts:115` still says `fnv1a32` is "used only to disambiguate truncated slot keys" — `A102` made that false
   (`paint-palette.ts:54` imports it for colour). One comment sentence, **no code, no signature, no rule change**.
**Boundary exception (`A90` naming rule):** for these carried items only, you may change **comment text** in
`src/content/paint/paint-palette.ts`, `src/content/paint/paint-style.ts` and `src/core/slot-key.ts`. No shipped string, no code,
no signature, no rule. Cite the carried number in the commit message. Standing instruction for this task: grep every cross-file
comment pointer before committing — this is the third dead-pointer finding of the same class after `t4-03` and `t5-01`.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec first (AC3 and Flow 4 rewritten; **Flow 6 deleted**, not marked historical — the history lives in `docs/state/`), commit
   at green.
2. Then the behavior + tests, commit at green. If the deletion of Flow 6 makes a suite empty rather than obsolete, delete the
   suite and say so.
3. Every gate with its own exit status, `echo "exit=$?"` on the line right after the command (never after a pipe).
4. Report: commit hashes, four exit statuses, AC 1–9 one line each with `path:line`, and the grep line proving `claimSelection`
   is gone.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: **3** — attempt 1 (timeout, not an attempt, resumed in-session),
reviewer, attempt 2 (`A106` spec + pin). One re-review remains in budget.

## Attempts log

- **attempt 1: wall-clock timeout at 60 minutes, nothing committed** — not an attempt (`A80`). PM measured the abandoned tree
  (11 modified files, `painted-selection.ts` deleted, `contained-own-selection.ts` new, typecheck exit 2 with 17 errors in six
  suites, tests 779 passed / 43 failed) and resumed **the same session** with three commit-per-green checkpoints, explicitly
  allowing a partial committed delivery.
- **attempt 1 resumed delivered 4 commits**: `0f19bec` (behavior), `b064301` (pins), `31977fe` (carried comments), `b6643b1`
  (branch pins). PM-measured gates: build exit 0 (10 files), `npm test` exit 0 → **851 / 43 files**, checker exit 0 → 0/0/103,
  typecheck exit 0, tree clean. `claimSelection` and `painted-selection.ts` are gone from `src/`, `tests/` and the spec.
- **review verdict: `blocked`** (`docs/state/t5-03-review.md`) — all nine AC pass, but the tree carries a spec-vs-code
  contradiction: the two `re-selection` sentences describe a page-selection baseline while the code keeps the painted entry's
  boundary points. The engineer had asked exactly this as open question 1 and the brief did not answer it — a brief fault, on
  record here. The reviewer also judged all 12 removed test cases (all legitimate, each question re-pinned elsewhere) and listed
  four further comment-pointer defects (its items 3–6).
- **attempt 2 opened** under ruling `A106` (the baseline is the `PaintedEntry`, never the page selection): rewrite the two spec
  sentences and pin the observable case by ruling name; no `src/` change.
