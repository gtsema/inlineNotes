/**
 * Layer boundaries of the `t3-01` create-card slice.
 *
 * Proves:
 * - AC4 of `docs/specs/content-overlay-ui.md` for this task: the content layer owns
 *   no persistence of its own — the only shipped content module that talks to the
 *   core write path, the core read path, the settings reader or the anchor builder
 *   is `src/content/create/create-note.ts` and `src/content/capture/selection-span.ts`;
 * - the `t2-03` and `t3-01-settings-read` hand-over contracts: no page policy
 *   (`writeSlotThenIndex`, `readPageIndex`, `entrySlotValue`, `entryStorageKey`) and
 *   no settings internals (`SETTINGS_KEY`, `settingsValueOf`, `settingsFromStorageValue`,
 *   `saveSettings`, `generateAuthorName`) anywhere under `src/content`;
 * - ruling `A52` in the narrow sense the PM kept open: `assertCreatable` is not
 *   called from the page layer, because a preview built without `spans` would answer
 *   "allowed" and re-open the failure class `t2-03` remark 3 closed;
 * - ruling `A33` and `A47`: refusal wording is a total map in `src/content/text.ts`,
 *   the pinned sentences are exactly the ones the specs name, and no Russian string
 *   lives anywhere else in the shipped content layer.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_CODE_POINTS, MAX_ENTRIES_PER_PAGE } from '../src/core/entry-rules';
import { CONTENT_STRINGS, REFUSAL_TEXT, cardCounterText, refusalText } from '../src/content/text';
import type { CreateNoteCode } from '../src/content/create/create-note';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_DIR = path.join(ROOT, 'src', 'content');

/** Everything shipped under `src/content`. */
function shippedContentFiles(): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    const absolute = path.join(CONTENT_DIR, entry.name);
    if (entry.isDirectory()) {
      found.push(...shippedContentFilesAt(absolute));
    } else if (isShipped(entry.name)) {
      found.push(absolute);
    }
  }
  return found;
}

function shippedContentFilesAt(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...shippedContentFilesAt(absolute));
    } else if (isShipped(entry.name)) {
      found.push(absolute);
    }
  }
  return found;
}

