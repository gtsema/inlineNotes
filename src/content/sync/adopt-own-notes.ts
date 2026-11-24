/**
 * The one adopter: the automatic load and the popup's reload both fill the page's
 * memory through `loadIntoMemory`, and both adopt the server's copy of the reader's own
 * notes on the way (rulings `A197`-`A199` of `docs/specs/sync-integration.md`, task
 * `t20-02`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Adopting the
 * reader's own notes (rulings `A197`-`A199`)", "The automatic load", "Where the notes
 * live".
 *
 * Why one module rather than two call sites: the rule is one rule, and its caller has
 * to become a writer of `chrome.storage.local`. `foreign-notes.ts` is deliberately a
 * module that declares **no storage port at all** (`A163`: a foreign note is memory
 * only), so the adopter cannot live there without breaking the property that makes the
 * foreign memory impossible to write from by mistake. It cannot live in `sync-notes.ts`
 * either: the popup's reload in `src/content/main.ts` is a second, independent caller,
 * and two adopters would be two opinions about when adoption happens.
 *
 * This module therefore exists for exactly one reason: to be the **single** content
 * module that imports core `src/core/entry-store-write.ts` on top of the two shipped
 * write flows (`create/create-note.ts`, `editor/edit-entry.ts`) and calls its one
 * adoption entry point. `tests/content-create-card-boundaries.spec.ts` pins that list.
 *
 * `A199` is the whole contract of the function below:
 *
 * - the row mapping happens **once**, here, through core `entryFromRemoteNote`: a row
 *   this extension cannot read as an entry is skipped, never guessed at, and never
 *   reaches the core write;
 * - the adoption is one core call, so it is one whole-list commit under the shipped
 *   `pages:v1` policy;
 * - it is **best effort**: a refusal (an unreadable index or slot, an unusable page
 *   key, a port that throws) is swallowed, changes nothing, does not block the paint
 *   and is not reported on the article. The row is simply not in the store this load,
 *   and the next load tries again.
 *
 * How the refusal is swallowed is a property of this function's shape rather than of a
 * `try` at the call sites: `adoptOwnNotesBestEffort` **never rejects**, so both load
 * paths can call it without a rejection handler — exactly like `loadIntoMemory`, whose
 * contract it joins. No `chrome.*` is named here; the port is an injected seam
 * (`StoragePort`), and a test drives the whole rule with the in-memory one.
 */

import type { Entry } from '../../core/entry';
import type { AdoptOwnNotesResult, EntryWriteCode } from '../../core/entry-store-write';
import { adoptOwnNotes } from '../../core/entry-store-write';
import type { StoragePort } from '../../core/storage-port';
import type { RemoteNote } from '../../core/sync-client';
import { entryFromRemoteNote } from '../../core/sync-client';

/**
 * What one adoption pass gets: the seam, the page address, the name, the rows.
 *
 * It is the shape the loader's seam carries (`foreign-notes.ts` -> `adoptOwnNotes`) plus
 * the seam itself, and the shape `createOwnNotesAdopter` binds the seam into.
 */
export interface AdoptOwnNotesPass {
  /** The storage seam the one core write goes through. */
  readonly port: StoragePort;
  /**
   * The page address the load used.
   *
   * It is the address and not the page key on purpose: `entry-store-write.ts`
   * resolves the key through the stored index, exactly like every other write (`N5`),
   * so a caller never resolves a page key of its own and a note can never be filed
   * under a key the store does not already list.
   */
  readonly url: string;
  /** The settings name; a row of another author is skipped by the core rule. */
  readonly currentName: string;
  /** The serialized rows `GET /notes/page/{page_id}` returned, unmapped. */
  readonly notes: readonly RemoteNote[];
}

/**
 * What the loader's seam carries: the same pass without the seam (`foreign-notes.ts`).
 *
 * The two load paths never hold a port: they hand `loadIntoMemory` these three fields
 * and nothing else, because a port travelling with a loader is a port the loader could
 * write with, and `foreign-notes.ts` is a module that declares no port at all (`A163`).
 */
