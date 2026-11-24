# t20-02 — content wiring: adopt the reader's own notes on the page load (engineer report)

Task: wire the core adoption of `t20-01` into both content load paths, so a note created
on one machine becomes a stored note on a second machine with the same author name.
Output paths allowed: `src/content/sync/` loader + `src/content/main.ts` + the test files.
No change under `src/core/`.

## Changed paths

- `src/content/sync/adopt-own-notes.ts` — **new**. The one adopter module. Exposes
  `createOwnNotesAdopter(port)` (the shipped closure, built once per document),
  `adoptOwnNotesOfLoad({ port, url, currentName, notes })` (the module-level function a
  test can drive directly) and the two pass types. It maps the wire rows once through core
  `entryFromRemoteNote` (skipping unreadable rows), then calls core `adoptOwnNotes` inside
  the module's **only `try`**, so it can never reject (`A199`). This is the single content
  module that imports `src/core/entry-store-write.ts` on top of the two shipped write
  flows.
- `src/content/sync/foreign-notes.ts` — `loadIntoMemory` gains the **adoption seam**
  (`adoptOwnNotes?`) and a `pageUrl?` field, and now runs `adopt(request, summary)` before
  `memory.replace(...)`. The seam carries `{ url, currentName, notes }` and **no port**:
  the module still declares no storage port at all (`A163`), so it cannot write even by
  mistake. `adopt` is a 15-line private helper; it does not guard the seam (the seam's own
  contract is "resolves, always"), the enclosing `A164` `try` is the only backstop.
- `src/content/sync/sync-notes.ts` — the automatic-load wiring gains `pageUrl: () => string`
  (the page address, read per use) and the optional `adoptOwnNotes` seam, and passes both
  into `loadIntoMemory`.
- `src/content/main.ts` — builds exactly one `createOwnNotesAdopter(port)` and hands it to
  both load paths: the automatic one through `attachSyncNotes({..., pageUrl, adoptOwnNotes})`
  and the popup's `loadPageNotes`/reload directly through `loadIntoMemory`.
- `tests/content-adopt-own-notes.spec.ts` — **new** (11 cases): the module's mapping, its
  one core write addressed by the page URL, and its best-effort/no-reject contract.
- `tests/content-sync-notes.spec.ts` — the `A197` memory case now asserts both facts;
  new `AC22`/`AC24` describes (7 cases) cover the loader half: one adopt call with the
  pass's address/name/raw rows, adoption before `memory.replace`, adoption over the real
  port on an empty page, no adoption on failure/`sync_off`/no-key, adoption re-addressed
  on a same-document navigation, a refused adopt leaving the outcome `ok` and the memory
  intact, a throwing port under the shipped adopter, and the popup-driven load running the
  same seam. All existing `attachSyncNotes` call sites gained `pageUrl`.
- `tests/content-create-card-boundaries.spec.ts` — the write-importer pin now names the
  three modules; a new `adoptOwnNotes(` call-level pin names only the adopter; a new
  one-loader pin pins `loadIntoMemory(` callers to **exactly** `main.ts` +
  `sync/sync-notes.ts` and `createOwnNotesAdopter(` callers to `main.ts`.
- `tests/content-throw-boundaries.spec.ts` — the catch-set pin gains
  `sync/adopt-own-notes.ts: 1` (total 19 → 20).
- `docs/specs/content-overlay-ui.md` — one new row in the "Every `catch` under
  `src/content/`" enumeration for `adoptOwnNotesBestEffort`.
