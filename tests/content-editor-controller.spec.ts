// @vitest-environment jsdom
/**
 * The editor of an existing entry, driven through a real shadow host, a real paint
 * pass and an in-memory storage seam (task `t3-03` AC1-AC5, the opening half of
 * task `t5-03` AC1, AC2, AC3, AC7, AC8, and the caret of task `t5-04` AC2, AC3, AC4;
 * rulings `A25`, `A42`, `A43`, `A44`, `A45`,
 * `A68`, `A96`, `A97`, `A104`, `A105`).
 *
 * The fixture is the shipped path, not a mock of it: the page is stored through core,
 * read and resolved by the real `paint pass` onto a recording `paint surface`, and a
 * test then does exactly what the Flow 4 hook of `src/content/main.ts` does — take the
 * `PaintedEntry` the pass produced and hand it to `openFromPaintedEntry` with the name
 * that pass read (ruling `A104`). Only the seams a headless DOM cannot supply are
 * injected: the box seam, the viewport seam and the page-selection seam (jsdom has no
 * user selection). Everything else is the shipped module, so an editor that resolves an
 * anchor of its own, invents its own idea of which entry to edit, or keeps its own
 * storage shape fails here.
 *
 * Pinned behaviour, per acceptance criterion:
 * - **AC1 of `t3-03` + AC1 of `t5-03`** — the click on an own entry's `tooltip` opens
 *   the editor prefilled with the stored comment, **with no page selection at all**;
 *   **AC2 of `t5-03`** — the same click on a foreign entry opens **no widget at all**,
 *   answers `false`, and writes nothing; **AC3 of `t5-03`** — the editor is never opened
 *   by a selection, and the only entry it can open is one the paint pass produced
 *   (**AC8**), including the entry that is not painted at all;
 * - **AC2** — `Сохранить` writes through core and nothing else: the stored record is
 *   read back through core `loadEntries`, `comment` and `updatedAt` move, `createdAt`
 *   and the `anchor` do not (ruling `A45`), and the port saw one slot write;
 * - **AC3** — `Отмена`, `Esc` and a `pointerdown` outside the overlay host are one
 *   cancel path, and the port received **no `set` and no `remove`** in any of them;
 *   a page scroll closes the editor (`A32`) while a `selectionchange` does **not**
 *   (`A45` would be unreachable otherwise); the `tooltip` click puts the caret in the
 *   note field (`A97`, `A105`) and the close hands it back to the page (`focus
 *   restore`);
 * - **AC4** — `Удалить` removes the entry at once, with no confirmation step
 *   (ruling `A44`), and the delete control is not rendered for a foreign entry
 *   (ruling `A25`);
 * - **AC5** — a `re-selection` inside the open editor that crosses another entry **of
 *   the current author** is refused with the `overlap` sentence, nothing is written, and
 *   the editor stays open with its draft; the entry being edited is excluded from the
 *   check by list exclusion, so it never collides with itself, and a crossing of a
 *   foreign entry's span saves, because the `overlap` rule is per author (`A93`, `A100`);
 * - **rulings `A106` and `A107`** — what a `re-selection` is, decided at the press from
 *   two states the open moment recorded: the baseline is the `PaintedEntry`'s own boundary
 *   points as the `paint pass` registered them (`A106`), and a page selection that was
 *   already there when the editor opened is never a `re-selection`, whatever it lies
 *   across (`A107`). Only a selection that appears or changes **while the editor stands**
 *   asks the own-author `overlap` question. The last block of this file pins all six
 *   states of that rule, including the one state where the pre-`A107` reading and the
 *   shipped one store different bytes;
 *
 * `A68` is pinned at the end: closing an editor leaves the overlay host visible while
 * another widget still needs it.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import { loadEntries } from '../src/core/entry-store-read';
import type { Entry, EntryAnchor } from '../src/core/entry';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { pageKeyFromUrl } from '../src/core/page-key';
import { settingsValueOf } from '../src/core/settings-store';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { CapturedSelection } from '../src/content/capture/page-selection';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import {
  CARD_ACTIONS_CLASS,
  CARD_CLASS,
  CARD_COUNTER_CLASS,
  CARD_DELETE_CLASS,
  CARD_INPUT_CLASS,
  CARD_REFUSAL_CLASS,
  CARD_STYLE_ATTRIBUTE,
  EDITOR_ROOT_CLASS,
  WIDGET_ROOT_CLASS,
} from '../src/content/overlay/card-style';
import { createEditorController } from '../src/content/overlay/editor-controller';
import type { EditorController } from '../src/content/overlay/editor-controller';
import { attachEditorEvents } from '../src/content/overlay/editor-events';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PagePainter } from '../src/content/paint/page-painter';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import { CONTENT_STRINGS, REFUSAL_TEXT } from '../src/content/text';
import { CARD_VIEWPORT_GUTTER_PX } from '../src/content/overlay/card-placement';
import type { Viewport } from '../src/content/overlay/card-placement';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
} from './support/memory-storage-port';
import type { FocusCallRecorder } from './support/focus-calls';
import { recordFocusCalls } from './support/focus-calls';

const PAGE_URL = 'https://example.test/article';
const PAGE_KEY = pageKeyFromUrl(PAGE_URL) ?? '';
const OWN_NAME = 'reader-one';
const FOREIGN_NAME = 'reader-two';
const OWN_COMMENT = 'the note I wrote here';
const FOREIGN_COMMENT = 'a note somebody else wrote';
const OPENED_AT = '2026-01-02T03:04:05.006Z';
const SAVED_AT = '2026-02-03T04:05:06.007Z';
const VIEWPORT: Viewport = { width: 800, height: 600 };

const BOX_A: Box = { left: 10, top: 120, width: 120, height: 18 };
const BOX_B: Box = { left: 10, top: 160, width: 100, height: 18 };
const COLLAPSED_BOX: Box = { left: 500, top: 400, width: 0, height: 0 };

/** `'The quick brown fox jumps over the lazy dog.'` */
const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '</article>',
].join('\n');

/** A surface that records names, because a headless DOM has no Highlight API. */
class RecordingSurface implements PaintSurface {
  private readonly held = new Map<string, readonly PaintedFragment[]>();

