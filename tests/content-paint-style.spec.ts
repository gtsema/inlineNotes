// @vitest-environment jsdom
/**
 * The paint stylesheet (task `t3-02` AC2; ruling `A41`).
 *
 * `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight painting" says
 * one rule per painted entry, and "Author colour and `paint slot`" says the declarations
 * of that rule come from the palette slot of its author (task `t5-02`, rulings `A94`,
 * `A102`). Ruling `A41` says all of it has to live at document level, because a custom
 * highlight is not an element and a rule written inside the overlay's shadow root cannot
 * reach it. Two variants were on the table, and this file is the record of the one that
 * shipped:
 *
 * - the rules are written into a **constructed `CSSStyleSheet` appended to
 *   `document.adoptedStyleSheets`**, which adds no element to the page: the page's
 *   own adopted sheets stay where they are, and the extension still owns exactly one
 *   page-level element, the overlay host of `src/content/overlay/host.ts`. The tests
 *   below show jsdom parses `::highlight(inlinenotes-…)` rules out of such a sheet,
 *   which is what makes the variant verifiable without a browser;
 * - the `<style id="inlinenotes-paint">` variant of `A41` is **not shipped**. It stays
 *   available until a real-browser run demonstrates that an adopted sheet does not
 *   apply `::highlight()` rules, and if it is ever adopted, AC2 of the overlay spec
 *   has to be amended in the same commit, as the ruling requires.
 */

import { describe, expect, it } from 'vitest';

import {
  isStyleableHighlightName,
  paintRuleOf,
  paintRulesOf,
  paintStyleOwnerOf,
} from '../src/content/paint/paint-style';
import type { PaintStyleRule } from '../src/content/paint/paint-style';
import {
  PAINT_SLOTS,
  paintDeclarationsOfSlot,
  paintSlotOf,
} from '../src/content/paint/paint-palette';

/**
 * A constructed sheet the page adopted before this extension arrived.
 *
 * It has to come from the same realm as the document: jsdom refuses a sheet
 * constructed elsewhere ("Only constructed stylesheets from the same document can be
 * adopted"), which is also why this file drives the one owner of the environment
 * document instead of building a throwaway document per test.
 */
function pageSheet(): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('p { color: rgb(1, 2, 3); }');
  return sheet;
}

/** The rules the extension wrote into the sheet it adopted. */
function writtenRules(sheet: CSSStyleSheet | undefined): string[] {
  if (sheet === undefined) {
    throw new Error('fixture sheet is not adopted');
  }
  const texts: string[] = [];
  for (let index = 0; index < sheet.cssRules.length; index += 1) {
    const rule = sheet.cssRules[index];
    if (rule !== undefined) {
      texts.push(rule.cssText);
    }
  }
  return texts;
}

function needOwner(): NonNullable<ReturnType<typeof paintStyleOwnerOf>> {
  const owner = paintStyleOwnerOf(document);
  if (owner === null) {
    throw new Error('fixture document has no constructed stylesheets');
  }
  return owner;
}

function ourSheet(): CSSStyleSheet | undefined {
  return document.adoptedStyleSheets[document.adoptedStyleSheets.length - 1];
}

