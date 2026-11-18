// @vitest-environment jsdom
/**
 * The page wiring of the create card: which browser events reach the controller,
 * and what they do to an open card (rulings `A32`, `A33`-adjacent lifetime; task
 * `t3-01`; `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Card
 * lifetime", "Selection capture ignores selections inside the overlay host").
 *
 * The observable behavior the spec now states:
 * - a settled page selection opens the card (Flow 1), coalesced by one timer, so a
 *   drag across five words performs one capture instead of five;
 * - a page **scroll closes** an open card instead of chasing it (`A32`), and it
 *   also cancels a capture that has not settled yet, because the card is a fixed
 *   box and the text it was placed against has already moved;
 * - a selection that moved to other boundary points closes the open card at once,
 *   and the settled selection then opens a new one — Flow 1 again, never a
 *   reposition of the old card;
 * - a `selectionchange` from inside the shadow tree answers nothing at all, and a
 *   `pointerdown` inside the host is not "outside": the user typing in the card
 *   holds a page selection and must not lose the draft;
 * - detaching the binding stops the capture path, which is what a teardown of a
 *   later task (`t4-03` SPA refresh) relies on;
 * - the `settle delay` is a constant pinned by the spec (ruling `A63`), asserted
 *   against the value the spec names and observed as the default of the wiring.
 *
 * jsdom retargets a composed event fired inside a shadow tree to the host, which
 * is exactly the browser behavior `isInsideOverlayHost` is written against, and the
 * `pointerdown` tests below rely on it rather than on an injected target. Two
 * environment facts the file works around, both stated where they matter:
 * - jsdom has no `Range.prototype.getBoundingClientRect` (Chrome has it, and
 *   `t1-02`'s paint pass already calls the sibling `getClientRects`), so the box of
 *   the selected fragment arrives through the shipped `rangeFor` seam;
 * - jsdom posts its own `selectionchange` notification for a programmatic range
 *   change as a task, so an explicit dispatch is used only where the test needs the
 *   synchronous half of a rule.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SELECTION_SETTLE_MS,
  attachCreateCardEvents,
  type CardEventBinding,
} from '../src/content/overlay/card-events';
import { createCreateCardController } from '../src/content/overlay/create-card-controller';
import { ensureOverlayHost, OVERLAY_HOST_ID } from '../src/content/overlay/host';
import { CARD_CLASS, CARD_INPUT_CLASS } from '../src/content/overlay/card-style';
import { isInsideOverlayHost } from '../src/content/capture/page-selection';
import { saveSettings } from '../src/core/settings-store';
import { MemoryStoragePort } from './support/memory-storage-port';

const AUTHOR = 'reader-one';
const PAGE_URL = 'https://example.test/article';
/** Short enough for a test, large enough that a pending timer is observable. */
const SETTLE_MS = 15;
/**
 * The `settle delay` the spec pins, read out of the Terms row of
 * `docs/specs/content-overlay-ui.md` instead of being repeated here. Ruling `A63`:
 * the shipped constant is asserted against the number **and** the constant name the
 * spec itself writes, the way the 8 px `card gutter` and the 240-code-point warning
 * threshold are asserted against the numbers in their spec lines, because `> 0`
 * pins nothing an article could not break. The reader fails loudly if the Terms row
 * loses its value or its constant name, so the two cannot drift apart silently.
 */
function specSettleDelayMs(): number {
  // `import.meta.url` is a dev-server URL in the jsdom environment of this file, so
  // the repository root comes from the working directory, which is the project root
  // for `npm test`.
  const spec = readFileSync(
    join(process.cwd(), 'docs/specs/content-overlay-ui.md'),
    'utf8',
  );
  const row = spec.split('\n').find((line) => line.includes('| `settle delay` |'));
  if (row === undefined) {
    throw new Error('the overlay spec lost its `settle delay` Terms row');
  }
  const value = /\*\*(\d+) ms\*\*/.exec(row);
  if (value === null || value[1] === undefined) {
    throw new Error('the `settle delay` Terms row pins no millisecond value');
  }
  if (!row.includes('`SELECTION_SETTLE_MS`')) {
    throw new Error('the `settle delay` Terms row names no shipped constant');
  }
  return Number(value[1]);
}
/** jsdom measures nothing, so the fragment box arrives through the shipped seam. */
const FRAGMENT_BOX = { left: 40, top: 120, width: 200, height: 16 };

