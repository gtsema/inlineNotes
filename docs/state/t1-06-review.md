# t1-06 — code review (attempt 2)

Task: `t1-06-entry-write-path`. Reviewer: `code-reviewer`, read-only.
Range reviewed: `git diff 043412c..1e91276` — one commit `1e91276 feat(t1-06): entry write path` (8 files, +1462/-6).
HEAD == 1e91276 and `git status --porcelain` is empty, so every file read during this review is identical to its
committed blob in the reviewed commit. Upper bound is the briefed commit, not HEAD-as-such.
Changed paths in range (verified with `git diff --stat`): `docs/specs/inline-comment-model.md` (M),
`src/core/entry-rules.ts` (M), `src/core/entry-store-write.ts` (A), `src/core/page-index-store.ts` (M),
`tests/core-entry-store-write.spec.ts` (A), `tests/core-storage-keys.spec.ts` (M),
`tests/core-storage-port.spec.ts` (M), `tests/toolchain-contract.spec.ts` (M).
Slice size: 5 substantive AC + gates — inside the `src/core/` limit of `docs/specs/code-review-flow.md` → Rules.
Attempts: 2 (attempt 1 timeout, attempt 2 completion brief) — inside the ≤2 budget, no third attempt implied.

## Verdict

**accepted**

Every AC is `pass`. No blocking finding, no spec/code conflict, no forbidden dependency, no host-DOM or network
surface, the three green-gate outputs are quoted in the engineer report ("Commands run" 1–8), and the risks this
slice had to close (t1-05 residual 3, 4, 5, 6, 7, 9 + remarks `R3`, `R6`; t1-04 residual 2, 4, 6) are closed.

## Acceptance criteria (one line each)

- **AC1 — `createEntryOnPage` — pass.** Signature and result shape (`src/core/entry-store-write.ts:165-205`); Flow-3
  order through `assertCreatable` fed `decodableEntries(context)` — only the resolved page's list
  (`:175-179`, `:504-513`; tests `tests/core-entry-store-write.spec.ts:217` order, `:238` cap per `pageKey`,
  `:248` cap counts decodable records only); persisted `normalized` name/comment
  (`:187,189`; test `:175`); `id` from `randomId(rng)` with exactly 12 rng calls (`:185`; test `:183`); both stamps
  equal the injected `now` and satisfy `ISO_UTC_TIMESTAMP_PATTERN` (`:191-192`; test `:195`); round trip
  write→`loadEntries` with `codes: []`, `corruptCount: 0` (test `:206`).
- **AC2 — `updateEntryComment` — pass.** `not_author` before the comment rules (`:233-235`), tested for a foreign,
  a case-different and a whitespace-different name with an unchanged slot and an empty write log
  (`tests/core-entry-store-write.spec.ts:367`); only `comment` (trimmed) and `updatedAt` change — the stored record
  deep-equals the seed with exactly those two fields (`:319-331`) — and the port-level snapshot case pins stored keys
  unchanged, the other page's slot identical by reference, index order preserved, unreadable neighbour by identity,
  nine stored fields (`tests/core-entry-store-write.spec.ts:333-353`).
- **AC3 — `deleteEntry` / `clearPage` — pass.** Ordering pinned on the port call log
  `get pages:v1 → get <slot> → remove <slot> → set pages:v1` (`:448-465`), slot-before-index removal is the real
  primitive (`src/core/page-index-store.ts:180-189` used at `src/core/entry-store-write.ts:480-483`); a failed
  removal leaves `pages:v1` untouched (`tests/core-entry-store-write.spec.ts:780`); `clearPage` leaves two other
  slots and the `[PAGE_B, PAGE_C]` order intact (`:504-522`), writes nothing when there is nothing to clear (`:533`),
  and clears a variant-keyed page through the indexed slot (`:544`).
