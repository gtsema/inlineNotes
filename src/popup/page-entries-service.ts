/**
 * The popup half of the entry model: which page the popup is describing, which
 * authors that page holds, and what a checkbox or `Удалить` writes.
 *
 * `t4-01-popup-list` set the shape: this module is the **only** shipped place where
 * the popup composes core calls, `popup.component.ts` holds signals and nothing else,
 * and every rule — the page key, the caps, the authorship answer, the writes — stays
 * in `src/core/` and is imported rather than restated. Task `t5-06` (rulings `A95`,
 * `A108`) changed what a row **is**: one row per author of the page instead of one row
 * per entry, one checkbox and one `Удалить` per row, both acting on every entry of that
 * author through exactly one core call. Nothing about storage changed: the grouping is
 * a projection built here, over the records core read back, and `visible` is still a
 * per-entry field.
 *
 * Five rules this module owns the *wiring* of:
 *
 * - `A49` **the page address comes from the active tab.** `pageUrl()` is the tab
 *   read of `src/popup/active-tab.ts`, so the popup works on pages the content
 *   script is not registered for — the whole reason the `tabs` permission was
 *   chosen over the service-worker mapping. Ruling `A98` deleted the **display**
 *   of that address — the host line under the title, with the `hostOf` derivation
 *   that fed it — and kept this read, because the `pageKey` the list is loaded
 *   under is computed from it. The address is an input to the core key rules here,
 *   never a rendered value.
 * - `A95`, `A108` **one row is one author, and one control is one core call.**
 *   `groupsOf` is the whole grouping: it walks the core order once, so a group's
 *   position is fixed by its earliest entry, and it compares names with core
 *   `isSameAuthor` (`A99`) — the popup has no author-normalization rule of its own.
 *   `setVisibleForAuthor` / `deleteEntriesOfAuthor` are called once per press, which
 *   is what keeps the write to one `pages:v1` update; the per-entry core writes are
 *   not imported here at all, and `tests/toolchain-contract.spec.ts` pins that.
 * - `A1`, `A12` **a checkbox never reorders the list.** The write touches `visible`
 *   only and never a stamp, and the view is rebuilt with core `sortByCreatedAtAsc`;
 *   a row that was first is first afterwards, with the same count.
 * - `A25` **delete is not an edit.** Core applies no author gate to the delete, and
 *   the popup offers the control for every row of the page, own or foreign. The
 *   popup has no comment write of its own: `updateEntryComment` is not imported
 *   here, which is what "a row offers no edit path" means on this surface.
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

import type { Entry } from '../core/entry';
import { canEdit, isSameAuthor, sortByCreatedAtAsc, validateAuthorName } from '../core/entry-rules';
import { loadEntries } from '../core/entry-store-read';
import { deleteEntriesOfAuthor, setVisibleForAuthor } from '../core/entry-store-write';
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

/**
 * One popup row: one author of this page (`author row`, rulings `A95`, `A108`).
 *
 * The row carries **no entry id**, on purpose: the popup has no per-entry control
 * anymore, so there is nothing here a single-note write could be addressed with, and
 * `tests/popup-entry-list.spec.ts` pins the field set. `authorName` is data, taken
 * verbatim from the earliest entry of the group, and it is the address of exactly one
 * core call — core chooses the records with `isSameAuthor` (`A99`), so a record stored
 * as `"Я "` is reached by the row of a reader named `"Я"`.
 */
export interface AuthorRowView {
  /** Stored `authorName` of the group, verbatim from its earliest entry. */
  authorName: string;
  /**
   * How many entries of this page belong to this author, `stale entry` records
   * included (ruling `A86` unchanged): the popup resolves no anchor, so it cannot
   * know which of them the page will refuse to paint.
   */
  count: number;
  /** Core `canEdit` over the group's earliest entry and the current settings name. */
  isOwn: boolean;
  /**
   * The aggregate checkbox state: `true` only when **every** entry of the group is
   * visible, so a page left half-hidden by an older build reads as unchecked and the
   * next press makes the whole group visible (ruling `A108`).
   */
  allVisible: boolean;
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
  /** One `AuthorRowView` per author, in the order of each author's earliest entry. */
  rows: readonly AuthorRowView[];
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
export function rowClass(row: AuthorRowView): string {
  return row.isOwn ? OWN_ROW_CLASS : FOREIGN_ROW_CLASS;
}

/**
 * The `author group` projection (rulings `A95`, `A108`, `A99`): one group per author,
 * in the order the **earliest** entry of that author appears in `ordered`, which is
 * expected to be the output of core `sortByCreatedAtAsc`. Walking that order once is
 * what fixes a group's position, and it is also why a visibility write cannot move a
 * row: no stamp changes, so the first entry of an author stays first.
 *
 * Two names belong to one group exactly when core `isSameAuthor` says so, which is the
 * same answer the edit gate and the `own entry` label give (`A99`); the popup owns no
 * name-normalization rule of its own, and a record the core read guard skipped is not
 * here at all, because this function sees only what `loadEntries` decoded.
 */
export function groupsOf(ordered: readonly Entry[], currentName: string): AuthorRowView[] {
  const rows: AuthorRowView[] = [];

  for (const entry of ordered) {
    const group = rows.find((row: AuthorRowView) => isSameAuthor(row.authorName, entry.authorName));
    if (group === undefined) {
      rows.push({
        authorName: entry.authorName,
        count: 1,
        isOwn: canEdit(entry, currentName),
        allVisible: entry.visible,
      });
      continue;
    }
    group.count += 1;
    // The aggregate is "every entry of this author", so one hidden note is enough to
    // uncheck the row; the ownership answer was taken from the earliest entry and does
    // not move, because `isSameAuthor` gives the same answer for the whole group.
    group.allVisible = group.allVisible && entry.visible;
  }

  return rows;
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
   * The aggregate checkbox (rulings `A1`, `A50`, `A108`): **one** core
   * `setVisibleForAuthor` for that author on that page, never one `setVisible` per
   * entry — N calls would mean N `pages:v1` rewrites and a page left half-applied.
   * No message is sent to the page, and the row keeps its position and its count,
   * because neither the write nor the re-read touches `createdAt`.
   */
  async setVisibilityForAuthor(authorName: string, visible: boolean): Promise<PageEntriesView> {
    const url = await this.addressOf();
    if (url !== null) {
      await setVisibleForAuthor(this.port, { url, authorName, visible });
    }
    return await this.viewOf(url);
  }

  /**
   * `Удалить` of a row (rulings `A25`, `A108`): **one** core `deleteEntriesOfAuthor`,
   * which removes every entry of that author on this page and asks no author question,
   * so a foreign or stale group is never undeletable. Taking the last row of a page
   * drops the slot, which is what makes the empty-state line appear.
   */
  async removeAllOfAuthor(authorName: string): Promise<PageEntriesView> {
    const url = await this.addressOf();
    if (url !== null) {
      await deleteEntriesOfAuthor(this.port, { url, authorName });
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

    // One pass over the core order, and the popup has its rows: the grouping is a
    // projection over the stored records, not a stored thing (`A108`).
    const rows: AuthorRowView[] = groupsOf(sortByCreatedAtAsc(page.entries), currentName);

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
