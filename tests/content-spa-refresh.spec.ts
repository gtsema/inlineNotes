// @vitest-environment jsdom
/**
 * The same-document navigation watch of one page: the site moved the reader somewhere
 * else without a load, and the page of the notes has to follow (task `t4-03` AC1;
 * rulings `A59`, `A29`, `A39`, `A24`, `A36`).
 *
 * The fixture is the shipped path. The address seam is `() => window.location.href`,
 * so the triggers are driven by real `history.pushState` calls on a real jsdom
 * document, and the paint pass underneath them is the real `PagePainter` over an
 * in-memory storage seam and a recording `paint surface` (a headless DOM has no
 * Highlight API). Only the event *notifications* are dispatched by hand where jsdom
 * would deliver them asynchronously — `popstate` for a back/forward move, `hashchange`
 * for a fragment move, `visibilitychange` for the tab coming back — because that is the
 * input the shipped listener reads, and it is dispatched on the real `Window`.
 *
 * Pinned behaviour, per acceptance criterion:
 * - **AC1, the triggers.** `popstate`, `hashchange` and `visibilitychange` each notice
 *   on their own, and so does the `url poll interval` alone: the polling tests disable
 *   every event by never dispatching one, and the event tests disable the timer with
 *   `pollMs: 0`. `A59` is the reason the timer exists — a content script sits in the
 *   isolated world and cannot see the page call `history.pushState` — and the shipped
 *   interval is asserted against the number the spec's Terms row writes, the way the
 *   `settle delay` of ruling `A63` is asserted. A tab that is going hidden answers
 *   nothing: there is no reader to show a correct page to, and the throttled timer is
 *   caught when the tab comes back;
 * - **AC1, no work for a trigger that changed nothing.** Back/forward to the same
 *   address, a hash event with an unchanged address, a visibility change and an
 *   arbitrary number of ticks cost no repaint, no core read and no paint call;
 * - **AC1, what a change does.** The pass re-reads the **new** `pageKey`, resolves it
 *   against a freshly rebuilt `page text stream` (`A29`), and the `paint name`s of the
 *   previous page key are gone (`A39`). Text that moved to another element is painted
 *   again; text the site deleted is not painted, is reported `anchor_not_found`, and is
 *   still in storage — a navigation deletes nothing (`A24`, `A36`);
 * - **AC1, the cost of a tick** (the `A59` cost condition): the watch module reads the
 *   address and compares a string, and touches nothing else. That is pinned from the
 *   text of the module, because "cheap" is not observable in one tick of a unit test;
 * - **AC1, the trigger set is closed** (`docs/specs/content-overlay-ui.md` -> Rules ->
 *   "Same-document navigation"): exactly two `window` listeners, one `document`
 *   listener and one interval are installed, in that order — so `pagehide` / `pageshow`
 *   or any other trigger cannot be added without failing a test — and the lifecycle
 *   events of the bfcache answer nothing even when the address really moved, because
 *   bfcache restore is the reload path;
 * - **AC1, neither watch is ever torn down in a content script** (same spec Rules
 *   bullet): `src/content/main.ts` attaches each watch once as a statement and drops
 *   the returned teardown, and owns no unload step, no `removeEventListener` and no
 *   `clearInterval` at all.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildAnchor } from '../src/core/anchor-build';
import type { EntryAnchor } from '../src/core/entry';
import { codePointLength } from '../src/core/entry-rules';
import { pageKeyFromUrl } from '../src/core/page-key';
import { PAGE_INDEX_KEY, SETTINGS_KEY, entryStorageKey } from '../src/core/storage-keys';
import { settingsValueOf } from '../src/core/settings-store';
import { codePointOffsetAt } from '../src/core/text-normalize';
import { buildTextStream } from '../src/content/anchor/text-stream';
import type { RangeForFragment } from '../src/content/capture/fragment-rect';
import { PAINT_NAME_PREFIX } from '../src/content/paint/highlight-name';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PagePaintOutcome, PagePainter } from '../src/content/paint/page-painter';
import type { PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import {
  URL_POLL_MS,
  attachUrlChangeWatch,
  type UrlWatchTeardown,
} from '../src/content/refresh/url-change-watch';
import { MemoryStoragePort, indexValue, slotValue, storedEntry } from './support/memory-storage-port';

/**
 * The address book of this file. Everything is derived from the live jsdom location so
 * a change in the test environment's base URL cannot make the fixture address and the
 * core `pageKey` disagree.
 */
