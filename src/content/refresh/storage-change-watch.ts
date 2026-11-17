/**
 * The storage-change watch of one page: another tab wrote, this page repaints
 * (task `t4-03` AC2 and AC3, ruling `A60`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Cross-tab repaint" and "Settings name picked up without a reload";
 * `docs/specs/inline-comment-model.md` -> Edge Cases -> "Two browser tabs on the
 * same page: a storage `onChanged` listener refreshes both; last write of the full
 * list wins."
 *
 * **A repaint, not a merge (`A60`).** This module does one thing: it decides whether
 * a change record concerns this page, and if it does it asks the paint pass to run
 * again. There is no queue, no merged batch, no lock and no replay of the change
 * payload — the paint pass re-reads the page through core, and the store is the only
 * truth. The cross-tab read-modify-write race stays the v1 limitation it has been
 * since `t1-06`; this module narrows how often a page repaints, it does not make two
 * simultaneous writers safe, and the spec says so.
 *
 * **Which keys count.** The page's own entry slot and the settings record, decided by
 * core `storageChangeConcernsPage` and not by a local rule: the content layer never
 * names a storage key (`tests/content-create-card-boundaries.spec.ts`), and the page
 * index is not a signal, because a write to another page's slot updates the index too
 * and every open tab would repaint for every note stored anywhere.
 *
 * **Why the settings key counts** (AC3, rulings `A31`, `A25`): the author name decides
 * the `ownership header` of a tooltip and, with it, whether an entry the reader is
 * pointing at is theirs. That answer is the last paint pass's read, so a name change
 * that never caused a pass would leave the page describing the old author. The create
 * card needs nothing here — it performs one fresh core read per capture attempt — and
 * this module does not touch any widget.
 *
 * No `catch` anywhere: the subscription makes no call that can reject, the callback
 * reads keys out of its own argument, and the repaint it triggers is the non-rejecting
 * `PagePainter.refresh()` of ruling `A75` (`docs/specs/content-overlay-ui.md` ->
 * "Page-boundary throws"), so this module adds no page-boundary throw path.
 */

import { storageChangeConcernsPage } from '../../core/storage-keys';

/** Removes the subscription of one page. */
export type StorageWatchTeardown = () => void;

/**
 * The subscription this watch is attached to. It is a function rather than an import
 * of the storage adapter, so a test can fire change records by hand and the shipped
 * wiring stays the only place that names `chrome.storage.onChanged`
 * (`tests/toolchain-contract.spec.ts`).
 */
export type StorageChangeSubscriber = (
  onChange: (changedKeys: readonly string[]) => void,
) => StorageWatchTeardown;

/** What the watch needs from the page it is attached to. */
export interface StorageWatchOptions {
  /**
   * The page key the last paint pass resolved, `null` while no pass has produced an
   * address. Read per change record, because an SPA navigation moves the page key and
   * with it the slot that matters.
   */
  pageKey: () => string | null;
  /** Runs one repaint of this page. Nothing else happens on a relevant change. */
  onRepaint: (changedKeys: readonly string[]) => void;
}

/**
 * Subscribes one page to its storage area and returns the teardown.
 *
 * One relevant change record is one repaint, and one irrelevant record is no work at
 * all: no core read, no paint call, no `await` (task `t4-03` AC2).
 */
export function attachStorageChangeWatch(
  subscribe: StorageChangeSubscriber,
  options: StorageWatchOptions,
): StorageWatchTeardown {
  const onChange = (changedKeys: readonly string[]): void => {
    const pageKey = options.pageKey();
    const relevant = changedKeys.filter((key: string): boolean =>
      storageChangeConcernsPage(key, pageKey),
    );
    if (relevant.length === 0) {
      return;
    }
    options.onRepaint(relevant);
  };

  return subscribe(onChange);
}
