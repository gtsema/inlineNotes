/**
 * The paint surface: the only place in the extension that writes `CSS.highlights`
 * (task `t3-02` AC1, AC2, AC5; rulings `A38`, `A39`, `A68`, `A70`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight
 * painting" (the CSS Highlight API, one named highlight per entry, the host page DOM
 * is never mutated for painting) and the teardown rule of ruling `A39`.
 *
 * Two halves, and the split is deliberate:
 *
 * - `paintRanges` is the shipped conversion from a plan fragment to a `Range`. It
 *   goes through `documentRangeForFragment`, the same seam the create card measures
 *   with, because the offset-domain rule of `docs/specs/inline-comment-model.md` ->
 *   "Anchor domains" has exactly one crossing point in the codebase: a fragment
 *   carries node-local UTF-16 offsets, and a stream code-point offset must never
 *   reach a `Range`. A second helper would be a second place to get that wrong, and
 *   the `t2-02` hand-over named this one.
 * - `documentPaintSurface` is the thin glue onto `CSS.highlights` and `Highlight`.
 *   It answers `null` where the API is missing, which is the answer ruling `A38`
 *   requires: the entries stay unhighlighted and stay in the popup, and there is no
 *   DOM fallback — no `<span>` wrapper, no background on the author's element, no
 *   attribute on anything. That absence is what AC2 of this task pins.
 *
 * Why the surface, and not a direct `CSS.highlights` call in the pass: the pass has
 * to be testable without the Highlight API (the unit-test DOM has none), and ruling
 * `A68` needs one owner of the map. The pass talks to `PaintSurface`; this module is
 * the only implementation that touches the page.
 */

import { documentRangeForFragment } from '../capture/fragment-rect';
import type { DocumentRangeForFragment } from '../capture/fragment-rect';
import type { PaintedFragment } from './paint-plan';

/** What the paint pass asks of the page: register ranges under a name, or drop it. */
export interface PaintSurface {
  /** Replaces what `name` paints: one entry's ranges, never an append. */
  paint(name: string, fragments: readonly PaintedFragment[]): void;
  /** Removes `name` and everything it paints (the teardown of ruling `A39`). */
  clear(name: string): void;
  /** Every name the document holds right now, ours and anybody else's. */
  heldNames(): readonly string[];
}

/**
 * The `Range` of every fragment of one entry, in document order.
 *
 * Exported for the test that pins the offset domain: the numbers handed to
 * `createRange` are the node-local UTF-16 offsets of the fragment, and a fixture
 * with an astral character before the span makes a stream offset differ from them,
 * which is the mistake this seam exists to prevent.
 *
 * The pass already measured these fragments through the same factory, so the offsets
 * are known good: if `setStart` were to throw here, the entry would have been
 * reported `measurement_failed` a few lines earlier (ruling `A66`).
 */
export function paintRanges(
  fragments: readonly PaintedFragment[],
  rangeFor: DocumentRangeForFragment,
): Range[] {
  const ranges: Range[] = [];
  for (const fragment of fragments) {
    ranges.push(rangeFor(fragment.node, fragment.start, fragment.end));
  }
  return ranges;
}

/**
 * The paint surface of a real page, or `null` when this browser has no CSS Highlight
 * API (ruling `A38`: unhighlighted entries, unchanged popup, no DOM fallback).
 *
 * `CSS.highlights` is a document-global map (`docs/project-profile.md` -> Runtime
 * Model), so `heldNames()` reports foreign names too. That is not a bug to fix here:
 * the pass is allowed to remove only names carrying the extension prefix, and
 * `highlight-name.ts` is the module that says what that prefix is.
 */
export function documentPaintSurface(doc: Document): PaintSurface | null {
  const registry = highlightRegistryOf();
  const highlightOf = highlightFactoryOf();
  if (registry === null || highlightOf === null) {
    return null;
  }

  const rangeFor = documentRangeForFragment(doc);
  return {
    paint(name, fragments): void {
      const ranges = paintRanges(fragments, rangeFor);
      if (ranges.length === 0) {
        // An entry with no fragment paints nothing: registering an empty highlight
        // would hold a name that shows nothing and can never be hovered.
        return;
      }
      registry.set(name, highlightOf(ranges));
    },
    clear(name): void {
      registry.delete(name);
    },
    heldNames(): readonly string[] {
      return [...registry.keys()];
    },
  };
}

/**
 * `CSS.highlights` when this document has it, `null` when it does not.
 *
 * The type of `CSS.highlights` in `lib.dom.d.ts` is a plain `HighlightRegistry`, so
 * the compiler cannot tell a browser that has the API from one that does not; the
 * runtime shape check is what answers that, and it is not decoration — a headless DOM
 * ships a `CSS` object without `highlights`, which is exactly the case the guard
 * catches.
 */
function highlightRegistryOf(): HighlightRegistry | null {
  if (typeof CSS === 'undefined') {
    return null;
  }
  const registry: unknown = CSS.highlights;
  return isHighlightRegistry(registry) ? registry : null;
}

/** The `Highlight` constructor when this document has it, `null` when it does not. */
function highlightFactoryOf(): ((ranges: readonly Range[]) => Highlight) | null {
  if (typeof Highlight !== 'function') {
    return null;
  }
  return (ranges: readonly Range[]): Highlight => new Highlight(...ranges);
}

function isHighlightRegistry(value: unknown): value is HighlightRegistry {
  return (
    typeof value === 'object' && value !== null && 'set' in value && 'delete' in value && 'keys' in value
  );
}
