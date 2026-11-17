/**
 * The popup's page-address seam (ruling `A49`).
 *
 * The popup has no `window.location` of its own: it is a separate document. So the
 * page it describes is the active tab, and `chrome.tabs.query` reports `tab.url`
 * only with the `tabs` permission that ruling `A49` added to `src/manifest.json`.
 * That is the whole cost of the ruling, and the whole benefit: the read answers for
 * every page, including the ones the content script is never registered for, so the
 * popup keeps listing entries on `file://`, `chrome://` and PDF-viewer pages
 * (`content-overlay-ui.md` -> Edge Cases, ruling `A81`).
 *
 * This file is the **only** shipped module that names `chrome.tabs` (pinned by a grep
 * in `tests/toolchain-contract.spec.ts`), and it converts two hostile shapes into
 * the one answer the service can handle:
 *
 * - a tab whose `url` the extension may not see (no permission, a devtools window) is
 *   `null`, not `undefined` and not an empty string;
 * - a rejected query — the extension was just reloaded or disabled while the popup
 *   was opening — is `null` as well. The popup then says it cannot show highlights
 *   and lists nothing, instead of leaving an unhandled rejection behind.
 */

/** URL of the active tab of the current window, `null` when there is none to read. */
export async function activeTabUrl(): Promise<string | null> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return null;
  }

  const url = tabs[0]?.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
