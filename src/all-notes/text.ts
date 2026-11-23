/**
 * The Russian wording of the «Мои заметки» page (`A189` of `all-notes-page.md`).
 *
 * One constants module per UI layer, the same rule the popup and the options page
 * follow: no Russian string lives in a component, a service or `src/core/`. The
 * plural of the count is computed here, once, so the component reads a ready label.
 */

/** All the strings the page renders. */
export const ALL_NOTES_STRINGS = {
  title: 'Мои заметки',
  empty: 'Нет заметок',
  nameRequired: 'Укажите имя в настройках',
  listUnavailable: 'Список заметок недоступен',
  serverDeleteFailed: 'Не удалось удалить заметки на сервере',
  delete: 'Удалить',
  open: 'Открыть список всех страниц с заметками',
} as const;

/** The three Russian plural forms of «заметка» for the count label. */
export function noteCountText(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} заметка`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} заметки`;
  }
  return `${count} заметок`;
}

/** The row's date: the day of the latest note, in the Russian day format. */
export function rowDateText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * The readable page label for a row without a stored title (`A190` fallback): the
 * page key without its scheme — `example.com/a/b` reads, `https://` prefixes do
 * not. The page key is already the normalized URL, so nothing else is rewritten
 * here and the full address stays the link's `href`.
 */
export function pageLabelText(pageKey: string): string {
  return pageKey.replace(/^https?:\/\//, '');
}