export interface OwnNotesAdoptionRequest {
  /** The page address the load used; the key is core's to resolve. */
  readonly url: string;
  /** The settings name; a row of another author is skipped by the core rule. */
  readonly currentName: string;
  /** The serialized rows `GET /notes/page/{page_id}` returned, unmapped. */
  readonly notes: readonly RemoteNote[];
}

/**
 * **The shipped adopter**, built once per document over the page's storage seam.
 *
 * `src/content/main.ts` builds exactly one of these and hands it to both load paths (the
 * automatic load of `sync-notes.ts` and the popup's reload). Binding the seam here is
 * what keeps the write in one module while the rule stays in one other: neither load
 * path names the storage seam, and neither of them can write anything else.
 */
export function createOwnNotesAdopter(
  port: StoragePort,
): (pass: OwnNotesAdoptionRequest) => Promise<AdoptOwnNotesResult | null> {
  return async (pass: OwnNotesAdoptionRequest): Promise<AdoptOwnNotesResult | null> =>
    await adoptOwnNotesOfLoad({ port, ...pass });
}

/**
 * Adopts the reader's own notes of one load. **Cannot reject.**
 *
 * Returns the core answer when the write was attempted, `null` when there was nothing
 * to attempt — no row this extension can read as an entry at all, so no core call and
 * no port access of any kind. A caller ignores the value: it exists so a test can
 * observe "one call, with these rows" without a storage stub of its own.
 */
export async function adoptOwnNotesOfLoad(
  pass: AdoptOwnNotesPass,
): Promise<AdoptOwnNotesResult | null> {
  const remote: Entry[] = [];
  for (const note of pass.notes) {
    const entry = entryFromRemoteNote(note);
    if (entry === null) {
      // A row whose fields are not all readable as an entry is skipped, never guessed
      // at (`A197`): an unanchorable note cannot be painted, and a fabricated text
      // would put somebody's words on the wrong span.
      continue;
    }
    remote.push(entry);
  }
  if (remote.length === 0) {
    return null;
  }
  return await adoptOwnNotesBestEffort({ port: pass.port, url: pass.url, currentName: pass.currentName, remote });
}

/** Input of `adoptOwnNotesBestEffort`: already mapped rows, and the one write. */
export interface AdoptOwnNotesWrite {
  readonly port: StoragePort;
  /** The page address the load used; the key is core's to resolve. */
  readonly url: string;
  /** The settings name; a row of another author is skipped. */
  readonly currentName: string;
  /** Rows of this page as `entryFromRemoteNote` mapped them. */
  readonly remote: readonly Entry[];
}

/**
 * One best-effort adoption call: the core write, with every refusal answered rather
 * than thrown (`A199`).
 *
 * The `try` is here and nowhere else. `adoptOwnNotes` answers `{ ok: false, code }`
 * for the refusals it can produce, but the seam under it is a `StoragePort`, and a
 * port that **throws** instead of rejecting — a browser API behaving badly — must not
 * become a throw out of a boot step whose only other obligation is to paint the stored
 * notes (`A164`, `A199`). A throw is therefore reported as a refusal the caller
 * ignores, exactly like a `storage_unavailable` answer.
 */
async function adoptOwnNotesBestEffort(
  write: AdoptOwnNotesWrite,
): Promise<AdoptOwnNotesResult> {
  try {
    return await adoptOwnNotes(write.port, {
      url: write.url,
      currentName: write.currentName,
      remote: write.remote,
    });
  } catch {
    // `A199`: a refused adoption writes nothing, is not retried by this load and is
    // not reported on the article. The next load tries again.
    return { ok: false, code: REFUSED_BY_THROW };
  }
}

/**
 * The code a port that throws is reported as. `storage_unavailable` is the code the
 * core write answers for a port the seam cannot reach, so a throw and a rejection are
 * one answer to the reader rather than two.
 */
const REFUSED_BY_THROW: EntryWriteCode = 'storage_unavailable';
