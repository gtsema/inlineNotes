// @vitest-environment jsdom
/**
 * The storage-change watch of one page: a write that happened somewhere else — another
 * tab, the popup of this tab, the options page — reaches the page that is already
 * loaded (task `t4-03` AC2 and AC3; rulings `A60`, `A50`, `A31`, `A25`).
 *
 * The fixture is the shipped path: the page is stored through core, read and resolved
 * by the real `paint pass` onto a recording `paint surface`, and the watch is attached
 * to a hand-written subscription whose change records the test fires by hand. Only the
 * subscription is a fixture, because `chrome.storage.onChanged` does not exist in a
 * headless DOM; everything that decides what a change means is shipped code, so a
 * watch that invented its own key rule, its own storage read or its own merge policy
 * fails here (`tests/toolchain-contract.spec.ts` pins the same boundary from the text
 * side).
 *
 * Pinned behaviour, per acceptance criterion:
 * - **AC2** — a cross-tab edit of an entry of this page repaints that page **within
 *   one repaint**, with no reload and no re-navigation: the entry the other writer
 *   changed is repainted with the new comment, and a visibility flag the popup wrote is
 *   the same case, which is what browser verification item 6 of `t3-02` had to step
 *   through a reopen to see;
 * - **AC2** — a key belonging to a **different** page's slot, or the page index alone,
 *   triggers no work at all: no core read, no paint call, no repaint recorded
 *   (ruling `A60`);
 * - **AC2** — `A60` is a repaint, not a merge: one relevant record is one repaint and
 *   two records are two repaints, and nothing in this path queues, batches, locks or
 *   replays the change payload. The cross-tab read-modify-write race stays the v1
 *   limitation the model spec states;
 * - **AC2, the `null` page key** (`t4-03` review remark 4): the watch asks
 *   `PagePainter.pageKeyOfPass()` per record, so while no pass has resolved a page key
 *   — before the first pass, or after a pass that ended early — **no** slot is a signal,
 *   not even this page's own, and only `settings:v1` moves the page. The `null` answers
 *   themselves are pinned on the painter in `tests/content-page-painter.spec.ts`;
 * - **AC3** — a settings-name change written in options is visible to an already loaded
 *   page: the `ownership header` comparison follows the new name after the repaint the
 *   settings key triggers, the entry that became the reader's own opens its editor on
 *   the next selection, and the create card the missing name refused opens once a name
 *   exists — that last half needs no repaint at all, because one capture attempt is one
 *   fresh core read, and the watch correctly does nothing to widgets.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import type { EntryAnchor } from '../src/core/entry';
import { codePointLength } from '../src/core/entry-rules';
import { setVisible, updateEntryComment } from '../src/core/entry-store-write';
import { pageKeyFromUrl } from '../src/core/page-key';
import { saveSettings, settingsValueOf } from '../src/core/settings-store';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { RangeForFragment } from '../src/content/capture/fragment-rect';
import { entryOwningSelection } from '../src/content/editor/painted-selection';
import { CARD_CLASS } from '../src/content/overlay/card-style';
import { createCreateCardController } from '../src/content/overlay/create-card-controller';
import { createEditorController } from '../src/content/overlay/editor-controller';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import { PAINT_NAME_PREFIX } from '../src/content/paint/highlight-name';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import { attachStorageChangeWatch } from '../src/content/refresh/storage-change-watch';
import { isOwnEntry } from '../src/content/overlay/tooltip-hit-test';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const PAGE_KEY = pageKeyFromUrl(PAGE_URL) ?? '';
const OTHER_URL = 'https://example.test/some-other-article';
const OWN_NAME = 'reader-one';
const FOREIGN_NAME = 'reader-two';
const OLD_COMMENT = 'the note as it was stored';
const NEW_COMMENT = 'the note another tab typed';
const OPENED_AT = '2026-01-02T03:04:05.006Z';
const WRITTEN_AT = '2026-02-03T04:05:06.007Z';

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
  private readonly nameWrites: string[] = [];

  paint(name: string, fragments: readonly PaintedFragment[]): void {
    if (fragments.length > 0) {
      this.held.set(name, fragments);
      this.nameWrites.push(name);
    }
  }

  clear(name: string): void {
    this.held.delete(name);
  }

  heldNames(): readonly string[] {
    return [...this.held.keys()];
  }

  /** Names this surface actually received, so "no work" is observable. */
  writtenNames(): readonly string[] {
    return this.nameWrites;
  }
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw the('fixture element is missing');
  }
  return element.firstChild as Text;
}

