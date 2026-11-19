import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { OptionsComponent } from '../src/options/options.component';
import { OPTIONS_MESSAGE_TEXT, OPTIONS_STRINGS, nameCounterText } from '../src/options/text';
import { buildScriptMainBody, buildScriptSource, loadBuildGuard } from './support/build-script-guards';

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
const DIST_ROOT = join(projectRoot, 'dist');

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
  // `#ffffff` does double duty on this surface: ruling `A125` pins it as the action
  // label, and the shipped field reuses it as the input's own background
  // (`t9-02` review remark R3). The pair is listed so the recomputation reads it too.
  ['the author-name field ink on its own field background', PALETTE.ink, PALETTE.onAction],
  ['confirmation on the pale band', PALETTE.accent, PALETTE.accentBand],
  ['refusal on the pale band', PREEXISTING_REFUSAL, PALETTE.accentBand],
];

/**
 * Which shipped rule carries the background a text role is read on: the role's own rule
 * when it declares a background, the rule it sits on otherwise. A new text role in the
 * shipped stylesheet has to join this table before the pair recomputation will accept
 * it, which is what keeps the pair list from drifting behind the stylesheet
 * (`t9-02` review remark R3, closed by `t9-02b` AC6).
 */
const TEXT_ROLE_BACKGROUND: Record<string, string> = {
  '.options': ':host',
  '.hint': '.options',
  '.counter': '.options',
  '.input': '.input',
  '.save': '.save',
  '.message--saved': '.message',
  '.message--refusal': '.message',
};

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

/**
 * Every `text role -> ink` the shipped stylesheet declares, read out of the shipped
 * rules rather than out of a list kept by hand (`t9-02b` AC6).
 */
function declaredTextColors(styles: string): [string, string][] {
  const found: [string, string][] = [];
  for (const rule of styles.matchAll(/([.:][\w-]+(?:::?[\w-]+)*)\s*\{([^}]*)\}/g)) {
    const selector = rule[1] as string;
    for (const declaration of (rule[2] as string).split(';')) {
      const ink = /^\s*color:\s*(#[0-9a-fA-F]{6})\s*$/.exec(declaration)?.[1];
      if (ink !== undefined) {
        found.push([selector, ink]);
      }
    }
  }
  return found;
}

/** The background one shipped rule is painted on: its own, or the rule it sits on. */
function declaredBackground(styles: string, selector: string): string {
  const body = ruleBody(styles, selector);
  const background = /(?:^|;)\s*background(?:-color)?:\s*(#[0-9a-fA-F]{6})/.exec(body)?.[1];
  if (background === undefined) {
    throw new Error(`the shipped rule "${selector}" declares no background for its text`);
  }
  return background;
}

/** The one text role whose ink is `hex`; a second owner means the palette moved. */
function textRoleOwning(styles: string, hex: string): string {
  const owners = declaredTextColors(styles)
    .filter(([, ink]) => ink.toLowerCase() === hex.toLowerCase())
    .map(([selector]) => selector);
  if (owners.length !== 1) {
    throw new Error(
      `"${hex}" is the ink of ${String(owners.length)} shipped rules: ${owners.join(', ')}`,
    );
  }
  return owners[0] as string;
}

/**
 * The mascot's own pixels (`t9-02b` AC5, blocking finding 1 of `t9-02`).
 *
 * `border-radius: 50%` clips the element's painting area to the circle **inscribed** in
 * the box, so "the whole artwork, the lifebuoy included, survives that frame" is a
 * property of the file and not of the CSS. Reading `IHDR` proves the grid and nothing
 * about what is drawn on it, so the shipped PNG is decoded here: `IDAT` inflated with
 * the zlib the PNG format itself mandates, scanlines unfiltered, the alpha channel
 * walked. No new dependency, no second fixture, no network call.
 */

/** The alpha at or above which a pixel counts as artwork the author drew. */
const PAINTED_ALPHA = 8;
/** The alpha at or above which a pixel is drawn artwork, not an anti-aliased edge. */
const OPAQUE_ALPHA = 200;

interface DecodedFrame {
  width: number;
  height: number;
  /** Pixels the artwork paints at all. */
  paintedPixels: number;
  /** Bounding box of the painted pixels, in pixel indices. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Painted pixels whose center falls outside the circle the CSS clips to. */
  outsidePainted: number;
  /** Painted pixels at `OPAQUE_ALPHA` or above outside that circle. */
  outsideOpaque: number;
  /** The strongest alpha outside the circle, and the strongest inside it. */
  maxAlphaOutside: number;
  maxAlphaInside: number;
  /** Distance from the box center to the farthest painted pixel center. */
  farthestPaintedRadius: number;
}

function pngParts(bytes: Buffer): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  idat: Buffer;
} {
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') {
      break;
    }
  }
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (ihdr === undefined) {
    throw new Error('the shipped PNG carries no IHDR chunk');
  }
  const idatChunks = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data);
  if (idatChunks.length === 0) {
    throw new Error('the shipped PNG carries no IDAT chunk');
  }
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    idat: Buffer.concat(idatChunks),
  };
}

