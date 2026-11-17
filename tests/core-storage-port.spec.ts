import { readdirSync, readFileSync } from 'node:fs';
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
 * The storage seam of task `t1-05` (AC1), and since `t2-04` / `t3-04` the single
 * purity scan over `src/core/` (ruling `A51`, module list derived per `A58`).
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

describe('purity of the core modules (AC1, review remark R6, rulings A51 and A58)', () => {
  /**
   * Every module under `src/core/`, derived from the directory instead of named by
   * hand (ruling `A58`): the hand-maintained list covered 9 of the 15 modules and
   * grew stale twice (`t2-04` remark 1, `t3-01` remark 7), so the drift is now
   * impossible rather than annually corrected.
   */
  function coreModuleNames(): string[] {
    const names: string[] = [];
    const walk = (prefix: string): void => {
      for (const entry of readdirSync(join(projectRoot, 'src', 'core', prefix), {
        withFileTypes: true,
      })) {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(relative);
        } else if (entry.name.endsWith('.ts')) {
          names.push(relative);
        }
      }
    };
    walk('');
    return names.sort();
  }

  const MODULES: readonly string[] = coreModuleNames();

  it('covers every module in the directory, with no module named by hand (A58)', () => {
    const onDisk = readdirSync(join(projectRoot, 'src', 'core'), { recursive: true })
      .map((entry) => String(entry).split('\\').join('/'))
      .filter((name) => name.endsWith('.ts'))
      .sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect([...MODULES]).toEqual(onDisk);

    // The six modules the hand-maintained list left outside the scan (`t3-01`
    // review remark 7) are inside it now. This list is a pin, not the source.
    for (const name of [
      'entry-rules.ts',
      'entry.ts',
      'page-index.ts',
      'page-key.ts',
      'slot-key.ts',
      'storage-keys.ts',
    ]) {
      expect(MODULES).toContain(name);
    }
  });

  it('strips comments, so the non-ASCII rule reads code and never prose (A51)', () => {
    // Prerequisite of the absorbed rule: nine `src/core/` files carry em-dashes,
    // arrows and dashes in comments, and the rule that forbids non-ASCII text must
    // not fire on them. `codeOnly` removes them, and the raw file proves the point.
    expect(codeOnly('const a = 1; // an em-dash \u2014 and an arrow \u2192')).not.toMatch(
      /[^\x00-\x7F]/,
    );
    expect(codeOnly('const a = 1; /* \u2014 \u2192 "quoted" */ const b = 2;')).not.toMatch(
      /[^\x00-\x7F]/,
    );
    expect(readFileSync(join(projectRoot, 'src', 'core', 'anchor-build.ts'), 'utf8')).toMatch(
      /[^\x00-\x7F]/,
    );
    expect(coreSource('anchor-build.ts')).not.toMatch(/[^\x00-\x7F]/);
  });

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

  it('uses no any, no type-system escape hatch, no framework import, no non-ASCII text', () => {
    for (const name of MODULES) {
      const code = coreSource(name);
      expect(code).not.toMatch(/\bany\b/);
      expect(code).not.toContain('@ts-ignore');
      expect(code).not.toContain('@ts-expect-error');
      expect(code).not.toContain('@angular/');
      expect(code).not.toContain('preact');
      // The stronger rule of the scan that used to live in
      // `tests/core-entry-overlap.spec.ts`, absorbed here for every core module
      // (ruling `A51`): UI strings are Russian and belong in a UI constants module.
      expect(code).not.toMatch(/[^\x00-\x7F]/);

      const imported = code.match(/from\s+'([^']+)'/g) ?? [];
      for (const specifier of imported) {
        expect(specifier).toMatch(/from\s+'\.\//);
      }
    }
  });
});
