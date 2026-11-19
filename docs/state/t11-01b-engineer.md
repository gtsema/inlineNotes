# t11-01 attempt 2 (engineer) — AC 10 and AC 11 closed by two spec sentences

Task: `docs/state/t11-01-mascot-and-icon.md`, section "Attempt 2 — AC 10, 11". Docs-only.
Attempt 1 (`48f3446`) passed AC 1–6, 8, 9; review `0d471052-6661-4493-aacc-b7d4e8f52aa9`
(`docs/state/t11-01-review.md`) verdicted **changes requested** on two stale sentences in
`docs/specs/content-overlay-ui.md`. Both are fixed in **one commit `f5e5bec`**, `docs/` only:
no `src/`, no `scripts/`, no test file moved.

## AC 10 — the mascot bullet stops describing the old file (spec line 91)

The bullet read as if the shipped `src/options/assets/cat-mascot.png` were the **byte-identical copy**
of `Mistension/img/128.png`, SHA-256 `a899a910…d446b4`, 27 414 bytes. That file is not shipped and that
hash describes nothing in the tree. It now reads (new text, abbreviated to the changed head):

> **Settings mascot: an owned file that ships** (task `t9-02`, **artwork replaced by `t11-01`**; rulings
> `A123`, `A126` for the `t9-02` copy, `A130`/`A131` where they now govern). `src/options/assets/cat-mascot.png`
> is the owner's own artwork — art from the owner's own extension, so no third-party license enters the
> repository — shipped as a **full-grid `1254 → 128` downscale** of the owner's `cat-mascot_new.png` whose
> source SHA-256 is `0c2f1fc86c8a3e95fe25b799ba1d813279034908136806c7be259425601593e0` at 1 306 640 bytes, and
> that source is deliberately **not** committed (`A130`). The shipped file's own SHA-256 is
> `c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e`, 20 009 bytes, its `IHDR` 128×128
> 8-bit RGBA. `t9-02` shipped `Mistension/img/128.png` **byte-identical** (SHA-256 `a899a910…d446b4`,
> 27 414 bytes) — that is the history of `t9-02`, not the shipped bytes, and `A130` supersedes `A126`'s
> byte-identity clause. The provenance therefore has two halves: the source hash, plus the conversion record
> in `docs/state/t11-01-engineer.md` (the one-off command and the box-filter algorithm), which is what the
> `A126` kind of hash now rests on. [rest of the bullet untouched]

Checklist against the brief:

- shipped artwork = full-grid `1254 → 128` downscale of `cat-mascot_new.png` — ✓ stated.
- source SHA-256 `0c2f1fc8…01593e0` at 1 306 640 bytes, deliberately **not** committed — ✓ stated.
- shipped SHA-256 `c26769ca…af475e` at 20 009 bytes, `IHDR` 128×128 8-bit RGBA — ✓ stated.
- provenance = source hash **plus** the conversion record in `docs/state/t11-01-engineer.md` (one-off
  command and algorithm) — ✓ stated.
- ruling reference `A126` → `A130`/`A131` where that is what now governs — ✓ the head says `A123`, `A126`
  for the `t9-02` copy and `A130`/`A131` where they now govern; the `A130` supersession is stated in-line.
- rest of the bullet kept and true: the `dist/` copy mechanism (`angular.json` options-only asset,
  `build-extension.mjs` presence guard), the relative URL `assets/cat-mascot.png`, and the four absences
  (no data URI, no remote URL, no `@import`, no `web_accessible_resources`) — ✓ byte-for-byte untouched.
  No new pin invented; no still-correct sentence deleted.
- `t9-02` history not rewritten — ✓ its byte-identical copy is named **as the history of `t9-02`**, not as
  the shipped bytes.

## AC 11 — the blind-spot sentence names both files (spec line 87)

It said the named list of files under `src/` no text scan can read «is exactly
`src/options/assets/cat-mascot.png`». `tests/toolchain-contract.spec.ts:909-912` names two:

```
const UNREADABLE_SHIPPED_FILES = [
  'src/icons/icon-128.png',
  'src/options/assets/cat-mascot.png',
];
```

The list is right; the **sentence** is fixed. It now reads:

> And the scan's own blind spot is pinned: every file under `src/` that is **not** in that text set has to
> sit on a named list, and today that list names **two** files — `src/icons/icon-128.png` and
> `src/options/assets/cat-mascot.png` (`t11-01`; the icon joined the list with ruling `A131`) — and **the
> list is the thing the same test pins**, so a new file type cannot quietly leave a negative scan reading
> nothing.

Both files named; the sentence's point (the list is what the same test pins, so a new binary type cannot
quietly leave a negative scan reading nothing) kept; no list in the test touched.

## AC 7 sweep — no other stale mascot/icon sentence left

Grepped the whole spec for the old hash (`a899a910`), the old size (`27 414` / `27414`), the old source
(`Mistension`), the old rulings (`A126`, `A123`) and the old task refs (`t9-02`). Results:

