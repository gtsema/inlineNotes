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
import type { EditNoteCode } from './editor/edit-entry';
import { MAX_COMMENT_CODE_POINTS, MAX_ENTRIES_PER_PAGE } from '../core/entry-rules';

/**
 * Every refusal either card can be shown: each code the core write path answers
 * with, plus the one failure the content layer reports itself — the selection the
 * card was opened for no longer resolves to a span. The two halves are declared in
 * `src/content/create/create-note.ts` and `src/content/editor/edit-entry.ts`, where
 * the codes come from, and they are the same set: the editor shows the create
 * card's sentences for the states the two paths share, because the editor adds no
 * refusal of its own. The wording is keyed here and the map is total over it, so no
 * code can be left without an answer and no string can live at a call site.
 */
export type ContentRefusalCode = CreateNoteCode | EditNoteCode;

export const CONTENT_STRINGS = {
  /** Accessible name and placeholder of the comment input. */
  commentInput: 'Текст заметки',
  /**
   * Save button of the create card and of the editor. Since ruling `A114` the
   * button is **icon-only** (`content-overlay-ui.md` -> "Compact `action row`"), so
   * this string is no longer the button's text: it is its `aria-label` **and** its
   * `title`, which is also the only handle a test or an assistive technology has on
   * the control.
   */
  save: 'Сохранить',
  /**
   * Delete button of the editor (`content-overlay-ui.md` -> Flow / Sequence 5).
   * It is rendered for the reader's own entry only: `A25` rules that core does not
   * gate `deleteEntry` by authorship, so this button — and the editor that holds it
   * — is the affordance a foreign entry never gets. Like the save button it is
   * icon-only under ruling `A114`, so the string is its `aria-label` and `title`.
   *
   * There is **no** `cancel` entry: ruling `A114` removed the cancel control of both
   * widgets, and `Esc` plus a `pointerdown` outside the overlay host are what close
   * them. A string of this module names a control that exists.
   */
  delete: 'Удалить',
  /**
   * Header of a tooltip or editor over the reader's own entry (`content-overlay-ui.md`
   * -> Rules -> "Own entries and foreign entries are visually distinguished only in
   * the tooltip header"). A foreign entry prints its stored author name instead, and
   * that name is data, not a string of this layer.
   */
  ownEntry: 'Вы',
  /** Accessible name of the hover tooltip (task `t3-02` AC3). */
  tooltipLabel: 'Заметка',
  /**
   * The line a **failed** one-note server delete leaves (ruling `A182`, task `t17-06`).
   *
   * The reader deleted their own note, the record is gone from this page immediately, and
   * the server still holds a copy of it. That is one state and one sentence: the note is
   * deleted **here**, the server's copy stays, and the reader is the only one who can do
   * anything about it (the next press of the sync button is what rewrites that page's
   * server rows).
   *
   * Where the sentence appears is the same place every other content-layer answer
   * appears: the `refusal line` of the widget, rendered over a card that opens and closes
   * at once — see `overlay/editor-controller.tsx`, which mounts the line for this state
   * because the editor it belongs to is already gone (`A44`: a delete asks no
   * confirmation and takes no press to dismiss). No modal, no second sentence, and
   * nothing on the article (`A164` keeps the article silent).
   */
  deleteServerFailed: 'Заметка удалена здесь, но на сервере осталась',
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
