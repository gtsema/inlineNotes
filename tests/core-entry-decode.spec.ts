import { describe, expect, it } from 'vitest';

import {
  ISO_UTC_TIMESTAMP_PATTERN,
  decodeEntry,
  entryListFromStorageValue,
  isEntry,
} from '../src/core/entry-store-read';
import { storedEntry } from './support/memory-storage-port';

/**
 * The decode guard of task `t1-05` (AC3).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Decode on read". Whatever the storage area returns is untrusted: only a record
 * that passes here may reach `canEdit` or the list helpers.
 */

/** Contract fields of `Entry`: nothing else may survive a decode. */
const ENTRY_FIELDS: readonly string[] = [
  'id',
  'pageKey',
  'authorName',
  'text',
  'comment',
  'anchor',
  'visible',
  'createdAt',
  'updatedAt',
];

describe('the optional stored title (A190 of all-notes-page.md)', () => {
  it('keeps a non-empty string title and drops everything else', () => {
    const withTitle = decodeEntry(storedEntry({ title: 'Статья про якоря' }));
    expect(withTitle?.title).toBe('Статья про якоря');

    // An old-shape record carries no field at all.
    expect(decodeEntry(storedEntry())?.title).toBeUndefined();
    // Anything that is not a non-empty string is dropped, never guessed.
    expect(decodeEntry(storedEntry({ title: '' }))?.title).toBeUndefined();
    expect(decodeEntry(storedEntry({ title: 42 }))?.title).toBeUndefined();
    // Unknown fields are already dropped by the guard; the title joins that rule.
    const record = storedEntry({ title: 'Статья' }) as Record<string, unknown>;
    expect(decodeEntry({ ...record, extra: 'x' })?.title).toBe('Статья');
  });
});

describe('decodeEntry accepts the stored shape (AC3)', () => {
  it('decodes a complete record unchanged', () => {
    const entry = decodeEntry(storedEntry());
    expect(entry).not.toBeNull();
    expect(entry?.id).toBe('a1b2c3d4e5f6');
    expect(entry?.anchor).toEqual({
      text: 'selected text',
      prefix: '',
      suffix: '',
      fragmentCount: 1,
    });
  });

  it('ignores unknown fields (AC3)', () => {
    const entry = decodeEntry(storedEntry({ extra: 'from another layout', visible: false }));
    expect(entry).not.toBeNull();
    expect(Object.keys(entry ?? {}).sort()).toEqual([...ENTRY_FIELDS].sort());
    expect(entry?.visible).toBe(false);
  });

  it('defaults a missing visible to true (ruling A1)', () => {
    const { visible, ...withoutVisible } = storedEntry();
    expect(visible).toBe(true);
    expect(withoutVisible['visible']).toBeUndefined();
    expect(decodeEntry(withoutVisible)?.visible).toBe(true);

    const explicitlyUndefined = storedEntry({ visible: undefined });
    expect(explicitlyUndefined['visible']).toBeUndefined();
    expect(decodeEntry(explicitlyUndefined)?.visible).toBe(true);
  });

  it('keeps a stored visible of false', () => {
    expect(decodeEntry(storedEntry({ visible: false }))?.visible).toBe(false);
  });

  it('accepts a stamp with and without milliseconds (ruling A9)', () => {
    expect(ISO_UTC_TIMESTAMP_PATTERN.test('2026-01-02T03:04:05Z')).toBe(true);
    expect(ISO_UTC_TIMESTAMP_PATTERN.test('2026-01-02T03:04:05.006Z')).toBe(true);
    expect(decodeEntry(storedEntry({ createdAt: '2026-01-02T03:04:05Z' }))?.createdAt).toBe(
      '2026-01-02T03:04:05Z',
    );
  });
});

