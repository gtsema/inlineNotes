import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Entry } from '../src/core/entry';
import type { CodePointRange, ResolvedSpans } from '../src/core/entry-overlap';
import {
  BASE36_ALPHABET,
  ENTRY_ID_LENGTH,
  GENERATED_AUTHOR_NAME_LENGTH,
  MAX_AUTHOR_NAME_CODE_POINTS,
  MAX_COMMENT_CODE_POINTS,
  MAX_ENTRIES_PER_PAGE,
  assertCreatable,
  canEdit,
  clearPageEntries,
  codePointLength,
  entriesOfAuthor,
  generateAuthorName,
  isSameAuthor,
  randomId,
  removeById,
  sortByCreatedAtAsc,
  validateAuthorName,
  validateComment,
  type CreateAttempt,
  type CreateBlockCode,
  type RandomSource,
} from '../src/core/entry-rules';

/**
 * Entry rules of task `t1-04` (AC2–AC5): the 256 code-point comment cap, the
 * 20-entry page cap, author identity and edit rights, id/name generation, and the
 * list helpers.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const PAGE_KEY = 'https://example.com/a';

/** A Cyrillic sentence used to prove the cap is not UTF-16 units or bytes. */
const CYRILLIC_SENTENCE = 'обычный русский текст заметки';

function entryWith(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'id-00',
    pageKey: PAGE_KEY,
    authorName: 'Анна',
    text: 'выделенный текст',
    comment: 'заметка',
    anchor: { text: 'выделенный текст', prefix: '', suffix: '', fragmentCount: 1 },
    visible: true,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

function entriesForPage(count: number): Entry[] {
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(entryWith({ id: `id-${index}` }));
  }
  return entries;
}

/** Resolved range `span` for every entry: what one re-resolve pass produces (`A37`). */
function rangesOf(entries: readonly Entry[], span: CodePointRange): Map<string, CodePointRange> {
  const byEntryId = new Map<string, CodePointRange>();
  for (const entry of entries) {
    byEntryId.set(entry.id, span);
  }
  return byEntryId;
}

/** Spans in which the candidate is identical to every existing entry (`A23`). */
function identicalSpans(entries: readonly Entry[], span: CodePointRange): ResolvedSpans {
  return { candidate: span, byEntryId: rangesOf(entries, span) };
}

/** Deterministic rng: replays `values`, then keeps returning the last one. */
function replayRng(values: readonly number[]): { rng: RandomSource; calls: () => number } {
  let index = 0;
  return {
    rng: () => {
      const value = values[index] ?? values[values.length - 1] ?? 0;
      index += 1;
      return value;
    },
    calls: () => index,
  };
}