- **AC4 — `setVisible` — pass.** Pure helper `setEntryVisibility` (`src/core/entry-rules.ts:180-197`: one field
  flipped, anchor copied, `updatedAt`/`createdAt` untouched, input not mutated; test
  `tests/core-entry-store-write.spec.ts:656`) plus the write (`src/core/entry-store-write.ts:290-315`). Not
  authorship-gated, and the spec says so explicitly: `docs/specs/inline-comment-model.md:69` ("Changing it is not an
  edit: the checkbox … works for an entry of any author … a visibility write never changes `updatedAt`"), which
  matches `docs/specs/content-overlay-ui.md:47` (row = author name + checkbox for every entry). Test: foreign entry
  (`:613`), `updatedAt` never moved (`:626`), hidden entry keeps its anchor and stays in the read (`:636`).
- **AC5 — failure honesty — pass.** Quota on a save and serialization on a create change nothing and carry the code
  (`:436`, `:757`); index-write failure is reported and leaves the landed slot readable through `loadEntries`
  (`:769`); `layout_version` and `index_malformed` refuse with that code, the foreign blob byte-identical, no write
  attempted (`:715`), and the same refusal for save/delete/visibility/clear (`:732`); a failed index **read** refuses
  with `storage_unavailable` instead of the `pageKeyFromUrl` fallback, for all five writes (`:671`, `:681`); a
  failed slot read refuses (`:707`); unreadable raw records survive create/save/delete/`setVisible` and die only on
  `clearPage` (`:259`, `:394`, `:467`, `:613`, `:524`) — ruling `A16`; a non-slot slot value and a foreign slot
  `version` refuse every write except clear (`:559`, `:580`).
- **AC6 — gates green and quoted, plus `R6` and `R3` — pass (quote present and independently cross-checked).**
  `npm test` 14 files / 257 tests, `npm run build` self-contained `dist/`, `node scripts/check-agent-config.mjs`
  "0 error(s), 0 warning(s), 9 info(s)". I re-ran the read-only checker: identical output, exit 0. The quoted 257
  equals a static `it(` count of exactly 257 over exactly 14 files (7+6+20+16+50+20+19+18+13+15+5+28+31+9), with no
  `it.each`/`describe.each`/`.skip`/`.only` and no loop-generated cases; arithmetic cross-check: t1-05's 206 + 50 new
  write cases + 1 new boundary scan = 257. `R6` fixed: `tests/core-storage-keys.spec.ts:86-88` now asserts the
  universal 246 bound. `R3` fixed: `tests/toolchain-contract.spec.ts:123-129` asserts that exactly one shipped file
  contains `chrome.storage` in code and that it is `src/content/store/chrome-storage-port.ts` — a second consumer
  makes the array two elements long and fails the test. `entry-store-write.ts` is in the `MODULES` purity list
  (`tests/core-storage-port.spec.ts:141-147`).

## Boundary checks for this slice

- **Write ordering.** Slot then index on create/update (`src/core/entry-store-write.ts:486-490`; log test
  `tests/core-entry-store-write.spec.ts:163`), slot removal then index removal (`:479-483`; log test `:448`). A
  failed slot write leaves the slot and `pages:v1` untouched and returns the port code (`:436`, `:757`); a failed
  index publication is reported, not retried (`src/core/page-index-store.ts:124-127`, test `:769`).
- **Refusal rules.** `unusableIndexCode` (`:426-433`) rejects `layout_version`, `index_malformed` and the
  `storage_unavailable` produced by a failed index read **before** the key is resolved
  (`:388-391`), so the `resolvePageKey(url, index) ?? pageKeyFromUrl(url)` line (`:393`) is unreachable on an index
  read failure — `readPageIndex` converts a throwing `get` into that code
  (`src/core/page-index-store.ts:113-119`). No write path can publish a one-key index over a foreign blob
  (test `:715` asserts `storedKeys()` stays one key). A missing `pages:v1` carries no code, so a first write still
  works (`:144`). `page_key_unnormalized` / `page_key_invalid` deliberately do **not** refuse, so a legacy indexed
  key keeps its slot (test `:285`).
- **`A16` verbatim survival.** Pinned against the port snapshot by object identity, not by count:
  `expect(records[0]).toBe(CORRUPT)` on `port.snapshot()` at `tests/core-entry-store-write.spec.ts:271`, `:351`,
  `:465`, `:623`, and the pure producers carry stored records by identity (`:827-838`). Unreadable records also
  count toward the cap only as decodable ones (`:248`).
- **Authorship.** `updateEntryComment` refuses with `not_author` (`:233`); `setVisible` is not gated and the spec
  backs that (`docs/specs/inline-comment-model.md:69`); delete/clear are not gated and the spec does **not** say so
  — see remark R1.
- **Field discipline.** `setEntryVisibility` never touches `updatedAt` (`src/core/entry-rules.ts:195-196`, test
  `:656`, `:626`); `updateEntryComment` changes only `comment`/`updatedAt` (`:245-249`, tests `:319`, `:333`).
- **Injected values only.** Persisted name/comment are `normalized` (`:187,189`); stamps come from `input.now`
  (`:191-192`); ids from `randomId(input.rng)` (`:185`); no clock or randomness of its own in the module.
- **Cap scoping.** `assertCreatable` receives the current page's decodable list only (`:175-179`; tests `:238`,
  `:248`) — closes t1-04 residual 2.