  paint(name: string, fragments: readonly PaintedFragment[]): void {
    if (fragments.length > 0) {
      this.held.set(name, fragments);
    }
  }

  clear(name: string): void {
    this.held.delete(name);
  }

  heldNames(): readonly string[] {
    return [...this.held.keys()];
  }
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

function rangeIn(node: Text, from: number, to: number): Range {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  return range;
}

function selection(id: string, from: number, to: number): CapturedSelection {
  return { range: rangeIn(textOf(id), from, to), root: document.body };
}

function storedAnchorOf(needle: string, fragments = 1): EntryAnchor {
  const stream = buildTextStream(document.body);
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw new Error('fixture needle is not in the stream');
  }
  const start = codePointOffsetAt(stream.text, utf16At);
  const anchor = buildAnchor(stream.text, start, start + codePointLength(needle), { fragments });
  if (anchor === null) {
    throw new Error('fixture anchor could not be built');
  }
  return anchor;
}

function recordFor(id: string, needle: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return storedEntry({
    id,
    pageKey: PAGE_KEY,
    text: needle,
    anchor: storedAnchorOf(needle),
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
    ...overrides,
  });
}

function ownRecord(): Record<string, unknown> {
  return recordFor('a1b2c3d4e5f6', 'quick brown', {
    authorName: OWN_NAME,
    comment: OWN_COMMENT,
  });
}

function foreignRecord(): Record<string, unknown> {
  return recordFor('b2c3d4e5f6a1', 'fox jumps', {
    authorName: FOREIGN_NAME,
    comment: FOREIGN_COMMENT,
  });
}

/**
 * A second entry of the **same** author on other words (`'lazy dog'`), so the AC5
 * overlap pin has something that is still a blocker after ruling `A93`.
 */
function ownSecondRecord(): Record<string, unknown> {
  return recordFor('c3d4e5f6a1b2', 'lazy dog', {
    authorName: OWN_NAME,
    comment: 'another note of mine',
  });
}

function seamOf(boxes: readonly Box[] = [BOX_A, BOX_B]): RangeForFragment {
  let calls = 0;
  return (): { getBoundingClientRect: () => Box } => {
    const box = boxes[calls % boxes.length] ?? BOX_A;
    calls += 1;
    return { getBoundingClientRect: () => box };
  };
}

/** A seam whose answer a test can turn into a throw between two moments. */
function switchableSeam(
  boxes: readonly Box[] = [BOX_A, BOX_B],
): { rangeFor: RangeForFragment; refuse: () => void } {
  let refusing = false;
  let calls = 0;
  return {
    refuse: (): void => {
      refusing = true;
    },
    rangeFor: (): { getBoundingClientRect: () => Box } => {
      if (refusing) {
        throw new DOMException('The offset is out of the range.', 'IndexSizeError');
      }
      const box = boxes[calls % boxes.length] ?? BOX_A;
      calls += 1;
      return { getBoundingClientRect: () => box };
    },
  };
}

/** A seam that refuses every fragment, as a replaced text node does. */
function refusingSeam(): RangeForFragment {
  return () => {
    throw new DOMException('The offset is out of the range.', 'IndexSizeError');
  };
}

interface Fixture {
  readonly port: MemoryStoragePort;
  readonly overlay: OverlayHost;
  readonly editor: EditorController;
  readonly surface: RecordingSurface;
  /** The entries the real paint pass put on the page. */
  paintedEntries: () => readonly PaintedEntry[];
  /** The author name that pass read — the name the shipped Flow 4 hook pairs with it. */
  authorNameOfPass: () => string | null;
  /** The page selection the controller reads at the save moment. */
  setPageSelection: (next: CapturedSelection | null) => void;
  /** A selection the page no longer contains: a detached node, not a stream node. */
  lostSelection: () => CapturedSelection;
  readonly opened: string[];
  readonly saved: Entry[];
  readonly deleted: string[];
}

interface BootOptions {
  records?: Record<string, unknown>[];
  name?: string | null;
  rangeFor?: RangeForFragment;
  isHostBusy?: () => boolean;
}

/** The default answer of the host-busy hook: no other widget holds the host. */
const NEVER_BUSY = (): boolean => false;

let port: MemoryStoragePort;
let overlay: OverlayHost;

/** A shadow root with no widget wrapper in it, so one boot owns one host. */
function freshHost(): OverlayHost {
  const stale = document.getElementById(OVERLAY_HOST_ID);
  if (stale !== null) {
    stale.remove();
  }
  const created = ensureOverlayHost();
  if (created === null) {
    throw new Error('fixture is not the top frame');
  }
  return created;
}

beforeEach(() => {
  document.body.innerHTML = ARTICLE;
  overlay = freshHost();
  port = new MemoryStoragePort();
});

/**
 * Boots the paint pass and the editor over it, exactly as `main.ts` wires them.
 *
 * The settings and the page are **seeded**, never written: a boot that called
 * `saveSettings` would leave a `set` in the port log, and the AC3 pin "the cancel path
 * attempted no write of any kind" has to be able to say that about every `set` the log
 * holds.
 */
async function boot(options: BootOptions = {}): Promise<Fixture> {
  overlay = freshHost();
  if (options.name !== null) {
    port.seed(SETTINGS_KEY, settingsValueOf(options.name ?? OWN_NAME));
  }
  port.seed(entryStorageKey(PAGE_KEY), slotValue(options.records ?? [ownRecord(), foreignRecord()]));
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));

  const surface = new RecordingSurface();
  const rangeFor = options.rangeFor ?? seamOf();
  const painter: PagePainter = createPagePainter(document, {
    port,
    url: () => PAGE_URL,
    surface,
    rangeFor,
  });
  await painter.refresh();

  const opened: string[] = [];
  const saved: Entry[] = [];
  const deleted: string[] = [];
  /** The selection of the page at the save moment: `null` means "no selection". */
  let pageSelection: CapturedSelection | null = null;

  const editor = createEditorController(document, overlay, {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => SAVED_AT,
    rangeFor,
    viewport: () => VIEWPORT,
    isHostBusy: options.isHostBusy ?? NEVER_BUSY,
    readSelection: () => pageSelection,
    onOpened: () => {
      opened.push('opened');
    },
    onSaved: (entry) => {
      saved.push(entry);
    },
    onDeleted: (entryId) => {
      deleted.push(entryId);
    },
  });

  attachEditorEvents(editor, document, window, overlay.host);

  return {
    port,
    overlay,
    editor,
    surface,
    opened,
    saved,
    deleted,
    paintedEntries: painter.paintedEntries,
    authorNameOfPass: painter.authorNameOfPass,
    setPageSelection: (next): void => {
      pageSelection = next;
    },
    lostSelection: (): CapturedSelection => {
      // A node the page does not have: the capture of Flow 2 still produces a
      // `Range`, and the save moment answers it with no span at all.
      const detached = document.createElement('span');
      detached.textContent = 'words that are not on the page';
      const range = document.createRange();
      range.setStart(detached.firstChild as Text, 0);
      range.setEnd(detached.firstChild as Text, 5);
      return { range, root: document.body };
    },
  };
}

