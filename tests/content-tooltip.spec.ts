// @vitest-environment jsdom
/**
 * The hover tooltip over painted text (task `t3-02` AC3, AC4, AC5; rulings `A66`,
 * `A67`, `A68`, `A70`).
 *
 * The fixture is the shipped path end to end: a stored page is read through core,
 * resolved against the real DOM and put on a recording paint surface by the real
 * paint pass, and the tooltip controller is then handed exactly what `main.ts` hands
 * it — `painter.paintedEntries` and `painter.authorNameOfPass`. Only two page reads
 * are injected, because a headless DOM has neither layout nor a caret API: the box
 * seam (the shipped `RangeForFragment` shape) and the caret seam.
 *
 * Pinned behaviour:
 * - AC3: the caret inside a painted fragment opens a card showing the stored
 *   `comment` and the author, and those strings exist nowhere in the page;
 * - AC3 of `t3-02` and AC1 of `t5-03` (ruling `A96`): the tooltip is opaque from the
 *   first hover — the stylesheet carries exactly one `opacity` declaration, the
 *   controller chooses no click class, and the number is pinned against the spec
 *   sentence the way the `settle delay` of `A63` is, together with the one
 *   `pointer-events` declaration AC8 of `t5-03` says did not change;
 * - AC1, AC2, AC3, AC9 of `t5-03`: a click hands the clicked `PaintedEntry` to the
 *   `onEntryClick` hook and does nothing else in this module — no `textarea`, no
 *   button, no storage write, no change to the painted names — and the tooltip stays
 *   standing, because the widget that opens is the one that dismisses it (`A68`) and a
 *   click that opens nothing has no right to take the card away;
 * - Flow 4 end to end (`t5-03` AC2, AC3): with a real editor controller mounted over the
 *   same host, the click on the `tooltip` of an own entry renders the editor widget in
 *   the shadow root, prefilled, and dismisses the tooltip (`A68`), while the click on a
 *   foreign entry renders nothing, writes nothing and leaves the tooltip standing
 *   (`A25`); the fixture wires the `A68` host-busy read the way `main.ts` does, which is
 *   what the first of those two cases caught on the way in;
 * - AC4: the header is `Вы` for the current reader and the stored author name for
 *   anybody else, and neither state offers an edit affordance in this task;
 * - `A40` / staleness: an entry that is not painted cannot be hovered, and hovering
 *   it answers nothing at all;
 * - `A67`: no fragment with an area means no tooltip, and the first fragment that has
 *   an area is the anchor;
 * - `A66`: a hover the page refuses to measure shows nothing and costs nothing;
 * - the anchor is measured at hover time, so a scroll that moved the text moves the
 *   tooltip rather than leaving it over the words it describes;
 * - `A68`: a widget does not hide a host the create card is using, and hovering never
 *   opens a create card.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import type { EntryAnchor } from '../src/core/entry';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { pageKeyFromUrl } from '../src/core/page-key';
import { saveSettings } from '../src/core/settings-store';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import { ensureOverlayHost } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import { createEditorController } from '../src/content/overlay/editor-controller';
import type { EditorController } from '../src/content/overlay/editor-controller';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PagePainter } from '../src/content/paint/page-painter';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import { createTooltipController } from '../src/content/overlay/tooltip-controller';
import type { TooltipController } from '../src/content/overlay/tooltip-controller';
import { attachTooltipEvents } from '../src/content/overlay/tooltip-events';
import { entryAtCaret, isOwnEntry, ownershipHeaderOf } from '../src/content/overlay/tooltip-hit-test';
import type { CaretAtPoint, CaretHit } from '../src/content/overlay/tooltip-hit-test';
import {
  TOOLTIP_CLASS,
  TOOLTIP_FOREIGN_CLASS,
  TOOLTIP_HEADER_CLASS,
  TOOLTIP_OPACITY,
  TOOLTIP_ROOT_CLASS,
  TOOLTIP_CSS,
} from '../src/content/overlay/tooltip-style';
import { CONTENT_STRINGS } from '../src/content/text';
import {
  CARD_CLASS,
  CARD_INPUT_CLASS,
  CARD_ROOT_CLASS,
  EDITOR_ROOT_CLASS,
} from '../src/content/overlay/card-style';
import type { Viewport } from '../src/content/overlay/card-placement';
import type { Entry } from '../src/core/entry';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
} from './support/memory-storage-port';
import type { PortCall } from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const PAGE_KEY = pageKeyFromUrl(PAGE_URL) ?? '';
const OWN_NAME = 'reader-one';
const FOREIGN_NAME = 'reader-two';
const OWN_COMMENT = 'the note I wrote here';
const FOREIGN_COMMENT = 'a note somebody else wrote';

/** Boxes far from the viewport gutter, so a placement answer is never an accident. */
const BOX_A: Box = { left: 10, top: 40, width: 120, height: 18 };
const BOX_B: Box = { left: 10, top: 80, width: 100, height: 18 };
const VIEWPORT: Viewport = { width: 800, height: 600 };
/** A positioned box with no area: a hidden or collapsed fragment (ruling `A65`). */
const COLLAPSED_BOX: Box = { left: 500, top: 400, width: 0, height: 0 };

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

