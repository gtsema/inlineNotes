# Stage plan — extension implementation (request: "начинаем реализовывать")

Owner: interactive PM (main session). Renegotiated budget: **4 stages / 15 tasks** (default limit is 3/3;
Stage 1 grew to 6 tasks — the storage-key constraint appeared in review, and two runtime timeouts on 7-AC slices
proved that one attempt cannot carry that much).
Renegotiation reason: the user asked for smaller tasks; one slice = one verifiable behavior.
Child count: ~15 engineer + 15 reviewer (parallelism 1, one writer per worktree).
Slice-size rule adopted after `t1-03`: a `src/core/` slice carries at most 5 substantive ACs (`docs/specs/code-review-flow.md`).
Gates per task: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs` — quoted by the engineer.

## Stage 1 — toolchain + pure domain rules. Done-criterion: `dist/` loads in Chrome; core rules of caps and page identity are unit-tested.

Human confirmation collected: the user loaded `dist/` in `chrome://extensions` with no errors (t1-01 build) and
reloaded after `t1-02`: **no placeholder card in the page corner** (user, 2026-11-16) — the `t1-02` AC6 end-state
is confirmed on a real browser.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t1-01-toolchain-dist` | package.json/tsconfig/Angular apps/esbuild content bundle/manifest → loadable `dist/` | overlay AC2 (no page DOM touched by design), profile gate contract |
| `t1-02-core-pagekey` | `pageKey` normalization + path-only fallback lookup | model AC4 |
| `t1-03-storage-slot-keys` | legal slot-key encoding + `pages:v1` index + trailing-slash identity | model spec Rules/Storage (spec line edited with the code) |
| `t1-04-entry-model-rules` | entry type with `visible`, 256 code points, 20 entries, author identity and edit rights, ordering | model AC2, AC3, AC7, AC8 |
| `t1-05-storage-port-read-index` | `StoragePort` seam + chrome adapter + index write/repair policy + entry decoding | model Rules/Storage, review findings N1–N5 |
| `t1-06-entry-write-path` | create / update / delete / clear / `setVisible` over the port, quota path | model AC1, AC3, AC7, AC10 |

## Stage 2 — anchors and overlap. Done-criterion: a stored anchor resolves to DOM ranges on a real page; overlap rule is testable.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t2-01-core-anchor-text` | text normalization, `anchor` build, string-level resolve + disambiguation | model AC5 (text part), edge cases same-text |
| `t2-02-content-anchor-dom` | normalized match → `Range` fragments across block/inline boundaries | overlay AC2, edge: multi-block frame |
| `t2-03-core-overlap` | range model, intersection vs boundary-touch rejection | model AC6 |
| `t2-04-core-create-hardening` | `A46` required resolved spans, purity-scan line, `A27`/`A28` spec clauses | closes `t2-03` review remarks 1–4 |

## Stage 3 — content overlay (Preact). Done-criterion: select → card → save → highlight → hover tooltip → edit/delete works on a real article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t3-01-settings-read-core` | **accepted** (`e654892`, attempt 2, `A57`/`A58`) — `loadSettings`/`saveSettings`, decode guard, 429 tests | model AC27–AC28 |
| `t3-01-content-create-card` | **accepted** (`43dd131`+`5f4b82d`, AC2 closed by `ec4ee45` in `t3-01b`) — shadow host, capture, create card, counter, message map | overlay AC1, AC9, AC11, model AC9 |
| `t3-04-content-anchor-hardening` | **accepted** (`20cf8be`+`5aaa777`, attempt 1) — `A36` liveness, `A35` table cells, scan hygiene (`A51`/`A58`), 437 tests | closes `t2-02` + `t3-01` remarks |
| `t3-01b-content-offset-domain-fix` | **accepted** (`ec4ee45`+`e1f0f94`, attempt 1, 548 tests) — code-point-domain trim, astral-before-selection fixtures, `A63`–`A65` | closes the `t3-01` card blocking finding |
| `t3-02-content-highlight-tooltip` | **accepted** (`bc2106c`+`0f1e496`+`bd9ac81`+`ebb8caa`, attempt 2 after a host crash killed attempt 1) — paint pass over one stream, per-entry highlight names, hover tooltip, ownership header; AC1–AC5 green, carried findings 1–3 closed by `t3-02b`, **confirmed on a real browser** | overlay AC2, AC3 |
| `t3-02b-carried-test-fixes` | **delivered** (`a6997f9`+`3462d2a`, attempt 1, 626 tests, no `src/` file touched): card tab order + `A74` no-focus-theft, the save-moment DOM-mutation test for `A29`, the carried-fix checklist rule in `code-review-flow.md`; closes `t3-02` findings 1–3 by a parent-closure re-check | overlay keyboard rule, model `A29` |
| `t3-05-page-boundary-throw-safety` | **accepted** (`14995da`+`6865db2`, attempt 1, 672 tests, 0 blocking findings) — page-boundary throws guarded at the content call sites: a detached-node save answers `selection_lost` instead of freezing the card, `refresh()` cannot reject, throw list in the spec | overlay AC21, model `selection_lost` |
| `t3-03-content-editor` | **accepted** (`8861e6f`+`e25ef91`+`14c58a7`+`4b674ae`; attempt 1 timed out at the ceiling and was recovered by `resume` under `A80`, attempt 2 closed the one blocking finding, 697 tests green) — editor for your own entry prefilled, save/cancel/delete, overlap on re-selection with self-exclusion, foreign entries open no widget | overlay AC4, AC5, AC6, model AC7, AC8, AC11 |

