// @vitest-environment jsdom
/**
 * The create-card controller against a real shadow host and an in-memory storage
 * seam (task `t3-01` AC1, AC2, AC3 in situ, AC4, AC5; PM rulings `A6`, `A30`,
 * `A31`, `A33`, `A47`).
 *
 * What the other `t3-01` files already prove, and what this one adds:
 * - `tests/content-overlay-host.spec.ts` proves the hidden-state contract of the
 *   host by reading its source; **this file runs the capture path twice** and
 *   counts real elements, which is the form AC1 asks for ("the host is created
 *   once even when the capture path runs twice");
 * - `tests/content-selection-capture.spec.ts` proves the offset domains of one
 *   capture; this file proves that a selection with no span **opens no card at
 *   all** and asks core for no write, and that a refused anchor (`A28`,
 *   `buildAnchor` -> `null`) is answered by the content layer's own
 *   `selection_lost`, never by `entry_invalid`;
 * - `tests/content-create-card-boundaries.spec.ts` proves the import and wording
 *   map statically; this file proves the runtime half of AC5: with no usable name
 *   in the settings the card never opens, and the two create refusals the user can
 *   actually hit (`overlap`, `duplicate`) reach the page as two different
 *   sentences (`A47`) — and since task `t5-01` it also proves that those two
 *   sentences answer **only against entries of the current author**, so a span
 *   another reader holds is free (`A93`, `A99`);
 * - the measurement rulings of `t3-01b` are proven in situ: a measurement that
 *   throws leaves no card and no write (`A64`), a span whose fragments all measure
 *   zero area is placed by the viewport rule (`A65`), and a page that carries an
 *   astral character before the selection still opens a card, stores the whole word
 *   and answers a re-selection as `duplicate` (`A23`, `t3-01` review finding 1);
 * - the two carried findings of `t3-01` that `t3-02` did not close, now pinned at
 *   the only call site where they exist: the keyboard contract of an **open** card
 *   (`t3-01` remark 4, task `t3-02b` AC1, and since ruling `A111` the card's **no focus
 *   call** contract of task `t6-01` AC1) and the ruling-`A29`
 *   re-derive-at-save moment, driven by a DOM that changes **between `open()` and
 *   `Сохранить`** (`t3-01` remark 5, task `t3-02b` AC2).
 *
 * The environment is jsdom, but only the page side of the boundary is faked: the
 * storage seam is the hand-written `MemoryStoragePort`, and the entry that a save
 * produces is read back through core `loadEntries`, so a content module that
 * invented its own storage shape would fail here instead of silently working.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildTextStream } from '../src/content/anchor/text-stream';
import { locateAnchor } from '../src/content/anchor/locate-anchor';
import { captureSpan } from '../src/content/capture/selection-span';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import type { CapturedSelection } from '../src/content/capture/page-selection';
import { createNote } from '../src/content/create/create-note';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import { createPagePainter } from '../src/content/paint/page-painter';
import type { PaintedEntry, PaintedFragment } from '../src/content/paint/paint-plan';
import type { PaintSurface } from '../src/content/paint/paint-surface';
import {
  CARD_ACTIONS_CLASS,
  CARD_CLASS,
  CARD_COUNTER_CLASS,
  CARD_CSS,
  CARD_INPUT_CLASS,
  CARD_REFUSAL_CLASS,
  CARD_ROOT_CLASS,
  CARD_STYLE_ATTRIBUTE,
} from '../src/content/overlay/card-style';
import {
  createCreateCardController,
  type CreateCardController,
  type CreateCardOptions,
} from '../src/content/overlay/create-card-controller';
import { attachCreateCardEvents } from '../src/content/overlay/card-events';
import { CONTENT_STRINGS, REFUSAL_TEXT, refusalText } from '../src/content/text';
import { CARD_VIEWPORT_GUTTER_PX } from '../src/content/overlay/card-placement';
import { createEntryOnPage } from '../src/core/entry-store-write';
import { loadEntries } from '../src/core/entry-store-read';
import { saveSettings } from '../src/core/settings-store';
import { isEntryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { Entry } from '../src/core/entry';
import { MAX_AUTHOR_NAME_CODE_POINTS } from '../src/core/entry-rules';
import { MemoryStoragePort } from './support/memory-storage-port';
import type { FocusCallRecorder } from './support/focus-calls';
import { recordFocusCalls } from './support/focus-calls';

const PAGE_URL = 'https://example.test/article';
const AUTHOR = 'reader-one';
/** Another reader's name, for the per-author pins of ruling `A93`. */
const FOREIGN_AUTHOR = 'reader-two';
const STAMP = '2026-01-02T03:04:05.006Z';
const VIEWPORT = { width: 1280, height: 800 };
/** The box the injected range factory reports for the selected fragment. */
const FRAGMENT_BOX = { left: 100, top: 100, width: 120, height: 18 };

const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '</article>',
].join('\n');

interface Fixture {
  readonly overlay: OverlayHost;
  readonly port: MemoryStoragePort;
  readonly controller: CreateCardController;
  /** Handover to `t3-02`: the entries the controller reported as created. */
  readonly created: Entry[];
  /** Offsets the controller handed to the range factory, in call order. */
  readonly measured: Array<{ node: Node; start: number; end: number }>;
  /**
   * Runs the real `paint pass` over this fixture's stored page and hands its output to
   * the card. It is the only way a case can answer the `contained own selection`
   * question of ruling `A103` with the page described the way the page describes it.
   * A fixture that never calls it keeps an empty painted list, which is what most cases
   * of this file want: they pin the card, not the painting.
   */
  readonly paint: () => Promise<readonly PaintedEntry[]>;
}

/** What a measuring seam answers for one fragment, or a throw (`A64`). */
type RectOf = (node: Node, start: number, end: number) => Box;

/** Preact flushes on a microtask and the write chain awaits the port a few times. */
async function settle(rounds: number = 10): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
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

/** The selection the capture seam answers with. */
function selection(id: string, from: number, to: number): CapturedSelection {
  return { range: rangeIn(textOf(id), from, to), root: document.body };
}

/** A selection that starts in one paragraph and ends in another. */
function selectionAcross(
  fromId: string,
  from: number,
  toId: string,
  to: number,
): CapturedSelection {
  const range = document.createRange();
  range.setStart(textOf(fromId), from);
  range.setEnd(textOf(toId), to);
  return { range, root: document.body };
}

/**
 * A box with no area but with a position: what a fragment in a collapsed or hidden
 * subtree measures as. The coordinates are far from the viewport gutter on purpose,
 * so the viewport-rule expectation below cannot pass through these numbers by
 * accident (ruling `A65`).
 */
const COLLAPSED_BOX: Box = { left: 500, top: 400, width: 0, height: 0 };

/** A paint surface that only remembers its names: a headless DOM has no Highlight API. */
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


/**
 * Builds the controller for one host. `readSelection` is the shipped seam, so the
 * card is opened for exactly the boundaries the test controls, while the host, the
 * stylesheet, the mount, the placement write and the whole create path stay real.
 *
 * `rectOf` replaces only the box the fragment measurement reports, which is how a
 * test drives the two rulings about measurement: a zero-area box (`A65`) and a
 * measurement that throws because the page shrank the text node (`A64`).
 *
 * The `paintedEntries` option is the output of the last `paint pass` — the only page
 * description the controller consults for the `contained own selection` silence of
 * ruling `A103`. A fixture runs that pass only when its case asks for it (`paint()`), so
 * every other case here answers with an empty painted list and behaves as Flow 1 always
 * did.
 */