const ARTICLE = [
  '<article id="art">',
  '  <p id="p1">The quick brown fox jumps over the lazy dog.</p>',
  '  <p id="p2">Second paragraph of the article.</p>',
  '</article>',
].join('\n');

interface Wiring {
  readonly host: HTMLElement;
  readonly cardCount: () => number;
  readonly isOpen: () => boolean;
  readonly dispose: CardEventBinding;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textOf(id: string): Text {
  const element = document.getElementById(id);
  if (element === null || element.firstChild === null) {
    throw new Error(`fixture element ${id} is missing`);
  }
  return element.firstChild as Text;
}

/** Puts a range over page text into the document selection, as a user drag would. */
function selectPageText(id: string, from: number, to: number): void {
  const node = textOf(id);
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const selection = document.getSelection();
  if (selection === null) {
    throw new Error('jsdom is expected to provide a document selection');
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Notifies the page wiring synchronously. jsdom also posts its own notification for
 * a programmatic range change, as a task; the explicit dispatch exists only so the
 * tests can observe the synchronous half of the rule ("closes the open card at
 * once") instead of racing that task.
 */
function fireSelectionChange(): void {
  document.dispatchEvent(new Event('selectionchange'));
}

/** Opens the card for the current document selection and waits for the settle. */
async function openCard(wiring: Wiring): Promise<void> {
  await wait(SETTLE_MS + 30);
  expect(wiring.isOpen()).toBe(true);
  expect(wiring.cardCount()).toBe(1);
}

/** The binding of the running test, so its listeners never leak into the next. */
let active: CardEventBinding | null = null;

async function wire(): Promise<Wiring> {
  const overlay = ensureOverlayHost();
  if (overlay === null) {
    throw new Error('jsdom is the top frame, so the host must exist');
  }
  const port = new MemoryStoragePort();
  const saved = await saveSettings(port, { name: AUTHOR });
  if (!saved.ok) {
    throw new Error(`fixture author write refused with ${saved.code}`);
  }
  const controller = createCreateCardController(document, overlay, {
    port,
    pageUrl: () => PAGE_URL,
    clock: () => '2026-01-02T03:04:05.006Z',
    rng: () => 0.5,
    rangeFor: () => ({ getBoundingClientRect: () => FRAGMENT_BOX }),
    // This file wires the **events**, not the page: it stores no entry and runs no
    // `paint pass`, so the page holds no painted entry and the `contained own
    // selection` silence of ruling `A103` answers `false` for every capture here.
    paintedEntries: () => [],
  });
  const dispose = attachCreateCardEvents(controller, document, window, overlay.host, SETTLE_MS);
  active = dispose;
  return {
    host: overlay.host,
    cardCount: (): number => overlay.root.querySelectorAll(`.${CARD_CLASS}`).length,
    isOpen: (): boolean => controller.isOpen(),
    dispose,
  };
}

beforeEach(() => {
  document.querySelectorAll(`#${OVERLAY_HOST_ID}`).forEach((node: Element) => node.remove());
  document.body.innerHTML = ARTICLE;
  document.getSelection()?.removeAllRanges();
});

afterEach(() => {
  if (active !== null) {
    active();
    active = null;
  }
});

describe('a settled selection opens one card', () => {
  it('waits for the selection to stop moving, then opens the card', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await wait(1);
    expect(wiring.isOpen()).toBe(false);
    await openCard(wiring);
  });

  it('performs one capture for a selection that moved several times', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 8);
    selectPageText('p1', 4, 12);
    selectPageText('p1', 4, 15);
    fireSelectionChange();
    await openCard(wiring);
  });

  it('opens nothing for an empty or collapsed selection', async () => {
    const wiring = await wire();
    document.getSelection()?.removeAllRanges();
    fireSelectionChange();
    await wait(SETTLE_MS + 30);
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);
  });
});

