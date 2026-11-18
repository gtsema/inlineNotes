/**
 * The focus handover of one open widget: where the caret goes when a widget opens,
 * and where it goes back when the widget closes (task `t5-04`, ruling `A97`, which
 * overturns `A74`, and the shape ruling `A105`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Terms / Aliases -> `focus on
 * open` and `focus restore`, Rules / Semantics -> the `focus on open` bullet, and
 * AC17. The two call sites are `create-card-controller.tsx` (`open`, `close`) and
 * `editor-controller.tsx` (`open`, `close`); this module owns the handover and
 * nothing else — not which widget is open, not the write, not the placement.
 *
 * Two decisions live here and nowhere else:
 *
 * - **the caret goes into the note field on open**, because ruling `A97` is the
 *   reader's own request: select text and the caret is already in the field, click a
 *   `tooltip` and the field already holds the comment. Every focus call of the
 *   overlay passes `preventScroll: true` — the exported `FIELD_FOCUS_OPTIONS` is the
 *   one shape for it. The overlay host is `position: fixed`, so a focus that scrolled
 *   the page would move the article out from under the widget the reader is looking
 *   at; and because no test DOM can show a scroll, the option is pinned at the call
 *   shape rather than by an outcome (`t5-04` AC3).
 * - **closing hands the caret back** (`focus restore`), the `Assumption:` half of the
 *   ruling: without it the document's active element would stand inside a shadow tree
 *   that was just emptied, and the reader would have to tab through the whole page to
 *   get back. Only an element that is **still connected** gets it back; when it is
 *   gone the handover does nothing at all — it never substitutes `body` or
 *   `documentElement`, because a focus the reader did not have is not this module's to
 *   invent.
 *
 * The element recorded at open is the one that **really** held the caret. For a focus
 * inside the overlay host the document answers the host itself (shadow retargeting),
 * and the host is an unfocusable `div`: recording it would make the restore a silent
 * no-op whenever one widget opens over another. So the record goes one tree deeper,
 * into the shadow root, and a widget closed over a still-open widget returns the caret
 * to that widget's field.
 */

import { CARD_INPUT_CLASS } from './card-style';
import type { OverlayHost } from './host';

/**
 * The options every overlay focus call passes (ruling `A105`, task `t5-04` AC3):
 * the widget is a fixed box, so moving the caret must never scroll the page.
 */
export const FIELD_FOCUS_OPTIONS: FocusOptions = { preventScroll: true };

/** The open/close focus handover of one widget controller. */
export interface FocusHandoff {
  /**
   * Records what the page had focused, then moves the caret into the note field of
   * `wrapper`. Call it **after** the host is revealed: a field inside a hidden host is
   * not focusable, so the order is part of the rule, not a detail.
   */
  open(wrapper: HTMLElement): void;
  /**
   * Hands the caret back to the element recorded at `open`, and only while that element
   * is still connected. Call it **after** the widget was unmounted: restoring before
   * the unmount would have the unmount take the caret away again.
   */
  restore(): void;
}

/**
 * Creates the handover of one shadow host. One instance per widget controller: a
 * widget keeps its own record of what the page had focused, and two widgets opened at
 * once each restore what was focused at **their** open moment.
 */
export function createFocusHandoff(doc: Document, overlay: OverlayHost): FocusHandoff {
  let held: HTMLElement | null = null;

  function open(wrapper: HTMLElement): void {
    held = focusedElementOf(doc, overlay);
    const field = noteFieldOf(wrapper);
    if (field === null) {
      // No field to put a caret in: there is nothing to hand over, and `restore` still
      // has nothing to restore, because `held` stays `null` for the document default.
      return;
    }
    field.focus(FIELD_FOCUS_OPTIONS);
  }

  function restore(): void {
    const previous = held;
    held = null;
    if (previous === null || !previous.isConnected) {
      // The element the page had is gone. Nothing is forced: no `body`, no
      // `documentElement`, no substitute the reader never had (`t5-04` AC4).
      return;
    }
    previous.focus(FIELD_FOCUS_OPTIONS);
  }

  return { open, restore };
}

/** The note field of a mounted widget, or `null` when the widget rendered none. */
function noteFieldOf(wrapper: HTMLElement): HTMLTextAreaElement | null {
  const field = wrapper.querySelector(`.${CARD_INPUT_CLASS}`);
  return field instanceof HTMLTextAreaElement ? field : null;
}

/**
 * The element that held the caret at this moment, or `null` when the document had no
 * element of its own focused.
 *
 * The document answers the overlay **host** for a focus inside that host's shadow tree;
 * the caret is one tree deeper, so the record follows the host there. `body` and
 * `documentElement` are not recorded at all: they are the document's default answer,
 * not a page control the reader had focused, and restoring to one would be the forced
 * focus the ruling forbids.
 */
function focusedElementOf(doc: Document, overlay: OverlayHost): HTMLElement | null {
  const answered = doc.activeElement;
  if (answered === null || answered === doc.body || answered === doc.documentElement) {
    return null;
  }
  const held = answered === overlay.host ? overlay.root.activeElement : answered;
  return held instanceof HTMLElement ? held : null;
}
