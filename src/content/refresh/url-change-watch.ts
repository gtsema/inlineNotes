/**
 * The same-document URL watch of one page: the site navigated, this page re-resolves
 * (task `t4-03` AC1; `docs/specs/inline-comment-model.md` -> Flow / Sequence 6 and
 * Edge Cases -> "Reload, back/forward (bfcache), and SPA URL change must all
 * re-resolve entries; a stale rendered highlight must be removed on URL change").
 *
 * Rule owner: `docs/specs/content-overlay-ui.md` -> Terms / Aliases ->
 * `url poll interval`, -> Flow / Sequence 8, -> Rules / Semantics ->
 * "Same-document navigation".
 *
 * **Why a timer exists at all** (ruling `A59`). A content script runs in the isolated
 * world: the `history` object it could patch belongs to that world, so a page calling
 * `history.pushState` is invisible to it. The four triggers shipped here are the ones
 * a content script really receives — `popstate` for back/forward inside the document,
 * `hashchange` for a fragment move, `visibilitychange` for the moment the reader comes
 * back to a tab whose timers Chrome throttled while it was hidden, and one polling
 * interval for the same-document `pushState` navigation that fires no event at all
 * (Gmail-style). Reverting the polling half is one constant, and the interval is a
 * named one so the spec can state it.
 *
 * **What a tick costs** (the `A59` cost condition, restated in the spec): one address
 * read and one string compare. No DOM read, no layout, no `Range`, no storage read, no
 * allocation. The repaint is asked for only when the compare says the address moved,
 * and every trigger funnels through that same compare, so a `popstate` that changed
 * nothing — back/forward to the same address — is not work either.
 *
 * **What a change does.** Exactly one thing: it asks the paint pass to run again. The
 * pass is the only owner of `CSS.highlights` and of the resolve, it rebuilds the
 * `page text stream` from the current document and re-resolves every anchor of the new
 * page key against it (ruling `A29`), and its teardown removes the `paint name`s of
 * the page that is no longer shown (ruling `A39`). This module therefore cannot leave a
 * highlight of the previous page key standing, cannot re-paint a position remembered
 * from the old document, and never touches an entry record: an entry whose text the
 * site deleted is unpainted by the pass and stays stored, listed and deletable
 * (rulings `A24`, `A36`).
 *
 * No `catch`: the only foreign call here is the address read, and `location.href`
 * answers a string. The repaint it triggers is the non-rejecting `PagePainter.refresh()`
 * of ruling `A75`, so this module adds no page-boundary throw path.
 */

/**
 * How often the address is compared when no event fires, in ms.
 *
 * The value and the name are durable in the spec —
 * `docs/specs/content-overlay-ui.md` -> Terms / Aliases -> `url poll interval` — and
 * `tests/content-spa-refresh.spec.ts` asserts the constant against the number that row
 * writes, the way the `settle delay` of ruling `A63` is asserted.
 */
export const URL_POLL_MS = 1000;

/** Removes every listener and stops the interval. */
export type UrlWatchTeardown = () => void;

/** What the watch needs from the page it is attached to. */
export interface UrlChangeWatchOptions {
  /** The page address, read per trigger: the same seam the paint pass reads. */
  url: () => string;
  /** Called once per observed change, with the address the page had before. */
  onUrlChange: (previousUrl: string, currentUrl: string) => void;
  /** Test seam for the interval; the shipped value is `URL_POLL_MS`. */
  pollMs?: number;
}

/**
 * Attaches the same-document navigation triggers of one page and returns the teardown.
 *
 * The address is captured at attach time, so a navigation that happened before this
 * wiring existed is not reported again.
 */
export function attachUrlChangeWatch(
  win: Window,
  doc: Document,
  options: UrlChangeWatchOptions,
): UrlWatchTeardown {
  const pollMs = options.pollMs ?? URL_POLL_MS;
  let seen = options.url();

  const check = (): void => {
    const current = options.url();
    if (current === seen) {
      return;
    }
    const previous = seen;
    seen = current;
    options.onUrlChange(previous, current);
  };

  const onVisibilityChange = (): void => {
    // Chrome throttles a hidden document's timers, so a navigation the reader caused
    // in another tab, or one the page made while this tab was hidden, is caught here
    // rather than up to a polling interval later. A document that is going hidden
    // answers nothing: there is no reader to show a correct page to.
    if (doc.visibilityState === 'visible') {
      check();
    }
  };

  win.addEventListener('popstate', check);
  win.addEventListener('hashchange', check);
  doc.addEventListener('visibilitychange', onVisibilityChange);

  const timer = pollMs > 0 ? win.setInterval(check, pollMs) : null;

  return (): void => {
    win.removeEventListener('popstate', check);
    win.removeEventListener('hashchange', check);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    if (timer !== null) {
      win.clearInterval(timer);
    }
  };
}
