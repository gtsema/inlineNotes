/**
 * The load-time resolve and paint plan (task `t3-02` AC1, AC5; rulings `A36`, `A38`,
 * `A40`, `A66`, `A67`, `A70`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight
 * painting", "Paint-path measurement", "Tooltip anchor";
 * `docs/specs/inline-comment-model.md` -> Flow / Sequence 6, which is the sentence
 * this module implements: on load, build **one** stream, resolve every anchor of the
 * page against it, paint the resolved ones, and leave the unresolvable ones alone.
 *
 * Three rules this module is the only place for:
 *
 * - **one stream for the whole page.** `buildTextStream` runs once per pass, and
 *   every anchor is resolved with `locateAnchorInStream` against that one stream.
 *   `locateAnchor` would build a stream per entry: on a page with the cap of 20
 *   entries that is 20 full walks of the article, and it is the same string each
 *   time. Nothing here is a falsifiable proof of that cost by itself, so
 *   `tests/content-paint-plan.spec.ts` pins the call structure and the behavioural
 *   twin of the `A29` property (a same-shape rewrite of a text node between two
 *   passes changes what the second pass resolves, which a cached stream would not).
 * - **all-or-nothing per entry, every fragment painted** (ruling `A36`). A resolved
 *   span is a list of `TextFragment`s; `placementFragmentBox` is *not* used here,
 *   because it stops at the first fragment that has an area and would therefore
 *   leave the second half of a wrapped selection unpainted. The paint pass measures
 *   every fragment and paints every one of them.
 * - **measurement failure is per entry** (ruling `A66`). `rangeFor` throws when the
 *   page changed a text node between the resolve and the measurement, and the `try`
 *   below sits inside the loop over entries, so one bad entry loses its own
 *   highlight and nothing else: no other entry's ranges are cleared, and this module
 *   never touches storage, so an entry that cannot be measured stays in the popup
 *   and stays deletable — the same observable state ruling `A40` gives a hidden or
 *   stale entry.
 *
 * What the pass does with the plan — registering names in `CSS.highlights`, the paint
 * stylesheet, the teardown of ruling `A39` — is `paint-surface.ts`,
 * `paint-style.ts` and `page-painter.ts`.
 */

import type { Entry } from '../../core/entry';
import { locateAnchorInStream } from '../anchor/locate-anchor';
import { buildTextStream } from '../anchor/text-stream';
import type { TextFragment } from '../anchor/text-stream';
import { fragmentBox, hasArea } from '../capture/fragment-rect';
import type { Box, RangeForFragment } from '../capture/fragment-rect';
import { highlightNameOf } from './highlight-name';

/** One fragment of a resolved span, with the box the page gives it. */
export interface PaintedFragment {
  /** The text node the range starts and ends in — the seam's own node. */
  readonly node: Text;
  /** UTF-16 offset inside `node.data`: the only number fit for `Range.setStart`. */
  readonly start: number;
  /** UTF-16 offset inside `node.data`, exclusive. */
  readonly end: number;
  /** The box the measurement seam answered with, viewport coordinates. */
  readonly box: Box;
}

/** One entry that reached the page: its name, its fragments, its tooltip anchor. */
export interface PaintedEntry {
  /** The stored record, kept so the tooltip never has to read anything off the page. */
  readonly entry: Entry;
  /** The `CSS.highlights` name of this entry (ruling `A70`). */
  readonly name: string;
  /** Every fragment of the span, in document order (ruling `A36`). */
  readonly fragments: readonly PaintedFragment[];
  /**
   * The box the tooltip is placed against: the first fragment box that has an area,
   * or `null` when no fragment has one (ruling `A67`).
   */
  readonly tooltipBox: Box | null;
}

/** Why one entry of the page reached no highlight. */
export type PaintSkipReason =
  /** The popup checkbox is off: no highlight, no frame, no tooltip (ruling `A40`). */
  | 'hidden'
  /** The anchor text is no longer in the page (ruling `A24`). */
  | 'anchor_not_found'
  /** The anchor text resolved, but its nodes are gone or rewritten (ruling `A36`). */
  | 'anchor_stale'
  /** The page would not give this entry a box (ruling `A66`). */
  | 'measurement_failed';