/** Strips comments so the purity checks look at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function coreSource(relativePath: string): string {
  return codeOnly(readFileSync(join(projectRoot, 'src', 'core', relativePath), 'utf8'));
}

describe('validateComment (AC2)', () => {
  it('exposes the documented caps', () => {
    expect(MAX_COMMENT_CODE_POINTS).toBe(256);
    expect(MAX_ENTRIES_PER_PAGE).toBe(20);
    expect(MAX_AUTHOR_NAME_CODE_POINTS).toBe(40);
  });

  it('accepts exactly 256 code points and rejects 257', () => {
    const atCap = validateComment('a'.repeat(MAX_COMMENT_CODE_POINTS));
    const overCap = validateComment('a'.repeat(MAX_COMMENT_CODE_POINTS + 1));

    expect(atCap.ok).toBe(true);
    expect(atCap.codePointLength).toBe(256);
    expect(overCap.ok).toBe(false);
    expect(overCap.codePointLength).toBe(257);
  });

  it('counts Unicode code points, so a surrogate pair is one character', () => {
    const astral = '😀';
    expect(astral.length).toBe(2);
    expect(codePointLength(astral)).toBe(1);

    const atCap = validateComment(astral.repeat(MAX_COMMENT_CODE_POINTS));
    const overCap = validateComment(astral.repeat(MAX_COMMENT_CODE_POINTS + 1));

    expect(atCap.ok).toBe(true);
    expect(atCap.codePointLength).toBe(256);
    expect(overCap.ok).toBe(false);
    expect(overCap.codePointLength).toBe(257);
  });

  it('trims leading and trailing whitespace before counting', () => {
    const padded = `   \n\t${CYRILLIC_SENTENCE}  \r\n `;
    const result = validateComment(padded);

    expect(result.normalized).toBe(CYRILLIC_SENTENCE);
    expect(result.codePointLength).toBe(codePointLength(CYRILLIC_SENTENCE));
    expect(result.ok).toBe(true);
  });

  it('applies the cap to the trimmed value, not the typed value', () => {
    const body = 'a'.repeat(MAX_COMMENT_CODE_POINTS);
    expect(validateComment(`  ${body}  `).ok).toBe(true);
    expect(validateComment(`  ${body}a  `).ok).toBe(false);
  });

  it('rejects an empty comment, including whitespace-only input', () => {
    expect(validateComment('')).toEqual({ ok: false, codePointLength: 0, normalized: '' });
    expect(validateComment('   \t\n ')).toEqual({ ok: false, codePointLength: 0, normalized: '' });
  });
});

describe('author name and identity rules (AC3)', () => {
  it('requires a non-empty trimmed name of at most 40 code points', () => {
    expect(validateAuthorName('')).toMatchObject({ ok: false, codePointLength: 0 });
    expect(validateAuthorName('   ')).toMatchObject({ ok: false, codePointLength: 0, normalized: '' });
    expect(validateAuthorName('  Анна  ')).toMatchObject({ ok: true, normalized: 'Анна' });
    expect(validateAuthorName('a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS)).ok).toBe(true);
    expect(validateAuthorName('a'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1)).ok).toBe(false);
  });

  it('counts the name cap in code points as well', () => {
    const astral = '😀';
    expect(validateAuthorName(astral.repeat(MAX_AUTHOR_NAME_CODE_POINTS)).ok).toBe(true);
    expect(validateAuthorName(astral.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1)).ok).toBe(false);
  });

  it('compares authors trimmed and case-sensitively', () => {
    expect(isSameAuthor('Анна', 'Анна')).toBe(true);
    expect(isSameAuthor('  Анна  ', 'Анна')).toBe(true);
    expect(isSameAuthor('Ann', 'ann')).toBe(false);
    expect(isSameAuthor('Анна', 'Анна Петровна')).toBe(false);
    expect(isSameAuthor('а', 'а ')).toBe(true);
  });

  it('treats an empty name as no author at all', () => {
    expect(isSameAuthor('', '')).toBe(false);
    expect(isSameAuthor('   ', '  ')).toBe(false);
    expect(isSameAuthor('Анна', '')).toBe(false);
    expect(isSameAuthor('', 'Анна')).toBe(false);
  });

  it('generates an 8-character lowercase base36 author name from the injected rng', () => {
    expect(GENERATED_AUTHOR_NAME_LENGTH).toBe(8);
    expect(generateAuthorName(() => 0)).toBe('0'.repeat(8));
    expect(generateAuthorName(() => 35 / 36)).toBe('z'.repeat(8));

    const sequence = replayRng([0, 1 / 36, 2 / 36, 3 / 36, 4 / 36, 5 / 36, 6 / 36, 7 / 36]);
    const name = generateAuthorName(sequence.rng);

    expect(name).toBe('01234567');
    expect(name).toMatch(/^[0-9a-z]{8}$/);
    expect(sequence.calls()).toBe(8);
  });

  it('generates a 12-character lowercase base36 id from the injected rng', () => {
    expect(ENTRY_ID_LENGTH).toBe(12);
    expect(randomId(() => 0)).toBe('0'.repeat(12));
    expect(randomId(() => 35 / 36)).toBe('z'.repeat(12));

    const rising = [0, 10, 20, 30, 1, 11, 21, 31, 2, 12, 22, 32].map((n) => n / 36);
    const sequence = replayRng(rising);
    const id = randomId(sequence.rng);

    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-z]{12}$/);
    expect(id).toBe('0aku1blv2cmw');
    expect(sequence.calls()).toBe(12);
    expect(new Set([randomId(() => 0.1), randomId(() => 0.7)]).size).toBe(2);
  });

  it('clamps an rng that leaves [0,1) instead of producing a broken identifier', () => {
    for (const value of [1, 1.4, -0.5, Number.NaN]) {
      const name = generateAuthorName(() => value);
      expect(name).toHaveLength(8);
      expect(name).toMatch(/^[0-9a-z]{8}$/);
    }
    expect(generateAuthorName(() => 1)).toBe('z'.repeat(8));
    expect(generateAuthorName(() => Number.NaN)).toBe('0'.repeat(8));
    expect(randomId(() => -0.5)).toBe('0'.repeat(12));
  });

  it('uses the lowercase base36 alphabet for both generators', () => {
    expect(BASE36_ALPHABET).toHaveLength(36);
    expect(BASE36_ALPHABET).toBe(BASE36_ALPHABET.toLowerCase());
    const everySymbol = Array.from({ length: 36 }, (_, index) => index / 36);
    expect(generateAuthorName(replayRng(everySymbol).rng)).toBe(BASE36_ALPHABET.slice(0, 8));
  });
});

describe('edit rights and creation gate (AC4)', () => {
  it('allows editing only for the author of the entry', () => {
    expect(canEdit(entryWith({ authorName: 'Анна' }), 'Анна')).toBe(true);
    expect(canEdit(entryWith({ authorName: '  Анна ' }), 'Анна  ')).toBe(true);
    expect(canEdit(entryWith({ authorName: 'Анна' }), 'анна')).toBe(false);
    expect(canEdit(entryWith({ authorName: 'Анна' }), 'Пётр')).toBe(false);
    expect(canEdit(entryWith({ authorName: 'Анна' }), '')).toBe(false);
    expect(canEdit(entryWith({ authorName: '' }), '')).toBe(false);
  });

  it('refuses creation when the options name is missing', () => {
    expect(assertCreatable({ entries: [], comment: 'заметка', currentName: '' })).toBe('name_required');
    expect(assertCreatable({ entries: [], comment: 'заметка', currentName: '   ' })).toBe('name_required');
    expect(assertCreatable({ entries: [], comment: 'заметка', currentName: 'a'.repeat(41) })).toBe(
      'name_required',
    );
  });

  it('refuses an empty comment after trim', () => {
    const code = assertCreatable({ entries: [], comment: '   \n ', currentName: 'Анна' });
    expect(code).toBe('comment_empty');
  });

  it('refuses a comment over the cap', () => {
    const code = assertCreatable({
      entries: [],
      comment: 'a'.repeat(MAX_COMMENT_CODE_POINTS + 1),
      currentName: 'Анна',
    });
    expect(code).toBe('comment_too_long');
    expect(
      assertCreatable({ entries: [], comment: 'a'.repeat(MAX_COMMENT_CODE_POINTS), currentName: 'Анна' }),
    ).toBeNull();
  });

  it('refuses the 21st entry: page_limit at 20 existing entries, not at 19', () => {
    const currentName = 'Анна';
    expect(assertCreatable({ entries: entriesForPage(19), comment: 'заметка', currentName })).toBeNull();
    expect(assertCreatable({ entries: entriesForPage(20), comment: 'заметка', currentName })).toBe(
      'page_limit',
    );
    expect(assertCreatable({ entries: entriesForPage(21), comment: 'заметка', currentName })).toBe(
      'page_limit',
    );
  });

  it('checks the six creation rules in the spec order of Flow 3', () => {
    // Every row violates its own step and every later step it can, so the reported
    // code is the earliest violated step. `id-0` always resolves onto the span the
    // candidate resolves to, so steps 5 and 6 are violated in every row.
    const atCap = entriesForPage(MAX_ENTRIES_PER_PAGE);
    const belowCap = entriesForPage(MAX_ENTRIES_PER_PAGE - 1);
    const name = 'Анна';
    const identical = identicalSpans(atCap, { start: 10, end: 20 });
    const partial: ResolvedSpans = { candidate: { start: 12, end: 24 }, byEntryId: rangesOf(atCap, { start: 10, end: 20 }) };

    const rows: { step: string; attempt: CreateAttempt; code: CreateBlockCode }[] = [
      { step: '1 name', attempt: { entries: atCap, comment: 'заметка', currentName: '', spans: identical }, code: 'name_required' },
      { step: '2 selection and empty comment', attempt: { entries: atCap, comment: '   ', currentName: name, spans: identical }, code: 'comment_empty' },
      { step: '3 comment cap', attempt: { entries: atCap, comment: 'a'.repeat(MAX_COMMENT_CODE_POINTS + 1), currentName: name, spans: identical }, code: 'comment_too_long' },
      { step: '4 entry cap', attempt: { entries: atCap, comment: 'заметка', currentName: name, spans: identical }, code: 'page_limit' },
      { step: '5 overlap', attempt: { entries: belowCap, comment: 'заметка', currentName: name, spans: partial }, code: 'overlap' },
      { step: '6 duplicate', attempt: { entries: belowCap, comment: 'заметка', currentName: name, spans: identical }, code: 'duplicate' },
    ];

    expect(rows.map((row) => row.step)).toEqual([
      '1 name',
      '2 selection and empty comment',
      '3 comment cap',
      '4 entry cap',
      '5 overlap',
      '6 duplicate',
    ]);
    expect(rows.map((row) => assertCreatable(row.attempt))).toEqual([
      'name_required',
      'comment_empty',
      'comment_too_long',
      'page_limit',
      'overlap',
      'duplicate',
    ]);
  });

  it('refuses a candidate whose resolved range intersects an existing entry (AC3, A22, A24)', () => {
    const entries = [entryWith({ id: 'live' }), entryWith({ id: 'hidden', visible: false })];
    const resolved = rangesOf(entries, { start: 10, end: 20 });
    const spans = (start: number, end: number): ResolvedSpans => ({
      candidate: { start, end },
      byEntryId: resolved,
    });

    // A shared boundary point is accepted (spec: "Overlap", AC6).
    expect(assertCreatable({ entries, comment: 'заметка', currentName: 'Анна', spans: spans(20, 24) }))
      .toBeNull();
    // A hidden entry still blocks, because `visible` controls painting only.
    expect(assertCreatable({ entries: [entries[1]], comment: 'заметка', currentName: 'Анна', spans: spans(15, 16) }))
      .toBe('overlap');
    // A stale entry has no range, so nothing blocks a new note over its text.
    expect(
      assertCreatable({
        entries,
        comment: 'заметка',
        currentName: 'Анна',
        spans: { candidate: { start: 12, end: 13 }, byEntryId: new Map<string, CodePointRange>() },
      }),
    ).toBeNull();
  });

  it('reports duplicate as the more specific code when both matches hold (ruling A23)', () => {
    const entries = [entryWith({ id: 'same', comment: 'заметка' })];
    const resolved = rangesOf(entries, { start: 10, end: 20 });

    // Equal range and equal comment: `duplicate`, although the same candidate also
    // intersects the range.
    expect(
      assertCreatable({
        entries,
        comment: ' заметка ',
        currentName: 'Анна',
        spans: { candidate: { start: 10, end: 20 }, byEntryId: resolved },
      }),
    ).toBe('duplicate');

    // Equal range, different comment: still refused, as `overlap`.
    expect(
      assertCreatable({
        entries,
        comment: 'другая заметка',
        currentName: 'Анна',
        spans: { candidate: { start: 10, end: 20 }, byEntryId: resolved },
      }),
    ).toBe('overlap');
  });

  it('enforces only steps 1-4 when the caller supplies no resolved ranges (A37)', () => {
    const entries = [entryWith({ id: 'live' })];

    // Core has no page to resolve against: a caller that hands over no spans gets
    // no overlap answer in either direction, which is why the content layer must
    // always pass them.
    expect(assertCreatable({ entries, comment: 'заметка', currentName: 'Анна' })).toBeNull();
    expect(
      assertCreatable({
        entries,
        comment: 'заметка',
        currentName: 'Анна',
        spans: { candidate: { start: 10, end: 20 }, byEntryId: new Map<string, CodePointRange>() },
      }),
    ).toBeNull();
  });

  it('accepts a well-formed creation attempt below the cap', () => {
    expect(assertCreatable({ entries: entriesForPage(0), comment: 'заметка', currentName: 'Анна' })).toBeNull();
    expect(assertCreatable({ entries: entriesForPage(19), comment: '😀'.repeat(256), currentName: ' Анна ' }))
      .toBeNull();
  });
});

/**
 * The per-author creation gate of task `t5-01` (model spec AC33; rulings `A93`,
 * `A99`, `A100`). The nine acceptance criteria of the task card are numbered in the
 * test names, so an acceptance review can walk them one by one.
 *
 * What changed and what did not: steps 5 and 6 of Flow 3 scan the `own entry` half
 * of the page list, while step 4 (the 20-entry cap) and every other creation rule
 * still see the whole list. `src/core/entry-overlap.ts` is untouched and stays
 * author-blind — the filter is applied to the list handed to it.
 */