- `docs/specs/sync-integration.md` — the Test-mapping rows 22–24 now name the new files
  (the ruling text of `A197`-`A199` is the PM's and was **not** edited).

No file under `src/core/` changed. `META-INSTRUCTION-compact.md`'s pre-existing deletion
was left staged-out and untouched.

## Commands run (briefed order)

1. `npm run build` — passed: `dist/ is a self-contained MV3 folder (16 files)`.
2. `npm test` — passed: `65 passed` files, `1372 passed` tests (baseline after `t20-01`
   was 1353; +19).
3. `npm run typecheck` — passed (three tsconfig projects, no output).
4. `node scripts/check-agent-config.mjs` — passed: `0 error(s), 0 warning(s), 242 info(s)`.

Commit: `e8b1475 t20-02: adopt own notes on the page load (A197-A199)` — 10 files
changed, 869 insertions, 13 deletions. Only the briefed paths were staged.

## AC self-check (sync-integration.md AC 22–24)

- **AC22** (`A197`) On a page whose store is empty, an automatic load adopts the server's
  notes of the settings name into `chrome.storage.local`.
  - Content half: `loadIntoMemory` calls the seam before `memory.replace`, and the shipped
    seam runs core `adoptOwnNotes` over the real port. Proven end-to-end by
    `tests/content-sync-notes.spec.ts` -> "adopts before it fills the memory…" (slot on an
    empty page holds `own001`) and by `tests/content-adopt-own-notes.spec.ts` -> "adopts a
    readable own row into an empty page, addressed by the page url".
  - The row is painted/listed/sent back by the store: unchanged store behaviour, owned by
    `A197`'s core half (`t20-01`, already accepted). **Satisfied for the content slice.**
- **AC23** (`A198`) The merge rule — **not touched** by this task. It is core `t20-01`
  (`tests/core-own-notes-adopt.spec.ts`). This slice only calls it and passes through its
  result. **Satisfied / not in this slice's scope.**
- **AC24** (`A199`) Adoption is one core write: a refused write changes nothing, does not
  block the paint and is retried by the next load; the content layer gains exactly one
  write importer.
  - One write: the adopter calls core `adoptOwnNotes` once per load, which is one
    whole-list commit (`commitRecords`).
  - A refusal changes nothing / does not block the paint: `adoptOwnNotesBestEffort`
    swallows a port that throws or rejects and answers `{ ok: false, code }`; the loader's
    answer, the memory and the repaint are unchanged. Proven by
    "leaves the outcome ok when the adoption write refuses" (outcome `{ok:true,added:1}`,
    `onLoad` published `{ok:true,added:1}`, memory holds the foreign row, one repaint) and
    "keeps the load ok when the port under the shipped adopter throws".
  - Exactly one write importer: `contentFilesImporting('src/core/entry-store-write.ts')`
    is the three-module list, and the new `adoptOwnNotes(` pin names only the adopter.
  - Both load paths through one loader: the new one-loader pin
    (`loadIntoMemory` callers = `main.ts` + `sync/sync-notes.ts`) and the
    `createOwnNotesAdopter(` pin (callers = `main.ts`). **Satisfied.**

## Open questions / notes

1. **Where the adoption seam lives (a choice, not a deviation).** The brief named "a
   separate module that imports the core write and exposes a small function/closure".
   I put the *seam* (`adoptOwnNotes?` on `loadIntoMemory`, so both load paths go through
   one loader) in `foreign-notes.ts`, which **cannot hold a port**; the *writer* (the only
   importer of the core write) lives in `adopt-own-notes.ts` and binds the port in
   `main.ts`. Net effect: one content importer of `entry-store-write.ts` on top of the two
   write flows, one shared loader, no port in the memory module. No `src/core/` change.
2. **`pageUrl` on the wiring (a choice, not a deviation).** The brief says "handed to core
   `adoptOwnNotes` with the page address/url the pass used". The core write resolves the
   page key through the stored index (`N5`), so the adopter is addressed by the page
   **address** and core resolves the key. `sync-notes.ts` therefore needs the address as
   well as the key; I added a `pageUrl: () => string` seam (read per use, so a
   same-document navigation re-addresses the write) rather than deriving a URL in the
   loader.
3. **`maxSubagentDepth`/review:** none. Review of this diff against AC 22–24 is `t20-03`
   (`code-reviewer`), which is not mine to run.
