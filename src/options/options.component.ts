import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, inject, signal } from '@angular/core';

import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import type {
  AuthorNameDraft,
  AuthorNameServiceSource,
  AuthorNameView,
  RenameView,
  SaveDecision,
  SyncSettingsView,
} from './author-name-service';
import { AuthorNameService } from './author-name-service';
import {
  OPTIONS_STRINGS,
  nameCounterText,
  optionsMessageText,
  renameOutcomeText,
  serverAddressText,
} from './text';

/**
 * What the page runs on: the storage seam and the randomness. A token with a root
 * factory, so the shipped page needs no wiring step and a test can replace the
 * source without touching the component.
 */
export const AUTHOR_NAME_SOURCE = new InjectionToken<AuthorNameServiceSource>(
  'inlinenotes:author-name-source',
  {
    providedIn: 'root',
    factory: (): AuthorNameServiceSource => ({
      port: createChromeLocalStoragePort(),
      rng: Math.random,
    }),
  },
);

/**
 * Options page (`t4-02-options-name`): the author-name field, its counter and
 * `Сохранить`.
 *
 * The component is a facade. It owns no rule: every decision about the value —
 * trim, code-point cap, first-run generation, stored shape, refusal code — is
 * taken by `AuthorNameService` over the core API, and the wording is read from
 * `src/options/text.ts`. What lives here is signal plumbing and nothing else, so
 * the tests drive the service and this file holds no branch worth testing.
 *
 * Storage is reached the way every other layer reaches it: through the one port
 * adapter (`createChromeLocalStoragePort()`, behind `AUTHOR_NAME_SOURCE`), never by
 * naming a key. Randomness is `Math.random` handed to core, which is the only
 * place that turns it into a name.
 *
 * The field is bound to the *draft*, which is what makes the cap visible: a value
 * longer than `MAX_AUTHOR_NAME_CODE_POINTS` code points is refused at the input
 * (`A55`), so no `maxlength` attribute — a UTF-16 counter the browser owns — is
 * part of the guard.
 *
 * The look of `t9-02` (`A123`–`A126`) is stylesheet and markup only, and it decides
 * no rule: the `settings mascot` is the owner's own artwork shipped as a file and
 * framed by CSS, the palette is the literal `A125` set, and the page fills the
 * Chrome dialog box instead of declaring a fixed 360 px column. Nothing here opens
 * a file, reads a dimension of the PNG, or adds a storage read: the image reaches
 * the page as a relative URL the build's copied asset answers, which is why there
 * is no `data:` URI, no remote URL and no `web_accessible_resources` entry.
 *
 * The arrangement of `t12-01` (`A134`, `A135`, `A136`) is layout only: `.header` lays
 * the mascot and the title out as a **centred column** (the art first, the title under
 * it), and the `name explanation line` is a **parenthetical in italics** on the
 * `label-line` of the `author-name field`, right after the `Имя` label. Both brackets
 * and the italics are this template and this stylesheet; `OPTIONS_STRINGS.nameHint`
 * keeps its wording, so `src/options/text.ts` is untouched (`A136`).
 *
 * The separation and the size of that parenthetical are `t13-01` (`A137`, `A138`), and
 * both are **declarations**, not characters: the newline between `</label>` and the
 * `<span class="hint">` already collapses to one word-space, so a second whitespace
 * character would render as the same single space and change nothing the reader can
 * see — `.hint` therefore carries `margin-left: 4px`, the smallest declared step that
 * reads as a wider gap than a word-space, and `font-size: 11px` against the surface's
 * inherited `13px`, keeping the italic style and the unchanged `#7b6a55` ink (`A125`).
 * Both are presentation, so `src/options/text.ts` is untouched here too (`A136`).
 *
 * The disabled `Сохранить` once dimmed itself with `opacity: 0.45`, and ruling `A153`
 * (`t15-01`) replaced that with colours: an opacity fades the fill and the label
 * **together**, so at `0.45` the label measured `1.42:1` against its own button and
 * could never be legible. The state is now the same one the page widgets' save button
 * wears — the fill `#e3c3aa`, the `#1b2a33` label and the `#a6cbdc` decorative border —
 * which measures **8.88:1** for the label and **1.56:1** for the fill against the card,
 * against **4.97:1** for the enabled `#b8480d`. `WCAG 1.4.3` exempts inactive controls,
 * so this is a legibility choice rather than a compliance fix. The `border` is a
 * declaration the enabled state does not carry (it has `border: 0`), so the disabled
 * button gains a drawn edge in the palette's decorative colour and no geometry of the
 * enabled control moves.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="options">
      <header class="header">
        <img class="mascot" src="assets/cat-mascot.png" alt="" />
        <h1 class="title">{{ title }}</h1>
      </header>

      <p class="label-line">
        <label class="label" for="author-name">{{ nameLabel }}</label>
        <span class="hint">({{ nameHint }})</span>
      </p>
      <input
        class="input"
        id="author-name"
        type="text"
        autocomplete="off"
        [value]="draft().value"
        (input)="onInput($event)"
      />
      <p class="counter">{{ counter() }}</p>

      <p class="label-line sync-line">
        <label class="label" for="server-url">{{ serverLabel }}</label>
        <span class="hint">({{ serverHint }})</span>
      </p>
      <input
        class="input"
        id="server-url"
        type="text"
        autocomplete="off"
        [value]="serverDraft()"
        (input)="onServerInput($event)"
        (change)="onServerCommit()"
      />

      <p class="toggle-line">
        <input
          class="sync-toggle"
          id="sync-enabled"
          type="checkbox"
          [checked]="sync().syncEnabled"
          (change)="onSyncToggle($event)"
        />
        <label class="label" for="sync-enabled">{{ syncLabel }}</label>
      </p>

      <button class="save" type="button" [disabled]="!draft().canSave" (click)="onSave()">
        {{ save }}
      </button>

      @if (renameConfirm()) {
        <div class="rename" role="alert">
          <p class="rename-warning">{{ renameWarning }}</p>
          <div class="rename-actions">
            <button class="rename-cancel" type="button" (click)="onRenameCancel()">
              {{ renameCancel }}
            </button>
            <button class="rename-continue" type="button" (click)="onRenameContinue()">
              {{ renameContinue }}
            </button>
          </div>
        </div>
      } @else {
        <p class="message" [class]="messageClass()">{{ message() }}</p>
      }
    </main>
  `,
  /**
   * The `A125` palette, written as literals, one declaration per pinned role, and
   * pinned by reading this text in `tests/options-window-look.spec.ts`. Two values
   * are named here rather than invented: `#ffffff` is the "white text" half of the
   * pinned action pair, and the refusal color is the one that already shipped on
   * this page — the pinned palette names no role for a refusal line, and keeping
   * the shipped value (6.1:1 on the page background) is the report of that gap,
   * not a seventh palette color. Since ruling `A153` (`t15-01`) the `.save:disabled`
   * rule states the disabled state as three of the same roles — `#e3c3aa` fill,
   * `#1b2a33` label, `#a6cbdc` border — instead of an `opacity`, and the pair it
   * adds is on the recomputed list in `tests/options-window-look.spec.ts`.
   */
  styles: `
    :host {
      display: block;
      box-sizing: border-box;
      min-height: 100vh;
      padding: 10px 16px;
      background: #fdf7ee;
    }

    .options {
      box-sizing: border-box;
      width: 100%;
      max-width: 360px;
      margin: 0 auto;
      padding: 16px;
      border: 1px solid #a6cbdc;
      border-radius: 12px;
      background: #fdf7ee;
      font: 13px/1.45 system-ui, sans-serif;
      color: #1b2a33;
    }

    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin: 0;
    }

    .mascot {
      width: 80px;
      height: 80px;
      flex: none;
      border-radius: 50%;
      object-fit: contain;
      object-position: center;
      border: 2px solid #a6cbdc;
    }

    .title {
      min-width: 0;
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    .label-line {
      margin: 0 0 2px;
    }

    .label {
      display: inline;
    }

    .hint {
      margin-left: 4px;
      font-style: italic;
      font-size: 11px;
      color: #7b6a55;
    }

    .input {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      color: #1b2a33;
      background: #ffffff;
      border: 1px solid #a6cbdc;
      border-radius: 6px;
      font: inherit;
    }

    .counter {
      margin: 4px 0 0;
      color: #7b6a55;
    }

    .sync-line {
      margin: 0;
    }

    .toggle-line {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 12px;
    }

    .sync-toggle {
      flex: none;
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: #b8480d;
    }

    .save {
      padding: 6px 14px;
      color: #ffffff;
      background: #b8480d;
      border: 0;
      border-radius: 6px;
      font: inherit;
    }

    .save:disabled {
      color: #1b2a33;
      background: #e3c3aa;
      border: 1px solid #a6cbdc;
      cursor: default;
    }

    /*
     * The message slot is permanently reserved (ruling A185, task t18-02, amended by
     * A186): both appearing blocks declare the same min-height, so the dialog box the
     * reader opened is the box that keeps its size whether a refusal, the confirmation
     * or nothing at all is showing. The empty arm paints no band, and it keeps the
     * same padding, because the reader measured the filled band growing the window by
     * exactly its own vertical padding — the reserve is one box, and the paint is the
     * only thing that appears inside it. The box is a flex row so the sentence sits
     * centred in the reserve, not on its top line.
     */
    .message {
      margin: 12px 0 0;
      min-height: 38px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      border-radius: 6px;
      background: #eef4f7;
    }

    .message--empty {
      background: transparent;
    }

    .message--saved {
      color: #0f5f7a;
    }

    .message--refusal {
      color: #b3261e;
    }

    /*
     * The warning fills the same reserve as the message line (A187), and it ships
     * **no** border of its own: its two-line sentence at 13px/1.45 measures 37.7px of
     * content, and the 2px a decorative border added would overflow the 38px reserve
     * the reader fixed — the reader named exactly this overflow. The pale band and
     * the radius keep the block legible as one unit without the edge.
     */
    .rename {
      margin: 12px 0 0;
      min-height: 38px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 6px;
      background: #eef4f7;
    }

    .rename-warning {
      margin: 0;
      flex: 1 1 auto;
      color: #8a1a14;
    }

    .rename-actions {
      display: flex;
      gap: 8px;
      flex: none;
    }

    .rename-cancel {
      padding: 4px 12px;
      border: 0;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
      color: #1b2a33;
      background: #e3c3aa;
    }

    .rename-continue {
      padding: 4px 12px;
      border: 0;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
      color: #ffffff;
      background: #b8480d;
    }
  `,
})
export class OptionsComponent implements OnInit {
  private readonly service = new AuthorNameService(inject(AUTHOR_NAME_SOURCE));

