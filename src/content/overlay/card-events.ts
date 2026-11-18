/**
 * Page wiring of the create card: which browser events reach the controller.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Card lifetime" (ruling `A32`: an open card is closed, not repositioned, on page
 * scroll or on a selection change elsewhere), "Selection capture ignores selections
 * inside the overlay host", "`focus on open`" and its **typing door** (rulings `A111`
 * and `A112`, task `t6-02` AC1-AC4), and the keyboard/click affordances the card shares
 * with the editor (`A42` in `docs/state/t3-03-content-editor.md` for the editor half).
 *
 * Four inputs, four different answers:
 * - **scroll** — close at once. The card is a fixed box (ruling `A30`), so a
 *   scrolled page has already moved the text out from under it;
 * - **selectionchange** — the only event the *document* fires for a page selection.
 *   While a card is open, a selection that moved to other boundary points closes it
 *   (`A32`). A new card is then opened for the settled selection, which is Flow 1
 *   happening again rather than a reposition. A selection inside a widget answers
 *   nothing at all: the card's own textarea holds a selection while the user types,
 *   and the event target of that is the shadow root, never the document;
 * - **pointerdown outside the host** — close. A click elsewhere is the user leaving
 *   the card, and it usually begins a new selection anyway;
 * - **keydown of one printable character** — the card's keyboard door (ruling `A112`,
 *   task `t6-02`, opened by Run 3 item 2 of `docs/state/browser-verification-run.md`,
 *   which measured in Chrome that `Tab` does not reach an open card). The controller is
 *   asked to move the caret into the note field, and **the keystroke itself is left
 *   alone**: nothing here calls `preventDefault()`, so the page keeps its key and the
 *   character lands in the field because the focus move happened during `keydown`. This
 *   module owns the decision "which keystroke is a door" and nothing else: the caret
 *   move and the way back are owned by `focus-handoff.ts`, the overlay's one focus owner.
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
 * The keystroke that is the card's door (ruling `A112`, task `t6-02 AC1, AC3`): a
 * **single printable character** that is not `Space` and carries no modifier.
 *
 * `key.length === 1` is the test, which is why the rule is layout-independent by
 * construction: Cyrillic, Latin, digits and punctuation all qualify, while every named
 * key (`Tab`, `Enter`, `Backspace`, `Escape`, `ArrowDown`, `Home`, `F1`, `Dead`,
 * `Unidentified`) is longer than one character and is therefore out. `Space` is one
 * character and is excluded by name: scrolling the article with the space bar stays the
 * page's behavior. A modifier excludes the keystroke outright, so `Esc`, `Ctrl+Enter`,
 * `Cmd+Enter`, `Ctrl+A` and `Alt+…` reach the card's own handlers untouched.
 */
function isTypingEntryKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  return event.key.length === 1 && event.key !== ' ';
}

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

  /**
   * `A112`: typing is the way into an open card. Guarded three ways, and each guard is
   * an acceptance criterion of `t6-02`: no card open, so nothing to enter (AC4); a
   * keystroke that is not a door, so the page keeps `Space`, `Tab`, `Enter`, `Escape`,
   * the arrows and every modified combination (AC3); the caret already standing inside
   * the overlay host, so the page's keys are not touched a second time and the field the
   * reader is typing into keeps the key (AC4). The handler **never calls
   * `preventDefault()`** (AC2): host-page respect wins over exclusivity, and a page that
   * owns a single-letter shortcut may fire as well.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!controller.isOpen()) {
      return;
    }
    if (!isTypingEntryKey(event)) {
      return;
    }
    const active = doc.activeElement;
    if (active !== null && isInsideOverlayHost(active, host)) {
      return;
    }
    controller.takeCaretForTyping();
  };

  doc.addEventListener('selectionchange', onSelectionChange);
  win.addEventListener('scroll', onScroll, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  // Bubble phase, and the guarantee does not rest on that phase: this handler never calls
  // `preventDefault()` and never stops propagation, so a page that consumes the keystroke
  // keeps it whatever the order of the listeners is. Nothing here intercepts `Tab`.
  doc.addEventListener('keydown', onKeyDown);

  return (): void => {
    cancelPending();
    doc.removeEventListener('selectionchange', onSelectionChange);
    win.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown);
  };
}