/** Preact flushes on a microtask; the write chain awaits the port a few times. */
async function settle(rounds: number = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function editorElementOf(overlayHost: OverlayHost): Element | null {
  return overlayHost.root.querySelector(`.${EDITOR_ROOT_CLASS} .${CARD_CLASS}`);
}

function fieldOf(overlayHost: OverlayHost): HTMLTextAreaElement {
  const field = overlayHost.root.querySelector(`.${CARD_INPUT_CLASS}`);
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error('expected the editor textarea inside the shadow root');
  }
  return field;
}

function buttonsOf(overlayHost: OverlayHost): HTMLButtonElement[] {
  return [...overlayHost.root.querySelectorAll(`.${CARD_ACTIONS_CLASS} button`)].filter(
    (button: Element): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  );
}

function refusalLineOf(overlayHost: OverlayHost): string | null {
  const line = overlayHost.root.querySelector(`.${CARD_REFUSAL_CLASS}`);
  return line === null ? null : (line.textContent ?? '');
}

async function press(overlayHost: OverlayHost, label: string): Promise<void> {
  const button = buttonsOf(overlayHost).find(
    (candidate: HTMLButtonElement) => candidate.textContent === label,
  );
  if (button === undefined) {
    throw new Error(`no button labelled ${label} in the shadow root`);
  }
  button.click();
  await settle();
}

async function typeDraft(overlayHost: OverlayHost, comment: string): Promise<void> {
  const field = fieldOf(overlayHost);
  field.value = comment;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(2);
}

async function stored(portRef: MemoryStoragePort): Promise<Entry[]> {
  const page = await loadEntries(portRef, PAGE_URL);
  return page.entries;
}

/**
 * The Flow 4 click exactly as `src/content/main.ts` wires it: take the `PaintedEntry`
 * the last paint pass produced, pair it with the name that pass read, hand it over.
 * Ruling `A104` gives the editor its range this way, so the test cannot pass a range,
 * an anchor or a selection to it at all.
 */
function clickEntry(fixture: Fixture, entryId: string): boolean {
  const owner = fixture.paintedEntries().find(
    (painted: PaintedEntry) => painted.entry.id === entryId,
  );
  if (owner === undefined) {
    throw new Error(`the fixture paints no entry ${entryId}`);
  }
  const authorName = fixture.authorNameOfPass();
  if (authorName === null) {
    // The `settings gate` of the shipped wiring: with no usable name every entry of the
    // page is foreign to the reader, so the click asks for nothing (`A25`).
    return false;
  }
  return fixture.editor.openFromPaintedEntry(owner, authorName);
}

/** The click on the own entry's `tooltip`. */
function openOwn(fixture: Fixture): boolean {
  return clickEntry(fixture, 'a1b2c3d4e5f6');
}