- `docs/specs/content-overlay-ui.md:91` — the only remaining mention of `a899a910…d446b4` / `27 414` /
  `Mistension`, and it is now explicitly framed as **the history of `t9-02`**, with `A130` named as the
  ruling that supersedes that byte-identity clause. Not stale.
- item 28 (`:292`) was **already** updated to the new hash and `A130`/`A131` by attempt 1; no change needed.
- line 89 ("Build verification covers the new shape") already says this manifest names `icons` and
  `action.default_icon`, points both at `icons/icon-128.png`, and calls it a real 128×128 PNG — true.
- line 92, the framing bullet, already carries the `1254 → 128` conversion, `object-fit: contain`, no
  `transform`/`scale`/`zoom`, and the recalculated `t9-02b` numbers — true of the committed bytes.
- `A123` at line 49 (`settings window` term) and line 51 (`name explanation line`) are term-table history
  references, not claims about the shipped bytes — true as written.
- No icon sentence contradicts the code. The icons:
  `src/icons/icon-128.png` and `src/options/assets/cat-mascot.png` both hash to
  `c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e`, 20 009 bytes (measured this run).

Measured facts backing the new sentences (this run, on the committed tree):

```
$ sha256sum src/options/assets/cat-mascot.png src/icons/icon-128.png
c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e *src/options/assets/cat-mascot.png
c26769caa24310bb4c9f54d34436b1a2d091fb3f5ca2e408a23627e2e3af475e *src/icons/icon-128.png
$ stat -c '%s %n' src/options/assets/cat-mascot.png src/icons/icon-128.png
20009 src/options/assets/cat-mascot.png
20009 src/icons/icon-128.png
```

The pinned test constants agree: `tests/options-window-look.spec.ts:49-50`
`ASSET_SHA256 = 'c26769ca…af475e'`, `ASSET_BYTES = 20009`; and its docstring already calls the file
"a full-grid 1254 → 128 downscale of the owner's `cat-mascot_new.png`". The source hash and the 1 306 640
bytes come from `docs/state/t11-01-engineer.md` (both hashes table, source row).

## Gates (profile order), after the edit, before the commit

| # | Command | Exit | Evidence |
|---|---|---|---|
| 1 | `npm run build` | **0** | `manifest references resolved: … icons/icon-128.png, icons/icon-128.png`; `options asset present: dist/options/assets/cat-mascot.png`; `dist/ is a self-contained MV3 folder (12 files)` |
| 2 | `npm test` | **0** | `Test Files 46 passed (46)`, `Tests 1031 passed (1031)` — baseline unchanged, no test moved |
| 3 | `node scripts/check-agent-config.mjs` | **0** | `0 error(s), 0 warning(s), 176 info(s)` |
| 4 | `npm run typecheck` | **0** | all three `tsc -p … --noEmit` projects clean |

`dist/` stays **12 files** (`find dist -type f` count is the build's own report line above).

### One infos-count delta, stated rather than glossed

The brief's baseline was **175 info**; this run reports **176**. Cause, measured by stashing the spec edit
and re-running the checker: the tree *before* my edit answers **175 info**, and the edit adds exactly
**one**. `scripts/check-agent-config.mjs:365` records one `info: planned path not created yet: <token>` for
**every** backticked `src/…` token in a spec, regardless of whether the file exists (`PLAN_PREFIXES`
includes `src/` and the branch precedes the `existsSync` check). AC 11 **requires** the sentence to name
`src/icons/icon-128.png`; naming it in the spec therefore adds one info by construction. Not naming it
would fail AC 11 (or mangle the citation), so the info is kept. Exit code is **0** — it is an `info`, not a
gate failure, and the count may only inform. The pre-existing `src/options/assets/cat-mascot.png` mention
already produced 3 infos on the same rule.

## Self-restraint checks

- Nothing under `src/` or `scripts/` touched: `git show --stat f5e5bec` is **1 file**,
  `docs/specs/content-overlay-ui.md`, `+1 / −1` (two single-line replacements).
- No test changed; no pin weakened or deleted; baseline **1031 / 46** unchanged.
- No mutation needed restoring: the spec is tracked and I edited it in place with two exact-line
  replacements, then committed. I made use of `git stash push/pop` **only** on the tracked spec file to
  measure the 175→176 delta, and `git stash pop` restored the working copy cleanly (verified by
  `git status --porcelain` and by the committed diff being exactly my two replacements). No
  `git checkout` of any file, and nothing was mutated in `src/`/`scripts/`.
- One commit, one writer: `f5e5bec` on `main`; `git status --porcelain` is empty afterwards.
- No `fetch`/XHR/analytics; no dependency; no permission change; no new artifact.

## Open questions

- None. Both AC 10 and AC 11 are closed, the AC 7 sweep found no other stale mascot/icon sentence, and the
  only unasked-for delta (176 vs 175 info) is explained and benign. `README.md` was left to the PM.

## Acceptance report

Changed path: `docs/specs/content-overlay-ui.md` (lines 87 and 91).
Commit: `f5e5bec` — "t11-01 attempt 2: restate the mascot bullet for the shipped bytes, name both
unreadable src files".
