import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ENTRY_KEY_PREFIX,
  PAGE_INDEX_KEY,
  SETTINGS_KEY,
  entryStorageKey,
  isEntryStorageKey,
  slotKeyFromStorageKey,
  storageChangeConcernsPage,
} from '../src/core/storage-keys';
import { SLOT_KEY_ESCAPE_BUDGET, SLOT_KEY_MAX_LENGTH, slotKeyFor } from '../src/core/slot-key';

/**
 * Storage key layout of task `t1-03` (AC1', AC3'), plus the purity contract of
 * `src/core/`: the layer runs in plain Node with no DOM and no `chrome.*`.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Storage" (slot key encoding, page index).
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Characters a `chrome.storage` key is treated as illegal here (decision `A7`). */
const FORBIDDEN_KEY_CHARACTERS: readonly string[] = ['.', '/', '\\', '"'];

/** A realistic long article URL, kept parameters included. */
const REALISTIC_PAGE_KEY =
  'https://example.com/blog/2026/05/ochen-dlinnaya-zapish-o-tom-kak-razbiraetca-storage?lang=ru&page=2';

/** A page key carrying every character the layout must escape. */
const HOSTILE_PAGE_KEY = String.raw`https://example.com/a.b"c\d?tag=<x>&q=a b#h~e`;

/** Strips comments so the purity checks look at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function coreSource(relativePath: string): string {
  return codeOnly(readFileSync(join(projectRoot, 'src', 'core', relativePath), 'utf8'));
}

/** Every shipped source file under `src/`, for the invariant checks. */
function shippedSources(dir: string = 'src'): string[] {
  const absoluteDir = join(projectRoot, dir);
  const found: string[] = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const nested = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...shippedSources(nested));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    found.push(codeOnly(readFileSync(join(projectRoot, nested), 'utf8')));
  }
  return found;
}

describe('core storage keys', () => {
  it('uses the documented key layout', () => {
    expect(ENTRY_KEY_PREFIX).toBe('notes:v1:');
    expect(SETTINGS_KEY).toBe('settings:v1');
    expect(PAGE_INDEX_KEY).toBe('pages:v1');
  });

  it('builds one slot per page and never pastes the raw URL into a key', () => {
    expect(entryStorageKey('https://example.com/a')).toBe(
      'notes:v1:https%3A%2F%2Fexample%2Ecom%2Fa',
    );
    expect(entryStorageKey('https://example.com/a')).not.toContain('://');
    expect(entryStorageKey('https://example.com/a')).toBe(
      `${ENTRY_KEY_PREFIX}${slotKeyFor('https://example.com/a')}`,
    );
    expect(new Set(['https://example.com/a', 'https://example.com/ab'].map(entryStorageKey)).size).toBe(
      2,
    );
  });

  it('stays inside the slot-key budget for realistic and hostile page keys (AC3)', () => {
    for (const pageKey of [REALISTIC_PAGE_KEY, HOSTILE_PAGE_KEY]) {
      const storageKey = entryStorageKey(pageKey);
      // The universal bound of the spec is 246 escaped characters, not the 208 of
      // the truncated branch alone (review remark `R6`).
      expect(storageKey).toMatch(/^notes:v1:[A-Za-z0-9_%-]{1,246}$/);
      expect(storageKey.length).toBeLessThanOrEqual(ENTRY_KEY_PREFIX.length + SLOT_KEY_ESCAPE_BUDGET);
      expect(storageKey.length).toBeLessThan(256);
      for (const forbidden of FORBIDDEN_KEY_CHARACTERS) {
        expect(storageKey.includes(forbidden)).toBe(false);
      }
      expect(isEntryStorageKey(storageKey)).toBe(true);
    }
  });

  it('keeps the composed key strictly below 256 for every branch (finding N2)', () => {
    // The escape budget is the binding branch: 9 + 246 = 255, one character of
    // headroom below the defensive 256-character key limit.
    expect(ENTRY_KEY_PREFIX.length).toBe(9);
    expect(SLOT_KEY_ESCAPE_BUDGET).toBe(246);
    expect(ENTRY_KEY_PREFIX.length + SLOT_KEY_ESCAPE_BUDGET).toBeLessThan(256);
    expect(ENTRY_KEY_PREFIX.length + SLOT_KEY_MAX_LENGTH).toBeLessThan(256);

    const base = 'https://example.com/x';
    const atBudget = `${base}${'a'.repeat(SLOT_KEY_ESCAPE_BUDGET - slotKeyFor(base).length)}`;
    const overBudget = `https://example.com/${'a'.repeat(2000)}`;

    expect(entryStorageKey(atBudget)).toHaveLength(ENTRY_KEY_PREFIX.length + SLOT_KEY_ESCAPE_BUDGET);
    expect(entryStorageKey(overBudget)).toHaveLength(ENTRY_KEY_PREFIX.length + SLOT_KEY_MAX_LENGTH);
    for (const pageKey of [atBudget, overBudget]) {
      expect(entryStorageKey(pageKey).length).toBeLessThan(256);
    }
  });

  it('trims surrounding whitespace before composing the key', () => {
    expect(entryStorageKey('  https://example.com/a  ')).toBe(
      'notes:v1:https%3A%2F%2Fexample%2Ecom%2Fa',
    );
    expect(entryStorageKey('  https://example.com/a  ')).toBe(entryStorageKey('https://example.com/a'));
  });

  it('refuses an empty page key', () => {
    expect(() => entryStorageKey('')).toThrow('pageKey must not be empty');
    expect(() => entryStorageKey('   ')).toThrow('pageKey must not be empty');
  });

  it('reads the slot back out of a storage key and maps it to the same slot', () => {
    const key = entryStorageKey('https://example.com/a?b=2');
    const slot = slotKeyFromStorageKey(key);

    expect(isEntryStorageKey(key)).toBe(true);
    expect(slot).not.toBeNull();
    expect(decodeURIComponent(slot ?? '')).toBe('https://example.com/a?b=2');
    expect(entryStorageKey(decodeURIComponent(slot ?? ''))).toBe(key);
  });

  it('keeps an over-budget page key recognizable and inside the budget', () => {
    const pageKey = `https://example.com/${'a'.repeat(2000)}`;
    const key = entryStorageKey(pageKey);
    const slot = slotKeyFromStorageKey(key);

    expect(key).toHaveLength(ENTRY_KEY_PREFIX.length + SLOT_KEY_MAX_LENGTH);
    expect(isEntryStorageKey(key)).toBe(true);
    expect(slot).toBe(slotKeyFor(pageKey));
    expect(slot).toHaveLength(SLOT_KEY_MAX_LENGTH);
    expect(slot === null ? '' : decodeURIComponent(slot)).not.toBe(pageKey);
  });

  it('returns null for keys that are not entry lists', () => {
    expect(isEntryStorageKey(SETTINGS_KEY)).toBe(false);
    expect(isEntryStorageKey(PAGE_INDEX_KEY)).toBe(false);
    expect(isEntryStorageKey(ENTRY_KEY_PREFIX)).toBe(false);
    expect(isEntryStorageKey('notes:v2:https://example.com/a')).toBe(false);
    expect(isEntryStorageKey(`${ENTRY_KEY_PREFIX}https://example.com/a`)).toBe(false);

    expect(slotKeyFromStorageKey(SETTINGS_KEY)).toBeNull();
    expect(slotKeyFromStorageKey(PAGE_INDEX_KEY)).toBeNull();
    expect(slotKeyFromStorageKey(ENTRY_KEY_PREFIX)).toBeNull();
    expect(slotKeyFromStorageKey('notes:v2:https://example.com/a')).toBeNull();
  });
});

