/**
 * Page identity of the entry store: `pageKey` normalization and the loss-proof
 * lookup.
 *
 * Pure module: no DOM, no `chrome.*`, no `Date`, no `Math.random`. The rule is
 * owned by `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> "`pageKey` normalization"). The only import is the key
 * vocabulary of `storage-keys.ts`: no framework and no external module.
 *
 * Determinism notes (pinned here so the same input always gives the same key):
 * - a noise parameter is recognized by its lowercased name; `utm_` and `mc_`
 *   match as prefixes, every other listed name matches exactly;
 * - kept parameters are re-serialized by `URLSearchParams` (percent-encoding
 *   normalized, pairs sorted by name with a stable sort), so two semantically
 *   equal queries produce one key;
 * - an empty or unparsable URL yields `null`: the caller leaves the page
 *   unannotated instead of inventing a storage key.
 */

import { ENTRY_KEY_PREFIX } from './storage-keys';

/** Query parameters treated as tracking noise and dropped from the key. */
export const TRACKING_PARAM_NAMES: readonly string[] = [
  'gclid',
  'gsas',
  'fbclid',
  '_ga',
  '_gl',
  '_hs',
  'ref',
  'ref_src',
  'igshid',
  's_kwcid',
];

/** Query parameter name prefixes treated as tracking noise and dropped. */
export const TRACKING_PARAM_PREFIXES: readonly string[] = ['utm_', 'mc_'];

/** `true` when a query parameter name is tracking noise. */
export function isTrackingParam(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (TRACKING_PARAM_NAMES.includes(normalized)) {
    return true;
  }
  for (const prefix of TRACKING_PARAM_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalized page identity: `origin + pathname` with a lowercased path, the hash
 * dropped, noise parameters dropped and the remaining parameters kept and sorted
 * by name. `null` for an empty or unparsable URL.
 */
export function pageKeyFromUrl(url: string): string | null {
  const parsed = parseUrl(url);
  if (parsed === null) {
    return null;
  }

  const base = pathOnlyOfParsed(parsed);
  const kept = new URLSearchParams();
  parsed.searchParams.forEach((value: string, name: string) => {
    if (!isTrackingParam(name)) {
      kept.append(name, value);
    }
  });
  kept.sort();

  const query = kept.toString();
  return query.length > 0 ? `${base}?${query}` : base;
}

/**
 * `origin + pathname` of a URL with a lowercased path: the identity used by the
 * fallback lookup, so a note survives a query that later gains or loses a kept
 * parameter. `null` for an empty or unparsable URL.
 */
export function pathOnlyKey(url: string): string | null {
  const parsed = parseUrl(url);
  if (parsed === null) {
    return null;
  }
  return pathOnlyOfParsed(parsed);
}

/**
 * Loss-proof lookup among the stored page keys of the entry store. A candidate
 * is either a stored `pageKey` or a whole `notes:v1:<pageKey>` storage key, so
 * the caller may pass `Object.keys(storage.local)` unchanged.
 *
 * Resolution order: an exact normalized key first, then the first stored key
 * whose `origin + pathname` is equal, in the order the caller supplied. The
 * matching stored page key is returned unchanged, so `entryStorageKey` of the
 * result is the storage key that already exists and the page never forks into
 * two entry lists. `null` when nothing matches.
 */
export function findPageKey(url: string, storedKeys: readonly string[]): string | null {
  const exact = pageKeyFromUrl(url);
  if (exact === null) {
    return null;
  }

  const candidates = storedKeys.map(candidatePageKey);

  for (const candidate of candidates) {
    if (candidate === exact) {
      return candidate;
    }
  }

  const pathOnly = pathOnlyKey(url);
  if (pathOnly === null) {
    return null;
  }
  for (const candidate of candidates) {
    if (pathOnlyOfStoredKey(candidate) === pathOnly) {
      return candidate;
    }
  }

  return null;
}

/** Strips a `notes:v1:` storage prefix so a candidate is always a page key. */
function candidatePageKey(candidate: string): string {
  const trimmed = candidate.trim();
  if (trimmed.startsWith(ENTRY_KEY_PREFIX)) {
    return trimmed.slice(ENTRY_KEY_PREFIX.length).trim();
  }
  return trimmed;
}

/** `origin + pathname` part of an already normalized stored page key. */
export function pathOnlyOfStoredKey(storedKey: string): string {
  const trimmed = storedKey.trim();
  let end = trimmed.length;

  const queryStart = trimmed.indexOf('?');
  if (queryStart >= 0 && queryStart < end) {
    end = queryStart;
  }
  const hashStart = trimmed.indexOf('#');
  if (hashStart >= 0 && hashStart < end) {
    end = hashStart;
  }

  return trimmed.slice(0, end).toLowerCase();
}

function parseUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function pathOnlyOfParsed(parsed: URL): string {
  return `${parsed.origin}${parsed.pathname.toLowerCase()}`;
}