function mount(captured: CapturedSelection | null, rectOf?: RectOf): Fixture {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    throw new Error('jsdom is the top frame, so the host must exist');
  }
  const port = new MemoryStoragePort();
  const created: Entry[] = [];
  const measured: Array<{ node: Node; start: number; end: number }> = [];
  const rangeFor: RangeForFragment = (node, start, end) => {
    measured.push({ node, start, end });
    const rect = rectOf === undefined ? FRAGMENT_BOX : rectOf(node, start, end);
    return { getBoundingClientRect: () => rect };
  };
  // The card is handed the output of a real pass over this fixture's own port, and the
  // pass runs only when a case asks for it. Its measurement seam is deliberately not the
  // recording one above: `measured` is the card's span capture, and a case that asserts
  // "the capture measured exactly this range" must not be polluted by a paint pass.
  let painted: readonly PaintedEntry[] = [];
  const painter = createPagePainter(document, {
    port,
    url: () => PAGE_URL,
    surface: new RecordingSurface(),
    rangeFor: () => ({ getBoundingClientRect: () => FRAGMENT_BOX }),
  });
  const cardOptions: CreateCardOptions = {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => STAMP,
    rng: () => 0.5,
    readSelection: () => captured,
    paintedEntries: (): readonly PaintedEntry[] => painted,
    rangeFor,
    viewport: () => VIEWPORT,
    onCreated: (entry: Entry): void => {
      created.push(entry);
    },
  };
  const controller = createCreateCardController(document, overlay, cardOptions);
  return {
    overlay,
    port,
    controller,
    created,
    measured,
    paint: async (): Promise<readonly PaintedEntry[]> => {
      await painter.refresh();
      painted = painter.paintedEntries();
      return painted;
    },
  };
}

/** The one card element inside the shadow root, or `null`. */
function cardOf(overlay: OverlayHost): Element | null {
  return overlay.root.querySelector(`.${CARD_CLASS}`);
}

function needCard(overlay: OverlayHost): Element {
  const card = cardOf(overlay);
  if (card === null) {
    throw new Error('expected the card to be mounted in the shadow root');
  }
  return card;
}

function inputOf(overlay: OverlayHost): HTMLTextAreaElement {
  const field = overlay.root.querySelector(`.${CARD_INPUT_CLASS}`);
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error('expected the card input inside the shadow root');
  }
  return field;
}

function saveButtonOf(overlay: OverlayHost): HTMLButtonElement {
  const button = overlay.root.querySelector(`.${CARD_CLASS} button`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('expected the save button inside the shadow root');
  }
  return button;
}

/**
 * The action button of the card whose accessible name is `name` (ruling `A114`):
 * since the row became icon-only, `aria-label` is the only handle a test has on one
 * of these controls, because the button holds no text node any more.
 */
function actionButtonOf(overlay: OverlayHost, name: string): HTMLButtonElement {
  const button = [...overlay.root.querySelectorAll(`.${CARD_ACTIONS_CLASS} button`)].find(
    (candidate: Element) => candidate.getAttribute('aria-label') === name,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`expected the ${name} button inside the shadow root`);
  }
  return button;
}

function refusalLineOf(overlay: OverlayHost): string | null {
  const line = overlay.root.querySelector(`.${CARD_REFUSAL_CLASS}`);
  return line === null ? null : (line.textContent ?? '');
}

/** Types a draft into the open card and lets the counter and Save state settle. */
async function typeDraft(overlay: OverlayHost, comment: string): Promise<void> {
  const field = inputOf(overlay);
  field.value = comment;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(2);
}

/** Presses the card's `Сохранить`, whatever state the page is in at that moment. */
async function pressSave(overlay: OverlayHost): Promise<void> {
  saveButtonOf(overlay).click();
  await settle();
}

async function typeAndSave(overlay: OverlayHost, comment: string): Promise<void> {
  await typeDraft(overlay, comment);
  await pressSave(overlay);
}

/**
 * Sends one key press to the card's `<textarea>`, which is where a keyboard user
 * is when the card is open. The card's own handler sits on the card element, so a
 * bubbling `keydown` from the textarea reaches it exactly as it does in a browser.
 */
function pressKey(
  overlay: OverlayHost,
  key: string,
  modifier: 'ctrl' | 'meta' | null = null,
): void {
  inputOf(overlay).dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ctrlKey: modifier === 'ctrl',
      metaKey: modifier === 'meta',
    }),
  );
}

/**
 * The elements a browser would put in the tab order, in the order the shadow tree
 * holds them. A browser walks this order on `Tab`; jsdom has no `Tab` key, so a
 * test walks it with `focus()` and asserts the same sequence and the same answers.
 */
function tabOrderOf(overlay: OverlayHost): Element[] {
  return [...overlay.root.querySelectorAll('textarea, button, input, select, a[href], [tabindex]')];
}

/** The wrapper element of the card, or `null` when it was never positioned. */
function wrapperOf(overlay: OverlayHost): HTMLElement | null {
  const wrapper = overlay.root.querySelector(`.${CARD_ROOT_CLASS}`);
  return wrapper instanceof HTMLElement ? wrapper : null;
}

/** Every port write except the author-name write the fixture itself performs. */
function writesOtherThanSettings(port: MemoryStoragePort): Array<{ op: string; keys: string[] }> {
  return port.calls.filter(
    (call) => call.op !== 'get' && !(call.keys.length === 1 && call.keys[0] === SETTINGS_KEY),
  );
}

async function seedAuthor(port: MemoryStoragePort): Promise<void> {
  const saved = await saveSettings(port, { name: AUTHOR });
  if (!saved.ok) {
    throw new Error(`fixture author write refused with ${saved.code}`);
  }
}

/**
 * Stores one entry through the core write API, with the spans the page-side create
 * would hand it, so `overlap` and `duplicate` are tested against a real record
 * instead of a hand-made slot value. `authorName` defaults to the seeded settings
 * author, because a seed of **another** author is what the per-author pins of
 * ruling `A93` need.
 */
async function seedEntry(
  port: MemoryStoragePort,
  range: Range,
  comment: string,
  authorName: string = AUTHOR,
): Promise<void> {
  const stream = buildTextStream(document.body);
  const span = captureSpan(stream, range);
  if (span === null) {
    throw new Error('fixture selection produced no span');
  }
  const write = await createEntryOnPage(port, {
    url: PAGE_URL,
    text: span.anchor.text,
    comment,
    anchor: span.anchor,
    currentName: authorName,
    spans: { candidate: span.candidate, byEntryId: new Map() },
    now: STAMP,
    rng: () => 0.25,
  });
  if (!write.ok) {
    throw new Error(`fixture seed refused with ${write.code}`);
  }
}

beforeEach(() => {
  document.querySelectorAll(`#${OVERLAY_HOST_ID}`).forEach((node: Element) => node.remove());
  document.body.innerHTML = ARTICLE;
});

