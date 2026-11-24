# sync-integration

## Purpose / Goal

Connect the extension to the sync server of `docs/specs/sync-server.md`: a reader turns synchronization on in the options page, the page then shows the other readers' notes on the article it opens, and the popup pushes the reader's own notes of that page back to the server with one press of a button.

## Scope

In scope: the two settings fields that carry the feature, the server address rule, the popup's sync button and its three states, the automatic load on page open, the background broker that carries the page's sync calls (`A200`), the adoption of the reader's own notes the load returns (`A197`), the foreign notes as memory-only data, the local-only delete of a foreign row, and the failure behaviour of every network call.

Out of scope: any change under `server/` (the server is frozen for this stage); editing or deleting a foreign note on the server; conflict resolution beyond the server's own upsert; a "my notes across pages" view (the server's `all-pages` endpoint is called by nothing yet); authentication of any kind; a periodic or background synchronization (there is none: a request happens on page open and on a press).

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `settings record` | «Настройки» | the `settings:v1` value: `{ name, serverUrl?, syncEnabled? }` (ruling `A160`) |
| `server address` | «Адрес сервера» | `http://host[:port]` or `https://host[:port]`, stored in `serverUrl`, `''` meaning "not configured" |
| `synchronization switch` | «Синхронизация» | the settings checkbox, stored as `syncEnabled`, **absent means off** |
| `sync target` | — | the parsed address the extension may call, `null` when the switch is off or the address is unusable (`A166`) |
| `sync button` | «Синхронизировать» (`aria-label` and `title`) | the icon-only control in the current author's popup row (`A161`, `A162`) |
| `idle state` | — | the sync button's static green arrows |
| `running state` | — | the same arrows spinning while the request stands |
| `error state` | — | the same arrows in red, kept until the next press |
| `sync press` | — | one `POST /notes/page/{page_id}` carrying the current author's notes (`A161`) |
| `automatic load` | — | one `GET /notes/page/{page_id}` per page key per document, at page open (`A163`) |
| `foreign note` | — | a note the server returned whose `authorName` is not the reader's; it lives in the document's memory only |
| `own note` | «Вы» | a note whose author is the reader, by core `isSameAuthor` (`A99`) |
| `memory only` | — | never written to `chrome.storage.local`, never sent in a payload (a **foreign** note and the hidden flag: `A163`, `A184`) |
| `adoption` | — | writing the server's copy of the reader's own note into `chrome.storage.local` at load, so a note created on another machine becomes a stored note here (`A197`); merge rule `A198`, write rule `A199` |
| `background broker` | — | the MV3 service worker that performs the content script's sync calls, because an `http://` fetch from an `https://` article is mixed content and the browser blocks it (`A200`); the page sends it a message and the broker runs the one `fetch` (`A201`, `A202`) |
| `hidden author flag` | — | a stored `{ pageKey, authorName }` pair saying the popup checkbox of that foreign author was last pressed to hidden on that page; keyed and applied by `A184` |
| `local-only delete` | «Удалить» | removing a foreign author's row from view on this page without calling the server (answer 5) |
| `non-blocking failure notice` | «Не удалось связаться с сервером синхронизации» | the ruling `A164` line: the rows stay, nothing is retried, no modal appears |
| `no request rule` | — | switch off **or** empty address means zero network calls and no sync button (`A166`) |
| `rename sweep` | — | the local deletion of the previous name's notes on every page when the settings name changes (`A173`); it calls no server |


## Flow / Sequence

