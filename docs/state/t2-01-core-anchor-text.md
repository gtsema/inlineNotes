# t2-01-core-anchor-text

## Goal

Anchoring at the string level, in `src/core/`: the normalized text stream contract, building an `anchor` from a
selection inside that stream, and resolving an `anchor` back to a position — including the repeated-text
disambiguation rule. No DOM in this task: the DOM ⇄ stream mapping is `t2-02`.

## Inputs the engineer reads

`docs/specs/inline-comment-model.md` (Rules / Semantics → Anchoring, Staleness; Edge Cases "same text repeated",
Terms `anchor` / `stale entry`), `docs/state/t2-01-core-anchor-text.md` (this file), `docs/state/plan-implementation.md`
(Stage 2), `src/core/entry.ts` (`EntryAnchor`), `src/core/entry-rules.ts` (`codePointLength`),
`.pi/skills/requirements-spec/SKILL.md`.

## AC (5 substantive + gates)

1. `normalizeText(raw)` in `src/core/text-normalize.ts`: collapse every run of whitespace (space, tab, newline,
   NBSP, and other Unicode spaces) into a single U+0020, trim the ends; deterministic, idempotent
   (`normalizeText(normalizeText(x)) === normalizeText(x)`), never reorders characters; counts stay code-point based
   (`😀` is one code point).
2. `buildAnchor(pageText, start, end, { fragments, contextWindow = 40 })` → `EntryAnchor`: `text` is the normalized
   selection between `start` and `end`; `prefix` / `suffix` are the **up to** `contextWindow` normalized characters
   immediately before / after the match, taken from the same stream; `fragments` becomes `fragmentCount`. Code-point
   offsets, not UTF-16 units. A selection at the very start or end of the page yields a shorter `prefix` / `suffix`,
   never a padded one.
3. `resolveAnchor(pageText, anchor)` → `{ ok: true, start, end }` or `{ ok: false, code }`. Search order: first
   `prefix + text + suffix`; if that yields nothing, fall back to `text` alone. Repeated text: the **first** match in
   document order wins, and the choice is stable across reloads (a test resolves the same anchor twice on two
   identical streams and asserts identical positions). Codes: `anchor_not_found`, `anchor_ambiguous` is NOT a code —
   ambiguity is resolved by document order per the spec edge case, and the test pins that.
4. Staleness contract: a non-resolving anchor returns a code and produces no highlight, but the entry stays in the
   list and stays deletable — assert that `resolveAnchor` never mutates the anchor and that nothing in this task
   removes an entry (spec → Staleness).
5. `docs/specs/inline-comment-model.md` is edited in the same commit where the contract needs a word: the
   normalization definition (which characters collapse), the prefix/suffix window measured in code points, the
   two-step search (`prefix+text+suffix`, then `text`), and the document-order tie-break.

Carried fixes from the `t1-06` review (docs/tests only, do not expand the AC list):

- `R2` — the write module and its test cite a spec bullet "Write result" that does not exist; either add that bullet
  under Rules/Semantics or fix the two citations (they are English grep anchors, a repo rule).
- `R3` — the "Page lookup" rule is phrased unconditionally; add the clause "when the index read succeeded".
- `R4` — the index write policy names only the read side; state that a write publishes the **decoded** index.
- `R5` — add one test for the removal half of `removeSlotThenIndex`: the slot removal succeeded and the index
  publication failed.
- `R6` — add `crypto` to the shared `MODULES` purity scan in `tests/core-storage-port.spec.ts`.
- `A26` — `createEntryOnPage` refuses with `entry_invalid` unless `text === anchor.text` and `text` is already
  normalized by `normalizeText`; two tests (a non-normalized text, and a text/anchor mismatch).

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order: module + tests → `npm test` early → spec lines → gates → commit `feat(t2-01): text normalization and anchor resolution`. Commit as soon as green.

## Explicitly out of scope

DOM ranges, `Range`/`TreeWalker`, fragment mapping (that is `t2-02`, and it is where `jsdom` finally enters per
ruling `A2`); overlap rules (`t2-03`); any content-script, popup or options code; no new dependency in this task
(pure string code needs no jsdom).

## Attempts log

- attempt 1: brief issued; delegated after the `t1-06` verdict (sequential acceptance).

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: attempt 1 complete; commit `10e10d7` (11 files, +1245/-16); PM re-ran the gates: `npm test` 310/310
  over 17 files, `npm run build` self-contained `dist/` (10 files), checker `0 errors / 0 warnings / 10 INFO`.
  Artifact: `…/subagent-artifacts/outputs/7b24fff9-d04d-4b32-bcf7-6bf6519c5936/docs/state/t2-01-engineer.md`.
- reviewer verdict: **accepted**, no blocking findings, remarks `R1`–`R7`; `t2-02` readiness paragraph present.
  Artifact copied to `docs/state/t2-01-review.md`.
- PM decision: task closed at attempt 1/1. Reviewer note `R7b` accepted: the `A26` work is recorded here against
  state-file AC5 (the spec edit), and the INFO baseline is 10, not 9 (this commit's own backticked `tests/` token).

## PM rulings on the review remarks

- `A27` (remark `R3`, edge-whitespace selection kills the contextual step): the window is taken at the boundaries of
  the **trimmed** span. A caller that hands raw selection offsets whose slice starts or ends with whitespace must still
  get a needle that is a substring of the stream. Fix lands in `t2-03` (one function, two tests, one spec clause).
- `A28` (remark `R4`): an out-of-domain `contextWindow` or `fragments` value is **refused** (`buildAnchor` returns
  `null`), not coerced to 0 — the same stance as `A26`. Fix lands in `t2-03` with a spec clause.
- `R1` accepted: the spec names a categorical whitespace set; the code is the closed 17-form enumeration of `\s`.
  The bullet must point at the constant, U+2028/U+2029 must be called line/paragraph separators, and one negative test
  must pin that a non-listed control (U+0085 NEL) survives. Carried into `t2-03`.
- `R2` accepted: `src/core/entry.ts` comments cite a spec phrase this commit deleted. Docs-only, carried into `t2-03`.
- `R5` accepted and becomes an obligation of `t2-02`: the stream builder returns normalized text **by construction**,
  and a test asserts `isNormalizedText(stream.text)`; core cannot detect a forgotten normalization on its own.
- `R6` accepted and deferred to `t3-01`, where shipped code first calls `createEntryOnPage`: a boundary test must pin
  that no shipped layer uses the exported record producers or `writeSlotThenIndex` directly.
- Carried into `t2-03`: residual risk 3 (a 40-code-point window is shortest at the top of a long page, and a repeated
  sentence anchors to the first copy with no UI signal) is recorded as a known v1 limitation, not fixed.

## Open questions

- `A26` (applied): normalization is owned by the content layer at capture time; core refuses non-normalized input
  instead of rewriting it silently.
- Whether the page-text stream used by `resolveAnchor` is produced per frame or per document — answered in `t2-02`,
  where the DOM side decides; here the stream is an input string.
- Whether `prefix`/`suffix` should be trimmed of punctuation before matching — no: the spec pairs them with the text
  verbatim, and punctuation-stripping would make the window unstable. Applied as an assumption, one spec line in AC5.
