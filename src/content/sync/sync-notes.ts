/**
 * The sync server's notes on one page: when the page asks, what it keeps, and what it
 * tells the paint pass (Stage 17; rulings `A161`, `A163`, `A164`, `A165`, `A166`).
 *
 * Rule owner: `docs/specs/sync-integration.md` -> Rules / Semantics -> "Where the
 * notes live", "The automatic load", "A failed load never blocks the page".
 *
 * What this module owns, and nothing else:
 *
 * - **when to ask.** One request per page key per document (plus one per page key the
 *   reader navigated to inside the same document), never one per repaint. The paint
 *   pass repaints for a storage write, for a same-document navigation and for a URL
 *   tick that changes nothing; a request per repaint would hammer the server with
 *   identical `GET`s and re-replace the list the reader is looking at.
 * - **the switch first.** Ruling `A166` is decided before anything else: with the
 *   checkbox off or the address empty, `loadSettings` is read and the function returns
 *   — no request, no URL built, no error path. That is why the decision lives here and
 *   not inside the loader: the loader is asked only when there is something to ask.
 * - **the key the notes are filed under.** The page key of the last paint pass, never a
 *   key derived from the address in this file: `loadEntries` may answer through the
 *   `origin + pathname` fallback of `inline-comment-model.md`, so the key the stored
 *   notes live under is the only honest key to ask the server about.
 * - **the answer never throws.** `loadIntoMemory` and the transport answer codes
 *   (`A164`); this module adds no `catch`, because there is nothing left that rejects.
 *
 * Its two collaborators are handles, not deps: `painter` is the pass (it reads the key
 * and takes the extra entries) and `foreign` is the memory. Everything else arrives as
 * an option, so the whole wiring runs in a unit test without a page, a server or a
 * clock.
 */

import type { SettingsReadResult } from '../../core/settings-store';
import { loadSettings } from '../../core/settings-store';
import type { StoragePort } from '../../core/storage-port';
import type { SyncTransport } from '../../core/sync-client';
import { syncTargetOf } from '../../core/sync-settings';
import type { ExtraEntry } from '../paint/paint-plan';
import type { ForeignLoadOutcome, ForeignNotes } from './foreign-notes';
import { loadIntoMemory } from './foreign-notes';

/** What the page-side sync wiring talks to: the two page handles and two seams. */
export interface SyncNotesWiring {
  /** Where the foreign entries go and what the page key of the last pass is. */
  readonly painter: {
    setExtraEntries(entries: readonly ExtraEntry[] | null): void;
    pageKeyOfPass(): string | null;
    /** One more pass; it cannot reject (`page-painter.ts` -> `refresh`). */
    refresh(): Promise<unknown>;
  };
  /** The notes held in this document's memory (ruling `A163`). */
  readonly foreign: ForeignNotes;
  /** The settings and the author name are read through it; nothing is written. */
  readonly port: StoragePort;
  /** `fetch` in the page. An option, so a test can answer without a network. */
  readonly transport?: SyncTransport;
  /** The settings read; the shipped value is core `loadSettings` over the port. */
  readonly settings?: (port: StoragePort) => Promise<SettingsReadResult>;
  /**
   * Called after every automatic load this wiring runs, with its outcome (Stage 17,
   * task `t17-02`, ruling `A169`).
   *
   * It exists so the module that **owns** the request is also the module that publishes
   * its result: the popup cannot see a failure of a request it never made, and \`A169\`
   * forbids the popup from making its own. The hook is pure observation and this module
   * acts on the value in no way — a failed load still paints nothing, retries nothing
   * and states nothing on the article (`A164`).
   */
  readonly onLoad?: (outcome: ForeignLoadOutcome) => void;
}

/** The two entry points the page calls. */
export interface SyncNotes {
  /**
   * Runs after a paint pass: asks the server for the page's notes when there is a new
   * question to ask, then repaints once so the answer is on screen.
   *
   * Called once at boot with the first pass; every later call is the same question
   * about the same page and is answered from the memory without a request.
   */
  afterPaint(): Promise<void>;
  /** The page key the last request asked for, `null` before the first one. */
  askedKey(): string | null;
  /**
   * The target the automatic load would use, read from the settings in this module.
   *
   * Ruling `A166` makes "is synchronization usable?" one question with one reader, and
   * the reader is this module: the settings read lives here (`A31`), so the page's own
   * channel asks this module instead of importing `loadSettings` a third time — the
   * content layer reads the record in exactly two modules and that pin stays true.
   * `null` means "do not call", exactly as it does for the load.
   */
  loadTarget(): Promise<{ target: ReturnType<typeof syncTargetOf>; currentName: string }>;
  /**
   * The `A182` half of the same question, asked by the editor's delete button: where
   * **one note's** delete would go, and to which page key — `target: null` meaning "do
   * not call" (`A166`), exactly as it does for the load.
   *
   * It is a second reader of the same rule rather than a second rule: `syncTargetOf` over
   * the same settings record, plus the pass's own page key, so a delete can never be sent
   * to a key the stored notes do not live under.
   */
  deleteTarget(): Promise<{ target: ReturnType<typeof syncTargetOf>; currentName: string }>;
}

