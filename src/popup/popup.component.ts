import { ChangeDetectionStrategy, Component } from '@angular/core';

import { POPUP_STRINGS } from './text';

/**
 * Popup placeholder (`t1-01`).
 *
 * Renders the popup heading and the empty state from the layer constants module.
 * The real entry list and the per-entry checkbox arrive in `t4-01`; the popup
 * reads and writes entries only through the core API.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="popup">
      <h1 class="title">{{ title }}</h1>
      <p class="empty">{{ emptyState }}</p>
    </main>
  `,
  styles: `
    .popup {
      width: 320px;
      padding: 12px;
      font: 13px/1.45 system-ui, sans-serif;
      color: #1f1f1f;
    }

    .title {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .empty {
      margin: 0;
      color: #6b6b6b;
    }
  `,
})
export class PopupComponent {
  readonly title: string = POPUP_STRINGS.title;
  readonly emptyState: string = POPUP_STRINGS.emptyState;
}
