/**
 * All user-visible strings of the popup layer. One constants module per UI layer.
 * Wording is fixed by `docs/specs/content-overlay-ui.md` (Popup contract).
 */

export const POPUP_STRINGS = {
  /** Popup heading: host of the page plus the list of its entries. */
  title: 'Заметки на этой странице',
  /** Empty state of the entry list. */
  emptyState: 'На этой странице нет записей',
} as const;
