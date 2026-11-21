/**
 * Reading and writing the `settings:v1` record through the storage seam.
 *
 * Task `t3-01` (ruling `A31`, split by `A34`): the author name is needed by the
 * content card before the options page exists, so the decode guard for
 * `settings:v1` lives in `src/core/` and both UI halves read and write it through
 * these two functions. No shipped module outside this file touches the key, which
 * is what keeps the popup, the options page and the page overlay on one value.
 *
 * Rule owner: `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> "Settings record", "Author name").
 *
 * Read discipline: a read never throws and never writes. Whatever
 * `chrome.storage.local` hands back is untrusted, so an unusable value becomes an
 * empty name plus a machine code instead of a crash, and a stored name the
 * author-name rule refuses is reported, not repaired. Rewriting it would make the
 * user's own value unreachable with no ask.
 *
 * Write discipline: exactly one key, exactly the normalized value that
 * `validateAuthorName` produced. A refused name performs no port call at all, and
 * a port failure leaves the stored value byte-identical, because a half-saved name
 * would change who may edit every existing entry.
 *
 * Codes are machine-readable only; the Russian wording is mapped in the UI layer.
 *
 * Internal helpers (`A57`, same precedent as `assertCreatable` under `A52`):
 * `settingsValueOf` and `settingsFromStorageValue` build and decode the record for
 * `loadSettings` and `saveSettings` only. They are exported for the unit tests and
 * no shipped module may import them — composing a settings record by hand would
 * make that module a second reader or writer of `settings:v1`. The ban is pinned
 * by a grep test, not by this sentence.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. The only
 * impure collaborator is the injected `StoragePort`.
 */

import type { LengthValidation } from './entry-rules';
import { validateAuthorName } from './entry-rules';
import type { StorageFailureCode, StoragePort, StorageWriteResult } from './storage-port';
import { attemptWrite } from './storage-port';
import { SETTINGS_KEY } from './storage-keys';

/**
 * Stored value of `settings:v1`.
 *
 * Stage 17 (ruling `A160`) adds two **optional** fields so the sync feature can be
 * switched on without breaking a record written by an older build:
 *
 * - `serverUrl` — `http://host:port` or `https://host:port`, `''` meaning "not
 *   configured";
 * - `syncEnabled` — the global switch, **absent means off**.
 *
 * Both are omitted from the stored object when they carry their default, so a
 * record the reader never configured is byte-identical to what the previous version
 * wrote. `tests/core-settings-store.spec.ts` pins that shape, and
 * `tests/core-sync-settings.spec.ts` pins the decode.
 */
export interface SettingsValue {
  name: string;
  serverUrl?: string;
  syncEnabled?: boolean;
}

/** Input of `saveSettings`; the stored value is the normalized form of `name`. */
export interface SaveSettingsInput {
  /** Raw author name as typed by the user. */
  name: string;
  /**
   * Server address to store beside the name (ruling `A165`). `undefined` keeps what
   * the store already holds, which is what the name-only save of the options page
   * does: saving a name must never erase a configured server.
   */
  serverUrl?: string;
  /** Synchronization switch (ruling `A160`). `undefined` keeps the stored value. */
  syncEnabled?: boolean;
}

/** Machine code explaining what the settings read found. */
export type SettingsCode =
  /** The port itself failed, so no stored value is known. */
  | 'storage_unavailable'
  /** `settings:v1` is absent, not an object, or carries a non-string `name`. */
  | 'settings_malformed'
  /** A decodable `name` that the author-name rule refuses (ruling `A11`). */
  | 'name_required';

/** Result of `loadSettings`: the name to work with plus what the read found. */
export interface SettingsReadResult {
  /**
   * Stored name as `validateAuthorName` normalized it (trimmed), `''` when the
   * read produced no name at all. A name above `MAX_AUTHOR_NAME_CODE_POINTS` is
   * returned trimmed and reported with `name_required`; it is never truncated.
   */
  name: string;
  /** Codes in the order the read produced them; empty for a valid stored name. */
  codes: readonly SettingsCode[];
  /**
   * Stored server address, `''` when the record carries none or an unusable value
   * (ruling `A160`). A record written by the previous version reads `''` here.
   */
  serverUrl: string;
  /** Stored switch, `false` when the record carries none or an unusable value. */
  syncEnabled: boolean;
}

/** Why `saveSettings` refused: the author-name rule or a port failure. */
export type SettingsWriteCode = 'name_required' | StorageFailureCode;

/** Result of `saveSettings`; the fields are the values that were written. */
export type SettingsWriteResult =
  | { ok: true; name: string; serverUrl: string; syncEnabled: boolean }
  | { ok: false; code: SettingsWriteCode };

/**
 * The stored shape, produced here so a write cannot publish a value its own
 * reader would report as `settings_malformed`.
 *
 * The two Stage 17 fields are **omitted at their defaults** (ruling `A160`): an
 * empty address and a switch that is off are what an absent field means, so
 * writing them would only make the old and the new record look different for the
 * same state.
 */
