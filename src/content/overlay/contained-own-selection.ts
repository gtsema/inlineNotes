/**
 * Whether a page selection lies wholly inside one of the reader's own painted entries —
 * the one silence a settled selection can meet (`content-overlay-ui.md` Flow 1).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 1, Rules /
 * Semantics -> "The `contained own selection`", "Painting reads storage and answers to
 * the page", and `docs/specs/inline-comment-model.md` -> "Edit rights" for the author
 * half. Task `t5-03` AC4, AC5, AC6; rulings `A103`, `A93`, `A99`, `A100`, `A40`, `A24`,
 * `A66`, `A67`, `A1`.
 *
 * **Why the question is asked of the paint pass and not of the store.** The paint pass
 * already resolved every entry of the page and holds the node-local offsets it
 * registered its ranges with. A selection is described in exactly those offsets, so
 * containment is answered with node identity and two numbers, the answer cannot disagree
 * with what is on the page, and no anchor is resolved a second time for a question the
 * page has already answered. A hidden entry (`A40`), a stale one (`A24`) and one whose
 * fragments all refuse to measure (`A66`, `A67`) are absent from that output, so their
 * words are never a `contained own selection` and a note may be written over them.
 *
 * **Why containment, not intersection.** A selection that starts before an entry or
 * ends after it is not a selection *of* that entry: it covers the entry's span and
 * something else, which is the state the `overlap` rule answers at the write, per author
 * (`A45`, `A93`, `A99`, `A100`) — and that is where the reader is shown the sentence for
 * it. So both boundary points must fall inside the entry's own fragments, and anything
 * else is left to the create card.
 *
 * **Ownership is the author rule of the current pass, not of the entry.** `authorName`
 * is the name that pass was painted under — the same name the `ownership header` of the
 * `tooltip` works with — so a name written in options changes this answer with the
 * repaint that the settings key causes and with nothing else (`A31`).
 *
 * Boundary offsets are inclusive on purpose, for the same reason the `caret hit-test` of
 * `tooltip-hit-test.ts` is: a boundary offset sits between two characters, so a
 * selection that ends exactly at the last code point of a fragment does end inside the
 * entry. It costs nothing, because the other boundary point has to be inside the same
 * entry too. Where two adjacent entries claim one boundary offset, the earlier one in
 * paint order answers, deterministically.
 */

import { canEdit } from '../../core/entry-rules';
import type { PaintedEntry, PaintedFragment } from '../paint/paint-plan';

/**
 * The painted entry whose `resolved span` contains the whole of `range`, `null` when the
 * selection is not inside one entry's span.
 *
 * A collapsed range answers `null`: a caret is not a selection of a span, and the reader
 * who clicks inside painted text without dragging is asking for the `tooltip` of Flow 3,
 * never for a card.
 */
export function entryContainingSelection(
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
 * The index of the fragment holding the boundary point `(node, offset)`, `null` when no
 * fragment of this entry does.
 *
 * Node identity is the first test, exactly as in the `caret hit-test`: the offsets of two
 * different text nodes are not comparable numbers (ruling `A100`, the domain rule of
 * `src/content/anchor/anchor-resolve.ts` seen from the selection side).
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

/**
 * Whether this settled selection is a `contained own selection`: wholly inside one
 * painted entry the author rule accepts as the reader's own.
 *
 * A selection inside a `foreign entry` answers `false` — creating there is legal since
 * ruling `A93`, so the card opens there and the write decides — and `authorName === null`
 * answers `false` for the same reason the create gate does: with no usable name the
 * reader owns nothing, and the `settings gate` of the card is what refuses the card in
 * that state.
 */
export function isContainedOwnSelection(
  painted: readonly PaintedEntry[],
  range: Range,
  authorName: string | null,
): boolean {
  if (authorName === null) {
    return false;
  }
  const owner = entryContainingSelection(painted, range);
  return owner !== null && canEdit(owner.entry, authorName);
}