1. **Configure.** The reader opens the options window, types `http://192.168.0.10:8080` in the `server address` field, leaves it, and ticks `synchronization switch`. The address is validated first (`A165`); the record is written once per control, beside the name.
2. **Open a page.** The content script paints the stored notes of the page exactly as before, and then, once, asks the server for the page's notes by the `page key` the paint pass resolved. With the switch off or no address, no request is made at all.
3. **Show the answer.** The rows that come back are decoded into entries. The reader's own rows are **adopted** into `chrome.storage.local` first (the store of a second machine is empty, so "already there" is not true; `A197`-`A199`), the rest are held in memory, and the page repaints so both reach the screen.
4. **Press sync.** In the popup, the reader's own row carries the sync button beside the delete button. A press turns the arrows green-spinning, sends one `POST` with that author's notes of this page, and answers with green-static (success) or red (failure).
5. **Read a foreign note.** Hovering a foreign note's highlight shows the usual tooltip, whose header prints the author's stored name **in that author's palette colour**, and whose body is the stored comment. Clicking it opens no editor: a foreign note is read-only.
6. **Hide or remove a foreign row.** The popup's checkbox hides the foreign author's highlights on this page (in memory, and the hidden state of that author is persisted by `A184`); `Удалить` removes the author's rows from this page's view and clears that author's persisted hidden state. Neither calls the server.
7. **Reload.** The memory is gone, the request is made again, and the foreign notes come back as the server holds them — except an author whose `hidden author flag` is stored, whose notes load hidden (`A184`).

## Rules / Semantics

### The settings record (ruling `A160`)

- `settings:v1` is `{ name: string, serverUrl?: string, syncEnabled?: boolean }`.
- Both new fields are **optional**. A record written by the previous version (`{ name }`) loads with `serverUrl: ''` and `syncEnabled: false`; the author name is never lost, and a name that the author-name rule refuses keeps its existing `name_required` code.
- An unusable record (absent, `null`, an array, a primitive, a `name` that is not a string) is still `settings_malformed` with an empty name **and** the two defaults. A record whose name decodes but the rule refuses (`name_required`) keeps the two sync fields: a damaged name must not reset the reader's switch.
- A value that is not exactly `true` for `syncEnabled` reads as `false`; a non-string `serverUrl` reads as `''`; a string is trimmed and stored trimmed.
- A write omits a field that carries its default (`''`, `false`), so a record the reader never configured is byte-identical to what the previous version wrote.
- `saveSettings` takes the two fields as **optional inputs**. A field the caller does not send keeps the stored value: saving a name from the options page cannot erase a configured server, and the switch cannot be flipped by a name save. When a field is carried, the save is preceded by one guarded read; a read that throws answers `unavailable` and writes nothing, because "I could not read the switch" is not "the switch is off".

### The server address (ruling `A165`)

- Accepted: `http://host[:port]` and `https://host[:port]`, after trimming. The stored form is `URL.origin` — no trailing slash, no default port spelled out twice.
- Refused, each with its own machine code and its own Russian sentence at the options page (`server_invalid`, `server_scheme`, `server_shape`): a value that is not a URL; a scheme other than `http:`/`https:` (which is also what `localhost:8080` parses as, since `localhost:` is read as a scheme); a path, a query, a fragment, credentials, or no host.
- A refused address is **not written**: the record stays byte-identical, the typed value stays in the field, and the message names what to change.
- An empty or whitespace-only value is **valid** and means "not configured": clearing the field is how the reader turns synchronization off without touching the switch.

### The no-request rule (ruling `A166`)

- Synchronization is on exactly when `syncEnabled` is `true` **and** the address parses to a non-empty origin. That answer is core `syncTargetOf`, and it is the only answer either half consults.
- With synchronization off: no automatic load, no request from a press, and **no sync button rendered at all** — the feature reads as absent, not as broken.
- The two halves ask the same function, so "the button is visible but does nothing" and "the page loads while the button is hidden" cannot both be true.

### What a press sends (ruling `A161`)

- The button exists only in the row whose `authorName` equals the reader's (`isSameAuthor`), and only when the target is not `null`. A foreign row keeps only its delete control.
- One press is one `POST /notes/page/{page_id}` with body `{ "author_id": <the settings name>, "notes": [...] }`, where each note is the server's four-field `NoteInput` (see "Wire shape").
- `notes` holds **only** the current author's entries on this page, filtered by core `isSameAuthor` and ordered by `sortByCreatedAtAsc`. Foreign notes already in memory are never part of a payload, and an author with no own note on the page sends nothing at all (the button returns to idle without a request).
- The notes are read from the store at the moment of the press, not from the popup's rendered view: a press sends what the store holds now.
- Nothing is written to `chrome.storage.local` by a press, and no message is sent to the page (`A50` keeps the storage write the only notification channel).

