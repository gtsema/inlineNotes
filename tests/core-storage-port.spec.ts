import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  StorageFailureError,
  attemptWrite,
  classifyStorageFailureMessage,
  storageFailureCodeOf,
  storageWriteFailure,
} from '../src/core/storage-port';
import type { StoragePort } from '../src/core/storage-port';
import { MemoryStoragePort } from './support/memory-storage-port';

/**
 * The storage seam of task `t1-05` (AC1).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Storage seam". Every case runs against the hand-written in-memory port: no
 * jsdom, no `chrome` stub, no new dependency.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Strips comments so the purity checks look at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function coreSource(relativePath: string): string {
  return codeOnly(readFileSync(join(projectRoot, 'src', 'core', relativePath), 'utf8'));
}

describe('MemoryStoragePort honours the StoragePort contract (AC1)', () => {
  it('returns only the requested keys and omits the missing ones', async () => {
    const port = new MemoryStoragePort();
    port.seed('a', 1);
    port.seed('b', 2);

    const items = await port.get(['a', 'missing']);
    expect(Object.keys(items)).toEqual(['a']);
    expect(items['a']).toBe(1);
    expect('missing' in items).toBe(false);
  });

  it('returns the whole area for a null key list', async () => {
    const port = new MemoryStoragePort();
    port.seed('a', 1);
    port.seed('b', 2);

    expect(await port.get(null)).toEqual({ a: 1, b: 2 });
  });

  it('merges on set and keeps keys that were not written', async () => {
    const port = new MemoryStoragePort();
    await port.set({ a: 1, b: 2 });
    await port.set({ b: 3, c: 4 });

    expect(port.snapshot()).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('removes keys and treats an unknown key as a no-op', async () => {
    const port = new MemoryStoragePort();
    await port.set({ a: 1 });
    await port.remove(['a', 'never-there']);

    expect(port.storedKeys()).toEqual([]);
  });

  it('reads are unaffected by an injected write failure', async () => {
    const port = new MemoryStoragePort();
    port.seed('a', 1);
    port.failNextWrite('quota');

    expect(await port.get(['a'])).toEqual({ a: 1 });
    await expect(port.set({ b: 2 })).rejects.toBeInstanceOf(StorageFailureError);
  });
});

describe('StoragePort is satisfiable by the fake without chrome or jsdom (AC1)', () => {
  it('the fake is assignable to the port interface', async () => {
    const port: StoragePort = new MemoryStoragePort();
    await port.set({ 'pages:v1': { version: 1, pageKeys: [] } });
    expect(await port.get(['pages:v1'])).toEqual({ 'pages:v1': { version: 1, pageKeys: [] } });
  });
});

describe('failure codes (AC1)', () => {
  it('classifies a quota rejection', () => {
    expect(classifyStorageFailureMessage('QUOTA_BYTES quota exceeded')).toBe('quota');
    expect(
      classifyStorageFailureMessage('Maximum amount of data exceeded for key: notes:v1:x'),
    ).toBe('quota');
  });

  it('classifies a serialization rejection', () => {
    expect(classifyStorageFailureMessage('Value is not JSON-serializable')).toBe('serialization');
    expect(classifyStorageFailureMessage('Converting circular structure to JSON')).toBe(
      'serialization',
    );
  });

  it('falls back to unavailable for anything else', () => {
    expect(classifyStorageFailureMessage('Something happened')).toBe('unavailable');
    expect(classifyStorageFailureMessage('')).toBe('unavailable');
  });

  it('prefers the code carried by a StorageFailureError', () => {
    expect(storageFailureCodeOf(new StorageFailureError('quota', 'over quota'))).toBe('quota');
    expect(storageFailureCodeOf(new Error('QUOTA_BYTES quota exceeded'))).toBe('quota');
    expect(storageFailureCodeOf('json rejected')).toBe('serialization');
    expect(storageFailureCodeOf(undefined)).toBe('unavailable');
    expect(storageFailureCodeOf({ code: 'quota' })).toBe('unavailable');
  });

  it('attemptWrite reports success without touching the error path', async () => {
    const result = await attemptWrite(async () => {
      await Promise.resolve();
    });
    expect(result).toEqual({ ok: true });
  });

  it('attemptWrite turns a rejection into a typed failure', async () => {
    const result = await attemptWrite(async () => {
      throw new StorageFailureError('quota', 'over quota');
    });
    expect(result).toEqual({ ok: false, code: 'quota' });
  });

  it('storageWriteFailure keeps the machine code of an unknown rejection', async () => {
    const result = await attemptWrite(async () => {
      throw new Error('storage area is not available');
    });
    expect(result.ok).toBe(false);
    expect(storageWriteFailure(new Error('QUOTA_BYTES'))).toEqual({ ok: false, code: 'quota' });
  });
});

describe('purity of the core modules (AC1, review remark R6)', () => {
  const MODULES: readonly string[] = [
    'storage-port.ts',
    'settings-store.ts',
    'page-index-store.ts',
    'entry-store-read.ts',
    'entry-store-write.ts',
    'entry-overlap.ts',
    'text-normalize.ts',
    'anchor-build.ts',
    'anchor-resolve.ts',
  ];

  it('uses no DOM, no chrome.*, no clock, no randomness, no crypto, no network', () => {
    for (const name of MODULES) {
      const code = coreSource(name);
      for (const forbidden of [
        'document',
        'window',
        'chrome.',
        'Date',
        'Math.random',
        'crypto',
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
