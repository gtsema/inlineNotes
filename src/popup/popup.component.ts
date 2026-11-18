import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, inject, signal } from '@angular/core';

import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import { activeTabUrl } from './active-tab';
import type { AuthorRowView, PageEntriesSource, PageEntriesView, PopupNoticeCode } from './page-entries-service';
import { PageEntriesService, rowClass } from './page-entries-service';
import { POPUP_STRINGS, authorRowLabel, popupNoticeText } from './text';

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
 * Popup (`t4-01-popup-list`, reshaped by `t5-06`): the authors of the current page,
 * one row each, with one show/hide checkbox and one `Удалить` per row.
 *
 * The component is a facade, in the shape `t4-02` set for the options page: it owns
 * signals, two click handlers and the wording lookup, and every decision — which page,
 * which authors, in what order, how many notes each holds, who is the author, what is
 * foreign — is taken by `PageEntriesService` over the core API. There is no branch here
 * worth a test, which is what the grep in `tests/toolchain-contract.spec.ts` checks.
 *
 * The row is the popup contract sentence of rulings `A95` and `A108`: the `author row`
 * label (`ownership header` + ` — ` + the entry count, ruling `A82` for the word), one
 * checkbox whose state is the **aggregate** of that author's `visibility flag`s, and one
 * `Удалить` that takes every entry of that author on this page. Both handlers pass the
 * row's `authorName` to the service, which answers with exactly one core call: there is
 * no id in a row to loop over, and no per-entry write is imported by this layer. There
 * is no edit affordance and no expansion on this surface at all: no textarea, no
 * `Сохранить`, no list of the author's notes, and the service imports no comment write.
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
          @for (row of view().rows; track row.authorName) {
            <li [class]="rowClassOf(row)">
              <label class="toggle">
                <input
                  type="checkbox"
                  [checked]="row.allVisible"
                  (change)="onToggle(row.authorName, $event)"
                />
                <span class="author">{{ labelOf(row) }}</span>
              </label>
              <button class="delete" type="button" (click)="onRemove(row.authorName)">
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

  /** The whole `author row` label: «Вы — 3», «Вася — 10» (rulings `A82`, `A108`). */
  labelOf(row: AuthorRowView): string {
    return authorRowLabel(row);
  }

  /** Ownership marker of a row: a class, never a second Russian sentence. */
  rowClassOf(row: AuthorRowView): string {
    return rowClass(row);
  }

  /**
   * The aggregate checkbox: **one** core `setVisibleForAuthor` through the service for
   * the whole row, then a fresh read (rulings `A1`, `A50`, `A108`).
   */
  onToggle(authorName: string, event: Event): void {
    const box = event.target;
    if (!(box instanceof HTMLInputElement)) {
      return;
    }
    void this.apply(this.service.setVisibilityForAuthor(authorName, box.checked));
  }

  /**
   * `Удалить` of the row: **one** core `deleteEntriesOfAuthor` through the service, for
   * every entry of this author on this page, own or foreign (rulings `A25`, `A108`).
   */
  onRemove(authorName: string): void {
    void this.apply(this.service.removeAllOfAuthor(authorName));
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
