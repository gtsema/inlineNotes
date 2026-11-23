/**
 * The DOM change watch: repaint when the page's content arrives late (ruling `A195`).
 *
 * Rule owner: `docs/specs/content-overlay-ui.md`
 * (Rules / Semantics -> "Late content: the DOM change watch").
 *
 * The defect the reader measured on YouTrack: the article is an SPA whose content
 * renders **after** `document_idle`, so the boot paint pass built its
 * `page text stream` from an empty article, resolved no anchors and painted
 * nothing — and nothing re-ran it, because the `A59` url watch answers only an
 * address change and the storage watch only a write. A checkbox press repainted
 * (a storage write), which is why the reader saw the highlight return when they
 * toggled, and vanish again on the next reload.
 *
 * The rule: one `MutationObserver` over the document (child list, character data,
 * subtree), debounced by `DOM_CHANGE_SETTLE_MS`, asking the **same** repaint the
 * other watches ask — `onDomChange` is the caller's `refreshThenSync`, never a
 * second paint path. The guard that keeps this from being a loop: the paint pass
 * writes nothing into the page DOM (the highlights are the CSS registry plus one
 * adopted stylesheet, `A41`), so the watch observes a page that changes under the
 * notes, never the extension's own doing.
 *
 * Performance shape, stated in the spec: one debounce tick is one debounced pass
 * per burst of mutations, and a burst that produces no new content costs one
 * stream build and one resolve walk — the same cost the `A59` url tick already
 * accepts. The observers are never torn down in a content script (`A59`); the
 * teardown the function returns exists for tests only.
 *
 * Purity: the only collaborator is the `MutationObserver` the document hosts.
 */

/** The debounce of the DOM change watch (`A195`), the constant the spec names. */
export const DOM_CHANGE_SETTLE_MS = 400;

/** What the watch needs: the reaction, and nothing else. */
export interface DomChangeWatchOptions {
  /** The same repaint the url and storage watches call (never a second paint path). */
  readonly onDomChange: () => void;
}

/**
 * Attaches the watch. Never torn down in a content script; the return value is
 * the test's teardown.
 */
export function attachDomChangeWatch(
  target: Document,
  options: DomChangeWatchOptions,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (timer !== null) {
      // A burst of mutations is one pass, not one pass per mutation record.
      return;
    }
    timer = setTimeout((): void => {
      timer = null;
      options.onDomChange();
    }, DOM_CHANGE_SETTLE_MS);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(target.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
  };
}
