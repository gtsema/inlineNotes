/**
 * The edit path of the content layer: an existing entry gets a new comment, or the
 * entry is removed.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow / Sequence 4 and 5,
 * Rules / Semantics -> "Edit rights", "Overlap" (the moved-range half, and the
 * self-exclusion of the entry being edited), "Updated timestamp" (`A9`);
 * `docs/specs/content-overlay-ui.md` -> Flow / Sequence 5-6; task `t3-03` AC2, AC4,
 * AC5 and the residual-risk contract of `docs/state/t2-03-review.md`.
 *
 * Like the create path, this module is the only place in the content layer that
 * asks core for a page or for a write on the edit path. It owns no storage
 * knowledge: no key, no slot value, no `writeSlotThenIndex`, no `chrome.storage`.
 * Authorship, the comment cap, the timestamps, the removal and the refusal codes are
 * core's (`updateEntryComment`, `deleteEntry`), and the port adapter stays the only
 * module that touches the area.
 *
 * **The range of an entry is not rewritten by a save** (ruling `A45`). An ordinary
 * save changes `comment` and `updatedAt` and leaves the anchor exactly as it was, so
 * a note that resolved when it was opened resolves the same way afterwards: saving a
 * comment is not a re-anchor, and the editor has no authority to move a note the
 * reader did not move. The only way the span is touched is a **re-selection made
 * while the editor is open**, which the caller hands here as `reselection`; when it
 * is `null` this module performs no span work at all — no stream, no resolve, no
 * overlap question. What a *successful* re-selection writes is narrower than "move the
 * note": core `updateEntryComment` takes `comment` and `updatedAt` and keeps `anchor`
 * and `text` (accepted in `t1-05`), so a re-selection decides the `overlap` answer and
 * nothing else, and moving a note to other words stays a delete plus a create. That is
 * ruling `A78`, recorded in
 * `docs/specs/content-overlay-ui.md` -> "Ruling `A78`: what a successful `re-selection`
 * stores", and pinned by `tests/content-editor-controller.spec.ts` -> AC5.
 *
 * When there is a re-selection, the check is the same core check the create path
 * uses, and the self-exclusion is done the only way that is correct without a core
 * parameter: the edited entry is removed **from the entry list the check scans**
 * (`removeById` in `src/core/entry-rules.ts`), so its own resolved range is never in
 * the map the candidate is compared against and an entry cannot collide with itself
 * (`A45`, and the argument recorded in `docs/state/t2-03-review.md`). No `exceptId`
 * is invented, and no second overlap rule is written here. The same list is then
 * narrowed to the entries of the current author by core `entriesOfAuthor` (rulings
 * `A93`, `A100`): a `foreign entry` never blocks a move, and this module owns no
 * author comparison of its own — the one identity rule of `A99` is core's.
 *
 * One pass, one stream (`A37`), exactly as in the create path: the re-selection and
 * every stored entry of the page that the author filter keeps are resolved against
 * one string built in this function. A range remembered from the moment the editor opened is never compared
 * with anything — it is a position the page may no longer have, and comparing it
 * would refuse a valid move and accept an invalid one.
 *
 * What this path deliberately does **not** do:
 * - call `assertCreatable` or `findDuplicateEntry` for a preview (`A52`): the caps of
 *   a create say nothing about an edit, and a comment edit can neither add an entry
 *   nor exceed the page limit;
 * - re-check the overlap when there is no re-selection: the entry's own range is
 *   allowed to stand, which is what makes "save the comment of a note whose text the
 *   page moved" a plain comment edit instead of a refusal;
 * - repair, re-anchor or delete an entry whose anchor went stale while the editor was
 *   open: the save writes the comment, and the next paint pass reports it stale
 *   (staleness rule of `inline-comment-model.md`);
 * - let a page-boundary throw escape (ruling `A75`, task `t3-05` AC1): building the
 *   stream and capturing the re-selection are guarded **at this call site**, because
 *   this is the module that knows what that state means for an edit — the same answer
 *   the create path gives, `selection_lost`, with nothing written and the editor left
 *   open holding its draft.
 */

