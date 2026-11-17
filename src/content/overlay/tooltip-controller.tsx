/**
 * The tooltip controller: which painted entry the pointer is over, and what the
 * shadow root shows about it (task `t3-02` AC3, AC4, AC5).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 3-4, Rules /
 * Semantics -> "Tooltip default opacity", "Own entries and foreign entries … only in
 * the tooltip header", the tooltip anchor of ruling `A67`, the paint-path measurement
 * rule of ruling `A66`, and the paint-ownership rule of ruling `A68`; task `t3-02`
 * AC3, AC4.
 *
 * What this machine owns, and nothing else:
 * - **the open tooltip**, one at a time, and the host's visible state *for this
 *   widget*: showing a tooltip unhides the single host, hiding one re-hides it unless
 *   the create card still needs it (`isHostBusy`). Ruling `A68` is the reason the
 *   check exists in both directions: card visibility and paint visibility are separate
 *   decisions, and a widget must not turn off a light another widget is using;
 * - **nothing about the highlights.** It never calls `CSS.highlights`, never re-runs a
 *   resolve, never writes storage. It reads the output of the last paint pass
 *   (`paintedEntries`) and the author name that pass read (`authorName`);
 * - **no edit affordance.** A click sets `pinned`, which `tooltip-style.ts` renders as
 *   opacity 1, and that is the whole of it — the editor is task `t3-03`.
 *
 * Two rules that are easy to get wrong, stated where they are implemented:
 *
 * - **the hover anchor is measured at hover time.** `PaintedEntry.tooltipBox` is the
 *   answer the *paint pass* gave for the same entry; a scroll moves every box in the
 *   document without telling this module, and placing a tooltip against a box from the
 *   last pass would put it next to text it does not describe. The walk to the first
 *   fragment that has an area is `placementFragmentBox` — the same function the create
 *   card places with, and the same rule ruling `A67` states — so the paint pass, the
 *   card and the tooltip agree about which fragment has a position;
 * - **a hover that cannot be measured shows nothing.** `Range.setStart` rejects when
 *   the page replaced the text node under the fragment between the paint pass and the
 *   hover. That is the per-entry answer of ruling `A66` applied to the hover: no
 *   tooltip, the entry stays painted-or-not as the last pass decided, stays in the
 *   popup, stays deletable, and no other entry loses anything.
 */

import { render } from 'preact';
import { documentRangeForFragment, placementFragmentBox } from '../capture/fragment-rect';
import type { Box, RangeForFragment } from '../capture/fragment-rect';
import type { PaintedEntry } from '../paint/paint-plan';
import { placeCard } from './card-placement';
import type { Viewport } from './card-placement';
import { setOverlayHostHidden } from './host';
import type { OverlayHost } from './host';
import { TOOLTIP_ROOT_CLASS, ensureTooltipStyle } from './tooltip-style';
import { Tooltip } from './tooltip';
import { documentCaretAtPoint, entryAtCaret, isOwnEntry, ownershipHeaderOf } from './tooltip-hit-test';
import type { CaretAtPoint } from './tooltip-hit-test';

/** What the controller needs from the page side, all of it a read. */
export interface TooltipControllerOptions {
  /** The entries the last paint pass put on the page, in paint order. */
  paintedEntries: () => readonly PaintedEntry[];
  /** The author name that pass read, `null` when the settings give no usable one. */
  authorName: () => string | null;
  /** The measurement seam of `fragment-rect.ts`; the shipped value is the page's. */
  rangeFor?: RangeForFragment;
  /** The caret seam of `tooltip-hit-test.ts`; the shipped value is the page's. */
  caretAt?: CaretAtPoint;
  /** The viewport the placement clamp works against. */
  viewport?: () => Viewport;
  /**
   * `true` while another widget owns the host — in practice the create card of
   * `t3-01`. While it holds, no tooltip is opened and hiding one does not hide the
   * host (ruling `A68`: the widgets do not own each other's visibility).
   */
  isHostBusy?: () => boolean;
}

/** The tooltip state machine. */
export interface TooltipController {
  /** Answers one pointer position: shows, moves or hides the tooltip. */
  hoverAt(x: number, y: number): void;
  /** A click on the tooltip: opaque, and nothing else (task `t3-02` brief). */
  pin(): void;
  /** Takes the tooltip away and unpins it. */
  hide(): void;
  isOpen(): boolean;
  isPinned(): boolean;
  /** The entry the open tooltip describes, `null` when nothing is open. */
  openEntryId(): string | null;
}

/**
 * Creates the tooltip controller of one page.
 *
 * Every page read arrives as an option, so the whole machine runs in a unit test: the
 * caret seam answers "which text is under the pointer", the box seam answers where it
 * is, and the painted entries come from a real paint pass over a real DOM.
 */
