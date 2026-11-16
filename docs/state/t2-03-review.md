# t2-03-core-overlap — code review (attempt 2)

Reviewer: `code-reviewer`, read-only. Range reviewed: `git diff 02a4c73..5a029c5` — one commit
`5a029c5 feat(t2-03): overlap and duplicate creation checks` (11 files, +947/−73, verified with
`git diff --stat`). Upper bound is the briefed commit, not HEAD (`HEAD = 496737e` is a later PM docs
commit and was excluded); `git status --porcelain` is empty, so every file read equals its committed
blob. Attempts: 2/2 (attempt 1 `3d150ac8` timed out at the ceiling; attempt 2 `cb93b848` is the
completion slice). Slice size: 5 substantive AC + carried fixes `A27`/`A28`/`R1`/`R2` — the PM already
recorded the budget breach of `docs/specs/code-review-flow.md` → Rules in the attempts log, so it is
not repeated as a finding.

Scope verified independently: `git diff --stat 02a4c73..5a029c5 -- src/content src/popup src/options
src/manifest.json tests/core-entry-store-write.spec.ts tests/core-storage-port.spec.ts tests/support
scripts .pi docs/project-profile.md docs/specs/content-overlay-ui.md docs/specs/INDEX.md package.json
package-lock.json tsconfig*.json` → **empty**. Changed paths are exactly: `docs/specs/inline-comment-model.md`,
`src/core/{anchor-build,entry-overlap,entry-rules,entry-store-write,entry,text-normalize}.ts`,
`tests/{core-anchor-build,core-entry-overlap,core-text-normalize,entry-rules}.spec.ts`. No storage-layout,
painting, permission, dependency or harness file in the range.

## Verdict

**accepted**

Every AC is `pass`. No blocking finding, no spec/code conflict, no forbidden or runtime dependency,
no network or host-DOM surface, no scope leak, all three green-gate outputs quoted in the engineer
report §4, the read-only checker re-run by me byte-identical, and the quoted test count matches a
static `it(` census. The four carried fixes (`A27`, `A28`, `R1`, `R2`) landed in code; two of their
required spec clauses did not (remark 2).

## Acceptance criteria (one line each)

