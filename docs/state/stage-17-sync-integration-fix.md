# t17-02 — close the popup gap and make the spec honest

Status: opened. Parent: Stage 17, task `t17-01` (review `blocked`).
Implementer: `extension-engineer`. Reviewer: `code-reviewer`.

## What the review found

The review of `t17-01` returned **blocked** with two findings. Both are correct.

### Finding 1 — the engineer report is missing from the repository

`docs/state/t17-01-engineer.md` does not exist in the working tree or in any commit. The brief named
it as the output, `code-review-flow.md` makes it mandatory, and the new spec points at it
(`sync-integration.md`, test mapping) — a dangling pointer in a spec this task shipped.

This is the PM's second slip of the same kind: after Stage 16 the PM recorded "copy the report into
the repository before launching the review" and did not do it here. The report text exists in the
subagent artifact; the PM copies it in as part of this task.

### Finding 2 — the spec describes behaviour the code does not have

`docs/specs/sync-integration.md` claims two things that do not exist in the code:

1. **The popup states a failed load** with the non-blocking notice «Не удалось связаться с сервером
   синхронизации» (§ "A failed load never blocks the page", Edge Cases line 150, AC 16).
   Measured: the string exists in `src/popup/text.ts:69` as `syncFailed`, but **nothing reads it** —
   `grep syncFailed src/` finds only the declaration and the notice-code map. The popup cannot know
   the load failed, because the load happens in the content script.
2. **The popup's checkbox and `Удалить` act on foreign rows** (§ "Hiding and deleting a foreign row",
   Flow step 6). Measured: the popup reads only `chrome.storage.local`
   (`page-entries-service.ts:295` → `loadEntries`), and foreign notes never reach storage by `A163`.
   So the popup has no foreign rows at all: it cannot list them, cannot hide them, cannot delete them.

## The architectural gap this exposes

The user's instruction for Stage 17 said: "Я могу в попап окне удалить заметки человека для текущей
страницы" — the popup must show other people's notes and let the reader delete them. The code
delivers the page half (foreign notes are painted on the page) but not the popup half. The spec
described the intended end state, the code implemented the page half, and nobody noticed the gap
until the review.

**The PM's briefer error:** the brief's AC 7-11 described the page behaviour and never said in so
many words that the popup must *list* foreign authors. The spec then wrote the popup half as if it
existed. The gap is in the brief, not only in the code.

## What this task does

### Ruling A167 — the popup lists foreign authors from a message, not from storage

The popup cannot read the content script's memory. Two options exist:

- **A167a (chosen):** the content script publishes its foreign notes to the popup on request through
  the existing `chrome.runtime` message channel. The popup asks "what foreign notes does this page
  have?" when it opens, and the content script answers from memory. Nothing is written to storage.
- **A167b (rejected):** the popup makes its own `GET` to the server. Rejected because the popup and
  the content script would then hold two independent copies, the request would run twice per page
  open, and the popup's copy would show notes the page never painted.

The message channel already exists in the project (`chrome.runtime` messages between popup, options
and content script, per `AGENTS.md`), so this adds no new mechanism.

### Ruling A168 — a foreign row in the popup is read-only except for delete

The popup renders one row per foreign author, marked foreign. Its checkbox hides that author's
highlights on the page (the content script holds the flag in memory, as `A163` requires), and
`Удалить` removes those notes from the page's view for this tab — **locally only, the server is not
called**. That is the user's answer 5, and it is exactly what the spec already claims.

### Ruling A169 — the failure notice is published by the content script

The content script owns the request. When its automatic load fails, it remembers the failure and
answers the popup's "what is the state?" question with it. The popup renders the notice from that
answer. The string already exists; this task makes it reachable.

### Ruling A170 — the spec is corrected where the code cannot follow

If any claim in `sync-integration.md` still cannot be satisfied by the code after this task, the
spec is **corrected**, not the code. A spec sentence describing behaviour that does not exist is a
defect in the spec. The reviewer's finding 2 is the authority here.

## Acceptance criteria

1. `docs/state/t17-01-engineer.md` exists in the repository and contains the engineer's report for
   `t17-01` (finding 1). The spec's pointer to it resolves.
2. The popup asks the content script for the page's foreign notes when it opens, and renders one row
   per foreign author, marked foreign (`A167`).
3. A foreign row's checkbox hides that author's highlights on the page for this tab, without writing
   to storage (`A168`).
4. A foreign row's `Удалить` removes those notes from the page's view for this tab, without calling
   the server (`A168`).
5. When the automatic load failed, the popup shows the non-blocking notice «Не удалось связаться с
   сервером синхронизации» above the list, and the list stays as it is (`A169`).
6. No foreign note ever reaches `chrome.storage.local` (`A163` unchanged).
7. With synchronization off or an empty URL, the popup shows no foreign rows and no failure notice
   (`A166` unchanged).
8. Every claim in `docs/specs/sync-integration.md` is either true of the code or corrected (`A170`).
9. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
   `node scripts/check-agent-config.mjs`. The test count may only grow.
10. One commit for the code, one for the PM's bookkeeping. The report goes into the repository
    **before** the review is launched.

## Constraints

- No server change; the server is frozen.
- No new network call: the popup's request to the content script is a message, not a fetch.
- The Russian strings stay in the layer's text module.
- Existing assertions are rewritten only where this task's rulings order it; each rewrite is named in
  the report.

## Out of scope

- Conflict resolution between two readers editing the same note.
- Any change to the server's delete semantics.
- Persisting foreign notes across reloads.

---

## Finding 1 closed by the PM

`docs/state/t17-01-engineer.md` and `docs/state/t17-01-review.md` are now in the repository. The
engineer's report text was recovered from the subagent artifact and copied in byte-for-byte; the
review is copied in as well so the next reader sees the blocking finding next to the artifact it
condemns.

This is the PM's second slip of the same kind. The first was recorded after Stage 16 with the words
"copy the engineer's report into `docs/state/` before launching the review, not after" — and the PM
did not follow its own correction. The correction is repeated here as a gate, not a note: **the
review is launched only after `git ls-files docs/state/<task>-engineer.md` returns the file.**