describe('one host, one wrapper, one stylesheet (AC1)', () => {
  it('reuses the host element and its shadow root when asked twice', () => {
    const first = ensureOverlayHost();
    const second = ensureOverlayHost();
    if (first === null || second === null) {
      throw new Error('the top frame must provide a host');
    }
    expect(second.host).toBe(first.host);
    expect(second.root).toBe(first.root);
    expect(first.root.mode).toBe('open');
    expect(document.querySelectorAll(`#${OVERLAY_HOST_ID}`)).toHaveLength(1);
  });

  it('creates one host and one card wrapper even when the capture path runs twice (AC1)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(document.querySelectorAll(`#${OVERLAY_HOST_ID}`)).toHaveLength(1);
    expect(fixture.overlay.root.querySelectorAll(`.${CARD_ROOT_CLASS}`)).toHaveLength(1);
    expect(fixture.overlay.root.querySelectorAll(`.${CARD_CLASS}`)).toHaveLength(1);

    // A closed card and a fresh capture must not add a second host, wrapper or
    // style element either: the page keeps exactly one element of the extension.
    fixture.controller.close();
    await fixture.controller.capture();
    await fixture.controller.capture();
    expect(document.querySelectorAll(`#${OVERLAY_HOST_ID}`)).toHaveLength(1);
    expect(fixture.overlay.root.querySelectorAll(`.${CARD_ROOT_CLASS}`)).toHaveLength(1);
    expect(fixture.overlay.root.querySelectorAll(`style[${CARD_STYLE_ATTRIBUTE}]`)).toHaveLength(1);
    expect(fixture.overlay.root.querySelectorAll(`.${CARD_CLASS}`)).toHaveLength(1);

    // The page gained exactly one element: everything else in it is the page's own.
    const pageElements = [...document.documentElement.children].filter(
      (element: Element) => element.id !== OVERLAY_HOST_ID,
    );
    expect(pageElements).toHaveLength(2);
  });

  it('keeps every card rule inside the shadow root and spells out the inherited properties (AC1, overlay AC11)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();

    const style = fixture.overlay.root.querySelector(`style[${CARD_STYLE_ATTRIBUTE}]`);
    if (style === null) {
      throw new Error('expected the card stylesheet inside the shadow root');
    }
    expect(style.textContent).toBe(CARD_CSS);
    for (const property of ['font-family:', 'line-height:', 'box-sizing:', 'color:']) {
      expect(CARD_CSS).toContain(property);
    }
    // The page gains no style element and no element of its own to restyle.
    expect(document.querySelectorAll('style')).toHaveLength(0);
  });
});

describe('the settings gate before the card (AC5, ruling A31)', () => {
  it('opens no card and performs no write when no name is stored', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
    expect(fixture.port.storedKeys()).toEqual([]);
    // Exactly one read of the settings key, through core (`A31`): the card neither
    // re-trims nor re-reads the stored value.
    expect(fixture.port.calls.filter((call) => call.op === 'get')).toHaveLength(1);
  });

  it('opens no card for a stored name the author rule refuses (A31, ruling A11)', async () => {
    // A stored name above the cap is non-empty and unusable: a truthiness test of
    // it would open a card that can never save.
    const fixture = mount(selection('p1', 4, 15));
    fixture.port.seed(SETTINGS_KEY, { name: 'x'.repeat(MAX_AUTHOR_NAME_CODE_POINTS + 1) });

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
  });

  it('opens one card with a live counter once a usable name is stored (AC3, overlay AC1)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(true);
    expect(inputOf(fixture.overlay).getAttribute('aria-label')).toBe(CONTENT_STRINGS.commentInput);
    const counter = fixture.overlay.root.querySelector(`.${CARD_COUNTER_CLASS}`);
    expect(counter === null ? null : counter.textContent).toBe('0/256');
    expect(saveButtonOf(fixture.overlay).disabled).toBe(true);
    expect(fixture.overlay.host.hidden).toBe(false);
  });
});

describe('a selection with no span creates nothing (AC2)', () => {
  it('opens no card for a whitespace-only selection and asks core for no write', async () => {
    document.body.innerHTML = '<p id="p1">one</p> <p id="p2">two</p>';
    const gap = document.body.childNodes[1];
    if (!(gap instanceof Text)) {
      throw new Error('fixture gap is missing');
    }
    const fixture = mount({ range: rangeIn(gap, 0, 1), root: document.body });
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
    expect(fixture.port.storedKeys()).toEqual([SETTINGS_KEY]);
  });

  it('answers a refused anchor with the content code, never with entry_invalid (A28)', async () => {
    // `buildAnchor` returning `null` means "there is no span to create", so the
    // write is never attempted and the card never learns a code that would suggest
    // the note was attempted (`t2-03` hand-over, residual risk 4).
    document.body.innerHTML = '<p id="p1">one</p> <p id="p2">two</p>';
    const gap = document.body.childNodes[1];
    if (!(gap instanceof Text)) {
      throw new Error('fixture gap is missing');
    }
    const port = new MemoryStoragePort();
    await seedAuthor(port);

    const result = await createNote({
      port,
      url: PAGE_URL,
      root: document.body,
      range: rangeIn(gap, 0, 1),
      comment: 'a note',
      authorName: AUTHOR,
      now: STAMP,
      rng: () => 0.4,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe('selection_lost');
    expect(refusalText(result.code)).toBe(REFUSAL_TEXT.selection_lost);
    expect(refusalText(result.code)).not.toBe(REFUSAL_TEXT.entry_invalid);
    expect(writesOtherThanSettings(port)).toHaveLength(0);
    expect(port.storedKeys()).toEqual([SETTINGS_KEY]);
  });

  it('places the card against the measured fragment and closes the host again', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();

    // The `Range` is fed node-local UTF-16 offsets of the selected text node, and
    // the card lands below the reported box (ruling A30: 100 + 18 + 8).
    const fragment = textOf('p1');
    expect(fixture.measured).toEqual([{ node: fragment, start: 4, end: 15 }]);
    const wrapper = fixture.overlay.root.querySelector(`.${CARD_ROOT_CLASS}`);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error('expected the positioned wrapper inside the shadow root');
    }
    expect(wrapper.style.left).toBe(`${String(FRAGMENT_BOX.left)}px`);
    expect(wrapper.style.top).toBe(`${String(FRAGMENT_BOX.top + FRAGMENT_BOX.height + 8)}px`);

    fixture.controller.close();
    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.overlay.host.hidden).toBe(true);
    expect(fixture.overlay.host.getAttribute('style')).toContain('display: none');
  });

  it('reports a moved selection as a change and the same selection as none (A32)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();

    expect(fixture.controller.selectionMovedElsewhere(null)).toBe(false);
    expect(fixture.controller.selectionMovedElsewhere(rangeIn(textOf('p1'), 4, 15))).toBe(false);
    expect(fixture.controller.selectionMovedElsewhere(rangeIn(textOf('p1'), 6, 19))).toBe(true);
    expect(fixture.controller.selectionMovedElsewhere(rangeIn(textOf('p2'), 0, 6))).toBe(true);
  });
});

