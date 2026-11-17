import { describe, expect, it } from 'vitest';

import type { Entry, EntryAnchor } from '../src/core/entry';
import {
  findDuplicateEntry,
  findOverlappingEntry,
  isUsableRange,
  rangesIntersect,
  sameRange,
} from '../src/core/entry-overlap';
import type {
  CandidateSpan,
  CodePointRange,
  ResolvedEntryRanges,
  ResolvedSpans,
} from '../src/core/entry-overlap';

/**
 * The resolved-span rules of task `t2-03` (AC1, AC2): the half-open code-point
 * range, its intersection test, and the two searches that answer "does this new
 * selection collide with an entry of this page".
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Overlap", "Duplicate entry", "Resolved range"; Flow / Sequence 3; AC6. The
 * stream itself belongs to `src/content/anchor/`, so every range here is a number
 * pair the caller resolved, and the cases below are written against the stream
 * shape `t2-02` produces.
 *
 * The module's purity is asserted by the single scan over `src/core/` in
 * `tests/core-storage-port.spec.ts` (ruling `A51`): the local copy of that scan
 * used to hold a non-ASCII rule the shared one did not, which is the only reason
 * it existed.
 */

const PAGE_KEY = 'https://example.com/a';
const ANCHOR: EntryAnchor = { text: 'span', prefix: '', suffix: '', fragmentCount: 1 };

