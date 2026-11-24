# Stage 22 — the server's RFC3339Nano stamps (defect t22-01)

Opened 2026-11-24 from the reader's report on the second PC: the correct note came back
from `GET /notes/page/...` but was invisible everywhere; `chrome.storage.local` held only
`pages:v1` (`pageKeys: []`) and `settings:v1`; no console errors.

## Root cause (proven, not guessed)

The server writes `created_at` / `updated_at` with Go `time.RFC3339Nano`
(`server/internal/store/store.go` -> `formatTimestamp`), so a row carries six fractional
digits: `2026-11-24T16:15:56.015417Z`. A **stored** stamp is `A9`'s shape, pinned by
`ISO_UTC_TIMESTAMP_PATTERN` in `src/core/entry-store-read.ts`:
`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/` (at most three digits).

`entryFromRemoteNote` (`src/core/sync-client.ts`) only checks `typeof === 'string'`, so
the row reached `adoptOwnNotes`. `adoptionDraft` -> `canonicalRecord` ->
`decodeEntry` -> `isTimestamp` fails on the six-digit stamp, `canonicalRecord` answers
`null`, and `adoptOwnNotes` returns `{ ok: false, code: 'entry_invalid' }`. `A199`'s
best-effort seam swallows it, and the memory drops the row as the reader's own
(`A197`) — so the note is written nowhere, painted nowhere, listed nowhere, and no error
appears. `pages:v1.pageKeys` stays empty, exactly as reported.

The same mismatch would also poison the `A198` merge comparison, which compares
`updatedAt` strings lexically.

## Spec edit (PM, done)

`docs/specs/sync-integration.md` -> "Wire shape" / Receiving: the boundary **normalizes**
both stamps to the stored shape (`new Date(value).toISOString()`) and skips a row whose
stamp does not parse; the rejection chain above is named. `A197` names the normalization.
Test mapping gains `tests/core-sync-client.spec.ts` -> the server-stamp describes.

## t22-01 brief (core, extension-engineer)

**Task.** Make the wire boundary map the server's stamp shape to the stored one.

**Input paths.** `docs/specs/sync-integration.md` -> "Receiving"; `src/core/sync-client.ts`
(`entryFromRemoteNote`); `src/core/entry-store-read.ts` (`ISO_UTC_TIMESTAMP_PATTERN`,
`isTimestamp`, `decodeEntry`); `tests/core-sync-client.spec.ts`;
`tests/core-own-notes-adopt.spec.ts`; `server/internal/store/store.go` (`formatTimestamp`).

**Output.** `src/core/sync-client.ts` only for production; the two test files.

**Rules.**
- `entryFromRemoteNote` maps `created_at` -> `createdAt` and `updated_at` -> `updatedAt`
  through `new Date(value).toISOString()`;
- a value the `Date` cannot parse (NaN time) makes the row unreadable: return `null`,
  never a stamp the store guard would reject later;
- a value already in the stored shape maps to itself (idempotent);
- do **not** loosen `ISO_UTC_TIMESTAMP_PATTERN` — mixing stamp shapes in one page breaks
  the lexical ordering the popup relies on;
- no other behavior changes; `text`/`comment`/`anchor`/`id` are untouched.

**Acceptance.** New cases in `tests/core-sync-client.spec.ts`: six-, four- and
zero-fraction `RFC3339Nano` stamps map to the `toISOString` shape; an unparsable stamp
yields `null`; an already-stored-shape stamp is unchanged. Plus one end-to-end regression
case: a remote note with a six-digit stamp, mapped by `entryFromRemoteNote` and passed to
`adoptOwnNotes` over an empty page, is written into the slot (the exact defect of the
reader's report). Gates: `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs`. One commit:
`t22-01: normalize the server's RFC3339Nano stamps at the wire boundary`.

## t22-02 (planned)

`code-reviewer`, focused re-review of `t22-01`, checking the defect chain is closed and
the existing stamp tests still hold.

Delegation counter: t22-01 = 0 attempts.

## Mid-task ruling (blocked → resolved)

`extension-engineer` hit the `A58` purity gate: `tests/core-storage-port.spec.ts` forbids
the literal `Date` in every `src/core/` module, and the brief's `new Date(x).toISOString()`
would have needed an exception. PM ruling: **no exception and no move to the content
layer** — the normalization is a **pure string transform** in `sync-client.ts` (the shipped
server always emits UTC `Z` from `t.UTC().Format(RFC3339Nano)`):
`/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/` with the fraction truncated to
three digits and zero-padded; a non-`Z` offset or an unreadable shape skips the row.
Spec text updated to match; the engineer keeps the change in core and never edits the
spec.
