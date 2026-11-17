/**
 * The editor controller: the state machine that owns one open editor over an
 * existing entry (task `t3-03`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 5-6, Rules /
 * Semantics -> "The editor is opened by a selection, never by a foreign entry",
 * "The editor keeps its range unless the reader re-selects", "Editor lifetime",
 * "Card placement" (rulings `A30`, `A64`, `A65`, reused), "The card and the editor
 * must be reachable by keyboard" (ruling `A74`), and the `A68` coexistence rule;
 * task `t3-03` AC1-AC5.
 *
 * One editor at a time, and this controller is the only writer of the widget's open
 * state. It never repositions an open editor: the overlay spec's answer to moved text
 * is the close, not the chase (ruling `A32`).
 *
 * **The claim, which is the whole of Flow 6.** `openFor` answers a yes/no question to
 * the create-card controller: *does this selection belong to an existing entry?* It
 * answers `true` — "no create card here" — in three states, and only one of them
 * opens a widget:
 * - the selection lies inside the reader's own painted entry → the editor opens;
 * - it lies inside **somebody else's** entry → nothing opens. `A25` and model AC8
 *   give a foreign record no edit affordance at all, and a create card would be
 *   refused by core as an overlap, so opening one would promise a note the reader is
 *   not allowed to write. The read-only `tooltip` of Flow 3 is the whole of what a
 *   foreign entry offers;
 * - it lies inside the reader's own entry but the entry's fragments cannot be
 *   measured → the editor does not open (the `A64` rule of the create card applied
 *   here): a widget without coordinates is a widget the reader cannot reach, and the
 *   alternative — mounting it and then failing — is what `t3-01` ruling `A64` closed
 *   for the card.
 *
 * `true` is also the answer while an editor is already open, so a re-selection made
 * inside an open editor can never open a create card next to it.
 *
 * **The range rule, and where it is decided.** Saving an unchanged selection is a
 * comment edit: the entry keeps the span it has (ruling `A45`). The controller
 * therefore keeps the boundary points of the selection that opened the editor and
 * compares them with the page selection at the moment the save button is pressed;
 * only a
 * difference is a re-selection, and only a re-selection is handed to the edit path as
 * a new span to check. The comparison is identity plus offsets — the same comparison
 * `sameSelectionBoundaries` performs for the card's `A32` rule — because comparing a
 * remembered *range* with a freshly resolved one is the failure the `A37` contract
 * warns about: two measurements of two different page states.
 *
 * **No focus is taken** (ruling `A74`, and overlay AC17 for the card). Nothing here
 * calls `focus()`: the page keeps the element it had focused, and the reader reaches
 * `textarea`, save, cancel and delete with `Tab`. That is also why `Esc` is
 * answered at the document level in `editor-events.ts` as well as inside the widget —
 * with the page holding focus, a key press never reaches the shadow tree on its own.
 */

import { render } from 'preact';
import { documentRangeForFragment, placementFragmentBox } from '../capture/fragment-rect';
import type { Box, FragmentOffsets, RangeForFragment } from '../capture/fragment-rect';
import {
  capturePageSelection,
  selectionBoundaries,
  sameSelectionBoundaries,
} from '../capture/page-selection';
import type { CapturedSelection, SelectionBoundaries } from '../capture/page-selection';
import { saveEntryComment, removeEntryFromPage } from '../editor/edit-entry';
import type { EditNoteResult } from '../editor/edit-entry';
import { entryOwningSelection } from '../editor/painted-selection';
import type { PaintedEntry } from '../paint/paint-plan';
import { placeCard, placeCardInViewport } from './card-placement';
import type { Viewport } from './card-placement';
import { EDITOR_ROOT_CLASS, WIDGET_ROOT_CLASS, ensureCardStyle } from './card-style';
import { EntryEditor } from './editor';
import { setOverlayHostHidden } from './host';
import type { OverlayHost } from './host';
import { isOwnEntry } from './tooltip-hit-test';
import type { Entry } from '../../core/entry';
import type { EntryWriteResult } from '../../core/entry-store-write';
import type { StoragePort } from '../../core/storage-port';

