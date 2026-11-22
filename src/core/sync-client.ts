/**
 * The network boundary of the sync feature: the extension's note to the server's
 * note, and the two calls that carry it.
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Wire shape",
 * "What a POST carries", "Foreign entries are memory only", "A failed load never
 * blocks the page"; API taken verbatim from `docs/specs/sync-server.md`.
 *
 * Why this is `src/core/` and not `src/content/` or `src/popup/`: both halves of the
 * extension speak the same wire — the popup pushes one author's notes, the content
 * script pulls the page's notes — and the mapping between the stored record and the
 * server row is a **rule**, not a plumbing detail. Writing it twice would give the
 * extension two opinions about which local field becomes which server field. The
 * module stays pure of UI: no DOM, no `chrome.*`, no Russian string. The only impure
 * collaborator is the injected `SyncTransport` (`fetch` in every shipped caller).
 *
 * Two properties the callers depend on, stated here because they are the difference
 * between "a note is safe" and "a page is broken":
 *
 * - **a POST carries the current author's entries and nothing else** (ruling `A161`).
 *   `syncPayloadOf` filters by core `isSameAuthor`, so a foreign record that reached the
 *   caller by mistake is dropped at the boundary rather than sent back, and every note is
 *   reduced to the four fields the server accepts (`OutgoingNote`);
 * - **a failed load is an answer, never a throw** (ruling `A164`). `loadForeignNotes`
 *   answers `{ ok: false, code }` for every failure it can meet — no transport, a
 *   network error, a non-2xx status, a body that is not the server's shape — so the
 *   page caller has no rejection to handle and the local feature is never blocked.
 *
 * The map is thin on purpose, and it is **two** maps because the two directions are not
 * the same shape: a request note is `{id, text, comment, anchor}` (page from the path,
 * author from the body, timestamps from the server), while a returned row carries all
 * eight fields. The server stores `anchor` as opaque JSON (`A154`), so it travels
 * unchanged both ways; `visible` is never sent, because it is the reader's own display
 * flag and the schema has no column for it. A remote note therefore arrives visible,
 * which is the default of `createEntry` (ruling `A1`).
 *
 * Stage 17 (`t17-06`) adds a **third** call, and it is a delete rather than a map: the
 * one-note route of ruling `A181`, called by the reader's own delete so that a note
 * removed locally does not come back on the next load (`A182`). It shares this module
 * because it is the same server, the same target and the same failure vocabulary, and
 * because the server's triple `(page, author, note)` has to be spelled once.
 */

import type { Entry, EntryAnchor } from './entry';
import { createEntry } from './entry';
import { isSameAuthor, sortByCreatedAtAsc } from './entry-rules';
import type { SyncTarget } from './sync-settings';

/**
 * One note as the sync server **returns** it (`docs/specs/sync-server.md` -> API
 * contract). The page and the author travel in the URL and in the body of a request, so a
 * row on the way out carries them and a note on the way in does not.
 */
export interface RemoteNote {
  readonly id: string;
  readonly page_id: string;
  readonly author_id: string;
  readonly text: string;
  readonly comment: string;
  readonly anchor: unknown;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * One note as a request body carries it — the server's `model.NoteInput`.
 *
 * It has **no** `page_id` (that comes from the path), **no** `author_id` (the body's
 * `author_id` names the author once for the whole set) and **no** timestamps (the server
 * owns them: `created_at` is preserved on update and `updated_at` moves forward). Sending
 * any of the four is a `400` on a server that refuses unknown JSON fields, which is why
 * the request shape is declared here instead of reusing the response shape.
 */
export interface OutgoingNote {
  readonly id: string;
  readonly text: string;
  readonly comment: string;
  readonly anchor: unknown;
}

/** The one HTTP call this module makes; `fetch` in every shipped caller. */
export type SyncTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Why a sync call did not produce an answer. Machine codes only. */
export type SyncFailureCode =
  /** The address the record carried is not a usable server address (`A165`). */
  | 'server_invalid'
  /** There is nowhere to call: the switch is off or the field is empty (`A166`). */
  | 'sync_off'
  /** The transport is missing, or it rejected: the server was never reached. */
  | 'network'
  /** The server answered with a status other than 2xx. */
  | 'http'
  /** The server answered 2xx with a body this module cannot read. */
  | 'response_invalid';

/** Result of either call. */
export type SyncCallResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: SyncFailureCode };

/** What one save did: how many notes the server says it touched. */
export interface SyncSaveSummary {
  readonly saved: number;
}

/**
 * What one note delete did: how many rows the server says it removed.
 *
 * `1` is the ordinary answer and `0` is not an error — the server did not hold that
 * note, which is exactly the state the reader asked for (`A181`).
 */
export interface SyncDeleteSummary {
  readonly deleted: number;
}

/** What one load produced: the page's notes as the server holds them. */
export interface SyncLoadSummary {
  /** Every note of the page that the server returned, this author's included. */
  readonly notes: readonly RemoteNote[];
}

