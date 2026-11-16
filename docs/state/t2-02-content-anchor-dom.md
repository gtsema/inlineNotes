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

## AC (5 substantive + gates)

1. `buildTextStream(root)` in `src/content/anchor/text-stream.ts` → `{ text, fragments }`: `text` is the normalized
   stream per AC1 of `t2-01` plus the `A20` boundary spaces; `fragments` is an ordered list of
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

`docs/specs/inline-comment-model.md` (Anchoring, Staleness), `docs/specs/content-overlay-ui.md` (Highlight painting,
Terms), `docs/state/t2-02-content-anchor-dom.md`, `docs/state/t1-02-core-pagekey.md` (the jsdom approval `A2`),
`src/core/anchor-resolve.ts` (or whatever `t2-01` named the resolver), `.pi/skills/chrome-mv3-extension-ts/SKILL.md`.

## Explicitly out of scope

No painting (no CSS Highlight API, no overlay widgets — Stage 3), no selection capture, no storage calls, no overlap
rule (`t2-03`). `jsdom` must not enter `dependencies`, the manifest, or any `dist/` bundle.

## Attempts log

- attempt 1: brief prepared; delegated after `t2-01` acceptance.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Open questions

- Whether the stream is built per frame: v1 builds it per document of the top frame only; iframes are out of scope
  for the anchor stage (recorded, revisit if the user reports iframe articles).
- Shadow DOM inside the host page is not traversed in v1.