function isShipped(name: string): boolean {
  return (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts');
}

/** Comments stripped, so a prose sentence can never trip an import scan. */
function codeOnly(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** Specifier to repo-relative module path, resolved through the real files. */
function importedModules(file: string): string[] {
  const dir = path.dirname(file);
  const specifiers = [...codeOnly(file).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  return specifiers.map((specifier) => resolveModule(dir, specifier));
}

function resolveModule(dir: string, specifier: string): string {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  const base = path.resolve(dir, specifier);
  for (const extension of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(base + extension)) {
      return toPosix(path.relative(ROOT, base + extension));
    }
  }
  return toPosix(path.relative(ROOT, base));
}

function toPosix(value: string): string {
  return value.replaceAll(path.sep, '/');
}

/** Shipped content files that import `modulePath`, repo-relative. */
function contentFilesImporting(modulePath: string): string[] {
  return shippedContentFiles()
    .filter((file) => importedModules(file).includes(modulePath))
    .map((file) => toPosix(path.relative(ROOT, file)));
}

/** Shipped content files that mention `pattern` in code, not in prose. */
function contentFilesMatching(pattern: RegExp): string[] {
  return shippedContentFiles()
    .filter((file) => pattern.test(codeOnly(file)))
    .map((file) => toPosix(path.relative(ROOT, file)));
}

/** The module that declares the two locate functions is not a caller of them. */
function excludeLocatorDefinition(file: string): boolean {
  return file !== 'src/content/anchor/locate-anchor.ts';
}

describe('the content layer owns no persistence of its own (AC4)', () => {
  it('asks core for a write in exactly one module', () => {
    expect(contentFilesImporting('src/core/entry-store-write.ts')).toEqual([
      'src/content/create/create-note.ts',
    ]);
  });

  it('asks core for a page read in exactly one module', () => {
    // Task `t3-02` widens this pin deliberately: the load-time paint pass
    // (`docs/specs/inline-comment-model.md` -> Flow / Sequence 6) is the second
    // legitimate reader of a page, because painting has to know which entries the
    // page holds. Widening is the honest answer here, not a second reader that
    // invents its own storage keys: both readers go through core `loadEntries`, and
    // `tests/content-page-painter.spec.ts` pins that the paint pass performs no write.
    expect(contentFilesImporting('src/core/entry-store-read.ts')).toEqual([
      'src/content/create/create-note.ts',
      'src/content/paint/page-painter.ts',
    ]);
  });

  it('reads the settings through core in exactly one module', () => {
    expect(contentFilesImporting('src/core/settings-store.ts')).toEqual([
      'src/content/create/create-note.ts',
    ]);
  });

  it('builds an anchor in exactly one module, and only for a captured selection', () => {
    expect(contentFilesImporting('src/core/anchor-build.ts')).toEqual([
      'src/content/capture/selection-span.ts',
    ]);
  });

  it('never touches the storage layout or the page policy', () => {
    for (const pattern of [
      /writeSlotThenIndex/,
      /writePageIndex/,
      /readPageIndex/,
      /entrySlotValue/,
      /entryStorageKey/,
      /pageStorageKey/,
      /PageIndex/,
      /SlotWriteOutcome/,
      /entry-storage-reconcile/,
      /entry-store-repair/,
    ]) {
      expect(contentFilesMatching(pattern), pattern.source).toEqual([]);
    }
  });

  it('never touches the settings internals (A31)', () => {
    for (const pattern of [
      /SETTINGS_KEY/,
      /settingsValueOf/,
      /settingsFromStorageValue/,
      /validateAuthorNameSynchronously/,
      /saveSettings/,
      /generateAuthorName/,
    ]) {
      expect(contentFilesMatching(pattern), pattern.source).toEqual([]);
    }
  });

  it('does not build a second gate from the core rules (A52)', () => {
    for (const pattern of [/assertCreatable/, /canCreateEntry/, /findOverlap/]) {
      expect(contentFilesMatching(pattern), pattern.source).toEqual([]);
    }
  });

  it('hands the storage seam to core untouched and builds no slot value', () => {
    const createNote = readFileSync(path.join(CONTENT_DIR, 'create', 'create-note.ts'), 'utf8');
    expect(createNote).toContain('createEntryOnPage(input.port,');
    expect(createNote).toContain('spans,');
    const body = codeOnly(path.join(CONTENT_DIR, 'create', 'create-note.ts'));
    expect(body).not.toContain('port.set(');
    expect(body).not.toContain('port.remove(');
    expect(body).not.toContain('chrome.storage');
  });

  it('uses the fresh-stream locate, never the per-entry stream rebuild (A37, N7)', () => {
    // `locateAnchorInStream` is the one-stream form `A37` requires; `locateAnchor`
    // rebuilds a stream per call and would give the candidate and a stored entry
    // numbers taken from two different page states.
    //
    // Task `t3-02` widens this pin deliberately for the paint pass, which is the
    // second legitimate user of the one-stream form (`N7` allows
    // `locateAnchorInStream` exactly when the stream was built in the same pass from
    // the same root, which is what `paint-plan.ts` does). The count below is the
    // teeth of that condition: one `buildTextStream` call in the pass means one
    // stream for every anchor of the page, and the behavioural proof of the same
    // property lives in `tests/content-paint-plan.spec.ts` (the same-shape rewrite).
    const streamReusers = contentFilesMatching(/\blocateAnchorInStream\(/).filter(excludeLocatorDefinition);
    expect(streamReusers).toEqual([
      'src/content/create/create-note.ts',
      'src/content/paint/paint-plan.ts',
    ]);
    for (const file of streamReusers) {
      const builds = (codeOnly(path.join(ROOT, file)).match(/\bbuildTextStream\(/g) ?? []).length;
      expect(builds, file).toBe(1);
    }
    const rebuilds = contentFilesMatching(/\blocateAnchor\(/).filter(excludeLocatorDefinition);
    expect(rebuilds).toEqual([]);
  });
});

describe('the refusal wording is one total map (A33, A47)', () => {
  /** Every code the create path answers with, as the union declares it. */
  const CODES: CreateNoteCode[] = [
    'name_required',
    'comment_empty',
    'comment_too_long',
    'page_limit',
    'overlap',
    'duplicate',
    'quota',
    'serialization',
    'unavailable',
    'layout_version',
    'index_malformed',
    'storage_unavailable',
    'slot_malformed',
    'url_unparsable',
    'not_author',
    'entry_not_found',
    'entry_invalid',
    'selection_lost',
  ];

  it('carries one Russian sentence per code, and no code is missed', () => {
    expect(Object.keys(REFUSAL_TEXT).sort()).toEqual([...CODES].sort());
    for (const code of CODES) {
      expect(refusalText(code), code).not.toBe('');
    }
  });

  it('keeps the sentences the specs pin exactly as written', () => {
    expect(REFUSAL_TEXT.duplicate).toBe('Такая заметка на этом выделении уже есть');
    expect(REFUSAL_TEXT.overlap).toBe('Выделение пересекается с существующей записью');
    expect(REFUSAL_TEXT.page_limit).toBe(
      `Достигнут лимит ${String(MAX_ENTRIES_PER_PAGE)} записей на странице`,
    );
    // The card can never be shown this one, because its own cap cuts the value at
    // the same core constant the sentence quotes; it is pinned so the number in the
    // words and the number in the rule cannot drift (`A33`, task `t3-01` AC5).
    expect(REFUSAL_TEXT.comment_too_long).toBe(
      `Заметка длиннее ${String(MAX_COMMENT_CODE_POINTS)} символов`,
    );
    expect(REFUSAL_TEXT.name_required).toBe('Укажите имя в настройках');
    expect(REFUSAL_TEXT.quota).toBe('Хранилище переполнено');
  });

  it('never collapses two create refusals into one sentence', () => {
    const createCodes = [
      'name_required',
      'comment_empty',
      'comment_too_long',
      'page_limit',
      'overlap',
      'duplicate',
    ] as const;
    const sentences = createCodes.map((code) => REFUSAL_TEXT[code]);
    expect(new Set(sentences).size).toBe(createCodes.length);
    // `entry_invalid` is a bug-level answer, and must not read like a refusal the
    // user caused: it shares its sentence with the write failures instead.
    expect(REFUSAL_TEXT.entry_invalid).toBe(REFUSAL_TEXT.serialization);
    expect(REFUSAL_TEXT.entry_invalid).not.toBe(REFUSAL_TEXT.duplicate);
    expect(REFUSAL_TEXT.entry_invalid).not.toBe(REFUSAL_TEXT.overlap);
    expect(REFUSAL_TEXT.selection_lost).not.toBe(REFUSAL_TEXT.duplicate);
    expect(REFUSAL_TEXT.overlap).not.toBe(REFUSAL_TEXT.duplicate);
  });

  it('counts the counter in code points against the core cap', () => {
    expect(cardCounterText(0)).toBe('0/256');
    expect(cardCounterText(256)).toBe('256/256');
    expect(cardCounterText(12)).toBe('12/256');
  });

  it('holds the card strings and nothing else in the constants module', () => {
    expect(CONTENT_STRINGS.commentInput).toBe('Текст заметки');
    expect(CONTENT_STRINGS.save).toBe('Сохранить');
    expect(CONTENT_STRINGS.cancel).toBe('Отмена');
  });

  it('keeps every Russian string of the content layer in one module', () => {
    const offenders = shippedContentFiles()
      .filter((file) => toPosix(path.relative(ROOT, file)) !== 'src/content/text.ts')
      .filter((file) => /[А-Яа-яЁё]/.test(readFileSync(file, 'utf8')))
      .map((file) => toPosix(path.relative(ROOT, file)));
    expect(offenders).toEqual([]);
  });
});