- **Purity.** No `chrome.`/DOM/`Date`/`Math.random`/network/`any`/`@ts-ignore`/non-relative import in the new
  module, test-enforced (`tests/core-storage-port.spec.ts:141-178`); grep over `src/` confirms the only
  `chrome.storage` code site is the adapter; no `crypto` anywhere in `src/core/` (see remark R6 for the scan gap);
  no Cyrillic in the new core code (only em dashes in English comments).
- **Scope.** No change under `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`, `.pi/`,
  `scripts/`, `docs/project-profile.md`, `docs/specs/content-overlay-ui.md`, `docs/state/`,
  `package.json`, `package-lock.json` (`git diff --stat` over those paths is empty). No anchor codec, no overlap
  rule, no `settings:v1` decode, no new dependency, no jsdom, no host-DOM or painting code, no network API.
- **Harness.** No harness path is in the range, so the frontmatter/`timeoutMs`/overrides check is not applicable to
  this commit; spot-check of the base state: `docs/project-profile.md:106` = 3600000 and all three role
  frontmatters carry `timeoutMs: 3600000`, and the checker re-run is 0 errors.
- **Spec edited in the same commit** (`docs/specs/inline-comment-model.md:35,36` Flow 5/7, `:48` removal ordering,
  new bullets `:49` Index write guard, `:50` Decode on write, `:51` Unreadable records, `:69` visibility-is-not-an-
  edit). Behavior change + spec edit in one commit satisfies `code-review-flow.md` → Rules.

## Blocking findings

None.

## Non-blocking remarks

