import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OPTIONS_MESSAGE_TEXT, OPTIONS_STRINGS, nameCounterText } from '../src/options/text';

/**
 * The settings-window look of task `t9-02` (rulings `A123`, `A124`, `A125`, `A126`).
 *
 * Three claims are worth an executable pin, and all three are the kind a later edit
 * loses silently:
 *
 * - the `settings mascot` is a **file** that ships (AC1, AC2): the manifest never
 *   names it, so the `dist/` reference check in `scripts/build-extension.mjs` is
 *   blind to it unless a second check looks, and a re-encode of the owner's own art
 *   would change nothing a reviewer would notice by eye;
 * - the palette is a set of **measured literal values** (AC5): a recolored pair can
 *   stay pretty and drop under WCAG AA, so the ratios are computed here from the
 *   shipped stylesheet text rather than quoted from the state file;
 * - the page **fits the Chrome dialog box** (AC7): the fixed 360 px column that
 *   shipped before this task is the exact thing the ruling removed, and prose about
 *   "it fits" proves nothing.
 *
 * What is deliberately **not** pinned here is the wording of the spec section that
 * carries these rules: the spec edit lands in the second commit (`A53`), and a test
 * in the first commit cannot read a sentence that does not exist yet. AC 9 of
 * `docs/state/t9-02-settings-window-look.md` is answered by file and line in
 * `docs/state/t9-02-engineer.md` instead.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Ruling `A126`: the SHA-256 and the byte size of the owner's own `128.png`. */
const ASSET_SHA256 = 'a899a9106d0ebefc978e493db61663917703803ebb5f9c703d9e67bb00d446b4';
const ASSET_BYTES = 27414;

/** Where the asset lives in the source tree and in the built folder (AC1). */
const SRC_ASSET = join('src', 'options', 'assets', 'cat-mascot.png');
const DIST_ASSET = join('dist', 'options', 'assets', 'cat-mascot.png');

/** The relative URL the options document resolves, and the file it resolves to. */
const MASCOT_URL = 'assets/cat-mascot.png';

/** Ruling `A125`, copied verbatim: the shipped palette, one entry per role. */
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
 * The one literal the pinned palette has no role for, listed here so the pin below
 * stays exact instead of vague: it is the refusal color that already shipped on this
 * page, kept unchanged (`A125` names a confirmation role, not a refusal one).
 */
const PREEXISTING_REFUSAL = '#b3261e';

/** Every text pair the palette ships, with the background it is read on. */
const TEXT_PAIRS: [string, string, string][] = [
  ['ink on the page background', PALETTE.ink, PALETTE.page],
  ['hint and counter on the page background', PALETTE.hint, PALETTE.page],
  ['action label on the action background', PALETTE.onAction, PALETTE.action],
  ['confirmation on the pale band', PALETTE.accent, PALETTE.accentBand],
  ['refusal on the pale band', PREEXISTING_REFUSAL, PALETTE.accentBand],
];

function readSource(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

/** Strips comments, so a claim about shipped code is not satisfied by prose. */
function codeOnly(text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/\/\/[^\n]*/g, ' ');
}

/** The inline `styles` string of a single-inline-template component, verbatim. */
function componentStyles(componentPath: string): string {
  const raw = readSource(componentPath);
  const styles = /styles:\s*`([\s\S]*?)`/.exec(raw)?.[1];
  if (styles === undefined) {
    throw new Error(`${componentPath} has no inline styles to scan`);
  }
  return styles;
}

/** The inline `template` string of a single-inline-template component, verbatim. */
function componentTemplate(componentPath: string): string {
  const raw = readSource(componentPath);
  const template = /template:\s*`([\s\S]*?)`/.exec(raw)?.[1];
  if (template === undefined) {
    throw new Error(`${componentPath} has no inline template to scan`);
  }
  return template;
}

