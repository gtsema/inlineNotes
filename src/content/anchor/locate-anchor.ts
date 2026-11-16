/**
 * Turning a resolved string anchor back into DOM fragments.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchoring", "Anchor search order", "Anchor domains", "Staleness"; Terms /
 * Aliases -> "anchor", "text fragment", "stale entry".
 *
 * Division of labour, and it is deliberate:
 * - the **string** search belongs to core. `resolveAnchor` is the only search in
 *   the product, so this module contains no `indexOf`, no fallback matching and no
 *   second scoring rule — it asks core for the half-open code-point range
 *   `[start, end)` of `anchor.text` inside the stream and maps that range onto
 *   fragments;
 * - the **DOM** mapping belongs here. `buildTextStream` produced the stream and its
 *   fragments, and `nodeCodePointIndex` converts a code-point offset into the
 *   UTF-16 offsets a DOM range needs.
 *
 * Rebuild, never reuse (ruling `A29`): `locateAnchor` builds a fresh stream from
 * `root` on every call, so a re-resolve after a page change (load, bfcache, SPA
 * URL change) sees the current document. `locateAnchorInStream` is the same step
 * for a caller that already holds the stream it just built and wants to keep the
 * root liveness check; it is the seam that reports a stream the DOM has moved
 * under as stale instead of painting a remembered position.
 *
 * Two failure codes, and the difference is observable:
 * - `anchor_not_found` — the anchor text is not in the current stream at all
 *   (spec "Staleness"): paint nothing, keep the entry listed and deletable;
 * - `anchor_stale` — the string did resolve, but the text nodes it points at are
 *   no longer part of the subtree, or the stream and the node disagree about how
 *   many code points the node contributed. Painting would mean trusting a position
 *   the page does not have, so nothing is returned and nothing throws.
 *
 * No globals: the subtree and its nodes arrive as arguments, and nothing here
 * creates a `Range`, reads `document` / `window`, or touches the page.
 */

import type { EntryAnchor } from '../../core/entry';
import { resolveAnchor } from '../../core/anchor-resolve';
import { buildTextStream, nodeCodePointIndex } from './text-stream';
import type { TextFragment, TextStream } from './text-stream';

/** Why a locate produced no fragment. */
export type LocateAnchorCode = 'anchor_not_found' | 'anchor_stale';

/**
 * A locate either hands over the fragments to paint, in document order and each
 * one non-empty, or it reports a code. It never returns a partial match with an
 * empty fragment, and it never throws.
 */
export type LocateAnchorResult =
  | { ok: true; fragments: TextFragment[] }
  | { ok: false; code: LocateAnchorCode };

/**
 * Resolves `anchor` against a freshly built stream of `root` and maps the resolved
 * range onto that stream's fragments (ruling `A29`: the stream is rebuilt here, so
 * a caller never hands over a stale one by accident).
 */
export function locateAnchor(root: Node, anchor: EntryAnchor): LocateAnchorResult {
  return locateAnchorInStream(buildTextStream(root), root, anchor);
}

/**
 * The same locate against a stream the caller built from `root` moments before.
 *
 * `root` is still required: every returned fragment must be a live descendant of
 * it. A fragment that was detached between the build and this call makes the whole
 * result `anchor_stale`, because painting half of a range would paint a span the
 * user never selected.
 */
export function locateAnchorInStream(
  stream: TextStream,
  root: Node,
  anchor: EntryAnchor,
): LocateAnchorResult {
  const resolved = resolveAnchor(stream.text, anchor);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code };
  }

  const mapped = fragmentsForRange(stream, resolved.start, resolved.end);
  const live = mapped.filter((fragment) => isInsideSubtree(fragment.node, root));
  if (live.length === 0) {
    return { ok: false, code: 'anchor_stale' };
  }
  return { ok: true, fragments: live };
}

/**
 * Clips a half-open **code-point** range of `stream.text` onto the fragments.
 *
 * The result is in document order, drops fragments the range only touches at one
 * boundary, and clips the first and last fragment to the range: a partial
 * fragment carries the matching local `start` / `end` inside its own text node.
 * A range that falls entirely in the separators between two fragments maps to an
 * empty list, which the caller reports as `anchor_stale`.
 */
export function fragmentsForRange(
  stream: TextStream,
  start: number,
  end: number,
): TextFragment[] {
  const clipped: TextFragment[] = [];
  for (const fragment of stream.fragments) {
    const from = Math.max(start, fragment.streamStart);
    const to = Math.min(end, fragment.streamEnd);
    const narrow = to > from ? clipFragment(fragment, from, to) : null;
    if (narrow !== null) {
      clipped.push(narrow);
    }
  }
  return clipped;
}

/**
 * `true` when `node` is `root` or a descendant of it. The walk goes upward, so it
 * costs the depth of the node and needs no live subtree of its own — and it is how
 * a detached node is detected without reading any global.
 */
export function isInsideSubtree(node: Node, root: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current === root) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

/**
 * Narrows one fragment to `[from, to)` in stream code points.
 *
 * Every fragment is re-checked against its own node first: the node's code-point
 * map must still account for exactly the code points the stream recorded, at the
 * node offsets the stream recorded. A page that rewrote `nodeValue` under a stream
 * is refused here, which is what turns "the stream and the DOM disagree" into
 * `anchor_stale` instead of a highlight over the wrong words. A fragment already
 * inside the range is then copied unchanged; a boundary fragment gets its local
 * offsets from that same map.
 */
function clipFragment(fragment: TextFragment, from: number, to: number): TextFragment | null {
  const nodeUnits = fragment.end - fragment.start;
  const streamSpan = fragment.streamEnd - fragment.streamStart;
  if (nodeUnits <= 0 || streamSpan <= 0) {
    return null;
  }

  const index = nodeCodePointIndex(fragment.node.data);
  const agreesWithStream =
    index.starts.length === streamSpan &&
    index.starts[0] === fragment.start &&
    index.ends[index.ends.length - 1] === fragment.end;
  if (!agreesWithStream) {
    return null;
  }
  if (from === fragment.streamStart && to === fragment.streamEnd) {
    return { ...fragment };
  }

  const localStart = index.starts[from - fragment.streamStart];
  const localEnd = index.ends[to - fragment.streamStart - 1];
  if (localEnd <= localStart) {
    return null;
  }
  return {
    node: fragment.node,
    start: localStart,
    end: localEnd,
    streamStart: from,
    streamEnd: to,
  };
}
