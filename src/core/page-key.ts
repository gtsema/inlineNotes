/**
 * Page identity of the entry store: `pageKey` normalization.
 *
 * Pure module: no DOM, no `chrome.*`, no `Date`, no `Math.random`. The rule is
 * owned by `docs/specs/inline-comment-model.md`
 * (Rules / Semantics -> "`pageKey` normalization"). It imports nothing: the slot
 * key layout (`slot-key.ts`, `storage-keys.ts`) and the loss-proof lookup
 * (`page-index.ts`) sit on top of these functions, never the other way round.
 *
 * Determinism notes (pinned here so the same input always gives the same key):
 * - a noise parameter is recognized by its lowercased name; `utm_` and `mc_`
 *   match as prefixes, every other listed name matches exactly;
 * - kept parameters are re-serialized by `URLSearchParams` (percent-encoding
 *   normalized, pairs sorted by name with a stable sort), so two semantically
 *   equal queries produce one key;
 * - a trailing slash is not part of page identity: `/a`, `/a/` and `/a//` give the
 *   key of `/a`, while the site root keeps its own `/` key (PM default `A8`); an
 *   `index.html` suffix is not normalized (reviewer note `R7`);
 * - an empty or unparsable URL yields `null`: the caller leaves the page
 *   unannotated instead of inventing a storage key.
 */

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
 * `origin + pathname` part of an already normalized stored page key, in the same
 * form `pathOnlyKey` produces, so an index entry can be compared with a URL.
 */
export function pathOnlyOfPageKey(storedPageKey: string): string {
  const trimmed = storedPageKey.trim();
  let end = trimmed.length;

  const queryStart = trimmed.indexOf('?');
  if (queryStart >= 0 && queryStart < end) {
    end = queryStart;
  }
  const hashStart = trimmed.indexOf('#');
  if (hashStart >= 0 && hashStart < end) {
    end = hashStart;
  }

  const schemeStart = trimmed.indexOf('://');
  if (schemeStart < 0) {
    return trimmed.slice(0, end).toLowerCase();
  }

  const pathStart = trimmed.indexOf('/', schemeStart + 3);
  if (pathStart < 0 || pathStart >= end) {
    return trimmed.slice(0, end).toLowerCase();
  }

  const origin = trimmed.slice(0, pathStart).toLowerCase();
  return `${origin}${normalizePath(trimmed.slice(pathStart, end).toLowerCase())}`;
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
  return `${parsed.origin}${normalizePath(parsed.pathname.toLowerCase())}`;
}

/**
 * Path identity: empty segments collapse and a trailing slash is dropped, so
 * `/a`, `/a/` and `/a//` are one page; the site root keeps its `/` key.
 */
function normalizePath(path: string): string {
  const segments = path.split('/').filter((segment: string) => segment.length > 0);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}
