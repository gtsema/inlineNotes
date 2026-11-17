/**
 * Hover hit-testing and the ownership header of the tooltip (task `t3-02` AC3, AC4).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 3-4, Rules /
 * Semantics -> "Own entries and foreign entries are visually distinguished only in
 * the tooltip header (the reader's own word against the author name)", "Popup
 * visibility state is persisted per entry" (a hidden entry has no highlight, so it has
 * nothing to hover), and the staleness rule of `docs/specs/inline-comment-model.md`
 * (an entry that resolves to nothing is not painted, and an entry that is not painted
 * has no tooltip).
 *
 * **Why a caret hit-test and not a box hit-test.** A custom highlight is not an
 * element: the Highlight API registers ranges and offers no hit-test, no back
 * reference from a painted range, and no pointer event of its own. So the only
 * question the page can answer at a pointer position is "which caret is here", via
 * `caretRangeFromPoint` (Chromium) or `caretPositionFromPoint` (Firefox). The answer
 * is a node plus an offset, and the offset is compared with the node-local UTF-16
 * offsets the paint pass already holds — the same offsets it registered the ranges
 * with, so the hit-test and the paint can never disagree about what is painted.
 *
 * Why not compare the pointer with the painted **boxes**: those were measured during
 * the last paint pass, and a scroll moves every one of them without telling anyone.
 * A box hit-test would answer "nothing here" after a scroll and "the wrong entry"
 * before one, and it would need a re-measure of every entry on every pointer move.
 * Node identity and offsets do not move when the page scrolls.
 *
 * The boundary rule of `entryAtCaret`, stated because it is invisible in the types: a
 * caret at offset `o` sits *between* characters, so hovering the right half of the
 * last character of a span answers `o === end`. A strict `start <= o < end` test
 * would then hide the tooltip over the last letter of the very text the user is
 * pointing at. The strict pass runs first so an interior caret always wins, and the
 * inclusive pass is the tolerance; when two adjacent spans claim the same boundary
 * caret, the earlier one in the painted order answers, deterministically.
 */

import type { Entry } from '../../core/entry';
import { canEdit } from '../../core/entry-rules';
import { CONTENT_STRINGS } from '../text';
import type { PaintedEntry } from '../paint/paint-plan';
import type { PaintedFragment } from '../paint/paint-plan';

/** The caret the page reports at one pointer position. */
export interface CaretHit {
  /** The node the caret is in — a `Text` for anything a reader can point at. */
  readonly node: Node;
  /** Offset inside that node, in the node's own offset domain. */
  readonly offset: number;
}

/** `(x, y)` in viewport CSS pixels to the caret there, `null` for "no caret". */
export type CaretAtPoint = (x: number, y: number) => CaretHit | null;

/** The two page APIs that answer "which caret is at this point". */
interface CaretPointDocument {
  caretRangeFromPoint?(x: number, y: number): { startContainer: Node; startOffset: number } | null;
  caretPositionFromPoint?(
    x: number,
    y: number,
  ): { offsetNode: Node | null; offset: number } | null;
}

/**
 * The page's own caret seam: `caretRangeFromPoint` where it exists (Chromium, Safari),
 * `caretPositionFromPoint` where it does not (Firefox), and a permanent `null` where
 * neither does.
 *
 * The `null` answer is the same shape of degradation ruling `A38` prescribes for a
 * missing Highlight API: no tooltip, the entry stays painted, listed and deletable,
 * and nothing is faked by geometry.
 */
export function documentCaretAtPoint(doc: Document): CaretAtPoint {
  const page = doc as unknown as CaretPointDocument;
  return (x: number, y: number): CaretHit | null => {
    const position = page.caretPositionFromPoint?.(x, y) ?? null;
    if (position !== null && position.offsetNode !== null) {
      return { node: position.offsetNode, offset: position.offset };
    }
    const range = page.caretRangeFromPoint?.(x, y) ?? null;
    if (range === null) {
      return null;
    }
    return { node: range.startContainer, offset: range.startOffset };
  };
}

/** `true` when the caret of `hit` falls inside one painted fragment. */
function caretInFragment(fragment: PaintedFragment, hit: CaretHit, inclusive: boolean): boolean {
  if (fragment.node !== hit.node) {
    return false;
  }
  return inclusive
    ? hit.offset >= fragment.start && hit.offset <= fragment.end
    : hit.offset > fragment.start && hit.offset < fragment.end;
}

/**
 * The painted entry the caret at `hit` belongs to, `null` when the pointer is over
 * nothing this extension painted.
 *
 * Only `paintedEntries` is searched — the output of the last paint pass. That is the
 * whole of two acceptance criteria: a hidden entry (ruling `A40`) and a stale or
 * unresolvable entry (`inline-comment-model.md` -> Staleness) are absent from that
 * list, so they cannot be hovered into a tooltip, and neither is deleted or hidden by
 * this module on the way.
 */
export function entryAtCaret(
  painted: readonly PaintedEntry[],
  hit: CaretHit,
): PaintedEntry | null {
  let boundary: PaintedEntry | null = null;
  for (const paintedEntry of painted) {
    for (const fragment of paintedEntry.fragments) {
      if (caretInFragment(fragment, hit, false)) {
        return paintedEntry;
      }
      if (boundary === null && caretInFragment(fragment, hit, true)) {
        boundary = paintedEntry;
      }
    }
  }
  return boundary;
}

/**
 * `true` when the current reader may edit `entry`.
 *
 * The rule is core's `canEdit`, called here and nowhere re-derived: `visible` is not
 * part of it (ruling `A1` in `docs/specs/inline-comment-model.md`), so hiding a note
 * never takes away the right to edit it. A page with no usable author name owns
 * nothing, which is why the current name may be `null`.
 */
export function isOwnEntry(entry: Entry, currentName: string | null): boolean {
  return currentName !== null && canEdit(entry, currentName);
}

/**
 * The header line of the tooltip: the reader's own word (`ownEntry` in
 * `src/content/text.ts`) for an entry the current reader wrote, the stored author name
 * for anybody else's.
 *
 * The foreign case prints the author name **as stored**, not a translation or a
 * generic label, because that is the only fact the reader has about who wrote the
 * note; and it is still the record's text, never an attribute of the page (task
 * `t3-02` AC3). The Russian word for the own case is a UI string and lives in
 * `src/content/text.ts` with every other string of this layer.
 */
export function ownershipHeaderOf(entry: Entry, currentName: string | null): string {
  return isOwnEntry(entry, currentName) ? CONTENT_STRINGS.ownEntry : entry.authorName;
}
