# t5-03 engineer report — the tooltip is the way into the editor

Task: `t5-03` (second attempt, continued in the same session). Spec:
`docs/specs/content-overlay-ui.md`, acceptance criteria AC1–AC9.

## Commits

| checkpoint | commit | content |
| --- | --- | --- |
| CP1 | `0f19bec` | the shipped behaviour slice: tooltip opacity `1.0`, tooltip click → Flow 4, the `contained own selection` module, deletion of the selection-claim module, the spec rewrite, and every test repair needed to make the tree green |
| CP2 | `b064301` | pins for the ACs that had none: `A103` through a real `paint pass`, the Flow 4 end-to-end pair, the tooltip `pointer-events` half of AC8 |
| CP3 | `31977fe` | carried comment fixes 1 and 2, plus the dead-pointer sweep result |
| CP4 | `b6643b1` | branch-by-branch pins for `contained-own-selection.ts` and the spec sentence naming both pins |

Baseline before CP1: 42 files / 837 declared cases (the brief measured 833 in `0db045e`).
Now: 43 files / 851 declared cases. Delta against `0db045e`: 12 removed, 30 added.

## Gates (each its own exit status, CP4 tree)

```
npm run typecheck                          exit=0
npm test -- --reporter=basic               exit=0   Test Files 43 passed (43)
                                                    Tests 851 passed (851)
npm run build                              exit=0   dist/ is a self-contained MV3 folder (10 files)
node scripts/check-agent-config.mjs        exit=0   0 error(s), 0 warning(s), 103 info(s)
```

CP1 and CP2 were committed after their own green runs of typecheck + test (837 and 842
passed); CP3 re-ran all four gates green; CP4 re-ran typecheck + test + the checker green,
and the build output is unchanged in content (no shipped source changed after CP3).

## Acceptance criteria, one line each with its pin

| AC | criterion | pin |
| --- | --- | --- |
| AC1 | the tooltip is opaque from the first hover, and no click changes any opacity (`A96`) | `tests/content-tooltip.spec.ts:389` (`TOOLTIP_OPACITY === 1`, exactly one `opacity` declaration in `TOOLTIP_CSS`, and no class chosen at any point of the open/close sequence) |
| AC2 | a click on the tooltip of one's own entry opens the editor over that entry's own range, prefilled, without a selection (`A104`) | end to end `tests/content-tooltip.spec.ts:525` (real editor controller over the same host: textarea prefilled, editor placed against the entry's first measured fragment, tooltip dismissed, host still visible); opening hook `tests/content-cross-tab-refresh.spec.ts:466`; the shape `tests/content-editor-controller.spec.ts:447`, `:480` (no page selection at all, save keeps `text`+`anchor`, changes `comment`+`updatedAt`, closes), `tests/content-tooltip.spec.ts:472` (the click answers with the pass's own object) |
| AC3 | a click on the tooltip of a foreign entry does nothing | `tests/content-tooltip.spec.ts:552` (no widget element, no input element, no storage write, tooltip still mounted), `:411` (the controller itself writes nothing and repaints nothing), `tests/content-editor-controller.spec.ts:505`; the click also opens no editor for a selection-shaped entry the pass does not hold — `tests/content-editor-controller.spec.ts:563` |
| AC4 | a selection wholly inside one's own painted entry opens nothing at all (`A103`) | `tests/content-create-card-controller.spec.ts:709` (card closed, host still `hidden`, no span measured, no write call, the stored entry byte-identical), `tests/content-cross-tab-refresh.spec.ts:466` (the same note is a `contained own selection` for its author and not for another), and the containment branches in `tests/content-contained-own-selection.spec.ts:128`, `:155`, `:175`, `:181`, `:208` |
| AC5 | a selection wholly inside a foreign entry opens the create card (`A93`) | `tests/content-create-card-controller.spec.ts:736`, `tests/content-contained-own-selection.spec.ts:191`, `:202` |
| AC6 | a selection that only crosses one boundary of one's own entry opens the card, and the write refuses it (`A100`) | `tests/content-create-card-controller.spec.ts:758` (card opens, `Сохранить` answers `REFUSAL_TEXT.overlap`, no entry is created, the old entry is byte-identical), `tests/content-contained-own-selection.spec.ts:141`, `:166` |
| AC7 | `claimSelection` is gone from shipped code | `grep -rn "claimSelection\|painted-selection\|entryOwningSelection" src tests` → one hit, a comment in `src/content/paint/paint-plan.ts:105`; `grep -rn "claimSelection" src` → no match. `src/content/editor/painted-selection.ts` is deleted and no shipped module imports it (`npm run typecheck` exit 0 proves it) |
| AC8 | `Esc`, outside `pointerdown`, scroll and the overlay host's `pointer-events: none` are unchanged | `tests/content-tooltip.spec.ts:778` (outside `pointerdown` dismisses, a `pointerdown` on the tooltip does not), `:812` (scroll and `Escape`), `:399`–`:400` (exactly one `pointer-events` declaration in `TOOLTIP_CSS`, value `auto`), and the host half unchanged in `tests/content-overlay-host.spec.ts:57` |
| AC9 | the editor's other behaviour is unchanged: caps, save, delete, cancel, `A39` teardown | untouched pins still green: `tests/content-editor-controller.spec.ts:589`, `:661`, and the rest of that file; the `A39` teardown stays pinned in `tests/content-page-painter.spec.ts` and `tests/content-paint-palette.spec.ts`; the `t5-02` palette pins are green unchanged |

