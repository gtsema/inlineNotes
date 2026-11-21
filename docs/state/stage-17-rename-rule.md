# t17-04 — a rename abandons the previous name's notes, and warns first

## The user's ruling, in their words

> When the name changes, all notes of the previous name must be deleted. Because they become
> foreign, and we must not keep them. We just need to warn about this when the name changes.

This replaces the PM's earlier plan (`A170`/`A171`/`A172`, brief `stage-17-foreign-identity-fix.md`).
That plan tried to keep the notes as "the reader's own" after a rename by tracking their origin. The
user's ruling is simpler and stricter: **a rename means the old notes are no longer yours, so they are
deleted locally.** The PM's plan is withdrawn; the user's rule is the ruling.

## Why the user's rule is the right one

The defect the user found: after a rename, the previous name's notes were treated as the reader's own
and could be written into `chrome.storage.local` as if the reader had written them. The PM's plan
would have kept them, marked as server-origin. The user's rule removes the ambiguity entirely: after a
rename the store holds **no** notes of the old name, so nothing can be adopted, written, or pushed
back to the server by mistake.

The cost is explicit and the user accepted it: **renaming loses your notes on this device.** That is
why the warning is mandatory, not optional.

## Ruling A173 — a rename deletes the previous name's notes on every page

When the settings name changes from `A` to `B` (and `A !== B`), every stored note whose
`authorName` is `A` is deleted from `chrome.storage.local`, **on every page the store lists**.

- The deletion covers all pages, not just the current one: the page index lists every page with a
  slot, and each page's slot is rewritten without the old name's records.
- Notes of other authors are untouched.
- Notes of the new name are untouched (there should be none yet, but the rule does not assume it).
- The server is **not** called. This is a local deletion only; the server keeps what it has until
  the reader syncs.
- The memory-held foreign notes are dropped too: after a rename the page's foreign list is rebuilt
  from the next load.

### A173 — the rename is a two-step confirmation

`Сохранить` in the options page never deletes silently. When the typed name differs from the stored
name **and** the store holds at least one note of the stored name, the page shows a warning before
writing:

- the warning names what will happen: notes of the previous name will be deleted on this device;
- the warning offers **Cancel** (nothing is written, the field keeps the typed value) and
  **Continue** (the name is saved and the notes are deleted);
- when the store holds no note of the stored name, there is nothing to lose and the save happens
  without a warning.

The wording is Russian and lives in the options text module.

### A174 — the order of the two writes

The name is saved first, then the notes are deleted. If the name write fails, nothing is deleted and
the page reports the failure. If the name write succeeds and the deletion fails partway, the page
reports the deletion failure and the name stays as saved — the reader is told which state they are in.
No partial deletion is silent.

## Acceptance criteria

1. Changing the settings name from `A` to `B` deletes every stored note whose `authorName` is `A`,
   on every page the page index lists (`A173`).
2. Notes of other authors survive the rename unchanged, byte for byte.
3. The server is not called during a rename: a transport that records calls sees zero calls.
4. The confirmation appears when a rename would delete at least one note, and names the consequence
   (`A173` second half).
5. **Cancel** writes nothing: the stored name and every stored note stay byte-identical.
6. **Continue** saves the name and deletes the notes, in that order (`A174`).
7. No confirmation appears when the store holds no note of the stored name, and the save goes
   through.
8. A name save that fails leaves every note in place and reports the failure.
9. The page's memory-held foreign notes are dropped on a rename, so the next load rebuilds them.
10. The Russian wording of the confirmation lives in the options text module and nowhere else.
11. Every existing gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
    `node scripts/check-agent-config.mjs`. The test count only grows.
12. `docs/specs/sync-integration.md` and the settings half of `docs/specs/inline-comment-model.md`
    state the rename rule; `docs/specs/INDEX.md` stays accurate.

## What is explicitly NOT part of this task

- The origin-mark plan `A170`/`A171`/`A172` is withdrawn. The one uncommitted edit the PM made to
  `src/content/sync/foreign-notes.ts` (replacing the name check with an id check) is **reverted**:
  with the user's rule, the name check is correct again, because after a rename the old notes are
  gone and only the reader's own notes can share the reader's name.
- No server change. The server contract is frozen.
- No change to how the reader's own notes are pushed to the server.

---

## PM note on the withdrawn plan

The PM's brief `stage-17-foreign-identity-fix.md` (rulings `A170`/`A171`/`A172`) proposed keeping the
previous name's notes as server-origin after a rename. The user's ruling replaces it: the notes are
deleted. The PM's one uncommitted edit to `src/content/sync/foreign-notes.ts` — replacing the name
check with an id check — is reverted, because under the user's rule the name check is correct again:
after a rename the old notes are gone, so a note whose author name equals the reader's name really is
the reader's own.

The withdrawn brief stays in the repository as the record of the plan that was not taken. Its
rulings are marked superseded by `A173`.
