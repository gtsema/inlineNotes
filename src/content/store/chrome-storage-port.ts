/**
 * The one production adapter behind the `StoragePort` seam.
 *
 * `chrome.storage.local` is reached nowhere else in the shipped extension: the
 * domain layer (`src/core/`) talks to the port interface, popup and options read
 * and write entries through the same core API. Keeping the API call in this file
 * is what lets every store rule run in plain Node against an in-memory fake.
 *
 * Permission: `storage` (the only permission in `src/manifest.json`). No
 * `host_permissions`, no network API, no `chrome.storage.sync`.
 *
 * Failure model: the promise form of `chrome.storage.*` rejects when the area is
 * over `QUOTA_BYTES` or a value cannot be serialized. The adapter turns that
 * rejection into a `StorageFailureError` carrying a machine code
 * (`quota` / `serialization` / `unavailable`) so the store layer can decide what
 * to report. Russian user-visible wording is mapped in the UI layer.
 */

import type { StorageFailureCode, StoragePort } from '../../core/storage-port';
import { StorageFailureError, storageFailureCodeOf } from '../../core/storage-port';

/**
 * The slice of a `chrome.storage` area this adapter needs. Declared structurally
 * so a unit test can pass a hand-written area object instead of a `chrome` stub.
 */
export interface ChromeStorageAreaLike {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/**
 * Port over a storage area. Every call keeps the `StoragePort` contract; only the
 * error type is normalized.
 */
export function createChromeStoragePort(area: ChromeStorageAreaLike): StoragePort {
  return {
    get(keys: string[] | null): Promise<Record<string, unknown>> {
      return guarded(async () => await area.get(keys));
    },
    set(items: Record<string, unknown>): Promise<void> {
      return guarded(async () => {
        await area.set(items);
      });
    },
    remove(keys: string[]): Promise<void> {
      return guarded(async () => {
        await area.remove(keys);
      });
    },
  };
}

/**
 * Port over `chrome.storage.local` — the shape the content script and, later, the
 * extension UI use. It is a function, not a module-level constant, so importing
 * this file never touches the `chrome` global outside an extension context.
 */
export function createChromeLocalStoragePort(): StoragePort {
  return createChromeStoragePort({
    get(keys: string[] | null): Promise<Record<string, unknown>> {
      return chrome.storage.local.get(keys);
    },
    set(items: Record<string, unknown>): Promise<void> {
      return chrome.storage.local.set(items);
    },
    remove(keys: string[]): Promise<void> {
      return chrome.storage.local.remove(keys);
    },
  });
}

/** Runs one storage call and re-throws its failure as a `StorageFailureError`. */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new StorageFailureError(failureCodeOf(error), failureMessageOf(error));
  }
}

function failureCodeOf(error: unknown): StorageFailureCode {
  if (error instanceof StorageFailureError) {
    return error.code;
  }
  return storageFailureCodeOf(error);
}

function failureMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
