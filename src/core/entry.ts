/**
 * The stored object of the product: one `Entry` = one inline note.
 *
 * Pure module: no DOM, no `chrome.*`, no clock, no randomness, no framework.
 * Rule owner: `docs/specs/inline-comment-model.md` (Rules / Semantics, Flow 4).
 *
 * Division inside `src/core/`:
 * - `entry.ts` (this file) — the shape of the object and its field defaults;
 * - `entry-rules.ts` — the rules over that shape: caps, authorship, edit rights,
 *   id and name generation, list helpers.
 *
 * The caller supplies `id`, `createdAt` and `updatedAt`: randomness lives behind an
 * injected `() => number` and the clock behind an ISO string, so every caller
 * (content script, storage adapter, unit test) stays deterministic. `text` and
 * `comment` are stored as given; `entry-rules.ts` exposes the normalized forms the
 * caller must pass in.
 */

/**
 * Text-based locator of the selected span (spec: Rules / Semantics -> "Anchoring").
 * Declared here because it is part of the stored shape; the codec that builds and
 * resolves it is Stage 2, so nothing in this task reads `prefix`/`suffix`.
 */
export interface EntryAnchor {
  /** Normalized selection text (whitespace collapsed): the anchoring authority. */
  text: string;
  /** Up to 40 normalized characters taken from before `text`; empty at page start. */
  prefix: string;
  /** Up to 40 normalized characters taken from after `text`; empty at page end. */
  suffix: string;
  /** How many DOM fragments the original selection spanned (1 for a single node). */
  fragmentCount: number;
}

/** One stored note. This is the only value shape inside `notes:v1:<slotKey>`. */
export interface Entry {
  /** Stable identity: 12 lowercase base36 characters (`randomId` in `entry-rules.ts`). */
  id: string;
  /** Normalized page identity (`page-key.ts`); the entry never appears on another page. */
  pageKey: string;
  /** Author name at creation time, kept after the options name changes. */
  authorName: string;
  /** Selected text as displayed in the popup list. */
  text: string;
  /** Note body, at most `MAX_COMMENT_CODE_POINTS` code points. */
  comment: string;
  /** Anchor used to re-resolve the span on the page. */
  anchor: EntryAnchor;
  /** Show/hide of the highlight on the page; the popup checkbox owns it (PM ruling `A1`). */
  visible: boolean;
  /** ISO timestamp of creation; never changes afterwards. */
  createdAt: string;
  /** ISO timestamp of the last save; equals `createdAt` on creation. */
  updatedAt: string;
}

/** Input of `createEntry`: every field of `Entry`, with `visible` optional. */
export interface EntryDraft {
  id: string;
  pageKey: string;
  authorName: string;
  text: string;
  comment: string;
  anchor: EntryAnchor;
  createdAt: string;
  updatedAt: string;
  /** Defaults to `true` when omitted (PM ruling `A1`). */
  visible?: boolean;
}

/**
 * Builds an `Entry` from a draft: structural only, no validation and no defaults
 * besides `visible`. Creation rules are checked by `assertCreatable` in
 * `entry-rules.ts` before a draft reaches this function.
 */
export function createEntry(draft: EntryDraft): Entry {
  return {
    id: draft.id,
    pageKey: draft.pageKey,
    authorName: draft.authorName,
    text: draft.text,
    comment: draft.comment,
    anchor: {
      text: draft.anchor.text,
      prefix: draft.anchor.prefix,
      suffix: draft.anchor.suffix,
      fragmentCount: draft.anchor.fragmentCount,
    },
    visible: draft.visible ?? true,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}
