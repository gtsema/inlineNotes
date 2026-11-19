# t14-01b — review

**Verdict: `accepted`** — zero blocking findings. The one blocking finding of `t14-01` is genuinely closed and nothing else moved.

Reviewer: `code-reviewer` (read-only). Slice reviewed: `c0eae45` (`docs/specs/content-overlay-ui.md:154`, `:298`; `src/popup/popup.component.ts:288-291`). Report: `docs/state/t14-01b-engineer.md` (in `b2801bb`). Review that ordered this attempt: `docs/state/t14-01-review.md` (run `426e2c29-…`). Stage record: `docs/state/stage-14-popup-look.md`. Nothing was edited, created or deleted in this repo by this review; the only command run on my own initiative was `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 176 info(s)`, matching the brief.

## Carried-fix checklist — one line per number

The predecessor review carried one blocking finding; this attempt was briefed to close it, so it is answered as carried number 1.

1. **Closed.** `docs/specs/content-overlay-ui.md:154` and `:298` no longer claim the popup's buttons keep their words or that neither surface gained an inline glyph. Both now name `src/options/` as the untouched surface and name exactly one popup exception, citing `A143` / `t14-01`. See AC 1 below.

## Acceptance criteria — one line each

The brief carries one acceptance criterion (the engineer's self-check quotes the same sentence), so it is checked as AC 1; the predecessor review's ACs 1–12 stay satisfied and are re-confirmed on the new commit in the "Nothing else moved" section.

| AC | Verdict | Evidence |
|---|---|---|
| 1 — after the commit, every sentence in the spec that speaks about the popup's controls is true of the committed tree, and no sentence contradicts `A143` | **pass** | `docs/specs/content-overlay-ui.md:154` and `:298` read as corrected (below); the sweep over the whole file returns only those two lines for the old claim; `src/options/` carries no `<svg>` and no `CARD_ICON_CLASS` (`grep -rn "svg\|CARD_ICON_CLASS" src/options/` → no match), so the options half is true; the popup half matches `src/popup/popup.component.ts:121-155` and `src/popup/text.ts:55`. |

### AC 1 in detail — the two sentences, clause by clause against the committed tree

`docs/specs/content-overlay-ui.md:154` (the `t7-01` card bullet's closing clause) now reads:

- `src/options/` is untouched: no inline glyph, no shared glyph class, and its buttons keep their words. — **true**: `grep -rn "svg\|CARD_ICON_CLASS" src/options/` answers nothing; `tests/content-create-card-boundaries.spec.ts:403-412` still asserts both options halves empty; `src/options/text.ts` keeps `save: 'Сохранить'`.
- `src/popup/` was untouched **by `t7-01`**, and its buttons kept their words then — **true history, not rewritten**: `t7-01` is the page-widget ruling and `docs/state/t7-01-card-compact-actions.md:21` states exactly that. The clause is scoped to `t7-01`, so nothing `t7-01` did is restated.
- the one exception on that surface is later and its own — the icon-only delete control ruling `A143` / task `t14-01` gives a row — **true**: exactly one exception is named, with both citation anchors, and it points to the "Popup look" bullet.

`docs/specs/content-overlay-ui.md:298` (**AC 27**) carries the same two clauses plus the exception's own facts:

- `Удалить` still shipped as that control's `aria-label` and `title` — **true**: `src/popup/popup.component.ts:133-134` binds `[attr.aria-label]` and `[attr.title]` both to `deleteLabel` (`:288`), which is `POPUP_STRINGS.delete` = `Удалить` (`src/popup/text.ts:55`).
- the row's checkbox and the notices keep their words — **true**: `:121-128` renders the checkbox as a real `<input type="checkbox">` under a `<span class="author">` label; `.empty` / `.notice` text comes from `POPUP_STRINGS` unchanged.
- the glyph class stays **unshared** across the layer boundary, the popup re-declares its own drawing, ledger row `S14-4` — **true**: the popup glyph is a hand-written `<svg>` at `:136-155` with no `CARD_ICON_CLASS`; the reason sits at the declaration (`:298-310`) and the pin is `tests/content-create-card-boundaries.spec.ts:397-401`.
- "the one exception on that surface" — **true**: `grep` for `<svg` over `src/popup/` yields only `popup.component.ts`, and that file holds exactly one `<svg>`.

## The sweep (point 2 of the brief)

Independently re-run over the whole spec: `grep -n "keep their words\|kept their words\|no inline glyph\|gained an inline glyph\|inline glyph\|glyph class\|icon-only" docs/specs/content-overlay-ui.md`. Every hit reads true of the committed tree:

- `:31`, `:32`, `:124`, `:150-153` — Terms rows and the `A114`/`t7-01` bullets; scoped to `src/content/`, true.
- `:156`, `:159`, `:161` — the `Popup look` bullet and its `Row controls`/`No mascot` sub-bullets; already name the icon-only control and `A143`, true.
- `:293` (AC 22), `:297` (AC 26) — already corrected by `t14-01`; true.
- `:164` (`Popup author group`) `… no tooltip, no icon, no second format entry` — **true**: the clause is scoped to the label's one format entry in `src/popup/text.ts`, which carries no icon; it is not a claim about the row's controls.
- `:88` (`Entry points`) `no popup control is added` — **true**: scoped to `A122` (no settings-opening control is added), beside the still-shipped `openOptionsPage()` call.
- `:96` (`t9-02` AC6 `Nothing else on this surface moved`) — **true**: an options-surface record making no claim about the popup's controls.
- The **popup contract bullet** (`:155`) itself makes no glyph claim; its "no edit affordance … no `Сохранить`" is true (`grep` finds no comment write imported under `src/popup/`).

Sweep verdict: **complete**. Nothing in the file now contradicts `A143` or the code. The engineer's sweep table (`docs/state/t14-01b-engineer.md:36-50`) agrees with this independent re-run; the only other repo hits for the old wording are the review/report/state records themselves (`docs/state/t14-01-review.md`, `docs/state/stage-14-popup-look.md:139,162`, `docs/state/improvement-backlog.md:238`, `docs/state/t7-01-card-compact-actions.md:21`), which are histories, not claims, and `tests/content-create-card-boundaries.spec.ts:25-32` (carried debt, still ledgered).

## The comment fix (point 3 of the brief)

**Correct now.** `src/popup/popup.component.ts:288-291` reads "The glyph is `16` and the hit box is `24`, so this is the smaller of the two", and the constants are `POPUP_DELETE_ICON_PX = 16` (`:44`, bound to `[attr.width]`/`[attr.height]` at `:137-138`) and `POPUP_DELETE_HIT_BOX_PX = 24` (`:41`). The stylesheet agrees: `.delete` is `24px` (`:253-256`), `.delete svg` is `16px` (`:266-267`). The same inversion does **not** survive in the surrounding prose: `:35` ("the same `24px` … as `ACTION_HIT_BOX_PX`") and `:83` ("the panel is `320px` … the settings card is `360px`") are accurate, and `:306-310` states the *absence* of a staying-identical pin, which `tests/popup-window-look.spec.ts:386-392` contradicts — recorded as non-blocking finding 1 below and already ledgered as `S14-6`/`S14-7`.

## Nothing else moved (point 4 of the brief)

- `git show --stat c0eae45` → exactly `docs/specs/content-overlay-ui.md` and `src/popup/popup.component.ts`, `4 insertions / 4 deletions`. No test file, no stylesheet rule, no template, no manifest, no `package.json`, no pin touched.
- `git diff --name-only c0eae45 HEAD` → `docs/state/t14-01b-engineer.md` only (the report commit `b2801bb`). Working tree clean (`git status --porcelain` empty).
- `find dist -type f | wc -l` → `12`.
- Spec edited in the same commit as the claim it corrects; no behaviour change was needed, so `code-review-flow.md`'s same-commit rule is satisfied by this commit alone.
- Predecessor ACs 1–12 remain satisfied: the popup stylesheet literals, `320px`/`body{margin:0}`, no mascot, the icon-only trash with `24`/`16` constants, one-core-call delete, the real checkbox, the notices, the look pins, the two retitled `describe`s, the re-declared glyph and the 12-file `dist/` are all unchanged by a `+4/−4` prose-and-comment commit.

## Blocking findings

None.

## Non-blocking findings (debt ledger)

1. **`src/popup/popup.component.ts:308-310` — the comment still says the drawings are not pinned identical, while `tests/popup-window-look.spec.ts:386-392` does compare them path-for-path.** Carried from `t14-01` non-blocking finding 1 (ledger rows `S14-6`, `S14-7`); untouched by this attempt, which was correctly bounded to the blocking finding plus row 4. The code comment is the wrong artefact.
2. **`docs/specs/content-overlay-ui.md:157` — "Every colour the popup declares is one of the `A125` roles" then lists five, while `A125` names seven plus the refusal.** Carried (ledger row `S14-8`); true of the shipped set, loose as a sentence.
3. **`src/popup/popup.component.ts:260` — `.delete { color: #b8480d; }` is a bare literal while the two sizes are named constants.** Carried (ledger row `S14-9`); `A125`-clean, not the shape the sizes got.
4. **`src/popup/index.html` ends without a trailing newline; `src/options/index.html` has one.** Carried (ledger row `S14-10`); the one byte-level asymmetry between two documents that now own the same rule.
5. **`tests/content-create-card-boundaries.spec.ts:25-26` — the file header still opens with "`src/popup/` and `src/options/` carry no inline glyph", then qualifies it four lines later.** Carried (ledger row `S14-11`). The exception *is* stated and the pin itself is correct (`:391` names the one popup file, `:406` keeps options empty), so the header is not false — but the opening clause is what a reader greps for, and my sweep hit it precisely because of that.
6. **`tests/popup-window-look.spec.ts` still never asserts `class="popup"` reaches the template nor that `rowClassOf` yields `row--own`.** Carried (ledger row `S14-7`); every `.popup` assertion resolves against stylesheet text only.
7. **Report accuracy (`docs/state/t14-01-engineer.md`, AC 7 row).** Carried (ledger row `S14-12`); cosmetic, but the report is the record.

No new non-blocking finding arises from this attempt: the two edited spec sentences and the corrected comment are accurate as written, and I found no fourth sentence in `docs/specs/content-overlay-ui.md` that speaks about the popup's controls and contradicts the tree.

## Spec and code now agree

**Yes** — `docs/specs/content-overlay-ui.md:154` and `:298` and `src/popup/popup.component.ts:121-155` now say the same three things about the popup's controls: the row's delete control is icon-only with an inline glyph of its own (`A143`, `t14-01`), `Удалить` ships as that control's `aria-label` and `title`, and `src/options/` keeps its words with no inline glyph and no shared glyph class.

## Evidence paths

- Slice: `git show c0eae45` (2 files, `+4/−4`); `git show --stat c0eae45`.
- Report: `docs/state/t14-01b-engineer.md`; predecessor review `docs/state/t14-01-review.md`; stage `docs/state/stage-14-popup-look.md`.
- Spec read: `docs/specs/content-overlay-ui.md` (`:17`, `:31-32`, `:86-98`, `:124`, `:150-166`, `:293`, `:297-298`), `docs/specs/code-review-flow.md`, `docs/specs/INDEX.md`.
- Code read: `src/popup/popup.component.ts` (`:35`, `:41-60`, `:76-98`, `:115-185`, `:240-275`, `:285-315`), `src/popup/text.ts`, `src/popup/index.html`, `tests/content-create-card-boundaries.spec.ts:25-32, 380-419`, `tests/popup-window-look.spec.ts:24-26, 386-392`.
- Gate evidence: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 176 info(s)`; `find dist -type f` → `12`; `git status --porcelain` → empty.
