# t17-14 — the off list is not written: what is measured, and where the PM stopped

## The reader's rule, and its state

Unchecking a foreign author's row must survive a page reload. **It does not.** The code for it is
committed (`60d275a`, `bced8ca`), the gates are green, and the record is never written.

## What is measured, in the reader's Chrome

One probe ran the whole path and watched `chrome.storage` throughout:

| Step | Result |
|---|---|
| the article tab is found and answered | yes |
| the page holds the author before the switch | `allVisible: true` |
| the switch answers | **`allVisible: false`** — the memory write works |
| `sync-off:v1` 150 ms / 1 s / 3.5 s after the switch | **`ABSENT`** at every moment |
| storage changes seen during the whole switch | **`[]` — none at all** |

So the switch reaches the page, the page changes its memory, and **nothing is written**.

## What was ruled out by measurement

- **The wiring is complete.** `src/content/main.ts` passes `port` and `pageKey: painter.pageKeyOfPass`
  into `attachPageNotesChannel`, and `sync-notes.afterPaint` now passes the port too.
- **The extraction is not at fault.** `operationOf` returns `{kind:'switch'}` for
  `{type:'inlinenotes:page-notes', op:'switch', authorName, visible}` — the same shape the probe sent.
- **The page key is reachable.** `painter.pageKeyOfPass()` reads a closure variable and uses no
  `this`, so passing it by reference is safe.
- **The build carries the code.** `dist/content.js` contains `sync-off:v1`, `rememberSwitchedAuthor`
  and a diagnostic string, and the probe confirmed the **served** package carries it too.
- **The function is not reached.** A diagnostic placed on the **first line** of
  `rememberSwitchedAuthor` — one that writes to storage unconditionally — never wrote anything, on a
  brand-new tab, with the served package confirmed to contain it.

That last measurement is the one that matters: the function is not called, although the branch that
calls it demonstrably runs, because the memory write it follows **did** happen.

## Where the PM stopped, and why

The PM made **eight** attempts, and three of them damaged the work: a `git checkout` twice reverted
the fix being verified, and one edit left two `repaint()` calls in the branch. Continuing that way
would keep producing confident, wrong conclusions — the same failure this stage has already recorded
twice.

**The honest statement: the cause is not known.** What is known is a contradiction — the branch runs,
and the function it calls on its next line does not — and that contradiction is the one thing the
next attempt must explain before any code changes.

## What the next attempt should do, in one step

1. Put a **single** diagnostic that cannot be lost: a storage write on the **first line of
   `onMessage`**, before `operationOf`, recording `{ message, kind }` for every message the page
   receives. That answers whether the listener runs at all, and with what.
2. Read it once. Only then touch code.
3. Verify the running build first, every time: compare the **served** `content.js` with the file on
   disk, and open a **new** tab rather than reloading one — Chrome does not re-inject a content
   script into a document that already exists.

## The state of the repository

- `60d275a` and `bced8ca` are committed and green: **1303 tests**, `build` 0, `typecheck` 0, checker 0.
- The feature does not work, and the reader should know that before it is used.
- Nothing is half-edited: the working tree is clean apart from the untracked `test_img/`.

---

## Rolled back by the reader's decision (2026-11-23)

«откати целиком». Two reverts, so the history shows what was tried and what came out:

| Commit | What it undoes |
|---|---|
| `dd2d8f8` | `bced8ca` — the automatic load reading the off list |
| `76fec6d` | `60d275a` — the whole `t17-14` slice |

**The tree is byte-identical to the state before `t17-14`**, apart from this file: `git diff --stat
eabe71d HEAD` lists only `docs/state/t17-14-open-defect.md`. `src/core/sync-off-list.ts` and its
suite are gone, no file under `src/` names `sync-off` or `offList`, and the test count is back to
**1273**.

### Verified after the rollback

| Gate | Result |
|---|---|
| `npm run build` | 0, `dist/` 12 files |
| `npm test` | 0 — **1273 / 58** |
| `npm run typecheck` | 0 |
| `node scripts/check-agent-config.mjs` | 0 — 207 info |
| the reader's Chrome | a switch no longer changes `allVisible`; the storage holds the three keys it held before `t17-14`, and no `sync-off:v1` |

### What this file is for

The feature does not exist now, and the two facts worth keeping are here rather than in a diff:

1. **the contradiction the next attempt must explain** — the switch branch runs and the function on
   its next line is never reached, on a fresh tab, with the served package confirmed to carry the
   diagnostic;
2. **the process failures that cost this stage two days** — three self-inflicted regressions from
   `git checkout` over uncommitted work and one edit that left two `repaint()` calls, plus eight
   attempts where a single measurement should have come first.

If the reader ever wants the behaviour back, the brief is still in the history at `eabe71d` and the
engineer's report at `60d275a`; the rollback does not erase either.