/** What the controller needs from its environment; every seam is injectable. */
export interface EditorControllerOptions {
  /** Storage seam handed to core untouched. */
  port: StoragePort;
  /** Current page URL, read per write: an SPA move changes the page key. */
  pageUrl: () => string;
  /** One ISO stamp per write (ruling `A9`). */
  clock: () => string;
  /** The entries the last paint pass put on the page, in paint order. */
  paintedEntries: () => readonly PaintedEntry[];
  /** Test seam: which selection to read at open time and again at save time. */
  readSelection?: (doc: Document, host: HTMLElement) => CapturedSelection | null;
  /** Test seam: how a fragment is measured. */
  rangeFor?: RangeForFragment;
  /** Test seam: the viewport the placement is clamped against. */
  viewport?: () => Viewport;
  /**
   * `true` while another widget owns the overlay host — in practice the create card.
   * Ruling `A68`: a widget does not turn off a light another widget is using, so
   * closing an editor leaves the host visible while the card still needs it.
   */
  isHostBusy?: () => boolean;
  /** Called when the editor takes the host: the coordinator dismisses the tooltip. */
  onOpened?: () => void;
  /** Handover to the painting stage: the entry as it is now stored. */
  onSaved?: (entry: Entry) => void;
  /** Handover to the painting stage: the id that is gone from the store. */
  onDeleted?: (entryId: string) => void;
}

/** The controller the page wiring talks to. */
export interface EditorController {
  /**
   * Flow 6: takes the selection if it belongs to an existing entry, opening the
   * editor when the reader is allowed to edit it. `true` means the caller must not
   * open a create card.
   */
  openFor(selection: CapturedSelection, authorName: string): boolean;
  /** The save button: writes through core and closes on success only. */
  submit(comment: string): Promise<EditNoteResult>;
  /** The delete button: removes the entry at once (ruling `A44`). */
  remove(): Promise<EntryWriteResult>;
  /** Closes the editor and writes nothing (`A42`, `A43`). */
  close(): void;
  isOpen(): boolean;
  /** The entry the open editor holds, `null` when nothing is open. */
  openEntryId(): string | null;
}

/** The open editor, or nothing. */
interface EditorSession {
  readonly entryId: string;
  /** Subtree the re-selection is resolved against — the root of the open moment. */
  readonly root: Node;
  readonly authorName: string;
  /** The boundary points of the selection that opened the editor. */
  readonly boundaries: SelectionBoundaries;
}

/**
 * Creates the editor controller of one shadow host. The wrapper and the stylesheet
 * are created once per shadow root, so a page keeps exactly one element of the
 * extension however many times an editor opens and closes.
 */
