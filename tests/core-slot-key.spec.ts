import { describe, expect, it } from 'vitest';

import {
  SLOT_KEY_ESCAPE_BUDGET,
  SLOT_KEY_HASH_LENGTH,
  SLOT_KEY_HASH_SEPARATOR,
  SLOT_KEY_MAX_LENGTH,
  SLOT_KEY_TRUNCATED_PREFIX,
  fnv1a32,
  isSlotKey,
  slotKeyFor,
  slotKeyHash,
} from '../src/core/slot-key';

/**
 * Slot key encoding and length rule of task `t1-03` (AC1, AC2).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Slot key encoding".
 */

/** Page keys whose escaped form fits the escape budget. */
const SHORT_PAGE_KEYS: readonly string[] = [
  'https://example.com/a',
  'https://example.com/a?b=2&lang=ru',
  'https://example.com/a.b"c\\d',
  'https://example.com/a%2Fb',
  'https://example.com/ärzel?tag=b&tag=a',
  'https://example.com/📝/x',
  "https://example.com/a~b*c!d(e)'s",
  'http://localhost:4200/article//draft/',
];

/** Characters a `chrome.storage.local` key may not carry (decision `A7`). */
const FORBIDDEN_KEY_CHARACTERS: readonly string[] = ['.', '/', '\\', '"'];

describe('slotKeyFor alphabet and reversibility (AC1)', () => {
  it('uses only [A-Za-z0-9_%-] and escapes everything else as uppercase %XX', () => {
    for (const pageKey of SHORT_PAGE_KEYS) {
      const slot = slotKeyFor(pageKey);
      expect(slot).toMatch(/^[A-Za-z0-9_%-]+$/);
      expect(isSlotKey(slot)).toBe(true);
      for (const escapeMatch of slot.match(/%[0-9A-Fa-f]{2}/g) ?? []) {
        expect(escapeMatch).toBe(escapeMatch.toUpperCase());
      }
    }
  });

  it('produces no character that is illegal in a storage key', () => {
    for (const pageKey of SHORT_PAGE_KEYS) {
      const slot = slotKeyFor(pageKey);
      for (const forbidden of FORBIDDEN_KEY_CHARACTERS) {
        expect(slot.includes(forbidden)).toBe(false);
      }
    }
  });

  it('round-trips through decodeURIComponent, including a literal %2F page key', () => {
    for (const pageKey of SHORT_PAGE_KEYS) {
      expect(decodeURIComponent(slotKeyFor(pageKey))).toBe(pageKey);
    }
    expect(slotKeyFor('https://example.com/a%2Fb')).toContain('%252F');
  });

  it('never emits the truncation separator, so a page key cannot forge it', () => {
    const slot = slotKeyFor('https://example.com/a~b');
    expect(slot.includes(SLOT_KEY_HASH_SEPARATOR)).toBe(false);
    expect(slot).toContain('%7E');
    expect(slot.split(SLOT_KEY_HASH_SEPARATOR)).toHaveLength(1);
  });

  it('is pure and deterministic', () => {
    for (const pageKey of SHORT_PAGE_KEYS) {
      expect(slotKeyFor(pageKey)).toBe(slotKeyFor(pageKey));
    }
    expect(slotKeyFor('  https://example.com/a  ')).toBe(slotKeyFor('https://example.com/a'));
  });

  it('refuses an empty page key', () => {
    expect(() => slotKeyFor('')).toThrow('pageKey must not be empty');
    expect(() => slotKeyFor('   ')).toThrow('pageKey must not be empty');
  });

  it('keeps distinct pages in distinct slots', () => {
    const slots = new Set(
      [
        'https://example.com/a',
        'https://example.com/a?b=2',
        'https://example.com/ab',
        'https://example.com/a?q=1',
      ].map((pageKey) => slotKeyFor(pageKey)),
    );
    expect(slots.size).toBe(4);
  });
});

describe('isSlotKey shape (AC1)', () => {
  it('accepts an escaped slot key and a truncated one', () => {
    expect(isSlotKey(slotKeyFor('https://example.com/a?b=2'))).toBe(true);
    expect(isSlotKey(slotKeyFor(`https://example.com/${'a'.repeat(2000)}`))).toBe(true);
    expect(isSlotKey('a')).toBe(true);
  });

  it('rejects a slot key with a character the escape never emits', () => {
    for (const value of ['https://example.com/a', 'notes:v1', 'a b', 'a~b', 'a~12', 'a~ABCDEF']) {
      expect(isSlotKey(value)).toBe(false);
    }
  });

  it('rejects an empty slot key and one over the escape budget', () => {
    expect(isSlotKey('')).toBe(false);
    expect(isSlotKey('a'.repeat(SLOT_KEY_ESCAPE_BUDGET))).toBe(true);
    expect(isSlotKey('a'.repeat(SLOT_KEY_ESCAPE_BUDGET + 1))).toBe(false);
  });
});

