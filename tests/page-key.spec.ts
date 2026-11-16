import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  TRACKING_PARAM_NAMES,
  TRACKING_PARAM_PREFIXES,
  isTrackingParam,
  pageKeyFromUrl,
  pathOnlyKey,
  pathOnlyOfPageKey,
} from '../src/core/page-key';
import { addToIndex, emptyPageIndex, resolvePageKey } from '../src/core/page-index';
import type { PageIndex } from '../src/core/page-index';
import {
  ENTRY_KEY_PREFIX,
  SETTINGS_KEY,
  entryStorageKey,
  isEntryStorageKey,
  slotKeyFromStorageKey,
} from '../src/core/storage-keys';

/**
 * `pageKey` normalization and the loss-proof lookup of task `t1-02`, re-cut for
 * the slot-key layout of task `t1-03`: the lookup runs over the `pages:v1` index
 * (`resolvePageKey`), never over storage-key text.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "`pageKey` normalization"; the acceptance mirror is that spec's AC4.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Query parameters the model spec lists as tracking noise (one per name). */
const NOISE_PARAMS: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'gclid',
  'gsas',
  'fbclid',
  '_ga',
  '_gl',
  '_hs',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'igshid',
  's_kwcid',
];

/** Strips comments so the purity checks look at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function pageKeySource(): string {
  return codeOnly(readFileSync(join(projectRoot, 'src', 'core', 'page-key.ts'), 'utf8'));
}

/** Index of page keys in insertion order (the order rule of PM ruling `A4`). */
function index(...pageKeys: string[]): PageIndex {
  return { version: 1, pageKeys };
}

describe('pageKeyFromUrl (AC1)', () => {
  it('keeps origin + pathname and drops the hash', () => {
    expect(pageKeyFromUrl('https://example.com/a#sec')).toBe('https://example.com/a');
    expect(pageKeyFromUrl('https://example.com/a?b=2#frag')).toBe('https://example.com/a?b=2');
    expect(pageKeyFromUrl('https://example.com')).toBe('https://example.com/');
  });

  it('lowercases the origin and the path', () => {
    expect(pageKeyFromUrl('HTTPS://Example.COM/Articles/Post#S')).toBe(
      'https://example.com/articles/post',
    );
    expect(pageKeyFromUrl('https://example.com/A/B?Page=2')).toBe(
      'https://example.com/a/b?Page=2',
    );
  });

  it('drops every noise parameter listed by the model spec', () => {
    for (const name of NOISE_PARAMS) {
      expect(pageKeyFromUrl(`https://example.com/a?${name}=1`)).toBe('https://example.com/a');
      expect(isTrackingParam(name)).toBe(true);
    }
    expect(pageKeyFromUrl('https://example.com/a?utm_source=x&fbclid=1&mc_cid=2')).toBe(
      'https://example.com/a',
    );
  });

  it('keeps the remaining parameters and sorts them by name', () => {
    expect(pageKeyFromUrl('https://example.com/a?b=2&a=1&utm_source=x')).toBe(
      'https://example.com/a?a=1&b=2',
    );
    expect(pageKeyFromUrl('https://example.com/a?page=3&id=7&lang=ru')).toBe(
      'https://example.com/a?id=7&lang=ru&page=3',
    );
  });

  it('keeps parameters that only look like noise', () => {
    expect(
      pageKeyFromUrl('https://example.com/a?reference=1&refresh=2&_gab=3&mcc=4&refs=5&_ga_x=6'),
    ).toBe('https://example.com/a?_ga_x=6&_gab=3&mcc=4&reference=1&refresh=2&refs=5');
  });

  it('matches noise names case-insensitively and keeps the name of a kept parameter', () => {
    expect(pageKeyFromUrl('https://example.com/a?UTM_SOURCE=x&GCLID=1&page=2')).toBe(
      'https://example.com/a?page=2',
    );
    expect(pageKeyFromUrl('https://example.com/a?Lang=ru&page=2')).toBe(
      'https://example.com/a?Lang=ru&page=2',
    );
  });

  it('normalizes query encoding so an equal query gives an equal key', () => {
    expect(pageKeyFromUrl('https://example.com/a?q=a%20b')).toBe(
      pageKeyFromUrl('https://example.com/a?q=a+b'),
    );
    expect(pageKeyFromUrl('https://example.com/a?q=a+b')).toBe('https://example.com/a?q=a+b');
  });

  it('is stable for repeated parameters and idempotent for its own result', () => {
    expect(pageKeyFromUrl('https://example.com/a?tag=b&tag=a')).toBe(
      'https://example.com/a?tag=b&tag=a',
    );
    const once = pageKeyFromUrl('https://example.com/a?b=2&a=1&utm_source=x#h');
    expect(once).not.toBeNull();
    expect(pageKeyFromUrl(once ?? '')).toBe(once);
  });

  it('trims the input and returns null for an empty or unparsable URL', () => {
    expect(pageKeyFromUrl('   https://example.com/a?b=1   ')).toBe('https://example.com/a?b=1');
    expect(pageKeyFromUrl('')).toBeNull();
    expect(pageKeyFromUrl('   ')).toBeNull();
    expect(pageKeyFromUrl('example.com/a')).toBeNull();
  });

  it('uses the noise vocabulary of the model spec verbatim', () => {
    expect(TRACKING_PARAM_PREFIXES).toEqual(['utm_', 'mc_']);
    expect([...TRACKING_PARAM_NAMES].sort()).toEqual(
      ['_ga', '_gl', '_hs', 'fbclid', 'gclid', 'gsas', 'igshid', 'ref', 'ref_src', 's_kwcid'].sort(),
    );
  });
});