- **AC1 — resolved-range value type + `rangesIntersect` with the shared-boundary rule; four boundary cases tested — pass.** `src/core/entry-overlap.ts:45` (`CodePointRange { start, end }`, half-open, code points), `:89` (`isUsableRange`), `:108` (`rangesIntersect`: `a.start < b.end && b.start < a.end`), `:120` (`sameRange`). Pinned at `tests/core-entry-overlap.spec.ts:81` (`[0,10)` vs `[10,20)` → `false`, both orders), `:86` (`[0,10)` vs `[9,20)` → `true`, both orders), `:92` (identical → `true`; `sameRange` inequality), `:99` (zero-length → `false` in four placements, including `[10,10)` vs `[10,20)`), `:106` (the `A37` stream shape: entries `[0,5)`/`[6,11)`, separator `[5,6)`; candidate `(5,6)` → `null`, `(5,7)` → `second`, `(4,6)` → `first`), `:125` (eight malformed values: negative, inverted, `NaN`, `1.5`, `±Infinity` → `isUsableRange false`, intersect nothing), `:149` (8×8 symmetry matrix). Spec: model `:74` "Resolved range", AC6 at `:133`, new AC25 at `:140`.
- **AC2 — `findOverlappingEntry(candidate, entries, resolvedRanges)` → first hit or `null`; hidden participates (`A22`), stale skipped (`A24`); returned entry is the one the UI names — pass.** Signature matches exactly at `src/core/entry-overlap.ts:133-152`; the scan walks `entries` in caller order (`:138`) and never reads `visible` (`A22`); `:141-144` skips any id whose map value is not a usable range (`A24`). Pinned at `tests/core-entry-overlap.spec.ts:170` (order: `b` before `a`), `:183` (hidden `[10,20)` blocks `[15,16)`, does not block `[20,21)`), `:191` (stale), `:235` (a list-excluded entry cannot block — the `t3-03` shape), `:249` (same stored words at another range → `null`, i.e. anchor text is never consulted — `A37`). Gate-level: `tests/entry-rules.spec.ts:318`.
- **AC3 — `assertCreatable` gains `overlap` then `duplicate` after the entry cap, four pre-existing codes unchanged, whole six-step order pinned by one table — pass.** `src/core/entry-rules.ts:62-68` (`CreateBlockCode` = the six Flow-3 codes), `:84` (`spans?: ResolvedSpans` on `CreateAttempt`), `:163-191`: name → comment-empty → 256 → 20 → `findOverlappingEntry` (`:186`) → `findDuplicateEntry` (`:189`), with `duplicate` reported when both match (ruling `A23`; correct, because `sameRange` implies intersection for a usable range). Table test `tests/entry-rules.spec.ts:281` (six rows in order, each row also violating every later step); `:343` (duplicate wins when both match; equal range + different comment → `overlap`); `:318` (boundary touch allowed at the gate). The four older codes keep their own tests, untouched, at `:246-278`. `tests/core-entry-store-write.spec.ts:238` ("counts the 20-entry cap per pageKey, not per store") and `:875` ("runs the creation rules first, so a full page still reports `page_limit`") are at those exact lines and the file is absent from the range — unchanged, and green in the quoted 396.
- **AC4 — the model spec is edited in the same commit: `A23`, `A24`, `A22`, moved-range wording — pass** (with the carried-clause gap of remark 2). `docs/specs/inline-comment-model.md`: Terms `:31` (`overlap` re-pointed at `resolved range`), `:32` (`resolved range`), `:33` (`duplicate entry`); Flow 3 `:38` (last two steps work on resolved ranges from one re-resolve pass, codes `overlap`/`duplicate`); Rules `:73` (Overlap: new **or moved** range + the `t3-03` editor path excluded from the scanned list), `:74` (Resolved range, `A37` + block-boundary separator + one-resolve-per-entry cost), `:75` (Hidden entries, `A22`), `:76` (Stale entries, `A24`, "stays listed and stays deletable"), `:77` (Duplicate entry, `A23`, trimmed comment in code points); Edge Cases `:103-104`; AC 24–26 at `:139-141`. Behavior change + spec edit in one commit satisfies `code-review-flow.md` → Rules.
- **AC5 — purity and boundaries: no DOM, no `chrome.*`, no `any`; the module joins a `MODULES` purity scan; no Russian strings in `src/core/` — pass** (deviation: the shared scan was not extended — remark 1). My own greps: `grep -rnE "as any|@ts-ignore|@ts-expect-error|: any\b" src/core/` → no hits; `grep -rnE "fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator.sendBeacon" src/` → no hits; a node scan for `[^\x00-\x7F]` over every file under `src/` returns only typographic em/en dashes in comments for all six `src/core/` modules — no Cyrillic anywhere in `src/` (the Cyrillic in `src/manifest.json`, `src/options/text.ts`, `src/popup/text.ts`, `src/content/text.ts` is pre-existing UI/product text, and `tests/toolchain-contract.spec.ts:133-137` still pins the three constants modules). `src/core/entry-overlap.ts` imports only `./entry` (`:41`). Purity is enforced by an executable scan at `tests/core-entry-overlap.spec.ts:315-354` whose token list is equal-or-stronger than the shared one (adds the non-ASCII check), and every `src/core` file is additionally swept automatically by `tests/toolchain-contract.spec.ts:113-120`. No UI string was added in this slice, so the "Russian message from a constants module" rule is untouched (`src/content/text.ts` still holds only the placeholder).

## Boundary checks for this slice

