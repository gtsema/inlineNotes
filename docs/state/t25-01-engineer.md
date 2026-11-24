# t25-01 — the popup's own row delete reaches the server (A203) — engineer report

Task: `docs/state/stage-25-popup-own-row-delete.md` -> "t25-01 brief".
Rule owner: `docs/specs/sync-integration.md` -> "The popup's own row deletes on the server too
(ruling `A203`)", AC 27. No spec prose was edited (the PM owns it; no conflict found).

## Changed paths

| Path | Change |
|---|---|
| `src/popup/page-entries-service.ts` | `PageEntriesSource` gains `transport: SyncTransport`; `PopupNoticeCode` gains `server_delete_failed`; `removeAllOfAuthor` now does the `A203` order; new private `deleteRemoteOwnNotes` owns the "may I call the server" decision. |
| `src/popup/text.ts` | `POPUP_STRINGS.serverDeleteFailed` = «Не удалось удалить заметки на сервере»; `POPUP_NOTICE_TEXT.server_delete_failed`; doc comment on the new code. |
| `src/popup/popup.component.ts` | `PAGE_ENTRIES_SOURCE` factory supplies `transport: createPopupSyncTransport()`; the notice `@for` renders `server_delete_failed` through the same non-blocking `<p class="notice">` branch as `sync_failed`. |
| `tests/popup-own-row-delete.spec.ts` | **new** — 12 cases for the ruling. |
| `tests/popup-entry-list.spec.ts` | fixture + the three ad-hoc `PageEntriesSource` literals gained the recorder transport; the notice-map totality case now expects four keys. |
| `tests/popup-foreign-rows.spec.ts` | the four ad-hoc `PageEntriesSource` literals gained the recorder transport. |
| `tests/popup-sync-button.spec.ts` | the `entriesSourceOf` literal gained the recorder transport. |
| `tests/popup-window-look.spec.ts` | the `POPUP_STRINGS` key-set pin gained `serverDeleteFailed` and the wording assertion. |

No new dependency, no timer, no `fetch` added anywhere (`src/popup/sync-transport.ts` is the
shipped popup adapter and stays the only network module of the layer), no editor path and no
«Мои заметки» path touched, no manifest change.

## Implementation notes

- Order of one own-row press, exactly as the ruling states it: `loadSettings` → `loadEntries(port, url)`
  **for the page key only** (the read happens before the write, so a page deleted down to nothing
  still sends the key its notes lived under) → core `deleteEntriesOfAuthor` → at most one
  `deleteRemoteAuthorNotes(transport, target, pageKey, currentName)`.
- The server call is gated by three conditions, all in `deleteRemoteOwnNotes`: a non-null page key,
  core `isSameAuthor(authorName, currentName)` (so a stored row of a previous name is local only),
  and `syncTargetOf(settings) !== null`. Any "no" means no request and no notice.
- The routing question (`routesToPage`) is asked first and unchanged, so a **foreign** row still
  takes the `A168` `dismissPageAuthor` path and never reaches the server.
- `{ deleted: 0 }` is a success (`deleteRemoteAuthorNotes` answers `ok: true`), so no notice.
- A failed call never undoes the local write: the view is re-read by the same `press` helper and the
  notice is appended **after** the re-read (`A192` posture), non-blocking, above a list that still
  renders (`A83`).
- Layering kept: the popup writes the store only through core (`deleteEntriesOfAuthor`), reads the
  page key only through core (`loadEntries`), and calls the network only through the shipped
  `src/popup/sync-transport.ts` adapter injected through the source token. The service still imports
  exactly `deleteEntriesOfAuthor` + `setVisibleForAuthor` from `src/core/entry-store-write.ts`, which
  the `toolchain-contract` pin requires.

## Gates (run in the briefed order)

| Command | Result |
|---|---|
| `npm run build` | passed — `dist/` built, manifest paths resolved, "dist/ is a self-contained MV3 folder" |
| `npm test` | passed — 68 files, 1419 tests |
| `npm run typecheck` | passed — four projects, no output |
| `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 256 info(s)` |

The `check-agent-config` run lists one `INFO` line "planned path not created yet:
tests/popup-own-row-delete.spec.ts" — informational only (the checker resolves spec paths against a
different base); the file exists and its 12 cases pass.

## AC 27 self-check (line by line)

| AC 27 clause | Status | Evidence |
|---|---|---|
| own row `Удалить` removes every note of the current author locally through **exactly one** `deleteEntriesOfAuthor` | implemented | `removeAllOfAuthor` calls it once; `tests/popup-own-row-delete.spec.ts` "one press is one core write and one request" (write lines = slot + index, one request) |
| then — with synchronization on and a usable address — **exactly one** `DELETE /notes/page/{page_id}/author/{author_id}` | implemented | "sends exactly one DELETE to the author route, with the settings name" asserts one call, method `DELETE`, URL `${server}/notes/page/<encoded key>/author/<encoded name>` |
| with the page key read **before** the local write | implemented | "reads the page key before the local write, so the last row of a page still sends its key" (slot and index gone, key still in the URL) and "the key read precedes the slot write in port order" |
| with synchronization off: no request | implemented | "synchronization off: no request and no notice" and "a switch that is on but an address that is empty: no request and no notice" |
| a foreign row keeps its local-only delete | implemented | "a foreign row: unchanged, the `A168` dismissal, no request and no notice"; "a row answered by the page is not sent to the server, even under the reader's own name" |
| a stored row of a previous author name is local only | implemented | "a stored row of a previous author name: local only, no request" |
| a failed server call leaves the local deletion in place and shows the popup notice | implemented | "a failed server call keeps the local deletion and states `server_delete_failed`" (HTTP 500) and "a network failure is the same notice, and nothing is retried" (thrown transport); the row and the store are gone, `notices === ['server_delete_failed']` |
| `{deleted: 0}` is a success | implemented | "`deleted: 0` is a success: no notice" |
| wording «Не удалось удалить заметки на сервере» in the popup layer | implemented | `POPUP_STRINGS.serverDeleteFailed`; asserted in the new spec and in `tests/popup-window-look.spec.ts` |

## Open questions

None. No spec/code conflict was found; the ruling's wording and the shipped code agree.

## Note for the reviewer

The brief said the popup's `removeAllOfAuthor` "writes the store and nothing else"; it actually also
asks the page's channel first (`routesToPage`) to route a foreign row. That branch is untouched and
is why a foreign row needs no special case in the new code. The notice is appended after the re-read
rather than threaded through the view builder, so a view built by an announcement (`A183`) can never
carry a stale `server_delete_failed`.