describe('which storage changes concern one page (task t4-03 AC2, AC3; ruling A60)', () => {
  const PAGE = 'https://example.com/a';
  const OTHER = 'https://example.com/b';

  it('counts the settings record whatever the page is', () => {
    expect(storageChangeConcernsPage(SETTINGS_KEY, PAGE)).toBe(true);
    expect(storageChangeConcernsPage(SETTINGS_KEY, null)).toBe(true);
    expect(storageChangeConcernsPage(SETTINGS_KEY, '')).toBe(true);
  });

  it('counts the entry slot of exactly that page key', () => {
    expect(storageChangeConcernsPage(entryStorageKey(PAGE), PAGE)).toBe(true);
    // The layout trims, so the key of the trimmed page key is the key of the page key.
    expect(storageChangeConcernsPage(entryStorageKey(PAGE), `  ${PAGE}  `)).toBe(true);
  });

  it('ignores another page slot, the page index and a key this extension does not own', () => {
    expect(storageChangeConcernsPage(entryStorageKey(OTHER), PAGE)).toBe(false);
    // Every write elsewhere touches the index, so the index cannot be the signal.
    expect(storageChangeConcernsPage(PAGE_INDEX_KEY, PAGE)).toBe(false);
    expect(storageChangeConcernsPage('some-page-script-key', PAGE)).toBe(false);
    expect(storageChangeConcernsPage(entryStorageKey(OTHER), null)).toBe(false);
  });

  it('refuses a near-miss slot instead of matching on a prefix', () => {
    const own = entryStorageKey(PAGE);
    expect(storageChangeConcernsPage(`${own}x`, PAGE)).toBe(false);
    expect(storageChangeConcernsPage(own.slice(0, own.length - 1), PAGE)).toBe(false);
    expect(storageChangeConcernsPage(ENTRY_KEY_PREFIX, PAGE)).toBe(false);
  });

  it('answers false for an empty page key instead of reaching the slot guard (the totality boundary)', () => {
    // `slotKeyFor` throws on an empty page key; the watch may be handed a pass that
    // resolved no page key, and a listener must not be a throw path.
    // The boundary of that guarantee is malformed input, and nothing is asserted for it
    // on purpose: a lone-surrogate `pageKey` still throws through `entryStorageKey` ->
    // `slotKeyFor` -> `escapeCodePoint`, which `slot-key.ts` declares out of scope. A
    // guard there would be a new core rule, not a wording fix.
    expect(storageChangeConcernsPage(entryStorageKey(PAGE), '')).toBe(false);
    expect(storageChangeConcernsPage(entryStorageKey(PAGE), '   ')).toBe(false);
    expect(storageChangeConcernsPage(entryStorageKey(PAGE), null)).toBe(false);
  });
});

describe('slot key decode invariant (finding N4)', () => {
  it('shipped code never decodes a slot key back to a page key', () => {
    const offenders = shippedSources().filter((code) => code.includes('decodeURIComponent'));
    expect(offenders).toEqual([]);
  });

  it('reversing a slot key is a test-only tool, and it works for the whole branch', () => {
    const slot = slotKeyFor('https://example.com/a?b=2');
    expect(decodeURIComponent(slot)).toBe('https://example.com/a?b=2');
  });
});

describe('purity of the task t1-03 core modules (AC1, AC4)', () => {
  const MODULES: readonly string[] = ['slot-key.ts', 'page-index.ts', 'storage-keys.ts'];

  it('uses no DOM, no chrome.*, no clock, no randomness, no network', () => {
    for (const name of MODULES) {
      const code = coreSource(name);
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
});
