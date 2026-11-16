# t2-03-core-overlap — engineer report (attempt 2, completion slice)

Commit: `5a029c5 feat(t2-03): overlap and duplicate creation checks` (parent `02a4c73`). Not pushed.
Working tree after the commit: clean (`git status --short` → empty). Everything below was run against the
committed content, in the briefed order.

## 1. Changed paths

Committed in `5a029c5` (11 files, +947 / −73). New in this attempt are marked ★, the rest survived from
attempt 1 and were verified, not rewritten.

- ★ `docs/specs/inline-comment-model.md` — Terms `overlap` (reworded) + new `resolved range`, `duplicate entry`;
  Flow 3 clause (`A37`, codes `overlap` / `duplicate`); Rules: `Overlap` (moved range → editor path),
  `Resolved range (A37)`, `Hidden entries and overlap (A22)`, `Stale entries and overlap (A24)`,
  `Duplicate entry (A23)`; Normalized text bullet → closed enumeration (`R1`); two Edge Cases; AC 24–26.
- ★ `tests/core-entry-overlap.spec.ts` — the one red case rewritten (the `A24` fixture), plus two control
  assertions. File was added by attempt 1 (22 tests).
- ★ `tests/core-text-normalize.spec.ts` — one negative test for the closed whitespace set (`R1`): U+0085 NEL,
  U+200B, and the U+2028 / U+2029 collapse (17 tests).
- `src/core/entry-overlap.ts` (new in attempt 1) — `CodePointRange`, `ResolvedEntryRanges`, `CandidateSpan`,
  `ResolvedSpans`, `isUsableRange`, `rangesIntersect`, `sameRange`, `findOverlappingEntry`, `findDuplicateEntry`.
- `src/core/entry-rules.ts` — `CreateBlockCode` + `overlap` + `duplicate`; `CreateAttempt.spans?: ResolvedSpans`;
  `assertCreatable` now runs steps 5 and 6 after the entry cap.
- `src/core/entry-store-write.ts` — `CreateEntryOnPageInput.spans?: ResolvedSpans`, forwarded to the gate.
- `src/core/anchor-build.ts` — carried `A27` (window at the trimmed-span boundaries) and `A28`
  (out-of-domain `contextWindow` / `fragments` → `null`, never coerced). Verified: 10 A27/A28 references,
  tests at `tests/core-anchor-build.spec.ts:165,239,260`.
- `src/core/entry.ts` — carried `R2`: comments cite `"Anchoring", "Anchor window"` and the default-40 wording;
  the deleted phrase "whitespace collapsed" is gone.
- `src/core/text-normalize.ts` — doc comment carries the closed enumeration + the NEL / ZWSP near-misses
  (the shipped function is still `raw.replace(/\s+/g, ' ').trim()`, unchanged behavior).
- `tests/core-anchor-build.spec.ts`, `tests/entry-rules.spec.ts` — modified by attempt 1 (A27/A28 cases;
  the six-step precedence table).

Untouched, as briefed: everything under `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`.

## 2. What this attempt did, item by item

1. **Red fixture fixed** — `tests/core-entry-overlap.spec.ts` → `skips an entry with no resolved range: a stale
   entry never blocks (A24)` (name and intent kept). New shape: `stale` is the entry whose stored words the
   candidate sits on (its would-be range is `[10, 20)`), the candidate is `[12, 13)`, and `live` resolves to
   `[30, 40)` — which shares nothing with the candidate — so `findOverlappingEntry` returns `null`. Two control
   assertions make that `null` non-vacuous: the same candidate at `[35, 36)` still returns `live`, and with the
   stale range resolved onto `[10, 20)` the same candidate and entry list return `stale`. The degenerate-map
   case is kept (`stale` → `[12, 12)`, `live` → `[30, 40)`, candidate `[12, 13)` → `null`). Code was not changed.