import { buildTextStream } from '../anchor/text-stream';
import type { TextStream } from '../anchor/text-stream';
import { resolvedEntryRanges } from '../anchor/entry-ranges';
import { captureSpan } from '../capture/selection-span';
import type { CapturedSpan } from '../capture/selection-span';
import { deleteEntry, updateEntryComment } from '../../core/entry-store-write';
import type { EntryWriteCode, EntryWriteResult } from '../../core/entry-store-write';
import { loadEntries } from '../../core/entry-store-read';
import { findOverlappingEntry } from '../../core/entry-overlap';
import { entriesOfAuthor, removeById, validateAuthorName } from '../../core/entry-rules';
import type { Entry } from '../../core/entry';
import { pageKeyFromUrl } from '../../core/page-key';
import type { StoragePort } from '../../core/storage-port';
import type { SyncTransport } from '../../core/sync-client';
import { deleteRemoteNote } from '../../core/sync-client';
import type { SyncTarget } from '../../core/sync-settings';
import type { ForeignNotes } from '../sync/foreign-notes';

/**
 * Every reason this path can answer with: each code the core edit and delete answers
 * with, plus the one failure the content layer reports itself. The union is keyed
 * here, where the codes come from, and total in `src/content/text.ts`, where the
 * Russian wording lives — the same arrangement the create path uses, and the reason
 * the editor can never invent a message at the call site.
 */
export type EditNoteCode = EntryWriteCode | 'selection_lost';

/** Outcome of one comment save: the stored entry, or the code the editor shows. */
export type EditNoteResult = { ok: true; entry: Entry } | { ok: false; code: EditNoteCode };

/**
 * What the server side of one delete did (ruling `A182`, task `t17-06`).
 *
 * It is deliberately not a `SyncFailureCode`: the reader is told nothing about a code, and
 * the three states are the three things that can be true about the copy the server holds:
 *
 * - `deleted` — the server removed that row (`{deleted: 1}`);
 * - `absent` — the server did not hold it (`{deleted: 0}`), which is a success (`A181`);
 * - `off` — nothing was asked: the feature is off, the address is unusable, or the local
 *   write was refused first (`A166`);
 * - `local` — a foreign note: the delete is local only and no server question exists
 *   (`A168`);
 * - `failed` — the call was made and did not answer 2xx with `{deleted: N}`. The note is
 *   gone locally, the server keeps a copy, and `CONTENT_STRINGS.deleteServerFailed` is
 *   the one sentence for it.
 */
export type ServerDeleteState = 'deleted' | 'absent' | 'off' | 'local' | 'failed';

/** Outcome of one delete: the removed entry, or the code, plus the server half. */
export type DeleteNoteResult = { ok: true; entry: Entry; serverDelete: ServerDeleteState } | {
  ok: false;
  code: EntryWriteCode;
  serverDelete: ServerDeleteState;
};

/** One delete of the reader's own note (`A182`). */
export interface DeleteNoteInput {
  port: StoragePort;
  /** Current page URL; the page key of the route is resolved by core from it. */
  url: string;
  /** The stored entry to remove. */
  id: string;
  /**
   * The settings name the editor was opened with, `null` when no usable one exists.
   *
   * It is the `author_id` of the route: the server addresses a note by the triple
   * `(page, author, note)`, so the name is part of the address and not a decoration.
   */
  currentName: string | null;
  /**
   * Where the call would go, from core `syncTargetOf` — `null` means "do not call"
   * (`A166`). It is injected rather than read here, because the settings read lives in
   * `sync-notes.ts` and this module has never touched it (`A31`).
   */
  target: SyncTarget | null;
  /** `fetch` in the page; a recorder in a test. */
  transport: SyncTransport;
}

/** Outcome of one foreign delete (`A168`): the memory forgot the note, the server was not asked. */
export type ForeignDeleteResult =
  | { ok: true; entry: Entry; serverDelete: ServerDeleteState }
  | { ok: false; code: EntryWriteCode; serverDelete: ServerDeleteState };

/** One comment save: which entry, what was typed, and what was re-selected. */
export interface EditNoteInput {
  port: StoragePort;
  /** Current page URL; the page key is resolved by core, not here. */
  url: string;
  /** Subtree the stream is built from — the root the editor was opened for. */
  root: Node;
  /** The entry being edited, by stored id. */
  id: string;
  /** Comment body as typed; core trims, measures and refuses what it may not store. */
  comment: string;
  /** Author name the editor was opened with; core compares it with the stored one. */
  currentName: string;
  /** One ISO stamp for `updatedAt` (ruling `A9`). */
  now: string;
  /**
   * The selection the reader made **while the editor was open**, or `null` for "no
   * re-selection" (`A45`). `null` is the normal case and means the entry keeps the
   * range it has.
   */
  reselection: Range | null;
}

