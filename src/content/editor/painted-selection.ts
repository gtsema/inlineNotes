/**
 * Which painted entry a page selection belongs to — the hand-over question of Flow 6
 * (`content-overlay-ui.md`: "Selecting text that is already exactly/inside an
 * existing entry's range opens that entry's editor instead of creating a new card").
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 5-6, Rules /
 * Semantics -> "The editor is opened by a selection, not by the tooltip", and task
 * `t3-03` AC1; authorship itself is core's rule and is applied by the caller through
 * `isOwnEntry`, never here.
 *
 * **Why the question is asked of the paint pass and not of the store.** The paint
 * pass already resolved every entry of the page and holds the node-local offsets it
 * registered its ranges with. A selection is described in exactly those offsets, so
 * containment is answered with node identity and two numbers, and the answer cannot
 * disagree with what is on the page. Asking the store instead would resolve the
 * anchors a second time, against a stream built for the question, and would offer to
 * edit an entry that has no highlight on the screen.
 *
 * **Why containment, not intersection.** A selection that starts before an entry or
 * ends after it is not a selection *of* that entry: it covers the entry's span and
 * something else, which is the state the overlap rule refuses at the write. Handing
 * such a selection to the editor would quietly accept at open time what core refuses
 * at save time. So both boundary points must fall inside the entry's own fragments,
 * and anything else is left to the create card, where the refusal is shown with its
 * message.
 *
 * Boundary offsets are inclusive on purpose, for the same reason the `caret hit-test`
 * of `tooltip-hit-test.ts` is: a boundary offset sits between two characters, so a
 * selection that ends exactly at the last code point of a fragment does end inside
 * the entry. Entries never intersect (`inline-comment-model.md` -> "Overlap"), so at
 * most one entry can contain a selection; where two adjacent entries claim the same
 * boundary offset, the earlier one in paint order answers, deterministically.
 */

import type { PaintedEntry, PaintedFragment } from '../paint/paint-plan';

/**
 * The painted entry whose span contains the whole of `range`, `null` when the
 * selection is not inside one entry's range.
 *
 * A collapsed range answers `null`: a caret is not a selection of a span, and the
 * reader who clicks inside painted text without dragging is not asking to edit it —
 * the tooltip of Flow 3 is the answer to a pointer inside a highlight.
 */
export function entryOwningSelection(
  painted: readonly PaintedEntry[],
  range: Range,
): PaintedEntry | null {
  if (range.collapsed) {
    return null;
  }
  for (const paintedEntry of painted) {
    if (selectionInsideEntry(paintedEntry.fragments, range)) {
      return paintedEntry;
    }
  }
  return null;
}

/** `true` when both boundary points of `range` fall inside fragments of one entry. */
function selectionInsideEntry(
  fragments: readonly PaintedFragment[],
  range: Range,
): boolean {
  const start = fragmentIndexAt(fragments, range.startContainer, range.startOffset);
  if (start === null) {
    return false;
  }
  const end = fragmentIndexAt(fragments, range.endContainer, range.endOffset);
  // `end >= start` is the document-order half of the rule: a range that runs backwards
  // cannot exist in a real `Range`, but a hand-built one must not be read as "inside".
  return end !== null && end >= start;
}

/**
 * The index of the fragment holding the caret `(node, offset)`, `null` when no
 * fragment of this entry does.
 *
 * Node identity is the first test, exactly as in the `caret hit-test`: the offsets of
 * two different text nodes are not comparable numbers.
 */
function fragmentIndexAt(
  fragments: readonly PaintedFragment[],
  node: Node,
  offset: number,
): number | null {
  for (let index = 0; index < fragments.length; index += 1) {
    const fragment = fragments[index];
    if (fragment.node === node && offset >= fragment.start && offset <= fragment.end) {
      return index;
    }
  }
  return null;
}
