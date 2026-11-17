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
 * - `delete` is the row control of ruling `A25`.
 *
 * The notice map is keyed by `PopupNoticeCode`, so the compiler checks that the code
 * union and the map cover each other and no call site can invent wording (ruling
 * `A33` applied to this layer).
 */

import type { EntryRowView, PopupNoticeCode } from './page-entries-service';

export const POPUP_STRINGS = {
  /** Popup heading: host of the page plus the list of its entries. */
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
  /** Row delete control, present for every row of the page (ruling `A25`). */
  delete: 'Удалить',
} as const;

/**
 * Notice code to Russian wording, total over `PopupNoticeCode`.
 */
export const POPUP_NOTICE_TEXT: Readonly<Record<PopupNoticeCode, string>> = {
  name_required: POPUP_STRINGS.nameRequired,
  page_not_injectable: POPUP_STRINGS.notInjectable,
};

/** The Russian wording of one notice code, from the single map. */
export function popupNoticeText(code: PopupNoticeCode): string {
  return POPUP_NOTICE_TEXT[code];
}

/**
 * The `ownership header` of a row (ruling `A82`): the reader's own word for an entry
 * core `canEdit` accepts, otherwise the stored author name. This is the shipped
 * content-layer rule restated for this surface with the same single word, and the
 * only place own and foreign rows look different.
 */
export function ownershipHeaderText(row: EntryRowView): string {
  return row.isOwn ? POPUP_STRINGS.ownEntry : row.authorName;
}
