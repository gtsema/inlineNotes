/**
 * Normalized page text: the single string space the anchor stage works in.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Terms / Aliases
 * ("normalized text stream", "anchor window") and Rules / Semantics ->
 * "Anchoring", "Normalized text".
 *
 * Contract (PM ruling `A26`):
 * - every run of whitespace collapses into one U+0020. The set is closed and is
 *   exactly the set `WHITESPACE_RUN` matches: U+0009 tab, U+000A line feed, U+000D
 *   carriage return, U+000B vertical tab, U+000C form feed, U+0020 space, U+00A0
 *   no-break space, U+1680 Ogham space mark, U+2000 through U+200A the run of
 *   Unicode space separators, U+2028 line separator, U+2029 paragraph separator,
 *   U+202F narrow no-break space, U+205F medium mathematical space, U+3000
 *   ideographic space and U+FEFF byte-order mark. Nothing else counts as
 *   whitespace: U+0085 (NEL) and U+200B (zero width space) survive normalization
 *   untouched, which is what makes this enumeration testable rather than open;
 * - leading and trailing whitespace of the whole value is dropped;
 * - nothing else changes: no reordering, no case change, no punctuation change.
 *   The non-whitespace code points of the input are exactly the code points of the
 *   output, in the same order;
 * - the operation is deterministic and idempotent, so applying it twice equals
 *   applying it once. `normalizeText` is therefore safe to use as a guard;
 * - the content layer normalizes at capture time (selection text and page text
 *   stream alike). `src/core/` never rewrites a caller's string: it refuses a value
 *   that is not normalized, which keeps a stored `text` and its `anchor` in one
 *   spelling.
 *
 * Offsets: every offset the anchor stage produces or consumes counts Unicode
 * **code points**, never UTF-16 units, so an astral character (an emoji, a runic
 * letter) occupies exactly one position. `codePointLength` in `entry-rules.ts`
 * measures the same unit, and the helpers here convert between that unit and the
 * UTF-16 indices `String.slice` and `String.indexOf` speak.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The DOM side
 * of the anchor stage (`t2-02`) is the only place a page subtree becomes a string.
 */

import { codePointLength } from './entry-rules';

/**
 * One run of whitespace, as one regular expression, so the collapse rule has a
 * single definition and the closed enumeration above is the set it matches — the
 * WhiteSpace and LineTerminator code points of the language, which include U+2028
 * and U+2029 and exclude U+0085. The `g` flag makes `String.replace` rewrite every
 * run, and it is kept private because a global expression carries a mutable
 * `lastIndex`.
 */
const WHITESPACE_RUN = /\s+/g;

/** The replacement every whitespace run becomes: exactly one U+0020. */
const SINGLE_SPACE = ' ';

/**
 * Collapses whitespace runs and trims the ends of `raw`. Deterministic,
 * idempotent, and it never reorders characters, so two callers that normalize the
 * same string agree on every character of the result.
 */
export function normalizeText(raw: string): string {
  return raw.replace(WHITESPACE_RUN, SINGLE_SPACE).trim();
}

/**
 * `true` when `value` already has the normalized shape. This is the guard behind
 * ruling `A26`: a create that carries a value for which this returns `false` is
 * refused, not rewritten.
 */
export function isNormalizedText(value: string): boolean {
  return value === normalizeText(value);
}

/**
 * UTF-16 index of the code point at `codePointOffset`. Offsets beyond the end of
 * the string clamp to the end, and a non-positive or non-finite offset gives `0`,
 * so a caller never receives an index outside the string.
 */
export function utf16IndexAt(text: string, codePointOffset: number): number {
  if (!(codePointOffset > 0)) {
    return 0;
  }
  let units = 0;
  let counted = 0;
  while (units < text.length && counted < codePointOffset) {
    units += unitsOfCodePointAt(text, units);
    counted += 1;
  }
  return units;
}

/**
 * Code-point offset of the UTF-16 index `utf16Index` — the inverse of
 * `utf16IndexAt`, used to turn the result of `String.indexOf` into an offset the
 * anchor contract can store and compare.
 */
export function codePointOffsetAt(text: string, utf16Index: number): number {
  const limit = utf16Index > 0 ? Math.min(utf16Index, text.length) : 0;
  let units = 0;
  let counted = 0;
  while (units < limit) {
    units += unitsOfCodePointAt(text, units);
    counted += 1;
  }
  return counted;
}

/**
 * Slice of `text` between two code-point offsets, half-open like the resolved
 * anchor range. The offsets are clamped and an inverted range gives an empty
 * string, so a degenerate range costs nothing instead of throwing.
 */
export function sliceCodePoints(text: string, start: number, end: number): string {
  const from = utf16IndexAt(text, start);
  const to = utf16IndexAt(text, end);
  return to > from ? text.slice(from, to) : '';
}

/** First `count` code points of `text`; a shorter string is returned whole. */
export function headCodePoints(text: string, count: number): string {
  return count > 0 ? text.slice(0, utf16IndexAt(text, count)) : '';
}

/** Last `count` code points of `text`; a shorter string is returned whole. */
export function tailCodePoints(text: string, count: number): string {
  if (!(count > 0)) {
    return '';
  }
  const total = codePointLength(text);
  const from = total > count ? total - count : 0;
  return text.slice(utf16IndexAt(text, from));
}

/**
 * UTF-16 units of the code point that starts at `units`. An unpaired surrogate
 * half counts as one unit, which is what `String.prototype` does with damaged
 * input, so the helpers stay total on a string the page produced.
 */
function unitsOfCodePointAt(text: string, units: number): number {
  if (units + 1 >= text.length) {
    return 1;
  }
  const lead = text.charCodeAt(units);
  const trail = text.charCodeAt(units + 1);
  return isHighSurrogate(lead) && isLowSurrogate(trail) ? 2 : 1;
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}