- **Half-open algebra — clean.** `rangesIntersect` (`src/core/entry-overlap.ts:108-115`) is strict-inequality on both sides, so `[0,10)`/`[10,20)` are disjoint and `[0,10)`/`[9,20)` share exactly one code point; both directions asserted, plus an 8×8 order-symmetry matrix (`tests/core-entry-overlap.spec.ts:149`).
- **`A37` block-boundary separator — clean, and pinned against the real stream shape.** `tests/core-entry-overlap.spec.ts:106` builds the `t2-02` shape (`first [0,5)`, separator code point 5, `second [6,11)`) and asserts a candidate sitting on the separator collides with neither, while one code point into either neighbour collides with exactly one. No code path anywhere treats separator content as shared: the module reads no anchor, no DOM, no text (`src/core/entry-overlap.ts:41` is its only import).
- **Zero-length candidate — clean.** `isUsableRange` (`:89`) requires `end > start`, so `[12,12)` and `[9,3)` intersect nothing and match nothing (`src/core/entry-overlap.ts:134-136`, `:161-163`; tests `:99`, `:226`). See remark 6 for the consequence (a degenerate candidate is allowed, not refused).
- **`A22` hidden participates — clean.** Nothing in `findOverlappingEntry`/`findDuplicateEntry` reads `visible` (`src/core/entry-overlap.ts:133-152`, `:160-179`); asserted at `tests/core-entry-overlap.spec.ts:183` and `:302`, and at the gate `tests/entry-rules.spec.ts:318`. Spec `:75`.
- **`A24` stale never blocks — the rewritten fixture genuinely pins it and is not a tautology.** `tests/core-entry-overlap.spec.ts:191-224`: the `null` answer is produced by `[stale, live]` with map `{live: [30,40)}` and candidate `[12,13)`; the **control pair** that makes it non-vacuous is (a) the same candidate/entries but with the stale range resolved onto `[10,20)` → returns `stale`, and (b) candidate `[35,36)` → returns `live`. Only the presence of the stale range changes the answer, so the assertion measures the range, not the fixture. The degenerate-map variant (`stale → [12,12)`) is kept. Intent is unchanged: the test name still asserts "a stale entry never blocks", and the gate-level equivalent is `tests/entry-rules.spec.ts:318`. Production code was not modified to satisfy it.
- **`assertCreatable` order — exactly name → selection → 256 → 20 → overlap → duplicate.** `src/core/entry-rules.ts:164-191`; steps 5–6 sit after `page_limit` and before the `A26` guard in `src/core/entry-store-write.ts:192-198`, so `tests/core-entry-store-write.spec.ts:875` keeps its precedence. Step 2 ("selection not empty") has no core code, and the doc comment at `:163-170` says so and names the real owner (`buildAnchor` → `null`); the table row is labelled accordingly.
- **`A27` — clean.** `src/core/anchor-build.ts:119-126`: `spanStart = start + leadingCodePoints(span)`, `spanEnd = end - trailingCodePoints(span)`, and the window is sliced to those boundaries (`:122-126`), so the stripped edge whitespace never enters the window. Pinned by `tests/core-anchor-build.spec.ts:239` and `:260` on a twice-repeated sentence: the emitted `prefix + text + suffix` is asserted to be a substring of the stream and `resolveAnchor` is asserted to land on the **second** copy — the discriminating signal between the contextual step and the silent bare-text fallback (closes `t2-01` remark `R3`).
- **`A28` — clean in code.** `src/core/anchor-build.ts:107-111` refuses before any slicing; `:163-179` (`contextSize`, `fragmentCountOf`, `isCount`) accept only non-negative integers, so `-1`, `-0.5`, `2.7`, `NaN`, `±Infinity` yield `null`, never `0`. `contextWindow: 0` and `fragments: 0` stay legal (a stated choice, asserted at `tests/core-anchor-build.spec.ts:165`). Four old coercion rows were removed from the base table at `:150-153` — required by the ruling; the spec never pinned the coercion either (verified by grep for `becomes 0` / `coerc` in the spec), so no spec line was contradicted. See remark 2 for the missing spec clause.
- **`R1` — clean.** `docs/specs/inline-comment-model.md:79` now points at a **closed** set ("exactly the set `WHITESPACE_RUN` matches in `src/core/text-normalize.ts`"), enumerates all members, and names U+2028 line separator / U+2029 paragraph separator explicitly as line and paragraph separators; the negative test at `tests/core-text-normalize.spec.ts:77` pins `normalizeText('a\u0085b') === 'a\u0085b'`, `'a  \u0085  b'` → `'a \u0085 b'`, trim-safety of NEL, `isNormalizedText('a\u0085b') === true`, U+200B survival, and that U+2028/U+2029 collapse to one space. `src/core/text-normalize.ts:40-49` carries the same enumeration in the comment on the constant. The shipped function is unchanged, so no normalization behavior moved.
- **`R2` — clean.** `src/core/entry.ts:21-40` cites real spec bullets ("Anchoring", "Anchor window") and the default-40/caller-may-change wording; `grep -rn "whitespace collapsed" src/ docs/specs/` → no hits anywhere.
- **Purity of the new module — clean** (evidence in AC5). Network/dependency/host-respect: `package.json` and `package-lock.json` are not in the range, no `fetch`/XHR/`WebSocket`/beacon in `src/`, no DOM write or painting code, `src/manifest.json` untouched (`permissions: ["storage"]`).
- **`src/content/` untouched — clean.** The selection→stream adapter stays `t3-01`'s work; the ranges this slice consumes are plain numbers supplied by the caller (`src/core/entry-overlap.ts:9-15` states the split).
- **Spec/code agreement for AC24–AC26 — clean.** AC24 at `:139`: duplicate→`duplicate`, same range/different comment→`overlap`, same comment at a non-intersecting range→allowed, stale→allowed, hidden→refused — all five shipped and pinned (`src/core/entry-rules.ts:185-190`; `tests/entry-rules.spec.ts:318`, `:343`, six-step rows 5–6; `tests/core-entry-overlap.spec.ts:259-313`). AC25 at `:140` pinned at `tests/core-entry-overlap.spec.ts:106` + gate `:318`. AC26 at `:141` — green, count cross-checked below. The "moved range … entry being edited excluded" clause at `:73` is not implemented here by design and the shipped shape supports it (list-driven scan, pinned at `tests/core-entry-overlap.spec.ts:235`), so no conflict.

