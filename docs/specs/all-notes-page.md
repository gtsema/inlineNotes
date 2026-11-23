# all-notes-page

## Purpose / Goal

Give the reader one place that answers "on which pages do my notes live": an extension page listing every page that holds at least one note of the current author, with a count, the latest date, and the same local-and-server delete the popup's own row carries.

## Scope

In scope: the `notes.html` extension page and its Angular surface (`src/all-notes/`), the stored `title` field of an entry, the core list builder over the page index, the per-row delete (local write plus the server's author delete), the popup and options entry points into the page, and the build tooling for the third Angular surface.

Out of scope: any search, filter or "notes by author other than mine" view; editing or showing note bodies on this surface (the popup and the page editor keep that); any change under `server/`; the sync server's `all-pages` endpoint (still called by nothing).

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `all-notes page` | «Мои заметки» | the `notes.html` extension page opened in a tab (`A189`) |
| `page row` | a line of the list | one page that holds at least one note of the current author: link + count + date + one `Удалить` control |
| `stored title` | — | the optional `title` field of an `Entry`: the page's `document.title`, trimmed, at most 100 code points, captured at the create moment (`A190`); old entries and server rows decode without it and the row falls back to the page key |
| `author pages list` | — | the core read (`authorPagesOf`) that walks the `pages:v1` index and returns one row per page holding at least one own entry (`A191`) |
| `row delete` | «Удалить» (`aria-label` and `title`, icon-only like the popup's) | removes every note of the current author on that page — locally through core `deleteEntriesOfAuthor`, and on the server through `DELETE /notes/page/{page_id}/author/{author_id}` when synchronization is on (`A192`) |

## Flow / Sequence

1. The reader opens the popup or the settings page and presses the entry point (the «Все заметки» button in the popup, the link under the settings list). A tab opens `notes.html` (`A189`).
2. The page reads the settings name and the `author pages list`; every page with at least one note of the reader is one `page row`, sorted by the latest `updatedAt` of the page, fresh first.
3. A row is a link (`<a href=pageKey target="_blank">`) the reader follows to the article, the count «N» with Russian plural wording, the date of the latest note, and the icon-only delete control at the end of the row — the popup trash glyph, `aria-label` and `title` «Удалить».
4. A delete press runs the local write first and the server call second, exactly as the editor's one-note delete does (`A182`'s order, generalized to the author set): core `deleteEntriesOfAuthor` for that page and author, then — only when `syncTargetOf` answers a target — one `DELETE /notes/page/{pageKey}/author/{authorName}`. The server answer reports the removed rows; a failure answers a non-blocking notice and the local deletion stands.
5. The page re-reads the list after every delete; the last row of the author drops the slot, and a list that becomes empty shows the empty state «Нет заметок».

## Rules / Semantics

### The page is a tab, not a dialog (ruling `A189`)

- The page is a plain extension page opened with `chrome.tabs.create({ url: chrome.runtime.getURL('notes.html') })`. The manifest gains **no** entry for it: an extension page needs no registration, and `options_ui` stays the settings dialog. The `tabs` permission already ships.
- The surface reuses the `A125` palette and the settings card's drawn form; the page is a full tab, so the card is a centered column (`max-width: 480px`) and the page scrolls when the list is long. No new colour literal, no new Russian string outside `src/all-notes/text.ts`.

### The stored title (ruling `A190`)

- `Entry` gains an **optional** `title?: string`. `createEntryOnPage` stores the page's `document.title`, trimmed, at most 100 code points, as given by the content layer at the save moment; an empty or absent title stores no field, so a record of the old shape is byte-identical to what the previous version wrote.
- `decodeEntry` keeps the field when it is a non-empty string and drops it otherwise: an old record, a damaged one and a server row (the wire shape has no title) decode without it, and nothing is guessed.
- The field is display metadata only: it changes no identity, no caps, no anchor, no edit right, and it is never sent to the server (`sync-client`'s outgoing shape is unchanged).
- Renaming the author, editing the comment, showing and hiding leave the title untouched; a page the reader never creates on again simply shows its URL.

### The author pages list (ruling `A191`)

- Core `authorPagesOf(port, authorName)` walks the `pages:v1` index once, reads every listed slot through the same `loadEntries` the popup uses, filters by core `isSameAuthor` and answers one `AuthorPageRow` per page with at least one own entry: `{ pageKey, count, latest, title }`, where `latest` is the newest `updatedAt` on that page and `title` is the first non-empty stored title of the page's own entries (the row then falls back to `null`).
- Rows are sorted by `latest`, fresh first. An index the read guard refuses (`layout_version`, `index_malformed`, `storage_unavailable`) answers `{ ok: false, code }` — the page shows its notice and keeps nothing painted.
- No write, no cap check, no network: the list is a read-side projection, the same posture the popup's author grouping has.

### The row delete (ruling `A192`)

- One press is **one local write and at most one server call**, in that order: the same order the editor's one-note delete ships (`A182`), generalized from one note to the author set of one page. The local half is core `deleteEntriesOfAuthor` — the same call the popup's own row makes, with its write policy, carry-through and slot-drop — and it runs whatever the synchronization state is.
- The server half is core `deleteRemoteAuthorNotes`: one `DELETE /notes/page/{pageKey}/author/{authorName}`, the author-scoped endpoint the server spec already owns (`A156`), only when `syncTargetOf` answers a target. `{"deleted": N}` is the answer shape; `N = 0` is a success (the server holds no copy — the same `A181` posture as the one-note delete).
- A failed server call never undoes the local deletion: the row leaves the list, and the page shows the non-blocking notice «Не удалось удалить заметки на сервере» until the next successful action. No retry, no modal (`A164` posture).
- The button is the popup trash glyph re-declared in this surface (the layers do not share a glyph class, `S14-4` precedent), `aria-label` and `title` «Удалить», and the deletion has no confirmation step — the same ruling `A44` posture the page and popup deletes have.
- The delete names the **current author's** notes of the page: the row exists only because the reader has notes there, so `authorName` is always the settings name of the caller.

## Edge Cases

- **No name in settings.** The page shows the notice «Укажите имя в настройках» above an empty list; every page's notes exist but none is the reader's to claim.
- **Empty index, or every page has no own notes.** The empty state «Нет заметок».
- **An unreadable index.** The notice names the state; no rows, no retry.
- **A page whose slot is unreadable but listed.** Skipped: the row costs one entry the reader does not see, and the deletion of it answers through `deleteEntriesOfAuthor`'s own refusal — the same partial-sweep honesty the rename sweep has (`A173`).
- **Synchronization off.** The delete is local-only, no server call, and the page states nothing: the same absence-as-designed posture `A166` has.
- **A server failure at the delete.** Local deletion stands, notice shows, no retry.
- **The reader's own note that the server also holds.** Both copies go: the local write removes the stored rows, the server call removes the rows by the author path.

## Acceptance Criteria

1. (`A189`) The popup renders the entry point «Все заметки», and pressing it opens `notes.html` in a new tab; the settings page carries the second entry point; the manifest is unchanged.
2. (`A191`) The page lists one `page row` per page holding at least one note of the current author, sorted by the latest `updatedAt`, fresh first; each row shows the page (stored title, falling back to the page key), the count with Russian plural wording, and the latest date.
3. (`A190`) A create on a page with a title stores it (trimmed, ≤100 code points); an entry created by an older build or by the server decodes without it and the row falls back to the page key; no outgoing payload gains a field.
4. (`A192`) The row's icon-only `Удалить` removes every note of the current author on that page locally through exactly one core call, then — with synchronization on and a usable address — sends exactly one `DELETE /notes/page/{page_id}/author/{author_id}`; with synchronization off no request is made.
5. (`A192`) A failed server delete leaves the local deletion in place, re-reads the list, and shows the non-blocking notice; a successful one re-reads the list with the page gone.
6. The page shows «Нет заметок» when nothing is the reader's, and the «Укажите имя в настройках» notice when the name is missing or refused.
7. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`, `node scripts/check-agent-config.mjs`; `fetch` appears in exactly the three transport adapters (the two shipped ones plus `src/all-notes/fetch-transport.ts`).

### Test mapping

| AC | Test |
|---|---|
| 1 | `tests/popup-entry-list.spec.ts` (entry point renders and opens); `tests/all-notes-page.spec.ts` |
| 2 | `tests/core-author-pages.spec.ts`; `tests/all-notes-page.spec.ts` |
| 3 | `tests/entry-model.spec.ts`; `tests/core-entry-decode.spec.ts`; `tests/content-create-card-controller.spec.ts` (title captured at save) |
| 4, 5 | `tests/core-sync-client.spec.ts` (author delete URL and verb); `tests/all-notes-page.spec.ts` (order, failure notice, sync-off) |
| 6 | `tests/all-notes-page.spec.ts` |
| 7 | the gates themselves; `tests/toolchain-contract.spec.ts` (three transport adapters) |
