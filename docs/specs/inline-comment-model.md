# inline-comment-model

## Purpose / Goal

Define the stored object of the product: what a note is, where it lives, how it is keyed to a page, who may change it, and when it stops being displayable. This spec is the single owner of those rules; UI layers must not restate or relax them.

## Scope

In scope: entry shape, storage area and keys, page-key normalization, caps, authorship and edit rights, overlap rejection, anchoring and staleness, deletion and page clearing.
Out of scope: how the highlight is painted and how the popup is rendered (`content-overlay-ui.md`), MV3 permission wiring, any cross-device or cross-user sharing.

## Terms / Aliases

| Term (EN, grep anchor) | Russian UI wording | Meaning |
|---|---|---|
| `entry` | «запись», «комментарий» | one stored note: a text span + a comment + an author name |
| `pageKey` | — | normalized page identity; it is the value stored in the page index, not a storage key by itself |
| `slot key` | — | encoding of a `pageKey` inside a storage key: `notes:v1:<slotKey>` |
| `page index` | — | the `pages:v1` value: ordered list of every `pageKey` the store knows |
| `storage port` | — | the `StoragePort` seam in `src/core/`; `chrome.storage.local` is reached only through the one content adapter |
| `index repair` | — | dropping a listed `pageKey` whose slot holds no entry, done during a read |
| `anchor` | — | text-based locator of the selected span |
| `normalized text stream` | — | the page text after text normalization; the one string both anchor directions use |
| `anchor window` | — | the `prefix` / `suffix` context around `anchor.text`, measured in Unicode code points |
| `visible` | — | per-entry show/hide flag behind the popup checkbox; UI label is owned by `content-overlay-ui.md` |
| `authorName` | «Имя» | author string set in options; identity of the writer |
| `stale entry` | «запись недоступна» | entry whose anchor no longer resolves on the page |
| `overlap` | «пересечение» | intersection of a new range with an existing entry range |
| `clear page` | «Очистить страницу» | delete every entry of the current pageKey |

## Flow / Sequence

