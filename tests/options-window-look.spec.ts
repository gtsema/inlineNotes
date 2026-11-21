import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { OptionsComponent } from '../src/options/options.component';
import {
  OPTIONS_MESSAGE_TEXT,
  OPTIONS_STRINGS,
  RENAME_OUTCOME_TEXT,
  nameCounterText,
} from '../src/options/text';
import {
  buildScriptMainBody,
  buildScriptSource,
  codeOnly,
  loadBuildGuard,
  runBuildScriptEntry,
} from './support/build-script-guards';

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

/**
 * The shipped mascot's SHA-256 and byte size (`t11-01` AC1; ruling `A130` supersedes
 * `A126`'s byte-identity clause). The file is a full-grid 1254 → 128 downscale of the
 * owner's `cat-mascot_new.png` — the 1 306 640-byte original is never committed, so its
 * hash lives in the report rather than here. Both numbers are **measured**, not invented.
 */
const ASSET_SHA256 = 'c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e';
const ASSET_BYTES = 20009;

/** Ruling `A131`: the extension's own icon — one 128 PNG at a top-level `src/icons/`. */
const SRC_ICON = join('src', 'icons', 'icon-128.png');
const DIST_ICON = join('dist', 'icons', 'icon-128.png');
const ICON_REFERENCE = 'icons/icon-128.png';

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

/**
 * Ruling `A153` (task `t15-01`): the disabled action control is stated as **colours**
 * rather than as an `opacity`, on both extension surfaces, and this is the fill. It is
 * the one literal the `A125` palette did not have — `D5`/`A128` stayed unruled from
 * Stage 9 until `A153` gave the state a value — so it joins the palette table rather
 * than the "preexisting" list: the ruling, not the artwork, is where it comes from.
 *
 * The `#1b2a33` label it is read on measures **8.88:1**, and the fill against the card
 * **1.56:1** while the enabled `#b8480d` measures **4.97:1** — visibly washed out, and
 * legible, which the withdrawn `opacity: 0.45` never was (its label measured `1.42:1`).
 */
const DISABLED_FILL = '#e3c3aa';

/**
 * The ink of the rename warning's sentence (`t17-04`, ruling `A173`). It is a darker
 * shade of the kept refusal ink so the warning reads as a warning without sharing the
 * message line's own colour — the pair table owns one ink per rule, and the message
 * line already owns `#b3261e`.
 */
const RENAME_WARNING_INK = '#8a1a14';

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
  // `A153`'s pair: the disabled action's label on its own fill.
  ['disabled action label on the disabled fill', PALETTE.ink, DISABLED_FILL],
  // `t17-04` (`A173`) added the rename warning and its two buttons. Each one carries
  // text, so each one joins the pair list the recomputation reads.
  ['rename warning on the pale band', RENAME_WARNING_INK, PALETTE.accentBand],
  ['rename cancel label on the disabled fill', PALETTE.ink, DISABLED_FILL],
  ['rename continue label on the action background', PALETTE.onAction, PALETTE.action],
];

/**
 * Which shipped rule carries the background a text role is read on: the role's own rule
 * when it declares a background, the rule it sits on otherwise. A new text role in the
 * shipped stylesheet has to join this table before the pair recomputation will accept
 * it, which is what keeps the pair list from drifting behind the stylesheet
 * (`t9-02` review remark R3, closed by `t9-02b` AC6).
 *
 * `t12-01` AC8 moved part of this map. `.hint` used to be the `<p class="hint">` under the
 * header and is now the parenthetical on the label line; it keeps the `A125` ink it always
 * carried, so its row stays, and the rule the change adds — `.label-line`, which paints the
 * label line's text — joins it. Both are read on the card, so both name `.options`. No row is
 * dropped: `.options`, `.counter`, `.input`, `.save` and the two message rules keep the rows
 * they had.
 *
 * `t15-01` added the `A153` row. `.save:disabled` declares a `color:` of its own, so the
 * pair recomputation reads it the day the ruling ships; before `A153` the rule carried an
 * `opacity` and no ink at all. The carrier is the rule itself, because the disabled state
 * paints its own background — the one declaration that makes the disabled pair a pair.
 */
const TEXT_ROLE_BACKGROUND: Record<string, string> = {
  '.options': ':host',
  '.hint': '.options',
  '.label-line': '.options',
  '.counter': '.options',
  '.input': '.input',
  '.save': '.save',
  '.save:disabled': '.save:disabled',
  '.message--saved': '.message',
  '.message--refusal': '.message',
  // `t17-04` (`A173`): the rename warning and its two buttons are text roles too.
  '.rename-warning': '.rename',
  '.rename-cancel': '.rename-cancel',
  '.rename-continue': '.rename-continue',
};

function readSource(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

/**
 * The inline `styles` string of a single-inline-template component, **verbatim**: every
 * comment the stylesheet carries is kept, and this is the text the **absence** scans read
 * (`t10-02` AC8 rewriting the sentence AC6 left untrue, closing debt rows `S10-7` and
 * `S10-14`; the direction itself is pinned by the fixture cases in the last describe of this
 * file, not by this comment).
 *
 * Two reads of one stylesheet exist here, and which claim uses which is now stated exactly.
 * Absence claims read **this** text, because the safe error of an absence scan is to read
 * **more**: a commented-out `box-sizing: border-box` inside a rule that reaches the mascot
 * turns the selector walk red and a human decides whether the comment is a leftover or a rule
 * being revived, where a stripped read would answer “nothing to see”. The absence reads are:
 * the `boxSizingSelectorsReachingMascot` walk over the component and document stylesheets,
 * the `box-sizing` absence inside the `.mascot` body itself, the “no shipped width beyond the
 * cap” scan over the whole stylesheet, the `min-width` and `:host` `width` absences, the
 * color-literal set that must be exactly the pinned palette, the declared-text-pair walk, and
 * the one-owner lookup the message-line case asks before it names a palette role. One further
 * read sits on this text without being an absence: `shippedRules(componentCss).length` in the
 * frame describe, a sanity check that the rule model has something to walk.
 *
 * Presence claims read `componentCodeStyles` below, because the safe error of a presence pin
 * is to read **less**: the reverse defect is a commented-out declaration satisfying `toMatch`
 * while the stylesheet declares nothing — the `t9-02b` review remark R2b pattern, and the exact
 * thing the sentence this replaces claimed was absent here while `width: 80px` proved it was
 * not. The presence reads are the mascot geometry literals, the ten palette role literals, and
 * the dialog-box rules. `documentStyles` strips for the same reason those do: it is read next
 * to whole-file presence pins, and its `<!-- -->` prose is dead in the document's own parse.
 */
function componentStyles(componentPath: string): string {
  const raw = readSource(componentPath);
  const styles = /styles:\s*`([\s\S]*?)`/.exec(raw)?.[1];
  if (styles === undefined) {
    throw new Error(`${componentPath} has no inline styles to scan`);
  }
  return styles;
}

/**
 * The same shipped stylesheet **with its comments removed**: the text every **presence** claim
 * about this surface is read from (`t10-02` AC8, closing debt row `S10-14`). It is one
 * `codeOnly` away from the helper above, and the split between them is a pinned behavior, not
 * a narration: the fixture cases in the last describe hand both of them the same stylesheet
 * whose every declaration sits inside a comment, so stripping inside `componentStyles` or
 * un-stripping inside this one turns a test red instead of changing a paragraph.
 */
function componentCodeStyles(componentPath: string): string {
  return codeOnly(componentStyles(componentPath));
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

/**
 * A rule of a shipped stylesheet: its **selector** and its declaration block
 * (`t10-01b` AC8 item 1).
 *
 * The mascot pin used to read one rule body. `box-sizing` declared on any **other** selector
 * that matches the same element — `img`, `*`, `.header img` — moves the 2 px frame inside the
 * 80 px image box and falsifies the 84 px footprint of ruling `A127`, while a body-scoped
 * pin stays green. Ruling `A129` measured the shipped page at 84×84, so the scan is scoped to
 * every selector that can reach the element.
 */
interface ShippedRule {
  selector: string;
  body: string;
}

/** One element of the shipped options page, as far as a CSS selector can name it. */
interface ElementShape {
  tag: string;
  classes: string[];
  /** The custom element the component renders into: the one `:host` names. */
  isHost?: boolean;
}

/**
 * The `settings mascot` as the shipped template places it: `img.mascot` inside
 * `header.header` inside `main.options` inside the component host. Only a rule that matches
 * **this** element can move its frame, because `box-sizing` is not an inherited property
 * (`A129`), which is why the `:host` and `.options` declarations of `border-box` — pinned in
 * the dialog-box case below — never reach it.
 */
const MASCOT_ELEMENT: ElementShape = { tag: 'img', classes: ['mascot'] };

/** Every element between the mascot and the component root, innermost first. */
const MASCOT_ANCESTORS: ElementShape[] = [
  { tag: 'header', classes: ['header'] },
  { tag: 'main', classes: ['options'] },
  { tag: 'app-root', classes: [], isHost: true },
];

/**
 * Every `selector { declarations }` pair of a shipped stylesheet text, in shipped order. The
 * two shipped option surfaces style this element with plain rules only — the options project
 * declares no global stylesheet (`styles: []`, pinned in the angular.json case) and neither
 * stylesheet uses an at-rule, and a rule nested in one is reached anyway, as the
 * counterfactual case below shows — so a flat rule scan is the whole set, and the case that
 * names the reachable rules pins the set it found.
 */
function shippedRules(css: string): ShippedRule[] {
  const rules: ShippedRule[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] as string).replaceAll(/\s+/g, ' ').trim();
    if (selector.length === 0) {
      continue;
    }
    rules.push({ selector, body: match[2] as string });
  }
  return rules;
}