export function createTooltipController(
  doc: Document,
  overlay: OverlayHost,
  options: TooltipControllerOptions,
): TooltipController {
  const rangeFor = options.rangeFor ?? documentRangeForFragment(doc);
  const caretAt = options.caretAt ?? documentCaretAtPoint(doc);
  const viewport = options.viewport ?? defaultViewportOf(doc);
  const isHostBusy = options.isHostBusy ?? ((): boolean => false);

  let open: PaintedEntry | null = null;
  let pinned = false;
  /** The last rendered content, so a pointer move inside one entry re-renders nothing. */
  let renderedKey: string | null = null;

  function hoverAt(x: number, y: number): void {
    if (isHostBusy()) {
      hide();
      return;
    }
    const hit = caretAt(x, y);
    const entry = hit === null ? null : entryAtCaret(options.paintedEntries(), hit);
    if (entry === null) {
      hide();
      return;
    }
    const anchor = hoverAnchorOf(entry, rangeFor);
    if (anchor === null) {
      // Ruling `A67`: no fragment of this entry has an area, so there is nothing to
      // put a card next to. The entry is not repaired, hidden or deleted here.
      hide();
      return;
    }

    open = entry;
    show(entry, anchor);
  }

  function pin(): void {
    if (open === null) {
      return;
    }
    pinned = true;
    show(open, null);
  }

  function hide(): void {
    if (open === null) {
      return;
    }
    open = null;
    pinned = false;
    renderedKey = null;
    const wrapper = tooltipWrapper(overlay.root);
    if (wrapper !== null) {
      render(null, wrapper);
      wrapper.style.left = '';
      wrapper.style.top = '';
    }
    if (!isHostBusy()) {
      setOverlayHostHidden(overlay, true);
    }
  }

  /** Mounts or reuses the widget, then places it. `anchor === null` keeps the place. */
  function show(entry: PaintedEntry, anchor: Box | null): void {
    ensureTooltipStyle(doc, overlay.root);
    const wrapper = ensureTooltipWrapper(doc, overlay.root);
    setOverlayHostHidden(overlay, false);

    const header = ownershipHeaderOf(entry.entry, options.authorName());
    const key = `${entry.entry.id}|${header}|${entry.entry.comment}|${pinned ? 'pinned' : 'hover'}`;
    if (key !== renderedKey) {
      renderedKey = key;
      render(
        <Tooltip
          header={header}
          isOwnEntry={isOwnEntry(entry.entry, options.authorName())}
          comment={entry.entry.comment}
          pinned={pinned}
        />,
        wrapper,
      );
    }

    if (anchor !== null) {
      position(wrapper, anchor);
    }
  }

  /**
   * Places the tooltip with the card rule (ruling `A30`, reused on purpose): below the
   * anchor box, above it when the viewport has no room below, always inside the
   * gutter. Both halves of the overlay spec's edge case follow from that: a tooltip
   * near an edge flips to the opposite side, and it never sits on the range it
   * describes, because it is placed outside the anchor box's own rows.
   */
  function position(wrapper: HTMLElement, anchor: Box): void {
    const positionOf = placeCard(anchor, boxOf(wrapper), viewport());
    wrapper.style.left = `${String(positionOf.left)}px`;
    wrapper.style.top = `${String(positionOf.top)}px`;
  }

  return {
    hoverAt,
    pin,
    hide,
    isOpen: (): boolean => open !== null,
    isPinned: (): boolean => pinned,
    openEntryId: (): string | null => (open === null ? null : open.entry.id),
  };
}

/**
 * The box the tooltip is placed against: the first fragment of the entry that has an
 * area, measured now (ruling `A67`).
 *
 * `null` covers both answers the spec gives for "no position": the page would not
 * measure the fragment (ruling `A66`), and every fragment measures zero area
 * (ruling `A67`). Both mean no tooltip, and the `catch` is scoped to this one entry —
 * it is the same per-entry boundary the paint pass keeps, and it touches nothing.
 */
function hoverAnchorOf(entry: PaintedEntry, rangeFor: RangeForFragment): Box | null {
  try {
    return placementFragmentBox(entry.fragments, rangeFor);
  } catch {
    return null;
  }
}

/** The tooltip wrapper inside the shadow root, `null` when nothing was mounted. */
function tooltipWrapper(root: ShadowRoot): HTMLElement | null {
  const existing = root.querySelector(`.${TOOLTIP_ROOT_CLASS}`);
  return existing instanceof HTMLElement ? existing : null;
}

/** The one wrapper element of the tooltip inside the shadow root. */
function ensureTooltipWrapper(doc: Document, root: ShadowRoot): HTMLElement {
  const existing = tooltipWrapper(root);
  if (existing !== null) {
    return existing;
  }
  const wrapper = doc.createElement('div');
  wrapper.className = TOOLTIP_ROOT_CLASS;
  root.append(wrapper);
  return wrapper;
}

/** The box of an element in viewport coordinates. */
function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The viewport of this document, without reaching for a global. */
function defaultViewportOf(doc: Document): () => Viewport {
  return (): Viewport => {
    const box = doc.documentElement;
    return {
      width: box === null ? 0 : box.clientWidth,
      height: box === null ? 0 : box.clientHeight,
    };
  };
}
