/**
 * AC3 of task `t3-05` (ruling `A75`): the content layer's page-boundary throw paths are
 * enumerated in **one place**, and every shipped `catch` under `src/content/` is named in
 * that enumeration.
 *
 * The point of the mechanical part is drift, not decoration: the enumeration is the text
 * a reviewer of the next content-layer diff reads, so a `catch` added without a row makes
 * this file fail, and a row written for a `catch` that no longer exists makes it fail the
 * other way. The second half pins the other side of ruling `A75` — the guard lives at the
 * call site, so the module that asks the page for the answer asks it unchanged.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');
const SPEC_PATH = path.join(process.cwd(), 'docs', 'specs', 'content-overlay-ui.md');

/**
 * The shipped `catch` sites, keyed by the path the enumeration uses (relative to
 * `src/content/`). `catch` is matched as code — `catch {` or `catch (error)` — so the
 * prose of a comment about a `catch` is never counted as one.
 */
function shippedCatchSites(): Map<string, number[]> {
  const sites = new Map<string, number[]>();
  for (const file of sourceFiles(CONTENT_DIR)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const hits: number[] = [];
    lines.forEach((line: string, index: number) => {
      if (/\bcatch\s*[({]/.test(line)) {
        hits.push(index + 1);
      }
    });
    if (hits.length > 0) {
      sites.set(path.relative(CONTENT_DIR, file).replaceAll('\\', '/'), hits);
    }
  }
  return sites;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(absolute));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(absolute);
    }
  }
  return found;
}

/** The enumeration section itself, not the whole spec. */
function enumerationSection(): string {
  const spec = readFileSync(SPEC_PATH, 'utf8');
  const start = spec.indexOf('## Page-boundary throws');
  if (start < 0) {
    return '';
  }
  const rest = spec.slice(start);
  const nextHeading = rest.indexOf('\n## ', 3);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading);
}

describe('the page-boundary throw enumeration is one section (t3-05 AC3)', () => {
  it('exists under its own heading, with one table of call sites', () => {
    const section = enumerationSection();
    expect(section).not.toBe('');
    expect(section).toContain('### Every `catch` under `src/content/`');
    expect(section).toContain('| Call site | The state that throws | The answer | Verification |');
  });

  it('names the module that owns no catch, so the guard location is stated', () => {
    const section = enumerationSection();
    expect(section).toContain('capture/selection-span.ts');
    expect(section).toContain('touchedFragments');
    // Ruling `A75` in one sentence: the guard is at the content call site, and core is
    // left alone.
    expect(section).toContain('never in `src/core/`');
  });

  it('names the two promises that must not reject, and who cannot catch them', () => {
    const section = enumerationSection();
    expect(section).toContain('PagePainter.refresh()');
    expect(section).toContain('CreateCardController.capture()');
    expect(section).toContain('void painter.refresh()');
    expect(section).toContain('void controller.capture()');
  });
});

describe('every shipped catch under src/content is in the enumeration (t3-05 AC3)', () => {
  it('is named by file, in a row that states an answer and a verification', () => {
    const sites = shippedCatchSites();
    expect([...sites.keys()]).not.toEqual([]);
    const section = enumerationSection();

    for (const file of sites.keys()) {
      expect(section, `the enumeration has no row for src/content/${file}`).toContain(file);
    }
    // Every row ends with the verification half: a test name, or the word that says the
    // path is named instead of driven.
    const rows = section
      .split('\n')
      .filter((line: string) => line.startsWith('| `') || line.startsWith('| capture/'));
    expect(rows.length).toBeGreaterThanOrEqual(sites.size);
    for (const row of rows) {
      expect(row).toMatch(/tests\/[\w-]+\.spec\.ts|\*\*named:\*\*|Named rather than/);
    }
  });

  it('is exactly the pinned set of fourteen sites, so a new catch breaks the build', () => {
    const pinned: Record<string, number> = {
      'create/create-note.ts': 1,
      'editor/edit-entry.ts': 1,
      'overlay/create-card-controller.tsx': 2,
      'overlay/editor-controller.tsx': 1,
      'overlay/tooltip-controller.tsx': 1,
      'paint/page-painter.ts': 4,
      'paint/paint-plan.ts': 1,
      'paint/paint-style.ts': 2,
      'store/chrome-storage-port.ts': 1,
    };
    const sites = shippedCatchSites();
    const actual: Record<string, number> = {};
    for (const [file, hits] of sites) {
      actual[file] = hits.length;
    }
    expect(actual).toEqual(pinned);
    const total = [...sites.values()].reduce((sum: number, hits: number[]) => sum + hits.length, 0);
    expect(total).toBe(14);
  });
});

describe('the guard stays at the call site (ruling A75)', () => {
  it('leaves the capture module asking the page and propagating the throw', () => {
    const capture = readFileSync(path.join(CONTENT_DIR, 'capture', 'selection-span.ts'), 'utf8');
    expect(capture).toContain('intersectsNode');
    // No `try`, no `catch`: this module owns the span, not the policy of a flow.
    expect(capture).not.toMatch(/\bcatch\s*[({]/);
    expect(capture).not.toMatch(/\btry\s*{/);
  });

  it('keeps the card free of a catch around the create path', () => {
    const controller = readFileSync(
      path.join(CONTENT_DIR, 'overlay', 'create-card-controller.tsx'),
      'utf8',
    );
    const submit = controller.slice(
      controller.indexOf('async function submit('),
      controller.indexOf('function open('),
    );
    expect(submit).not.toBe('');
    // The card has one input for a refusal: the `CreateNoteResult`. A `catch` here would
    // turn a real defect into a silent state, which is the failure mode `t3-05` closed.
    expect(submit).not.toMatch(/\bcatch\s*[({]/);
  });

  it('keeps the editor free of a catch around the edit path, for the same reason', () => {
    // The rule of `t3-05` AC3 applied to the widget `t3-03` adds: the editor's save and
    // delete paths take their refusal from the `EditNoteResult` and the
    // `EntryWriteResult` only, so the busy / `refusal line` machine has one input and a
    // defect cannot hide as a silent `busy` state with a disabled button.
    const controller = readFileSync(
      path.join(CONTENT_DIR, 'overlay', 'editor-controller.tsx'),
      'utf8',
    );
    const submit = controller.slice(
      controller.indexOf('async function submit('),
      controller.indexOf('function close('),
    );
    expect(submit).not.toBe('');
    expect(submit).not.toMatch(/\bcatch\s*[({]/);
  });
});
