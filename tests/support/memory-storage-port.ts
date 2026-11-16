import type { StorageFailureCode, StoragePort } from '../../src/core/storage-port';
import { StorageFailureError } from '../../src/core/storage-port';
import { PAGE_INDEX_KEY } from '../../src/core/storage-keys';

/**
 * Hand-written in-memory `StoragePort` used by the store tests.
 *
 * It is deliberately not a `chrome` stub and not jsdom: the seam in
 * `src/core/storage-port.ts` is the whole contract, so a map plus a call log is
 * enough to observe ordering, merging and failure injection.
 */

/** One recorded port call, in the order the port saw it. */
export interface PortCall {
  op: 'get' | 'set' | 'remove';
  keys: string[];
}

export class MemoryStoragePort implements StoragePort {
  /** Every call in order, so a test can assert "slot first, then index". */
  readonly calls: PortCall[] = [];

  private readonly values = new Map<string, unknown>();
  private nextWriteFailure: StorageFailureCode | null = null;
  private nextReadFailure: StorageFailureCode | null = null;
  private readonly keyWriteFailures = new Map<string, StorageFailureCode>();
  private readonly keyReadFailures = new Map<string, StorageFailureCode>();

  /** Puts a value in the area without recording a port call. */
  seed(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  /** Makes the next `set` or `remove` reject with a quota/serialization failure. */
  failNextWrite(code: StorageFailureCode): void {
    this.nextWriteFailure = code;
  }

  /**
   * Makes the next write that touches `key` reject, whatever else it contains.
   * This is how a test proves the order of a multi-key policy: the slot lands and
   * the index write is the one that fails.
   */
  failWriteOn(key: string, code: StorageFailureCode): void {
    this.keyWriteFailures.set(key, code);
  }

  /** Makes the next `get` reject. */
  failNextRead(code: StorageFailureCode): void {
    this.nextReadFailure = code;
  }

  /** Makes the next read that asks for `key` reject. */
  failReadOn(key: string, code: StorageFailureCode): void {
    this.keyReadFailures.set(key, code);
  }

  /** Copy of the whole area, so a test can prove nothing was written or deleted. */
  snapshot(): Record<string, unknown> {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of this.values) {
      copy[key] = value;
    }
    return copy;
  }

  /** Keys currently present, in insertion order. */
  storedKeys(): string[] {
    return [...this.values.keys()];
  }

  async get(keys: string[] | null): Promise<Record<string, unknown>> {
    this.calls.push({ op: 'get', keys: keys ?? [] });
    this.consumeReadFailure(keys ?? this.storedKeys());

    const wanted = keys === null ? this.storedKeys() : keys;
    const found: Record<string, unknown> = {};
    for (const key of wanted) {
      if (this.values.has(key)) {
        found[key] = this.values.get(key);
      }
    }
    return found;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(items);
    this.calls.push({ op: 'set', keys });
    this.consumeWriteFailure(keys);
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value);
    }
  }

  async remove(keys: string[]): Promise<void> {
    this.calls.push({ op: 'remove', keys });
    this.consumeWriteFailure(keys);
    for (const key of keys) {
      this.values.delete(key);
    }
  }

  private consumeReadFailure(keys: string[]): void {
    for (const key of keys) {
      const code = this.keyReadFailures.get(key);
      if (code !== undefined) {
        this.keyReadFailures.delete(key);
        throw new StorageFailureError(code, `memory port: injected ${code} failure for ${key}`);
      }
    }
    if (this.nextReadFailure === null) {
      return;
    }
    const code = this.nextReadFailure;
    this.nextReadFailure = null;
    throw new StorageFailureError(code, `memory port: injected ${code} read failure`);
  }

  private consumeWriteFailure(keys: string[]): void {
    for (const key of keys) {
      const code = this.keyWriteFailures.get(key);
      if (code !== undefined) {
        this.keyWriteFailures.delete(key);
        throw new StorageFailureError(code, `memory port: injected ${code} failure for ${key}`);
      }
    }
    if (this.nextWriteFailure === null) {
      return;
    }
    const code = this.nextWriteFailure;
    this.nextWriteFailure = null;
    throw new StorageFailureError(code, `memory port: injected ${code} write failure`);
  }
}

/** Entry slot helper: a `{ version, entries }` value for a page slot. */
export function slotValue(entries: readonly unknown[]): { version: 1; entries: unknown[] } {
  return { version: 1, entries: [...entries] };
}

/** Index value helper, so a test seeds exactly the stored shape. */
export function indexValue(pageKeys: readonly string[]): { version: 1; pageKeys: string[] } {
  return { version: 1, pageKeys: [...pageKeys] };
}

/** Reads the stored `pages:v1` value back out of a port snapshot. */
export function storedIndexOf(port: MemoryStoragePort): PageIndexValueLike | undefined {
  const value = port.snapshot()[PAGE_INDEX_KEY];
  if (!isRecordLike(value) || !Array.isArray(value['pageKeys'])) {
    return undefined;
  }
  const elements: readonly unknown[] = value['pageKeys'];
  return {
    version: Number(value['version']),
    pageKeys: elements.filter((element: unknown): element is string => typeof element === 'string'),
  };
}

interface PageIndexValueLike {
  version: number;
  pageKeys: string[];
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Minimal well-shaped stored record; `overrides` builds the malformed cases. */
export function storedEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a1b2c3d4e5f6',
    pageKey: 'https://example.com/a',
    authorName: 'reader-one',
    text: 'selected text',
    comment: 'my note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    visible: true,
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    ...overrides,
  };
}
