# t2-04-core-create-hardening — engineer report (attempt 1)

Task: `t2-04-core-create-hardening`, attempt 1/2. Core-only slice closing the `t2-03` review remarks 1–4 plus the
two missing `A27`/`A28` spec clauses. Commit: `c2cc64c feat(t2-04): required resolved spans and purity-scan coverage`
(4 files, +87/−15). Working tree clean after the commit; nothing pushed.

## 1. Changed paths

| Path | Change |
|---|---|
| `src/core/entry-store-write.ts` | `CreateEntryOnPageInput.spans` loses its `?` (`:111`, ruling `A46`); doc comment restated; `creationAttemptOf` (`:543-550`) now always forwards `spans: input.spans`, the "copy only when present" branch is gone |
| `tests/core-entry-store-write.spec.ts` | one shared `spansOf` helper (`:75`) + `spans` in `CreateOverrides`/`createInput`; new describe `:962` with the two end-to-end cases (`:963`, `:988`); 55 → 57 tests |
| `tests/core-storage-port.spec.ts` | `'entry-overlap.ts'` added to the shared `MODULES` purity scan (`:146`) — one line |
| `docs/specs/inline-comment-model.md` | Flow 3 `:41` caller-obligation sentence (`A46`); `:78` "Anchoring" trimmed-span window clause (`A27`); new bullet `:82` "Anchor options domain" (`A28`, same stance as `A26`) |

Untouched (verified with `git status --porcelain` → exactly those four paths): `src/core/entry-rules.ts`,
`src/core/entry-overlap.ts`, `src/core/anchor-build.ts`, everything under `src/content/`, `src/popup/`,
`src/options/`, `src/manifest.json`, `package.json`, `tsconfig*`, `.pi/`, `docs/project-profile.md`,
`docs/state/*`, `docs/specs/INDEX.md`.

## 2. Item by item

**1 — `A46`, `spans` required on the write API.**
`CreateEntryOnPageInput.spans: ResolvedSpans` (`src/core/entry-store-write.ts:111`). `CreateAttempt.spans`
stays optional (`src/core/entry-rules.ts:84`) and `assertCreatable`'s `spans === undefined` early return
(`src/core/entry-rules.ts:181`) is untouched, so the pure gate remains unit-testable without a map
(`tests/entry-rules.spec.ts:369` still green, unchanged).
Type-level proof: a scratch call site that omitted `spans` produced
`tests/core-entry-store-write.spec.ts(84,9): error TS2741: Property 'spans' is missing in type '{ url: string;
text: string; comment: string; anchor: EntryAnchor; currentName: string; now: string; rng: RandomSource; }` but
required in type 'CreateEntryOnPageInput'` under `tsc -p tsconfig.spec.json --noEmit`. The scratch line was
removed before the gates.
Behavior proof (mutation, then reverted): with `creationAttemptOf` forced to hand the gate `spans: undefined`, the
new hidden-entry test fails (`1 failed | 56 passed`, expected `{ok:false, code:'overlap'}`, got `{ok:true, …}`), so
the test measures the forwarding, not the fixture.

**2 — the two end-to-end cases from review remark 4** (`tests/core-entry-store-write.spec.ts:962-1006`):
- `refuses a candidate over the range of a hidden entry with overlap (A22)` (`:963`): stored record with
  `visible: false`, id `a1b2c3d4e5f6`, map `{ id → [10,20) }`, candidate `[12,13)` →
  `{ ok: false, code: 'overlap' }`, slot still `[hidden]`, `writesOf(port) === []`. Control pair in the same test:
  candidate `[20,21)` against the same stored entry → `ok: true`, 2 records. Only the resolved range changes the
  answer, so the assertion is not vacuous.
- `reports page_limit at the cap even when the spans would also refuse (A46)` (`:988`): page at 20 entries,
  candidate `[0,5)` on id `000000000000`'s own range with that entry's own comment `note 0` — steps 5 **and** 6 are
  both violated — and the write still reports `page_limit`, slot unchanged at 20, no writes.

One helper, five uses, no copies: `spansOf(candidate, ranges)` (`:75`) builds
`ResolvedSpans { candidate, byEntryId: Map<string, CodePointRange> }`; `createInput` defaults to
`spansOf({ start: 0, end: 13 })`, i.e. an empty `byEntryId` (every existing entry read as stale, `A24`), which is
why none of the 55 pre-existing cases changed behavior.

**3 — shared purity scan.** `tests/core-storage-port.spec.ts:146` now lists `entry-overlap.ts` in `MODULES`; both
purity tests in that describe (`no DOM/chrome.*/clock/randomness/crypto/network`, and `no any/@ts-ignore/
@ts-expect-error/@angular//preact` + "every import specifier is relative") pass over it, so the `t1-06` `R6`
precedent holds and no new list was created.

