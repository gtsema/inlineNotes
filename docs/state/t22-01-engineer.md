# t22-01 — engineer report: normalize the server's RFC3339Nano stamps at the wire boundary

Task: `docs/state/stage-22-server-timestamp.md` (full brief). Commit: `f377270`
`t22-01: normalize the server's RFC3339Nano stamps at the wire boundary`.

## Changed paths (committed)

- `src/core/sync-client.ts` — production. `entryFromRemoteNote` now maps both stamps
  through one new local helper `storedStampOf(value)`; a `null` from either stamp makes
  the whole row unreadable. Nothing else in the function and nothing else in the module
  moved.
- `tests/core-sync-client.spec.ts` — new `describe('the server’s RFC3339Nano stamps are
  normalized at the wire boundary (stage 22, t22-01)')`, 7 cases; one new import of
  `ISO_UTC_TIMESTAMP_PATTERN`.
- `tests/core-own-notes-adopt.spec.ts` — one new end-to-end regression case; two new
  imports (`entryFromRemoteNote`, the `RemoteNote` type).

Not touched: `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`,
`ISO_UTC_TIMESTAMP_PATTERN` in `src/core/entry-store-read.ts`, and every spec file. The
working tree still carries the PM's `docs/specs/sync-integration.md` edit, the new
`docs/state/stage-22-server-timestamp.md` brief and a pre-existing
`META-INSTRUCTION-compact.md` deletion — all left uncommitted, none of them mine.

## The defect chain, closed

1. `GET /notes/page/...` returns `created_at: "2026-11-24T16:15:56.015417Z"` (Go
   `t.UTC().Format(time.RFC3339Nano)`).
2. `entryFromRemoteNote` used to pass that string straight into `createEntry`; the
   record then failed `decodeEntry -> isTimestamp` in `canonicalRecord`.
3. `adoptOwnNotes` answered `{ ok: false, code: 'entry_invalid' }`, the best-effort
   seam of `A199` swallowed it, and the row was written nowhere and dropped as the
   reader's own (`A197`).
4. Step 2 can no longer happen: the boundary emits only the `A9` shape, so the guard in
   `entry-store-read.ts` accepts it on the way in. `ISO_UTC_TIMESTAMP_PATTERN` is
   untouched, so one page can never hold two stamp shapes — the lexical popup order and
   the `A198` merge compare both depend on that.

## Deviation, executed against the supervisor ruling

The brief said `new Date(value).toISOString()`. I implemented that first, ran the gates,
and `npm test` failed one already-green test:
`tests/core-storage-port.spec.ts` -> "uses no DOM, no chrome.*, no clock, no randomness,
no crypto, no network" scans **every** module under `src/core/` (derived list, ruling
`A58`) and asserts the comment-stripped code does not contain `Date`. The `Date` mapping
would also have been host-zone dependent for an offset-less stamp, which the lexical
`A198` compare would then decide wrongly on two machines.

I reported the conflict instead of choosing a side. Supervisor ruling: keep the mapping
in `src/core/sync-client.ts` as a **pure string transform**, add no purity-scan
 exception, and rely on the server's stamps always being UTC `Z`. Implemented exactly:

```ts
const WIRE_STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

function storedStampOf(value: string): string | null {
  const match = WIRE_STAMP.exec(value);
  if (match === null) {
    return null;
  }
  const fraction = (match[2] ?? '').padEnd(3, '0').slice(0, 3);
  return `${match[1]}.${fraction}Z`;
}
```

No `Date` token in shipped code (only in comments), so the purity scan is green with no
exception. Mapping table as ruled: `015417 -> 015`, `0154 -> 015`, `5 -> 500`, absent ->
`000`, `.015Z` unchanged, a non-`Z` offset or any non-conforming shape -> `null`.

## Acceptance, line by line

