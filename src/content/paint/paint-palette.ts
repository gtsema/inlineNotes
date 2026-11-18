/**
 * The author palette: the six declaration sets the `paint stylesheet` picks from, and
 * the one mapping from an author name to one of them (task `t5-02`; rulings `A94`,
 * `A102`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Author colour
 * and `paint slot`" and the `highlight frame` rule; the `paint slot` and `author palette`
 * rows of "Terms / Aliases".
 *
 * What this module owns, and only this: **which declarations one author gets**. It does
 * not own the `paint name` (`highlight-name.ts`), the rule text (`paint-style.ts`), the
 * set of entries that reach the page (`paint-plan.ts`) or anything about authorship —
 * the colour is decoration, and the answer to "is this note mine" stays core `canEdit`
 * (`inline-comment-model.md` -> "Identity"). That separation is why a colour can never
 * become a second ownership rule by accident.
 *
 * Why a hash of the name and not a per-author assignment: the palette has to answer for
 * a name this extension has never seen, on a page it has never visited, without a
 * counter, a reservation list or a storage read. A slot handed out at creation time would
 * need exactly one of those three, and a note written in another browser — or by another
 * reader on the same page (`A93` allows their entry to stand under these very words) —
 * would arrive with no slot at all. A pure function of the stored `authorName` answers
 * the same way everywhere, in every pass, with no state to keep in sync. `A102` fixed
 * this shape; it also fixed the modulus at **6**.
 *
 * Why the existing `fnv1a32` of `src/core/slot-key.ts` and not a second hash: the
 * content layer is allowed to import core, and a second 32-bit hash function would be a
 * second thing to test, to keep stable, and to explain. Reusing it costs nothing, because
 * the requirement here is only "the same string, the same number, forever" — which is
 * what FNV-1a over code points already is, and `tests/core-slot-key.spec.ts` pins that
 * property for the hash itself. `src/core/` is **not** edited for this task and owns no
 * colour rule; the import direction is the allowed one.
 *
 * The accepted collision (`A94`): six slots and unbounded names means two different
 * authors can wear the same colour. Nothing here detects that, re-maps it or warns about
 * it, and no layer may promise a unique colour per author — the spec says so in the same
 * sentence that fixes the palette size, so the collision is a stated property rather than
 * a latent bug.
 *
 * Why slot 0 is the shipped blue **verbatim**: a page whose only author hashes to slot 0
 * must look exactly as it did before this task. Keeping the literal strings instead of
 * "close enough" values is what makes that checkable — `tests/content-paint-palette.spec.ts`
 * pins the two declarations as literals, and the same file pins the literal slot values
 * of a few named authors, so neither the palette nor the mapping can be reshuffled
 * without a test failing.
 *
 * The two properties per slot are not decoration either: `background-color` and
 * `text-decoration` are inside the small set of properties the CSS Custom Highlight spec
 * applies to a highlight pseudo-element (see the header of `paint-style.ts` for why the
 * frame is an underline and not an outline). A palette entry with a third property would
 * be a property the browser drops.
 */

import { fnv1a32 } from '../../core/slot-key';

/**
 * A palette index.
 *
 * A union rather than `number`, so `paint-style.ts` and `paint-plan.ts` cannot hand this
 * module an index the palette does not have: the domain of the palette is the type, and
 * the compiler checks the declarations table against it.
 */
export type PaintSlot = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Every slot the palette has, in the order the modulo indexes them.
 *
 * This array is what makes the mapping total: `fnv1a32(name) % PAINT_PALETTE_SIZE` is a
 * valid index into it by construction, so no branch has to answer "an index the palette
 * does not have", and `tests/content-paint-palette.spec.ts` checks the array against the
 * declarations table so the two cannot drift apart.
 */
export const PAINT_SLOTS: readonly PaintSlot[] = [0, 1, 2, 3, 4, 5];

/** How many slots the palette has: the modulus of the author mapping (`A102`). */
export const PAINT_PALETTE_SIZE = PAINT_SLOTS.length;

/**
 * The declarations of each slot.
 *
 * Slot 0 is the block that shipped before ruling `A94`, kept character for character.
 * Slots 1-5 are six hues at the same alpha pair, so no author's note reads as bolder or
 * fainter than another's: the palette tells authors apart and ranks nobody.
 *
 * `Record<PaintSlot, …>` is the shape that makes "exactly six" a compile-time fact: a
 * missing slot is a type error, and a seventh one is an excess property.
 */
export const PAINT_PALETTE: Readonly<Record<PaintSlot, readonly string[]>> = {
  0: [
    'background-color: rgba(122, 162, 247, 0.26);',
    'text-decoration: underline solid rgba(31, 111, 235, 0.7);',
  ],
  1: [
    'background-color: rgba(247, 208, 122, 0.26);',
    'text-decoration: underline solid rgba(176, 132, 24, 0.7);',
  ],
  2: [
    'background-color: rgba(140, 209, 148, 0.26);',
    'text-decoration: underline solid rgba(35, 134, 74, 0.7);',
  ],
  3: [
    'background-color: rgba(247, 158, 181, 0.26);',
    'text-decoration: underline solid rgba(199, 61, 110, 0.7);',
  ],
  4: [
    'background-color: rgba(192, 172, 245, 0.26);',
    'text-decoration: underline solid rgba(106, 76, 196, 0.7);',
  ],
  5: [
    'background-color: rgba(133, 213, 216, 0.26);',
    'text-decoration: underline solid rgba(23, 126, 136, 0.7);',
  ],
};

/**
 * The palette slot of one author name (ruling `A102`).
 *
 * A pure function of the string: same name, same slot, on every page, in every pass and
 * after every reload. It is deliberately not a function of the entry, the page key, the
 * `visible` flag or the number of entries — those would make one author's notes change
 * colour because of what a neighbour did.
 *
 * The name is used exactly as stored. Trimming and case folding belong to core
 * `isSameAuthor` (ruling `A99`), which owns the author **identity**; this function owns a
 * colour, and the spec states that the colour answers no ownership question, so applying
 * the identity rule here would invent a second identity for the palette to disagree with.
 * The observable consequence is stated in `docs/specs/content-overlay-ui.md`: two records
 * whose stored names differ by a space may wear different colours while core treats them
 * as one author.
 */
export function paintSlotOf(authorName: string): PaintSlot {
  return PAINT_SLOTS[fnv1a32(authorName) % PAINT_PALETTE_SIZE];
}

/** The declarations of one slot, in the order they are written into the rule. */
export function paintDeclarationsOfSlot(slot: PaintSlot): readonly string[] {
  return PAINT_PALETTE[slot];
}
