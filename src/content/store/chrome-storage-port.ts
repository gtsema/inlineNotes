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
 *
 * Change notifications (task `t4-03` AC2, ruling `A60`) arrive through the same file:
 * `chrome.storage.onChanged` is a `chrome.storage` surface, so the one-adapter rule of
 * `docs/specs/inline-comment-model.md` -> "Storage seam" means the subscription lives
 * here too. This half makes no call and reads no value: it filters the area name and
 * hands out the keys that changed. What a change means for a page is decided in
 * `src/content/refresh/storage-change-watch.ts` over the core key predicate.
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

/**
 * A change notification reduced to the keys that changed. The record shape
 * `chrome.storage.onChanged` answers with (`{ key: { oldValue, newValue } }`) is
 * reduced here, because the only question the page asks is *which key* moved
 * (task `t4-03` AC2, ruling `A60`); what a change means is decided by
 * `src/content/refresh/storage-change-watch.ts` over the core key predicate.
 */
export type StorageKeysChangeListener = (changedKeys: readonly string[]) => void;

/**
 * Subscribes to `chrome.storage.local` changes and returns the teardown.
 *
 * The area filter lives here and nowhere else: `chrome.storage.onChanged` is one
 * event for every area, and this extension has exactly one area
 * (`docs/specs/inline-comment-model.md` -> "Storage"), so a change reported for
 * `sync`, `managed` or `session` is not this extension's data and reaches no
 * listener at all. No `catch`: the subscription makes no call that can reject, and
 * the listener it installs is a key read out of an event argument.
 */
export function watchChromeStorageLocalChanges(
  zone: ChromeStorageChangeZoneLike,
  onChange: StorageKeysChangeListener,
): () => void {
  const listener = (changes: Record<string, unknown>, areaName: string): void => {
    if (areaName !== LOCAL_STORAGE_AREA) {
      return;
    }
    onChange(Object.keys(changes));
  };
  zone.addListener(listener);
  return (): void => {
    zone.removeListener(listener);
  };
}

/**
 * The live `chrome.storage.onChanged` zone of this browser, reached nowhere else in
 * shipped code — the same rule that keeps `chrome.storage.local` reads and writes
 * inside this file, and the reason the page-side listener is testable against a
 * hand-written zone object.
 */
export function createChromeLocalStorageChangeZone(): ChromeStorageChangeZoneLike {
  return {
    addListener(listener: StorageAreaChangeListenerLike): void {
      chrome.storage.onChanged.addListener(listener);
    },
    removeListener(listener: StorageAreaChangeListenerLike): void {
      chrome.storage.onChanged.removeListener(listener);
    },
  };
}

/**
 * The subscription of one page: hand it a listener, get the teardown back. It is a
 * function rather than a constant so importing this file never touches the `chrome`
 * global outside an extension context.
 */
export type StorageChangeSource = (onChange: StorageKeysChangeListener) => () => void;

/** The `chrome.storage.local` subscription a content page uses. */
export function createChromeLocalStorageChangeSource(): StorageChangeSource {
  const zone = createChromeLocalStorageChangeZone();
  return (onChange: StorageKeysChangeListener): (() => void) =>
    watchChromeStorageLocalChanges(zone, onChange);
}

/** The `chrome.storage.onChanged` callback shape, as this adapter needs it. */
type StorageAreaChangeListenerLike = (
  changes: Record<string, unknown>,
  areaName: string,
) => void;

/** The area name `chrome.storage.onChanged` reports for `chrome.storage.local`. */
const LOCAL_STORAGE_AREA = 'local';

/** The slice of `chrome.storage.onChanged` this adapter needs, declared structurally. */
export interface ChromeStorageChangeZoneLike {
  addListener(listener: StorageAreaChangeListenerLike): void;
  removeListener(listener: StorageAreaChangeListenerLike): void;
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