export function createEditorController(
  doc: Document,
  overlay: OverlayHost,
  options: EditorControllerOptions,
): EditorController {
  const wrapper = ensureEditorWrapper(doc, overlay.root);
  const rangeFor = options.rangeFor ?? documentRangeForFragment(doc);
  const readSelection = options.readSelection ?? capturePageSelection;
  const viewport = options.viewport ?? defaultViewportOf(doc);
  const isHostBusy = options.isHostBusy ?? ((): boolean => false);

  let session: EditorSession | null = null;

  function openFor(selection: CapturedSelection, authorName: string): boolean {
    if (session !== null) {
      return true;
    }
    const owner = entryOwningSelection(options.paintedEntries(), selection.range);
    if (owner === null) {
      return false;
    }
    if (!isOwnEntry(owner.entry, authorName)) {
      // Claimed and left closed: a foreign entry has no editor (`A25`, model AC8).
      return true;
    }
    const measured = measureEntryBox(owner.fragments);
    if (!measured.ok) {
      // The page would not measure the entry: no coordinates, so no widget, and the
      // selection is still not the create card's (`A64` applied to the editor).
      return true;
    }
    open(owner, selection, authorName, measured.box);
    return true;
  }

  function open(
    owner: PaintedEntry,
    selection: CapturedSelection,
    authorName: string,
    anchorBox: Box | null,
  ): void {
    session = {
      entryId: owner.entry.id,
      root: selection.root,
      authorName,
      boundaries: selectionBoundaries(selection.range),
    };
    render(
      <EntryEditor
        initialComment={owner.entry.comment}
        canEdit
        onSubmit={submit}
        onCancel={close}
        onDelete={remove}
      />,
      wrapper,
    );
    setOverlayHostHidden(overlay, false);
    positionEditor(anchorBox);
    if (options.onOpened !== undefined) {
      options.onOpened();
    }
  }

  /**
   * The save button. The re-selection question is answered here, at the moment of the
   * press, and never from a span remembered at open time.
   *
   * A page selection that is gone (`null`) or that has the same boundary points as the
   * one that opened the editor is not a re-selection: the entry keeps its range
   * (ruling `A45`), and no overlap question is asked. A selection inside the overlay
   * host is `null` by the capture rule of `page-selection.ts`, which is what keeps a
   * caret moving inside the editor's own textarea from looking like a moved note.
   *
   * On a refusal the editor stays open with its draft and the widget shows the
   * sentence of the code (task `t3-03` AC5); on success it closes and the coordinator
   * repaints.
   */
  async function submit(comment: string): Promise<EditNoteResult> {
    if (session === null) {
      return { ok: false, code: 'selection_lost' };
    }
    const result = await saveEntryComment({
      port: options.port,
      url: options.pageUrl(),
      root: session.root,
      id: session.entryId,
      comment,
      currentName: session.authorName,
      now: options.clock(),
      reselection: reselectionOf(session.boundaries),
    });
    if (result.ok) {
      close();
      if (options.onSaved !== undefined) {
        options.onSaved(result.entry);
      }
    }
    return result;
  }

  /**
   * The delete button: core removes the record, and the coordinator takes away the
   * paint and the tooltip (task `t3-03` AC4). No confirmation is asked (ruling `A44`),
   * and no
   * authorship is checked here: `A25` puts that rule in the UI, and the UI half is
   * `openFor` refusing to open for a foreign entry at all.
   */
  async function remove(): Promise<EntryWriteResult> {
    if (session === null) {
      return { ok: false, code: 'entry_not_found' };
    }
    const entryId = session.entryId;
    const result = await removeEntryFromPage(options.port, options.pageUrl(), entryId);
    if (result.ok) {
      close();
      if (options.onDeleted !== undefined) {
        options.onDeleted(entryId);
      }
    }
    return result;
  }

  function close(): void {
    if (session === null) {
      return;
    }
    session = null;
    render(null, wrapper);
    wrapper.style.left = '';
    wrapper.style.top = '';
    if (!isHostBusy()) {
      setOverlayHostHidden(overlay, true);
    }
  }

  /**
   * The page selection at this moment, as a re-selection or as `null` (`A45`).
   *
   * `sameSelectionBoundaries` is the comparison the card's `A32` rule already uses:
   * node identity plus offsets. It is deliberately not a comparison of resolved
   * ranges — a range resolved when the editor opened is a position in a page state
   * that may no longer exist, and the pair (that range, a range resolved now) is two
   * measurements of two different strings (`A37`).
   */
  function reselectionOf(boundaries: SelectionBoundaries): Range | null {
    const current = readSelection(doc, overlay.host);
    if (current === null) {
      return null;
    }
    return sameSelectionBoundaries(boundaries, selectionBoundaries(current.range))
      ? null
      : current.range;
  }

  /**
   * Writes the placement of the editor with the `card placement` rule (ruling `A30`),
   * the same two answers the create card gives: the anchor box of the entry's first
   * fragment that has an area, or the viewport rule when none has one (ruling `A65`).
   * The widget's own box is measured after the mount, because the stylesheet — not
   * this module — decides its size.
   */
  function positionEditor(anchorBox: Box | null): void {
    const editorBox = boxOf(wrapper);
    const position =
      anchorBox === null
        ? placeCardInViewport(editorBox, viewport())
        : placeCard(anchorBox, editorBox, viewport());
    wrapper.style.left = `${String(position.left)}px`;
    wrapper.style.top = `${String(position.top)}px`;
  }

  /**
   * The box the editor will be placed against, measured **before anything is
   * mounted**, and guarded at the call site (task `t3-05` AC1, ruling `A75`).
   *
   * `Range.setStart` / `setEnd` reject when the page replaced the text node under a
   * fragment between the paint pass and this press. The answer is the same per-entry
   * degradation rulings `A64` and `A66` give everywhere else: this entry gets no
   * widget, nothing else changes, nothing is written, and the next settled selection is
   * a fresh claim attempt.
   */
  function measureEntryBox(fragments: readonly FragmentOffsets[]): AnchorMeasurement {
    try {
      return { ok: true, box: placementFragmentBox(fragments, rangeFor) };
    } catch {
      return { ok: false };
    }
  }

  return {
    openFor,
    submit,
    remove,
    close,
    isOpen: (): boolean => session !== null,
    openEntryId: (): string | null => (session === null ? null : session.entryId),
  };
}

/** The outcome of one measurement attempt (`A64`, not `A65`). */
type AnchorMeasurement = { ok: true; box: Box | null } | { ok: false };

/** The one wrapper element of the editor inside a shadow root. */
function ensureEditorWrapper(doc: Document, root: ShadowRoot): HTMLElement {
  const existing = root.querySelector(`.${EDITOR_ROOT_CLASS}`);
  if (existing instanceof HTMLElement) {
    ensureCardStyle(doc, root);
    return existing;
  }
  ensureCardStyle(doc, root);
  const wrapper = doc.createElement('div');
  wrapper.className = `${WIDGET_ROOT_CLASS} ${EDITOR_ROOT_CLASS}`;
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
