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

- engineer report: not started
- reviewer verdict: not started

## Open questions

- Whether the page-text stream used by `resolveAnchor` is produced per frame or per document — answered in `t2-02`,
  where the DOM side decides; here the stream is an input string.
- Whether `prefix`/`suffix` should be trimmed of punctuation before matching — no: the spec pairs them with the text
  verbatim, and punctuation-stripping would make the window unstable. Applied as an assumption, one spec line in AC5.
