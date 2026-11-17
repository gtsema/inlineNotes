// @vitest-environment jsdom
/**
 * The paint pass cannot reject (task `t3-05` AC2, from `docs/state/t3-02-review.md`
 * remark 4: `page-painter.ts` documented `refresh()` as "never throws" while
 * `registerPlan` was unguarded and `src/content/main.ts` runs `void painter.refresh()`
 * with no rejection handler).
 *
 * `main.ts` calls the pass twice (`boot()` and the `onCreated` handover) and neither
 * call site can catch, so the guarantee has to hold **inside** the pass. This file
 * injects a throw into every stage of one pass and asserts the same observable answer
 * each time: the pass resolves, it paints nothing, it tears down what it had already
 * registered, it writes nothing to storage, and the entries stay exactly as stored —
 * still in the popup, still deletable (rulings `A40`, `A66`).
 *
 * The throws are injected, and that is the point: today's shipped wiring has no known
 * page call that throws here (the reviewer of `t3-02` read the same code and reached
 * the same conclusion), which is exactly why the sentence at `page-painter.ts` was a
 * wish rather than a property. An injected throw per stage is what makes the sentence
 * checkable, and the same family as ruling `A64` (the open-time measurement), ruling
 * `A66` (measurement failure costs one entry) and ruling `A75` (a page-boundary throw
 * is caught at the content call site).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import { codePointLength } from '../src/core/entry-rules';
import type { EntryAnchor } from '../src/core/entry';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { pageKeyFromUrl } from '../src/core/page-key';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { saveSettings } from '../src/core/settings-store';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import { createPagePainter } from '../src/content/paint/page-painter';
import { paintStyleOwnerOf } from '../src/content/paint/paint-style';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import type { PaintedFragment } from '../src/content/paint/paint-plan';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const PAGE_KEY = pageKeyFromUrl(PAGE_URL) ?? '';
const FIRST_ID = 'a1b2c3d4e5f6';
const SECOND_ID = 'b2c3d4e5f6a1';
const FIRST_NAME = `inlinenotes-${FIRST_ID}`;
const SECOND_NAME = `inlinenotes-${SECOND_ID}`;
const AUTHOR = 'reader-one';
const BOX: Box = { left: 10, top: 40, width: 120, height: 18 };

const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '</article>',
].join('\n');

/**
 * A `PaintSurface` that registers like the shipped one until told otherwise.
 *
 * `refuseOn` names the entries whose registration throws — the shape of
 * `documentPaintSurface().paint()` calling `Range.setStart` on a text node the page
 * shortened (`paint-surface.ts` rebuilds the ranges at registration time). `refuseClear`
 * makes the teardown throw as well, which is the case where a "safe" pass would still
 * reject.
 */
class FailingSurface implements PaintSurface {
  /** Every `paint` call in call order, so a half-registered pass is visible. */
  readonly writes: string[] = [];
  /** Every `clear` call in call order. */
  readonly clears: string[] = [];
  private readonly held = new Map<string, readonly PaintedFragment[]>();
  private readonly refuseOn: Set<string>;
  private readonly refuseClear: boolean;

  constructor(options: { refuseOn?: readonly string[]; refuseClear?: boolean } = {}) {
    this.refuseOn = new Set(options.refuseOn ?? []);
    this.refuseClear = options.refuseClear ?? false;
  }

  paint(name: string, fragments: readonly PaintedFragment[]): void {
    this.writes.push(name);
    if (this.refuseOn.has(name)) {
      throw new DOMException('The offset is out of the range.', 'IndexSizeError');
    }
    this.held.set(name, fragments);
  }

  clear(name: string): void {
    this.clears.push(name);
    if (this.refuseClear) {
      throw new DOMException('The highlight registry refused the removal.', 'InvalidStateError');
    }
    this.held.delete(name);
  }

  heldNames(): readonly string[] {
    if (this.refuseClear) {
      throw new DOMException('The highlight registry refused the read.', 'InvalidStateError');
    }
    return [...this.held.keys()];
  }

