# `extension-engineer` report — task `t5-06-popup-author-groups` (Run 2, finish-only slice)

Brief: `t5-06` hit the 60-minute wall after CP3 (not an attempt, `A80`). This run did **not** re-explore: it measured
the two unmeasured gates, walked AC 1–10 against the tree, added the pins that had no owner, answered the four carried
items, and committed at green.

Tree at start: `78f4c32` (clean). Tree at end: `1b4f163` (clean, nothing staged).
Commit chain of this task: `cc10d12` (CP1 specs + README) → `543bcbf` (CP2 core) → `78f4c32` (CP3 popup) → `1b4f163` (CP5 pins, this run).

## 1. Gates (A62 order, each with its own exit status; tails only)

| Gate | Exit | Tail |
|---|---|---|
| `npm run build` | **0** | `[build] dist/ is a self-contained MV3 folder (10 files)` |
| `npm test -- --reporter=basic` | **0** | `Test Files 44 passed (44)` / `Tests 901 passed (901)` |
| `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 113 info(s)` |
| `npm run typecheck` | **0** | `tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit` (no output) |

Test count moved **899 → 901** because this run added two pins (one popup, one core). `README.md:38` and `README.md:113-114`
state the shipped counts, so they were updated to `901 тест в 44 файлах` (the CP3 wording `в 44 файле` is ungrammatical
Russian and was fixed on the same line). The checker's 113 info lines are unchanged (no spec/role path moved).

## 2. AC 1–10 walked against the tree (pins are `path:line` at `1b4f163`)

Note on labels: the `describe` names inside `tests/popup-entry-list.spec.ts` carry the **`t4-01`** AC numbers (that card
owns the popup contract); the `t5-06` AC numbers are the rows below. No pin below is a title-only claim — each names an assertion.

