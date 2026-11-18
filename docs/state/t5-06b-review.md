I could not write the artifact (no write-capable tool in this role), so here is the complete review artifact for the briefed path `C:\Users\user\.pi\agent\sessions\--C--Users-user-Desktop-test-inlineNotes--\subagent-artifacts\outputs\2f50edc6-fdc4-46d8-b8ff-a535ddf4d1a9\docs\state\reviewer-report.md`.

---

# `code-reviewer` report — task `t5-06b-carried-fixes` (Stage 6, carried-fix slice)

Range: `c569c63..HEAD` → `8ece789` (items 1–3, `tests/`) + `81ad1f1` (item 4, `README.md`) + `a32fa0f` (PM state commit, engineer report only).
Read: `docs/specs/INDEX.md`, `docs/specs/code-review-flow.md`, `docs/state/t5-06b-carried-fixes.md` (brief + AC1–AC5), `docs/state/improvement-backlog.md` (`A110` at :192-200), `docs/state/t5-06b-engineer.md`, the diff, then the code.
Tree is clean at `a32fa0f` (`git status --porcelain` → empty), so nothing unreviewed sits in the working tree.

## Verdict: **accepted**

## Acceptance criteria (one line per AC)

- **AC1** («A page-layer test exists where an aggregate `setVisibleForAuthor` write from one tab repaints another tab's highlights») — **pass**: `tests/content-cross-tab-refresh.spec.ts:340`; it observes a real repaint reaction, not a write (`:371-373` hide, `:387-395` re-show).
- **AC2** («the popup group-delete pin either asserts identity for every survivor, or names the core pin that owns that claim») — **pass**, first branch: `tests/popup-entry-list.spec.ts:755`, `:756`, `:757` — one `toBe` per surviving record, in stored order.
- **AC3** («a test pins the empty-author shape exactly as `A110` states it: row renders, controls write nothing, create cannot store it») — **pass**: `tests/popup-entry-list.spec.ts:832` with pins at `:849`, `:865`, `:887`, `:905`; all three halves of `A110` present, no `src/` change.
- **AC4** («`README.md` contains no stale stage claim and no internal number disagreement, and its counts still match the tree») — **pass**: `README.md:5`, `:38`, `:111`, `:113-114` verified sentence by sentence against the tree; counts corroborated read-only.
- **AC5** («no `src/` file changes in this task») — **pass**: `git diff --name-only c569c63..HEAD` → `README.md`, `docs/state/t5-06b-engineer.md`, `tests/content-cross-tab-refresh.spec.ts`, `tests/popup-entry-list.spec.ts`. Zero `src/` paths, zero `docs/specs/` paths, zero harness paths. No stop-and-report was needed and none was triggered.

## Carried-fix checklist (one line per number, `code-review-flow.md` AC8)

1. **Page-layer repaint pin driven by the aggregate write — done, honest.** Added at `tests/content-cross-tab-refresh.spec.ts:340`; the per-entry pin is **kept**, not replaced, at `:319` (write at `:323`, assertions `:333-337`).
2. **Popup by-identity claim — done, strengthened.** `tests/popup-entry-list.spec.ts:748-757`: three `toBe`, one per survivor; the test's name («byte for byte», `:737`) no longer claims more than it asserts.
3. **`A110` empty-author shape pinned as accepted debt — done, no code change.** `tests/popup-entry-list.spec.ts:812-921`.
4. **Two stale README sentences — done, replacement claim re-read (`A92`).** `README.md:5`, `:111`, plus the count lines `:38`, `:113-114`.

## Blocking findings

**None.** No AC failed, no spec rule violated, no forbidden dependency or network call, no missing required test, no host-DOM mutation, no unanswered carried-fix number. Boundaries held: only `tests/**` and `README.md`; both behavior specs, `docs/state/t5-06b-carried-fixes.md`, `scripts/` and `.pi/` untouched.

## Item-by-item verification (evidence, not restatement)

**Item 1 — the aggregate write reaches the same `storage.onChanged` subscriber path.** `setVisibleForAuthor` (`src/core/entry-store-write.ts:378`) ends in the same `commitRecords` as `setVisible` (`:653-666`) → `writeSlotThenIndex` (`src/core/page-index-store.ts:151-163`), i.e. `port.set(entryStorageKey(pageKey))` then one `pages:v1` publication. The watch is key-based and writer-agnostic (`src/content/refresh/storage-change-watch.ts:38` — core `storageChangeConcernsPage`; the index alone is pinned as not-a-signal at `tests/content-cross-tab-refresh.spec.ts:422`), so the fixture's `fire([entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY])` at `:363`/`:382` is exactly the record Chrome reports for that write pair. The new pin asserts a **reaction**, not a write: after the hide, `paintedEntries()` is exactly the foreign record and the recording surface holds exactly `[FOREIGN]` (`:371-373`); after the re-show, all three are painted again (`:387-395`); the three records are still stored (`:398-399`). The fixture is itself non-vacuous: it asserts all three highlights painted before the write (`:356`).

**Item 2 — honesty.** `tests/popup-entry-list.spec.ts:737` is the «byte for byte» pin; `:749` equality, `:750-754` id list, `:755-757` reference identity for all three survivors. The identity assertion is load-bearing because the memory port stores by reference (`tests/support/memory-storage-port.ts:88-95`) and core carries records verbatim through the whole-list commit; a rewriting core would break it. The core owner stays where the brief put it: `tests/core-entry-store-write.spec.ts:881`.

**Item 3 — the pin matches `A110` (`docs/state/improvement-backlog.md:192-200`) and is non-vacuous.** Every producer line cited in the block comment `tests/popup-entry-list.spec.ts:812-831` is real: `src/core/entry-store-read.ts:132` (type-only `authorName` guard, value never checked), `src/core/entry-rules.ts:127` (`isSameAuthor` refuses an empty side), `src/core/entry-store-write.ts:535` (`authorRecordsOf`), `src/core/entry-store-write.ts:242` (normalize **behind** `assertCreatable`; gate at `src/core/entry-rules.ts:190-192`), `src/popup/page-entries-service.ts:156` (`groupsOf`), `src/popup/popup.component.ts:85` (`@for … track row.authorName`), `tests/core-settings-store.spec.ts:239`, `src/content/create/create-note.ts:157`. Absence of writes is measured by **counting port calls**, not by a weak `toEqual`: `writeLines(f)` (`tests/popup-entry-list.spec.ts:131-136`) filters `port.calls` to `set`/`remove`, asserted `[]` at `:881` and again at `:919-920`; and because the refusal **code** is asserted per name (`:913-916`, `name_required` for `''`, `'   '`, `'\t'`), a no-write assertion cannot pass on some other refusal. The record's survival is asserted by identity and equality (`:882-885`). `src/popup/page-entries-service.ts:233-241` and `:250+` show the no-write outcome comes from core, not from a service short-circuit (the fixture's url is never `null`). No code change happened, which was the correct choice.