## Every deleted test case, and why

`git diff 0db045e..HEAD -- tests` read by test name (42 → 43 files, 833 → 851 declared
cases). 12 names disappeared. Each one pinned an API or a state that this task retires.

| deleted case | reason |
| --- | --- |
| `content-create-card-controller.spec.ts :: mounts no card, captures no span and asks core for nothing when the claim answers true (Flow 6, AC1)` | pinned the card's consultation of the deleted selection-claim module; AC7 retires that handover. Its silence half is replaced by `tests/content-create-card-controller.spec.ts:709` |
| `content-create-card-controller.spec.ts :: opens the card normally when the claim answers false (Flow 6, AC1)` | same module; the "card opens normally" half now has no claim to consult — AC5's pin at `:736` covers the same observable state |
| `content-cross-tab-refresh.spec.ts :: opens the editor of an entry that became the reader's own on the next selection` | the next **selection** is no longer the way in. Rewritten, not dropped: `tests/content-cross-tab-refresh.spec.ts:466` drives the same repaint-then-open story through the tooltip click |
| `content-cross-tab-refresh.spec.ts :: claims the entry as the repaint left it, not as the load found it` | "claims" was the retired verb. Rewritten as `tests/content-cross-tab-refresh.spec.ts:574`: the tooltip answers with the pass's own object after a settings-triggered repaint |
| `content-editor-controller.spec.ts :: opens nothing and claims the selection for a foreign entry (AC1, AC4, A25)` | the claim return value is deleted by AC7; the surviving half — a foreign entry opens nothing — is pinned twice over (`tests/content-editor-controller.spec.ts:505`, `tests/content-tooltip.spec.ts:552`) |
| `content-editor-controller.spec.ts :: does not claim a selection that only crosses the entry boundary` | boundary-crossing is now answered at the card (`tests/content-create-card-controller.spec.ts:758`) and in the pure rule (`tests/content-contained-own-selection.spec.ts:141`) |
| `content-editor-controller.spec.ts :: claims nothing for a collapsed caret or for a stale entry` | both halves moved: the collapsed caret is answered by the pure rule (`tests/content-contained-own-selection.spec.ts:175`), the stale entry by `tests/content-editor-controller.spec.ts:563` |
| `content-editor-controller.spec.ts :: answers the claim from the paint pass, not from a second resolve` | the question it asked is still real, but it belongs to the click now: `tests/content-cross-tab-refresh.spec.ts:574` and `tests/content-tooltip.spec.ts:472` |
| `content-editor-controller.spec.ts :: opens no editor when the entry cannot be measured, and still claims the selection` | the unmeasurable half survives as `tests/content-editor-controller.spec.ts:748`; the "still claims" half is retired by AC7 |
| `content-tooltip.spec.ts :: is semi-transparent on hover and opaque after a click, by the spec numbers` | the two-state opacity `A96` deletes, together with the class it added. Replaced by `tests/content-tooltip.spec.ts:389` |
| `content-tooltip.spec.ts :: makes the click opaque and nothing else: no editor, no write, no repaint` | "no editor" is exactly what AC2 reverses. Replaced by `:411` (no write, no repaint of its own) plus the Flow 4 pair at `:525`, `:552` |
| `content-tooltip.spec.ts :: shows, pins and dismisses through browser events` | "pins" was the click's old opacity state. Rewritten as `:778`: shows, asks the Flow 4 hook, dismisses |

