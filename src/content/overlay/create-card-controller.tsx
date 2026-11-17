/**
 * The create-card controller: the state machine that owns one open card.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 1-2, Rules /
 * Semantics -> "Card placement" (ruling `A30`), "Card lifetime" (ruling `A32`),
 * "Settings gate before the card" (ruling `A31`), "Refusal message map" (ruling
 * `A33`); task `t3-01` AC1, AC3, AC4, AC5.
 *
 * One card at a time, and the controller is the only writer of the host's visible
 * state for this widget: it opens, it closes, and it never repositions an open card
 * (ruling `A32` — a card over moved text is closed, not chased).
 *
 * The two moments of a capture, and they are deliberately not shared:
 * - **opening** measures the selection once (one stream, one pass) to decide
 *   whether there is a span at all and where the card goes. A selection that has
 *   no span — empty, collapsed, whitespace-only — never opens a card, so the user
 *   is never invited to type into a note that cannot exist (`t2-03` residual
 *   risk 5: core allows a degenerate candidate, so the card is the only line of
 *   defence);
 * - **saving** re-derives everything from the boundaries it kept, against a stream
 *   built at that moment (`create-note.ts`). Nothing measured while opening is
 *   reused for the write: a page that re-rendered the article between the two
 *   moments gets a note on the text that is there now, or a refusal, and never a
 *   note on a position the page no longer has (ruling `A29`).
 *
 * The settings gate (`A31`, model AC9): one core read per capture attempt, and a
 * name the author rule refuses means no card at all — not a card with a disabled
 * button, because the user would have no way to see why.
 *
 * Everything the controller reads from the environment arrives either through the
 * injected options or through the `Document` it is given, so the whole machine runs
 * in a unit test with an in-memory storage port.
 */

import { render } from 'preact';
import { buildTextStream } from '../anchor/text-stream';
import { captureSpan } from '../capture/selection-span';
import { documentRangeForFragment, firstFragmentBox } from '../capture/fragment-rect';
import type { Box, RangeForFragment } from '../capture/fragment-rect';
import {
  capturePageSelection,
  selectionBoundaries,
  sameSelectionBoundaries,
} from '../capture/page-selection';
import type { SelectionBoundaries, CapturedSelection } from '../capture/page-selection';
import { currentAuthorName, createNote } from '../create/create-note';
import type { CreateNoteResult } from '../create/create-note';
import { placeCard } from './card-placement';
import type { Viewport } from './card-placement';
import { CARD_ROOT_CLASS, ensureCardStyle } from './card-style';
import { CreateCard } from './create-card';
import { setOverlayHostHidden } from './host';
import type { OverlayHost } from './host';
import type { Entry } from '../../core/entry';
import type { RandomSource } from '../../core/entry-rules';
import type { StoragePort } from '../../core/storage-port';
import type { TextFragment } from '../anchor/text-stream';

/** What the controller needs from its environment; every seam is injectable. */
export interface CreateCardOptions {
  /** Storage seam handed to core untouched. */
  port: StoragePort;
  /** Current page URL, read per attempt: an SPA move changes the page key. */
  pageUrl: () => string;
  /** One ISO stamp per create (ruling `A9`). */
  clock: () => string;
  /** Random source for the entry id. */
  rng: RandomSource;
  /** Test seam: which selection to open a card for. */
  readSelection?: (doc: Document, host: HTMLElement) => CapturedSelection | null;
  /** Test seam: how a fragment is measured, so the UTF-16 rule is observable. */
  rangeFor?: RangeForFragment;
  /** Test seam: the viewport the placement is clamped against. */
  viewport?: () => Viewport;
  /** Handover to the painting stage (`t3-02`): the entry that was just stored. */
  onCreated?: (entry: Entry) => void;
}

/** The open card, or nothing. */
interface CardSession {
  readonly range: Range;
  readonly root: Node;
  readonly authorName: string;
  readonly boundaries: SelectionBoundaries;
}