  /** Stored name plus the message line, as the core read or write reported them. */
  readonly view = signal<AuthorNameView>({ name: '', message: null });

  /** What the field holds right now and what `Сохранить` would send. */
  readonly draft = signal<AuthorNameDraft>(emptyDraft());

  /**
   * The sync half as the store reports it (Stage 17, `t17-01` AC2, AC3). `sync()` is
   * what the two controls render; `serverDraft()` is the address field's own text, so a
   * refused value stays in front of the reader while the stored one stays untouched.
   */
  readonly sync = signal<SyncSettingsView>({ serverUrl: '', syncEnabled: false, serverRefusal: null });
  readonly serverDraft = signal<string>('');

  readonly title: string = OPTIONS_STRINGS.title;
  readonly nameLabel: string = OPTIONS_STRINGS.nameLabel;
  readonly save: string = OPTIONS_STRINGS.save;
  readonly nameHint: string = OPTIONS_STRINGS.nameHint;
  readonly serverLabel: string = OPTIONS_STRINGS.serverLabel;
  readonly serverHint: string = OPTIONS_STRINGS.serverHint;
  readonly syncLabel: string = OPTIONS_STRINGS.syncLabel;
  readonly renameWarning: string = OPTIONS_STRINGS.renameWarning;
  readonly renameCancel: string = OPTIONS_STRINGS.renameCancel;
  readonly renameContinue: string = OPTIONS_STRINGS.renameContinue;

