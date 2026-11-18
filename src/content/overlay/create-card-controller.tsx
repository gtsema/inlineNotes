/**
 * The create-card controller: the state machine that owns one open card.
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 1-2, Rules /
 * Semantics -> "Card placement" (ruling `A30`), "Card lifetime" (ruling `A32`),
 * "Settings gate before the card" (ruling `A31`), "The `contained own selection`"
 * (ruling `A103`), "Refusal message map" (ruling `A33`); task `t3-01` AC1, AC3, AC4,
 * AC5 and task `t5-03` AC4, AC5, AC6.
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
 *   defence). The box is measured **before anything is mounted**, because a card
 *   whose position is unknown is a card the user cannot reach: a measurement that
 *   throws — the page shrank the selected text node during the settle delay, so
 *   `setStart` rejects — closes the card instead of leaving it mounted without
 *   coordinates, and it writes nothing (ruling `A64`). A span whose every fragment
 *   measures zero area is not a failure: it has no anchor point, and the card is
 *   placed by the viewport rule instead (ruling `A65`);
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
 * The `contained own selection` (ruling `A103`, task `t5-03` AC4): a settled selection
 * whose whole range lies inside the `resolved span` of one of the reader's own painted
 * entries opens **no widget at all**. The question is answered by
 * `contained-own-selection.ts` from the output of the last paint pass, and it is asked
 * after the author gate on purpose: with no usable name every entry of the page is
 * foreign, nothing of it is the reader's, and `A31` already answers with no widget. A
 * selection inside somebody else's entry is not one — the card opens there, because
 * creating over a foreign note is legal since ruling `A93` — and so is a selection that
 * only crosses one boundary of an own entry, which the `overlap` rule answers at the
 * write. Nothing is measured and no core write is attempted for a contained selection:
 * the page already shows the note that selection describes.
 *
 * Everything the controller reads from the environment arrives either through the
 * injected options or through the `Document` it is given, so the whole machine runs
 * in a unit test with an in-memory storage port.
 */

import { render } from 'preact';
import { buildTextStream } from '../anchor/text-stream';
import { captureSpan } from '../capture/selection-span';
import type { CapturedSpan } from '../capture/selection-span';
import { documentRangeForFragment, placementFragmentBox } from '../capture/fragment-rect';
import type { Box, RangeForFragment } from '../capture/fragment-rect';
import {
  capturePageSelection,
  selectionBoundaries,
  sameSelectionBoundaries,
} from '../capture/page-selection';
import type { SelectionBoundaries, CapturedSelection } from '../capture/page-selection';
import { currentAuthorName, createNote } from '../create/create-note';
import type { CreateNoteResult } from '../create/create-note';
import { placeCard, placeCardInViewport } from './card-placement';
import type { Viewport } from './card-placement';
import { CARD_ROOT_CLASS, WIDGET_ROOT_CLASS, ensureCardStyle } from './card-style';
import { isContainedOwnSelection } from './contained-own-selection';
import { CreateCard } from './create-card';
import { setOverlayHostHidden } from './host';
import type { OverlayHost } from './host';
import type { PaintedEntry } from '../paint/paint-plan';
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
  /**
   * The entries the last `paint pass` put on the page, in paint order — the only
   * description of the page this controller consults for the `contained own selection`
   * silence of ruling `A103`. It never resolves an anchor to answer it.
   */
  paintedEntries: () => readonly PaintedEntry[];
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

  function open(
    selection: CapturedSelection,
    authorName: string,
    anchorBox: Box | null,
  ): void {
    session = {
      range: selection.range,
      root: selection.root,
      authorName,
      boundaries: selectionBoundaries(selection.range),
    };
    render(<CreateCard onSubmit={submit} onCancel={close} />, wrapper);
    setOverlayHostHidden(overlay, false);
    positionCard(anchorBox);
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
   * Writes the placement of the card (ruling `A30`). The card's own box is measured
   * after the mount, because the stylesheet — not this module — decides its size.
   *
   * `null` anchor box means "this span has no box to place against": every fragment
   * of the selection measures zero area (a hidden subtree is in the stream by ruling
   * `A1`). The card is then placed by the viewport rule, not left at the corner of
   * the shadow host, which is inside the `card gutter` (ruling `A65`).
   */
  function positionCard(anchorBox: Box | null): void {
    const cardBox = boxOf(wrapper);
    const position =
      anchorBox === null
        ? placeCardInViewport(cardBox, viewport())
        : placeCard(anchorBox, cardBox, viewport());
    wrapper.style.left = `${String(position.left)}px`;
    wrapper.style.top = `${String(position.top)}px`;
  }

  /**
   * The box the card will be placed against.
   *
   * Two different answers, and they must not collapse into one:
   * - `{ ok: false }` — the measurement **threw**. `setStart` / `setEnd` reject
   *   exactly when the page shrank the text node under the fragment list during the
   *   settle delay, and this is the only place that knows what to do about it: the
   *   card closes (ruling `A64`). The measurement runs before `open` mounts anything,
   *   so a failed measurement leaves no mounted card without coordinates, the host
   *   stays hidden, and no write is attempted; the next settled selection is a fresh
   *   capture.
   * - `{ ok: true, box: null }` — the span is fine but has **no box**: every fragment
   *   measures zero area, and the card is placed by the viewport rule (`A65`).
   */
  function measureAnchorBox(fragments: readonly TextFragment[]): AnchorMeasurement {
    try {
      return { ok: true, box: placementFragmentBox(fragments, rangeFor) };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Reads the selected span out of the page at the open moment (Flow 1 step 2).
   *
   * Guarded at the call site (task `t3-05` AC1, ruling `A75`): the text node the
   * selection sits in may leave the document during the `await` of the author gate
   * above, and a real engine then **throws** `InvalidAccessError` from
   * `Range.intersectsNode` rather than answering `false`. `card-events.ts` runs `void
   * controller.capture()`, so a rejection leaving this function is an unhandled
   * rejection on a page that has no idea the extension exists. Flow 1's answer to "no
   * usable span" is no card at all, so a throw answers the same way as a `null`.
   */
  function captureFromPage(selection: CapturedSelection): CapturedSpan | null {
    try {
      return captureSpan(buildTextStream(selection.root), selection.range);
    } catch {
      return null;
    }
  }

  /**
   * One capture attempt: settings gate, the `contained own selection` silence, capture,
   * placement, mount.
   */
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
    if (isContainedOwnSelection(options.paintedEntries(), selection.range, authorName)) {
      // `A103`: the page already says everything this selection would say — the note is
      // painted there and its `tooltip` answers a pointer inside it. No card, and no
      // editor either: a selection is not the click that opens one (ruling `A96`).
      return;
    }
    const span = captureFromPage(selection);
    if (span === null) {
      return;
    }
    const measured = measureAnchorBox(span.fragments);
    if (!measured.ok) {
      // `A64`: no coordinates, so no card. Nothing was mounted and nothing is written.
      return;
    }
    open(selection, authorName, measured.box);
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
  wrapper.className = `${WIDGET_ROOT_CLASS} ${CARD_ROOT_CLASS}`;
  root.append(wrapper);
  return wrapper;
}

/** The outcome of one measurement attempt (`A64` versus `A65`). */
type AnchorMeasurement = { ok: true; box: Box | null } | { ok: false };

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
