/**
 * The load-time paint pass: entries in, highlights on the page out (task `t3-02`
 * AC1, AC2, AC5; rulings `A29`, `A38`, `A39`, `A40`, `A66`, `A68`, `A70`).
 *
 * Rule owner: `docs/specs/inline-comment-model.md` -> Flow / Sequence 6 (on load:
 * read the page's entries, resolve every anchor, paint the resolved ones) and
 * `docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "Highlight painting",
 * "Paint teardown", "Paint-path measurement", "Paint ownership".
 *
 * This module is the owner of `CSS.highlights` for the whole extension (ruling
 * `A68`): nothing else in `src/content/` registers or deletes a highlight name, and
 * in particular the create card of `t3-01` does not — closing the card hides the
 * shadow host, which is a different visibility from the painted text. The coexistence
 * test in `tests/content-page-painter.spec.ts` is what keeps the two from leaking
 * into each other again.
 *
 * Ordering inside one pass:
 *
 * 1. read the page's entries and the current author name — the only `await`s; a read
 *    that could not read the index, the layout or the URL tears the paint down and
 *    answers empty, because nothing is painted from a page state this pass did not
 *    read;
 * 2. build the stream, resolve, measure (`paint-plan.ts`), all synchronously after
 *    the reads, which is the `A29` property the create path already pins: the stream
 *    and every measurement see the DOM as it is when the reads are done, never a
 *    cached one;
 * 3. remove the names this pass no longer needs (ruling `A39`), then write each
 *    entry's ranges under its own name (ruling `A70`), then sync the paint rules
 *    (ruling `A41`).
 *
 * Teardown runs before painting, and it removes **only** names carrying the
 * extension prefix: `CSS.highlights` is a document-global map, and a page script's
 * own highlight names are not this extension's to delete.
 */

import type { PageLoadCode } from '../../core/entry-store-read';
import { loadEntries } from '../../core/entry-store-read';
import type { StoragePort } from '../../core/storage-port';
import { documentRangeForFragment } from '../capture/fragment-rect';
import type { RangeForFragment } from '../capture/fragment-rect';
import { currentAuthorName } from '../create/create-note';
import { isPaintHighlightName } from './highlight-name';
import { buildPaintPlan } from './paint-plan';
import type { PaintedEntry, PaintPlan, SkippedEntry } from './paint-plan';
import { paintStyleOwnerOf } from './paint-style';
import type { PaintStyleOwner } from './paint-style';
import { documentPaintSurface } from './paint-surface';
import type { PaintSurface } from './paint-surface';

/** What one pass produced. */
export interface PagePaintOutcome {
  /** The page key the entries were read under, `null` for an unparsable URL. */
  readonly pageKey: string | null;
  /** The entries now painted on the page; empty when the page cannot paint. */
  readonly painted: readonly PaintedEntry[];
  /** The entries that are stored and listed but not painted, with the reason. */
  readonly skipped: readonly SkippedEntry[];
  /** The codes of the core read, so a caller can tell "empty page" from "no store". */
  readonly readCodes: readonly PageLoadCode[];
}

/** A live paint pass. */
export interface PagePainter {
  /** Runs one pass: read, resolve, tear down, paint. Never throws. */
  refresh(): Promise<PagePaintOutcome>;
  /** Removes every highlight and rule this extension owns (ruling `A39`). */
  clearPaint(): void;
  /** What the page paints right now: the hover targets of the tooltip, and the
   * repaint source for the editor of `t3-03`. */
  paintedEntries(): readonly PaintedEntry[];
  /**
   * The author name the last pass read, or `null` when the settings give no usable
   * one. The tooltip header is the only consumer: ownership is a name comparison, and
   * the comparison is core's `canEdit`, not a rule this layer invents.
   */
  authorNameOfPass(): string | null;
}

/** Seams of one pass; a page supplies none of them, a test supplies all of them. */
export interface PagePainterInput {
  /** The storage area the entries are read from. */
  port: StoragePort;
  /** The page URL the key is derived from: `window.location.href` in a page. */
  url: () => string;
  /** `null` means "this browser has no CSS Highlight API" (ruling `A38`). */
  surface?: PaintSurface | null;
  /** `null` means "this browser has no constructed stylesheets" (ruling `A41`). */
  style?: PaintStyleOwner | null;
  /** The measurement seam; the shipped value is the create card's own factory. */
  rangeFor?: RangeForFragment;
  /** The subtree streamed; the shipped value is `document.body`, as in the capture. */
  root?: () => Node | null;
}