  /**
   * The rename warning of ruling `A173` (`t17-04`): shown by `Сохранить` when the typed
   * name differs from the stored one and the store holds a note of the stored name.
   * Nothing is written while it stands, and `Отмена` clears it without a write.
   */
  readonly renameConfirm = signal<boolean>(false);

  /** How the last `Продолжить` ended, `null` until the reader answers the warning. */
  readonly renameOutcome = signal<RenameView | null>(null);

  ngOnInit(): void {
    void this.open();
  }

  /** Counter under the field: `N/40`, counted in code points (`A55`). */
  counter(): string {
    return nameCounterText(this.draft().codePointCount);
  }

  /**
   * The **one** sentence the confirmation band shows (ruling `A179`, `t17-05`).
   *
   * Before this ruling the template carried two independent `@if` blocks — one for
   * `view().message` and one for `renameOutcome()` — and a rename save answered `saved`
   * through **both**, so the reader saw «Сохранено» twice. The two sources are merged
   * here, before rendering, so the page renders one node on every path:
   *
   * - a rename outcome with wording wins, because it is the more specific answer
   *   (`sweep_failed` says the name saved and a page could not be cleaned, which the
   *   ordinary `saved` code cannot express);
   * - otherwise the ordinary message code's sentence, `''` when there is none.
   *
   * The rename **rule** is untouched (`A173`, `A174`): this is the render half only.
   */
  message(): string {
    // The address refusal joins the one slot (`A186`): the reader measured the
    // page reserving two slots and asked for the reserve under the button only.
    const server = this.serverMessage();
    if (server !== null) {
      return server;
    }
    const rename = this.renameOutcome();
    if (rename !== null && rename.outcome !== null) {
      return renameOutcomeText(rename.outcome);
    }
    const code = this.view().message;
    return code === null ? '' : optionsMessageText(code);
  }

