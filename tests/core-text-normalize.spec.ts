import { describe, expect, it } from 'vitest';

import { codePointLength } from '../src/core/entry-rules';
import {
  codePointOffsetAt,
  headCodePoints,
  isNormalizedText,
  normalizeText,
  sliceCodePoints,
  tailCodePoints,
  utf16IndexAt,
} from '../src/core/text-normalize';

/**
 * Normalized page text of task `t2-01` (AC1).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Terms / Aliases
 * ("normalized text stream") and Rules / Semantics -> "Anchoring",
 * "Normalized text". The anchor stage is only deterministic if this module is a
 * pure function of the string, so every property below is asserted, not assumed.
 */

/** Every whitespace form the contract has to collapse: ASCII, Unicode spaces, BOM. */
const WHITESPACE_FORMS = [
  ' ',
  '\t',
  '\n',
  '\r',
  '\f',
  '\v',
  '\u00a0', // no-break space
  '\u1680', // ogham space mark
  '\u2000',
  '\u2009', // thin space
  '\u200a',
  '\u2028', // line separator
  '\u2029', // paragraph separator
  '\u202f', // narrow no-break space
  '\u205f', // medium mathematical space
  '\u3000', // ideographic space
  '\ufeff', // byte-order mark
];

/** Samples that must survive normalization character for character. */
const SAMPLES = [
  'The quick brown fox.',
  'абв ГДЕ — обычный абзац статьи.',
  '😀 emoji and \u00a0 Cyrillic mixed',
  'a  b\t\tc\nd',
  '',
  '   ',
  '\u00a0\u2028',
  'no-whitespace-here',
];

/** Removes every whitespace code point, so only the payload is compared. */
function withoutWhitespace(value: string): string {
  return value.replaceAll(/\s/g, '');
}

