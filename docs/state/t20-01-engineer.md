# t20-01 — core adoption rule A197-A199 (engineer report)

Task: add the core write that adopts the server's copy of the reader's own notes into
the store. Output paths allowed: `src/core/entry-store-write.ts` (new export),
`tests/core-own-notes-adopt.spec.ts` (new file). No content wiring (that is t20-02).

## Changed paths

- `src/core/entry-store-write.ts` — new exported `adoptOwnNotes` plus the
  `AdoptOwnNotesInput` / `AdoptOwnNotesResult` types; private helpers
  `findStoredEntryOfAuthor`, `sameContent`, `sameAnchor`, `orderByCreatedAt`,
  `adoptionDraft`; `MAX_ENTRIES_PER_PAGE` added to the `entry-rules` import; module
  header extended with the `A197`-`A199` paragraph. No existing export changed.
- `tests/core-own-notes-adopt.spec.ts` — new file, 25 cases over the in-memory
  `MemoryStoragePort`.

## Commands run (in the briefed order)

1. `npm run build` — passed: `dist/ is a self-contained MV3 folder (16 files)`.
2. `npm test` — passed: `64 passed` files, `1353 passed` tests (was 1328; +25).
3. `npm run typecheck` — passed (three tsconfig projects, no output).
4. `node scripts/check-agent-config.mjs` — passed: `0 error(s), 0 warning(s), 238 info(s)`.

Commit: `1762d74 t20-01: adopt the server's own notes into the store (A197-A199)` —
2 files changed, 681 insertions. Only my two paths were staged; the PM's spec drafts
and the pre-existing `META-INSTRUCTION-compact.md` deletion were left untouched.

## Implementation shape (matches the briefed shape)

```ts
export interface AdoptOwnNotesInput { url: string; currentName: string; remote: readonly Entry[]; }
export type AdoptOwnNotesResult = { ok: true; adopted: number; skipped: number } | { ok: false; code: EntryWriteCode };
export async function adoptOwnNotes(port: StoragePort, input: AdoptOwnNotesInput): Promise<AdoptOwnNotesResult>;
```

- Page context via `loadPageContext` (same as every other write): the shipped
  `storage_unavailable` / `index_malformed` / `layout_version` / `slot_malformed` /
  `url_unparsable` refusals are reused unchanged.
- Filter: keep a row only when `isSameAuthor(row.authorName, currentName)` and
  `row.pageKey === context.pageKey`; every dropped row increments `skipped`. A row whose
  `validateComment(row.comment)` is not `ok` is `skipped` too.
- Merge per `(authorName, id)` — the server's upsert triple minus the page
  (`sync-server.md` -> `A155`): no stored entry with that identity -> adopt; stored
  entry with equal `text`/`comment`/`anchor` -> no write for that row (byte-identical
  record kept); content differs -> the newer `updatedAt` wins, the remote copy replaces
  the stored record and the stored `visible` flag is kept; a stored `updatedAt` that is
  newer or equal keeps the stored record.
- Cap: new rows are adopted in `createdAt` order up to `MAX_ENTRIES_PER_PAGE`; the rest
  are `skipped`; a replace never changes the page size and never consumes cap room, and
  no stored entry is ever deleted.
- One whole-list commit through `commitRecords` (slot before index; slot dropped for an
  empty page). When no record changes there is no port write of any kind and the answer
  is `{ ok: true, adopted: 0, skipped }`.
- A record that does not survive `decodeEntry(createEntry(...))` is `entry_invalid`.
- Adopted rows keep the server's `id`, `createdAt`, `updatedAt`, store no `title`
  (`A190`), and are `visible: true` for a new row.
- Pure except for the injected `StoragePort`: no `chrome.*`, no DOM, no clock, no
  network, no new imports beyond the existing core modules.

## AC self-check (AC 22-24 of docs/specs/sync-integration.md)

- **AC 22 (`A197`)** — "on an empty store the load adopts the settings name's notes".
  Satisfied by "adopts the own rows into an empty page as one slot write plus one index
  write" (two rows -> both stored, slot write then index write) and "adopts on a page
  whose key comes from the origin+pathname fallback".
- **AC 23 (`A198`)** — merge rule. Satisfied by: content-equal row writes nothing
  (asserted on the port call log); remote newer replaces and keeps `visible: false`;
  stored newer wins; equal stamps keep the stored record; a different anchor counts as
  different content; two authors sharing one id keep both rows; page-key mismatch
  skipped; empty and over-256-code-point comment skipped; cap boundary (20 adopted, the
  21st skipped in `createdAt` order, nothing deleted); a replace on a full page consumes
  no cap room.
- **AC 24 (`A199`)** — one commit, best effort. Satisfied by: the port call log pins
  exactly one `set` of the slot followed by exactly one `set` of `pages:v1`; a second
  identical call is a no-op with zero writes; refusals (`storage_unavailable`,
  `index_malformed`, `layout_version` for the index, `slot_malformed` and
  `layout_version` for the slot, `url_unparsable`, and a failing slot write) leave the
  snapshot unchanged; an unreadable stored record is carried through verbatim (`A16`).
  The "content layer gains exactly one write importer" half of AC 24 is t20-02's, not
  touched here (no file under `src/content/` was edited).

## Open questions

- None blocking. One recorded reading, not a conflict: the merge key is
  `(authorName, id)` per the spec wording, so a stored entry of **another** author with
  the same `id` is not this row's target and the own row is adopted beside it (test
  "treats a same-id row of another author as a new entry, keeping both"). This matches
  the server's upsert triple `(page_id, author_id, id)` (`sync-server.md` -> `A155`).
- `Assumption:` a malformed server answer that repeats one `(authorName, id)` twice
  cannot come from a well-formed server (the triple is its primary key), so no
  duplicate-row rule was invented; the last candidate of a duplicate pair wins
  deterministically.

## Deviations

- None from the brief. `src/content/` was not touched. No spec prose was edited.
