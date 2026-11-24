The output directory does not exist on disk and this role has no write tool. Per my rules, I return the artifact in full for the runtime to persist.

Note: the git status shows only the pre-existing `D META-INSTRUCTION-compact.md`, confirming no source mutation.

Let me do the final confirmation that test 1's `anchor` assertion proves verbatim retention (it compares against ANCHOR which is `row()`'s default anchor — verbatim, not normalized). And check `sameContent` doesn't now break the create-only equality case. All good.

Now I'll produce the review artifact.

---

# t21-02 — focused re-review of `cd3e6c3` (A197 comment normalization, carried fix 1 of `t20-03`)

**Verdict: `accepted`**

Brief: focused re-review of one fix commit `cd3e6c3` (`t21-01: store the adopted comment normalized (A197)`) on top of the already-accepted Stage 20. Per the re-review rule, only the previous finding (remark 1 of `docs/state/t20-03-review.md`) and the new diff lines are checked. Remarks 2 and 3 are PM-measured and out of scope (PM ruling, not re-litigated here).

Artifact path briefed: `.../outputs/fbd8b9ae-a8fa-4e97-953e-1baf60abfad7/docs/state/t21-02-review.md` — that directory does not exist on disk and this role has no write tool, so the artifact is returned in full here for the runtime to persist.

## Carried-fix checklist — remark 1 of `t20-03` (one line per item)

- **Carried fix 1 (`t20-03-review.md` remark 1) — CLOSED.** `src/core/entry-store-write.ts:618` now stores `comment: validateComment(row.comment).normalized` in `adoptionDraft`, and the raw store of `row.comment` at the old `:616` is gone. Verified against the spec sentence `docs/specs/sync-integration.md:109` ("A row that passes is stored with the normalized comment — the same `validateComment` value the create path stores") and `docs/specs/inline-comment-model.md:68` ("Decode on write … The stored `authorName` and `comment` are the normalized values"). The pre-fix divergence the remark measured (`'  spaced  '` stored verbatim) is fixed on both paths:

## Checked items — one line each

- **Remark 1 closed on the new-row path — pass.** `git show cd3e6c3 -- src/core/entry-store-write.ts` shows the single production change `comment: row.comment` → `comment: validateComment(row.comment).normalized` at `src/core/entry-store-write.ts:618`; `adoptionDraft` is called from both passes (`:555` replace, `:576` adopt), so the new-row write is normalized. Evidence: `tests/core-own-notes-adopt.spec.ts` → "stores an adopted padded comment trimmed, never with its padding" asserts `recordAt(port, SLOT_A, 0).comment` is `'spaced'` from the stored slot.
- **Remark 1 closed on the replace path — pass.** Same `adoptionDraft` at `src/core/entry-store-write.ts:555`; `tests/core-own-notes-adopt.spec.ts` → "stores an adopted replace with the trimmed comment too" seeds a stored record (`storedEntry`, comment `'my note'`, id `a1b2c3d4e5f6`) and replaces it with the newer padded row (`updatedAt: LATER` > `EARLY`, `sameContent` false on the differing comment), then asserts the stored slot value `'spaced'`.
- **Padded comment whose trimmed value is over 256 code points is skipped with no write — pass.** The row-skip guard `src/core/entry-store-write.ts:537` (`validateComment(row.comment).ok`) is unchanged and measures the trimmed value (257 code points > `MAX_COMMENT_CODE_POINTS`), so the row never reaches the draft. Evidence: `tests/core-own-notes-adopt.spec.ts` → "skips a padded comment whose trimmed value is over 256 code points, writing nothing" asserts `{ ok: true, adopted: 0, skipped: 1 }`, empty `set`/`remove` call log, and `storedRecords(...)` `undefined`.
- **`text` / `anchor` stay verbatim — pass.** The diff touches only the `comment` line in `adoptionDraft`; the `text: row.text` (`:616`) and `anchor: row.anchor` (`:619`) lines are unchanged. Evidence: test 1 asserts `.text === 'selected text'` and `.anchor` `toEqual(ANCHOR)` (the row's own anchor, unnormalized).
- **No other exported behavior changed — pass.** The full production diff of `cd3e6c3` is the one `comment` line plus a comment block (`git diff cd3e6c3~1..cd3e6c3`). `adoptionDraft` is module-internal (not exported; `src/core/entry-store-write.ts:612`) and called only from `adoptOwnNotes` (`:555`, `:576`); no other exported function's body changed. `git status --short` shows only the pre-existing `D META-INSTRUCTION-compact.md` — no source mutation by this review.
- **The three new tests are real evidence (assert the stored slot value, not a stub) — pass.** Tests 1 and 2 read the stored slot back through `recordAt` → `port.snapshot()` (`tests/core-own-notes-adopt.spec.ts:90-95`) and assert the `comment` field; test 3 asserts the absent slot value plus the empty `set`/`remove` call log. No stub or spy stands in for the store.
- **Spec and code agree — pass.** The commit changed no spec prose and needed none: `docs/specs/sync-integration.md:109` already carries the normalized-comment sentence (added in `a3f29e6`, preceding this task), and the code now conforms. No spec-vs-code conflict.
- **No host-DOM mutation, no network, no new runtime dependency — pass.** The diff touches only the comment field of a core draft; `git show --stat cd3e6c3` names only `src/core/entry-store-write.ts` and `tests/core-own-notes-adopt.spec.ts` (no `package.json`/`package-lock.json`).
- **Spec edited in the same change — not applicable / pass.** This is a pure code-conformance fix to an existing spec sentence; the AC sentence is already in the spec and the code now matches it. No behavior change without a spec edit.

## Gates

The engineer report `docs/state/t21-01-engineer.md` quotes all four gate commands in the briefed order:
- `npm run build` — pass: `[build] dist/ is a self-contained MV3 folder (16 files)`.
- `npm test` — pass: `Test Files 65 passed (65)` / `Tests 1375 passed (1375)` (was 1372, +3 new).
- `npm run typecheck` — pass: three `tsc --noEmit` projects, no diagnostics.
- `node scripts/check-agent-config.mjs` — pass: `0 error(s), 0 warning(s), 243 info(s)`.

Re-run by this review (read-only, the one checker this role may run on its own initiative): `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 243 info(s)`. Matches the report's quote; the info lines are the pre-existing `PLAN_PREFIXES` notes.

## Evidence path

`git show cd3e6c3`, `git show cd3e6c3~1:tests/core-own-notes-adopt.spec.ts`, `git diff cd3e6c3~1..cd3e6c3`, `git status --short`; `src/core/entry-store-write.ts:490-630,645-655`, `src/core/entry-rules.ts:92-106`; `tests/core-own-notes-adopt.spec.ts:144-186`, `tests/support/memory-storage-port.ts:169-182`; `docs/specs/sync-integration.md:102-109`, `docs/specs/inline-comment-model.md:68,78`; `docs/state/t20-03-review.md` (remark 1), `docs/state/t21-01-engineer.md`.

---

Note for the PM: the briefed output path's parent directory does not exist and this role has no write tool, so the artifact above is returned in full for the runtime to persist at `.../docs/state/t21-02-review.md`.