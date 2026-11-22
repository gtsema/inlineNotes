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
 *   or `chrome.tabs` message is sent by a stored write; the page repaints from
 *   `storage.onChanged`, which is task `t4-03`.
 * - `A167`/`A168` **a foreign row is asked for, never read.** Since task `t17-02` the popup
 *   also renders the notes the **page** holds and the reader's own storage knows nothing
 *   about: those rows arrive from the content script's memory through the injected
 *   `PageNotesChannel` (`src/popup/page-notes-channel.ts`), carry no entry id, and are
 *   switched or removed **on the page** — one message each, no storage write and no
 *   second `fetch`. The two halves of the row list are merged here by one projection and
 *   never by a second list: a name the page holds is a foreign row even if a stale record
 *   of the same author sits in the store, because a note this reader wrote is in the store
 *   only (`A163`).
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
import type { ForeignAuthorView, PageNotesQueryResult } from '../core/page-notes-query';
import { EMPTY_PAGE_NOTES_QUERY_RESULT } from '../core/page-notes-query';
import { loadEntries } from '../core/entry-store-read';
import { deleteEntriesOfAuthor, setVisibleForAuthor } from '../core/entry-store-write';
import { pageKeyFromUrl } from '../core/page-key';
import { loadSettings } from '../core/settings-store';
import type { StoragePort } from '../core/storage-port';
import { syncTargetOf } from '../core/sync-settings';
import type { PageNotesChannelSource } from './page-notes-channel';
import {
  askPage,
  dismissPageAuthor,
  listenForPageNotesUpdates,
  switchPageAuthor,
} from './page-notes-channel';

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
 * A state the popup states in words instead of rows (rulings `A81`, `A83`, and Stage 17
 * `A164` for the third).
 *
 * `sync_failed` is the ruling `A164`/`A169` line: the automatic load of the page did not
 * reach the server. Since `t17-02` it is decided by the **page's** answer and not by a
 * request of this layer: the content script owns the load and publishes its outcome
 * (`A169`), and this layer only renders it. It is **non-blocking** — the rows stay
 * exactly as they are — and it never replaces a row or hides the list, which is what
 * `A83` already requires of every notice on this surface.
 */
export type PopupNoticeCode = 'name_required' | 'page_not_injectable' | 'sync_failed';

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
  /**
   * Stored `authorName` of the group, verbatim from its earliest entry.
   *
   * Since Stage 17 (`t17-01`, ruling `A161`) this is also the address of the sync
   * button's one call: the button exists only on the row whose `isOwn` is `true`, and
   * the payload is that author's notes — never the page's.
   */
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
  /**
   * Whether this row is the **page's**: a note the server returned and this document
   * holds in memory only (`A163`, task `t17-02`).
   *
   * It is the one bit that routes the two row controls: a foreign row's checkbox and
   * `Удалить` message the page (`A168`), a stored row's write `chrome.storage.local`
   * through the one core call per press (`A108`). `isOwn` and `isForeign` are **not**
   * complements: a stored row of another author is `isOwn: false` and `isForeign:
   * false`, which is exactly the defect the ruling names — a stored foreign record may
   * be deleted locally, a page row may not.
   */
  isForeign: boolean;
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
  /**
   * Whether this page's rows may carry a sync button at all (Stage 17, `A166`).
   *
   * It is `true` only when the record says synchronization is on **and** the address is
   * usable, and the *row* half of the same rule (`A161`, only the current author's row)
   * is `AuthorRowView.isOwn`. Two answers, one rule, and no other place in the popup
   * decides either of them: with `false` the feature is absent rather than broken.
   */
  syncEnabled: boolean;
  /**
   * Whether the page's automatic load failed (rulings `A164`, `A169`, task `t17-02`).
   *
   * It is the page's own answer, read through `PageNotesChannel` and merged into the
   * notices as `sync_failed`, which is why the notice line renders **above** a list that
   * still renders (`A83`) and never replaces a row.
   *
   * `false` is the answer of every state the notice has nothing to say about: a page
   * whose load succeeded, a page that never asked (`A166`: the switch is off, the address
   * is empty, or the content script does not run there), and a page that could not be
   * asked at all. Only a `true` answer from the page produces the sentence.
   */
  syncFailed: boolean;
}

/**
 * What the service needs from its caller: the port, the address, the options page and
 * the page question (rulings `A49`, `A83`, `A167`).
 */