| AC | Status | Pins |
|---|---|---|
| **1** ten own + three foreign → **two** rows, each with author label and count | pinned | `tests/popup-entry-list.spec.ts:150` (**added this run**) — 13 records, the two authors interleaved in the stored order *and* in creation order, answered by 2 rows with counts `[10, 3]` and labels `Вы — 10` / `Вася — 3`; `tests/popup-entry-list.spec.ts:134` one row per author, never per entry; producers `src/popup/page-entries-service.ts:156` (`groupsOf`), `src/popup/text.ts:93` (`authorRowLabel`); spec owner `docs/specs/content-overlay-ui.md:270` (AC26) |
| **2** own row label «Вы», foreign row the stored name, no «Не: » prefix | pinned | `tests/popup-entry-list.spec.ts:498` (header word + `OWN_ROW_CLASS`/`FOREIGN_ROW_CLASS`, foreign header `not.toContain(POPUP_STRINGS.ownEntry)`), `tests/popup-entry-list.spec.ts:518` (`Вы — 3`, `someone-else — 2`); `tests/toolchain-contract.spec.ts:561` (`not.toMatch(/Не: /)`), `:562` (`/Чужая\|Чужой/` absent), `:563` (`'Вы'`); `src/popup/text.ts:82` |
| **3** checkbox = checked iff **every** entry visible; toggling off hides all in one call; page repaints (`t4-03` path untouched) | pinned | `tests/popup-entry-list.spec.ts:403` (writes `visible:false` for every entry of that author and for nobody else), `:417` (one slot write + one `pages:v1` update), `:428` + `:134` (the *iff* both ways), `:441` (no stamp moved, row keeps place), `:459` (foreign group hideable), `:468` (`A50`); core `tests/core-entry-store-write.spec.ts:762`; call site `src/popup/page-entries-service.ts:237`; repaint `tests/content-cross-tab-refresh.spec.ts:317` (the popup's hide removes the highlight, no reload) + `tests/toolchain-contract.spec.ts:320` (exactly one `chrome.storage.onChanged` subscriber in `src`, and it is `src/content/store/chrome-storage-port.ts`) + `tests/toolchain-contract.spec.ts:310` (the popup sends no message); `src/content/**` is absent from `git diff --name-only e0782be..HEAD` |
| **4** toggling on re-shows every one, **including notes hidden individually before this UI existed** | pinned (was thin at the owning layer — **pin added this run**) | core: `tests/core-entry-store-write.spec.ts:789` — `mixedPort()` holds `OWN_TWO` with `visible:false` and `FOREIGN_TWO` with `visible:false`; `setVisibleForAuthor(..., visible:true)` answers `{entries:[OWN_ONE,OWN_TWO]}`, both own records become `true`, the foreign hidden record stays `false` and both foreign records stay the **same objects**, the unreadable record stays `CORRUPT`, and the record's field set is still the per-entry shape; popup: `tests/popup-entry-list.spec.ts:428` (mixed group reads unchecked, one press → stored `[true,true,true]`); rule: `src/popup/page-entries-service.ts:166`+`:174` (`allVisible` aggregate) |
| **5** row `Удалить` removes **every** entry of that author, every other author's record byte-identical | pinned | `tests/popup-entry-list.spec.ts:717` (one press removes all of `vasya`), `:733` (the survivors are the same objects — `toBe`, not `toEqual`), `:751` (one slot write + one `pages:v1` update), `:763` (slot removed before the index, another page keeps its index position), `:593` (foreign group deletable, `A25`); core `tests/core-entry-store-write.spec.ts:881`, `:907`, `:1007`; call site `src/popup/page-entries-service.ts:251` |
| **6** the page card's `Удалить` still removes **exactly one** note | pinned | `tests/content-editor-controller.spec.ts:997` — a page seeded with own + foreign records, one press leaves `['b2c3d4e5f6a1']`, i.e. exactly one record removed with no confirmation step; core `tests/core-entry-store-write.spec.ts:484` (`describe deleteEntry`) and `:504` (the other stored records survive verbatim, by identity); single-id call site `src/content/editor/edit-entry.ts:201` (`deleteEntry(port, { url, id })`); `src/content/` untouched by this task |
| **7** rows ordered by each author's earliest `createdAt`; two authors never interleaved into one row | pinned | `tests/popup-entry-list.spec.ts:184` (stored order scrambled; rows are `[reader-one, petya, vasya]`; and `view.rows` equals `groupsOf(sortByCreatedAtAsc(...))`), `:201` (two authors alternating → exactly `[['vasya',2],['petya',2]]`, never split/merged), `:218` (`A99`: `Вася ` and `Вася` are one row, label prints the earliest record's name), `:150` (interleaved 10/3 case → 2 rows), `:366` (a record the read guard skipped produces no row); producer `src/popup/page-entries-service.ts:279` |
| **8** the two core operations pinned: one write per affected slot, **exactly one** index update per call, the filter is `isSameAuthor`, an author with no entry → empty result and **no write, no index touch** | pinned | `describe` `tests/core-entry-store-write.spec.ts:707`; `:822` (`writesOf(port) === ['set:SLOT_A','set:pages:v1']` and `indexWritesOf(port) === ['set:pages:v1']` for a two-record group); `:833` (`"Я "` answers to `" Я "`); **fourth half** `:851` — both operations answer `{ok:true, entries:[]}`, `writesOf(port) === []` after each, `port.snapshot()` equals the pre-call snapshot and the index value is the **same object**; unit pins `:991` (`authorRecordsOf` is the `isSameAuthor` filter over decoded records, unreadable never listed) and `:1007` (`removedPositions`); popup-side mirror `tests/popup-entry-list.spec.ts:784` (`removeAllOfAuthor('такого автора нет')` → same rows, `writeLines(f) === []`, all four records intact) |
| **9** the 20-entry cap, the 256-char cap, the per-entry record shape and the storage keys unchanged; `src/core/` changed only inside `entry-store-write.ts` | pinned | `tests/entry-rules.spec.ts:107` (the documented caps), `:113` (256 accepted / 257 rejected), `:271` (`page_limit` at 20, not 19), `:537` (the cap still counts every entry whatever its author); `tests/core-storage-keys.spec.ts:65` (the documented key layout); `tests/core-entry-store-write.spec.ts:867` (an aggregate write moves no stamp and changes no field but the flag; the written record's key set equals the per-entry shape) and `:789` (same on the on-toggle half); `tests/toolchain-contract.spec.ts:111` (`permissions === ['storage','tabs']`, no `host_permissions`); diff fact: `git diff --name-only e0782be..HEAD` lists exactly one file under `src/core/` — `src/core/entry-store-write.ts` |
| **10** no page address anywhere, notices keep their place, every Russian string already in `src/popup/text.ts`, label = `<name>` + ` — ` + plain count | pinned | `tests/popup-entry-list.spec.ts:271` + `:330` (five states walked; the view's only fields are `notices` and `rows`; no host / punycode / origin / scheme in the rendered view) and `:338`-`:363` (the template renders no `class="host"`, no `view().host`, no `hostOf`; the title, both notices, the empty line and `class="rows"` are still rendered; no Russian string of the layer carries `https?:`, `www.`, `xn--`, `.com`, `.рф` or `//`); notices: `:608`, `:616`, `:674` (order `name_required` then `page_not_injectable`), `:691` (the map is total), `:695` (the injectable schemes equal the manifest's registered ones); label: `:518` (`Вы — 3`, `someone-else — 2`, `/^someone-else — \d+$/`, `AUTHOR_ROW_COUNT_SEPARATOR === ' — '`), `:234` (a stale entry is counted, `A86`); shape scans `tests/toolchain-contract.spec.ts:387`-`:409` (checkbox / `[checked]="row.allVisible"` / `onToggle(row.authorName, $event)` / `onRemove(row.authorName)` / `{{ labelOf(row) }}` / no `row.id` / exactly two `@for` loops / no `<textarea>` / no `Сохранить`) and `:500`-`:545` (both notice branches stand before `class="rows"`, the list and its `Удалить` sit inside no notice and no ownership gate, the empty paragraph is gated only by the empty check) and `:548`-`:564` (`holderPaths` answers one module per sentence; `'Вы'`, `'Удалить'` live in `src/popup/text.ts`); producers `src/popup/text.ts:61`, `:82`, `:93` |

No AC is left without a pin. Two ACs had **no pin at their owning layer** and got one in `1b4f163`:

- **AC 1** — the card and `content-overlay-ui.md:270` name the example at *ten + three*; before this run the largest
  grouping case in `tests/popup-entry-list.spec.ts` was 1 + 2 records. Added `:150`.
- **AC 4** — before this run the "re-show what an older per-entry checkbox hid" fact was pinned only in the popup
  projection (`:428`); core owned the write and asserted only the write count (`:822`) and the untouched stamps (`:867`).
  Added `tests/core-entry-store-write.spec.ts:789`.

## 3. Carried items 1–4, by number

1. **Delivered in CP3 (confirmed).** `tests/content-tooltip.spec.ts:460` now reads
   `describe('the click of the tooltip (task t5-03 AC2, AC3; ruling A96)')` — no opacity AC cited; the opacity pin stayed
   where it always was: `tests/content-tooltip.spec.ts:389` (`is opaque from the first hover, by the number the spec pins (t5-03 AC1, ruling A96)`).
2. **Delivered in CP1/CP3 (confirmed).** `README.md:12-14` states the shipped tooltip rule (opaque from the first hover,
   no click changes its transparency, own tooltip click opens the editor in place, a foreign tooltip click changes
   nothing) and `README.md:15-16` states that selecting inside my own highlight opens nothing while a create card opens
   on any other selection, per-author overlap only. Fact-checked against the code: `src/content/text.ts` / the tooltip
   stylesheet (`TOOLTIP_OPACITY === 1`, one `opacity:` rule — pinned at `tests/content-tooltip.spec.ts:389`-`:394`) and
   the click route pinned at `tests/content-tooltip.spec.ts:460`-`:527`.
3. **The scan was not moved (confirmed).** The popup template scan still lives in the layer's own spec:
   `tests/popup-entry-list.spec.ts:338` (with the comment at `:339`-`:342` naming `A109` as the reason it is *not* in
   `tests/toolchain-contract.spec.ts`). `tests/toolchain-contract.spec.ts` holds no address/host scan at all — grepping
   it for `hostOf`, `class="host"`, `xn--`, `punycode` returns nothing — so `A109` holds: harness-level greps only.
4. **Both view pins survive the new shape.**
   - View-shape pin: `tests/popup-entry-list.spec.ts:330` (`Object.keys(view).sort() === ['notices','rows']` inside the
     AC1 no-address walk at `:271`), repeated after a refused group write at `:493`. Under the `A108` shape the array
     changed from entry rows to author rows and the assertion still names exactly two fields — the row object's own
     field set is pinned separately at `:539` (`['allVisible','authorName','count','isOwn']`, and neither stored id
     appears in the rendered view), so no address and no entry handle can enter the shape.
   - No-address scan surviving the new shape: `tests/popup-entry-list.spec.ts:338`-`:363`. It re-derives the template
     from `src/popup/popup.component.ts` after the refactor and requires the four rendered blocks that still exist
     (`title`, `notice notice--name`, `notice notice--not-injectable`, `empty`, `rows`) while forbidding `class="host"`,
     `view().host` and `hostOf`; the row-shape half of the same contract is pinned by
     `tests/toolchain-contract.spec.ts:387` (`{{ labelOf(row) }}`, `no row.id`, exactly two `@for` loops).

## 4. What this run changed

- `tests/popup-entry-list.spec.ts` — one new `it` at `:150` (AC1 at the spec's own 10/3 scale, interleaved in both orders).
- `tests/core-entry-store-write.spec.ts` — one new `it` at `:789` (AC4 at the core layer, where the write rule lives).
- `tests/toolchain-contract.spec.ts:356` — name-only fix (`A72` discipline): the aggregate-import scan cited
  `t5-06 AC7, AC9`, but AC 7 is the row **order**; the scan pins one-core-call-per-press and the `src/core` boundary, so
  it now cites `t5-06 AC3, AC5, AC8, AC9`. Assertions untouched.
- `README.md:38`, `:113-114` — shipped counts `901 тест в 44 файлах` (was `899 тестов в 44 файле`).
- No `src/`, no spec, no manifest, no dependency, no harness file changed. Boundaries held:
  `git diff --name-only 78f4c32..HEAD` → `README.md`, `tests/core-entry-store-write.spec.ts`,
  `tests/popup-entry-list.spec.ts`, `tests/toolchain-contract.spec.ts`.
- The card's required grep line, re-measured on this tree:
  `grep -rn "\bsetVisible\b\|\bdeleteEntry\b" src/popup/ | grep -v -E ":[0-9]+: *(\*|//)"` → **no match** (exit 1).
  The only textual mention anywhere in `src/popup/` is the comment at `src/popup/page-entries-service.ts:229`
  ("never one `setVisible` per entry"), and the pin strips comments (`codeOnly`, `tests/toolchain-contract.spec.ts:53`),
  so the scan in `tests/toolchain-contract.spec.ts:356`-`:385` holds: the import clause of the service names exactly
  `['deleteEntriesOfAuthor','setVisibleForAuthor']` and both per-entry names are absent from the whole layer.

## 5. Open questions (not asked, listed instead)

1. **README count churn.** Every future test-count change makes `README.md:38`/`:113` stale. Is the count in README
   meant to be a shipped fact the reviewer re-checks each task (current reading), or should the number be dropped from
   README? Nothing pins it mechanically today.
2. **`toolchain-contract.spec.ts:356` title attribution.** I renamed a CP3 test title (name-only). If the PM wants CP3
   titles frozen as measured, say so and I will revert just that line — no assertion depends on it.
3. **AC 3's repaint half has no end-to-end pin for the *aggregate* write.** `tests/content-cross-tab-refresh.spec.ts:317`
   feeds a per-entry visibility change through the storage watch; the aggregate write produces the same slot value, and
   `A108` says the `t4-03` path is untouched, so I did not add a case. If the PM wants the aggregate shape pinned at the
   page layer too (a group hide arriving in a second tab), that is a new test in `tests/content-cross-tab-refresh.spec.ts`
   — outside this card's boundary list, so I did not write it.
4. **No browser run of the new popup row form.** `README.md:128-129` already says the `A95`/`A108` row shape is confirmed
   by unit tests and the build only. Whether Stage 6 schedules a `chrome://extensions` pass over it is a PM decision; the
   observable list for such a pass is AC 1, 2, 3, 5, 7 and 10 (two rows, labels, one aggregate checkbox, group delete,
   row order, no address).

## 6. Residual risks

- The popup row shape (`t5-06`) has never been run in a real Chrome; AC 1/2/3/5/7/10 are pinned against the service and
  the template text, not against a rendered popup window (`README.md:128-129`).
- A refused aggregate write stays silent and re-reads (`A84` extended): pinned at `tests/popup-entry-list.spec.ts:481`,
  but the user-visible consequence (the checkbox flips back with no message) is an `Assumption:` the user has not confirmed.
- `A108` keeps `visible` per entry, so an older build's per-entry checkbox state is reachable only through the group
  control; AC 4 pins the recovery direction, nothing pins the reverse (there is no single-note hide affordance left, `A95`).