describe('normalizeText collapses whitespace (AC1)', () => {
  it('collapses a run of every whitespace form into one U+0020', () => {
    for (const form of WHITESPACE_FORMS) {
      const once = normalizeText(`a${form}b`);
      const many = normalizeText(`a${form}${form}  ${form}b`);
      expect(once).toBe('a b');
      expect(many).toBe('a b');
      expect(once.charCodeAt(1)).toBe(0x20);
    }
  });

  it('collapses a mixed run that joins spaces, tabs and newlines', () => {
    expect(normalizeText('абзац  \n\t\u00a0  продолжение')).toBe('абзац продолжение');
    expect(normalizeText('a \u2028 \u2029 b')).toBe('a b');
  });

  it('leaves a code point outside the closed enumeration untouched, so the set is closed (R1)', () => {
    // U+0085 (NEL) is `White_Space` in Unicode data and is a line break in some
    // legacy encodings, but it is not one of the forms `WHITESPACE_RUN` matches, so
    // it survives normalization character for character and stays trim-safe.
    expect(normalizeText('a\u0085b')).toBe('a\u0085b');
    expect(normalizeText('a  \u0085  b')).toBe('a \u0085 b');
    expect(normalizeText('\u0085a\u0085')).toBe('\u0085a\u0085');
    expect(isNormalizedText('a\u0085b')).toBe(true);

    // U+200B (zero width space) is the other near-miss: not collapsed, not trimmed.
    expect(normalizeText('a\u200bb')).toBe('a\u200bb');
    expect(isNormalizedText('a\u200bb')).toBe(true);

    // The line and paragraph separators are collapsed, and they are line breaks,
    // not space separators: one code point of the stream, never a kept character.
    expect(normalizeText('a\u2028b')).toBe('a b');
    expect(normalizeText('a\u2029b')).toBe('a b');
  });

  it('trims the ends and gives an empty string for a whitespace-only value', () => {
    expect(normalizeText('  \t x \u00a0 \n')).toBe('x');
    expect(normalizeText('\u00a0\u2028   ')).toBe('');
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('is idempotent and deterministic over every sample', () => {
    for (const sample of SAMPLES) {
      const once = normalizeText(sample);
      expect(normalizeText(once)).toBe(once);
      expect(normalizeText(sample)).toBe(once);
    }
  });

  it('never reorders, adds or removes a non-whitespace character', () => {
    for (const sample of SAMPLES) {
      expect(withoutWhitespace(normalizeText(sample))).toBe(withoutWhitespace(sample));
    }
    expect(normalizeText('абв  ГДЕ')).toBe('абв ГДЕ');
    expect(normalizeText('Б A')).toBe('Б A');
    expect(normalizeText('😀 😀')).toBe('😀 😀');
  });

  it('keeps punctuation and case untouched, so the window stays verbatim', () => {
    expect(normalizeText('«цель» — (фрагмент), текст.')).toBe('«цель» — (фрагмент), текст.');
    expect(normalizeText('MiXeD CaSe 123 %40')).toBe('MiXeD CaSe 123 %40');
  });

  it('measures in code points, so an astral character counts once', () => {
    const normalized = normalizeText('😀  😀\t😀');
    expect(codePointLength(normalized)).toBe(5);
    expect(normalized).toBe('😀 😀 😀');
  });
});

describe('isNormalizedText is the guard behind ruling A26 (AC1, AC5)', () => {
  it('accepts a value that already has the normalized shape', () => {
    for (const value of ['a b', 'абв', '😀 😀', '', 'x']) {
      expect(isNormalizedText(value)).toBe(true);
    }
  });

  it('rejects a value the content layer did not normalize', () => {
    for (const value of [' a', 'a ', 'a  b', 'a\u00a0b', 'a\nb', 'a\tb', '\u00a0']) {
      expect(isNormalizedText(value)).toBe(false);
    }
  });

  it('agrees with normalizeText on every sample', () => {
    for (const sample of SAMPLES) {
      expect(isNormalizedText(sample)).toBe(sample === normalizeText(sample));
    }
  });
});

describe('code-point offsets, not UTF-16 units (AC1, AC2, AC3)', () => {
  const STREAM = '😀ab😀c';

  it('converts a code-point offset into the UTF-16 index of that code point', () => {
    expect(utf16IndexAt(STREAM, 0)).toBe(0);
    expect(utf16IndexAt(STREAM, 1)).toBe(2);
    expect(utf16IndexAt(STREAM, 3)).toBe(4);
    expect(utf16IndexAt(STREAM, 4)).toBe(6);
  });

  it('clamps an offset outside the string instead of failing', () => {
    expect(utf16IndexAt(STREAM, -3)).toBe(0);
    expect(utf16IndexAt(STREAM, Number.NaN)).toBe(0);
    expect(utf16IndexAt(STREAM, 99)).toBe(STREAM.length);
  });

  it('converts a UTF-16 index back into a code-point offset', () => {
    expect(codePointOffsetAt(STREAM, 0)).toBe(0);
    expect(codePointOffsetAt(STREAM, 2)).toBe(1);
    expect(codePointOffsetAt(STREAM, 4)).toBe(3);
    expect(codePointOffsetAt(STREAM, STREAM.length)).toBe(5);
    expect(codePointOffsetAt(STREAM, -1)).toBe(0);
    expect(codePointOffsetAt(STREAM, 99)).toBe(5);
  });

  it('slices between code-point offsets, keeping a surrogate pair whole', () => {
    expect(sliceCodePoints(STREAM, 0, 1)).toBe('😀');
    expect(sliceCodePoints(STREAM, 1, 3)).toBe('ab');
    expect(sliceCodePoints(STREAM, 3, 4)).toBe('😀');
    expect(sliceCodePoints(STREAM, 0, 5)).toBe(STREAM);
    expect(sliceCodePoints(STREAM, 2, 1)).toBe('');
    expect(sliceCodePoints(STREAM, -5, 99)).toBe(STREAM);
  });

  it('takes the head and the tail of a stream in code points', () => {
    expect(headCodePoints(STREAM, 1)).toBe('😀');
    expect(headCodePoints(STREAM, 2)).toBe('😀a');
    expect(headCodePoints(STREAM, 0)).toBe('');
    expect(headCodePoints(STREAM, -1)).toBe('');
    expect(headCodePoints(STREAM, 99)).toBe(STREAM);
    expect(tailCodePoints(STREAM, 1)).toBe('c');
    expect(tailCodePoints(STREAM, 2)).toBe('😀c');
    expect(tailCodePoints(STREAM, 0)).toBe('');
    expect(tailCodePoints(STREAM, 99)).toBe(STREAM);
  });

  it('treats an unpaired surrogate half as one unit, so a damaged string is total', () => {
    const damaged = '\ud800x';
    expect(sliceCodePoints(damaged, 0, 1)).toBe('\ud800');
    expect(codePointOffsetAt(damaged, 2)).toBe(2);
    expect(tailCodePoints(damaged, 1)).toBe('x');
  });
});
