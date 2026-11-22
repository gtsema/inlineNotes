import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, OnInit, inject, signal } from '@angular/core';

import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import { activeTabUrl } from './active-tab';
import type { AuthorRowView, PageEntriesSource, PageEntriesView, PopupNoticeCode } from './page-entries-service';
import { PageEntriesService, rowClass } from './page-entries-service';
import { createPageNotesChannelSource } from './page-notes-channel';
import type { SyncPressSource } from './sync-button-service';
import { PopupSyncPress } from './sync-button-service';
import { createPopupSyncTransport } from './sync-transport';
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
      // Stage 17 (`A167`, `A168`): the two controls a foreign row owns are messages to
      // the page, never storage writes of this layer.
      page: createPageNotesChannelSource(),
    }),
  },
);

/**
 * Where the sync button of the current author's row gets its port, its address read and
 * its `fetch` (Stage 17, `t17-01`). A token with a root factory, like
 * `PAGE_ENTRIES_SOURCE`, so the shipped page needs no wiring step and a test can
 * replace the whole source (`tests/popup-sync-button.spec.ts`).
 */
export const SYNC_PRESS_SOURCE = new InjectionToken<SyncPressSource>('inlinenotes:sync-press', {
  providedIn: 'root',
  factory: (): SyncPressSource => ({
    port: createChromeLocalStoragePort(),
    pageUrl: async (): Promise<string | null> => await activeTabUrl(),
    transport: createPopupSyncTransport(),
  }),
});

/**
 * The three states of the sync button (ruling `A162`). The value becomes a CSS class
 * and nothing else: the state is colour and motion, never text.
 */
export type SyncButtonState = 'idle' | 'running' | 'error';

/**
 * The sync glyph's box, in CSS pixels — the delete button's `24px` because `A162` asks
 * for the same size — and the `16px` glyph drawn inside it.
 */