/**
 * Saves the comment of one existing entry (Flow 5 of the overlay spec, model AC7).
 *
 * `{ ok: false, code: 'overlap' }` is the answer for "the new span intersects another
 * entry" (model AC8): nothing was sent to core, nothing was written, and the caller
 * keeps the editor open with the typed text. `{ ok: false, code: 'selection_lost' }`
 * is the answer for "the page no longer has the re-selected span": the same code the
 * create card shows, and the same promise — nothing was written.
 */
export async function saveEntryComment(input: EditNoteInput): Promise<EditNoteResult> {
  const page = await loadEntries(input.port, input.url);

  if (input.reselection !== null) {
    // Guarded here, not inside the capture module (ruling `A75`): `Range.intersectsNode`
    // throws `InvalidAccessError` in a real engine once a boundary node the editor kept
    // and the fragments of a freshly built stream no longer share a root — the site
    // re-rendered the paragraph while the editor stood open. A test-only DOM
    // implementation answers `false` for that state instead of throwing, and no test
    // injects the throw on the edit path, so this `catch` is **named, not driven by a
    // throw**: the AC5 case of `tests/content-editor-controller.spec.ts` reaches the
    // sibling `span === null` branch below with a `Range` the stream rebuilt at the press
    // resolves no span for.
    let stream: TextStream;
    let span: CapturedSpan | null;
    try {
      stream = buildTextStream(input.root);
      span = captureSpan(stream, input.reselection);
    } catch {
      return { ok: false, code: 'selection_lost' };
    }
    if (span === null) {
      // The re-selection is gone: whitespace-only, detached, or inside the overlay
      // host. Refusing is the honest answer, because the reader meant to move the note
      // and there is nowhere to move it to.
      return { ok: false, code: 'selection_lost' };
    }

    // Self-exclusion (`A45`): the entry being edited leaves the list the core check
    // scans, so its own span can never be the intersecting one. `others` is what the
    // resolve walks too, so the edited entry is not even resolved twice.
    //
    // Per-author scoping (`A93`, `A100`): the check answers only against entries of
    // the current author, so moving one's own note across words another author
    // covered is allowed. The filter is core's `entriesOfAuthor` — the same identity
    // `canEdit` and the popup row use (`A99`) — because this call site owns no author
    // rule of its own, and `src/core/entry-overlap.ts` stays author-blind by design.
    const others = removeById(page.entries, input.id);
    const ownOthers = entriesOfAuthor(others, input.currentName);
    const over = findOverlappingEntry(
      { range: span.candidate, comment: input.comment },
      ownOthers,
      resolvedEntryRanges(stream, input.root, ownOthers),
    );
    if (over !== null) {
      return { ok: false, code: 'overlap' };
    }
  }

  const write = await updateEntryComment(input.port, {
    url: input.url,
    id: input.id,
    comment: input.comment,
    currentName: input.currentName,
    now: input.now,
  });

  return write.ok ? { ok: true, entry: write.entry } : { ok: false, code: write.code };
}

/**
 * One delete of the reader's own note (rulings `A44`, `A182`, task `t17-06`).
 *
 * Three facts, in this order, and the order is the ruling:
 *
 * 1. **the local write comes first.** The page must react at once, and a server that is
 *    down must not undo the reader's action; so core `deleteEntry` runs before anything
 *    is sent, and a refusal from core answers here without a request;
 * 2. **then the server, for this one note** (`A182`): one
 *    `DELETE /notes/page/{page_id}/author/{author_id}/note/{note_id}`, addressed by the
 *    entry's own page key, its author and its id — never by the popup's page-scoped
 *    route, which would delete the author's whole page (`A181`);
 * 3. **and the outcome is reported**: `serverDelete` is `'deleted'` when the server
 *    removed the row, `'absent'` when it never held it (`{deleted: 0}` is a success, not
 *    an error) and `'failed'` for every refusal code. Only `'failed'` has a sentence, and
 *    it is `CONTENT_STRINGS.deleteServerFailed` — the note is deleted here and the server
 *    still holds a copy.
 *
 * What decides whether a call is made at all:
 *
 * - a **foreign** note is never sent (`A168`): that path is `removeForeignFromPage`, which
 *   performs no request and keeps the delete local;
 * - with **no target** — synchronization off, or an address that does not parse — nothing
 *   is called and the outcome is `'off'` (`A166`). That is not a failure the reader has to
 *   fix: they turned the feature off, so there is no copy they asked anyone to remove;
 * - a **page address core cannot key**, or a **settings record with no usable name**, is
 *   the same answer as no target: there is no route to call and no author to name, and the
 *   note stays deleted locally.
 *
 * The refusal of core is reported as it always was, and the server is not called for a
 * write that did not happen: a note that is still stored must not leave the server.
 */
