/**
 * All user-visible strings of the popup layer. One constants module per UI layer
 * (`docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "All strings are
 * Russian and come from one constants module per UI layer").
 *
 * Wording is fixed by the overlay spec, not chosen here:
 *
 * - `title` and `emptyState` are the popup contract sentence ("Empty state:
 *   `На этой странице нет записей`");
 * - `nameRequired` is the `settings gate` line the spec fixes for this surface, and
 *   ruling `A83` makes it the control that opens the options page, so no second
 *   «открыть настройки» string exists;
 * - `notInjectable` is ruling `A81`: one sentence for one state, whether the page is
 *   `file://`, `chrome://`, the PDF viewer or an address core refuses;
 * - `ownEntry` is the `ownership header` word of ruling `A82`. A foreign row prints
 *   its stored author name, which is data and not a string of this layer;
 * - `delete` is the row control of ruling `A25`, now one per author row (`A108`);
 * - the `author row` label of ruling `A108` is one format entry, `authorRowLabel`, and
 *   `AUTHOR_ROW_COUNT_SEPARATOR` is its only punctuation. There is no plural word form
 *   for the count: «10 заметок» would be a second way to say what the number already
 *   says, and Russian plural agreement would need a rule this layer must not own.
 *
 * The notice map is keyed by `PopupNoticeCode`, so the compiler checks that the code
 * union and the map cover each other and no call site can invent wording (ruling
 * `A33` applied to this layer).
 */

import type { AuthorRowView, PopupNoticeCode } from './page-entries-service';

export const POPUP_STRINGS = {
  /**
   * Popup heading: the list of entries of the page the reader is on. Ruling `A98`
   * deleted the page-address line that used to stand under it, so this heading names
   * the page without printing anything of its address.
   */
  title: 'Заметки на этой странице',
  /** Empty state of the entry list. */
  emptyState: 'На этой странице нет записей',
  /**
   * No usable author name (ruling `A31`, overlay AC10, ruling `A83`). The same
   * sentence the page card shows for the same state — a third variant of one state
   * is forbidden — and the label of the control that opens the options page.
   */
  nameRequired: 'Укажите имя в настройках',
  /**
   * The content script is not registered for this address, so the page cannot show
   * highlights (ruling `A81`). The list still renders under this line.
   */
  notInjectable: 'На этой странице подсветка недоступна',
  /** Ownership header of the reader's own row (ruling `A82`). */
  ownEntry: 'Вы',
  /** Row delete control, present for every row of the page (ruling `A25`). Since `t14-01`
   * (ruling `A143`) the button prints no word: this string is its `aria-label` **and**
   * its `title`, which is the accessible name of an icon-only control. */
  delete: 'Удалить',
  /**
   * Sync control of the reader's own row (Stage 17, ruling `A162`). Like `Удалить` it is
   * icon-only, so the word is its `aria-label` **and** its `title`; the three states are
   * visual (`A162` says so), and the accessible name therefore stays one phrase while
   * the arrows spin or turn red.
   */
  sync: 'Синхронизировать',
  /**
   * The non-blocking line a failed automatic load leaves (rulings `A164`, `A169`). One
   * sentence for every failure the page can report: the reader's next step is the same
   * in all of them — check the server address in the settings — and a second variant per
   * code would be wording this feature has no ruling for.
   *
   * Since `t17-02` the sentence is **reachable**: the page owns the automatic load and
   * answers the popup's question with its outcome, so `sync_failed` is a notice code the
   * service really produces (`src/popup/page-entries-service.ts`) and `POPUP_NOTICE_TEXT`
   * below is the one address of the wording. Before that task this string shipped with no
   * reader, which is the defect the review of `t17-01` named.
   */
  syncFailed: 'Не удалось связаться с сервером синхронизации',
} as const;

/**
 * The separator of the `author row` label (ruling `A108`): «Вася — 10». It is a
 * constant rather than a character inside a template so the format of the row has one
 * address, and an em dash is what the spec's own example uses.
 */
export const AUTHOR_ROW_COUNT_SEPARATOR = ' — ';

/**
 * Notice code to Russian wording, total over `PopupNoticeCode`.
 */
export const POPUP_NOTICE_TEXT: Readonly<Record<PopupNoticeCode, string>> = {
  name_required: POPUP_STRINGS.nameRequired,
  page_not_injectable: POPUP_STRINGS.notInjectable,
  // `A164`: one sentence for every sync failure, and it is the same string the sync
  // button's error state owns — one state, one wording.
  sync_failed: POPUP_STRINGS.syncFailed,
};

/** The Russian wording of one notice code, from the single map. */
export function popupNoticeText(code: PopupNoticeCode): string {
  return POPUP_NOTICE_TEXT[code];
}

/**
 * The `ownership header` part of a row (ruling `A82`): the reader's own word for an
 * author core `canEdit` accepts, otherwise the stored author name. This is the shipped
 * content-layer rule restated for this surface with the same single word, and the only
 * place own and foreign rows look different.
 */
export function ownershipHeaderText(row: AuthorRowView): string {
  return row.isOwn ? POPUP_STRINGS.ownEntry : row.authorName;
}

/**
 * The whole `author row` label (rulings `A95`, `A108`): «Вы — 3», «Вася — 10». One
 * format entry for one format; the count is the plain number of that author's entries
 * on this page, stale ones included (`A86`), because the popup resolves no anchor and
 * cannot know what the page will refuse to paint. No tooltip, no icon, no word around
 * the number: anything more is a ruling, not a choice of this layer.
 */
export function authorRowLabel(row: AuthorRowView): string {
  return `${ownershipHeaderText(row)}${AUTHOR_ROW_COUNT_SEPARATOR}${String(row.count)}`;
}
