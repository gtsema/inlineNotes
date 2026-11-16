import { describe, expect, it } from 'vitest';

import type { EntryAnchor } from '../src/core/entry';
import { ANCHOR_CONTEXT_CODE_POINTS, buildAnchor } from '../src/core/anchor-build';
import type { BuildAnchorOptions } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import { decodeEntry } from '../src/core/entry-store-read';
import { resolveAnchor } from '../src/core/anchor-resolve';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { storedEntry } from './support/memory-storage-port';

/**
 * Building an anchor from the normalized page text stream of task `t2-01` (AC2).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchoring", "Anchor window". The window is the part that disambiguates repeated
 * text, so its length, its boundaries and the absence of padding are all asserted.
 */

/** A short stream, so the expected window can be written out literally. */
const SMALL = 'abc def GHI jkl mno';

/** A realistic article stream: normalized, with one repeated sentence. */
const PAGE = [
  'Введение к статье.',
  'The quick brown fox jumps over the lazy dog.',
  'Повтор: the quick brown fox jumps over the lazy dog, но уже в другом абзаце.',
  'Последний абзац.',
].join(' ');

const DEFAULT_OPTIONS: BuildAnchorOptions = { fragments: 1 };

/** Code-point offset where the `occurrence`-th copy of `needle` begins. */
function offsetOf(stream: string, needle: string, occurrence: number = 0): number {
  let utf16 = -1;
  for (let seen = 0; seen <= occurrence; seen += 1) {
    utf16 = stream.indexOf(needle, utf16 + 1);
    if (utf16 < 0) {
      throw new Error(`no occurrence ${seen} of "${needle}"`);
    }
  }
  return codePointOffsetAt(stream, utf16);
}

/** Anchor of the `occurrence`-th copy of `needle`, asserted to be buildable. */
function anchorOf(
  stream: string,
  needle: string,
  occurrence: number = 0,
  options: BuildAnchorOptions = DEFAULT_OPTIONS,
): EntryAnchor {
  const start = offsetOf(stream, needle, occurrence);
  const anchor = buildAnchor(stream, start, start + codePointLength(needle), options);
  if (anchor === null) {
    throw new Error(`buildAnchor refused a range the stream does contain: "${needle}"`);
  }
  return anchor;
}