| Brief item | State | Evidence |
| --- | --- | --- |
| `created_at -> createdAt`, `updated_at -> updatedAt` through the boundary mapping | done | `src/core/sync-client.ts` `entryFromRemoteNote` + `storedStampOf` |
| a value that cannot be read makes the row unreadable: `null`, never a bad stamp | done | the `createdAt === null || updatedAt === null` branch; tests for 10 bad shapes x 2 fields, plus the numeric-offset case |
| a value already in the stored shape maps to itself (idempotent) | done | idempotence test asserts the value and re-crosses the boundary with it |
| do not loosen `ISO_UTC_TIMESTAMP_PATTERN` | done | `src/core/entry-store-read.ts` is not in the commit; the tests assert the produced stamps match the pattern |
| no other behavior changes | done | the field-by-field shape check, `visible: true` and `anchorFromUnknown` are untouched; only the two `createEntry` inputs changed |
| six-, four- and zero-fraction stamps map to the stored shape | done | three tests; plus one for the 1- and 2-digit fractions `RFC3339Nano` also emits |
| an unparsable stamp yields `null` | done | the shape-skip test |
| an already-stored-shape stamp is unchanged | done | the idempotence test |
| end-to-end: a six-digit row mapped by `entryFromRemoteNote` and passed to `adoptOwnNotes` over an empty page is written into the slot | done | `tests/core-own-notes-adopt.spec.ts` — asserts `{ ok: true, adopted: 1, skipped: 0 }`, the full stored record with the `...015Z` stamps, and `pages:v1.pageKeys === [PAGE_A]` |
| no `src/content` change | done | `git show --stat f377270`: three files, none under `src/content/` |
| no spec prose edit | done | no `docs/` file in the commit |
| one commit with the given message | done | `f377270` |

### Proof the new cases cover the defect and are not decorative

I re-ran the two spec files against the pre-fix module
(`git show HEAD~1:src/core/sync-client.ts`) with the new tests in place: **7 failed /
62 passed**. With the fix: **69 passed**. The regression is falsifiable.

## Commands run (in the briefed order)

1. `npm run build` — passed, `[build] dist/ is a self-contained MV3 folder (16 files)`.
2. `npm test` — passed, `Test Files 65 passed (65)`, `Tests 1383 passed (1383)`.
   (1383 = 1376 before + the 7 new cases.) The earlier attempt under the `Date`
   implementation failed 1 test — `tests/core-storage-port.spec.ts`, purity scan; see
   the deviation section.
3. `npm run typecheck` — passed, all three projects (`tsconfig.content.json`,
   `tsconfig.app.json`, `tsconfig.spec.json`), no output.
4. `node scripts/check-agent-config.mjs` — passed, `0 error(s), 0 warning(s), 245 info(s)`
   (the INFO lines are pre-existing "planned path not created yet" notes).

## Residual risks

1. **The mapping validates the shape, not the calendar.** `2026-13-45T99:99:99Z` is
   shape-legal, maps to `2026-13-45T99:99:99.000Z`, and `ISO_UTC_TIMESTAMP_PATTERN`
   accepts it too, so such a row would pass the guard and only mis-sort. Out of scope
   for a value the server builds from a `time.Time`; recorded as a test comment instead
   of inventing a calendar check the ruling did not ask for. One range check + one spec
   line would close it if the PM wants it.
2. **A numeric-offset stamp now yields `null` (row skipped).** The first brief's `Date`
   mapping would have accepted it; the ruled string transform refuses it, because
   folding an offset needs zone arithmetic. The server never sends one (`t.UTC()`), so
   this is a deliberate narrowing covered by a test. Worth a clause in the PM's spec
   edit so the prose and the code match.
3. **The spec still says `new Date(value).toISOString()`** in `sync-integration.md` ->
   "Wire shape" (the PM's edit, uncommitted). The supervisor said the PM owns that text,
   so I did not touch it. Until it is reworded, the spec and the code disagree on *how*
   the normalization is done — same shape, same guarantees, same result for every UTC
   `Z` stamp, but a literal reader would notice. This is the one open item to close
   before review.
4. **`chrome://extensions` load of `dist/` not performed**: the brief calls it only for a
   behavior slice that touches the content script, and this slice is core-only with no
   `dist/` change of behavior beyond the mapping. Reviewed-by-reading instead.

## Open questions

- None blocking. The only one worth the PM's word is residual risk 3: does the spec line
  get reworded now (the code is the ruled behavior), and does item 2 get a clause?