describe('decodeEntry rejects a foreign-shaped record (AC3)', () => {
  it('rejects values that are not objects', () => {
    for (const value of [null, undefined, 'entry', 7, [], [storedEntry()]]) {
      expect(decodeEntry(value)).toBeNull();
    }
  });

  it('rejects a missing, empty or wrongly typed identity field', () => {
    for (const overrides of [
      { id: undefined },
      { id: '' },
      { id: 42 },
      { pageKey: undefined },
      { pageKey: '' },
      { pageKey: {} },
    ]) {
      expect(decodeEntry(storedEntry(overrides))).toBeNull();
    }
  });

  it('rejects a text field that is not a string', () => {
    for (const overrides of [
      { authorName: undefined },
      { authorName: 12 },
      { text: undefined },
      { comment: undefined },
      { comment: ['list'] },
    ]) {
      expect(decodeEntry(storedEntry(overrides))).toBeNull();
    }
  });

  it('rejects an anchor that does not follow the contract', () => {
    for (const overrides of [
      { anchor: undefined },
      { anchor: 'selected text' },
      { anchor: { text: 't', prefix: '', suffix: '' } },
      { anchor: { text: 1, prefix: '', suffix: '', fragmentCount: 1 } },
      { anchor: { text: 't', prefix: '', suffix: '', fragmentCount: -1 } },
      { anchor: { text: 't', prefix: '', suffix: '', fragmentCount: 1.5 } },
      { anchor: { text: 't', prefix: '', suffix: '', fragmentCount: '1' } },
    ]) {
      expect(decodeEntry(storedEntry(overrides))).toBeNull();
    }
  });

  it('rejects a timestamp that is not a UTC ISO-8601 Z stamp (ruling A9)', () => {
    for (const overrides of [
      { createdAt: undefined },
      { createdAt: '2026-01-02' },
      { createdAt: '2026-01-02T03:04:05' },
      { createdAt: '2026-01-02T03:04:05+03:00' },
      { createdAt: '1767322445000' },
      { updatedAt: 'yesterday' },
    ]) {
      expect(decodeEntry(storedEntry(overrides))).toBeNull();
    }
  });

  it('never mutates the value it decoded', () => {
    const stored = storedEntry({ visible: undefined });
    const entry = decodeEntry(stored);
    if (entry !== null) {
      entry.comment = 'changed by the caller';
      entry.anchor.prefix = 'changed';
    }
    expect(stored['comment']).toBe('my note');
    expect(stored['anchor']).toEqual({
      text: 'selected text',
      prefix: '',
      suffix: '',
      fragmentCount: 1,
    });
  });
});

describe('isEntry (AC3)', () => {
  it('accepts a complete record and one with unknown fields', () => {
    expect(isEntry(storedEntry())).toBe(true);
    expect(isEntry(storedEntry({ futureField: 1 }))).toBe(true);
  });

  it('rejects a record without a visible flag, which is decodable but not an Entry', () => {
    const { visible, ...withoutVisible } = storedEntry();
    expect(visible).toBe(true);
    expect(isEntry(withoutVisible)).toBe(false);
    expect(decodeEntry(withoutVisible)).not.toBeNull();
  });

  it('rejects a malformed record', () => {
    expect(isEntry(storedEntry({ createdAt: 'nope' }))).toBe(false);
    expect(isEntry(null)).toBe(false);
    expect(isEntry('entry')).toBe(false);
  });
});

describe('entryListFromStorageValue (AC3)', () => {
  it('reads a missing slot as an empty page without a code', () => {
    for (const value of [undefined, null]) {
      expect(entryListFromStorageValue(value)).toEqual({
        entries: [],
        corruptCount: 0,
        codes: [],
      });
    }
  });

  it('reads the stored slot shape', () => {
    const decoded = entryListFromStorageValue({
      version: 1,
      entries: [storedEntry(), storedEntry({ id: 'f6e5d4c3b2a1' })],
    });
    expect(decoded.entries.map((entry) => entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'f6e5d4c3b2a1',
    ]);
    expect(decoded.corruptCount).toBe(0);
    expect(decoded.codes).toEqual([]);
  });

  it('reports a foreign slot version as an empty page plus layout_version', () => {
    for (const version of [0, 2, '1', undefined]) {
      expect(entryListFromStorageValue({ version, entries: [storedEntry()] })).toEqual({
        entries: [],
        corruptCount: 0,
        codes: ['layout_version'],
      });
    }
  });

  it('reports a value that is not a slot object', () => {
    for (const value of ['note', 12, [storedEntry()], { version: 1 }]) {
      expect(entryListFromStorageValue(value).codes).toEqual(['slot_malformed']);
    }
  });

  it('skips a malformed record, counts it and keeps the good ones in order (AC3)', () => {
    const decoded = entryListFromStorageValue({
      version: 1,
      entries: [
        storedEntry(),
        { id: 'half-built' },
        null,
        storedEntry({ id: 'f6e5d4c3b2a1' }),
      ],
    });
    expect(decoded.entries.map((entry) => entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'f6e5d4c3b2a1',
    ]);
    expect(decoded.corruptCount).toBe(2);
    expect(decoded.codes).toEqual(['entry_malformed']);
  });

  it('reads an empty list as an empty page without a code', () => {
    expect(entryListFromStorageValue({ version: 1, entries: [] })).toEqual({
      entries: [],
      corruptCount: 0,
      codes: [],
    });
  });
});
