/**
 * The author palette and the author→slot mapping (task `t5-02` AC2, AC3, AC4; rulings
 * `A94`, `A102`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Author colour
 * and `paint slot`", the `highlight frame` rule, and the `paint slot` / `author palette`
 * rows of "Terms / Aliases".
 *
 * What the file is the teeth for:
 *
 * - **AC4** — the palette has **exactly six** slots, and slot 0 is the declaration block
 *   that shipped before ruling `A94`, character for character. The second half is the
 *   "an unchanged page can look unchanged" promise: a re-tuned blue is a visible change to
 *   every reader who already has notes, so it is pinned as two literals, not described;
 * - **AC3** — the mapping is pinned as **literal slot values** for named authors. The
 *   point is the rename: a palette that stays six slots but changes its hash, its modulus
 *   or its order moves every author's colour at once, and no page-level test would notice.
 *   The literals are the only form that fails when the mapping moves;
 * - **AC2** — a collision is possible, and the spec says so. `reader-one` and `reader-two`
 *   land on one slot; the test pins the shared colour instead of pretending names get
 *   unique ones, and the pigeonhole half pins that six slots are genuinely saturable by
 *   ordinary names, so nobody can "fix" the collision by assuming it is theoretical;
 * - the property set per slot: `background-color` and `text-decoration` only, because
 *   those are the two the CSS Custom Highlight spec honours on a highlight
 *   pseudo-element (header of `src/content/paint/paint-style.ts`);
 * - the purity of the mapping: no counter, no reservation list, no per-page state, and no
 *   colour built out of the characters of the name.
 *
 * This module is a pure content-layer module over a core hash it imports and does not
 * edit, so no DOM and no fixture page is involved: `src/core/` is untouched by this task
 * (ruling `A102`), and `tests/core-slot-key.spec.ts` stays the only place the hash itself
 * is pinned.
 */

import { describe, expect, it } from 'vitest';

import { fnv1a32 } from '../src/core/slot-key';
import {
  PAINT_PALETTE,
  PAINT_PALETTE_SIZE,
  PAINT_SLOTS,
  paintDeclarationsOfSlot,
  paintSlotOf,
} from '../src/content/paint/paint-palette';

/**
 * The declaration block that shipped before ruling `A94`, verbatim.
 *
 * Written out here rather than read from the palette, so the assertion is a comparison
 * against the spec's own words and not against itself.
 */
const PRE_A94_BLUE: readonly string[] = [
  'background-color: rgba(122, 162, 247, 0.26);',
  'text-decoration: underline solid rgba(31, 111, 235, 0.7);',
];

/** Ordinary author names, the shape the palette answers for. */
const ORDINARY_NAMES: readonly string[] = [
  'reader',
  'reader-one',
  'reader-two',
  'reader-four',
  'reader-seven',
  'ann',
  'Вася',
];

