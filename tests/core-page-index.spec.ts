import { describe, expect, it } from 'vitest';

import {
  addToIndex,
  emptyPageIndex,
  removeFromIndex,
  resolvePageKey,
} from '../src/core/page-index';
import type { PageIndex } from '../src/core/page-index';
import { PAGE_INDEX_KEY, entryStorageKey } from '../src/core/storage-keys';

/**
 * The `pages:v1` index of task `t1-03` (AC4), including the oldest-variant
 * fallback of PM ruling `A4`.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Page index".
 */

function index(...pageKeys: string[]): PageIndex {
  return { version: 1, pageKeys };
}

describe('PAGE_INDEX_KEY (AC4)', () => {
  it('is the documented single index key', () => {
    expect(PAGE_INDEX_KEY).toBe('pages:v1');
    expect(entryStorageKey('https://example.com/a')).not.toBe(PAGE_INDEX_KEY);
  });
});

describe('addToIndex (AC4)', () => {
  it('appends an unknown page key and keeps insertion order', () => {
    let current = emptyPageIndex();
    expect(current).toEqual({ version: 1, pageKeys: [] });

    current = addToIndex(current, 'https://example.com/a');
    current = addToIndex(current, 'https://example.com/b');
    expect(current.pageKeys).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('leaves the order untouched for a page key that is already indexed', () => {
    const current = index('https://example.com/a?lang=ru', 'https://example.com/b');
    const next = addToIndex(current, 'https://example.com/a?lang=ru');
    expect(next.pageKeys).toEqual(['https://example.com/a?lang=ru', 'https://example.com/b']);
  });

  it('is pure: the input index is never mutated', () => {
    const current = index('https://example.com/a');
    const next = addToIndex(current, 'https://example.com/b');
    expect(current.pageKeys).toEqual(['https://example.com/a']);
    expect(next.pageKeys).not.toBe(current.pageKeys);
  });

  it('trims the page key and refuses an empty one', () => {
    expect(addToIndex(emptyPageIndex(), '  https://example.com/a  ').pageKeys).toEqual([
      'https://example.com/a',
    ]);
    expect(() => addToIndex(emptyPageIndex(), '')).toThrow('pageKey must not be empty');
    expect(() => addToIndex(emptyPageIndex(), '   ')).toThrow('pageKey must not be empty');
  });
});

describe('removeFromIndex (AC4)', () => {
  it('drops one page key and keeps the order of the rest', () => {
    const next = removeFromIndex(
      index('https://example.com/a', 'https://example.com/b', 'https://example.com/c'),
      'https://example.com/b',
    );
    expect(next.pageKeys).toEqual(['https://example.com/a', 'https://example.com/c']);
  });

  it('is a no-op for an unindexed page key and stays pure', () => {
    const current = index('https://example.com/a');
    const next = removeFromIndex(current, 'https://example.com/zzz');
    expect(next.pageKeys).toEqual(['https://example.com/a']);
    expect(current.pageKeys).toEqual(['https://example.com/a']);
  });

  it('is deterministic under repetition', () => {
    const once = removeFromIndex(index('https://example.com/a', 'https://example.com/b'), 'a');
    const twice = removeFromIndex(once, 'a');
    expect(twice.pageKeys).toEqual(once.pageKeys);
  });
});

describe('resolvePageKey (AC4, ruling A4)', () => {
  it('prefers an exact normalized match over a path-only candidate', () => {
    const stored = index('https://example.com/a?lang=en', 'https://example.com/a');
    expect(resolvePageKey('https://example.com/a', stored)).toBe('https://example.com/a');
  });

  it('falls back to origin + pathname when a kept parameter appears or disappears', () => {
    const stored = index('https://example.com/a?lang=ru');
    expect(resolvePageKey('https://example.com/a', stored)).toBe('https://example.com/a?lang=ru');
    expect(resolvePageKey('https://example.com/a?utm_source=y', stored)).toBe(
      'https://example.com/a?lang=ru',
    );
    expect(resolvePageKey('https://example.com/a?lang=ru#sec', stored)).toBe(
      'https://example.com/a?lang=ru',
    );
  });

  it('takes the oldest variant by index order, not the order of a storage read', () => {
    const older = index('https://example.com/a?lang=en', 'https://example.com/a?lang=ru');
    const newer = index('https://example.com/a?lang=ru', 'https://example.com/a?lang=en');
    expect(resolvePageKey('https://example.com/a?x=1', older)).toBe(
      'https://example.com/a?lang=en',
    );
    expect(resolvePageKey('https://example.com/a?x=2', newer)).toBe(
      'https://example.com/a?lang=ru',
    );
  });

  it('keeps an existing slot when the page is opened again', () => {
    let stored = emptyPageIndex();
    const savedPageKey = 'https://example.com/Article?Lang=ru';
    stored = addToIndex(stored, savedPageKey);

    const found = resolvePageKey('https://example.com/article?utm_source=x', stored);
    expect(found).toBe(savedPageKey);
    expect(entryStorageKey(found ?? '')).toBe(entryStorageKey(savedPageKey));

    stored = addToIndex(stored, found ?? '');
    expect(stored.pageKeys).toEqual([savedPageKey]);
  });

  it('matches a trailing-slash URL against an indexed key without the slash', () => {
    const stored = index('https://example.com/a');
    expect(resolvePageKey('https://example.com/a/', stored)).toBe('https://example.com/a');
    expect(resolvePageKey('https://example.com/a//', stored)).toBe('https://example.com/a');
  });

  it('never matches another path or another origin', () => {
    expect(resolvePageKey('https://example.com/a', index('https://example.com/ab'))).toBeNull();
    expect(resolvePageKey('https://example.com/a/b', index('https://example.com/a'))).toBeNull();
    expect(resolvePageKey('https://example.com/a', index('http://example.com/a'))).toBeNull();
  });

  it('returns null for an empty index and for an unparsable URL', () => {
    expect(resolvePageKey('https://example.com/a', emptyPageIndex())).toBeNull();
    expect(resolvePageKey('not a url', index('https://example.com/a'))).toBeNull();
    expect(resolvePageKey('', index('https://example.com/a'))).toBeNull();
  });

  it('is deterministic: the same input resolves to the same key twice', () => {
    const url = 'https://example.com/A?b=2&a=1&utm_source=x#h';
    const stored = index('https://example.com/a?a=1&b=2');
    expect(resolvePageKey(url, stored)).toBe(resolvePageKey(url, stored));
  });
});