describe('the creation gate answers overlap and duplicate per author (t5-01 AC1-AC8)', () => {
  const OWN = 'Анна';
  const FOREIGN = 'Борис';

  /** One span resolved onto both entries of a mixed page. */
  function spansOn(
    entries: readonly Entry[],
    entrySpan: CodePointRange,
    candidate: CodePointRange,
  ): ResolvedSpans {
    return { candidate, byEntryId: rangesOf(entries, entrySpan) };
  }

  function ownAndForeign(): Entry[] {
    return [
      entryWith({ id: 'own-note', authorName: OWN, comment: 'моя заметка' }),
      entryWith({ id: 'foreign-note', authorName: FOREIGN, comment: 'чужая заметка' }),
    ];
  }

  it('AC1 — the same author on the same words with the same comment is still a duplicate', () => {
    const entries = ownAndForeign();

    expect(
      assertCreatable({
        entries,
        comment: 'моя заметка',
        currentName: OWN,
        spans: spansOn(entries, { start: 10, end: 20 }, { start: 10, end: 20 }),
      }),
    ).toBe('duplicate');
  });

  it('AC2 — the same author on an intersecting span is still an overlap', () => {
    const entries = ownAndForeign();

    expect(
      assertCreatable({
        entries,
        comment: 'другая заметка',
        currentName: OWN,
        spans: spansOn(entries, { start: 10, end: 20 }, { start: 12, end: 24 }),
      }),
    ).toBe('overlap');
  });

  it('AC3 — another author\'s identical note on the same words does not refuse a duplicate', () => {
    const foreign = [entryWith({ id: 'foreign-note', authorName: FOREIGN, comment: 'моя заметка' })];

    // Equal range and equal comment, different author: `duplicate` needs an own
    // entry, so the candidate is created (ruling `A93`).
    expect(
      assertCreatable({
        entries: foreign,
        comment: 'моя заметка',
        currentName: OWN,
        spans: spansOn(foreign, { start: 10, end: 20 }, { start: 10, end: 20 }),
      }),
    ).toBeNull();
  });

  it('AC4 — another author\'s intersecting span does not refuse an overlap', () => {
    const foreign = [entryWith({ id: 'foreign-note', authorName: FOREIGN })];

    expect(
      assertCreatable({
        entries: foreign,
        comment: 'моя заметка',
        currentName: OWN,
        spans: spansOn(foreign, { start: 10, end: 20 }, { start: 12, end: 24 }),
      }),
    ).toBeNull();

    // Same candidate against the same stored entry, now authored by the reader:
    // the only difference is the author, and the answer flips.
    expect(
      assertCreatable({
        entries: [entryWith({ id: 'foreign-note', authorName: OWN })],
        comment: 'моя заметка',
        currentName: OWN,
        spans: spansOn(foreign, { start: 10, end: 20 }, { start: 12, end: 24 }),
      }),
    ).toBe('overlap');
  });

  it('AC5 — a page mixing own and foreign entries answers from the own half only', () => {
    const entries = ownAndForeign();
    const byId = new Map<string, CodePointRange>([
      ['own-note', { start: 60, end: 70 }],
      ['foreign-note', { start: 30, end: 34 }],
    ]);

    // The candidate resolves onto the foreign entry's range only: created.
    expect(
      assertCreatable({
        entries,
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate: { start: 30, end: 34 }, byEntryId: byId },
      }),
    ).toBeNull();

    // Identical to the foreign entry in range AND comment: still created, because
    // `duplicate` needs an own entry (`A23` + `A93`).
    expect(
      assertCreatable({
        entries,
        comment: 'чужая заметка',
        currentName: OWN,
        spans: { candidate: { start: 30, end: 34 }, byEntryId: byId },
      }),
    ).toBeNull();

    // The same candidate moved onto the own entry's range: refused again, and the
    // comment decides which of the two codes (`A23` unchanged).
    expect(
      assertCreatable({
        entries,
        comment: 'другая заметка',
        currentName: OWN,
        spans: { candidate: { start: 62, end: 66 }, byEntryId: byId },
      }),
    ).toBe('overlap');
    expect(
      assertCreatable({
        entries,
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate: { start: 60, end: 70 }, byEntryId: byId },
      }),
    ).toBe('duplicate');
  });

  it('AC6 — the 20-entry cap still counts every entry of the page, whatever its author', () => {
    const mixed = entriesForPage(MAX_ENTRIES_PER_PAGE).map((entry: Entry, index: number) =>
      entryWith({ id: entry.id, authorName: index % 2 === 0 ? OWN : FOREIGN }),
    );
    const allForeign = entriesForPage(MAX_ENTRIES_PER_PAGE).map((entry: Entry) =>
      entryWith({ id: entry.id, authorName: FOREIGN }),
    );

    expect(assertCreatable({ entries: mixed, comment: 'моя заметка', currentName: OWN })).toBe(
      'page_limit',
    );
    expect(assertCreatable({ entries: allForeign, comment: 'моя заметка', currentName: OWN })).toBe(
      'page_limit',
    );
    // One entry fewer, and the author mix changes nothing about the answer.
    expect(
      assertCreatable({
        entries: allForeign.slice(1),
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate: { start: 0, end: 4 }, byEntryId: new Map<string, CodePointRange>() },
      }),
    ).toBeNull();
  });

  it('AC7 — a hidden own entry still blocks and a stale entry still does not (A22, A24)', () => {
    const hiddenOwn = entryWith({ id: 'hidden-own', authorName: OWN, visible: false });
    const hiddenForeign = entryWith({ id: 'hidden-foreign', authorName: FOREIGN, visible: false });
    const span: CodePointRange = { start: 10, end: 20 };
    const candidate: CodePointRange = { start: 12, end: 13 };

    expect(
      assertCreatable({
        entries: [hiddenOwn],
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate, byEntryId: new Map<string, CodePointRange>([['hidden-own', span]]) },
      }),
    ).toBe('overlap');
    expect(
      assertCreatable({
        entries: [hiddenForeign],
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate, byEntryId: new Map<string, CodePointRange>([['hidden-foreign', span]]) },
      }),
    ).toBeNull();

    // Stale means absent from the map, and a stale OWN entry blocks nothing (`A24`).
    expect(
      assertCreatable({
        entries: [hiddenOwn, hiddenForeign],
        comment: 'моя заметка',
        currentName: OWN,
        spans: { candidate, byEntryId: new Map<string, CodePointRange>() },
      }),
    ).toBeNull();
  });

  it('AC8 — the gate uses the one author identity, trimmed and case-sensitive (A99)', () => {
    const span: CodePointRange = { start: 10, end: 20 };
    const trailingSpace = entryWith({ id: 'trailing', authorName: 'Я ' });
    const trailingRanges = new Map<string, CodePointRange>([['trailing', span]]);

    // A stored record authored `"Я "` belongs to the reader named `"Я"`, exactly as
    // `canEdit` decides: it blocks, it does not silently become a foreign entry.
    expect(
      assertCreatable({
        entries: [trailingSpace],
        comment: 'заметка',
        currentName: 'Я',
        spans: { candidate: { start: 12, end: 13 }, byEntryId: trailingRanges },
      }),
    ).toBe('overlap');
    expect(
      assertCreatable({
        entries: [trailingSpace],
        comment: 'заметка',
        currentName: '  Я  ',
        spans: { candidate: span, byEntryId: trailingRanges },
      }),
    ).toBe('duplicate');

    // Case is never folded: a `"я"` record is foreign to `"Я"` and blocks nothing.
    expect(
      assertCreatable({
        entries: [entryWith({ id: 'lower', authorName: 'я' })],
        comment: 'заметка',
        currentName: 'Я',
        spans: { candidate: { start: 12, end: 13 }, byEntryId: new Map<string, CodePointRange>([['lower', span]]) },
      }),
    ).toBeNull();
  });

});

