// @vitest-environment jsdom
/**
 * The load-time paint pass in situ: a stored page in, painted names out (task `t3-02`
 * AC1, AC2, AC5; rulings `A29`, `A38`, `A39`, `A40`, `A66`, `A68`, `A70`).
 *
 * The page side is faked in exactly one place — the `PaintSurface`, because jsdom has
 * no CSS Highlight API — and everything else is the shipped path: the entries come
 * from the hand-written `MemoryStoragePort` through core `loadEntries`, the anchors
 * are resolved by core against a stream of the real jsdom tree, the measurement goes
 * through the same box-only seam the create card uses, and the paint rules are written
 * by the real owner of `paint-style.ts`.
 *
 * Pinned behaviour:
 * - AC1: one stored visible entry becomes one named highlight of the whole span, and
 *   a hidden or unresolvable entry becomes none (rulings `A40`, `A24`);
 * - AC2: the page DOM is byte-identical after a pass. The paint path adds no element,
 *   no attribute and no text node, and it does not even create the overlay host — the
 *   stylesheet it needs is an adopted one, not a `<style>` (ruling `A41`);
 * - AC5: a second pass over an unchanged page registers each name once again and keeps
 *   exactly one set of ranges per entry, and a pass over a changed page removes the
 *   name it no longer needs (ruling `A39`). The removal stops at the extension's own
 *   prefix: `CSS.highlights` is document-global, so a page script's names survive;
 * - `A66`: one entry the page will not measure loses its own highlight, keeps the
 *   others, and the pass still performs no storage write;
 * - `A68`: closing the create card hides the shadow host and changes nothing about the
 *   painted text. Card visibility and paint visibility are separate decisions, and the
 *   pass is the only owner of the map. The card in that test is opened through an
 *   injected box seam, because a headless DOM gives a real `Range` no layout at all:
 *   without the seam the measurement throws, ruling `A64` answers with no card, and
 *   the property would be asserted over a card that never opened;
 * - a core read that could not read the page (`storage_unavailable` on the index) is
 *   answered with an empty pass and a teardown: the highlights of the previous pass do
 *   not survive as data older than this pass.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import type { EntryAnchor } from '../src/core/entry';
import { loadEntries } from '../src/core/entry-store-read';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { pageKeyFromUrl } from '../src/core/page-key';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { saveSettings } from '../src/core/settings-store';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import { OVERLAY_HOST_ID, ensureOverlayHost } from '../src/content/overlay/host';
import { createCreateCardController } from '../src/content/overlay/create-card-controller';
import { paintStyleOwnerOf } from '../src/content/paint/paint-style';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PagePainter } from '../src/content/paint/page-painter';
import type { PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import type { Entry } from '../src/core/entry';
import {
  MemoryStoragePort,
  indexValue,
  slotValue,
  storedEntry,
} from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const PAGE_KEY = pageKeyFromUrl(PAGE_URL) ?? '';
const AUTHOR = 'reader-one';
const BOX_A: Box = { left: 10, top: 40, width: 120, height: 18 };
const BOX_B: Box = { left: 10, top: 80, width: 100, height: 18 };

const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '</article>',
].join('\n');

/** Records what the pass asked the page to paint, in call order. */
class RecordingSurface implements PaintSurface {
  /** Every `paint` call in order, so a repeat is visible. */
  readonly writes: string[] = [];
  /** Every `clear` call in order. */
  readonly clears: string[] = [];
  private readonly held = new Map<string, readonly PaintedFragment[]>();

  paint(name: string, fragments: readonly PaintedFragment[]): void {
    this.writes.push(name);
    this.held.set(name, fragments);
  }

  clear(name: string): void {
    this.clears.push(name);
    this.held.delete(name);
  }

  heldNames(): readonly string[] {
    return [...this.held.keys()];
  }

  /** A name another script owns, held in the same document-global map. */
  seedForeign(name: string): void {
    this.held.set(name, []);
  }