/**
 * One stored entry as the server's request note (`model.NoteInput`).
 *
 * The page is named by the route, the author by the body's `author_id`, the timestamps by
 * the server, and `visible` is the reader's own display flag with no column at all — so
 * exactly four fields travel, and this function is the one place that decides which.
 */
export function remoteNoteOf(entry: Entry): OutgoingNote {
  return {
    id: entry.id,
    text: entry.text,
    comment: entry.comment,
    anchor: entry.anchor,
  };
}

/**
 * One server note as a stored entry, or `null` when the row cannot be read as one.
 *
 * The decode is defensive by the same rule the local store applies: whatever came
 * over the wire is untrusted. A row with a missing or non-string field, a `null`
 * anchor or an unreadable `anchor` shape is skipped rather than guessed at — a note
 * that arrives half-readable is a note the page cannot anchor, and inventing its text
 * would put somebody else's words on the wrong span.
 *
 * `visible` is `true`: a foreign note has no local display flag yet, and `A1`'s
 * default is "shown".
 */
export function entryFromRemoteNote(note: RemoteNote): Entry | null {
  if (
    typeof note.id !== 'string' ||
    note.id === '' ||
    typeof note.page_id !== 'string' ||
    typeof note.author_id !== 'string' ||
    typeof note.text !== 'string' ||
    typeof note.comment !== 'string' ||
    typeof note.created_at !== 'string' ||
    typeof note.updated_at !== 'string'
  ) {
    return null;
  }
  const anchor = anchorFromUnknown(note.anchor);
  if (anchor === null) {
    return null;
  }
  return createEntry({
    id: note.id,
    pageKey: note.page_id,
    authorName: note.author_id,
    text: note.text,
    comment: note.comment,
    anchor,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    visible: true,
  });
}

/** The stored anchor of an unknown `anchor` value, `null` when it is not one. */
function anchorFromUnknown(value: unknown): EntryAnchor | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const text = record['text'];
  const prefix = record['prefix'];
  const suffix = record['suffix'];
  const fragmentCount = record['fragmentCount'];
  if (
    typeof text !== 'string' ||
    typeof prefix !== 'string' ||
    typeof suffix !== 'string' ||
    typeof fragmentCount !== 'number' ||
    !Number.isFinite(fragmentCount)
  ) {
    return null;
  }
  return { text, prefix, suffix, fragmentCount };
}

/**
 * The POST body of one press: the current author's notes on this page, and the
 * author named in `author_id` (rulings `A161`, `A160`).
 *
 * The filter is core `isSameAuthor`, the same answer the edit gate and the popup rows
 * use, so "mine" means one thing across the extension. The order is
 * `sortByCreatedAtAsc`, which is the order every other list of this extension uses;
 * the server does not care, but a body that is stable across presses is one a reader
 * can compare in the network panel.
 */
export function syncPayloadOf(
  entries: readonly Entry[],
  authorName: string,
): { author_id: string; notes: OutgoingNote[] } {
  const own = entries.filter((entry: Entry) => isSameAuthor(entry.authorName, authorName));
  return {
    author_id: authorName,
    notes: sortByCreatedAtAsc(own).map(remoteNoteOf),
  };
}

/** `<serverUrl>/notes/page/<pageKey>`, the page key percent-encoded (`A153` of the server spec). */
export function notesPageUrl(target: SyncTarget, pageKey: string): string {
  return `${target.notesPageBase}${encodeURIComponent(pageKey)}`;
}

/**
 * The path segment that names one note inside its author's page (`A181` of the server
 * spec), declared before the one URL that uses it.
 */
export const NOTE_DELETE_PATH = '/note/';

/**
 * `<serverUrl>/notes/page/<pageKey>/author/<authorName>/note/<noteId>` (ruling
 * `A181`): the page-scoped route of `notesPageUrl` plus the author and the note.
 *
 * Both names travel **percent-encoded**, exactly as the page key does: an author name
 * is the reader's own Russian text and a note id is an opaque string, so neither may
 * be read as a path separator or as a query. Nothing else is added — no timestamp, no
 * query parameter — because the server's predicate is the upsert triple and this
 * function is the only place the extension spells it.
 */
export function noteDeleteUrl(
  target: SyncTarget,
  pageKey: string,
  authorName: string,
  noteId: string,
): string {
  return `${notesPageUrl(target, pageKey)}/author/${encodeURIComponent(authorName)}${NOTE_DELETE_PATH}${encodeURIComponent(noteId)}`;
}

/**
 * One `POST /notes/page/{page_id}`: saves **one author's** notes.
 *
 * `!payload.ok` is decided by the caller through `syncTargetOf`; passing a target is
 * therefore proof that the feature is on and the address is usable, and the two
 * refusal codes are reserved for the transport itself.
 */
