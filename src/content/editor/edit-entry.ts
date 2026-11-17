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
 * nothing else, and moving a note to other words stays a delete plus a create until the
 * PM rules otherwise. That open question is recorded in
 * `docs/specs/content-overlay-ui.md` -> "Open question: what a successful re-selection
 * stores"; it is not resolved in this file.
 *
 * When there is a re-selection, the check is the same core check the create path
 * uses, and the self-exclusion is done the only way that is correct without a core
 * parameter: the edited entry is removed **from the entry list the check scans**
 * (`removeById` in `src/core/entry-rules.ts`), so its own resolved range is never in
 * the map the candidate is compared against and an entry cannot collide with itself
 * (`A45`, and the argument recorded in `docs/state/t2-03-review.md`). No `exceptId`
 * is invented, and no second overlap rule is written here.
 *
 * One pass, one stream (`A37`), exactly as in the create path: the re-selection and
 * every stored entry of the page are resolved against one string built in this
 * function. A range remembered from the moment the editor opened is never compared
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
import { removeById } from '../../core/entry-rules';
import type { Entry } from '../../core/entry';
import type { StoragePort } from '../../core/storage-port';

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
    // implementation answers `false` for that state, so the throw is injected in
    // `tests/content-editor-edit-path.spec.ts` rather than coaxed out of a fake engine.
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
    const others = removeById(page.entries, input.id);
    const over = findOverlappingEntry(
      { range: span.candidate, comment: input.comment },
      others,
      resolvedEntryRanges(stream, input.root, others),
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
 * Removes one entry of this page (the delete button of Flow 5, model AC11, task
 * `t3-03` AC4).
 *
 * No confirmation and no undo exist in v1 (ruling `A44`), so this function is the
 * whole of the delete path: it hands core `deleteEntry` the id and reports the coded
 * answer. Authorship is **not** checked here — `A25` rules that core does not gate
 * `deleteEntry` by author and that the UI is what hides the affordance — so the
 * editor controller's refusal to open for a foreign entry is the only line that
 * keeps a reader from deleting somebody else's note, and it is pinned in
 * `tests/content-editor-controller.spec.ts`.
 */
export function removeEntryFromPage(
  port: StoragePort,
  url: string,
  id: string,
): Promise<EntryWriteResult> {
  return deleteEntry(port, { url, id });
}