describe('AC1: the tooltip click opens the editor of the entry, and nothing else does', () => {
  it('opens the editor prefilled with the stored comment for one own entry', async () => {
    const fixture = await boot();

    expect(openOwn(fixture)).toBe(true);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fixture.editor.openEntryId()).toBe('a1b2c3d4e5f6');
    expect(editorElementOf(overlay)).not.toBeNull();
    expect(fieldOf(overlay).value).toBe(OWN_COMMENT);
    expect(overlay.root.querySelector(`.${CARD_COUNTER_CLASS}`)?.textContent).toBe(
      `${String(OWN_COMMENT.length)}/256`,
    );
    // The editor is the card widget plus the delete control: one stylesheet, one
    // wrapper class, and the three actions in the rendered order the spec names.
    expect(overlay.root.querySelectorAll(`.${WIDGET_ROOT_CLASS}`)).toHaveLength(1);
    expect(overlay.root.querySelectorAll(`.${EDITOR_ROOT_CLASS}`)).toHaveLength(1);
    expect(overlay.root.querySelectorAll(`style[${CARD_STYLE_ATTRIBUTE}]`)).toHaveLength(1);
    expect(buttonsOf(overlay).map((button: HTMLButtonElement) => button.textContent)).toEqual([
      CONTENT_STRINGS.save,
      CONTENT_STRINGS.cancel,
      CONTENT_STRINGS.delete,
    ]);
    // The delete control is identifiable by class as well as by its Russian label, so
    // the warning style and a test can point at it without reading wording.
    const deleteButton = buttonsOf(overlay).find(
      (button: HTMLButtonElement) => button.textContent === CONTENT_STRINGS.delete,
    );
    expect(deleteButton?.classList.contains(CARD_DELETE_CLASS)).toBe(true);
    // The click takes the overlay host, and the coordinator is told to dismiss the
    // tooltip (`A68`): a widget never turns off a host another widget is using.
    expect(overlay.host.hidden).toBe(false);
    expect(fixture.opened).toEqual(['opened']);
  });

  it('opens with no page selection at all (t5-03 AC2, A104)', async () => {
    const fixture = await boot();
    fixture.setPageSelection(null);

    expect(openOwn(fixture)).toBe(true);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fieldOf(overlay).value).toBe(OWN_COMMENT);
    // The click of a page that holds no selection is the ordinary state of Flow 4, not
    // an edge case: the editor is opened by the click, the range it stands over is the
    // `resolved span` the paint pass registered, and a selection is one of the things a
    // reader may do afterwards (`A96`, `A104`). So the save that follows is the ordinary
    // comment-only write of ruling `A78`, and `anchor` is proof that no range moved.
    const before = (await stored(port))[0];
    await typeDraft(overlay, 'edited without selecting anything');
    await press(overlay, CONTENT_STRINGS.save);

    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe('edited without selecting anything');
    expect(edited?.anchor).toEqual(before?.anchor);
    expect(edited?.text).toBe(before?.text);
    expect(edited?.updatedAt).toBe(SAVED_AT);
    expect(fixture.editor.isOpen()).toBe(false);
  });

  it('opens nothing for a foreign entry, and asks for no create card either (t5-03 AC3, A25)', async () => {
    const fixture = await boot();

    // The reader clicked the `tooltip` of somebody else's note: the tooltip stays where
    // it is (the coordinator dismisses only a widget that opened), the editor does not
    // come, and a click is not a selection, so no create card is possible either.
    expect(clickEntry(fixture, 'b2c3d4e5f6a1')).toBe(false);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    expect(overlay.root.querySelectorAll(`.${CARD_INPUT_CLASS}`)).toHaveLength(0);
    // No write affordance of any kind: not a disabled button, not a label.
    for (const label of [CONTENT_STRINGS.save, CONTENT_STRINGS.delete]) {
      expect(overlay.root.textContent ?? '').not.toContain(label);
    }
    expect(overlay.host.hidden).toBe(true);
    expect(fixture.port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('is not openable through a selection at all (t5-03 AC7, A96)', async () => {
    const fixture = await boot();
    fixture.setPageSelection(selection('p1', 4, 15));

    // The route the pre-`A96` design opened the editor with is gone from the shipped
    // surface: the controller exposes no selection-shaped opening at all, so a selection
    // cannot reach it even by accident. The names are matched as a shape, not as a list
    // of retired identifiers, so the retired hand-over names are not revived here.
    const exposed = fixture.editor as unknown as Record<string, unknown>;
    const keys = Object.keys(exposed);
    expect(keys.filter((key: string) => key.startsWith('open')).sort()).toEqual([
      'openEntryId',
      'openFromPaintedEntry',
    ]);
    expect(keys.filter((key: string) => /claim|select/i.test(key))).toEqual([]);
    // The whole shipped surface of the editor controller, sorted: one opening, and it
    // is asked with the `PaintedEntry` of the last pass plus the name that pass read.
    expect(keys.sort()).toEqual([
      'close',
      'isOpen',
      'openEntryId',
      'openFromPaintedEntry',
      'remove',
      'submit',
    ]);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
  });

  it('refuses a second widget while an editor stands', async () => {
    const fixture = await boot();
    expect(openOwn(fixture)).toBe(true);

    // One editor at a time, whichever click asked for it: the second answer is `false`
    // and the first widget keeps its draft.
    await typeDraft(overlay, 'a draft');
    expect(openOwn(fixture)).toBe(false);
    expect(fieldOf(overlay).value).toBe('a draft');
  });

  it('opens nothing for an entry the paint pass does not hold (t5-03 AC3, AC9, A24, A66)', async () => {
    const staleRecord = storedEntry({
      id: 'cccccccccccc',
      pageKey: PAGE_KEY,
      authorName: OWN_NAME,
      text: 'words the page no longer has',
      comment: 'a note that went stale',
      anchor: { text: 'words the page no longer has', prefix: '', suffix: '', fragmentCount: 1 },
      createdAt: OPENED_AT,
      updatedAt: OPENED_AT,
    });
    const fixture = await boot({ records: [ownRecord(), staleRecord] });

    // A stale entry is not painted, so it has no tooltip and no click: its text is free
    // for a new note (ruling `A24`), and the record is still stored and deletable.
    expect(() => clickEntry(fixture, 'cccccccccccc')).toThrow(
      'the fixture paints no entry cccccccccccc',
    );
    expect(fixture.surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6']);
    expect((await stored(port)).map((entry: Entry) => entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'cccccccccccc',
    ]);
  });
});

describe('AC2: Сохранить writes through core and keeps the entry on its own span', () => {
  it('changes comment and updatedAt only, through one slot write', async () => {
    const fixture = await boot();
    openOwn(fixture);
    const before = (await stored(port))[0];
    if (before === undefined) {
      throw new Error('fixture entry is missing');
    }

    await typeDraft(overlay, 'an edited note');
    await press(overlay, CONTENT_STRINGS.save);

    const after = await stored(port);
    // The page still holds both records: a save of one entry neither adds nor removes.
    expect(after.map((entry: Entry) => entry.id)).toEqual(['a1b2c3d4e5f6', 'b2c3d4e5f6a1']);
    const entry = after.find((candidate: Entry) => candidate.id === 'a1b2c3d4e5f6');
    if (entry === undefined) {
      throw new Error('the edited entry is missing');
    }
    expect(entry.comment).toBe('an edited note');
    expect(entry.updatedAt).toBe(SAVED_AT);
    // `createdAt` and the authorship survive a save, and the span is untouched:
    // saving a comment is not a re-anchor (ruling `A45`).
    expect(entry.createdAt).toBe(before.createdAt);
    expect(entry.authorName).toBe(before.authorName);
    expect(entry.anchor).toEqual(before.anchor);
    expect(entry.text).toBe(before.text);
    expect(entry.id).toBe(before.id);

    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    expect(overlay.host.hidden).toBe(true);
    expect(fixture.saved.map((entry2: Entry) => entry2.id)).toEqual(['a1b2c3d4e5f6']);
    expect(fixture.deleted).toEqual([]);
    // One edit reaches the area as core's documented write order — the page slot, then
    // the index — and never as a removal: the edit path neither adds a record nor
    // removes one, and `remove` is the AC4 press only.
    expect(fixture.port.calls.filter((call) => call.op === 'remove')).toEqual([]);
    expect(
      fixture.port.calls
        .filter((call) => call.op === 'set')
        .map((call) => call.keys),
    ).toEqual([[entryStorageKey(PAGE_KEY)], [PAGE_INDEX_KEY]]);
  });

  it('keeps the visible flag and survives a save of the unchanged comment', async () => {
    const fixture = await boot();
    openOwn(fixture);

    await press(overlay, CONTENT_STRINGS.save);

    const after = await stored(port);
    expect(after[0]?.comment).toBe(OWN_COMMENT);
    expect(after[0]?.visible).toBe(true);
    expect(after[0]?.updatedAt).toBe(SAVED_AT);
  });

  it('answers a storage failure as a refusal line and keeps the draft', async () => {
    const fixture = await boot();
    openOwn(fixture);
    await typeDraft(overlay, 'will not land');
    fixture.port.failNextWrite('quota');

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.quota);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fieldOf(overlay).value).toBe('will not land');
    expect((await stored(port))[0]?.comment).toBe(OWN_COMMENT);
  });
});

