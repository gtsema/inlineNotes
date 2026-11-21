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
 * `name_required` is the total-map answer to a core refusal no shipped control of
 * this page can produce (overlay spec, "Options message map": `Сохранить` is
 * disabled for an empty trimmed value and the input refuses the code point past the
 * cap), while the popup and the page card keep their own
 * `Укажите имя в настройках` for the same state. `quota` reuses the
 * sentence `inline-comment-model.md` fixes for a full store. `tests/` pins both
 * sentences verbatim and pins that this module holds no second name-refusal
 * wording.
 *
 * The cap inside the counter is read from the core constant that enforces it, so a
 * raised cap cannot leave a stale number behind.
 */

import type { OptionsMessageCode } from './author-name-service';
import { MAX_AUTHOR_NAME_CODE_POINTS } from '../core/entry-rules';
import type { ServerAddressCode } from '../core/sync-settings';

export const OPTIONS_STRINGS = {
  title: 'Настройки inlineNotes',
  nameLabel: 'Имя',
  save: 'Сохранить',
  /**
   * The one `name explanation line` of the settings window (task `t9-02`, ruling
   * `A121`): it says what the field is for, because the mascot and the palette make
   * the page look like a product screen and the reader still has to know that this
   * one value signs every note the extension stores. One sentence, no second
   * variant, and it is the **only** string this task adds: `tests/options-window-look.spec.ts`
   * pins the key set of this object, so a new sentence needs a ruling and a spec
   * row, not a quiet edit.
   */
  nameHint: 'Это имя подписывает каждую заметку',
  /**
   * Confirmation after a successful `Сохранить` (ruling `A56`). It is shown for an
   * unchanged value too: the save went through core, and a name that was already
   * stored is still the name the store holds.
   */
  saved: 'Имя сохранено',
  /**
   * Label of the server address field (Stage 17, `t17-01` AC2). The parenthetical
   * under it says the two shapes the rule accepts, so the reader reads the
   * requirement before meeting the refusal (`A165`).
   */
  serverLabel: 'Адрес сервера',
  serverHint: 'http:// или https://, порт через двоеточие',
  /** Label of the synchronization switch; the only control that turns sync on. */
  syncLabel: 'Синхронизация',
  /** The word the checkbox shows beside itself. It is the label word, not a second one. */
  syncCheckbox: 'Включить',
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
 * Why the address the reader typed was refused (Stage 17, ruling `A165`). Machine
 * codes come from `src/core/sync-settings.ts`; the wording is this layer's, as
 * everywhere else.
 */
export type ServerAddressText = Readonly<Record<ServerAddressCode, string>>;

/**
 * One sentence per refusal, each naming what to change: a reader who typed an `ftp`
 * address and one who typed a path get different answers, because the fixes differ.
 */
export const SERVER_ADDRESS_TEXT: ServerAddressText = {
  server_invalid: 'Это не похоже на адрес: нужен вид http://192.168.0.10:8080',
  server_scheme: 'Адрес должен начинаться с http:// или https://',
  server_shape: 'В адресе нужны только хост и порт, без пути и параметров',
};

/** The Russian wording of one address refusal. */
export function serverAddressText(code: ServerAddressCode): string {
  return SERVER_ADDRESS_TEXT[code];
}

/**
 * Counter of the author-name field: `<code points>/<cap>`, both in Unicode code
 * points (`A55`), never in UTF-16 units.
 */
export function nameCounterText(codePoints: number): string {
  return `${String(codePoints)}/${String(MAX_AUTHOR_NAME_CODE_POINTS)}`;
}
