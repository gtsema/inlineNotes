/**
 * The name one entry's highlight is registered under (ruling `A70`, PM correction
 * of the `t3-02` brief).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight
 * painting" (one named highlight per entry) and the teardown rule of ruling `A39`.
 *
 * Why one name per entry and not one name for all notes: the spec's hover rule
 * ("hovering a highlight shows the tooltip of that entry") has to know **which**
 * entry the pointer is over, and the Highlight API gives the caller no hit-test and
 * no back-reference from a painted range. With one name per entry the name is the
 * identity, the paint pass can drop one entry without touching the others (the
 * popup checkbox of ruling `A1`, an edit, a delete), and the teardown of ruling `A39`
 * is a name sweep instead of a diff over ranges.
 *
 * `CSS.highlights` is a document-global map (`docs/project-profile.md` -> Runtime
 * Model), so the name carries the extension prefix: a page script that registers
 * its own highlights must not collide with ours, and the teardown of ruling `A39`
 * is allowed to remove **only** names that carry this prefix.
 *
 * Pure module: no DOM, no `chrome.*`, so the name and the prefix test of the
 * teardown are unit-testable without a page.
 */

/** The prefix every paint name carries, and the only prefix the teardown removes. */
export const PAINT_NAME_PREFIX = 'inlinenotes';

/** The separator between the prefix and the entry id. */
const NAME_SEPARATOR = '-';

/**
 * The highlight name of one entry: `inlinenotes-<entryId>`.
 *
 * The entry id is the 12-character base36 string `randomId` in
 * `src/core/entry-rules.ts` produces, so the name is stable across reloads and
 * readable in the devtools; the id itself is what the popup and the editor use.
 */
export function highlightNameOf(entryId: string): string {
  return `${PAINT_NAME_PREFIX}${NAME_SEPARATOR}${entryId}`;
}

/**
 * `true` when a name in `CSS.highlights` belongs to this extension.
 *
 * This is the guard of the teardown (ruling `A39`): a page script may hold its own
 * highlight names in the same document-global map, and clearing the paint must never
 * delete them.
 */
export function isPaintHighlightName(name: string): boolean {
  return name.startsWith(`${PAINT_NAME_PREFIX}${NAME_SEPARATOR}`);
}
