No write-capable tool is available in my toolset (read/grep/find/ls/read-only bash), so here is the complete artifact for the briefed path `…\subagent-artifacts\outputs\536c47a4-47e0-47d5-abfb-492bb8b937eb\docs\state\reviewer-report.md`.

---

# Review — `t3-02b-carried-test-fixes`, attempt 1

**Verdict: `accepted`**

Reviewed range: `git log bb3cbb1..HEAD` → `a6997f9` (tests), `3462d2a` (specs), plus the PM's own bookkeeping commit `e47b66f`. Claims in `docs/state/t3-02b-engineer.md` were checked against code and my own command runs, never against its text. I ran no mutating command; the only writes were `dist/` artifacts produced by the `npm run build` re-run the brief ordered.

## 1. Scope — no production code (`pass`)

`git diff --name-only bb3cbb1..HEAD` → `docs/specs/code-review-flow.md`, `docs/specs/content-overlay-ui.md`, `docs/state/{plan-implementation,t3-02-content-highlight-tooltip,t3-02b-carried-test-fixes,t3-02b-engineer}.md`, `tests/content-create-card-controller.spec.ts`. `grep -c "^src/"` on that list = **0**; `package.json`/`package-lock.json`/`src/manifest.json` in the range = 0; `.pi/`, `scripts/`, `docs/project-profile.md` in the range = 0 (harness re-verification not engaged — checker run anyway, §2).
Per-commit: `a6997f9` = 1 file, `tests/` only; `3462d2a` = 2 files, `docs/specs/` only. The four `docs/state/` paths come from `e47b66f`, the PM's own commit, not the engineer's — that is why the brief's "only `tests/` and `docs/specs/`" condition holds for the delivered work but not verbatim for the whole range. Not a finding.

## 2. Green gates — re-run by me, `A62` order

```
npm run build
[build] dist/ is a self-contained MV3 folder (10 files)

npm test -- --reporter=basic
 Test Files  33 passed (33)
      Tests  626 passed (626)

node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 30 info(s)
```

The report's and the PM's numbers (`626/626`, `33 files`, `0 errors`) match my measurements. New tests are counted: `tests/content-create-card-controller.spec.ts (28 tests)` in the run; `it(` count in that file 21 at `bb3cbb1` → 28 at HEAD = **+7**, and 619 (`t3-02`) + 7 = 626. The +1 info is `docs/specs/content-overlay-ui.md: planned path not created yet: tests/content-create-card-controller.spec.ts` — the same pre-existing checker quirk that flags `tests/content-create-card-boundaries.spec.ts` although that file exists; no new error or warning. Report claim confirmed.

## 3. Acceptance criteria

