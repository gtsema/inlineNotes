# t1-05-storage-port-read-index

## Goal

The store learns to read: a `StoragePort` seam, the only `chrome.*` adapter, the `pages:v1` read/write
policy, entry decoding (`visible` default), repair-on-read of orphan index entries, and the review-driven
key fixes from `t1-03`. The write path (create/update/delete) is `t1-06`, not here.

## AC (5 substantive + gates)

1. `StoragePort` in `src/core/storage-port.ts`: `get(keys: string[] | null): Promise<Record<string, unknown>>`,
   `set(items: Record<string, unknown>): Promise<void>`, `remove(keys: string[]): Promise<void>`, plus
   `QuotaError` detection. The **only** production adapter lives in `src/content/store/chrome-storage-port.ts`
   (`chrome.storage.local`); unit tests use an in-memory fake port and never import `chrome.*`.
2. `readPageIndex(port)` / `writePageIndex(port, index)` with the write policy: **slot first, then index**;
   a failed slot write leaves the index untouched; `version` is validated on read (anything but `1` → treated
   as an empty index plus a `layout_version` code), and compaction never reorders `pageKeys`.
3. `loadEntries(port, url)` → `{ pageKey, entries, corruptCount, codes }`: resolve the page key through the
   index (`resolvePageKey(url, index) ?? pageKeyFromUrl(url)`), read the slot, decode each entry — unknown
   fields ignored, `visible` absent → `true` (ruling `A1`), a malformed entry is skipped and counted, never
   silently deleted. A slot that holds no valid entry while the index still lists its page key is repaired by
   `removeFromIndex` on read, without reordering the rest. The shape guard (`isEntry`) lives in `src/core/`, not
   in the chrome adapter; a corrupt or foreign-shaped record must never reach `canEdit` or the list helpers
   (review residual risk 5). `pageIndexFromStorageValue` / `entryListFromStorageValue` style decode guards belong
   to this task.
4. `addToIndex` rejects a non-normalized page key instead of inserting it (review finding `N5`); no shipped
   code may call `decodeURIComponent` on a slot key (invariant `N4`); `SLOT_KEY_ESCAPE_BUDGET` becomes **246**
   so `notes:v1:` + slot stays strictly under 256 (review finding `N2`).
5. `docs/specs/inline-comment-model.md` is edited in the same commit: the accepted FNV-1a collision trade-off
   (`N1`), the index write policy and repair-on-read, the decode defaults, the timestamp contract
   (`createdAt`/`updatedAt` are UTC ISO-8601 with `Z`, produced by the caller's clock port, so lexical ordering
   is chronological — ruling `A9`), and the author cap stated in **code points** (review remark `R2`).
6. Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Carried to `t1-06` (do not implement here): the write path persists `validateAuthorName(...).normalized` and
`validateComment(...).normalized` rather than raw input (review residual risk 4); `assertCreatable` receives only
the current page's list, since the cap is per `pageKey` (residual risk 2); `setVisible` is a pure core helper
(ruling `A12`, residual risk 6).

Work order (mandatory): gates early → spec lines → commit. If time runs out, commit the green state and name
the gap.

## Stage plan

Stage 1 (renegotiated to 6 tasks after two runtime timeouts on 7-AC slices). Previous: `t1-04` (engineer done,
review in flight). Next: `t1-06-entry-write-path` closes Stage 1.

## Attempts log

- attempt 1: **timeout at 1800000 ms.** The run wrote the whole read path but never ran the gates, never committed,
  never reported. Uncommitted tree at the stop: `src/core/storage-port.ts`, `src/core/page-index-store.ts`,
  `src/core/entry-store-read.ts`, `src/content/store/`, `tests/support/` (fake port), five new spec files, modified
  `slot-key.ts`, `page-index.ts`, two core test files, `tsconfig.spec.json`, `docs/specs/inline-comment-model.md`.
- attempt 2: **completion-only brief** (`3d022378`): fix the tests → verify AC coverage → finish the spec edit → run the
  gates → commit → short report. Explicit rule added to the brief: "a committed green state with a short report is
  accepted, an uncommitted perfect one is not". Result: **green**, commit `084a5c1` (16 files, +1945/-14), 13 test
  files / 206 tests, `npm run typecheck` clean. The handed-over tree turned out to be already passing, so attempt 2
  spent its time on verification, one missing spec line, the gates and the commit.

## Verdicts

- engineer report: attempt 2 complete, all three gates quoted (`npm test` 206/206, `npm run build` self-contained `dist/`, checker 0 errors / 9 INFO — the standing planned-path rule). Artifact: `…/subagent-artifacts/outputs/3d022378-60af-4d1c-b8e7-e851e4a0d743/docs/state/t1-05-engineer.md`.
- reviewer verdict: **accepted**, no blocking findings, remarks `R1`–`R8`. Artifact copied into the repo at
  `docs/state/t1-05-review.md` (fixes remark `R8`: review artifacts used to live only under
  `subagent-artifacts/outputs/<run>/docs/state/`, which broke the path convention the next brief expects).
