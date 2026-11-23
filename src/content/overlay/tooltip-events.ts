/**
 * Page wiring of the hover tooltip: which browser events reach the controller, and
 * which ones deliberately answer nothing.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 3-4, Edge Cases
 * ("A tooltip near the viewport edge flips to the opposite side; it never covers the
 * range it describes", "A `tooltip` click on a `foreign entry`", "A `tooltip` click the
 * page refuses to measure"), Rules / Semantics -> "Card lifetime" (ruling `A32`, whose
 * scroll logic the tooltip reuses), "Tooltip lifetime", and the task `t3-02`
 * constraint that hover hit-testing must not open the create card. Task `t5-03` AC1,
 * AC2, AC3, AC9; rulings `A96`, `A104`.
 *
 * The four events, and why each one is the only one of its kind:
 *
 * - **pointermove** — the hover question. Hit-testing is a caret lookup, not a
 *   `selectionchange` handler: the `selectionchange` listener of `card-events.ts` is
 *   left exactly as `t3-01` shipped it, so moving the pointer over painted text can
 *   never open a create card. A move **over the widget itself** answers nothing at
 *   all: the host is `pointer-events: none` and the tooltip undoes that, so a pointer
 *   event whose target is the host came from inside the shadow root, and hiding there
 *   would make the tooltip impossible to click. Shadow retargeting is why the check
 *   uses `isInsideOverlayHost` rather than `host.contains(target)`;
 * - **pointerdown** — two answers, one event. Inside the host it is the Flow 4 click:
 *   the controller hands the entry of the open tooltip to `onEntryClick`, which in the
 *   shipped wiring opens the editor of that entry or answers nothing (ruling `A96`).
 *   While a tooltip is open the tooltip is the only widget the host can be showing —
 *   the `A68` host rule hides a tooltip the moment the card or the editor takes the
 *   host — so this branch cannot press a different widget. Outside the host it is a
 *   dismissal: a press on the page is the reader leaving the note;
 * - **scroll** — hide. The tooltip is a fixed box over a box that just moved, and the
 *   overlay spec's answer to that situation is the close, not a chase (ruling `A32`);
 * - **Escape** — hide. A keyboard user has to be able to get rid of the card without
 *   finding a pointer target.
 *
 * Nothing here decides what a tooltip shows: the controller owns the open state, the
 * paint pass owns what is on the page, core owns the rules.
 */

import { isInsideOverlayHost } from '../capture/page-selection';
import type { TooltipController } from './tooltip-controller';

/**
 * The `tooltip grace` (`A194`), the number the Terms row names: an open tooltip
 * survives this many milliseconds after the pointer has left its entry span, so
 * the reader can cross the placement gap and reach the box.
 */
export const TOOLTIP_GRACE_MS = 300;

/** Removes every listener this function added. */
export type TooltipEventBinding = () => void;

/**
 * Attaches the tooltip listeners to one document.
 *
 * `pointerdown` and `scroll` are captured, as in `card-events.ts`: a page that stops
 * propagation must not be able to keep a stale tooltip standing over text that is no
 * longer under it.
 */
export function attachTooltipEvents(
  controller: TooltipController,
  doc: Document,
  win: Window,
  host: HTMLElement,
): TooltipEventBinding {
  /**
   * The `tooltip grace` (`A194`): the milliseconds an open tooltip survives after
   * the pointer has left its entry span. The tooltip is painted beside the span
   * with a placement gap, so the path from the words to the box crosses text that
   * is not the entry — an instant hide there made the tooltip unreachable, which
   * the reader measured. Moving onto the widget, pressing, scrolling or pressing
   * `Esc` cancels the pending hide; a fresh hover elsewhere answers immediately.
   */
  let grace: ReturnType<typeof setTimeout> | null = null;
  const cancelGrace = (): void => {
    if (grace !== null) {
      clearTimeout(grace);
      grace = null;
    }
  };
  const scheduleHover = (x: number, y: number): void => {
    cancelGrace();
    grace = setTimeout((): void => {
      grace = null;
      controller.hoverAt(x, y);
    }, TOOLTIP_GRACE_MS);
  };

  const onPointerMove = (event: Event): void => {
    if (isOverWidget(event, host)) {
      cancelGrace();
      return;
    }
    const pointer = pointerCoordinates(event);
    if (pointer === null) {
      return;
    }
    if (controller.isOpen()) {
      // An open tooltip does not die with the first move off its span: the move
      // starts the grace, and the hide (or the re-hit) answers when it expires.
      scheduleHover(pointer.x, pointer.y);
      return;
    }
    controller.hoverAt(pointer.x, pointer.y);
  };

  const onPointerDown = (event: Event): void => {
    if (isOverWidget(event, host)) {
      cancelGrace();
      controller.activate();
      return;
    }
    cancelGrace();
    controller.hide();
  };

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') {
      cancelGrace();
      controller.hide();
    }
  };

  const onHide = (): void => {
    cancelGrace();
    controller.hide();
  };

  doc.addEventListener('pointermove', onPointerMove);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown);
  win.addEventListener('scroll', onHide, true);

  return (): void => {
    cancelGrace();
    doc.removeEventListener('pointermove', onPointerMove);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('scroll', onHide, true);
  };
}

/**
 * `true` when the event came from inside the extension's own widgets.
 *
 * The host element is `pointer-events: none` and each widget undoes that, so a
 * pointer event whose target the browser retargeted to the host was aimed at
 * something inside the shadow root. `isInsideOverlayHost` walks the shadow boundary,
 * which `host.contains(target)` cannot do for a retargeted or shadow-nested node.
 */
function isOverWidget(event: Event, host: HTMLElement): boolean {
  return event.target instanceof Node && isInsideOverlayHost(event.target, host);
}

/**
 * The pointer position of an event, `null` for an event that has none.
 *
 * The check is not ceremony: `PointerEvent` is not universal (a `MouseEvent` reaches
 * the same listeners, and a synthetic test event may carry no coordinates at all), and
 * handing `undefined` to `hoverAt` would ask the page for a caret at `NaN`, which is
 * a "no caret" answer, which is a hide — a widget that disappears because an
 * unrelated event type arrived.
 */
function pointerCoordinates(event: Event): { x: number; y: number } | null {
  const withCoordinates = event as Event & { clientX?: unknown; clientY?: unknown };
  if (typeof withCoordinates.clientX !== 'number' || typeof withCoordinates.clientY !== 'number') {
    return null;
  }
  return { x: withCoordinates.clientX, y: withCoordinates.clientY };
}