## Gates

- Report §4 quotes, verbatim: `npm test` → `Test Files 21 passed (21)` / `Tests 396 passed (396)`; `npm run build` → `dist/ is a self-contained MV3 folder (10 files)` with `manifest references resolved: content.js, popup/index.html, options/index.html`; `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 19 info(s)`, exit 0; plus `npm run typecheck` clean.
- I re-ran the read-only checker myself: **`0 error(s), 0 warning(s), 19 info(s)`, exit 0** — identical to the quote, all 19 being the checker's unconditional "planned path not created yet" INFO for backticked plan tokens. Of the 19, the model spec accounts for 16, and the two new tokens (`src/core/text-normalize.ts`, `tests/core-text-normalize.spec.ts`) are present.
- Quoted count cross-checked statically: `it(` census per file = 15+21+21+7+6+17+17+20+22+16+55+21+19+18+13+15+17+5+31+31+9 = **396** over exactly **21** spec files; no `.skip` / `.only` / `it.each` anywhere in `tests/`. Delta arithmetic from `02a4c73`: `t2-02` 367 + `tests/core-entry-overlap.spec.ts` 22 (new) + `core-text-normalize` 16→17 + `entry-rules` 28→31 + `anchor-build` 14→17 = 367 + 29 = **396**. The quote is truthful.
- I did not re-run `npm test` / `npm run build` (read-only reviewer, `code-review-flow.md` → Rules).

## Blocking findings

None.

## Non-blocking remarks (numbered; 2 and 3 need a PM decision)

