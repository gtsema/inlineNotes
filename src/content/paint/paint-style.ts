/**
 * The paint stylesheet: the `::highlight()` rules the highlights need in order to be
 * visible at all (task `t3-02` AC2; ruling `A41`; per-author declarations since task
 * `t5-02`, rulings `A94`, `A102`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight
 * painting" (one rule per entry) and "Author colour and `paint slot`" (the declarations
 * of a rule come from the author's palette slot — task `t5-02`, rulings `A94`, `A102`),
 * plus the page-respect rule of ruling `A41` (the extension owns the overlay host and one
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
 * What did **not** change with `A94`: the rule count. One painted entry is still one rule
 * under one `inlinenotes-<entryId>` name (ruling `A70`), and a palette of six slots does
 * not add six shared rules. A per-slot rule set would break the teardown of ruling `A39`
 * — dropping one entry has to be possible without touching what its neighbours paint —
 * and it would make the number of rules a function of the palette rather than of the
 * page.
 *
 * The name prefix is shared with `highlight-name.ts`: a rule and a registered name
 * that disagree paint nothing, and the disagreement is invisible from the outside.
 */

import { PAINT_NAME_PREFIX } from './highlight-name';
import type { PaintSlot } from './paint-palette';
import { paintDeclarationsOfSlot } from './paint-palette';

/**
 * The rule this module writes for one painted entry: its `paint name` plus the palette
 * slot its author maps to.
 *
 * The pair arrives together because a rule cannot be built from a name alone once the
 * declarations vary: a `sync(names)` signature would leave this module guessing which
 * colour the caller meant, and a second parallel array of slots would be a second
 * contract to keep in step with the first.
 */
export interface PaintStyleRule {
  /** The `paint name` of the entry: `inlinenotes-<entryId>` (ruling `A70`). */
  readonly name: string;
  /** The palette slot its `authorName` maps to (ruling `A102`). */
  readonly slot: PaintSlot;
  /**
   * `true` for a note from the sync server that the reader has switched off in the
   * popup (Stage 17, ruling `A163`).
   *
   * A foreign note lives in this document's memory and never in the store, so its
   * display flag cannot be a stored field; the write that hides it is the memory that
   * holds it. The paint pass states that answer here rather than the flag being a
   * second look at memory inside this module, and the only declaration it changes is
   * the painted `background-color` — the underline stays, so a hidden note reads as
   * present-but-switched-off rather than as gone. The reader's own hidden notes are
   * not painted at all (ruling `A40`), which is why this flag is never set for them.
   */
  readonly dimmed?: boolean;
}

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

/** The rule that paints one named highlight, with the declarations of its slot. */
export function paintRuleOf(name: string, slot: PaintSlot, dimmed = false): string {
  const declarations = dimmed
    ? paintDeclarationsOfSlot(slot).filter(
        (declaration: string) => !declaration.trimStart().startsWith(DIMMED_HIDDEN_PROPERTY),
        )
    : paintDeclarationsOfSlot(slot);
  return `::highlight(${name}) {\n  ${declarations.join('\n  ')}\n}`;
}

/**
 * The one property a switched-off foreign note drops: its fill. Named, because the
 * rule below is what makes "hidden" mean one thing — the underline of the `highlight
 * frame` stays as the mark that there is a note here.
 */
const DIMMED_HIDDEN_PROPERTY = 'background-color:';

/**
 * The rules of the current page, one per painted entry, unsafe names dropped.
 *
 * The order is the caller's order — the paint pass hands over its own entry order — and
 * nothing is sorted, deduplicated or grouped by slot here. Grouping by slot is exactly
 * what the count of rules must not do (rulings `A70`, `A94`).
 */
export function paintRulesOf(rules: readonly PaintStyleRule[]): string[] {
  const written: string[] = [];
  for (const rule of rules) {
    if (isStyleableHighlightName(rule.name)) {
      written.push(paintRuleOf(rule.name, rule.slot, rule.dimmed === true));
    }
  }
  return written;
}

/** The owner of the document's paint stylesheet. */
export interface PaintStyleOwner {
  /**
   * Writes the rules of exactly these entries — one rule each, with the declarations of
   * that author's palette slot; `[]` leaves the sheet empty.
   */
  sync(rules: readonly PaintStyleRule[]): void;
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
    sync(entries): void {
      rules = paintRulesOf(entries);
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