  /**
   * Whether the confirmation band renders at all — the one condition of the one block
   * (`A179`). `false` while no source carries a sentence, which is what makes the
   * ordinary and the rename path share a single rendering site.
   */
  hasConfirmation(): boolean {
    return this.message() !== '';
  }

  /** Russian wording of the address refusal, from the single map (ruling `A33`). */
  serverMessage(): string | null {
    const code = this.sync().serverRefusal;
    return code === null ? null : serverAddressText(code);
  }

  /**
   * Which palette role the message line wears (`A125`): the confirmation is the
   * accent on the pale band, a refusal keeps the color this page shipped with
   * before the palette existed. This chooses a class and no wording — the wording
   * is the map's, and the code that decides the class is the map's key.
   *
   * Merged with the rename outcome in the same ruling (`A179`): a rename that
   * completed wears the confirmation role, a partial deletion the refusal one — the
   * class `renameOutcomeClass()` used to carry, now decided in the one place the
   * sentence is decided, so wording and colour cannot disagree.
   *
   * Ruling `A185` adds the empty arm: the slot renders with no text and no band,
   * because the space it occupies is reserved (`A178`'s goal, kept by a fixed
   * slot rather than by a freed gap).
   */
  messageClass(): string {
    if (this.message() === '') {
      return 'message message--empty';
    }
    if (this.serverMessage() !== null) {
      return 'message message--refusal';
    }
    const rename = this.renameOutcome();
    if (rename !== null && rename.outcome === 'sweep_failed') {
      return 'message message--refusal';
    }
    if (this.view().message === 'saved' || (rename !== null && rename.outcome === 'saved')) {
      return 'message message--saved';
    }
    return 'message message--refusal';
  }