- PM decision: task closed at attempt 2/2; commit `084a5c1` is final. All four carried findings of `t1-03`
  (`N1`, `N2`, `N4`, `N5`) and the `t1-04` residual risks 1, 3, 5 are closed.

## PM rulings on the engineer's open questions

- `A13` **Timeout ceiling**: no answer from the user after two requests, so the least-risky default is applied and recorded as an assumption — `timeoutMs` stays **1800000**, and every cross-layer brief must carry the "commit early, commit often" instruction plus "a committed green state beats an uncommitted perfect one". The user may raise it later; the change site is `docs/project-profile.md` → Runtime Model plus the three role files and `agentOverrides`.
- `A14` **Repair scope**: per-page repair on read is sufficient for v1. No full-index scan; `clear page` does not sweep other pages' orphans.
- `A15` **`settings:v1` decode guard** belongs to `t4-02-options-name-field` (the settings UI is its first and only consumer), not to `t1-06`.
- **Open question 1 (corrupt records vs a whole-list write) — asked twice, no answer; applied as
  `Assumption` `A16`**: no silent data loss. The write path must carry unreadable raw records through every write
  verbatim (the slot value grows an `unreadable: unknown[]` part), count them, and only `clear page` discards them.
  The reviewer confirmed the read path already refuses to delete them, so this ruling keeps read and write honest.
  Reversible by a later ruling if the user prefers self-healing drops.
- `A17` remark `R2` resolved: the durable rule is the **spec** wording — a slot holding a malformed record or a
  foreign `version` is NOT repaired; only an absent or valid-but-empty slot is. The AC paraphrase in this file was
  looser; the acceptance ledger follows the spec.
- `A18` remarks `R1`, `R7` are bookkeeping: no `QuotaError` type is introduced (the vocabulary is
  `StorageFailureError` + `code`), and the checker prints INFO lines one per line.
- Carried into `t1-06`: `R3` (a scan asserting `chrome.storage` appears in exactly one shipped file) and `R6`
  (the stale `{1,208}` regex in `tests/core-storage-keys.spec.ts:86` must become the universal 246 bound).

## Runtime observation (systemic)

Two of five tasks hit the 30-minute ceiling (`t1-03`, `t1-05`); three finished inside it (`t1-01`, `t1-02`, `t1-04`).
The pattern: slices that create **new files in two layers** (core + content adapter + test harness) do not fit;
slices that stay in one layer do. Options for the PM, pending the user's answer (resolved by ruling `A13`):
1. raise `timeoutMs` to 3600000 in the three role files, the `agentOverrides` block and `docs/project-profile.md`;
2. keep 30 minutes and split cross-layer slices into two (adapter-only, then core-only);
3. keep 30 minutes and start every cross-layer slice with a "commit early, commit often" instruction.

Outcome after applying (3): attempt 2 of `t1-03` and attempt 2 of `t1-05` both finished inside the ceiling, because
the hand-over was already in the tree. The completion-slice pattern works; the ceiling itself is untouched.

Brief (attempt 1):
- Task: storage seam + page-index policy + entry decoding (read path only).
- Input paths: `docs/project-profile.md`, `docs/specs/inline-comment-model.md`, `docs/state/t1-05-storage-port-read-index.md`, `src/core/`, `src/content/overlay/host.ts`, `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.
- Output artifact: `docs/state/t1-05-engineer.md` + code in `src/core/storage-port.ts`, `src/core/entry-store-read.ts` (naming may vary), `src/content/store/chrome-storage-port.ts`, `src/core/slot-key.ts`, `src/core/page-index.ts`, `tests/`.
- Acceptance criterion: AC 1–6 above, each with a self-check line.
- Constraints: `src/core/` stays free of `chrome.*` (the port is an interface); `chrome.*` only in `src/content/store/`; no new dependency; no jsdom (the fake port is hand-written); no write path here; no Russian strings; do not touch `.pi/`, `docs/project-profile.md`, `docs/state/*`; commit after green gates (`feat(t1-05): storage port, index policy, entry decoding`).
- Report must contain a `Commands run` section quoting `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- `A9` PM answer to `t1-04` open 1: the spec pins UTC ISO-8601 (`Z`) stamps; the clock is injected (`now()` port), `src/core/` never reads a clock.
- `A10` PM answer to `t1-04` open 2: decoding lives in `t1-05` (AC3), including the `visible` default.
- `A11` PM answer to `t1-04` open 3: `name_required` stays the single code for v1; the options page will refuse a longer name at input (40-code-point `maxlength`) in `t4-02`, so no `name_too_long` code appears to the user.
- `A12` PM answer to `t1-04` open 4: `setVisible` is a pure core helper added in `t1-06` (write path), not inline in Angular.
