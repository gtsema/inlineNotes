/**
 * Overlap and identical-entry rejection: the last two creation checks of Flow 3.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow / Sequence 3,
 * Rules / Semantics -> "Overlap", "Duplicate entry", "Resolved range"
 * (rulings `A22`, `A23`, `A24`, `A37`); Terms / Aliases -> "overlap",
 * "resolved range", "duplicate entry", "stale entry".
 *
 * What a range is here: the half-open code-point range `[start, end)` of the
 * normalized text stream, exactly what `anchor-resolve.ts` returns. `src/core/`
 * never computes one — it has no page — so the caller resolves the candidate
 * selection and every existing entry of that page against **one** stream in **one**
 * pass and hands the numbers over (`A37`). The stored anchor text is never
 * compared: only the resolved range says where a highlight would actually land,
 * and a sentence the page moved has a different range.
 *
 * Rules encoded here:
 * - ruling `A22`: a hidden entry participates. `visible` controls painting only,
 *   so this module never reads it;
 * - ruling `A24`: an entry with no resolved range is stale, contributes nothing,
 *   and can never block a create. It is absent from the map, or its value is not a
 *   usable range;
 * - ruling `A23`: two entries are identical when the resolved range is equal
 *   **and** the normalized comment is equal;
 * - a shared single boundary point is not an intersection (spec: "Overlap",
 *   AC6). The `block boundary space` a block boundary contributes belongs to no
 *   fragment, so a range that sits on that code point touches its neighbours and
 *   shares nothing with them (`A37`).
 *
 * Determinism: the scan walks the entry list the caller gave, in that order, and
 * the map is only ever read by `id`, never iterated. So the answer cannot depend
 * on insertion order or on object key order.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network, no UI
 * string. The Russian overlap message is mapped in the UI layer.
 */

import type { Entry } from './entry';

/**
 * A resolved range in the normalized text stream: half-open `[start, end)`,
 * counted in Unicode code points, never in UTF-16 units. `start` is inclusive and
 * `end` is exclusive, which is what makes a shared boundary point unambiguous.
 */
export interface CodePointRange {
  /** First code point of the range. */
  start: number;
  /** One past the last code point of the range. */
  end: number;
}

/**
 * The resolved range of every existing entry of the page, keyed by `id`
 * (`A37`). A stale entry is simply absent (`A24`); an entry that is present in the
 * list but absent here is read the same way, because the list drives the scan.
 */
export type ResolvedEntryRanges = ReadonlyMap<string, CodePointRange>;

/**
 * The candidate of both checks: the range the new selection resolves to, plus the
 * comment that would be stored. The comment matters only for the duplicate rule;
 * the shape leaves room for the entry-being-edited exclusion `t3-03` needs.
 */
export interface CandidateSpan {
  /** Half-open code-point range of the candidate on the current stream. */
  range: CodePointRange;
  /** Comment body of the candidate; compared trimmed, like the stored value. */
  comment: string;
}

/**
 * One re-resolve pass, given to the creation gate: the candidate range plus the
 * ranges of the existing entries. The two halves travel together on purpose — a
 * candidate compared against an empty map would silently be allowed past both
 * checks, which is the one misuse this API is shaped to prevent (`A37`).
 */
export interface ResolvedSpans {
  /** Range of the candidate selection on the current stream. */
  candidate: CodePointRange;
  /** Range of every existing entry of the page, keyed by `id`; stale is absent. */
  byEntryId: ResolvedEntryRanges;
}

/**
 * `true` when `range` describes at least one code point with usable offsets. A
 * degenerate (empty or inverted) or malformed range intersects nothing, so a
 * candidate that has no span can neither overlap nor duplicate anything.
 */
export function isUsableRange(range: CodePointRange | null | undefined): range is CodePointRange {
  if (range === null || range === undefined) {
    return false;
  }
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start
  );
}

/**
 * Intersection of two half-open ranges. A shared boundary point is not an
 * intersection: `[0, 10)` and `[10, 20)` touch and are reported as disjoint, while
 * `[0, 10)` and `[9, 20)` share code point 9 (spec: "Overlap"; AC6). A range that
 * has no code point intersects nothing, so a zero-length candidate is disjoint
 * from every range, including one that contains its boundary.
 */
export function rangesIntersect(a: CodePointRange, b: CodePointRange): boolean {
  if (!isUsableRange(a) || !isUsableRange(b)) {
    return false;
  }
  return a.start < b.end && b.start < a.end;
}

/**
 * Range equality for the duplicate rule (`A23`): same start and same end. Two
 * entries that resolved to different copies of repeated text have different ranges
 * even when their anchor text is the same string.
 */
export function sameRange(a: CodePointRange, b: CodePointRange): boolean {
  if (!isUsableRange(a) || !isUsableRange(b)) {
    return false;
  }
  return a.start === b.start && a.end === b.end;
}

/**
 * The first entry whose resolved range intersects the candidate, or `null`
 * (spec: "Overlap"). Hidden entries are scanned like visible ones (`A22`), stale
 * entries are skipped (`A24`), and the returned entry is the one the UI names in
 * its refusal message.
 */
export function findOverlappingEntry(
  candidate: CandidateSpan,
  entries: readonly Entry[],
  resolvedRanges: ResolvedEntryRanges,
): Entry | null {
  if (!isUsableRange(candidate.range)) {
    return null;
  }
  for (const entry of entries) {
    const range = resolvedRanges.get(entry.id);
    if (!isUsableRange(range)) {
      continue;
    }
    if (rangesIntersect(candidate.range, range)) {
      return entry;
    }
  }
  return null;
}

/**
 * The first entry identical to the candidate, or `null` (ruling `A23`): equal
 * resolved range **and** equal normalized comment. Same range with a different
 * comment is not a duplicate — it is refused as an overlap instead — and the same
 * comment at a different range is an ordinary second note, refused only if the two
 * ranges intersect.
 */
export function findDuplicateEntry(
  candidate: CandidateSpan,
  entries: readonly Entry[],
  resolvedRanges: ResolvedEntryRanges,
): Entry | null {
  if (!isUsableRange(candidate.range)) {
    return null;
  }
  const comment = trimmedComment(candidate.comment);
  for (const entry of entries) {
    const range = resolvedRanges.get(entry.id);
    if (!isUsableRange(range)) {
      continue;
    }
    if (sameRange(candidate.range, range) && comment === trimmedComment(entry.comment)) {
      return entry;
    }
  }
  return null;
}

/**
 * Comment identity: the stored comment is already the trimmed value
 * (`validateComment` in `entry-rules.ts`), and the candidate arrives normalized by
 * the same rule. Trimming both sides keeps the comparison total for a caller that
 * hands over the raw typed value.
 */
function trimmedComment(value: string): string {
  return value.trim();
}
