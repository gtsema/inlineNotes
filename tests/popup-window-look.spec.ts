import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { POPUP_DELETE_HIT_BOX_PX, POPUP_DELETE_ICON_PX } from '../src/popup/popup.component';
import { POPUP_STRINGS } from '../src/popup/text';
import { codeOnly } from './support/build-script-guards';

/**
 * The popup look of tasks `t14-01` … `t14-04` (rulings `A140`, `A141`, `A142`, `A143`,
 * and **`A146`/`A147`, which supersede `A145`** the way `A145` superseded `A144`).
 *
 * No test read the popup's stylesheet before this file (`S14-2`): the surface carried a
 * third palette (`#1f1f1f` / `#6b6b6b` / `#e3e3e3`) and a plain `<h1>` with no card, and
 * nothing but a reviewer's eye stood between it and the settings window it now has to
 * match. The claims below are the ones a later edit loses silently, written the way
 * `tests/options-window-look.spec.ts` writes the settings surface:
 *
 * - the palette is a set of **measured literals** (`A140`): every colour the popup
 *   declares is one of the `A125` roles, and the three retired literals are gone;
 * - the **document box paints the window** (`A145`'s fill, kept; `A147`): `body` carries
 *   the cream fill and `margin: 0` and **nothing else** — the panel-filling geometry, the
 *   `12px` radius and the `overflow: hidden` of `A145` are withdrawn by measurement
 *   (`A146`: the reader's screenshot shows square corners), so the falsified declarations
 *   are pinned **absent**, which is what replaced them;
 * - the **component owns the width** (`A141`, restored by `A147`): `.popup` declares the
 *   `320px` the toolbar panel fits and keeps `box-sizing: border-box`, while the document
 *   declares no width and the component still carries **no fill** of its own;
 * - the **card carries the drawn frame** (`A148`, reversing the `A144`/`A145`/`A147`
 *   family's «no frame» half): `.popup` draws a `2px solid #a6cbdc` border with a `12px`
 *   radius — **thicker** than the settings card's `1px`, and the same `A125` decorative
 *   role — while `body` still draws **no** frame at all. The reader read the old `1px`
 *   frame as «прямой угол с чёрной рамкой» against the window's dark edge and then asked
 *   for it back, thicker; the radius is a **drawn frame inside a square window**, never an
 *   attempt to round the window (`A146`);
 * - the component still carries the settings **palette, type scale and inner padding**,
 *   and the settings card's own `1px` frame stays pinned **present** — read from
 *   `src/options/options.component.ts`, because that surface is a page Chrome sizes and a
 *   card is drawn inside it. The two surface frames differ in width on purpose;
 * - the row's delete control is **icon-only** (`A143`): one inline `<svg>` as its only
 *   child, the Russian word in `aria-label` and `title`, the glyph `aria-hidden`, and the
 *   `24px` box with the `16px` glyph the page widgets declare.
 *
 * What this file **cannot** say: whether a rounded corner is visible in a real Chrome
 * popup. That question is **closed by a measurement** (`A146`, Run 12), not by a pin: Chrome
 * draws a popup window as a rectangle, so the answer is no and no CSS value changes it.
 * `A148` does not re-open it — the reader accepts a drawn rounded frame **inside** the
 * square window, which is exactly what `.popup` now draws. Every pin here is a fact about
 * the **source**; the look itself is owed by the run.
 *
 * Two reads of one stylesheet, split the way the settings file splits them (`t10-02`
 * AC8). **Absence** claims read the stylesheet **verbatim**, because the safe error of an
 * absence scan is to read more: a commented-out `border-radius: 12px` is a frame waiting to
 * come back, and a reviewer has to say which it is. **Presence** claims read the
 * comments-stripped text, because a commented-out `padding: 16px` must not stand in for a
 * shipped one.
 *
 * Which assertion goes red for which regression — named here so the file answers the
 * question the brief asks instead of making a reader derive it:
 *
 * - **a palette role changed** → `declares no colour outside the five A125 roles` (the
 *   literal set stops being the pinned five) and the role case that names the changed
 *   value (`declares every A125 role as a literal`);
 * - **the width literal on `.popup` moved off `320px`** (or left the rule) → `gives the
 *   component its own 320px width and never the settings 360px`;
 * - **the settings width `360px` reaches either box** → `gives the component its own 320px
 *   width and never the settings 360px`;
 * - **the document box loses its paint or its zero margin**, **gains a shape again**
 *   (`width`, `min-height`, `border-radius`, `overflow`, `box-sizing`) or **gains a
 *   frame** → `the document box paints the window: the cream fill, the zero margin, no
 *   shape and no frame`;
 * - **the component starts painting itself again** (`background` back on `.popup` or
 *   `:host`) → `leaves the paint to the document box and keeps the width on the
 *   component`;
 * - **the frame's `2px` shrank to the settings `1px`, or the frame left the card** →
 *   `draws the 2px A148 frame and its radius on the card while the settings card keeps its
 *   own 1px` (`A148` deliberately makes the popup frame **thicker** than the settings one,
 *   so the two strings are asserted in opposite directions in the same case);
 * - **the card's frame moved off `2px`/`#a6cbdc`, lost its radius, or a second owner of a
 *   drawn edge appeared** (`outline`, `box-shadow`, a `border-radius` anywhere but the card
 *   and the checkbox) → `draws the 2px A148 frame and its radius on the card while the
 *   settings card keeps its own 1px`, in **both** the verbatim and the comments-stripped
 *   read, so a commented-out frame does not pass either;
 * - **the trash button turned back into a labelled button** → `renders the delete control
 *   icon-only with the word as its accessible name` (the button holds a text node and no
 *   glyph) and `declares the 24px box and the 16px glyph as named constants`.
 *
 * The first, the third and the fourth were proved by mutations applied, observed and
 * reverted from a `cp` copy in the sessions that wrote this file
 * (`docs/state/t14-01-engineer.md`, `docs/state/t14-02-engineer.md`); the document pin and
 * the two new component cases were proved the same way in `t14-03`
 * (`docs/state/t14-03-engineer.md`), and `t14-04` proved two more the same way
 * (`docs/state/t14-04-engineer.md`): the restored width pin by mutating the shipped
 * `width: 320px` to `width: 300px` (the `gives the component its own 320px width…` case
 * went red), and the new `A148` frame pin by mutating the shipped `border: 2px solid
 * #a6cbdc` to `border: 1px solid #a6cbdc` (the `draws the 2px A148 frame…` case went red).
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const COMPONENT = join('src', 'popup', 'popup.component.ts');
const DOCUMENT = join('src', 'popup', 'index.html');

/**
 * Ruling `A125`, copied verbatim: the shipped palette, one entry per role. The three roles
 * the popup does not paint — `onAction`, `accent` and `accentBand` — are listed all the same,
 * because the claim is "the stylesheet declares no colour outside these roles and the one
 * kept refusal colour": dropping an unused role from the list would quietly widen what
 * counts as a role, and a later `#ffffff` on this surface would pass as new.
 */