export function settingsValueOf(
  name: string,
  serverUrl = '',
  syncEnabled = false,
): SettingsValue {
  const value: SettingsValue = { name };
  if (serverUrl !== '') {
    value.serverUrl = serverUrl;
  }
  if (syncEnabled) {
    value.syncEnabled = true;
  }
  return value;
}

/**
 * Decodes a stored settings value without trusting it. A value that is absent,
 * `null`, an array, a primitive, or an object whose `name` is not a string is
 * `settings_malformed` plus an empty name, never a throw. Unknown fields are
 * ignored, because the record may gain fields before an older reader sees them.
 *
 * A `name` that is a string is normalized by `validateAuthorName` (trim, measured
 * in code points) and reported with `name_required` when it is empty after the
 * trim or longer than `MAX_AUTHOR_NAME_CODE_POINTS` — ruling `A11` keeps
 * `name_required` the single code for v1, because the options input refuses the
 * overflow before it can be stored. The trimmed value is returned as-is: reporting
 * a rule violation is not permission to rewrite the user's value.
 */
export function settingsFromStorageValue(value: unknown): SettingsReadResult {
  const defaults = { serverUrl: '', syncEnabled: false };
  if (!isRecord(value)) {
    return { name: '', codes: ['settings_malformed'], ...defaults };
  }

  const storedName = value['name'];
  if (typeof storedName !== 'string') {
    return { name: '', codes: ['settings_malformed'], ...defaults };
  }

  // Stage 17 (`A160`): the two new fields are decoded defensively and never
  // repaired. A wrong type or a blank address reads as "not configured", which is
  // the answer ruling `A166` acts on — no request — while a damaged name keeps the
  // code it already had. Nothing here switches synchronization on by accident.
  const storedServerUrl = value['serverUrl'];
  const serverUrl = typeof storedServerUrl === 'string' ? storedServerUrl.trim() : '';
  const syncEnabled = value['syncEnabled'] === true ? true : false;

  const validation: LengthValidation = validateAuthorName(storedName);
  if (validation.ok) {
    return { name: validation.normalized, codes: [], serverUrl, syncEnabled };
  }
  return {
    name: validation.normalized,
    codes: ['name_required'],
    serverUrl,
    syncEnabled,
  };
}

/**
 * Reads the author name through the seam (`A31`). One `get` of the single key, and
 * every unusable case answers `{ name: '', codes: [...] }`: a port failure is
 * `storage_unavailable`, a missing or undecodable value is `settings_malformed`.
 *
 * A fresh install therefore reads `name: ''` with `settings_malformed` — the
 * reader has one answer for "no usable name" and does not have to know whether the
 * key was never written or was written by something else. The caller decides
 * "is there an author" through `validateAuthorName(result.name)`, never by
 * re-decoding storage. A read never writes, so a stored value survives it intact.
 */
export async function loadSettings(port: StoragePort): Promise<SettingsReadResult> {
  let items: Record<string, unknown>;
  try {
    items = await port.get([SETTINGS_KEY]);
  } catch {
    return { name: '', codes: ['storage_unavailable'], serverUrl: '', syncEnabled: false };
  }
  return settingsFromStorageValue(items[SETTINGS_KEY]);
}

/**
 * Writes the author name (`t4-02-options-name` is the only shipped caller). The
 * stored value is `validateAuthorName(name).normalized` and nothing else, so the
 * store never holds a name the rules refuse, and the value that comes back from
 * `loadSettings` equals what was typed after the trim.
 *
 * An empty or whitespace-only name, and a name above `MAX_AUTHOR_NAME_CODE_POINTS`,
 * refuses with `name_required` before any port call, so the stored value is
 * untouched. A quota or serialization rejection is reported with the port's own
 * code and also leaves the stored value byte-identical: a name that decides edit
 * rights on every existing entry must never be half-saved.
 */
export async function saveSettings(
  port: StoragePort,
  input: SaveSettingsInput,
): Promise<SettingsWriteResult> {
  const validation: LengthValidation = validateAuthorName(input.name);
  if (!validation.ok) {
    return { ok: false, code: 'name_required' };
  }

  // Stage 17 (`A160`): a field the caller did not send keeps the stored value. The
  // read is the same guarded `get` the loader makes, and a read that throws is not
  // a reason to publish `syncEnabled: false` over the reader's choice — the write is
  // reported as unavailable and the record stays as it was.
  let carried: SettingsReadResult | null = null;
  if (input.serverUrl === undefined || input.syncEnabled === undefined) {
    carried = await loadSettings(port);
    if (carried.codes.includes('storage_unavailable')) {
      return { ok: false, code: 'unavailable' };
    }
  }
  const serverUrl = input.serverUrl ?? carried?.serverUrl ?? '';
  const syncEnabled = input.syncEnabled ?? carried?.syncEnabled ?? false;

  const write: StorageWriteResult = await attemptWrite(async () => {
    await port.set({ [SETTINGS_KEY]: settingsValueOf(validation.normalized, serverUrl, syncEnabled) });
  });
  if (!write.ok) {
    return { ok: false, code: write.code };
  }
  return { ok: true, name: validation.normalized, serverUrl, syncEnabled };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
