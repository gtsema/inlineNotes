/**
 * All user-visible strings of the options layer. One constants module per UI layer
 * (`docs/specs/content-overlay-ui.md` -> Rules / Semantics -> "All strings are
 * Russian and come from one constants module per UI layer").
 *
 * Message map (PM ruling `A33`, applied to this layer by `t4-02`): every machine
 * code the settings read and write answer with becomes a Russian message **here**,
 * and only here, and the map is keyed by the code union of
 * `src/options/author-name-service.ts`, so the compiler checks that the union and
 * the map cover each other and no call site can invent wording.
 *
 * One wording per surface, never a third variant (`t3-01` review hand-over):
 * the options page says `Имя обязательно` for a refused name — the wording the
 * overlay spec already fixes for this surface — while the popup and the page card
 * keep their own `Укажите имя в настройках` for the same state. `quota` reuses the
 * sentence `inline-comment-model.md` fixes for a full store. `tests/` pins both
 * sentences verbatim and pins that this module holds no second name-refusal
 * wording.
 *
 * The cap inside the counter is read from the core constant that enforces it, so a
 * raised cap cannot leave a stale number behind.
 */

import type { OptionsMessageCode } from './author-name-service';
import { MAX_AUTHOR_NAME_CODE_POINTS } from '../core/entry-rules';

export const OPTIONS_STRINGS = {
  title: 'Настройки inlineNotes',
  nameLabel: 'Имя',
  save: 'Сохранить',
  /**
   * Confirmation after a successful `Сохранить` (ruling `A56`). It is shown for an
   * unchanged value too: the save went through core, and a name that was already
   * stored is still the name the store holds.
   */
  saved: 'Имя сохранено',
} as const;

/**
 * Message code to Russian wording, total over `OptionsMessageCode`. The three
 * storage-failure codes share one sentence because the reader's action is the
 * same in every one of them: nothing was stored, try again.
 */
export const OPTIONS_MESSAGE_TEXT: Readonly<Record<OptionsMessageCode, string>> = {
  // Author-name rule (`A11`: one code for empty and over-cap alike).
  name_required: 'Имя обязательно',

  // Port failures of the save.
  quota: 'Хранилище переполнено',
  serialization: 'Не удалось сохранить имя',
  unavailable: 'Не удалось сохранить имя',

  // Read failure: the page could not learn who the author is, and wrote nothing.
  storage_unavailable: 'Хранилище недоступно',

  // Confirmation, not a refusal.
  saved: OPTIONS_STRINGS.saved,
};

/** The Russian message of one code, from the single map. */
export function optionsMessageText(code: OptionsMessageCode): string {
  return OPTIONS_MESSAGE_TEXT[code];
}

/**
 * Counter of the author-name field: `<code points>/<cap>`, both in Unicode code
 * points (`A55`), never in UTF-16 units.
 */
export function nameCounterText(codePoints: number): string {
  return `${String(codePoints)}/${String(MAX_AUTHOR_NAME_CODE_POINTS)}`;
}
