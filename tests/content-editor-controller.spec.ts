// @vitest-environment jsdom
/**
 * The editor of an existing entry, driven through a real shadow host, a real paint
 * pass and an in-memory storage seam (task `t3-03` AC1-AC5; rulings `A25`, `A42`,
 * `A43`, `A44`, `A45`, `A68`, `A74`).
 *
 * The fixture is the shipped path, not a mock of it: the page is stored through core,
 * read and resolved by the real `paint pass` onto a recording `paint surface`, and the
 * controller is then handed exactly what `src/content/main.ts` hands it —
 * `painter.paintedEntries`. Only the seams a headless DOM cannot supply are injected:
 * the box seam, the viewport seam and the page-selection seam (jsdom has no user
 * selection). Everything else is the shipped module, so an editor that invented its
 * own idea of "which entry is this selection" or its own storage shape fails here.
 *
 * Pinned behaviour, per acceptance criterion:
 * - **AC1** — selecting the text of one's own painted entry opens the editor
 *   prefilled with the stored comment; selecting a foreign entry's text opens **no
 *   widget at all** and claims the selection, so no create card appears either; a
 *   selection that only crosses an entry's boundary is not a claim;
 * - **AC2** — `Сохранить` writes through core and nothing else: the stored record is
 *   read back through core `loadEntries`, `comment` and `updatedAt` move, `createdAt`
 *   and the `anchor` do not (ruling `A45`), and the port saw one slot write;
 * - **AC3** — `Отмена`, `Esc` and a `pointerdown` outside the overlay host are one
 *   cancel path, and the port received **no `set` and no `remove`** in any of them;
 *   a page scroll closes the editor (`A32`) while a `selectionchange` does **not**
 *   (`A45` would be unreachable otherwise); opening the editor moves no focus
 *   (`A74`);
 * - **AC4** — `Удалить` removes the entry at once, with no confirmation step
 *   (ruling `A44`), and the delete control is not rendered for a foreign entry
 *   (ruling `A25`);
 * - **AC5** — a `re-selection` inside the open editor that crosses another entry **of
 *   the current author** is refused with the `overlap` sentence, nothing is written, and
 *   the editor stays open with its draft; the entry being edited is excluded from the
 *   check by list exclusion, so it never collides with itself, and a crossing of a
 *   foreign entry's span saves, because the `overlap` rule is per author (`A93`, `A100`);
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
import { entryOwningSelection } from '../src/content/editor/painted-selection';
import { CONTENT_STRINGS, REFUSAL_TEXT } from '../src/content/text';
import { CARD_VIEWPORT_GUTTER_PX } from '../src/content/overlay/card-placement';
import type { Viewport } from '../src/content/overlay/card-placement';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
} from './support/memory-storage-port';

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
    paintedEntries: painter.paintedEntries,
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

/** Opens the editor over the own entry's words. */
function openOwn(fixture: Fixture): boolean {
  return fixture.editor.openFor(selection('p1', 4, 15), OWN_NAME);
}

