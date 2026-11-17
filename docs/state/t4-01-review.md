Endpoint recovered; the review was already complete except for writing the artifact. Final evidence pass re-run just now (HEAD `d23f70b`, tree clean of source changes, checker + count corroboration below). No write-capable tool in this role, so the full artifact follows for the runtime to persist at the authoritative path.

---

# Code review — `t4-01-popup-list`, attempt 1

**Verdict: `accepted`** (0 blocking findings; 1 carried fix opened)

Range reviewed: `52afe39` (list over the core API) + `ecf9a26` (`tabs` permission + pins, `A49`) + `6a3b3d7` (spec lines `A81`–`A83`). `253fca2`, `d23f70b` = PM bookkeeping, not counted. Files read: `src/popup/{active-tab,page-entries-service,popup.component,text}.ts`, `src/manifest.json`, `tests/popup-entry-list.spec.ts`, `tests/toolchain-contract.spec.ts`, `docs/specs/content-overlay-ui.md`, `docs/state/t4-01-popup-list.md`, `docs/state/t4-01-engineer.md`.

## Acceptance criteria (one line each)

- **AC1** — quoted: "lists the current page's entries **through core** … sorted by `createdAt` ascending … one row per entry: author name + checkbox + `Удалить` … A scan test asserts no `chrome.storage` access in `src/popup/`" → **pass**. Core path proven: `page-entries-service.ts:196-212` (`loadSettings`/`validateAuthorName`/`loadEntries`/`sortByCreatedAtAsc`/`canEdit`); key resolution stays in core (`src/core/entry-store-read.ts:205` `resolvePageKey(url, index) ?? pageKeyFromUrl(url)`). Tests: `tests/popup-entry-list.spec.ts:104` (order), `:123` (equals core `sortByCreatedAtAsc`), `:137` (index lookup beats tracking noise), `:149` (only core keys asked), `:177` (address comes from the injected tab read). Row = name+checkbox+`Удалить`: `tests/toolchain-contract.spec.ts:345-358`. Scan is **non-vacuous**: `:268-287` greps `codeOnly(text).includes('chrome.storage')` over all 6 files under `src/popup/` (`.ts/.tsx/.html/.json`, `:33-50`, `codeOnly` at `:53` strips comments so prose mentions don't mask a violation) and expects `[]`; the import-clause half forbids storage-key identifiers. Independently backed by the pre-existing whole-`src` pin `:154-161` (only `src/content/store/chrome-storage-port.ts` names `chrome.storage`).
- **AC2** — quoted: "Unchecking … calls `setVisible(… false)` and checking calls it with `true`; the entry stays … and the order does not change" → **pass**. `page-entries-service.ts:158-166`; tests `:193`, `:204`, `:214` (order and both stamps unchanged), `:228` (foreign entry hideable), `:237` (writes touch only index+slot keys).
- **AC3** — quoted (as corrected by `A82`): "own = «Вы», foreign = the stored `authorName` … plus a `row--foreign` CSS marker pinned **in the same test as the header text** … no edit affordance … while `Удалить` is still there (`A25`)" → **pass**. `tests/popup-entry-list.spec.ts:254-272` asserts header text and `rowClass` in one `it` (`FOREIGN_ROW_CLASS === 'row row--foreign'` at `:271`); `:274` re-owning after a name change; `:304` no-name ⇒ all foreign; `:313` foreign row still deletable. No edit path: `tests/toolchain-contract.spec.ts:336-343` (no `updateEntryComment`/`createEntryOnPage`/`clearPage` anywhere in `src/popup/`) + `:345-358` (no `<textarea`, no `Сохранить`, no `onSave`).
- **AC4** — quoted: "no name → `Укажите имя в настройках` + a link to options … not injectable → … message … **while the list still renders**" → **pass**. `page-entries-service.ts:203-211` (notices pushed, rows built unconditionally), `:118-141` (`isInjectableUrl`), `:186-190` (`openSettings` ⇒ `openOptions()`, no write). Tests `:328`, `:336` (notice **and** 1 row), `:344` (opens options, write count unchanged), `:356` (`file://` ⇒ line + list kept), `:370`/`:378`/`:387`, `:395` (notice order fixed), `:412` (map total), `:416` (`INJECTABLE_SCHEMES` ≡ `content_scripts[0].matches`). The button-as-control render half: `tests/toolchain-contract.spec.ts:353`. DOM order "above the list" is not pinned by any test — see remark 1 / CF1.
- **AC5** — quoted: "A delete removes the row immediately … and the empty state appears when the last row is deleted" → **pass**. `page-entries-service.ts:173-181`; tests `:430`, `:443` (rows empty, slot dropped, index no longer names the page). Empty-state *paragraph in the template* not pinned — remark 1 / CF1.

## `A84` agreement

**Agrees.** `page-entries-service.ts:161-163, 176-179` discard the `setVisible`/`deleteEntry` result and always rebuild via `viewOf(url)`, so a refused write shows the store's truth. No third notice string exists: `PopupNoticeCode` = exactly two codes (`:57`), `POPUP_NOTICE_TEXT` two keys (`src/popup/text.ts:51-54`), pinned total at `tests/popup-entry-list.spec.ts:412`; `tests/toolchain-contract.spec.ts:360-369` pins the holder set of both sentences. Spec carries the same sentence in the new "Popup checkbox" bullet (`content-overlay-ui.md`, Rules/Semantics).

## Manifest and permission pin (`A49`)

`src/manifest.json:6` = `["storage","tabs"]`; the only manifest line changed in the range (one-line diff). `host_permissions`/`optional_permissions` absent, `content_scripts`, `action`, `options_page`, `version` untouched. Pin `tests/toolchain-contract.spec.ts:105-118` is **honest, not a widening loophole**: it replaced `toEqual(['storage'])` with `toEqual(['storage','tabs'])` (order-sensitive), kept both `toBeUndefined()` assertions, and *added* two assertions requiring the spec to state the pair. `ecf9a26` contains manifest + spec line + pin in one commit — the same-commit rule met literally, better than the `A69` exception.

## Layer rules

Popup writes only through core: `page-entries-service.ts:38-42` is the only core-entry import set in the layer; the component names no core rule (`tests/toolchain-contract.spec.ts:319-334`). `chrome.tabs` named by exactly one shipped module — `src/popup/active-tab.ts:25-27` only (grep of `src/popup`), pinned `:289-301`. Only chrome API calls in the layer: `chrome.tabs.query` + `chrome.runtime.openOptionsPage` (`popup.component.ts:27`). **No message passing and no `storage.onChanged` listener**: `tests/toolchain-contract.spec.ts:310-317` greps `sendMessage`/`connect`/`chrome.storage.onChanged`; a grep of all `src/` for `onChanged` returns only a comment (`page-entries-service.ts:27`) — the engineer did **not** take `t4-03`'s work.

## UI strings

New Russian strings in the layer: `nameRequired` (spec/`A83`), `notInjectable` (`A81`), `delete: 'Удалить'` (Terms table + `src/content/text.ts:52` — report deviation 2 accepted), `ownEntry: 'Вы'` (`A82` reuse of `src/content/text.ts:59`). `title`/`emptyState` pre-existed at `c4abdcf:src/popup/text.ts`. All in `src/popup/text.ts`; `popup.component.ts` has zero Cyrillic outside comments; no English rendered to the user (`index.html` has `lang="ru"`, only `<app-root>`). No «Не: », no `Чужой/Чужая` (`tests/toolchain-contract.spec.ts:370-374`).

## "Deliberately not done" / "Residual risks" — judgement

All acceptable v1 debt except risk 1, which is partially real. Risk 2 (`chrome.tabs.query` against a fake; install warning) → browser check, already routed by the PM to `t4-03`. Risks 3–4 (stale name/snapshot while the popup is open) → unspecified interleaving, belongs to `t4-03`'s listener ruling; not a finding. Risk 5 (silent refused write) = `A84`, agrees. **Risk 1**: the template greps are enough for the *row* contract, but not for the two AC clauses that are about placement: nothing pins that the list renders under a notice, nor that the empty-state paragraph renders — a template refactor that deleted `<p class="empty">` or nested the list inside a notice branch would keep every current grep true while breaking `A83`/`A81`/AC5. That is one grep, so it becomes a carried fix rather than a blocking finding (the behavior itself is correct in code and the view-model half is tested).

## Gates (`A77` as corrected)

Re-ran only the read-only checker: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 79 info(s)` (matches the report and the PM's run). Read-only corroboration: 39 `tests/*.spec.ts`; 734 `it(`/`test(` at HEAD vs 697 at `c4abdcf` (+37); 0 `.skip(`/`.only(`/`xit(`/`xdescribe(`. Report quotes `npm test`, `npm run build`, the checker and the `dist/manifest.json` permission readout (`docs/state/t4-01-engineer.md:140-153`) — quotes present and complete; PM ran the full gates personally.

## Blocking findings

None.

## Carried fixes

- **CF1 → `t4-03`** (from this review): pin the render half of AC4/AC5 in `tests/toolchain-contract.spec.ts:345-358`: (a) `expect(template).toMatch(/class="empty">\{\{ emptyState \}\}/)`; (b) document order — index of both notice branches (`notice--name`, `notice--not-injectable`) precedes `class="rows"`, i.e. the notices render **above** the list (`A83`, `A81`); (c) the list block is not guarded by a notice or ownership condition, so `@for (row …)`/`@if (view().rows.length === 0)` are siblings of the notice loop, and the `Удалить` button is not wrapped in `@if (row.isOwn)` (`A25`).

## Non-blocking remarks

1. `src/popup/popup.component.ts:75-77` + `:65-73` — the empty-state paragraph and notice-above-list ordering are unpinned (CF1).
2. `src/popup/page-entries-service.ts:49` — `INJECTABLE_SCHEMES` is a second copy of `content_scripts[0].matches`; sanctioned by the new spec `- Permissions:` bullet and pinned by `tests/popup-entry-list.spec.ts:416-427`.
3. `src/popup/page-entries-service.ts:158-179` — every checkbox press re-reads settings + index + slot; correct under `A84`, trivial at ≤20 entries.
4. `src/popup/popup.component.ts:79-90` — own and foreign rows differ only by class, so "foreign row keeps `Удалить`" is proven at the service level (`tests/popup-entry-list.spec.ts:313`) rather than as a rendered row; CF1(c) closes it.
5. `src/popup/text.ts:43,45` — `'Вы'`/`'Удалить'` duplicate `src/content/text.ts:59,52`; allowed by the one-constants-module-per-layer rule and mandated by `A82`/`A25`; no pin forbids a third variant of *these two* (only of the notice sentences, `tests/toolchain-contract.spec.ts:360-369`).
6. Spec-vs-card conflict (`A82`) was resolved by the PM before implementation; the card line was corrected, so no `blocked` condition applies.
7. The README Russian line explaining `tabs` (`A49`) is owned by `t4-03` per the state file — must be executed there, not here.

Evidence path: `docs/state/reviewer-report.md` (this artifact), `tests/popup-entry-list.spec.ts:103-451`, `tests/toolchain-contract.spec.ts:105-118, 261-375`, `src/popup/*`, `git show --stat 52afe39 ecf9a26 6a3b3d7`.