export interface PageEntriesSource {
  /** The one port adapter (`createChromeLocalStoragePort()`), never a storage API. */
  port: StoragePort;
  /** URL of the tab the popup describes (`A49`), `null` when there is none. */
  pageUrl(): Promise<string | null>;
  /** Opens the options page (ruling `A83`); the name-required line is the control. */
  openOptions(): void;
  /**
   * The page's answer to `A167`'s question, and the address of `A168`'s two operations.
   *
   * It is the content script's memory seen from the popup: the rows it holds and the
   * outcome of its automatic load, plus the two messages that switch or drop an author's
   * highlights for this tab. **No storage of this layer is touched by any of them** —
   * which is the whole reason the channel exists (`A163`).
   */
  page: PageNotesChannelSource;}

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
        // A record that reached the store is never a page row: the memory holds the
        // server's notes and the store holds the reader's, and the two lists are joined
        // by name and by nothing else (`A163`, `A167`).
        isForeign: false,
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
 * The page's half of the row list (rulings `A167`, `A168`): one row per foreign author
 * the content script answered with, and none of them own.
 *
 * `isOwn` is `false` at every row by construction — the page's memory holds no note of
 * the reader (`replace` drops them, `A163`) — and `isForeign` is `true` at every row,
 * which is what routes both controls of the row to the page instead of to storage.
 */
export function foreignGroupsOf(rows: readonly ForeignAuthorView[]): AuthorRowView[] {
  return rows.map((row) => ({
    authorName: row.authorName,
    count: row.count,
    isOwn: false,
    allVisible: row.allVisible,
    isForeign: true,
  }));
}

/**
 * `true` when this name is one the page holds a foreign note from, and therefore one
 * whose row controls belong to the page (`A168`).
 *
 * The comparison is core `isSameAuthor` (`A99`), the same answer the grouping, the edit
 * gate and the sync payload use: the page recoloured nothing and renamed nothing when it
 * answered, so the name it sent is the name the row addresses — through the same rule
 * the two spellings of one author are already compared with.
 */
export function isForeignAuthor(
  rows: readonly AuthorRowView[],
  authorName: string,
): boolean {
  return rows.some(
    (row) => row.isForeign && isSameAuthor(row.authorName, authorName),
  );
}

/**
 * The two lists as one: the stored groups first, then the page's own.
 *
 * A name that appears in both is **one row**, and it is the stored one: a record in
 * `chrome.storage.local` is a note this reader wrote (`A163` drops the reader's own
 * notes from the page's memory before it is answered with them), so the page's row for
 * that same name would be an echo of it, and rendering both would show the reader two
 * rows whose controls write to two different places.
 */