describe('Сохранить goes through the core write path (AC4)', () => {
  it('stores one entry, reports it to the paint stage and closes the card', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, '  my note  ');

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(fixture.overlay.host.hidden).toBe(true);

    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].text).toBe('quick brown');
    expect(page.entries[0].comment).toBe('my note');
    expect(page.entries[0].authorName).toBe(AUTHOR);
    expect(page.entries[0].createdAt).toBe(STAMP);
    expect(page.entries[0].anchor.text).toBe(page.entries[0].text);

    expect(fixture.created).toHaveLength(1);
    expect(fixture.created[0].id).toBe(page.entries[0].id);

    // Only core wrote, and it wrote its own two keys in its own order: the content
    // layer built no slot value and touched no other key (`t2-01` remark R6).
    const writes = fixture.port.calls.filter((call) => call.op === 'set');
    expect(writes).toHaveLength(3);
    expect(writes[0].keys).toEqual([SETTINGS_KEY]);
    expect(writes[1].keys).toHaveLength(1);
    const slotKey = writes[1].keys[0];
    expect(isEntryStorageKey(slotKey)).toBe(true);
    expect(writes[2].keys).toEqual([PAGE_INDEX_KEY]);
    expect(fixture.port.snapshot()[slotKey]).toEqual({
      version: 1,
      entries: [page.entries[0]],
    });
  });

  it('refuses an intersecting selection with the overlap sentence and stores nothing new (AC5, A47)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'first note');

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'second note');

    expect(refusalLineOf(fixture.overlay)).toBe(REFUSAL_TEXT.overlap);
    expect(fixture.controller.isOpen()).toBe(true);
    expect(inputOf(fixture.overlay).value).toBe('second note');
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(fixture.created).toEqual([]);
  });

  it('refuses the same note on the same span as a duplicate, in its own words (A47)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'same note');

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'same note');

    const line = refusalLineOf(fixture.overlay);
    expect(line).toBe(REFUSAL_TEXT.duplicate);
    expect(line).not.toBe(REFUSAL_TEXT.overlap);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
  });

  it('lets a create through over the span of another reader, identical comment and all (t5-01, A93)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'same note', FOREIGN_AUTHOR);

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'same note');

    // Equal resolved range AND equal normalized comment, but the stored entry
    // belongs to another reader: neither `duplicate` nor `overlap` answers, and no
    // refusal sentence appears (`A93`; the sentences themselves are unchanged, `A47`).
    expect(refusalLineOf(fixture.overlay)).toBeNull();
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(2);
    expect(page.entries.map((entry: Entry) => entry.authorName)).toEqual([FOREIGN_AUTHOR, AUTHOR]);
    expect(page.entries.map((entry: Entry) => entry.comment)).toEqual(['same note', 'same note']);
    expect(page.entries[0]?.text).toBe(page.entries[1]?.text);
  });

  it('lets a create through over an intersecting foreign span and still refuses an own one (t5-01, A93)', async () => {
    const foreignFixture = mount(selection('p1', 4, 15));
    await seedAuthor(foreignFixture.port);
    await seedEntry(foreignFixture.port, rangeIn(textOf('p1'), 0, 10), 'foreign half', FOREIGN_AUTHOR);

    await foreignFixture.controller.capture();
    await typeAndSave(foreignFixture.overlay, 'my half');

    const foreignPage = await loadEntries(foreignFixture.port, PAGE_URL);
    expect(refusalLineOf(foreignFixture.overlay)).toBeNull();
    expect(foreignPage.entries).toHaveLength(2);

    // The control: the same overlapping candidate against an entry of the current
    // author keeps the `overlap` sentence, so only the author changed.
    const ownFixture = mount(selection('p1', 4, 15));
    await seedAuthor(ownFixture.port);
    await seedEntry(ownFixture.port, rangeIn(textOf('p1'), 0, 10), 'my other note');

    await ownFixture.controller.capture();
    await typeAndSave(ownFixture.overlay, 'my half');

    expect(refusalLineOf(ownFixture.overlay)).toBe(REFUSAL_TEXT.overlap);
    const ownPage = await loadEntries(ownFixture.port, PAGE_URL);
    expect(ownPage.entries).toHaveLength(1);
  });

  it('lets a create through when the only existing entry of the page went stale (A24)', async () => {
    // The entry is stored while its text is on the page, the page then removes that
    // text, and the stale entry contributes no resolved range to the create, so it
    // can no longer block one (`A24`); it stays stored and deletable.
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p2'), 0, 6), 'gone text');
    const movedAway = document.getElementById('p2');
    if (movedAway === null) {
      throw new Error('fixture paragraph is missing');
    }
    movedAway.remove();

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'a note');

    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(2);
    expect(fixture.created).toHaveLength(1);
  });
});

describe('the contained own selection opens nothing (t5-03 AC4, AC5, AC6; ruling `A103`)', () => {
  it('opens no card, and asks the store for no write, for a selection wholly inside the reader’s own painted note', async () => {
    const fixture = mount(selection('p1', 5, 12));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'the note I wrote here');
    const painted = await fixture.paint();
    // The page really holds the note: without this the case would pass because nothing
    // is painted, which is a different answer from "this selection is inside your own".
    expect(painted.map((paintedEntry: PaintedEntry) => paintedEntry.entry.text)).toEqual([
      'quick brown',
    ]);
    const callsBeforeCapture = fixture.port.calls.length;

    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    // The silence comes before the mount and before the create path: the host is not
    // taken, the span is not measured a second time, and no `set` of any kind runs.
    expect(fixture.overlay.host.hidden).toBe(true);
    expect(fixture.measured).toEqual([]);
    const asked = fixture.port.calls.slice(callsBeforeCapture);
    expect(asked.filter((call) => call.op !== 'get')).toEqual([]);
    const after = await loadEntries(fixture.port, PAGE_URL);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.comment).toBe('the note I wrote here');
  });

  it('opens the card for a selection wholly inside a foreign note, because the silence is per author (AC5, A103, A93)', async () => {
    const fixture = mount(selection('p1', 5, 12));
    await seedAuthor(fixture.port);
    await seedEntry(
      fixture.port,
      rangeIn(textOf('p1'), 4, 15),
      'a note somebody else wrote',
      FOREIGN_AUTHOR,
    );
    const painted = await fixture.paint();
    expect(painted.map((paintedEntry: PaintedEntry) => paintedEntry.entry.authorName)).toEqual([
      FOREIGN_AUTHOR,
    ]);

    await fixture.controller.capture();

    // Ruling `A93` stands: the foreign note is neither a blocker nor an owner of these
    // words for this reader, so the card opens exactly as it did before `A103`.
    expect(fixture.controller.isOpen()).toBe(true);
    expect(cardOf(fixture.overlay)).not.toBeNull();
  });

  it('opens the card for a selection that only crosses the boundary of the reader’s own note, and its save is refused by the own-author overlap rule (AC6, A103, A100)', async () => {
    // `'The quick'` from offset 2 to 10 against an own note at 4 to 15: the selection is
    // not contained, so the card opens; it intersects the own note, so the save is
    // refused. The two rules stay separate, and AC6 is pinned by the pair: opening does
    // not imply storing.
    const fixture = mount(selection('p1', 2, 10));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'the note I wrote here');
    const painted = await fixture.paint();
    expect(painted).toHaveLength(1);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);

    await typeAndSave(fixture.overlay, 'a draft that crosses my own note');

    expect(refusalLineOf(fixture.overlay)).toBe(REFUSAL_TEXT.overlap);
    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.created).toEqual([]);
    const after = await loadEntries(fixture.port, PAGE_URL);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.comment).toBe('the note I wrote here');
  });
});

describe('the card keeps the user draft through a refusal (AC3, AC5)', () => {
  it('shows the sentence of the code and keeps typing possible afterwards', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 4, 15), 'first note');

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'second note');
    expect(refusalLineOf(fixture.overlay)).toBe(REFUSAL_TEXT.overlap);

    const field = inputOf(fixture.overlay);
    field.value = 'second note, reworded';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(2);
    expect(refusalLineOf(fixture.overlay)).toBeNull();
    expect(saveButtonOf(fixture.overlay).disabled).toBe(false);
    expect(needCard(fixture.overlay).contains(field)).toBe(true);
  });
});

