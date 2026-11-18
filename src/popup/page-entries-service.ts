/**
 * The popup half of the entry model: which page the popup is describing, which
 * entries that page holds, and what a checkbox or `Удалить` writes.
 *
 * Task `t4-01-popup-list`. This module is the **only** shipped place where the
 * popup composes core calls; `popup.component.ts` holds signals and nothing else,
 * so every acceptance criterion of the card is observable here against the
 * in-memory port. Rule ownership is unchanged: the page key, the caps, the
 * authorship answer, the visibility write and the delete all live in `src/core/`,
 * and the popup imports them instead of restating them.
 *
 * Four rules this module owns the *wiring* of:
 *
 * - `A49` **the page address comes from the active tab.** `pageUrl()` is the tab
 *   read of `src/popup/active-tab.ts`, so the popup works on pages the content
 *   script is not registered for — the whole reason the `tabs` permission was
 *   chosen over the service-worker mapping. Ruling `A98` deleted the **display**
 *   of that address — the host line under the title, with the `hostOf` derivation
 *   that fed it — and kept this read, because the `pageKey` the list is loaded
 *   under is computed from it. The address is an input to the core key rules here,
 *   never a rendered value.
 * - `A1`, `A12` **a checkbox never reorders the list.** The write goes through core
 *   `setVisible`, which touches `visible` only, and the view is rebuilt with core
 *   `sortByCreatedAtAsc`; a row that was second is second afterwards.
 * - `A25` **delete is not an edit.** Core applies no author gate to `deleteEntry`,
 *   and the popup offers the control for every row of the page, own or foreign.
 *   The popup has no comment write of its own: `updateEntryComment` is not imported
 *   here, which is what "a foreign row offers no edit path" means on this surface.
 * - `A50` **the checkbox writes storage and messages nobody.** No `chrome.runtime`
 *   or `chrome.tabs` message leaves this layer; the page repaints from
 *   `storage.onChanged`, which is task `t4-03`.
 *
 * What a refused write does is deliberately not invented here: the view is always
 * rebuilt from what the store answers after the write, so the list shows the truth
 * and no new Russian wording appears for a state `AC4` does not list.
 *
 * No `chrome.*`, no DOM and no Russian string lives in this file: storage is the
 * injected `StoragePort`, the address is an injected read, and the wording of every
 * state is in `src/popup/text.ts`.
 */

import { canEdit, sortByCreatedAtAsc, validateAuthorName } from '../core/entry-rules';
import { loadEntries } from '../core/entry-store-read';
import { deleteEntry, setVisible } from '../core/entry-store-write';
import { pageKeyFromUrl } from '../core/page-key';
import { loadSettings } from '../core/settings-store';
import type { StoragePort } from '../core/storage-port';

/**
 * Schemes the content script is registered for (`src/manifest.json` ->
 * `content_scripts[0].matches`, `content-overlay-ui.md` -> "Registered schemes").
 * Outside them there is no content script, so nothing can paint; the popup still
 * lists the page (ruling `A49`) and states the state (ruling `A81`). The pair is
 * pinned against the manifest by `tests/popup-entry-list.spec.ts`, so a new
 * registered scheme cannot leave the popup answering from a stale list.
 */
export const INJECTABLE_SCHEMES: readonly string[] = ['http:', 'https:'];

/**
 * A state the popup states in words instead of rows (rulings `A81`, `A83`). The set
 * is exactly the two the overlay spec fixes wording for; a third one needs a
 * ruling, not a string written here.
 */
export type PopupNoticeCode = 'name_required' | 'page_not_injectable';

/** One popup row: author, checkbox, delete. No comment text, no date (popup contract). */
export interface EntryRowView {
  /** Stable row identity, and the id every write is addressed by. */
  id: string;
  /**
   * Stored author name, verbatim. The header the reader sees is decided by
   * `ownershipHeaderText` in `src/popup/text.ts` (ruling `A82`), because a UI
   * string never lives in this module.
   */
  authorName: string;
  /** Core `canEdit` over the name the current settings read returned. */
  isOwn: boolean;
  /** Checkbox state: the stored `visible` flag, `true` when absent (ruling `A1`). */
  visible: boolean;
}

/**
 * Everything the popup renders for one page open.
 *
 * There is **no address in this view** (ruling `A98`, task `t5-05`): the host line
 * the reader saw under the title printed punycode for an internationalized page and
 * answered no question. The view is the list and the notices, and the page address
 * stays inside `viewOf` as the input to the core key rules.
 */
