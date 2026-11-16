# t1-03-storage-slot-keys

## Goal

The storage key layout becomes legal and stable: `chrome.storage.local` rejects keys containing
`.` `/` `\` `"` and caps a key at 256 characters, while a `pageKey` is a whole URL. This task makes the
page→slot mapping deterministic, index-backed and unit-tested, and makes `/a` and `/a/` one page.

## AC (numbered, copied into the brief)

1. `slotKeyFor(pageKey)` returns a key made only of `[A-Za-z0-9_-]`: every other character is replaced by
   its uppercase `%XX` percent escape, so the result is reversible with `decodeURIComponent`.
2. If the escaped key is longer than 247 characters, `slotKeyFor` returns
   `<first 200 escaped chars> + "~" + <fnv1a32(pageKey) in base36, padded to 7>` — total length ≤ 208, so
   `notes:v1:` + slotKey stays under the 256-character cap. The function is pure and deterministic.
3. `entryStorageKey(pageKey)` in `src/core/storage-keys.ts` composes `notes:v1:` with `slotKeyFor`; the raw
   URL never appears in a storage key any more. A unit test asserts the produced key matches
   `^notes:v1:[A-Za-z0-9_-]{1,208}$` for the longest realistic article URL and for a URL containing `.` `/` `"` `\`.
4. `PAGE_INDEX_KEY = "pages:v1"` and `PageIndex = { version: 1, pageKeys: string[] }` exist in `src/core/`
   with pure helpers `addToIndex(index, pageKey)` (append if absent, keeps order), `removeFromIndex(index, pageKey)`,
   and `resolvePageKey(url, index)` implementing exact match first, then the oldest path-only match by index order
   (PM ruling `A4`). All three are pure and tested.
5. `pathOnlyKey` / `pageKeyFromUrl` treat a trailing slash as identical: `/a`, `/a/` and `/a//` produce the
   same key as `/a`; the site root `/` keeps its key. `index.html` suffixes are not normalized (assumption `R7`).
6. `docs/specs/inline-comment-model.md` → Rules/Storage is edited in this commit: one line for the slot-key
   encoding and the 256/247 rule, one line for the `pages:v1` index and the oldest-variant fallback rule.
   Code and spec in the same commit (repo rule).
7. Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Stage plan

Stage 1 (renegotiated to 4 tasks: the storage-key layout appeared only as a review finding).
Previous: `t1-02` (accepted). Next: `t1-04-core-entry-store`.

## Attempts log

- attempt 1: brief issued, status: delegated.

Brief (attempt 1):
- Task: legal, deterministic page→slot key mapping + page index + trailing-slash identity.
- Input paths: `docs/project-profile.md`, `docs/specs/inline-comment-model.md`, `docs/state/t1-03-storage-slot-keys.md`, `src/core/storage-keys.ts`, `src/core/page-key.ts`, `tests/page-key.spec.ts`.
- Output artifact: `docs/state/t1-03-engineer.md` + code in `src/core/storage-keys.ts`, `src/core/page-key.ts`, `src/core/slot-key.ts` (new), `src/core/page-index.ts` (new), `tests/`.
- Acceptance criterion: AC 1–7 above, each with a self-check line.
- Constraints: pure core only (no DOM, no `chrome.*`, no `any`); no new dependency of any kind, no jsdom in this task; no entry CRUD here — that is `t1-04`; do not touch `.pi/`, `docs/project-profile.md`, `docs/specs/content-overlay-ui.md`, `docs/state/*`; commit after green gates (`feat(t1-03): legal slot keys, page index, trailing-slash identity`).
- Report must contain a `Commands run` section quoting `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 1 (engineer).

## Verdicts

- engineer report: pending
- reviewer verdict: pending

## Open questions

- `A7` PM decision (not a user decision — a platform constraint): escaped slot key + `pages:v1` index.
- `A8` **Confirmed by the user (2026-11-16)**: `/a` and `/a/` are the same page.

## PM correction during attempt 1 (brief defect, not an engineer deviation)

The engineer stopped and asked instead of guessing — correct behavior per `code-review-flow.md`. My AC1/AC3
contradicted each other: `%` is not inside `[A-Za-z0-9_-]`, and every `pageKey` contains `.` and `/`.
Ruling **Option A**:

- `AC1'` — escape every character outside `[A-Za-z0-9_-]` as uppercase `%XX`; output alphabet is exactly
  `[A-Za-z0-9_%-]`; `decodeURIComponent(slotKeyFor(k)) === k` for every pageKey, including one that already
  contains a literal `%2F`.
- `AC3'` — `entryStorageKey(pageKey)` matches `^notes:v1:[A-Za-z0-9_%-]{1,208}$`; the test also asserts the key
  contains none of `.` `/` `\` `"`.
- The long-key separator `~` is legal because it is outside `[A-Za-z0-9_-]` and is never produced by the
  escape; a pageKey containing `~` escapes it to `%7E` (must be covered by a test).
- Spec wording is defensive ("characters legal for `chrome.storage` keys"), not a quotation: the engineer
  checked the current developer.chrome.com page and two Wayback copies and found no charset or key-length
  statement, and the Chromium `value_store` path shows no key validator. The charset/256 rule stays as a
  **defensive project constraint**; `not confirmed empirically` goes to the report's open questions and to
  `docs/retro.md` at the end of Stage 1.
