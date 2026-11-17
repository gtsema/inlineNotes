/**
 * The page text stream: one DOM subtree becomes one normalized string.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Normalized text stream", "Anchor domains", "Anchoring"; Terms / Aliases ->
 * "normalized text stream", "text fragment".
 *
 * Why this module exists: `buildAnchor` takes code-point offsets of a stream and
 * `resolveAnchor` returns a code-point range of a stream. Both directions are only
 * comparable when they are the *same* string built the *same* way (spec
 * "Anchor search order"), so the subtree walk below is the single place a page
 * subtree becomes that string.
 *
 * Stream construction (PM rulings `A20`, `A21`):
 * - text-node content in document order;
 * - exactly one U+0020 per block-level boundary of ruling `A20` (`p`, `div`, `li`,
 *   `br`, `h1`–`h6`, `blockquote`, `tr`, `td`, `th`, `section`, `article`; the two
 *   cells are ruling `A35`), requested on entry and on exit, so two adjacent blocks
 *   contribute exactly one space between them and a selection that crosses a
 *   `<br>` still re-anchors;
 * - excluded subtrees of ruling `A21` (`script`, `style`, `noscript`, `template`,
 *   `head`) contribute nothing at all, not even a boundary space;
 * - a whitespace-only text node contributes a word separator, never text;
 * - rendered-but-hidden nodes are included in v1 (ruling `A1`): no `display` or
 *   `visibility` inspection happens here.
 *
 * Normalized by construction: every contributed piece is the output of the core
 * `normalizeText`, every separator is a single U+0020, no separator is emitted at
 * the start or the end of the stream, and no two separators are adjacent.
 * Therefore `result.text` always satisfies `isNormalizedText(result.text)`
 * (ruling `A26`), it is trimmed at both ends, and between two neighboring pieces
 * there is exactly one U+0020.
 *
 * What is **not** claimed (review finding `N2`): the stream is not
 * `normalizeText` applied to the raw subtree text. There is no such referent —
 * `Node.textContent` glues adjacent elements with nothing between them, so
 * `<div><p>a</p>tail</div>` streams as `"a tail"` (one `A20` boundary space)
 * while `normalizeText` of that `textContent` is `"atail"`. The boundary spaces
 * are contributed by the walk, never recovered from the raw text.
 *
 * Two offset domains, and they are never mixed:
 * - `streamStart` / `streamEnd` are half-open Unicode **code point** offsets into
 *   `text`: the domain the anchor contract stores, searches and compares in;
 * - `start` / `end` are half-open UTF-16 offsets inside `node.data`: the domain a
 *   DOM range needs when the highlight is painted. An astral character is one code
 *   point but two UTF-16 units, and a whitespace run inside a node is one code
 *   point but several units, so the two numbers differ. Every conversion goes
 *   through `nodeCodePointIndex` here or the core helpers (`utf16IndexAt`,
 *   `codePointOffsetAt`) there.
 *
 * No globals (`document`, `window`, `TreeWalker`, `Range`, `instanceof` over a
 * global constructor): the walk uses `firstChild` / `nextSibling` with `nodeType`
 * and `nodeName`, so the module loads in a Node test process and in the page, and
 * the caller decides which subtree of which document it walks.
 *
 * No caching (ruling `A29`): the walk runs on every call. A cached stream would
 * pin positions the page no longer has and would break the reload-stability
 * property `tests/core-anchor-resolve.spec.ts` pins.
 */

import { normalizeText } from '../../core/text-normalize';

/** `nodeType` of a text node. Inlined because `Node.TEXT_NODE` is a global. */
const TEXT_NODE_TYPE = 3;

/** `nodeType` of an element node. Inlined for the same reason. */
const ELEMENT_NODE_TYPE = 1;

/**
 * Ruling `A20`: the block-level boundaries that contribute one U+0020 each, with
 * the table cells added by ruling `A35` so a selection that crosses cells stops
 * being one glued word. The list is a value, not prose, so a test can pin it
 * against the spec.
 */
export const BLOCK_TAG_NAMES: readonly string[] = [
  'P',
  'DIV',
  'LI',
  'BR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'TR',
  'TD',
  'TH',
  'SECTION',
  'ARTICLE',
];

/** Ruling `A21`: the subtrees whose text never enters the stream. */
export const EXCLUDED_TAG_NAMES: readonly string[] = [
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
];

const BLOCK_TAGS = new Set(BLOCK_TAG_NAMES);
const EXCLUDED_TAGS = new Set(EXCLUDED_TAG_NAMES);

/**
 * One contributing text node and where it sits in both offset domains.
 *
 * `node` is the text node itself; `start` / `end` address it (`node.data.slice`),
 * `streamStart` / `streamEnd` address the stream. A fragment is never empty in
 * either domain: `start < end` and `streamStart < streamEnd`.
 */
export interface TextFragment {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
  readonly streamStart: number;
  readonly streamEnd: number;
}

/** The normalized stream of one subtree plus the fragments that produced it. */
export interface TextStream {
  readonly text: string;
  readonly fragments: readonly TextFragment[];
}

/**
 * `nodeCodePointIndex` output for one text node: the position of every code point
 * of that node's normalized contribution, in both domains.
 */
