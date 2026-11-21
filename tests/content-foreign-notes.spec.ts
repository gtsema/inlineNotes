// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createEntry } from '../src/core/entry';
import type { Entry } from '../src/core/entry';
import { paintColourOfSlot, paintSlotOf, PAINT_PALETTE } from '../src/content/paint/paint-palette';
import { buildPaintPlan } from '../src/content/paint/paint-plan';
import type { ExtraEntry } from '../src/content/paint/paint-plan';
import { paintRulesOf, paintRuleOf } from '../src/content/paint/paint-style';

/**
 * The foreign notes in the paint path (Stage 17, `t17-01` AC7, AC9, AC14).
 *
 * Three rules, and each is the only place it lives:
 *
 * - a note that is **not in the store** is resolved and measured exactly like one that is
 *   — one stream, one pass, one `paint name` per entry (`A29`, `A36`);
 * - a note that is **switched off** keeps its place on the page and loses only its fill,
 *   which is what makes "off" one visible state and not two (`A40` for stored notes,
 *   `A163` for foreign ones — the stored note is not painted at all);
 * - the tooltip's **author colour** is the palette literal of that author's slot, so the
 *   underline on the page and the name in the header cannot disagree.
 */

function entryOf(overrides: Partial<Entry> = {}): Entry {
  return createEntry({
    id: 'their00001',
    pageKey: 'https://example.com/a',
    authorName: 'Вася',
    text: 'selected text',
    comment: 'their note',
    anchor: { text: 'selected text', prefix: '', suffix: '', fragmentCount: 1 },
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    ...overrides,
  });
}

function article(text: string): HTMLElement {
  const root = document.createElement('article');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  root.append(paragraph);
  document.body.append(root);
  return root;
}

/** A measurement seam that answers one box for any fragment. */
const rangeFor = (node: Text, start: number, end: number): Range => {
  void node;
  void start;
  void end;
  const box = { x: 0, y: 0, top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 };
  // Only the box is read by the plan (`fragmentBox`), so the seam answers that and
  // nothing else: no `setStart`, no document range.
  return { getBoundingClientRect: (): unknown => box } as unknown as Range;
};

describe('AC7 the paint plan paints a foreign note beside the stored ones', () => {
  it('resolves and measures both lists in one pass, one paint name each', () => {
    const root = article('selected text and another note here');
    const stored = entryOf({
      id: 'stored0001',
      authorName: 'reader-one',
      text: 'another note',
      anchor: { text: 'another note', prefix: '', suffix: '', fragmentCount: 1 },
    });
    const extra: ExtraEntry = { entry: entryOf(), visible: true };

    const plan = buildPaintPlan({ entries: [stored], extra: [extra], root, rangeFor });

    expect(plan.painted.map((painted) => painted.entry.id)).toEqual(['stored0001', 'their00001']);
    expect(plan.painted.map((painted) => painted.name)).toEqual([
      'inlinenotes-stored0001',
      'inlinenotes-their00001',
    ]);
    // The slot of each entry is the slot of its author, foreign or not: the paint path
    // asks no ownership question (`A94`).
    expect(plan.painted[1]?.paintSlot).toBe(paintSlotOf('Вася'));
    expect(plan.skipped).toEqual([]);
  });

  it('paints a switched-off foreign note and dims it, while a hidden stored note is skipped (A40)', () => {
    const root = article('selected text and another note here');
    const hiddenStored = entryOf({
      id: 'stored0001',
      authorName: 'reader-one',
      text: 'another note',
      visible: false,
      anchor: { text: 'another note', prefix: '', suffix: '', fragmentCount: 1 },
    });

    const plan = buildPaintPlan({
      entries: [hiddenStored],
      extra: [{ entry: entryOf(), visible: false }],
      root,
      rangeFor,
    });

    expect(plan.painted.map((painted) => [painted.entry.id, painted.dimmed])).toEqual([
      ['their00001', true],
    ]);
    expect(plan.skipped).toEqual([{ entryId: 'stored0001', reason: 'hidden' }]);
  });

  it('answers `anchor_not_found` for a foreign note the page no longer holds, and keeps the rest', () => {
    const root = article('selected text survives');
    const gone: ExtraEntry = {
      entry: entryOf({
        id: 'gone000001',
        text: 'was here',
        anchor: { text: 'was here', prefix: '', suffix: '', fragmentCount: 1 },
      }),
      visible: true,
    };

    const plan = buildPaintPlan({ entries: [], extra: [gone, { entry: entryOf(), visible: true }], root, rangeFor });

    expect(plan.painted.map((painted) => painted.entry.id)).toEqual(['their00001']);
    expect(plan.skipped).toEqual([{ entryId: 'gone000001', reason: 'anchor_not_found' }]);
  });

  it('keeps the two lists apart: no extra entries means the plan is the store\'s alone', () => {
    const root = article('selected text and another note here');
    const stored = entryOf({ id: 'stored0001', text: 'another note', anchor: { text: 'another note', prefix: '', suffix: '', fragmentCount: 1 } });

    const withoutExtra = buildPaintPlan({ entries: [stored], root, rangeFor });
    const withEmptyExtra = buildPaintPlan({ entries: [stored], extra: [], root, rangeFor });
    expect(withEmptyExtra).toEqual(withoutExtra);
  });
});

