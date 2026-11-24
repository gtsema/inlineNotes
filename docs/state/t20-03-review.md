Verdict: **accepted** (with non-blocking remarks).

# t20-03 — review of Stage 20 (own-note adoption), AC 22–24

Brief: review `1762d74` (core) + `e8b1475` (content wiring) against `docs/specs/sync-integration.md` -> "Adopting the reader's own notes (rulings A197-A199)" and AC 22, 23, 24, plus the spec edits in `8c8f26d`.
Artifact path briefed: `.../outputs/6bb9523b-.../docs/state/t20-03-review.md` — that directory does not exist on disk and this role has no write tool, so the artifact is returned in full here for the runtime to persist.

## Verdict: `accepted`

No acceptance criterion fails, no blocking finding, and the gate output is present (re-run below and quoted in both engineer reports). The three defects in "Remarks" are real but sit on spec lines outside AC 22–24; per the review rules they are recorded as non-blocking, not as a rejection.

## Acceptance criteria — one line each

- **AC 22 (`A197`) — PASS.** `src/core/entry-store-write.ts:520` `adoptOwnNotes` writes own rows into the store through `commitRecords` (`:876`), and both content load paths adopt through one loader: `src/content/sync/foreign-notes.ts:302` (`await adopt(request, summary)` before `memory.replace`), reached by the automatic load (`src/content/sync/sync-notes.ts:194` wiring → `loadIntoMemory`) and the popup reload (`src/content/main.ts:249-250`). Evidence: `tests/core-own-notes-adopt.spec.ts` -> "adopts the own rows into an empty page…", "adopts on a page whose key comes from the origin+pathname fallback"; `tests/content-sync-notes.spec.ts` -> "adopts before it fills the memory, so the row is in the store when the memory drops it" (asserts the slot holds `own001` on an empty page) and "adopts through the same seam on the popup-driven load (both load paths)"; `tests/content-adopt-own-notes.spec.ts` -> "adopts a readable own row into an empty page…". Real evidence: the store snapshot is the assertion, not a stub.
- **AC 23 (`A198`) — PASS.** Every clause is proven in `tests/core-own-notes-adopt.spec.ts`: content-equal = no write (port call log), remote newer replaces and keeps `visible: false`, stored newer wins, equal stamps keep stored, different anchor = different content, `(author, id)` key (same id, two authors keep both), page-key mismatch skipped, empty/over-256-comment skipped, cap 20-then-skip in `createdAt` order with nothing deleted, replace on a full page consumes no cap room, idempotent second call.
- **AC 24 (`A199`) — PASS.** One whole-list commit is pinned by the port call log (`['get','get','set','set']`, slot then `pages:v1`, `tests/core-own-notes-adopt.spec.ts`); every refusal (`storage_unavailable`, `index_malformed`, `layout_version`, `slot_malformed`, `url_unparsable`, failing slot write) leaves the snapshot unchanged; best-effort and non-blocking paint are pinned by `tests/content-sync-notes.spec.ts` -> "leaves the outcome ok when the adoption write refuses" and "keeps the load ok when the port under the shipped adopter throws"; the "exactly one write importer" half is pinned by `tests/content-create-card-boundaries.spec.ts` (`contentFilesImporting('src/core/entry-store-write.ts')` = create, editor, `sync/adopt-own-notes.ts`; `adoptOwnNotes(` = that one file; `loadIntoMemory(` = `main.ts` + `sync/sync-notes.ts`; `createOwnNotesAdopter(` = `main.ts`) and `tests/content-throw-boundaries.spec.ts` (19 → 20 catch sites, `sync/adopt-own-notes.ts: 1`).

## Blocking findings

None.

## Non-blocking remarks (numbered; none blocks acceptance)

1. **`A197` truncation rule not implemented — `src/core/entry-store-write.ts:536-552`.** The spec says a row "that cannot be read as a local entry (… an empty comment, a comment over 256 code points) is **skipped**". The code only *measures* the raw comment (`validateComment(row.comment).ok`) and then writes `adoptionDraft` with the raw `row.comment` (`:602-616`). A 256-code-point comment padded with spaces passes the check and is stored with the padding (probe: `'  spaced  '` stored verbatim), so a stored record can exceed the normalized 256 cap and differ from what the reader typed. The same path stores a raw comment for a new row. Probe evidence in "Checks I ran", C4.
2. **`A198` "the local `visible` flag is kept" is not guaranteed on a full page — `src/core/entry-store-write.ts:569-583`.** The cap counts only *decodable* stored records, so a record the guard cannot decode is not counted. A page already holding 20 records of which some are undecodable ends up with 21 stored records after one adoption (probe C3: 21). Result is a stored list above `MAX_ENTRIES_PER_PAGE`, which contradicts "A merge … never exceeds `MAX_ENTRIES_PER_PAGE`" (AC 23) on that page.
3. **One store read per load, not two — `src/content/sync/foreign-notes.ts:301-306` and `src/content/main.ts:249`.** The automatic load takes its `target` from `sync.loadTarget()` (a settings read, `sync-notes.ts:194`) and the popup path does the same at `main.ts:237`, but `loadIntoMemory` then runs `pairOf(request, summary, await loadHiddenAuthorsOfPage(port, request.pageKey))` and `adopt()` each with their own port read, on top of the core write's own guarded read — so the same adapter load is no longer "exactly the port touches" of `A163`/Stage-17 as the counting case in `tests/content-sync-notes.spec.ts` ("reads the settings through core once per question") describes. Not the AC text, and the extra reads are bounded, but the sequence is now three reads of the hidden-flag record + one index read + one slot read per load; the class comment claims "one mapping pass rather than two" for rows and the summary comment claims "the one store read", which reads stronger than the code.
4. **Content-equal comparison can suppress a visible-flag question — `src/core/entry-store-write.ts:641-646`.** `sameContent` deliberately ignores `visible`, so an own row whose remote `visible` differs is skipped with no write, as `A198` wants; but the consequence is that a locally hidden own note (`visible: false`) is never re-shown by adoption even when the server says otherwise. That is intended by the ruling ("visibility is the reader's own display flag"), so this is only a note for `docs/retro.md`, not a defect.
5. **Style: comment blocks dominate the new code.** `src/content/sync/adopt-own-notes.ts` is 176 lines of which ~90 are prose, and `src/core/entry-store-write.ts:485-519` repeats the merge rule in a header that duplicates the body comments. No functional effect; the wording "no `setTimeout` anywhere in the popup" claims in related files are untouched by this diff.