describe('slotKeyFor length rule (AC2)', () => {
  const BASE = 'https://example.com/x';
  const baseSlotLength = slotKeyFor(BASE).length;

  function pageKeyWithEscapedLength(target: number): string {
    return `${BASE}${'a'.repeat(target - baseSlotLength)}`;
  }

  it('keeps an escaped key that fits the budget whole and reversible', () => {
    const pageKey = pageKeyWithEscapedLength(SLOT_KEY_ESCAPE_BUDGET);
    const slot = slotKeyFor(pageKey);
    expect(slot).toHaveLength(SLOT_KEY_ESCAPE_BUDGET);
    expect(decodeURIComponent(slot)).toBe(pageKey);
  });

  it('truncates plus hashes one character over the budget', () => {
    const pageKey = pageKeyWithEscapedLength(SLOT_KEY_ESCAPE_BUDGET + 1);
    const slot = slotKeyFor(pageKey);
    expect(slot).toHaveLength(SLOT_KEY_MAX_LENGTH);
    expect(slot.startsWith(slotKeyFor(BASE))).toBe(true);
    expect(decodeURIComponent(slot)).not.toBe(pageKey);
  });

  it('builds a truncated key as prefix + separator + padded base36 hash', () => {
    const pageKey = `https://example.com/${'a'.repeat(2000)}`;
    const slot = slotKeyFor(pageKey);

    expect(isSlotKey(slot)).toBe(true);
    expect(slot).toMatch(/^[A-Za-z0-9_%-]+~[0-9a-z]{7}$/);
    expect(slot.slice(0, SLOT_KEY_TRUNCATED_PREFIX)).toMatch(/^[A-Za-z0-9_%-]+$/);
    expect(slot).toHaveLength(SLOT_KEY_MAX_LENGTH);
    expect(slot).toBe(
      `${slot.slice(0, SLOT_KEY_TRUNCATED_PREFIX)}${SLOT_KEY_HASH_SEPARATOR}${slotKeyHash(pageKey)}`,
    );
    expect(slot.split(SLOT_KEY_HASH_SEPARATOR)).toHaveLength(2);
    expect(slot.slice(SLOT_KEY_TRUNCATED_PREFIX)).toBe(
      `${SLOT_KEY_HASH_SEPARATOR}${slotKeyHash(pageKey)}`,
    );
    expect(slotKeyHash(pageKey)).toMatch(new RegExp(`^[0-9a-z]{${SLOT_KEY_HASH_LENGTH}}$`));
  });

  it('separates long page keys that share the escaped prefix', () => {
    const shared = `https://example.com/${'a'.repeat(400)}`;
    const first = slotKeyFor(`${shared}1`);
    const second = slotKeyFor(`${shared}2`);

    expect(first.slice(0, SLOT_KEY_TRUNCATED_PREFIX)).toBe(
      second.slice(0, SLOT_KEY_TRUNCATED_PREFIX),
    );
    expect(first).not.toBe(second);
    expect(first).toHaveLength(SLOT_KEY_MAX_LENGTH);
  });

  it('is deterministic for a truncated key', () => {
    const pageKey = `https://example.com/${'b'.repeat(1200)}`;
    expect(slotKeyFor(pageKey)).toBe(slotKeyFor(pageKey));
    expect(slotKeyHash(pageKey)).toBe(slotKeyHash(pageKey));
  });
});

describe('fnv1a32 and slotKeyHash (AC2)', () => {
  it('matches the published FNV-1a 32-bit vectors', () => {
    expect(fnv1a32('').toString(16)).toBe('811c9dc5');
    expect(fnv1a32('a').toString(16)).toBe('e40c292c');
    expect(fnv1a32('foobar').toString(16)).toBe('bf9cf968');
  });

  it('stays inside 32 bits for a long input', () => {
    const hash = fnv1a32(`https://example.com/${'z'.repeat(5000)}`);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it('pads the base36 hash to a fixed width', () => {
    for (const pageKey of ['a', 'https://example.com/a', 'https://example.com/ä?b=1']) {
      expect(slotKeyHash(pageKey)).toBe(
        fnv1a32(pageKey).toString(36).padStart(SLOT_KEY_HASH_LENGTH, '0'),
      );
      expect(slotKeyHash(pageKey)).toHaveLength(SLOT_KEY_HASH_LENGTH);
    }
  });
});