const PALETTE = {
  page: '#fdf7ee',
  ink: '#1b2a33',
  hint: '#7b6a55',
  action: '#b8480d',
  onAction: '#ffffff',
  accent: '#0f5f7a',
  accentBand: '#eef4f7',
  decorative: '#a6cbdc',
} as const;

/**
 * The refusal colour. It is **not** an `A125` role — the ruling names a confirmation role,
 * not a refusal one — and it stays because it already shipped on this surface before the
 * palette moved (`A140` keeps it, and `tests/options-window-look.spec.ts` keeps the same
 * exception for the settings card).
 */
const PREEXISTING_REFUSAL = '#b3261e';

/**
 * The three literals `A140` retires. They are the popup's own former palette, and the
 * whole point of the task is that no spelling of them survives: the row hairline, the
 * secondary ink and the body ink.
 */
const RETIRED = ['#1f1f1f', '#6b6b6b', '#e3e3e3'] as const;

/** Answer `Q5` of the stage record, and the numbers the page widgets declare (`A114`). */
const HIT_BOX_PX = '24px';
const ICON_PX = '16px';
/**
 * The settings card's width, which neither box of the popup may become: a `360px` here
 * would turn a toolbar panel into a dialog box (`A141`).
 */
const SETTINGS_WIDTH = '360px';
/**
 * The width the toolbar panel fits, restored to the **component** by `A147` after `A145`
 * moved it onto the document box and collapsed the surface to `100px`. It is a literal
 * here because the whole pin is that this exact number is `.popup`'s.
 */
const POPUP_WIDTH = '320px';
/**
 * The settings card's frame, `1px` wide (`A125` decorative). It is the **other** surface's
 * frame: `A148` gives the popup card `2px`, so this exact string must never appear on
 * `.popup` — the popup is deliberately thicker, and a copy of the settings value here
 * would be the old shared-shape claim coming back through the wrong door.
 */
const CARD_FRAME = 'border: 1px solid #a6cbdc;';
/**
 * The `12px` radius of a card frame. Since `A148` it holds on **both** surfaces: the popup
 * card wears it again (the `A144`/`A145` absence is reversed by a ruling) and the settings
 * card never lost it. It is one constant because the two cards still share the arc.
 */
const CARD_RADIUS = 'border-radius: 12px;';
/**
 * The popup card's own frame (`A148`): **thicker** than the settings `1px`, the same `A125`
 * decorative colour. The width is the PM default the ruling leaves with the task («потолще»
 * with no number) and the colour is a role, never a new literal.
 */
const POPUP_FRAME = `border: 2px solid ${PALETTE.decorative};`;
/**
 * The two declarations the document box **keeps** since `A147` — the paint `A145` was right
 * about and the zero margin it never touched. They are spelled out as literals rather than
 * derived, because the whole point of the pin is that the document's rule set is
 * **deliberate**: a reader comparing the file with this list sees one rule of two
 * declarations, not a style sheet that grew.
 */