1. **The new module was not added to the shared `MODULES` purity scan.** `tests/core-storage-port.spec.ts:141-149` still lists seven modules (`storage-port`, `page-index-store`, `entry-store-read`, `entry-store-write`, `text-normalize`, `anchor-build`, `anchor-resolve`) and the file is not in the range, while the `t1-06` precedent `R6` (recorded in the `t2-01` review) is "new core modules join that list". The guarantee itself is intact: `tests/core-entry-overlap.spec.ts:315-354` scans `entry-overlap.ts` with the same forbidden tokens plus non-ASCII, and `tests/toolchain-contract.spec.ts:113-120` sweeps every `src/core` file automatically. Cost of leaving it: two parallel purity lists that can drift. Fix in the next commit that touches that file (one line).
2. **`A27` and `A28` shipped as code rules with no spec clause, and the omission is not declared in the report.** The task state file's carried-fix items require "one spec clause" each (`docs/state/t2-03-core-overlap.md` → Carried fixes: `A27` "Two tests, one spec clause", `A28` "One spec clause, one table of rejected values"). In the commit, `docs/specs/inline-comment-model.md:78` ("Anchoring") and `:81` ("Anchor window") are byte-identical to the base, and grep for `contextWindow` in the spec returns only `:78`. Neither code change contradicts a spec line — `A27` moves the code **toward** `:78`/`:81` ("characters before and after it", "exact substrings of the stream… which is why searching the same stream finds them"), and `A28` fills a case the spec never stated (the base coercion had no spec line either) — so this is not a spec/code conflict and no AC fails, which is why it is not blocking. It does leave a load-bearing refusal with no grep anchor: `src/core/anchor-build.ts:107-111,163-179` makes `buildAnchor` return `null` for an out-of-domain `contextWindow`/`fragments`, and `t3-01` must branch on that `null`. Required: two clauses on `:78`/`:81` (window taken at the trimmed span; an out-of-domain option refuses the anchor, same stance as `A26`) in the next spec-touching commit. Report-accuracy part: report §5 lists five deviations and does not include this one.
3. **`spans` is optional, so steps 5–6 can be skipped silently.** `src/core/entry-rules.ts:84` and `src/core/entry-store-write.ts:110` make `spans?: ResolvedSpans`, and `src/core/entry-rules.ts:180-182` returns `null` (allowed) when it is absent — pinned as intended at `tests/entry-rules.spec.ts:369`. Spec Flow 3 `:38` states the six checks unconditionally and AC24 `:139` says "a candidate over a hidden entry's range is refused" without qualification, so a core caller that omits `spans` gets an unemitted overlap. Not blocking: no shipped call site omits it, and no AC covers it (the engineer recorded it as open question 3). Required from the PM: either make `spans` required on both types, or refuse with a machine code (e.g. `spans_missing`) and add the spec clause.
4. **No test exercises `spans` through the write API.** `tests/core-entry-store-write.spec.ts` is untouched by the range, so `CreateEntryOnPageInput.spans` (`src/core/entry-store-write.ts:110`), the forwarding at `:192`, and the copy-only-when-present rule of `creationAttemptOf` (`:541-550`) have no end-to-end assertion; only the pure gate and the shape (`tests/core-entry-overlap.spec.ts:357`) are pinned. Not blocking (AC3 lists the gate order, not the write integration), but `t3-01` should land one create-with-spans case plus one create-at-the-cap-with-spans case.
5. **`duplicate` has no user-visible wording, and the spec's Overlap bullet already covers the case.** `docs/specs/inline-comment-model.md:77` names the code but not the message, while `:73` requires `Выделение пересекается с существующей записью` for any intersecting range — and a duplicate always intersects — as does `docs/specs/content-overlay-ui.md:74` (AC6). Nothing has been added to `src/content/text.ts` (correct for this slice: message strings were out of scope). The overlap string needs no ruling (it is already specified); a distinct `duplicate` message does. Do not let two codes silently map to one string by accident in `t3-01`.
6. **A degenerate `spans.candidate` is allowed, not refused.** `src/core/entry-overlap.ts:134-136` and `:161-163` short-circuit to `null` for an unusable candidate range, and step 2 of Flow 3 has no core code (`src/core/entry-rules.ts:163-170`), so the only things stopping a zero-length create are `buildAnchor → null` and the `A26` guard (`src/core/entry-store-write.ts:196`), neither of which is exercised from the content side. Consistent with the module's documented totality stance, but it means the card is the sole line of defence (see residual risk 1 for `t3-01`).
7. **`docs/specs/INDEX.md:8` covered-paths for the model spec is still incomplete** (carried `t2-02` remark `N5`): the model spec owns rules implemented under `src/content/anchor/`, but the row lists `src/core/`, `src/content/store`, `src/popup/store`, `tests/`. Not blocking (INDEX is an index, the checker validates only spec/role references), but it should be corrected in the next spec-touching commit.
8. **Report arithmetic slip (no gate impact).** Report §4 says this attempt "added exactly 2" checker INFOs; the model spec's token count went 13 → 16, i.e. **+3** to the 19 total (`t2-02` recorded 16). Errors and warnings are 0 either way and the quoted totals are exact. Report §3 also numbers the spec edit as "AC4 → this file's AC5 wording", while the state file's AC4 **is** the spec edit and AC5 is purity; the PM should record the verdict against state-file numbering (same class as `t2-01` remark `R7b`).
9. **PM bookkeeping to close.** `docs/state/t2-03-core-overlap.md` → Verdicts still reads "engineer report: not started / reviewer verdict: not started" and the delegation line says "reviewer not yet delegated". Per `code-review-flow.md` → AC1, close with this verdict, this artifact path, and the outcome line; the report itself lives only at the managed artifact path (report deviation 5), so it must be copied to `docs/state/t2-03-engineer.md`.