/** One CSS rule body of the shipped stylesheet, by selector text. */
function ruleBody(styles: string, selector: string): string {
  const at = styles.indexOf(`${selector} {`);
  if (at < 0) {
    throw new Error(`the shipped stylesheet declares no rule for "${selector}"`);
  }
  const open = styles.indexOf('{', at);
  const close = styles.indexOf('}', open);
  return styles.slice(open + 1, close);
}

function sha256(relativePath: string): string {
  return createHash('sha256').update(readFileSync(join(projectRoot, relativePath))).digest('hex');
}

/** One WCAG relative luminance term of an 8-bit channel. */
function channelLinear(byte: number): number {
  const srgb = byte / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const digits = hex.slice(1);
  const r = channelLinear(Number.parseInt(digits.slice(0, 2), 16));
  const g = channelLinear(Number.parseInt(digits.slice(2, 4), 16));
  const b = channelLinear(Number.parseInt(digits.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.x contrast ratio of two colors, as the state file measured them. */
function contrastRatio(foreground: string, background: string): number {
  const one = luminance(foreground);
  const other = luminance(background);
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

interface ManifestShape {
  web_accessible_resources?: unknown;
}

describe('the settings mascot ships as a file (t9-02 AC1, rulings A123 + A126)', () => {
  it('holds the owner asset byte-for-byte in src/options/assets', () => {
    expect(sha256(SRC_ASSET)).toBe(ASSET_SHA256);
    expect(statSync(join(projectRoot, SRC_ASSET)).size).toBe(ASSET_BYTES);
  });

  it('never re-encodes, resizes or crops the PNG', () => {
    const bytes = readFileSync(join(projectRoot, SRC_ASSET));
    // The PNG signature, then the IHDR chunk: width, height, bit depth, color type.
    // 6 is RGBA, 8 is the bit depth the source ships with, so a re-encode or a crop
    // is a different number here and not a reviewer's judgement call.
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(bytes.readUInt32BE(16)).toBe(128);
    expect(bytes.readUInt32BE(20)).toBe(128);
    expect(bytes[24]).toBe(8);
    expect(bytes[25]).toBe(6);
  });

  it('ships the same bytes inside dist/options/assets', () => {
    // `npm run build` runs before `npm test` (ruling `A62`), and
    // `tests/content-anchor-boundaries.spec.ts` already fails on a missing `dist/`,
    // so this is a real claim and not one that passes vacuously on a clean clone.
    expect(existsSync(join(projectRoot, DIST_ASSET))).toBe(true);
    expect(sha256(DIST_ASSET)).toBe(ASSET_SHA256);
  });

  it('reaches the mascot through a relative URL, and nothing else', () => {
    const template = componentTemplate(join('src', 'options', 'options.component.ts'));
    expect(template).toContain(`src="${MASCOT_URL}"`);

    const shippedCode = ['src/options/options.component.ts', 'src/options/main.ts', 'src/options/index.html']
      .map((path) => codeOnly(readSource(path)))
      .join('\n');
    // No data URI, no remote image, no `@import`: the page asks its own folder.
    expect(shippedCode).not.toMatch(/data:image/i);
    expect(shippedCode).not.toMatch(/https?:\/\//i);
    expect(shippedCode).not.toMatch(/@import/i);

    // The asset belongs to the extension's own page, so MV3 needs no resource
    // declaration for it, and none is added.
    const manifest = JSON.parse(readSource(join('src', 'manifest.json'))) as ManifestShape;
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});

describe('the build copies the asset and fails without it (t9-02 AC2)', () => {
  it('declares the asset copy for the options project and leaves the popup project alone', () => {
    const config = JSON.parse(readSource('angular.json')) as {
      projects: Record<string, { architect: { build: { options: { assets?: unknown } } } }>;
    };
    expect(config.projects['options']?.architect?.build?.options?.assets).toEqual([
      { glob: '**/*', input: 'src/options/assets', output: 'assets' },
    ]);
    expect(config.projects['popup']?.architect?.build?.options?.assets).toBeUndefined();
  });

  it('fails the build when the copied file is absent', () => {
    const script = codeOnly(readSource(join('scripts', 'build-extension.mjs')));
    // The manifest reference check cannot cover this file — the manifest never names
    // it — so the script needs its own check, and that check has to run.
    expect(script).toMatch(/'options\/assets\/cat-mascot\.png'/);
    expect(script).toMatch(/function verifyOptionsAssetShips\(\)/);
    expect(script).toMatch(/existsSync\(join\(distDir, asset\)\)/);
    expect(script).toMatch(/fail\(\s*`dist\/\$\{asset\} is missing/);
    expect(script).toMatch(/verifyOptionsAssetShips\(\);/);
  });
});

describe('the header (t9-02 AC3, ruling A124)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));
  const template = componentTemplate(join('src', 'options', 'options.component.ts'));

  it('renders the mascot in the header, next to the existing title', () => {
    const header = /<header class="header">([\s\S]*?)<\/header>/.exec(template);
    if (header === null) {
      throw new Error('the options template has no header element');
    }
    expect(header[1]).toMatch(/<img class="mascot" src="assets\/cat-mascot\.png" alt="" \/>/);
    expect(header[1]).toMatch(/<h1 class="title">\{\{ title \}\}<\/h1>/);
    expect(header[1].indexOf('class="mascot"')).toBeLessThan(header[1].indexOf('class="title"'));
    // The art carries no information, so it stays out of the accessibility tree
    // rather than gaining a second Russian string (AC4 allows exactly one).
    expect(header[1]).toMatch(/alt=""/);
    expect(header[1]).not.toMatch(/alt="[^"]+/);
  });

  it('frames the mascot with CSS at 80 CSS px, never by editing the PNG', () => {
    const mascot = ruleBody(styles, '.mascot');
    expect(mascot).toMatch(/width: 80px/);
    expect(mascot).toMatch(/height: 80px/);
    expect(mascot).toMatch(/border-radius: 50%/);
    expect(mascot).toMatch(/object-fit: cover/);
    expect(mascot).toMatch(/object-position: center/);
    expect(mascot).toContain(`border: 2px solid ${PALETTE.decorative}`);
  });
});

describe('exactly one new Russian string (t9-02 AC4)', () => {
  it('adds the name explanation line and moves no existing string', () => {
    expect(Object.keys(OPTIONS_STRINGS).sort()).toEqual([
      'nameHint',
      'nameLabel',
      'save',
      'saved',
      'title',
    ]);
    // The four strings that shipped before this task, byte-identical.
    expect(OPTIONS_STRINGS.title).toBe('Настройки inlineNotes');
    expect(OPTIONS_STRINGS.nameLabel).toBe('Имя');
    expect(OPTIONS_STRINGS.save).toBe('Сохранить');
    expect(OPTIONS_STRINGS.saved).toBe('Имя сохранено');
    // The one new string.
    expect(OPTIONS_STRINGS.nameHint).toBe('Это имя подписывает каждую заметку');
  });

  it('keeps the message map, its keys and the counter wording untouched', () => {
    expect(Object.keys(OPTIONS_MESSAGE_TEXT).sort()).toEqual([
      'name_required',
      'quota',
      'saved',
      'serialization',
      'storage_unavailable',
      'unavailable',
    ]);
    expect(nameCounterText(0)).toBe('0/40');
    expect(nameCounterText(40)).toBe('40/40');
  });

  it('holds no non-Russian string value in the options constants', () => {
    for (const [key, value] of Object.entries(OPTIONS_STRINGS)) {
      expect(value, key).toMatch(/[А-Яа-яЁё]/);
    }
  });
});

describe('the palette is literal and derived (t9-02 AC5, ruling A125)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));

  it('declares every pinned role as a literal', () => {
    expect(ruleBody(styles, ':host')).toMatch(new RegExp(`background: ${PALETTE.page};`));
    expect(ruleBody(styles, '.options')).toMatch(new RegExp(`color: ${PALETTE.ink};`));
    expect(ruleBody(styles, '.hint')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    expect(ruleBody(styles, '.counter')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    expect(ruleBody(styles, '.save')).toMatch(new RegExp(`background: ${PALETTE.action};`));
    expect(ruleBody(styles, '.save')).toMatch(new RegExp(`color: ${PALETTE.onAction};`));
    expect(ruleBody(styles, '.message')).toMatch(new RegExp(`background: ${PALETTE.accentBand};`));
    expect(ruleBody(styles, '.message--saved')).toMatch(new RegExp(`color: ${PALETTE.accent};`));
    expect(ruleBody(styles, '.mascot')).toContain(PALETTE.decorative);
    expect(ruleBody(styles, '.options')).toContain(PALETTE.decorative);
  });

  it('declares no color outside the pinned palette and the kept refusal color', () => {
    const literals = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((match) => match[0].toLowerCase())
      .sort();
    const pinned = [...Object.values(PALETTE), PREEXISTING_REFUSAL].sort();
    expect([...new Set(literals)].sort()).toEqual(pinned);
  });

  it('keeps every pair that carries text at or above WCAG AA', () => {
    for (const [pair, foreground, background] of TEXT_PAIRS) {
      expect(contrastRatio(foreground, background), pair).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the page fills the Chrome dialog box (t9-02 AC7, ruling A124)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));

  it('drops the fixed 360 px column and keeps the number only as a cap', () => {
    expect(styles).not.toMatch(/(^|[^-])width:\s*360px/m);
    expect(ruleBody(styles, '.options')).toMatch(/width: 100%/);
    expect(ruleBody(styles, '.options')).toMatch(/max-width: 360px/);
  });

  it('gives the page the whole box and centers the card inside it', () => {
    expect(ruleBody(styles, ':host')).toMatch(/min-height: 100vh/);
    expect(ruleBody(styles, ':host')).toMatch(/box-sizing: border-box/);
    expect(ruleBody(styles, '.options')).toMatch(/box-sizing: border-box/);
    expect(ruleBody(styles, '.options')).toMatch(/margin: 0 auto/);
    // The body margin is the only rule the document itself owns; without it the
    // page background cannot reach the edge of the dialog box.
    expect(codeOnly(readSource(join('src', 'options', 'index.html')))).toMatch(/body\s*\{\s*margin: 0;/);
  });

  it('ships no other stylesheet, so the palette has one owner', () => {
    const config = JSON.parse(readSource('angular.json')) as {
      projects: Record<string, { architect: { build: { options: { styles?: unknown } } } }>;
    };
    expect(config.projects['options']?.architect?.build?.options?.styles).toEqual([]);
  });
});

describe('the field, the counter, the button and the message line (t9-02 AC6)', () => {
  const template = componentTemplate(join('src', 'options', 'options.component.ts'));

  it('renders the same controls with the same bindings as before the look landed', () => {
    expect(template).toMatch(/<label class="label" for="author-name">\{\{ nameLabel \}\}<\/label>/);
    expect(template).toMatch(/id="author-name"/);
    expect(template).toMatch(/\[value\]="draft\(\)\.value"/);
    expect(template).toMatch(/\(input\)="onInput\(\$event\)"/);
    expect(template).toMatch(/<p class="counter">\{\{ counter\(\) \}\}<\/p>/);
    expect(template).toMatch(/<button class="save" type="button" \[disabled\]="!draft\(\)\.canSave" \(click\)="onSave\(\)">/);
    expect(template).toMatch(/@if \(view\(\)\.message !== null\) \{/);
    expect(template).toMatch(/\[class\]="messageClass\(\)">\{\{ message\(\) \}\}<\/p>/);
    // The look adds one explanation line and nothing else to the surface.
    expect(template).toMatch(/<p class="hint">\{\{ nameHint \}\}<\/p>/);
    expect(template.split('{{').length - 1).toBe(6);
  });
});
