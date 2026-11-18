# Engineer report — t5-02 author colours (six-slot `author palette`)

Task: `t5-02-author-colors`, attempt 1. Shape `A102` implemented as briefed, not redesigned:
exactly 6 palette slots, slot = `fnv1a32(authorName) % 6` over the hash core already ships,
one `::highlight()` rule per painted entry unchanged, declarations vary by author slot, no
extra marker for own notes, colour collisions accepted and stated.

## Commits

| commit | content |
| --- | --- |
| `c43f64d` | `docs(specs)`: AC0 — `paint slot` + `author palette` terms, the "Author colour and `paint slot`" rule, AC25 in `docs/specs/content-overlay-ui.md` |
| `31f2a2f` | `feat(t5-02)`: palette module + plan + style + page painter + the four paint test suites (+ the verbatim-stored-name clause of the same spec bullet) |

`git status --porcelain` after the second commit: empty. Nothing staged, nothing untracked.

## Gate statuses (`A101`: `echo "exit=$?"` typed on the line right after each command, never after a pipe)

```
npm run build;                       echo "exit=$?"   -> build exit=0
npm test -- --reporter=basic;        echo "exit=$?"   -> test exit=0
node scripts/check-agent-config.mjs; echo "exit=$?"   -> checker exit=0
npm run typecheck;                   echo "exit=$?"   -> typecheck exit=0
```

Tails (final run over the committed state):

```
[build] dist/ is a self-contained MV3 folder (10 files)

 Test Files  42 passed (42)
      Tests  833 passed (833)          # was 807 before this task: +26

0 error(s), 0 warning(s), 101 info(s)  # was 0/0/100; see note on the extra info
```

The extra `INFO` is the checker's existing "planned path not created yet" class (it resolves spec
paths relative to `docs/specs/`, so `src/core/slot-key.ts`, `src/content/text.ts` and eleven others
are already reported the same way). My spec bullet mentions `src/core/slot-key.ts` in prose, which
adds one such info. No error, no warning.

## Changed files (9; exactly the briefed boundaries)

```
docs/specs/content-overlay-ui.md
src/content/paint/paint-palette.ts   (new, 138 lines)
src/content/paint/paint-plan.ts
src/content/paint/paint-style.ts
src/content/paint/page-painter.ts
tests/content-paint-palette.spec.ts  (new, 12 cases)
tests/content-paint-plan.spec.ts     (+6 cases)
tests/content-paint-style.spec.ts    (rewritten for the new signature, +3 cases)
tests/content-page-painter.spec.ts   (+5 cases)
```

`git diff --name-only 662a875..HEAD -- src/core src/manifest.json src/content/text.ts src/popup src/options`
→ **0 files**. `src/core/` was imported, never edited (`import { fnv1a32 } from '../../core/slot-key'`
at `src/content/paint/paint-palette.ts:52`). `src/content/create/`, `src/content/editor/`,
`src/content/overlay/`, the task state file, dependencies and harness files: untouched.

## What the palette is

`src/content/paint/paint-palette.ts` — `PaintSlot` (`:63`), `PAINT_SLOTS` (`:73`),
`PAINT_PALETTE_SIZE = PAINT_SLOTS.length` (`:76`), `PAINT_PALETTE` (`:88`),
`paintSlotOf` = `PAINT_SLOTS[fnv1a32(authorName) % PAINT_PALETTE_SIZE]` (`:131`),
`paintDeclarationsOfSlot` (`:136`). "Exactly six" is a compile-time fact: the table is
`Record<PaintSlot, readonly string[]>`, so a missing slot is a type error and a seventh is an excess property.

| slot | background | underline (2nd property, same two properties in every slot) |
| --- | --- | --- |
| 0 | `rgba(122, 162, 247, 0.26)` — the shipped blue, verbatim | `rgba(31, 111, 235, 0.7)` |
| 1 | `rgba(247, 208, 122, 0.26)` | `rgba(176, 132, 24, 0.7)` |
| 2 | `rgba(140, 209, 148, 0.26)` | `rgba(35, 134, 74, 0.7)` |
| 3 | `rgba(247, 158, 181, 0.26)` | `rgba(199, 61, 110, 0.7)` |
| 4 | `rgba(192, 172, 245, 0.26)` | `rgba(106, 76, 196, 0.7)` |
| 5 | `rgba(133, 213, 216, 0.26)` | `rgba(23, 126, 136, 0.7)` |

Literal slot values pinned by tests: `'reader'→0`, `'reader-four'→1`, `'ann'→2`,
`'reader-one'→3`, `'Я'→4`, `'Вася'→5`; accepted collision `'reader-one'`/`'reader-two'` → both 3.

Wiring: `paint-plan.ts:99` carries `readonly paintSlot: PaintSlot` on `PaintedEntry`, filled at
`:184` from `entry.authorName`; `paint-style.ts:62,66` `PaintStyleRule {name, slot}`, rule text at
`:86`, per-entry writer at `:97`; `page-painter.ts:347` builds one pair per painted entry in plan
order and `:361` syncs them. The old exported `PAINT_DECLARATIONS` constant is gone;
`grep -rn PAINT_DECLARATIONS src tests docs` → 0 hits.

## AC self-check, one line per AC number (path:line)

1. Same author → same slot → same declarations: `tests/content-paint-plan.spec.ts:263`,
   `tests/content-page-painter.spec.ts:677`, `tests/content-paint-style.spec.ts:97`.
2. Different authors → slots of their own names; collision pinned as possible and harmless:
   `tests/content-paint-palette.spec.ts:156` (pair shares slot 3 and the declarations),
   `:167` (seven ordinary names saturate six slots, so the collision is reachable),
   `:175` (different slots stay apart), `tests/content-paint-plan.spec.ts:277`,
   `tests/content-page-painter.spec.ts:722`.