describe('buildAnchor emits the anchor contract (AC2)', () => {
  it('normalizes the selection text and takes the window from the same stream', () => {
    const anchor = anchorOf(SMALL, 'GHI', 0, { fragments: 1, contextWindow: 3 });

    expect(anchor.text).toBe('GHI');
    expect(anchor.prefix).toBe('ef ');
    expect(anchor.suffix).toBe(' jk');
    expect(anchor.fragmentCount).toBe(1);
  });

  it('keeps the space that separates the window from the selection', () => {
    const anchor = anchorOf(SMALL, 'GHI');

    expect(anchor.prefix.endsWith(' ')).toBe(true);
    expect(anchor.suffix.startsWith(' ')).toBe(true);
    expect(SMALL).toContain(anchor.prefix + anchor.text + anchor.suffix);
  });

  it('defaults the window to 40 code points and honours a smaller one', () => {
    const anchor = anchorOf(PAGE, 'lazy dog', 0);
    const narrow = anchorOf(PAGE, 'lazy dog', 0, { fragments: 1, contextWindow: 5 });

    expect(ANCHOR_CONTEXT_CODE_POINTS).toBe(40);
    expect(codePointLength(anchor.prefix)).toBe(40);
    expect(codePointLength(anchor.suffix)).toBe(40);
    expect(codePointLength(narrow.prefix)).toBe(5);
    expect(codePointLength(narrow.suffix)).toBe(5);
    expect(narrow.prefix).toBe(' the ');
    expect(narrow.suffix).toBe('. Пов');
  });

  it('measures the window in code points, not UTF-16 units', () => {
    const stream = `${'😀'.repeat(30)} needle here`;
    const anchor = anchorOf(stream, 'needle', 0, { fragments: 1, contextWindow: 8 });

    expect(anchor.prefix).toBe(`${'😀'.repeat(7)} `);
    expect(anchor.suffix).toBe(' here');
    expect(codePointLength(anchor.prefix)).toBe(8);
  });

  it('keeps an astral character inside the selection whole', () => {
    const stream = 'перед выбор «😀🧪» после выбора';
    const anchor = anchorOf(stream, '😀🧪');

    expect(anchor.text).toBe('😀🧪');
    expect(anchor.prefix).toBe('перед выбор «');
    expect(anchor.suffix).toBe('» после выбора');
    expect(resolveAnchor(stream, anchor)).toEqual({
      ok: true,
      start: offsetOf(stream, '😀🧪'),
      end: offsetOf(stream, '😀🧪') + 2,
    });
  });

  it('a selection at the start or the end of the stream gets a shorter window', () => {
    const atStart = anchorOf(SMALL, 'abc');
    const atEnd = anchorOf(SMALL, 'mno');

    expect(atStart.prefix).toBe('');
    expect(atStart.suffix).toBe(' def GHI jkl mno');
    expect(atEnd.prefix).toBe('abc def GHI jkl ');
    expect(atEnd.suffix).toBe('');
  });

  it('never pads a window that the stream cannot supply', () => {
    const anchor = anchorOf(SMALL, 'GHI', 0, { fragments: 1, contextWindow: 40 });

    expect(anchor.prefix).toBe('abc def ');
    expect(anchor.suffix).toBe(' jkl mno');
    expect(codePointLength(anchor.prefix)).toBeLessThan(40);
    expect(codePointLength(anchor.suffix)).toBeLessThan(40);
  });

  it('contextWindow 0 stores the text with no window at all', () => {
    const anchor = anchorOf(SMALL, 'GHI', 0, { fragments: 1, contextWindow: 0 });

    expect(anchor.prefix).toBe('');
    expect(anchor.suffix).toBe('');
    expect(anchor.text).toBe('GHI');
  });

  it('turns the fragment count into a non-negative integer hint', () => {
    const cases: [number, number][] = [
      [1, 1],
      [3, 3],
      [0, 0],
      [-4, 0],
      [2.7, 2],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
    ];

    for (const [fragments, expected] of cases) {
      expect(buildAnchor(SMALL, 8, 11, { fragments })).toEqual({
        text: 'GHI',
        prefix: 'abc def ',
        suffix: ' jkl mno',
        fragmentCount: expected,
      });
    }
  });

  it('emits an anchor the stored decode guard accepts exactly', () => {
    const anchors = [
      anchorOf(PAGE, 'lazy dog', 0),
      anchorOf(SMALL, 'abc'),
      anchorOf(SMALL, 'mno'),
      anchorOf(SMALL, 'GHI', 0, { fragments: 2, contextWindow: 3 }),
      anchorOf(`${'😀'.repeat(12)} иголка`, 'иголка', 0, { fragments: 7 }),
    ];

    for (const anchor of anchors) {
      const decoded = decodeEntry(storedEntry({ text: anchor.text, anchor }));
      if (decoded === null) {
        throw new Error(`the stored guard rejected an emitted anchor: ${JSON.stringify(anchor)}`);
      }
      expect(decoded.anchor).toEqual(anchor);
      expect(decoded.anchor.fragmentCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(decoded.anchor.fragmentCount)).toBe(true);
      expect(decoded.text).toBe(anchor.text);
    }
  });

  it('refuses a range the stream does not describe', () => {
    const total = codePointLength(SMALL);
    const rejected: [number, number][] = [
      [-1, 3],
      [0, -1],
      [8, 8],
      [11, 8],
      [0, total + 1],
      [8.5, 11],
      [Number.NaN, 11],
      [3, 4],
    ];

    for (const [start, end] of rejected) {
      expect(buildAnchor(SMALL, start, end, DEFAULT_OPTIONS)).toBeNull();
    }
    expect(buildAnchor(SMALL, 1, total + 1, DEFAULT_OPTIONS)).toBeNull();
  });

  it('a whitespace-only selection is not an anchor', () => {
    expect(buildAnchor(SMALL, 3, 4, DEFAULT_OPTIONS)).toBeNull();
    expect(buildAnchor('   ', 0, 3, DEFAULT_OPTIONS)).toBeNull();
  });

  it('normalizes a selection that carries edge whitespace', () => {
    const anchor = anchorOf(PAGE, ' lazy dog', 0);

    expect(anchor.text).toBe('lazy dog');
    expect(resolveAnchor(PAGE, anchor)).toEqual({
      ok: true,
      start: offsetOf(PAGE, 'lazy dog'),
      end: offsetOf(PAGE, 'lazy dog') + codePointLength('lazy dog'),
    });
  });

  it('a repeated sentence keeps the window of the occurrence it was built on', () => {
    const first = anchorOf(PAGE, 'lazy dog', 0);
    const second = anchorOf(PAGE, 'lazy dog', 1);

    expect(first.text).toBe(second.text);
    expect(first.prefix).not.toBe(second.prefix);
    expect(resolveAnchor(PAGE, second)).toEqual({
      ok: true,
      start: offsetOf(PAGE, 'lazy dog', 1),
      end: offsetOf(PAGE, 'lazy dog', 1) + codePointLength('lazy dog'),
    });
  });
});