describe('AC9 a switched-off foreign note keeps its underline and loses its fill', () => {
  it('writes the one rule with the fill dropped, and the same rule otherwise', () => {
    const slot = paintSlotOf('Вася');
    const painted = paintRuleOf('inlinenotes-their00001', slot);
    const dimmed = paintRuleOf('inlinenotes-their00001', slot, true);

    expect(painted).toContain('background-color:');
    expect(dimmed).not.toContain('background-color:');
    // The underline stays, so the reader still sees that there is a note here.
    expect(dimmed).toContain('text-decoration:');
    expect(dimmed).toContain('::highlight(inlinenotes-their00001)');
  });

  it('threads the flag through the rules list, and leaves the stored rules alone', () => {
    const rules = paintRulesOf([
      { name: 'inlinenotes-stored0001', slot: 0 },
      { name: 'inlinenotes-their00001', slot: 1, dimmed: true },
    ]);
    expect(rules[0]).toContain('background-color:');
    expect(rules[1]).not.toContain('background-color:');
  });
});

describe('AC14 the author colour of a foreign note comes from that author\'s palette slot', () => {
  it('answers the fill literal of the slot, without the property name or the semicolon', () => {
    // Every slot, so no slot can lose its colour without this going red.
    for (const slot of [0, 1, 2, 3, 4, 5] as const) {
      const fill = PAINT_PALETTE[slot].find((declaration) => declaration.startsWith('background-color:'));
      expect(fill).toBeDefined();
      const expected = (fill ?? '').split(':').slice(1).join(':').trim().replace(/;$/, '');
      expect(paintColourOfSlot(slot)).toBe(expected);
      expect(paintColourOfSlot(slot)).toMatch(/^rgba\(/);
    }
  });

  it('is a function of the stored name alone, and answers a colour for every author', () => {
    // Same name, same colour, on every page and in every pass: no state, no counter, no
    // storage read (`A102`).
    expect(paintColourOfSlot(paintSlotOf('Вася'))).toBe(paintColourOfSlot(paintSlotOf('Вася')));

    // And it is the *stored* name: the palette answers no ownership question and applies
    // no trimming, which is the stated consequence of `A94` — two records whose names
    // differ by a space may wear different colours while core treats them as one author.
    const named = new Set(
      ['Вася', 'Петя', 'Анна', 'Борис', 'Гриша', 'Даша'].map((name) =>
        paintColourOfSlot(paintSlotOf(name)),
      ),
    );
    expect(named.size).toBeGreaterThan(1);
    for (const colour of named) {
      expect(colour).toMatch(/^rgba\(/);
    }
  });
});