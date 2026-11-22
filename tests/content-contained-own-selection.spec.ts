// @vitest-environment jsdom
/**
 * The `contained own selection` rule as a pure question over the output of a `paint pass`
 * (task `t5-03` AC4, AC5, AC6; rulings `A103`, `A93`, `A99`, `A100`).
 *
 * The same rule is pinned end to end in `tests/content-create-card-controller.spec.ts`,
 * where a real paint pass feeds a real card. This file pins the branches that the card
 * cannot reach on its own, because a one-paragraph fixture never paints one entry across
 * two fragments: the multi-fragment half of the containment test, the document-order
 * half, the two-author half and the `authorName === null` half.
 *
 * The fragments below are hand-built on purpose. The point of the rule is that it reads
 * the node-local UTF-16 offsets the `paint name`s were registered with, so the fixture
 * hands the function exactly that shape and nothing else: a `Text` node, two offsets, and
 * the author the pass was painted under.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Entry, EntryAnchor } from '../src/core/entry';
import type { PaintSlot } from '../src/content/paint/paint-palette';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import {
  entryContainingSelection,
  isContainedOwnSelection,
} from '../src/content/overlay/contained-own-selection';

const OWN_NAME = 'reader-one';
const FOREIGN_NAME = 'reader-two';
const BOX = { left: 10, top: 20, width: 100, height: 16 };

const PAGE_HTML = [
  '<article id="art">',
  '  <p id="p1"><span id="a">The quick brown</span> fox <span id="b">jumps over</span> the lazy dog.</p>',
  '</article>',
].join('\n');

function textOf(id: string): Text {
  const node = document.getElementById(id);
  if (node === null || node.firstChild === null) {
    throw new Error(`fixture is missing #${id}`);
  }
  return node.firstChild as Text;
}

/** The nth child node of an element, which is how the bare text between two spans is reached. */
function childTextOf(id: string, index: number): Text {
  const node = document.getElementById(id);
  const child = node === null ? undefined : node.childNodes[index];
  if (child === undefined || child.nodeType !== 3) {
    throw new Error(`fixture #${id} has no text child at ${String(index)}`);
  }
  return child as Text;
}

function anchorOf(text: string, fragmentCount: number): EntryAnchor {
  return { text, prefix: 'the ', suffix: ' over the lazy dog', fragmentCount };
}

function entryOf(id: string, authorName: string, text: string): Entry {
  return {
    id,
    pageKey: 'example.test/article',
    authorName,
    text,
    comment: 'a note',
    anchor: anchorOf(text, 1),
    visible: true,
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
  };
}

/** One painted entry: the shape the rule is allowed to see, and nothing more. */
function paintedOf(
  id: string,
  authorName: string,
  text: string,
  fragments: readonly PaintedFragment[],
  paintSlot: PaintSlot = 0,
): PaintedEntry {
  return {
    entry: entryOf(id, authorName, text),
    name: `inlinenotes-${id}`,
    paintSlot,
    fragments,
  };
}

function fragmentOf(node: Text, start: number, end: number): PaintedFragment {
  return { node, start, end, box: BOX };
}

function rangeOf(startNode: Text, start: number, endNode: Text, end: number): Range {
  const range = document.createRange();
  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  return range;
}

let ownSingle: PaintedEntry;
let foreignSingle: PaintedEntry;
let ownAcrossTwo: PaintedEntry;
let ownTail: PaintedEntry;

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  // `#a` holds "The quick brown": the own note covers offsets 4 to 9 of it.
  ownSingle = paintedOf('a1b2c3d4e5f6', OWN_NAME, 'quick br', [
    fragmentOf(textOf('a'), 4, 9),
  ]);
  foreignSingle = paintedOf('b2c3d4e5f6a1', FOREIGN_NAME, 'quick br', [
    fragmentOf(textOf('a'), 4, 9),
  ]);
  // The second own note spans `#a`, the bare text node and `#b`: three fragments, which
  // is the shape a one-paragraph card fixture can never produce.
  ownAcrossTwo = paintedOf('c3d4e5f6a1b2', OWN_NAME, 'own', [
    fragmentOf(textOf('a'), 10, 13),
    fragmentOf(childTextOf('p1', 1), 0, 4),
    fragmentOf(textOf('b'), 0, 5),
  ]);
  // A second own note that starts where the first one's fragment ends: the pair pins
  // which entry a boundary offset belongs to.
  ownTail = paintedOf('d4e5f6a1b2c3', OWN_NAME, 'brown', [fragmentOf(textOf('a'), 10, 15)]);
});

