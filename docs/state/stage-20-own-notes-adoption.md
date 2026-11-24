# Stage 20 — adopt the reader's own notes from the server (A197–A199)

Opened 2026-11-24 by the user's report: «создаю заметку на одном ПК — не вижу её под
тем же именем на другом ПК после синхронизации».

## Diagnosis (accepted by the user, option A)

The sync feature is author-directional: a press **pushes** the reader's own notes, and
the automatic load **was designed to drop** every returned row whose `authorName` is the
reader's (`src/content/sync/foreign-notes.ts` -> `replace`, guarded by the belief "my
notes are already in `chrome.storage.local`"). On a second machine the store is empty, so
the note the reader wrote on the first machine was discarded and never painted, never
listed in the popup's `Вы` row, and never listed in «Мои заметки». No code path writes a
remote own note into the store (`entryFromRemoteNote` is called only by the memory that
drops own rows). Both facts are pinned by shipped tests and by
`docs/specs/sync-integration.md` ("The reader's own notes in the answer are dropped before
memory"). So this is a design gap, not a regression.

The user chose **A**: adopt the server's own notes into `chrome.storage.local`, conflict
rule = the newer `updatedAt` wins.

## Spec edits (done by the PM, this stage)

- `docs/specs/sync-integration.md`: new rulings `A197` (adoption), `A198` (merge rule),
  `A199` (one commit, best effort); the term `adoption`; Scope, Flow 3, "The automatic
  load", "Where the notes live", the deleted-note edge case, AC 22–24 and the test map.
- `docs/specs/inline-comment-model.md`: one bullet pointing at the adoption rules
  (the physical function lives in `src/core/entry-store-write.ts`).
- `docs/specs/INDEX.md`: the sync-integration row names the adoption half of
  `src/core/entry-store-write.ts`.

## Assumptions recorded (`Assumption:` in the spec text)

1. Merge compares **content first** (`text`, `comment`, `anchor`): equal content = no
   write, even when the server's `updatedAt` is newer. Without this, every sync press
   would rewrite the reader's notes (the server stamps `updated_at = now()` on every
   `POST`, `server/internal/store/store.go`) and would move the «Мои заметки» date.
2. Cap overflow: adopt new rows in `createdAt` order up to `MAX_ENTRIES_PER_PAGE`, skip
   the rest; never delete a stored entry to make room.
3. A row the local rules refuse (empty or over-256-code-point comment, page key that is
   not the asked one) is skipped, never guessed at.
4. A refused adoption write is best-effort: nothing changes, the paint is not blocked,
   the next load tries again.
5. With synchronization on, the server is the source of truth for the reader's own
   notes, so an own note deleted while the server was unreachable is re-adopted on the
   next load (resurrection). Accepted price of A.

## Plan (≤3 tasks)

| Task | Slice | Owner | Output |
|---|---|---|---|
| `t20-01` | core adoption rule + unit tests | `extension-engineer` | `src/core/entry-store-write.ts` (`adoptOwnNotes`), `tests/core-own-notes-adopt.spec.ts` |
| `t20-02` | content wiring: one loader adopts before memory; boundary/pin updates | `extension-engineer` | `src/content/sync/` loader, `tests/content-sync-notes.spec.ts`, `tests/content-create-card-boundaries.spec.ts` |
| `t20-03` | review of both diffs against AC 22–24 | `code-reviewer` | review verdict |

Delegation counter: t20-01 attempts = 0, t20-02 attempts = 0. Ceiling = 2 attempts each.

## t20-01 brief (core)

**Task.** Add the core rule `A197`–`A199`: one write that adopts the server's copy of the
reader's own notes into a page's stored list.

**Input paths.** `docs/specs/sync-integration.md` -> "Adopting the reader's own notes";
`docs/specs/inline-comment-model.md` -> the adoption bullet; `src/core/entry-store-write.ts`;
`src/core/entry.ts`; `src/core/entry-rules.ts` (`isSameAuthor`, `MAX_COMMENT_CODE_POINTS`,
`MAX_ENTRIES_PER_PAGE`); `src/core/storage-keys.ts`; `src/core/page-index-store.ts`;
`src/core/entry-store-read.ts` (`decodeEntry`, `loadEntries`).