  fragmentCountOf(name: string): number {
    return this.held.get(name)?.length ?? -1;
  }
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

/** An anchor built from the live page, the way the capture site builds one. */
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

/** The box seam of the pass: a box per fragment in call order. */
function seam(boxes: readonly Box[] = [BOX_A, BOX_B]): {
  rangeFor: RangeForFragment;
  answers: Box[];
} {
  const answers: Box[] = [];
  const rangeFor: RangeForFragment = () => {
    const box = boxes[answers.length % boxes.length] ?? BOX_A;
    answers.push(box);
    return { getBoundingClientRect: () => box };
  };
  return { rangeFor, answers };
}

/** A seam that refuses the fragment of one node, as a shrunken text node does. */
function refusingSeam(badNode: Text, boxes: readonly Box[] = [BOX_B]): RangeForFragment {
  const inner = seam(boxes);
  return (node, start, end) => {
    if (node === badNode) {
      throw new DOMException('The offset is out of the range.', 'IndexSizeError');
    }
    return inner.rangeFor(node, start, end);
  };
}

function needPainter(
  surface: PaintSurface,
  rangeFor: RangeForFragment,
  storage: MemoryStoragePort,
): PagePainter {
  return createPagePainter(document, {
    port: storage,
    url: () => PAGE_URL,
    surface,
    style: paintStyleOwnerOf(document),
    rangeFor,
  });
}

function styleRules(): readonly string[] {
  const owner = paintStyleOwnerOf(document);
  if (owner === null) {
    throw new Error('fixture document has no constructed stylesheets');
  }
  return owner.ruleTexts();
}

function portWrites(port: MemoryStoragePort): string[] {
  return port.calls.filter((call) => call.op !== 'get').map((call) => call.op);
}

let port: MemoryStoragePort;

beforeEach(async () => {
  document.body.innerHTML = ARTICLE;
  // The paint style owner is cached per document, so every test starts from the same
  // empty sheet: `styleRules()` then reports what this test's pass wrote.
  paintStyleOwnerOf(document)?.clear();
  port = new MemoryStoragePort();
  await saveSettings(port, { name: AUTHOR });
  port.calls.length = 0;
});

describe('a page of stored entries reaches the page (AC1, A70)', () => {
  it('paints one named highlight per visible resolvable entry', async () => {
    seedPage(port, [
      recordFor('a1b2c3d4e5f6', 'quick brown'),
      recordFor('b2c3d4e5f6a1', 'Second paragraph'),
      recordFor('c3d4e5f6a1b2', 'lazy dog', { visible: false }),
    ]);
    const surface = new RecordingSurface();
    const boxes = seam([BOX_A, BOX_B]);
    const painter = needPainter(surface, boxes.rangeFor, port);

    const outcome = await painter.refresh();

    expect(outcome.pageKey).toBe(PAGE_KEY);
    expect(surface.writes).toEqual([
      'inlinenotes-a1b2c3d4e5f6',
      'inlinenotes-b2c3d4e5f6a1',
    ]);
    expect(surface.heldNames()).toEqual([
      'inlinenotes-a1b2c3d4e5f6',
      'inlinenotes-b2c3d4e5f6a1',
    ]);
    expect(outcome.skipped).toEqual([{ entryId: 'c3d4e5f6a1b2', reason: 'hidden' }]);
    expect(outcome.painted.map((entry) => entry.entry.id)).toEqual([
      'a1b2c3d4e5f6',
      'b2c3d4e5f6a1',
    ]);
    // A40: the hidden entry is absent, not dimmed: one rule per painted entry.
    expect(styleRules()).toHaveLength(2);
  });

  it('paints every fragment of a span that wraps, and keeps them under one name (A36)', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'dog. Second', {}, 2)]);
    const surface = new RecordingSurface();
    const boxes = seam([BOX_A, BOX_B]);
    const painter = needPainter(surface, boxes.rangeFor, port);

    await painter.refresh();

    expect(surface.fragmentCountOf('inlinenotes-a1b2c3d4e5f6')).toBe(2);
    expect(boxes.answers).toHaveLength(2);
  });

  it('reports an entry whose text the page lost, and keeps it stored (A24, A40)', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'Second paragraph')]);
    const paragraph = document.getElementById('p2');
    if (paragraph !== null) {
      paragraph.remove();
    }
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    const outcome = await painter.refresh();

    expect(surface.heldNames()).toEqual([]);
    expect(outcome.skipped).toEqual([{ entryId: 'a1b2c3d4e5f6', reason: 'anchor_not_found' }]);
    const stored = await loadEntries(port, PAGE_URL);
    expect(stored.entries.map((entry: Entry) => entry.id)).toEqual(['a1b2c3d4e5f6']);
  });

  it('reads the author name once per pass, for the ownership header', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();

    expect(painter.authorNameOfPass()).toBe(AUTHOR);
    const settingsReads = port.calls.filter(
      (call) => call.op === 'get' && call.keys.includes(SETTINGS_KEY),
    );
    expect(settingsReads).toHaveLength(1);
  });

  it('answers a page with no name set as painted, with the header falling back', async () => {
    const anonymous = new MemoryStoragePort();
    seedPage(anonymous, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = createPagePainter(document, {
      port: anonymous,
      url: () => PAGE_URL,
      surface,
      style: paintStyleOwnerOf(document),
      rangeFor: seam().rangeFor,
    });

    const outcome = await painter.refresh();

    expect(painter.authorNameOfPass()).toBeNull();
    expect(surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6']);
    expect(outcome.painted).toHaveLength(1);
  });
});