2. **Carried `R1` finished** — spec bullet `Normalized text` now points at the closed set `WHITESPACE_RUN`
   matches, names every member (including U+2028 line separator / U+2029 paragraph separator explicitly as
   line and paragraph separators), and states that U+0085 (NEL) and U+200B survive untouched. One negative test
   added (`leaves a code point outside the closed enumeration untouched, so the set is closed (R1)`):
   `normalizeText('a\u0085b') === 'a\u0085b'`, `normalizeText('a  \u0085  b') === 'a \u0085 b'`,
   `normalizeText('\u0085a\u0085') === '\u0085a\u0085'`, `isNormalizedText('a\u0085b') === true`. No other
   whitespace behavior changed.
3. **AC5 spec edits written** — see §1; Terms/Aliases kept consistent (the `overlap` row now points at
   `resolved range`, which is defined in the row below it, and `duplicate entry` is defined there too).
4. **Gates run** — §4.
5. **Committed** — `5a029c5`, no push.

## 3. AC self-check (`docs/state/t2-03-core-overlap.md` → AC 1–5)

- **AC1 — resolved range value type + `rangesIntersect` with the boundary rule: satisfied.**
  `CodePointRange { start, end }` (half-open, code points) and `rangesIntersect` in `src/core/entry-overlap.ts`.
  Pinned in `tests/core-entry-overlap.spec.ts`: `[0,10)` vs `[10,20)` → `false` both orders; `[0,10)` vs
  `[9,20)` → `true`; identical → `true`; zero-length → `false` everywhere; malformed values (`-1`, `NaN`,
  `1.5`, `Infinity`, inverted) → `isUsableRange false` and intersecting nothing; a 8×8 symmetry matrix; the
  `block boundary space` case (entry ranges `[0,5)` and `[6,11)`; candidate `[5,6)` → no collision, `[5,7)` →
  `second`, `[4,6)` → `first`) per `A37`.
- **AC2 — `findOverlappingEntry` (first hit or `null`; hidden participates, stale skipped): satisfied.**
  Order follows the caller's entry list (`b` before `a` in the ordering case); `A22` case: hidden `[10,20)`
  blocks `[15,16)` and does not block `[20,21)`; `A24` case is the fixture fixed in this attempt; a case pins
  that anchor text is never read (same stored words at another range → `null`).
- **AC3 — `assertCreatable` gains `overlap` then `duplicate` in Flow-3 order; six-step table: satisfied.**
  `tests/entry-rules.spec.ts` → `checks the six creation rules in the spec order of Flow 3`
  (`name_required`, `comment_empty`, `comment_too_long`, `page_limit`, `overlap`, `duplicate`, each row also
  violating later steps); plus `duplicate`-wins-when-both-match, hidden-blocks, stale-does-not, boundary-touch
  allowed, and the `spans === undefined` case (steps 5–6 cannot run). The four older codes keep their own tests
  (31 tests in that file, all green).
- **AC4 → this file's AC5 wording in the spec: satisfied.** `docs/specs/inline-comment-model.md` now holds:
  duplicate = equal resolved range **and** equal normalized comment with `duplicate` reported as the more
  specific code (`A23`); stale entries contribute no range and never block, and stay listed and deletable
  (`A24`); hidden entries still block because `visible` controls painting only (`A22`); resolved range = the
  half-open code-point range on the current stream, one re-resolve pass supplies candidate + every existing
  entry, one resolve per existing entry is the accepted cost, and a shared `block boundary space` is a touching
  boundary (`A37`); and the one line that a **moved** range — the `t3-03` editor path — goes through the same
  check with the entry being edited excluded from the scanned list.