describe('an open card is closed, not repositioned (A32)', () => {
  it('closes at once when the page scrolls', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await openCard(wiring);

    window.dispatchEvent(new Event('scroll'));
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);
    expect(wiring.host.hidden).toBe(true);
  });

  it('cancels a capture that has not settled yet when the page scrolls', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await wait(1);
    expect(wiring.isOpen()).toBe(false);

    window.dispatchEvent(new Event('scroll'));
    await wait(SETTLE_MS + 40);
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);
  });

  it('closes at once when the selection moved to other words, then opens one for them', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await openCard(wiring);

    selectPageText('p1', 20, 29);
    fireSelectionChange();
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);

    // Flow 1 happening again: the settled selection gets its own card, and the
    // page still holds exactly one card element.
    await wait(SETTLE_MS + 30);
    expect(wiring.isOpen()).toBe(true);
    expect(wiring.cardCount()).toBe(1);
  });

  it('keeps the card for a selection event from inside the shadow tree', async () => {
    const overlay = ensureOverlayHost();
    if (overlay === null) {
      throw new Error('jsdom is the top frame, so the host must exist');
    }
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await openCard(wiring);

    // The card's own textarea holds a selection while the user types, and the
    // target of that event is the shadow root, never the document.
    overlay.root.dispatchEvent(new Event('selectionchange'));
    await wait(SETTLE_MS + 30);
    expect(wiring.isOpen()).toBe(true);
    expect(wiring.cardCount()).toBe(1);

    // The same guard on the other side: our nodes are inside the host, the page's
    // are not.
    const field = overlay.root.querySelector(`.${CARD_INPUT_CLASS}`);
    if (field === null) {
      throw new Error('expected the card input inside the shadow root');
    }
    const paragraph = document.getElementById('p1');
    if (paragraph === null) {
      throw new Error('fixture paragraph is missing');
    }
    expect(isInsideOverlayHost(field, overlay.host)).toBe(true);
    expect(isInsideOverlayHost(paragraph, overlay.host)).toBe(false);
  });
});

describe('a pointerdown decides whether the user left the card', () => {
  it('closes the card when the press happens outside the host', async () => {
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await openCard(wiring);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);
  });

  it('keeps the card when the press happens inside it', async () => {
    const overlay = ensureOverlayHost();
    if (overlay === null) {
      throw new Error('jsdom is the top frame, so the host must exist');
    }
    const wiring = await wire();
    selectPageText('p1', 4, 15);
    await openCard(wiring);

    const card = overlay.root.querySelector(`.${CARD_CLASS}`);
    if (card === null) {
      throw new Error('expected the card inside the shadow root');
    }
    card.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await wait(SETTLE_MS + 30);
    expect(wiring.isOpen()).toBe(true);
    expect(wiring.cardCount()).toBe(1);
  });
});

describe('detaching the binding stops the capture path', () => {
  it('opens nothing after the listeners are removed', async () => {
    const wiring = await wire();
    wiring.dispose();
    selectPageText('p1', 4, 15);
    fireSelectionChange();
    await wait(SETTLE_MS + 40);
    expect(wiring.isOpen()).toBe(false);
    expect(wiring.cardCount()).toBe(0);
  });
});

describe('the settle delay is a constant the spec pins (ruling A63)', () => {
  it('keeps the shipped delay at the value the spec names', () => {
    expect(SELECTION_SETTLE_MS).toBe(specSettleDelayMs());
  });

  it('uses the pinned delay at the production call site, where no delay is passed', async () => {
    // The wiring takes the delay as an argument only so a test can observe a pending
    // timer without waiting for the real one. The production call site passes nothing,
    // so the pinned constant is what a page actually waits: a shorter default would
    // already have captured, and a longer one would not have captured yet.
    const overlay = ensureOverlayHost();
    if (overlay === null) {
      throw new Error('jsdom is the top frame, so the host must exist');
    }
    let captures = 0;
    const dispose = attachCreateCardEvents(
      {
        capture: async (): Promise<void> => {
          captures += 1;
        },
        close: (): void => undefined,
        isOpen: (): boolean => false,
        selectionMovedElsewhere: (): boolean => false,
      },
      document,
      window,
      overlay.host,
    );
    try {
      selectPageText('p1', 4, 15);
      fireSelectionChange();
      await wait(SELECTION_SETTLE_MS - 40);
      expect(captures).toBe(0);
      await wait(80);
      expect(captures).toBe(1);
    } finally {
      dispose();
    }
  });
});
