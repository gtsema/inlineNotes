/**
 * The server address rule: what a configured sync server is allowed to be.
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Server
 * address" (ruling `A165`) and "Synchronization is off" (ruling `A166`).
 *
 * Three responsibilities, all of them pure:
 *
 * - `parseServerAddress` turns a typed value into the address the extension may call:
 *   `http://host[:port]` or `https://host[:port]`, with no path, no query, no hash,
 *   no credentials and no trailing slash. Anything else is refused with a machine
 *   code, so the options page can show the one Russian sentence of its own text
 *   module and the record is never written;
 * - `normalizeServerAddress` is the stored form of an accepted address — the same
 *   string with the trailing slash that `URL.origin` never carries removed;
 * - `syncTargetOf` answers the one question both readers ask before any work:
 *   **is there somewhere to call, and am I allowed to call it?** A switch that is off
 *   or an empty address answers `null`, and ruling `A166` turns that `null` into "no
 *   request at all, no sync button, no load".
 *
 * Why the base path is refused rather than kept: the server's routes are absolute
 * (`/notes/page/{page_id}`), so a configured `http://host:8080/inlinenotes` would
 * silently drop its own path at the first request and call a server that is not
 * there. Refusing it in the options page is the honest answer, and it is what
 * `A165`'s "validated before use" means.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network. `URL` is a
 * language built-in, the same one `src/core/page-key.ts` already uses.
 */

/** Everything `syncTargetOf` needs: the two fields of `settings:v1`. */
export interface SyncSettingsLike {
  readonly serverUrl: string;
  readonly syncEnabled: boolean;
}

/** Why an address was refused. The options text module owns its Russian wording. */
export type ServerAddressCode =
  /** Not a URL at all, or no scheme. */
  | 'server_invalid'
  /** A scheme other than `http:` or `https:`. */
  | 'server_scheme'
  /** A path, a query, a hash, credentials, or no host. */
  | 'server_shape';

/** Result of `parseServerAddress`. */
export type ServerAddressResult =
  | { readonly ok: true; readonly serverUrl: string }
  | { readonly ok: false; readonly code: ServerAddressCode };

/** Where the extension may send requests, `null` when it may not send any. */
export interface SyncTarget {
  /** The configured address, trimmed, without a trailing slash. */
  readonly serverUrl: string;
  /** The page-key path prefix both endpoints share: `<serverUrl>/notes/page/`. */
  readonly notesPageBase: string;
}

/**
 * The page-key route of the sync server, absolute, as `docs/specs/sync-server.md`
 * fixes it. Declared before its use so the constant sits at the top of the module.
 */
export const NOTES_PAGE_PATH = '/notes/page/';

/** Schemes a server address may carry (ruling `A165`). */
const ALLOWED_SCHEMES: readonly string[] = ['http:', 'https:'];

/**
 * Decodes one typed address.
 *
 * The order of the answers is the order the reader fixes them in: "that is not a
 * link" first, then "that is not http or https", then "that is not just an address".
 * An empty or whitespace-only value is valid and means "not configured" — clearing
 * the field is how the reader turns synchronization off, so it must not be an error.
 */
export function parseServerAddress(raw: string): ServerAddressResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, serverUrl: '' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: 'server_invalid' };
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { ok: false, code: 'server_scheme' };
  }
  if (parsed.host === '') {
    return { ok: false, code: 'server_shape' };
  }
  // A base path, a query, a fragment or credentials have no meaning for a server
  // whose routes start at `/`, and `URL` would drop them silently at the first call.
  if (
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return { ok: false, code: 'server_shape' };
  }

  return { ok: true, serverUrl: parsed.origin };
}

/**
 * The stored form of an address: the parsed `origin`, or the trimmed value when it
 * does not parse at all. A value that never parsed cannot reach the store through
 * the options page (`A165` refuses it first), so the fallback only answers a damaged
 * record read back from storage, and it answers it without inventing anything.
 */
export function normalizeServerAddress(raw: string): string {
  const parsed = parseServerAddress(raw);
  return parsed.ok ? parsed.serverUrl : raw.trim();
}

/**
 * The address both readers are allowed to call, or `null` when there is none.
 *
 * This is ruling `A166` in one function and one place: the content script asks it
 * before the automatic load, and the popup asks it before it renders the sync
 * button. Two answers, one rule, so "the button is visible but does nothing" and "the
 * page loads while the button is hidden" cannot both be true.
 */
export function syncTargetOf(settings: SyncSettingsLike): SyncTarget | null {
  if (!settings.syncEnabled) {
    return null;
  }
  const parsed = parseServerAddress(settings.serverUrl);
  if (!parsed.ok || parsed.serverUrl === '') {
    return null;
  }
  return {
    serverUrl: parsed.serverUrl,
    notesPageBase: `${parsed.serverUrl}${NOTES_PAGE_PATH}`,
  };
}