export interface NodeCodePointIndex {
  /** UTF-16 offset in `data` where each normalized code point begins. */
  readonly starts: readonly number[];
  /** UTF-16 offset in `data` just after each normalized code point. */
  readonly ends: readonly number[];
  /** `data` begins with whitespace, which normalization trims away. */
  readonly leadingSeparator: boolean;
  /** `data` ends with whitespace, which normalization trims away. */
  readonly trailingSeparator: boolean;
}

/**
 * Builds the normalized text stream of `root` and its subtree.
 *
 * `root` may be an element, a text node, a document or a fragment: anything that
 * is neither an element nor a text node is traversed as a transparent container.
 * The result is fresh on every call (ruling `A29`), so a caller that re-resolves
 * after a DOM change gets the current page and never a remembered position.
 */
export function buildTextStream(root: Node): TextStream {
  const parts: string[] = [];
  const fragments: TextFragment[] = [];
  let streamCodePoints = 0;
  let pendingSpace = false;

  const contributeSpace = (): void => {
    if (!pendingSpace) {
      return;
    }
    pendingSpace = false;
    // A separator only exists between two pieces: the stream is never started or
    // left with a space, which is what makes the result trimmed.
    if (parts.length > 0) {
      parts.push(' ');
      streamCodePoints += 1;
    }
  };

  const contributeText = (node: Text): void => {
    const data = node.data;
    if (data.length === 0) {
      return;
    }
    const index = nodeCodePointIndex(data);
    if (index.starts.length === 0) {
      // Whitespace-only: it separates the words around it and contributes no text.
      pendingSpace = true;
      return;
    }
    if (index.leadingSeparator) {
      pendingSpace = true;
    }
    contributeSpace();

    const streamStart = streamCodePoints;
    parts.push(normalizeText(data));
    streamCodePoints += index.starts.length;
    fragments.push({
      node,
      start: index.starts[0],
      end: index.ends[index.ends.length - 1],
      streamStart,
      streamEnd: streamCodePoints,
    });
    if (index.trailingSeparator) {
      pendingSpace = true;
    }
  };

  const visit = (node: Node): void => {
    if (isTextNode(node)) {
      contributeText(node);
      return;
    }
    if (isElementNode(node) && EXCLUDED_TAGS.has(node.nodeName.toUpperCase())) {
      return;
    }
    const boundary = isElementNode(node) && BLOCK_TAGS.has(node.nodeName.toUpperCase());
    if (boundary) {
      pendingSpace = true;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
    if (boundary) {
      pendingSpace = true;
    }
  };

  visit(root);
  return { text: parts.join(''), fragments };
}

/**
 * Maps every code point of a text node's normalized contribution to its place in
 * the raw node data. This is the only converter between the two offset domains of
 * a node, and it is a pure string function, so the same input always gives the
 * same map.
 *
 * A whitespace run inside the node is one code point of the stream (the U+0020 it
 * collapses to) and several UTF-16 units of the node, so its entry spans the
 * whole run: `starts[k]` / `ends[k]` is the raw extent of the k-th code point.
 */
export function nodeCodePointIndex(data: string): NodeCodePointIndex {
  const starts: number[] = [];
  const ends: number[] = [];
  let units = 0;
  let runStart = -1;
  let runEnd = -1;
  let leadingSeparator = false;
  let trailingSeparator = false;

  // The string iterator walks code points, so a surrogate pair is one step of two
  // UTF-16 units and a lone surrogate is one step of one unit — the same counting
  // `utf16IndexAt` and `codePointOffsetAt` do in `src/core/`.
  for (const codePoint of data) {
    if (isWhitespaceCodePoint(codePoint)) {
      runStart = runStart < 0 ? units : runStart;
      runEnd = units + codePoint.length;
    } else {
      if (runStart >= 0) {
        if (starts.length === 0) {
          leadingSeparator = true;
        } else {
          starts.push(runStart);
          ends.push(runEnd);
        }
        runStart = -1;
        runEnd = -1;
      }
      starts.push(units);
      ends.push(units + codePoint.length);
    }
    units += codePoint.length;
  }
  if (runStart >= 0 && starts.length > 0) {
    trailingSeparator = true;
  }

  return { starts, ends, leadingSeparator, trailingSeparator };
}

/**
 * Whitespace test for one code point, asked of the core normalizer itself, so the
 * stream can never disagree with the normalization that the anchor stores: the set
 * of separators is exactly the set `normalizeText` collapses.
 *
 * The map caches only this pure character decision. It caches no node, no offset
 * and no stream, so ruling `A29` ("the stream is rebuilt, never cached") holds.
 */
const whitespaceDecision = new Map<string, boolean>();

function isWhitespaceCodePoint(codePoint: string): boolean {
  const cached = whitespaceDecision.get(codePoint);
  if (cached !== undefined) {
    return cached;
  }
  const decision = normalizeText(codePoint).length === 0;
  whitespaceDecision.set(codePoint, decision);
  return decision;
}

/** Text nodes carry the page text; the type guard keeps `nodeType` a plain number. */
function isTextNode(node: Node): node is Text {
  return node.nodeType === TEXT_NODE_TYPE;
}

/** Elements carry the structure: the block boundaries and the excluded subtrees. */
function isElementNode(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE_TYPE;
}