describe('the rules of one page (A41, A70, A94)', () => {
  it('writes exactly one rule per painted name, and the name is the entry name', () => {
    const rules = paintRulesOf([
      { name: 'inlinenotes-a1b2c3d4e5f6', slot: 0 },
      { name: 'inlinenotes-b2c3d4e5f6a1', slot: 3 },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.startsWith('::highlight(inlinenotes-a1b2c3d4e5f6) {')).toBe(true);
    expect(rules[1]?.startsWith('::highlight(inlinenotes-b2c3d4e5f6a1) {')).toBe(true);
  });

  /** The declaration block of a rule, without its `::highlight()` selector. */
  function bodyOf(rule: string): string {
    return rule.slice(rule.indexOf('{'));
  }

  it('takes the declarations of a rule from the palette slot of its author (AC1, A94)', () => {
    const slot = paintSlotOf('reader-one');
    const own = paintRuleOf('inlinenotes-a1b2c3d4e5f6', slot);
    const foreign = paintRuleOf('inlinenotes-000000000000', paintSlotOf('ann'));

    // The palette is the only source: the block is the slot's own declarations, verbatim.
    for (const declaration of paintDeclarationsOfSlot(slot)) {
      expect(own).toContain(declaration);
    }
    const foreignBackground: string = paintDeclarationsOfSlot(paintSlotOf('ann'))[0];
    expect(own).not.toContain(foreignBackground);
    expect(bodyOf(own)).not.toBe(bodyOf(foreign));
  });

  it('paints two authors that share a slot alike, and says nothing more about it (AC2, A94)', () => {
    // The accepted collision: two rules that differ only in their `::highlight()` name.
    const one = paintRuleOf('inlinenotes-a1b2c3d4e5f6', paintSlotOf('reader-one'));
    const two = paintRuleOf('inlinenotes-b2c3d4e5f6a1', paintSlotOf('reader-two'));
    expect(bodyOf(one)).toBe(bodyOf(two));
    expect(one).not.toBe(two);
  });

  it('keeps the rule count a function of the page, never of the palette (AC5, A70, A94)', () => {
    // One painted entry is one rule. Six slots do not add six shared rules, and a second
    // pass over a bigger page grows the sheet with the page only.
    const sixDistinctSlots = PAINT_SLOTS.map((slot) => ({
      name: `inlinenotes-entry${slot}aa`,
      slot,
    }));
    expect(paintRulesOf(sixDistinctSlots)).toHaveLength(PAINT_SLOTS.length);

    const twelveEntries: PaintStyleRule[] = [
      ...sixDistinctSlots,
      ...sixDistinctSlots.map((rule, index) => ({
        name: `inlinenotes-entry${index}bb`,
        slot: rule.slot,
      })),
    ];
    const written = paintRulesOf(twelveEntries);
    expect(written).toHaveLength(12);
    // The rule set is not grouped or deduplicated by slot: two entries of one author keep
    // two rules, which is what lets the teardown of `A39` drop one entry alone. The six
    // pairs share six bodies, because the palette answers six distinct blocks.
    expect(new Set(written.map((rule) => bodyOf(rule))).size).toBe(PAINT_SLOTS.length);
  });

  it('never writes an author name or an entry id into a declaration block (A94)', () => {
    const rule = paintRuleOf('inlinenotes-a1b2c3d4e5f6', paintSlotOf('reader-one'));
    expect(bodyOf(rule)).not.toContain('a1b2c3d4e5f6');
    expect(bodyOf(rule)).not.toContain('reader-one');
    expect(bodyOf(rule)).toContain('rgba');
  });

  it('drops a name the sheet cannot express and keeps every other rule', () => {
    // The read guard of `entry-store-read.ts` accepts any non-empty id, so a
    // hand-edited store can hold an id with a space. Such a selector would make
    // `replaceSync` reject the whole sheet and cost every entry its frame.
    expect(isStyleableHighlightName('inlinenotes-a1b2c3d4e5f6')).toBe(true);
    expect(isStyleableHighlightName('inlinenotes-a1 b2')).toBe(false);
    expect(isStyleableHighlightName('inlinenotes-a1"b2')).toBe(false);
    expect(isStyleableHighlightName('notes-a1b2c3d4e5f6')).toBe(false);
    expect(
      paintRulesOf([
        { name: 'inlinenotes-a1 b2', slot: 0 },
        { name: 'inlinenotes-a1b2c3d4e5f6', slot: 0 },
      ]),
    ).toHaveLength(1);
  });

  it('writes no rule at all for no painted entry', () => {
    expect(paintRulesOf([])).toEqual([]);
  });
});

/*
 * The owner is cached per document, so this sequence is the sequence of one page: the
 * page adopts its sheet first, the extension adopts its own once, and every later
 * pass rewrites that sheet in place. The numbers below are relative to the state
 * captured here, so the tests stay true whatever the environment started with.
 */
const page = pageSheet();
document.adoptedStyleSheets = [page];
const sheetsBefore = document.adoptedStyleSheets.length;
const elementsBefore = document.querySelectorAll('*').length;
const owner = needOwner();

describe('the adopted sheet of a page (AC2, A41)', () => {
  it('adopts one sheet and adds no element to the page', () => {
    expect(document.adoptedStyleSheets.length).toBe(sheetsBefore + 1);
    expect(document.querySelectorAll('*').length).toBe(elementsBefore);
    expect(document.querySelector('style')).toBeNull();
  });

  it('appends to the page sheets instead of replacing them', () => {
    expect(document.adoptedStyleSheets).toHaveLength(sheetsBefore + 1);
    expect(document.adoptedStyleSheets[0]).toBe(page);
    expect(document.adoptedStyleSheets[0]?.cssRules).toHaveLength(1);
  });

  it('holds only the rules of the painted entries, in the page order', () => {
    owner.sync([
      { name: 'inlinenotes-a1b2c3d4e5f6', slot: paintSlotOf('reader-one') },
      { name: 'inlinenotes-b2c3d4e5f6a1', slot: paintSlotOf('reader-one') },
    ]);

    const written = writtenRules(ourSheet());
    expect(written).toHaveLength(2);
    for (const cssText of written) {
      expect(cssText).toMatch(/^::highlight\(inlinenotes-[a-z0-9]+\)/);
    }
    expect(written[0]).toContain('a1b2c3d4e5f6');
    expect(owner.ruleTexts()).toHaveLength(2);
  });

  it('rewrites its own sheet on the next pass without adopting a second one (AC5)', () => {
    owner.sync([{ name: 'inlinenotes-b2c3d4e5f6a1', slot: paintSlotOf('reader-one') }]);
    owner.sync([{ name: 'inlinenotes-b2c3d4e5f6a1', slot: paintSlotOf('reader-one') }]);

    expect(document.adoptedStyleSheets).toHaveLength(sheetsBefore + 1);
    const written = writtenRules(ourSheet());
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('b2c3d4e5f6a1');
    expect(written[0]).not.toContain('a1b2c3d4e5f6');
  });

  it('clears every rule it owns, and leaves the page sheet alone', () => {
    owner.sync([{ name: 'inlinenotes-a1b2c3d4e5f6', slot: paintSlotOf('reader-one') }]);
    owner.clear();

    expect(owner.ruleTexts()).toEqual([]);
    expect(writtenRules(ourSheet())).toEqual([]);
    expect(document.adoptedStyleSheets[0]?.cssRules).toHaveLength(1);
  });

  it('creates one owner per document, so a second caller adopts nothing extra', () => {
    const again = needOwner();
    expect(again).toBe(owner);
    expect(document.adoptedStyleSheets).toHaveLength(sheetsBefore + 1);
  });
});