### The three states (ruling `A162`)

| State | Appearance |
|---|---|
| `idle` | green circular arrows (`#1e7b3c`), static |
| `running` | the same arrows spinning (`@keyframes sync-spin`, `0.9s linear infinite`), the control disabled while it stands |
| `error` | the same arrows in the surface's refusal ink (`#b3261e`) |

- The glyph is an inline `<svg>` with `stroke="currentColor"`, `16px` inside a `24px` box — the delete button's own numbers, because `A162` asks for the same size.
- The button carries **no visible text**; its `aria-label` and `title` are «Синхронизировать», and they do not change with the state (the state is visual only).
- The state follows the **answer of the request** and nothing else: success sets `idle`, a failure sets `error`, and `error` stays until the next press. There is no timer, no auto-reset and no `setTimeout` anywhere in the popup.
- A press with nothing to send (`nothin_to_send`) and a press whose switch has been turned off in the meantime (`sync_off`) both return the arrows to `idle`: neither is a server failure the reader has to fix.

### The automatic load (ruling `A163`, `A164`)

- One request per `page key` per document, made **after** the first paint pass has resolved that key, so the stored notes are on screen whether or not the server answers.
- The key asked for is the key the paint pass resolved — the same one the stored notes live under, `origin + pathname` fallback included.
- A same-document navigation (`A59`) or a storage write (the settings key included) re-runs the pass and then the question; a key already asked about starts no second request.
- The response is `{ "notes": [...] }`. Each row is mapped at this boundary (`src/core/sync-client.ts`) into the stored entry shape; a row whose fields are not all readable as an entry is **skipped**, never guessed at.
- The reader's own notes in the answer are **adopted** into the store before memory (`A197`) and then dropped from memory: the store paints them, and a second copy in memory would register two highlight names over one span.
- An unreadable body, a non-2xx status, a refused connection, a missing transport or no target are all `{ ok: false, code }` — the loader never rejects.

### Adopting the reader's own notes (rulings `A197`-`A199`)

Before `A197` the extension assumed the reader's own note is always in the local store, so the automatic load dropped the server's copy of it. That is false on a second machine: the store there is empty, and a note written on the first machine stayed invisible. `A197` closes that gap.

- `A197` **Adoption.** A row the automatic load returns whose `authorName` is the reader's (core `isSameAuthor` against the settings name) is **written into `chrome.storage.local`** as a stored entry of this page, through one core write. After that it is an ordinary own note: it is painted, it appears in the popup's `Вы` row and in the «Мои заметки» list, it is editable, and the next press sends it back.
- Adoption is the extension's **one** new writer of own notes from the network. A foreign row is still never written (`A163`).
- The adopted row keeps the server's `id`, `createdAt` and `updatedAt` (the two stamps normalized to the stored shape at the wire boundary, see "Wire shape"), and stores no `title` (the wire has none, `A190`); `visible` is `true`, the store's own default (`A1`).
- A row whose `page_id` is not the asked page key, or that cannot be read as a local entry (an unreadable anchor, an empty comment, a comment over 256 code points), is **skipped**, never guessed at. A row that passes is stored with the **normalized** comment — the same `validateComment` value the create path stores (`inline-comment-model.md` -> "Decode on write"), so adoption can never put an untrimmed or over-cap comment into the store.

