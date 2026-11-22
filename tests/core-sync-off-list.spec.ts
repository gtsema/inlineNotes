import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_SYNC_OFF_READ,
  authorNamesOf,
  emptySyncOffList,
  isAuthorOff,
  loadOffAuthorNames,
  offListOfLoad,
  offListOfPage,
  saveOffAuthorNames,
  syncOffListFromStorageValue,
  syncOffListValueOf,
  uniqueAuthorNames,
  withAuthorOff,
} from '../src/core/sync-off-list';
import { SYNC_OFF_KEY } from '../src/core/storage-keys';
import { MemoryStoragePort } from './support/memory-storage-port';

/**
 * The off list of the foreign rows (Stage 17, task `t17-14`, rulings `A187`, `A188`).
 *
 * The subject is one record and one question: «is this author switched off on this
 * page?». Two properties are load-bearing and each has its own group here:
 *
 * - **it holds author names and nothing else** — no note text, no id, no anchor, no
 *   comment (`A163` unchanged: the note is never stored, only the reader's decision about
 *   a name);
 * - **it is defensive** — a damaged value is an empty list and never a throw, because a
 *   checkbox that survives a reload must not become a page that breaks on a bad byte.
 *
 * The port is the in-memory one, so "the record the store holds" is read back from a
 * snapshot rather than asserted against a comment.
 */

const PAGE_KEY = 'https://example.com/a';
const OTHER_PAGE = 'https://example.com/b';

/** A stored record, exactly as the extension writes it. */
function record(pages: Record<string, readonly string[]>): unknown {
  return { version: 1, pages: { ...pages } };
}

describe('AC1, AC7 the record is author names per page, and a damaged value is an empty list', () => {
  it('names the key the off list lives under, and the record has one shape', () => {
    expect(SYNC_OFF_KEY).toBe('sync-off:v1');
    expect(emptySyncOffList()).toEqual({ version: 1, pages: {} });
    // A page with no name on it is not in the record at all (`A187`).
    expect(syncOffListValueOf({ [PAGE_KEY]: [] })).toEqual({ version: 1, pages: {} });
    expect(syncOffListValueOf({ [PAGE_KEY]: ['Вася'] })).toEqual({
      version: 1,
      pages: { [PAGE_KEY]: ['Вася'] },
    });
  });

  it('keeps first-appearance order and drops duplicates', () => {
    expect(uniqueAuthorNames(['Вася', 'Петя', 'Вася ', 'Петя', '', '   ', 'Анна'])).toEqual([
      'Вася',
      'Петя',
      'Анна',
    ]);
  });

  it('reads a page\'s list, and answers an empty list for a page it does not name', () => {
    expect(offListOfPage(record({ [PAGE_KEY]: ['Вася'] }), PAGE_KEY)).toEqual({
      authorNames: ['Вася'],
      malformed: false,
    });
    expect(offListOfPage(record({ [PAGE_KEY]: ['Вася'] }), OTHER_PAGE)).toEqual(EMPTY_SYNC_OFF_READ);
    expect(offListOfPage(undefined, PAGE_KEY)).toEqual({ authorNames: [], malformed: true });
  });

  it('never throws on a value that is not the record', () => {
    for (const broken of [
      null,
      'sync-off',
      42,
      [],
      [PAGE_KEY],
      {},
      { version: 2, pages: {} },
      { version: 1 },
      { version: 1, pages: null },
      { version: 1, pages: [] },
      { version: 1, pages: { [PAGE_KEY]: 'Вася' } },
      { version: 1, pages: { [PAGE_KEY]: [42, null, { name: 'Вася' }] } },
      { version: 1, pages: { '': ['Вася'] } },
    ]) {
      const read = offListOfPage(broken, PAGE_KEY);
      expect(read.authorNames, JSON.stringify(broken)).toEqual([]);
      expect(read.malformed, JSON.stringify(broken)).toBe(true);
    }
  });

  it('keeps the readable half of a partly damaged record', () => {
    // One damaged page must not lose the reader's decisions on the other pages.
    const decoded = syncOffListFromStorageValue({
      version: 1,
      pages: { [PAGE_KEY]: ['Вася', 42], [OTHER_PAGE]: 'nope' },
    });

    expect(decoded.value.pages).toEqual({ [PAGE_KEY]: ['Вася'] });
    expect(decoded.malformed).toBe(true);
  });

  it('never throws and never writes when the port refuses the read', async () => {
    const port = new MemoryStoragePort();
    port.seed(SYNC_OFF_KEY, record({ [PAGE_KEY]: ['Вася'] }));
    port.failNextRead('unavailable');

    expect(await loadOffAuthorNames(port, PAGE_KEY)).toEqual({ authorNames: [], malformed: true });
    // The record read is a second `get`, so the injected failure is armed again: the write
    // path must answer a code rather than a value it did not store.
    port.failNextRead('unavailable');
    expect(
      await saveOffAuthorNames(port, PAGE_KEY, ['Петя']),
    ).toEqual({ ok: false, code: 'unavailable' });
    // The stored record is byte-identical: a merge over a record it could not read would
    // drop every other page's decision, so nothing is written at all.
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual(record({ [PAGE_KEY]: ['Вася'] }));
  });
});

