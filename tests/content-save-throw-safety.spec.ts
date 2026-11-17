// @vitest-environment jsdom
/**
 * The page-boundary throw of the create path (task `t3-05` AC1, PM ruling `A75`).
 *
 * The state: the user selected text, the card opened, and between the open and the
 * save the site re-rendered the paragraph so the text node the kept boundaries point
 * at left the document. `src/content/capture/selection-span.ts` then asks
 * `range.intersectsNode(fragment.node)` about nodes that are still in the document.
 * jsdom answers `false`; the DOM spec's first step for that method **throws**
 * `InvalidAccessError` when the node's root is not the range's root, which is exactly
 * this state — so in a shipped browser the save call rejects
 * (`docs/state/t3-02b-review.md` remark 1).
 *
 * jsdom cannot produce that throw from any DOM state, so the throw is **injected on
 * the range object**: the card keeps the very `Range` the selection seam handed it,
 * and replacing one method on that object asks the same question of the same range and
 * gets the answer a real engine gives. A test that only detaches the node (answering
 * `false`) pins the jsdom behavior and does not cover this task.
 *
 * Per ruling `A75` the guard is at the content call site, never in `src/core/` and
 * never inside `captureSpan`, and the last test in this file pins that boundary: the
 * capture module keeps throwing.
 *
 * What the user gets instead of the frozen card (AC1): the `selection_lost` line
 * («Выделение больше не найдено на странице»), nothing written, and a card that is
 * still usable — `Сохранить` enabled, `Отмена` and `Esc` alive, the draft intact.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildTextStream } from '../src/content/anchor/text-stream';
import { captureSpan } from '../src/content/capture/selection-span';
import type { CapturedSelection } from '../src/content/capture/page-selection';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import type { OverlayHost } from '../src/content/overlay/host';
import {
  CARD_CLASS,
  CARD_INPUT_CLASS,
  CARD_REFUSAL_CLASS,
} from '../src/content/overlay/card-style';
import {
  createCreateCardController,
  type CreateCardController,
} from '../src/content/overlay/create-card-controller';
import { CONTENT_STRINGS, REFUSAL_TEXT } from '../src/content/text';
import { loadEntries } from '../src/core/entry-store-read';
import { SETTINGS_KEY } from '../src/core/storage-keys';
import { saveSettings } from '../src/core/settings-store';
import type { Entry } from '../src/core/entry';
import { MemoryStoragePort } from './support/memory-storage-port';

const PAGE_URL = 'https://example.test/article';
const AUTHOR = 'reader-one';
const STAMP = '2026-01-02T03:04:05.006Z';
const VIEWPORT = { width: 1280, height: 800 };
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
  /** Offsets the controller handed to the measurement seam, in call order. */
  readonly measured: Array<{ node: Node; start: number; end: number }>;
}

/** Preact flushes on a microtask and the create chain awaits the port a few times. */
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

/**
 * Replaces `Range.intersectsNode` on one range object with the answer a real engine
 * gives: an `InvalidAccessError` DOMException, the same shape the DOM spec names for
 * "node's root is not this's root".
 *
 * This is the only fake in the file. The detach, the stream, the card, the create path
 * and the storage port are the shipped ones.
 */
function answerLikeARealEngine(range: Range): void {
  range.intersectsNode = (): boolean => {
    throw new DOMException(
      'The node is in a different document tree than the range.',
      'InvalidAccessError',
    );
  };
}

/**
 * The detached-node state itself: the site replaced the selected text node, so the
 * boundaries the card kept sit on a node that is no longer in the document, and the
 * stream fragments the range is tested against still are. Then the engine's answer is
 * installed on the range.
 */
function detachAndAnswerLikeARealEngine(captured: CapturedSelection): void {
  textOf('p1').replaceWith(document.createTextNode('An entirely different article body.'));
  answerLikeARealEngine(captured.range);
}

