import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { POPUP_DELETE_HIT_BOX_PX, POPUP_DELETE_ICON_PX } from '../src/popup/popup.component';
import { POPUP_STRINGS } from '../src/popup/text';
import { codeOnly } from './support/build-script-guards';

/**
 * The popup look of task `t14-01` (rulings `A140`, `A141`, `A142`, `A143`).
 *
 * No test read the popup's stylesheet before this file (`S14-2`): the surface carried a
 * third palette (`#1f1f1f` / `#6b6b6b` / `#e3e3e3`) and a plain `<h1>` with no card, and
 * nothing but a reviewer's eye stood between it and the settings window it now has to
 * match. The three claims below are the ones a later edit loses silently, written the way
 * `tests/options-window-look.spec.ts` writes the settings surface:
 *
 * - the palette is a set of **measured literals** (`A140`): every colour the popup declares
 *   is one of the `A125` roles, and the three retired literals are gone;
 * - the card is the settings card's **shape at the popup's own width** (`A141`): the same
 *   border, radius, type scale and inner padding, `320px` and never the settings `360px`;
 * - the row's delete control is **icon-only** (`A143`): one inline `<svg>` as its only
 *   child, the Russian word in `aria-label` and `title`, the glyph `aria-hidden`, and the
 *   `24px` box with the `16px` glyph the page widgets declare.
 *
 * Two reads of one stylesheet, split the way the settings file splits them (`t10-02`
 * AC8). **Absence** claims read the stylesheet **verbatim**, because the safe error of an
 * absence scan is to read more: a commented-out `#1f1f1f` is a palette role waiting to
 * come back, and a reviewer has to say which it is. **Presence** claims read the
 * comments-stripped text, because a commented-out `border-radius: 12px` must not stand in
 * for a shipped one.
 *
 * Which assertion goes red for which regression — named here so the file answers the
 * question the brief asks instead of making a reader derive it:
 *
 * - **a palette role changed** → `declares no colour outside the five A125 roles` (the
 *   literal set stops being the pinned five) and the role case that names the changed
 *   value (`declares every A125 role as a literal`);
 * - **the width changed to `360px`** → `sizes the card at the popup's own 320px and never
 *   the settings 360px`;
 * - **the trash button turned back into a labelled button** → `renders the delete control
 *   icon-only with the word as its accessible name` (the button holds a text node and no
 *   glyph) and `declares the 24px box and the 16px glyph as named constants`.
 *
 * The first and the third were proved by mutations applied, observed and reverted in the
 * session that wrote this file (`docs/state/t14-01-engineer.md`).
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
/** `A141`: the popup's own width, and the settings card's, which it must not become. */
const POPUP_WIDTH = '320px';
const SETTINGS_WIDTH = '360px';

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
    // The card: the settings window's cream surface and ink (`A140`).
    expect(ruleBody(stylesCode, ':host')).toMatch(new RegExp(`background: ${PALETTE.page};`));
    expect(ruleBody(stylesCode, '.popup')).toMatch(new RegExp(`background: ${PALETTE.page};`));
    expect(ruleBody(stylesCode, '.popup')).toMatch(new RegExp(`color: ${PALETTE.ink};`));
    // The secondary ink: the foreign-row label and the empty state (answer `Q4`).
    expect(ruleBody(stylesCode, '.row--foreign .author')).toMatch(
      new RegExp(`color: ${PALETTE.hint};`),
    );
    expect(ruleBody(stylesCode, '.empty')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    // The decorative border: the card frame and the row hairline that replaced `#e3e3e3`.
    expect(ruleBody(stylesCode, '.popup')).toContain(`border: 1px solid ${PALETTE.decorative};`);
    expect(ruleBody(stylesCode, '.row')).toContain(`1px solid ${PALETTE.decorative}`);
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
    // And the same scan over the document, so the margin rule cannot become a second
    // owner of a colour the card does not declare.
    expect(documentStyles(DOCUMENT).toLowerCase()).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe('the popup is the settings card at its own width (t14-01 AC2; ruling A141)', () => {
  const styles = componentStyles();
  const stylesCode = componentCodeStyles();

  it('sizes the card at the popup’s own 320px and never the settings 360px', () => {
    // The presence half reads the stripped text: a commented-out `width: 320px` must not
    // satisfy it. The absence half reads the verbatim text: a commented-out `360px` is
    // still a width someone meant to ship.
    expect(ruleBody(stylesCode, '.popup')).toMatch(
      new RegExp(`(?:^|;)\\s*width:\\s*${POPUP_WIDTH};`),
    );
    expect(styles).not.toContain(SETTINGS_WIDTH);
    expect(stylesCode).not.toContain(SETTINGS_WIDTH);
    // The width is the popup's own rule and not a card cap: the settings surface sizes
    // itself by the dialog box, this one is a fixed toolbar panel.
    expect(ruleBody(stylesCode, '.popup')).not.toMatch(/max-width:/);
    expect(ruleBody(stylesCode, '.popup')).not.toMatch(
      new RegExp(`min-width:\\s*${POPUP_WIDTH}`),
    );
  });

  it('takes the settings card’s frame, radius, type scale and inner padding', () => {
    const card = ruleBody(stylesCode, '.popup');
    expect(card).toMatch(
      new RegExp(`(?:^|;)\\s*border:\\s*1px solid ${PALETTE.decorative};`),
    );
    expect(card).toMatch(/(?:^|;)\s*border-radius:\s*12px;/);
    expect(card).toMatch(/(?:^|;)\s*padding:\s*16px;/);
    expect(card).toMatch(/(?:^|;)\s*font:\s*13px\/1\.45 system-ui, sans-serif;/);
    // The four values are the ones `src/options/options.component.ts` declares, read from
    // that file rather than restated from memory: the shape is shared, so a change to one
    // surface that leaves the other behind is a red test and not a taste question.
    const optionsStyles = codeOnly(
      /styles:\s*`([\s\S]*?)`/.exec(
        readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'),
      )?.[1] ?? '',
    );
    const settingsCard = ruleBody(optionsStyles, '.options');
    for (const declaration of [
      `border: 1px solid ${PALETTE.decorative};`,
      'border-radius: 12px;',
      'padding: 16px;',
      'font: 13px/1.45 system-ui, sans-serif;',
    ]) {
      expect(card, declaration).toContain(declaration);
      expect(settingsCard, declaration).toContain(declaration);
    }
  });

  it('gives the document the body margin the options document owns, and nothing else', () => {
    // Answer `Q1`: a bordered card with a browser-default margin around it looks like a
    // floating tile rather than a panel, so the one rule the options document owns is
    // repeated here — one block, one rule, no colour and no width.
    const blocks = [...readSource(DOCUMENT).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
      (match) => codeOnly(match[1] as string),
    );
    expect(blocks).toHaveLength(1);
    // One rule, one declaration, whitespace normalised: this is a claim about the rule and
    // not about the checkout's line endings.
    expect((blocks[0] as string).replaceAll(/\s+/g, ' ').trim()).toBe('body { margin: 0; }');
    // The card fills the panel: the panel is the fixed width, and nothing on the host
    // adds a second margin or a second border around it.
    const host = ruleBody(stylesCode, ':host');
    expect(host).not.toMatch(/margin:/);
    expect(host).not.toMatch(/border:/);
    expect(host).toMatch(new RegExp(`background: ${PALETTE.page};`));
    // The old 12px inset is gone with the plain `<h1>` page it belonged to; the card's
    // padding is the settings 16px and no other inset is declared on the card.
    expect(card(stylesCode)).not.toMatch(/padding:\s*12px/);
    expect(styles).not.toMatch(/padding:\s*12px/);
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

/** The card rule body, read from the text this case set already resolved. */
function card(styles: string): string {
  return ruleBody(styles, '.popup');
}

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