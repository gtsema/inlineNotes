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

- attempt 1: brief prepared; delegated after the `t1-04` acceptance.

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
