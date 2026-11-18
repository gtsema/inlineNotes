# Task `t5-06-popup-author-groups` — the popup lists authors, not notes

Stage 6, task 3 (the last one). Owner: `extension-engineer`. Rulings: **`A95`** (the user's answer) plus the shape ruling
**`A108`** below. Specs to edit in the same commit: the popup contract in `docs/specs/content-overlay-ui.md`, the visibility and
delete rules in `docs/specs/inline-comment-model.md`, and `README.md` (it describes the popup rows and their checkboxes).

## Goal

One row per author on the page: «Вася — 10», one checkbox, one `Удалить`. The user's example: user1 has 10 notes, user2 has 3 →
two rows. The checkbox and the delete act on **all** of that author's notes on this page; the note card's `Удалить` still removes
one note.

## Shape the PM chose (`A108` — do not redesign)

- **Storage does not change.** `visible` stays a per-entry field; no migration, no new key. The grouping is a popup projection
  over the same records (`A95`).
- **Two new named core operations** in `src/core/entry-store-write.ts`, built on the existing primitives, one slot write per
  affected record and one index update per call:
  `setVisibleForAuthor(port, { pageKey, authorName, visible })` and
  `deleteEntriesOfAuthor(port, { pageKey, authorName })`.
  Author identity is `isSameAuthor` (`A99`). The popup must **not** loop over `setVisible`/`deleteEntry` itself — that would
  rewrite the index N times and leave partial states. The popup calls one operation.
- **Checkbox state is an aggregate**: checked iff **every** entry of that author on the page is visible. Toggling off sets all of
  them invisible; toggling on sets all visible. A mixed state (some hidden by an older action) reads as unchecked and the next
  toggle makes them all visible.
- **Row label**: own author → «Вы» (the shipped ownership header, `A82`), foreign → the stored `authorName`; then the entry count
  in the row. The count includes stale entries (`A86` — the popup cannot know staleness).
- **Row order**: by the earliest `createdAt` among that author's entries, so the popup stays creation-ordered.
- **No expansion**: no per-note rows, no disclosure control (`A95`). The per-note hide affordance disappears from the popup; the
  note card keeps its own `Удалить` and that is the only single-note destructive action outside a group delete.
- A refused aggregate write stays silent and the popup re-reads the page (`A84` extended to the new operations — record it as the
  same assumption, not a new message).

## Acceptance criteria (observable)

1. Ten own notes and three foreign ones on one page render **two rows**, each with the author label and its count.
2. The own row's label is «Вы» and the foreign row's label is the stored name (`A82` unchanged, no «Не: » prefix).
3. The checkbox is checked iff every entry of that author is visible; toggling off makes every one of them invisible in one call,
   and the page repaints (the `storage.onChanged` path of `t4-03` is untouched).
4. Toggling on makes every one of them visible, including ones that were individually hidden before this task's UI existed.
5. `Удалить` in the row removes **every** entry of that author on this page and leaves every other author's entries byte-identical.
6. The page card's `Удалить` still removes exactly one note (unchanged).
7. Rows are ordered by the earliest `createdAt` of each author (`A95`); two authors are never interleaved into one row.
8. The two new core operations are pinned in `tests/` as: one write per affected slot, exactly one index update per call, an
   author filter via `isSameAuthor` (`"Я "` matches `"Я"`), and an empty result for an author with no entries on that page (no
   write, no index touch).
9. The 20-entries-per-page cap, the 256-char cap, the per-entry record shape and the storage keys are unchanged; `src/core/`
   changes only inside `entry-store-write.ts` (plus its spec).
10. The popup still renders no page address (`t5-05` / `A98`), the notices keep their place (`A81`, `A83`). Every Russian string
    that appears must already exist in `src/popup/text.ts`; the row label format is **ruled here**: `<authorName>` then ` — ` then
    the plain count (`Вася — 10`, `Вы — 3`), one format entry in `src/popup/text.ts`, no plural word forms, no tooltip, no icon.
    Anything beyond that format needs a ruling from me — **ask, do not invent**.

## Boundaries

- Allowed: `src/popup/**`, `src/core/entry-store-write.ts`, `tests/`, the two specs named above, `README.md`.
- Forbidden: `src/content/**`, `src/options/`, `src/manifest.json`, dependencies, harness files,
  `docs/specs/code-review-flow.md` (`A76`, `A89`).
- Do not touch the task state file `docs/state/t5-06-popup-author-groups.md`; write your report to your own artifact.

## Carried-fix checklist (`A72`, from the `t5-05` review)

1. `tests/content-tooltip.spec.ts:460` — the `describe` name cites `t5-03 AC1` (opacity) although that describe holds no opacity
   pin (the opacity pin is `:389`). **Name-only.**
2. `README.md:12-13` — still describes the pre-`A96` two-state tooltip (translucent until clicked). Rewrite it to the shipped
   rule: the tooltip is opaque from the first hover, clicking my own tooltip opens the editor, clicking a foreign one does
   nothing, selecting inside my own note opens nothing. Fact-check every sentence you write there against the code — README prose
   is reviewed as a factual document, not as marketing.
3. **Do not move** the popup template scan out of `tests/popup-entry-list.spec.ts` — ruling `A109` settles that question: a scan
   of a UI layer's own template belongs in that layer's spec; `tests/toolchain-contract.spec.ts` keeps harness-level greps only.
4. The view-shape pin at `tests/popup-entry-list.spec.ts:222` and the "no address node" scan at `:230-255` are what make AC1 of
   this task true. `A108` changes that view shape (author rows replace entry rows), so both must be **carried through the
   refactor**: re-check them against the new shape, do not delete or weaken them. Deleting either is a blocking finding.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Specs first (both, plus README), commit at green.
2. Core operations + their unit tests, commit at green.
3. Popup projection + tests, commit at green.
4. Report `done` per AC number with `path:line`, four gates with their own exit status, and the grep line showing the popup no
   longer calls `setVisible`/`deleteEntry` per row. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: **2 of 4** — engineer (attempt 1 hit the wall after CP3, resumed
in-session for CP5, `A80`), reviewer. A third child is opened as `t5-06b` for the reviewer's carried items, not a second attempt.

## Attempts log

- **attempt 1 hit the 60-minute wall after CP3** (`cc10d12` specs + README, `543bcbf` core, `78f4c32` popup), tree clean, nothing
  lost — **not an attempt** (`A80`). PM measured the abandoned tree (typecheck 0, 899/44, boundaries inside the brief) and resumed
  the **same session** with a finish-only brief: no re-exploration, walk AC 1–10 naming a pin or "no pin yet", two gates
  unmeasured, carried items by number.
- **CP5 delivered** `1b4f163`: two pins that had no owner (AC1 at the size the spec names it — ten own + three foreign
  interleaved, two rows `Вы — 10` / `Вася — 3`; AC4 at the core layer — `visible: true` re-shows a record the old per-entry
  checkbox hid, leaves a foreign author's hidden record hidden), plus a corrected AC attribution in the aggregate-import scan and
  README counts. PM-measured gates on that tree: build exit 0 → `dist/` 10 files, `npm test` exit 0 → **901 / 44 files**,
  checker exit 0 → 0/0/113, typecheck exit 0, tree clean.
- **review verdict: `accepted`** (`docs/state/t5-06-review.md`) — 10/10 AC, 0 blocking, all four carried items done, and the two
  `A98`/`A109` pins verified to still assert what they asserted before the refactor. Five non-blocking findings: the empty-author
  inert row (not producible by a shipped write, unpinned shape), the repaint pin still driven by per-entry `setVisible`, a popup
  by-identity claim that is `toEqual` where the report said `toBe` (the real by-identity proof is at the core layer), a citation
  slip about `A109`, and two stale README sentences (`:5`, `:111`) outside the range.
- **PM note on the report overstatement:** "the survivors are the same objects — `toBe`, not `toEqual`" is true at
  `tests/core-entry-store-write.spec.ts:881-905` and not true of the popup pin at `tests/popup-entry-list.spec.ts:733-748`. The
  claim is not wrong about the rule, only about which file proves it — carried as `t5-06b` item 2 rather than argued away.
