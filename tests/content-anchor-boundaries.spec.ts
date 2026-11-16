import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildTextStream, nodeCodePointIndex } from '../src/content/anchor/text-stream';
import { fragmentsForRange, locateAnchor, locateAnchorInStream } from '../src/content/anchor/locate-anchor';
import type { EntryAnchor } from '../src/core/entry';

/**
 * Layer and dependency boundaries of the `t2-02` anchor modules, plus the
 * `jsdom` discipline of PM ruling `A2`.
 *
 * This file deliberately runs in the default **node** environment: importing
 * `src/content/anchor/*` here proves AC4 ("the module imports cleanly in a Node
 * process"), because the process has no `document` and no `window` to fall back
 * on. The behavior of the same modules against a real DOM lives in
 * `tests/content-anchor-text-stream.spec.ts` and `tests/content-anchor-locate.spec.ts`.
 */

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

interface SourceFile {
  path: string;
  text: string;
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

/** Strips comments, so a boundary check looks at code and never at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

function anchorSources(): SourceFile[] {
  return sourceFiles('src/content/anchor');
}

function codeOf(name: string): string {
  const file = anchorSources().find((entry) => entry.path.endsWith(name));
  if (file === undefined) {
    throw new Error(`src/content/anchor/${name} is missing`);
  }
  return codeOnly(file.text);
}

function specText(name: string): string {
  return readFileSync(join(projectRoot, 'docs', 'specs', name), 'utf8');
}

function packageJson(): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

describe('the anchor modules load without a DOM (AC4)', () => {
  it('runs in a process with no document and no window', () => {
    expect(Reflect.has(globalThis, 'document')).toBe(false);
    expect(Reflect.has(globalThis, 'window')).toBe(false);
  });

  it('imports and exposes its functions anyway', () => {
    expect(typeof buildTextStream).toBe('function');
    expect(typeof nodeCodePointIndex).toBe('function');
    expect(typeof locateAnchor).toBe('function');
    expect(typeof locateAnchorInStream).toBe('function');
    expect(typeof fragmentsForRange).toBe('function');
  });

  it('walks a plain-object tree, proving the walk needs no DOM class at all (AC4)', () => {
    // A hand-made tree of `{ nodeType, nodeName, data, parentNode, firstChild,
    // nextSibling }`: no `document`, no `Text` instance, no `TreeWalker`, no
    // `instanceof`. If the module reached for any DOM global, this would throw.
    const first = stubText('First  paragraph');
    const second = stubText('second\tparagraph');
    const article = stubElement('article', [
      stubElement('P', [first]),
      stubElement('P', [second]),
    ]);

    const stream = buildTextStream(article);
    expect(stream.text).toBe('First paragraph second paragraph');
    expect(stream.fragments).toHaveLength(2);
    expect(stream.fragments[0].node).toBe(first);
    expect(stream.fragments[1].node).toBe(second);

    const anchor: EntryAnchor = { text: 'graph second', prefix: '', suffix: '', fragmentCount: 2 };
    const result = locateAnchor(article, anchor);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.fragments).toHaveLength(2);
    const spans = result.fragments.map(
      (fragment) => (fragment.node as unknown as { data: string }).data.slice(fragment.start, fragment.end),
    );
    expect(spans).toEqual(['graph', 'second']);
  });

  it('reads no global, no framework, no chrome API and no network call', () => {
    const forbidden = [
      'document',
      'window',
      'globalThis',
      'self.',
      'TreeWalker',
      'instanceof',
      'querySelector',
      'chrome.',
      '@angular/',
      'preact',
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
    ];
    for (const file of anchorSources()) {
      const code = codeOnly(file.text);
      for (const token of forbidden) {
        expect(code.includes(token)).toBe(false);
      }
      // `Range` only with word boundaries: `fragmentsForRange` is this module's own name.
      expect(/\bRange\b/.test(code)).toBe(false);
    }
  });

  it('takes the subtree as an argument instead of reaching for a page', () => {
    for (const file of anchorSources()) {
      const exported = codeOnly(file.text).match(/export function \w+\(/g) ?? [];
      expect(exported.length).toBeGreaterThan(0);
    }
    expect(codeOf('text-stream.ts')).toContain('export function buildTextStream(root: Node)');
    expect(codeOf('locate-anchor.ts')).toContain('export function locateAnchor(root: Node, anchor: EntryAnchor)');
  });

  it('imports only core and its own directory', () => {
    for (const file of anchorSources()) {
      for (const specifier of codeOnly(file.text).match(/from\s+'([^']+)'/g) ?? []) {
        const target = specifier.replace(/from\s+'/, '').replace(/'$/, '');
        expect(target.startsWith('.') || target.startsWith('../core/')).toBe(true);
      }
    }
  });
});

describe('the string search stays in core (AC2)', () => {
  it('the content layer implements no second search', () => {
    for (const file of anchorSources()) {
      const code = codeOnly(file.text);
      for (const token of [
        'indexOf',
        'includes',
        'search(',
        'match(',
        'lastIndexOf',
        'startsWith',
        'endsWith',
        'localeCompare',
        'RegExp',
        'split(',
      ]) {
        expect(code.includes(token)).toBe(false);
      }
    }
  });

  it('delegates resolution and normalization to core', () => {
    expect(codeOf('locate-anchor.ts')).toContain("from '../../core/anchor-resolve'");
    expect(codeOf('locate-anchor.ts')).toContain('resolveAnchor(stream.text, anchor)');
    expect(codeOf('text-stream.ts')).toContain("from '../../core/text-normalize'");
    expect(codeOf('text-stream.ts')).toContain('normalizeText(');
  });
});

describe('jsdom discipline (AC5, ruling A2)', () => {
  it('is a devDependency and never a runtime dependency', () => {
    const manifest = packageJson();
    expect(manifest.devDependencies['jsdom']).toBeTruthy();
    expect(manifest.dependencies['jsdom']).toBeUndefined();
  });

  it('is never referenced by shipped source', () => {
    const offenders = sourceFiles('src')
      .filter((file) => file.text.toLowerCase().includes('jsdom'))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('is never referenced by the manifest', () => {
    const manifest = readFileSync(join(projectRoot, 'src', 'manifest.json'), 'utf8');
    expect(manifest.toLowerCase()).not.toContain('jsdom');
  });

  it('is absent from every built bundle when dist/ exists', () => {
    const distDir = join(projectRoot, 'dist');
    if (!existsSync(distDir)) {
      return;
    }
    expect(bundleFilesMentioningJsdom(distDir)).toEqual([]);
  });
});

describe('the stream rules are pinned by the spec (AC5)', () => {
  it('the model spec owns the stream, the boundary space, the exclusions and the fragment contract', () => {
    const spec = specText('inline-comment-model.md');
    for (const anchor of [
      'Normalized text stream',
      'Block boundary',
      'Excluded subtree',
      'Text fragment',
      'Anchor domains',
      'Anchor locate codes',
      'A20',
      'A21',
      'A29',
    ]) {
      expect(spec).toContain(anchor);
    }
  });

  it('the model spec states that jsdom is test-only', () => {
    expect(specText('inline-comment-model.md')).toContain('jsdom');
    expect(specText('content-overlay-ui.md')).toContain('Text stream and fragments');
  });

  it('the overlay spec keeps the painting half and points at the fragment contract', () => {
    const overlay = specText('content-overlay-ui.md');
    expect(overlay).toContain('`text fragment`');
    expect(overlay).toContain('`anchor_stale`');
  });
});

/** A text node shape, without any DOM class behind it. */
function stubText(data: string): Node {
  return {
    nodeType: 3,
    nodeName: '#text',
    data,
    parentNode: null,
    firstChild: null,
    nextSibling: null,
  } as unknown as Node;
}

/** An element shape that links its children the way the DOM does. */
function stubElement(tagName: string, children: readonly Node[]): Node {
  const element = {
    nodeType: 1,
    nodeName: tagName.toUpperCase(),
    parentNode: null,
    firstChild: null,
    nextSibling: null,
  } as unknown as Record<string, unknown>;
  let previous: Record<string, unknown> | null = null;
  for (const child of children) {
    const link = child as unknown as Record<string, unknown>;
    link['parentNode'] = element;
    link['nextSibling'] = null;
    if (previous === null) {
      element['firstChild'] = child;
    } else {
      previous['nextSibling'] = child;
    }
    previous = link;
  }
  return element as unknown as Node;
}

/** Every `.js` file inside `dist/` whose text mentions jsdom, by relative path. */
function bundleFilesMentioningJsdom(distDir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    const full = join(distDir, entry.name);
    if (entry.isDirectory()) {
      found.push(...bundleFilesMentioningJsdom(full));
    } else if (entry.name.endsWith('.js')) {
      if (readFileSync(full, 'utf8').toLowerCase().includes('jsdom')) {
        found.push(full.slice(distDir.length));
      }
    }
  }
  return found;
}