/** The shipped PNG as a grid of alpha values, decoded from its own compressed scanlines. */
function decodeMascotFrame(): DecodedFrame {
  const png = pngParts(readFileSync(join(projectRoot, SRC_ASSET)));
  if (png.bitDepth !== 8 || png.colorType !== 6) {
    throw new Error(
      `this decoder reads 8-bit RGBA; the shipped PNG is bit depth ${String(png.bitDepth)}, color type ${String(png.colorType)}`,
    );
  }
  const { width, height } = png;
  const channels = 4;
  const stride = width * channels;
  const raw = inflateSync(png.idat);
  if (raw.length !== height * (stride + 1)) {
    throw new Error(
      `the inflated IDAT is ${String(raw.length)} bytes, not the ${String(height * (stride + 1))} the declared grid needs`,
    );
  }

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const lineStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[lineStart + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = byte;
          break;
        case 1:
          value = byte + left;
          break;
        case 2:
          value = byte + up;
          break;
        case 3:
          value = byte + ((left + up) >> 1);
          break;
        case 4: {
          const predicted = left + up - upLeft;
          const pa = Math.abs(predicted - left);
          const pb = Math.abs(predicted - up);
          const pc = Math.abs(predicted - upLeft);
          value = byte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${String(filter)} on scanline ${String(y)}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const clipRadius = Math.min(width, height) / 2;
  const frame: DecodedFrame = {
    width,
    height,
    paintedPixels: 0,
    bounds: { minX: width, maxX: -1, minY: height, maxY: -1 },
    outsidePainted: 0,
    outsideOpaque: 0,
    maxAlphaOutside: 0,
    maxAlphaInside: 0,
    farthestPaintedRadius: 0,
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[y * stride + x * channels + 3];
      if (alpha < PAINTED_ALPHA) {
        continue;
      }
      frame.paintedPixels += 1;
      frame.bounds.minX = Math.min(frame.bounds.minX, x);
      frame.bounds.maxX = Math.max(frame.bounds.maxX, x);
      frame.bounds.minY = Math.min(frame.bounds.minY, y);
      frame.bounds.maxY = Math.max(frame.bounds.maxY, y);
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      frame.farthestPaintedRadius = Math.max(frame.farthestPaintedRadius, distance);
      if (distance > clipRadius) {
        frame.outsidePainted += 1;
        frame.maxAlphaOutside = Math.max(frame.maxAlphaOutside, alpha);
        if (alpha >= OPAQUE_ALPHA) {
          frame.outsideOpaque += 1;
        }
      } else {
        frame.maxAlphaInside = Math.max(frame.maxAlphaInside, alpha);
      }
    }
  }
  return frame;
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

  /**
   * What the substring pins above cannot show (`t9-01` review remark R2 and `t9-02`
   * review remark R2, closed by `t9-02b` AC3): the shipped guard lifted out of the
   * script and **run**, once against a `dist/` whose copied file is hidden and once
   * against the `dist/` the build really produced.
   */
  it('answers an absent copied file with the failure and a shipped one with nothing', () => {
    const absent = loadBuildGuard('verifyOptionsAssetShips', {
      distDir: DIST_ROOT,
      existsSync: () => false,
    });
    expect(() => absent()).toThrow(/dist\/options\/assets\/cat-mascot\.png is missing/);

    const present = loadBuildGuard('verifyOptionsAssetShips', { distDir: DIST_ROOT, existsSync });
    expect(() => present()).not.toThrow();
  });

  it('verifies before it reports the folder, and makes a failed check an exit code', () => {
    const body = buildScriptMainBody();
    const reportAt = body.indexOf('report();');
    expect(reportAt).toBeGreaterThanOrEqual(0);
    for (const check of [
      'verifyManifestReferences(manifest);',
      'verifyContentBundleHasNoAngular();',
      'verifyOptionsAssetShips();',
    ]) {
      expect(body.indexOf(check), check).toBeGreaterThanOrEqual(0);
      expect(body.indexOf(check), check).toBeLessThan(reportAt);
    }

    const script = codeOnly(buildScriptSource());
    expect(script).toMatch(/main\(\)\.catch\(/);
    expect(script).toMatch(/process\.exitCode = 1/);
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

describe('the artwork survives the circular frame the CSS puts it in (t9-02b AC5; blocking finding 1 of t9-02)', () => {
  const frame = decodeMascotFrame();

  it('decodes the shipped PNG to the grid it declares, painted over the whole square', () => {
    expect(frame.width).toBe(128);
    expect(frame.height).toBe(128);
    // The painted area is a fingerprint of the file the hash pin already locks. If the
    // two ever disagree, the decoder is reading something other than the shipped art.
    expect(frame.paintedPixels).toBe(13_054);
    expect(frame.bounds).toEqual({ minX: 0, maxX: 127, minY: 0, maxY: 127 });
  });

  it('holds no drawn artwork outside the circle border-radius: 50% clips to', () => {
    // The circle is the one inscribed in the box: center (64, 64), radius 64, measured
    // to pixel centers. Nothing at or above `OPAQUE_ALPHA` may fall beyond it.
    expect(frame.outsideOpaque).toBe(0);
    expect(frame.maxAlphaOutside).toBeLessThan(OPAQUE_ALPHA);
    // The threshold is not vacuous either: the artwork does have fully opaque content.
    expect(frame.maxAlphaInside).toBe(255);

    // And the clip really does reach the artwork, so `outsideOpaque === 0` is a fact
    // about the art rather than an image that never leaves the circle. What sits outside
    // is the anti-aliased edge: a few hundred pixels, not tens of thousands.
    expect(frame.farthestPaintedRadius).toBeGreaterThan(64);
    expect(frame.outsidePainted).toBeGreaterThan(0);
    expect(frame.outsidePainted).toBeLessThan(1_000);
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

  /**
   * The pair list is **derived from the shipped stylesheet** rather than maintained
   * beside it (`t9-02` review remark R3, closed by `t9-02b` AC6). The sentence
   * "recomputes the ratio of every pair that carries text" was true only of the pairs
   * someone thought to write down, and the author-name field's own `#ffffff` background
   * is a pair the hand-written list missed.
   *
   * A rule that declares no `color:` inherits one that is already on the list, so it
   * adds no pair; a rule that declares one has to say what it is read on.
   */
  it('recomputes every text pair the shipped stylesheet declares, and no others', () => {
    const declared = declaredTextColors(styles);
    expect(declared.length).toBeGreaterThan(0);

    const shippedPairs = new Set<string>();
    for (const [selector, ink] of declared) {
      const carrier: string | undefined = TEXT_ROLE_BACKGROUND[selector];
      if (carrier === undefined) {
        throw new Error(
          `"${selector}" puts text on the page and the pair list says nothing about its background`,
        );
      }
      const background = declaredBackground(styles, carrier);
      shippedPairs.add(`${ink} on ${background}`);
      expect(contrastRatio(ink, background), `${selector} on ${carrier}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    // The list the spec points at is the list the stylesheet ships: no stale entry, and
    // no shipped text pair the recomputation never looks at.
    const listedPairs = new Set(
      TEXT_PAIRS.map(([, foreground, background]) => `${foreground} on ${background}`),
    );
    expect([...shippedPairs].sort()).toEqual([...listedPairs].sort());
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

  /**
   * `t9-02b` AC2: the spec sentence about the page and the Chrome dialog box is now
   * backed by a pin on the width rule itself — the card is sized **by the box**, and
   * nothing on this surface reintroduces a fixed column.
   */
  it('sizes the card by the box and ships no fixed width beyond the cap and the mascot', () => {
    expect(ruleBody(styles, ':host')).not.toMatch(/(?:^|;)\s*width:/);
    const card = ruleBody(styles, '.options');
    expect(card).toMatch(/(?:^|;)\s*width:\s*100%;/);
    expect(card).not.toMatch(/min-width:/);
    expect(card).toMatch(/max-width:\s*360px;/);
    // The document owns exactly one rule and it is not a width.
    expect(codeOnly(readSource(join('src', 'options', 'index.html')))).not.toMatch(/width/);
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
  });

  /**
   * What the interpolation **count** used to stand in for (`t9-02` review remark R9,
   * closed by `t9-02b` AC7). A count is not a rule: any later correct interpolation
   * trips it, and it says nothing about the thing that matters — that this template owns
   * no wording, so `src/options/text.ts` stays the single owner of the Russian strings.
   */
  it('renders every string through a binding and holds no wording of its own', () => {
    const bindings = [...template.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((match) => match[1]);

    // Every interpolation is a read of a component member, or a call of one: no inline
    // expression, no literal, no wording picked at the call site. The shape stays wide
    // enough for an honest later binding (`draft().value`) and narrow enough that a
    // literal string in the markup is a failing test.
    for (const binding of bindings) {
      expect(binding, `binding "${binding}"`).toMatch(
        /^[A-Za-z_$][\w$]*(?:\([^()]*\))?(?:\.[A-Za-z_$][\w$]*)*$/,
      );
    }

    // The pinned strings and the pinned derived values all arrive as bindings.
    for (const binding of ['title', 'nameLabel', 'nameHint', 'save', 'counter()', 'message()']) {
      expect(bindings, binding).toContain(binding);
    }

    // Take the bindings away and the template is structure only: no Russian string can
    // stand in the markup, which is the failure the count was guarding.
    expect(template.replaceAll(/\{\{[^}]*\}\}/g, ' ')).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('the message line wears the palette role the code chose (t9-02 AC6; t9-02 R5, closed by t9-02b AC8)', () => {
  /**
   * The shipped class decision, reached without constructing the component: its field
   * initializers call `inject`, so the prototype plus the one signal the method reads is
   * the smallest honest handle on it. The class names are read **out of the shipped
   * stylesheet**, so a rename cannot quietly give the component's two arms a second
   * meaning.
   */
  const messageClassFor = (code: string): string => {
    const surface = Object.create(OptionsComponent.prototype) as {
      view: () => { message: string | null };
      messageClass: () => string;
    };
    surface.view = () => ({ message: code });
    return surface.messageClass();
  };

  it('gives the confirmation the accent rule and every refusal the kept refusal rule', () => {
    const styles = componentStyles(join('src', 'options', 'options.component.ts'));
    const confirmationRule = textRoleOwning(styles, PALETTE.accent);
    const refusalRule = textRoleOwning(styles, PREEXISTING_REFUSAL);
    expect(confirmationRule).not.toBe(refusalRule);

    expect(messageClassFor('saved')).toBe(`message ${confirmationRule.slice(1)}`);
    for (const code of Object.keys(OPTIONS_MESSAGE_TEXT)) {
      if (code === 'saved') {
        continue;
      }
      expect(messageClassFor(code), code).toBe(`message ${refusalRule.slice(1)}`);
    }
  });
});