**Output path.** A new export in `src/core/entry-store-write.ts` and a new
`tests/core-own-notes-adopt.spec.ts`. No other file.

**Required shape.**

```
export interface AdoptOwnNotesInput {
  url: string;                 // the page address the pass used
  currentName: string;         // the settings name
  remote: readonly Entry[];    // server rows already mapped by entryFromRemoteNote
}
export type AdoptOwnNotesResult =
  | { ok: true; adopted: number; skipped: number }
  | { ok: false; code: EntryWriteCode };
export async function adoptOwnNotes(port, input): Promise<AdoptOwnNotesResult>;
```

Rules:
- resolve the page context exactly like every other write (`loadPageContext`);
- keep only rows where `isSameAuthor(row.authorName, currentName)` is true and
  `row.pageKey === context.pageKey`; every other row counts as `skipped`;
- skip a row whose `validateComment(row.comment)` is not `ok` (empty or over the cap);
- merge per `(authorName, id)`:
  - no stored entry with that id: adopt;
  - stored entry exists and `text`/`comment`/`anchor` equal the row's: no write for that
    row (keep the stored record byte-identical);
  - otherwise the newer `updatedAt` wins; on replace keep the stored `visible` flag;
  - equal or newer stored `updatedAt` keeps the stored record;
- `MAX_ENTRIES_PER_PAGE`: new rows are adopted in `createdAt` order up to the cap; the
  rest are `skipped`. Never delete a stored entry;
- one whole-list commit through `commitRecords` (slot before index, slot dropped for an
  empty page). No change to any record => no port write at all (`adopted: 0`);
- a record that does not survive `decodeEntry`/`createEntry` is `entry_invalid`;
- the port/index/slot refusals keep their existing codes (`storage_unavailable`,
  `index_malformed`, `layout_version`, `slot_malformed`, `url_unparsable`);
- pure except for the injected `StoragePort`: no `chrome.*`, no DOM, no network, no clock.

**Acceptance criterion.** AC 22–24 of `docs/specs/sync-integration.md`, proven by
`tests/core-own-notes-adopt.spec.ts` over an in-memory `StoragePort`: adopt into an empty
page; content-equal row writes nothing (port call log); remote newer replaces and keeps
`visible: false`; stored newer wins; equal stamps keep stored; two authors with one id;
page-key mismatch skipped; over-long/empty comment skipped; cap boundary (20 adopted, the
21st skipped, nothing deleted); idempotent second call; refused index/slot/port changes
nothing.

**Constraints.** Do not edit `src/content/` (task `t20-02`). The specs are already drafted;
if the code needs a different rule, stop and report the conflict instead of editing prose
silently. Existing exported behavior must not change. Gates: `npm run build`, `npm test`,
`npm run typecheck`, `node scripts/check-agent-config.mjs`. One commit:
`t20-01: adopt the server's own notes into the store (A197-A199)`.

## t20-02 brief (content) — written after t20-01 is accepted

**Task.** The automatic load and the popup's reload adopt before they fill the memory.

**Output path.** A loader under `src/content/sync/` used by both `sync-notes.ts`
(automatic load) and `src/content/main.ts` (`loadPageNotes`, the popup's press), plus the
two test files.

**Required behavior.**
- after a successful `GET /notes/page/{page_id}`, map every row with
  `entryFromRemoteNote`, then call core `adoptOwnNotes` once with the pass's page key and
  the settings name; a refusal is swallowed (best effort, `A199`);
- then `memory.replace(rows, currentName, hiddenAuthors)` exactly as today, so own rows
  are still not painted from memory;
- the adoption caller must be **exactly one** content module, and it is the only content
  module that imports `src/core/entry-store-write.ts` on top of the two shipped ones;
- both load paths (the automatic one and the popup's `reload`) go through that one loader.

**Acceptance.** AC 22–24: rewrite the `tests/content-sync-notes.spec.ts` case that pinned
"dropping the reader's own" into the adoption claim; assert one adopt call with the pass's
key and the settings name; assert a failed adopt does not block the load/outcome; update
the `contentFilesImporting('src/core/entry-store-write.ts')` and call-level pins in
`tests/content-create-card-boundaries.spec.ts`.
