/**
 * The editor controller: the state machine that owns one open editor over an
 * existing entry (task `t3-03`, and the opening half of task `t5-03`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Flow / Sequence 4-5, Rules /
 * Semantics -> "The `editor widget` is opened by a click on the `tooltip`", "Editor
 * placement", "Editor lifetime", "The editor keeps its range unless the reader
 * re-selects", "Ruling `A78`: what a successful `re-selection` stores", "Settings name
 * picked up without a reload", "Page-boundary throws", plus "Card placement" (rulings
 * `A30`, `A64`, `A65`, reused), "The card and the editor must be reachable by
 * keyboard" (ruling `A74`) and the `A68` coexistence rule; and
 * `docs/specs/inline-comment-model.md` -> "Edit rights", "Overlap", "Staleness".
 * Task `t3-03` AC2-AC5 for the editor itself, and task `t5-03` AC1, AC2, AC3, AC7,
 * AC8, AC9 for the half ruling `A96` and ruling `A104` changed; rulings `A42`, `A43`,
 * `A44`, `A45`, `A64`, `A65`, `A74`, `A78`, `A96`, `A104`, `A106`, `A107`.
 *
 * One editor at a time, and this controller is the only writer of the widget's open
 * state. It never repositions an open editor: the overlay spec's answer to moved text
 * is the close, not the chase (ruling `A32`).
 *
 * **How the editor opens is the whole of what task `t5-03` changed here.**
 * `openFromPaintedEntry` is asked by the `tooltip` controller at the Flow 4 click, and
 * it is asked with the entry that entry was painted from — the output of the last
 * `paint pass` — because ruling `A104` chose the paint pass as the range of the editor:
 * no page selection is required, no anchor is resolved a second time, and no stored
 * range moves. `measureEntryBox` is a placement measurement, not a derivation.
 * - the entry is the reader's own → the editor opens, prefilled with the stored
 *   `comment`;
 * - it is **somebody else's** entry → `false`, and nothing opens. `A25` and model AC8
 *   give a foreign record no edit affordance at all, and the read-only `tooltip` the
 *   reader is already looking at is the whole of what a foreign entry offers;
 * - it is the reader's own but its fragments cannot be measured → `false` and nothing
 *   opens (the `A64` rule of the create card applied to the click): a widget without
 *   coordinates is a widget the reader cannot reach, and the `tooltip` that was clicked
 *   simply stays where it was.
 *
 * `false` is also the answer while an editor is already open, and a click that hears
 * `false` opens nothing else either: a click is not a selection, so no create card is
 * waiting behind it.
 *
 * **The range rule, and where it is decided.** Saving an unchanged selection is a
 * comment edit: the entry keeps the span it has (ruling `A45`). Two page states answer
 * "no `re-selection`", and both are decided from the page selection read at the open
 * moment and again at the press:
 * - the selection the editor **found when it opened** is still the selection at the
 *   press — or there was none and there still is none (ruling `A107`). Whatever words
 *   that selection lies across, the reader did not make it during the editing session, so
 *   it decides nothing about the save. This is the half ruling `A106` stated as an outcome
 *   instead of a rule, and it is why the open read exists at all: a baseline of "whatever
 *   the page happened to hold" was never the point of ruling `A104`;
 * - the page selection at the press sits on the very boundary points of the
 *   `resolved span` this editor was opened over — the fragment set the `paint pass`
 *   registered (ruling `A106`). A reader who clicks the `tooltip`, selects the note's own
 *   words again (a selection that opens nothing, ruling `A103`) and saves has changed the
 *   comment and nothing else.
 *
 * Anything else is a `re-selection`: a page selection that **appears or changes while the
 * editor stands**, and it is the only thing handed to the edit path as a new span for the
 * `overlap` question of ruling `A78` — answered per author (`A93`, `A99`, `A100`) and with
 * the edited entry excluded from the list the check scans (`A45`), so an entry never
 * collides with itself.
 *
 * Every comparison is identity plus offsets — the same comparison
 * `sameSelectionBoundaries` performs for the card's `A32` rule — because comparing a
 * remembered *range* with a freshly resolved one is the failure the `A37` contract
 * warns about: two measurements of two different page states. Neither kept state is ever
 * resolved, painted from or written; each is a pair of boundary points kept only to answer
 * "did the page selection move while this editor stood".
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
  /**
   * Test seam: the page selection, read twice — once when the editor opens, to record
   * what the click found (ruling `A107`), and once at the save moment, where the
   * `re-selection` question of rulings `A45`, `A106`, `A107` is asked. Ruling `A104`: the
   * click brings no selection, so neither read decides *which* entry the editor is for.
   */
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
   * Flow 4: opens the editor of the entry the reader clicked the `tooltip` of, asked
   * with the `PaintedEntry` the last `paint pass` produced (ruling `A104`). `false` is
   * the answer for a `foreign entry`, for an entry the page will not measure, and while
   * another editor is open — and the caller opens nothing else in that case.
   */
  openFromPaintedEntry(owner: PaintedEntry, authorName: string): boolean;
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
  /**
   * The boundary points of the `resolved span` this editor was opened over — the
   * fragments the last `paint pass` registered (ruling `A104`). It is one baseline the
   * `re-selection` question of ruling `A45` is asked against: a page selection on those
   * very points is the note's own selected text, not a move (ruling `A106`).
   */
  readonly boundaries: SelectionBoundaries;
  /**
   * The boundary points of the page selection the editor **found at its open moment**,
   * or `null` for "the page held no selection when this editor opened" (ruling `A107`). A
   * page selection still standing on those points at the press is not a `re-selection`,
   * whichever words it lies across: it is a selection the reader did not make while the
   * editor stood, so it asks no `overlap` question.
   */
  readonly openSelection: SelectionBoundaries | null;
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

  function openFromPaintedEntry(owner: PaintedEntry, authorName: string): boolean {
    if (session !== null) {
      return false;
    }
    if (!isOwnEntry(owner.entry, authorName)) {
      // Nothing opens: a foreign entry has no editor (`A25`, model AC8), and the
      // `tooltip` the reader clicked is the whole of what that entry offers.
      return false;
    }
    const measured = measureEntryBox(owner.fragments);
    if (!measured.ok) {
      // The page would not measure the entry: no coordinates, so no widget, and the
      // `tooltip` that was clicked stays where it was (`A64` applied to the click).
      return false;
    }
    const openedOver = spanBoundariesOf(owner.fragments);
    if (openedOver === null) {
      // An entry the pass carries no fragment for has no span to open over, so ruling
      // `A104` has nothing to answer and the click opens nothing.
      return false;
    }
    open(owner, authorName, openedOver, measured.box);
    return true;
  }

  /**
   * The page selection as the open moment finds it, kept as boundary points only (ruling
   * `A107`). Read **before** the widget is mounted, so a selection inside the overlay host
   * is the `null` the capture rule already answers for it, and what is recorded is the
   * page the click landed on.
   */
  function openSelectionState(): SelectionBoundaries | null {
    const found = readSelection(doc, overlay.host);
    return found === null ? null : selectionBoundaries(found.range);
  }

  /**
   * Mounts the editor over the entry's own `resolved span` (ruling `A104`): the only
   * range this module ever sees is the fragment set the `paint pass` registered, and
   * the only thing the measurement above decided is where the widget stands. No page
   * selection is read here — the click is the whole of the opening argument.
   */
  function open(
    owner: PaintedEntry,
    authorName: string,
    openedOver: SelectionBoundaries,
    anchorBox: Box | null,
  ): void {
    session = {
      entryId: owner.entry.id,
      root: doc.body,
      authorName,
      boundaries: openedOver,
      openSelection: openSelectionState(),
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
   * press, against the two boundary states the open moment recorded — and never from a
   * span remembered at open time.
   *
   * A page selection that is gone (`null`), or that still stands where the open moment
   * found it (ruling `A107`), or that sits on the very boundary points of the span the
   * editor was opened over (ruling `A106`), is not a re-selection: the entry keeps its
   * range (ruling `A45`) and no overlap question is asked. Those are the ordinary states
   * of an editor a `tooltip` click opened — the page usually holds no selection, or holds
   * one the reader made before the click, or the reader selects the note's own words,
   * which opens nothing (rulings `A104`, `A103`). A selection inside the overlay host is
   * `null` by the capture rule of `page-selection.ts`, which is what keeps a
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
      reselection: reselectionOf(session),
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
   * `openFromPaintedEntry` answering `false` for a foreign entry at all.
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
   * The page selection at this moment, as a re-selection or as `null` (`A45`, `A106`,
   * `A107`). Only a selection that **appeared or changed while the editor stands** is a
   * re-selection, so two boundary states of the open moment are consulted here: the
   * selection the click found (ruling `A107`) and the `resolved span` the pass painted
   * (ruling `A106`).
   *
   * `sameSelectionBoundaries` is the comparison the card's `A32` rule already uses:
   * node identity plus offsets. It is deliberately not a comparison of resolved
   * ranges — a range resolved when the editor opened is a position in a page state
   * that may no longer exist, and the pair (that range, a range resolved now) is two
   * measurements of two different strings (`A37`).
   */
  function reselectionOf(session: EditorSession): Range | null {
    const current = readSelection(doc, overlay.host);
    if (current === null) {
      // Nothing to move the note with: the ordinary `A104` state.
      return null;
    }
    const now = selectionBoundaries(current.range);
    if (sameBoundaryState(session.openSelection, now)) {
      // The reader made no selection during this editing session (`A107`). What that
      // selection covered is not this question's business: the `overlap` rule answers for
      // a span the reader chose now, and this one was already on the page at the click.
      return null;
    }
    if (sameSelectionBoundaries(session.boundaries, now)) {
      // The note's own words, selected again (`A106`, and ruling `A103` opened no card
      // for them): a comment edit, not a move.
      return null;
    }
    return current.range;
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
   * fragment between the paint pass and this click. The answer is the same per-entry
   * degradation rulings `A64` and `A66` give everywhere else: this entry gets no
   * widget, the `tooltip` that was clicked stays where it was, nothing is written, and
   * the next `paint pass` is what reconciles the page. No create card follows the
   * refusal, because a click is not a selection.
   */
  function measureEntryBox(fragments: readonly FragmentOffsets[]): AnchorMeasurement {
    try {
      return { ok: true, box: placementFragmentBox(fragments, rangeFor) };
    } catch {
      return { ok: false };
    }
  }

  return {
    openFromPaintedEntry,
    submit,
    remove,
    close,
    isOpen: (): boolean => session !== null,
    openEntryId: (): string | null => (session === null ? null : session.entryId),
  };
}

/** The outcome of one measurement attempt (`A64`, not `A65`). */
type AnchorMeasurement = { ok: true; box: Box | null } | { ok: false };

/**
 * "Did the page selection move from where the open moment found it" (ruling `A107`),
 * where the kept side may be `null` for "the page held no selection". The present/present
 * half is `sameSelectionBoundaries`; this is the nullable wrapper around it, kept local
 * because no shipped module owns a nullable boundary comparison.
 */
function sameBoundaryState(kept: SelectionBoundaries | null, now: SelectionBoundaries): boolean {
  if (kept === null) {
    return false;
  }
  return sameSelectionBoundaries(kept, now);
}

/**
 * The boundary points of an entry's `resolved span` as the paint pass holds it: the
 * first fragment's start and the last fragment's end, in the document order the pass
 * stores them in.
 *
 * These are the same node-local offsets the `paint name` was registered with, so the
 * baseline of the `re-selection` question and the highlight on the screen cannot
 * disagree — which is the whole of ruling `A104`. `null` answers only for a fragment set
 * the pass does not carry, which is no span an editor can open over.
 */
function spanBoundariesOf(
  fragments: readonly FragmentOffsets[],
): SelectionBoundaries | null {
  const first = fragments[0];
  const last = fragments[fragments.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  return {
    startNode: first.node,
    startOffset: first.start,
    endNode: last.node,
    endOffset: last.end,
  };
}

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
