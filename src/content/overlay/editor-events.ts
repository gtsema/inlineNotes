/**
 * Page wiring of the editor: which browser events close an open editor, and which
 * one deliberately does not (task `t3-03` AC3).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 5, Rules /
 * Semantics -> "Editor lifetime" and "The card and the editor must be reachable by
 * keyboard"; rulings `A42` (a click outside is a cancel, never a save)
 * and `A43` (`Esc` is the same cancel path as the cancel button).
 *
 * Three inputs, and each is one of the three cancel paths the spec names:
 *
 * - **pointerdown outside the overlay host** — close, write nothing. A press on the
 *   page is the reader leaving the note, and `A42` rules that it is a cancel and not
 *   an implicit save: a save happens through the save button or not at all. A press
 *   inside
 *   the host answers nothing, or the editor could not be typed into;
 * - **scroll** — close. The widget is a fixed box over text that just moved, and the
 *   overlay spec's answer to that state is the close, not a chase (ruling `A32`, the
 *   same rule the card and the tooltip keep);
 * - **`Esc`** — close, on the same path as the cancel button (`A43`). The listener sits
 *   on the document and not only inside the widget because a key press does not always belong
 *   to the widget: the caret is in the note field while the editor stands (ruling `A97`
 *   overturned `A74`), but the page may hold it before the handover and after a restore
 *   that found its element gone. A keyboard reader who never pressed `Tab` still has a
 *   way out.
 *
 * **`selectionchange` is deliberately absent, and that absence is a rule.** The card
 * of `t3-01` closes when the selection moves to other boundary points (ruling `A32`),
 * because a card over moved text promises a note on a span the reader is not looking
 * at. The editor is the one widget for which the same event must mean nothing: `A45`
 * lets the reader re-select inside an open editor to move the note's span, and closing
 * on a selection change would make that acceptance criterion unreachable. A moved
 * selection is answered when the save button is pressed, by comparing the boundary
 * points the editor
 * opened with against the page selection of that moment.
 *
 * Nothing here decides what a save or a delete is: the controller owns the open state,
 * the edit path owns the write, core owns the rules.
 */

import { isInsideOverlayHost } from '../capture/page-selection';
import type { EditorController } from './editor-controller';

/** Removes every listener this function added. */
export type EditorEventBinding = () => void;

/**
 * Attaches the editor listeners to one document.
 *
 * `pointerdown` and `scroll` are captured, as in `card-events.ts` and
 * `tooltip-events.ts`: a page that stops propagation must not be able to keep a stale
 * editor standing over text that is no longer under it.
 */
export function attachEditorEvents(
  controller: EditorController,
  doc: Document,
  win: Window,
  host: HTMLElement,
): EditorEventBinding {
  const onPointerDown = (event: Event): void => {
    const target: EventTarget | null = event.target;
    if (target instanceof Node && isInsideOverlayHost(target, host)) {
      return;
    }
    controller.close();
  };

  const onScroll = (): void => {
    controller.close();
  };

  const onKeyDown = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') {
      controller.close();
    }
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('scroll', onScroll, true);
  doc.addEventListener('keydown', onKeyDown);

  return (): void => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    win.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('keydown', onKeyDown);
  };
}
