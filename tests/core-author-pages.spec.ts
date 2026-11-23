import { describe, expect, it } from 'vitest';

import { authorPagesOf } from '../src/core/author-pages';
import { entryStorageKey, PAGE_INDEX_KEY } from '../src/core/storage-keys';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The author's pages across the store (`A191` of `all-notes-page.md`).
 *
 * Rule owner: `docs/specs/all-notes-page.md`
 * (Rules / Semantics -> "The author pages list").
 *
 * The four claims the ruling makes:
 *
 * - one row per page holding at least one own entry, with the own count, the newest
 *   `updatedAt` and the first non-empty stored title of the page's own entries;
 * - rows sorted by `latest`, fresh first;
 * - an index the read guard refuses answers `{ ok: false, code }`, and a missing
 *   `pages:v1` answers an empty list (the sweep's posture);
 * - a listed slot that cannot be read costs its own row, not the list.
 */

const PAGE_A = 'https://example.com/a';
const PAGE_B = 'https://example.com/b';

function entryOf(page: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return storedEntry({ pageKey: page, authorName: 'reader', ...overrides });
}

function portOf(values: Record<string, unknown>): MemoryStoragePort {
  const port = new MemoryStoragePort();
  port.seed(PAGE_INDEX_KEY, indexValue(Object.keys(values).map((k) => k.replace(/^slot:/, ''))));
  for (const [key, value] of Object.entries(values)) {
    port.seed(entryStorageKey(key.replace(/^slot:/, '')), value);
  }
  return port;
}

describe('authorPagesOf (A191)', () => {
  it('answers one row per page with own entries, fresh first', async () => {
    const port = portOf({
      [`slot:${PAGE_A}`]: slotValue([entryOf(PAGE_A, { updatedAt: '2026-01-01T00:00:00.000Z' })]),
      [`slot:${PAGE_B}`]: slotValue([
        entryOf(PAGE_B, { updatedAt: '2026-02-01T00:00:00.000Z' }),
        entryOf(PAGE_B, { id: 'second001', updatedAt: '2026-03-01T00:00:00.000Z' }),
      ]),
    });

    const answer = await authorPagesOf(port, 'reader');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows.map((row) => row.pageKey)).toEqual([PAGE_B, PAGE_A]);
    expect(answer.rows[0]).toEqual({
      pageKey: PAGE_B,
      count: 2,
      latest: '2026-03-01T00:00:00.000Z',
      title: null,
    });
    expect(answer.rows[1]?.count).toBe(1);
  });

  it('keeps other authors\' pages out of the list', async () => {
    const port = portOf({
      [`slot:${PAGE_A}`]: slotValue([entryOf(PAGE_A, { authorName: 'Вася' })]),
    });

    const answer = await authorPagesOf(port, 'reader');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows).toEqual([]);
  });

  it('answers the first non-empty stored title of the page\'s own entries (A190 fallback)', async () => {
    const port = portOf({
      [`slot:${PAGE_A}`]: slotValue([
        entryOf(PAGE_A, { title: undefined }),
        entryOf(PAGE_A, { id: 'second001', title: 'Статья про якоря' }),
        entryOf(PAGE_A, { id: 'third0001', title: 'Не это' }),
      ]),
    });

    const answer = await authorPagesOf(port, 'reader');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows[0]?.title).toBe('Статья про якоря');
  });

  it('an unusable index answers the code, and a missing index answers no rows', async () => {
    const bad = new MemoryStoragePort();
    bad.seed(PAGE_INDEX_KEY, { version: 2, pageKeys: [] });
    expect(await authorPagesOf(bad, 'reader')).toEqual({
      ok: false,
      code: 'layout_version',
    });

    const absent = new MemoryStoragePort();
    const answer = await authorPagesOf(absent, 'reader');
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows).toEqual([]);
  });

  it('an unreadable slot costs its own row, not the list', async () => {
    const port = portOf({
      [`slot:${PAGE_A}`]: { version: 1, entries: 'nope' },
      [`slot:${PAGE_B}`]: slotValue([entryOf(PAGE_B)]),
    });

    const answer = await authorPagesOf(port, 'reader');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.rows.map((row) => row.pageKey)).toEqual([PAGE_B]);
  });
});
