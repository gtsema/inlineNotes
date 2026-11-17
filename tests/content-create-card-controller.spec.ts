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
 *   sentences (`A47`);
 * - the measurement rulings of `t3-01b` are proven in situ: a measurement that
 *   throws leaves no card and no write (`A64`), a span whose fragments all measure
 *   zero area is placed by the viewport rule (`A65`), and a page that carries an
 *   astral character before the selection still opens a card, stores the whole word
 *   and answers a re-selection as `duplicate` (`A23`, `t3-01` review finding 1).
 *
 * The environment is jsdom, but only the page side of the boundary is faked: the
 * storage seam is the hand-written `MemoryStoragePort`, and the entry that a save
 * produces is read back through core `loadEntries`, so a content module that
 * invented its own storage shape would fail here instead of silently working.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildTextStream } from '../src/content/anchor/text-stream';
import { captureSpan } from '../src/content/capture/selection-span';
import type { Box, RangeForFragment } from '../src/content/capture/fragment-rect';
import type { CapturedSelection } from '../src/content/capture/page-selection';
import { createNote } from '../src/content/create/create-note';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import {
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
} from '../src/content/overlay/create-card-controller';
import { CONTENT_STRINGS, REFUSAL_TEXT, refusalText } from '../src/content/text';
import { CARD_VIEWPORT_GUTTER_PX } from '../src/content/overlay/card-placement';
import { createEntryOnPage } from '../src/core/entry-store-write';
import { loadEntries } from '../src/core/entry-store-read';
import { saveSettings } from '../src/core/settings-store';
import { isEntryStorageKey, PAGE_INDEX_KEY, SETTINGS_KEY } from '../src/core/storage-keys';
import type { Entry } from '../src/core/entry';
import { MAX_AUTHOR_NAME_CODE_POINTS } from '../src/core/entry-rules';
import { MemoryStoragePort } from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const AUTHOR = 'reader-one';
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

/**
 * Builds the controller for one host. `readSelection` is the shipped seam, so the
 * card is opened for exactly the boundaries the test controls, while the host, the
 * stylesheet, the mount, the placement write and the whole create path stay real.
 *
 * `rectOf` replaces only the box the fragment measurement reports, which is how a
 * test drives the two rulings about measurement: a zero-area box (`A65`) and a
 * measurement that throws because the page shrank the text node (`A64`).
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
  const controller = createCreateCardController(document, overlay, {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => STAMP,
    rng: () => 0.5,
    readSelection: () => captured,
    rangeFor,
    viewport: () => VIEWPORT,
    onCreated: (entry: Entry): void => {
      created.push(entry);
    },
  });
  return { overlay, port, controller, created, measured };
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

function refusalLineOf(overlay: OverlayHost): string | null {
  const line = overlay.root.querySelector(`.${CARD_REFUSAL_CLASS}`);
  return line === null ? null : (line.textContent ?? '');
}

async function typeAndSave(overlay: OverlayHost, comment: string): Promise<void> {
  const field = inputOf(overlay);
  field.value = comment;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(2);
  saveButtonOf(overlay).click();
  await settle();
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
 * instead of a hand-made slot value.
 */
async function seedEntry(port: MemoryStoragePort, range: Range, comment: string): Promise<void> {
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
    currentName: AUTHOR,
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