const ORIGIN = new URL(window.location.href).origin;
const ONE_PATH = '/spa-article-one';
const TWO_PATH = '/spa-article-two';
const ONE_URL = `${ORIGIN}${ONE_PATH}`;
const TWO_URL = `${ORIGIN}${TWO_PATH}`;
const ONE_KEY = pageKeyFromUrl(ONE_URL) ?? '';
const TWO_KEY = pageKeyFromUrl(TWO_URL) ?? '';

const OWN_NAME = 'reader-one';
const ENTRY_ID = 'a1b2c3d4e5f6';
const OTHER_ENTRY_ID = 'b2c3d4e5f6a1';
/** A tracking parameter: core drops it, so the page key does not move. */
const NOISE = '?utm_source=newsletter';
/** Short enough for a test, large enough that a pending timer is observable. */
const POLL_MS = 15;

const ARTICLE_ONE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the first article.</p>',
  '</article>',
].join('\n');

/** The same article after a re-render: the sentence lives in another element now. */
const ARTICLE_ONE_MOVED = [
  '<article id="art">',
  '  <p id="p1">Second paragraph of the first article.</p>',
  '  <p id="p3">The quick brown fox jumps over the lazy dog.</p>',
  '</article>',
].join('\n');

/** The same article after a re-render that dropped the note's words. */
const ARTICLE_ONE_LOST = [
  '<article id="art">',
  '  <p id="p1">Second paragraph of the first article.</p>',
  '</article>',
].join('\n');

const ARTICLE_TWO = [
  '<article id="art">',
  '  <p id="p1">A completely different article about anchoring.</p>',
  '</article>',
].join('\n');

const NOTE_SENTENCE = 'quick brown';
const OTHER_SENTENCE = 'different article';

/** Strips comments so a text scan looks at code, not at prose. */
function codeOnly(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/\/\/[^\n]*/g, ' ');
}

/**
 * The `url poll interval` the spec pins, read out of the Terms row of
 * `docs/specs/content-overlay-ui.md` instead of being repeated here (ruling `A59`,
 * same shape as the `settle delay` pin of ruling `A63` in
 * `tests/content-card-events.spec.ts`): the shipped constant is asserted against the
 * number **and** the constant name the spec itself writes.
 */
function specPollIntervalMs(): number {
  const spec = readFileSync(
    join(process.cwd(), 'docs/specs/content-overlay-ui.md'),
    'utf8',
  );
  const row = spec.split('\n').find((line) => line.includes('| `url poll interval` |'));
  if (row === undefined) {
    throw new Error('the overlay spec lost its `url poll interval` Terms row');
  }
  const value = /\*\*(\d+) ms\*\*/.exec(row);
  if (value === null || value[1] === undefined) {
    throw new Error('the `url poll interval` Terms row pins no millisecond value');
  }
  if (!row.includes('`URL_POLL_MS`')) {
    throw new Error('the `url poll interval` Terms row names no shipped constant');
  }
  return Number(value[1]);
}

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

/** Builds an anchor for `needle` out of `html`, then restores the live article. */
function anchorIn(html: string, needle: string): EntryAnchor {
  document.body.innerHTML = html;
  const stream = buildTextStream(document.body);
  const utf16At = stream.text.indexOf(needle);
  if (utf16At < 0) {
    throw new Error(`fixture needle ${needle} is not in the stream`);
  }
  const start = codePointOffsetAt(stream.text, utf16At);
  const anchor = buildAnchor(stream.text, start, start + codePointLength(needle), {
    fragments: 1,
  });
  if (anchor === null) {
    throw new Error('fixture anchor could not be built');
  }
  return anchor;
}

