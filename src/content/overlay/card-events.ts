/**
 * Page wiring of the create card: which browser events reach the controller.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card lifetime" (ruling `A32`: an open card is closed, not repositioned, on page
 * scroll or on a selection change elsewhere), "Selection capture ignores selections
 * inside the overlay host", and the keyboard/click affordances the card shares with
 * the editor (`A42` in `docs/state/t3-03-content-editor.md` for the editor half).
 *
 * Three inputs, three different answers:
 * - **scroll** — close at once. The card is a fixed box (ruling `A30`), so a
 *   scrolled page has already moved the text out from under it;
 * - **selectionchange** — the only event the *document* fires for a page selection.
 *   While a card is open, a selection that moved to other boundary points closes it
 *   (`A32`). A new card is then opened for the settled selection, which is Flow 1
 *   happening again rather than a reposition. A selection inside a widget answers
 *   nothing at all: the card's own textarea holds a selection while the user types,
 *   and the event target of that is the shadow root, never the document;
 * - **pointerdown outside the host** — close. A click elsewhere is the user leaving
 *   the card, and it usually begins a new selection anyway.
 *
 * `selectionchange` is coalesced by one timer: the page fires it per word boundary
 * while the user drags, and each attempt reads the settings through core. Without
 * the delay a drag would open and close a card on every word, and a card that
 * blinks over a half-dragged selection is worse than one that waits.
 *
 * Nothing here decides what a note is: the controller owns the open state, core owns
 * the rules. This module only translates browser events into controller calls.
 */

import { currentSelectionRange, isInsideOverlayHost } from '../capture/page-selection';
import type { CreateCardController } from './create-card-controller';

/**
 * How long the selection has to stop moving before a card is opened, in ms.
 *
 * The value is durable in the spec, not here: `docs/specs/content-overlay-ui.md`
 * -> Terms / Aliases -> `settle delay` names this constant and its number
 * (ruling `A63`), and `tests/content-card-events.spec.ts` asserts the constant
 * against the value read out of that Terms row.
 */
export const SELECTION_SETTLE_MS = 150;

/** Removes every listener and cancels any pending capture attempt. */
export type CardEventBinding = () => void;

/**
 * Attaches the create-card listeners to one document.
 *
 * The capture phase is used for scroll and pointerdown on purpose: a page that
 * stops propagation must not be able to keep a stale card open over its own text.
 */
export function attachCreateCardEvents(
  controller: CreateCardController,
  doc: Document,
  win: Window,
  host: HTMLElement,
  settleMs: number = SELECTION_SETTLE_MS,
): CardEventBinding {
  let pending: number | null = null;

  const cancelPending = (): void => {
    if (pending !== null) {
      win.clearTimeout(pending);
      pending = null;
    }
  };

  const scheduleCapture = (): void => {
    cancelPending();
    pending = win.setTimeout(() => {
      pending = null;
      void controller.capture();
    }, settleMs);
  };

  const onSelectionChange = (event: Event): void => {
    if (event.target !== doc) {
      return;
    }
    if (controller.isOpen() && controller.selectionMovedElsewhere(currentSelectionRange(doc))) {
      controller.close();
    }
    scheduleCapture();
  };

  const onScroll = (): void => {
    cancelPending();
    controller.close();
  };

  const onPointerDown = (event: Event): void => {
    const target: EventTarget | null = event.target;
    if (target instanceof Node && isInsideOverlayHost(target, host)) {
      return;
    }
    cancelPending();
    controller.close();
  };

  doc.addEventListener('selectionchange', onSelectionChange);
  win.addEventListener('scroll', onScroll, true);
  doc.addEventListener('pointerdown', onPointerDown, true);

  return (): void => {
    cancelPending();
    doc.removeEventListener('selectionchange', onSelectionChange);
    win.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
  };
}