describe('a page whose text carries an astral character before the selection (t3-01b AC2)', () => {
  /**
   * `t3-01` review finding 1: the span was trimmed with a UTF-16 probe of a
   * code-point range, so one astral character earlier in the stream took the first
   * character off the stored note, could degenerate the range of a short selection
   * (no card at all, or `selection_lost` at save), and left a stream separator
   * inside a span so that the same re-selection was refused as `overlap` instead of
   * `duplicate` (`A23`). These are the end-to-end forms of the three consequences;
   * `tests/content-selection-capture.spec.ts` pins the number domain itself.
   */
  it('opens the card for a one-word selection and stores the whole word', async () => {
    document.body.innerHTML = '<article id="art"><p id="p1">\u{1F600} alpha</p></article>';
    const fixture = mount(selection('p1', 3, 8));
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);

    await typeAndSave(fixture.overlay, 'first note');
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].text).toBe('alpha');
    expect(page.entries[0].anchor.text).toBe('alpha');
  });

  it('opens the card for a one-character word after an astral character', async () => {
    // The shortest selection the old trim could destroy: its range became empty, so
    // no card opened and a save could only answer `selection_lost`.
    document.body.innerHTML = '<article id="art"><p id="p1">\u{1F600} a</p></article>';
    const fixture = mount(selection('p1', 3, 4));
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(cardOf(fixture.overlay)).not.toBeNull();

    await typeAndSave(fixture.overlay, 'short note');
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries[0].text).toBe('a');
  });

  it('refuses a re-selection of the same text as a duplicate, not an overlap (A23)', async () => {
    // The click caught the space before the words, which is the case the old trim
    // left un-trimmed on such a page: the candidate then covered one code point more
    // than the range of the stored entry, so `sameRange` answered false and the user
    // was told about an intersection instead of about the note they repeated.
    document.body.innerHTML =
      '<article id="art"><p id="p1">\u{1F600} The quick brown fox jumps</p></article>';
    const sameSelection = () => selection('p1', 6, 18);
    expect(sameSelection().range.toString()).toBe(' quick brown');

    const fixture = mount(sameSelection());
    await seedAuthor(fixture.port);
    await seedEntry(fixture.port, rangeIn(textOf('p1'), 6, 18), 'same note');

    await fixture.controller.capture();
    await typeAndSave(fixture.overlay, 'same note');

    const line = refusalLineOf(fixture.overlay);
    expect(line).toBe(REFUSAL_TEXT.duplicate);
    expect(line).not.toBe(REFUSAL_TEXT.overlap);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].text).toBe('quick brown');
  });
});

describe('a measurement that throws leaves the card closed (ruling A64)', () => {
  it('mounts nothing, positions nothing and writes nothing when the node shrank', async () => {
    // `Range.setStart` rejects when the page shortened the text node between the
    // settle delay and the measurement. The card must not end up mounted without
    // coordinates, and no write may be attempted for a selection that is gone.
    const fixture = mount(selection('p1', 4, 15), (): Box => {
      throw new Error("Failed to execute 'setStart' on 'Range': IndexSizeError");
    });
    await seedAuthor(fixture.port);

    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(fixture.overlay.host.hidden).toBe(true);
    // The wrapper element exists, but it was never given a position: the card was
    // never revealed at the corner of the host.
    const wrapper = wrapperOf(fixture.overlay);
    if (wrapper === null) {
      throw new Error('expected the card wrapper to exist');
    }
    expect(wrapper.style.left).toBe('');
    expect(wrapper.style.top).toBe('');
    // The measurement was attempted once, and nothing after it happened.
    expect(fixture.measured).toHaveLength(1);
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
    expect(fixture.port.storedKeys()).toEqual([SETTINGS_KEY]);
  });
});

describe('an open card is reachable by the keyboard (t3-02b AC1, t3-01 remark 4)', () => {
  /**
   * Ruling `A111` (task `t6-01` AC1) restores the `A74` half for this path: opening the
   * card makes **no focus call at all**, so the page keeps the element it had focused.
   * This pin is that `A74` pin **again** — same fixture, same page element focused first
   * — after `A97` had inverted it for one task and `A111` narrowed `A97` to the
   * `editor`. The recorder runs across the whole open, so the proof is a **count of
   * zero**, not an absence of evidence. The caret reaches the field only through the
   * typing door of ruling `A112`, and the `Tab` order of the three controls is untouched,
   * because no control gained a `tabindex` (`t5-04` AC6, `t6-02` AC5).
   */
  it('opens with the page focus exactly where it was, and no focus call at all (A111, t6-01 AC1)', async () => {
    const article = document.getElementById('art');
    if (article === null) {
      throw new Error('fixture article is missing');
    }
    const pageButton = document.createElement('button');
    pageButton.id = 'page-cta';
    pageButton.textContent = 'Read more';
    article.append(pageButton);
    pageButton.focus();
    expect(document.activeElement).toBe(pageButton);

    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      await fixture.controller.capture();

      // The card really is open — and it opened without touching the caret. The page's
      // own button is still the document's answer, the shadow tree answers no active
      // element of its own, and the note field is a field the reader has to `Tab` into.
      // The host itself is never focused: the card does not ask for a focus at all.
      expect(fixture.controller.isOpen()).toBe(true);
      expect(cardOf(fixture.overlay)).not.toBeNull();
      expect(document.activeElement).toBe(pageButton);
      expect(fixture.overlay.root.activeElement).toBeNull();
      expect(fixture.overlay.root.activeElement).not.toBe(inputOf(fixture.overlay));
      // The negative proof, as a count: the recorder was running over the whole
      // `capture()` — mount, reveal, placement — and saw nothing.
      expect(recorder.calls()).toEqual([]);
    } finally {
      recorder.restore();
    }
  });

  it('renders textarea, then the Сохранить button, as the rendered tab order (A114)', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    // A draft first: `Сохранить` is disabled while the comment is empty, and a
    // disabled control is out of the tab order, so the order is read with the
    // button in its usable state.
    await typeDraft(fixture.overlay, 'my note');

    const order = tabOrderOf(fixture.overlay);
    // Ruling `A114` took the third control away: the row is one icon-only button, and
    // no `tabindex` was added to replace it, so the rendered order lost one step.
    expect(order).toHaveLength(2);
    expect(order.map((element: Element) => element.tagName)).toEqual(['TEXTAREA', 'BUTTON']);
    expect(order[0]).toBe(inputOf(fixture.overlay));
    expect(order[1]).toBe(actionButtonOf(fixture.overlay, CONTENT_STRINGS.save));
    for (const element of order) {
      expect((element as HTMLButtonElement).disabled).toBe(false);
    }

    // Nothing re-orders the sequence and nothing opts a control out of it: the tab
    // order is the DOM order, because no element carries a `tabindex` of its own.
    for (const element of order) {
      expect(element.getAttribute('tabindex')).toBeNull();
    }
    expect(fixture.overlay.root.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(fixture.overlay.host.getAttribute('tabindex')).toBeNull();

    // Each control in that order really takes focus, and the page only ever sees
    // the single host answer `document.activeElement` (shadow retargeting), which
    // is the same isolation AC1 of `t3-01` pins for the element count.
    for (const element of order) {
      (element as HTMLElement).focus();
      expect(fixture.overlay.root.activeElement).toBe(element);
      expect(document.activeElement).toBe(fixture.overlay.host);
    }
  });

  it('cancels on Escape: the card closes, the host hides and nothing is written', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    await typeDraft(fixture.overlay, 'draft');

    pressKey(fixture.overlay, 'Escape');
    await settle();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(fixture.overlay.host.hidden).toBe(true);
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(0);
  });

  it('saves on Ctrl+Enter through the real create path', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    await typeDraft(fixture.overlay, 'my note');

    pressKey(fixture.overlay, 'Enter', 'ctrl');
    await settle();

    expect(fixture.controller.isOpen()).toBe(false);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].comment).toBe('my note');
    expect(page.entries[0].text).toBe('quick brown');
    expect(fixture.created).toHaveLength(1);
  });

  it('saves on Cmd+Enter as well', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    await typeDraft(fixture.overlay, 'my note');

    pressKey(fixture.overlay, 'Enter', 'meta');
    await settle();

    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    expect(refusalLineOf(fixture.overlay)).toBeNull();
  });
});