function rangeIn(node: Text, from: number, to: number): Range {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  return range;
}

function storedAnchorOf(needle: string): EntryAnchor {
  const stream = buildTextStream(document.body);
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw the('fixture needle is not in the stream');
  }
  const start = codePointOffsetAt(stream.text, utf16At);
  const anchor = buildAnchor(stream.text, start, start + codePointLength(needle), {
    fragments: 1,
  });
  if (anchor === null) {
    throw the('fixture anchor could not be built');
  }
  return anchor;
}

function recordOf(id: string, needle: string, authorName: string): Record<string, unknown> {
  return storedEntry({
    id,
    pageKey: PAGE_KEY,
    authorName,
    text: needle,
    comment: OLD_COMMENT,
    anchor: storedAnchorOf(needle),
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
  });
}

/** jsdom has no user selection, so the box seam is the only geometry available. */
function seam(): RangeForFragment {
  return () => ({ getBoundingClientRect: () => ({ left: 10, top: 120, width: 100, height: 18 }) });
}

function the(message: string): Error {
  return new Error(message);
}

/** Puts a range over page text into the document selection, as a user drag would. */
function selectPageText(id: string, from: number, to: number): void {
  const selection = document.getSelection();
  if (selection === null) {
    throw the('jsdom is expected to provide a document selection');
  }
  const range = rangeIn(textOf(id), from, to);
  selection.removeAllRanges();
  selection.addRange(range);
}

function freshHost(): OverlayHost {
  const stale = document.getElementById(OVERLAY_HOST_ID);
  if (stale !== null) {
    stale.remove();
  }
  const created = ensureOverlayHost();
  if (created === null) {
    throw the('fixture is not the top frame');
  }
  return created;
}

interface Wiring {
  readonly port: MemoryStoragePort;
  readonly surface: RecordingSurface;
  readonly paintedEntries: () => readonly PaintedEntry[];
  /** The author name the last pass read, the `ownership header` comparison. */
  readonly authorNameOfPass: () => string | null;
  /** The page key the last pass resolved, which is what the watch follows. */
  readonly pageKeyOfPass: () => string | null;
  /** Fires one `chrome.storage.local` change record, as Chrome would. */
  fire(changedKeys: readonly string[]): Promise<void>;
  /** How many repaints the watch asked for. */
  repaintCount(): number;
  readonly teardown: () => void;
}

interface Boot {
  settings?: string | null;
  records?: Record<string, unknown>[];
  /**
   * The load-time paint pass. `run` is the shipped boot; `none` is a document whose
   * first pass has not finished yet; `address-throws` is a document whose pass ended
   * early without an address. The last two are the states in which the painter answers
   * `pageKeyOfPass()` with `null` (`t4-03` review remark 4).
   */
  firstPass?: 'run' | 'none' | 'address-throws';
}

let port: MemoryStoragePort;

async function boot(watch: Boot = {}): Promise<Wiring> {
  port = new MemoryStoragePort();
  if (watch.settings !== null) {
    port.seed(SETTINGS_KEY, settingsValueOf(watch.settings ?? OWN_NAME));
  }
  port.seed(
    entryStorageKey(PAGE_KEY),
    slotValue(watch.records ?? [recordOf('a1b2c3d4e5f6', 'quick brown', OWN_NAME)]),
  );
  port.seed(PAGE_INDEX_KEY, indexValue([PAGE_KEY]));

  const surface = new RecordingSurface();
  const painter = createPagePainter(document, {
    port,
    url: (): string => {
      if (watch.firstPass === 'address-throws') {
        throw the('injected: the page address could not be read');
      }
      return PAGE_URL;
    },
    surface,
    rangeFor: seam(),
  });
  if (watch.firstPass !== 'none') {
    await painter.refresh();
  }

  const listeners: ((changedKeys: readonly string[]) => void)[] = [];
  const pending: Promise<unknown>[] = [];
  let repaints = 0;
  const teardown = attachStorageChangeWatch(
    (onChange): (() => void) => {
      listeners.push(onChange);
      return (): void => {
        listeners.length = 0;
      };
    },
    {
      pageKey: painter.pageKeyOfPass,
      onRepaint: (): void => {
        repaints += 1;
        // `PagePainter.refresh()` never rejects (`A75`), so this path has nothing to
        // catch; the promise is kept only so a test can await the repaint.
        pending.push(painter.refresh());
      },
    },
  );

  return {
    port,
    surface,
    paintedEntries: painter.paintedEntries,
    authorNameOfPass: painter.authorNameOfPass,
    pageKeyOfPass: painter.pageKeyOfPass,
    async fire(changedKeys: readonly string[]): Promise<void> {
      for (const listener of listeners) {
        listener(changedKeys);
      }
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }
    },
    repaintCount: (): number => repaints,
    teardown,
  };
}