/** A port whose `get` throws a raw error rather than a coded storage failure. */
function throwingPort(): MemoryStoragePort {
  const port = new MemoryStoragePort();
  const original = port.get.bind(port);
  port.get = async (keys: string[] | null): Promise<Record<string, unknown>> => {
    if (keys !== null && keys.includes(SETTINGS_KEY)) {
      throw new Error('injected: the storage area threw while reading');
    }
    return await original(keys);
  };
  return port;
}

function mount(captured: CapturedSelection, port: MemoryStoragePort = new MemoryStoragePort()): Fixture {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    throw new Error('jsdom is the top frame, so the host must exist');
  }
  const measured: Array<{ node: Node; start: number; end: number }> = [];
  const controller = createCreateCardController(document, overlay, {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => STAMP,
    rng: () => 0.5,
    readSelection: () => captured,
    rangeFor: (node, start, end) => {
      measured.push({ node, start, end });
      return { getBoundingClientRect: () => FRAGMENT_BOX };
    },
    viewport: () => VIEWPORT,
    onCreated: (): void => {
      throw new Error('a create must not happen in this file');
    },
  });
  return { overlay, port, controller, measured };
}

function cardOf(overlay: OverlayHost): Element | null {
  return overlay.root.querySelector(`.${CARD_CLASS}`);
}

function inputOf(overlay: OverlayHost): HTMLTextAreaElement {
  const field = overlay.root.querySelector(`.${CARD_INPUT_CLASS}`);
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error('expected the card input inside the shadow root');
  }
  return field;
}

function buttonOf(overlay: OverlayHost, position: 'save' | 'cancel'): HTMLButtonElement {
  const buttons = overlay.root.querySelectorAll(`.${CARD_CLASS} button`);
  const button = position === 'save' ? buttons[0] : buttons[buttons.length - 1];
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`expected the ${position} button inside the shadow root`);
  }
  return button;
}

function refusalLineOf(overlay: OverlayHost): string | null {
  const line = overlay.root.querySelector(`.${CARD_REFUSAL_CLASS}`);
  return line === null ? null : (line.textContent ?? '');
}

async function typeDraft(overlay: OverlayHost, comment: string): Promise<void> {
  const field = inputOf(overlay);
  field.value = comment;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(2);
}

async function pressSave(overlay: OverlayHost): Promise<void> {
  buttonOf(overlay, 'save').click();
  await settle();
}

function pressEscape(overlay: OverlayHost): void {
  inputOf(overlay).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
}

async function seedAuthor(port: MemoryStoragePort): Promise<void> {
  const saved = await saveSettings(port, { name: AUTHOR });
  if (!saved.ok) {
    throw new Error(`fixture author write refused with ${saved.code}`);
  }
}

/** Every port write except the author-name write the fixture itself performs. */
function writesOtherThanSettings(port: MemoryStoragePort): PortWriteCall[] {
  return port.calls.filter(
    (call) => call.op !== 'get' && !(call.keys.length === 1 && call.keys[0] === SETTINGS_KEY),
  );
}

type PortWriteCall = { op: string; keys: string[] };

/** Opens a card, types a draft, then breaks the page under the kept boundaries. */
async function openCardWithADoomedSelection(): Promise<Fixture> {
  const captured = selection('p1', 4, 15);
  const fixture = mount(captured);
  await seedAuthor(fixture.port);
  await fixture.controller.capture();
  if (!fixture.controller.isOpen()) {
    throw new Error('fixture card must be open before the page mutates');
  }
  await typeDraft(fixture.overlay, 'my note');
  detachAndAnswerLikeARealEngine(captured);
  return fixture;
}

beforeEach(() => {
  document.querySelectorAll(`#${OVERLAY_HOST_ID}`).forEach((node: Element) => node.remove());
  document.body.innerHTML = ARTICLE;
});