describe('the card takes no focus and hands nothing back (A111, t6-01 AC1; the rewritten t5-04 AC3, AC4 pins)', () => {
  /**
   * The page control the reader had focused before the selection. Each case focuses one
   * first: since ruling `A111` the promise **about that element** is that the card
   * leaves it alone, so a fixture in which nothing was focused could not show what was
   * not done. Before `A111` these cases pinned the opposite — that the card took the
   * caret and gave it back (`t5-04` AC3, AC4) — and every pin in this block is that
   * earlier pin rewritten in place, not a deletion.
   */
  function pageControl(id: string): HTMLElement {
    const article = document.getElementById('art');
    if (article === null) {
      throw new Error('fixture article is missing');
    }
    const control = document.createElement('button');
    control.id = id;
    control.textContent = 'Read more';
    article.append(control);
    control.focus();
    return control;
  }

  /**
   * Opens one card over a page that holds a focused control, and states the A111 half
   * while it is at it: the card is open, its own field holds no caret, and the page's
   * control is still the document's answer.
   */
  async function openCard(fixture: Fixture, control: HTMLElement): Promise<void> {
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.overlay.root.activeElement).toBeNull();
    expect(document.activeElement).toBe(control);
  }

  it('makes no focus call when it opens, so `preventScroll` has no call to ride on (A111, t6-01 AC1; the rewritten t5-04 AC3 pin)', async () => {
    const control = pageControl('page-cta-none');
    const fixture = mount(selection('p1', 4, 15));
    // `t5-04` AC3 pinned the **shape** of a call this card no longer makes. Ruling `A111`
    // leaves that pin with one observable half, and it is the stronger one: the recorder
    // over `HTMLElement.prototype.focus` sees **zero** calls across the whole open, and
    // the page's own element is still the document's active element. The `preventScroll`
    // call shape stays pinned for the widget that does focus — see
    // `tests/content-editor-controller.spec.ts` and `tests/content-focus-handoff.spec.ts`.
    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      await openCard(fixture, control);

      expect(recorder.calls()).toEqual([]);
      expect(recorder.callsOn(inputOf(fixture.overlay))).toEqual([]);
      expect(document.activeElement).toBe(control);
      expect(fixture.overlay.host.getAttribute('tabindex')).toBeNull();
    } finally {
      recorder.restore();
    }
  });

  it('keeps the page control focused through a press outside, Esc and a successful save (A111, t6-01 AC1; the rewritten t5-04 AC4 pin)', async () => {
    // Ruling `A114` removed the cancel button that used to be this loop's first case, so
    // the first case is now the other way out of a card whose widget holds no close
    // control: a `pointerdown` outside the overlay host. The asserted outcome is the one
    // the deleted pin asserted — a closed, hidden card and no focus call of any kind.
    for (const [index, close] of ['outside', 'esc', 'save'].entries()) {
      const control = pageControl(`page-cta-${String(index)}`);
      const fixture = mount(selection('p1', 4, 15));
      await openCard(fixture, control);
      await typeDraft(fixture.overlay, 'a note of some length');
      // The draft is typed into a field the reader never got a caret in, and the page
      // control still answers the document.
      expect(document.activeElement).toBe(control);
      expect(fixture.overlay.root.activeElement).toBeNull();

      // The page wiring belongs to the case, is attached before the recorder starts, and
      // is detached again in it: the controller fixture owns no listeners.
      const detach =
        close === 'outside'
          ? attachCreateCardEvents(fixture.controller, document, window, fixture.overlay.host)
          : () => undefined;
      const recorder: FocusCallRecorder = recordFocusCalls();
      try {
        if (close === 'outside') {
          document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await settle();
        } else if (close === 'esc') {
          pressKey(fixture.overlay, 'Escape');
          await settle();
        } else {
          await pressSave(fixture.overlay);
        }

        expect(fixture.controller.isOpen()).toBe(false);
        expect(fixture.overlay.host.hidden).toBe(true);
        // Nothing to hand back: the close of a card that never took the caret makes no
        // focus call at all, and the page control answers the document throughout.
        expect(recorder.calls()).toEqual([]);
        expect(document.activeElement).toBe(control);
        expect(fixture.overlay.root.activeElement).toBeNull();
        expect(fixture.overlay.host.getAttribute('tabindex')).toBeNull();
      } finally {
        recorder.restore();
        detach();
      }
    }
  });

  it('takes no focus and hands nothing back when a page event closes the card (A111, t6-01 AC1; the rewritten t5-04 AC4 and t5-05 carried 4 pins)', async () => {
    // The two close paths that carry no button press: a `pointerdown` outside the overlay
    // host and a page scroll (`src/content/overlay/card-events.ts`, ruling `A32`). They go
    // through the same `close()` as `Esc`, so ruling `A111` leaves them the same
    // negative proof it left the button paths. The page wiring is attached for the case
    // and detached again in it: the controller fixture owns no listeners, and
    // `card-events.ts` is not changed by this task — the pin proves the construction.
    for (const [index, close] of ['pointerdown', 'scroll'].entries()) {
      const control = pageControl(`page-cta-event-${String(index)}`);
      const fixture = mount(selection('p1', 4, 15));
      await openCard(fixture, control);
      await typeDraft(fixture.overlay, 'a note the reader never saved');

      const detach = attachCreateCardEvents(
        fixture.controller,
        document,
        window,
        fixture.overlay.host,
      );
      const recorder: FocusCallRecorder = recordFocusCalls();
      try {
        if (close === 'pointerdown') {
          document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        } else {
          window.dispatchEvent(new Event('scroll'));
        }
        await settle();

        expect(fixture.controller.isOpen()).toBe(false);
        expect(fixture.overlay.host.hidden).toBe(true);
        expect(fixture.overlay.root.activeElement).toBeNull();
        expect(document.activeElement).toBe(control);
        // Not one focus call ran after the recorder was on: an event-driven close closes
        // a card that never had the caret, so it restores nothing and invents nothing.
        expect(recorder.calls()).toEqual([]);
        // A close is not a write (ruling `A32`): the port saw nothing but reads.
        expect(writesOtherThanSettings(fixture.port)).toEqual([]);
      } finally {
        recorder.restore();
        detach();
      }
    }
  });

  it('makes no focus call at all when the page control is removed while the card stands (A111, t6-01 AC1)', async () => {
    const control = pageControl('page-cta-gone');
    const fixture = mount(selection('p1', 4, 15));
    await openCard(fixture, control);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      // The page removed the control while the card stood — a re-rendered reader pane is
      // the normal way this happens. The card never took the caret from it, so the close
      // has nothing to hand back and nothing to substitute.
      control.remove();
      pressKey(fixture.overlay, 'Escape');
      await settle();

      expect(fixture.controller.isOpen()).toBe(false);
      expect(fixture.overlay.root.activeElement).toBeNull();
      // Nothing was forced: the recorder was already running when the close ran, and it
      // saw no call at all — no `body`, no `documentElement`, no shadow host, no detached
      // control. What the document answers is the browser's own default.
      expect(recorder.calls()).toEqual([]);
      expect(document.activeElement).not.toBe(control);
      expect(document.activeElement).not.toBe(fixture.overlay.host);
      expect(document.activeElement).not.toBe(document.documentElement);
    } finally {
      recorder.restore();
    }
  });

  it('hands nothing back when the caret stood inside the card at the close (A111, t6-01 AC1)', async () => {
    // The caret stands inside the card **without** the typing door — the case focuses the
    // field by hand, which is what any route that is not a printable keystroke looks like
    // to this controller. There is no handover on this path: the controller's `open` was
    // never called, so the close makes no focus call, restores nothing and invents
    // nothing — where the caret goes when its field is unmounted is the browser's answer,
    // not a decision of this controller. This is also the pin that proves the card's
    // `focus.restore()` in `close()` is inert without a typing entry (`A111`, `A112`).
    const control = pageControl('page-cta-inside');
    const fixture = mount(selection('p1', 4, 15));
    await openCard(fixture, control);
    const field = inputOf(fixture.overlay);
    field.focus();
    expect(fixture.overlay.root.activeElement).toBe(field);
    expect(document.activeElement).toBe(fixture.overlay.host);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      pressKey(fixture.overlay, 'Escape');
      await settle();

      expect(fixture.controller.isOpen()).toBe(false);
      expect(fixture.overlay.root.activeElement).toBeNull();
      expect(recorder.calls()).toEqual([]);
      expect(document.activeElement).not.toBe(control);
      expect(document.activeElement).not.toBe(field);
    } finally {
      recorder.restore();
    }
  });
});