  /** One typed value: the service cuts everything past the cap, then the field re-renders. */
  onInput(event: Event): void {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) {
      return;
    }
    this.draft.set(this.service.draft(field.value));
    if (this.view().message !== null) {
      this.view.set({ name: this.view().name, message: null });
    }
  }

  /**
   * `Сохранить`: the core save, routed through the rename rule when the typed name
   * would delete the previous name's notes (`A173`). The page owns no rule here: the
   * service decides `saved` / `confirm` / `refused`, and this handler only shows what
   * it answered.
   */
  onSave(): void {
    void this.saveDraft();
  }

  /**
   * `Отмена` on the rename warning: nothing is written and the field keeps the typed
   * value, so the reader can fix the name without losing their edit.
   */
  onRenameCancel(): void {
    this.renameConfirm.set(false);
  }

  /**
   * `Продолжить` on the rename warning: the name is saved first, then the previous
   * name's notes are deleted on every page (`A174`). The service owns the order; this
   * handler puts the outcome on the page.
   */
  onRenameContinue(): void {
    void this.confirmRename();
  }

  /** One typed character of the address field: a draft only, nothing is written yet. */
  onServerInput(event: Event): void {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) {
      return;
    }
    this.serverDraft.set(field.value);
    if (this.sync().serverRefusal !== null) {
      this.sync.set({ ...this.sync(), serverRefusal: null });
    }
  }

  /**
   * The address field lost focus or the reader pressed `Enter`: the value is offered
   * to the rule (`A165`). Nothing here decides whether it is an address — the service
   * and core do, and this handler only shows what they answered.
   */
  onServerCommit(): void {
    void this.commitServerUrl();
  }

  /** The synchronization switch (`A166`): written the moment it is pressed. */
  onSyncToggle(event: Event): void {
    const box = event.target;
    if (!(box instanceof HTMLInputElement)) {
      return;
    }
    void this.applySync(this.service.setSyncEnabled(box.checked));
  }

  private async commitServerUrl(): Promise<void> {
    this.applySync(this.service.saveServerUrl(this.serverDraft()));
  }

  /** One place puts the stored sync half back on the page, field included. */
  private applySync(next: Promise<SyncSettingsView>): void {
    void next.then((view: SyncSettingsView) => {
      this.sync.set(view);
      if (view.serverRefusal === null) {
        this.serverDraft.set(view.serverUrl);
      }
    });
  }

  private async saveDraft(): Promise<void> {
    const decision: SaveDecision = await this.service.saveName(this.draft().value);
    this.renameOutcome.set(null);
    this.renameConfirm.set(decision.kind === 'confirm');
    if (decision.kind === 'confirm') {
      // `A173`: the warning asks first and writes nothing. The field keeps the typed
      // value so `Отмена` leaves the reader's edit in place, and applying the stored
      // name here would erase what they typed.
      //
      // `A179` (`t17-05`): while the warning stands it is the **only** line the page
      // shows, so a sentence from an earlier save cannot stand beside it and make the
      // reader count two answers. The name is kept; only the message is cleared.
      this.view.set({ name: this.view().name, message: null });
      return;
    }
    this.apply(decision.view);
  }

  private async confirmRename(): Promise<void> {
    const view = await this.service.confirmRename(this.draft().value);
    this.renameConfirm.set(false);
    this.renameOutcome.set(view);
    // `A179`: one source of truth for the sentence. When the sweep left pages behind,
    // the outcome itself carries the wording and the ordinary `saved` code is **not**
    // written beside it — that would print "Сохранено" over a deletion that failed.
    this.apply({
      name: view.name,
      message: view.outcome === 'sweep_failed' ? null : (view.refusal ?? 'saved'),
    });
  }

  private async open(): Promise<void> {
    this.apply(await this.service.open());
    // The stored sync half is read by the same call the name comes from, so the two
    // controls start on what the record really holds.
    const sync = this.service.syncView();
    this.sync.set(sync);
    this.serverDraft.set(sync.serverUrl);
  }
  /**
   * One place moves both signals, so the field can never show a value the store
   * does not hold: after a refused save this puts the stored name back.
   */
  private apply(next: AuthorNameView): void {
    this.view.set(next);
    this.draft.set(this.service.draft(next.name));
  }
}

/** Draft of an empty field, before the first read has answered. */
function emptyDraft(): AuthorNameDraft {
  return { value: '', codePointCount: 0, overCap: false, canSave: false };
}