describe('a save over a selection the page took away (t3-05 AC1, ruling A75)', () => {
  it('answers Сохранить with selection_lost and leaves the card usable', async () => {
    const fixture = await openCardWithADoomedSelection();

    await pressSave(fixture.overlay);

    // The refusal line the spec fixes for `selection_lost`, and never the bug-level one.
    const line = refusalLineOf(fixture.overlay);
    expect(line).toBe(REFUSAL_TEXT.selection_lost);
    expect(line).not.toBe(REFUSAL_TEXT.entry_invalid);

    // The frozen state this task exists for: the throw escaped the card's submit, so
    // `busy` stayed `true`, `Сохранить` rendered disabled and no line appeared.
    const save = buttonOf(fixture.overlay, 'save');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe(CONTENT_STRINGS.save);
    expect(fixture.controller.isOpen()).toBe(true);
    expect(inputOf(fixture.overlay).value).toBe('my note');

    // Nothing reached core, so nothing reached storage.
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
    const page = await loadEntries(fixture.port, PAGE_URL);
    expect(page.entries).toEqual([] as Entry[]);
  });

  it('answers a second press the same way, so the card is not one-shot', async () => {
    const fixture = await openCardWithADoomedSelection();

    await pressSave(fixture.overlay);
    const firstLine = refusalLineOf(fixture.overlay);
    await pressSave(fixture.overlay);

    expect(refusalLineOf(fixture.overlay)).toBe(firstLine);
    expect(buttonOf(fixture.overlay, 'save').disabled).toBe(false);
    expect(fixture.controller.isOpen()).toBe(true);
    expect(inputOf(fixture.overlay).value).toBe('my note');
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
  });

  it('still closes on Отмена after that refusal, and writes nothing', async () => {
    const fixture = await openCardWithADoomedSelection();
    await pressSave(fixture.overlay);

    buttonOf(fixture.overlay, 'cancel').click();
    await settle(2);

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
  });

  it('still closes on Esc after that refusal, and writes nothing', async () => {
    const fixture = await openCardWithADoomedSelection();
    await pressSave(fixture.overlay);

    pressEscape(fixture.overlay);
    await settle(2);

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
  });

  /**
   * The open moment of the same throw class: the node may leave the document during
   * the `await` of the settings gate, so the capture inside `capture()` is a
   * page-boundary call exactly like the save is. `card-events.ts` runs `void
   * controller.capture()`, so a rejection there is an unhandled rejection on a page
   * that has no idea the extension exists; the answer is Flow 1 answering nothing.
   */
  it('opens no card and rejects nothing when the open-time capture throws', async () => {
    const captured = selection('p1', 4, 15);
    answerLikeARealEngine(captured.range);
    const fixture = mount(captured);
    await seedAuthor(fixture.port);

    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(fixture.measured).toEqual([]);
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
  });

  /**
   * The settings read of the same capture is a page-boundary read too, and it answers
   * "no card" rather than a rejection: a storage area that throws is not a reason for
   * the content script to leave an unhandled rejection behind.
   */
  it('opens no card when the settings read throws, and writes nothing', async () => {
    const captured = selection('p1', 4, 15);
    const fixture = mount(captured, throwingPort());

    await fixture.controller.capture();

    expect(fixture.controller.isOpen()).toBe(false);
    expect(cardOf(fixture.overlay)).toBeNull();
    expect(writesOtherThanSettings(fixture.port)).toEqual([]);
  });
});

describe('the capture module keeps throwing (ruling A75: the guard is at the call site)', () => {
  it('propagates the injected InvalidAccessError instead of answering null', () => {
    const captured = selection('p1', 4, 15);
    answerLikeARealEngine(captured.range);
    const stream = buildTextStream(document.body);

    let thrown: unknown = null;
    try {
      captureSpan(stream, captured.range);
    } catch (error: unknown) {
      thrown = error;
    }

    // `captureSpan` owns no policy about a page that threw: converting the throw into
    // a refusal code is the call site's job (`create-note.ts`, the controller), which
    // is what ruling `A75` decided and what keeps `src/core/` throwing its own errors.
    expect(thrown).toBeInstanceOf(DOMException);
    expect((thrown as DOMException).name).toBe('InvalidAccessError');
  });
});