/**
 * Every `<style>` block of an HTML document text, in shipped order, comments removed
 * (`t10-02` AC2, closing debt row `S10-3`).
 *
 * The scan used to read the **first** block only: a second
 * `<style>img { box-sizing: border-box }</style>` in `src/options/index.html` moved the
 * mascot frame with every pin green, because the rules in that block were simply never
 * read. Every block is read now, and the case that scans the document also pins how many
 * blocks the shipped file owns, so a second block is a named decision rather than a shape
 * the scan has to guess about.
 *
 * The opening tag is matched **attribute-tolerantly** (`t10-02` AC9a, closing debt row
 * `S10-11`): the pattern used to be the literal `<style>`, so a block written
 * `<style type="text/css">` was invisible to both halves of the pin above — neither read nor
 * counted — while the spec sentence said “every `<style>` block”. `<style\b[^>]*>` reads the
 * same block either way, and the case that scans the document pins an attributed fixture block
 * as read **and** counted, because a scan widened only in prose is a scan still waiting to
 * narrow.
 */
function styleBlocks(html: string): string[] {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) =>
    codeOnly(match[1] as string),
  );
}

/** The whole stylesheet of a shipped HTML document: every block, comments removed. */
function documentStyles(relativePath: string): string {
  const blocks = styleBlocks(readSource(relativePath));
  if (blocks.length === 0) {
    throw new Error(`${relativePath} ships no <style> block`);
  }
  return blocks.join('\n');
}

/**
 * The one `<img class="mascot">` **element** of a shipped template, tag and attributes
 * whole, whatever order the attributes sit in (`t10-02` AC3, closing debt row `S10-4`).
 *
 * The scan below reads stylesheets, and a stylesheet is the only place it can see a
 * declaration. An inline `style="box-sizing: border-box"` on the element outranks every
 * stylesheet rule and moves the 2 px frame inside the 80 px image box with the whole scan
 * green, so the shape itself is pinned absent instead of scanned.
 */
function mascotElement(template: string): string {
  const tag = /<img\b[^>]*\bclass="[^"]*\bmascot\b[^"]*"[^>]*\/?>/i.exec(template);
  if (tag === null) {
    throw new Error('the shipped template places no `img.mascot` element');
  }
  return tag[0];
}

/**
 * Whether one element carries an **inline style** in any shape Angular ships one in
 * (`t10-02` AC9b, closing debt row `S10-12`).
 *
 * The absence pin that closed debt row `S10-4` read the literal `style=`, which is one spelling
 * of three. `[style.box-sizing]="'border-box'"` and `[attr.style]="…"` put the same
 * declaration on the same element, and an inline declaration outranks every stylesheet rule: any
 * of the three moves the 2 px frame inside the 80 px image box with the whole stylesheet scan
 * green. All three are pinned absent now, each with its own counterfactual, and the scan still
 * answers for an element that carries none of them, so widening it cannot turn it into a
 * matcher that fires on everything.
 */
function carriesInlineStyle(elementText: string): boolean {
  return (
    /[\s]style\s*=/i.test(elementText) ||
    /[\s]\[style(?:\.[^\]]*)?\]\s*=/i.test(elementText) ||
    /[\s]\[attr\.style\]\s*=/i.test(elementText)
  );
}

/**
 * Whether one compound — `img`, `.mascot`, `*`, `:host`, `img[alt=""]` — names one shape.
 *
 * `:host` names the component host and nothing inside it. A compound that names an `id`
 * cannot match: no element in the mascot's chain carries one. An attribute selector, an
 * unknown pseudo-class or a pseudo-element is treated as **able** to match, because a scan
 * that guesses wrong here must guess on the side of flagging more rules.
 */