3. Pure function, pinned with literal slots: `tests/content-paint-palette.spec.ts:112`
   (`'reader'→0 … 'Вася'→5`), `:122` (equals `fnv1a32(name) % 6`, the shipped core hash),
   `:131` (50 repeats, a second name never moves a first), `:142` (empty, whitespace, astral,
   lone surrogate, 4000 chars all land inside the palette).
4. Exactly six slots, slot 0 verbatim: `src/content/paint/paint-palette.ts:73,76,88`;
   `tests/content-paint-palette.spec.ts:69` (size 6, slots `[0..5]`, table has 6 keys) and
   `:78` (both slot-0 declarations asserted as literals), `:98` (six distinct backgrounds).
5. One rule per painted entry, names still `inlinenotes-<entryId>`, count does not grow with the
   palette: `src/content/paint/paint-style.ts:86,97`, `src/content/paint/page-painter.ts:347`;
   `tests/content-paint-style.spec.ts:82` and `:119` (six entries of six slots → 6 rules, twelve
   entries → 12 rules, six shared bodies), `tests/content-page-painter.spec.ts:636` (six authors on
   one page → 6 rules named per entry, and the slot-0 author still carries the verbatim blue).
6. Hidden and stale entries still paint nothing, pins green: existing
   `tests/content-paint-plan.spec.ts:357,369`, `tests/content-page-painter.spec.ts:272,347` pass
   unchanged; new `tests/content-paint-plan.spec.ts:343` asserts a skipped entry gains no slot
   field (its record is still `entryId` + `reason`).
7. Teardown removes only `inlinenotes-`-prefixed names and resets the sheet the same way: existing
   `tests/content-page-painter.spec.ts:365,379` pass unchanged; new
   `tests/content-page-painter.spec.ts:748` shows a repaint keeping the stayed entry's slot colour,
   dropping the gone entry's rule, and `clearPaint()` leaving `[]` rules.
8. Overlapping ranges of different authors are both registered, no rejection at paint time:
   `tests/content-page-painter.spec.ts:694` (same words, two authors → both names in
   `CSS.highlights`, one fragment each, two rules, different bodies, `outcome.skipped == []`).
   The `overlap` rule of `t5-01` was not opened: no file under `src/core/` is in the diff.
9. No new Russian UI string; `src/content/text.ts`, popup, options untouched: file list above;
   scanning the added diff lines for Cyrillic yields 9 hits, all of them test fixtures
   (`'Я'`, `'Вася'` as inputs to `paintSlotOf`) — zero Cyrillic in any shipped file
   (`grep -n "[а-яА-Я]" src/content/paint/paint-palette.ts` matches only em-dash/ellipsis bytes).

## Mutation checks (the new pins are live, not tautological)

1. `paintSlotOf` modulus 6 → 5 (`paint-palette.ts:132`):
   `Test Files 4 failed (4)` — palette 6 failed, plan 4, style 2, page-painter 3 (15 tests).
2. Slot 0 background alpha `0.26` → `0.36`:
   `Tests 2 failed | 48 passed (50)` — the palette literal pin and the page-level slot-0 pin, with
   `expected '::highlight(inlinenotes-a1b2c3d4e5f6)…' to contain 'background-color: rgba(122, 162, 247,…'`.
   Reverted with `git checkout --`; `diff` modulo CRLF against the pre-mutation copy: identical;
   the four paint suites then re-ran `Tests 69 passed (69)`, `git status --porcelain` empty.

## Deviations and notes for the PM

- **No deviation from `A102` or from the AC list.** No new dependency, no `fetch`/XHR/WebSocket
  (`grep -rn "fetch|XMLHttpRequest|WebSocket|host_permissions" src/content/paint/` → 0 hits), no
  per-author highlight name, no per-author paint registry, no page DOM element, no colour-based
  ownership logic, no core edit, no overlap-rule edit.
- **One spec clause added in the second commit** (`docs/specs/content-overlay-ui.md:67`): the stored
  name is hashed **verbatim**, so a hand-written record whose name differs by a space can wear a
  different colour while core `isSameAuthor` (`A99`) calls those records one author. This is a
  consequence of the briefed shape and it is observable, so it is stated in the spec and pinned at
  `tests/content-paint-plan.spec.ts:305` (`'reader-one'→3`, `'reader-one '→5`); it is not reachable
  through the create path, which stores a trimmed name. Flagging it rather than burying it: the PM
  may prefer to fold the trim into the mapping, which would be a shape change and is not my call.
- **The five non-zero colour values are mine** (`A102` fixed only slot 0 verbatim and asked for
  "five more distinguishable pastel backgrounds"). They use one shared alpha pair
  (0.26 fill / 0.7 underline) so no author reads as bolder than another. Since the user owns colour
  values, the PM may want to put the five rgba pairs in front of the user. Only slot 0 is asserted
  as a literal (`tests/content-paint-palette.spec.ts:78`,
  `tests/content-page-painter.spec.ts:636`); slots 1-5 are asserted as a **pattern** plus
  distinctness (`tests/content-paint-palette.spec.ts:87,98`), so a user override of those five
  values needs **no test edit** — the mapping, the slot count, the two-property set and the rule
  shape are what the tests hold fixed.
- **Browser check not performed.** `npm run build` produced a loadable `dist/` (10 files), but no
  `chrome://extensions` load was done in this task, so two things are unverified by execution: the
  visual distinguishability of the six hues on a real page, and the blend produced when two
  authors' ranges overlap (the spec accepts the Highlight API's blend, and `A94` accepts it as is).
  Both belong to the final browser check the backlog schedules at the end of Stage 5/6.