1. Content script captures a non-empty user selection and resolves it to an ordered list of `(element, startOffset, endOffset)` fragments. It also builds the normalized text stream of the page and the code-point range of the selection inside that stream, and hands core only normalized text (ruling `A26`).
2. Core computes `pageKey` from the current URL and loads `entries[pageKey]`.
3. Core checks the creation rules in this order: name set → selection not empty → comment length ≤ 256 → entry count < 20 → no overlap → no identical existing entry.
4. Core builds the entry: `id` (random 12-char base36), `pageKey`, `authorName`, `text` (normalized selection text), `comment`, `anchor`, `visible` (default `true`, PM ruling `A1`), `createdAt`, `updatedAt` (UTC ISO-8601 `Z` strings taken from the caller's injected clock, same value on create; ruling `A9`).
5. Core writes the whole page list under one storage key through the storage port, under the Index write policy below, and notifies the content script and popup. A refused or failed write changes nothing in the store and carries a machine code.
6. On page load or SPA URL change, the content script asks core for the page's entries, resolves each anchor against the current normalized text stream, and reports which entries are displayable.
7. Edit path: the editor may save only if `entry.authorName === currentName`; a save under another current name is refused with the `not_author` code. The save rewrites only `comment` (normalized) and `updatedAt`; `id`, `pageKey`, `authorName`, `text`, `anchor`, `visible` and `createdAt` keep their stored values.
8. Delete path: remove by `id`. Clear page: remove the whole `pageKey` list.

## Rules / Semantics

- Storage: `chrome.storage.local` only. One key per page: `notes:v1:<slotKey>`, value `{ version: 1, entries: Entry[] }`. A separate key `settings:v1` holds `{ name }`; a separate key `pages:v1` holds the page index.
- Slot key encoding (`A7`): a storage key uses only characters legal for `chrome.storage` keys, so a raw `pageKey` (a whole URL) never appears in one. Every character outside `[A-Za-z0-9_-]` is replaced by its uppercase `%XX` UTF-8 escape, so the escaped alphabet is `[A-Za-z0-9_%-]` and `decodeURIComponent` of the escaped slot key returns the original `pageKey`.
- Slot key length (`A7`): an escaped slot key longer than 246 characters becomes its first 200 escaped characters + `~` + `fnv1a32(pageKey)` in base36 padded to 7 characters, so a truncated slot key is at most 208 characters, no slot key exceeds 246 characters, and `notes:v1:` (9 characters) + slot key is at most 255 characters: strictly inside the 256-character key budget, with headroom instead of none (review finding `N2`). `~` is legal as the separator because the escape never emits it (a `pageKey` carrying `~` produces `%7E`), so a page key cannot forge it. A truncated slot key is not reversible. Accepted trade-off (review finding `N1`): two page keys that share the first 200 escaped characters and collide in the 32-bit FNV-1a hash would share one slot; the hash covers the whole page key and the store holds a few dozen keys, so the risk is accepted, and the page index keeps both keys either way. The charset rule and the 256-character budget are defensive project constraints, not a quotation of a published Chrome statement (not confirmed empirically).
- Slot key decode invariant (`N4`): no shipped code turns a slot key back into a `pageKey`. The `pages:v1` index is the only way back to a page key; reversing the escape exists in tests only, because a truncated slot key cannot be reversed at all.
- Page index: `pages:v1` holds `{ version: 1, pageKeys: string[] }` in insertion order and is the authoritative source of page keys. A slot is resolved through the index, never by decoding the key text, because a truncated slot key cannot be decoded back to a `pageKey`. Nothing in the read path reorders `pageKeys`: insertion order is what "oldest variant" means for the fallback below (`A4`).
- Storage seam: `src/core/` owns the `StoragePort` contract — promise-based `get(keys | null)`, `set(items)`, `remove(keys)` — and calls no storage API itself. `chrome.storage.local` is reached through exactly one adapter in the content layer (`src/content/store/chrome-storage-port.ts`); unit tests use a hand-written in-memory port. A failed operation carries the machine code `quota`, `serialization` or `unavailable`; the Russian wording for a full quota is mapped in the UI layer.
- Index write policy: a page slot is written **before** `pages:v1`, and a failed slot write leaves `pages:v1` exactly as it was. The index is published last, and what is published is the decoded `pages:v1` value that the read path produced, not a value rebuilt from the URL, so an index that lists a page always points at a slot that already landed. Removing the last entry of a page removes its slot **before** the index stops listing the page; a failed removal leaves the index untouched.
- Index write guard: a write derives its `pageKey` from the stored index and refuses rather than working around a bad index. `layout_version` or `index_malformed` in the stored value, or a failed index read (`storage_unavailable`), refuses create, save, delete, visibility and clear with that same code: publishing a one-key index would orphan every other page's slot, and the `pageKeyFromUrl` fallback would fork a page that already has entries under an indexed variant (review finding `N5`, residual risks 3 and 4 of `t1-05`). A missing `pages:v1` carries no code, so a first write is not refused. The same guard refuses a write over a slot value that is not a `{ version, entries }` object or whose `version` is not `1` (`slot_malformed`, `layout_version`); clear page is the one write allowed to drop such a value.
- Decode on write: every record a write publishes is produced by the read guard, so no write can store a record its own reader would skip; a create whose injected stamp or anchor is invalid is refused with `entry_invalid` instead of being stored. The stored `authorName` and `comment` are the normalized values, `id` comes from the injected random source, and both stamps come from the injected clock.
- Unreadable records (PM ruling `A16`): a stored record the read guard cannot decode survives every write verbatim — create, save, delete, visibility — and is dropped only by clear page, because that is an explicit user action. Caps count only the decodable records of the resolved page.
- Index read: a stored `pages:v1` whose `version` is not `1` is read as an empty index plus the `layout_version` code, never as a crash; a value that is not an index object is read the same way with the `index_malformed` code. A non-string element is dropped; an indexed key that is not normalized is kept, so the slot it already owns stays reachable.
- Index repair on read: a `pageKey` that `pages:v1` lists while its slot is absent or holds a well-formed empty list is dropped from the index with `removeFromIndex`, and every surviving key keeps its position. A slot that holds a malformed record, or a slot with a foreign `version`, keeps its index entry: dropping the key would make unreadable data unreachable, which is a silent delete.
- Decode on read: every stored record passes a guard in `src/core/` before it can reach `canEdit` or a list helper. A slot value that is not a `{ version, entries }` object is an empty page plus `slot_malformed`. Unknown fields are ignored, an absent `visible` means `true` (`A1`), and a malformed record is skipped and counted, never rewritten and never deleted. A record is malformed when an identity field is missing or empty, when a text field is not a string, when `anchor` is not `{ text, prefix, suffix, fragmentCount }` with a non-negative integer `fragmentCount`, or when `createdAt`/`updatedAt` is not a UTC ISO-8601 `Z` stamp.
- Page read result: the core read of one page returns `{ pageKey, entries, corruptCount, codes }` — the page key the read used (`null` when the URL is unparsable), the decoded entries in stored order, the number of records the guard skipped, and machine codes (`layout_version`, `index_malformed`, `page_key_invalid`, `page_key_unnormalized`, `slot_malformed`, `entry_malformed`, `storage_unavailable`, `url_unparsable`, `index_repaired`, `index_repair_failed`). Codes are machine-readable only; the Russian wording is mapped in the UI layer. A read never rewrites a slot and never deletes a record: its only permitted write is an index repair.
- Timestamps (`A9`): `createdAt` and `updatedAt` are UTC ISO-8601 strings with a literal `Z`, produced by a clock the caller injects; `src/core/` never reads a clock and never generates an id. Lexical order of those two fields is therefore chronological, which is what the popup ordering uses.
- Page lookup: an exact normalized `pageKey` match first; otherwise the oldest path-only match, meaning the earliest key in `pages:v1` whose `origin + pathname` equals the URL's (`A4`), and that fallback runs only when the index read succeeded (`index_ok` or an absent `pages:v1`); after `index_malformed`, `layout_version` or `storage_unavailable` there is no ordered index to search, so the write path uses the normalized URL alone (review finding `R3`). The stored key is used unchanged, so a page never forks into two entry lists. The write path resolves the key as `resolvePageKey(url, index) ?? pageKeyFromUrl(url)` and only then indexes it; `addToIndex` refuses a page key that `pageKeyFromUrl` did not produce, because indexing a raw URL would fork a page invisibly (review finding `N5`).
- No sync, no IndexedDB, no server. Nothing leaves the browser.
- `pageKey` normalization: `origin + pathname` in lowercase path; drop the hash; drop query params matching `utm_*`, `gclid`, `gsas`, `fbclid`, `_ga`, `_gl`, `_hs`, `mc_*`, `ref`, `ref_src`, `igshid`, `s_kwcid`; keep remaining params sorted by name. A trailing slash is not part of page identity: `/a`, `/a/` and `/a//` give the key of `/a`, while the site root keeps its own `/` key (`A8`); an `index.html` suffix is not normalized (reviewer note `R7`). Lookup additionally falls back to an `origin + pathname` (path-only) match against indexed keys, so a note saved on a URL that later gains or loses parameters is still found.
- Cap 256 characters counts Unicode code points of `comment`, trimmed of leading/trailing whitespace. Empty comment after trim → rejected.
- Cap 20 entries per `pageKey`. Creation at the cap is refused with the message `Достигнут лимит 20 записей на странице`.
- `authorName` is mandatory and must be a non-empty trimmed string, at most 40 Unicode code points (review remark `R2`; a surrogate pair counts once). If it is missing, creation and editing are disabled and the popup shows `Укажите имя в настройках`. First run generates a random 8-character name (lowercase base36) and stores it.
- Identity is the name string itself, compared case-sensitively and after trimming. Two different names in the same browser are two different authors; there is no account concept.
- Edit rights: only the author of the entry. A different current name gets no edit affordance on that entry; the entry is read-only. Creating a note over text already covered by another author's entry is refused by the overlap rule, so "editing with another name" is expressed by clearing the first entry or by selecting a non-overlapping span.
- Overlap: a new or moved range that intersects any existing entry range on the same page is refused with the message `Выделение пересекается с существующей записью`. Touching at a single boundary point is not an overlap.
- Anchoring: `anchor = { text, prefix, suffix, fragmentCount }` where `text` is the normalized selection text and `prefix`/`suffix` are the up-to-`contextWindow` characters before and after it, taken from the same normalized text stream; `fragmentCount` is a hint about how many DOM fragments the selection spanned, never an authority. Resolution happens in the normalized text stream: the two steps of "Anchor search order" give the code-point range, and the content layer maps that range back to DOM fragments (`content-overlay-ui.md`). Raw offsets are stored only as a hint and are never the authority.
- Normalized text: normalization is a pure function of a string — every run of whitespace (ASCII whitespace, NBSP, the Unicode space separators, BOM) collapses into one U+0020, both ends are trimmed, and no non-whitespace character is reordered, added or removed. It is idempotent (`normalize(normalize(x)) === normalize(x)`) and deterministic, and it is measured in Unicode code points, never in UTF-16 units, so `😀` is one character. The same function produces the normalized page text stream and the normalized selection text.
- Normalization ownership (ruling `A26`, closing residual risk 1 of `t1-06`): the content layer normalizes the selection at capture time; core never repairs it. `createEntryOnPage` refuses with `entry_invalid` and writes nothing when the given `text` differs from `anchor.text` or is not already normalized, so the highlight position and the stored span can never point at different strings. The refusal runs after the creation rules, so a full page still reports `page_limit`. A save never re-checks a stored record: Flow 7 keeps `text` and `anchor`, therefore a record stored before this rule keeps being editable.
- Anchor window: `prefix` and `suffix` are measured in Unicode code points, the default size is 40 and the caller may ask for another size. A selection at the very start or the very end of the stream gets a shorter window, and the anchor is never padded: a piece the page does not have would describe context that does not exist. The pieces are exact substrings of the stream they were built from, including the space that separates them from the selection, which is why searching the same stream finds them.
- Anchor search order: resolve in two steps — search `prefix + text + suffix` in the normalized text stream; when that yields nothing, search `text` alone; when neither is found, the anchor is stale. The first match in document order wins, so a repeated sentence is anchored deterministically and the same anchor on the same page text gives the same positions across reloads. There is no `anchor_ambiguous` code, because document order settles the choice (ruling `A24`). A hit is the half-open range `[start, end)` in code points of the same stream the anchor was built from.
- Staleness: if the anchor does not resolve, the entry produces no highlight but stays in the popup list and stays deletable. It is never auto-removed. The resolver reports the code `anchor_not_found`; it never throws, never mutates the anchor, and never removes or rewrites the entry — only an explicit user delete removes it.
- Ordering in the popup: creation order ascending.
- `visible`: boolean, `true` at creation and the default when the field is absent (PM ruling `A1`). It controls only whether the entry's highlight is painted on the page; it never affects entry identity, ordering, edit rights, the caps or the anchor. A hidden entry keeps its anchor and reappears when the checkbox is turned back on. Changing it is not an edit: the checkbox of the popup row works for an entry of any author, because `content-overlay-ui.md` gives every row a checkbox, and a visibility write never changes `updatedAt`, so it never moves the entry in the popup order.
- Quota: writes are whole-list writes. If a write fails with a quota error, the entry is not created and the UI shows `Хранилище переполнено`.

## Edge Cases

- Selection inside the extension's own overlay (card, tooltip) must be ignored, not captured.
- Selection that spans several block elements and inline tags must work; a selection crossing `<table>` cells must work or degrade to the innermost common container, reported in the task notes.
- Same text repeated on the page: the anchor's `prefix`/`suffix` disambiguates by the contextual search of "Anchor search order"; when the context no longer matches, or is empty, the search falls back to `text` alone and the first match in document order wins; the choice is stable across reloads because the search has no clock, no randomness and no iteration over object keys.
- Page text changed by the site (edit, re-render, comment section added) → the entry may go stale; it must not be silently dropped.
- Reload, back/forward (bfcache), and SPA URL change must all re-resolve entries; a stale rendered highlight must be removed on URL change.
- Two browser tabs on the same page: a storage `onChanged` listener refreshes both; last write of the full list wins.
- Name changed in options: existing entries keep their old `authorName` and become read-only for the new name.
- Duplicate selection with an empty comment is a no-op, not an entry.
- `chrome.storage.local` cleared by the user → the extension behaves as on a fresh install.

## Acceptance Criteria

Each verifiable without re-reading the implementation:

1. With a name set, selecting text and saving a ≤256-char comment stores exactly one entry under `notes:v1:<slotKey>` of its `pageKey`; reopening the same URL shows it again.
2. A 257-code-point comment cannot be saved; the counter shows `256/256` at the cap and the Save button is disabled.
3. The 21st entry on a page cannot be created and the refusal message is shown.
4. An entry created on `https://example.com/a?utm_source=x#sec` is found on `https://example.com/a?utm_source=y&fbclid=1`.
5. An entry whose text was deleted from the page shows no highlight but is still listed in the popup and can be deleted.
6. A selection intersecting an existing entry's range is refused with the overlap message; a selection touching it at one boundary is accepted.
7. With `authorName` of the entry equal to the current name, the editor offers Save/Cancel/Delete and Save updates `comment` + `updatedAt` without changing `id`.
8. With a different current name, the same entry offers no Save/Delete; its tooltip is read-only.
9. With no name in settings, no card opens on selection and the popup shows the name-required message.
10. Deleting one entry and clearing a page affect only that entry / only that page's entries.
11. Unit tests in `tests/` cover rules 2, 3, 4, 6, 7, 8 and pass with no failing tests.
12. `normalizeText` turns `"a\t\n  b"` into `"a b"`, gives the same string when applied twice, and never reorders, adds or removes a non-whitespace character.
13. The anchor window is 40 code points, where `😀` counts once; a selection at the start or the end of the page text gets a shorter window and never a padded one.
14. An anchor whose `prefix`/`suffix` no longer matches still resolves on `text` alone; an anchor whose `text` is gone reports `anchor_not_found`, throws nothing, and leaves the entry listed and deletable.
15. The same anchor on the same page text gives the same positions across reloads; when the text appears twice and the context does not disambiguate, the first match in document order wins, and there is no `anchor_ambiguous` code.
16. A create whose `text` differs from `anchor.text`, or is not already normalized, is refused with `entry_invalid` and stores nothing.
17. Unit tests in `tests/` cover 12–16 and pass with no failing tests.