function compoundMatchesShape(compound: string, shape: ElementShape): boolean {
  const tag = /^[A-Za-z][\w-]*/.exec(compound)?.[0];
  if (tag !== undefined && tag.toLowerCase() !== shape.tag) {
    return false;
  }
  const simples = compound.match(/[.#][\w-]+|\[[^\]]*\]|::?[A-Za-z-]+(?:\([^)]*\))?/g) ?? [];
  for (const simple of simples) {
    if (simple.startsWith('.')) {
      if (!shape.classes.includes(simple.slice(1))) {
        return false;
      }
    } else if (simple.startsWith('#')) {
      return false;
    } else if (simple.startsWith(':host')) {
      if (shape.isHost !== true) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Whether a shipped selector can match the mascot element.
 *
 * The scan reads compounds, not a CSS engine: it splits on combinators and does not model
 * which combinator it was or the sibling order of the template, so `.title + .mascot` counts
 * as reaching the element even though the shipped template puts the title after the image.
 * That is deliberately **wider** than real matching, and it is the safe direction for a pin
 * whose assertion is an absence: a wider scan can only ever flag more rules. Every compound
 * left of the last one has to name some element of the shipped chain.
 */
function selectorCanReachMascot(selector: string): boolean {
  return selector.split(',').some((complex) => {
    const compounds = complex.split(/[\s>+~]+/).filter((compound) => compound.length > 0);
    if (compounds.length === 0) {
      return false;
    }
    if (!compoundMatchesShape(compounds[compounds.length - 1] as string, MASCOT_ELEMENT)) {
      return false;
    }
    return compounds
      .slice(0, -1)
      .every((compound) =>
        MASCOT_ANCESTORS.some((ancestor) => compoundMatchesShape(compound, ancestor)),
      );
  });
}

/** Every shipped selector that both reaches the mascot and declares `box-sizing`. */
function boxSizingSelectorsReachingMascot(css: string): string[] {
  return shippedRules(css)
    .filter((rule) => selectorCanReachMascot(rule.selector))
    .filter((rule) => /\bbox-sizing\b/.test(rule.body))
    .map((rule) => rule.selector);
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
  it('holds the converted artwork at the hash and size the report states', () => {
    expect(sha256(SRC_ASSET)).toBe(ASSET_SHA256);
    expect(statSync(join(projectRoot, SRC_ASSET)).size).toBe(ASSET_BYTES);
  });

  it('ships a fresh 128×128 PNG, never a re-crop of the owner source', () => {
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
    expect(template).not.toContain('cat-mascot_new');

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

  /**
   * The substring pins above name the exit code; they do not produce it. This case runs
   * the shipped guard, the shipped `fail` and the shipped `main().catch(...)` statement in
   * one chain (`t10-01` D1, closing `t9-02b` review remark R1), so "a `dist/` without the
   * copied mascot fails the build" now ends in an exit code that this test watched happen.
   */
  it('makes the missing copied asset an exit code through the shipped handler', async () => {
    const absent = loadBuildGuard('verifyOptionsAssetShips', {
      distDir: DIST_ROOT,
      existsSync: () => false,
    });
    const run = await runBuildScriptEntry(() => {
      absent();
    });
    expect(run.exitCode).toBe(1);
    expect(run.logged).toHaveLength(1);
    expect(run.logged[0]).toContain('dist/options/assets/cat-mascot.png is missing');
  });
});

describe('the header (t9-02 AC3, ruling A124; the centred column of t12-01 AC1, ruling A134)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));
  // The stripped read of the same stylesheet, for the presence claims below (`t10-02` AC8).
  const stylesCode = componentCodeStyles(join('src', 'options', 'options.component.ts'));
  const template = componentTemplate(join('src', 'options', 'options.component.ts'));

  it('renders the mascot as the header first child and the title as its second, each on its own line and both centred', () => {
    const header = /<header class="header">([\s\S]*?)<\/header>/.exec(template);
    if (header === null) {
      throw new Error('the options template has no header element');
    }
    // The children of the header, in shipped order: the artwork, then the title. Both
    // are direct elements of the header and nothing else sits between them, which is the
    // containment and order claim that outlives the row arrangement (`t12-01` AC1).
    const children = [...(header[1] as string).matchAll(/<(img|h1)\b[^>]*>/g)].map(
      (match) => match[1] as string,
    );
    expect(children).toEqual(['img', 'h1']);
    expect(header[1]).toMatch(/<img class="mascot" src="assets\/cat-mascot\.png" alt="" \/>/);
    expect(header[1]).toMatch(/<h1 class="title">\{\{ title \}\}<\/h1>/);
    expect(header[1].indexOf('class="mascot"')).toBeLessThan(header[1].indexOf('class="title"'));

    // Each on its own line: the header is a **column** (`A134`), so the two are stacked
    // and not laid side by side; `align-items: center` puts both on the window's
    // horizontal axis, and no `justify-content` is needed or declared to do it.
    const headerCode = ruleBody(stylesCode, '.header');
    expect(headerCode).toMatch(/display: flex/);
    expect(headerCode).toMatch(/(?:^|;)\s*flex-direction:\s*column;/);
    expect(headerCode).not.toMatch(/flex-direction:\s*row/);
    expect(headerCode).toMatch(/(?:^|;)\s*align-items:\s*center;/);
    // The gap that separated the two in the row is the same 12 px, now vertical, and the
    // header's own bottom margin is unchanged (`t12-01` AC4, answer `Q2`).
    expect(headerCode).toMatch(/(?:^|;)\s*gap:\s*12px;/);
    expect(headerCode).toMatch(/(?:^|;)\s*margin:\s*0 0 8px;/);

    // The art carries no information, so it stays out of the accessibility tree
    // rather than gaining a second Russian string (AC4 allows exactly one).
    expect(header[1]).toMatch(/alt=""/);
    expect(header[1]).not.toMatch(/alt="[^"]+/);
  });

  it('frames the mascot with CSS at 80 CSS px, never by editing the PNG', () => {
    // Every literal in this case is a **presence** claim, so its rule body is read through the
    // stripped helper (`t10-02` AC8, closing debt row `S10-14`). On the verbatim text a comment
    // spelling `width: 80px` inside this same reachable `.mascot` rule satisfied the pin while
    // the stylesheet declared nothing — that decoy is pinned red by the fixture cases at the end
    // of this file. The `box-sizing` absence at the end of the case keeps the verbatim text on
    // purpose: an absence scan reads more, never less.
    const mascot = ruleBody(stylesCode, '.mascot');
    expect(mascot).toMatch(/width: 80px/);
    expect(mascot).toMatch(/height: 80px/);
    expect(mascot).toMatch(/border-radius: 50%/);
    // `t11-01` AC2: the art is fitted by the asset (a full-grid 1254 → 128 downscale
    // puts the farthest painted pixel at radius 64.10 of the inscribed 64), so the rule
    // states `contain` — the honest word for a source that is exactly the box — and
    // carries no scale of its own. `cover` on a square source was a no-op crop; the
    // shrink the PM first briefed is deliberately **not** here, because it would draw
    // the already-fitted art at a sixth of the box.
    expect(mascot).toMatch(/object-fit: contain/);
    expect(mascot).toMatch(/object-position: center/);
    expect(mascot).not.toMatch(/object-fit: cover/);
    // No second framing mechanism: the conversion is what fits the circle, and a
    // `transform`/`scale`/`zoom` would move the art off the 80 px box the `A127`/`A129`
    // reading and the `t9-02b` pixel pin both rest on.
    expect(mascot).not.toMatch(/\btransform\b|\bscale\b|\bzoom\b/);
    expect(mascot).toContain(`border: 2px solid ${PALETTE.decorative}`);
    // Ruling `A127` reads the 80 px as the **image box** and the 2 px frame as painted
    // outside it, so the footprint is 84 px; ruling `A129` gives the mechanism — `box-sizing`
    // is not inherited, and Chrome measures `img.mascot` at `content-box`, 80 px box, 2 px
    // border, 84×84 painted. That reading stands or falls on a declaration this stylesheet
    // does not make. Adding `box-sizing: border-box` here would move the frame inside the
    // 80 px and falsify the spec sentence, which is why the absence is pinned (`t10-01` D2,
    // closing `t9-02b` review remark R2a). The scope of that absence is the next case.
    expect(ruleBody(styles, '.mascot')).not.toMatch(/\bbox-sizing\b/);
  });
});

/**
 * The scope `t10-01b` AC8 item 1 adds. The pin above reads the `.mascot` body only, so the
 * same counterfactual written on a different selector that matches the same element —
 * `img { box-sizing: border-box }`, `* { … }`, `.header img { … }` — moved the frame inside
 * the 80 px with every pin green. `A129` settled the mechanism (no inheritance, so only a
 * rule that matches the `img` itself can reach its box), and the scan below is scoped to
 * exactly that set of selectors.
 *
 * Two shapes the widened scan still could not see are closed beside it (`t10-02` AC2, AC3,
 * debt rows `S10-3` and `S10-4`): a **second** `<style>` block in `src/options/index.html`,
 * which the document reader skipped, and an **inline** `style` attribute on the element,
 * which no stylesheet scan can read. What stays outside the walk is stated in the spec
 * sentence and ledged as `S10-2`: an `#id`-shaped selector and a document-level ancestor.
 */
describe('no shipped rule can move the mascot frame (t10-01 D2, widened by t10-01b AC8 item 1; rulings A127, A129)', () => {
  const componentCss = componentStyles(join('src', 'options', 'options.component.ts'));
  const documentCss = documentStyles(join('src', 'options', 'index.html'));
  const shippedCss = `${componentCss}\n${documentCss}`;

  it('matches the element the shipped template actually places', () => {
    // The element model above is an assumption about the template unless this holds: the
    // tag, the class and the chain a descendant selector has to walk.
    const template = componentTemplate(join('src', 'options', 'options.component.ts'));
    expect(template).toMatch(
      /<main class="options">\s*<header class="header">\s*<img class="mascot"/,
    );
    expect(shippedRules(documentCss).map((rule) => rule.selector)).toEqual(['body']);
    expect(shippedRules(componentCss).length).toBeGreaterThan(10);
  });

  it('names exactly one shipped rule as able to reach the mascot', () => {
    const reachable = shippedRules(shippedCss)
      .filter((rule) => selectorCanReachMascot(rule.selector))
      .map((rule) => rule.selector);
    expect(reachable).toEqual(['.mascot']);
  });

  it('declares no box-sizing on any shipped rule whose selector can reach the mascot', () => {
    // The widened form of the absence ruling `A127` rests on: not "the `.mascot` body is
    // clean", but "no rule that can match this element declares the property at all".
    expect(boxSizingSelectorsReachingMascot(shippedCss)).toEqual([]);
  });

  it('reads every <style> block the document ships, and pins that it ships exactly one', () => {
    // Debt row `S10-3` (`t10-02` AC2): the document reader took the **first** block only, so
    // a second `<style>img { box-sizing: border-box }</style>` in `src/options/index.html`
    // moved the 84 px footprint while the scan never saw the rule. Every block is read now,
    // and the shipped count is pinned in the same case, so the widened scan cannot be
    // narrowed back down without a red test.
    expect(styleBlocks(readSource(join('src', 'options', 'index.html')))).toHaveLength(1);

    const twoBlocks = [
      '<style>',
      '  body {',
      '    margin: 0;',
      '  }',
      '</style>',
      '<!-- HTML comment prose between blocks is not a rule and is not read as one -->',
      '<style>',
      '  img {',
      '    box-sizing: border-box;',
      '  }',
      '</style>',
    ].join('\n');
    expect(boxSizingSelectorsReachingMascot(styleBlocks(twoBlocks).join('\n'))).toEqual(['img']);

    // The shape that still escaped both halves of this case (`t10-02` AC9a, closing debt row
    // `S10-11`): the opening-tag pattern was the literal `<style>`, so a block that carries an
    // attribute was neither read nor counted, while the spec sentence said “every `<style>`
    // block”. One block with an attribute is now read, reported and counted on its own, and
    // counted beside the shipped block — the count answers two, not one.
    const attributed = '<style type="text/css">\n  img {\n    box-sizing: border-box;\n  }\n</style>';
    expect(styleBlocks(attributed)).toHaveLength(1);
    expect(boxSizingSelectorsReachingMascot(styleBlocks(attributed).join('\n'))).toEqual(['img']);
    expect(
      styleBlocks(`${readSource(join('src', 'options', 'index.html'))}\n${attributed}`),
    ).toHaveLength(2);
  });

  it('ships no inline style attribute on the element the stylesheet scan cannot read', () => {
    // Debt row `S10-4` (`t10-02` AC3): the scan reads stylesheets, so a declaration written
    // on the element itself sat outside it completely —
    // `<img class="mascot" style="box-sizing: border-box">` puts the 2 px frame inside the
    // 80 px image box (the reading ruling `A127` states) with every stylesheet pin green.
    // The scan cannot see that shape, so the shape is pinned absent instead.
    // `t10-02c`: the assertion over the **shipped** element runs through
    // `carriesInlineStyle`, the same reader the binding counterfactuals below use, not through
    // the literal `style=`. The literal saw one of the four shapes Angular ships an inline style
    // in, so the pin that reads the real template was blind to `[style.box-sizing]`,
    // `[style]` and `[attr.style]` on `src/options/options.component.ts:58` while three
    // hand-typed fixtures went red. The decoy case below (`t10-02c` case 2) is the guard against
    // a future narrowing of this line: it reads a hand-typed `[style.box-sizing]` mascot
    // element through the same helper, so trading the helper back for a literal turns that case
    // red in the same commit.
    const template = componentTemplate(join('src', 'options', 'options.component.ts'));
    expect(carriesInlineStyle(mascotElement(template)), template).toBe(false);

    // The pin is not vacuous and does not depend on attribute order: the reader hands back
    // the same element when the declaration sits in front of `class`.
    const counterfactual =
      '<img style="box-sizing: border-box" class="mascot" src="assets/cat-mascot.png" alt="" />';
    expect(carriesInlineStyle(mascotElement(counterfactual)), counterfactual).toBe(true);

    // The same outranking declaration in the two Angular shapes the literal `style=` could not
    // see (`t10-02` AC9b, closing debt row `S10-12`): a property binding on the style property
    // or on one of its longhands, and an attribute binding. Each is its own red.
    for (const bound of [
      '<img class="mascot" [style.box-sizing]="\'border-box\'" src="assets/cat-mascot.png" alt="" />',
      '<img class="mascot" [style]="frameStyle()" src="assets/cat-mascot.png" alt="" />',
      '<img class="mascot" [attr.style]="frameStyle()" src="assets/cat-mascot.png" alt="" />',
    ]) {
      expect(carriesInlineStyle(mascotElement(bound)), bound).toBe(true);
    }

    // And the widened scan is not a matcher that fires on everything: the shipped element with
    // its attributes reordered, and an attribute whose *value* merely contains the word, are
    // both answers of `false`. So the four shapes above are the red, and this case cannot be
    // satisfied by a pattern that simply never stops matching.
    for (const innocent of [
      '<img class="mascot" alt="" src="assets/cat-mascot.png" />',
      '<img alt="style guide" class="mascot" src="assets/cat-mascot.png" />',
    ]) {
      expect(carriesInlineStyle(mascotElement(innocent)), innocent).toBe(false);
    }
  });

  it('keeps the shipped absence pin on the widened reader, not on the literal `style=`', () => {
    // `t10-02c`. The case above reads the **shipped** template through whatever reader its
    // assertion was written with, and attempt 2 left that assertion on the literal `style=`
    // while only widening a fixture helper: `[style.box-sizing]="'border-box'"` on
    // `src/options/options.component.ts:58` moved the frame (ruling `A127`: the 2 px frame then
    // paints inside the 80 px image box) with the pin that reads the real element green. The
    // shipped line now calls `carriesInlineStyle`, and this case is the decoy that keeps it
    // there: a hand-typed mascot element carrying the shape is handed to the **same helper the
    // shipped assertion uses**, so narrowing the shipped line back to a literal is a change the
    // diff shows as a red test, not as a silently re-tightened line.
    const decoy =
      '<img class="mascot" [style.box-sizing]="\'border-box\'" src="assets/cat-mascot.png" alt="" />';
    expect(carriesInlineStyle(mascotElement(decoy)), decoy).toBe(true);

    // The same reader, the same element shape, and the shipped tree's own answer one helper
    // call away: this is the assertion the case above makes over `src/options/`, restated here
    // on a fixture so the two cannot drift apart without a red.
    const shipped = componentTemplate(join('src', 'options', 'options.component.ts'));
    const pinned = mascotElement(
      '<img class="mascot" alt="" src="assets/cat-mascot.png" />',
    );
    expect(carriesInlineStyle(mascotElement(shipped))).toBe(carriesInlineStyle(pinned));
  });

  it('reads a commented-out declaration of the component stylesheet instead of stripping it', () => {
    // The direction `componentStyles` states (`t10-02` AC6, closing debt row `S10-7`): the
    // component stylesheet is handed to the scan **verbatim**, because every claim made over
    // it is an absence and the safe error of an absence scan is to read more text. So reviving
    // a rule inside a comment is red rather than invisible. The selector reported here is the
    // comment-shaped compound, and that is the intended outcome of the red.
    const flagged = boxSizingSelectorsReachingMascot('/* .mascot { box-sizing: border-box; } */');
    expect(flagged, 'the verbatim stylesheet text is scanned, comment and all').not.toEqual([]);
    expect(flagged[0]).toContain('.mascot');
  });

  it('catches the counterfactual on every selector shape that reaches the element', () => {
    // The scan is what carries the claim, so the scan is run against text that should make
    // it speak. Every one of these selectors matches `img.mascot` in the shipped template.
    for (const selector of [
      '.mascot',
      'img',
      '*',
      '.header img',
      'header > img',
      '.options img',
      'main .header img',
      ':host .mascot',
      'img.mascot',
      'img[alt=""]',
      '.mascot:hover',
    ]) {
      const fixture = `${selector} {\n  box-sizing: border-box;\n  width: 80px;\n}`;
      expect(boxSizingSelectorsReachingMascot(fixture), selector).toEqual([selector]);
    }

    // A rule wrapped in an at-rule is still a rule: the flat scan reaches the inner block, so
    // an `@media` wrapper cannot hide the declaration either.
    expect(
      boxSizingSelectorsReachingMascot(
        '@media screen and (min-width: 400px) {\n  .header img {\n    box-sizing: border-box;\n  }\n}',
      ),
    ).toEqual(['.header img']);
  });

  it('leaves every selector that cannot reach the element alone', () => {
    // Without this half the scan could pass by matching nothing at all. `:host` and
    // `.options` are the two rules that really do declare `box-sizing: border-box` on this
    // surface, and neither can reach the image (`A129`).
    for (const selector of [
      ':host',
      '.options',
      '.title',
      'h1',
      'p',
      'button',
      'input',
      '.header .title',
      'main > .hint',
      'h1 img',
      '.save:disabled',
      'body',
    ]) {
      const fixture = `${selector} {\n  box-sizing: border-box;\n}`;
      expect(boxSizingSelectorsReachingMascot(fixture), selector).toEqual([]);
    }
  });
});

describe('the artwork survives the circular frame the CSS puts it in (t9-02b AC5, recalculated by t11-01 AC3)', () => {
  const frame = decodeMascotFrame();

  it('decodes the shipped PNG to the grid it declares, painted over the whole square', () => {
    expect(frame.width).toBe(128);
    expect(frame.height).toBe(128);
    // The painted area is a fingerprint of the file the hash pin already locks. If the
    // two ever disagree, the decoder is reading something other than the shipped art.
    // It was 13 054 for the artwork ruling `A126` shipped; the owner's replacement art
    // paints 12 619 of the same 16 384 pixels.
    expect(frame.paintedPixels).toBe(12_619);
    expect(frame.bounds).toEqual({ minX: 0, maxX: 127, minY: 0, maxY: 124 });
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
    // is the anti-aliased edge: a few dozen pixels, not tens of thousands. Measured: 58,
    // highest alpha 108, farthest painted center 64.55.
    expect(frame.farthestPaintedRadius).toBeGreaterThan(64);
    expect(frame.outsidePainted).toBeGreaterThan(0);
    expect(frame.outsidePainted).toBeLessThan(1_000);
  });

  /**
   * The assertion `t11-01` AC3 is really about, restated so the file's own bytes carry it:
   * a full-grid downscale of the owner's artwork puts the **farthest painted source pixel**
   * — radius 628.00 of the 1254 grid, measured from the image center `object-fit` and
   * `border-radius` both work from — at 628.00 × 128/1254 = 64.10 of the 128 px file, inside
   * the inscribed circle of radius 64. `decodeMascotFrame` already reads the far end of that
   * (64.55 > 64, from the anti-aliased edge), and this case pins the margin instead of the
   * direction: what survives the clip is an edge a fraction of a pixel deep, so a future
   * re-crop that pushes drawn content past the circle lands well outside this bound.
   */
  it('keeps the painted content within half a pixel of the circle it is clipped by', () => {
    expect(frame.farthestPaintedRadius - 64).toBeLessThan(1);
    // And the fit is not achieved by an image that never reaches the circle: the painted
    // bounding box does cross it on the rows where the art is widest.
    expect(frame.bounds.minY).toBe(0);
  });
});

describe('the extension declares one 128 px icon (t11-01 AC4, AC5; rulings A130, A131)', () => {
  it('ships the icon as a real 128×128 PNG next to the mascot it shares bytes with', () => {
    expect(existsSync(join(projectRoot, SRC_ICON))).toBe(true);
    // One converted file per use site (`A130`, `A131`): the icon is the same artwork at the
    // same size, so it is the same bytes rather than a second conversion of the same source.
    expect(sha256(SRC_ICON)).toBe(ASSET_SHA256);
    const bytes = readFileSync(join(projectRoot, SRC_ICON));
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(bytes.readUInt32BE(16)).toBe(128);
    expect(bytes.readUInt32BE(20)).toBe(128);
    expect(bytes[24]).toBe(8);
    expect(bytes[25]).toBe(6);
  });

  it('declares both manifest keys, both naming the one file', () => {
    const manifest = JSON.parse(readSource(join('src', 'manifest.json'))) as {
      icons?: Record<string, string>;
      action?: { default_icon?: Record<string, string> };
    };
    expect(manifest.icons).toEqual({ '128': ICON_REFERENCE });
    expect(manifest.action?.default_icon).toEqual({ '128': ICON_REFERENCE });
    // No second size, no `.ico`, and nothing the extension page would have to be granted.
    expect(Object.keys(manifest.icons ?? {})).toEqual(['128']);
    expect(Object.keys(manifest.action?.default_icon ?? {})).toEqual(['128']);
    expect(JSON.stringify(manifest)).not.toMatch(/\.ico/);
    expect(
      (manifest as { web_accessible_resources?: unknown }).web_accessible_resources,
    ).toBeUndefined();
  });

  it('copies the icon into dist/ at the path the manifest names', () => {
    // The manifest reference check resolves `icons` and `action.default_icon`, so a `dist/`
    // without this file is a **failed build**; this case is the shipped-folder half of that
    // claim, and the next one runs the guard itself.
    expect(existsSync(join(projectRoot, DIST_ICON))).toBe(true);
    expect(sha256(DIST_ICON)).toBe(ASSET_SHA256);
  });

  it('makes an absent copied icon a build failure, not a broken toolbar button', () => {
    // The shipped reference check, lifted out of the script and run against a `dist/` that
    // lacks the icon and against the one the build really produced.
    const absent = loadBuildGuard('verifyManifestReferences', {
      distDir: DIST_ROOT,
      existsSync: (path: string) =>
        path.endsWith(join('icons', 'icon-128.png')) ? false : existsSync(path),
    });
    expect(() =>
      absent({ manifest_version: 3, content_scripts: [], icons: { '128': ICON_REFERENCE } }),
    ).toThrow(/manifest reference "icons\/icon-128\.png" does not exist inside dist\//);

    const present = loadBuildGuard('verifyManifestReferences', { distDir: DIST_ROOT, existsSync });
    expect(() =>
      present({
        manifest_version: 3,
        content_scripts: [{ js: ['content.js'] }],
        icons: { '128': ICON_REFERENCE },
        action: { default_popup: 'popup/index.html', default_icon: { '128': ICON_REFERENCE } },
        options_ui: { page: 'options/index.html' },
      }),
    ).not.toThrow();
  });
});

describe('exactly one new Russian string (t9-02 AC4)', () => {
  it('adds the name explanation line and moves no existing string', () => {
    // Stage 17 (`t17-01` AC2) adds the four strings of its two controls beside these five,
    // and `t17-04` (ruling `A173`) adds the three strings of the rename warning: the list
    // is the whole constant, so a later sentence is a failing test as well.
    expect(Object.keys(OPTIONS_STRINGS).sort()).toEqual([
      'nameHint',
      'nameLabel',
      'renameCancel',
      'renameContinue',
      'renameWarning',
      'save',
      'saved',
      'serverHint',
      'serverLabel',
      'syncCheckbox',
      'syncLabel',
      'title',
    ]);
    // The strings that shipped before this task, byte-identical except the confirmation,
    // which ruling `A176` shortened to «Сохранено».
    expect(OPTIONS_STRINGS.title).toBe('Настройки inlineNotes');
    expect(OPTIONS_STRINGS.nameLabel).toBe('Имя');
    expect(OPTIONS_STRINGS.save).toBe('Сохранить');
    expect(OPTIONS_STRINGS.saved).toBe('Сохранено');
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
  // Presence reads only: each role must really declare its literal in a live rule
  // (`t10-02` AC8). The set scan and the pair walk further down stay on the verbatim text,
  // because both assert that nothing outside the pinned set is declared.
  const stylesCode = componentCodeStyles(join('src', 'options', 'options.component.ts'));

  it('declares every pinned role as a literal', () => {
    expect(ruleBody(stylesCode, ':host')).toMatch(new RegExp(`background: ${PALETTE.page};`));
    expect(ruleBody(stylesCode, '.options')).toMatch(new RegExp(`color: ${PALETTE.ink};`));
    expect(ruleBody(stylesCode, '.hint')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    expect(ruleBody(stylesCode, '.counter')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    expect(ruleBody(stylesCode, '.save')).toMatch(new RegExp(`background: ${PALETTE.action};`));
    expect(ruleBody(stylesCode, '.save')).toMatch(new RegExp(`color: ${PALETTE.onAction};`));
    expect(ruleBody(stylesCode, '.message')).toMatch(new RegExp(`background: ${PALETTE.accentBand};`));
    expect(ruleBody(stylesCode, '.message--saved')).toMatch(new RegExp(`color: ${PALETTE.accent};`));
    expect(ruleBody(stylesCode, '.mascot')).toContain(PALETTE.decorative);
    expect(ruleBody(stylesCode, '.options')).toContain(PALETTE.decorative);
  });

  it('declares no color outside the pinned palette and the kept refusal color', () => {
    const literals = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((match) => match[0].toLowerCase())
      .sort();
    // `DISABLED_FILL` joins the pinned set by ruling `A153` (`t15-01`), not by an
    // invention of this test: it is the one value the `A125` palette did not have, and the
    // disabled row of the palette table files it beside the artwork-sampled roles.
    const pinned = [
      ...Object.values(PALETTE),
      PREEXISTING_REFUSAL,
      DISABLED_FILL,
      RENAME_WARNING_INK,
    ].sort();
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
  // The stripped read, for the presence claims of this case set only (`t10-02` AC8).
  const stylesCode = componentCodeStyles(join('src', 'options', 'options.component.ts'));

  it('drops the fixed 360 px column and keeps the number only as a cap', () => {
    // The whole-stylesheet scan is an **absence** and keeps the verbatim text; the two rule
    // reads after it are presence claims and read the stripped text.
    expect(styles).not.toMatch(/(^|[^-])width:\s*360px/m);
    expect(ruleBody(stylesCode, '.options')).toMatch(/width: 100%/);
    expect(ruleBody(stylesCode, '.options')).toMatch(/max-width: 360px/);
  });

  it('gives the page the whole box and centers the card inside it', () => {
    // Four presence claims, one per shipped declaration the ruling names.
    expect(ruleBody(stylesCode, ':host')).toMatch(/min-height: 100vh/);
    expect(ruleBody(stylesCode, ':host')).toMatch(/box-sizing: border-box/);
    expect(ruleBody(stylesCode, '.options')).toMatch(/box-sizing: border-box/);
    expect(ruleBody(stylesCode, '.options')).toMatch(/margin: 0 auto/);
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
    // The two absences stay on the verbatim text, so a commented-out `width:` on `:host` or a
    // commented-out `min-width:` on the card is flagged rather than hidden; the two presence
    // claims move to the stripped text, so no comment can stand in for a shipped
    // `width: 100%` or `max-width: 360px` (`t10-02` AC8).
    expect(ruleBody(styles, ':host')).not.toMatch(/(?:^|;)\s*width:/);
    const card = ruleBody(styles, '.options');
    expect(card).not.toMatch(/min-width:/);
    const cardCode = ruleBody(stylesCode, '.options');
    expect(cardCode).toMatch(/(?:^|;)\s*width:\s*100%;/);
    expect(cardCode).toMatch(/max-width:\s*360px;/);
    // The document owns exactly one rule and it is not a width.
    expect(codeOnly(readSource(join('src', 'options', 'index.html')))).not.toMatch(/width/);
  });
});

describe('the field, the counter, the button and the message line (t9-02 AC6; the label line of t12-01 AC5, AC7; `A135`)', () => {
  const template = componentTemplate(join('src', 'options', 'options.component.ts'));
  const stylesCode = componentCodeStyles(join('src', 'options', 'options.component.ts'));

  /**
   * The two **declared** values `t13-01` adds to the parenthetical (`A137`, `A138`). Both are
   * measured, not chosen here: the owner's answers were «4px» and «11px», and the surface's own
   * base size is the `13px` of the `.options` shorthand the label inherits.
   */
  const HINT_GAP = '4px';
  const HINT_SIZE = '11px';
  const SURFACE_BASE_SIZE = '13px';

  /**
   * The **name** label line of the shipped template, contents whole.
   *
   * Since Stage 17 (`t17-01`) the page carries a second `label-line`, for the server
   * address, so this read anchors on the line's first child — the author-name label —
   * instead of taking "the only one" of them.
   */
  const labelLine = /<p class="label-line">\s*(<label[\s\S]*?)<\/p>/.exec(template)?.[1];

  it('renders the same controls with the same bindings as before the look landed', () => {
    expect(template).toMatch(/<label class="label" for="author-name">\{\{ nameLabel \}\}<\/label>/);
    expect(template).toMatch(/id="author-name"/);
    expect(template).toMatch(/\[value\]="draft\(\)\.value"/);
    expect(template).toMatch(/\(input\)="onInput\(\$event\)"/);
    expect(template).toMatch(/<p class="counter">\{\{ counter\(\) \}\}<\/p>/);
    expect(template).toMatch(/<button class="save" type="button" \[disabled\]="!draft\(\)\.canSave" \(click\)="onSave\(\)">/);
    expect(template).toMatch(/@if \(view\(\)\.message !== null\) \{/);
    expect(template).toMatch(/\[class\]="messageClass\(\)">\{\{ message\(\) \}\}<\/p>/);
  });

  /**
   * The shape `t12-01` AC5 gives the `name explanation line` (`A135`): it is no longer a
   * paragraph of its own under the header, but a **parenthetical in italics** on the label
   * line, one space after `Имя`, and the field still comes immediately under that line. The
   * count of the label and of the input stays one each — that half of the old pin is kept
   * verbatim — and the wording stays in `src/options/text.ts`: the brackets and the italics
   * are the template's and the stylesheet's (`A136`), so `nameHint` is interpolated bare.
   */
  it('renders the name explanation line as an italic parenthetical on the label line, not as a paragraph of its own', () => {
    if (labelLine === undefined) {
      throw new Error('the options template has no `label-line` element');
    }

    // The name field is still exactly one label and one input — the sync half of
    // `t17-01` adds its own pair, so the counts are pinned **per field** here, by the
    // `for` each label names, rather than as a whole-template count.
    expect(template.match(/<label\b[^>]*for="author-name"/g) ?? []).toHaveLength(1);
    expect(template.match(/<input\b[^>]*id="author-name"/g) ?? []).toHaveLength(1);
    expect(template.indexOf('class="label-line"')).toBeLessThan(
      template.indexOf('id="author-name"'),
    );
    expect(template.indexOf('</p>', template.indexOf('class="label-line"'))).toBeLessThan(
      template.indexOf('id="author-name"'),
    );

    // The label line carries the label and the parenthetical, in that order, separated by
    // one space and nothing else in between: `Имя (Это имя подписывает каждую заметку)`.
    expect(labelLine).toMatch(/^\s*<label class="label" for="author-name">\{\{ nameLabel \}\}<\/label>\s/);
    expect(labelLine).toMatch(/\s<span class="hint">\(\{\{ nameHint \}\}\)<\/span>\s*$/);
    // The rendered text of the line is the label, one space, then the bracketed sentence.
    const rendered = labelLine
      .replaceAll(/\(\{\{ nameHint \}\}\)/g, `(ЭТО_ИМЯ)`)
      .replaceAll(/\{\{ nameLabel \}\}/g, 'ИМЯ')
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    expect(rendered).toBe('ИМЯ (ЭТО_ИМЯ)');

    // And it is a parenthetical and italics, owned by presentation: the brackets sit in the
    // markup around the interpolation, never inside the string — which is why the string's
    // own pin below can stay verbatim (`A136`).
    expect(OPTIONS_STRINGS.nameHint).toBe('Это имя подписывает каждую заметку');
    expect(OPTIONS_STRINGS.nameHint).not.toMatch(/[()]/);
    expect(labelLine).not.toMatch(/\(\(/);
    expect(ruleBody(stylesCode, '.hint')).toMatch(/(?:^|;)\s*font-style:\s*italic;/);
    // The hint has left the header: nothing above the label line mentions it, and no
    // `<p class="hint">` remains anywhere in the template.
    expect(template).not.toMatch(/<p class="hint"/);
    expect(template.indexOf('class="hint"')).toBeGreaterThan(template.indexOf('</header>'));
    expect(ruleBody(stylesCode, '.hint')).toMatch(new RegExp(`color: ${PALETTE.hint};`));
    // The label line is the element that owns the space under the label, so the input keeps
    // the 4 px it always had (`Q4`).
    expect(ruleBody(stylesCode, '.label-line')).toMatch(/(?:^|;)\s*margin:\s*0 0 4px;/);
    expect(ruleBody(stylesCode, '.label')).toMatch(/display: inline/);
  });

  /**
   * `t13-01` AC1–AC3, AC5: the gap and the size of the parenthetical are **declarations**.
   *
   * This case exists because the assertion above cannot answer for a gap (ledger row `S12-3`,
   * closed by `A139`): it replaces the markup with its rendered text, collapses `\s+` to one
   * space and then asserts `ИМЯ (ЭТО_ИМЯ)` — a pin that **normalises its input** is blind to
   * everything normalisation removes, and the thing this task ships is exactly the difference
   * between one space and four pixels. So the rendered assertion keeps its job (the wording of
   * the line, and the fact that the line is one line) and the **declaration** is pinned here,
   * by reading the `.hint` rule body. The two assertions that would go red if the gap were
   * removed are named in `docs/state/t13-01-engineer.md` and were proved by a mutation applied
   * and reverted in the same session.
   *
   * `A137` also rules out the change a reader might have asked for: a second whitespace
   * character collapses to the same single space, so the gap has to be declared. The absence of
   * that non-change is pinned beside the declaration — the label and the parenthetical stay on
   * the same source line, separated by exactly one newline.
   */
  it('declares the gap after the label and the smaller size of the parenthetical (t13-01 AC1-AC3, AC5; `A137`, `A138`)', () => {
    if (labelLine === undefined) {
      throw new Error('the options template has no `label-line` element');
    }

    // The gap is a declaration on `.hint`, read from the stripped rule body so a
    // commented-out `margin-left` cannot stand in for a shipped one.
    const hint = ruleBody(stylesCode, '.hint');
    expect(hint).toMatch(/(?:^|;)\s*margin-left:\s*4px;/);

    // And the size is a declaration too, explicitly below the surface's own base: the label
    // inherits the `.options` shorthand (`13px`), and the parenthetical steps down from it.
    expect(hint).toMatch(/(?:^|;)\s*font-size:\s*11px;/);
    expect(ruleBody(stylesCode, '.options')).toMatch(/(?:^|;)\s*font:\s*13px\/1\.45 system-ui, sans-serif;/);

    // Neither of the two new declarations replaced the ones the line already carried: the
    // italics and the `A125` ink are still there (`A138` keeps both).
    expect(hint).toMatch(/(?:^|;)\s*font-style:\s*italic;/);
    expect(hint).toMatch(new RegExp(`(?:^|;)\\s*color:\\s*${PALETTE.hint};`));

    // The two literals are the ones the ruling names, and they are not spelled anywhere else
    // on the surface: a second rule carrying the same size would be a second owner of it.
    // Since Stage 17 the server address line reuses the **same** `.hint` rule rather than a
    // second copy of it, which is why the sheet still spells each literal once.
    expect(stylesCode.match(/margin-left:/g) ?? []).toHaveLength(1);
    expect(stylesCode.match(/font-size:\s*11px/g) ?? []).toHaveLength(1);

    // AC1's other half: the gap is **not** a second whitespace character. The markup keeps
    // exactly one separator between the label and the bracket — the newline HTML collapses to
    // one space — so the visible widening can only come from the declaration above.
    // The read is line-ending agnostic on purpose: this repository checks its sources out
    // with `\r\n`, and a pin on the checkout's line endings would be a pin on git config.
    const separator = /<\/label>(\s*)<span/.exec(labelLine)?.[1];
    if (separator === undefined) {
      throw new Error('the shipped template puts no separator between the label and the hint');
    }
    expect(separator, 'one newline and the indentation, and nothing else').toMatch(/^\r?\n[ ]+$/);
    // And the only whitespace in that separator is the newline and its indentation: every
    // other character is a space, and the assertion above already forbids a tab, a second
    // newline and a second space beside the indentation — which is the character AC1 forbids
    // and the change a reader might mistake for the fix.
    expect([...separator].filter((character) => character === ' ')).toHaveLength(
      separator.length - 1,
    );
    expect(separator).not.toContain('\t');
    expect(labelLine).toMatch(/<\/label>\r?\n\s*<span class="hint">/);

    // Nothing else on the line moved (AC3): the label keeps its `for`, the line keeps its
    // margin, the label keeps `display: inline`, and the input still comes immediately after
    // the line. The surface's base size is unchanged, so only `.hint` steps down.
    expect(template).toMatch(/<label class="label" for="author-name">\{\{ nameLabel \}\}<\/label>/);
    expect(ruleBody(stylesCode, '.label-line')).toMatch(/(?:^|;)\s*margin:\s*0 0 4px;/);
    expect(ruleBody(stylesCode, '.label')).toMatch(/display: inline/);
    expect(stylesCode.match(new RegExp(`font-size:\\s*${SURFACE_BASE_SIZE}`, 'g')) ?? []).toHaveLength(0);
    expect(stylesCode.match(new RegExp(`font-size:\\s*${HINT_SIZE}`, 'g')) ?? []).toHaveLength(1);
    expect(hint).toContain(HINT_GAP);
    expect(hint).toContain(HINT_SIZE);
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

/**
 * Ruling `A153` (task `t15-01`) closes `D5`/`A128`, open since Stage 9: the disabled action
 * control stops being an `opacity` and becomes **colours**, and the same three values are the
 * ones the page widgets' disabled save button wears (`A150`).
 *
 * Why the `opacity` goes rather than gets retuned is a measurement, not a preference: an
 * opacity fades the fill and the label **together**, so at `0.45` the label measured `1.42:1`
 * against its own button and could never be legible at any value that also looked disabled.
 * Stated as colours, the pair is `#1b2a33` on `#e3c3aa` — **8.88:1** — while the fill measures
 * **1.56:1** against the card, against **4.97:1** for the enabled `#b8480d`.
 */
describe('the disabled Сохранить is colours, not an opacity (A153, t15-01)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));
  const stylesCode = componentCodeStyles(join('src', 'options', 'options.component.ts'));

  it('drops the opacity and states the three roles the page widgets use', () => {
    const disabled = ruleBody(stylesCode, '.save:disabled');
    expect(disabled).toMatch(new RegExp(`(?:^|;)\\s*color:\\s*${PALETTE.ink};`));
    expect(disabled).toMatch(new RegExp(`(?:^|;)\\s*background:\\s*${DISABLED_FILL};`));
    expect(disabled).toMatch(new RegExp(`(?:^|;)\\s*border:\\s*1px solid ${PALETTE.decorative};`));

    // The retired mechanism is gone from the shipped stylesheet entirely: an `opacity` here
    // would fade the label with the fill, which is the state `A153` rules out. The absence
    // reads the verbatim text, so a commented-out `opacity` is flagged as well.
    expect(styles).not.toMatch(/opacity/);
  });

  it('declares no colour outside the palette the ruling names', () => {
    const declared = new Set(
      [...stylesCode.matchAll(/#[0-9a-fA-F]{6}/g)].map((match) => match[0].toLowerCase()),
    );
    expect([...declared].sort()).toEqual(
      [
        PALETTE.page,
        PALETTE.ink,
        PALETTE.hint,
        PALETTE.action,
        PALETTE.onAction,
        PALETTE.accent,
        PALETTE.accentBand,
        PALETTE.decorative,
        PREEXISTING_REFUSAL,
        DISABLED_FILL,
        // `t17-04` (`A173`): the rename warning's own ink, a darker shade of the kept
        // refusal colour so the warning reads as a warning without sharing the message
        // line's ink — the pair table owns one ink per rule.
        RENAME_WARNING_INK,
      ].sort(),
    );
  });

  it('measures the pair it claims, and stays visibly washed out without becoming unreadable', () => {
    // The numbers the ruling quotes, recomputed here rather than quoted: the label is
    // legible, and the disabled fill is visibly quieter than the enabled one.
    expect(contrastRatio(PALETTE.ink, DISABLED_FILL)).toBeCloseTo(8.88, 2);
    expect(contrastRatio(DISABLED_FILL, PALETTE.page)).toBeCloseTo(1.56, 2);
    expect(contrastRatio(PALETTE.action, PALETTE.page)).toBeCloseTo(4.97, 2);
    expect(contrastRatio(DISABLED_FILL, PALETTE.page)).toBeLessThan(
      contrastRatio(PALETTE.action, PALETTE.page),
    );
  });

  it('moves no geometry of the enabled control', () => {
    // `A150` is colours only: the enabled rule keeps the declarations it shipped with, and
    // the disabled rule adds nothing but the three colours and the cursor it always had.
    const enabled = ruleBody(stylesCode, '.save');
    for (const declaration of [
      'padding: 6px 14px;',
      'color: #ffffff;',
      'background: #b8480d;',
      'border: 0;',
      'border-radius: 6px;',
      'font: inherit;',
    ]) {
      expect(enabled, declaration).toContain(declaration);
    }
    const disabled = ruleBody(stylesCode, '.save:disabled');
    expect(disabled).toMatch(/(?:^|;)\s*cursor:\s*default;/);
    expect(disabled).not.toMatch(/padding|width|height|font|border-radius|margin/);
  });
});

/**
 * The two reads of one component stylesheet, pinned **in their directions** (`t10-02` AC8 and
 * AC10, closing debt row `S10-14` of `docs/state/stage-10-review-debt.md`).
 *
 * `docs/state/t10-02-review.md` finding 1 is why this describe exists at all: the sentence that
 * justified reading the component stylesheet verbatim claimed every presence claim about the
 * surface was wrapped in `codeOnly`, and the same file refuted it — the mascot geometry, the
 * palette roles and the dialog-box rules each read the unstripped text. A comment spelling
 * `width: 80px` inside the reachable `.mascot` rule therefore satisfied the geometry pin while
 * the stylesheet declared nothing. The fix is a split between two accessors, and a split that
 * lives only in a doc comment is the same defect waiting to return, so these cases hand both
 * accessors the same comment-only stylesheet and pin what each one has to answer. The shipped
 * stylesheet cannot carry that proof itself: it has no comment in it today, and adding one to
 * shipped UI code to satisfy a test would be the wrong kind of honest.
 */
describe('the stylesheet is read verbatim for absences and stripped for presence (t10-02 AC8, AC10; row S10-14)', () => {
  const fixture = join('tests', 'support', 'style-direction-fixture.txt');

  it('flags the commented-out box-sizing declaration, because the absence scan reads verbatim', () => {
    // Decoy 2 of the brief, on the accessor rather than on a hand-typed string: a commented-out
    // `box-sizing: border-box` in a rule that reaches the mascot is **flagged** by the text the
    // absence scans read. Move a `codeOnly` into `componentStyles` and this is the case that
    // speaks first.
    expect(boxSizingSelectorsReachingMascot(componentStyles(fixture))).toEqual(['.mascot']);
    // The stripped accessor is the one that must not see it, or the presence half of the split
    // would fail on a declaration no stylesheet makes.
    expect(boxSizingSelectorsReachingMascot(componentCodeStyles(fixture))).toEqual([]);
  });

  it('refuses the commented-out geometry literals, because the presence reads are stripped', () => {
    const verbatim = ruleBody(componentStyles(fixture), '.mascot');
    const stripped = ruleBody(componentCodeStyles(fixture), '.mascot');

    // Decoy 1 of the brief, written down as an assertion so the escape stays visible in the
    // diff: the verbatim read **is** satisfied by the comments. That is exactly the behavior the
    // geometry pin used to have, and the reason it no longer reads this text.
    expect(verbatim).toMatch(/width: 80px/);

    // The three literals the geometry case asserts against the shipped stylesheet, answered over
    // the same comment-only stylesheet by the read that case now uses. Comment the live
    // declarations out of `src/options/options.component.ts` and leave the comments behind, and
    // that case is red: `.mascot` stops matching its own literals.
    expect(stripped).not.toMatch(/width: 80px/);
    expect(stripped).not.toMatch(/height: 80px/);
    expect(stripped).not.toMatch(/border-radius: 50%/);
  });

  it('keeps the two accessors one stripping apart on the same path', () => {
    // The pair is pinned on the accessors, not on a literal typed at the scan: stripping inside
    // `componentStyles`, or failing to strip inside `componentCodeStyles`, is red here whatever
    // the shipped file happens to contain.
    const verbatim = componentStyles(fixture);
    const stripped = componentCodeStyles(fixture);
    expect(verbatim).toContain('/* width: 80px; */');
    expect(stripped).not.toContain('width: 80px');
    // The rule still exists after stripping; only its declarations are gone. Without this, a
    // helper that deleted whole rules would satisfy the two assertions above.
    expect(stripped).toContain('.mascot {');
  });
});

/**
 * The two UI changes of `t17-04` Addendum 1 (rulings `A175`, `A176`), shipped in the
 * same commit as the rename rule.
 *
 * Both are literal values a later edit can lose without noticing: a spacing value
 * that reads "fine" at 12px and a confirmation sentence that reads "fine" while it
 * claims more than the save does. Neither is visible in a diff review unless a test
 * reads the shipped text, so each one is pinned against the declaration or the
 * constant that owns it.
 */
describe('the checkbox row gap grows four times (A175, t17-04 AC13)', () => {
  const styles = componentStyles(join('src', 'options', 'options.component.ts'));

  it('declares margin: 48px 0 0 on .toggle-line', () => {
    // The stripped read, so a commented-out declaration cannot satisfy the pin: the
    // geometry cases above taught that lesson.
    const body = ruleBody(componentCodeStyles(join('src', 'options', 'options.component.ts')), '.toggle-line');
    expect(body).toMatch(/margin:\s*48px 0 0;/);
    expect(body).not.toMatch(/margin:\s*12px 0 0;/);
  });

  it('moves nothing else on the row, the checkbox or the button', () => {
    const code = componentCodeStyles(join('src', 'options', 'options.component.ts'));
    // The row's own two other declarations are untouched.
    expect(ruleBody(code, '.toggle-line')).toMatch(/gap:\s*6px;/);
    expect(ruleBody(code, '.toggle-line')).toMatch(/display:\s*flex;/);
    // The checkbox's size and accent are untouched.
    expect(ruleBody(code, '.sync-toggle')).toMatch(/width:\s*14px;/);
    expect(ruleBody(code, '.sync-toggle')).toMatch(/height:\s*14px;/);
    // The save button's padding is untouched.
    expect(ruleBody(code, '.save')).toMatch(/padding:\s*6px 14px;/);
    // The message's margin is untouched: the confirmation does not move with the row.
    expect(ruleBody(code, '.message')).toMatch(/margin:\s*12px 0 0;/);
    // The `A125` palette is untouched: the action colour is still the shipped literal.
    expect(ruleBody(code, '.save')).toMatch(/background:\s*#b8480d;/);
  });

  it('leaves the save button’s own margin alone while the row moves', () => {
    // The save button carries no margin declaration of its own in the shipped stylesheet;
    // the row's margin is the only gap that grew. A margin added to `.save` would move the
    // message line as well and is not part of this ruling.
    expect(styles).not.toMatch(/\.save\s*\{[^}]*margin:/);
  });
});

describe('the save confirmation reads «Сохранено» (A176, t17-04 AC14)', () => {
  it('holds exactly Сохранено under the code name saved', () => {
    expect(OPTIONS_STRINGS.saved).toBe('Сохранено');
    // The message map answers the `saved` code with the same sentence: the options page
    // renders the map, and the constant is where the wording lives.
    expect(OPTIONS_MESSAGE_TEXT.saved).toBe('Сохранено');
  });

  it('leaves the sweep_failed wording naming the name on purpose', () => {
    expect(RENAME_OUTCOME_TEXT.sweep_failed).toBe(
      'Имя сохранено, но часть заметок с прежним именем удалить не удалось',
    );
  });
});