describe('the palette is exactly six slots and slot 0 is the shipped colour (AC4)', () => {
  it('sizes the palette at six, and enumerates its slots in order', () => {
    expect(PAINT_PALETTE_SIZE).toBe(6);
    expect(PAINT_SLOTS).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Object.keys(PAINT_PALETTE)).toHaveLength(PAINT_PALETTE_SIZE);
    for (const slot of PAINT_SLOTS) {
      expect(PAINT_PALETTE[slot]).toBeDefined();
    }
  });

  it('keeps slot 0 as the pre-`A94` declarations, character for character', () => {
    // The "an unchanged page can look unchanged" promise. A page whose author hashes to
    // slot 0 must paint exactly the frame it painted before this task.
    expect(PAINT_PALETTE[0]).toEqual([...PRE_A94_BLUE]);
    expect(paintDeclarationsOfSlot(0)).toEqual([...PRE_A94_BLUE]);
    expect(PAINT_PALETTE[0][0]).toBe('background-color: rgba(122, 162, 247, 0.26);');
    expect(PAINT_PALETTE[0][1]).toBe('text-decoration: underline solid rgba(31, 111, 235, 0.7);');
  });

  it('carries the two honours-able properties in every slot, and no third one', () => {
    for (const slot of PAINT_SLOTS) {
      const declarations = paintDeclarationsOfSlot(slot);
      expect(declarations, `slot ${slot}`).toHaveLength(2);
      expect(declarations[0], `slot ${slot}`).toMatch(/^background-color: rgba\(/);
      expect(declarations[1], `slot ${slot}`).toMatch(
        /^text-decoration: underline solid rgba\(/,
      );
    }
  });

  it('answers with six different backgrounds, so six slots really are six hues', () => {
    const backgrounds = PAINT_SLOTS.map((slot) => paintDeclarationsOfSlot(slot)[0]);
    expect(new Set(backgrounds).size).toBe(PAINT_PALETTE_SIZE);
  });

  it('holds no colour built out of the name or the entry it paints', () => {
    // The colour is a palette lookup, never a derivation: an author named «red» gets no
    // red, and an entry id cannot leak into a declaration block.
    const all = PAINT_SLOTS.flatMap((slot) => [...paintDeclarationsOfSlot(slot)]).join(' ');
    expect(all).not.toMatch(/reader|Вася|ann|a1b2c3d4e5f6/i);
  });
});

describe('the slot of an author name is a pure function (AC3, A102)', () => {
  it('maps named authors to literal slots, one per slot of the palette', () => {
    // The rename guard: the numbers below are the mapping, not a re-derivation of it.
    expect(paintSlotOf('reader')).toBe(0);
    expect(paintSlotOf('reader-four')).toBe(1);
    expect(paintSlotOf('ann')).toBe(2);
    expect(paintSlotOf('reader-one')).toBe(3);
    expect(paintSlotOf('Я')).toBe(4);
    expect(paintSlotOf('Вася')).toBe(5);
  });

  it('is the shipped core hash modulo the palette size, and nothing else', () => {
    // The other half of the guard: the modulus is the palette size, and the hash is core's
    // `fnv1a32`, which `tests/core-slot-key.spec.ts` pins as stable. A second hash
    // function or a different modulus changes every author at once.
    for (const name of ['reader-one', 'Вася', '', 'A'.repeat(500), '🦊']) {
      expect(paintSlotOf(name)).toBe(fnv1a32(name) % 6);
    }
  });

  it('answers the same slot for the same name however often it is asked', () => {
    const first = paintSlotOf('reader-one');
    for (let call = 0; call < 50; call += 1) {
      expect(paintSlotOf('reader-one')).toBe(first);
    }
    // A second name never moves a first one: there is no counter to advance and no slot to
    // reserve, which is what lets a note written in another browser keep its colour.
    expect(paintSlotOf('Вася')).toBe(5);
    expect(paintSlotOf('reader-one')).toBe(first);
  });

  it('stays inside the palette for every name shape a stored record can hold', () => {
    // The read guard of `src/core/entry-store-read.ts` accepts any non-empty author name,
    // so the palette is handed empty strings, spaces, astral pairs and 4000-character
    // records. Every one of them gets a slot the sheet can write.
    const names = ['', ' ', ' reader ', 'Я ', 'я', 'A'.repeat(4000), '🦊🦊', '\ud800'];
    for (const name of names) {
      const slot = paintSlotOf(name);
      expect(PAINT_SLOTS, JSON.stringify(name)).toContain(slot);
      expect(paintDeclarationsOfSlot(slot)).toEqual(PAINT_PALETTE[slot]);
    }
  });
});

describe('the collision ruling `A94` accepts (AC2)', () => {
  it('gives two different authors one slot, and paints them alike', () => {
    // Not a defect to fix: the spec states the collision in the same sentence that fixes
    // the palette size. The two names are the ones the paint fixtures already use, so the
    // shared colour is visible in the page-level suites as well.
    expect(paintSlotOf('reader-one')).toBe(3);
    expect(paintSlotOf('reader-two')).toBe(3);
    expect(paintDeclarationsOfSlot(paintSlotOf('reader-one'))).toEqual(
      paintDeclarationsOfSlot(paintSlotOf('reader-two')),
    );
  });

  it('is saturated by ordinary names, so the collision is reachable rather than theoretical', () => {
    // Pigeonhole in the open: seven plausible names fill all six slots, so at least two of
    // them share one — and the test above names the pair.
    const slots = new Set(ORDINARY_NAMES.map((name) => paintSlotOf(name)));
    expect(slots.size).toBe(PAINT_PALETTE_SIZE);
    expect(ORDINARY_NAMES.length).toBeGreaterThan(PAINT_PALETTE_SIZE);
  });

  it('keeps two authors of different slots apart, which is the point of the palette', () => {
    expect(paintSlotOf('reader-one')).not.toBe(paintSlotOf('ann'));
    expect(paintDeclarationsOfSlot(paintSlotOf('reader-one'))).not.toEqual(
      paintDeclarationsOfSlot(paintSlotOf('ann')),
    );
  });
});
