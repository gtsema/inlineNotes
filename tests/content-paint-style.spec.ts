// @vitest-environment jsdom
/**
 * The paint stylesheet (task `t3-02` AC2; ruling `A41`).
 *
 * `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight painting"
 * says the style is one shared frame for every entry, and ruling `A41` says it has to
 * live at document level, because a custom highlight is not an element and a rule
 * written inside the overlay's shadow root cannot reach it. Two variants were on the
 * table, and this file is the record of the one that shipped:
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
  PAINT_DECLARATIONS,
  isStyleableHighlightName,
  paintRuleOf,
  paintRulesOf,
  paintStyleOwnerOf,
} from '../src/content/paint/paint-style';

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

describe('the rules of one page (A41, A70)', () => {
  it('writes exactly one rule per painted name, and the name is the entry name', () => {
    const rules = paintRulesOf(['inlinenotes-a1b2c3d4e5f6', 'inlinenotes-b2c3d4e5f6a1']);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.startsWith('::highlight(inlinenotes-a1b2c3d4e5f6) {')).toBe(true);
    expect(rules[1]?.startsWith('::highlight(inlinenotes-b2c3d4e5f6a1) {')).toBe(true);
  });

  it('keeps one shared declaration block for every entry', () => {
    const own = paintRuleOf('inlinenotes-a1b2c3d4e5f6');
    const foreign = paintRuleOf('inlinenotes-000000000000');
    const bodyOf = (rule: string): string => rule.slice(rule.indexOf('{'));
    expect(bodyOf(own)).toBe(bodyOf(foreign));
    // The frame is translucent `rgba` and shared: no author name, no entry id and no
    // per-entry colour appears anywhere in the declaration block.
    expect(PAINT_DECLARATIONS.join(' ')).toContain('rgba');
    for (const declaration of PAINT_DECLARATIONS) {
      expect(declaration).not.toContain('a1b2c3d4e5f6');
    }
    expect(foreign).not.toContain('reader-one');
  });

  it('drops a name the sheet cannot express and keeps every other rule', () => {
    // The read guard of `entry-store-read.ts` accepts any non-empty id, so a
    // hand-edited store can hold an id with a space. Such a selector would make
    // `replaceSync` reject the whole sheet and cost every entry its frame.
    expect(isStyleableHighlightName('inlinenotes-a1b2c3d4e5f6')).toBe(true);
    expect(isStyleableHighlightName('inlinenotes-a1 b2')).toBe(false);
    expect(isStyleableHighlightName('inlinenotes-a1"b2')).toBe(false);
    expect(isStyleableHighlightName('notes-a1b2c3d4e5f6')).toBe(false);
    expect(paintRulesOf(['inlinenotes-a1 b2', 'inlinenotes-a1b2c3d4e5f6'])).toHaveLength(1);
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
    owner.sync(['inlinenotes-a1b2c3d4e5f6', 'inlinenotes-b2c3d4e5f6a1']);

    const written = writtenRules(ourSheet());
    expect(written).toHaveLength(2);
    for (const cssText of written) {
      expect(cssText).toMatch(/^::highlight\(inlinenotes-[a-z0-9]+\)/);
    }
    expect(written[0]).toContain('a1b2c3d4e5f6');
    expect(owner.ruleTexts()).toHaveLength(2);
  });

  it('rewrites its own sheet on the next pass without adopting a second one (AC5)', () => {
    owner.sync(['inlinenotes-b2c3d4e5f6a1']);
    owner.sync(['inlinenotes-b2c3d4e5f6a1']);

    expect(document.adoptedStyleSheets).toHaveLength(sheetsBefore + 1);
    const written = writtenRules(ourSheet());
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('b2c3d4e5f6a1');
    expect(written[0]).not.toContain('a1b2c3d4e5f6');
  });

  it('clears every rule it owns, and leaves the page sheet alone', () => {
    owner.sync(['inlinenotes-a1b2c3d4e5f6']);
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