describe('AC3: one cancel path, and no write in it', () => {
  it('writes nothing on Отмена, on Esc and on a pointerdown outside the host', async () => {
    for (const cancel of ['button', 'escape', 'outside'] as const) {
      const fixture = await boot();
      openOwn(fixture);
      await typeDraft(overlay, 'a draft that is discarded');
      expect(fixture.editor.isOpen()).toBe(true);

      if (cancel === 'button') {
        await press(overlay, CONTENT_STRINGS.cancel);
      } else if (cancel === 'escape') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle(2);
      } else {
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await settle(2);
      }

      // AC3 with its teeth: the port saw no write of either kind.
      expect(fixture.port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual(
        [],
      );
      expect((await stored(port))[0]?.comment).toBe(OWN_COMMENT);
      expect(fixture.editor.isOpen()).toBe(false);
      expect(editorElementOf(overlay)).toBeNull();
      expect(overlay.host.hidden).toBe(true);
      expect(fixture.saved).toEqual([]);
      expect(fixture.deleted).toEqual([]);
    }
  });

  it('ignores a pointerdown inside the overlay host', async () => {
    const fixture = await boot();
    openOwn(fixture);

    overlay.root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await settle(2);

    expect(fixture.editor.isOpen()).toBe(true);
  });

  it('closes on a page scroll and survives a selection change (A32 vs A45)', async () => {
    const fixture = await boot();
    openOwn(fixture);
    document.dispatchEvent(new Event('selectionchange'));
    await settle(2);
    // The re-selection rule is unreachable in a widget that closes on a selection
    // change, so this one event is deliberately not a cancel.
    expect(fixture.editor.isOpen()).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    await settle(2);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(fixture.port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('opens with the caret in the prefilled note field (A97, A105, t5-04 AC2)', async () => {
    const fixture = await boot();
    const pageButton = document.createElement('button');
    pageButton.id = 'page-control';
    document.body.append(pageButton);
    pageButton.focus();
    expect(document.activeElement).toBe(pageButton);

    openOwn(fixture);
    await settle(2);

    // This pin is the rewritten form of the `A74` pin "moves no focus when it opens":
    // the same fixture, the same page element focused first, the opposite expectation.
    // The click that prefilled the field also moved the caret into it, and the document
    // answers the host for a focus inside the shadow tree.
    expect(overlay.root.activeElement).toBe(fieldOf(overlay));
    expect(fieldOf(overlay).value).toBe(OWN_COMMENT);
    expect(document.activeElement).toBe(overlay.host);
    expect(document.activeElement).not.toBe(pageButton);
    // The controls are still reachable, in the order the shadow tree holds them.
    const controls = [fieldOf(overlay), ...buttonsOf(overlay)];
    for (const control of controls) {
      control.focus();
    }
    expect(overlay.root.activeElement).toBe(buttonsOf(overlay)[2] ?? null);

    // `focus restore` (`Assumption:` of ruling `A105`, t5-04 AC4): the close hands the
    // caret back to the page element that had it before the click.
    fixture.editor.close();
    await settle(2);
    expect(document.activeElement).toBe(pageButton);
  });

  it('is placed by the `card placement` rule, and by the viewport rule when nothing has an area', async () => {
    const withBox = await boot();
    openOwn(withBox);
    const wrapper = overlay.root.querySelector(`.${EDITOR_ROOT_CLASS}`);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error('expected the editor wrapper');
    }
    // The left edge is the anchor's, clamped out of the `card gutter`; the top edge is
    // below the first `text fragment` of the entry that has an area (ruling `A30`).
    expect(parseFloat(wrapper.style.left)).toBe(Math.max(CARD_VIEWPORT_GUTTER_PX, BOX_A.left));
    expect(parseFloat(wrapper.style.top)).toBeGreaterThan(BOX_A.top + BOX_A.height);

    const collapsed = await boot({ rangeFor: seamOf([COLLAPSED_BOX, COLLAPSED_BOX]) });
    openOwn(collapsed);
    const collapsedWrapper = overlay.root.querySelector(`.${EDITOR_ROOT_CLASS}`);
    if (!(collapsedWrapper instanceof HTMLElement)) {
      throw new Error('expected the editor wrapper of the collapsed fixture');
    }
    // Ruling `A65` applied to the editor: no anchor point is not a missing widget and
    // not the corner of the shadow host; the widget is pinned into the gutter.
    expect(collapsed.editor.isOpen()).toBe(true);
    expect(parseFloat(collapsedWrapper.style.left)).toBe(CARD_VIEWPORT_GUTTER_PX);
    expect(parseFloat(collapsedWrapper.style.top)).toBe(CARD_VIEWPORT_GUTTER_PX);
  });

  it('opens no editor when the page refuses the fragment of the clicked entry', async () => {
    // The page measured the entry in the paint pass and refuses the same fragment at the
    // click: `Range.setStart` rejects when the text node was replaced in between
    // (rulings `A64`, `A66`, `A75`).
    const switchable = switchableSeam();
    const fixture = await boot({ rangeFor: switchable.rangeFor });
    switchable.refuse();

    expect(clickEntry(fixture, 'a1b2c3d4e5f6')).toBe(false);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    expect(overlay.host.hidden).toBe(true);
    expect(fixture.port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('is not painted at all when the page refused the fragment in the paint pass', async () => {
    // The other half of the same page state: an entry the page will not measure is
    // absent from the page (ruling `A66`), so there is no tooltip to click and the
    // create card is free to open over those words.
    const fixture = await boot({ rangeFor: refusingSeam() });

    expect(fixture.surface.heldNames()).toEqual([]);
    expect(fixture.paintedEntries()).toEqual([]);
    expect(fixture.editor.isOpen()).toBe(false);
  });
});

describe('the caret of the editor and the way back to the page (t5-04 AC3, AC4, AC6)', () => {
  /**
   * The page control the reader had focused before the `tooltip` click. Every case of
   * this block focuses one first: `focus restore` is a promise **about that element**, so
   * a fixture in which nothing was focused cannot pin it. The control sits outside the
   * article, so it never changes the words the `paint pass` resolves.
   */
  function pageControl(id: string): HTMLElement {
    const control = document.createElement('button');
    control.id = id;
    control.textContent = 'Read more';
    document.body.append(control);
    control.focus();
    return control;
  }

  it('asks the note field for the caret with `preventScroll: true` (A105, t5-04 AC3)', async () => {
    const fixture = await boot();
    pageControl('page-before-click');
    // The option is the whole promise of `A105`: the host is `position: fixed`, so the
    // caret must not scroll the article. No test DOM shows a scroll, so the pin reads the
    // argument of the call, exactly as the `settle delay` is pinned as a constant.
    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      expect(openOwn(fixture)).toBe(true);
      await settle(2);

      const field = fieldOf(overlay);
      const fieldCalls = recorder.callsOn(field);
      expect(fieldCalls).toHaveLength(1);
      expect(fieldCalls[0]?.options).toEqual({ preventScroll: true });
      expect(overlay.root.activeElement).toBe(field);
      expect(document.activeElement).toBe(overlay.host);
    } finally {
      recorder.restore();
    }
  });

  it('hands the caret back on cancel, on Esc, on a successful save and on a delete (A105)', async () => {
    for (const [index, close] of ['cancel', 'esc', 'save', 'delete'].entries()) {
      const fixture = await boot();
      const control = pageControl(`page-cta-${String(index)}`);

      expect(openOwn(fixture)).toBe(true);
      await settle(2);
      expect(overlay.root.activeElement).toBe(fieldOf(overlay));

      if (close === 'cancel') {
        await press(overlay, CONTENT_STRINGS.cancel);
      } else if (close === 'esc') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle(2);
      } else if (close === 'save') {
        await typeDraft(overlay, 'an edit that lands');
        await press(overlay, CONTENT_STRINGS.save);
      } else {
        await press(overlay, CONTENT_STRINGS.delete);
      }

      expect(fixture.editor.isOpen()).toBe(false);
      expect(overlay.host.hidden).toBe(true);
      // `focus restore` (the `Assumption:` half of ruling `A105`): the widget is gone and
      // the page control answers the document again.
      expect(document.activeElement).toBe(control);
      expect(overlay.root.activeElement).toBeNull();
    }
  });

  it('forces nothing when the page control the click took the caret from is gone', async () => {
    const fixture = await boot();
    const control = pageControl('page-removed');
    expect(openOwn(fixture)).toBe(true);
    await settle(2);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      // The page removed the control while the editor stood — a single-page app that
      // re-rendered the reading pane is the normal way this happens.
      control.remove();
      await press(overlay, CONTENT_STRINGS.cancel);

      expect(fixture.editor.isOpen()).toBe(false);
      expect(overlay.root.activeElement).toBeNull();
      // Nothing was forced: the close called focus on neither the removed control, nor
      // the shadow host, nor `body`, nor the root element. What the document answers
      // afterwards is the browser's own default for an emptied shadow tree, not a focus
      // this extension invented.
      expect(document.activeElement).not.toBe(control);
      expect(document.activeElement).not.toBe(overlay.host);
      expect(document.activeElement).not.toBe(document.documentElement);
      // The recorder was already running when the close ran, so an empty log is the
      // statement "this close focused nothing at all" — no `body`, no `documentElement`,
      // no shadow host, no detached control.
      expect(recorder.calls()).toEqual([]);
    } finally {
      recorder.restore();
    }
  });

  it('still renders no `tabindex`, and the four controls keep the rendered order (t5-04 AC6)', async () => {
    const fixture = await boot();
    expect(openOwn(fixture)).toBe(true);
    await settle(2);

    // What ruling `A97` did **not** do: no control gained a `tabindex`, so the tab order
    // is still the rendered order of the shadow tree — note field, then the three actions
    // in the order the stylesheet names them.
    const order = [
      ...overlay.root.querySelectorAll('textarea, button, input, select, a[href], [tabindex]'),
    ];
    expect(order).toHaveLength(4);
    expect(order[0]).toBe(fieldOf(overlay));
    expect(order.map((element: Element) => element.tagName)).toEqual([
      'TEXTAREA',
      'BUTTON',
      'BUTTON',
      'BUTTON',
    ]);
    expect(order.map((element: Element) => element.textContent ?? '')).toEqual([
      '',
      CONTENT_STRINGS.save,
      CONTENT_STRINGS.cancel,
      CONTENT_STRINGS.delete,
    ]);
    expect(overlay.root.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(overlay.host.getAttribute('tabindex')).toBeNull();

    for (const element of order) {
      expect(element.getAttribute('tabindex')).toBeNull();
      (element as HTMLElement).focus();
      expect(overlay.root.activeElement).toBe(element);
      expect(document.activeElement).toBe(overlay.host);
    }
  });
});

describe('AC4: Удалить removes the entry and its paint at once', () => {
  it('deletes with one press, no confirmation and no undo step', async () => {
    const fixture = await boot();
    openOwn(fixture);
    expect(fixture.surface.heldNames()).toContain('inlinenotes-a1b2c3d4e5f6');

    await press(overlay, CONTENT_STRINGS.delete);

    const after = await stored(port);
    // The own entry is gone and the foreign one is untouched: the delete removed exactly
    // one record, and no confirmation step stood between the press and the write.
    expect(after.map((entry: Entry) => entry.id)).toEqual(['b2c3d4e5f6a1']);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    expect(fixture.deleted).toEqual(['a1b2c3d4e5f6']);
    expect(fixture.saved).toEqual([]);
    expect(overlay.host.hidden).toBe(true);
  });

  it('shows a refusal line when the removal is refused, and keeps the editor open', async () => {
    const fixture = await boot();
    openOwn(fixture);
    fixture.port.failNextWrite('quota');

    await press(overlay, CONTENT_STRINGS.delete);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.quota);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fixture.deleted).toEqual([]);
    expect((await stored(port))[0]?.id).toBe('a1b2c3d4e5f6');
  });
});

describe('AC5: a re-selection inside the editor answers the overlap rule, with the edited entry excluded', () => {
  it('refuses a move onto another entry of the current author with the overlap sentence and writes nothing', async () => {
    const fixture = await boot({ records: [ownRecord(), ownSecondRecord(), foreignRecord()] });
    openOwn(fixture);
    await typeDraft(overlay, 'moved onto my own other note');
    // `'lazy dog'` is the span of a second entry **of the same author**. `'fox jumps'`
    // belongs to the foreign entry and stopped being a blocker (rulings `A93`, `A100`);
    // the pin below is the one that keeps the own half refused.
    fixture.setPageSelection(selection('p1', 35, 43));

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.overlap);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fieldOf(overlay).value).toBe('moved onto my own other note');
    expect(fixture.port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual(
      [],
    );
    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe(OWN_COMMENT);
    expect(edited?.anchor).toEqual(storedAnchorOf('quick brown'));
  });

  it('lets a move onto the span of a foreign entry save the comment, because the overlap rule is per author (A93, A100)', async () => {
    const fixture = await boot();
    openOwn(fixture);
    await typeDraft(overlay, 'moved onto foreign text');
    // `'fox jumps'` is the foreign entry's span: the re-selection answers `overlap`
    // only against entries the author identity rule accepts (`A99`), so this saves.
    fixture.setPageSelection(selection('p1', 16, 25));

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    expect(fixture.editor.isOpen()).toBe(false);
    const after = await stored(port);
    expect(after).toHaveLength(2);
    expect(after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6')?.comment).toBe(
      'moved onto foreign text',
    );
    // The foreign entry is untouched: a move over its words neither rewrites nor
    // removes it, and it stays read-only (`A25`).
    const foreign = after.find((entry: Entry) => entry.id === 'b2c3d4e5f6a1');
    expect(foreign?.comment).toBe(FOREIGN_COMMENT);
    expect(foreign?.anchor).toEqual(storedAnchorOf('fox jumps'));
  });

  it('never collides with itself: a re-selection of the same span is a plain save (A45)', async () => {
    const fixture = await boot();
    openOwn(fixture);
    await typeDraft(overlay, 'same span, new comment');
    // A re-selection with *different* boundary points that resolves to the entry's own
    // span: the entry is excluded from the list the core check scans, so the only
    // candidate range in the comparison is its own.
    fixture.setPageSelection(selection('p1', 5, 14));

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    const after = await stored(port);
    expect(after[0]?.comment).toBe('same span, new comment');
  });

  it('writes comment and updatedAt for a re-selection of a free span, and keeps the anchor', async () => {
    // The narrow half of ruling `A78`, recorded in
    // `docs/specs/content-overlay-ui.md` -> "Ruling `A78`: what a successful
    // `re-selection` stores": core `updateEntryComment` keeps `anchor` and `text`
    // (accepted in `t1-05`), so a valid re-selection changes the `overlap` answer and
    // nothing else. Pinned here rather than decided here: the alternative — a core write
    // that carries an anchor — is a `src/core/` change that re-opens the `text`/`anchor`
    // consistency rule accepted in `t1-06`, and overturning the ruling changes that write
    // plus this pin, never the content layer on its own.
    const fixture = await boot();
    openOwn(fixture);
    const before = (await stored(port))[0];
    fixture.setPageSelection(selection('p2', 0, 6));

    await press(overlay, CONTENT_STRINGS.save);

    const after = await stored(port);
    expect(refusalLineOf(overlay)).toBeNull();
    expect(after[0]?.comment).toBe(OWN_COMMENT);
    expect(after[0]?.anchor).toEqual(before?.anchor);
    expect(after[0]?.text).toBe(before?.text);
    expect(after[0]?.updatedAt).toBe(SAVED_AT);
  });

  it('answers a re-selection the page no longer has with selection_lost, and writes nothing', async () => {
    const fixture = await boot();
    openOwn(fixture);
    await typeDraft(overlay, 'a draft that survives the lost selection');
    // A `Range` the page cannot resolve: the save moment builds its own stream and the
    // re-selection touches no fragment of it (ruling `A37` forbids reusing the numbers
    // of the open moment). The answer is the content-layer one, not `entry_invalid`.
    fixture.setPageSelection(fixture.lostSelection());

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.selection_lost);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fieldOf(overlay).value).toBe('a draft that survives the lost selection');
    expect(fixture.port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual(
      [],
    );
    expect((await stored(port))[0]?.comment).toBe(OWN_COMMENT);
  });

  it('leaves a foreign entry out of reach, so no delete is possible through the editor', async () => {
    const fixture = await boot();
    clickEntry(fixture, 'b2c3d4e5f6a1');
    await settle(2);

    expect(buttonsOf(overlay)).toEqual([]);
    // The core delete path itself has no author gate (`A25`): the absence of the
    // control above is the rule, and the editor is the only shipped caller.
    expect(fixture.editor.openEntryId()).toBeNull();
  });
});