**4 — the two spec clauses.** `docs/specs/inline-comment-model.md:78` ("Anchoring") gained: "The window is taken at
the boundaries of the **trimmed** span … `prefix` and `suffix` are the context around the stored `text` and never
around the raw selection (ruling `A27`)". A new bullet `:82` "Anchor options domain (ruling `A28`, same stance as
`A26`)" states that `contextWindow` / `fragments` outside "non-negative integer" (negative, fractional, `NaN`,
infinite) produce no anchor at all, that `0` is inside the domain, and that the caller treats the refusal as
"do not create" rather than a silent default. Token census in the spec: `A46` ×1 (`:41`), `A27` ×1 (`:78`),
`A28` ×1 (`:82`) — all greppable, `A27`/`A28` inside the Anchoring cluster.

## 3. Commands run

Baseline first, as briefed:

- `npm test` (before any edit) → `Test Files 21 passed (21)` / `Tests 396 passed (396)`.

Gates after the change, all re-run against the committed tree:

- `npm test` → `Test Files 21 passed (21)` / `Tests 398 passed (398)` (`tests/core-entry-store-write.spec.ts`
  now reports `57 tests`; static `it(` census: 55 → 57, and `grep -rn "it.each|\.skip|\.only" tests/` is empty, so
  the delta is exactly the two new cases).
- `npm run build` → `[build] manifest references resolved: content.js, popup/index.html, options/index.html` and
  `[build] dist/ is a self-contained MV3 folder (10 files)`.
- `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 19 info(s)`, exit 0 — the same 19 INFO tokens
  as in `t2-03`, i.e. the spec edits introduced no new plan token.
- Extra (not a gate): `npm run typecheck` (`tsc -p tsconfig.content.json`, `tsconfig.app.json`, `tsconfig.spec.json`,
  all `--noEmit`) → clean.
- Boundary greps I ran: `grep -rnE "as any|@ts-ignore|@ts-expect-error|: any\b" src/core/` → no hits; a node scan
  for `[^\x00-\x7F]` over the changed core module → only the em dash already present in that file at `HEAD`
  (4 occurrences before my change), so no Russian/Cyrillic in `src/core/`.

## 4. AC self-check

1. **`A46` required `spans` + the two remark-4 cases — done.** Type-level (TS2741 reproduced), `CreateAttempt.spans`
   still optional, hidden-entry overlap refusal and cap-precedence cases landed in
   `tests/core-entry-store-write.spec.ts:963`/`:988`, one shared `spansOf` helper. The spec sentence naming the
   caller obligation is at Flow 3 `:41` (state-file AC1 wording).
2. **`entry-overlap.ts` in the shared `MODULES` scan — done**, one line at `tests/core-storage-port.spec.ts:146`, no
   parallel list added.
3. **`A27`/`A28` spec clauses — done**, greppable at `:78` and `:82` in the Anchoring cluster.
4. **No `CreateBlockCode` behavior changed and the six-step order stands — verified.** `src/core/entry-rules.ts` and
   `src/core/entry-overlap.ts` are not in the commit at all; `tests/entry-rules.spec.ts:281` (six-row order table),
   `:343`, `:369` still green. The two named store tests are unchanged in content and pass; their line numbers moved
   by 19/20 lines because the helper and `CreateOverrides.spans` sit above them in the same file:
   `counts the 20-entry cap per pageKey, not per store` is now `:258` (was `:238`) and
   `runs the creation rules first, so a full page still reports page_limit` is now `:895` (was `:875`).

## 5. Deviations