- **AC5 (purity and boundaries): satisfied.** `tests/core-entry-overlap.spec.ts` → `purity of the resolved-span
  module (AC5)` with `MODULES = ['entry-overlap.ts']`: no `document` / `window` / `chrome.` / `Date` /
  `Math.random` / `crypto` / `fetch(` / `XMLHttpRequest` / `WebSocket`, no `any`, no `@ts-ignore` /
  `@ts-expect-error`, no `@angular/` / `preact`, no non-ASCII character, and every import specifier is relative
  (`./`). Cross-checked with `grep -rlP "[\x{0400}-\x{04FF}]" src/` → no Cyrillic anywhere in `src/`, and
  `grep -rn "as any|@ts-ignore|@ts-expect-error|: any" src/core/` → no hits.

## 4. Commands run (verbatim, this attempt)

- `npm test` → `Test Files 21 passed (21)` / `Tests 396 passed (396)`, `Duration 1.96s`. (Before this attempt:
  394 passed / 1 failed, as the PM measured.)
- `npm run build` → `[build] dist/ is a self-contained MV3 folder (10 files)`; `dist/content.js 18.4kb`,
  `dist/popup/main.js 92980 bytes`, `dist/options/main.js 93258 bytes`, `manifest references resolved:
  content.js, popup/index.html, options/index.html`.
- `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 19 info(s)`, exit 0. All 19 are the
  checker's unconditional "planned path not created yet" INFO for backticked `src/…` / `tests/…` tokens in
  specs; this attempt added exactly 2 of them (`src/core/text-normalize.ts`, `tests/core-text-normalize.spec.ts`
  in the Normalized text bullet; that spec's token count went 13 → 16).
- Extra (not a gate): `npm run typecheck` → exit 0, no output.
- `git add -A && git commit -m "feat(t2-03): overlap and duplicate creation checks"` → `[master 5a029c5] 11
  files changed, 947 insertions(+), 73 deletions(-)`; `git status --short` afterwards → empty. No `git push`.

## 5. Deviations

1. **`17-form enumeration` wording.** The brief asked the spec to point at "the closed 17-form enumeration the
   code implements". The shipped implementation is `/\s+/g`, whose closed set is 25 code points; the 17 forms
   are the *sampled* list in `tests/core-text-normalize.spec.ts` (`WHITESPACE_FORMS` — 17 entries, the
   U+2000–U+200A run sampled at U+2000, U+2009, U+200A). Writing "17 forms" as the set size would have made the
   spec false about the code, so the bullet states the full closed set **and** says explicitly that the 17
   sampled forms are that set with that run sampled at three points. `R1`'s substance (closed enumeration,
   correct separator naming, NEL negative test) is fully implemented; only the count phrasing differs.
2. **Extra assertions in the fixed `A24` test.** Beyond the briefed rewrite, the test now also pins that `live`
   blocks at `[35, 36)` and that the same candidate/entries return `stale` once the stale range is resolved.
   Same name, same intent, no production-code change.
3. **Spec AC list grew by three numbers (24, 25, 26).** The brief's item 3 listed the five rule statements;
   `code-review-flow.md` and the spec's own convention require observable criteria for a rule that lands in
   code, so the rulings are also stated as AC 24–25 with AC 26 as the "unit tests cover 24–25" line that
   mirrors AC 11 / 17 / 23. No new behavior beyond the rulings was specified.
4. **No `exceptId` parameter.** `docs/state/t2-03-core-overlap.md` → Open questions expected the API shape to
   "leave room for an `exceptId` argument". Attempt 1 shipped no such parameter, and it is not needed: the scan
   is driven by the entry list, the map is read by `id` only, so excluding the entry being edited is a
   `removeById` on the list and its leftover map range is inert. That behavior is already pinned by the test
   `is driven by the entry list, so an entry excluded from it cannot block (t3-03)`. Reported rather than
   changed, because adding a parameter now would duplicate an existing mechanism.
5. **Report location.** The report is written only to the briefed output path, not to `docs/state/` inside the
   repo, so the committed tree stays clean; the PM copies it into `docs/state/t2-03-engineer.md` in the
   bookkeeping commit.

## 6. Open questions (for the PM, none blocking)