## Boundary checks (all `pass`)

- **`src/content/sync/foreign-notes.ts` declares no `StoragePort` and imports no core write.** `grep -n "StoragePort\|entry-store-write\|adoptOwnNotes"` returns only comment text and the seam field name at `:273`; the seam is `readonly adoptOwnNotes?: (pass: {url, currentName, notes}) => Promise<unknown>` — no port in the type at all. Confirmed.
- **Exactly one content importer of the core write was added** (`src/content/sync/adopt-own-notes.ts`), pinned by `tests/content-create-card-boundaries.spec.ts`.
- **No new runtime dependency.** `git show --stat` of both commits names no `package.json` / `package-lock.json`; `git diff ae43595..HEAD` over those files is empty.
- **No network beyond the two shipped fetch adapters.** `tests/toolchain-contract.spec.ts` -> "src names a network API in exactly three modules" lists `src/all-notes/fetch-transport.ts`, `src/content/sync/fetch-transport.ts`, `src/popup/sync-transport.ts` — the all-notes adapter arrived with `cb3eae8` (Stage 19/A189), not with Stage 20. Both commits add no `fetch`/XHR/WebSocket. Note for the PM: `sync-integration.md` -> "One address, and no other network" still says "exactly two five-line adapters", which is stale since A189; that is a Stage 19 spec gap, not a defect of this change.
- **Specs edited in the same change.** The PM committed the ruling text in `8c8f26d`, one commit after `1762d74` and before `e8b1475`; `e8b1475` itself edits `docs/specs/sync-integration.md` (test-map rows 22–24) and `docs/specs/content-overlay-ui.md` (the catch enumeration row). Code and spec are consistent on the three rulings: adoption writer, merge key `(authorName, id)`, one commit, best effort — all three are implemented as written, with the three exceptions listed in remarks 1–3.
- **No host-DOM mutation for painting** in either commit; the adoption path only touches the storage port.
- **`INDEX.md`** names the adoption half of `src/core/entry-store-write.ts` in the `sync-integration.md` row (`8c8f26d`).

## Gates re-run (2026-11-24, HEAD `1218fe6`)

- `npm run build` — pass: `[build] dist/ is a self-contained MV3 folder (16 files)`, `EXIT_BUILD=0`.
- `npm test` — pass: `Test Files 65 passed (65)` / `Tests 1372 passed (1372)`.
- `npm run typecheck` — pass: three `tsc --noEmit` projects, no diagnostics.
- `node scripts/check-agent-config.mjs` — pass: `0 error(s), 0 warning(s), 242 info(s)`. The info lines ("planned path not created yet: tests/…") are the checker's `PLAN_PREFIXES` branch (`scripts/check-agent-config.mjs:341,365`), which reports every `tests/…`/`src/…` token in a spec as planned regardless of existence — pre-existing behaviour, `0 error`, not caused by this change.

## Checks I ran (read-only, nothing modified)

Temporary probe spec used to confirm remarks 1–3, removed afterwards; `git status --short` is back to the single pre-existing `D META-INSTRUCTION-compact.md`:
C1 — an undecodable stored record with the same `(author, id)` is kept **and** the remote row is added beside it (`adopted: 1`, two records); C2 — duplicate `(author, id)` rows in one answer produce two stored records (`adopted: 2`); C3 — 20 undecodable records + 1 new row → 21 stored records; C4 — `'  spaced  '` stored with padding.

## Evidence path

`git show 1762d74`, `git show e8b1475`, `git show 8c8f26d`; `src/core/entry-store-write.ts:485-670`, `src/content/sync/adopt-own-notes.ts`, `src/content/sync/foreign-notes.ts:240-345`, `src/content/sync/sync-notes.ts:49-210`, `src/content/main.ts:117-255`; `tests/core-own-notes-adopt.spec.ts`, `tests/content-adopt-own-notes.spec.ts`, `tests/content-sync-notes.spec.ts` (`AC22`/`AC24` describes), `tests/content-create-card-boundaries.spec.ts:114-190`, `tests/content-throw-boundaries.spec.ts:110-165`; `docs/specs/sync-integration.md`, `docs/specs/inline-comment-model.md:107`, `docs/specs/INDEX.md`, `docs/specs/content-overlay-ui.md:349`; `docs/state/t20-01-engineer.md`, `docs/state/t20-02-engineer.md`, `docs/state/stage-20-own-notes-adoption.md`.