describe('the containment question itself (t5-03 AC4, AC6)', () => {
  it('takes a selection wholly inside one fragment, and one that ends exactly on its boundary', () => {
    const painted = [ownSingle];

    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 5, textOf('a'), 8))).toBe(
      ownSingle,
    );
    // Inclusive on both edges: a boundary offset sits between two characters, so a
    // selection that ends at the last code point of the fragment ends inside the entry.
    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 4, textOf('a'), 9))).toBe(
      ownSingle,
    );
  });

  it('refuses a selection that crosses either boundary of the fragment', () => {
    const painted = [ownSingle];

    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 2, textOf('a'), 8))).toBe(
      null,
    );
    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 5, textOf('a'), 12))).toBe(
      null,
    );
    // A boundary point in a node the entry does not paint at all is outside it, whatever
    // its offset number says: offsets of different nodes are not comparable numbers.
    expect(entryContainingSelection(painted, rangeOf(textOf('b'), 0, textOf('b'), 3))).toBeNull();
  });

  it('takes a selection that runs across all three fragments of one entry', () => {
    const painted = [ownAcrossTwo];

    expect(
      entryContainingSelection(painted, rangeOf(textOf('a'), 11, textOf('b'), 3)),
    ).toBe(ownAcrossTwo);
    // One boundary point outside the first fragment of the set and one inside the last is
    // still outside the entry: containment is tested per boundary point, not per box.
    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 0, textOf('b'), 3))).toBeNull();
  });

  it('refuses a selection whose two boundary points belong to two different entries', () => {
    const painted = [ownSingle, ownTail];

    // `#a` 8 to 12: the first point is inside the first entry, the second inside the
    // second. Neither entry owns the whole selection, so the create card opens and the
    // `overlap` rule answers at the write.
    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 8, textOf('a'), 12))).toBeNull();
  });

  it('answers nothing for a collapsed caret, which is a caret and not a selection of a span', () => {
    const painted = [ownSingle];

    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 6, textOf('a'), 6))).toBeNull();
  });

  it('walks the painted list in paint order, so the first entry that owns the span answers', () => {
    const painted = [ownTail, ownSingle];

    expect(entryContainingSelection(painted, rangeOf(textOf('a'), 11, textOf('a'), 13))).toBe(
      ownTail,
    );
  });
});

describe('the author half of the silence (t5-03 AC5, ruling A93, A99, A100)', () => {
  it('is silent only for an entry the author rule accepts as the reader\u2019s own', () => {
    const selection = rangeOf(textOf('a'), 5, textOf('a'), 8);

    expect(isContainedOwnSelection([ownSingle], selection, OWN_NAME)).toBe(true);
    // Same geometry, other author: creating over a foreign note is legal, so the card
    // opens there exactly as it did before this ruling.
    expect(isContainedOwnSelection([foreignSingle], selection, OWN_NAME)).toBe(false);
    // The reader of this pass owns neither of them.
    expect(isContainedOwnSelection([foreignSingle], selection, 'reader-three')).toBe(false);
  });

  it('answers false when the pass had no usable name, which is the state the settings gate refuses', () => {
    expect(isContainedOwnSelection([ownSingle], rangeOf(textOf('a'), 5, textOf('a'), 8), null)).toBe(
      false,
    );
  });

  it('is not a silence for the words of an entry the pass did not paint', () => {
    // A hidden (`A40`), stale (`A24`) or unmeasurable (`A66`) entry is absent from the
    // pass output, and absence is the whole of that half of the rule.
    const selection = rangeOf(textOf('a'), 5, textOf('a'), 8);

    expect(isContainedOwnSelection([], selection, OWN_NAME)).toBe(false);
  });
});
