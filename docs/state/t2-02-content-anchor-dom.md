# t2-02-content-anchor-dom

## Goal

Turn a resolved string anchor into DOM fragments: build a normalized text stream out of a page subtree, map stream
offsets back to `(node, offset)` fragments, and hand the content layer a list of fragments it can paint. This is the
first task where `jsdom` enters — as a **dev-only** test environment (ruling `A2`), never in shipped code.

## PM rulings this task implements

- `A20` **Block boundary = one space in the stream.** Every block-level boundary (`p`, `div`, `li`, `br`, `h1`–`h6`,
  `blockquote`, `tr`, `section`, `article`) contributes exactly one space to the normalized stream, so two adjacent
  paragraphs never glue into one word and a selection that spans a `<br>` re-anchors.
- `A21` **Excluded subtrees.** `script`, `style`, `noscript`, `template`, `head` and their text never enter the
  stream. Rendered-but-hidden nodes are included in v1 (a hidden entry still re-anchors, see ruling `A1`), so no
  `display`/`visibility` inspection happens in v1.
- `A2` `jsdom` may appear only in `package.json` devDependencies, the vitest environment for this test file, and the
  test itself. A scan test must fail if `jsdom` is imported by anything under `src/`.
- `A29` **The stream is owned by the content layer and is rebuilt, never cached.** Every re-resolve rebuilds it; a
  cached position would break the stability property `tests/core-anchor-resolve.spec.ts:114` pins.

## Contract handed over by `t2-01` (from `docs/state/t2-01-review.md` → `t2-02` readiness)

- Feed `resolveAnchor`/`buildAnchor` **one and the same string**: `normalizeText(pageText)` produced by walking the
  same subtree order the layer maps back to, with block separators inserted **before** normalization.
- Map back the half-open **code-point** range `[start, end)`: convert with `utf16IndexAt(stream, start)` /
  `utf16IndexAt(stream, end)`, then to `(node, offset)` pairs. Never mix `String.indexOf` or `nodeValue` offsets into
  anchor ranges without `codePointOffsetAt`.
- At capture time the offsets handed to `buildAnchor` are offsets **of the trimmed span**, and the real fragment count
  goes into `options.fragments` (a stored hint only).
- `anchor_not_found` → paint nothing, keep the entry listed and deletable; a hit paints the **resolved** range, which
  may be shorter than the remembered selection.
- Re-resolve on load, bfcache and SPA URL change by rebuilding the stream; core caches no position, and any cache here
  would break the stability property pinned by `tests/core-anchor-resolve.spec.ts:114`.

## AC (5 substantive + gates)

1. `buildTextStream(root)` in `src/content/anchor/text-stream.ts` → `{ text, fragments }`: `text` is the normalized
   stream per AC1 of `t2-01` plus the `A20` boundary spaces, and it is normalized **by construction** — a test asserts
   `isNormalizedText(result.text)` (review remark `R5`); `fragments` is an ordered list of
   `{ node, start, end, streamStart, streamEnd }` for every text node that contributed. Invariant tested both ways:
   slicing `text` at a fragment boundary reproduces the node's own text, and every stream offset belongs to exactly
   one fragment.
2. `locateAnchor(root, anchor)` → `{ ok: true, fragments: TextFragment[] }` or `{ ok: false, code }`, where the string
   search is delegated to core `resolveAnchor` (no second search implementation in the content layer). Fragments are
   returned in document order; a match spanning several blocks yields several fragments, each non-empty.
3. Empty and degenerate cases: a match inside one node → one fragment; a match that starts or ends mid-node → the
   fragment carries the correct local `start`/`end`; an anchor that resolves in the stream but whose nodes were
   removed between the build and the locate → `{ ok: false, code: 'anchor_stale' }`, never a throw.
4. `src/content/anchor/*` never touches a global `document`/`window`: every function takes the root node and, where
   needed, the `Document` explicitly, so the module is importable in a Node test process and in the page.
5. `docs/specs/content-overlay-ui.md` (or the model spec, wherever the anchoring rules live) gains the stream rules in
   the same commit: the boundary-space rule `A20`, the excluded-subtree list `A21`, the fragment contract, and the
   statement that `jsdom` is a test-only environment.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order: module + tests → `npm test` early → spec lines → gates → commit `feat(t2-02): DOM text stream and anchor location`. Commit as soon as green.

## Inputs the engineer reads

Start with `docs/state/t2-01-review.md` (**`t2-02` readiness** paragraph, residual risks 1–5), then:

