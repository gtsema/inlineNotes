import { ChangeDetectionStrategy, Component } from '@angular/core';

import { OPTIONS_STRINGS } from './text';

/**
 * Options page placeholder (`t1-01`).
 *
 * Shows the author-name field and the save button in a disabled state. The
 * mandatory-name rule, first-run random name and `settings:v1` persistence are
 * implemented in `t4-02` on top of the core API.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="options">
      <h1 class="title">{{ title }}</h1>
      <label class="label" for="author-name">{{ nameLabel }}</label>
      <input class="input" id="author-name" type="text" maxlength="40" disabled />
      <button class="save" type="button" disabled>{{ save }}</button>
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
      margin-bottom: 12px;
    }

    .save {
      padding: 6px 14px;
    }
  `,
})
export class OptionsComponent {
  readonly title: string = OPTIONS_STRINGS.title;
  readonly nameLabel: string = OPTIONS_STRINGS.nameLabel;
  readonly save: string = OPTIONS_STRINGS.save;
}
