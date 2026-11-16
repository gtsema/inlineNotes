import { describe, expect, it } from 'vitest';

import { StorageFailureError } from '../src/core/storage-port';
import {
  createChromeStoragePort,
  createChromeLocalStoragePort,
} from '../src/content/store/chrome-storage-port';
import type { ChromeStorageAreaLike } from '../src/content/store/chrome-storage-port';

/**
 * The one production adapter of the storage seam: task `t1-05` (AC1).
 *
 * The area is injected, so these cases run in plain Node against a hand-written
 * fake area — no `chrome` stub package, no jsdom, no new dependency. Only the
 * error normalization is under test: the store rules themselves live in
 * `src/core/`.
 */

class FakeStorageArea implements ChromeStorageAreaLike {
  readonly calls: string[] = [];
  private readonly values = new Map<string, unknown>();
  private rejection: unknown = null;

  seed(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  /** Makes the next call reject with the raw error `chrome.storage` would throw. */
  rejectNext(error: unknown): void {
    this.rejection = error;
  }

  async get(keys: string[] | null): Promise<Record<string, unknown>> {
    this.calls.push(`get:${keys === null ? '*' : keys.join(',')}`);
    this.consumeRejection();
    const found: Record<string, unknown> = {};
    for (const key of keys === null ? [...this.values.keys()] : keys) {
      if (this.values.has(key)) {
        found[key] = this.values.get(key);
      }
    }
    return found;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.calls.push(`set:${Object.keys(items).join(',')}`);
    this.consumeRejection();
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value);
    }
  }

  async remove(keys: string[]): Promise<void> {
    this.calls.push(`remove:${keys.join(',')}`);
    this.consumeRejection();
    for (const key of keys) {
      this.values.delete(key);
    }
  }

  private consumeRejection(): void {
    if (this.rejection === null) {
      return;
    }
    const rejection = this.rejection;
    this.rejection = null;
    throw rejection;
  }
}

describe('createChromeStoragePort passes the calls through (AC1)', () => {
  it('gets, sets and removes through the area', async () => {
    const area = new FakeStorageArea();
    area.seed('pages:v1', { version: 1, pageKeys: [] });
    const port = createChromeStoragePort(area);

    expect(await port.get(['pages:v1', 'missing'])).toEqual({
      'pages:v1': { version: 1, pageKeys: [] },
    });
    await port.set({ 'notes:v1:a': { version: 1, entries: [] } });
    await port.remove(['pages:v1']);

    expect(area.calls).toEqual([
      'get:pages:v1,missing',
      'set:notes:v1:a',
      'remove:pages:v1',
    ]);
  });

  it('passes a null key list straight to the area', async () => {
    const area = new FakeStorageArea();
    area.seed('a', 1);
    const port = createChromeStoragePort(area);

    expect(await port.get(null)).toEqual({ a: 1 });
    expect(area.calls).toEqual(['get:*']);
  });
});

describe('createChromeStoragePort normalizes failures (AC1)', () => {
  it('turns a quota rejection into a quota StorageFailureError', async () => {
    const area = new FakeStorageArea();
    area.rejectNext(new Error('QUOTA_BYTES quota exceeded'));
    const port = createChromeStoragePort(area);

    await expect(port.set({ a: 1 })).rejects.toMatchObject({
      name: 'StorageFailureError',
      code: 'quota',
    });
  });

  it('turns a serialization rejection into a serialization StorageFailureError', async () => {
    const area = new FakeStorageArea();
    area.rejectNext('Converting circular structure to JSON');
    const port = createChromeStoragePort(area);

    await expect(port.remove(['a'])).rejects.toMatchObject({
      name: 'StorageFailureError',
      code: 'serialization',
    });
  });

  it('falls back to unavailable for an unclassified rejection', async () => {
    const area = new FakeStorageArea();
    area.rejectNext(new Error('storage area unreachable'));
    const port = createChromeStoragePort(area);

    await expect(port.get(['a'])).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('keeps the code of a failure the port already classified', async () => {
    const area = new FakeStorageArea();
    area.rejectNext(new StorageFailureError('serialization', 'already typed'));
    const port = createChromeStoragePort(area);

    await expect(port.set({ a: 1 })).rejects.toMatchObject({ code: 'serialization' });
  });
});

describe('the chrome localStorage entry point exists for the content layer (AC1)', () => {
  it('is a function, so importing the adapter never touches the chrome global', () => {
    expect(typeof createChromeLocalStoragePort).toBe('function');
  });
});