export async function saveOwnNotes(
  transport: SyncTransport,
  target: SyncTarget,
  pageKey: string,
  authorName: string,
  entries: readonly Entry[],
): Promise<SyncCallResult<SyncSaveSummary>> {
  const body = JSON.stringify(syncPayloadOf(entries, authorName));
  const answer = await request(transport, notesPageUrl(target, pageKey), body);
  if (!answer.ok) {
    return answer;
  }
  const saved = savedCountOf(answer.value);
  if (saved === null) {
    return { ok: false, code: 'response_invalid' };
  }
  return { ok: true, value: { saved } };
}

/**
 * One `GET /notes/page/{page_id}`: every author's notes on this page.
 *
 * The answer keeps **every** readable note of the page, this author's included: the
 * caller decides what is foreign (`A163` keeps only the others in memory), and
 * dropping rows here would hide whose note a row is from the only module that maps
 * the wire. A note this author also has locally is still returned, so the caller can
 * tell "the server knows about mine" from "the server has never seen mine".
 */
export async function loadForeignNotes(
  transport: SyncTransport,
  target: SyncTarget,
  pageKey: string,
): Promise<SyncCallResult<SyncLoadSummary>> {
  const answer = await request(transport, notesPageUrl(target, pageKey), null);
  if (!answer.ok) {
    return answer;
  }
  const notes = remoteNotesOf(answer.value);
  if (notes === null) {
    return { ok: false, code: 'response_invalid' };
  }
  return { ok: true, value: { notes } };
}

/**
 * The verb of the one-note delete, spelled once (`A181`, `A182`). A constant rather
 * than a literal at the call site, because the server route and the extension's one
 * caller have to agree on it and there is exactly one caller.
 */
export const DELETE_VERB = 'DELETE';

/**
 * One `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}` (ruling
 * `A182`): removes exactly the one note the reader just deleted locally.
 *
 * `{ deleted: 0 }` is a **success**, not a failure: the server did not hold that row,
 * so it holds no copy of it now, and the reader is told nothing (`A181`). The refusal
 * codes are the transport's, exactly as for the other two calls.
 *
 * The order of a delete is the caller's: the local write happens first and this call
 * second (`A182`), so a failure here can never undo the reader's action — it only
 * decides which sentence the page shows about the copy the server keeps.
 *
 * The page key and the author name travel percent-encoded in the path, the same rule
 * the other two routes follow; the reader's own note is the only one this function is
 * called for (`A168` keeps a foreign delete local), so `authorName` is always the
 * settings name of the caller.
 */
export async function deleteRemoteNote(
  transport: SyncTransport,
  target: SyncTarget,
  pageKey: string,
  authorName: string,
  noteId: string,
): Promise<SyncCallResult<SyncDeleteSummary>> {
  const answer = await request(
    transport,
    noteDeleteUrl(target, pageKey, authorName, noteId),
    DELETE_VERB,
  );
  if (!answer.ok) {
    return answer;
  }
  const deleted = deletedCountOf(answer.value);
  if (deleted === null) {
    return { ok: false, code: 'response_invalid' };
  }
  return { ok: true, value: { deleted } };
}

/** One call, with every failure a code. `body === null` means GET; `verb` carries it otherwise. */
async function request(
  transport: SyncTransport,
  url: string,
  body: string | null,
  verb?: string,
): Promise<SyncCallResult<unknown>> {
  return await send(transport, url, verb ?? (body === null ? 'GET' : 'POST'), body ?? '');
}

/** One call with one verb, with every failure a code. */
async function send(
  transport: SyncTransport,
  url: string,
  method: string,
  body: string,
): Promise<SyncCallResult<unknown>> {
  const init: { method: string; headers: Record<string, string>; body: string } = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  };

  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await transport(url, init);
  } catch {
    // A refused connection, a blocked request, an aborted one: the server was never
    // reached, and every one of those is the same answer to the reader.
    return { ok: false, code: 'network' };
  }
  if (!response.ok) {
    return { ok: false, code: 'http' };
  }
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, code: 'response_invalid' };
  }
}

/** `{"saved": N}` as a number, `null` when the body is not that. */
function savedCountOf(value: unknown): number | null {
  return countOf(value, 'saved');
}

/** `{"deleted": N}` as a number, `null` when the body is not that (`A181`). */
function deletedCountOf(value: unknown): number | null {
  return countOf(value, 'deleted');
}

/** One `{ <field>: N }` body as its number, `null` when the body is not that. */
function countOf(value: unknown, field: string): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const counted: unknown = (value as Record<string, unknown>)[field];
  return typeof counted === 'number' && Number.isFinite(counted) ? counted : null;
}

/** `{"notes": [...]}` as the rows it carries, `null` when the body is not that. */
function remoteNotesOf(value: unknown): RemoteNote[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const notes: unknown = (value as Record<string, unknown>)['notes'];
  if (!Array.isArray(notes)) {
    return null;
  }
  // Only the shape check that the mapping needs: a row is kept as it arrived and
  // `entryFromRemoteNote` answers "unreadable" for a row that cannot be an entry.
  return notes.filter((row: unknown): row is RemoteNote => typeof row === 'object' && row !== null);
}