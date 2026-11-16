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

  it('every UI layer keeps its strings in one constants module', () => {
    for (const constants of ['src/content/text.ts', 'src/popup/text.ts', 'src/options/text.ts']) {
      expect(sourceFiles('src').map((file) => file.path)).toContain(constants);
    }
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