export const POPUP_SYNC_HIT_BOX_PX = 24;
export const POPUP_SYNC_ICON_PX = 16;

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
 * The look of this surface is the closed `A125` palette (`A140`, `A141`, `t14-01`):
 * `#1b2a33` ink, `#7b6a55` secondary, `#a6cbdc` decorative, `#b3261e` refusal kept from
 * before `A125`, and the `#b8480d` action colour on the checkbox. What is shared with
 * `src/options/` is the palette, the `13px` type scale and the `16px` inner padding; the
 * width is not, and this component **owns its own** `320px` (rulings `A141`, `A147`) — a
 * toolbar popup against the settings `360px` dialog box. No colour is invented here, and
 * no mascot is drawn (`A142`).
 *
 * **The width is this component's** (ruling `A147`, task `t14-04`, reverting the geometry
 * half of `A145`). `A145` moved the `320px` with the surface and put `width: 100%` on the
 * document box; in a popup that percentage resolves against a narrow initial containing
 * block, so the surface collapsed to `100px` and the title, the notice and the empty state
 * each wrapped to three lines (measured on the reader's screenshot
 * `test_img/…224902.png`). The old `320px` was doing real work, so it comes back here, and
 * `body` declares no width at all: a block box with `width: auto` and `margin: 0` already
 * fills the panel, which is why the cream reaches both edges without a geometry
 * declaration on the document.
 *
 * **The document box paints; it does not shape** (rulings `A146`, `A147`, superseding
 * `A145`). `src/popup/index.html`'s one style block gives `body` the `#fdf7ee` fill and
 * `margin: 0` and nothing else — no `border-radius`, no `overflow: hidden`, no width, no
 * `min-height`. `A145`'s rounded document box is **withdrawn with a measurement**: the
 * reader's screenshot shows square corners at `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)`
 * and no anti-aliased step at `(97,73)`, `(98,74)`, `(99,75)`, with the window box (`108px`)
 * wider than the surface (`100px`) — Chrome draws a popup window as a rectangle and does
 * not clip the document to a `border-radius`, so **no rounding is possible** in an MV3
 * popup (`A146`). The popup ships as a **cream rectangle that fills the window**. The paint
 * still lives in exactly one place — the document — so there is no `background` here and
 * none on `:host`; the component is content inside a painted box.
 *
 * **The card carries the frame, the document does not** (ruling `A148`, task `t14-04`,
 * reversing the `A144`/`A145`/`A147` family's «no frame» half). `A144` removed the card's
 * `1px solid #a6cbdc` frame because the reader read it as «прямой угол с чёрной рамкой»
 * against the window's own square, dark edge; the reader then asked for it back, **thicker**
 * («верни скруглённую рамку, но сделай её потолще чем была»). So `.popup` draws
 * `border: 2px solid #a6cbdc` with `border-radius: 12px` — the `A125` decorative role, a
 * width the ruling leaves to the PM's default and this file records. The radius is a
 * **drawn frame inside a square window**: it is not an attempt to round the window, because
 * `A146` measured that a popup window cannot be rounded at all. The settings window keeps
 * its own `1px` frame as the deliberate other case, and `src/popup/index.html` still draws
 * **no** frame — the document only paints. The row separator and the checkbox keep their own
 * `#a6cbdc` borders: they are controls inside the surface, not its frame (`border: 0` on a
 * button is the removal of a painted edge, not the declaration of one).
 *
 * **The card is inset `4px` from the window edge** (ruling `A149`, task `t14-05`). Run 13
 * confirmed the frame, its thickness, its radius, the width and the edges, and asked for air
 * between the frame and the panel edge: «Можно сделать отступ от края она до линии. где-то
 * 4px» — so `4px` is the reader's number, a value and not a judgement. **The gap is declared
 * on `:host`**, the box that contains the card, and **not on `body`**: `body` carries the
 * paint and `margin: 0` and nothing else (`A147`), so a `padding` there would be the document
 * claiming a shape the withdrawn-shape pin forbids, and the cream would paint the gap's own
 * band — the frame would read as sitting inside a coloured border. On `:host` the gap shows
 * the **`body` cream**, so the frame floats on the same surface rather than on a white band.
 *
 * **The gap is outside the card, so the card does not move** (`S14-38`). `.popup` keeps its
 * `width: 320px`, `box-sizing: border-box`, `border: 2px solid #a6cbdc`,
 * `border-radius: 12px` and `padding: 16px`, the type scale and the ink. The panel is simply
 * `4 + 320 + 4` wide, and that arithmetic is the accepted one, not an accident: putting the
 * gap **inside** the `320px` would need a different ruling and a different card width.
 *
 * The notices of ruling `A83` are rendered **above** the list and the list still
 * renders below them, because stored entries that become invisible are stored entries
 * the reader can no longer delete. The name-required notice is a real `<button>`: it is
 * the control that opens the options page, and it writes nothing.
 *
 * **The list has two halves since `t17-02`** (rulings `A167`, `A168`). The stored
 * `author row`s of `A95`/`A108` are still one row per stored author, and beside them
 * stand one row per author **the page** answered with: the notes the sync server
 * returned, which live in the content script's memory and never in
 * `chrome.storage.local` (`A163`). The two halves are one list and one format — the same
 * label, the same checkbox, the same icon-only `Удалить` — because the reader is looking
 * at one page, and the difference between them is **where a control writes**, which is a
 * decision of the service and not of this template. A foreign row's checkbox hides that
 * author's highlights for this tab and its `Удалить` drops them from this page's view for
 * this tab (`A168`); the server is not called by either. The template says none of that
 * in words: a second Russian sentence for a foreign row is what `A82` forbids, so the row
 * keeps the `FOREIGN_ROW_CLASS` marker it always carried.
 *
 * **The failure line of `A169` is rendered here and decided elsewhere.** The page owns
 * the automatic load, so the popup learns the outcome from its answer and renders
 * «Не удалось связаться с сервером синхронизации» above the list that still renders
 * (`A164`, `A83`). That string shipped in `t17-01` and nothing read it until this task;
 * the notice map of `src/popup/text.ts` is its one address.
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
        } @else if (notice === 'sync_failed') {
          <p class="notice">{{ noticeText(notice) }}</p>
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
              @if (showsSyncButton(row)) {
                <button
                  class="sync"
                  type="button"
                  [class]="syncButtonClass()"
                  [disabled]="syncState() === 'running'"
                  [attr.aria-label]="syncLabel"
                  [attr.title]="syncLabel"
                  (click)="onSync(row.authorName)"
                >
                  <svg
                    [attr.width]="syncIconPx"
                    [attr.height]="syncIconPx"
                    [attr.viewBox]="syncIconViewBox"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M20 12 A8 8 0 1 1 17.66 6.34" />
                    <path d="M20 4 L20 8 L16 8" />
                    <path d="M4 12 A8 8 0 1 1 6.34 17.66" />
                    <path d="M4 20 L4 16 L8 16" />
                  </svg>
                </button>
              }
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
      padding: 4px;
    }

    .popup {
      box-sizing: border-box;
      width: 320px;
      border: 2px solid #a6cbdc;
      border-radius: 12px;
      padding: 16px;
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

    /* Stage 17 (A162): the same box as the delete control beside it; the three states
       are colour and motion only, so no text and no size changes between them. */
    .sync {
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
      color: #1e7b3c;
      cursor: pointer;
    }

    .sync svg {
      display: block;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
    }

    .sync--running svg {
      animation: sync-spin 0.9s linear infinite;
    }

    .sync--error {
      color: #b3261e;
    }

    @keyframes sync-spin {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(360deg);
      }
    }

    .empty {
      margin: 0;
      color: #7b6a55;
    }
  `,
})
export class PopupComponent implements OnInit {
  private readonly service = new PageEntriesService(inject(PAGE_ENTRIES_SOURCE));
  private readonly sync = new PopupSyncPress(inject(SYNC_PRESS_SOURCE));

  /**
   * The destroy hook, read **in the injection context** and not in `ngOnInit`.
   *
   * `inject()` is legal only while Angular builds the component — a field initializer runs
   * there, an `ngOnInit` body does not. Calling it from `ngOnInit` threw `NG0203` during
   * the popup's own boot, which left the component half-built: `<h1>` rendered with no
   * text and the list with no rows, because the throw happened before the view settled.
   * The rule is the framework's and it is absolute: the hook is read here, and `ngOnInit`
   * only uses it.
   */
  private readonly destroyRef = inject(DestroyRef);

  /** The whole popup state, as the core reads answered for the active tab. */
  readonly view = signal<PageEntriesView>({
    rows: [],
    notices: [],
    syncEnabled: false,
    syncFailed: false,
  });

  readonly title: string = POPUP_STRINGS.title;
  readonly emptyState: string = POPUP_STRINGS.emptyState;
  readonly deleteLabel: string = POPUP_STRINGS.delete;
  /** Accessible name of the sync control: its `aria-label` and its `title` (`A162`). */
  readonly syncLabel: string = POPUP_STRINGS.sync;

  /**
   * The state of the one sync button this popup can show (ruling `A162`).
   *
   * One signal, because `A161` allows at most one such button — the current author's
   * row. `idle` is the static green arrows, `running` spins them while the request
   * stands, and `error` is the same arrows in red, **driven by the answer of the
   * request and by nothing else**. There is no timer in this component: a success sets
   * `idle`, a failure sets `error`, and `error` stays until the next press.
   */
  readonly syncState = signal<SyncButtonState>('idle');

  /** The glyph's box and coordinate space, as attributes (the delete glyph's idiom). */
  readonly syncIconPx: string = String(POPUP_SYNC_ICON_PX);
  readonly syncIconViewBox: string = POPUP_DELETE_ICON_VIEW_BOX;

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
    // Ruling `A183`: the popup asks once, and then **listens**. The page announces when
    // its foreign list moved — which is what happens when its automatic load lands after
    // that one question — so a late list still reaches a popup that is already open. No
    // poll, no timer and no second question of this component's own: the announcement is
    // the trigger and the service decides what to render.
    //
    // **The subscription comes first, and the order is the whole point.** The page answers
    // the question in the same turn and starts its server load right after it, so its
    // announcement can arrive while the first view is still being built. Subscribing after
    // `open()` — which is what this method did when it shipped — left a window in which
    // the announcement reached a popup that was not listening yet, and the foreign rows it
    // carried were lost: the popup rendered «нет записей» and never re-rendered.
    const stop = this.service.watchPage((view: PageEntriesView): void => {
      this.view.set(view);
    });
    this.destroyRef.onDestroy(stop);
    void this.apply(this.service.open());
  }

  /** Wording of one notice line, from the single constants module. */
  noticeText(code: PopupNoticeCode): string {
    return popupNoticeText(code);
  }

  /**
   * Whether one row carries the sync button: the page must have somewhere to call
   * (`view().syncEnabled`, ruling `A166`) and the row must be the reader's own (ruling
   * `A161`). A foreign row keeps only its delete control.
   */
  showsSyncButton(row: AuthorRowView): boolean {
    return this.view().syncEnabled && row.isOwn;
  }

  /** The class of that button: its shape, plus one modifier for the state. */
  syncButtonClass(): string {
    const state = this.syncState();
    return state === 'idle' ? 'sync' : `sync sync--${state}`;
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
   * The aggregate checkbox: **one** call through the service for the whole row, then a
   * fresh read (rulings `A1`, `A50`, `A108`). The call is the service's, and the service
   * decides whether that call is the one core write or the one message to the page
   * (`A168`): this handler passes the row's own `authorName` and holds no branch.
   */
  onToggle(authorName: string, event: Event): void {
    const box = event.target;
    if (!(box instanceof HTMLInputElement)) {
      return;
    }
    void this.apply(this.service.setVisibilityForAuthor(authorName, box.checked));
  }

  /**
   * The delete control of a row: **one** call through the service, for every note of
   * this author on this page, own, stored-foreign or page-foreign (rulings `A25`,
   * `A108`, `A168`). Ruling `A143` moved the word `Удалить` from this control's visible
   * text to its `aria-label` and `title`; the call below is exactly the one it made
   * before, and which of the two destinations it reaches is the service's answer.
   */
  onRemove(authorName: string): void {
    void this.apply(this.service.removeAllOfAuthor(authorName));
  }

  /** Ruling `A83`: the name-required line is the navigation to the options page. */
  openSettings(): void {
    this.service.openSettings();
  }

  /**
   * One press of the sync button (rulings `A161`, `A162`).
   *
   * `running` before the call, and the answer decides between `idle` and `error`. The
   * call is the service's — one core POST carrying the current author's notes of this
   * page — so this handler holds no network, no payload and no code-to-wording branch.
   */
  onSync(authorName: string): void {
    if (this.syncState() === 'running') {
      return;
    }
    this.syncState.set('running');
    void this.press(authorName);
  }

  private async press(authorName: string): Promise<void> {
    const result = await this.sync.press(authorName);
    // `nothin_to_send` is a success with nothing to say: an author with no note of
    // their own on this page has no failure to report, so the arrows go back to green.
    this.syncState.set(result.ok || result.code === 'nothin_to_send' ? 'idle' : 'error');
  }

  /** One place moves the signal, so the list is always what the store just said. */
  private async apply(next: Promise<PageEntriesView>): Promise<void> {
    this.view.set(await next);
  }
}
