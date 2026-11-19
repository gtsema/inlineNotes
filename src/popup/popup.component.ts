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
 * The hit box of the row's delete button, in CSS pixels (task `t14-01`, answer `Q5`,
 * ruling `A143`): the same `24px` the page widgets declare as `ACTION_HIT_BOX_PX`, so
 * the icon-only shape matches across surfaces. The box is a named constant because the
 * control carries no visible label any more and the declared box is the only thing
 * that keeps it pressable; a test reads the stylesheet **text** for it, which is the
 * only way to pin a size that no rendered attribute states.
 */
export const POPUP_DELETE_HIT_BOX_PX = 24;

/** The glyph drawn inside that box, smaller than the box on purpose (answer `Q5`). */
export const POPUP_DELETE_ICON_PX = 16;

/**
 * The coordinate space the glyph is drawn in; it scales into `POPUP_DELETE_ICON_PX`.
 * The `viewBox` is the one `src/content/overlay/action-icons.tsx` uses, because the two
 * drawings are the same drawing (ledger row `S14-4`).
 */
const POPUP_DELETE_ICON_VIEW_BOX = '0 0 24 24';

/**
 * Popup (`t4-01-popup-list`, reshaped by `t5-06`): the authors of the current page,
 * one row each, with one show/hide checkbox and one icon-only delete button per row.
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
 * delete button that takes every entry of that author on this page. Both handlers pass
 * the row's `authorName` to the service, which answers with exactly one core call: there
 * is no id in a row to loop over, and no per-entry write is imported by this layer. There
 * is no edit affordance and no expansion on this surface at all: no textarea, no
 * `Сохранить`, no list of the author's notes, and the service imports no comment write.
 *
 * Since `t14-01` (ruling `A143`) the delete control is **icon-only**, in the shape the
 * page widgets' `action row` has carried since `A114`: its only child is an inline
 * `<svg>`, the Russian word `Удалить` moved from visible text to `aria-label` and
 * `title`, and the glyph is `aria-hidden` so a screen reader hears one name per control.
 * The behaviour did not move with the word: one press is still exactly one core
 * `deleteEntriesOfAuthor` for the whole author group (`A25`, `A108`).
 *
 * The look of this document is the closed `A125` palette (`A140`, `A141`, `t14-01`):
 * cream surface, `#1b2a33` ink, `#7b6a55` secondary, `#a6cbdc` decorative, `#b3261e`
 * refusal kept from before `A125`, and the `#b8480d` action colour on the checkbox. What
 * is shared with `src/options/` is the palette, the `13px` type scale and the `16px` inner
 * padding; the width is not (the panel is `320px`, a toolbar popup; the settings card is
 * `360px`, a dialog box). No colour is invented here, and no mascot is drawn (`A142`).
 *
 * The **frame and the radius are not drawn** (ruling `A144`, task `t14-02`). Three shapes
 * disagreed at the four corners of the window: the popup window's own radius, this
 * component's rectangular `:host` fill, and the card's `12px` arc — the `#a6cbdc` border
 * traced the arc and stopped, leaving the host's square corner visible against the
 * window's dark edge. The window now owns the shape, exactly as it does for any page: the
 * surface fills it edge to edge and Chrome rounds it. The settings window is the other
 * case and keeps its card frame — that one **is** a page Chrome sizes, and a card is drawn
 * inside it. The row separator and the checkbox keep their own `#a6cbdc` borders: they are
 * controls inside this surface, not its frame (`border: 0` on a button is the removal of
 * a painted edge, not the declaration of one). `A144` touches one rule.
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
              <button
                class="delete"
                type="button"
                [attr.aria-label]="deleteLabel"
                [attr.title]="deleteLabel"
                (click)="onRemove(row.authorName)"
              >
                <svg
                  [attr.width]="deleteIconPx"
                  [attr.height]="deleteIconPx"
                  [attr.viewBox]="deleteIconViewBox"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4.5 7 L19.5 7" />
                  <path d="M9.5 7 L9.5 4.5 L14.5 4.5 L14.5 7" />
                  <path d="M6.5 7 L7.5 19.5 L16.5 19.5 L17.5 7" />
                  <path d="M10 10.5 L10 16.5" />
                  <path d="M14 10.5 L14 16.5" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      background: #fdf7ee;
    }

    .popup {
      width: 320px;
      box-sizing: border-box;
      padding: 16px;
      background: #fdf7ee;
      font: 13px/1.45 system-ui, sans-serif;
      color: #1b2a33;
    }

    .title {
      margin: 0 0 8px;
      font-size: 15px;
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
      border-top: 1px solid #a6cbdc;
    }

    .row:first-child {
      border-top: 0;
    }

    .row--foreign .author {
      color: #7b6a55;
    }

    .toggle {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 13px;
    }

    .toggle input[type='checkbox'] {
      flex: none;
      width: 14px;
      height: 14px;
      margin: 0;
      border: 1px solid #a6cbdc;
      border-radius: 3px;
      accent-color: #b8480d;
    }

    .author {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delete {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      min-width: 24px;
      min-height: 24px;
      padding: 0;
      border: 0;
      background: none;
      color: #b8480d;
      cursor: pointer;
    }

    .delete svg {
      display: block;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
    }

    .empty {
      margin: 0;
      color: #7b6a55;
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

  /**
   * The delete glyph's box, as an attribute: `POPUP_DELETE_ICON_PX` in px. The glyph is
   * `16` and the hit box is `24`, so this is the smaller of the two.
   */
  readonly deleteIconPx: string = String(POPUP_DELETE_ICON_PX);

  /**
   * The glyph's coordinate space, as an attribute. Both this glyph and
   * `DeleteActionIcon` of the page editor are drawn in `0 0 24 24`; the icon scales into
   * `POPUP_DELETE_ICON_PX`.
   *
   * **Why this glyph is declared here instead of imported** (ledger row `S14-4`, ruling
   * `A143`, task `t14-01` AC10): the drawing already exists once, as `DeleteActionIcon`
   * in `src/content/overlay/action-icons.tsx`. That module is **Preact**, it lives under
   * `src/content/`, and this surface is an **Angular** standalone component with no
   * cross-layer import: `tests/toolchain-contract.spec.ts` pins the layer boundary and
   * `tests/content-create-card-boundaries.spec.ts` pins that no module under `src/popup/`
   * carries an inline glyph belonging to the page widgets — which `t14-01` AC4 changes for
   * this one control, by its own ruling. So the shape is re-declared in the popup's own
   * idiom and the duplication is stated here, at the declaration, instead of being
   * discovered later as a drifting copy. Nothing pins that the two drawings stay the same
   * shape; that is the debt `S14-4` carries.
   */
  readonly deleteIconViewBox: string = POPUP_DELETE_ICON_VIEW_BOX;

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
   * The delete control of a row: **one** core `deleteEntriesOfAuthor` through the
   * service, for every entry of this author on this page, own or foreign (rulings `A25`,
   * `A108`). Ruling `A143` moved the word `Удалить` from this control's visible text to
   * its `aria-label` and `title`; the call below is exactly the one it made before.
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