- `A198` **The merge rule**, per row, by the server's `(authorName, id)`:
  - the page holds no entry with that id: the row is adopted;
  - the page holds one and its content (`text`, `comment`, `anchor`) equals the row's: nothing is written — a press that only moved the server's `updated_at` must not rewrite the reader's note and its date;
  - the content differs: the newer `updatedAt` wins, the remote copy replaces the local one, and the local `visible` flag is kept, because visibility is the reader's own display flag and the wire has no column for it;
  - a local `updatedAt` that is newer or equal keeps the local copy;
  - the cap is `MAX_ENTRIES_PER_PAGE`, counted the way every other cap counts it (`inline-comment-model.md` -> "Unreadable records": the page's **decodable** stored records, so an undecodable record is ignored here exactly as the create gate ignores it). A merge never deletes a stored entry to make room: new rows are adopted in `createdAt` order, up to the cap, and the rest are skipped (they stay on the server and can be adopted after other notes are deleted).

- `A199` **One commit, best effort.** Adoption is one whole-list write under the existing `pages:v1` policy (`inline-comment-model.md` -> "Index write policy"): the slot lands before the index, and a page left with no entry drops the slot first. A refusal (an unreadable index or slot, an unusable page key, a port that throws) writes nothing, is not retried by this load, and is not reported on the article; the row is simply not in the store this load, and the next load tries again. A refused adoption never blocks the paint, exactly like a failed load (`A164`).

`Assumption:` "content first, then stamps" for an existing entry, the oldest-first cap rule, and "skip a row the local rules refuse" are the PM's least-risky defaults; the reader accepted the newer-`updatedAt` rule without naming any of the three.

### Where the notes live (ruling `A163`)

- The foreign notes are held in a closure inside the content script, for the lifetime of the document. They disappear on reload.
- A **foreign** note is **never** written to `chrome.storage.local`, never appears in a payload, and never reaches the page index. The reader's own notes the server returns are the opposite: they are adopted into the store (`A197`), so the content layer's write imports grow by exactly one module — the adoption caller — while its settings import list keeps its two modules (`tests/content-create-card-boundaries.spec.ts` pins both).
- They are painted by the existing paint pass, in the same pass as the stored notes and against the same page stream (`A29`), with the same anchor resolution, the same `paint name` scheme and the same palette slot per `authorName`.
- A foreign note is therefore **not editable**: the editor opens only from `onEntryClick` of a paint-pass entry whose author is the reader's (`A96`), and a foreign entry is refused there by the existing rule, not by a new one.

### Author colour and the tooltip (answer 4)

- The highlight of a foreign note wears the palette slot of its author's name (`A94`, `A102`), like any entry.
- The tooltip's `ownership header` prints the author's stored name (§ "Own entries and foreign entries … only in the tooltip header" of `content-overlay-ui.md`) and, for a foreign note, prints it **in that author's palette colour**, as an inline style on one span inside the shadow root. The reader's own header keeps the stylesheet's ink.
- The colour is read from the same palette literal the highlight rule writes (`paintColourOfSlot`), so the underline on the page and the name in the tooltip cannot disagree. A slot with no fill answers the empty string, and the header keeps the stylesheet's ink rather than rendering an invalid colour.

### Hiding and deleting a foreign row (answer 5, as amended by ruling `A184`)

- The popup's checkbox of a foreign author hides that author's highlights on this page: the flag lives in the same memory, because a foreign note has no stored `visible` field. A switched-off foreign note is still painted — with its underline and without its fill — so switching it back on is one more pass and no request.
- `Удалить` on a foreign row removes that author's notes from this page's **view**: the memory drops them, the page repaints, and the server is not called.

### The hidden author flag survives a reload (ruling `A184`, task `t18-01`)

Before `A184` a hidden foreign author came back visible on the next page load, because the whole foreign list was memory (`A163`), and the reader had to press the checkbox again on every reload. The note itself is still memory only; what is now persisted is **one flag per foreign author per page**, not the notes:

- The store is one record under the single key `foreign-hidden:v1`: `{ version: 1, pages: Record<pageKey, string[]> }`, where the array holds the author names the reader has hidden on that page. The `pageKey` is the key the paint pass resolved — the same key the automatic load asked about — never an address derived in the content layer. The slot-key machinery of `notes:v1:` is deliberately not reused, because this record needs no per-page key and no index; the page key lives inside the one record verbatim.
- The record lives in `src/core/foreign-hidden-store.ts` and is reached **only through the core API**: `loadHiddenAuthorsOfPage` answers the array for one page (an absent or malformed record answers `[]`, never a throw), and `setForeignAuthorHidden` writes the flag with the same guarded-read shape every other core write uses. A malformed record is overwritten by the next write, not preserved; a read that throws answers `[]` and a write that throws is swallowed by the page, which keeps the in-memory answer it already gave (`A164` posture: the persistence is a best-effort shadow of the memory, never a gate).
- The checkbox press of a foreign row is the only writer through the message path: a press to hidden adds that author to the page's array, a press to visible removes it. The `Удалить` press of a foreign row **removes** the author's flag in the same turn, so the next load shows that author again — deleting is the reader's statement that this author should start over, not a way to keep them hidden.
- The flag is applied where the memory is filled: every `replace` of a load passes the page's stored author names and marks a note whose author is in that list `visible: false` on arrival. First-ever load (empty record) and a load after a `Удалить` therefore load every author visible.
- Own notes are untouched: their visibility is the per-entry stored `visible` (`A1`, `A108`), and this flag is written by the foreign-row message path only.
- The flags of a page with no foreign notes linger and are harmless: nothing reads them until the server returns that author again, and nothing in the reader's view depends on a flag whose author has no notes on the page.
- The note is never written to `chrome.storage.local` by either control; the only write the message path makes is the `A184` author flag.

### A failed load never blocks the page (ruling `A164`)

- The automatic load is fire-and-forget: no `await` holds the paint, no `catch` is needed at the call site, and a failure returns silently.
- No retry loop, no modal, no line on the article.
- The popup states the failure as the non-blocking notice «Не удалось связаться с сервером синхронизации»: above the list, never replacing it (`A83`), and the rows stay exactly as they are.

### A rename is local and calls no server (ruling `A173`)

When the settings name changes, the previous name's notes are deleted from `chrome.storage.local` on every page (`inline-comment-model.md` -> "Rename sweep", `content-overlay-ui.md` -> "Options rename warning"). That deletion is **local only**: the extension sends no request while renaming, and the server keeps the notes it holds until the reader presses the popup's sync button. Two consequences the reader lives with:

- **The server's copy survives the rename.** A later sync of the same page pushes the reader's new name's notes; the old name's notes remain the server's until the server's own retention removes them. Nothing in this extension deletes them.
- **The memory-held foreign notes are dropped.** After a rename the page's foreign list is rebuilt from the next load, because the settings write is the storage change the page reacts to (`A163`).

A transport that records calls sees **zero** calls during a rename: the sweep in `src/core/author-notes.ts` imports no transport and no sync module, and the options page calls neither.

### Where the page's network lives (rulings `A200`-`A202`)

A reader on an `https://` article with an `http://` server address saw
`Mixed Content: … requested an insecure resource …/notes/page/…`: a fetch started by the
content script is a subresource request **of the article's page**, and Chrome refuses an
insecure one there whatever `host_permissions` says. Extension pages are not article
pages, so the popup's press and the «Мои заметки» delete were never affected.

- `A200` **The page's calls go through a background broker.** An MV3 service worker
  (`src/background/service-worker.ts`, declared as `background.service_worker`) performs
  the `fetch`. The content script's transport (`src/content/sync/broker-transport.ts`,
  replacing `fetch-transport.ts`) sends one `chrome.runtime.sendMessage` instead of a
  `fetch`, so neither the automatic load nor the editor's one-note delete depends on the
  article's scheme. The broker is started on demand by the message and keeps no state: it
  reads nothing and remembers nothing, so its termination between calls changes nothing.