beforeEach(() => {
  document.body.innerHTML = ARTICLE;
  document.getSelection()?.removeAllRanges();
});

describe('AC2 — a write elsewhere repaints this page, with no reload', () => {
  it('repaints the entry another tab edited, with the comment that was written', async () => {
    const wiring = await boot();
    expect(wiring.paintedEntries()[0]?.entry.comment).toBe(OLD_COMMENT);
    const paintsBefore = wiring.surface.writtenNames().length;

    // The other writer is the shipped write path of the popup and the editor, so the
    // stored shape is core's and not a fixture's guess.
    const written = await updateEntryComment(wiring.port, {
      url: PAGE_URL,
      id: 'a1b2c3d4e5f6',
      comment: NEW_COMMENT,
      currentName: OWN_NAME,
      now: WRITTEN_AT,
    });
    if (!written.ok) {
      throw the(`fixture write refused with ${written.code}`);
    }
    await wiring.fire([entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY]);

    expect(wiring.paintedEntries()[0]?.entry.comment).toBe(NEW_COMMENT);
    expect(wiring.repaintCount()).toBe(1);
    expect(wiring.surface.writtenNames().length).toBeGreaterThan(paintsBefore);
    expect(wiring.surface.heldNames()).toEqual([`${PAINT_NAME_PREFIX}-a1b2c3d4e5f6`]);
  });

  it('removes the highlight the popup hid, which is what browser item 6 of t3-02 could not see', async () => {
    const wiring = await boot();
    expect(wiring.surface.heldNames()).toHaveLength(1);

    const hidden = await setVisible(wiring.port, {
      url: PAGE_URL,
      id: 'a1b2c3d4e5f6',
      visible: false,
    });
    if (!hidden.ok) {
      throw the(`fixture visibility write refused with ${hidden.code}`);
    }
    await wiring.fire([entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY]);

    expect(wiring.paintedEntries()).toEqual([]);
    expect(wiring.surface.heldNames()).toEqual([]);
    // The record is still stored: hiding is not deleting.
    const stored = wiring.port.snapshot()[entryStorageKey(PAGE_KEY)] as { entries: unknown[] };
    expect(stored.entries).toHaveLength(1);
  });

  it('repaints when the slot key alone is reported, as one tab writing looks to Chrome', async () => {
    const wiring = await boot();
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    expect(wiring.repaintCount()).toBe(1);
  });
});

describe('AC2 — a key that is not this page is not work (A60)', () => {
  it('does nothing for another page slot key', async () => {
    const wiring = await boot();
    const readsBefore = wiring.port.calls.length;
    const paintsBefore = wiring.surface.writtenNames().length;

    await wiring.fire([entryStorageKey(pageKeyFromUrl(OTHER_URL) ?? ''), PAGE_INDEX_KEY]);

    expect(wiring.repaintCount()).toBe(0);
    expect(wiring.port.calls).toHaveLength(readsBefore);
    expect(wiring.surface.writtenNames()).toHaveLength(paintsBefore);
  });

  it('does nothing for the page index alone, which every write elsewhere touches', async () => {
    const wiring = await boot();
    const readsBefore = wiring.port.calls.length;
    await wiring.fire([PAGE_INDEX_KEY]);
    expect(wiring.repaintCount()).toBe(0);
    expect(wiring.port.calls).toHaveLength(readsBefore);
  });

  it('does nothing for a key this extension does not own', async () => {
    const wiring = await boot();
    await wiring.fire(['some-page-script-key']);
    expect(wiring.repaintCount()).toBe(0);
  });

  it('records one repaint per relevant change record: no queue, no merge, no lock (A60)', async () => {
    const wiring = await boot();
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    await wiring.fire([SETTINGS_KEY]);
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    expect(wiring.repaintCount()).toBe(3);
  });

  it('stops the repaint path once the watch is detached', async () => {
    const wiring = await boot();
    wiring.teardown();
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    expect(wiring.repaintCount()).toBe(0);
  });
});

