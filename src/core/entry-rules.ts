/**
 * Business rules over `Entry`: caps, authorship, edit rights, identity generation
 * and list helpers.
 *
 * Pure module: no DOM, no `chrome.*`, no clock, no framework. Randomness is
 * injected as `RandomSource`, so every test is deterministic and the rules can run
 * in Node, in the content script and in the popup alike. Rule owner:
 * `docs/specs/inline-comment-model.md` (Rules / Semantics -> caps, authorship,
 * edit rights; Flow 3 -> creation order).
 *
 * This layer returns English machine codes (`name_required`, `comment_empty`,
 * `comment_too_long`, `page_limit`, `overlap`, `duplicate`). Russian user-visible
 * strings are mapped in the UI layer, never here.
 *
 * Timestamp invariant: `createdAt` / `updatedAt` are UTC ISO-8601 strings
 * (`new Date().toISOString()` at the call site), so a plain string comparison is
 * chronological and the ordering helper needs no clock.
 */

import type { Entry } from './entry';
import type { CandidateSpan, ResolvedSpans } from './entry-overlap';
import { findDuplicateEntry, findOverlappingEntry } from './entry-overlap';

/** Hard cap of `comment`, counted in Unicode code points. */
export const MAX_COMMENT_CODE_POINTS = 256;

/** Hard cap of entries per `pageKey`; creation at the cap is refused. */
export const MAX_ENTRIES_PER_PAGE = 20;

/** Hard cap of the options author name, counted in Unicode code points. */
export const MAX_AUTHOR_NAME_CODE_POINTS = 40;

/** Length of the first-run author name (lowercase base36). */
export const GENERATED_AUTHOR_NAME_LENGTH = 8;

/** Length of an entry id (lowercase base36). */
export const ENTRY_ID_LENGTH = 12;

/** Alphabet of every generated identifier: lowercase base36, no separators. */
export const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Random source contract: returns a number in `[0, 1)`, usually `Math.random`
 * supplied by the caller. Values outside the interval are clamped, never trusted.
 */
export type RandomSource = () => number;

/** Result of a length rule: `normalized` is the trimmed value that was measured. */
export interface LengthValidation {
  /** `true` when the value is non-empty and inside the cap. */
  ok: boolean;
  /** Code points of `normalized` — never UTF-16 units. */
  codePointLength: number;
  /** Input without leading and trailing whitespace. */
  normalized: string;
}

/**
 * Machine code explaining why a creation attempt is refused (`null` = allowed).
 * The six codes are the six steps of Flow 3, in that order.
 */
export type CreateBlockCode =
  | 'name_required'
  | 'comment_empty'
  | 'comment_too_long'
  | 'page_limit'
  | 'overlap'
  | 'duplicate';

/** Everything the creation rules need; `entries` is the list of one page. */
export interface CreateAttempt {
  /** Existing entries of the current `pageKey`, in any order. */
  entries: readonly Entry[];
  /** Raw comment body as typed by the user. */
  comment: string;
  /** Author name currently set in options. */
  currentName: string;
  /**
   * Ranges for the overlap and duplicate steps, from one re-resolve pass (`A37`):
   * the candidate plus every existing entry of this page. Absent means the caller
   * gave core no stream to resolve against, and steps 5 and 6 cannot run; the
   * content layer always supplies them (`A22`, `A24`).
   */
  spans?: ResolvedSpans;
}

/** Counts Unicode code points, so a surrogate pair counts as one character. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/**
 * Comment rule: trimmed of surrounding whitespace, then measured in code points
 * against `MAX_COMMENT_CODE_POINTS`. Empty after trim is not acceptable.
 */
export function validateComment(comment: string): LengthValidation {
  const normalized = comment.trim();
  const length = codePointLength(normalized);
  return {
    ok: length > 0 && length <= MAX_COMMENT_CODE_POINTS,
    codePointLength: length,
    normalized,
  };
}

/**
 * Author name rule: mandatory, trimmed, at most `MAX_AUTHOR_NAME_CODE_POINTS`
 * code points. A name that violates the rule disables creation and editing.
 */
export function validateAuthorName(name: string): LengthValidation {
  const normalized = name.trim();
  const length = codePointLength(normalized);
  return {
    ok: length > 0 && length <= MAX_AUTHOR_NAME_CODE_POINTS,
    codePointLength: length,
    normalized,
  };
}

/**
 * Author identity: compared after trimming, case-sensitively (spec: "Identity is
 * the name string itself"). An empty side is never an author, so a reader with no
 * name set matches nobody even if a stored entry carries an empty author.
 */
