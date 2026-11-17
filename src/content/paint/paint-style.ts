/**
 * The paint stylesheet: the `::highlight()` rules the highlights need in order to be
 * visible at all (task `t3-02` AC2; ruling `A41`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight
 * painting" ("one shared style for all entries", the translucent frame) and the
 * page-respect rule of ruling `A41` (the extension owns the overlay host and one
 * paint stylesheet, and nothing else in the page DOM).
 *
 * Why a document-level sheet is required: a custom highlight is not an element, so
 * it has no shadow tree to carry a style. `src/content/overlay/host-style.ts` reaches
 * the card because the card lives in the shadow root; a rule written there cannot
 * paint anything outside it, and `::highlight()` written inside a shadow root is
 * ignored. The rules therefore have to sit in the document.
 *
 * Which of the two `A41` variants shipped, and why:
 *
 * - **Variant 1 (the shipped one): a constructed `CSSStyleSheet` appended to
 *   `document.adoptedStyleSheets`.** It is the variant the ruling prefers, because it
 *   adds **no element** to the page: AC2 of this task says the only page-level
 *   elements the extension owns are the overlay host and, if it were needed, one
 *   `<style>`. With an adopted sheet the count stays at one, and the rule of
 *   `docs/project-profile.md` ("never break host page layout, never mutate page DOM")
 *   is satisfied literally rather than by an exception. `tests/content-paint-style.spec.ts`
 *   pins that the test DOM parses the generated `::highlight(inlinenotes-…)` rules out
 *   of a constructed sheet, which is what makes this variant verifiable here.
 * - **Variant 2 (not shipped): a single `<style id="inlinenotes-paint">`.** It stays
 *   on the shelf until something demonstrates that `::highlight()` rules do not apply
 *   through an adopted sheet; that demonstration needs a real browser (a Chrome smoke
 *   check), not a unit test, and nothing in this slice required it.
 *
 * Append, never replace: the sheet is added to whatever `adoptedStyleSheets` already
 * holds, so a page that adopts its own sheets keeps them. The extension's sheet is
 * then rewritten in place (`replaceSync`), which never touches the page's sheets.
 *
 * The name prefix is shared with `highlight-name.ts`: a rule and a registered name
 * that disagree paint nothing, and the disagreement is invisible from the outside.
 */

import { PAINT_NAME_PREFIX } from './highlight-name';

/**
 * The one declaration block every painted span shares (spec: "one shared style for
 * all entries", a translucent frame rather than the author's own colour).
 *
 * `background-color` and `text-decoration` are inside the small set of properties the
 * CSS Custom Highlight spec applies to a highlight pseudo-element; `outline` is not an
 * inherited property and is not applied there, which is why the frame is drawn as an
 * underline instead of a border. Both colours are `rgba`, and neither depends on the
 * entry, its author or its `visible` flag: own and foreign entries look identical, and
 * the only place the two are told apart is the tooltip header
 * (`docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Own entries and
 * foreign entries are visually distinguished only in the tooltip header").
 */
export const PAINT_DECLARATIONS: readonly string[] = [
  'background-color: rgba(122, 162, 247, 0.26);',
  'text-decoration: underline solid rgba(31, 111, 235, 0.7);',
];

/**
 * A custom highlight name inside `::highlight()` has to be one CSS name token.
 *
 * The read guard of `src/core/entry-store-read.ts` accepts any non-empty string as an
 * entry id, so a hand-edited store could carry an id with a space or a quote. Such a
 * name cannot be written as a selector, and `replaceSync` rejects a sheet it cannot
 * parse — which would cost **every** entry its style. The filter below drops the one
 * unwriteable name and keeps the rest, so a defect in one record cannot dim the page.
 */
const STYLEABLE_NAME = new RegExp(`^${PAINT_NAME_PREFIX}-[A-Za-z0-9_-]+$`);

/** `true` when `name` can appear in a `::highlight()` rule. */
export function isStyleableHighlightName(name: string): boolean {
  return STYLEABLE_NAME.test(name);
}

/** The rule that paints one named highlight. */
export function paintRuleOf(name: string): string {
  return `::highlight(${name}) {\n  ${PAINT_DECLARATIONS.join('\n  ')}\n}`;
}

/** The rules of the current page, one per painted entry, unsafe names dropped. */
export function paintRulesOf(names: readonly string[]): string[] {
  const rules: string[] = [];
  for (const name of names) {
    if (isStyleableHighlightName(name)) {
      rules.push(paintRuleOf(name));
    }
  }
  return rules;
}

/** The owner of the document's paint stylesheet. */
export interface PaintStyleOwner {
  /** Writes the rules of exactly these names; `[]` leaves the sheet empty. */
  sync(names: readonly string[]): void;
  /** The rule texts the owner wrote last, for a test or a devtools check. */
  ruleTexts(): readonly string[];
  /** Removes every rule the extension owns (the teardown of ruling `A39`). */
  clear(): void;
}

/**
 * One owner per document, created on first use.
 *
 * The cache is keyed by the `Document` object, so it cannot grow across pages of a
 * long-lived script and a page that is gone is collectable: this is not the per-page
 * text cache ruling `N7` of `docs/retro.md` refuses. The second reason is honesty:
 * appending the sheet twice would adopt two sheets with the same rules.
 */
const owners = new WeakMap<Document, PaintStyleOwner>();

/**
 * The paint stylesheet owner of a real page, or `null` when this browser has no
 * constructed stylesheets. A `null` owner means the highlights are registered but
 * unstyled, which is the same "no frame" answer ruling `A38` gives for a missing
 * Highlight API: the entry is still stored, still listed, still deletable.
 */
export function paintStyleOwnerOf(doc: Document): PaintStyleOwner | null {
  const cached = owners.get(doc);
  if (cached !== undefined) {
    return cached;
  }
  const sheet = adoptPaintSheet(doc);
  if (sheet === null) {
    return null;
  }

  let rules: string[] = [];
  const owner: PaintStyleOwner = {
    sync(names): void {
      rules = paintRulesOf(names);
      sheet.replaceSync(rules.join('\n'));
    },
    ruleTexts(): readonly string[] {
      return [...rules];
    },
    clear(): void {
      rules = [];
      sheet.replaceSync('');
    },
  };
  owners.set(doc, owner);
  return owner;
}

/**
 * Appends the extension's sheet to `document.adoptedStyleSheets`, keeping every sheet
 * the page already adopted. `null` means "this browser does not do constructed
 * sheets", and no `<style>` element is created in its place: that fallback is the
 * variant of ruling `A41` that needs a demonstrated need, not a missing feature.
 */
function adoptPaintSheet(doc: Document): CSSStyleSheet | null {
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in doc)) {
    return null;
  }
  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
  } catch {
    return null;
  }
  if (typeof sheet.replaceSync !== 'function') {
    return null;
  }
  try {
    // Spread first, own sheet last: the page keeps what it had, and this call is the
    // only time this module touches the array.
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    return null;
  }
  return sheet;
}
