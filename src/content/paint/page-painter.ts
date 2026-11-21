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
 *    (ruling `A41`), every rule taking its declarations from the palette slot of its
 *    author (rulings `A94`, `A102`).
 *
 * Teardown runs before painting, and it removes **only** names carrying the
 * extension prefix: `CSS.highlights` is a document-global map, and a page script's
 * own highlight names are not this extension's to delete.
 *
 * Nothing in this module rejects (task `t3-05` AC2, ruling `A75`): every stage that
 * touches the page or the store is guarded where it is called, and a stage that throws
 * ends the pass with an empty paint, a `paint teardown` and the code of that stage. The
 * claim is pinned by `tests/content-paint-throw-safety.spec.ts`, not by this comment.
 */

import type { PageEntriesResult, PageLoadCode } from '../../core/entry-store-read';
import { loadEntries } from '../../core/entry-store-read';
import type { StoragePort } from '../../core/storage-port';
import type { Entry } from '../../core/entry';
import { documentRangeForFragment } from '../capture/fragment-rect';
import type { RangeForFragment } from '../capture/fragment-rect';
import { currentAuthorName } from '../create/create-note';
import { isPaintHighlightName } from './highlight-name';
import { buildPaintPlan } from './paint-plan';
import type {
  ExtraEntry,
  PaintedEntry,
  PaintPlan,
  PaintSkipReason,
  SkippedEntry,
} from './paint-plan';
import { paintStyleOwnerOf } from './paint-style';
import type { PaintStyleOwner, PaintStyleRule } from './paint-style';
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
  /**
   * Runs one pass: read, resolve, tear down, paint.
   *
   * **Cannot reject** (task `t3-05` AC2, `docs/state/t3-02-review.md` remark 4). The
   * property is not decoration: `src/content/main.ts` runs `void painter.refresh()` at
   * load and again in the `onCreated` handover, and neither call site has a rejection
   * handler, so a rejecting pass is an unhandled rejection on somebody else's page.
   * Every stage of a pass is therefore guarded at its call site here (ruling `A75`), and
   * each of the four answers — an unreadable address, a storage read that threw, a
   * resolve/measure/register stage that threw, a teardown that threw — is pinned by
   * `tests/content-paint-throw-safety.spec.ts`. A failing pass paints nothing, tears
   * down what it had already registered, writes nothing, and reports the code of the
   * stage that failed; the entries stay stored, listed and deletable (rulings `A40`,
   * `A66`).
   */
  refresh(): Promise<PagePaintOutcome>;
  /**
   * Hands the pass the notes it must paint **beside** the stored ones (Stage 17,
   * ruling `A163`).
   *
   * The notes arrive from the sync server and live in this document's memory only:
   * they are never written to `chrome.storage.local` and this module writes them
   * nowhere. The pass keeps a copy, so the next `refresh()` resolves and paints both
   * lists against **one** page stream, which is what keeps a foreign note from being
   * measured against a page state the stored notes did not see (ruling `A29`). `null`
   * and `[]` are the same answer: nothing extra to paint.
   *
   * Each note carries the display flag this tab holds for it, because a foreign note
   * has no stored `visible` field: a switched-off one is still painted, with the fill
   * of its slot dropped, so switching it back on is one more pass and no storage write.
   *
   * Nothing else changes: the same anchors, the same `paint name`s, the same palette
   * slot per `authorName`, the same per-entry failure answers. The paint path asks no
   * ownership question at all (`A94`), so a foreign note is painted by the existing
   * rules without one branch being added to them.
   */
  setExtraEntries(entries: readonly ExtraEntry[] | null): void;
  /**
   * Removes every highlight and rule this extension owns (ruling `A39`).
   *
   * Also non-throwing: a registry the page refuses to write is the same registry this
   * teardown walks, and `refresh()` calls it on its own failure paths.
   */
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
  /**
   * The `pageKey` the last pass read its entries under, `null` when that pass had no
   * address at all.
   *
   * Added by task `t4-03` for the two watches of `src/content/refresh/`: a storage
   * change and a same-document navigation have to know which page this document is
   * showing *now*, and the only honest answer is the key the last pass resolved. It is
   * the resolved key, not the key of the current URL: `loadEntries` may answer through
   * the `origin + pathname` fallback of the page index, so the notes of this document
   * live under the key the index chose (`inline-comment-model.md` -> "Page lookup"),
   * and a watch that derived the key from the URL alone would ignore the very slot
   * this page paints. This module states the key; it owns no rule about what to do
   * with it, and the content layer still names no storage key
   * (`tests/content-create-card-boundaries.spec.ts`).
   */
  pageKeyOfPass(): string | null;
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
  let passPageKey: string | null = null;
  /** The notes the sync layer put in this document's memory (ruling `A163`). */
  let extra: readonly ExtraEntry[] = [];

  async function refresh(): Promise<PagePaintOutcome> {
    // `t3-05` AC2, ruling `A75`: every stage of a pass touches something the page owns
    // — the address, the storage area, the DOM, `CSS.highlights`, the adopted sheet —
    // and each stage is guarded where it is called, because this promise has no caller
    // that can catch it. Each catch answers with an empty pass plus the code of the
    // stage that failed, and the code is always one core already has: no new refusal
    // code and no new wording comes out of this module.
    let url: string;
    try {
      url = input.url();
    } catch {
      // No address, so no page key, so no page to paint: core's own code for that
      // state is `url_unparsable`.
      clearPaint();
      passPageKey = null;
      return { pageKey: null, painted: [], skipped: [], readCodes: ['url_unparsable'] };
    }

    let page: PageEntriesResult;
    try {
      page = await loadEntries(input.port, url);
      authorName = await currentAuthorName(input.port);
    } catch {
      // A read stage that threw is the same answer as a read that could not read: the
      // pass has no trustworthy page state, so it paints nothing from it.
      clearPaint();
      passPageKey = null;
      return { pageKey: null, painted: [], skipped: [], readCodes: ['storage_unavailable'] };
    }

    passPageKey = page.pageKey;

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

    // The resolve-measure-register stage: the part of the pass that asks the page for
    // boxes and writes names into a document-global registry. A throw anywhere in it
    // ends the pass, and `plan` keeps whatever this pass had already learned so the
    // entries that were skipped for a known reason keep that reason.
    let plan: PaintPlan = emptyPlan();
    try {
      const root = streamRoot();
      plan =
        root === null
          ? emptyPlan()
          : buildPaintPlan({ entries: page.entries, extra, root, rangeFor });
      registerPlan(surface, style, plan);
    } catch {
      clearPaint();
      return {
        pageKey: page.pageKey,
        painted: [],
        skipped: skippedForFailedPass(page.entries, plan),
        readCodes: page.codes,
      };
    }

    painted = [...plan.painted];
    return { pageKey: page.pageKey, painted, skipped: plan.skipped, readCodes: page.codes };
  }

  function clearPaint(): void {
    try {
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
    } catch {
      // A teardown the page refuses is reported by the pass that called it, not here:
      // `refresh()` is in its own failure handler at this moment, and a throw escaping
      // the teardown would turn "paint nothing" back into an unhandled rejection.
    }
    painted = [];
  }

  return {
    refresh,
    clearPaint,
    setExtraEntries(entries: readonly ExtraEntry[] | null): void {
      // A copy, so a caller that keeps editing its own list cannot change what the
      // next pass paints behind the pass's back.
      extra = entries === null ? [] : [...entries];
    },
    paintedEntries(): readonly PaintedEntry[] {
      return painted;
    },
    authorNameOfPass(): string | null {
      return authorName;
    },
    pageKeyOfPass(): string | null {
      return passPageKey;
    },
  };
}