1. **Russian message for `duplicate`.** `docs/specs/content-overlay-ui.md` AC6 maps only the overlap message
   (`Выделение пересекается с существующей записью`). Ruling `A23` introduced a second refusal code; its UI
   wording is a `t3-03` string that needs a ruling (message strings were out of scope here).
2. **What "moved range" means on the edit path.** Flow 7 keeps `text` and `anchor` when saving, so a moved
   range today can only come from a re-selection that creates a new entry while the old one still exists. If
   `t3-03` is delete-then-create, overlap exclusion is unnecessary; if it is create-then-delete, the old entry
   must be excluded. The spec line covers both by requiring the exclusion, but the PM should pin the order in
   the `t3-03` brief.
3. **`spans` is optional on both `CreateAttempt` and `CreateEntryOnPageInput`.** A caller that passes no spans
   silently passes steps 5 and 6. Only the content layer can resolve ranges, so today the content create card
   is the sole real caller and it must always supply them. Whether to make `spans` required (or refuse with a
   machine code when absent) is a rule change and therefore a PM call — recorded as a residual risk, not fixed.

## 7. Handoff notes

### `t3-01-content-create-card` — the exact argument shape for resolved spans

The create card hands core one object; core never touches the page.

```ts
// src/core/entry-overlap.ts
interface CodePointRange { start: number; end: number }        // half-open [start, end), CODE POINTS
type ResolvedEntryRanges = ReadonlyMap<string, CodePointRange>; // key = entry.id
interface ResolvedSpans { candidate: CodePointRange; byEntryId: ResolvedEntryRanges }
```

- Pass it as `spans` on `CreateEntryOnPageInput` (`src/core/entry-store-write.ts`), alongside
  `url`/`pageKey`, `comment`, `text`, `anchor`, `currentName`, and the injected `now` + `rng`.
- **One re-resolve pass** (`A37`): build the stream once, resolve the selection to `candidate`, and resolve every
  existing entry of the resolved page with `resolveAnchor` over that same stream. Never mix streams, never
  compare stored `anchor.text` against the selection.
- A stale entry is simply **omitted** from `byEntryId` (`A24`); a range mapped to an empty or inverted value is
  read the same way, and the entry list — not the map — drives the scan.
- Offsets must be code points. `locateAnchor` / the stream's fragment offsets are already in that domain; a raw
  DOM or `String.indexOf` offset must go through `utf16IndexAt` / `codePointOffsetAt` first.
- A boundary touch is legal: if the selection starts exactly on the `block boundary space` after an existing
  entry, no `CodePointRange` pair intersects, so the create is allowed and no message is shown.
- A create has no entry of its own, so exclude nothing.
- Codes the card must map to Russian: `name_required`, `comment_empty`, `comment_too_long`, `page_limit`,
  `overlap`, `duplicate` (the last two are new in this commit).

### `t3-03-content-editor` — excluding the entry being edited from its own overlap check

- Call the check with the entry list filtered: `entries = removeById(pageEntries, editingId)`
  (`removeById` is exported from `src/core/entry-rules.ts` and never mutates its input). Then either
  `assertCreatable({ entries, comment, currentName, spans })` or, if only the overlap answer is needed for the
  message, `findOverlappingEntry(candidate, entries, spans.byEntryId)`.
- Leaving the edited entry's range inside `spans.byEntryId` is harmless: both searches read the map **by the id
  of an entry that is in the list**, so an id that is not in the list is never consulted. The behavior is pinned
  by `is driven by the entry list, so an entry excluded from it cannot block (t3-03)`.
- Do not pass the edited entry's own id in `entries` **and** expect a self-collision to be forgiven — there is no
  `exceptId` parameter (see Deviations 4).
- Keep the exclusion local to the overlap/duplicate step: the entry cap, authorship and the popup list still
  count the edited entry, so measure the cap before filtering.
- Re-resolve the edited entry's own anchor only if the editor needs its current range for something else; for
  the exclusion path it is not required.