/**
 * Connects the paint pass to the sync server. Nothing is fetched until `afterPaint()`
 * is called, and nothing is fetched at all while synchronization is off.
 */
export function attachSyncNotes(wiring: SyncNotesWiring): SyncNotes {
  const readSettings = wiring.settings ?? loadSettings;
  let askedKey: string | null = null;

  async function afterPaint(): Promise<void> {
    const key = wiring.painter.pageKeyOfPass();
    if (key === null) {
      // No page, no key: a document the core key rules refuse (`url_unparsable`) has no
      // notes of its own, so there is nothing to ask about.
      return;
    }
    if (key === askedKey) {
      // The same page again. The list is already this page's, and the repaint that just
      // happened used it; asking again would replace what the reader is looking at with
      // the same rows.
      return;
    }

    const settings = await readSettings(wiring.port);
    const target = syncTargetOf(settings);
    if (target === null) {
      // `A166`: the switch is off or there is no address, so no request is made and the
      // feature behaves as absent. The key is not remembered, because turning the
      // switch on is a settings write that runs this function again.
      askedKey = null;
      drop();
      return;
    }

    askedKey = key;
    const outcome = await askServer(key, target, settings.name);
    if (!outcome.ok) {
      // `A164`: no retry, no modal, no line on the article. The stored notes are on
      // screen already; the popup is what states that the load failed, with the outcome
      // `onLoad` just published (`A169`).
      return;
    }
    paint();
  }

  /**
   * One request for one page key, published to whoever observes the outcome (`A169`).
   *
   * The hook is called **after** the answer and never instead of it: a hook that throws
   * would be a throw out of the page's own boot path, so it is guarded here — the load's
   * answer is the same either way, and no observer can turn a failed request into a
   * broken page.
   */
  async function askServer(
    pageKey: string,
    target: NonNullable<ReturnType<typeof syncTargetOf>>,
    name: string,
  ): Promise<ForeignLoadOutcome> {
    const outcome = await loadIntoMemory(wiring.foreign, {
      transport: wiring.transport ?? missingTransport,
      target,
      pageKey,
      // The foreign list holds only other readers' notes (`A161`): the reader's own
      // notes come from the store, and a second copy of them would register two paint
      // names over one span.
      currentName: name === '' ? null : name,
    });
    try {
      wiring.onLoad?.(outcome);
    } catch {
      // An observer is not the page's business (`A164`): the load answered, and the
      // paint below is what the reader sees.
    }
    return outcome;
  }

  /** Hands the current memory to the pass and repaints once. */
  function paint(): void {
    if (wiring.foreign.all().length === 0) {
      drop();
      return;
    }
    wiring.painter.setExtraEntries(wiring.foreign.paintInput());
    // The page's own repaint path — a storage write or a navigation — runs the same
    // pass; this call is the second half of "read, then paint" and cannot reject
    // (`A75`, `A164`).
    void wiring.painter.refresh();
  }

  /** Removes the foreign entries from the page: nothing left to paint. */
  function drop(): void {
    if (wiring.foreign.all().length !== 0) {
      wiring.foreign.replace([], null);
    }
    wiring.painter.setExtraEntries(null);
  }

  return {
    afterPaint,
    askedKey(): string | null {
      return askedKey;
    },
    async loadTarget() {
      const settings = await readSettings(wiring.port);
      return { target: syncTargetOf(settings), currentName: settings.name };
    },
    async deleteTarget() {
      const settings = await readSettings(wiring.port);
      return { target: syncTargetOf(settings), currentName: settings.name };
    },
  };
}

/**
 * The transport when the page did not hand one over: every call answers "the server
 * was not reached", which is the honest answer for a page that owns no network.
 */
const missingTransport: SyncTransport = async () => await Promise.reject(new Error('no transport'));