/** A pass that decided nothing about any entry of the page. */
function emptyPlan(): PaintPlan {
  return { painted: [], skipped: [] };
}

/**
 * What one failed pass reports about the entries of the page: every entry that is still
 * stored and still listed, and for each of them the reason this pass already knew — the
 * entry it found hidden stays `hidden`, the entry whose anchor is gone stays
 * `anchor_not_found` — with `measurement_failed` for every entry this pass could not
 * put on the page (ruling `A66`'s reason, reused rather than invented: the page refused
 * to give this entry a place, which is what it did).
 *
 * No new code appears here, and nothing about the entry changes: the records stay in
 * storage, stay in the popup list and stay deletable (rulings `A40`, `A66`).
 */
function skippedForFailedPass(
  entries: readonly Entry[],
  plan: PaintPlan,
): SkippedEntry[] {
  const known = new Map<string, PaintSkipReason>();
  for (const skipped of plan.skipped) {
    known.set(skipped.entryId, skipped.reason);
  }
  return entries.map((entry) => ({
    entryId: entry.id,
    reason: known.get(entry.id) ?? 'measurement_failed',
  }));
}

/**
 * Puts one plan on the page: the names that are no longer needed go first, then the
 * ranges of every entry that is still painted, then the rules.
 *
 * Deleting before writing is what makes a pass idempotent: the second pass over the
 * same page deletes nothing, writes each name once, and cannot leave a range behind
 * for an entry that went hidden, stale or unmeasurable between the two passes
 * (ruling `A39`).
 *
 * The sheet is handed `name` + `paint slot` pairs rather than bare names, because since
 * task `t5-02` a rule is no longer derivable from its name alone: its declarations come
 * from the author's palette slot (rulings `A94`, `A102`). One pair per painted entry, in
 * the plan's own order — the palette is never walked, so the number of rules stays a
 * function of the page and never of the palette.
 */
function registerPlan(
  surface: PaintSurface,
  style: PaintStyleOwner | null,
  plan: PaintPlan,
): void {
  const kept = new Set<string>();
  const styleRules: PaintStyleRule[] = [];
  for (const entry of plan.painted) {
    kept.add(entry.name);
    styleRules.push({ name: entry.name, slot: entry.paintSlot });
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
    style.sync(styleRules);
  }
}