describe('model spec AC4 (AC2)', () => {
  it('finds an entry stored for ?utm_source=x#sec on ?utm_source=y&fbclid=1', () => {
    const savedPageKey = pageKeyFromUrl('https://example.com/a?utm_source=x#sec');
    expect(savedPageKey).toBe('https://example.com/a');

    const stored = addToIndex(emptyPageIndex(), savedPageKey ?? '');
    const foundPageKey = resolvePageKey('https://example.com/a?utm_source=y&fbclid=1', stored);

    expect(foundPageKey).toBe('https://example.com/a');
    expect(entryStorageKey(foundPageKey ?? '')).toBe(entryStorageKey(savedPageKey ?? ''));
  });

  it('reads a stored page back from its slot: slot -> page key -> same slot', () => {
    const storageKey = entryStorageKey('https://example.com/a?lang=ru');
    const slot = slotKeyFromStorageKey(storageKey);
    expect(slot).not.toBeNull();

    const stored = addToIndex(emptyPageIndex(), decodeURIComponent(slot ?? ''));
    expect(resolvePageKey('https://example.com/a?utm_source=y', stored)).toBe(
      'https://example.com/a?lang=ru',
    );
    expect(entryStorageKey('https://example.com/a?lang=ru')).toBe(storageKey);
  });
});

describe('pathOnlyKey (AC3)', () => {
  it('ignores the query and the hash and lowercases the path', () => {
    expect(pathOnlyKey('https://example.com/A/B?b=2#x')).toBe('https://example.com/a/b');
    expect(pathOnlyKey('https://example.com/a?utm_source=x')).toBe('https://example.com/a');
  });

  it('keeps a non-default port', () => {
    expect(pathOnlyKey('http://localhost:4200/Article')).toBe('http://localhost:4200/article');
  });

  it('returns null for an empty or unparsable URL', () => {
    expect(pathOnlyKey('')).toBeNull();
    expect(pathOnlyKey('/relative/a')).toBeNull();
  });

  it('derives the same path-only form from a stored page key', () => {
    expect(pathOnlyOfPageKey('https://example.com/a?lang=ru')).toBe('https://example.com/a');
    expect(pathOnlyOfPageKey('https://example.com/a#x')).toBe('https://example.com/a');
    expect(pathOnlyOfPageKey('https://example.com/Article?Lang=ru')).toBe(
      'https://example.com/article',
    );
    expect(pathOnlyOfPageKey('https://example.com/a//')).toBe('https://example.com/a');
    expect(pathOnlyOfPageKey('settings:v1')).toBe('settings:v1');
  });
});

describe('trailing-slash identity (AC5, ruling A8)', () => {
  it('treats /a, /a/ and /a// as one page', () => {
    const base = pageKeyFromUrl('https://example.com/a');
    expect(base).toBe('https://example.com/a');
    expect(pageKeyFromUrl('https://example.com/a/')).toBe(base);
    expect(pageKeyFromUrl('https://example.com/a//')).toBe(base);
    expect(pageKeyFromUrl('https://example.com/a/?lang=ru')).toBe('https://example.com/a?lang=ru');
    expect(pathOnlyKey('https://example.com/a/')).toBe('https://example.com/a');
    expect(pathOnlyKey('https://example.com/a//')).toBe('https://example.com/a');
  });

  it('keeps the site root as its own page', () => {
    expect(pageKeyFromUrl('https://example.com')).toBe('https://example.com/');
    expect(pageKeyFromUrl('https://example.com/')).toBe('https://example.com/');
    expect(pageKeyFromUrl('https://example.com//')).toBe('https://example.com/');
    expect(pathOnlyKey('https://example.com/')).toBe('https://example.com/');
  });

  it('does not collapse a nested path onto its parent', () => {
    expect(pageKeyFromUrl('https://example.com/a/b/')).toBe('https://example.com/a/b');
    expect(pageKeyFromUrl('https://example.com/a/b')).not.toBe('https://example.com/a');
  });

  it('leaves an index.html suffix alone (reviewer note R7)', () => {
    expect(pageKeyFromUrl('https://example.com/a/index.html')).toBe(
      'https://example.com/a/index.html',
    );
    expect(pageKeyFromUrl('https://example.com/a/index.html')).not.toBe(
      pageKeyFromUrl('https://example.com/a/'),
    );
  });
});