export async function removeNoteFromPage(input: DeleteNoteInput): Promise<DeleteNoteResult> {
  const removed = await removeEntryFromPage(input.port, input.url, input.id);
  if (!removed.ok) {
    return { ok: false, code: removed.code, serverDelete: 'off' };
  }

  // `A166` first, and it is the same reader the automatic load uses: `syncTargetOf` over
  // the settings record this call just read through the injected seam.
  const target = input.target;
  if (target === null) {
    return { ok: true, entry: removed.entry, serverDelete: 'off' };
  }
  const pageKey = pageKeyFromUrl(input.url);
  const authorName = input.currentName === null ? null : validateAuthorName(input.currentName).ok
    ? input.currentName
    : null;
  if (pageKey === null || authorName === null) {
    return { ok: true, entry: removed.entry, serverDelete: 'off' };
  }

  const answer = await deleteRemoteNote(
    input.transport,
    target,
    pageKey,
    authorName,
    input.id,
  );
  if (!answer.ok) {
    return { ok: true, entry: removed.entry, serverDelete: 'failed' };
  }
  return {
    ok: true,
    entry: removed.entry,
    serverDelete: answer.value.deleted > 0 ? 'deleted' : 'absent',
  };
}

/**
 * Removes one foreign note from this page's memory and nothing else (ruling `A168`,
 * unchanged by `t17-06`).
 *
 * A foreign note has no stored record: it lives in the content script's memory for this
 * tab, so the delete is one `dismiss` of it — no server call, no storage write, and the
 * note is back on the next page load. The answer is `'local'` because there is no server
 * side of this delete to report, which is what keeps the two paths of `removeNoteFromPage`
 * and this function from being confused: the first may ask the server about **one** note,
 * this one never asks anything.
 */
export function removeForeignFromPage(memory: ForeignNotes, noteId: string): ForeignDeleteResult {
  const note = memory.all().find((candidate) => candidate.entry.id === noteId);
  if (note === undefined) {
    return { ok: false, code: 'entry_not_found', serverDelete: 'local' };
  }
  const dismissed = memory.dismissNote(note.entry.authorName, note.entry.id);
  if (!dismissed) {
    return { ok: false, code: 'entry_not_found', serverDelete: 'local' };
  }
  return { ok: true, entry: note.entry, serverDelete: 'local' };
}

/**
 * Removes one entry of this page (the delete button of Flow 5, model AC11, task
 * `t3-03` AC4).
 *
 * No confirmation and no undo exist in v1 (ruling `A44`), so this function is the
 * whole of the local half of the delete path: it hands core `deleteEntry` the id and
 * reports the coded answer. Authorship is **not** checked here — `A25` rules that core
 * does not gate `deleteEntry` by author and that the UI is what hides the affordance —
 * so the editor controller's refusal to open for a foreign entry is the only line that
 * keeps a reader from deleting somebody else's note, and it is pinned in
 * `tests/content-editor-controller.spec.ts`.
 *
 * Since `t17-06` this is the **first half** of the reader's own delete: the whole path, 
 * with the one-note server call and its report, is `removeNoteFromPage` above. It stays
 * exported because it is the local write stated on its own, and the pinned answer of the
 * `t3-03`/`t3-05` tests is still exactly this call.
 */
export function removeEntryFromPage(
  port: StoragePort,
  url: string,
  id: string,
): Promise<EntryWriteResult> {
  return deleteEntry(port, { url, id });
}
