/**
 * One resolve pass over the stored entries of a page, against a stream the caller
 * already built.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Resolved range" (`A37`), "Stale entry" (`A24`), "Hidden entry" (`A22`); the
 * hand-over contract of `docs/state/t2-02-review.md` that one stream per pass is
 * the whole of.
 *
 * This module exists so the two page paths that compare spans — the create path of
 * `create/create-note.ts` and the edit path of `editor/edit-entry.ts` — resolve the
 * stored entries in exactly one way. It is page plumbing, not a rule: the overlap
 * and duplicate decisions stay in `src/core/entry-overlap.ts`, and this file holds
 * no policy about what a range means.
 *
 * Why the stream is an argument and never built here: `A37` and `N7` mean "one
 * string per pass". A module that built its own stream would give the candidate of
 * one moment and the stored entries of another, and the two numbers would be
 * measurements of two different pages — the failure class that contract closes.
 * The caller therefore hands the same `TextStream` it measured the candidate with,
 * and the `root` it built that stream from, because `locateAnchorInStream` maps the
 * located nodes against that subtree.
 *
 * A locate that answers `anchor_not_found` or `anchor_stale` leaves the entry out of
 * the map. That absence is the rule, not an omission: a stale entry has no span, so
 * it cannot block anything (`A24`), and it is never mapped to a zero range, which
 * would hide the difference between "gone" and "measured as nothing". A hidden entry
 * is resolved like every other one (`A22`): the popup checkbox governs painting, not
 * the span.
 */

import { locateAnchorInStream } from './locate-anchor';
import type { TextStream } from './text-stream';
import type { CodePointRange, ResolvedEntryRanges } from '../../core/entry-overlap';
import type { Entry } from '../../core/entry';

/**
 * The resolved range of every entry of `entries` that still has one, keyed by `id`.
 *
 * `locateAnchorInStream` is used and never `locateAnchor`: the latter rebuilds a
 * stream per call, which would hand each entry a different page state.
 */
export function resolvedEntryRanges(
  stream: TextStream,
  root: Node,
  entries: readonly Entry[],
): ResolvedEntryRanges {
  const ranges = new Map<string, CodePointRange>();
  for (const entry of entries) {
    const located = locateAnchorInStream(stream, root, entry.anchor);
    if (!located.ok) {
      continue;
    }
    const first = located.fragments[0];
    const last = located.fragments[located.fragments.length - 1];
    ranges.set(entry.id, { start: first.streamStart, end: last.streamEnd });
  }
  return ranges;
}
