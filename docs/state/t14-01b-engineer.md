# t14-01b — engineer report (attempt 2, docs-and-comment only)

**Commit:** `c0eae45` — `docs(spec): the popup's one inline glyph is stated where A143 made it true`
**Slice:** two files, `4 insertions(+), 4 deletions(-)`. No behaviour, no style, no test change.
**Inputs:** brief in the task message; `docs/state/t14-01-review.md` (run `426e2c29-d416-495f-a8e4-035b7d31ee7b`, verdict `changes requested`, one blocking finding); `docs/specs/content-overlay-ui.md`; `src/popup/popup.component.ts`.

## What the blocking finding was

Two spec sentences still said the popup's buttons keep their words and that neither
extension surface gained an inline glyph. `A143` / task `t14-01` made both false **on
purpose, for `src/popup/` only**:

- `docs/specs/content-overlay-ui.md:154` — the `t7-01` card bullet, closing clause.
- `docs/specs/content-overlay-ui.md:298` — **AC 27**, the same claim as an acceptance criterion.

Both were corrected to the shipped state. `src/options/` is left as the untouched surface,
in the words the brief fixed; `src/popup/` now names the one later exception and cites
`A143` / `t14-01`. Nothing that `t7-01` did was rewritten: the `t7-01` scope is still stated
as `t7-01`'s own (`src/popup/` was untouched **by `t7-01`**).

## Changed paths

| Path | Lines | Change |
|---|---|---|
| `docs/specs/content-overlay-ui.md` | 154 | closing clause of the `t7-01` card bullet split: `src/options/` untouched (no glyph, no shared glyph class, buttons keep their words); `src/popup/` untouched by `t7-01`, with the later `A143` / `t14-01` exception named and a pointer to the "Popup look" bullet |
| `docs/specs/content-overlay-ui.md` | 298 | **AC 27** corrected the same way, plus the exception's own facts: `A143` / `t14-01` gives a row's delete control an inline glyph of its own, `Удалить` still ships as that control's `aria-label` and `title`, the checkbox and the notices keep their words, and the glyph class is **unshared** across the layer boundary (popup re-declares its own drawing, ledger row `S14-4`) |
| `src/popup/popup.component.ts` | 288–291 | `deleteIconPx` doc comment: the inverted sentence now says what the constants say — the glyph is `16` (`POPUP_DELETE_ICON_PX`) and the hit box is `24` (`POPUP_DELETE_HIT_BOX_PX`) |

## The wider sweep the brief asked for

The brief required checking every other sentence in `docs/specs/content-overlay-ui.md` that
claims the popup has no icon-only control, no inline glyph, or that its buttons all print
their words. I grepped the file for `keep their words`, `inline glyph`, `glyph class`,
`icon-only`, `glyph`, `no icon`, `no popup control is added`, and read every hit in context.
Findings, one line each:

| Line | Sentence | Verdict |
|---|---|---|
| 154 | `… their buttons keep their words.` | **false — fixed** (blocking finding) |
| 298 | `… and neither surface gained an inline glyph or the shared glyph class.` | **false — fixed** (blocking finding, AC 27) |
| 31 | `action row` Terms row — icon-only, `aria-label`/`title` | true; scoped to the page widgets, already correct |
| 32 | `icon-only button` Terms row — `A114` shape | true; scoped to the `action row` |
| 124 | delete control of the page widget | true; `src/content/` only |
| 150–153 | `Compact action row` bullet and its four sub-bullets | true; `src/content/` only |
| 156 | `Popup look` bullet, header line | true; it already names the icon-only delete shape and `A143` |
| 159 | `Row controls` sub-bullet | true; already states the icon-only control, `A143`, `S14-4` |
| 161 | `No mascot` sub-bullet — `Удалить` as the accessible name | true; no "no glyph" claim |
| 162 | `Pinned by a look suite` sub-bullet | true; names the trash button's attributes |
| 164 | `Popup author group` — `No plural word form, no tooltip, no icon, no second format entry` | true: the clause is scoped to the **label format entry** ("The label is one format entry …"), which carries no icon; it is not a claim about the row's controls |
| 88 | `Entry points` — `no popup control is added` | true: scoped to `A122` (no settings-opening control is added), not to the row's delete control |
| 96 | `Nothing else on this surface moved` (`t9-02` AC6) | true: a `t9-02` record about the options surface; it makes no claim about the popup's controls |
| 26, 293, 297 | `author row` Terms row, AC 22, AC 26 | true; already corrected to the icon-only delete button and `A143` by `t14-01` |

No other false sentence exists for the same reason, so the sweep changed nothing beyond
lines 154 and 298. The AC 11 requirement of the original brief is met: every sentence in
this spec that speaks about the popup's controls is true of the committed tree, and none
contradicts `A143`.

## Gates — profile order, exit codes and counts

| Order | Command | Exit | Counts |
|---|---|---|---|
| 1 | `npm run build` | `0` | `dist/` is a self-contained MV3 folder (**12 files**); `find dist -type f` answers `12` |
| 2 | `npm test` | `0` | **1048 passed / 47 files** — the baseline, unchanged |
| 3 | `node scripts/check-agent-config.mjs` | `0` | `0 error(s), 0 warning(s), **176 info(s)**` — unchanged |
| 4 | `npm run typecheck` | `0` | `tsc` over `tsconfig.content.json`, `tsconfig.app.json`, `tsconfig.spec.json`, no output |

Baseline held exactly: 1048 tests / 47 files, `dist/` 12 files, checker 176 info. No pin was
weakened or deleted; no test file was touched. The two edited lines are prose, so the test
suite could not move — and it did not.

## Constraints honoured

- `docs/` and one comment in `src/popup/popup.component.ts` only. Diff: 2 files, `+4/−4`.
- No behaviour, no style, no test change. Nothing else in `popup.component.ts` was touched.
- No fix needed a test change; nothing was stopped or reported as a conflict.
- Working tree clean after the commit (`git status --porcelain` → empty); nothing staged.
- One commit. No `git checkout`, no `cp` restore needed: no tracked file was mutated outside
  the two edits.

## Open questions

None. Both blocking lines are corrected, the wider sweep found no third false sentence, and
all four gates are green at the baseline.

## Acceptance criterion self-check

**"After your commit, every sentence in the spec that speaks about the popup's controls is
true of the committed tree, and no sentence contradicts `A143`."**

- Lines 154 and 298 corrected; both now state the `A143` exception and keep the still-true
  half for `src/options/` in the brief's own words. **Satisfied.**
- Sweep of every other popup-control sentence in the file: table above, no third false
  sentence. **Satisfied.**
- `deleteIconPx` doc comment now matches `POPUP_DELETE_ICON_PX = 16` and
  `POPUP_DELETE_HIT_BOX_PX = 24`. **Satisfied.**
- Gates green at baseline; one commit; clean tree. **Satisfied.**