- None from the brief's scope. Two things the brief left open and I decided as stated, for the record:
  - `creationAttemptOf`'s "copy `spans` only when present" branch was **deleted** rather than kept, because with a
    required input the branch is dead code and `exactOptionalPropertyTypes` forbids assigning `undefined`.
  - The module-local purity scan in `tests/core-entry-overlap.spec.ts:315-354` was **kept** even though
    `entry-overlap.ts` is now in the shared list: that scan also asserts `[^^\x00-\x7F]` (no non-ASCII at all), which
    the shared list does not check, and deleting it would drop two green tests. If the PM wants a single list, the
    non-ASCII rule has to move into the shared scan first — that is a behavior change for the other seven modules, so
    it is outside this slice.

## 6. Open questions

1. Should the `t2-03` reviewer's "no parallel list" concern be closed by merging the non-ASCII rule into the shared
   `MODULES` scan (then `tests/core-entry-overlap.spec.ts`'s two purity tests become redundant)? Not done here: it
   would newly police `entry-rules.ts`, `entry.ts`, `page-index.ts`, `page-key.ts`, `slot-key.ts`, `storage-keys.ts`
   with a stricter rule than they currently satisfy.
2. `docs/specs/INDEX.md:8` covered-paths row for the model spec is still incomplete (`t2-02` `N5`, `t2-03` remark 7).
   This commit touches the model spec but not INDEX; the PM may want that one-line index fix separately.
3. `A46` also removes the only escape hatch the popup/options facades might have wanted for a create-without-a-page
   (none exists today, `createEntryOnPage` has no shipped caller). If a future UI path needs a "create without a
   stream" case, that needs a new ruling, not a re-optional `?`.

## 7. Handoff notes for `t3-01-content-create-card`

The final argument shape (unchanged by this slice, now **mandatory**):

```ts
interface CodePointRange { start: number; end: number }            // half-open, CODE POINTS, integer, start >= 0, end > start
type ResolvedEntryRanges = ReadonlyMap<string, CodePointRange>;    // key = stored Entry.id; stale entry is ABSENT (A24)
interface ResolvedSpans { candidate: CodePointRange; byEntryId: ResolvedEntryRanges }

createEntryOnPage(port, { url, text, comment, anchor, currentName, spans, now, rng })  // `spans` has no `?`
```

- The card **must** build `spans` before it calls core; there is no way to call `createEntryOnPage` without it any
  more (compile error, not a runtime code). `CreateAttempt.spans` stays optional only inside the pure gate; no shipped
  path may rely on that.
- `byEntryId` is keyed by the **stored ids of the page key the write itself resolves**
  (`resolvePageKey(url, index) ?? pageKeyFromUrl(url)`), because the scan reads the map by `entry.id` for every entry
  in the write's own decoded list, in stored order.
- **What a half-populated `byEntryId` means:** an id that is absent (or whose value is not a usable
  `end > start` range) is read as a stale entry (`A24`) — it contributes no range, so it blocks nothing and the
  create is allowed with **no signal at all**. A map that covers 12 of 20 entries is therefore not an error to core;
  it is "those 8 went stale". The card must resolve every existing entry of the page over one stream (`A37`) and put
  an entry in the map only when `resolveAnchor`/`locateAnchorInStream` genuinely failed.
- `spans.candidate` must be usable (`end > start`); a degenerate candidate is allowed, not refused (review remark 6),
  so the card suppresses an empty/whitespace selection before calling core.
- All offsets are code points: a `Range` or `String.indexOf` offset goes through the fragment code-point map first.
- The candidate comment core compares is `validateComment(input.comment).normalized`; the card must not pre-compare
  the raw textarea value.
- Refusal codes the card will see from steps 5–6: `overlap` (Russian wording already specified at
  `docs/specs/content-overlay-ui.md:74`) and `duplicate` (wording still needs the PM ruling of `t2-03` remark 5;
  `A47` lands with the message map — do not map both codes to one string by accident).
- The cost model stands: one resolve per existing entry per create, so build the stream once and reuse it for the
  candidate plus all entries (`t2-03` residual risk 2).
- `buildAnchor` now has a documented refusal domain (`docs/specs/inline-comment-model.md:82`): a `null` from an
  out-of-domain `contextWindow`/`fragments` means "do not open Save", never `entry_invalid`.