describe('AC2 — with no page key yet, only the settings key moves the page (review remark 4)', () => {
  it('is no work for any slot, not even this page’s own, before the first pass resolved a page key', async () => {
    const wiring = await boot({ firstPass: 'none' });
    expect(wiring.pageKeyOfPass()).toBeNull();
    const readsBefore = wiring.port.calls.length;
    const paintsBefore = wiring.surface.writtenNames().length;

    // A slot key is the key of a page key, and the watch has no page key to compose one
    // from, so the core predicate answers `false` for every entry key (`A87`).
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    await wiring.fire([PAGE_INDEX_KEY]);
    await wiring.fire(['some-page-script-key']);

    expect(wiring.repaintCount()).toBe(0);
    expect(wiring.port.calls).toHaveLength(readsBefore);
    expect(wiring.surface.writtenNames()).toHaveLength(paintsBefore);
  });

  it('repaints for the settings key alone, and the pass that follows makes the slot a signal', async () => {
    const wiring = await boot({ firstPass: 'none' });

    await wiring.fire([SETTINGS_KEY]);
    expect(wiring.repaintCount()).toBe(1);
    expect(wiring.pageKeyOfPass()).toBe(PAGE_KEY);

    // The page now has a key of its own, so its slot joined the watched set.
    await wiring.fire([entryStorageKey(PAGE_KEY)]);
    expect(wiring.repaintCount()).toBe(2);
  });

  it('follows no slot after a pass that ended early without an address', async () => {
    const wiring = await boot({ firstPass: 'address-throws' });
    expect(wiring.pageKeyOfPass()).toBeNull();

    await wiring.fire([entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY]);
    expect(wiring.repaintCount()).toBe(0);

    await wiring.fire([SETTINGS_KEY]);
    expect(wiring.repaintCount()).toBe(1);
    // The repaint of a document with no address still resolves no page key, so the
    // state is stable and the slot stays out of the watched set.
    expect(wiring.pageKeyOfPass()).toBeNull();
  });
});