`docs/specs/inline-comment-model.md` (Anchoring, Staleness, the text-stream rules `t2-01` added),
`docs/specs/content-overlay-ui.md` (Highlight painting, Terms), `docs/state/t2-02-content-anchor-dom.md`,
`docs/state/t1-02-core-pagekey.md` (the jsdom approval `A2`), `src/core/text-normalize.ts` (`normalizeText`,
`isNormalizedText`, `utf16IndexAt`, `codePointOffsetAt`, `sliceCodePoints`), `src/core/anchor-resolve.ts`,
`src/core/anchor-build.ts`, `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.

## Explicitly out of scope

No painting (no CSS Highlight API, no overlay widgets — Stage 3), no selection capture, no storage calls, no overlap
rule (`t2-03`). `jsdom` must not enter `dependencies`, the manifest, or any `dist/` bundle.

## Attempts log

- attempt 1 (`5dd81ad4`): **timeout at 3600000 ms** — the first task to overrun even the raised ceiling. The work
  survived complete and green in the tree (two modules, 57 tests, jsdom as a devDependency, spec edits); only the commit
  and the report were missing. PM verified the gates in the tree: `npm test` 361/361, `npm run build` green,
  checker 0 errors.
- attempt 2 (`0123b136`): tiny completion slice — audit against AC1–AC5, add the genuinely missing cases, gates, commit,
  report. Result: commit `1efeda4` (11 files, +1921/-5), **no `src/` change was needed** in attempt 2, six cases added.
  PM re-ran the gates on the commit: `npm test` **367 passed**, `npm run build` self-contained `dist/`,
  checker `0 errors / 0 warnings / 16 INFO`.
- reviewer: running (`affdbdb4`), range `305b416..1efeda4`. Attempt budget **2/2 used**: a `changes requested` verdict
  stops the line and goes to the user, it does not buy a third attempt.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 2 (engineer ×2 attempts, reviewer ×1 in flight).

## Verdicts

- engineer report: attempt 2, commit `1efeda4`; artifact
  `…/subagent-artifacts/outputs/0123b136-59ea-41e7-a4b0-919779b6e14b/docs/state/t2-02-engineer.md`.
- reviewer verdict: **accepted**, no blocking findings, remarks `N1`–`N9`; the `t3-01` readiness paragraph is the
  selection → stream contract and is quoted into that brief. Artifact copied to `docs/state/t2-02-review.md`.
- PM decision: task closed at attempt 2/2. Stage 2 is 2/3 done (`t2-03` remains).

## PM rulings on the review remarks

- `A36` (remark `N1`, partial liveness): **all-or-nothing.** If any mapped node of a resolved range is no longer
  inside the subtree, `locateAnchorInStream` returns `anchor_stale`. Painting half a remembered selection is worse
  than painting nothing, because the user cannot tell which half is real. Fix lands in `t3-01` (the same directory,
  one predicate + one test + the doc comment already says this).
- `A35` (remark `N8`, table cells): `td` and `th` join the `A20` block-boundary list, so `<td>a</td><td>b</td>`
  streams as `"a b"` instead of `"ab"`. Cost is zero today (no stored anchors exist in the wild), benefit is that a
  selection crossing cells stops being one glued word. Lands in `t3-01` with the spec line.
- `N2` accepted: the spec and the module header state an equality (`stream == normalizeText(root.textContent)`) that
  is false as written. The normative core is fine. The clause is replaced by the precise statement (normalized by
  construction; one U+0020 per `A20` boundary; trimmed) in the next spec-touching commit, which is `t3-01`.
- `N3` accepted: the `dist/` half of the jsdom scan passes vacuously when `dist/` is absent; it must assert the
  directory exists. One line, `t3-01`.
- `N4` accepted: the module-scoped `whitespaceDecision` map grows with distinct code points for the lifetime of the
  content script; it must be bounded to the whitespace set. `t3-01`.
- `N5` accepted: `docs/specs/INDEX.md` covered-paths column must list `src/content/anchor/`. `t3-01`.
- `N6` recorded as **accepted contract drift**: the `t2-01` readiness formula was wrong for nodes with internal
  whitespace runs; the implementation's per-node code-point map is correct, and the spec was extended in the same
  commit. The readiness paragraph in `docs/state/t2-01-review.md` is superseded on this point by `docs/state/t2-02-review.md`.
- `N7` becomes an obligation of `t3-02`: prefer `locateAnchor` (it rebuilds the stream); `locateAnchorInStream` may
  only be used with a stream built in the same pass from the same root.
- `N8` second half recorded: no depth cap in the stream walk — accepted v1 risk, revisit if a real page hits it.
- `N9` fixed here (this section).
- Cross-tab race (carried residual 5) stays open by design until `t4-03`.

## Open questions

- Whether the stream is built per frame: v1 builds it per document of the top frame only; iframes are out of scope
  for the anchor stage (recorded, revisit if the user reports iframe articles).
- Shadow DOM inside the host page is not traversed in v1.
- The 40-code-point window is shortest at the top of a long page, and a repeated sentence anchors to the first copy
  with no UI signal (review residual risk 3) — an accepted v1 limitation, recorded in
  `docs/state/t2-01-core-anchor-text.md`.
