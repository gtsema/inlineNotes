/**
 * All user-visible strings of the content layer. One module per UI layer
 * (`docs/project-profile.md` -> Stack, `docs/specs/content-overlay-ui.md` ->
 * Rules / Semantics -> "All strings are Russian and come from one constants
 * module per UI layer"). Russian is the product language for UI text.
 *
 * Message map (PM ruling `A33`, `docs/specs/content-overlay-ui.md` -> Rules /
 * Semantics -> "Refusal message map"): every machine-readable refusal code the
 * core write API answers with becomes a Russian string **here**, and only here,
 * so a call site can never invent its own wording and no code can be left without
 * an answer — the map is keyed by the code union, so the compiler checks that the
 * union and the map cover each other.
 *
 * `duplicate` and `overlap` are distinct refusals with distinct strings (ruling
 * `A47`): the same span with the same comment already exists, while an
 * intersecting span belongs to another note. Collapsing them into one message
 * would hide which of the two the user has to change.
 *
 * The numeric limits inside two messages are read from the core constants that
 * enforce them, so a raised cap cannot leave a stale number behind.
 */

import type { CreateNoteCode } from './create/create-note';
import { MAX_COMMENT_CODE_POINTS, MAX_ENTRIES_PER_PAGE } from '../core/entry-rules';

/**
 * Every refusal the create card can be shown: each code the core write path
 * answers with, plus the one failure the content layer reports itself — the
 * selection the card was opened for no longer resolves to a span. The union is
 * declared in `src/content/create/create-note.ts`, where the codes come from; the
 * wording is keyed here and the map is total over it, so no code can be left
 * without an answer and no string can live at a call site.
 */
export type ContentRefusalCode = CreateNoteCode;

export const CONTENT_STRINGS = {
  /** Accessible name and placeholder of the comment input. */
  commentInput: 'Текст заметки',
  /** Save button of the create card and of the editor. */
  save: 'Сохранить',
  /** Cancel button of the create card and of the editor. */
  cancel: 'Отмена',
} as const;

/**
 * Refusal code to Russian wording. Pinned wordings come from
 * `docs/specs/inline-comment-model.md` ("Overlap", "Quota", "Author name") and
 * ruling `A47`; the rest are the least-risky defaults recorded in
 * `docs/state/t3-01-content-create-card.md`.
 */
export const REFUSAL_TEXT: Readonly<Record<ContentRefusalCode, string>> = {
  // Creation rules (`CreateBlockCode`, Flow 3 steps 1-6).
  name_required: 'Укажите имя в настройках',
  comment_empty: 'Введите текст заметки',
  comment_too_long: `Заметка длиннее ${String(MAX_COMMENT_CODE_POINTS)} символов`,
  page_limit: `Достигнут лимит ${String(MAX_ENTRIES_PER_PAGE)} записей на странице`,
  overlap: 'Выделение пересекается с существующей записью',
  duplicate: 'Такая заметка на этом выделении уже есть',

  // Port failures (`StorageFailureCode`).
  quota: 'Хранилище переполнено',
  serialization: 'Не удалось сохранить заметку',
  unavailable: 'Не удалось сохранить заметку',

  // Store-shape failures this path can be handed.
  layout_version: 'Не удалось сохранить заметку',
  index_malformed: 'Не удалось сохранить заметку',
  storage_unavailable: 'Не удалось сохранить заметку',
  slot_malformed: 'Не удалось сохранить заметку',
  url_unparsable: 'Не удалось определить адрес страницы',

  // Write-path codes the create card cannot reach, mapped so the map stays total.
  not_author: 'Эту заметку может изменить только её автор',
  entry_not_found: 'Заметка не найдена',
  // `entry_invalid` is a bug-level answer: the caller built an entry core refuses
  // to store. It is shown, never swallowed (task `t3-01` AC5).
  entry_invalid: 'Не удалось сохранить заметку',

  // Content-layer capture failure: the page moved the selected text away.
  selection_lost: 'Выделение больше не найдено на странице',
};

/** The Russian wording of one refusal code, from the single map. */
export function refusalText(code: ContentRefusalCode): string {
  return REFUSAL_TEXT[code];
}

/**
 * Counter of the comment input: `<code points>/<cap>`, both counted in Unicode
 * code points (`docs/specs/content-overlay-ui.md` -> Rules / Semantics ->
 * "Counter rules"), never in UTF-16 units.
 */
export function cardCounterText(codePoints: number): string {
  return `${String(codePoints)}/${String(MAX_COMMENT_CODE_POINTS)}`;
}
