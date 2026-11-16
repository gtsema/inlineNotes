import { describe, expect, it } from 'vitest';

import {
  ENTRY_KEY_PREFIX,
  SETTINGS_KEY,
  entryStorageKey,
  pageKeyFromStorageKey,
} from '../src/core/storage-keys';

/**
 * Smoke test of the pure core layer: `src/core/` runs in plain Node with no DOM
 * and no `chrome.*`, and the storage key layout of
 * `docs/specs/inline-comment-model.md` holds.
 */
describe('core storage keys', () => {
  it('uses the documented key layout', () => {
    expect(ENTRY_KEY_PREFIX).toBe('notes:v1:');
    expect(SETTINGS_KEY).toBe('settings:v1');
  });

  it('builds one key per page', () => {
    expect(entryStorageKey('https://example.com/a')).toBe('notes:v1:https://example.com/a');
  });

  it('trims surrounding whitespace before composing the key', () => {
    expect(entryStorageKey('  https://example.com/a  ')).toBe('notes:v1:https://example.com/a');
  });

  it('refuses an empty page key', () => {
    expect(() => entryStorageKey('')).toThrow('pageKey must not be empty');
    expect(() => entryStorageKey('   ')).toThrow('pageKey must not be empty');
  });

  it('reads the page key back out of a storage key', () => {
    const key = entryStorageKey('https://example.com/a?b=2');
    expect(pageKeyFromStorageKey(key)).toBe('https://example.com/a?b=2');
  });

  it('returns null for keys that are not entry lists', () => {
    expect(pageKeyFromStorageKey(SETTINGS_KEY)).toBeNull();
    expect(pageKeyFromStorageKey(ENTRY_KEY_PREFIX)).toBeNull();
    expect(pageKeyFromStorageKey('notes:v2:https://example.com/a')).toBeNull();
  });
});