function seedPage(port: MemoryStoragePort, records: readonly Record<string, unknown>[]): void {
  port.seed(entryStorageKey(PAGE_KEY), slotValue(records));
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
}

function recordFor(
  id: string,
  needle: string,
  overrides: Record<string, unknown> = {},
  fragments = 1,
): Record<string, unknown> {
  // `fragments` is the anchor's `fragmentCount`: a span that crosses a block
  // boundary is located as two `text fragment`s and must be stored as one.
  return storedEntry({
    id,
    text: needle,
    anchor: storedAnchorOf(needle, fragments),
    ...overrides,
  });
}

/** The two entry records of the fixture: one own, one foreign. */
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

/** A box seam whose answers a test can change between the paint and the hover. */
function mutableSeam(boxes: Box[] = [BOX_A, BOX_B]): {
  rangeFor: RangeForFragment;
  setBoxes: (next: Box[]) => void;
  callCount(): number;
} {
  let current: Box[] = [...boxes];
  let calls = 0;
  return {
    callCount: (): number => calls,
    setBoxes: (next: Box[]): void => {
      current = [...next];
      calls = 0;
    },
    rangeFor: (): { getBoundingClientRect: () => Box } => {
      const box = current[calls % current.length] ?? BOX_A;
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

let port: MemoryStoragePort;
let surface: RecordingSurface;
let seam: ReturnType<typeof mutableSeam>;
let caret: CaretHit | null;
let overlay: OverlayHost;
let painter: PagePainter;
let tooltip: TooltipController;
let hostBusy: boolean;
/** What the shipped Flow 4 hook was handed: the editor controller in `main.ts`. */
let clicks: PaintedEntry[];
/**
 * A real editor controller for the two cases that pin Flow 4 end to end, `null`
 * otherwise. The hook below consults it exactly the way `main.ts` does, so those two
 * cases read their answer out of the shadow root instead of out of a mock.
 */
let editor: EditorController | null;

/** The caret seam: one fixed answer, whatever the coordinates are. */
const caretAt: CaretAtPoint = () => caret;

/** Runs a real paint pass and wires the tooltip over it, as `main.ts` does. */
async function boot(options: {
  records?: Record<string, unknown>[];
  rangeFor?: RangeForFragment;
  name?: string | null;
} = {}): Promise<void> {
  if (options.name === undefined) {
    await saveSettings(port, { name: OWN_NAME });
  } else if (options.name !== null) {
    await saveSettings(port, { name: options.name });
  }
  seedPage(port, options.records ?? [ownRecord(), foreignRecord()]);
  const rangeFor = options.rangeFor ?? seam.rangeFor;
  painter = createPagePainter(document, {
    port,
    url: () => PAGE_URL,
    surface,
    rangeFor,
  });
  await painter.refresh();
  hostBusy = false;
  clicks = [];
  tooltip = createTooltipController(document, overlay, {
    paintedEntries: painter.paintedEntries,
    authorName: painter.authorNameOfPass,
    caretAt,
    rangeFor,
    viewport: () => VIEWPORT,
    // The `A68` coexistence read of `main.ts`: closing the tooltip does not hide a host
    // another widget is using, so a fixture that mounted an editor has to tell the
    // tooltip about it or the editor would stand in a hidden host.
    isHostBusy: (): boolean => hostBusy || (editor !== null && editor.isOpen()),
    onEntryClick: (entry): void => {
      clicks.push(entry);
      // The shipped Flow 4 hook of `src/content/main.ts`: the name is the pass's own,
      // and the entry is the `PaintedEntry` ruling `A104` opens the editor over. A
      // fixture that mounted no editor stops at the recording, which is what the
      // hand-over cases of this file assert on.
      if (editor !== null) {
        const authorName = painter.authorNameOfPass();
        if (authorName !== null) {
          editor.openFromPaintedEntry(entry, authorName);
        }
      }
    },
  });
}

/**
 * Mounts the second half of Flow 4 over the same host: the editor the tooltip click
 * opens. Its `onOpened` is the coordinator hand-over of `main.ts` (ruling `A68`), and
 * its widget slot is free, because no create card is part of these cases.
 */
function mountEditor(): void {
  editor = createEditorController(document, overlay, {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => '2024-03-01T10:00:00.000Z',
    rangeFor: seam.rangeFor,
    viewport: () => VIEWPORT,
    isHostBusy: () => false,
    onOpened: (): void => {
      tooltip.hide();
    },
  });
}

/** Storage writes that are not the fixture's own settings write. */
function entryWrites(): readonly PortCall[] {
  return port.calls.filter((call) => call.op !== 'get' && !call.keys.includes(SETTINGS_KEY));
}

/** The rendered tooltip element inside the shadow root, `null` when none is open. */
function tooltipElement(): Element | null {
  return overlay.root.querySelector(`.${TOOLTIP_CLASS}`);
}

function styleOf(): { left: number; top: number } {
  const wrapper = overlay.root.querySelector(`.${TOOLTIP_ROOT_CLASS}`);
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error('fixture has no tooltip wrapper');
  }
  return {
    left: Number.parseFloat(wrapper.style.left),
    top: Number.parseFloat(wrapper.style.top),
  };
}

function pointerMove(x: number, y: number): void {
  const event = new Event('pointermove');
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
  });
  document.dispatchEvent(event);
}

