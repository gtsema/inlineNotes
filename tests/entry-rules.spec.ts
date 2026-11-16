import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Entry } from '../src/core/entry';
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
  generateAuthorName,
  isSameAuthor,
  randomId,
  removeById,
  sortByCreatedAtAsc,
  validateAuthorName,
  validateComment,
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

  it('checks the rules in the spec order (name, comment, cap)', () => {
    const attempts = [
      { entries: entriesForPage(20), comment: '   ', currentName: '' },
      { entries: entriesForPage(20), comment: '   ', currentName: 'Анна' },
      { entries: entriesForPage(20), comment: 'a'.repeat(257), currentName: 'Анна' },
    ];

    expect(assertCreatable(attempts[0])).toBe('name_required');
    expect(assertCreatable(attempts[1])).toBe('comment_empty');
    expect(assertCreatable(attempts[2])).toBe('comment_too_long');
  });

  it('accepts a well-formed creation attempt below the cap', () => {
    expect(assertCreatable({ entries: entriesForPage(0), comment: 'заметка', currentName: 'Анна' })).toBeNull();
    expect(assertCreatable({ entries: entriesForPage(19), comment: '😀'.repeat(256), currentName: ' Анна ' }))
      .toBeNull();
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
