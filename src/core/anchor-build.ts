/**
 * Building an `anchor` from a selection inside the normalized page text stream.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchoring", "Anchor window", "Normalized text"; Terms / Aliases ->
 * "anchor", "anchor window", "normalized text stream".
 *
 * What this module owns and what it does not:
 * - it owns the string side of the anchor: the window that is taken from the same
 *   stream as the selection, the normalization of every stored piece, and the
 *   fragment **count**;
 * - it owns no DOM. The content stage (`t2-02`) turns a page subtree into the
 *   stream and maps stream offsets back to `(node, offset)` fragments, then calls
 *   this function with the offsets of the selection.
 *
 * Offset unit: every offset here is a Unicode **code point** offset into the
 * stream given by the caller, never a UTF-16 unit index, so an astral character
 * occupies one position.
 *
 * Stream contract: the caller passes one stream and uses it for both directions,
 * and that stream is already normalized (`text-normalize.ts`, `A20` boundary
 * spaces included). The window pieces are exact substrings of it, which is what
 * makes the concatenated search of `anchor-resolve.ts` match: a piece that was
 * trimmed or re-collapsed would no longer be the text the page has. `text` is the
 * one piece that is normalized here, because a user selection carries the edge
 * whitespace of the click and a stored `text` is the visible span.
 *
 * Totality: a degenerate range produces `null`, never a half-built anchor and
 * never a throw. `null` means the caller's offsets do not describe a usable
 * selection, so nothing is stored.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network.
 */

import type { EntryAnchor } from './entry';
import { codePointLength } from './entry-rules';
import { normalizeText, sliceCodePoints, tailCodePoints, headCodePoints } from './text-normalize';

/**
 * Spec window: at most 40 normalized characters are kept on each side of the
 * selection ("Anchoring"). A caller may lower it, never raise it above what the
 * stream can supply.
 */
export const ANCHOR_CONTEXT_CODE_POINTS = 40;

/** What the content layer tells the anchor builder about the selection. */
export interface BuildAnchorOptions {
  /**
   * How many DOM fragments the original selection spanned (1 for a single text
   * node). It becomes `fragmentCount`, a hint only: the anchor authority is the
   * text, and the stored guard requires a non-negative integer.
   */
  fragments: number;
  /**
   * Normalized characters kept before and after the selection. Defaults to
   * `ANCHOR_CONTEXT_CODE_POINTS`; a value outside the usable range becomes `0`.
   */
  contextWindow?: number;
}

/**
 * Builds the anchor of the selection that occupies the code-point range
 * `[start, end)` of `pageText`.
 *
 * `text` is the normalized slice, `prefix` is the last up-to-`contextWindow`
 * code points of the stream before the selection and `suffix` the first up-to-
 * `contextWindow` code points after it, both exact substrings of the same stream.
 * A selection at the very start or the very end of the stream gets a shorter
 * window: the anchor is never padded, because filler characters would describe
 * context that the page does not have and would break the search in
 * `anchor-resolve.ts`. A window that ends (or begins) with the space between two
 * words keeps that space: it is a character of the normalized stream, not padding.
 *
 * Returns `null` when the range is not usable: an offset that is not a
 * non-negative integer, an empty or inverted range, an end past the end of the
 * stream, or a selection that normalization leaves empty (whitespace-only).
 */
export function buildAnchor(
  pageText: string,
  start: number,
  end: number,
  options: BuildAnchorOptions,
): EntryAnchor | null {
  if (typeof pageText !== 'string') {
    return null;
  }

  const total = codePointLength(pageText);
  if (!isUsableOffset(start) || !isUsableOffset(end) || start >= end || end > total) {
    return null;
  }

  const text = normalizeText(sliceCodePoints(pageText, start, end));
  if (text.length === 0) {
    return null;
  }

  const context = contextSize(options.contextWindow);
  const contextStart = start > context ? start - context : 0;
  const contextEnd = total - end > context ? end + context : total;

  const prefix = tailCodePoints(sliceCodePoints(pageText, contextStart, start), context);
  const suffix = headCodePoints(sliceCodePoints(pageText, end, contextEnd), context);

  return {
    text,
    prefix,
    suffix,
    fragmentCount: fragmentCountOf(options.fragments),
  };
}

/** A range offset the anchor may be built from: a non-negative integer. */
function isUsableOffset(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Normalized window size: a non-negative integer number of code points. A value
 * the caller did not give becomes the spec default, and a value that is not a
 * positive finite number becomes `0`, which means "text only, no window".
 */
function contextSize(value: number | undefined): number {
  const requested = value === undefined ? ANCHOR_CONTEXT_CODE_POINTS : value;
  if (!Number.isFinite(requested) || requested <= 0) {
    return 0;
  }
  return Math.floor(requested);
}

/**
 * `fragmentCount` of the stored anchor: a hint about how many DOM fragments the
 * selection spanned, stored as a non-negative integer because the read guard
 * rejects anything else. A missing or unusable count becomes `0`.
 */
function fragmentCountOf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}