export function mergeAuthorRows(
  stored: readonly AuthorRowView[],
  page: readonly AuthorRowView[],
): AuthorRowView[] {
  const rows: AuthorRowView[] = [...stored];
  for (const row of page) {
    if (rows.some((candidate) => isSameAuthor(candidate.authorName, row.authorName))) {
      continue;
    }
    rows.push(row);
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

  /**
   * `true` while a row press or a sync press is in flight (`A183`).
   *
   * An announcement that arrives during a press is a change that press caused — the
   * page's memory moved because this popup asked it to — so it is dropped: the answer of
   * the press is the fresher of the two views, and rendering the announcement's one would
   * show a list the press has already moved past.
   */
  private pressing = false;

  constructor(source: PageEntriesSource) {
    this.source = source;
    this.port = source.port;
  }

  /** Opening the popup: one address read, one settings read, one page read. */
  async open(): Promise<PageEntriesView> {
    return await this.viewOf(await this.addressOf());
  }

  /**
   * The page's announcement, heard (ruling `A183`).
   *
   * The popup asks **once** when it opens, and the page answers with what its memory holds
   * at that moment — which may be nothing, because the page's automatic load is still
   * running. This is the other half: while the popup is open it listens for the page's
   * announcement and rebuilds the view, so a list that arrives late is still rendered. No
   * poll, no timer and no second question of its own: the page says when something moved.
   *
   * It returns the unsubscribe, and the component calls it when it is destroyed, so a
   * closed popup re-renders nothing. A source that cannot listen at all answers with a
   * no-op, which is the honest state of a popup on a page that cannot announce.
   */
  watchPage(onView: (view: PageEntriesView) => void): () => void {
    return listenForPageNotesUpdates(this.source.page, () => {
      void this.refreshFor(onView);
    });
  }

  /** One announcement answered: rebuild the view and hand it to the caller. */
  private async refreshFor(onView: (view: PageEntriesView) => void): Promise<void> {
    // A press in flight owns the view: the announcement of a change it caused would
    // overwrite the state its own answer produces, and the two answers are the same one.
    if (this.pressing) {
      return;
    }
    const view = await this.viewOf(await this.addressOf());
    onView(view);
  }

  /**
   * The aggregate checkbox of one row (rulings `A1`, `A50`, `A108`, `A168`).
   *
   * A **stored** row: **one** core `setVisibleForAuthor` for that author on that page,
   * never one `setVisible` per entry — N calls would mean N `pages:v1` rewrites and a
   * page left half-applied. No message is sent for such a row, and the row keeps its
   * position and its count, because neither the write nor the re-read touches
   * `createdAt`.
   *
   * A **foreign** row (`A168`): the press is one message to the page, which switches that
   * author's highlights in its own memory and answers the fresh state. Storage is not
   * written — a foreign note has no stored `visible` field — the server is not called,
   * and the row list that comes back is the page's own answer.
   */
  async setVisibilityForAuthor(authorName: string, visible: boolean): Promise<PageEntriesView> {
    return await this.press(async (url: string | null) => {
      if (await this.routesToPage(authorName, url)) {
        await switchPageAuthor(this.source.page, authorName, visible);
        return;
      }
      if (url !== null) {
        await setVisibleForAuthor(this.port, { url, authorName, visible });
      }
    });
  }

  /**
   * `Удалить` of one row (rulings `A25`, `A108`, `A168`).
   *
   * A **stored** row: **one** core `deleteEntriesOfAuthor`, which removes every entry of
   * that author on this page and asks no author question, so a foreign or stale group is
   * never undeletable. Taking the last row of a page drops the slot, which is what makes
   * the empty-state line appear.
   *
   * A **foreign** row (`A168`): one message that drops that author's notes from this
   * page's view for this tab — locally only, the server is never called — and the page
   * answers with the state it has left. The rows come back on the next page load, which
   * is what `A163`'s "memory only" means in the spec's own words.
   */
  async removeAllOfAuthor(authorName: string): Promise<PageEntriesView> {
    return await this.press(async (url: string | null) => {
      if (await this.routesToPage(authorName, url)) {
        await dismissPageAuthor(this.source.page, authorName);
        return;
      }
      if (url !== null) {
        await deleteEntriesOfAuthor(this.port, { url, authorName });
      }
    });
  }

  /**
   * One press: one address read, the write or the message, and the re-read that follows
   * (`A1`, `A108`, `A183`).
   *
   * The `pressing` flag is what keeps an announcement from overwriting the answer a press
   * is about to produce: a page that announces its own dismissal would otherwise hand the
   * popup a view built before that dismissal had been asked for, and the row would blink.
   * The flag is cleared in `finally`, so a write that throws leaves the popup listening.
   */
  private async press(act: (url: string | null) => Promise<void>): Promise<PageEntriesView> {
    const url = await this.addressOf();
    this.pressing = true;
    try {
      await act(url);
    } finally {
      this.pressing = false;
    }
    return await this.viewOf(url);
  }

  /**
   * Whether this author's row is the page's (`A168`).
   *
   * The question is asked of the **last answer the page gave**, not of a fresh message:
   * a press must not need two round trips, and the rows the user is looking at are the
   * rows this popup is rendering — the same rule the sync press follows when it reads the
   * store "at the moment of the press, not from the popup's rendered view" (`A161`). A
   * page that has answered no rows has no foreign row to press. A page that cannot be
   * asked at all answers the empty result, so there is nothing to press either.
   */
  private async routesToPage(authorName: string, url: string | null): Promise<boolean> {
    if (url !== null && !isInjectableUrl(url)) {
      return false;
    }
    const asked = await this.pageState();
    return isForeignAuthor(foreignGroupsOf(asked.rows), authorName);
  }

  /**
   * The page's current answer (`A167`, `A169`), asked once per view build.
   *
   * The channel answers data and never throws, so this method needs no guard: a popup on
   * a page the content script was never injected into, on a `chrome://` page or on a page
   * that has not booted yet is answered with no rows and no failure — `A166`'s state.
   */
  private async pageState(): Promise<PageNotesQueryResult> {
    return await askPage(this.source.page);
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

    // One pass over the core order, and the popup has its stored rows: the grouping is a
    // projection over the stored records, not a stored thing (`A108`).
    const stored = groupsOf(sortByCreatedAtAsc(page.entries), currentName);

    // Stage 17 (`A166` first): a page nobody may ask holds no rows of the server's and
    // no failure to state, so the question is not put at all — the popup behaves as it
    // did before the feature existed, and the page is sent no message.
    const enabled = syncTargetOf(settings) !== null;
    const asked: PageNotesQueryResult =
      enabled && isInjectableUrl(url) ? await this.pageState() : EMPTY_PAGE_NOTES_QUERY_RESULT;
    const rows = mergeAuthorRows(stored, foreignGroupsOf(asked.rows));


    const notices: PopupNoticeCode[] = [];
    if (!author.ok) {
      notices.push('name_required');
    }
    if (!isInjectableUrl(url)) {
      notices.push('page_not_injectable');
    }
    // `A169`: the page owns the load, so the page's answer is the only thing that can
    // produce this line. It stands above the list, which still renders (`A83`).
    if (asked.syncFailed) {
      notices.push('sync_failed');
    }

    // Stage 17 (`A166`): the button exists only when there is somewhere to call. The
    // decision is core's, and it is the same call the content script makes before its
    // automatic load, so the two halves cannot disagree.
    return { rows, notices, syncEnabled: enabled, syncFailed: asked.syncFailed };
  }
}
