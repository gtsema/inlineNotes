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

import type { AuthorSweepResult } from '../core/author-notes';
import { deleteNotesOfAuthorOnAllPages } from '../core/author-notes';
import type { RandomSource } from '../core/entry-rules';
import {
  MAX_AUTHOR_NAME_CODE_POINTS,
  codePointLength,
  generateAuthorName,
  isSameAuthor,
  validateAuthorName,
} from '../core/entry-rules';
import { loadEntries } from '../core/entry-store-read';
import { readPageIndex } from '../core/page-index-store';
import type { SettingsWriteCode } from '../core/settings-store';
import { loadSettings, saveSettings } from '../core/settings-store';
import type { StoragePort } from '../core/storage-port';
import type { ServerAddressCode } from '../core/sync-settings';
import { parseServerAddress } from '../core/sync-settings';
import { sliceCodePoints } from '../core/text-normalize';

/**
 * Refusal the page can be shown: the codes `saveSettings` answers with, plus the
 * one read failure that leaves the page with no name to show at all.
 * `src/options/text.ts` owns the Russian wording of every one of them.
 */
export type OptionsRefusalCode = SettingsWriteCode | 'storage_unavailable';

/** Machine code of the message line: every refusal plus the one confirmation. */
export type OptionsMessageCode = OptionsRefusalCode | 'saved';

/**
 * How a rename the reader asked for ended (ruling `A174`).
 *
 * - `saved` — the name was written and the previous name's notes are gone;
 * - `sweep_failed` — the name was written and some notes of the previous name remain
 *   because a page could not be read or written. The name stays saved, and the page
 *   says which state the reader is in instead of leaving the partial deletion silent.
 *
 * The `saved` case is also the answer to a rename that had nothing to delete, so a
 * caller needs no separate branch for it.
 */
export type RenameOutcomeCode = 'saved' | 'sweep_failed';

/**
 * What `Сохранить` decided when the typed name differed from the stored one
 * (ruling `A173`).
 *
 * - `saved` — nothing would be lost: the store holds no note of the stored name, so
 *   the name was written and the page reports the ordinary confirmation;
 * - `confirm` — the rename would delete at least one note of the stored name, so the
 *   page must ask first and **nothing was written**;
 * - `refused` — the core save refused or failed, so nothing was written and nothing
 *   was deleted.
 */
export type SaveDecision =
  | { readonly kind: 'saved'; readonly view: AuthorNameView }
  | { readonly kind: 'confirm'; readonly view: AuthorNameView }
  | { readonly kind: 'refused'; readonly view: AuthorNameView };

/** What the page shows after the reader answered the rename warning. */
export interface RenameView {
  /** Name the store holds, as the core save reported it. */
  readonly name: string;
  /** Outcome of the rename, or `null` when the save itself failed. */
  readonly outcome: RenameOutcomeCode | null;
  /** The refusal code when the save failed, `null` when the name was written. */
  readonly refusal: OptionsRefusalCode | null;
}

/** What the field shows and what the page says next to it. */
export interface AuthorNameView {
  /** Value to render. Never a raw stored byte: an unusable record is repaired. */
  name: string;
  /** Message line, `null` when the page has nothing to report. */
  message: OptionsMessageCode | null;
}

/**
 * The sync half of the page (Stage 17, `t17-01` AC2, AC3): the address that is
 * **stored**, the switch that is stored, and the refusal of a typed value that never
 * reached the store.
 */
export interface SyncSettingsView {
  /** Stored address as core normalized it; `''` means "not configured". */
  serverUrl: string;
  /** Stored switch. */
  syncEnabled: boolean;
  /** Why the last typed address was refused, `null` when it was accepted. */
  serverRefusal: ServerAddressCode | null;
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

  /**
   * The sync half of the page (Stage 17). Kept beside the name because both live in
   * the **one** `settings:v1` record: two services writing it would race, and the
   * last write would erase the other half's field.
   */
  private sync: SyncSettingsView = { serverUrl: '', syncEnabled: false, serverRefusal: null };

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
    this.sync = { serverUrl: settings.serverUrl, syncEnabled: settings.syncEnabled, serverRefusal: null };
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