describe('entriesOfAuthor — the own half of a page list (t5-01, A93/A99)', () => {
  it('keeps exactly the entries of the current author, in the order they were given', () => {
    const mixed = [
      entryWith({ id: 'f1', authorName: 'Борис' }),
      entryWith({ id: 'o1', authorName: 'Анна' }),
      entryWith({ id: 'f2', authorName: 'Пётр' }),
      entryWith({ id: 'o2', authorName: ' Анна ' }),
    ];

    expect(entriesOfAuthor(mixed, 'Анна').map((entry: Entry) => entry.id)).toEqual(['o1', 'o2']);
    expect(entriesOfAuthor(mixed, 'Пётр').map((entry: Entry) => entry.id)).toEqual(['f2']);
    expect(entriesOfAuthor(mixed, 'Никто')).toEqual([]);
    expect(mixed.map((entry: Entry) => entry.id)).toEqual(['f1', 'o1', 'f2', 'o2']);
  });

  it('is a pure projection: hidden and stale entries survive it (A22, A24)', () => {
    const entries = [
      entryWith({ id: 'hidden', authorName: 'Анна', visible: false }),
      entryWith({ id: 'stale', authorName: 'Анна' }),
    ];

    // The projection reads `authorName` and nothing else, so the rules that key on
    // `visible` or on the absence of a resolved range keep working downstream.
    expect(entriesOfAuthor(entries, 'Анна').map((entry: Entry) => entry.id)).toEqual([
      'hidden',
      'stale',
    ]);
    expect(entriesOfAuthor(entries, 'Анна')[0]).toEqual(entries[0]);
  });

  it('uses the same identity as edit rights, so one pair of strings has one answer (A99)', () => {
    const entries = [
      entryWith({ id: 'trailing', authorName: 'Я ' }),
      entryWith({ id: 'case', authorName: 'я' }),
      entryWith({ id: 'blank', authorName: '   ' }),
    ];

    expect(entriesOfAuthor(entries, 'Я').map((entry: Entry) => entry.id)).toEqual(['trailing']);
    for (const entry of entries) {
      const inProjection = entriesOfAuthor([entry], 'Я').length === 1;
      expect(inProjection).toBe(canEdit(entry, 'Я'));
    }
  });

  it('returns nothing for a current name the author rule refuses, so no entry is own', () => {
    expect(entriesOfAuthor([entryWith({ authorName: '' })], '')).toEqual([]);
    expect(entriesOfAuthor([entryWith({ authorName: '   ' })], '   ')).toEqual([]);
  });
});