/** The controller the page wiring talks to. */
export interface CreateCardController {
  /** One capture attempt: settings gate, capture, placement, mount. */
  capture(): Promise<void>;
  /** Closes the card and writes nothing. */
  close(): void;
  isOpen(): boolean;
  /**
   * Ruling `A32`: `true` when an open card's selection has moved to other
   * boundary points. A collapsed or empty page selection answers `false`: the
   * card keeps its text, because the user may be typing.
   */
  selectionMovedElsewhere(range: Range | null): boolean;
}

/**
 * Creates the controller for one shadow host. The card wrapper and the card style
 * are created once per shadow root, so a second capture attempt finds the same two
 * elements and the page still holds exactly one element of the extension.
 */
export function createCreateCardController(
  doc: Document,
  overlay: OverlayHost,
  options: CreateCardOptions,
): CreateCardController {
  const wrapper = ensureCardWrapper(doc, overlay.root);
  const rangeFor = options.rangeFor ?? documentRangeForFragment(doc);
  const readSelection = options.readSelection ?? capturePageSelection;
  const viewport = options.viewport ?? defaultViewportOf(doc);

  let session: CardSession | null = null;

  async function submit(comment: string): Promise<CreateNoteResult> {
    if (session === null) {
      return { ok: false, code: 'selection_lost' };
    }
    const result = await createNote({
      port: options.port,
      url: options.pageUrl(),
      root: session.root,
      range: session.range,
      comment,
      authorName: session.authorName,
      now: options.clock(),
      rng: options.rng,
    });
    if (result.ok) {
      close();
      if (options.onCreated !== undefined) {
        options.onCreated(result.entry);
      }
    }
    return result;
  }

  function open(selection: CapturedSelection, authorName: string, fragments: readonly TextFragment[]): void {
    session = {
      range: selection.range,
      root: selection.root,
      authorName,
      boundaries: selectionBoundaries(selection.range),
    };
    render(<CreateCard onSubmit={submit} onCancel={close} />, wrapper);
    setOverlayHostHidden(overlay, false);
    positionCard(fragments);
  }

  function close(): void {
    if (session === null) {
      return;
    }
    session = null;
    render(null, wrapper);
    wrapper.style.left = '';
    wrapper.style.top = '';
    setOverlayHostHidden(overlay, true);
  }

  /**
   * Places the card against the first resolved fragment of the selection
   * (ruling `A30`). The card's own box is measured after the mount, because the
   * stylesheet — not this module — decides its size.
   */
  function positionCard(fragments: readonly TextFragment[]): void {
    const anchorBox = firstFragmentBox(fragments, rangeFor);
    if (anchorBox === null) {
      return;
    }
    const position = placeCard(anchorBox, boxOf(wrapper), viewport());
    wrapper.style.left = `${String(position.left)}px`;
    wrapper.style.top = `${String(position.top)}px`;
  }

  async function capture(): Promise<void> {
    if (session !== null) {
      return;
    }
    const selection = readSelection(doc, overlay.host);
    if (selection === null) {
      return;
    }
    const authorName = await currentAuthorName(options.port);
    if (authorName === null) {
      return;
    }
    const span = captureSpan(buildTextStream(selection.root), selection.range);
    if (span === null) {
      return;
    }
    open(selection, authorName, span.fragments);
  }

  function selectionMovedElsewhere(range: Range | null): boolean {
    if (session === null || range === null) {
      return false;
    }
    return !sameSelectionBoundaries(session.boundaries, selectionBoundaries(range));
  }

  return {
    capture,
    close,
    isOpen: (): boolean => session !== null,
    selectionMovedElsewhere,
  };
}

/** The one wrapper element of the card inside a shadow root. */
function ensureCardWrapper(doc: Document, root: ShadowRoot): HTMLElement {
  const existing = root.querySelector(`.${CARD_ROOT_CLASS}`);
  if (existing instanceof HTMLElement) {
    ensureCardStyle(doc, root);
    return existing;
  }
  ensureCardStyle(doc, root);
  const wrapper = doc.createElement('div');
  wrapper.className = CARD_ROOT_CLASS;
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