  /**
   * `Сохранить` with the rename rule of ruling `A173` in front of the save.
   *
   * A typed name that differs from the stored one, in a store that holds at least one
   * note of the stored name, is **not** written: the answer is `confirm`, and the page
   * shows the warning with its two answers. A typed name that would lose nothing — the
   * same name, or a rename in a store with no note of the stored name — goes through
   * the ordinary save and answers `saved`. A refused or failed save answers `refused`
   * and wrote nothing.
   *
   * The "does the store hold a note of the stored name" question is answered by the
   * page read (`loadEntries`) on the stored page key, because the settings page has no
   * article address and no index address of its own; the rename sweep then covers every
   * page, so the answer only decides whether the warning is shown. A read the page
   * cannot answer is treated as "nothing to lose" and the save goes through: the store
   * may still hold notes the sweep then removes, and refusing to save a name because a
   * page read failed would block the reader on a store the options page can still write.
   */
  async saveName(raw: string): Promise<SaveDecision> {
    const typed = validateAuthorName(raw).normalized;
    if (typed !== this.storedName && (await this.storedNameHasNotes())) {
      return { kind: 'confirm', view: { name: this.storedName, message: null } };
    }

    const view = await this.save(raw);
    return view.message === 'saved'
      ? { kind: 'saved', view }
      : { kind: 'refused', view };
  }

  /**
   * The reader pressed `Продолжить` on the rename warning: the name is saved **first**,
   * then the previous name's notes are deleted on every page (ruling `A174`).
   *
   * A failed name save deletes nothing and answers its refusal code with the name the
   * store still holds. A successful save whose sweep could not clean every page answers
   * `sweep_failed`: the name stays saved — undoing it would be a second write the
   * reader did not ask for — and the page tells the reader which state they are in.
   * The server is never called: the sweep is a local deletion (`A173`).
   */
  async confirmRename(raw: string): Promise<RenameView> {
    const previous = this.storedName;
    const view = await this.save(raw);
    if (view.message !== 'saved') {
      return { name: this.storedName, outcome: null, refusal: view.message };
    }

    const sweep: AuthorSweepResult = await deleteNotesOfAuthorOnAllPages(this.port, previous);
    const complete = sweep.ok && sweep.failed.length === 0;
    return {
      name: this.storedName,
      outcome: complete ? 'saved' : 'sweep_failed',
      refusal: null,
    };
  }

  /**
   * `true` when the store holds at least one note of the stored name on any page the
   * index lists. The index is walked through the shipped page read, so the answer uses
   * the same key resolution and the same author identity (`isSameAuthor`) as every
   * other read of the product; a page whose read fails contributes no note.
   */
  private async storedNameHasNotes(): Promise<boolean> {
    if (this.storedName === '') {
      return false;
    }
    const index = await readPageIndex(this.port);
    for (const pageKey of index.index.pageKeys) {
      const page = await loadEntries(this.port, pageKey);
      if (page.entries.some((entry) => isSameAuthor(entry.authorName, this.storedName))) {
        return true;
      }
    }
    return false;
  }

  /** The sync half as it stands, for the first render of the page. */
  syncView(): SyncSettingsView {
    return { ...this.sync };
  }

  /**
   * The address field, one typed value at a time (ruling `A165`).
   *
   * A value the rule accepts is written through core and the stored address comes
   * back normalized; a value it refuses is **not** written, is **not** remembered and
   * answers its refusal code, so the message names what to change while the stored
   * record stays exactly as it was. The field itself keeps the typed text: it is the
   * reader's own edit, and clearing it would delete what they are fixing.
   */
  async saveServerUrl(raw: string): Promise<SyncSettingsView> {
    const parsed = parseServerAddress(raw);
    if (!parsed.ok) {
      this.sync = { ...this.sync, serverRefusal: parsed.code };
      return this.syncView();
    }

    const write = await saveSettings(this.port, { name: this.storedName, serverUrl: parsed.serverUrl });
    if (!write.ok) {
      this.sync = { ...this.sync, serverRefusal: null };
      return this.syncView();
    }
    this.sync = { serverUrl: write.serverUrl, syncEnabled: write.syncEnabled, serverRefusal: null };
    return this.syncView();
  }

  /**
   * The synchronization switch. `A166`: the switch is what makes the content script
   * call the server at page open, so it is written the moment it is pressed and the
   * view reports what the store really holds afterwards.
   */
  async setSyncEnabled(syncEnabled: boolean): Promise<SyncSettingsView> {
    const write = await saveSettings(this.port, { name: this.storedName, syncEnabled });
    if (!write.ok) {
      return this.syncView();
    }
    this.sync = { serverUrl: write.serverUrl, syncEnabled: write.syncEnabled, serverRefusal: null };
    return this.syncView();
  }
}