describe('AC3 — a settings name written in options reaches a loaded page', () => {
  it('repaints on the settings key, so the pass reads the new author name', async () => {
    const wiring = await boot({ settings: null });
    expect(wiring.authorNameOfPass()).toBeNull();

    // The options page writes through core `saveSettings`; that is the whole write.
    const saved = await saveSettings(wiring.port, { name: FOREIGN_NAME });
    if (!saved.ok) {
      throw the(`fixture settings write refused with ${saved.code}`);
    }
    await wiring.fire([SETTINGS_KEY]);

    expect(wiring.authorNameOfPass()).toBe(FOREIGN_NAME);
    expect(wiring.repaintCount()).toBe(1);
  });

  it('flips the ownership comparison the tooltip header shows, with no reload', async () => {
    const wiring = await boot({ records: [recordOf('b2c3d4e5f6a1', 'fox jumps', FOREIGN_NAME)] });
    const entry = wiring.paintedEntries()[0]?.entry;
    if (entry === undefined) {
      throw the('fixture entry is not painted');
    }
    expect(isOwnEntry(entry, wiring.authorNameOfPass())).toBe(false);

    const saved = await saveSettings(wiring.port, { name: FOREIGN_NAME });
    if (!saved.ok) {
      throw the(`fixture settings write refused with ${saved.code}`);
    }
    await wiring.fire([SETTINGS_KEY]);

    expect(isOwnEntry(entry, wiring.authorNameOfPass())).toBe(true);
  });

  it('opens the editor of an entry that became the reader’s own on the next selection', async () => {
    const overlay = freshHost();
    const wiring = await boot({ records: [recordOf('b2c3d4e5f6a1', 'fox jumps', FOREIGN_NAME)] });

    const claims: boolean[] = [];
    const editor = createEditorController(document, overlay, {
      port: wiring.port,
      pageUrl: () => PAGE_URL,
      paintedEntries: wiring.paintedEntries,
      clock: () => WRITTEN_AT,
      // jsdom measures no range, so the box arrives through the shipped seam: without
      // it the editor would refuse for `A64` and the test would pin nothing about
      // ownership.
      rangeFor: seam(),
      isHostBusy: () => false,
    });
    const card = createCreateCardController(document, overlay, {
      port: wiring.port,
      pageUrl: () => PAGE_URL,
      clock: () => WRITTEN_AT,
      rng: () => 0.5,
      rangeFor: seam(),
      claimSelection: (selection, authorName) => {
        // Exactly the shipped hook of `src/content/main.ts`: the card hands the
        // selection and the name its own capture just read to the editor, so the
        // ownership answer is the name of this attempt, not of the last paint pass.
        const claimed = editor.openFor(selection, authorName);
        claims.push(claimed);
        return claimed;
      },
    });

    // Before: the entry belongs to another reader. Flow 6 still claims the selection —
    // no create card over somebody else's note — but no editor opens.
    selectPageText('p1', 16, 25);
    await card.capture();
    expect(claims).toEqual([true]);
    expect(editor.isOpen()).toBe(false);
    expect(card.isOpen()).toBe(false);

    // After the name moved in options, the very same selection gets the editor. The
    // page is the shipped one: the watch is told about the settings key, so the paint
    // pass re-reads the name as well.
    const saved = await saveSettings(wiring.port, { name: FOREIGN_NAME });
    if (!saved.ok) {
      throw the(`fixture settings write refused with ${saved.code}`);
    }
    await wiring.fire([SETTINGS_KEY]);
    expect(wiring.authorNameOfPass()).toBe(FOREIGN_NAME);
    await card.capture();
    expect(claims).toHaveLength(2);
    expect(editor.isOpen()).toBe(true);
    expect(card.isOpen()).toBe(false);
  });

  it('opens the card the missing name refused, once a name exists', async () => {
    const overlay = freshHost();
    const wiring = await boot({ settings: null });
    const card = createCreateCardController(document, overlay, {
      port: wiring.port,
      pageUrl: () => PAGE_URL,
      clock: () => WRITTEN_AT,
      rng: () => 0.5,
      rangeFor: seam(),
    });

    selectPageText('p1', 4, 15);
    await card.capture();
    expect(card.isOpen()).toBe(false);

    const saved = await saveSettings(wiring.port, { name: OWN_NAME });
    if (!saved.ok) {
      throw the(`fixture settings write refused with ${saved.code}`);
    }
    await card.capture();
    expect(card.isOpen()).toBe(true);
    expect(overlay.root.querySelectorAll(`.${CARD_CLASS}`)).toHaveLength(1);
  });

  it('follows the settings key once, and the page key it follows is the pass’s own', async () => {
    // `pageKeyOfPass` is what the watch asks about, so the slot it protects is the slot
    // this document paints — including the case where the page index resolved a
    // different key than the current URL would (the next task's SPA move).
    const wiring = await boot();
    expect(wiring.pageKeyOfPass()).toBe(PAGE_KEY);
    await wiring.fire([SETTINGS_KEY]);
    expect(wiring.repaintCount()).toBe(1);
  });
});

describe('the entry the selection points at is the entry the watch repainted', () => {
  it('claims the entry as the repaint left it, not as the load found it', async () => {
    const wiring = await boot({ records: [recordOf('a1b2c3d4e5f6', 'quick brown', OWN_NAME)] });
    const range = rangeIn(textOf('p1'), 4, 15);
    expect(entryOwningSelection(wiring.paintedEntries(), range)).not.toBeNull();

    const written = await updateEntryComment(wiring.port, {
      url: PAGE_URL,
      id: 'a1b2c3d4e5f6',
      comment: NEW_COMMENT,
      currentName: OWN_NAME,
      now: WRITTEN_AT,
    });
    if (!written.ok) {
      throw the(`fixture write refused with ${written.code}`);
    }
    await wiring.fire([entryStorageKey(PAGE_KEY), PAGE_INDEX_KEY]);

    const claimed = entryOwningSelection(wiring.paintedEntries(), range);
    expect(claimed?.entry.comment).toBe(NEW_COMMENT);
  });
});
