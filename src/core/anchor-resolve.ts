/**
 * Resolving an `anchor` back to a position in the normalized page text stream.
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Rules / Semantics ->
 * "Anchoring", "Anchor search order", "Staleness"; Edge Cases -> "Same text
 * repeated on the page"; Terms / Aliases -> "anchor", "stale entry",
 * "normalized text stream".
 *
 * Search order (spec: "Anchor search order"):
 * 1. `prefix + text + suffix` — the specific match, the window that makes a
 *    repeated sentence unique;
 * 2. `text` alone — the fallback that keeps an entry anchored when the site
 *    changed the sentences around it.
 * Both steps take the **first** match in document order, which is the lowest
 * offset in the stream. That is the whole tie-break rule: there is no ambiguity
 * code, no ambiguity message and no ranking, so the same anchor on the same stream
 * resolves to the same position after every reload.
 *
 * Stream contract: `pageText` must already be the normalized stream (the content
 * stage builds it with the normalization of `text-normalize.ts`). This module does
 * not normalize it, because normalizing here would move every offset and the
 * content layer maps those offsets back to DOM fragments.
 *
 * Staleness (spec: "Staleness"): a non-resolving anchor returns a code. It never
 * throws, never mutates the anchor, and never touches storage — the entry stays in
 * the popup list and stays deletable, and removing a stale entry is an explicit
 * user action owned by the write path.
 *
 * Purity: no DOM, no `chrome.*`, no clock, no randomness, no network.
 */

import type { EntryAnchor } from './entry';
import { codePointLength } from './entry-rules';
import { codePointOffsetAt } from './text-normalize';

/**
 * The only reason a resolution fails. Ambiguity is deliberately absent: repeated
 * text is disambiguated by the window when it still matches, and by document order
 * when it does not.
 */
export type AnchorResolveCode = 'anchor_not_found';

/**
 * A resolved anchor: the half-open code-point range `[start, end)` of
 * `anchor.text` inside the stream it was searched in. The content stage maps that
 * range to `(node, offset)` fragments; `src/core/` never sees a node.
 */
export type AnchorResolveResult =
  | { ok: true; start: number; end: number }
  | { ok: false; code: AnchorResolveCode };

/**
 * Resolves `anchor` against `pageText`.
 *
 * The result positions are code points, never UTF-16 units, so an astral
 * character inside the selection or inside the window counts once. An anchor that
 * does not carry the stored shape, or whose `text` is empty, is reported as
 * `anchor_not_found`: an empty needle would match at offset `0` of every stream
 * and would paint an empty highlight at the top of the page, which is worse than
 * no highlight at all.
 */
export function resolveAnchor(pageText: string, anchor: EntryAnchor): AnchorResolveResult {
  const fields = anchorFields(anchor);
  if (typeof pageText !== 'string' || fields === null || fields.text.length === 0) {
    return { ok: false, code: 'anchor_not_found' };
  }

  const contextual = fields.prefix + fields.text + fields.suffix;
  const contextualAt = pageText.indexOf(contextual);
  const textAt = contextualAt >= 0 ? contextualAt + fields.prefix.length : pageText.indexOf(fields.text);
  if (textAt < 0) {
    return { ok: false, code: 'anchor_not_found' };
  }

  const start = codePointOffsetAt(pageText, textAt);
  return { ok: true, start, end: start + codePointLength(fields.text) };
}

/**
 * Reads the three strings the search needs. The parameter type already promises
 * them, so this is a defensive guard for a value that came out of storage or out
 * of another layer: a value without the shape is a stale anchor, never a crash.
 */
function anchorFields(anchor: EntryAnchor): { text: string; prefix: string; suffix: string } | null {
  const value: unknown = anchor;
  if (!isRecord(value)) {
    return null;
  }
  const text = value['text'];
  const prefix = value['prefix'];
  const suffix = value['suffix'];
  if (typeof text !== 'string' || typeof prefix !== 'string' || typeof suffix !== 'string') {
    return null;
  }
  return { text, prefix, suffix };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