describe('AC2 the record carries author names and no note (A163, A187)', () => {
  it('writes exactly one key, holding names under the page key', async () => {
    const port = new MemoryStoragePort();
    port.seed('pages:v1', { version: 1, pageKeys: [PAGE_KEY] });

    expect(await saveOffAuthorNames(port, PAGE_KEY, ['Вася'])).toEqual({
      ok: true,
      authorNames: ['Вася'],
    });

    const written = port.calls.filter((call) => call.op !== 'get');
    expect(written).toEqual([{ op: 'set', keys: [SYNC_OFF_KEY] }]);
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual(record({ [PAGE_KEY]: ['Вася'] }));
    // Everything the store held before is untouched: the off list is its own key.
    expect(port.snapshot()['pages:v1']).toEqual({ version: 1, pageKeys: [PAGE_KEY] });
  });

  it('writes nothing but the author name it was given, whatever the row held', async () => {
    // The write path takes names only. The scan of the module that composes the record is
    // the structural half of the claim: no field of a note is nameable there.
    const source = readFileSync(
      join(process.cwd(), 'src', 'core', 'sync-off-list.ts'),
      'utf8',
    )
      .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
      .replaceAll(/\/\/[^\n]*/g, ' ');
    for (const noteField of ['comment', 'anchor', 'createdAt', 'updatedAt', 'pageKey !==', 'text']) {
      expect(source, noteField).not.toContain(noteField);
    }

    const port = new MemoryStoragePort();
    await saveOffAuthorNames(port, PAGE_KEY, ['Вася']);
    const stored = JSON.stringify(port.snapshot()[SYNC_OFF_KEY]);
    expect(stored).toBe(JSON.stringify(record({ [PAGE_KEY]: ['Вася'] })));
    for (const forbidden of ['their note', 'selected text', 'their001', 'anchor', 'comment']) {
      expect(stored, forbidden).not.toContain(forbidden);
    }
  });
});

describe('AC1 a switch adds and removes an author; an empty list removes the page (A187)', () => {
  it('adds a name, removes it again, and removes the page when nothing is left', async () => {
    const port = new MemoryStoragePort();
    await saveOffAuthorNames(port, PAGE_KEY, ['Вася']);
    await saveOffAuthorNames(port, PAGE_KEY, ['Вася', 'Петя']);
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual(record({ [PAGE_KEY]: ['Вася', 'Петя'] }));

    await saveOffAuthorNames(port, PAGE_KEY, ['Петя']);
    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual(record({ [PAGE_KEY]: ['Петя'] }));

    // The last name leaves: the page is gone with it, and then the record itself is.
    await saveOffAuthorNames(port, PAGE_KEY, []);
    expect(SYNC_OFF_KEY in port.snapshot()).toBe(false);
    expect(port.calls.at(-1)).toEqual({ op: 'remove', keys: [SYNC_OFF_KEY] });
  });

  it('keeps another page\'s list when this page\'s list changes', async () => {
    const port = new MemoryStoragePort();
    await saveOffAuthorNames(port, OTHER_PAGE, ['Петя']);
    await saveOffAuthorNames(port, PAGE_KEY, ['Вася']);
    await saveOffAuthorNames(port, PAGE_KEY, []);

    expect(port.snapshot()[SYNC_OFF_KEY]).toEqual(record({ [OTHER_PAGE]: ['Петя'] }));
  });

  it('is idempotent: the same press twice writes the same list', () => {
    expect(withAuthorOff(['Вася'], 'Вася', true)).toEqual(['Вася']);
    expect(withAuthorOff(['Вася', 'Петя'], 'Вася', false)).toEqual(['Петя']);
    // A name the list does not carry is added once, trimmed, and never twice.
    expect(withAuthorOff([], ' Вася ', true)).toEqual(['Вася']);
    expect(isAuthorOff(['Вася'], 'Вася')).toBe(true);
    expect(isAuthorOff(['Вася'], 'Петя')).toBe(false);
  });

  it('reports a refused write without pretending the value was stored', async () => {
    const port = new MemoryStoragePort();
    port.failNextWrite('quota');

    expect(await saveOffAuthorNames(port, PAGE_KEY, ['Вася'])).toEqual({
      ok: false,
      code: 'quota',
    });
    expect(port.snapshot()[SYNC_OFF_KEY]).toBeUndefined();
  });
});

describe('AC6 the list follows the authors a load answered with (A188)', () => {
  it('drops a name the load did not return, and keeps the order of the answer', () => {
    const answered = ['Петя', 'Вася'];
    expect(offListOfLoad(['Вася', 'Ушедший'], answered)).toEqual(['Вася']);
    expect(offListOfLoad(['Вася', 'Петя'], answered)).toEqual(['Петя', 'Вася']);
    expect(offListOfLoad([], answered)).toEqual([]);
    expect(offListOfLoad(['Вася'], [])).toEqual([]);
  });

  it('reads the names of a load once each, in first-appearance order', () => {
    expect(
      authorNamesOf([
        { authorName: 'Вася' },
        { authorName: 'Вася' },
        { authorName: 'Анна' },
      ]),
    ).toEqual(['Вася', 'Анна']);
  });
});