## `t3-01` readiness — the exact shape the content layer must build

Core consumes exactly one object, and it is the only carrier of the resolved numbers
(`src/core/entry-overlap.ts:45,57,64,77`):

```ts
interface CodePointRange { start: number; end: number }             // half-open [start, end), CODE POINTS:
                                                                    // integer, start >= 0, end > start
type ResolvedEntryRanges = ReadonlyMap<string, CodePointRange>;     // key = stored Entry.id; a stale
                                                                    // entry is ABSENT (A24)
interface CandidateSpan  { range: CodePointRange; comment: string } // internal to the two searches
interface ResolvedSpans  { candidate: CodePointRange; byEntryId: ResolvedEntryRanges }
```

Consumption path: `createEntryOnPage(port, { url, comment, text, anchor, currentName, spans, now, rng })`
→ `creationAttemptOf` (`src/core/entry-store-write.ts:541-550`, copies `spans` only when present) →
`assertCreatable` (`src/core/entry-rules.ts:163-191`). What the gate actually compares is
`{ range: spans.candidate, comment: validateComment(input.comment).normalized }`
(`src/core/entry-rules.ts:185`) against `spans.byEntryId.get(entry.id)` for every entry in
`decodableEntries(context)` (`src/core/entry-store-write.ts:554`), in stored order. Consequences the
card must honor: (a) **always pass `spans`** — omitting it silently skips steps 5–6 (remark 3);
(b) the map must be keyed by the **stored ids of the same page the write path resolves**
(`resolvePageKey(url, index) ?? pageKeyFromUrl(url)`), because the scan reads the map by those ids —
a map built from a different page key or a different read is indistinguishable from "all entries
stale" and the create is allowed with no signal; (c) resolve the **candidate** from the selection's own
stream offsets (no anchor resolution needed for it) and every existing entry with `resolveAnchor` /
`locateAnchorInStream` over **one** stream (`A37`, spec `:74`), never from stored `anchor.text`
(pinned at `tests/core-entry-overlap.spec.ts:249`); (d) all offsets are code points — a `Range` or
`String.indexOf` offset must pass through the fragment code-point map first (`t2-02` review, spec `:84`);
(e) `spans.candidate` must be usable (`end > start`), because a degenerate candidate is allowed rather
than refused (remark 6); (f) the refusal the card will see is `CreateBlockCode` = `overlap` or
`duplicate`, and its Russian strings live in `src/content/text.ts` — the overlap wording is already
specified (`content-overlay-ui.md:74`), the `duplicate` wording needs the PM ruling of remark 5.