function seam(): RangeForFragment {
  return () => ({ getBoundingClientRect: () => ({ left: 10, top: 120, width: 120, height: 18 }) });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nameOf(entryId: string): string {
  return `${PAINT_NAME_PREFIX}-${entryId}`;
}

interface Harness {
  readonly port: MemoryStoragePort;
  readonly surface: RecordingSurface;
  readonly painter: PagePainter;
  /** Every pass this harness caused, in order, so a test can read the skip reasons. */
  outcomes(): readonly PagePaintOutcome[];
  /** The address changes the watch reported. */
  navigations(): readonly { from: string; to: string }[];
  /** How many repaints the watch asked for. */
  repaintCount(): number;
  /** Waits for every repaint the watch started. */
  settle(): Promise<void>;
  readonly teardown: () => void;
}

/**
 * Boots the paint pass at page one and attaches the shipped watch.
 *
 * `pollMs: 0` disables the timer, which is what makes the event-only tests mean what
 * they say; `pollMs` omitted means the shipped `URL_POLL_MS`.
 */
async function bootAtOne(pollMs?: number): Promise<Harness> {
  history.replaceState({}, '', ONE_PATH);
  const oneAnchor = anchorIn(ARTICLE_ONE, NOTE_SENTENCE);
  const twoAnchor = anchorIn(ARTICLE_TWO, OTHER_SENTENCE);
  document.body.innerHTML = ARTICLE_ONE;
  history.replaceState({}, '', ONE_PATH);

  const port = new MemoryStoragePort();
  port.seed(SETTINGS_KEY, settingsValueOf(OWN_NAME));
  port.seed(
    entryStorageKey(ONE_KEY),
    slotValue([
      storedEntry({
        id: ENTRY_ID,
        pageKey: ONE_KEY,
        authorName: OWN_NAME,
        text: NOTE_SENTENCE,
        comment: 'a note on the first article',
        anchor: oneAnchor,
        createdAt: '2026-01-02T03:04:05.006Z',
        updatedAt: '2026-01-02T03:04:05.006Z',
      }),
    ]),
  );
  port.seed(
    entryStorageKey(TWO_KEY),
    slotValue([
      storedEntry({
        id: OTHER_ENTRY_ID,
        pageKey: TWO_KEY,
        authorName: OWN_NAME,
        text: OTHER_SENTENCE,
        comment: 'a note on the second article',
        anchor: twoAnchor,
        createdAt: '2026-01-02T03:04:05.006Z',
        updatedAt: '2026-01-02T03:04:05.006Z',
      }),
    ]),
  );
  port.seed(PAGE_INDEX_KEY, indexValue([ONE_KEY, TWO_KEY]));

  const surface = new RecordingSurface();
  const painter = createPagePainter(document, {
    port,
    url: (): string => window.location.href,
    surface,
    rangeFor: seam(),
  });

  const outcomes: PagePaintOutcome[] = [];
  const pending: Promise<void>[] = [];
  const pass = async (): Promise<void> => {
    outcomes.push(await painter.refresh());
  };
  await pass();

  const navigations: { from: string; to: string }[] = [];
  let repaints = 0;
  const teardown = attachUrlChangeWatch(window, document, {
    url: (): string => window.location.href,
    onUrlChange: (previousUrl: string, currentUrl: string): void => {
      navigations.push({ from: previousUrl, to: currentUrl });
      repaints += 1;
      pending.push(pass());
    },
    ...(pollMs === undefined ? {} : { pollMs }),
  });

  return {
    port,
    surface,
    painter,
    outcomes: (): readonly PagePaintOutcome[] => outcomes,
    navigations: (): readonly { from: string; to: string }[] => navigations,
    repaintCount: (): number => repaints,
    async settle(): Promise<void> {
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }
    },
    teardown,
  };
}

/** A same-document navigation of the site: no event reaches the isolated world. */
function pushSite(path: string): void {
  history.pushState({}, '', path);
}

/**
 * The notification Chrome sends for a back/forward move inside the document. jsdom
 * only sends it for a real `history.back()`, which is asynchronous, so the shipped
 * listener is handed the same event object the browser would deliver.
 */
