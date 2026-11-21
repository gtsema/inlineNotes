/**
 * The popup's sync button: one press, one `POST`, one of three states (Stage 17,
 * rulings `A161`, `A162`, `A166`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "The sync
 * button", "What a press sends", "The three states".
 *
 * What this module owns, and nothing else:
 *
 * - **who gets the button.** `syncAvailable` answers the ruling `A166` question and is
 *   the only thing the component asks: off switch or empty address means `null`, and
 *   the row renders no button at all. `A161` is the second half of the same answer —
 *   only the row of the current author gets it, which `isOwn` already says.
 * - **what a press sends.** One call of core `saveOwnNotes` with the entries the page
 *   row already listed, and `syncPayloadOf` inside core does the filtering by
 *   `isSameAuthor`: the body carries the current author's notes and nothing else, so
 *   the foreign entries of a page are never sent back to the server (`A163`).
 * - **what a press answers.** A result, never a rejection: `saved` (back to idle),
 *   `failed` (an error code the component turns into the red state), or `off` (the
 *   switch moved under the popup, so nothing was called — `A166` again).
 *
 * The three states themselves (`A162`) are the component's: this module has no clock,
 * no timer and no `setTimeout`. A state that returns to idle "after a while" would be
 * exactly the timer the ruling forbids, so the answer of the request is what moves it.
 *
 * No `chrome.*`, no DOM and no Russian string lives here: the port, the address read
 * and the transport are injected, and the wording of every code is in
 * `src/popup/text.ts`.
 */

import type { Entry } from '../core/entry';
import { isSameAuthor, validateAuthorName } from '../core/entry-rules';
import { loadEntries } from '../core/entry-store-read';
import { loadSettings } from '../core/settings-store';
import type { StoragePort } from '../core/storage-port';
import type { SyncFailureCode, SyncTransport } from '../core/sync-client';
import { saveOwnNotes } from '../core/sync-client';
import type { SyncTarget } from '../core/sync-settings';
import { syncTargetOf } from '../core/sync-settings';

/** What one press did, in the component's terms. */
export type SyncPressResult =
  | { readonly ok: true; readonly saved: number }
  | { readonly ok: false; readonly code: SyncFailureCode }
  | { readonly ok: false; readonly code: 'nothin_to_send'; readonly saved: 0 };

/** Everything a press needs from its caller. */
export interface SyncPressSource {
  /** The one storage port adapter, so the notes are read through core. */
  readonly port: StoragePort;
  /** URL of the tab the popup describes (`A49`). */
  readonly pageUrl: () => Promise<string | null>;
  /** `fetch` in the popup; a recorder in a test. */
  readonly transport: SyncTransport;
}

/**
 * The address the popup may call, `null` when it may not (`A166`).
 *
 * One read of `settings:v1` through core and one call of core `syncTargetOf`: the same
 * two steps the content script takes before its automatic load, so the button and the
 * page cannot disagree about whether synchronization is on.
 */
export async function syncAvailable(port: StoragePort): Promise<SyncTarget | null> {
  const settings = await loadSettings(port);
  return syncTargetOf(settings);
}

/**
 * One press of the sync button: `POST /notes/page/{page_id}` with the current
 * author's notes of this page.
 *
 * The notes are read again here rather than taken from the row the caller rendered:
 * a press must send what the store holds **now**, and the popup's view may have been
 * built a few seconds earlier. Nothing is written to `chrome.storage.local` — a press
 * is a network call and only that — and the page is not messaged: `A50` keeps the
 * extension's only notification channel the storage write, and this path has none.
 *
 * `nothin_to_send` is not an error state: an author with no note on this page has
 * nothing to push, and the button returns to idle without a request. It is a code
 * rather than a silent success so the caller can decide, and the wording map does not
 * have to grow.
 */
export async function pressSync(source: SyncPressSource, authorName: string): Promise<SyncPressResult> {
  const settings = await loadSettings(source.port);
  const target = syncTargetOf(settings);
  if (target === null) {
    // `A166`: the switch was turned off (or the address cleared) while the popup stood.
    return { ok: false, code: 'sync_off' };
  }
  const name = validateAuthorName(authorName);
  if (!name.ok) {
    return { ok: false, code: 'sync_off' };
  }

  const url = await source.pageUrl();
  const page = await loadEntries(source.port, url ?? '');
  if (page.pageKey === null) {
    return { ok: false, code: 'server_invalid' };
  }
  const own: readonly Entry[] = page.entries.filter((entry: Entry) =>
    isSameAuthor(entry.authorName, name.normalized),
  );
  if (own.length === 0) {
    return { ok: false, code: 'nothin_to_send', saved: 0 };
  }

  const answer = await saveOwnNotes(
    source.transport,
    target,
    page.pageKey,
    name.normalized,
    page.entries,
  );
  if (!answer.ok) {
    return { ok: false, code: answer.code };
  }
  return { ok: true, saved: answer.value.saved };
}
/**
 * The popup's handle on one press: created once per popup document, and the only place
 * that calls `pressSync`.
 *
 * A class rather than a free function, so the component holds no promise of its own and
 * the port, the address read and the transport are taken once, at construction, from
 * the injection token. Nothing here keeps state: a press is stateless, and the button's
 * three states are the component's signal (`A162` — the state follows the answer of this
 * call and no timer).
 */
export class PopupSyncPress {
  private readonly source: SyncPressSource;

  constructor(source: SyncPressSource) {
    this.source = source;
  }

  /** One press for one author: the current author's notes of this page, or a code. */
  async press(authorName: string): Promise<SyncPressResult> {
    return await pressSync(this.source, authorName);
  }

  /** Whether this page may show a sync button at all (ruling `A166`). */
  async available(): Promise<boolean> {
    return (await syncAvailable(this.source.port)) !== null;
  }
}