## Stage 4 — extension UI + refresh + docs. Done-criterion: the full loop works offline on an arbitrary article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t4-01-popup-list` | **accepted** (`52afe39`+`ecf9a26`+`6a3b3d7`; run 1 died on a provider stream error, recovered by `resume` under `A80`/`A85`, 734 tests, 0 blocking findings) — Angular popup: rows, per-entry checkbox, empty/restricted/name-required states; `A81`–`A84` as ruled; CF1 handed to `t4-03` | overlay AC7, AC10 |
| `t4-02-options-name` | **accepted** (`1cee49a`+`b872d4a`, attempt 1, 650 tests, 0 blocking findings) — Angular options: name field, validation, first-run random name; **confirmed on a real browser**, which unblocked the whole Stage 3 loop | overlay AC9, model AC9 |
| `t4-03-spa-refresh-docs` | **accepted** (`adfc8e9`+`79acb74`+`e0ae2ec`+`c2d74ab`, 778 tests, 0 blocking findings) — SPA/history re-resolve with a 1000 ms address poll, `storage.onChanged` repaint per record, options-name pickup on a loaded page, CF1 closed; `A87`/`A88` upheld by the reviewer | overlay AC8, model AC1 |
| `t4-03b-watch-pins` | **accepted** (`a35e46f`, 789 tests, +11, comment-only `src/` diff, 0 blocking findings) — the trigger set is now a closed set (exact listener list + runtime `attachments`/`intervals` equality), `pageKeyOfPass()`'s `null` states pinned, the totality boundary named honestly | overlay AC8 pins |
| `t4-04-readme-final-verification` | **accepted** (attempt 1 `e6e7918`+`414e72b`+`e097166`+`5993ac7`+`88c8303`, attempt 2 `70cd3d6` + PM `b771435`; 790 tests; closed at the 4-child ceiling) — Russian README a stranger can follow and that a reviewer fact-checked sentence by sentence, R2/R3/R4 closed, the browser run named as pending | overlay AC9–AC10 surface, model docs |

**Stage 4 is closed (2026-11-17).** Accepted: `t4-01-popup-list`, `t4-02-options-name`, `t4-03-spa-refresh-docs`,
`t4-03b-watch-pins`, `t4-04-readme-final-verification`. Gates at closure: **790 unit tests over 41 files**, `npm run build`
→ a self-contained `dist/` of 10 files, `node scripts/check-agent-config.mjs` → 0 errors / 0 warnings / 87 INFO, `npm run
typecheck` → exit 0, clean tree. The six-item browser verification list **was run on 2026-11-18 in Chrome 157.0.8103.38**
(`docs/state/browser-verification-run.md`): **5 items passed, 1 partially verified, 0 failed** — the only claim left without a
real-Chrome confirmation is the `Tab` order of the card's controls in a live shadow tree.

### Improvement backlog (user-requested, **not started**)

Six changes recorded on 2026-11-18 during the browser run in `docs/state/improvement-backlog.md`: per-author overlap rules (B1,
narrows `A26`), per-author highlight colors (B2, overturns `A28`), popup grouped **per author** instead of per note (B3, moves
`visible` off the entry and re-opens delete semantics), tooltip opaque on hover with no click (B4, rewrites the click half of
overlay AC3), and focus into the note field on open (B5, **overturns `A74`** outright); plus the page-host line dropped from the
popup (B6, amends the popup contract while `A49` keeps the address read). Fourteen observable-behavior questions
must be answered before B1–B3 can be specified; the proposed order is B4+B5+B6 → B1+B2 → B3.