No other deletion: no assertion inside a surviving case was dropped to make a gate pass.
The five test files CP1 touched mechanically (`content-card-events`, `content-page-painter`,
`content-save-throw-safety`, plus the two above) gained the `paintedEntries` option the card
now requires; `tests/content-page-painter.spec.ts:347` moved its create selection off the
own note's words, because AC4 now suppresses the card there — that selection change is the
spec's rule, not a loosened assertion.

## Pins added (30)

- `tests/content-contained-own-selection.spec.ts` — new file, 9 cases: the containment rule
  as a pure question (inclusive boundary offsets, a boundary point in a node the entry does
  not paint, three fragments of one entry, two boundary points in two different entries, a
  collapsed caret, paint order), the author half (`A93`, `A99`, `A100`), the
  `authorName === null` half, and the absence of hidden / stale / unmeasurable entries
  (`A40`, `A24`, `A66`).
- `tests/content-create-card-controller.spec.ts:708` — the `A103` triple (AC4, AC5, AC6),
  each against a **real** `paint pass` over the fixture's own port: `paint()` runs
  `createPagePainter` and hands its output to the card, so the answer comes from the page as
  painted, not from a hand-written list.
- `tests/content-tooltip.spec.ts` — the click-answer group (own / pass identity / foreign /
  nothing open / hidden and stale filtered out), the Flow 4 end-to-end pair against a real
  `EditorController` in the same host (AC2, AC3), and the `pointer-events` half of AC8.
- `tests/content-editor-controller.spec.ts` — AC1 group gains the `A104` opening with no
  selection at all (and proves the save keeps `text` and `anchor`, moves `comment` and
  `updatedAt`, and closes), the no-create-card cardinality of a foreign click, the
  "not openable through a selection at all" shape audit of the controller surface, and the
  entry-the-pass-does-not-hold case.

## Carried-fix checklist

1. **done** — `src/content/paint/paint-palette.ts:47-51`: the dead pointer to the header of
   `paint-style.ts` is dropped; the sentence now points at the `highlight frame` row of
   `docs/specs/content-overlay-ui.md` → Rules / Semantics → "Highlight painting", which is
   the rule that actually fixes the two per-slot properties. Comment-only.
2. **done** — `src/core/slot-key.ts:113-120`: `fnv1a32` no longer claims one consumer; the
   comment names both (the truncated-slot-key length rule and the `A102` author half of the
   `paint slot` mapping in `paint-palette.ts`) and warns that the arithmetic is pinned by a
   reader's colour. Comment-only. Verified mechanically: every changed line in both files is
   a comment line.

## Dead-pointer sweep (the t4-03 / t5-01 / t5-02 class)

A script walked every comment under `src/` and `tests/` (102 files) and checked every
`` `path/file.ext` `` reference for existence after the deletion of
`src/content/editor/painted-selection.ts`. Result: **one** miss.