- **R1 — delete authorship is an open spec gap, not a spec-backed rule.**
  `src/core/entry-store-write.ts:116` and `:261-264` present as spec ("the spec makes a foreign entry read-only for
  *editing*, while delete and clear stay available") a sentence that does not exist in
  `docs/specs/inline-comment-model.md`; the spec says only "the entry is read-only" (`:64`) and, at UI level,
  "offers no Save/Delete" (`:95`). `tests/core-entry-store-write.spec.ts:496` pins the ungated behaviour. This is
  not a code/spec conflict and does not block: `inline-comment-model.md:95` is a UI-affordance criterion owned by
  `t3-03`, and this task's AC3 fixes the signature `deleteEntry(port, { url, id })`. The PM must rule before
  `t3-03`: either one sentence under "Edit rights" ("delete and clear are not authorship-gated in core; the UI hides
  Delete for a foreign entry"), or a `currentName` check in `deleteEntry`/`clearPage` plus a flipped test.
- **R2 — a cited spec section does not exist.** `src/core/entry-store-write.ts:12` and
  `tests/core-entry-store-write.spec.ts:33` name "Write result" among the rule anchors;
  `docs/specs/inline-comment-model.md` has no such bullet (the real anchors are Flow 5 `:35` and "Quota" `:70`).
  English grep anchors are a repo rule (`AGENTS.md` → Documentation Expectations). Docs-only fix.
- **R3 — `Page lookup` still phrased unconditionally.** `docs/specs/inline-comment-model.md:57` says the write path
  resolves `resolvePageKey(url, index) ?? pageKeyFromUrl(url)` without naming the guard at `:49`; the code follows
  `:49` (`src/core/entry-store-write.ts:388-393`). One clause ("when the index read succeeded") closes it.
- **R4 — t1-05 remark `R4` clause not added for the write side.** `commitRecords` publishes the *decoded* index
  (`src/core/entry-store-write.ts:486-490`, acknowledged at `:469-470`), so a write silently drops non-string and
  blank index elements; tested at `tests/core-entry-store-write.spec.ts:791` and harmless (such an element is not a
  page key), but the "Index write policy"/"Index write guard" bullets (`:48-49`) name only the read side.
- **R5 — `removeSlotThenIndex` has no direct test.** `src/core/page-index-store.ts:180-189` is covered only through
  `deleteEntry`/`clearPage`; the "slot removal succeeded, index publication failed" half is untested (the
  write-path analogue is at `tests/core-page-index-store.spec.ts:232`, the removal-failure half at
  `tests/core-entry-store-write.spec.ts:780`).
- **R6 — the shared purity scan omits `crypto`.** `tests/core-storage-port.spec.ts:149-159` checks DOM,
  `chrome.`, `Date`, `Math.random`, network, `any` and import form, but not `crypto`, which the t1-04 scan does
  check (`tests/entry-rules.spec.ts:345-356`). Verified by grep that no `src/core/` file references `crypto`, so the
  boundary holds; add the token so the four-module scan matches the two-module scan.
- **R7 — a stored `null` under a slot key is never removable.** `unusableSlotCode` treats `null` as absent (`:441`)
  and `slotPresent` agrees (`:462`), so `clearPage` returns `{ ok: true, removed: 0 }` and writes nothing
  (`:326-331`) while the `null` value stays. Mirrors the read path's treatment of `null`; a leak, not a data loss.
- **R8 — `snapshot()` is a shallow copy, so part of the "changes nothing" wording is carried by the call log.**
  `tests/support/memory-storage-port.ts:58-65` copies only the top level, so
  `expect(port.snapshot()).toEqual(before)` at `tests/core-entry-store-write.spec.ts:436-445, 757-766` cannot see an
  in-place mutation of a stored value; the identity assertions and `writesOf` are what actually prove it. Related
  hardening note: the `R3` scan is a substring match (`tests/toolchain-contract.spec.ts:123-129`), so
  `chrome['storage']` would evade it — acceptable for a v1 guard.

## Stage 1 close-out

After `1e91276`, every business rule of `docs/specs/inline-comment-model.md` that has no DOM dependency exists in
`src/core/` and is unit-tested against the fake port. Implemented **and** tested now: page identity and slot-key
encoding (`t1-02`, `t1-03`); the entry model, the 256-code-point and 20-entry caps, author identity, edit rights and
ordering (`t1-04`); the `StoragePort` seam with one adapter, index read/write/repair policy and the decode guard
(`t1-05`); and now the whole write path — model AC1 (one canonical record under `notes:v1:<slotKey>` of the indexed
`pageKey`, read back by `loadEntries`: `tests/core-entry-store-write.spec.ts:144,206`), AC3 core half
(`page_limit` per `pageKey`: `:217,238`), AC4 at store level (a write resolves the indexed variant and never forks a
page: `:273,544`), AC7 core half (`not_author` + only `comment`/`updatedAt` change: `:319,367`), AC9 core half
(`name_required`: `:217,409`), AC10 fully (`:448,504`), plus the quota whole-list rule (`:436,757`) and ruling `A16`
(`:259,394,467,524,613`). Still open by design: model AC2 UI half (counter, disabled Save → `t3-01`), AC3 message
(→ `t3-01`), AC5 staleness end-to-end (→ `t2-01`/`t2-02`/`t3-03`), AC6 and the whole "Overlap" rule plus Flow-3 step
6 "no identical existing entry" (ruling `A23` → `t2-03`) — therefore **model AC11 is not yet satisfied** (rule 6 has
no test), Flow-3 step 2 (selection not empty → `t3-01`), the "Anchoring" rule's codec (→ `t2-01`/`t2-02`),
`settings:v1` decode and first-run name wiring (ruling `A15` → `t4-02`; `generateAuthorName` exists with no shipped
caller), the Russian quota/limit/name messages (→ `t3-01`, `t4-01`), and `storage.onChanged` cross-tab refresh
(→ `t4-03`). Model AC8 is only half covered at core level and needs the R1 ruling before `t3-03`.

## Residual risks for Stage 2 (`t2-01-core-anchor-text`, `t2-02-content-anchor-dom`, `t2-03-core-overlap`)

1. **`text` is stored exactly as the caller passes it** (`src/core/entry-store-write.ts:186`) and nothing pins
   `entry.text === anchor.text`; the spec's "normalized selection text" (`:32`, `:66`) is unenforceable in
   `createEntryOnPage` until `t2-01` rules who owns normalization. Stage 2 must also decide whether a mismatch is a
   refused create or a normalized rewrite.
2. **The anchor the codec emits must satisfy `decodeEntry` exactly** (string `text`/`prefix`/`suffix`,
   non-negative integer `fragmentCount`, `src/core/entry-store-read.ts:121-137`), otherwise every create starts
   returning `entry_invalid` — the refusal and its shape are already pinned
   (`tests/core-entry-store-write.spec.ts:799-816`).
3. **Overlap seam.** `assertCreatable` receives only the current page's *decodable* list
   (`src/core/entry-store-write.ts:175-179`), which includes hidden entries — consistent with ruling `A22` — and any
   resolved-range argument must be added without breaking the per-page cap
   (`tests/core-entry-store-write.spec.ts:238` must keep passing).
4. **Cross-tab race is still open** (t1-05 residual 2): `loadPageContext` → `commitRecords`
   (`:385-411`, `:472-491`) is a read-modify-write window; `writeSlotThenIndex` fixes ordering, not atomicity.
   `t2-02` puts a second writer in the page and `t4-03` adds `onChanged`; if the PM wants re-read-before-write,
   it is a `commitRecords` change plus a test.
5. **R1 ruling on delete authorship** must land before `t3-03`, because `t3-03` implements the Save/Cancel/Delete
   affordances that model AC8 governs.
6. **Untested half of `removeSlotThenIndex`** (R5) — a Stage 2/3 storage change could regress the removal-path index
   failure unnoticed.
7. **Quota classification is message-marker based** (t1-05 residual 8, unchanged): a Chrome wording change degrades
   to `unavailable` and the Russian quota message never appears.
8. **Guard bookkeeping:** every new `src/core/` module must be appended to `MODULES`
   (`tests/core-storage-port.spec.ts:141-147`) or it ships unscanned; any second `chrome.storage` consumer now fails
   `tests/toolchain-contract.spec.ts:123` by design; the `t2-02` jsdom must stay a devDependency (ruling `A2`) and
   must not reach `dependencies`, `src/manifest.json` or `dist/`.

## Evidence path

- Task state file: `docs/state/t1-06-entry-write-path.md` (AC 1–6, attempts log, rulings `A16`, `A19`).
- Engineer report: `…/subagent-artifacts/outputs/18334e9e-acdf-4b69-aec5-04e63c692767/docs/state/t1-06-engineer.md`
  (gate quotes 1–8, AC self-check, AC audit, open questions 1–4, Stage 2 handoff notes).
- Risks this slice had to close: `docs/state/t1-05-review.md` (residual 1–9, `R3`, `R6`),
  `docs/state/t1-04-review.md` (residual 2, 4, 6) — closed as recorded above; residual 2 (race) and 8 (quota wording)
  deliberately carried forward.
- Spec: `docs/specs/inline-comment-model.md:35,36,48,49,50,51,64,69,70,88-98`;
  cross-check `docs/specs/content-overlay-ui.md:47`; `docs/specs/code-review-flow.md` → Rules / Edge Cases
  (read-only reviewer, gate quoting, slice size, ≤2 attempts); `docs/specs/INDEX.md`.
- Code: `src/core/entry-store-write.ts` (`:165` create, `:215` save, `:266` delete, `:290` setVisible, `:321` clear,
  `:385-411` context+guards, `:426-450` refusal codes, `:472-491` ordering, `:499-500` canonical record),
  `src/core/entry-rules.ts:180-197`, `src/core/page-index-store.ts:113-127,180-189`.
- Tests: `tests/core-entry-store-write.spec.ts` (50 cases), `tests/core-storage-port.spec.ts:141-178`,
  `tests/core-storage-keys.spec.ts:86-88`, `tests/toolchain-contract.spec.ts:123-129`,
  `tests/support/memory-storage-port.ts`.
- Commands run by the reviewer (read-only only): `git log --oneline`, `git status --porcelain` (empty),
  `git diff --stat 043412c..1e91276` (and `--stat` over the out-of-scope paths → empty),
  `git diff 043412c..1e91276 -- <spec, entry-rules, page-index-store, test files>`, `git ls-files docs/state`,
  greps over `src/` and `tests/`, a Node check for non-ASCII/Cyrillic in the changed core files, a static `it(`
  count (257 over 14 files), and `node scripts/check-agent-config.mjs` →
  `0 error(s), 0 warning(s), 9 info(s)`, exit 0 — identical to the quoted output. No `npm test` / `npm run build`
  re-run: the reviewer is read-only per `code-review-flow.md` → Rules.
```