const SURFACE_PAINT = `background: ${PALETTE.page};`;
const SURFACE_MARGIN = 'margin: 0;';
/**
 * The declarations `A145` put on the **document box** and `A147` withdrew, each with the
 * measurement that withdrew it (`A146`). They are **not deleted** from this file with the
 * rules that carried them: the presence pin became an **absence** pin, so the shape cannot
 * come back unremarked, and the reason is stated where a reader looking for the old pin
 * will find it. The clip is one the reader's screenshot measured as not rendered at all
 * (square corners at `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)`, no anti-aliased step
 * at `(97,73)`, `(98,74)`, `(99,75)`); the width and the `min-height` are the geometry
 * `A147` moved back to `.popup` and the panel's own box respectively. The `box-sizing` goes
 * with them: with no width, padding or border on this box it is a no-op, and `S14-21` is
 * the row about a declaration nothing measures. The `border-radius` is the one `A148` then
 * gave the **card**: it stays pinned absent **here** so the document and the card cannot
 * both claim the arc.
 */
const WITHDRAWN_DOCUMENT_SHAPE = [
  'border-radius:',
  'overflow:',
  'min-height:',
  'width:',
  'box-sizing:',
] as const;
/**
 * The declarations that would make the document box a **frame** — the defect the reader
 * reported twice. `border-radius` is deliberately not in this list: it is the shape, and
 * the shape is pinned absent from this box by `WITHDRAWN_DOCUMENT_SHAPE` above. `border`
 * is, in every spelling, because a drawn edge is what «прямой угол с чёрной рамкой» was.
 * `A148` reverses the **card's** half of that ruling and leaves this one alone: the
 * document paints and the card frames, so exactly one box owns the drawn edge.
 */
const FRAME_DECLARATIONS = ['border:', 'border-top:', 'border-left:', 'border-right:', 'border-bottom:', 'outline:', 'box-shadow:'] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

/** The inline `styles` string of the popup component, verbatim. */
function componentStyles(): string {
  const styles = /styles:\s*`([\s\S]*?)`/.exec(readSource(COMPONENT))?.[1];
  if (styles === undefined) {
    throw new Error(`${COMPONENT} has no inline styles to scan`);
  }
  return styles;
}

/** The same stylesheet with its comments removed: the text the presence claims read. */
function componentCodeStyles(): string {
  return codeOnly(componentStyles());
}

/** The inline `template` string of the popup component, verbatim. */
function componentTemplate(): string {
  const template = /template:\s*`([\s\S]*?)`/.exec(readSource(COMPONENT))?.[1];
  if (template === undefined) {
    throw new Error(`${COMPONENT} has no inline template to scan`);
  }
  return template;
}

/**
 * One CSS rule body of the shipped stylesheet, by selector text. The `new RegExp` form is
 * used for the selectors that carry regex punctuation (`*[type='checkbox']`), so the
 * lookup cannot silently match a prefix of a different rule.
 */
function ruleBody(styles: string, selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(styles);
  if (found === null) {
    throw new Error(`the shipped stylesheet declares no rule for "${selector}"`);
  }
  return found[1] as string;
}

/** Every `<style>` block of an HTML document, comments removed. */
function documentStyles(relativePath: string): string {
  return [...readSource(relativePath).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => codeOnly(match[1] as string))
    .join('\n');
}

/**
 * The `<svg>` element of the shipped template, tag and children whole: from its opening
 * tag to its closing tag, attributes in whatever order they sit.
 */
function deleteGlyph(): string {
  const glyph = /<svg\b[\s\S]*?<\/svg>/.exec(componentTemplate());
  if (glyph === null) {
    throw new Error('the popup template renders no inline glyph');
  }
  return glyph[0];
}

/** The delete button element of the shipped template, opening tag to closing tag. */
function deleteButton(): string {
  const button = /<button\b[^>]*class="delete"[\s\S]*?<\/button>/.exec(componentTemplate());
  if (button === null) {
    throw new Error('the popup template renders no delete button');
  }
  return button[0];
}

/** Whether a fragment of markup carries any letter or digit outside its tags. */
function holdsTextNode(markup: string): boolean {
  const text = markup
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\{\{[^}]*\}\}/g, ' ')
    .trim();
  return text.length > 0;
}

