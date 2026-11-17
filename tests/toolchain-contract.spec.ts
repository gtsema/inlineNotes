import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Toolchain contracts of task `t1-01`.
 *
 * These checks are the executable form of the layering rules in
 * `AGENTS.md` / `docs/project-profile.md`: Angular only in the extension UI,
 * Preact only in the page, permissions limited to `storage`, no network API in
 * shipped source. They run before `dist/` exists, so a violation fails the unit
 * gate and not only the manual load check.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

interface SourceFile {
  path: string;
  text: string;
}

interface ManifestShape {
  manifest_version?: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  action?: { default_popup?: string };
  options_page?: string;
  content_scripts?: { matches?: string[]; js?: string[] }[];
}

function sourceFiles(dir: string): SourceFile[] {
  const absoluteDir = join(projectRoot, dir);
  const files: SourceFile[] = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...sourceFiles(join(dir, entry.name)));
      continue;
    }
    if (!/\.(ts|tsx|html|json)$/.test(entry.name)) {
      continue;
    }
    files.push({
      path: join(dir, entry.name).replaceAll('\\', '/'),
      text: readFileSync(join(absoluteDir, entry.name), 'utf8'),
    });
  }
  return files;
}

/** Strips comments so the boundary checks look at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

/** The `import ... from '...'` clauses of one source file, comments removed. */
function importClauses(text: string): string[] {
  return [...codeOnly(text).matchAll(/\bimport\b[^;]*\bfrom\s*'[^']*'/g)].map((match) => match[0]);
}

/** Shipped modules that import the identifier `name` from another module. */
function importersOf(name: string): string[] {
  const mention = new RegExp(`\\b${name}\\b`);
  return sourceFiles('src')
    .filter((file) => importClauses(file.text).some((clause) => mention.test(clause)))
    .map((file) => file.path);
}

/** Shipped modules whose code, not comments, contains a quoted string literal. */
function modulesHoldingLiteral(literal: string): string[] {
  return sourceFiles('src')
    .filter((file) => codeOnly(file.text).includes(`'${literal}'`))
    .map((file) => file.path);
}

function readManifest(): ManifestShape {
  const raw = readFileSync(join(projectRoot, 'src', 'manifest.json'), 'utf8');
  return JSON.parse(raw) as ManifestShape;
}

describe('manifest contract', () => {
  it('is an MV3 manifest with popup, options and a content script', () => {
    const manifest = readManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(typeof manifest.action?.default_popup).toBe('string');
    expect(typeof manifest.options_page).toBe('string');
    expect(manifest.content_scripts?.[0]?.js).toContain('content.js');
  });

  it('registers the content script for http and https only', () => {
    const manifest = readManifest();
    expect(manifest.content_scripts?.[0]?.matches).toEqual(['http://*/*', 'https://*/*']);

    // The scheme decision must live in the spec, in the same commit as the code.
    const spec = readFileSync(
      join(projectRoot, 'docs', 'specs', 'content-overlay-ui.md'),
      'utf8',
    );
    expect(spec).toContain('- Registered schemes:');
    expect(spec).toContain('`http://*/*`');
    expect(spec).toContain('`https://*/*`');
  });

  it('declares no host_permissions and no permission beyond storage', () => {
    const manifest = readManifest();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions ?? []).toEqual(['storage']);
    expect(manifest.optional_permissions).toBeUndefined();
  });
});