| AC | Quoted AC line (brief) | Verdict | Evidence |
|---|---|---|---|
| AC1 | "after `open()` the card's `<textarea>`, `Сохранить` and `Отмена` are in the rendered tab order (`tabindex` untouched, all focusable, order = textarea → Сохранить → Отмена), `Esc` cancels and closes, `Ctrl/Cmd+Enter` saves, and `document.activeElement` is **not** inside the shadow host (`A74`)" | **pass** | `tests/content-create-card-controller.spec.ts:714` (page `#page-cta` button survives `open()`: `document.activeElement` is that button, `not.toBe(overlay.host)`, `root.activeElement` `null`), `:741` (exactly 3 focusables, `TEXTAREA/BUTTON/BUTTON`, `order[1].textContent === CONTENT_STRINGS.save`, `order[2] === cancel`, none `disabled`, `getAttribute('tabindex')` null, `root.querySelectorAll('[tabindex]')` = 0, host has no `tabindex`, and each control answers `root.activeElement` while `document.activeElement` answers the single host), `:778` (`Esc` → `isOpen()` false, card gone, `host.hidden` true, zero non-settings writes, 0 entries), `:795` / `:812` (`Ctrl+Enter` and `Cmd+Enter` → 1 entry via `loadEntries`, `created` length 1). Keys are sent as a bubbling `keydown` from the textarea (`:239-257`), which reaches the real handler on the card element (`src/content/overlay/create-card.tsx:80-90`). The spec half: `docs/specs/content-overlay-ui.md:36` (Terms `focus on open`), `:95-96` (Rules), `:135` (AC 17) |
| AC2 | "the `A29` save-moment property is pinned at the **card** call site: mutate the DOM under that selection … press `Сохранить` … assert the stored entry's anchor/span comes from the mutated document — not from the offsets measured at open time … Neither case may call `createNote` directly … Second case: mutate so the text is gone → `selection_lost` (`text.ts:62`) and nothing written" | **pass** | `tests/content-create-card-controller.spec.ts:846` and `:903`; see §4 for the neutralization experiment. Save is driven by `pressSave` → `saveButtonOf` = the card's first button = `Сохранить` (proven by `:752` `order[1].textContent === CONTENT_STRINGS.save`); neither new test calls `createNote` (only the pre-existing `:460` case does, untouched). Gone case asserts `REFUSAL_TEXT.selection_lost` (`:915`), **not** `entry_invalid` (`:916`), card open with draft kept, `created` empty, zero non-settings writes, `storedKeys()` = `[SETTINGS_KEY]`, 0 entries |
| AC3 | "`docs/specs/code-review-flow.md` states the checklist rule mechanically: every brief lists its carried fixes as numbers; the report answers every number; a carried number answered by nothing is a blocking finding regardless of the AC verdict; and the review artifact carries one line per number" | **pass** | `docs/specs/code-review-flow.md:22` (Terms `carried fix`), `:26` (Flow 1 — numbered `Carried-fix checklist` in brief and state file, naming the review artifact), `:27` (Flow 2 — report answers every number, `done` + `path:line` or `skipped` + reason), `:30` (Flow 5 — review carries one line per number), `:41` (Rules — silence is blocking regardless of AC verdict, plus `Carried-fix checklist: none` when there are none), `:43` (blocking list extended), `:74` (AC 8). Mechanical, not prose: each clause names actor, artifact and format |
| Gates row | "gates green and quoted in the `A62` order" | **pass** | §2, re-measured here |

## 4. AC2 experiment: is the mutation load-bearing? (reasoned, no edit made)

**Neutralize the mutation, keep the code.** Deleting `:862-864` (`article.insertBefore(lead, …)`, `textOf('p1').insertData(10, 'very ')`) leaves the save-moment stream equal to the page as it was at open, so `captureSpan` (`src/content/create/create-note.ts:104-107`) yields `'quick brown'` with prefix `'The '`. `tests/content-create-card-controller.spec.ts:874` (`entry.text` = `'quick very brown'`), `:877` (`anchor.prefix` = `'Advertisement: a word before The '`) and `:893` (`fragment.node.data.slice(...)` = `'quick very brown'`) all fail. **Conclusion: the test cannot pass without the mutation.**

**Neutralize the production re-derive, keep the mutation.** If the save reused the open-time span/anchor instead of rebuilding, the stored record would be `'quick brown'` with prefix `'The '`: `:874` and `:875` (`not.toBe('quick brown')` — an explicit anti-snapshot assertion) fail, and `locateAnchor(document.body, entry.anchor)` at `:886` could not resolve at all, because `:894` proves `'quick brown'` is no longer in `p1`. The prefix assertion is the decisive one: `'Advertisement: a word before '` exists only after the mutation, so it can only be read from a stream built at the save moment. Offsets are the expected ones for the DOM replace-data live-range rule the comment at `:837-839` names (`[4,15)` → `[4,20)` = `'quick very brown'`), and `open()` keeps only `range`/`root`/`authorName`/`boundaries` (`src/content/overlay/create-card-controller.tsx:147-158`), never a span — so the test asserts the shipped property, not something adjacent.