## Residual risks for `t3-01-content-create-card`

1. Steps 5–6 are **opt-in** for the caller (`src/core/entry-rules.ts:180-182`): a card that forgets
   `spans`, or passes `{ candidate, byEntryId: new Map() }`, creates over a hidden entry with no
   refusal, and spec AC24 will then be observably false. The `t2-02` risk "the selection→stream
   adapter is the whole correctness risk of the slice" now has a second half: the same pass must also
   resolve every existing entry, and a half-populated map is read as "stale" (`A24`), not as an error.
2. Cost is one resolve per existing entry per create (spec `:74`, accepted). With the `t2-02` walk
   (`src/content/anchor/text-stream.ts`, no depth cap — `t2-02` remark `N8`) plus `A37`, a create on a
   long article with 20 entries is 21 resolves on the main thread; `t3-01` must build the stream once
   and reuse it for candidate and all entries, and must not re-enter `locateAnchor` per entry
   (`t2-02` remark `N7`).
3. The ids in `byEntryId` must come from the same page read the write performs; a stale read (another
   tab) makes the overlap answer computed over entries the write will not see. The `loadPageContext` →
   `commitRecords` read-modify-write race is still carried from `t1-05`/`t1-06`, and this slice adds a
   page-side writer whose refusal logic depends on that same snapshot.
4. `A26` still bites at capture: `entry.text` must equal `anchor.text` and be the normalized slice of
   the same stream, and `buildAnchor` now also refuses an out-of-domain `fragments`/`contextWindow`
   (`src/core/anchor-build.ts:107-111`) — the card must treat that `null` as "do not open Save", not
   as `entry_invalid`. There is no spec clause for that refusal yet (remark 2).
5. A zero-length or whitespace-only selection reaches neither Flow-3 step 2 nor steps 5–6 (remark 6);
   the card must suppress it before calling core.
6. Repeated text with an unmatched window anchors to the first document-order copy (`t2-02` residual
   4); a candidate may therefore be refused for overlapping a range the user cannot see, or allowed
   where the user expected a collision, with no UI signal.
7. The author name the card needs still comes from the settings-read slice (`A34`/`A31`); a failed
   read must leave `currentName` empty so the gate reports `name_required`, never a proxy code.

## Residual risks for `t3-03-content-editor`

1. **Self-exclusion has no parameter.** There is no `exceptId` on any of these functions; the exclusion
   is done on the entry **list**: `entries = removeById(pageEntries, editingId)`
   (`src/core/entry-rules.ts:209`, non-mutating), and the edited entry's leftover range in
   `byEntryId` is inert because the scan reads the map by ids of entries in the list — pinned at
   `tests/core-entry-overlap.spec.ts:235`. Passing the edited entry in the list and expecting a
   self-collision to be forgiven will produce `overlap` against itself. The spec clause requiring this
   exclusion is `docs/specs/inline-comment-model.md:73`.
2. **Measure the 20-entry cap before filtering.** `page_limit` counts `attempt.entries.length`
   (`src/core/entry-rules.ts:176-178`); a filtered list of 19 hides the fact that the page is at the
   cap, and the gate cannot distinguish an edit from a create.
3. **`duplicate` is unreachable on the edit path once the entry is excluded**, so re-selecting the same
   span with the same comment becomes an ordinary create. The delete/create order must be pinned by the
   PM (report open question 2): delete-then-create needs no exclusion; create-then-delete does, and the
   intermediate state is user-visible.
4. The candidate comment the duplicate rule compares is `validateComment(...).normalized` (trimmed,
   `src/core/entry-rules.ts:185` and `src/core/entry-overlap.ts:182-188`); the editor must not
   pre-compare the raw textarea value or it will disagree with core.
5. `overlap` / `duplicate` → Russian mapping: `overlap` is specified (`content-overlay-ui.md:74`),
   `duplicate` is not (remark 5). Both strings must come from `src/content/text.ts`.