### Known debt named at Stage-4 closure (no task opened)

1. The popup checkbox has no label of its own (`A91`); its accessible name is the author name.
2. `src/core/slot-key.ts:10` claims the decode identity for "every page key" while the same comment says a truncated slot key
   is not reversible — a core-comment pass should fix the wording.
3. The url watch is address-based: a same-address re-render is not a trigger (spec'd decision).
4. A refused popup write is silent (`A84`); overturning it costs one string + one spec line + one test.
5. `main.ts` glue (`claimSelection`, `onCreated`, `onDeleted` wiring) is unpinned in jsdom by design; the browser is where it
   is verified — currently an open browser item, not a passed one.

## Harness decisions taken by the PM during Stage 1

- `.pi/agents/code-reviewer.md` moved from `acceptance: checked` to `acceptance: { level: none, reason: … }`: the
  runtime rejects a read-only reviewer for not producing a structured acceptance report, although its verdict is the
  review artifact. `docs/specs/code-review-flow.md` records the rule; `node scripts/check-agent-config.mjs` → 0 errors.

## Stage 1 close-out (after `1e91276`)

Done: every business rule of `docs/specs/inline-comment-model.md` with no DOM dependency exists in `src/core/` and is
unit-tested against the in-memory port — page identity and slot-key encoding, the entry model, the 256-code-point and
20-entry caps, author identity and edit rights, ordering, the `StoragePort` seam with one adapter, the index
read/write/repair policy, the decode guard, and the whole write path (create / save / delete / `setVisible` / clear,
with refusal codes). 257 tests over 14 files, build green, checker clean.

Still open by design: the overlap rule and Flow-3 step 6 (→ `t2-03`), the anchor codec (→ `t2-01`/`t2-02`), staleness
end-to-end (→ `t2-01`/`t2-02`/`t3-03`), every UI half of the model ACs (→ Stage 3/4), `settings:v1` decode and the
first-run name wiring (`A15` → `t4-02`), the Russian message strings (→ `t3-01`, `t4-01`), and `storage.onChanged`
cross-tab refresh (→ `t4-03`). Known v1 limitation, accepted: a read-modify-write race between two tabs.

## Runtime rulings taken during Stage 1

- `A9` timestamps are UTC ISO-8601 `Z` from an injected clock; `A10` decode defaults live in the core read path;
  `A11` one code `name_required` for v1 (the options page refuses a longer name at input); `A12` `setVisible` is a
  pure core helper, not Angular logic.
- `A13` `timeoutMs` stayed 1800000 after the first two timeouts, with "commit early" added to cross-layer briefs.
- `A14` index repair is per-page on read; `A15` `settings:v1` decode belongs to `t4-02`; `A16` unreadable stored
  records survive every write and die only with `clear page`; `A17` only an absent or valid-empty slot is repaired;
  `A18` no `QuotaError` type — the vocabulary is `StorageFailureError` + `code`.
- `A19` after the third timeout the ceiling became **3600000** (profile first, then the three roles, then the checker
  which now reads the number from the profile).

## Stage 2 pre-issued rulings

- `A20` a block-level boundary contributes exactly one space to the page text stream (`t2-02`).
- `A21` `script`, `style`, `noscript`, `template`, `head` never enter the stream; hidden-but-rendered text does.
- `A22` a hidden entry still blocks overlap (`visible` is painting only).
- `A23` two entries are duplicates when the resolved range and the normalized comment are equal.
- `A24` a stale entry has no range and cannot cause an overlap.

## Carried-fix slices (ruling `A48`) — **confirmed by the user (2026-11-16: "Да, давай")**

`A48`: **more than two carried review findings get their own slice**, never stacked onto the next feature task (the rule
is in `.pi/skills/delivery-planning/SKILL.md`, learned when `t2-03` died with 5 AC + 4 carried fixes). Applying it to
the `t2-02` and `t2-03` reviews adds two small tasks: **`t2-04-core-create-hardening`** (core) and
**`t3-04-content-anchor-hardening`** (content anchor directory). Consequence: **Stage 2 = 4 tasks, Stage 3 = 5 tasks**,
both above the ≤3 budget. Default applied, because leaving the findings unclosed means building UI on top of a known
liveness bug (`N1`) and a silently skippable overlap check (`A46`).

## Stage 3 split (ruling `A34`) — **confirmed by the user (2026-11-16): "оставляем"**

`t2-02` — a two-layer slice (core-adjacent DOM code + a new jsdom harness) — overran even the 60-minute ceiling.
`t3-01` as originally briefed is strictly bigger: shadow host + selection capture + card UI + a new core settings read
+ a message map, i.e. three layers. `A34` splits it into `t3-01-settings-read-core` (pure core, 3 AC) and
`t3-01-content-create-card` (content only, 5 AC). Consequence: Stage 3 becomes 4 tasks, which exceeds the
≤3-tasks-per-stage budget, so it was put to the user as a renegotiation item. **The user approved the split**, so
Stage 3 is 4 tasks by agreement, not by a silent PM override. Order: `t3-01-settings-read-core` →
`t3-01-content-create-card` → `t3-02` → `t3-03`.

## Open questions asked of the user (least-risky defaults applied if unanswered)

- `A1` `visible` flag: overlay spec persists it in the entry record, model spec entry shape omits it. PM default: `Entry.visible: boolean` (default `true`), `inline-comment-model.md` edited in the same commit as `t1-04`.
- `A2` Anchor tests need a DOM — **user delegated the choice to the PM (2026-11-16), PM decision: approved**.
  `jsdom` is added as a **dev** dependency and used only as the Vitest environment for anchor/DOM tests in
  Stage 2 (`t2-02`). Runtime dependencies stay `@angular/*` + `preact`; `jsdom` must never appear in
  `dependencies`, in `src/manifest.json`, or in any shipped bundle.
- `A3` Build wiring: Angular application builder for popup+options, esbuild for the content/core bundle, one node script assembles `dist/` + copies the manifest. Default accepted (t1-01 review `accepted`).
- `A5` PM ruling on t1-01 remark 2: `content_scripts.matches` is narrowed to `http://*/*` + `https://*/*`; the spec line lands in `content-overlay-ui.md` with the t1-02 commit.
- `A6` PM ruling on t1-01 open question 2: the overlay shadow root mode stays `open` for v1 (dev-tool inspectability during the manual verification loop); `t3-01` owns the widget.
- `A7` PM decision (platform constraint found in the `t1-02` review): `chrome.storage.local` forbids `.` `/` `\` `"` in a key and caps it at 256 characters, so `notes:v1:<url>` was never legal. Layout becomes `notes:v1:<escaped slot key>` plus a `pages:v1` index key; the spec line is edited together with the code.
- `A8` **Confirmed by the user (2026-11-16)**: a trailing slash is not part of page identity — `/a` and `/a/` are the same page.
- `A35` (t2-02 remark `N8`): `td`/`th` join the `A20` block-boundary list, so `<td>a</td><td>b</td>` streams as `"a b"`.
- `A36` (t2-02 remark `N1`): anchor location is all-or-nothing — any mapped node detached ⇒ `anchor_stale`, never a
  half-live fragment set.
- `A37` (t2-03 brief): overlap is computed on resolved half-open code-point ranges from one re-resolve pass; a shared
  block-boundary separator counts as touching, not sharing.
- `A38`–`A40` (t3-02 brief): CSS Highlight API with one named highlight per entry; teardown deletes every
  `inlinenotes-…` name; hidden and stale entries are simply absent from the paint (no dimmed state).
- `A41` **confirmed by the user (2026-11-16: "Да")** (t3-02): the CSS Highlight API cannot be styled from the shadow tree, so the
  paint style must be registered at document level. PM default, in order of preference: append a constructed stylesheet
  to `document.adoptedStyleSheets` (no page element added), and only if the Stage 3 smoke shows that does not apply
  `::highlight()` rules, fall back to exactly one `<style id="inlinenotes-paint">` element — which then forces an edit
  of overlay AC2 ("no page element other than the overlay host"). Rejected for v1: `chrome.scripting.insertCSS`
  (needs a `scripting` permission the manifest does not have).
- `A42`–`A45` (t3-03 brief, defaults applied without an answer): click outside the editor = cancel, not save; `Esc` =
  cancel; `Удалить` deletes immediately with no confirmation and no undo in v1; a re-selection made inside the editor
  may move the entry's range and is overlap-checked excluding the entry itself (`A45`, on top of `A37`).
- `A46` (`t2-03` remark 3): resolved spans become **required** on `createEntryOnPage`, so a caller cannot silently skip
  the overlap and duplicate checks; `CreateAttempt.spans` stays optional for pure rule tests. PM default, one `?` to revert.
- `A47` (`t2-03` remark 5): `duplicate` gets its own Russian message `Такая заметка на этом выделении уже есть`, distinct
  from the overlap message, because the two refusals ask the user for different actions.
- `A48` **confirmed by the user (2026-11-16)**: a review that leaves more than two carried findings produces its own cleanup slice — `t2-04-core-create-hardening`
  and `t3-04-content-anchor-hardening`, which makes Stage 2 4 tasks and Stage 3 5 tasks. Awaiting the user's confirmation.
- `A50` (t4-01): the popup changes visibility through core `setVisible`; the page repaints via `storage.onChanged`
  (`t4-03`), not via a popup→content message. PM default so the two tasks do not both invent a channel.
- `A49` **confirmed by the user (2026-11-16: "берём табс")** (t4-01): the popup needs to know which page is current. Chosen: add the
  `tabs` permission to the manifest (the popup then works on any page, including pages where the content script cannot
  run). Alternative: zero new permissions via a service worker + `chrome.storage.session` page-key map, at the cost of
  a new moving part and a popup that is blind on restricted pages. Install-time warning is the trade-off to decide.
- `A54` (t4-02): first run **generates** the author name (`generateAuthorName(rng)` + `saveSettings`) instead of asking
  the user to invent one; only the options page may generate a name, the content layer only refuses to open the card.
- `A55` (t4-02): the options counter and its refusal measure **code points** via the core helpers, never `String.length`.
- `A56` (t4-02): saving an unchanged name still calls the core save (it is how a damaged record gets repaired) and shows
  a saved state rather than a fake write.
- `A59` **open question for the user** (t4-03): SPA URL change detection. Default: poll `location.href` every 1000 ms
  plus `popstate`/`visibilitychange`; alternative: no timer, but a same-document `pushState` stays invisible until the
  user interacts. Reverting the default is one constant.
- `A60` (t4-03): `storage.onChanged` triggers a re-read and repaint only for this page's slot key and `settings:v1`; it
  is not a merge, the cross-tab race stays a documented v1 limitation.
- `A61` (t4-03): stale entries keep their popup row and stay deletable; only the Russian wording is added here.
- `A59` still **unanswered by the user** (t4-03): SPA detection. The default (poll `location.href` every 1000 ms plus
  `popstate`/`visibilitychange`) is applied as an assumption; one constant to revert.
- `A62` (t3-04 review remark 1): the green gate is an **ordered** sequence — `npm run build`, then `npm test`, then
  `node scripts/check-agent-config.mjs` — because one test fails when `dist/` is missing. Recorded in the profile.
- `A63` (t3-01 card review remark 3): a user-visible timing may not live only in code — the `settle delay` value is
  pinned in the spec Terms and asserted against the constant.
- `A64` (**user confirmed 2026-11-16, reworded after `t3-01b` review**): if measuring the selection throws during the
  settle, **the card never opens** (the box is measured before mounting); not "opens then closes".
- `A66` (`t3-01b` review remark 3): in the paint pass a measurement throw is per entry — no highlight, no frame, no
  tooltip, the same observable state as `anchor_stale` (`A40`); the `catch` wraps only that entry's measurement, never the
  whole pass, and never touches storage.
- `A67` (assumption, `t3-01b` readiness): a zero-area fragment gives the tooltip nothing to anchor to — the tooltip
  anchors to the first fragment that has an area; if none has one, no tooltip. The entry stays listed and deletable.
- `A68` (`t3-01b` readiness): the paint pass owns `CSS.highlights` exclusively; card visibility never clears it, or every
  card close flickers the highlights.
- `A69` (`t3-01b` review remark 6): the `A53` two-commit sequence satisfies the "spec in the same commit" rule for the
  task as a whole when both commits are inside the reviewed range and the brief names the spec file.
- `A65` (**user confirmed 2026-11-16**): zero-area fragment boxes do not participate in placement; all-zero falls back to
  the viewport rule.
- The user chose a **separate fix slice `t3-01b`** instead of spending the parent task's last child on a third engineer
  attempt, which the delivery rule forbids. Stage 3 is 6 tasks; `t3-01-content-create-card` stays `changes requested`
  until `t3-01b` is accepted.
- `A70` (PM correction, before delegating `t3-02`): painting uses **one named highlight per entry**
  (`inlinenotes-<entryId>`), as `content-overlay-ui.md` line 47 and rulings `A38`/`A39` already say. The `t3-02` brief
  had been written with "a single highlight name", which contradicted the spec; the spec wins, the brief was fixed.
- `A71` (**accepted PM decision**, `t3-02` review remark 2 context): the engineer split `content-overlay-ui.md` AC3 and
  Flow 4 into "shipped half" (hover → opaque) and "editor half → `t3-03`, not shipped" instead of deleting the promise.
  Accepted: the editor promise moves into the `t3-03` spec slice, which must mark AC4/AC5 and Flow 5/6 as shipped in the
  commit that ships them. A spec that describes unshipped behavior as current is debt, not a lie — but it must be labeled.
- `A72` (**process fix**): every brief carries a numbered **carried-fix checklist**, and the engineer report must answer
  each number with `done` + `path:line` or `skipped` + reason. A named deliverable missing from the diff is a blocking
  finding even when all ACs pass; a report silent about it is a finding of its own. Encoded in
  `.pi/skills/delivery-planning/SKILL.md` and `.pi/skills/code-review-checklist/SKILL.md`.
- `A73` (**process fix, host crash**): the Stage 3 PM session died because its context became uncompactable, and the
  running engineer child died with it, leaving an uncommitted slice. Three rules now hold: an **interim commit at every
  green checkpoint** (not one at the end); children never print a full test log and read large files by range; the PM
  reads artifacts by section and copies child reports with `cp` instead of through its own context.
- **Open budget question (asked, unanswered at the time of writing):** closing `t3-02` findings 1–2 needs a 4th child on
  that card and its re-review a 5th, above the ×2 ceiling, and a third attempt on the task is forbidden. Proposed:
  `t3-02b-carried-test-fixes` (tests/spec only, own budget) + a narrow parent-closure re-check, the way `t3-01` was
  closed. Alternative: the user raises the `t3-02` ceiling to 5.
- **The budget question is answered (user, 2026-11-17): option 1.** `t3-02b` is opened with its own budget; `t3-02` stays
  held open until that review re-checks findings 1–2.
- `A74` (**assumption, flagged**): opening the create card **does not steal focus** from the page; the controls are reached
  with `Tab`. Chosen for `t3-02b` because the slice may not touch production code and stealing page focus is a host-page
  intrusion of the same class AC2 forbids. Reverting it is one spec sentence plus one line in `open()`, as its own task.
- **Stage 3 runtime blocker found by the user's smoke attempt (2026-11-17): selecting text does nothing.** Not a defect:
  `create-note.ts:99-100` gates the card on a valid author name (`A31`, model AC9, overlay AC10), and the name cannot be
  set yet — `src/options/options.component.ts` is still the `t1-01` placeholder, and `t4-02-options-name` (the field, the
  validation, `A54` first-run generation) sits in Stage 4. Consequence, decided by the PM: **`t4-02` is pulled forward,
  before `t3-03`**, because Stage 3's done-criterion (select → card → save → highlight → tooltip → edit) is unreachable
  without it and the `A41` smoke observation cannot be made. Until `t4-02` ships, the only way to unblock a manual run is
  writing the record from the extension page console: `chrome.storage.local.set({"settings:v1":{name:"Я"}})`.
- **Stage 3 smoke observations (user, 2026-11-17, recorded in `docs/state/t3-02-content-highlight-tooltip.md`):** the user
  loaded `dist/` unpacked and the painting and tooltip path works on a live page — `::highlight()` rules **do** apply
  through `document.adoptedStyleSheets`, so `A41` **variant 1 is confirmed** and variant 2 is dropped; overlay AC3
  (hover tooltip, click → opaque, no editor) and the dismiss-on-scroll rule are confirmed; no console errors. Only
  `pointermove` cost on a very long article stays unverified and is carried to the `t4-03` verification list.
- `A75` (**new task `t3-05-page-boundary-throw-safety`**): a page-boundary throw is caught at the **content call site**, never
  in core, and converts into an existing refusal code instead of wedging a widget. Trigger: `range.intersectsNode` throws
  `InvalidAccessError` in a real engine when the selected node was detached, jsdom answers `false`, and the pinned
  `selection_lost` is therefore a jsdom-only answer — the card freezes `busy` with `Сохранить` disabled and no message.
  Order after `t4-02`: the editor must not be built on a save path that can wedge.
- `A76`: `extension-engineer` may edit `docs/specs/code-review-flow.md` **only** under a numbered PM ruling that names the
  file, cited in the commit message (resolves the `docs/specs/INDEX.md` ownership row for that spec, which names
  `project-manager`).
- `A78`: **the editor owns a comment and a delete only** — a successful re-selection decides the `overlap` answer and moves
  no stored range; moving a note to other words is a delete plus a create. Rejected alternative: an anchor-carrying core
  write, which is a `src/core/` change and re-opens the `text`/`anchor` consistency rule accepted in `t1-06`.
- `A80`: **a wall-clock timeout is not an attempt.** Recover with `resume` of the same child session and a narrowed,
  commit-first order (scratch files out, green, commit, AC by AC, stop early). A resume counts as a child in the delegation
  counter; a fresh attempt is only for a brief whose approach changed. Related wording rule: a brief excludes the **task
  state file** by name, never `docs/state/*`, because the role's `output:` path lives there — the `t3-03` resumed run died
  exactly on that contradiction, after all its work was committed.
- `A81`: the popup's not-injectable state gets one line, «На этой странице подсветка недоступна» — the Edge Cases sentence
  requires the popup to **state** it, so "render nothing" was not a legal option.
- `A82`: **a spec outranks a task card.** The card promised «Не: <name>" "per the overlay spec", the overlay spec ships the
  ownership header instead; the popup reuses it (own «Вы», foreign the stored `authorName`) plus a `row--foreign` marker
  pinned with the header text. When a card cites a spec and the spec says otherwise, the card is corrected, the engineer does
  not resolve it, and the correction is recorded here.
- `A83`: with no usable name the notice «Укажите имя в настройках» renders **above** the list and the list still renders (a
  hidden list would make stored entries invisible and undeletable); the notice itself is the keyboard-reachable control that
  calls `chrome.runtime.openOptionsPage()` and writes nothing.
- `A84`: a **refused** popup write (`setVisible` / `deleteEntry`) stays silent — the popup re-reads the page and shows what
  the store says. Recorded as `Assumption:` because no spec line covers the state and inventing a sentence for it is a larger
  observable change than silence; overturning it costs one string + one spec line + one test.
- `A86`: **the popup does not label stale entries in v1.** Staleness is a page-side locate result (`anchor_not_found` /
  `anchor_stale`), while the popup reads only storage; the two paths that could deliver that knowledge (message passing, a service
  worker mapping `tab.id` → page key) were rejected by `A49`/`A50`. The specified promise holds anyway: a stale entry stays listed
  and stays deletable. This corrected the `A61` sentence that had promised a popup label.
- `A90`: **one comment-only `src/` exception**, naming `src/options/text.ts:12-14`, because leaving a code comment that
  contradicts the just-amended spec is the exact defect `A76` prevents. Comment text only, cited in the commit message.
- `A91`: **no label string for the popup checkbox in v1** — a new Russian UI string plus a spec line plus a test, for an
  accessibility nicety nobody asked for. The README describes the real shape; the debt is named.
- `A92`: attempt 2 removed one false README claim and **replaced it with another** («storage keys carry no address» — the page
  address is in the key, percent-escaped and reversible). The PM fixed the clause and the rule now reads: re-read a wording fix
  for the claim it puts in place of the one it removed.
- `A89`: the `t4-04` engineer edited one line of the **PM-owned** `docs/specs/code-review-flow.md` while following a
  "sweep for dead paths" brief item, with no ruling cited — a breach of `A76`, recorded as one. The edit is kept because the old
  line named `.pi/reviews/…`, a path this repo never used, while practice is `docs/state/<task-id>-review.md`. A sweep item must
  name the PM-owned specs it must not touch.
- `A87`: an **additive pure helper in `src/core/storage-keys.ts`** (`storageChangeConcernsPage`) is key vocabulary, not a
  business-rule change, and belongs in core — the real violation would have been the content layer decoding slot keys itself. A
  brief that says "do not touch core" means "do not change a rule"; an additive helper must still be named as a deviation, as it was.
- `A88`: **`pages:v1` is not a repaint signal** — every write touches the index, so watching it would repaint every open tab for
  every note stored anywhere (`A60`). Consequence accepted: a change that touches only the index is unnoticed; no shipped write does that.
- `A85` (process): a provider **stream error** kills a child mid-sentence with nothing committed, exactly like a timeout.
  Same recovery: `resume` the same session, hand the child the measured tree (`git status`, one-error typecheck summary) and
  order commits per checkpoint. Two such recoveries in two consecutive stages (`t3-03` timeout, `t4-01` stream error) — the mitigation is
  the commit discipline, not the model choice. A third variant hit the `t4-01` **reviewer**: the model endpoint refused a
  connection (`UND_ERR_CONNECT_TIMEOUT` to the local server). Recovery is the same `resume`; a reviewer that dies loses only
  analysis, never code, so it never costs a checkpoint.
- **Ruling `A77` (corrected after the `t3-03` re-review)**: the reviewer re-runs **only** `node scripts/check-agent-config.mjs`
  — the role is read-only and `code-review-flow.md` → Edge Cases plus `docs/project-profile.md:71` forbid it from running a
  build; briefs must not order a reviewer to build or test. A reviewer instead corroborates read-only (declaration counts,
  greps, `.skip`/`.only` absence) and quotes the engineer's gate output. **The three green gates are the PM's duty**, run
  personally on every delivered task before a review is started. (Earlier briefs ordered full gates and some reviewers ran
  them — that variance is now closed.)
- `A75`/`A76` and the `t3-05` closure also fixed one false sentence in the throw table (jsdom does support constructed
  stylesheets; the real limit is that `adoptPaintSheet` is module-private and cached) — a single-sentence spec correction
  made by the PM under the single-spec-slice authority, checker green.
- **The full page loop now works for the user (2026-11-17): name set from the options UI, then selection → card → save →
  highlight → tooltip on a real article, no console workaround.** Stage 3's runtime blocker is closed; what remains
  observable is the editor (`t3-03`), the popup list and checkboxes (`t4-01`), SPA refresh (`t4-03`), and the stuck-card fix
  (`t3-05`).

## Stage 5 — the note model becomes per-author (rulings `A93`, `A94`, `A96`)

Opened 2026-11-18 from the user's improvement set (`docs/state/improvement-backlog.md`). The user is **not** consulted again
until the whole set is implemented; the PM rules on anything new and records it.

| Task | Slice (one verifiable behavior) | Spec / AC anchor | Children |
|---|---|---|---|
| `t5-01-author-overlap` | **accepted** (`7fb52ea`+`731ea9c`+`f1093f3`, +17 tests → 807, 0 blocking) — the overlap and duplicate refusals answer per author at both call sites; one author identity (`isSameAuthor`) everywhere | `inline-comment-model.md` (overlap, duplicate) + `A93`, `A99`, `A100` | engineer, reviewer |
| `t5-02-author-colors` | **accepted** (`c43f64d`+`31f2a2f`, +26 tests → 833, 0 blocking) — a six-slot `author palette`, slot = `fnv1a32(authorName) % 6`; the highlight name stays per entry (`A70`), only the declarations follow the author | `content-overlay-ui.md` (painting, AC25) + `A94`, `A102` | engineer, reviewer |
| `t5-03-tooltip-click-editor` | **accepted** (`0f19bec`+`b064301`+`31977fe`+`b6643b1`+`8f84a0b`, 857 tests, 0 blocking at the 4-child ceiling) — tooltip opaque on hover, the click opens the editor, a strictly-contained own selection opens nothing, Flow 6 and `claimSelection` deleted | `content-overlay-ui.md` AC1–AC9 + `A96`, `A103`, `A104`, `A106`, `A107` | engineer, reviewer |

## Stage 6 — the surfaces follow (rulings `A97`, `A95`, `A98`)

| Task | Slice | Spec / AC anchor | Children |
|---|---|---|---|
| `t5-04-focus-on-open` | **accepted** (`d3ca568`+`729695c`+`b770066`+`0d0c749`+`4a630c8`, 872 tests, 0 blocking) — the caret goes into the note field on open, `preventScroll` at the call shape, focus returns on close, all six `t5-03` carried comment items closed | `content-overlay-ui.md` keyboard rule + `A97` (overturns `A74`), `A105` | engineer, reviewer |
| `t5-05-popup-host-line` | the popup stops rendering the page host line; the address read and `tabs` stay | popup contract + `A98` | engineer, reviewer |
| `t5-06-popup-author-groups` | one popup row per author with a count; the checkbox is an aggregate write over that author's entries; popup `Удалить` deletes that author's whole page set; a new named core operation owns that delete | popup contract + `A95` | engineer, reviewer |

Order is fixed: `t5-01` before `t5-02` (overlaps must be legal before they are colored side by side), `t5-03` is independent,
`t5-06` last (it moves visibility semantics). Gates at every acceptance: `npm run build`, `npm test`,
`node scripts/check-agent-config.mjs`, plus `npm run typecheck`. The browser check happens **once, at the end**, and the user is
invited then.