function entryOf(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    pageKey: PAGE_KEY,
    authorName: 'reader-one',
    text: 'span',
    comment: 'note',
    anchor: ANCHOR,
    visible: true,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

function range(start: number, end: number): CodePointRange {
  return { start, end };
}

function candidate(start: number, end: number, comment = 'note'): CandidateSpan {
  return { range: range(start, end), comment };
}

function rangesOf(entries: ReadonlyArray<[string, CodePointRange]>): ResolvedEntryRanges {
  return new Map<string, CodePointRange>(entries);
}

/**
 * A stream shaped like `buildTextStream` output: `first` occupies `[0, 5)`, the
 * single `block boundary space` is code point 5, and `second` occupies `[6, 11)`.
 * The separator belongs to no fragment, which is what makes a range sitting on it
 * a touching boundary rather than shared content (`A37`).
 */
const FIRST = range(0, 5);
const SEPARATOR = range(5, 6);
const SECOND = range(6, 11);

describe('the resolved range and its intersection (AC1)', () => {
  it('treats a shared boundary point as touching, not as an intersection', () => {
    expect(rangesIntersect(range(0, 10), range(10, 20))).toBe(false);
    expect(rangesIntersect(range(10, 20), range(0, 10))).toBe(false);
  });

  it('reports an intersection for a single shared code point', () => {
    expect(rangesIntersect(range(0, 10), range(9, 20))).toBe(true);
    expect(rangesIntersect(range(9, 20), range(0, 10))).toBe(true);
    expect(rangesIntersect(range(0, 10), range(5, 6))).toBe(true);
  });

  it('reports an intersection for identical ranges', () => {
    expect(rangesIntersect(range(3, 9), range(3, 9))).toBe(true);
    expect(sameRange(range(3, 9), range(3, 9))).toBe(true);
    expect(sameRange(range(3, 9), range(3, 10))).toBe(false);
    expect(sameRange(range(3, 9), range(4, 9))).toBe(false);
  });

  it('treats a zero-length range as empty, wherever it sits', () => {
    expect(rangesIntersect(range(5, 5), range(0, 10))).toBe(false);
    expect(rangesIntersect(range(0, 10), range(5, 5))).toBe(false);
    expect(rangesIntersect(range(5, 5), range(5, 5))).toBe(false);
    expect(rangesIntersect(range(10, 10), range(10, 20))).toBe(false);
  });

  it('counts a block-boundary separator as a touching boundary, never as shared content (A37)', () => {
    const entryFirst = entryOf('first');
    const entrySecond = entryOf('second');
    const entries = [entryFirst, entrySecond];
    const resolved = rangesOf([
      ['first', FIRST],
      ['second', SECOND],
    ]);

    // A candidate that sits exactly on the separator code point touches both.
    expect(findOverlappingEntry(candidate(5, 6), entries, resolved)).toBeNull();
    // The two stored entries touch across the separator and do not overlap.
    expect(rangesIntersect(FIRST, SECOND)).toBe(false);
    // One code point past the separator is content of the second entry.
    expect(findOverlappingEntry(candidate(5, 7), entries, resolved)?.id).toBe('second');
    // One code point before it is content of the first entry.
    expect(findOverlappingEntry(candidate(4, 6), entries, resolved)?.id).toBe('first');
  });

  it('refuses a malformed range instead of intersecting with it', () => {
    const broken: CodePointRange[] = [
      range(-1, 5),
      range(5, -1),
      range(5, 5),
      range(9, 3),
      range(Number.NaN, 5),
      range(1, Number.NaN),
      range(1.5, 5),
      range(1, Number.POSITIVE_INFINITY),
    ];

    for (const value of broken) {
      expect(isUsableRange(value)).toBe(false);
      expect(rangesIntersect(value, range(0, 50))).toBe(false);
      expect(rangesIntersect(range(0, 50), value)).toBe(false);
      expect(sameRange(value, range(0, 50))).toBe(false);
    }

    expect(isUsableRange(range(0, 1))).toBe(true);
    expect(isUsableRange(null)).toBe(false);
    expect(isUsableRange(undefined)).toBe(false);
  });

  it('answers the same in both argument orders for every matrix row', () => {
    const matrix: CodePointRange[] = [
      range(0, 10),
      range(10, 20),
      range(9, 20),
      range(3, 5),
      range(5, 5),
      range(0, 20),
      SEPARATOR,
      SECOND,
    ];

    for (const a of matrix) {
      for (const b of matrix) {
        expect(rangesIntersect(a, b)).toBe(rangesIntersect(b, a));
      }
    }
  });
});

describe('findOverlappingEntry (AC2, rulings A22 and A24)', () => {
  it('returns the first overlapping entry in the order the caller gave', () => {
    const entries = [entryOf('a'), entryOf('b'), entryOf('c')];
    const resolved = rangesOf([
      ['a', range(20, 30)],
      ['b', range(5, 10)],
      ['c', range(7, 8)],
    ]);

    expect(findOverlappingEntry(candidate(6, 9), entries, resolved)?.id).toBe('b');
    expect(findOverlappingEntry(candidate(25, 26), entries, resolved)?.id).toBe('a');
    expect(findOverlappingEntry(candidate(0, 2), entries, resolved)).toBeNull();
  });

  it('lets a hidden entry block a create, because visible controls painting only (A22)', () => {
    const hidden = entryOf('hidden', { visible: false });
    const resolved = rangesOf([['hidden', range(10, 20)]]);

    expect(findOverlappingEntry(candidate(15, 16), [hidden], resolved)?.id).toBe('hidden');
    expect(findOverlappingEntry(candidate(20, 21), [hidden], resolved)).toBeNull();
  });

  it('skips an entry with no resolved range: a stale entry never blocks (A24)', () => {
    // The stale entry is the one whose stored words the candidate sits on: had its
    // anchor still resolved, its range would have been `[10, 20)` and the candidate
    // `[12, 13)` would have collided with it. The live entry resolved fine, but
    // somewhere else, so its range shares nothing with the candidate.
    const stale = entryOf('stale');
    const live = entryOf('live');
    const entries = [stale, live];

    // The stale entry is absent from the map, exactly as a non-resolving anchor is.
    const resolved = rangesOf([['live', range(30, 40)]]);
    expect(findOverlappingEntry(candidate(12, 13), entries, resolved)).toBeNull();
    expect(findOverlappingEntry(candidate(12, 13), [stale], rangesOf([]))).toBeNull();

    // The live entry still blocks on its own range, so the `null` above is the
    // stale entry being skipped and not a check that never fires.
    expect(findOverlappingEntry(candidate(35, 36), entries, resolved)?.id).toBe('live');

    // Control: the same candidate and the same entry list, but with the stale
    // range resolved onto `[10, 20)`, do collide. That pins the answer to the
    // missing range and not to the entry list, the candidate or the map shape.
    const staleResolved = rangesOf([
      ['stale', range(10, 20)],
      ['live', range(30, 40)],
    ]);
    expect(findOverlappingEntry(candidate(12, 13), entries, staleResolved)?.id).toBe('stale');

    // A range that resolved to nothing usable is read the same way.
    const degenerate = rangesOf([
      ['stale', range(12, 12)],
      ['live', range(30, 40)],
    ]);
    expect(findOverlappingEntry(candidate(12, 13), entries, degenerate)).toBeNull();
  });

  it('takes the candidate range as given: no range, no collision', () => {
    const entries = [entryOf('a')];
    const resolved = rangesOf([['a', range(0, 100)]]);

    expect(findOverlappingEntry(candidate(5, 5), entries, resolved)).toBeNull();
    expect(findOverlappingEntry(candidate(9, 3), entries, resolved)).toBeNull();
    expect(findOverlappingEntry(candidate(5, 6), [], resolved)).toBeNull();
  });

  it('is driven by the entry list, so an entry excluded from it cannot block (t3-03)', () => {
    const self = entryOf('self');
    const other = entryOf('other');
    const resolved = rangesOf([
      ['self', range(10, 20)],
      ['other', range(40, 50)],
    ]);

    // The entry being edited is dropped from the list before the check, and its
    // leftover range in the map is inert.
    expect(findOverlappingEntry(candidate(10, 20), [other], resolved)).toBeNull();
    expect(findOverlappingEntry(candidate(10, 20), [self, other], resolved)?.id).toBe('self');
  });

  it('never reads the anchor text: only the resolved range decides', () => {
    const entries = [entryOf('a', { text: 'same words', anchor: { ...ANCHOR, text: 'same words' } })];
    const resolved = rangesOf([['a', range(10, 20)]]);

    // The candidate carries the same stored words at another position: no overlap.
    expect(findOverlappingEntry(candidate(30, 40), entries, resolved)).toBeNull();
  });
});

describe('findDuplicateEntry (ruling A23)', () => {
  it('matches an equal range with an equal comment', () => {
    const entries = [entryOf('a', { comment: 'note one' }), entryOf('b', { comment: 'note two' })];
    const resolved = rangesOf([
      ['a', range(10, 20)],
      ['b', range(30, 40)],
    ]);

    expect(findDuplicateEntry(candidate(30, 40, 'note two'), entries, resolved)?.id).toBe('b');
  });

  it('does not match the same range with a different comment', () => {
    const entries = [entryOf('a', { comment: 'note one' })];
    const resolved = rangesOf([['a', range(10, 20)]]);

    expect(findDuplicateEntry(candidate(10, 20, 'note two'), entries, resolved)).toBeNull();
  });

  it('does not match the same comment at a different range', () => {
    const entries = [entryOf('a', { comment: 'note one' })];
    const resolved = rangesOf([['a', range(10, 20)]]);

    expect(findDuplicateEntry(candidate(12, 20, 'note one'), entries, resolved)).toBeNull();
    expect(findDuplicateEntry(candidate(10, 21, 'note one'), entries, resolved)).toBeNull();
    expect(findDuplicateEntry(candidate(100, 110, 'note one'), entries, resolved)).toBeNull();
  });

  it('compares the comment trimmed, like the stored value', () => {
    const entries = [entryOf('a', { comment: 'note' })];
    const resolved = rangesOf([['a', range(10, 20)]]);

    expect(findDuplicateEntry(candidate(10, 20, '  note  '), entries, resolved)?.id).toBe('a');
    expect(findDuplicateEntry(candidate(10, 20, 'note'), entries, resolved)?.id).toBe('a');
    expect(findDuplicateEntry(candidate(10, 20, 'no te'), entries, resolved)).toBeNull();
  });

  it('counts an astral comment as one sequence, not as UTF-16 units', () => {
    const entries = [entryOf('a', { comment: '😀🧪 note' })];
    const resolved = rangesOf([['a', range(0, 5)]]);

    expect(findDuplicateEntry(candidate(0, 5, '😀🧪 note'), entries, resolved)?.id).toBe('a');
    expect(findDuplicateEntry(candidate(0, 5, '😀 note'), entries, resolved)).toBeNull();
  });

  it('skips stale entries and lets hidden ones match (A22, A24)', () => {
    const hidden = entryOf('hidden', { visible: false, comment: 'note' });
    const stale = entryOf('stale', { comment: 'note' });
    const entries = [stale, hidden];

    expect(findDuplicateEntry(candidate(10, 20, 'note'), entries, rangesOf([]))).toBeNull();
    expect(
      findDuplicateEntry(candidate(10, 20, 'note'), entries, rangesOf([['hidden', range(10, 20)]]))
        ?.id,
    ).toBe('hidden');
  });
});

/** The aggregate the creation gate consumes; asserted here so the shape is pinned. */
describe('ResolvedSpans is the whole argument (A37)', () => {
  it('carries the candidate range and the per-entry map together', () => {
    const spans: ResolvedSpans = {
      candidate: range(4, 8),
      byEntryId: rangesOf([['a', range(0, 5)]]),
    };

    expect(spans.candidate).toEqual({ start: 4, end: 8 });
    expect(spans.byEntryId.get('a')).toEqual({ start: 0, end: 5 });
    expect(spans.byEntryId.has('unknown')).toBe(false);
  });
});