function firePopState(): void {
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

/** The notification the document sends when the reader returns to the tab. */
function fireVisibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Sets the visibility the shipped listener reads, and returns the restorer. */
function setVisibility(state: 'visible' | 'hidden'): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  return (): void => {
    if (descriptor === undefined) {
      // jsdom keeps `visibilityState` on `Document.prototype`, so the own property this
      // helper added is the whole change: dropping it restores the prototype answer.
      delete (document as { visibilityState?: unknown }).visibilityState;
      return;
    }
    Object.defineProperty(document, 'visibilityState', descriptor);
  };
}

let teardowns: (() => void)[] = [];

function track(harness: Harness): Harness {
  teardowns.push(harness.teardown);
  return harness;
}

afterEach(() => {
  for (const teardown of teardowns) {
    teardown();
  }
  teardowns = [];
  history.replaceState({}, '', '/');
});

beforeEach(() => {
  document.getSelection()?.removeAllRanges();
});

describe('AC1 — the triggers a content script really receives', () => {
  it('notices a pushState move on the polling interval, with no event dispatched at all (A59)', async () => {
    const harness = track(await bootAtOne(POLL_MS));
    expect(harness.painter.pageKeyOfPass()).toBe(ONE_KEY);

    pushSite(TWO_PATH);
    await wait(POLL_MS + 40);
    await harness.settle();

    expect(harness.navigations()).toEqual([{ from: ONE_URL, to: TWO_URL }]);
    expect(harness.repaintCount()).toBe(1);
    expect(harness.painter.pageKeyOfPass()).toBe(TWO_KEY);
  });

  it('notices a back/forward move on popstate, with the timer switched off', async () => {
    const harness = track(await bootAtOne(0));
    pushSite(TWO_PATH);
    expect(harness.repaintCount()).toBe(0);

    firePopState();
    await harness.settle();

    expect(harness.navigations()).toEqual([{ from: ONE_URL, to: TWO_URL }]);
    expect(harness.repaintCount()).toBe(1);
  });

  it('notices a fragment move on the hashchange the document itself sends, with the timer switched off', async () => {
    const harness = track(await bootAtOne(0));
    // A fragment move is the one navigation jsdom notifies on its own, as a task, which
    // is what Chrome does too; waiting a macrotask for it also keeps that notification
    // from arriving late, in the middle of the next test.
    window.location.hash = '#section-2';
    await wait(10);
    await harness.settle();

    expect(harness.navigations()).toHaveLength(1);
    expect(harness.repaintCount()).toBe(1);
    // A fragment is not part of a page key: the page did not change, and the repaint is
    // paid for because a hash route re-renders content without any other notice.
    expect(harness.painter.pageKeyOfPass()).toBe(ONE_KEY);
  });

  it('catches up on visibilitychange, because a hidden document had its timer throttled', async () => {
    const harness = track(await bootAtOne(0));
    pushSite(TWO_PATH);

    fireVisibilityChange();
    await harness.settle();

    expect(harness.navigations()).toEqual([{ from: ONE_URL, to: TWO_URL }]);
  });

  it('answers nothing for a visibility change that is the document going away', async () => {
    const harness = track(await bootAtOne(0));
    const restore = setVisibility('hidden');
    try {
      pushSite(TWO_PATH);
      fireVisibilityChange();
      await wait(1);
      expect(harness.navigations()).toEqual([]);
      expect(harness.repaintCount()).toBe(0);
    } finally {
      restore();
    }

    fireVisibilityChange();
    await harness.settle();
    expect(harness.navigations()).toHaveLength(1);
  });

  it('stops noticing once the watch is detached', async () => {
    const harness = track(await bootAtOne(POLL_MS));
    harness.teardown();

    pushSite(TWO_PATH);
    await wait(POLL_MS + 40);

    expect(harness.navigations()).toEqual([]);
    expect(harness.repaintCount()).toBe(0);
  });
});

describe('AC1 — a trigger that changed no address is no work', () => {
  it('does nothing for popstate, hashchange, visibilitychange and an arbitrary number of ticks', async () => {
    const harness = track(await bootAtOne(POLL_MS));
    const readsBefore = harness.port.calls.length;

    firePopState();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    fireVisibilityChange();
    await wait(POLL_MS * 3);

    expect(harness.navigations()).toEqual([]);
    expect(harness.repaintCount()).toBe(0);
    expect(harness.port.calls).toHaveLength(readsBefore);
    expect(harness.outcomes()).toHaveLength(1);
  });

  it('does nothing when the site pushed the address it already had', async () => {
    const harness = track(await bootAtOne(POLL_MS));
    pushSite(ONE_PATH);
    firePopState();
    await wait(POLL_MS + 40);

    expect(harness.navigations()).toEqual([]);
    expect(harness.repaintCount()).toBe(0);
  });
});