- `A201` **The broker builds no URL.** The page still builds the URL in core from
  `settings:v1` (`syncTargetOf` plus `notesPageUrl` / `noteDeleteUrl`); the message carries
  the request (`url`, `method`, headers, body) and the broker runs `fetch` with exactly it.
  The channel is extension-internal — `externally_connectable` is not declared, so no web
  page can send it — and the shipped code still cannot construct a request to an address
  other than the one in settings.
- `A202` **Failure and absence are unchanged.** The broker answers `{ ok, status, body }`;
  a message that cannot be delivered (`chrome.runtime.lastError`, a closed port) becomes
  the same thrown error `fetch` used to raise, so `A164`'s `network` code, the
  non-blocking load and the button's three states behave exactly as before. No timer is
  added anywhere: the message callback is the only wait, exactly as the popped promise was.

### One address, and no other network

- The only network API in the shipped source is `fetch`, in exactly three modules — `src/background/service-worker.ts` for the page's calls (ruling `A200`), `src/popup/sync-transport.ts` for the popup and `src/all-notes/fetch-transport.ts` for the «Мои заметки» page (`A189` of `all-notes-page.md`), the last two because an extension page's document is not the article's, so the mixed-content rule does not reach it. `tests/toolchain-contract.spec.ts` pins that file set.
- No module builds a URL for a caller. The address comes from `settings:v1` through core `syncTargetOf`, and the routes from core `NOTES_PAGE_PATH` and `noteDeleteUrl` / `authorDeleteUrl`; the broker of `A200` executes the request it is handed and builds none, so a request to any other address is not constructible from the shipped code.
- `host_permissions` is the two exact strings `http://*/*` and `https://*/*`, in that order (the brief's answer 8): the server is an arbitrary `host:port` from the reader's settings, so no narrower pattern can name it.

### Wire shape

A stored entry is mapped at the boundary, not in the domain — and the two directions are **different shapes**, because a request and a response are different objects on this server (`sync-server.md` -> `model.NoteInput` versus `model.Note`).

**Sending** — one body per press, `{"author_id": ..., "notes": [...]}`. Each note carries exactly four fields, and the server refuses any other (`400` on an unknown JSON field):

| Stored entry | Request note (`model.NoteInput`) |
|---|---|
| `id` | `id` |
| `text` | `text` |
| `comment` | `comment` |
| `anchor` | `anchor` (opaque JSON, `A154` of the server spec) |
| `pageKey` | **not sent** — it is the `page_id` of the path |
| `authorName` | **not sent per note** — the body's `author_id` names the author once for the whole set |
| `createdAt`, `updatedAt` | **not sent** — the server owns both (`created_at` preserved on update, `updated_at` moved forward) |
| `visible` | **not sent** — the reader's display flag has no column |

**Receiving** — a row of `{"notes": [...]}` carries all eight server fields (`id`, `page_id`, `author_id`, `text`, `comment`, `anchor`, `created_at`, `updated_at`), and the boundary builds an `Entry` from them. A row with a missing or mistyped field is skipped. A note that arrives is visible, because `visible` is the store's own flag and `A1`'s default is "shown".

The two stamps need one mapping: the server writes them with Go's `RFC3339Nano` (up to nine fractional digits, and none at all when they are zero — `2026-11-24T16:15:56.015417Z`), while a stored stamp is `A9`'s `toISOString` shape (`ISO_UTC_TIMESTAMP_PATTERN`, `\.\d{1,3}Z`). The boundary therefore **normalizes** both stamps to that shape with a **pure string transform** — no `Date` and no zone arithmetic, because `src/core/` is the clock-free layer (`A58`) and the server's stamps are always UTC: the fraction keeps its first three digits, a shorter one is padded with zeros, an absent one becomes `000`, and a stamp whose offset is not `Z` or whose shape the transform cannot read makes the row unreadable and it is skipped. Without that mapping an adopted note reaches `decodeEntry`, fails `isTimestamp`, and the whole write refuses with `entry_invalid` — silently, because adoption is best effort (`A199`), which is exactly the defect that made a correct server row invisible on a second machine.

## Edge Cases

- **Server unreachable at page open.** The stored notes are painted, no notice appears on the article, the popup shows the failure line, and the sync button's press is the reader's retry.
- **Server down at a press.** The arrows turn red and stay red until the next press.
- **Empty response.** `{"notes": []}` is a success; the page paints only its stored notes.
- **A row this extension cannot read.** Skipped: no row, no highlight, no error state.
- **Two authors, one note id.** Both are kept: the memory keys rows by author **and** id (`sync-server.md` -> the upsert triple).
- **The reader's name changes while the page stands.** The settings write repaints the page and re-asks the question; a note that just became the reader's own stops being foreign, and a note that stopped being theirs arrives as foreign on the next load.
- **The switch is turned off while the page stands.** The settings write is the trigger: the page drops its foreign notes and repaints, and the popup's next open renders no sync button.
- **The address is cleared while the popup stands.** A press answers `sync_off` and returns to `idle`; nothing was called.
- **A note the reader deleted locally but the server still holds.** With synchronization on the delete also removes it from the server (`A181`, `A192`), so this state means the delete happened while the server was unreachable or the switch was off. The next load then **re-adopts** it as an own note and it reappears, editable — the accepted price of `A197`: with synchronization on, the server is the source of truth for the reader's own notes. A foreign deleted note stays gone from view only until the next load, exactly as before.
- **A page with no store.** No `pageKey`, so no request: the automatic load is skipped rather than sent with an empty key.
- **A foreign note whose text the page has moved.** It is resolved like any entry: unpainted this pass, still in memory, still listed, gone on reload.

## Acceptance Criteria

1. `settings:v1` decodes an old `{ name }` record without loss and yields `syncEnabled: false` and `serverUrl: ''`.
2. A record with a `name` the rule refuses keeps its two sync fields; an undecodable record answers the two defaults.
3. A write omits both fields at their defaults, so the shipped record shape did not grow.
4. `saveSettings` keeps a stored sync field the caller did not send, and reports a guarded read that throws as `unavailable` without writing.
5. `parseServerAddress` accepts `http`/`https` origin-only addresses and refuses every other shape with its own code; an empty value is valid and reads as "not configured".
6. `syncTargetOf` answers `null` when the switch is off, the address is empty, or the address does not parse.
7. The options page renders a server address field and a «Синхронизация» checkbox, both persisted in `settings:v1`, with every Russian string in `src/options/text.ts`.
8. A refused address is not saved, its message is shown, and the stored record is unchanged.
9. The popup renders the sync button in the row of the current author only, and not at all when synchronization is off or the address is empty.
10. The sync button sends `POST /notes/page/{page_id}` with only the current author's entries and `author_id` equal to the settings name.
11. The three states are driven by the request outcome: `running` while it stands, `idle` on success, `error` on failure, with no timer anywhere.
12. On page open, with synchronization on and a valid address, the content script calls `GET /notes/page/{page_id}` once per page key and paints the returned foreign notes beside the stored ones.
13. Foreign notes are never written to `chrome.storage.local` and never appear in a payload; the one stored thing a foreign row writes is the `A184` author flag under `foreign-hidden:v1`.
14. A foreign note is not editable, wears its author's palette colour, and its tooltip names the author in that colour.
15. A foreign row's `Удалить` removes it from view locally without a request, clears that author's `A184` flag, and its checkbox hides it in memory and stores the flag.
19. (`A184`) A foreign author unchecked in the popup is still hidden after a full page reload; the notes come back visible after the row's `Удалить` or after a checkbox press to visible; a first-ever load with an empty or malformed `foreign-hidden:v1` shows every author visible.
20. (`A184`) A malformed or unreadable `foreign-hidden:v1` record answers `[]` on read, is overwritten by the next write, and never breaks a load or a paint; a failed flag write leaves the in-memory behaviour intact.
21. (`A184`) Own rows and the stored `visible` field are untouched by the flag: a stored row's checkbox still runs `setVisibleForAuthor` and never writes `foreign-hidden:v1`.
22. (`A197`) On a page whose store is empty, an automatic load adopts the server's notes of the settings name into `chrome.storage.local`, so they are painted, listed in the popup's `Вы` row and in «Мои заметки», and sent back by the next press.
23. (`A198`) A merge keeps the newer `updatedAt` when the content differs, keeps the local `visible` flag, writes nothing when the content is equal, never exceeds `MAX_ENTRIES_PER_PAGE`, and skips a row it cannot read or that names another page.
24. (`A199`) Adoption is one core write: a refused write (unreadable index/slot, unusable key, port failure) changes nothing, does not block the paint and is retried by the next load; the content layer gains exactly one write importer.
16. A failed automatic load leaves the page working and states the failure with the non-blocking popup notice.
17. `manifest.json` declares `host_permissions: ["http://*/*", "https://*/*"]` and `background.service_worker`; `fetch` appears in exactly three modules — the broker, the popup transport and the «Мои заметки» transport.
18. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`, `node scripts/check-agent-config.mjs`; the test count only grows.
25. (`A200`) The content script names no network API: its sync transport sends `chrome.runtime.sendMessage` to the background broker, so the automatic load and the one-note delete work on an `https://` article with an `http://` server address; the popup's press and the «Мои заметки» delete are unchanged.
26. (`A202`) A message that cannot be delivered answers the same `network` code a rejected `fetch` produced; the broker answers `{ ok, status, body }`, builds no URL and keeps no state; no timer is added anywhere.

### Test mapping

| AC | Test |
|---|---|
| 1, 2, 3, 4 | `tests/core-settings-store.spec.ts` -> the Stage 17 describe; `tests/options-sync-settings.spec.ts` |
| 5, 6 | `tests/core-sync-client.spec.ts` -> "server address", "synchronization needs a switch" |
| 7, 8 | `tests/options-sync-settings.spec.ts`; `tests/options-window-look.spec.ts` |
| 19, 20, 21 | `tests/core-foreign-hidden-store.spec.ts`; `tests/content-sync-notes.spec.ts` -> the `A184` describes |
| 22, 23, 24 | `tests/core-own-notes-adopt.spec.ts`; `tests/content-adopt-own-notes.spec.ts` (the content adopter: the mapping, the write, the best-effort contract); `tests/content-sync-notes.spec.ts` -> the `A197`/`A199` describes (both load paths, one call before memory) |
| 24 | `tests/content-create-card-boundaries.spec.ts` -> the write-importer pin and the one-loader pin; `tests/content-throw-boundaries.spec.ts` -> the `sync/adopt-own-notes.ts` catch |
| 22, 23 | `tests/core-sync-client.spec.ts` -> the server-stamp normalization describes (`RFC3339Nano` with 6, 4, 1 and 0 fractional digits maps to the stored shape; a non-`Z` offset or an unparsable stamp skips the row) |
| 9, 10, 11 | `tests/popup-sync-button.spec.ts` |
| 12, 13 | `tests/content-sync-notes.spec.ts`, `tests/content-foreign-notes.spec.ts` |
| 14, 15 | `tests/content-foreign-notes.spec.ts`, `tests/content-paint-plan.spec.ts`, `tests/content-paint-style.spec.ts` |
| 16 | `tests/content-sync-notes.spec.ts`, `tests/popup-entry-list.spec.ts` |
| 17 | `tests/toolchain-contract.spec.ts` -> "no network in shipped source", "manifest contract" |
| 25, 26 | `tests/background-service-worker.spec.ts` (the listener: one `fetch` with the given request, `{ ok, status, body }`, a transport failure answered rather than thrown); `tests/content-broker-transport.spec.ts` (a message answers the request, a non-delivered message throws); `tests/toolchain-contract.spec.ts` -> the fetch-module set and `background.service_worker` |
| 18 | the gate commands, quoted in the task's engineer report under `docs/state/` |