/** One entry that is still stored and still listed, only not painted. */
export interface SkippedEntry {
  readonly entryId: string;
  readonly reason: PaintSkipReason;
}

/** What one pass decided about the entries of the page. */
export interface PaintPlan {
  readonly painted: readonly PaintedEntry[];
  readonly skipped: readonly SkippedEntry[];
}

/** Input of one pass. */
export interface PaintPlanInput {
  /** The entries of this page, in the order the store returned them. */
  readonly entries: readonly Entry[];
  /** The subtree the stream is built from: `document.body`, the capture's own root. */
  readonly root: Node;
  /** The measurement seam of `fragment-rect.ts`; a test injects a recorder. */
  readonly rangeFor: RangeForFragment;
}

/**
 * Resolves and measures every entry of the page against one stream.
 *
 * The entry order is the order of the returned list, and the plan never sorts: the
 * popup owns list ordering (ruling `A17`), and the paint pass has no ordering rule
 * of its own beyond document order inside one entry's fragments.
 */
export function buildPaintPlan(input: PaintPlanInput): PaintPlan {
  // One stream, one walk of the page, shared by every anchor of this pass.
  const stream = buildTextStream(input.root);
  const painted: PaintedEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of input.entries) {
    if (!entry.visible) {
      // Ruling `A40` and ruling `A1`: a hidden entry is simply absent from the page.
      // It is not dimmed, not greyed, and it is still in the popup list.
      skipped.push({ entryId: entry.id, reason: 'hidden' });
      continue;
    }

    const located = locateAnchorInStream(stream, input.root, entry.anchor);
    if (!located.ok) {
      skipped.push({ entryId: entry.id, reason: located.code });
      continue;
    }

    const fragments = measureFragments(located.fragments, input.rangeFor);
    if (fragments === null) {
      // Ruling `A66`: this entry loses its own highlight and nothing else.
      skipped.push({ entryId: entry.id, reason: 'measurement_failed' });
      continue;
    }

    painted.push({
      entry,
      name: highlightNameOf(entry.id),
      fragments,
      tooltipBox: tooltipAnchorOf(fragments),
    });
  }

  return { painted, skipped };
}

/**
 * Measures every fragment of one resolved span, or answers `null` when the page
 * refuses one of them.
 *
 * The `try` is here and not in the caller on purpose: it is the per-entry boundary
 * of ruling `A66`. It catches only the measurement of this entry, so the loop above
 * goes on with the next entry and the names already registered in `CSS.highlights`
 * keep their ranges.
 */
function measureFragments(
  fragments: readonly TextFragment[],
  rangeFor: RangeForFragment,
): PaintedFragment[] | null {
  const measured: PaintedFragment[] = [];
  try {
    for (const fragment of fragments) {
      measured.push({
        node: fragment.node,
        start: fragment.start,
        end: fragment.end,
        box: fragmentBox(fragment, rangeFor),
      });
    }
  } catch {
    // Deliberately narrow: only this entry's measurement, and only as an answer
    // (`measurement_failed`) — not a page-wide clear and not a storage write.
    return null;
  }
  return measured;
}

/**
 * The tooltip anchor of one entry: the first fragment box with an area (ruling
 * `A67`).
 *
 * `null` means the entry has no position on the page, and the answer the ruling
 * gives is "no tooltip" — the entry is not moved to the corner of the viewport the
 * way the create card is (ruling `A65`), because a tooltip describes a span the
 * reader is pointing at, and there is nothing to point at. The entry stays stored,
 * stays in the popup list and stays deletable.
 */
export function tooltipAnchorOf(fragments: readonly PaintedFragment[]): Box | null {
  for (const fragment of fragments) {
    if (hasArea(fragment.box)) {
      return fragment.box;
    }
  }
  return null;
}
