/**
 * Layer boundaries of the `t3-01` create-card slice.
 *
 * Proves:
 * - AC4 of `docs/specs/content-overlay-ui.md` for this task: the content layer owns
 *   no persistence of its own — the only shipped content modules that talk to the
 *   core write path, the core read path, the settings reader or the anchor builder are
 *   the one module per flow (`create/create-note.ts` for Flow 1-2, `editor/edit-entry.ts`
 *   for Flow 4-5, `paint/page-painter.ts` for the read behind the `paint pass` of Flow 7)
 *   plus
 *   `src/content/capture/selection-span.ts` for the anchor builder;
 * - the `t2-03` and `t3-01-settings-read` hand-over contracts: no page policy
 *   (`writeSlotThenIndex`, `readPageIndex`, `entrySlotValue`, `entryStorageKey`) and
 *   no settings internals (`SETTINGS_KEY`, `settingsValueOf`, `settingsFromStorageValue`,
 *   `saveSettings`, `generateAuthorName`) anywhere under `src/content`;
 * - ruling `A52` in the narrow sense the PM kept open: `assertCreatable` is not
 *   called from the page layer, because a preview built without `spans` would answer
 *   "allowed" and re-open the failure class `t2-03` remark 3 closed;
 * - ruling `A33` and `A47`: refusal wording is a total map in `src/content/text.ts`,
 *   the pinned sentences are exactly the ones the specs name, and no Russian string
 *   lives anywhere else in the shipped content layer;
 * - ruling `A114` (task `t7-01`), the half of that task's acceptance that is a **textual
 *   fact about shipped sources**: the word of the deleted cancel control appears in no
 *   module of `src/content/`, no module sets a tab index or intercepts `Tab`, and the
 *   icon-only `action row` stayed inside the page widgets — `src/popup/` and
 *   `src/options/` carry no inline glyph and keep their Russian words. The rendered half
 *   of the same acceptance lives in `tests/content-card-actions.spec.ts`. The popup's own
 *   icon-only delete control is **not** an exception to this pin but a later ruling on a
 *   different surface: task `t14-01` / ruling `A143` gave `src/popup/` one inline glyph of
 *   its own, and that pin now names the one file instead of asserting an empty list.
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
  it('asks core for a write in exactly two modules, one per write flow', () => {
    // `t3-03` widens this pin deliberately: Flow 5 of the overlay spec is a second
    // write flow, and a page-side editor that did not go through core would be a
    // second owner of the caps, the authorship rule and the write policy. The widening
    // is one module per flow, not a second module per flow. The two widget files in the
    // list name the module **for its result type only** — the `refusal line` of the
    // editor is keyed by that type — and the call-level pin below is the one with teeth.
    expect(contentFilesImporting('src/core/entry-store-write.ts')).toEqual([
      'src/content/create/create-note.ts',
      'src/content/editor/edit-entry.ts',
      'src/content/overlay/editor-controller.tsx',
      'src/content/overlay/editor.tsx',
    ]);
    expect(
      contentFilesMatching(/\b(createEntryOnPage|updateEntryComment|deleteEntry|setVisible|clearPage)\s*\(/),
    ).toEqual(['src/content/create/create-note.ts', 'src/content/editor/edit-entry.ts']);
  });

  it('asks core for a page read in one module per flow that needs the page', () => {
    // Task `t3-02` widens this pin for the paint pass (painting has to know which
    // entries the page holds), and `t3-03` widens it again for the edit path, which
    // reads the page only to hand the core overlap check the entry list it must scan.
    // Every reader goes through core `loadEntries`; `tests/content-page-painter.spec.ts`
    // pins that the paint pass performs no write, and
    // `tests/content-editor-controller.spec.ts` pins that a refused edit performs none.
    expect(contentFilesImporting('src/core/entry-store-read.ts')).toEqual([
      'src/content/create/create-note.ts',
      'src/content/editor/edit-entry.ts',
      'src/content/paint/page-painter.ts',
    ]);
  });

  it('reads the settings through core in exactly two modules, one per flow that needs them', () => {
    // Stage 17 (`t17-01`, ruling `A166`) widens this pin by one module, and by the same
    // rule the write pin above uses: one module per flow. The sync wiring has to know
    // **whether** synchronization is on and where the server is, and the only reader of
    // `settings:v1` is core `loadSettings` (`A31`) — so the pin names it rather than
    // letting the content layer decode the record a second time. A third importer is
    // still a failing test, and neither module writes the record: `saveSettings` is not
    // imported under `src/content/` at all, which the next case pins.
    expect(contentFilesImporting('src/core/settings-store.ts')).toEqual([
      'src/content/create/create-note.ts',
      'src/content/sync/sync-notes.ts',
    ]);
    // The address rule itself is core's and both modules of `src/content/sync/` read it:
    // the wiring to decide whether to ask, and the memory to answer `A161` ("whose note
    // is this?") for the rows the server returned. No third module names it.
    expect(contentFilesImporting('src/core/sync-settings.ts')).toEqual([
      'src/content/sync/foreign-notes.ts',
      'src/content/sync/sync-notes.ts',
    ]);
  });

  it('never imports the settings write, so the page cannot switch synchronization on itself', () => {
    expect(
      contentFilesMatching(/(saveSettings|settingsValueOf|settingsFromStorageValue)/),
    ).toEqual([]);
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
    // `assertCreatable` stays out of the page layer entirely: a preview built without
    // `spans` would answer "allowed". The overlap question is the one core rule the
    // page layer does ask — it has to, because the answer decides what the widget
    // shows — and it asks it through the core function, never through a local rule. So
    // the pin is "the core function, in the one module that has to ask it, and no
    // overlap rule of our own", which is the same shape `A52` describes for the create
    // path. The create path is not in the list because it never asks: it hands core the
    // `spans` and core answers inside `createEntryOnPage` (ruling `A46`). The edit path
    // is the single caller because core `updateEntryComment` takes no `spans` — a
    // comment edit has no span to check — so the moved-span half of the model spec's
    // "Overlap" rule is asked here, with the entry being edited removed from the list
    // the check scans.
    for (const pattern of [/assertCreatable/, /canCreateEntry/]) {
      expect(contentFilesMatching(pattern), pattern.source).toEqual([]);
    }
    expect(contentFilesMatching(/\bfindOverlappingEntry\s*\(/)).toEqual([
      'src/content/editor/edit-entry.ts',
    ]);
    for (const pattern of [/function findOverlap/, /const findOverlap/, /isOverlapping/]) {
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
      'src/content/anchor/entry-ranges.ts',
      'src/content/paint/paint-plan.ts',
    ]);
    for (const file of streamReusers) {
      const builds = (codeOnly(path.join(ROOT, file)).match(/\bbuildTextStream\(/g) ?? []).length;
      // At most one build per module (`A37`). `paint-plan.ts` is at the limit: one
      // stream for every anchor of the page. `entry-ranges.ts` is under it because it
      // takes the caller's stream as a parameter and so cannot build a second one —
      // the strictest form of the rule, and the reason the create path and the edit
      // path resolve stored entries against the same string they measured the
      // candidate on. The behavioural proof of the rebuild stays in
      // `tests/content-paint-plan.spec.ts` (the same-shape rewrite).
      expect(builds, file).toBeLessThanOrEqual(1);
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
    expect(CONTENT_STRINGS.delete).toBe('Удалить');
    // Ruling `A114`: a string of this module names a control that exists, and the cancel
    // control of both widgets is gone — so the word it used to print is gone with it,
    // and no new wording took its place.
    expect(Object.keys(CONTENT_STRINGS)).not.toContain('cancel');
    expect(Object.values(CONTENT_STRINGS)).not.toContain('Отмена');
  });

  it('keeps every Russian string of the content layer in one module', () => {
    const offenders = shippedContentFiles()
      .filter((file) => toPosix(path.relative(ROOT, file)) !== 'src/content/text.ts')
      .filter((file) => /[А-Яа-яЁё]/.test(readFileSync(file, 'utf8')))
      .map((file) => toPosix(path.relative(ROOT, file)));
    expect(offenders).toEqual([]);
  });

  it('keeps the word of the deleted cancel control out of the whole content layer (A114)', () => {
    // A control that is not rendered leaves no positive assertion behind, so the absence
    // is pinned where its label used to live: no shipped module of `src/content/` carries
    // the word — not in code, not in a comment. What a reader can press instead survives
    // in `tests/content-card-actions.spec.ts` and in the close-path pins of the two
    // controller files.
    const offenders = shippedContentFiles()
      .filter((file) => readFileSync(file, 'utf8').includes('Отмена'))
      .map((file) => toPosix(path.relative(ROOT, file)));
    expect(offenders).toEqual([]);
  });

  it('sets no tab index and intercepts no Tab key, in either widget (A114, t5-04 AC6, t6-02 AC5)', () => {
    // The compaction removed a control from the middle of the tab order. Ruling `A114`
    // forbids repairing that with a `tabindex` or with a key handler, so the tab order is
    // still the rendered order. Comments are stripped first: the prose of both widgets
    // says "no `tabindex`", and a prose sentence must not trip its own pin.
    expect(contentFilesMatching(/setAttribute\(\s*['"]tabindex/i)).toEqual([]);
    expect(contentFilesMatching(/\.tabIndex\s*=/)).toEqual([]);
    expect(contentFilesMatching(/key\s*===\s*['"]Tab['"]/)).toEqual([]);
  });

  it('kept the icon-only row inside the page widgets, and the extension words intact (A114; one popup glyph since A143, t14-01)', () => {
    // The popup and the options page were out of scope for `A114`: their buttons kept
    // their words, so an inline glyph or the shared glyph class appearing there was a
    // scope violation, not a style choice. Ruling `A143` (task `t14-01`) moved exactly one
    // control of `src/popup/` into the icon-only shape, so the popup half now names the
    // one file that carries the glyph instead of asserting an empty list — the pin is
    // narrowed to a fact, not deleted. `src/options/` keeps the empty list.
    const popupFiles = shippedContentFilesAt(path.join(ROOT, 'src', 'popup'));
    expect(popupFiles.length).toBeGreaterThan(0);
    expect(
      popupFiles
        .filter((file) => codeOnly(file).includes('<svg'))
        .map((file) => toPosix(path.relative(ROOT, file))),
    ).toEqual(['src/popup/popup.component.ts']);
    // The page widget's glyph class is still not reused by the popup: `S14-4` accepts a
    // second drawing, not a shared class borrowed across the layer boundary.
    expect(
      popupFiles
        .filter((file) => codeOnly(file).includes('CARD_ICON_CLASS'))
        .map((file) => toPosix(path.relative(ROOT, file))),
    ).toEqual([]);

    const optionsFiles = shippedContentFilesAt(path.join(ROOT, 'src', 'options'));
    expect(optionsFiles.length).toBeGreaterThan(0);
    expect(
      optionsFiles
        .filter((file) => codeOnly(file).includes('<svg'))
        .map((file) => toPosix(path.relative(ROOT, file))),
    ).toEqual([]);
    expect(
      optionsFiles
        .filter((file) => codeOnly(file).includes('CARD_ICON_CLASS'))
        .map((file) => toPosix(path.relative(ROOT, file))),
    ).toEqual([]);
    // The words themselves are still the words of those surfaces, pinned as literals so
    // this pin does not import a second layer into the content boundary file.
    const popupText = readFileSync(path.join(ROOT, 'src', 'popup', 'text.ts'), 'utf8');
    const optionsText = readFileSync(path.join(ROOT, 'src', 'options', 'text.ts'), 'utf8');
    expect(popupText).toContain("delete: 'Удалить'");
    expect(optionsText).toContain("save: 'Сохранить'");
  });
});