export function isSameAuthor(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left.length === 0 || right.length === 0) {
    return false;
  }
  return left === right;
}

/** Edit right: only the author of the entry may change it; anyone else is read-only. */
export function canEdit(entry: Entry, currentName: string): boolean {
  return isSameAuthor(entry.authorName, currentName);
}

/** Generates the first-run author name: 8 lowercase base36 characters. */
export function generateAuthorName(rng: RandomSource): string {
  return randomBase36(rng, GENERATED_AUTHOR_NAME_LENGTH);
}

/** Generates an entry id: 12 lowercase base36 characters. */
export function randomId(rng: RandomSource): string {
  return randomBase36(rng, ENTRY_ID_LENGTH);
}

/**
 * Creation gate, checked in the spec's order (Flow 3): name set -> selection not
 * empty -> comment length <= 256 -> entry count < 20 -> no overlap -> no identical
 * existing entry. `null` means the entry may be created.
 *
 * Step 2 has no code here because core never sees a selection: a whitespace-only
 * or empty span is refused earlier by `buildAnchor` in `anchor-build.ts`, which
 * returns `null`, and an empty comment is refused by `comment_empty`.
 *
 * Steps 5 and 6 work on the resolved code-point ranges of the current stream, not
 * on stored anchor text (`A37`). Hidden entries block (`A22`), stale entries do
 * not (`A24`). When both match, the more specific code is reported: an identical
 * entry also overlaps, so `duplicate` wins over `overlap` (ruling `A23`).
 */
export function assertCreatable(attempt: CreateAttempt): CreateBlockCode | null {
  if (!validateAuthorName(attempt.currentName).ok) {
    return 'name_required';
  }

  const comment = validateComment(attempt.comment);
  if (comment.codePointLength === 0) {
    return 'comment_empty';
  }
  if (comment.codePointLength > MAX_COMMENT_CODE_POINTS) {
    return 'comment_too_long';
  }

  if (attempt.entries.length >= MAX_ENTRIES_PER_PAGE) {
    return 'page_limit';
  }

  const spans = attempt.spans;
  if (spans === undefined) {
    return null;
  }

  const candidate: CandidateSpan = { range: spans.candidate, comment: comment.normalized };
  if (findOverlappingEntry(candidate, attempt.entries, spans.byEntryId) === null) {
    return null;
  }
  return findDuplicateEntry(candidate, attempt.entries, spans.byEntryId) === null
    ? 'overlap'
    : 'duplicate';
}

/**
 * Popup ordering: creation order ascending (spec: Rules / Semantics -> "Ordering
 * in the popup"). The sort is stable, so entries sharing one `createdAt` keep the
 * order they were given in. The input array is never mutated.
 */
export function sortByCreatedAtAsc(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a: Entry, b: Entry) => {
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

/** Removes one entry by `id`; every other entry keeps its position. */
export function removeById(entries: readonly Entry[], id: string): Entry[] {
  return entries.filter((entry: Entry) => entry.id !== id);
}

/**
 * The popup checkbox (PM ruling `A1`): flips `visible` and nothing else. Visibility
 * controls painting only, so it is not an edit (`canEdit` does not apply to it), it
 * does not move the entry in the popup order, and it never changes `updatedAt`. The
 * input entry is never mutated.
 */
export function setEntryVisibility(entry: Entry, visible: boolean): Entry {
  return {
    id: entry.id,
    pageKey: entry.pageKey,
    authorName: entry.authorName,
    text: entry.text,
    comment: entry.comment,
    anchor: {
      text: entry.anchor.text,
      prefix: entry.anchor.prefix,
      suffix: entry.anchor.suffix,
      fragmentCount: entry.anchor.fragmentCount,
    },
    visible,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Clears a page: the result holds no entry of `pageKey`, while entries of other
 * pages are kept, so clearing one page can never touch another. For a single-page
 * list (the stored shape) the result is empty. The input array is never mutated.
 */
export function clearPageEntries(entries: readonly Entry[], pageKey: string): Entry[] {
  return entries.filter((entry: Entry) => entry.pageKey !== pageKey);
}

function randomBase36(rng: RandomSource, length: number): string {
  const alphabetSize = BASE36_ALPHABET.length;
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += BASE36_ALPHABET.charAt(alphabetIndex(rng(), alphabetSize));
  }
  return output;
}

function alphabetIndex(value: number, alphabetSize: number): number {
  if (!(value >= 0)) {
    return 0;
  }
  const index = Math.floor(value * alphabetSize);
  return index >= alphabetSize ? alphabetSize - 1 : index;
}