describe('resolvePageKey (AC3, index-backed)', () => {
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

  it('returns the matching stored key unchanged, so a page never forks into two lists', () => {
    const stored = index('https://example.com/Article?Lang=ru');
    const found = resolvePageKey('https://example.com/article?utm_source=x', stored);
    expect(found).toBe('https://example.com/Article?Lang=ru');
    expect(entryStorageKey(found ?? '')).toBe(
      'notes:v1:https%3A%2F%2Fexample%2Ecom%2FArticle%3FLang%3Dru',
    );
  });

  it('resolves the same slot for a URL that only differs in noise parameters', () => {
    const stored = index('https://example.com/Article?Lang=ru');
    const found = resolvePageKey('https://example.com/article?utm_source=x', stored) ?? '';
    const storageKey = entryStorageKey(found);
    expect(storageKey).toBe(entryStorageKey(stored.pageKeys[0] ?? ''));
    expect(storageKey.startsWith(ENTRY_KEY_PREFIX)).toBe(true);
    expect(isEntryStorageKey(storageKey)).toBe(true);
    expect(slotKeyFromStorageKey(storageKey)).toBe(storageKey.slice(ENTRY_KEY_PREFIX.length));
  });

  it('takes the oldest path-only match by index order, deterministically', () => {
    const olderFirst = index('https://example.com/a?lang=en', 'https://example.com/a?lang=ru');
    const newerFirst = index('https://example.com/a?lang=ru', 'https://example.com/a?lang=en');
    const first = resolvePageKey('https://example.com/a?x=1', olderFirst);
    expect(first).toBe('https://example.com/a?lang=en');
    expect(resolvePageKey('https://example.com/a?x=2', olderFirst)).toBe(first);
    expect(resolvePageKey('https://example.com/a?x=1', newerFirst)).toBe(
      'https://example.com/a?lang=ru',
    );
  });

  it('never matches another path or another origin', () => {
    expect(resolvePageKey('https://example.com/a', index('https://example.com/ab'))).toBeNull();
    expect(resolvePageKey('https://example.com/a/b', index('https://example.com/a'))).toBeNull();
    expect(resolvePageKey('https://example.com/a', index('http://example.com/a'))).toBeNull();
  });

  it('survives unrelated keys and an empty index', () => {
    expect(resolvePageKey('https://example.com/a', index('settings:v1', 'notes:v2:x'))).toBeNull();
    expect(resolvePageKey('https://example.com/a', emptyPageIndex())).toBeNull();
    expect(isEntryStorageKey(SETTINGS_KEY)).toBe(false);
    expect(isEntryStorageKey('notes:v2:x')).toBe(false);
    expect(isEntryStorageKey(entryStorageKey('https://example.com/a'))).toBe(true);
  });

  it('returns null for an unparsable URL', () => {
    expect(resolvePageKey('not a url', index('https://example.com/a'))).toBeNull();
  });

  it('is deterministic: the same input gives the same key twice', () => {
    const url = 'https://example.com/A?b=2&a=1&utm_source=x#h';
    const stored = index('https://example.com/a?a=1&b=2');
    expect(pageKeyFromUrl(url)).toBe(pageKeyFromUrl(url));
    expect(resolvePageKey(url, stored)).toBe(resolvePageKey(url, stored));
  });
});

describe('purity of src/core/page-key.ts (AC4)', () => {
  it('uses no DOM, no chrome.*, no clock, no randomness, no network', () => {
    const code = pageKeySource();
    for (const forbidden of [
      'document',
      'window',
      'chrome.',
      'Date',
      'Math.random',
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('uses no any, no type-system escape hatch and no framework import', () => {
    const code = pageKeySource();
    expect(code).not.toMatch(/\bany\b/);
    expect(code).not.toContain('@ts-ignore');
    expect(code).not.toContain('@ts-expect-error');
    expect(code).not.toContain('@angular/');
    expect(code).not.toContain('preact');

    // The module may only import sibling core modules: no framework, no runtime
    // dependency, nothing from `node:`.
    const imported = code.match(/from\s+'([^']+)'/g) ?? [];
    for (const specifier of imported) {
      expect(specifier).toMatch(/from\s+'\.\//);
    }
  });
});
