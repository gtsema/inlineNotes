import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  TRACKING_PARAM_NAMES,
  TRACKING_PARAM_PREFIXES,
  findPageKey,
  isTrackingParam,
  pageKeyFromUrl,
  pathOnlyKey,
  pathOnlyOfStoredKey,
} from '../src/core/page-key';
import { ENTRY_KEY_PREFIX, entryStorageKey, pageKeyFromStorageKey } from '../src/core/storage-keys';

/**
 * `pageKey` normalization and the loss-proof lookup of task `t1-02`.
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

    const storageKeys = [`${ENTRY_KEY_PREFIX}${savedPageKey ?? ''}`, 'settings:v1'];
    const foundPageKey = findPageKey('https://example.com/a?utm_source=y&fbclid=1', storageKeys);

    expect(foundPageKey).toBe('https://example.com/a');
    expect(entryStorageKey(foundPageKey ?? '')).toBe(storageKeys[0] ?? '');
  });

  it('accepts stored page keys as well as whole storage keys', () => {
    const storageKey = entryStorageKey('https://example.com/a?lang=ru');
    const storedPageKeys = [pageKeyFromStorageKey(storageKey) ?? ''];
    expect(findPageKey('https://example.com/a?utm_source=y', storedPageKeys)).toBe(
      'https://example.com/a?lang=ru',
    );
    expect(findPageKey('https://example.com/a?utm_source=y', [storageKey])).toBe(
      'https://example.com/a?lang=ru',
    );
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
    expect(pathOnlyOfStoredKey('https://example.com/a?lang=ru')).toBe('https://example.com/a');
    expect(pathOnlyOfStoredKey('https://example.com/a#x')).toBe('https://example.com/a');
    expect(pathOnlyOfStoredKey('settings:v1')).toBe('settings:v1');
  });
});

describe('findPageKey (AC3)', () => {
  it('prefers an exact normalized match over a path-only candidate', () => {
    const storedKeys = ['https://example.com/a?lang=en', 'https://example.com/a'];
    expect(findPageKey('https://example.com/a', storedKeys)).toBe('https://example.com/a');
  });

  it('falls back to origin + pathname when a kept parameter appears or disappears', () => {
    const storedKeys = ['https://example.com/a?lang=ru'];
    expect(findPageKey('https://example.com/a', storedKeys)).toBe('https://example.com/a?lang=ru');
    expect(findPageKey('https://example.com/a?utm_source=y', storedKeys)).toBe(
      'https://example.com/a?lang=ru',
    );
    expect(findPageKey('https://example.com/a?lang=ru#sec', storedKeys)).toBe(
      'https://example.com/a?lang=ru',
    );
  });

  it('returns the matching stored key unchanged, so a page never forks into two lists', () => {
    const storedKeys = ['https://example.com/Article?Lang=ru'];
    const found = findPageKey('https://example.com/article?utm_source=x', storedKeys);
    expect(found).toBe('https://example.com/Article?Lang=ru');
    expect(entryStorageKey(found ?? '')).toBe('notes:v1:https://example.com/Article?Lang=ru');
  });

  it('returns the stored key verbatim even when the caller passed storage keys', () => {
    const storageKey = entryStorageKey('https://example.com/Article?Lang=ru');
    const found = findPageKey('https://example.com/article?utm_source=x', [storageKey]);
    expect(found).toBe('https://example.com/Article?Lang=ru');
  });

  it('takes the first path-only match in the given order, deterministically', () => {
    const storedKeys = ['https://example.com/a?lang=en', 'https://example.com/a?lang=ru'];
    const first = findPageKey('https://example.com/a?x=1', storedKeys);
    expect(first).toBe('https://example.com/a?lang=en');
    expect(findPageKey('https://example.com/a?x=2', storedKeys)).toBe(first);
    expect(findPageKey('https://example.com/a?x=1', [...storedKeys].reverse())).toBe(
      'https://example.com/a?lang=ru',
    );
  });

  it('never matches another path or another origin', () => {
    expect(findPageKey('https://example.com/a', ['https://example.com/ab'])).toBeNull();
    expect(findPageKey('https://example.com/a/b', ['https://example.com/a'])).toBeNull();
    expect(findPageKey('https://example.com/a', ['http://example.com/a'])).toBeNull();
  });

  it('survives unrelated storage keys and an empty list', () => {
    expect(findPageKey('https://example.com/a', ['settings:v1', 'notes:v2:x'])).toBeNull();
    expect(findPageKey('https://example.com/a', [])).toBeNull();
  });

  it('returns null for an unparsable URL', () => {
    expect(findPageKey('not a url', ['https://example.com/a'])).toBeNull();
  });

  it('is deterministic: the same input gives the same key twice', () => {
    const url = 'https://example.com/A?b=2&a=1&utm_source=x#h';
    expect(pageKeyFromUrl(url)).toBe(pageKeyFromUrl(url));
    expect(findPageKey(url, ['https://example.com/a?a=1&b=2'])).toBe(
      findPageKey(url, ['https://example.com/a?a=1&b=2']),
    );
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