/**
 * Rulings `A106` and `A107`: what counts as a `re-selection`, and what does not.
 *
 * The baseline the editor keeps is the boundary points of the `PaintedEntry` its
 * `tooltip` click opened, exactly as the `paint pass` registered them (`A106`) — never
 * "whatever selection the page happened to hold". On top of that, `A107` decides the half
 * `A106` had stated as an outcome: a page selection that was **already present at the open
 * moment** is not a `re-selection` at all, whichever words it lies across, because the
 * tooltip click carries no selection semantics (`A104`) and a selection the reader did not
 * make during the editing session must not decide whether the save is refused.
 *
 * The fixture keeps the page selection in a seam the test moves by hand: setting it before
 * `openOwn` is "the page already held this when the click came", setting it afterwards is
 * "a selection that appeared or changed while the editor stood". One test — the second —
 * is the only state in which the pre-`A107` reading and the shipped reading store
 * different bytes, and it is named for that.
 */
describe('Rulings `A106` + `A107`: the painted span is the baseline, and the selection the click found never is', () => {
  /** The three records every case below boots with: the edited note, my other note,
   *  somebody else's note. `'lazy dog'` is mine, `'fox jumps'` is not. */
  const THREE_RECORDS = (): Record<string, unknown>[] => [
    ownRecord(),
    ownSecondRecord(),
    foreignRecord(),
  ];

  /** `'Second'` — words that hold no entry of anyone. */
  const freeWordsAtClick = (): CapturedSelection => selection('p2', 0, 6);
  /** `'lazy dog'` — the span of a second note **of my own** (`A100` blocker). */
  const myOtherNote = (): CapturedSelection => selection('p1', 35, 43);
  /** `'quick brown'` — the edited note's own `resolved span`, point for point. */
  const ownNotePoints = (): CapturedSelection => selection('p1', 4, 15);

  it('A107: the click found other words on the page, and a press with no new selection saves comment and updatedAt only (A106, A78)', async () => {
    const fixture = await boot({ records: THREE_RECORDS() });
    const before = (await stored(port))[0];
    // A selection the reader made before the click and has not touched since.
    fixture.setPageSelection(freeWordsAtClick());

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'edited while the page held an old selection');
    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    expect(fixture.editor.isOpen()).toBe(false);
    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe('edited while the page held an old selection');
    expect(edited?.anchor).toEqual(before?.anchor);
    expect(edited?.text).toBe(before?.text);
    expect(edited?.createdAt).toBe(before?.createdAt);
    expect(edited?.updatedAt).toBe(SAVED_AT);
  });

  it('A107 is what separates the readings: the click found a selection lying across my own other note, and the save still lands with no refusal line (A100, A45)', async () => {
    // The state the two baselines disagreed on. With a painted-span baseline alone, this
    // unchanged selection is a difference from the note's own span, so the own-author
    // `overlap` check runs and the press is refused with «Выделение пересекается с
    // существующей записью» for a selection the reader never made in this session. With
    // ruling `A107` the open moment records the selection, the press finds it unmoved, and
    // no overlap question is asked at all. Different stored bytes either way, so this pin
    // is the one that stops the baseline from drifting back.
    const fixture = await boot({ records: THREE_RECORDS() });
    const before = (await stored(port))[0];
    fixture.setPageSelection(myOtherNote());

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'edited over a selection the page already held');
    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    expect(fixture.editor.isOpen()).toBe(false);
    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe('edited over a selection the page already held');
    expect(edited?.anchor).toEqual(before?.anchor);
    expect(edited?.text).toBe(before?.text);
    expect(edited?.updatedAt).toBe(SAVED_AT);
    // The note the stale selection lay across is byte-identical: the save touched one
    // record's comment and nothing else.
    const other = after.find((entry: Entry) => entry.id === 'c3d4e5f6a1b2');
    expect(other?.comment).toBe('another note of mine');
    expect(other?.updatedAt).toBe(OPENED_AT);
    expect(other?.anchor).toEqual(storedAnchorOf('lazy dog'));
  });

  it('A107: the same editor with a NEW selection across my own other note asks the own-author overlap question and is refused (A45, A100)', async () => {
    const fixture = await boot({ records: THREE_RECORDS() });
    fixture.setPageSelection(freeWordsAtClick());

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'moved onto my own other note');
    // The selection moves **while the editor stands**: that is a re-selection, and the
    // span it names is the one the per-author `overlap` rule answers for.
    fixture.setPageSelection(myOtherNote());

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.overlap);
    expect(fixture.editor.isOpen()).toBe(true);
    expect(fieldOf(overlay).value).toBe('moved onto my own other note');
    expect(fixture.port.calls.filter((call) => call.op === 'set' || call.op === 'remove')).toEqual(
      [],
    );
    const after = await stored(port);
    expect(after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6')?.comment).toBe(OWN_COMMENT);
  });

  it('A107 positive half: no selection at the open moment, a later selection over free words asks the question and the save lands (A78)', async () => {
    const fixture = await boot({ records: THREE_RECORDS() });
    const before = (await stored(port))[0];
    fixture.setPageSelection(null);

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'a new selection over unclaimed words');
    // `'paragraph'` holds no entry of anyone: the question is asked and its answer is
    // free, which is the pair of the case below — same fixture, other words, refused.
    fixture.setPageSelection(selection('p2', 7, 16));

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe('a new selection over unclaimed words');
    // A successful `re-selection` moves nothing (ruling `A78`): the `anchor` and `text`
    // keep the span the note was created on, and moving a note stays a delete plus a
    // create.
    expect(edited?.anchor).toEqual(before?.anchor);
    expect(edited?.text).toBe(before?.text);
    expect(edited?.updatedAt).toBe(SAVED_AT);
  });

  it('A107 positive half, other answer: no selection at the open moment, a later selection across my own other note is refused (A45, A100)', async () => {
    const fixture = await boot({ records: THREE_RECORDS() });
    fixture.setPageSelection(null);

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'a new selection over my own other note');
    fixture.setPageSelection(myOtherNote());

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBe(REFUSAL_TEXT.overlap);
    expect(fixture.editor.isOpen()).toBe(true);
    expect((await stored(port)).find((entry: Entry) => entry.id === 'a1b2c3d4e5f6')?.comment).toBe(
      OWN_COMMENT,
    );
  });

  it('A106 half: re-selecting the note’s own painted points is not a re-selection, so the save is a plain comment edit (A103, A104)', async () => {
    const fixture = await boot({ records: THREE_RECORDS() });
    const before = (await stored(port))[0];
    fixture.setPageSelection(null);

    expect(openOwn(fixture)).toBe(true);
    await typeDraft(overlay, 'I selected the note’s own words again');
    // Point for point the span the pass registered for this entry. Ruling `A103` opened no
    // card for that selection, and ruling `A106` makes it the note's own words rather than
    // a move — so no `overlap` question is asked about the neighbouring note at all.
    fixture.setPageSelection(ownNotePoints());

    await press(overlay, CONTENT_STRINGS.save);

    expect(refusalLineOf(overlay)).toBeNull();
    const after = await stored(port);
    const edited = after.find((entry: Entry) => entry.id === 'a1b2c3d4e5f6');
    expect(edited?.comment).toBe('I selected the note’s own words again');
    expect(edited?.anchor).toEqual(before?.anchor);
    expect(edited?.text).toBe(before?.text);
    expect(after.find((entry: Entry) => entry.id === 'c3d4e5f6a1b2')?.comment).toBe(
      'another note of mine',
    );
  });
});