describe('AC1 — what a noticed change does to the page', () => {
  it('paints the new page key and removes the paint of the previous one (A39)', async () => {
    const harness = track(await bootAtOne(0));
    expect(harness.surface.heldNames()).toEqual([nameOf(ENTRY_ID)]);

    // The site navigated and re-rendered: the document now holds the second article.
    document.body.innerHTML = ARTICLE_TWO;
    pushSite(TWO_PATH);
    firePopState();
    await harness.settle();

    expect(harness.surface.heldNames()).toEqual([nameOf(OTHER_ENTRY_ID)]);
    expect(harness.painter.paintedEntries().map((painted) => painted.entry.id)).toEqual([
      OTHER_ENTRY_ID,
    ]);
    const last = harness.outcomes().at(-1);
    expect(last?.pageKey).toBe(TWO_KEY);
    expect(harness.painter.pageKeyOfPass()).toBe(TWO_KEY);
  });

  it('paints a note whose words the site moved into another element (A29)', async () => {
    const harness = track(await bootAtOne(0));
    const before = harness.painter.paintedEntries()[0]?.fragments[0]?.node;
    expect(before?.parentElement?.id).toBe('p1');

    document.body.innerHTML = ARTICLE_ONE_MOVED;
    // A tracking parameter: core drops it, so this is the same page key and the same
    // entry slot, and the only thing that changed is the document the anchors resolve
    // against.
    pushSite(`${ONE_PATH}${NOISE}`);
    firePopState();
    await harness.settle();

    const last = harness.outcomes().at(-1);
    expect(last?.pageKey).toBe(ONE_KEY);
    expect(last?.painted).toHaveLength(1);
    expect(harness.surface.heldNames()).toEqual([nameOf(ENTRY_ID)]);
    const after = harness.painter.paintedEntries()[0]?.fragments[0]?.node;
    expect(after?.parentElement?.id).toBe('p3');
    expect(after).not.toBe(before);
  });

  it('stops painting a note whose words the page deleted, and stores it on (A24, A36)', async () => {
    const harness = track(await bootAtOne(0));
    expect(harness.surface.heldNames()).toEqual([nameOf(ENTRY_ID)]);

    document.body.innerHTML = ARTICLE_ONE_LOST;
    pushSite(`${ONE_PATH}${NOISE}`);
    firePopState();
    await harness.settle();

    expect(harness.surface.heldNames()).toEqual([]);
    expect(harness.painter.paintedEntries()).toEqual([]);
    const last = harness.outcomes().at(-1);
    expect(last?.pageKey).toBe(ONE_KEY);
    expect(last?.skipped).toEqual([{ entryId: ENTRY_ID, reason: 'anchor_not_found' }]);

    // Not deleted, not rewritten: the record is where it was, so the popup still lists
    // it and still offers `Удалить`.
    const stored = harness.port.snapshot()[entryStorageKey(ONE_KEY)] as { entries: unknown[] };
    expect(stored.entries).toHaveLength(1);
  });

  it('never writes, whatever the page did to itself', async () => {
    const harness = track(await bootAtOne(POLL_MS));
    document.body.innerHTML = ARTICLE_TWO;
    pushSite(TWO_PATH);
    await wait(POLL_MS + 40);
    await harness.settle();
    document.body.innerHTML = ARTICLE_ONE;
    pushSite(ONE_PATH);
    firePopState();
    await harness.settle();

    expect(harness.repaintCount()).toBe(2);
    expect(harness.port.calls.filter((call) => call.op !== 'get')).toEqual([]);
  });
});

