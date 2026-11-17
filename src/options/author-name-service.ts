/**
 * The options page half of the author-name contract: the field value, the input
 * cap and the save, all of them delegated to the core API.
 *
 * Task `t4-02-options-name`. This is the **only** shipped module that calls
 * `saveSettings` and the **only** place `generateAuthorName` is wired
 * (`docs/specs/inline-comment-model.md` -> Rules / Semantics -> "Author name",
 * ruling `A54`); `tests/toolchain-contract.spec.ts` pins both claims by grep, so
 * a second writer of `settings:v1` or a second generator fails the unit gate. The
 * page reads and writes nothing else, and it never looks at a storage key: the
 * port is handed to core, which owns `settings:v1` (`"Settings record"`).
 *
 * Three rules this module owns the *wiring* of:
 *
 * - `A54` **first run generates the name.** A stored name core refuses — absent,
 *   damaged, empty, or over the cap — is replaced by `generateAuthorName(rng)`
 *   and stored through `saveSettings`. The reader is never asked to invent a
 *   name, and no other layer generates one. The one shape that is **not**
 *   generated over is an unreadable storage area (`storage_unavailable`): writing
 *   a fresh identity into an area the page could not read would decide the
 *   author of every existing entry on a guess.
 * - `A55` **the cap is counted in code points.** The field cap uses
 *   `MAX_AUTHOR_NAME_CODE_POINTS` with `sliceCodePoints` / `codePointLength`, so
 *   a surrogate pair counts once and the counter agrees with what
 *   `validateAuthorName` enforces. `String.prototype.length` is never the guard.
 * - `A56` **an unchanged save is not an error.** `save` always goes through
 *   `saveSettings` — a damaged record is repaired by the next explicit save — and
 *   a successful one reports the saved state.
 *
 * After a refused or failed save the field goes back to the name the store
 * actually holds: `saveSettings` leaves the stored value byte-identical
 * (`tests/core-settings-store.spec.ts`), so showing the typed value would print a
 * name the reader does not have.
 *
 * The module holds no Russian string (those live in `text.ts`), no clock, and no
 * `chrome.*`: randomness and storage are injected, so every rule here runs in
 * plain Node against the in-memory port.
 */

import type { RandomSource } from '../core/entry-rules';
import {
  MAX_AUTHOR_NAME_CODE_POINTS,
  codePointLength,
  generateAuthorName,
  validateAuthorName,
} from '../core/entry-rules';
import type { SettingsWriteCode } from '../core/settings-store';
import { loadSettings, saveSettings } from '../core/settings-store';
import type { StoragePort } from '../core/storage-port';
import { sliceCodePoints } from '../core/text-normalize';

/**
 * Refusal the page can be shown: the codes `saveSettings` answers with, plus the
 * one read failure that leaves the page with no name to show at all.
 * `src/options/text.ts` owns the Russian wording of every one of them.
 */
export type OptionsRefusalCode = SettingsWriteCode | 'storage_unavailable';

/** Machine code of the message line: every refusal plus the one confirmation. */
export type OptionsMessageCode = OptionsRefusalCode | 'saved';

/** What the field shows and what the page says next to it. */
export interface AuthorNameView {
  /** Value to render. Never a raw stored byte: an unusable record is repaired. */
  name: string;
  /** Message line, `null` when the page has nothing to report. */
  message: OptionsMessageCode | null;
}

/** What the input handler decided about one typed value. */
export interface AuthorNameDraft {
  /** The value the field may hold: at most `MAX_AUTHOR_NAME_CODE_POINTS` code points. */
  value: string;
  /** Code points of `value` — the number the counter prints. */
  codePointCount: number;
  /** `true` when the typed value was longer than the cap and the tail was refused. */
  overCap: boolean;
  /** `true` when `Сохранить` may be pressed: non-empty after trim, inside the cap. */
  canSave: boolean;
}

/** What the service needs from its caller: the storage seam and the randomness. */
export interface AuthorNameServiceSource {
  port: StoragePort;
  rng: RandomSource;
}

/**
 * The author-name state machine of the options page. One read on open, one write
 * per `Сохранить`, and every decision (trim, cap, generated value, stored shape)
 * taken by core over the values this module passes to it.
 */
export class AuthorNameService {
  private readonly port: StoragePort;
  private readonly rng: RandomSource;

  /** Name the store holds, as the last core read or write reported it. */
  private storedName = '';

  constructor(source: AuthorNameServiceSource) {
    this.port = source.port;
    this.rng = source.rng;
  }

  /**
   * Opens the page. A usable stored name is shown as core normalized it; an
   * unusable one is replaced by the first-run generated name and saved (`A54`);
   * an unreadable storage area shows an empty field plus its message and writes
   * nothing. One `loadSettings`, and the page never inspects a code list to
   * decide "is there an author" — `validateAuthorName` does.
   */
  async open(): Promise<AuthorNameView> {
    const settings = await loadSettings(this.port);
    const stored = validateAuthorName(settings.name);
    if (stored.ok) {
      this.storedName = stored.normalized;
      return { name: this.storedName, message: null };
    }
    if (settings.codes.includes('storage_unavailable')) {
      this.storedName = '';
      return { name: '', message: 'storage_unavailable' };
    }
    return this.generateOnFirstRun();
  }

  /**
   * `A54`: an unusable stored name becomes the generated one, stored through
   * core, and the value the page shows afterwards is exactly the value core
   * reads back. If even that write is refused the page has no name to show, which
   * is the same state the content layer refuses to open a card over (`A31`).
   */
  private async generateOnFirstRun(): Promise<AuthorNameView> {
    const write = await saveSettings(this.port, { name: generateAuthorName(this.rng) });
    if (!write.ok) {
      this.storedName = '';
      return { name: '', message: write.code };
    }
    this.storedName = write.name;
    return { name: this.storedName, message: null };
  }

  /**
   * `A55`: one typed value becomes the value the field may hold. Everything past
   * `MAX_AUTHOR_NAME_CODE_POINTS` code points is refused at the input, so the
   * cap the reader sees and the cap core enforces are the same number, and an
   * astral name is measured by its code points rather than by its UTF-16 units.
   */
  draft(raw: string): AuthorNameDraft {
    const value = sliceCodePoints(raw, 0, MAX_AUTHOR_NAME_CODE_POINTS);
    return {
      value,
      codePointCount: codePointLength(value),
      overCap: codePointLength(raw) > MAX_AUTHOR_NAME_CODE_POINTS,
      canSave: validateAuthorName(value).ok,
    };
  }

  /**
   * `Сохранить`: the core save and nothing else (`A56` — even an unchanged name
   * goes through it, because that is what repairs a damaged record). A refused or
   * failed write puts the stored name back in the field and reports the code, so
   * the reader sees who the store really thinks the author is.
   */
  async save(raw: string): Promise<AuthorNameView> {
    const write = await saveSettings(this.port, { name: raw });
    if (!write.ok) {
      return { name: this.storedName, message: write.code };
    }
    this.storedName = write.name;
    return { name: this.storedName, message: 'saved' };
  }
}
