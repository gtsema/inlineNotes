import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, inject, signal } from '@angular/core';

import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import type { AuthorNameDraft, AuthorNameServiceSource, AuthorNameView } from './author-name-service';
import { AuthorNameService } from './author-name-service';
import { OPTIONS_STRINGS, nameCounterText, optionsMessageText } from './text';

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
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="options">
      <h1 class="title">{{ title }}</h1>

      <label class="label" for="author-name">{{ nameLabel }}</label>
      <input
        class="input"
        id="author-name"
        type="text"
        autocomplete="off"
        [value]="draft().value"
        (input)="onInput($event)"
      />
      <p class="counter">{{ counter() }}</p>

      <button class="save" type="button" [disabled]="!draft().canSave" (click)="onSave()">
        {{ save }}
      </button>

      @if (view().message !== null) {
        <p class="message">{{ message() }}</p>
      }
    </main>
  `,
  styles: `
    .options {
      width: 360px;
      padding: 16px;
      font: 13px/1.45 system-ui, sans-serif;
      color: #1f1f1f;
    }

    .title {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
    }

    .label {
      display: block;
      margin-bottom: 4px;
    }

    .input {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
    }

    .counter {
      margin: 4px 0 12px;
      color: #6b6b6b;
    }

    .save {
      padding: 6px 14px;
    }

    .message {
      margin: 12px 0 0;
      color: #b3261e;
    }
  `,
})
export class OptionsComponent implements OnInit {
  private readonly service = new AuthorNameService(inject(AUTHOR_NAME_SOURCE));

  /** Stored name plus the message line, as the core read or write reported them. */
  readonly view = signal<AuthorNameView>({ name: '', message: null });

  /** What the field holds right now and what `Сохранить` would send. */
  readonly draft = signal<AuthorNameDraft>(emptyDraft());

  readonly title: string = OPTIONS_STRINGS.title;
  readonly nameLabel: string = OPTIONS_STRINGS.nameLabel;
  readonly save: string = OPTIONS_STRINGS.save;

  ngOnInit(): void {
    void this.open();
  }

  /** Counter under the field: `N/40`, counted in code points (`A55`). */
  counter(): string {
    return nameCounterText(this.draft().codePointCount);
  }

  /** Russian wording of the current message code, from the single map. */
  message(): string {
    const code = this.view().message;
    return code === null ? '' : optionsMessageText(code);
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

  /** `Сохранить`: the core save and nothing else (`A56`). */
  onSave(): void {
    void this.saveDraft();
  }

  private async saveDraft(): Promise<void> {
    this.apply(await this.service.save(this.draft().value));
  }

  private async open(): Promise<void> {
    this.apply(await this.service.open());
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