6. A moved range must be re-resolved on the **current** stream before the check (`A37`, spec `:74`);
   reusing a stale range from an earlier pass makes the refusal wrong in both directions, and a stale
   edited entry contributes no range at all (`A24`).
7. Cross-tab race and the "anchored to a different copy" limitation carry over unchanged from `t3-01`.

## Evidence path

- Task state file: `docs/state/t2-03-core-overlap.md` (AC1–AC5, rulings `A22`/`A23`/`A24`/`A37`, carried
  fixes `A27`/`A28`/`R1`/`R2`, out-of-scope section, open questions, attempts log with the PM's
  slice-size error).
- Engineer report: `C:\Users\user\.pi\agent\sessions\--C--Users-user-Desktop-test-inlineNotes--\subagent-artifacts\outputs\cb93b848-ec2c-49be-b033-dcba8d897d07\docs/state/t2-03-engineer.md`
  (§1 changed paths, §2 item-by-item, §3 AC self-check, §4 gate quotes, §5 deviations, §6 open questions,
  §7 handoff notes).
- Risks this slice had to answer: `docs/state/t2-02-review.md` → "residual risks for `t2-03-core-overlap`"
  1–4 (stale rule → `A24` shipped and spec'd at `:76`; separator boundary → `:74` + test `:106`; gate
  order and the two unchanged store tests → verified; per-entry resolve cost → spec'd as accepted);
  carried `R1`/`R2` from `docs/state/t2-01-review.md` (closed), `R3`/`R4` (closed in code as `A27`/`A28`,
  spec clauses outstanding — remark 2).
- Spec: `docs/specs/inline-comment-model.md:31,32,33,38,73,74,75,76,77,79,103,104,139,140,141`;
  `docs/specs/content-overlay-ui.md:74`; `docs/specs/code-review-flow.md` → Rules / Edge Cases
  (read-only reviewer, gate quoting, ≤2 attempts, spec-edit rule, slice size).
- Code: `src/core/entry-overlap.ts:41,45,57,64,77,89,108,120,133,160,182`;
  `src/core/entry-rules.ts:62,84,163,176,180,185,186,189,209`;
  `src/core/entry-store-write.ts:110,192,196,541,554`;
  `src/core/anchor-build.ts:107,119,120,122,125,126,146,152,163,173,178`; `src/core/entry.ts:21-40`;
  `src/core/text-normalize.ts:40-49`.
- Tests: `tests/core-entry-overlap.spec.ts:81,86,92,99,106,125,149,170,183,191,226,235,249,259,269,276,285,294,302,315,357`
  (22); `tests/entry-rules.spec.ts:246,255,264,270,281,318,343,369` (31);
  `tests/core-anchor-build.spec.ts:150,165,239,260` (17); `tests/core-text-normalize.spec.ts:77` (17);
  `tests/core-entry-store-write.spec.ts:238,875` (unchanged); `tests/core-storage-port.spec.ts:141-184`;
  `tests/toolchain-contract.spec.ts:113-152`.
- Commands run by the reviewer (read-only only): `git log --oneline -5`; `git status --porcelain` (empty);
  `git log --oneline 02a4c73..5a029c5` (one commit); `git diff --stat 02a4c73..5a029c5` (11 files,
  +947/−73) and the same `--stat` over the out-of-scope paths (empty); `git diff` of the spec, the four
  modified core modules, and the four test files; `git show 02a4c73:<test file>` census for the delta;
  greps over `src/` and `tests/` (`any`/`@ts-ignore`, network tokens, Cyrillic/non-ASCII via node,
  `whitespace collapsed`, `MODULES`, `contextWindow`, `.skip`/`.only`/`.each`), a static `it(` count
  (**396** over 21 files), and `node scripts/check-agent-config.mjs` →
  **`0 error(s), 0 warning(s), 19 info(s)`, exit 0** — identical to the quoted output. No `npm test` /
  `npm run build` re-run: the reviewer is read-only per `code-review-flow.md` → Rules. No file was
  created, edited or deleted by this review.