  /** What the page actually holds, for the teardown assertion. */
  paints(name: string): boolean {
    return this.held.has(name);
  }
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

/** An anchor built from the live page, the way the paint pass reads one back. */
function storedAnchorOf(needle: string): EntryAnchor {
  const stream = buildTextStream(document.body);
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw new Error('fixture needle is not in the stream');
  }
  const anchor = buildAnchor(stream.text, codePointOffsetAt(stream.text, utf16At), codePointOffsetAt(stream.text, utf16At) + codePointLength(needle), { fragments: 1 });
  if (anchor === null) {
    throw new Error('fixture anchor could not be built');
  }
  return anchor;
}

function seedPage(port: MemoryStoragePort): void {
  port.seed(
    entryStorageKey(PAGE_KEY),
    slotValue([
      storedEntry({ id: FIRST_ID, pageKey: PAGE_KEY, text: 'quick brown', anchor: storedAnchorOf('quick brown') }),
      storedEntry({
        id: SECOND_ID,
        pageKey: PAGE_KEY,
        text: 'Second paragraph',
        anchor: storedAnchorOf('Second paragraph'),
      }),
    ]),
  );
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));
}

const boxSeam: RangeForFragment = () => ({ getBoundingClientRect: () => BOX });

function painterFor(
  storage: MemoryStoragePort,
  surface: PaintSurface,
  url: () => string = () => PAGE_URL,
  rangeFor: RangeForFragment = boxSeam,
) {
  return createPagePainter(document, {
    port: storage,
    url,
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

/** Every port write except the author-name write the fixture itself performs. */
function portWrites(port: MemoryStoragePort): string[] {
  return port.calls
    .filter((call) => call.op !== 'get' && !(call.keys.length === 1 && call.keys[0] === SETTINGS_KEY))
    .map((call) => call.op);
}

async function seedAuthor(port: MemoryStoragePort): Promise<void> {
  const saved = await saveSettings(port, { name: AUTHOR });
  if (!saved.ok) {
    throw new Error(`fixture author write refused with ${saved.code}`);
  }
}

beforeEach(() => {
  document.body.innerHTML = ARTICLE;
  // The paint sheet owner is document-global, so a pass of one test must not be able
  // to satisfy the rule assertion of the next one.
  paintStyleOwnerOf(document)?.clear();
});

describe('one pass that throws at the page still resolves (t3-05 AC2)', () => {
  it('paints both names when the page accepts the registration (fixture proof)', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface();

    const outcome = await painterFor(port, surface).refresh();

    expect(outcome.painted.map((entry) => entry.name)).toEqual([FIRST_NAME, SECOND_NAME]);
    expect(surface.heldNames()).toEqual([FIRST_NAME, SECOND_NAME]);
    expect(styleRules()).toHaveLength(2);
  });

  it('answers a registration the page refuses with an empty pass and a teardown', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    // The first name lands, the second throws: exactly the half-registered state a
    // rejecting pass would leave on the page as a highlight of an entry the pass never
    // finished with.
    const surface = new FailingSurface({ refuseOn: [SECOND_NAME] });
    const painter = painterFor(port, surface);
    const before = port.snapshot();

    const outcome = await painter.refresh();

    expect(outcome.painted).toEqual([]);
    expect(painter.paintedEntries()).toEqual([]);
    // Every entry of the page is reported as skipped, and the reason is the existing
    // `measurement_failed` — no new code, no new wording.
    expect(outcome.skipped).toEqual([
      { entryId: FIRST_ID, reason: 'measurement_failed' },
      { entryId: SECOND_ID, reason: 'measurement_failed' },
    ]);
    // The name this pass had already registered is gone again.
    expect(surface.heldNames()).toEqual([]);
    expect(surface.paints(FIRST_NAME)).toBe(false);
    expect(styleRules()).toEqual([]);
    expect(portWrites(port)).toEqual([]);
    expect(port.snapshot()).toEqual(before);
  });

  it('answers a teardown that also throws with an empty pass', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface({ refuseOn: [FIRST_NAME], refuseClear: true });

    const outcome = await painterFor(port, surface).refresh();

    // Nothing left to do and nothing left to report: the pass still resolves, because
    // a page that refuses the teardown is not a reason for an unhandled rejection.
    expect(outcome.painted).toEqual([]);
    expect(outcome.readCodes).toEqual([]);
    expect(portWrites(port)).toEqual([]);
  });

  it('answers a storage read that throws with an empty pass and its code', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface();
    port.get = async (): Promise<Record<string, unknown>> => {
      throw new Error('injected: the storage area threw while reading');
    };

    const outcome = await painterFor(port, surface).refresh();

    expect(outcome.painted).toEqual([]);
    expect(outcome.readCodes).toContain('storage_unavailable');
    expect(surface.heldNames()).toEqual([]);
    expect(portWrites(port)).toEqual([]);
  });

  it('answers an unreadable page address with an empty pass and url_unparsable', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface();

    const outcome = await painterFor(port, surface, (): string => {
      throw new Error('injected: the page address could not be read');
    }).refresh();

    expect(outcome.pageKey).toBeNull();
    expect(outcome.painted).toEqual([]);
    expect(outcome.readCodes).toContain('url_unparsable');
    expect(surface.heldNames()).toEqual([]);
    expect(portWrites(port)).toEqual([]);
  });

  it('answers a stream root the page refused with an empty pass', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface();

    const painter = createPagePainter(document, {
      port,
      url: () => PAGE_URL,
      surface,
      style: paintStyleOwnerOf(document),
      rangeFor: boxSeam,
      root: (): Node => {
        throw new DOMException('The body is gone.', 'NotFoundError');
      },
    });

    const outcome = await painter.refresh();

    expect(outcome.painted).toEqual([]);
    expect(outcome.skipped).toEqual([
      { entryId: FIRST_ID, reason: 'measurement_failed' },
      { entryId: SECOND_ID, reason: 'measurement_failed' },
    ]);
    expect(surface.heldNames()).toEqual([]);
    expect(portWrites(port)).toEqual([]);
  });

  /**
   * The upstream half of the same property, already shipped by ruling `A66`: a
   * measurement the page refuses costs one entry, so a pass whose only failure is one
   * unmeasurable entry never reaches the pass-level guard at all. Pinned here so the
   * two boundaries stay distinguishable: per-entry upstream, pass-wide here.
   */
  it('keeps the per-entry measurement rule upstream of the pass guard (A66)', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const surface = new FailingSurface();
    const bad = textOf('p1');

    const outcome = await painterFor(port, surface, () => PAGE_URL, (node, start, end) => {
      if (node === bad) {
        throw new DOMException('The offset is out of the range.', 'IndexSizeError');
      }
      return boxSeam(node, start, end);
    }).refresh();

    expect(outcome.skipped).toEqual([{ entryId: FIRST_ID, reason: 'measurement_failed' }]);
    expect(outcome.painted.map((entry) => entry.name)).toEqual([SECOND_NAME]);
    expect(surface.heldNames()).toEqual([SECOND_NAME]);
  });

  it('leaves the stored page untouched through every failing pass', async () => {
    const port = new MemoryStoragePort();
    seedPage(port);
    await seedAuthor(port);
    const before = port.snapshot();

    await painterFor(port, new FailingSurface({ refuseOn: [FIRST_NAME, SECOND_NAME] })).refresh();
    await painterFor(port, new FailingSurface({ refuseOn: [FIRST_NAME], refuseClear: true })).refresh();

    expect(portWrites(port)).toEqual([]);
    expect(port.snapshot()).toEqual(before);
    expect([...port.storedKeys()].sort()).toEqual(
      [SETTINGS_KEY, entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY].sort(),
    );
  });
});