**Item 4 — README fact-check (quotes are the changed sentences).**
- `README.md:5`: «**Каждый автор записей текущей страницы показан в попапе одной строкой**; имя автора — в настройках.» → `groupsOf` (`src/popup/page-entries-service.ts:156`) answers one row per author, and `src/popup/popup.component.ts:85` renders one `<li>` per row tracked by `row.authorName`; the name lives in `src/options/author-name-service.ts`. The number disagreement is gone.
- `README.md:111`: «- Стадии **1–6** кода **готовы**: `src/core/` … `src/popup/`, `src/options/`, манифест.» → supported: `docs/state/plan-implementation.md:326-328` (t5-01/02/03 **accepted**), `:334-336` (t5-04/05/06 **accepted**), `:337` (t5-06b opened, no `src/` work); Stage 3/4 rows accepted at `:39-56`. Not a browser claim — the caveat stays at `README.md:128`.
- Counts: `README.md:38` and `:113-114` say **906 тестов в 44 файлах**; read-only corroboration: 44 tracked `*.spec.ts` files, 906 `it(`/`test(` declarations, **0** `.skip(` / `.only(` / `xit(` / `.each(`; per-file deltas match the report exactly (`content-cross-tab-refresh` 17→18, `popup-entry-list` 41→45, +5 total).
- `dist/` **10 files** (`README.md:37`, `:113`): the built tree lists exactly `content.js`, `manifest.json`, `options/{3rdpartylicenses.txt,index.html,main.js,prerendered-routes.json}`, `popup/{same 4}`.
- Checker **0 ошибок, 0 предупреждений, 113 информационных** (`README.md:113-114`): re-run by me, see gates below.
- Limits re-grepped (all six, three were required): `256` → `src/core/entry-rules.ts:25`; `20` → `:28`; `40` → `:31`; the 8-character generated name → `:34` `GENERATED_AUTHOR_NAME_LENGTH`, wired at `src/options/author-name-service.ts:133`; `1000 мс` → `src/content/refresh/url-change-watch.ts:50` `URL_POLL_MS`; `150 мс` → `src/content/overlay/card-events.ts:42` `SELECTION_SETTLE_MS`. `README.md:73`, `:75`, `:77`, `:104-105`, `:25` all match.

## Gates

Engineer quote present and complete (`docs/state/t5-06b-engineer.md` §1, with `A62` order and exit codes): `npm run build` **0** → `[build] dist/ is a self-contained MV3 folder (10 files)`; `npm test` **0** → `Test Files 44 passed (44)` / `Tests 906 passed (906)`; `node scripts/check-agent-config.mjs` **0** → `0 error(s), 0 warning(s), 113 info(s)`; `npm run typecheck` **0**.
Re-run by the reviewer (the only command this role runs): `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 113 info(s)`, **exit 0**. Consistent with `docs/project-profile.md` (`timeoutMs` unchanged; no harness file in range, so the harness-change rules of `code-review-flow.md` are not engaged).
Per `code-review-flow.md`, the reviewer verifies the quote is present; the 906/44 figures are additionally corroborated read-only as above.

