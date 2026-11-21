p = 'src/core/sync-client.ts'
s = open(p, encoding='utf-8').read()

edits = []

edits.append((
"""/** One note as the sync server words it (`docs/specs/sync-server.md` -> API contract). */
export interface RemoteNote {
  readonly id: string;
  readonly page_id: string;
  readonly author_id: string;
  readonly text: string;
  readonly comment: string;
  readonly anchor: unknown;
  readonly created_at: string;
  readonly updated_at: string;
}""",
"""/**
 * One note as the sync server **returns** it (`docs/specs/sync-server.md` -> API
 * contract). The page and the author travel in the URL and in the body of a request, so
 * a row on the way out carries them.
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
 * owns them, `created_at` preserved on update and `updated_at` moved forward). Sending
 * any of the four is a `400` on a server that refuses unknown JSON fields, which is why
 * the request shape is declared here rather than reusing the response shape.
 */
export interface OutgoingNote {
  readonly id: string;
  readonly text: string;
  readonly comment: string;
  readonly anchor: unknown;
}"""))

edits.append((
"""/**
 * One stored entry as the server's note. `visible` and `pageKey`'s local spelling are
 * not part of the wire: the page is named by the route, and the display flag is the
 * reader's own.
 */
export function remoteNoteOf(entry: Entry): RemoteNote {
  return {
    id: entry.id,
    page_id: entry.pageKey,
    author_id: entry.authorName,
    text: entry.text,
    comment: entry.comment,
    anchor: entry.anchor,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}""",
"""/**
 * One stored entry as the server's request note (`model.NoteInput`).
 *
 * The page is named by the route, the author by the body's `author_id`, the timestamps by
 * the server, and `visible` is the reader's own display flag with no column at all — so
 * exactly four fields travel, and `remoteNoteOf` is the only function that decides which.
 */
export function remoteNoteOf(entry: Entry): OutgoingNote {
  return {
    id: entry.id,
    text: entry.text,
    comment: entry.comment,
    anchor: entry.anchor,
  };
}"""))

edits.append((
"""export function syncPayloadOf(
  entries: readonly Entry[],
  authorName: string,
): { author_id: string; notes: RemoteNote[] } {""",
"""export function syncPayloadOf(
  entries: readonly Entry[],
  authorName: string,
): { author_id: string; notes: OutgoingNote[] } {"""))

edits.append((
""" * - **a POST carries the current author's entries and nothing else** (ruling `A161`).
 *   `syncPayloadOf` filters by core `isSameAuthor`, so a foreign record that reached the
 *   caller by mistake is dropped at the boundary rather than sent back;""",
""" * - **a POST carries the current author's entries and nothing else** (ruling `A161`).
 *   `syncPayloadOf` filters by core `isSameAuthor`, so a foreign record that reached the
 *   caller by mistake is dropped at the boundary rather than sent back, and each note is
 *   reduced to the four fields the server accepts (`OutgoingNote`);"""))

edits.append((
""" * The map is thin on purpose. The server stores `anchor` as opaque JSON (`A154`), so
 * the anchor travels unchanged in both directions; `visible` is **not** sent, because
 * it is the reader's own display flag and the server's schema has no column for it.
 * A remote note therefore arrives visible, which is the default of `createEntry`
 * (ruling `A1`).""",
""" * The map is thin on purpose, and it is **two** maps because the two directions are not
 * the same shape: a request note is `{id, text, comment, anchor}` (the page comes from the
 * path, the author from the body, the timestamps from the server), while a returned row
 * carries all eight fields. The server stores `anchor` as opaque JSON (`A154`), so it
 * travels unchanged both ways; `visible` is never sent, because it is the reader's own
 * display flag and the schema has no column for it. A remote note therefore arrives
 * visible, which is the default of `createEntry` (ruling `A1`)."""))

for old, new in edits:
    assert old in s, old[:80]
    s = s.replace(old, new)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')