describe('a card the reader typed into hands the caret back (t6-02 AC5, AC6; rulings A112, A105)', () => {
  /**
   * The page control the reader had focused before the selection. It is also the element
   * the typing door records, because the door opens at the keystroke and not at the
   * open: the promise of `A105`, applied to this card by ruling `A112`, is that a close
   * hands the caret back to what the page held **before that keystroke**.
   */
  function pageControl(id: string): HTMLElement {
    const article = document.getElementById('art');
    if (article === null) {
      throw new Error('fixture article is missing');
    }
    const control = document.createElement('button');
    control.id = id;
    control.textContent = 'Read more';
    article.append(control);
    control.focus();
    if (document.activeElement !== control) {
      throw new Error('the fixture page control is not the document answer');
    }
    return control;
  }

  /**
   * Opens one card and then enters it the way a reader does: the controller is asked for
   * the caret **after** the open, at the keystroke. Which keystroke asks is pinned in
   * `tests/content-card-events.spec.ts`; here the question is what the open handover
   * costs and what it gives back. The recorder of the entry itself is local and closed
   * again, so every case below starts with an empty recorder.
   */
  async function openTypedCard(fixture: Fixture, control: HTMLElement): Promise<void> {
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(document.activeElement).toBe(control);

    const entryRecorder: FocusCallRecorder = recordFocusCalls();
    try {
      fixture.controller.takeCaretForTyping();
      expect(fixture.overlay.root.activeElement).toBe(inputOf(fixture.overlay));
      expect(document.activeElement).toBe(fixture.overlay.host);
      expect(entryRecorder.callsOn(inputOf(fixture.overlay))).toHaveLength(1);
      expect(entryRecorder.callsOn(inputOf(fixture.overlay))[0]?.options).toEqual({
        preventScroll: true,
      });
    } finally {
      entryRecorder.restore();
    }
  }

  // `Esc` and `Ctrl/Cmd+Enter` still answer an open card whose caret arrived by typing
  // (`t3-02b` AC1, `t5-04` AC5, AC6 rewritten for this path), and the rendered order is
  // still the tab order because ruling `A112` added no `tabindex` and intercepted no key.
  it('keeps the rendered order as the tab order after the door opened (t6-02 AC5)', async () => {
    const control = pageControl('page-typed-order');
    const fixture = mount(selection('p1', 4, 15));
    await openTypedCard(fixture, control);
    await typeDraft(fixture.overlay, 'a note of some length');

    const order = tabOrderOf(fixture.overlay);
    // Ruling `A114` is the second removal this pin absorbs: the door of `A112` added no
    // `tabindex`, and the compact row of `A114` left one control instead of two.
    expect(order).toHaveLength(2);
    expect(order[0]).toBe(inputOf(fixture.overlay));
    expect(order[1]).toBe(actionButtonOf(fixture.overlay, CONTENT_STRINGS.save));
    for (const element of order) {
      expect(element.getAttribute('tabindex')).toBeNull();
    }
    expect(fixture.overlay.root.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(fixture.overlay.host.getAttribute('tabindex')).toBeNull();
  });

  it('closes on Esc and writes nothing after the door opened (t6-02 AC5)', async () => {
    const control = pageControl('page-typed-esc');
    const fixture = mount(selection('p1', 4, 15));
    await openTypedCard(fixture, control);
    await typeDraft(fixture.overlay, 'a note nobody saved');

    pressKey(fixture.overlay, 'Escape');
    await settle();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.created).toHaveLength(0);
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
    // AC6 in the same breath: the caret went back to the page element.
    expect(document.activeElement).toBe(control);
  });

  it('saves on Ctrl+Enter after the door opened (t6-02 AC5)', async () => {
    const control = pageControl('page-typed-ctrl-enter');
    const fixture = mount(selection('p1', 4, 15));
    await openTypedCard(fixture, control);
    await typeDraft(fixture.overlay, 'a note saved by a keystroke');

    pressKey(fixture.overlay, 'Enter', 'ctrl');
    await settle();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.created).toHaveLength(1);
    expect(document.activeElement).toBe(control);
  });

  // `A105` on the card path, once the card took the caret: every close path hands it back,
  // with the same `preventScroll` the entry call carried, and nothing is invented when the
  // page element is gone.
  for (const [index, close] of ['outside', 'esc', 'save'].entries()) {
    it(`a card typed into hands the caret back on the ${close} close (t6-02 AC6)`, async () => {
      const control = pageControl(`page-typed-close-${String(index)}`);
      const fixture = mount(selection('p1', 4, 15));
      await openTypedCard(fixture, control);
      await typeDraft(fixture.overlay, 'a note of some length');

      // The `outside` case drives the close path that replaced the cancel button of the
      // deleted pin (`A114`); the asserted outcome is unchanged.
      const detach =
        close === 'outside'
          ? attachCreateCardEvents(fixture.controller, document, window, fixture.overlay.host)
          : () => undefined;
      const recorder: FocusCallRecorder = recordFocusCalls();
      try {
        if (close === 'outside') {
          document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await settle();
        } else if (close === 'esc') {
          pressKey(fixture.overlay, 'Escape');
          await settle();
        } else {
          await pressSave(fixture.overlay);
        }

        expect(fixture.controller.isOpen()).toBe(false);
        expect(fixture.overlay.host.hidden).toBe(true);
        expect(fixture.overlay.root.activeElement).toBeNull();
        expect(document.activeElement).toBe(control);
        const calls = recorder.callsOn(control);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.options).toEqual({ preventScroll: true });
      } finally {
        recorder.restore();
        detach();
      }
    });
  }

  it('hands the caret back when a page event closes a card typed into (t6-02 AC6)', async () => {
    // The two close paths that carry no button press (`src/content/overlay/card-events.ts`,
    // ruling `A32`): they run the same `close()` as `Esc`, so ruling `A112` gives them
    // the same restore. The page wiring belongs to the case and is detached in it.
    for (const [index, close] of ['pointerdown', 'scroll'].entries()) {
      const control = pageControl(`page-typed-event-${String(index)}`);
      const fixture = mount(selection('p1', 4, 15));
      await openTypedCard(fixture, control);

      const detach = attachCreateCardEvents(
        fixture.controller,
        document,
        window,
        fixture.overlay.host,
      );
      const recorder: FocusCallRecorder = recordFocusCalls();
      try {
        if (close === 'pointerdown') {
          document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        } else {
          window.dispatchEvent(new Event('scroll'));
        }
        await settle();

        expect(fixture.controller.isOpen()).toBe(false);
        expect(fixture.overlay.host.hidden).toBe(true);
        expect(document.activeElement).toBe(control);
        expect(recorder.callsOn(control)).toHaveLength(1);
        // A close is not a write (ruling `A32`).
        expect(writesOtherThanSettings(fixture.port)).toEqual([]);
      } finally {
        recorder.restore();
        detach();
      }
    }
  });

  it('forces nothing when the page control left the document (t6-02 AC6, A105)', async () => {
    const control = pageControl('page-typed-gone');
    const fixture = mount(selection('p1', 4, 15));
    await openTypedCard(fixture, control);

    const recorder: FocusCallRecorder = recordFocusCalls();
    try {
      control.remove();
      pressKey(fixture.overlay, 'Escape');
      await settle();

      expect(fixture.controller.isOpen()).toBe(false);
      // No substitute: no `body`, no `documentElement`, no shadow host, no detached
      // control. The recorder was running when the close ran, and it saw nothing.
      expect(recorder.calls()).toEqual([]);
      expect(document.activeElement).not.toBe(control);
      expect(document.activeElement).not.toBe(fixture.overlay.host);
      expect(document.activeElement).not.toBe(document.documentElement);
    } finally {
      recorder.restore();
    }
  });
});