describe('the second pass of one page (AC5, A39)', () => {
  it('registers each name again and keeps one set of ranges per entry', async () => {
    seedPage(port, [
      recordFor('a1b2c3d4e5f6', 'quick brown'),
      recordFor('b2c3d4e5f6a1', 'Second paragraph'),
    ]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();
    await painter.refresh();
    await painter.refresh();

    expect(surface.heldNames()).toEqual([
      'inlinenotes-a1b2c3d4e5f6',
      'inlinenotes-b2c3d4e5f6a1',
    ]);
    // Each pass writes each name once: the highlight object of a name is replaced,
    // never appended to, so a range cannot appear twice.
    expect(surface.writes).toHaveLength(6);
    expect(surface.fragmentCountOf('inlinenotes-a1b2c3d4e5f6')).toBe(1);
    expect(styleRules()).toHaveLength(2);
  });

  it('drops the name of an entry that went hidden and keeps the rest', async () => {
    const hiddenRecord = recordFor('b2c3d4e5f6a1', 'Second paragraph', { visible: false });
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown'), recordFor('b2c3d4e5f6a1', 'Second paragraph')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();
    expect(surface.heldNames()).toHaveLength(2);

    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown'), hiddenRecord]);
    const outcome = await painter.refresh();

    expect(surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6']);
    expect(surface.clears).toEqual(['inlinenotes-b2c3d4e5f6a1']);
    expect(outcome.skipped).toEqual([{ entryId: 'b2c3d4e5f6a1', reason: 'hidden' }]);
    expect(styleRules()).toHaveLength(1);
  });

  it('removes only the names of this extension, never a page script name (A39)', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    surface.seedForeign('author-highlight');
    surface.seedForeign('inlinenotes-not-an-entry-name-but-ours');
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();
    painter.clearPaint();

    expect(surface.heldNames()).toEqual(['author-highlight']);
    expect(styleRules()).toEqual([]);
  });

  it('clearPaint removes every paint name and every rule of the sheet (A39)', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();
    expect(styleRules()).toHaveLength(1);

    painter.clearPaint();

    expect(surface.heldNames()).toEqual([]);
    expect(painter.paintedEntries()).toEqual([]);
    expect(styleRules()).toEqual([]);
  });

  it('re-resolves the page on the next pass instead of trusting its last boxes (A29)', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);

    await painter.refresh();
    expect(surface.heldNames()).toEqual(['inlinenotes-a1b2c3d4e5f6']);

    const paragraph = document.getElementById('p1');
    if (paragraph !== null) {
      paragraph.textContent = 'Nothing of the old sentence survives here.';
    }

    const outcome = await painter.refresh();

    expect(surface.heldNames()).toEqual([]);
    expect(outcome.skipped).toEqual([{ entryId: 'a1b2c3d4e5f6', reason: 'anchor_not_found' }]);
  });
});