/**
 * The read codes that mean **this pass did not get a trustworthy page state**.
 *
 * Deliberately narrow, because the answer is expensive: the pass throws away what it
 * has and paints nothing. Only a read that could not read the index of the page, the
 * layout it expects, or the URL itself belongs here. `entry_malformed` does not: core
 * skipped one bad record and returned the rest, and refusing to paint good records
 * because a neighbour is corrupt would be a worse lie than painting them. Likewise
 * `index_repaired` / `index_repair_failed` describe an orphan in the index, not the
 * slot this page is painted from.
 */
const UNTRUSTWORTHY_READ_CODES: readonly PageLoadCode[] = [
  'storage_unavailable',
  'layout_version',
  'index_malformed',
  'slot_malformed',
  'url_unparsable',
];

/** `true` when the core read reported a state the page must not be painted from. */
function isUntrustworthyRead(codes: readonly PageLoadCode[]): boolean {
  for (const code of codes) {
    if (UNTRUSTWORTHY_READ_CODES.includes(code)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates the paint pass of one page.
 *
 * The default seams read the document, so `main.ts` passes nothing but the port and
 * the URL. A test passes a recording surface, a style owner it can inspect, and a
 * box-only `rangeFor`.
 */
export function createPagePainter(doc: Document, input: PagePainterInput): PagePainter {
  const surface = input.surface ?? documentPaintSurface(doc);
  const style = input.style ?? paintStyleOwnerOf(doc);
  const rangeFor = input.rangeFor ?? documentRangeForFragment(doc);
  const streamRoot = input.root ?? ((): Node | null => doc.body);

  let painted: PaintedEntry[] = [];
  let authorName: string | null = null;

  async function refresh(): Promise<PagePaintOutcome> {
    const page = await loadEntries(input.port, input.url());
    authorName = await currentAuthorName(input.port);

    if (isUntrustworthyRead(page.codes)) {
      // The store did not answer for this pass, so nothing is painted from a page
      // state this pass did not read: the highlights of the previous pass are torn
      // down rather than left standing as older-than-the-pass evidence, and the codes
      // travel to the caller so it can tell "no entries" from "no store". Storage is
      // never written here; the entries are intact and the popup still lists them.
      clearPaint();
      return { pageKey: page.pageKey, painted: [], skipped: [], readCodes: page.codes };
    }

    if (surface === null) {
      // Ruling `A38`: no Highlight API, so nothing can be registered. The entries are
      // untouched in storage, stay in the popup and stay deletable; the page simply
      // shows no frame and, with it, no tooltip (AC3 hovers *painted* text).
      return { pageKey: page.pageKey, painted: [], skipped: [], readCodes: page.codes };
    }

    const root = streamRoot();
    const plan: PaintPlan =
      root === null
        ? { painted: [], skipped: [] }
        : buildPaintPlan({ entries: page.entries, root, rangeFor });

    registerPlan(surface, style, plan);
    painted = [...plan.painted];
    return { pageKey: page.pageKey, painted, skipped: plan.skipped, readCodes: page.codes };
  }

  function clearPaint(): void {
    if (surface !== null) {
      for (const held of surface.heldNames()) {
        if (isPaintHighlightName(held)) {
          surface.clear(held);
        }
      }
    }
    if (style !== null) {
      style.clear();
    }
    painted = [];
  }

  return {
    refresh,
    clearPaint,
    paintedEntries(): readonly PaintedEntry[] {
      return painted;
    },
    authorNameOfPass(): string | null {
      return authorName;
    },
  };
}

/**
 * Puts one plan on the page: the names that are no longer needed go first, then the
 * ranges of every entry that is still painted, then the rules.
 *
 * Deleting before writing is what makes a pass idempotent: the second pass over the
 * same page deletes nothing, writes each name once, and cannot leave a range behind
 * for an entry that went hidden, stale or unmeasurable between the two passes
 * (ruling `A39`).
 */
function registerPlan(
  surface: PaintSurface,
  style: PaintStyleOwner | null,
  plan: PaintPlan,
): void {
  const kept = new Set<string>();
  for (const entry of plan.painted) {
    kept.add(entry.name);
  }

  for (const held of surface.heldNames()) {
    if (isPaintHighlightName(held) && !kept.has(held)) {
      surface.clear(held);
    }
  }

  for (const entry of plan.painted) {
    surface.paint(entry.name, entry.fragments);
  }

  if (style !== null) {
    style.sync([...kept]);
  }
}
