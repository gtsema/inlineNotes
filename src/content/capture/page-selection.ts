/**
 * Reading the page selection, and comparing two readings of it.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Selection capture ignores selections inside the overlay host" and ruling
 * `A32` (an open card is closed, not repositioned, on a selection change
 * elsewhere).
 *
 * Two separate questions, and the file keeps them apart:
 * - **what is selected now** (`currentSelectionRange`, `capturePageSelection`):
 *   the DOM read, which owns every global it touches;
 * - **is it the same selection** (`sameSelectionBoundaries`): a comparison of
 *   boundary points, with no DOM read in it, so the close rule of `A32` is
 *   unit-testable without a page.
 *
 * Why a static copy of the range is handed out: the card re-derives its span at
 * save time from the boundaries it captured when it opened (ruling `A32`, task
 * `t3-01` AC2), and a live selection range is replaced by the page as soon as the
 * user selects again. `cloneRange()` freezes the boundary points while keeping the
 * node references, which is exactly what a re-resolve against a freshly built
 * stream needs: the numbers are the ones the user chose, the text under them is
 * whatever the page has now.
 *
 * Multiple ranges (Ctrl/Cmd multi-pick) are out of scope for v1: the first range
 * of the selection is the candidate, so the card never creates a note over a span
 * the user cannot see as one.
 */

/** Bound on the ancestor walk, so a detached or cyclic tree cannot spin here. */
const MAX_ANCESTOR_STEPS = 512;

/** A selection ready to be captured: the boundaries and the subtree to stream. */
export interface CapturedSelection {
  /** Static copy of the selection boundaries. */
  readonly range: Range;
  /** Subtree `buildTextStream` is asked for; at or above the selection. */
  readonly root: Node;
}

/** The two boundary points of a range, as identity plus offsets. */
export interface SelectionBoundaries {
  readonly startNode: Node;
  readonly startOffset: number;
  readonly endNode: Node;
  readonly endOffset: number;
}

/**
 * The first non-collapsed range of the document selection, or `null` for "the page
 * has no selection right now" — which includes a collapsed caret, an empty
 * selection and no selection at all.
 */
export function currentSelectionRange(doc: Document): Range | null {
  const selection = doc.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  return range.collapsed ? null : range;
}

/**
 * The selection to open a card for, or `null` when there is none to open one for.
 *
 * `root` is the subtree the stream is built from, and the boundary nodes must live
 * inside it: a selection the stream cannot see would produce a span measured on a
 * string that does not contain it.
 */
export function capturePageSelection(doc: Document, host: HTMLElement): CapturedSelection | null {
  const range = currentSelectionRange(doc);
  if (range === null) {
    return null;
  }
  const root = doc.body;
  if (root === null) {
    return null;
  }
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  // The card's own textarea holds a selection while the user types; `contains`
  // does not cross a shadow boundary, so the explicit walk is what answers this.
  if (
    isInsideOverlayHost(range.startContainer, host) ||
    isInsideOverlayHost(range.endContainer, host)
  ) {
    return null;
  }
  return { range: range.cloneRange(), root };
}

/** Boundary points of `range`, for the comparison below. */
export function selectionBoundaries(range: Range): SelectionBoundaries {
  return {
    startNode: range.startContainer,
    startOffset: range.startOffset,
    endNode: range.endContainer,
    endOffset: range.endOffset,
  };
}

/**
 * `true` when both sides name the same two boundary points. Node identity, not
 * node text: a page that rewrote the text under an unchanged selection is a
 * different situation (the span is re-resolved), while a selection that moved to
 * other words is the "selection change elsewhere" of ruling `A32`.
 */
export function sameSelectionBoundaries(a: SelectionBoundaries, b: SelectionBoundaries): boolean {
  return (
    a.startNode === b.startNode &&
    a.startOffset === b.startOffset &&
    a.endNode === b.endNode &&
    a.endOffset === b.endOffset
  );
}

/**
 * `true` when `node` is the overlay host or sits inside its shadow tree: the
 * parent walk crosses the shadow boundary through the root's `host`, which is what
 * makes a selection in the card's own textarea, or a click on its button,
 * recognizable as ours. The walk is engine-independent: it does not depend on how
 * a particular implementation retargets `event.target` out of a shadow tree.
 */
export function isInsideOverlayHost(node: Node, host: HTMLElement): boolean {
  let current: Node | null = node;
  for (let step = 0; current !== null && step < MAX_ANCESTOR_STEPS; step += 1) {
    if (current === host) {
      return true;
    }
    current = current.parentNode ?? shadowHostOf(current);
  }
  return false;
}

/** The host of a shadow root, `null` for anything that is not one. */
function shadowHostOf(node: Node): Node | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}