## 5. Spec/code agreement (`pass`)

The new keyboard rule and AC 17 describe what ships: `grep "autofocus|autoFocus|\.focus\(|activeElement" src/` → **0 hits**, so `open()` takes no focus; the shipped tab order is the DOM order `textarea` → `Сохранить` → `Отмена` (`src/content/overlay/create-card.tsx:94-118`), no control carries `tabindex`; `Esc` / `Ctrl|Meta+Enter` are handled at `:81-89`; and an open card reveals the host as `display: block` with `hidden` false (`src/content/overlay/host.ts:59-61`, `src/content/overlay/host-style.ts:25`), so the controls are focusable in a real browser. `A74` is marked `Assumption:` in both the spec (`:36`, `:96`) and the task file — recorded, not decided silently.
Numbering: `docs/specs/content-overlay-ui.md` AC list runs 1-17 with no duplicate and no renumbering of the `t3-02` 15/16; the new Terms row `focus on open` does not collide. `docs/specs/code-review-flow.md` AC list 1-7 → 8 appended; Terms row `carried fix` new. No collision.

## 6. Parent-closure re-check — `t3-02-content-highlight-tooltip` (findings 1-3 only)

1. **Finding 1 — keyboard reachability of the card.** **Closed**: tests `tests/content-create-card-controller.spec.ts:707-825` (five cases at `:714`, `:741`, `:778`, `:795`, `:812`) + spec `docs/specs/content-overlay-ui.md:95-96` and AC 17 at `:135`.
2. **Finding 2 — no test mutating the DOM between open and save for `A29`.** **Closed**: `tests/content-create-card-controller.spec.ts:846` (mutation at `:862-864`, assertions at `:874-894`) and `:903` (`:911`, `:915-923`); driven through the card's `Сохранить`, never `createNote`.
3. **Finding 3 — the report was silent about a deliverable.** **Closed** in both halves: the durable rule at `docs/specs/code-review-flow.md:41` (+ `:22`, `:26`, `:27`, `:30`, `:43`, `:74`), and the demonstration in `docs/state/t3-02b-engineer.md` §1, which answers all three numbers with `done` + `path:line`.
**Parent verdict: `t3-02` can now be accepted.** All three blocking findings are closed by this range, all five of its own ACs were `pass` in `docs/state/t3-02-review.md`, and this range touched no file under `src/`, so nothing it shipped changes. The PM records it in `docs/state/t3-02-content-highlight-tooltip.md`; its non-blocking remarks 1-6 stay open as remarks (`:96` AC-wording fix, unshipped-editor marking, `PaintedEntry.tooltipBox`, `refresh()` never throws, unthrottled `pointermove`, `STYLEABLE_NAME`) — my remark 1 below belongs to the same family as its remark 4.

## 7. Blocking findings

**None.** (1) Every AC passes; (2) no spec rule of `code-review-flow.md` or `content-overlay-ui.md` is violated by the delivered commits; (3) no dependency, no network call, no host-DOM mutation for painting — the DOM edits at `:862-864` and `:911` are the fixture moving the *page*, which is exactly what the brief demands, and no shipped module gains a page-mutating path; (4) required tests exist and are counted (§2); (5) all three carried numbers are answered.

## Carried fixes (rule `A72`, one line per number)

1. `t3-01` remark 4 — keyboard reachability of the card: **closed** — `tests/content-create-card-controller.spec.ts:707-825`; spec `docs/specs/content-overlay-ui.md:36`, `:95-96`, AC 17 `:135`; my AC1 line above.
2. `t3-01` remark 5 — DOM mutation between open and save for `A29`: **closed** — `tests/content-create-card-controller.spec.ts:846-900`, `:903-925`; my §4 experiment is the proof of load-bearingness.
3. `t3-02` finding 3 — a report must not be silent about a deliverable: **closed** — `docs/specs/code-review-flow.md:41` (+ `:22`, `:26`, `:27`, `:30`, `:43`, `:74`), and `docs/state/t3-02b-engineer.md` §1 answers 1-3 by number; this section is the reviewer half of the same rule.

