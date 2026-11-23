import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, inject, signal } from '@angular/core';

import type { AuthorPageRow } from '../core/author-pages';
import { authorPagesOf } from '../core/author-pages';
import { deleteEntriesOfAuthor } from '../core/entry-store-write';
import { loadSettings } from '../core/settings-store';
import { validateAuthorName } from '../core/entry-rules';
import type { SyncTarget } from '../core/sync-settings';
import { syncTargetOf } from '../core/sync-settings';
import type { SyncTransport } from '../core/sync-client';
import { deleteRemoteAuthorNotes } from '../core/sync-client';
import type { StoragePort } from '../core/storage-port';
import { createChromeLocalStoragePort } from '../content/store/chrome-storage-port';
import { ALL_NOTES_STRINGS, noteCountText, pageLabelText, rowDateText } from './text';
import { createAllNotesSyncTransport } from './fetch-transport';

/**
 * What the «Мои заметки» page runs on: the one storage port adapter and the page's
 * `fetch`. A token with a root factory, so the shipped page needs no wiring step and
 * a test can replace the whole source without touching the component — the same
 * shape the popup's `PAGE_ENTRIES_SOURCE` ships (`A189`).
 *
 * `createChromeLocalStoragePort()` is the only storage surface of this layer, and
 * the page names no storage key and calls no storage API of its own.
 */
export interface AllNotesSource {
  readonly port: StoragePort;
  readonly transport: SyncTransport;
}

export const ALL_NOTES_SOURCE = new InjectionToken<AllNotesSource>('inlinenotes:all-notes-source', {
  providedIn: 'root',
  factory: (): AllNotesSource => ({
    port: createChromeLocalStoragePort(),
    transport: createAllNotesSyncTransport(),
  }),
});

/** One rendered row: the core answer plus the label strings the template needs. */
export interface AllNotesRow {
  readonly pageKey: string;
  readonly label: string;
  readonly count: string;
  readonly date: string;
}

/** The view the template renders: rows or one notice, never both (`A189`). */
export interface AllNotesView {
  readonly rows: readonly AllNotesRow[];
  readonly notice: string | null;
  readonly refusal: string | null;
}

/**
 * The «Мои заметки» page (ruling `A189`): one `page row` per page that holds at
 * least one note of the current author, fresh first, each row a link to the page
 * and the icon-only delete control at its end.
 *
 * The row delete is the `A192` order: one local core write first, one server call
 * second, and a server failure is a non-blocking notice the local deletion stands
 * behind. The list re-reads after every delete.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="notes">
      <h1 class="title">{{ title }}</h1>

      @if (refusal() !== null) {
        <p class="message message--refusal">{{ refusal() }}</p>
      }

      @if (notice() !== null) {
        <p class="message">{{ notice() }}</p>
      }

      @if (rows().length === 0 && notice() === null && refusal() === null) {
        <p class="message">{{ empty }}</p>
      }

      @if (rows().length !== 0) {
        <ul class="list">
          @for (row of rows(); track row.pageKey) {
            <li class="row">
              <a class="link" [href]="row.pageKey" target="_blank" rel="noreferrer">{{ row.label }}</a>
              <span class="meta">{{ row.count }} · {{ row.date }}</span>
              <button
                class="delete"
                type="button"
                [attr.aria-label]="deleteLabel"
                [attr.title]="deleteLabel"
                (click)="onDelete(row.pageKey)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
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
      min-height: 100vh;
      padding: 16px;
      background: #fdf7ee;
      font: 13px/1.45 system-ui, sans-serif;
      color: #1b2a33;
    }

    .notes {
      max-width: 480px;
      margin: 0 auto;
    }

    .title {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
    }

    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-top: 1px solid #a6cbdc;
    }

    .row:first-child {
      border-top: 0;
    }

    .link {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
    }

    .meta {
      flex: none;
      color: #7b6a55;
      white-space: nowrap;
    }

    .message {
      margin: 0 0 12px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #eef4f7;
    }

    .message--refusal {
      color: #b3261e;
    }

    .delete {
      display: inline-flex;
      flex: none;
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
  `,
})
export class AllNotesComponent implements OnInit {
  private readonly source = inject(ALL_NOTES_SOURCE);

  /** The rows as they stand, or the one notice state. */
  readonly rows = signal<readonly AllNotesRow[]>([]);
  readonly notice = signal<string | null>(null);
  readonly refusal = signal<string | null>(null);

  readonly title = ALL_NOTES_STRINGS.title;
  readonly empty = ALL_NOTES_STRINGS.empty;
  readonly deleteLabel = ALL_NOTES_STRINGS.delete;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  /**
   * One read: the settings name decides whose notes the list answers with (`A191`),
   * the core projection answers the rows, and the template renders the view.
   */
  private async refresh(): Promise<void> {
    const settings = await loadSettings(this.source.port);
    const name = validateAuthorName(settings.name);
    if (!name.ok) {
      this.rows.set([]);
      this.notice.set(ALL_NOTES_STRINGS.nameRequired);
      this.refusal.set(null);
      return;
    }
    const answer = await authorPagesOf(this.source.port, name.normalized);
    if (!answer.ok) {
      this.rows.set([]);
      this.notice.set(null);
      this.refusal.set(ALL_NOTES_STRINGS.listUnavailable);
      return;
    }
    this.rows.set(answer.rows.map(rowOf));
    this.notice.set(null);
    this.refusal.set(null);
  }

  /**
   * The `A192` order, exactly as the editor's one-note delete ships it: the local
   * core write first — the same `deleteEntriesOfAuthor` the popup's own row makes —
   * then, with synchronization on and a usable address, one `DELETE` of the author
   * set on the server. A failed server call never undoes the local deletion; it is
   * the non-blocking notice, until the next successful action.
   */
  async onDelete(pageKey: string): Promise<void> {
    const settings = await loadSettings(this.source.port);
    const name = validateAuthorName(settings.name);
    if (!name.ok) {
      return;
    }
    const local = await deleteEntriesOfAuthor(this.source.port, {
      url: pageKey,
      authorName: name.normalized,
    });
    if (!local.ok) {
      this.refusal.set(ALL_NOTES_STRINGS.listUnavailable);
      await this.refresh();
      return;
    }
    const target: SyncTarget | null = syncTargetOf(settings);
    let serverFailed = false;
    if (target !== null) {
      const remote = await deleteRemoteAuthorNotes(
        this.source.transport,
        target,
        pageKey,
        name.normalized,
      );
      serverFailed = !remote.ok;
    }
    await this.refresh();
    // The refusal is set **after** the re-read (`A192`): the fresh list must not
    // clear what the failed server call has to say, and the notice stands until
    // the next successful action clears it here.
    if (serverFailed) {
      this.refusal.set(ALL_NOTES_STRINGS.serverDeleteFailed);
    }
  }
}

/** The template's row shape from the core answer. */
function rowOf(row: AuthorPageRow): AllNotesRow {
  return {
    pageKey: row.pageKey,
    label: row.title ?? pageLabelText(row.pageKey),
    count: noteCountText(row.count),
    date: rowDateText(row.latest),
  };
}
