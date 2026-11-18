import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, inject, signal } from '@angular/core';

import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import { activeTabUrl } from './active-tab';
import type { EntryRowView, PageEntriesSource, PageEntriesView, PopupNoticeCode } from './page-entries-service';
import { PageEntriesService, rowClass } from './page-entries-service';
import { POPUP_STRINGS, ownershipHeaderText, popupNoticeText } from './text';

/**
 * What the popup runs on: the one storage port adapter, the active-tab address read
 * and the navigation to the options page. A token with a root factory, so the shipped
 * page needs no wiring step and a test can replace the whole source without touching
 * the component (`tests/popup-entry-list.spec.ts` drives the service over a fake).
 *
 * `createChromeLocalStoragePort()` is the only storage surface of this layer, exactly
 * as on the options page (`t4-02` AC5): the popup names no storage key and calls no
 * storage API, which `tests/toolchain-contract.spec.ts` pins by grep.
 */
export const PAGE_ENTRIES_SOURCE = new InjectionToken<PageEntriesSource>(
  'inlinenotes:page-entries-source',
  {
    providedIn: 'root',
    factory: (): PageEntriesSource => ({
      port: createChromeLocalStoragePort(),
      pageUrl: async (): Promise<string | null> => await activeTabUrl(),
      openOptions: (): void => {
        void chrome.runtime.openOptionsPage();
      },
    }),
  },
);

/**
 * Popup (`t4-01-popup-list`): the entries of the current page, one row each, with the
 * show/hide checkbox and `Удалить`.
 *
 * The component is a facade, in the shape `t4-02` set for the options page: it owns
 * signals, two click handlers and the wording lookup, and every decision — which page,
 * which entries, in what order, who is the author, what is foreign — is taken by
 * `PageEntriesService` over the core API. There is no branch here worth a test, which
 * is what the grep in `tests/toolchain-contract.spec.ts` checks.
 *
 * The row is the popup contract sentence: author name as the `ownership header`
 * (ruling `A82`), one checkbox whose state is the stored `visibility flag`, and
 * `Удалить` for every row of the page, own or foreign (ruling `A25`). There is no edit
 * affordance on this surface at all: no textarea, no `Сохранить`, and the service
 * imports no comment write.
 *
 * The notices of ruling `A83` are rendered **above** the list and the list still
 * renders below them, because stored entries that become invisible are stored entries
 * the reader can no longer delete. The name-required notice is a real `<button>`: it is
 * the control that opens the options page, and it writes nothing.
 *
 * Ruling `A98` (task `t5-05`) removed the page-address line that used to stand under the
 * title: it printed `new URL(tab.url).host`, which is punycode for an internationalized
 * page, and it answered no question the reader had. What did **not** go is the address
 * read behind it — the token's `pageUrl` half is the active-tab read of ruling `A49`, and
 * the page key of the list still comes from it. This component renders no address in any
 * state, and the `tabs` permission stays for a read that is not a display.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="popup">
      <h1 class="title">{{ title }}</h1>

      @for (notice of view().notices; track notice) {
        @if (notice === 'name_required') {
          <button class="notice notice--name" type="button" (click)="openSettings()">
            {{ noticeText(notice) }}
          </button>
        } @else {
          <p class="notice notice--not-injectable">{{ noticeText(notice) }}</p>
        }
      }

      @if (view().rows.length === 0) {
        <p class="empty">{{ emptyState }}</p>
      } @else {
        <ul class="rows">
          @for (row of view().rows; track row.id) {
            <li [class]="rowClassOf(row)">
              <label class="toggle">
                <input
                  type="checkbox"
                  [checked]="row.visible"
                  (change)="onToggle(row.id, $event)"
                />
                <span class="author">{{ headerOf(row) }}</span>
              </label>
              <button class="delete" type="button" (click)="onRemove(row.id)">
                {{ deleteLabel }}
              </button>
            </li>
          }
        </ul>
      }
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
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }

    .notice {
      margin: 0 0 8px;
      color: #b3261e;
    }

    button.notice {
      display: block;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      text-decoration: underline;
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-top: 1px solid #e3e3e3;
    }

    .row--foreign .author {
      color: #6b6b6b;
    }

    .toggle {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .author {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delete {
      flex: 0 0 auto;
      padding: 2px 8px;
    }

    .empty {
      margin: 0;
      color: #6b6b6b;
    }
  `,
})
export class PopupComponent implements OnInit {
  private readonly service = new PageEntriesService(inject(PAGE_ENTRIES_SOURCE));

  /** The whole popup state, as the core reads answered for the active tab. */
  readonly view = signal<PageEntriesView>({ rows: [], notices: [] });

  readonly title: string = POPUP_STRINGS.title;
  readonly emptyState: string = POPUP_STRINGS.emptyState;
  readonly deleteLabel: string = POPUP_STRINGS.delete;

  ngOnInit(): void {
    void this.apply(this.service.open());
  }

  /** Wording of one notice line, from the single constants module. */
  noticeText(code: PopupNoticeCode): string {
    return popupNoticeText(code);
  }

  /** `ownership header` of a row (ruling `A82`). */
  headerOf(row: EntryRowView): string {
    return ownershipHeaderText(row);
  }

  /** Ownership marker of a row: a class, never a second Russian sentence. */
  rowClassOf(row: EntryRowView): string {
    return rowClass(row);
  }

  /** The checkbox: core `setVisible` through the service, then a fresh read (`A50`). */
  onToggle(id: string, event: Event): void {
    const box = event.target;
    if (!(box instanceof HTMLInputElement)) {
      return;
    }
    void this.apply(this.service.setVisibility(id, box.checked));
  }

  /** `Удалить`: core `deleteEntry` through the service, for every row (`A25`). */
  onRemove(id: string): void {
    void this.apply(this.service.remove(id));
  }

  /** Ruling `A83`: the name-required line is the navigation to the options page. */
  openSettings(): void {
    this.service.openSettings();
  }

  /** One place moves the signal, so the list is always what the store just said. */
  private async apply(next: Promise<PageEntriesView>): Promise<void> {
    this.view.set(await next);
  }
}