describe('the page moved its words between the open and the save (t3-02b AC2, ruling A29)', () => {
  /**
   * Ruling `A29` says the save re-derives the span against a stream built at that
   * moment, and the card keeps the selection's **boundaries**, never a snapshot of
   * the page. The only way to see the difference is a page that changed **between
   * `open()` and `Сохранить`**:
   *
   * - a block appeared in front of the selected paragraph, so the anchor window the
   *   open measured is no longer the window the page has;
   * - a word appeared **inside** the selected words (a lazily rendered inline
   *   gloss). A live `Range` follows a `CharacterData` replacement — a boundary
   *   inside the replaced region snaps to its start, a boundary after it moves by
   *   the length difference, which is the DOM spec's replace-data rule — so the
   *   boundaries the card kept now cover one word more.
   *
   * Afterwards the open-time wording is nowhere in the page: a span or an anchor
   * remembered from the open could not produce this record, and a save that
   * re-derived against a stream of its own moment has to produce exactly it.
   */
  it('stores the span the mutated document gives, not the one measured at open', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    // The open-time measurement, read off the controller's own measurement seam:
    // the card measured node-local offsets 4..15, which covered "quick brown".
    expect(fixture.measured).toEqual([{ node: textOf('p1'), start: 4, end: 15 }]);
    await typeDraft(fixture.overlay, 'my note');

    const article = document.getElementById('art');
    const firstParagraph = document.getElementById('p1');
    if (article === null || firstParagraph === null) {
      throw new Error('fixture article is missing');
    }
    const lead = document.createElement('p');
    lead.textContent = 'Advertisement: a word before';
    article.insertBefore(lead, firstParagraph);
    textOf('p1').insertData(10, 'very '); // before "brown", inside the selected words

    await pressSave(fixture.overlay);

    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(1);
    const entry = page.entries[0];
    expect(entry.comment).toBe('my note');
    // The words the kept boundaries cover **now** — not the words measured when the
    // card opened — and a context window read off the mutated stream.
    expect(entry.text).toBe('quick very brown');
    expect(entry.text).not.toBe('quick brown');
    expect(entry.anchor.text).toBe(entry.text);
    expect(entry.anchor.prefix).toBe('Advertisement: a word before The ');
    expect(entry.anchor.suffix).toContain(' fox jumps');
    expect(entry.anchor.fragmentCount).toBe(1);
    expect(fixture.created).toHaveLength(1);
    expect(fixture.created[0].id).toBe(entry.id);

    // The stored anchor is a real anchor of the mutated page: it resolves there and
    // covers exactly the words the save measured, while the open-time wording is
    // gone from the page and could not have been resolved at all.
    const located = locateAnchor(document.body, entry.anchor);
    expect(located.ok).toBe(true);
    if (!located.ok) {
      return;
    }
    const fragment = located.fragments[0];
    expect(fragment.node).toBe(textOf('p1'));
    expect(fragment.node.data.slice(fragment.start, fragment.end)).toBe('quick very brown');
    expect(textOf('p1').data).not.toContain('quick brown');
  });

  /**
   * The other half of the same moment: the span is gone, so the save answers with
   * the content layer's own `selection_lost` (`src/content/text.ts`), sends nothing
   * to core, and leaves the card open with its text — the wording of the spec rule
   * "Selection capture and save moments", and never the bug-level `entry_invalid`.
   */
  it('answers a span the page no longer has with selection_lost and writes nothing', async () => {
    const fixture = mount(selection('p1', 4, 15));
    await seedAuthor(fixture.port);
    await fixture.controller.capture();
    await typeDraft(fixture.overlay, 'my note');

    // The site re-rendered the paragraph: a fresh text node, so the boundaries the
    // card kept sit on a node that is no longer in the document at all.
    textOf('p1').replaceWith(document.createTextNode('An entirely different article body.'));
    await pressSave(fixture.overlay);

    const line = refusalLineOf(fixture.overlay);
    expect(line).toBe(REFUSAL_TEXT.selection_lost);
    expect(line).not.toBe(REFUSAL_TEXT.entry_invalid);
    expect(fixture.controller.isOpen()).toBe(true);
    expect(inputOf(fixture.overlay).value).toBe('my note');
    expect(fixture.created).toEqual([]);
    expect(writesOtherThanSettings(fixture.port)).toHaveLength(0);
    expect(fixture.port.storedKeys()).toEqual([SETTINGS_KEY]);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toHaveLength(0);
  });
});

describe('a zero-area fragment box does not place the card (ruling A65)', () => {
  it('places by the viewport rule when every fragment of the span has no box', async () => {
    // A fragment in a hidden subtree is in the stream (ruling `A1`) and measures as a
    // zero box, here at (500, 400). The answer is not "no card" and not a card at the
    // collapsed box's coordinates or at the corner of the shadow host: it is the same
    // placement rule against the viewport, so the card starts inside the `card
    // gutter`.
    const fixture = mount(selection('p1', 4, 15), (): Box => COLLAPSED_BOX);
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);

    const wrapper = wrapperOf(fixture.overlay);
    if (wrapper === null) {
      throw new Error('expected the positioned wrapper inside the shadow root');
    }
    expect(wrapper.style.left).toBe(`${String(CARD_VIEWPORT_GUTTER_PX)}px`);
    expect(wrapper.style.top).toBe(`${String(CARD_VIEWPORT_GUTTER_PX)}px`);
  });

  it('places against the first fragment that has a box', async () => {
    // The first fragment of the span is hidden, the second is visible: the card goes
    // against the words the reader can see, at the box of that second fragment
    // (200 + 18 + 8 below it), and the hidden fragment is still measured and skipped.
    document.body.innerHTML = [
      '<article id="art">',
      '  <p id="p1">one two three</p>',
      '  <p id="p2">four five six</p>',
      '</article>',
    ].join('\n');
    const boxes: Box[] = [COLLAPSED_BOX, { left: 300, top: 200, width: 60, height: 18 }];
    let calls = 0;
    const fixture = mount(selectionAcross('p1', 0, 'p2', 13), (): Box => {
      const box = boxes[calls];
      calls += 1;
      return box ?? COLLAPSED_BOX;
    });
    await seedAuthor(fixture.port);

    await fixture.controller.capture();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.measured).toHaveLength(2);
    const wrapper = wrapperOf(fixture.overlay);
    if (wrapper === null) {
      throw new Error('expected the positioned wrapper inside the shadow root');
    }
    expect(wrapper.style.left).toBe('300px');
    expect(wrapper.style.top).toBe('226px');
  });
});
