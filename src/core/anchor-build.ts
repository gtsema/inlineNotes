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
 * Window boundary (ruling `A27`): the window is measured from the boundaries of the
 * **trimmed** span, not of the raw selection range. A click that caught the space
 * before a word, or a selection that stops at a block edge, keeps a contextual
 * window that is still a substring of the stream; taking the window at the raw
 * boundary would put the stripped whitespace inside it and the contextual search
 * would find nothing, silently degrading the anchor to bare-text matching.
 *
 * Totality: a degenerate range produces `null`, never a half-built anchor and
 * never a throw. `null` means the caller's offsets do not describe a usable
 * selection, or the caller mis-stated an option, so nothing is stored (ruling
 * `A28`, the same stance as `A26`: core refuses an input it would have to repair).
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
   * text, and the stored guard requires a non-negative integer. A value outside
   * that domain is refused (`A28`), because a caller that mis-states the hint
   * should not get a silently different anchor.
   */
  fragments: number;
  /**
   * Normalized characters kept before and after the selection. Defaults to
   * `ANCHOR_CONTEXT_CODE_POINTS`; `0` means "text only, no window". A value that
   * is not a non-negative integer is refused (`A28`), never coerced.
   */
  contextWindow?: number;
}

/**
 * Builds the anchor of the selection that occupies the code-point range
 * `[start, end)` of `pageText`.
 *
 * `text` is the normalized slice, `prefix` is the last up-to-`contextWindow`
 * code points of the stream before the selection and `suffix` the first up-to-
 * `contextWindow` code points after it, both exact substrings of the same stream,
 * taken at the boundaries the trimming leaves (`A27`). A selection at the very
 * start or the very end of the stream gets a shorter window: the anchor is never
 * padded, because filler characters would describe context that the page does not
 * have and would break the search in `anchor-resolve.ts`. A window that ends (or
 * begins) with the space between two words keeps that space: it is a character of
 * the normalized stream, not padding.
 *
 * Returns `null` when the range is not usable: an offset that is not a
 * non-negative integer, an empty or inverted range, an end past the end of the
 * stream, or a selection that normalization leaves empty (whitespace-only). It is
 * also `null` when an option is out of its domain: a negative, fractional or
 * non-finite `contextWindow` or `fragments` (`A28`).
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

  const context = contextSize(options.contextWindow);
  const fragments = fragmentCountOf(options.fragments);
  if (context === null || fragments === null) {
    return null;
  }

  const span = sliceCodePoints(pageText, start, end);
  const text = normalizeText(span);
  if (text.length === 0) {
    return null;
  }

  const spanStart = start + leadingCodePoints(span);
  const spanEnd = end - trailingCodePoints(span);

  const contextStart = spanStart > context ? spanStart - context : 0;
  const contextEnd = total - spanEnd > context ? spanEnd + context : total;

  const prefix = tailCodePoints(sliceCodePoints(pageText, contextStart, spanStart), context);
  const suffix = headCodePoints(sliceCodePoints(pageText, spanEnd, contextEnd), context);

  return {
    text,
    prefix,
    suffix,
    fragmentCount: fragments,
  };
}

/** A range offset the anchor may be built from: a non-negative integer. */
function isUsableOffset(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Code points of the whitespace run at the start of the selection span — exactly
 * what `normalizeText` strips there, so the window boundary lands on the first
 * character the entry actually stores (ruling `A27`).
 */
function leadingCodePoints(span: string): number {
  const run = /^\s*/.exec(span);
  return codePointLength(run === null ? '' : run[0]);
}

/** Code points of the whitespace run at the end of the selection span (`A27`). */
function trailingCodePoints(span: string): number {
  const run = /\s*$/.exec(span);
  return codePointLength(run === null ? '' : run[0]);
}

/**
 * Normalized window size: a non-negative integer number of code points, where `0`
 * means "text only, no window". A value the caller did not give becomes the spec
 * default, and a value outside that domain refuses the anchor instead of being
 * coerced (ruling `A28`).
 */
function contextSize(value: number | undefined): number | null {
  const requested = value === undefined ? ANCHOR_CONTEXT_CODE_POINTS : value;
  return isCount(requested) ? requested : null;
}

/**
 * `fragmentCount` of the stored anchor: a hint about how many DOM fragments the
 * selection spanned, stored as a non-negative integer because the read guard
 * rejects anything else. A value outside that domain refuses the anchor (`A28`).
 */
function fragmentCountOf(value: number): number | null {
  return isCount(value) ? value : null;
}

/** A count the anchor accepts: a non-negative integer, so no NaN and no Infinity. */
function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