describe('list helpers over Entry[] (AC5)', () => {
  it('sorts by creation order ascending without mutating the input', () => {
    const input = [
      entryWith({ id: 'c', createdAt: '2026-01-07T10:00:00.000Z' }),
      entryWith({ id: 'a', createdAt: '2026-01-05T10:00:00.000Z' }),
      entryWith({ id: 'b', createdAt: '2026-01-06T10:00:00.000Z' }),
    ];

    expect(sortByCreatedAtAsc(input).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect(sortByCreatedAtAsc([])).toEqual([]);
  });

  it('is stable for entries sharing one createdAt', () => {
    const same = '2026-01-05T10:00:00.000Z';
    const input = [
      entryWith({ id: 'first', createdAt: same }),
      entryWith({ id: 'second', createdAt: same }),
      entryWith({ id: 'third', createdAt: same }),
    ];

    expect(sortByCreatedAtAsc(input).map((entry) => entry.id)).toEqual(['first', 'second', 'third']);
  });

  it('removes one entry by id and keeps every other entry in place', () => {
    const input = [entryWith({ id: 'x' }), entryWith({ id: 'y' }), entryWith({ id: 'z' })];

    expect(removeById(input, 'y').map((entry) => entry.id)).toEqual(['x', 'z']);
    expect(removeById(input, 'missing')).toHaveLength(3);
    expect(input).toHaveLength(3);
    expect(removeById(input, 'x')[0]).toBe(input[1]);
  });

  it('clears a page without touching another page and without mutating the input', () => {
    const otherPage = 'https://example.com/b';
    const pageList = [
      entryWith({ id: 'p1', pageKey: PAGE_KEY }),
      entryWith({ id: 'p2', pageKey: PAGE_KEY }),
    ];
    const mixed = [
      entryWith({ id: 'p1', pageKey: PAGE_KEY }),
      entryWith({ id: 'q1', pageKey: otherPage }),
      entryWith({ id: 'p2', pageKey: PAGE_KEY }),
    ];

    expect(clearPageEntries(pageList, PAGE_KEY)).toEqual([]);
    expect(clearPageEntries(mixed, PAGE_KEY).map((entry) => entry.id)).toEqual(['q1']);
    expect(clearPageEntries(mixed, otherPage).map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(clearPageEntries(mixed, 'https://example.com/c').map((entry) => entry.id)).toEqual([
      'p1',
      'q1',
      'p2',
    ]);
    expect(mixed.map((entry) => entry.id)).toEqual(['p1', 'q1', 'p2']);
  });
});

describe('purity of the task t1-04 core modules (AC1–AC5 constraints)', () => {
  const MODULES: readonly string[] = ['entry.ts', 'entry-rules.ts'];

  it('uses no DOM, no chrome.*, no clock, no randomness source of its own, no network', () => {
    for (const name of MODULES) {
      const code = coreSource(name);
      for (const forbidden of [
        'document',
        'window',
        'chrome.',
        'Date',
        'Math.random',
        'crypto',
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
      ]) {
        expect(code).not.toContain(forbidden);
      }
    }
  });

  it('uses no any, no type-system escape hatch and no framework import', () => {
    for (const name of MODULES) {
      const code = coreSource(name);
      expect(code).not.toMatch(/\bany\b/);
      expect(code).not.toContain('@ts-ignore');
      expect(code).not.toContain('@ts-expect-error');
      expect(code).not.toContain('@angular/');
      expect(code).not.toContain('preact');

      const imported = code.match(/from\s+'([^']+)'/g) ?? [];
      for (const specifier of imported) {
        expect(specifier).toMatch(/from\s+'\.\//);
      }
    }
  });

  it('returns machine codes instead of user-visible text', () => {
    for (const name of MODULES) {
      expect(coreSource(name)).not.toMatch(/[^\x00-\x7F]/);
    }
  });
});