describe('the popup wears the A125 palette and nothing else (t14-01 AC1; ruling A140)', () => {
  const styles = componentStyles();
  const stylesCode = componentCodeStyles();

  it('declares every A125 role the surface uses as a literal', () => {
    // The cream surface is the **document box's** since `A145`, so it is read there; the
    // component keeps the ink and every role below it.
    expect(documentStyles(DOCUMENT)).toContain(SURFACE_PAINT);
    expect(ruleBody(stylesCode, '.popup')).toMatch(new RegExp(`color: ${PALETTE.ink};`));
    // The secondary ink: the foreign-row label and the empty state (answer `Q4`).
    expect(ruleBody(stylesCode, '.row--foreign .author')).toMatch(
      new RegExp(`color: ${PALETTE.hint};`),
    );
    expect(ruleBody(stylesCode, '.empty')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    // The decorative border, as the two controls inside the surface draw it: the row
    // hairline that replaced `#e3e3e3`, and the checkbox's own box (answer `Q3`). Neither
    // is the surface's frame: since `A148` the frame is the card's own `2px` declaration,
    // pinned in `draws the 2px A148 frame…` below.
    expect(ruleBody(stylesCode, '.row')).toContain(`border-top: 1px solid ${PALETTE.decorative};`);
    // The checkbox's box border (answer `Q3`), and the action colour as its accent.
    expect(ruleBody(stylesCode, ".toggle input[type='checkbox']")).toContain(
      `border: 1px solid ${PALETTE.decorative};`,
    );
    expect(ruleBody(stylesCode, ".toggle input[type='checkbox']")).toMatch(
      new RegExp(`accent-color: ${PALETTE.action};`),
    );
    // The refusal ink, kept from before the palette moved (answer `Q4`).
    expect(ruleBody(stylesCode, '.notice')).toMatch(
      new RegExp(`color: ${PREEXISTING_REFUSAL};`),
    );
  });

  it('declares no colour outside the five A125 roles and the kept refusal colour', () => {
    // The set scan is an absence, so it reads the **verbatim** text: a commented-out
    // `#1f1f1f` is a retired role waiting to return and a reviewer has to name it. The
    // pinned side is the **seven roles plus the refusal** — every colour `A125` names,
    // whether this surface paints it or not — and the shipped set is a subset of them, so
    // a new literal is red and a role the popup stops using is not.
    const literals = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) =>
      match[0].toLowerCase(),
    );
    expect(literals.length).toBeGreaterThan(0);
    const allowed = [...new Set([...Object.values(PALETTE), PREEXISTING_REFUSAL])].sort();
    for (const literal of new Set(literals)) {
      expect(allowed, `${literal} is not an A125 role`).toContain(literal);
    }
  });

  it('retires the three literals of the popup’s own former palette', () => {
    for (const retired of RETIRED) {
      expect(styles.toLowerCase(), `${retired} is the retired popup palette`).not.toContain(
        retired,
      );
    }
    // And the same scan over the document, which since `A145` **does** paint: the surface
    // moved there, so the document's literal set is no longer empty — it is a subset of the
    // same roles, and a colour outside them is red here exactly as it is on the component.
    // The scan reads the **verbatim** text, so a commented-out retired literal in the
    // document is flagged the way it is in the component.
    const documentLiterals = [...documentStyles(DOCUMENT).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(
      (match) => match[0].toLowerCase(),
    );
    expect(documentLiterals).toContain(PALETTE.page);
    const allowed = [...new Set([...Object.values(PALETTE), PREEXISTING_REFUSAL])].sort();
    for (const literal of new Set(documentLiterals)) {
      expect(allowed, `${literal} is not an A125 role`).toContain(literal);
    }
  });
});