export interface PageEntriesView {
  /** Rows in creation order (`sortByCreatedAtAsc`), `[]` for an empty page. */
  rows: readonly EntryRowView[];
  /** Notice lines above the list, in this fixed order (ruling `A83`). */
  notices: readonly PopupNoticeCode[];
}

/** What the service needs from its caller: the seam, the address, the options page. */
export interface PageEntriesSource {
  /** The one port adapter (`createChromeLocalStoragePort()`), never a storage API. */
  port: StoragePort;
  /** URL of the tab the popup describes (`A49`), `null` when there is none. */
  pageUrl(): Promise<string | null>;
  /** Opens the options page (ruling `A83`); the name-required line is the control. */
  openOptions(): void;
}

/**
 * Row classes of the ownership marker (ruling `A82`): a foreign row is marked by
 * the header **and** by a class, so the state is visible in the popup and assertable
 * without inventing a second Russian sentence for it.
 */
export const OWN_ROW_CLASS = 'row row--own';
export const FOREIGN_ROW_CLASS = 'row row--foreign';

/** The class pair of one row; the ownership marker is never text-only. */
export function rowClass(row: EntryRowView): string {
  return row.isOwn ? OWN_ROW_CLASS : FOREIGN_ROW_CLASS;
}

/**
 * `true` when the content script can run at this address: an `http(s)` URL that
 * core can turn into a page key. `file://`, `chrome://`, the Web Store, the PDF
 * viewer and an address core refuses are all one answer, because the reader's
 * action is the same in every one of them (ruling `A81`: one string, one state).
 */
export function isInjectableUrl(url: string | null): boolean {
  if (url === null) {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (!INJECTABLE_SCHEMES.includes(parsed.protocol)) {
    return false;
  }
  return pageKeyFromUrl(trimmed) !== null;
}

/**
 * The popup view of one page: read the name, read the page, sort by creation, and
 * decide which non-list states apply.
 */
export class PageEntriesService {
  private readonly source: PageEntriesSource;

  /** Port the writes go through; kept private so the component cannot reach it. */
  private readonly port: StoragePort;

  constructor(source: PageEntriesSource) {
    this.source = source;
    this.port = source.port;
  }

  /** Opening the popup: one address read, one settings read, one page read. */
  async open(): Promise<PageEntriesView> {
    return await this.viewOf(await this.addressOf());
  }

  /**
   * The checkbox (rulings `A1`, `A50`): core `setVisible` and nothing else. No
   * message is sent to the page, and the row stays in the list with its position,
   * because neither the write nor the re-read touches `createdAt`.
   */
  async setVisibility(id: string, visible: boolean): Promise<PageEntriesView> {
    const url = await this.addressOf();
    if (url !== null) {
      await setVisible(this.port, { url, id, visible });
    }
    return await this.viewOf(url);
  }

  /**
   * `Удалить` (ruling `A25`): core `deleteEntry`, which asks no author question, so
   * a foreign or stale entry is never undeletable. Deleting the last row of a page
   * removes the slot, which is what makes the empty-state line appear.
   */
  async remove(id: string): Promise<PageEntriesView> {
    const url = await this.addressOf();
    if (url !== null) {
      await deleteEntry(this.port, { url, id });
    }
    return await this.viewOf(url);
  }

  /**
   * Ruling `A83`: the «Укажите имя в настройках» line is the control that opens the
   * options page. It is a navigation, not a write: nothing here touches storage.
   */
  openSettings(): void {
    this.source.openOptions();
  }

  /** One address read per action, so a write and the view that follows it agree. */
  private async addressOf(): Promise<string | null> {
    return await this.source.pageUrl();
  }

  /** Builds the whole view from core reads, in the order the rules are asked. */
  private async viewOf(url: string | null): Promise<PageEntriesView> {
    const settings = await loadSettings(this.port);
    const author = validateAuthorName(settings.name);
    const currentName = author.normalized;

    const page = await loadEntries(this.port, url ?? '');

    const rows: EntryRowView[] = sortByCreatedAtAsc(page.entries).map((entry) => ({
      id: entry.id,
      authorName: entry.authorName,
      isOwn: canEdit(entry, currentName),
      visible: entry.visible,
    }));

    const notices: PopupNoticeCode[] = [];
    if (!author.ok) {
      notices.push('name_required');
    }
    if (!isInjectableUrl(url)) {
      notices.push('page_not_injectable');
    }

    return { rows, notices };
  }
}