describe('AC1 — the poll interval is a constant the spec pins (ruling A59)', () => {
  it('keeps the shipped interval at the value the spec names', () => {
    expect(URL_POLL_MS).toBe(specPollIntervalMs());
    expect(URL_POLL_MS).toBe(1000);
  });

  it('uses the pinned interval at the production call site, where no interval is passed', async () => {
    const harness = track(await bootAtOne());
    pushSite(TWO_PATH);

    // A shorter default would already have repainted here.
    await wait(URL_POLL_MS - 200);
    expect(harness.repaintCount()).toBe(0);

    await wait(300);
    await harness.settle();
    expect(harness.repaintCount()).toBe(1);
    expect(harness.navigations()).toEqual([{ from: ONE_URL, to: TWO_URL }]);
  });
});

describe('AC1 — what one tick costs (the A59 cost condition)', () => {
  const moduleCode = (): string =>
    codeOnly(readFileSync(join(process.cwd(), 'src/content/refresh/url-change-watch.ts'), 'utf8'));

  it('reads nothing of the page: no query, no range, no measurement, no stream, no storage', () => {
    const code = moduleCode();
    for (const forbidden of [
      'querySelector',
      'getElementById',
      'createRange',
      'getBoundingClientRect',
      'getClientRects',
      'textContent',
      'innerHTML',
      'buildTextStream',
      'loadEntries',
      'CSS.highlights',
      'entryStorageKey',
      'chrome.',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('imports nothing, so a tick cannot reach another layer', () => {
    expect(moduleCode().match(/from\s+'[^']+'/g) ?? []).toEqual([]);
  });

  it('installs one interval and one compare, and every event trigger funnels through it', () => {
    const code = moduleCode();
    expect(code.match(/setInterval\(/g) ?? []).toHaveLength(1);
    expect(code.match(/clearInterval\(/g) ?? []).toHaveLength(1);
    // The same `check` answers the polling tick and every event, so an event that
    // changed no address costs the one string compare and nothing more.
    expect(code.match(/addEventListener\('popstate', check\)/g) ?? []).toHaveLength(1);
    expect(code.match(/addEventListener\('hashchange', check\)/g) ?? []).toHaveLength(1);
    expect(code.match(/setInterval\(check, pollMs\)/g) ?? []).toHaveLength(1);

    // The exact listener set, not a subset: a `pagehide`, a `pageshow` or any other
    // added trigger fails here as well as in the runtime pin of the next describe.
    expect(code.match(/addEventListener\('[A-Za-z]+'/g) ?? []).toEqual([
      "addEventListener('popstate'",
      "addEventListener('hashchange'",
      "addEventListener('visibilitychange'",
    ]);
  });
});

/** One listener or timer the shipped watch installed, in the order it installed it. */
interface WatchAttachment {
  readonly target: 'window' | 'document';
  readonly type: string;
}

type AddListenerLike = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => void;

/**
 * Attaches the shipped watch to the real `window` and `document` while recording every
 * listener and interval it installs, then hands both objects back to jsdom.
 *
 * The wrappers call through, so the watch is really attached and behaves exactly as it
 * does in a page; only the **set** of triggers becomes observable. An exact list is the
 * whole point: the spec rules `pagehide` / `pageshow` out of the trigger set, and a
 * subset check would let any number of extra triggers through.
 */
function recordAttachments(attach: () => UrlWatchTeardown): {
  readonly attachments: readonly WatchAttachment[];
  readonly intervals: number;
  readonly teardown: UrlWatchTeardown;
} {
  const attachments: WatchAttachment[] = [];
  let intervals = 0;

  const windowAdd = window.addEventListener.bind(window) as AddListenerLike;
  const documentAdd = document.addEventListener.bind(document) as AddListenerLike;
  const startInterval = window.setInterval.bind(window) as (
    handler: TimerHandler,
    ms?: number,
  ) => number;

  const wrapperFor = (target: 'window' | 'document', add: AddListenerLike): AddListenerLike => {
    return (type, listener, options): void => {
      attachments.push({ target, type });
      add(type, listener, options);
    };
  };

  // jsdom owns these properties on the objects themselves, so the restore puts the
  // original descriptor back rather than deleting what this helper replaced.
  const replacedPairs: (readonly [object, string, PropertyDescriptor | undefined])[] = [];
  const override = (target: object, property: string, value: unknown): void => {
    replacedPairs.push([target, property, Object.getOwnPropertyDescriptor(target, property)]);
    Object.defineProperty(target, property, { configurable: true, writable: true, value });
  };

  override(window, 'addEventListener', wrapperFor('window', windowAdd));
  override(document, 'addEventListener', wrapperFor('document', documentAdd));
  override(window, 'setInterval', (handler: TimerHandler, ms?: number): number => {
    intervals += 1;
    return startInterval(handler, ms);
  });

  let teardown: UrlWatchTeardown | null = null;
  try {
    teardown = attach();
  } finally {
    for (const [target, property, descriptor] of replacedPairs) {
      if (descriptor === undefined) {
        delete (target as Record<string, unknown>)[property];
      } else {
        Object.defineProperty(target, property, descriptor);
      }
    }
  }
  if (teardown === null) {
    throw new Error('the shipped watch did not attach');
  }
  return { attachments, intervals, teardown };
}

/**
 * The events a bfcache move or a tab change produces and the watch is ruled not to
 * listen for. Both targets are dispatched, because a mutation is free to pick either.
 */
const UNTRIGGERED_LIFECYCLE_EVENTS: readonly string[] = [
  'pagehide',
  'pageshow',
  'freeze',
  'resume',
  'beforeunload',
  'focus',
  'blur',
  'online',
  'offline',
];

describe('AC1 — the trigger set is exactly the one the spec names (spec Rules)', () => {
  it('installs two window listeners, one document listener and one interval, and nothing else', () => {
    const seen = recordAttachments(() =>
      attachUrlChangeWatch(window, document, {
        url: (): string => window.location.href,
        onUrlChange: (): void => undefined,
      }),
    );
    // The teardown this pin calls is the one the watch returns for tests: without it
    // the pin would leave a live interval and three listeners in the document.
    seen.teardown();

    expect(seen.attachments).toEqual([
      { target: 'window', type: 'popstate' },
      { target: 'window', type: 'hashchange' },
      { target: 'document', type: 'visibilitychange' },
    ]);
    expect(seen.intervals).toBe(1);
  });

  it('answers nothing to `pagehide` / `pageshow` or any lifecycle event, though the address moved (spec Rules)', async () => {
    // `pollMs: 0` removes the timer, so only a listener could report the move.
    const harness = track(await bootAtOne(0));

    pushSite(TWO_PATH);
    for (const type of UNTRIGGERED_LIFECYCLE_EVENTS) {
      window.dispatchEvent(new Event(type));
      document.dispatchEvent(new Event(type));
    }
    await harness.settle();
    await wait(60);

    // The address really moved: the silence is the trigger set, not a fixture that
    // never navigated.
    expect(new URL(window.location.href).pathname).toBe(TWO_PATH);
    expect(harness.navigations()).toEqual([]);
    expect(harness.repaintCount()).toBe(0);
    expect(harness.painter.pageKeyOfPass()).toBe(ONE_KEY);
  });
});

describe('AC1 — neither watch is ever torn down in a content script (spec Rules)', () => {
  const mainCode = (): string =>
    codeOnly(readFileSync(join(process.cwd(), 'src/content/main.ts'), 'utf8'));

  it('attaches each watch once, as a statement that drops the returned teardown', () => {
    const code = mainCode();
    for (const attach of ['attachUrlChangeWatch', 'attachStorageChangeWatch']) {
      // A bare statement: the teardown value is never bound, returned or stored, so no
      // code path ever receives a handle that could tear a watch down.
      expect(code.match(new RegExp(`^\\s*${attach}\\(`, 'gm')) ?? []).toHaveLength(1);
      expect(
        code.match(new RegExp(`(const|let|var)\\s+[\\w$]+\\s*=\\s*${attach}\\(`, 'g')) ?? [],
      ).toEqual([]);
      expect(code.match(new RegExp(`return\\s+${attach}\\(`, 'g')) ?? []).toEqual([]);
    }
  });

  it('owns no unload step and no teardown call at all, so the interval lives for the document', () => {
    const code = mainCode();
    for (const forbidden of [
      'pagehide',
      'pageshow',
      'beforeunload',
      'unload',
      'removeEventListener',
      'clearInterval',
      'clearTimeout',
      'Teardown',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});