## Non-blocking remarks (style/placement; they do not gate acceptance)

1. `tests/popup-entry-list.spec.ts:849` — the row half pins the **empty-string** author only; `A110` (`improvement-backlog.md:192`) says «empty **or whitespace-only**». A stored `'   '` behaves identically because `isSameAuthor` trims (`src/core/entry-rules.ts:127-131`), so the pinned case generalizes, but the whitespace variant of a *stored* record is pinned nowhere; `''`/`'   '`/`'\t'` are pinned only on the create side (`:912`).
2. `tests/popup-entry-list.spec.ts:887` — the `track` collision is pinned at the service-view level (two rows, `authorName` `['','']`); what Angular's `@for` actually does with two identical track values is asserted nowhere, only named in the comment (`:888-890`). Consistent with `A109` (`improvement-backlog.md:185-190`), and it belongs in Run 2 (item 5 below).
3. `tests/popup-entry-list.spec.ts:905-921` — partially duplicates existing core pins: `tests/core-entry-store-write.spec.ts:254-266` already refuses `'   '` with `name_required` and asserts `writesOf(port)).toEqual([])`, and `tests/entry-rules.spec.ts:247-248` refuses `''` and `'   '` at the gate. Added value: the `'\t'` variant and the absent-slot assertion (`:921`). The placement in the popup file (engineer report §4.2) is defensible — `A109` governs UI-layer template scans, not core gates — but the PM may want it moved.
4. `tests/popup-entry-list.spec.ts:910` — `port.seed(SETTINGS_KEY, { name: '' })` is never read by `createEntryOnPage` (the name arrives as `input.currentName`), so it illustrates rather than asserts.
5. `docs/state/t5-06b-engineer.md:39` cites the `A110` block comment as `:813-831`; the comment starts at `tests/popup-entry-list.spec.ts:812`. Off-by-one citation only.
6. README counts still have **no mechanical owner** (engineer report §4.4): `README.md:38`/`:113-114` are hand-updated every task that changes a test count — this is the third consecutive task doing it (899 → 901 → 906). A PM ruling would close it; correctly not invented here.
7. `README.md` never mentions per-author highlight colours (t5-02) or the caret handoff (t5-04) — omissions, not contradictions; leaving them alone is the correct `A92` discipline.

## What still has **no real-Chrome confirmation** (feeds the Run 2 pass)

1. **Cross-tab repaint from the aggregate write**: one popup checkbox press in tab A hiding/re-showing **all** of the reader's highlights in tab B on the same page. Pinned only at `tests/content-cross-tab-refresh.spec.ts:340`; Run 1 item 6 (`docs/state/browser-verification-run.md:114-130`) confirmed the older per-entry `setVisible` shape. Run 2 item 6 (`:168`) does not name the second tab.
2. **How many `onChanged` records Chrome emits for one aggregate write** (core performs two `port.set` calls: slot then index, `src/core/page-index-store.ts:151-163`), i.e. whether the `A60` one-record-one-repaint count holds in the browser. The unit pin hand-fires a single record (`tests/content-cross-tab-refresh.spec.ts:363`, `:382`).
3. **The author-row popup form end-to-end**: one row per author `<Вы|name> — <count>`, one checkbox acting on the whole author, one `Удалить` acting on the whole author, rows ordered by the author's earliest note. Stated honestly as un-run at `README.md:128-129`.
4. **Popup group `Удалить` in a real page**: the other authors' rows unchanged, the other author's highlights untouched on the page, and the empty state + all highlights gone when the last row of the page is removed (`tests/popup-entry-list.spec.ts:774-797`).
5. **The `A110` blank-author row in a real popup**: the label rendering as « — 1» and the behavior of `@for` with two identical track values (`tests/popup-entry-list.spec.ts:849`, `:887`) — reachable only by hand-seeded storage, so it needs an explicit probe or an explicit `not verified`.
6. **`Tab` reachability of the card controls in a live shadow tree** — carried unresolved from Run 1 (`docs/state/browser-verification-run.md:134`, `:143-145`; `README.md:124-125`), pinned only by `tests/content-create-card-controller.spec.ts`.
7. **Run 2 items 1–5 as a whole**: focus on open (`A97`/`A105`), tooltip click-in (`A96`/`A104`), the `A106`/`A107` stale-selection baseline, per-author colours (`A94`/`A102`), per-author overlap (`A93`/`A99`/`A100`) — planned at `docs/state/browser-verification-run.md:155-167`, not executed.