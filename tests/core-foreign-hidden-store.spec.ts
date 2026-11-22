import { describe, expect, it } from 'vitest';

import {
  emptyForeignHiddenValue,
  loadHiddenAuthorsOfPage,
  setForeignAuthorHidden,
} from '../src/core/foreign-hidden-store';
import { MemoryStoragePort } from './support/memory-storage-port';
import { FOREIGN_HIDDEN_KEY } from '../src/core/storage-keys';

/**
 * The `foreign-hidden:v1` record (ruling `A184`, task `t18-01`).
 *
 * Rule owner: `docs/specs/sync-integration.md`
 * (Rules / Semantics -> "The hidden author flag survives a reload").
 *
 * The four claims the ruling makes about the record itself:
 *
 * - a read never throws and answers `[]` for an absent page, a malformed value and
 *   a failed read;
 * - a write is one guarded read and one write of the whole record, so no other
 *   page's flags are dropped; a malformed record is overwritten, not preserved;
 * - `hidden: true` adds a name (deduplicated), `hidden: false` removes it, and
 *   removing a name that is not stored writes nothing;
 * - a write failure propagates to the caller, and the page is what swallows it.
 */

function record(pages: Record<string, string[]>): unknown {
  return { version: 1, pages };
}

describe('loadHiddenAuthorsOfPage (AC19, AC20)', () => {
  it('answers [] for a missing record, a missing page and a malformed record', async () => {
    const port = new MemoryStoragePort();
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([]);

    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/b': ['Вася'] }));
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([]);

    port.seed(FOREIGN_HIDDEN_KEY, { version: 2, pages: 'nope' });
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([]);

    port.seed(FOREIGN_HIDDEN_KEY, { version: 1, pages: { 'https://example.com/a': [42, ''] } });
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([]);
  });

  it('answers a failed read with [] instead of a throw (A184, A164 posture)', async () => {
    const port = new MemoryStoragePort();
    port.failReadOn(FOREIGN_HIDDEN_KEY, 'unavailable');
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([]);
  });

  it('answers the stored names of the page verbatim', async () => {
    const port = new MemoryStoragePort();
    port.seed(
      FOREIGN_HIDDEN_KEY,
      record({
        'https://example.com/a': ['Вася', 'Петя'],
        'https://example.com/b': ['Соня'],
      }),
    );
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/a')).resolves.toEqual([
      'Вася',
      'Петя',
    ]);
    await expect(loadHiddenAuthorsOfPage(port, 'https://example.com/b')).resolves.toEqual(['Соня']);
  });
});

describe('setForeignAuthorHidden (AC19, AC20, AC21)', () => {
  it('adds a name over a missing record and names no other page', async () => {
    const port = new MemoryStoragePort();
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: true,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Вася'] }),
    );
  });

  it('keeps every other page of the record (the guarded read)', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/b': ['Соня'] }));
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: true,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/b': ['Соня'], 'https://example.com/a': ['Вася'] }),
    );
  });

  it('deduplicates a name that is already hidden', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/a': ['Вася'] }));
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: true,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Вася'] }),
    );
  });

  it('removes a name and drops the page entry when the list empties', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/a': ['Вася', 'Петя'] }));
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: false,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Петя'] }),
    );

    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Петя',
      hidden: false,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(record({}));
  });

  it('removing a name that is not stored writes nothing', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/a': ['Вася'] }));
    const setsBefore = port.calls.filter((call) => call.op !== 'get').length;
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Петя',
      hidden: false,
    });
    expect(port.calls.filter((call) => call.op !== 'get').length).toBe(setsBefore);
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Вася'] }),
    );
  });

  it('overwrites a malformed record instead of preserving it (AC20)', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, 'not a record');
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: true,
    });
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Вася'] }),
    );
  });

  it('propagates a write failure to the caller, and the page swallows it (AC20)', async () => {
    const port = new MemoryStoragePort();
    port.failWriteOn(FOREIGN_HIDDEN_KEY, 'quota');
    await expect(
      setForeignAuthorHidden(port, {
        pageKey: 'https://example.com/a',
        authorName: 'Вася',
        hidden: true,
      }),
    ).rejects.toThrow();
  });

  it('a failed guarded read still writes, built over the empty record (A164 posture)', async () => {
    const port = new MemoryStoragePort();
    port.seed(FOREIGN_HIDDEN_KEY, record({ 'https://example.com/b': ['Соня'] }));
    port.failReadOn(FOREIGN_HIDDEN_KEY, 'unavailable');
    await setForeignAuthorHidden(port, {
      pageKey: 'https://example.com/a',
      authorName: 'Вася',
      hidden: true,
    });
    // The unreadable record is replaced, not lost behind a forever-failing write:
    // the flags are a shadow of the memory, never a ledger.
    expect(port.snapshot()[FOREIGN_HIDDEN_KEY]).toEqual(
      record({ 'https://example.com/a': ['Вася'] }),
    );
  });
});

describe('emptyForeignHiddenValue', () => {
  it('is the every-author-visible record', () => {
    expect(emptyForeignHiddenValue()).toEqual({ version: 1, pages: {} });
  });
});