describe('the popup is the settings card at its own width (t14-01 AC2; ruling A141)', () => {
  const styles = componentStyles();
  const stylesCode = componentCodeStyles();

  it('gives the component its own 320px width and never the settings 360px', () => {
    // `A147` (task `t14-04`), reverting the geometry half of `A145`. `A145` moved the
    // `320px` with the surface and put `width: 100%` on `body`; in a popup that percentage
    // resolves against a narrow initial containing block, so the surface collapsed to
    // `100px` and the text wrapped three times (the reader's screenshot). The old `320px`
    // was doing real work, so it is `.popup`'s again, and the document declares no width
    // at all: a block box with `width: auto` and `margin: 0` already fills the panel.
    // The presence half reads the stripped text, so a commented-out `width: 320px` cannot
    // stand in for a shipped one.
    const card = ruleBody(stylesCode, '.popup');
    expect(card).toMatch(new RegExp(`(?:^|;)\\s*width:\\s*${POPUP_WIDTH};`));
    // And it is read from the **shipped** stylesheet, not from a literal restated here: the
    // constant and the declaration are the same string, so a mutation of one turns this
    // red.
    expect(card).toContain(`width: ${POPUP_WIDTH};`);
    expect(card).toContain('box-sizing: border-box;');
    // The document does **not** claim the width: it paints the window and lets the
    // component set the panel's column.
    expect(documentStyles(DOCUMENT)).not.toMatch(/(?:^|;)\s*width:/);
    // The absence half reads the verbatim text: a commented-out `360px` is still a width
    // someone meant to ship, and it is the settings card's dialog-box value.
    expect(styles).not.toContain(SETTINGS_WIDTH);
    expect(stylesCode).not.toContain(SETTINGS_WIDTH);
    expect(documentStyles(DOCUMENT)).not.toContain(SETTINGS_WIDTH);
    expect(readSource(DOCUMENT)).not.toContain(SETTINGS_WIDTH);
    // The `:host` still declares no width, and the component caps nothing: the panel is
    // sized by the one `320px` on the card and by nothing else.
    expect(ruleBody(stylesCode, ':host')).not.toMatch(/(?:^|;)\s*width:/);
    expect(card).not.toMatch(/max-width:/);
  });

  it('draws the 2px A148 frame and its radius on the card while the settings card keeps its own 1px', () => {
    const card = ruleBody(stylesCode, '.popup');
    // The **shipped** stylesheet, comments and all: the absence claims below read the wider
    // text, so a commented-out second frame counts as one waiting to come back.
    const everything = styles;

    // **The frame is back, thicker** (ruling `A148`, reversing the `A144`/`A145`/`A147`
    // family's absence). This case **replaces** the old `expect(card).not.toContain(CARD_FRAME)`
    // and `expect(card).not.toContain(CARD_RADIUS)` pins with their presence twins: the same
    // two strings, the same rule body, the opposite direction. They are read from the
    // comments-stripped text, so only a shipped frame satisfies them.
    expect(card).toContain(POPUP_FRAME);
    expect(card).toContain(CARD_RADIUS);
    // And it is exactly this frame: the `2px` is **not** the settings `1px`, so the popup
    // card is pinned to its own width rather than to the string the settings half uses.
    expect(card).not.toContain(CARD_FRAME);
    // Still one drawn edge and one arc on the card: no `outline`, no `box-shadow` as a
    // second frame, and exactly one `border` and one `border-radius` declaration in the rule
    // (the `border` shorthand counts once, however the declaration is spelled).
    expect(card).not.toMatch(/outline:/);
    expect(card).not.toMatch(/box-shadow:/);
    expect((card.match(/border:/g) ?? [])).toHaveLength(1);
    expect((card.match(/border-radius:/g) ?? [])).toHaveLength(1);

    // **No second owner of a drawn edge.** The verbatim stylesheet, with the rules that
    // legitimately hold a `#a6cbdc` edge cut out — the card itself now does, and so do the
    // row separator and the checkbox's box — may carry no **other** frame and no other arc.
    let rest = everything;
    for (const selector of ['.popup', '.row', '.row:first-child', ".toggle input[type='checkbox']"]) {
      rest = rest.replace(ruleBody(everything, selector), '').replace(/^\s*\r?\n/m, '');
    }
    expect(rest, POPUP_FRAME).not.toContain(POPUP_FRAME);
    expect(rest, CARD_FRAME).not.toContain(CARD_FRAME);
    expect(rest).not.toMatch(/outline:/);
    expect(rest).not.toMatch(/box-shadow:/);
    expect((rest.match(/border-radius:/g) ?? [])).toHaveLength(0);
    // And `A148` is one rule: the separator and the checkbox keep their declarations, the
    // checkbox keeping both its `#a6cbdc` border and its own `3px` arc (answer `Q3`).
    expect(ruleBody(stylesCode, '.row')).toContain(`border-top: 1px solid ${PALETTE.decorative};`);
    expect(ruleBody(stylesCode, ".toggle input[type='checkbox']")).toContain(
      `border: 1px solid ${PALETTE.decorative};`,
    );
    expect(ruleBody(stylesCode, ".toggle input[type='checkbox']")).toContain('border-radius: 3px;');

    // The half that is still shared, read from `src/options/options.component.ts` rather
    // than restated from memory: type scale and inner padding are one look, so a change to
    // one surface that leaves the other behind is a red test and not a taste question. The
    // count is asserted on two **rule bodies** and not over the whole text, because
    // `padding: 16px` legitimately stands twice on a page: once on the surface and once on
    // the document's `:host` (`src/options/` does exactly the same).
    //
    // The **cream fill left this pair with `A145`**: the paint is the document box's now
    // (`A147` keeps it there), and the shared half is asserted where the paint actually is —
    // the component's ink here, the fill in `the document box paints the window…` below.
    // Keeping the fill in this list would pin a declaration `A145` deliberately removed.
    const optionsStyles = codeOnly(
      /styles:\s*`([\s\S]*?)`/.exec(
        readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'),
      )?.[1] ?? '',
    );
    const settingsCard = ruleBody(optionsStyles, '.options');
    const shared: readonly (readonly [string, string])[] = [
      ['padding: 16px;', 'padding: 16px;'],
      ['font: 13px/1.45 system-ui, sans-serif;', 'font: 13px/1.45 system-ui, sans-serif;'],
      [`color: ${PALETTE.ink};`, `color: ${PALETTE.ink};`],
    ];
    for (const [popupDeclaration, settingsDeclaration] of shared) {
      expect(card, popupDeclaration).toContain(popupDeclaration);
      expect(settingsCard, settingsDeclaration).toContain(settingsDeclaration);
    }
    // And the popup declares each of them exactly once, so "shared" cannot turn into
    // "declared twice on one surface".
    for (const [popupDeclaration] of shared) {
      expect(card.split(popupDeclaration).length - 1, popupDeclaration).toBe(1);
    }

    // The settings half of the old shared sentence stays pinned **present**, and it is the
    // settings file that is read for it. Nothing in the `A144`…`A148` family touches the
    // settings surface, so its look did not move with the popup, and the settings frame is
    // not simply gone from the repository. Since `A148` the two cards share the **radius**
    // again but **not** the border width: the popup is thicker on purpose.
    expect(settingsCard).toContain(CARD_FRAME);
    expect(settingsCard).toContain(CARD_RADIUS);
    expect(card).toContain(CARD_RADIUS);
    expect(settingsCard).not.toContain('outline:');
    expect(settingsCard).not.toContain('box-shadow:');
    // The one difference the reader asked for: the popup's frame is not the settings width.
    expect(card).not.toContain(CARD_FRAME);
    expect(settingsCard).not.toContain(POPUP_FRAME);
  });

  it('leaves the paint to the document box and keeps the width on the component', () => {
    // `A145`'s fill, kept by `A147`: the paint lives in **exactly one place**, and that
    // place is the document. A second `background` on `:host` or `.popup` would be a second
    // surface, which is the shape of the defect `A144` produced (a cream rectangle inside a
    // white one). The absence reads the **verbatim** stylesheet, so a commented-out fill is
    // flagged too.
    const paint = new RegExp(`background:\\s*${PALETTE.page};`);
    expect(styles).not.toMatch(paint);
    expect(ruleBody(stylesCode, ':host')).not.toMatch(/background/);
    expect(ruleBody(stylesCode, '.popup')).not.toMatch(/background/);
    // `:host` is content inside the box and declares no geometry of its own at all: no
    // width, no radius, no clip and no margin. `.popup` is the **one** box that sizes and
    // frames itself (`A147`'s `320px`, `A148`'s `2px` border and `12px` radius), so its
    // width and its frame are excluded from this loop and pinned present in the two cases
    // above; what stays off the card is a **clip** and a **margin**, and the radius is
    // asserted **present** there rather than absent here.
    const host = ruleBody(stylesCode, ':host');
    expect(host).not.toMatch(/(?:^|;)\s*width:/);
    expect(host).not.toMatch(/border-radius:/);
    expect(host).not.toMatch(/overflow:/);
    expect(host).not.toMatch(/margin:/);
    const card = ruleBody(stylesCode, '.popup');
    expect(card).not.toMatch(/overflow:/);
    expect(card).not.toMatch(/margin:/);
    // The old 12px inset is gone with the plain `<h1>` page it belonged to; the card's
    // padding is the settings 16px and no other inset is declared on the card.
    expect(card).toMatch(/(?:^|;)\s*padding:\s*16px;/);
    expect(card).not.toMatch(/padding:\s*12px/);
    expect(styles).not.toMatch(/padding:\s*12px/);
  });

  it('the document box paints the window: the cream fill, the zero margin, no shape and no frame', () => {
    // Ruling `A145` (task `t14-03`) rewrote the pin that used to assert the document's
    // single style block was exactly `body { margin: 0; }`. `A146`/`A147` (task `t14-04`)
    // withdraw half of that rewrite with a **measurement** — the reader's screenshot shows
    // square corners and a `100px` surface — so the case is **rewritten again, not
    // dropped**: it is still the only pin that says the popup document's rule set is
    // deliberate, and the declarations `A147` removes are pinned **absent** instead of
    // disappearing from the file with the rule that carried them.
    const blocks = [...readSource(DOCUMENT).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
      (match) => codeOnly(match[1] as string),
    );
    // One block, so the paint has one owner and no second style sheet can appear beside it
    // (the settings document is pinned the same way, `t10-02` AC8).
    expect(blocks).toHaveLength(1);
    const documentCss = blocks[0] as string;

    // One rule, and it is the `body` rule: whitespace normalised, so this is a claim about
    // the rule and not about the checkout's line endings.
    const rules = [...documentCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
      selector: (match[1] as string).replaceAll(/\s+/g, ' ').trim(),
      body: (match[2] as string).replaceAll(/\s+/g, ' ').trim(),
    }));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe('body');
    const body = rules[0]?.body ?? '';

    // The two declarations the document box **keeps** (`A145`'s fill, `A147`'s margin),
    // each read as a whole declaration so a partial match cannot stand in for it.
    expect(body).toContain(SURFACE_PAINT);
    expect(body).toContain(SURFACE_MARGIN);

    // **What replaced the withdrawn declarations.** `A147` moved the geometry back to
    // `.popup` and withdrew the shape `A146` measured as not rendered **on this box**, so
    // the old presence pins become absence pins over the same block: the document cannot
    // start shaping again unremarked, and a reader who greps for the retired
    // `border-radius`/`width: 100%` here finds this list rather than nothing. Note the
    // radius left this box for the **card** (`A148`), so the absence below is what keeps
    // the two owners apart. Read on the comments-stripped block, so a commented-out shape
    // does not pass either.
    for (const declaration of WITHDRAWN_DOCUMENT_SHAPE) {
      expect(documentCss, declaration).not.toContain(declaration);
    }
    // The paint and the margin are the whole rule: the box is a painted rectangle and
    // nothing more. `margin: 0` is the only declaration whose name starts with `margin`,
    // and no `padding` insets the fill from the window edge either.
    expect(body).not.toMatch(/(?:^|;)\s*padding:/);
    expect(body).not.toMatch(/margin-(?:top|right|bottom|left):/);

    // **No frame on the document.** `A148` puts the drawn frame back on the **card**, not
    // here: the document paints and the card frames, so a `border`, an `outline` or a
    // `box-shadow` on this box would be a **second owner** of the drawn edge — the shape of
    // the defect the family keeps producing. Read on the comments-stripped block, so a
    // commented-out frame does not pass either.
    for (const declaration of FRAME_DECLARATIONS) {
      expect(documentCss, declaration).not.toContain(declaration);
    }
    // And the whole document, comments included: a commented-out `border` is a frame
    // waiting to come back.
    expect(readSource(DOCUMENT)).not.toMatch(/\bborder\s*:/);
    expect(readSource(DOCUMENT)).not.toMatch(/\boutline\s*:/);
    expect(readSource(DOCUMENT)).not.toMatch(/\bbox-shadow\s*:/);

    // The component keeps the fill and the shape off itself, so the paint has one owner.
    // Its `320px` width is pinned in `gives the component its own 320px width…` above, and
    // is deliberately not asserted absent here.
    const host = ruleBody(stylesCode, ':host');
    expect(host).not.toMatch(/margin:/);
    expect(host).not.toMatch(/border/);
    expect(host).not.toMatch(/background/);
  });

  it('draws no mascot and adds no second string or palette role (t14-01 AC3; ruling A142)', () => {
    const template = componentTemplate();
    expect(template).not.toMatch(/<img/);
    expect(template).not.toMatch(/mascot/i);
    expect(template).not.toMatch(/cat-mascot/);
    // No new Russian sentence: the title and the empty line are the shipped ones, and the
    // only Russian word the template now carries is the delete label as an attribute.
    expect(Object.keys(POPUP_STRINGS).sort()).toEqual([
      'delete',
      'emptyState',
      'nameRequired',
      'notInjectable',
      'ownEntry',
      'title',
    ]);
    expect(POPUP_STRINGS.delete).toBe('Удалить');
    // No URL, no data URI and no `@import` on this surface either.
    for (const text of [template, styles, componentTemplate()]) {
      expect(text).not.toMatch(/https?:\/\//i);
      expect(text).not.toMatch(/data:image/i);
      expect(text).not.toMatch(/@import/i);
    }
  });
});