describe('one bad entry does not dim the page (A66)', () => {
  it('loses the highlight of the entry the page will not measure, and nothing else', async () => {
    seedPage(port, [
      recordFor('a1b2c3d4e5f6', 'quick brown'),
      recordFor('b2c3d4e5f6a1', 'Second paragraph'),
    ]);
    const surface = new RecordingSurface();
    const healthy = seam([BOX_B]);
    const painter = needPainter(surface, healthy.rangeFor, port);
    await painter.refresh();
    expect(surface.heldNames()).toHaveLength(2);

    const broken = refusingSeam(textOf('p1'), [BOX_B]);
    const brokenPainter = createPagePainter(document, {
      port,
      url: () => PAGE_URL,
      surface,
      style: paintStyleOwnerOf(document),
      rangeFor: broken,
    });
    const outcome = await brokenPainter.refresh();

    expect(outcome.skipped).toEqual([{ entryId: 'a1b2c3d4e5f6', reason: 'measurement_failed' }]);
    expect(surface.heldNames()).toEqual(['inlinenotes-b2c3d4e5f6a1']);
    expect(surface.clears).toEqual(['inlinenotes-a1b2c3d4e5f6']);
    expect(styleRules()).toHaveLength(1);
  });

  it('touches no storage while it decides what to paint', async () => {
    seedPage(port, [
      recordFor('a1b2c3d4e5f6', 'quick brown'),
      recordFor('b2c3d4e5f6a1', 'Second paragraph'),
    ]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, refusingSeam(textOf('p1')), port);
    const before = port.snapshot();

    await painter.refresh();
    await painter.refresh();

    expect(portWrites(port)).toEqual([]);
    expect(port.snapshot()).toEqual(before);
  });

  it('paints nothing when the store cannot be read, and reports the code', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);
    await painter.refresh();
    expect(surface.heldNames()).toHaveLength(1);

    // The port answers "the storage area is unreachable"; core turns any port
    // failure into the load code `storage_unavailable`.
    port.failNextRead('unavailable');
    const outcome = await painter.refresh();

    expect(outcome.readCodes).toContain('storage_unavailable');
    expect(outcome.painted).toEqual([]);
    expect(surface.heldNames()).toEqual([]);
    expect(portWrites(port)).toEqual([]);
  });
});

describe('the page DOM stays the page (AC2, A41)', () => {
  it('leaves the document element byte-identical and adds no host', async () => {
    seedPage(port, [
      recordFor('a1b2c3d4e5f6', 'quick brown'),
      recordFor('b2c3d4e5f6a1', 'dog. Second', {}, 2),
    ]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);
    const before = document.documentElement.outerHTML;

    await painter.refresh();

    expect(document.documentElement.outerHTML).toBe(before);
    expect(document.getElementById(OVERLAY_HOST_ID)).toBeNull();
    expect(document.querySelector('style')).toBeNull();
    expect(surface.heldNames()).toHaveLength(2);
  });
});

describe('a browser without the Highlight API (A38)', () => {
  it('paints nothing, throws nothing and writes no rule', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const painter = createPagePainter(document, { port, url: () => PAGE_URL, rangeFor: seam().rangeFor });

    const outcome = await painter.refresh();

    expect(outcome.painted).toEqual([]);
    expect(painter.paintedEntries()).toEqual([]);
    expect(styleRules()).toEqual([]);
  });
});

describe('the card and the paint do not own each other (A68)', () => {
  it('keeps every highlight when the create card opens and closes', async () => {
    seedPage(port, [recordFor('a1b2c3d4e5f6', 'quick brown')]);
    const surface = new RecordingSurface();
    const painter = needPainter(surface, seam().rangeFor, port);
    await painter.refresh();
    const names = surface.heldNames();

    const overlay = ensureOverlayHost();
    if (overlay === null) {
      throw new Error('jsdom is the top frame, so the host must exist');
    }
    const range = document.createRange();
    range.setStart(textOf('p1'), 4);
    range.setEnd(textOf('p1'), 15);
    const controller = createCreateCardController(document, overlay, {
      port,
      pageUrl: () => PAGE_URL,
      clock: () => '2026-01-02T03:04:05.006Z',
      rng: () => 0.5,
      readSelection: () => ({ range, root: document.body }),
      // Task `t3-02`: the selection and the document are real, but a headless test DOM
      // reports no layout for a `Range`, so the shipped measurement seam throws and
      // ruling `A64` correctly opens no card. The box seam is injected so this fixture
      // really opens and closes a card, which is what `A68` is about: a card close
      // hides the host and must leave every paint name standing.
      rangeFor: seam([BOX_A]).rangeFor,
    });

    await controller.capture();
    expect(controller.isOpen()).toBe(true);
    controller.close();
    expect(controller.isOpen()).toBe(false);
    expect(overlay.host.hidden).toBe(true);

    expect(surface.heldNames()).toEqual(names);
    expect(surface.clears).toEqual([]);
    expect(painter.paintedEntries()).toHaveLength(1);
  });
});