## Non-blocking remarks (PM decides, none blocks acceptance)

1. **Browser-vs-jsdom divergence on the gone-text path** (the report's §5 suspicion, confirmed by reading the code, not fixed here — correctly out of scope). `src/content/capture/selection-span.ts:150` calls `range.intersectsNode(fragment.node)` unguarded; per the DOM spec that method throws `InvalidAccessError` when the node's root differs from the range's root, i.e. exactly when the selected text node has been detached (`tests/content-create-card-controller.spec.ts:911`). jsdom answers `false`, so the test pins `selection_lost`, but a real engine may throw: `create-note.ts:104` rejects, `create-card-controller.tsx:128-146` does not catch, and `create-card.tsx:61-71` has already set `busy`, leaving the card stuck with `Сохранить` disabled and no refusal line. I do **not** raise this as `blocked`: it concerns code outside this range, is not observable in the repo's environment, and the report already routed it as a suspicion. Suggested PM step: one `chrome://extensions` smoke line ("select text, have the site replace the node, press `Сохранить`") plus a ruling on a `try` around `captureSpan` at the save call site — same family as `t3-02` review remark 4 (`page-painter.ts:70` "Never throws"). Minor wording correction in the report: the DOM exception name is `InvalidAccessError`, not `WrongDocumentError`.
2. **Spec ownership.** `docs/specs/INDEX.md:10` names `project-manager` the owner of `docs/specs/code-review-flow.md` and `:13` says "the owner role makes the edit", but the edit was made by `extension-engineer` under ruling `A72` — self-reported at `docs/state/t3-02b-engineer.md` §4.1. The brief authorized it, so the conflict is between the ruling and the INDEX row, not a spec violation by the engineer. PM: either add `docs/specs/code-review-flow.md` to the engineer's covered paths or record `A72` as the authorization in `docs/state/t3-02b-carried-test-fixes.md`.
3. **Local history rewrite.** Report §4.4 discloses `git reset --soft HEAD~2` followed by two re-commits, so the reviewed SHAs `a6997f9`/`3462d2a` are not the first ones. Nothing was pushed and the briefed two-commit shape holds; recorded because the reviewer reviews SHAs, not messages.
4. **`Tab` traversal itself remains smoke-only.** jsdom has no `Tab` key, so AC1/AC17 pin rendered order + focusability + absence of `tabindex`, which is the correct jsdom form but not a real key walk. One line for the Stage 3 smoke list, next to the two `t3-02` smoke-only items.
5. **Spec lines landed one commit after the tests** (`3462d2a` after `a6997f9`), as the brief's work order §3-4 ordered. The flow's same-commit rule does not engage — no shipped behavior changed in this range — and the `A69` exception precedent was already used in `t3-02`. Noted so the record shows it was briefed, not drifted.

## Evidence path

`docs/state/t3-02b-carried-test-fixes.md` (AC1-AC3, `A74`/`A72`/`A29`, out-of-scope, Carried-fix checklist), `docs/state/t3-02b-engineer.md` (claims, verified against code and my runs), `tests/content-create-card-controller.spec.ts` (`:239-257`, `:707-825`, `:827-925`), `docs/specs/content-overlay-ui.md` (`:36`, `:95-96`, `:135`), `docs/specs/code-review-flow.md` (`:22`, `:26`, `:27`, `:30`, `:41`, `:43`, `:74`), `src/content/overlay/{create-card-controller.tsx,create-card.tsx,card-events.ts,host.ts,host-style.ts}`, `src/content/create/create-note.ts`, `src/content/capture/selection-span.ts`, plus the gate runs quoted in §2 and the commit file lists in §1.