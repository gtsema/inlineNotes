# Stage 25 — the popup's own row deletes on the server too (A203)

Opened 2026-11-24 from the reader's report: «При удалении в попапе удаляется только
локально (нужно удалять и на сервере)». Только свои заметки — foreign rows остаются
локальными.

## Root cause

Three delete paths exist for the reader's notes:

| Path | Local half | Server half |
|---|---|---|
| editor, one note (`A182`) | `deleteEntry` | `DELETE …/note/{note_id}` |
| «Мои заметки» row (`A192`) | `deleteEntriesOfAuthor` | `DELETE …/author/{author_name}` |
| popup row | `deleteEntriesOfAuthor` | **none** |

`src/popup/page-entries-service.ts` -> `removeAllOfAuthor` writes the store and nothing
else; `deleteRemoteAuthorNotes` is imported only by `src/all-notes/`. So a popup deletion of
the reader's own notes left the server copy, and the next automatic load **re-adopted**
it (`A197`) — the note came back. Not a regression but a gap: the popup row predates the
server halves.

## Spec edits (PM, done)

- `docs/specs/sync-integration.md`: term `own row delete`, the new section "The popup's
  own row deletes on the server too (ruling `A203`)", AC 27, test mapping.
- `docs/specs/content-overlay-ui.md`: the popup group-delete bullet and AC 26 now name the
  `A203` server half for the reader's own row.

## Plan (2 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t25-01` | the popup's own row delete gains the server half + the failure notice | `extension-engineer` |
| `t25-02` | focused review | `code-reviewer` |

## t25-01 brief

**Task.** One press of the popup's **own** row `Удалить` is local write + one author-scoped
`DELETE`, exactly as `A192`/`A203`.

**Input paths.** `docs/specs/sync-integration.md` -> "The popup's own row deletes on the
server too"; `src/popup/page-entries-service.ts` (`removeAllOfAuthor`, `PageEntriesSource`,
`PopupNoticeCode`, `viewOf`, the `press` helper); `src/popup/text.ts`
(`POPUP_STRINGS`, `POPUP_NOTICE_TEXT`); `src/popup/popup.component.ts` (the notice
`@for`, `onRemove`); `src/popup/sync-button-service.ts` (`SyncPressSource`, how the popup
already reads settings and builds the transport); `src/all-notes/all-notes.component.ts`
(`onDelete` — the shipped shape to mirror); `src/core/sync-client.ts`
(`deleteRemoteAuthorNotes`, `authorDeleteUrl`); `src/core/entry-store-read.ts`
(`loadEntries` — the page key read).

**Behavior.**
- In `removeAllOfAuthor`, when the row is **stored** and `isOwn` (core `isSameAuthor` with
  the settings name): resolve the page key **before** the local write (the same reader the
  popup already uses), run `deleteEntriesOfAuthor`, then — only when `syncTargetOf(settings)`
  answers a target — one `deleteRemoteAuthorNotes(transport, target, pageKey, currentName)`.
- `{ deleted: 0 }` is a success, no notice.
- A failed server call: the local deletion stands, the view re-reads, and the popup shows a
  new non-blocking notice `server_delete_failed` with the popup-layer string
  «Не удалось удалить заметки на сервере» (`src/popup/text.ts`; a second layer keeps its own
  copy of the wording, `A82`/`A33` posture).
- Synchronization off or no usable address: no request and no notice.
- A **foreign** row: unchanged (`dismissPageAuthor`, no server, no notice).
- A stored row of a previous author name (`isOwn` false): local only, no server call.

**Tests.** `tests/popup-own-row-delete.spec.ts` (new): local write then exactly one author
DELETE with the page key read before the write; sync off → no request; a foreign row → no
request; a failed server call → local deletion kept and the `server_delete_failed` notice in
the view; `deleted: 0` → no notice. Update any existing popup test that assumed no server
call on a row delete.

**Constraints.** Do not change the editor or the «Мои заметки» paths; no new dependency; the
popup still fetches through its own `src/popup/sync-transport.ts` (extension page, not mixed
content); no timer. Gates in order: `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs`. One commit:
`t25-01: the popup's own row delete reaches the server (A203)`.
