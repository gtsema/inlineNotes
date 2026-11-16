/**
 * The storage seam of the entry store.
 *
 * `src/core/` owns the contract and never calls a storage API: the reader and the
 * writer of notes talk to a `StoragePort`, and exactly one production adapter
 * (`src/content/store/chrome-storage-port.ts`) puts `chrome.storage.local` behind
 * it. That is what makes the store testable in plain Node with a hand-written
 * in-memory fake, and what keeps `chrome.*` out of the domain layer.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` (Rules / Semantics ->
 * "Storage seam").
 *
 * Failure model: `get` throws, writes report through `attemptWrite`. A failure
 * carries one of three machine codes; the Russian wording for a full quota is
 * mapped in the UI layer, never here.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network.
 */

/** Machine code explaining why a storage operation failed. */
export type StorageFailureCode = 'quota' | 'serialization' | 'unavailable';

/**
 * Error a `StoragePort` throws when `get`, `set` or `remove` cannot complete.
 * The code tells the caller whether the cause is a full quota, a value that
 * cannot be serialized, or a storage area that is simply unreachable.
 */
export class StorageFailureError extends Error {
  /** Machine code of the failure. */
  readonly code: StorageFailureCode;

  constructor(code: StorageFailureCode, message: string) {
    super(message);
    this.name = 'StorageFailureError';
    this.code = code;
  }
}

/** The whole storage surface the entry store uses: promise-based, three calls. */
export interface StoragePort {
  /**
   * Values of `keys`; a key with no stored value is absent from the result, never
   * `undefined`-valued. `null` means the whole storage area.
   * Throws `StorageFailureError` when the read itself fails.
   */
  get(keys: string[] | null): Promise<Record<string, unknown>>;

  /** Merges `items` into the area; keys absent from `items` keep their values. */
  set(items: Record<string, unknown>): Promise<void>;

  /** Drops `keys`; an unknown key is a no-op. */
  remove(keys: string[]): Promise<void>;
}

/** Result of a write through the seam: the caller never has to catch. */
export type StorageWriteResult = { ok: true } | { ok: false; code: StorageFailureCode };

/** Message fragments that identify a quota rejection (case-insensitive). */
const QUOTA_MESSAGE_MARKERS: readonly string[] = ['quota', 'maximum amount of data', 'quota_bytes'];

/** Message fragments that identify a serialization rejection. */
const SERIALIZATION_MESSAGE_MARKERS: readonly string[] = [
  'json',
  'serializ',
  'circular',
  'converting circular structure',
];

/**
 * Maps a storage error message to a machine code. Chrome rejects a
 * `chrome.storage.local` write whose JSON form exceeds `QUOTA_BYTES`, so the
 * wording of the rejection is the only signal available to the adapter.
 */
export function classifyStorageFailureMessage(message: string): StorageFailureCode {
  const lowered = message.toLowerCase();
  if (QUOTA_MESSAGE_MARKERS.some((marker: string) => lowered.includes(marker))) {
    return 'quota';
  }
  if (SERIALIZATION_MESSAGE_MARKERS.some((marker: string) => lowered.includes(marker))) {
    return 'serialization';
  }
  return 'unavailable';
}

/** Machine code of a thrown value: its own code, its message, else `unavailable`. */
export function storageFailureCodeOf(error: unknown): StorageFailureCode {
  if (error instanceof StorageFailureError) {
    return error.code;
  }
  if (error instanceof Error) {
    return classifyStorageFailureMessage(error.message);
  }
  if (typeof error === 'string') {
    return classifyStorageFailureMessage(error);
  }
  return 'unavailable';
}

/** Wraps a thrown failure into a write result. */
export function storageWriteFailure(error: unknown): StorageWriteResult {
  return { ok: false, code: storageFailureCodeOf(error) };
}

/**
 * Runs one write through the seam and turns a rejection into a typed result, so
 * the store layer can decide what to do without exception plumbing.
 */
export async function attemptWrite(write: () => Promise<void>): Promise<StorageWriteResult> {
  try {
    await write();
    return { ok: true };
  } catch (error) {
    return storageWriteFailure(error);
  }
}