function pressOnPage(): void {
  document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function pressOnWidget(): void {
  overlay.host.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

beforeEach(async () => {
  document.body.innerHTML = ARTICLE;
  document.documentElement.querySelectorAll('[id^="inlinenotes-"]').forEach((node) => node.remove());
  port = new MemoryStoragePort();
  surface = new RecordingSurface();
  seam = mutableSeam();
  caret = { node: textOf('p1'), offset: 6 };
  hostBusy = false;
  editor = null;
  const host = ensureOverlayHost();
  if (host === null) {
    throw new Error('the fixture document is the top frame, so the host must exist');
  }
  overlay = host;
});

describe('the tooltip of painted text (AC3)', () => {
  it('shows the stored comment and author of the entry the caret is inside', async () => {
    await boot();
    expect(surface.heldNames()).toHaveLength(2);

    tooltip.hoverAt(20, 84);

    const card = tooltipElement();
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain(OWN_COMMENT);
    // The comment is not in the page at all, so the only way it can be on screen is
    // the entry record (task `t3-02` AC3).
    expect(document.body.textContent).not.toContain(OWN_COMMENT);
    expect(tooltip.openEntryId()).toBe('a1b2c3d4e5f6');
  });

  it('names the author of a foreign entry from the record, not from the page', async () => {
    await boot();
    caret = { node: textOf('p1'), offset: 20 };

    tooltip.hoverAt(20, 84);

    expect(tooltip.openEntryId()).toBe('b2c3d4e5f6a1');
    expect(tooltipElement()?.textContent).toContain(FOREIGN_COMMENT);
    expect(document.body.textContent).not.toContain(FOREIGN_COMMENT);
  });

  it('is opaque from the first hover, by the number the spec pins (t5-03 AC1, ruling A96)', async () => {
    expect(TOOLTIP_OPACITY).toBe(1);
    // One opacity rule in the stylesheet, and no click state to switch to: the
    // two-state design of the pre-`A96` tooltip is gone, class and number together.
    expect(TOOLTIP_CSS.match(/opacity: /g)).toHaveLength(1);
    expect(TOOLTIP_CSS).toContain(`opacity: ${String(TOOLTIP_OPACITY)};`);
    // `A23` is untouched by `A96`, and the second half of `t5-03` AC8 says so out loud:
    // the host stays `pointer-events: none` (`tests/content-overlay-host.spec.ts` pins
    // that half) and the tooltip undoes it for itself, which is the only reason the
    // click of Flow 4 can happen without the page noticing a hover it did not make.
    expect(TOOLTIP_CSS.match(/pointer-events:/g) ?? []).toHaveLength(1);
    expect(TOOLTIP_CSS).toContain('pointer-events: auto;');
    await boot();

    tooltip.hoverAt(20, 84);

    const hovered = tooltipElement();
    expect(hovered).not.toBeNull();
    expect(hovered?.classList.contains(TOOLTIP_CLASS)).toBe(true);
    expect(hovered?.className).toBe(TOOLTIP_CLASS);
  });

  it('opens nothing of its own on a click: no editor, no write, no repaint (t5-03 AC3)', async () => {
    await boot();
    const namesBefore = [...surface.heldNames()];

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    const root = overlay.root;
    expect(root.querySelector('textarea')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
    expect(entryWrites()).toEqual([]);
    expect([...surface.heldNames()]).toEqual(namesBefore);
    // The tooltip is dismissed by the widget that opens (`A68`), not by the click.
    expect(tooltip.isOpen()).toBe(true);
  });

  it('answers a caret outside every painted fragment with nothing', async () => {
    await boot();
    caret = { node: textOf('p1'), offset: 40 };

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    expect(tooltipElement()).toBeNull();
  });

  it('hides the tooltip when the caret moves off the painted text', async () => {
    await boot();
    tooltip.hoverAt(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    caret = null;
    tooltip.hoverAt(400, 400);

    expect(tooltip.isOpen()).toBe(false);
    expect(overlay.host.hidden).toBe(true);
  });

  it('never opens a create card while hovering painted text', async () => {
    await boot();
    attachTooltipEvents(tooltip, document, window, overlay.host);

    pointerMove(20, 84);

    expect(tooltip.isOpen()).toBe(true);
    expect(overlay.root.querySelector(`.${CARD_ROOT_CLASS}`)).toBeNull();
  });
});

describe('the click of the tooltip (task t5-03 AC2, AC3; ruling A96)', () => {
  it('hands the reader\u2019s own painted entry to the Flow 4 hook', async () => {
    await boot();

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    expect(clicks).toHaveLength(1);
    expect(clicks[0].entry.id).toBe('a1b2c3d4e5f6');
    expect(clicks[0].entry.comment).toBe(OWN_COMMENT);
  });

  it('hands over the entry of the paint pass itself, so the editor opens over that range (t5-03 AC2)', async () => {
    await boot();

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    // The very object the last pass produced: same fragments, same node-local offsets
    // the `::highlight()` rule was registered with. Ruling `A104` opens the editor over
    // this range, so no second resolve and no moved stored range are possible.
    const painted = painter.paintedEntries();
    expect(clicks[0]).toBe(painted[0]);
    expect(clicks[0].fragments).toBe(painted[0].fragments);
  });

  it('hands a foreign entry over as well: the author rule is the editor\u2019s answer, not this one', async () => {
    await boot();
    caret = { node: textOf('p1'), offset: 20 };

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    expect(clicks).toHaveLength(1);
    expect(clicks[0].entry.id).toBe('b2c3d4e5f6a1');
    expect(clicks[0].entry.authorName).toBe(FOREIGN_NAME);
  });

  it('asks nothing when no tooltip is open', async () => {
    await boot();

    tooltip.activate();
    caret = null;
    tooltip.hoverAt(400, 400);
    tooltip.activate();

    expect(tooltip.isOpen()).toBe(false);
    expect(clicks).toEqual([]);
  });

  it('keeps the hidden-entry and stale answers of the paint pass out of the click', async () => {
    // `A40`: an entry that is not painted has no tooltip, so it can never be the entry
    // a click hands over. The AC that owns that fact is `t5-03` AC2 together with ruling
    // `A104` — the click opens the `editor` over the entry the `paint pass` produced — and
    // `content-overlay-ui.md` AC16 keeps a hidden entry unpainted yet listed and deletable;
    // a hidden one is reachable again through its popup checkbox.
    // (`t5-03` AC8 is the other half of the tooltip: it still hides on a page scroll and on
    // a `pointerdown` outside the host — pinned in `the page wiring of the tooltip` below.)
    await boot({ records: [recordFor('a1b2c3d4e5f6', 'quick brown', { visible: false })] });

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    expect(tooltip.isOpen()).toBe(false);
    expect(clicks).toEqual([]);
  });
});

describe('Flow 4 end to end: the click opens the editor of the entry (t5-03 AC2, AC3)', () => {
  it('opens the editor over the range the pass painted, prefilled, and dismisses the tooltip (AC2, A104, A68)', async () => {
    await boot();
    mountEditor();
    const detach = attachTooltipEvents(tooltip, document, window, overlay.host);

    pointerMove(20, 84);
    expect(tooltip.openEntryId()).toBe('a1b2c3d4e5f6');

    pressOnWidget();

    // The answer is read out of the shadow root, not out of a mock: a `textarea` that
    // carries the stored comment, in the editor wrapper, and the editor's own three
    // buttons. The page held no selection at the click, which is the ordinary state of
    // Flow 4 (rulings `A96`, `A104`).
    expect(editor?.isOpen()).toBe(true);
    expect(overlay.root.querySelectorAll(`.${EDITOR_ROOT_CLASS} .${CARD_CLASS}`)).toHaveLength(1);
    // The editor's own subtree, because `comment` is a class the tooltip uses too and a
    // bare `.comment` here would answer with the tooltip paragraph.
    const field = overlay.root.querySelector(`.${EDITOR_ROOT_CLASS} .${CARD_INPUT_CLASS}`);
    expect(field instanceof HTMLTextAreaElement ? field.value : null).toBe(OWN_COMMENT);
    // The widget that opens owns the host: the coordinator dismisses the tooltip, and
    // the host stays visible for the editor (`A68`).
    expect(tooltipElement()).toBeNull();
    expect(overlay.host.hidden).toBe(false);
    detach();
  });

  it('opens nothing for a foreign entry: no editor, no message, and the tooltip stays (AC3, A25)', async () => {
    await boot();
    mountEditor();
    caret = { node: textOf('p1'), offset: 20 };
    const detach = attachTooltipEvents(tooltip, document, window, overlay.host);

    pointerMove(20, 84);
    expect(tooltip.openEntryId()).toBe('b2c3d4e5f6a1');

    pressOnWidget();

    // The click was asked, the author rule refused it, and the page shows nothing of
    // the refusal: no widget, no line, no write, and the tooltip the reader was
    // already reading is untouched (`A25`, `A68`).
    expect(editor?.isOpen()).toBe(false);
    // The wrapper element of the editor exists from the moment its controller is built,
    // exactly as the card wrapper does: what must be absent is the rendered widget.
    expect(overlay.root.querySelectorAll(`.${EDITOR_ROOT_CLASS} .${CARD_CLASS}`)).toHaveLength(0);
    expect(overlay.root.querySelectorAll(`.${EDITOR_ROOT_CLASS} .${CARD_INPUT_CLASS}`)).toHaveLength(
      0,
    );
    expect(entryWrites()).toEqual([]);
    expect(tooltip.isOpen()).toBe(true);
    expect(tooltipElement()).not.toBeNull();
    detach();
  });
});

describe('the ownership header (AC4)', () => {
  it('says `Вы` for an entry of the current reader', async () => {
    await boot();
    caret = { node: textOf('p1'), offset: 6 };

    tooltip.hoverAt(20, 84);

    const header = overlay.root.querySelector(`.${TOOLTIP_HEADER_CLASS}`);
    expect(header?.textContent).toBe(CONTENT_STRINGS.ownEntry);
    expect(header?.classList.contains(TOOLTIP_FOREIGN_CLASS)).toBe(false);
  });

  it('prints the stored author name for a foreign entry and offers no edit affordance', async () => {
    await boot();
    caret = { node: textOf('p1'), offset: 20 };

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    const header = overlay.root.querySelector(`.${TOOLTIP_HEADER_CLASS}`);
    expect(header?.textContent).toBe(FOREIGN_NAME);
    expect(header?.classList.contains(TOOLTIP_FOREIGN_CLASS)).toBe(true);
    expect(overlay.root.querySelector('textarea')).toBeNull();
    expect(overlay.root.querySelector('button')).toBeNull();
  });

  it('treats every entry as foreign when the settings name no reader', async () => {
    await boot({ name: null });

    tooltip.hoverAt(20, 84);

    expect(painter.authorNameOfPass()).toBeNull();
    expect(overlay.root.querySelector(`.${TOOLTIP_HEADER_CLASS}`)?.textContent).toBe(OWN_NAME);
    expect(
      overlay.root.querySelector(`.${TOOLTIP_HEADER_CLASS}.${TOOLTIP_FOREIGN_CLASS}`),
    ).not.toBeNull();
  });

  it('re-reads the ownership of the current pass, not of the entry', () => {
    const entry = entryOf('a1b2c3d4e5f6', OWN_NAME);
    expect(isOwnEntry(entry, OWN_NAME)).toBe(true);
    expect(isOwnEntry(entry, FOREIGN_NAME)).toBe(false);
    expect(isOwnEntry(entry, null)).toBe(false);
    expect(ownershipHeaderOf(entry, OWN_NAME)).toBe(CONTENT_STRINGS.ownEntry);
    expect(ownershipHeaderOf(entry, FOREIGN_NAME)).toBe(OWN_NAME);
  });
});

describe('what cannot be hovered (A40, staleness, A67, A66)', () => {
  it('shows nothing for a hidden entry, which is not painted at all', async () => {
    await boot({ records: [recordFor('a1b2c3d4e5f6', 'quick brown', { visible: false })] });
    expect(surface.heldNames()).toEqual([]);

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    expect(overlay.root.querySelector(`.${CARD_ROOT_CLASS}`)).toBeNull();
  });

  it('shows nothing for an entry the page lost, and keeps it stored', async () => {
    await boot({ records: [ownRecord()] });
    const paragraph = document.getElementById('p1');
    if (paragraph !== null) {
      paragraph.textContent = 'Nothing of the old sentence survives here.';
    }
    const outcome = await painter.refresh();
    caret = { node: textOf('p1'), offset: 6 };

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    // Stored, listed in the popup, deletable there — only the paint and the tooltip
    // are taken away (`inline-comment-model.md` -> Staleness).
    expect(outcome.painted).toEqual([]);
    expect(outcome.skipped.map((skip) => skip.entryId)).toEqual(['a1b2c3d4e5f6']);
  });

  it('shows no tooltip when no fragment of the entry has an area (A67)', async () => {
    await boot({ rangeFor: mutableSeam([COLLAPSED_BOX, COLLAPSED_BOX]).rangeFor });
    expect(surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6', 'inlinenotes-b2c3d4e5f6a1']);

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    expect(tooltipElement()).toBeNull();
    // The entry is not repaired, hidden or deleted by the hover: it is painted, stored
    // and still deletable from the popup.
    expect(painter.paintedEntries().map((painted) => painted.entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'b2c3d4e5f6a1',
    ]);
  });

  it('shows no tooltip when the page refuses to measure the entry (A66)', async () => {
    await boot({ rangeFor: refusingSeam() });

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    expect(entryWrites()).toEqual([]);
    expect(painter.paintedEntries()).toEqual([]);
  });
});

describe('where the tooltip is placed (A67, `A30` reuse)', () => {
  it('anchors to the first fragment box that has an area, not to a collapsed one', async () => {
    await boot({ records: [recordFor('a1b2c3d4e5f6', 'dog. Second', {}, 2)] });
    const first = painter.paintedEntries()[0].fragments[0];
    caret = { node: first.node, offset: first.start + 1 };
    seam.setBoxes([COLLAPSED_BOX, BOX_B]);

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(true);
    expect(styleOf()).toEqual({
      left: BOX_B.left,
      top: BOX_B.top + BOX_B.height + 8,
    });
  });

  it('measures the anchor at hover time, so moved text moves the tooltip', async () => {
    await boot();
    expect(seam.callCount()).toBeGreaterThan(0);

    seam.setBoxes([{ left: 300, top: 300, width: 90, height: 18 }]);
    tooltip.hoverAt(20, 84);

    expect(styleOf()).toEqual({ left: 300, top: 300 + 18 + 8 });
  });

  it('flips above its range when the viewport has no room below (Edge Cases)', async () => {
    await boot();
    seam.setBoxes([BOX_B]);
    const tight: Viewport = { width: 800, height: 100 };
    const inTight = createTooltipController(document, overlay, {
      paintedEntries: painter.paintedEntries,
      authorName: painter.authorNameOfPass,
      caretAt,
      rangeFor: seam.rangeFor,
      viewport: () => tight,
    });

    inTight.hoverAt(20, 84);

    const placed = styleOf();
    expect(inTight.isOpen()).toBe(true);
    // The card is 0 high in a headless DOM, so the honest half of the assertion is
    // "the top edge is not inside the painted rows"; the flip and the clamp
    // arithmetic themselves are pinned in `tests/content-card-placement.spec.ts`.
    expect(placed.top).toBeLessThanOrEqual(BOX_B.top);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });
});

describe('the tooltip and the page (AC2, A41, A68)', () => {
  it('adds nothing to the page document and no style element to it', async () => {
    await boot();
    const before = document.body.innerHTML;
    const pageStyles = document.querySelectorAll('style').length;

    tooltip.hoverAt(20, 84);
    tooltip.activate();

    // The page's own subtree, not the extension's host element, which the overlay
    // owns and shows and hides on purpose.
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelectorAll('style')).toHaveLength(pageStyles);
    expect(document.querySelector(`.${TOOLTIP_ROOT_CLASS}`)).toBeNull();
    expect(overlay.root.querySelector(`.${TOOLTIP_ROOT_CLASS}`)).not.toBeNull();
    expect(
      overlay.root.querySelectorAll('style[data-inlinenotes-tooltip-style]'),
    ).toHaveLength(1);
  });

  it('leaves the host visible when the create card still needs it (A68)', async () => {
    await boot();
    tooltip.hoverAt(20, 84);
    expect(overlay.host.hidden).toBe(false);

    hostBusy = true;
    tooltip.hoverAt(400, 400);

    expect(tooltip.isOpen()).toBe(false);
    expect(overlay.host.hidden).toBe(false);
  });

  it('opens nothing while the create card owns the host (A68)', async () => {
    await boot();
    hostBusy = true;

    tooltip.hoverAt(20, 84);

    expect(tooltip.isOpen()).toBe(false);
    expect(tooltipElement()).toBeNull();
  });
});

describe('the page wiring of the tooltip', () => {
  it('shows, asks for the editor and dismisses through browser events', async () => {
    await boot();
    const detach = attachTooltipEvents(tooltip, document, window, overlay.host);

    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    pressOnWidget();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].entry.id).toBe('a1b2c3d4e5f6');
    expect(tooltip.isOpen()).toBe(true);

    pressOnPage();
    expect(tooltip.isOpen()).toBe(false);

    detach();
    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(false);
  });

  it('keeps the tooltip when the pointer moves over the widget itself', async () => {
    await boot();
    attachTooltipEvents(tooltip, document, window, overlay.host);
    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    const move = new Event('pointermove', { bubbles: true });
    Object.defineProperties(move, { clientX: { value: 20 }, clientY: { value: 110 } });
    overlay.host.dispatchEvent(move);

    expect(tooltip.isOpen()).toBe(true);
    expect(tooltip.openEntryId()).toBe('a1b2c3d4e5f6');
  });

  it('hides on scroll and on Escape', async () => {
    await boot();
    attachTooltipEvents(tooltip, document, window, overlay.host);
    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    expect(tooltip.isOpen()).toBe(false);

    caret = { node: textOf('p1'), offset: 6 };
    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tooltip.isOpen()).toBe(false);
  });

  it('answers a coordinate-less pointer event with nothing', async () => {
    await boot();
    attachTooltipEvents(tooltip, document, window, overlay.host);
    pointerMove(20, 84);
    expect(tooltip.isOpen()).toBe(true);

    document.dispatchEvent(new Event('pointermove'));

    expect(tooltip.isOpen()).toBe(true);
  });
});

describe('the caret hit-test itself (AC3, AC5)', () => {
  it('takes a caret strictly inside a fragment, and tolerates its last boundary', async () => {
    await boot();
    const painted = painter.paintedEntries();
    const node = textOf('p1');

    expect(entryAtCaret(painted, { node, offset: 6 })?.entry.id).toBe('a1b2c3d4e5f6');
    expect(entryAtCaret(painted, { node, offset: 4 })?.entry.id).toBe('a1b2c3d4e5f6');
    expect(entryAtCaret(painted, { node, offset: 15 })?.entry.id).toBe('a1b2c3d4e5f6');
    expect(entryAtCaret(painted, { node, offset: 20 })?.entry.id).toBe('b2c3d4e5f6a1');
    expect(entryAtCaret(painted, { node, offset: 40 })).toBeNull();
    expect(entryAtCaret(painted, { node: textOf('p2'), offset: 3 })).toBeNull();
  });

  it('prefers the entry the caret is inside over one that only owns the boundary', async () => {
    await boot();
    const painted = painter.paintedEntries();
    // The caret at offset 15 is the closing edge of the first span; the second span
    // starts at 16, so no interior claim exists and the boundary answer wins.
    expect(entryAtCaret(painted, { node: textOf('p1'), offset: 15 })?.entry.id).toBe(
      'a1b2c3d4e5f6',
    );
    expect(entryAtCaret(painted, { node: textOf('p1'), offset: 16 })?.entry.id).toBe(
      'b2c3d4e5f6a1',
    );
  });
});

/** An entry record for the ownership rule, built without a page. */
function entryOf(id: string, authorName: string): Entry {
  return {
    id,
    pageKey: PAGE_KEY,
    authorName,
    text: 'quick brown',
    comment: OWN_COMMENT,
    anchor: { text: 'quick brown', prefix: 'The ', suffix: ' fox', fragmentCount: 1 },
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
    visible: true,
  };
}
