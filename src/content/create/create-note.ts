/**
 * The create path of the content layer: one selection becomes one core create.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow / Sequence 3 and 5,
 * Rules / Semantics -> "Resolved range" (`A37`), "Stale entry" (`A24`), "Hidden
 * entry" (`A22`), "Author name"; task `t3-01` AC2, AC4, AC5 and the hand-over
 * contracts of `docs/state/t2-03-review.md` and `docs/state/t3-01-settings-read-core-review.md`.
 *
 * This is the only shipped content module that asks core for a page, for the
 * author name, or for a write, and the only one that calls `createEntryOnPage`.
 * It owns no storage knowledge of its own: no key, no slot value, no
 * `writeSlotThenIndex`, no `chrome.storage` — the write policy, the caps and the
 * refusal codes belong to core, and the port adapter is the only module allowed to
 * touch the area (`docs/specs/inline-comment-model.md` -> "Storage layout").
 *
 * One pass, one stream (`A37`, `N7`, ruling `A29`): the page read is awaited
 * first, and from the moment `buildTextStream` runs nothing asynchronous happens
 * until the resolved numbers are in hand. The candidate range and the range of
 * every stored entry of that page therefore come from one and the same string,
 * which is the only way the overlap and duplicate answers mean anything. The
 * stream is never remembered between passes: a save re-builds it, because the page
 * may have moved the text since the card was opened, and a remembered span would
 * be a position the page no longer has.
 *
 * Stale entries are absent from `byEntryId` (`A24`) — never mapped to a zero range,
 * which core would read as "no span" anyway but which would hide the difference
 * between "gone" and "measured as nothing". Hidden entries are included (`A22`):
 * the popup checkbox governs painting, not the span. The ids are the stored ids of
 * the same page read the write performs (`t2-03` contract), so a map built from a
 * different page key cannot masquerade as a complete one.
 *
 * What the layer refuses to do:
 * - call `assertCreatable` for a preview (`A52`): its `spans` is optional there, so
 *   a preview would answer "allowed" and re-open the failure class `t2-03` remark 3
 *   closed. The only answer is the write itself;
 * - read, decode or re-trim `settings:v1` (`A31`): the author name comes from core
 *   `loadSettings`, and "is there an author" is answered by `validateAuthorName`,
 *   never by a truthiness test of `s.name` (a stored name above the cap is non-empty
 *   and unusable) and never by branching on `s.codes`;
 * - invent a name, a default or a repair (`spec :75` — that is `t4-02`);
 * - treat a `null` from `buildAnchor` as a storage failure: it means "there is no
 *   span to create", so the card never learns a code that would suggest the note
 *   was attempted;
 * - swallow a page-boundary throw inside the capture module or inside core (ruling
 *   `A75`, task `t3-05` AC1): `captureSpan` keeps calling `Range.intersectsNode` and
 *   keeps propagating the `InvalidAccessError` a real engine throws for a boundary node
 *   the page detached. This module is the call site that knows what that answer means
 *   for a create, so the guard sits here and turns it into `selection_lost` — never
 *   into a rejected promise the card cannot answer.
 */

import type { EntryWriteCode } from '../../core/entry-store-write';
import { buildTextStream } from '../anchor/text-stream';
import type { TextStream } from '../anchor/text-stream';
import { locateAnchorInStream } from '../anchor/locate-anchor';
import { captureSpan } from '../capture/selection-span';
import type { CapturedSpan } from '../capture/selection-span';
import { createEntryOnPage } from '../../core/entry-store-write';
import { loadEntries } from '../../core/entry-store-read';
import { loadSettings } from '../../core/settings-store';
import { validateAuthorName } from '../../core/entry-rules';
import type { CodePointRange, ResolvedEntryRanges, ResolvedSpans } from '../../core/entry-overlap';
import type { Entry } from '../../core/entry';
import type { RandomSource } from '../../core/entry-rules';
import type { StoragePort } from '../../core/storage-port';

/**
 * Every reason this path can answer with: each code the core write answers with,
 * plus the one failure the content layer reports itself. `src/content/text.ts`
 * maps it to Russian wording, which is why the union is keyed here (where the
 * codes come from) and total there (where the strings live).
 */
export type CreateNoteCode = EntryWriteCode | 'selection_lost';

/** Outcome of one create: the stored entry, or the code the card has to show. */
export type CreateNoteResult = { ok: true; entry: Entry } | { ok: false; code: CreateNoteCode };