describe('layer boundaries', () => {
  it('content layer imports no Angular', () => {
    const offenders = sourceFiles('src/content')
      .filter((file) => codeOnly(file.text).includes('@angular/'))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('popup and options boot real Angular standalone applications', () => {
    for (const entry of ['src/popup/main.ts', 'src/options/main.ts']) {
      const text = readFileSync(join(projectRoot, entry), 'utf8');
      expect(text).toContain('bootstrapApplication');
    }
    const components = sourceFiles('src/popup')
      .concat(sourceFiles('src/options'))
      .filter((file) => file.text.includes('ChangeDetectionStrategy'));
    expect(components.length).toBeGreaterThan(1);
  });

  it('core layer is framework-free and DOM-free', () => {
    for (const file of sourceFiles('src/core')) {
      const code = codeOnly(file.text);
      expect(code).not.toContain('chrome.');
      expect(code).not.toContain('document.');
      expect(code).not.toContain('window.');
      expect(code).not.toContain('@angular/');
      expect(code).not.toContain('preact');
    }
  });

  it('reaches chrome.storage through exactly one shipped adapter (review remark R3)', () => {
    // The spec pins the seam: `src/core/` owns the contract and only one content
    // adapter may touch `chrome.storage`, so popup and options must go through the
    // core API instead of ad hoc storage keys.
    const users = sourceFiles('src')
      .filter((file) => codeOnly(file.text).includes('chrome.storage'))
      .map((file) => file.path);
    expect(users).toEqual(['src/content/store/chrome-storage-port.ts']);
  });

  it('reads and writes the settings key in exactly one shipped module (t3-01 review remark 2)', () => {
    // `inline-comment-model.md` -> "Storage layout" says exactly one core module
    // reads and writes `settings:v1`. The `chrome.storage` half of that claim is
    // pinned by the test above; this is the key half: one importer of
    // `SETTINGS_KEY`, one holder of the literal key itself.
    expect(importersOf('SETTINGS_KEY')).toEqual(['src/core/settings-store.ts']);
    expect(modulesHoldingLiteral('settings:v1')).toEqual(['src/core/storage-keys.ts']);
  });

  it('imports no internal settings helper anywhere (ruling A57)', () => {
    // `settingsValueOf` and `settingsFromStorageValue` build and decode the stored
    // record for `saveSettings` and `loadSettings` only. A UI half that composed
    // them by hand would be a second reader of `settings:v1`, which is the same
    // reason `assertCreatable` is not imported outside `create-entry.ts` under
    // ruling `A52`. The rule needs a grep test, not a comment.
    for (const internal of ['settingsValueOf', 'settingsFromStorageValue']) {
      expect(importersOf(internal)).toEqual([]);
    }
  });

  describe('the options page is the only writer of the settings record (t4-02 AC5)', () => {
    const optionsFiles = (): SourceFile[] => sourceFiles('src/options');
    const optionsCode = (): string => optionsFiles().map((file) => codeOnly(file.text)).join('\n');

    it('names no storage key and calls no storage API of its own', () => {
      const directStorage = optionsFiles()
        .filter((file) => codeOnly(file.text).includes('chrome.storage'))
        .map((file) => file.path);
      expect(directStorage).toEqual([]);

      const keyImporters = optionsFiles()
        .filter((file) => importClauses(file.text).some((clause) => /\bSETTINGS_KEY\b/.test(clause)))
        .map((file) => file.path);
      expect(keyImporters).toEqual([]);

      const keyLiterals = modulesHoldingLiteral('settings:v1');
      expect(keyLiterals).toEqual(['src/core/storage-keys.ts']);
    });

    it('reaches chrome.storage.local only through the one port adapter factory', () => {
      const factories = optionsFiles()
        .filter((file) => codeOnly(file.text).includes('createChromeLocalStoragePort'))
        .map((file) => file.path);
      expect(factories).toEqual(['src/options/options.component.ts']);
    });

    it('is the only shipped caller of the settings save and of name generation (spec ":75")', () => {
      // `inline-comment-model.md` -> "Author name": `t4-02-options-name` is the only
      // shipped caller of the settings save and the only place a first-run name is
      // wired. The claim needs a grep, not a comment: a second `generateAuthorName`
      // call site would hand the reader two different authors.
      expect(importersOf('saveSettings')).toEqual(['src/options/author-name-service.ts']);
      expect(importersOf('generateAuthorName')).toEqual(['src/options/author-name-service.ts']);
    });

    it('measures the author cap in code points, never in UTF-16 units (ruling A55)', () => {
      const code = optionsCode();
      expect(code).toMatch(/\bsliceCodePoints\b/);
      expect(code).toMatch(/\bcodePointLength\b/);
      // The `t1-01` stub's `maxlength="40"` counted UTF-16 units and is gone: the
      // input itself refuses the code point past the cap.
      expect(code).not.toMatch(/maxlength/i);
      expect(code).not.toMatch(/\.length\s*[<>]/);
    });

    it('holds one name-refusal wording on this surface and no third variant', () => {
      const strings = readFileSync(join(projectRoot, 'src', 'options', 'text.ts'), 'utf8');
      expect(strings).toContain("'Имя обязательно'");
      // `Укажите имя в настройках` belongs to the card and the popup; a third
      // sentence for the same state is the hand-over this task must not repeat.
      // Comments may name the other surface; a string literal may not.
      expect(codeOnly(strings)).not.toContain('Укажите имя');
      expect(codeOnly(strings)).not.toContain('Задайте имя');
      expect(codeOnly(strings)).not.toContain('Введите имя');
    });

    it('keeps the component a facade with no core rule of its own', () => {
      const component = codeOnly(readFileSync(join(projectRoot, 'src', 'options', 'options.component.ts'), 'utf8'));
      for (const rule of [
        'loadSettings',
        'saveSettings',
        'generateAuthorName',
        'validateAuthorName',
        'MAX_AUTHOR_NAME_CODE_POINTS',
      ]) {
        expect(component).not.toMatch(new RegExp(`\\b${rule}\\b`));
      }
    });
  });

  it('every UI layer keeps its strings in one constants module', () => {
    for (const constants of ['src/content/text.ts', 'src/popup/text.ts', 'src/options/text.ts']) {
      expect(sourceFiles('src').map((file) => file.path)).toContain(constants);
    }
  });
});

describe('the capture module crosses the offset domain only through core helpers (t3-01b finding 1)', () => {
  /**
   * `trimStreamRange` holds **stream code-point** offsets and has to look at
   * characters, which live at UTF-16 indices. The shipped code probed
   * `streamText.charAt(offset)` directly and clamped those offsets with
   * `streamText.length`: the same class of mistake the `t2-02` hand-over warns about
   * in `fragment-rect.ts`, in the opposite direction, and invisible in the types
   * because every number in that module is `number`. One astral character anywhere
   * earlier in the stream answered "no separator here" where there was one, so the
   * stored note lost its first character, a short selection lost its range, and a
   * re-selection was refused as `overlap` instead of `duplicate`. The helpers that
   * make the crossing already exist in `src/core/text-normalize.ts`.
   */
  const source = codeOnly(
    readFileSync(join(projectRoot, 'src/content/capture/selection-span.ts'), 'utf8'),
  );

  it('converts the two boundary offsets with the core helpers', () => {
    expect(source).toMatch(/\butf16IndexAt\b/);
    expect(source).toMatch(/\bcodePointOffsetAt\b/);
    expect(source).toMatch(
      /from '\.\.\/\.\.\/core\/text-normalize'/,
    );
  });

  it('never probes the stream with an unconverted code-point offset', () => {
    // Every character probe of the stream addresses a `*Units` index, which is this
    // module's name for a value produced by `utf16IndexAt`.
    expect(source).not.toMatch(/streamText\.charAt\((?!beginUnits|finishUnits)/);
  });

  it('never measures a code-point offset against the UTF-16 length of the stream', () => {
    expect(source).not.toMatch(/streamText\.length/);
  });
});

describe('no network in shipped source', () => {
  it('src contains no fetch, XMLHttpRequest or WebSocket', () => {
    const pattern = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/;
    const offenders = sourceFiles('src')
      .filter((file) => pattern.test(codeOnly(file.text)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