describe('the row delete control is icon-only (t14-01 AC4; ruling A143)', () => {
  const stylesCode = componentCodeStyles();

  it('renders the delete control icon-only with the word as its accessible name', () => {
    const button = deleteButton();

    // The only child is an inline `<svg>`: no text node, no second element, no label.
    expect(holdsTextNode(button)).toBe(false);
    expect(button).not.toContain('{{ deleteLabel }}');
    expect(button).not.toContain('Удалить');
    expect(button).toMatch(/<svg\b/);
    expect([...button.matchAll(/<svg\b/g)]).toHaveLength(1);
    expect([...button.matchAll(/<(?:span|small|label)\b/g)]).toHaveLength(0);

    // The word is the accessible name, in both attributes the page widgets use.
    expect(button).toContain('[attr.aria-label]="deleteLabel"');
    expect(button).toContain('[attr.title]="deleteLabel"');
    expect(componentHasDeleteLabelField()).toBe(true);

    // The glyph itself is decoration: `aria-hidden`, and `focusable="false"` so the SVG
    // does not become a tab stop of its own in a Chromium build that still honours it.
    const glyph = deleteGlyph();
    expect(glyph).toContain('aria-hidden="true"');
    expect(glyph).toContain('focusable="false"');

    // The binding the control keeps: one press, one handler, the row's author name. The
    // behaviour half is `tests/popup-entry-list.spec.ts`'s, and it did not move.
    expect(button).toMatch(/type="button"/);
    expect(button).toMatch(/\(click\)="onRemove\(row\.authorName\)"/);
  });

  it('declares the 24px box and the 16px glyph as named constants', () => {
    // The two numbers are read from the **module**, so a constant changed in `src/popup/`
    // turns this red even if the stylesheet were edited to agree with it.
    expect(POPUP_DELETE_HIT_BOX_PX).toBe(24);
    expect(POPUP_DELETE_ICON_PX).toBe(16);

    const button = ruleBody(stylesCode, '.delete');
    expect(button).toMatch(new RegExp(`(?:^|;)\\s*width:\\s*${HIT_BOX_PX};`));
    expect(button).toMatch(new RegExp(`(?:^|;)\\s*height:\\s*${HIT_BOX_PX};`));
    expect(button).toMatch(new RegExp(`(?:^|;)\\s*min-width:\\s*${HIT_BOX_PX};`));
    expect(button).toMatch(new RegExp(`(?:^|;)\\s*min-height:\\s*${HIT_BOX_PX};`));

    const glyphRule = ruleBody(stylesCode, '.delete svg');
    expect(glyphRule).toMatch(new RegExp(`(?:^|;)\\s*width:\\s*${ICON_PX};`));
    expect(glyphRule).toMatch(new RegExp(`(?:^|;)\\s*height:\\s*${ICON_PX};`));
    // The paint is `currentColor`, as in `src/content/overlay/action-icons.tsx`: the
    // button's own colour colours the drawing, and no second declaration per state exists.
    expect(glyphRule).toMatch(/(?:^|;)\s*stroke:\s*currentColor;/);
    expect(glyphRule).toMatch(/(?:^|;)\s*fill:\s*none;/);
    expect(button).toMatch(new RegExp(`(?:^|;)\\s*color:\\s*${PALETTE.action};`));

    // The size attributes the template states and the constants cannot drift apart: both
    // are `POPUP_DELETE_ICON_PX`, and the glyph carries its size as an attribute the way
    // the page widgets do (no `width` attribute would leave the SVG at its default box).
    const template = componentTemplate();
    expect(template).toContain('[attr.width]="deleteIconPx"');
    expect(template).toContain('[attr.height]="deleteIconPx"');
    expect(template).toContain('[attr.viewBox]="deleteIconViewBox"');
    // The drawing is the trash can of the editor's delete button, path for path: the
    // duplication is deliberate (`S14-4`), so the two drawings are pinned to stay the same
    // drawing while they exist twice.
    const shippedPaths = deleteGlyph().match(/<path\b[^>]*\/>/g) ?? [];
    const editorPaths =
      readFileSync(join(projectRoot, 'src', 'content', 'overlay', 'action-icons.tsx'), 'utf8')
        .match(/<path\b[^>]*\/>/g) ?? [];
    const trashPaths = editorPaths.filter((path) => !path.includes('M5 12.5'));
    expect(shippedPaths).toEqual(trashPaths);
  });

  it('states at the declaration why the glyph is re-declared rather than imported', () => {
    // `S14-4`: the popup cannot import `src/content/overlay/action-icons.tsx` — a Preact
    // module under `src/content/` — and the boundary is pinned by
    // `tests/toolchain-contract.spec.ts`. The reason has to live where the copy lives, or
    // the next reader deletes one of the two drawings. The declaration is the view-box
    // comment plus the field it introduces: the reason sits between them.
    const raw = readSource(COMPONENT);
    const declaration = raw.slice(
      raw.indexOf('**Why this glyph is declared here instead of imported**'),
      raw.indexOf('readonly deleteIconViewBox'),
    );
    expect(declaration.length).toBeGreaterThan(0);
    expect(declaration).toContain('S14-4');
    expect(declaration).toContain('A143');
    expect(declaration).toMatch(/Preact/);
    expect(declaration).toMatch(/Angular/);
    expect(declaration).toContain('action-icons');
    // And the import the comment says is forbidden really is absent, so the prose cannot
    // outlive the code it describes. Only the one permitted `src/content/` import remains
    // on this module — the storage port adapter, shipped since `t4-02` — and the overlay
    // module named in the comment is imported by nobody here.
    expect(codeOnly(raw)).not.toMatch(/from '\.\.\/content\/overlay\//);
    expect(codeOnly(raw)).not.toMatch(/\baction-icons\b/);
    expect(codeOnly(raw)).not.toMatch(/\bDeleteActionIcon\b/);
  });

  it('keeps the delete control in the row, outside every notice and ownership gate', () => {
    // The shape `tests/toolchain-contract.spec.ts` pins, restated beside the new glyph so
    // the look change cannot have moved the control: still no ownership condition wraps
    // it, and still exactly one delete control per row.
    const template = componentTemplate();
    expect(template.match(/class="delete"/g) ?? []).toHaveLength(1);
    expect(template).not.toMatch(/@if \([^)]*own/i);
  });
});

/** The component declares the delete label as a field of the one strings module. */
function componentHasDeleteLabelField(): boolean {
  return /readonly deleteLabel: string = POPUP_STRINGS\.delete;/.test(readSource(COMPONENT));
}

describe('the checkbox is styled and stays a checkbox (t14-01 AC6; answer Q3)', () => {
  const template = componentTemplate();
  const stylesCode = componentCodeStyles();

  it('keeps the real input with its aggregate binding and its change handler', () => {
    expect([...template.matchAll(/<input\b/g)]).toHaveLength(1);
    expect(template).toMatch(/type="checkbox"/);
    expect(template).toMatch(/\[checked\]="row\.allVisible"/);
    expect(template).toMatch(/\(change\)="onToggle\(row\.authorName,\s*\$event\)"/);
    // Nothing replaced it: no `role="checkbox"`, no custom control, no `aria-checked`
    // hand-managed on a `<span>`.
    expect(template).not.toMatch(/role="checkbox"/);
    expect(template).not.toMatch(/aria-checked/);
  });

  it('paints the box with the decorative border and the action accent, at the 13px scale', () => {
    const box = ruleBody(stylesCode, ".toggle input[type='checkbox']");
    expect(box).toContain(`border: 1px solid ${PALETTE.decorative};`);
    expect(box).toMatch(new RegExp(`accent-color: ${PALETTE.action};`));
    // The label keeps the surface's own 13px scale, not a smaller step of its own.
    expect(ruleBody(stylesCode, '.toggle')).toMatch(/(?:^|;)\s*font-size:\s*13px;/);
    // And the value is an `A125` role, not a third colour: the accent is the primary
    // action role the settings `Сохранить` button already wears.
    expect(PALETTE.action).toBe('#b8480d');
  });
});

describe('the empty state and the notices take the A125 inks (t14-01 AC7; answer Q4)', () => {
  const template = componentTemplate();
  const stylesCode = componentCodeStyles();

  it('colors the empty line secondary and both notices as refusals', () => {
    expect(ruleBody(stylesCode, '.empty')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    expect(ruleBody(stylesCode, '.notice')).toMatch(
      new RegExp(`color: ${PREEXISTING_REFUSAL};`),
    );
    // Both notices share the one rule, so neither can drift to a colour of its own.
    expect(stylesCode.match(/color:\s*#b3261e/g) ?? []).toHaveLength(1);
  });

  it('keeps the name-required notice a real underlined button that opens the options page', () => {
    expect(template).toMatch(
      /<button class="notice notice--name" type="button" \(click\)="openSettings\(\)">/,
    );
    const button = ruleBody(stylesCode, 'button.notice');
    expect(button).toMatch(/(?:^|;)\s*text-decoration:\s*underline;/);
    expect(button).toMatch(/(?:^|;)\s*border:\s*0;/);
    expect(button).toMatch(/(?:^|;)\s*background:\s*none;/);
    expect(button).toMatch(/(?:^|;)\s*font:\s*inherit;/);
    expect(button).toMatch(/(?:^|;)\s*cursor:\s*pointer;/);
  });
});