describe('AC1: selecting an existing entry opens its editor, not a create card', () => {
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
    // The claim takes the overlay host, and the coordinator is told to dismiss the
    // tooltip (`A68`): a widget never turns off a host another widget is using.
    expect(overlay.host.hidden).toBe(false);
    expect(fixture.opened).toEqual(['opened']);
  });

  it('opens nothing and claims the selection for a foreign entry (AC1, AC4, A25)', async () => {
    const fixture = await boot();

    // `'fox jumps'` is the foreign entry's span.
    expect(fixture.editor.openFor(selection('p1', 16, 25), OWN_NAME)).toBe(true);
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

  it('does not claim a selection that only crosses the entry boundary', async () => {
    const fixture = await boot();

    // Starts before `'quick brown'` and ends inside it: the overlap rule owns this
    // state, and it answers it at the write where the reader sees the sentence.
    expect(fixture.editor.openFor(selection('p1', 0, 12), OWN_NAME)).toBe(false);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
  });

  it('claims nothing for a collapsed caret or for a stale entry', async () => {
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

    expect(fixture.editor.openFor(selection('p1', 4, 4), OWN_NAME)).toBe(false);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    // A stale entry is not painted, so its text is not claimable and a new note may be
    // written over it (ruling `A24`). The record is still stored.
    expect(fixture.surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6']);
    expect((await stored(port)).map((entry: Entry) => entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'cccccccccccc',
    ]);
  });

  it('answers the claim from the paint pass, not from a second resolve', async () => {
    const fixture = await boot();
    const painted = fixture.paintedEntries();
    expect(painted).toHaveLength(2);

    // The same node-local offsets the highlights were registered with answer the
    // question, which is what keeps the claim from offering to edit text that has no
    // highlight (overlay -> "The `selection claim`").
    expect(entryOwningSelection(painted, rangeIn(textOf('p1'), 6, 10))?.entry.id).toBe(
      'a1b2c3d4e5f6',
    );
    expect(entryOwningSelection(painted, rangeIn(textOf('p1'), 18, 22))?.entry.id).toBe(
      'b2c3d4e5f6a1',
    );
    // One boundary outside the span: the overlap rule owns that state, not the claim.
    expect(entryOwningSelection(painted, rangeIn(textOf('p1'), 0, 12))).toBeNull();
    expect(entryOwningSelection(painted, rangeIn(textOf('p1'), 4, 4))).toBeNull();
    // A span the paint pass does not hold answers nothing at all.
    expect(entryOwningSelection([], rangeIn(textOf('p1'), 4, 15))).toBeNull();
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

  it('moves no focus when it opens (A74)', async () => {
    const fixture = await boot();
    const pageButton = document.createElement('button');
    pageButton.id = 'page-control';
    document.body.append(pageButton);
    pageButton.focus();
    expect(document.activeElement).toBe(pageButton);

    openOwn(fixture);
    await settle(2);

    expect(document.activeElement).toBe(pageButton);
    expect(overlay.root.activeElement).toBeNull();
    // The controls are still reachable, in the order the shadow tree holds them.
    const controls = [fieldOf(overlay), ...buttonsOf(overlay)];
    for (const control of controls) {
      control.focus();
    }
    expect(overlay.root.activeElement).toBe(buttonsOf(overlay)[2] ?? null);
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

  it('opens no editor when the entry cannot be measured, and still claims the selection', async () => {
    // The page measured the entry in the paint pass and refuses the same fragment at the
    // press: `Range.setStart` rejects when the text node was replaced in between
    // (rulings `A64`, `A66`, `A75`).
    const switchable = switchableSeam();
    const fixture = await boot({ rangeFor: switchable.rangeFor });
    switchable.refuse();

    expect(fixture.editor.openFor(selection('p1', 4, 15), OWN_NAME)).toBe(true);
    expect(fixture.editor.isOpen()).toBe(false);
    expect(editorElementOf(overlay)).toBeNull();
    expect(overlay.host.hidden).toBe(true);
    expect(fixture.port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });

  it('is not painted at all when the page refused the fragment in the paint pass', async () => {
    // The other half of the same page state: an entry the page will not measure is
    // absent from the page (ruling `A66`), so there is nothing to claim and the create
    // card is free to open over those words.
    const fixture = await boot({ rangeFor: refusingSeam() });

    expect(fixture.surface.heldNames()).toEqual([]);
    expect(fixture.editor.openFor(selection('p1', 4, 15), OWN_NAME)).toBe(false);
    expect(fixture.editor.isOpen()).toBe(false);
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
    fixture.editor.openFor(selection('p1', 16, 25), OWN_NAME);
    await settle(2);

    expect(buttonsOf(overlay)).toEqual([]);
    // The core delete path itself has no author gate (`A25`): the absence of the
    // control above is the rule, and the editor is the only shipped caller.
    expect(fixture.editor.openEntryId()).toBeNull();
  });
});