/** One create attempt: where to write, what was selected, what was typed. */
export interface CreateNoteInput {
  port: StoragePort;
  /** Current page URL; the page key is resolved by core, not here. */
  url: string;
  /** Subtree the stream is built from — the same one the capture was measured on. */
  root: Node;
  /** Boundaries the card captured when it opened; re-resolved, never reused. */
  range: Range;
  /** Comment body as typed; core trims and measures it. */
  comment: string;
  /** Author name the card was opened with, from `currentAuthorName`. */
  authorName: string;
  /** One ISO stamp for both entry timestamps (ruling `A9`). */
  now: string;
  /** Random source for the entry id. */
  rng: RandomSource;
}

/**
 * The author gate of Flow 3 step 1: the current name, or `null` when the settings
 * give no usable one.
 *
 * Exactly one `loadSettings` call, and the decision is core's own rule applied to
 * its answer (`validateAuthorName`), which is what keeps an over-long stored name
 * out of the create path instead of turning it into a half-valid author.
 */
export async function currentAuthorName(port: StoragePort): Promise<string | null> {
  const settings = await loadSettings(port);
  const name = validateAuthorName(settings.name);
  return name.ok ? name.normalized : null;
}

/**
 * Creates the entry for one captured selection (Flow 3 steps 2-7).
 *
 * `{ ok: false, code: 'selection_lost' }` is the content-layer answer for "the
 * page no longer has that span": nothing was sent to core, nothing was stored, and
 * the card stays open with its text so the user can re-select. A page-boundary
 * throw over a detached boundary node answers with the same code (task `t3-05` AC1,
 * ruling `A75`).
 */
export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
  const page = await loadEntries(input.port, input.url);

  // The two calls of this path that touch the page, guarded where they are called
  // (task `t3-05` AC1, ruling `A75`). `Range.intersectsNode` throws `InvalidAccessError`
  // in a real engine once the boundary node the card kept and the fragments of a
  // freshly built stream no longer share a root: the site re-rendered the paragraph
  // between the card opening and the save press. A test-only DOM implementation answers
  // `false` for that same state, so no other test in this repository runs the throw;
  // `tests/content-save-throw-safety.spec.ts` injects it. `buildTextStream` walks the
  // same tree and is guarded with it for the same reason.
  //
  // The answer is the code the card already knows how to show: the page does not have
  // that span. No code is invented, nothing is written, and the card stays usable —
  // open, holding the draft, with its save button live — instead of stuck in `busy`.
  let stream: TextStream;
  let span: CapturedSpan | null;
  try {
    stream = buildTextStream(input.root);
    span = captureSpan(stream, input.range);
  } catch {
    return { ok: false, code: 'selection_lost' };
  }
  if (span === null) {
    return { ok: false, code: 'selection_lost' };
  }

  const spans: ResolvedSpans = {
    candidate: span.candidate,
    byEntryId: resolvedEntryRanges(stream, input.root, page.entries),
  };

  const write = await createEntryOnPage(input.port, {
    url: input.url,
    // The anchor's own text, never a second measurement of the selection
    // (ruling `A26`): anything else core refuses with `entry_invalid`.
    text: span.anchor.text,
    comment: input.comment,
    anchor: span.anchor,
    currentName: input.authorName,
    spans,
    now: input.now,
    rng: input.rng,
  });

  return write.ok ? { ok: true, entry: write.entry } : { ok: false, code: write.code };
}

/**
 * One resolve per stored entry of the page, against the stream the candidate came
 * from (`A37`): the range each entry would be painted over. A locate that reports
 * `anchor_not_found` or `anchor_stale` leaves the entry out of the map, which is
 * how a stale entry stops blocking a create (`A24`).
 *
 * `locateAnchorInStream` is used instead of `locateAnchor` on purpose: the
 * one-stream-per-create rule of `A37` and `N7` is what "one pass" means, and
 * re-entering `locateAnchor` would build a new stream per entry.
 */
function resolvedEntryRanges(
  stream: TextStream,
  root: Node,
  entries: readonly Entry[],
): ResolvedEntryRanges {
  const ranges = new Map<string, CodePointRange>();
  for (const entry of entries) {
    const located = locateAnchorInStream(stream, root, entry.anchor);
    if (!located.ok) {
      continue;
    }
    const first = located.fragments[0];
    const last = located.fragments[located.fragments.length - 1];
    ranges.set(entry.id, { start: first.streamStart, end: last.streamEnd });
  }
  return ranges;
}