- `src/content/paint/paint-plan.ts:104-105` still names the deleted
  `editor/painted-selection.ts` and calls it "the Flow 6 selection claim". Not edited:
  `src/content/paint/**` is a forbidden path for this task and this file is not in the
  Carried-fix checklist exception. **Action for the PM**: one comment sentence, best
  attached to a later `paint` task or a named exception.

Sweep of `docs/specs/content-overlay-ui.md` for retired wording: no `Flow 6`,
`claimSelection`, `painted-selection`, `entryOwningSelection`, `is-pinned`, "second click",
"two-step", or semi-translucent phrasing survives anywhere in the file. The one surviving
`Flow 6` string in the repository is the code comment above. A stale flow number in
`tests/content-create-card-boundaries.spec.ts:9` was renumbered to the current list
(Flow 1-2 create, Flow 4-5 editor, Flow 7 paint pass) in CP3.

## Deviations from the brief (all reported, none silent)

1. **CP1 committed the spec edit too.** The brief listed CP1 as tests-only, but
   `docs/specs/content-overlay-ui.md` was already rewritten in the uncommitted tree and
   AGENTS.md requires a behavior change and its spec line in the same commit. Splitting them
   would have left a commit whose tests contradict the spec at HEAD.
2. **A fourth checkpoint (CP4)** beyond the three briefed: 9 unit pins for the new pure rule
   and one spec sentence naming both pins. Additive only; nothing was re-opened.
3. **Two retired names were rewritten rather than deleted** in
   `tests/content-cross-tab-refresh.spec.ts`, because the story they pin (a settings repaint
   changing ownership) is still shipped; only the verb was.
4. **Fixture wiring that mirrors `main.ts`.** The tooltip fixture now reads
   `isHostBusy = hostBusy || editor.isOpen()` and its `onEntryClick` calls
   `editor.openFromPaintedEntry(entry, painter.authorNameOfPass())` - the same handover
   `src/content/main.ts` ships. Without it the AC2 end-to-end pin could not exist, and the
   mismatch is exactly what the pin now guards.
5. **No new dependency, no permission change, no network call.** `git diff 0db045e..HEAD`
   touches no `package.json`, no `src/manifest.json`, no `src/popup/**`, no `src/options/**`,
   and no harness file except the two comment-only carried fixes.

## Open questions for the PM (nothing invented, nothing resolved silently)

1. **Spec-vs-code conflict in the re-selection baseline - needs a ruling, not a guess.**
   `docs/specs/content-overlay-ui.md` line 19 (Terms, `re-selection`) and line 95 (Rules,
   "Editor lifetime") - both written in attempt 1 - say the editor keeps "the page selection
   the page happened to hold at the `tooltip` click", and that a page holding none has no
   baseline. The shipped code keeps a different baseline: the boundary points of the entry
   the click opened, taken from the `paint pass` (`src/content/overlay/editor-controller.tsx`,
   `keepBaseline`). The two readings disagree in one observable case: a page that already
   holds a stale selection of other words when the tooltip is clicked, and then gets a new
   selection before `Сохранить`. The code asks the overlap question (it can refuse the save
   with `Выделение пересекается с существующей записью`); the spec sentence says the stale
   selection "is not" a re-selection, which would save cleanly. The code is what AC9
   ("the editor behaviour is otherwise unchanged") and `A104` imply, so I left the code and
   did not rewrite the two sentences. Either the code moves or the two sentences move; both
   edits are one line, but they are a decision.
2. **`src/content/paint/paint-plan.ts:104-105` dead pointer** (above): forbidden path for
   this task, so it is reported rather than fixed.
3. **Runtime list not walked in a browser.** The gates are the four commands; no
   `chrome://extensions` load of `dist/` was performed in this session, so AC1-AC9 are
   pinned by tests and by the build, not by a manual observation.
