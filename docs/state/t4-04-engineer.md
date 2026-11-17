# t4-04-readme-final-verification — engineer report (attempt 1)

Role: `extension-engineer`. Slice: documentation + spec surface. The human browser run is **not** attempted, **not**
claimed, and appears in the README only as a named pending item.

## Commits (5, one per green step, `A73`)

| Commit | Content |
|---|---|
| `e6e7918` | AC1 — `README.md` rewritten in Russian (whole file replaced) |
| `414e72b` | AC3 (R2) — one story for the empty-name path; spec wording only, no code |
| `e097166` | AC2 (R3) — overlay spec cross-references the model's author-name rule; INDEX covered paths point at the shipped tree; review-artifact path corrected |
| `5993ac7` | AC4 (R4) — one test writing a 40-code-point astral name through `saveSettings`; README counts re-measured |
| `88c8303` | AC1 follow-up — README states only measurable facts (no-network claim scoped to `src/`; dropped unverified Chrome UI label names) |

Diff range `4bdee82..HEAD`:

```
 README.md                         | 191 ++++++++++++++++++++++++++------------
 docs/specs/INDEX.md               |   4 +-
 docs/specs/code-review-flow.md    |   2 +-
 docs/specs/content-overlay-ui.md  |   6 +-
 tests/options-author-name.spec.ts |  36 +++++++
 5 files changed, 176 insertions(+), 63 deletions(-)
```

`git diff --name-only 4bdee82..HEAD | grep -E "^src/|package.json|package-lock.json|scripts/"` → **none**: no behavior
change, no manifest change, no new dependency, no new Russian UI string in `src/`, no harness file touched. The task
state file `docs/state/t4-04-readme-final-verification.md` was **not** modified.

## Gates, quoted, in the `A62` order (run after every step; final run on the committed tree)

```
$ npm run build
[build] dist/ is a self-contained MV3 folder (10 files)

$ npm test -- --reporter=basic
 Test Files  41 passed (41)
      Tests  790 passed (790)

$ node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 87 info(s)
```

All 87 INFO lines are the standing `planned path not created yet` notes (`grep -c "planned path not created yet"` →
87). The baseline was 86; the +1 is the new backticked `tests/options-author-name.spec.ts` reference added to
`docs/specs/content-overlay-ui.md:135`. No errors, no warnings.

Extra (not a gate): `npm run typecheck` → all three tsconfigs clean.
`git status --porcelain` after the last commit → empty (no staged or unstaged files).

## AC self-check, by number (`A72`)

### AC1 — `README.md` in Russian, from clone to a loaded `dist/`, and what is not promised — **done**

- `README.md:1-5` — what it is, in two sentences; storage is `chrome.storage.local`, own code makes no network calls.
- `README.md:8-23` — exactly what the shipped code does: select → card → note → `Сохранить` → highlight + frame;
  hover → tooltip; click on the tooltip only pins opacity; selecting your own note → in-place editor
  `Сохранить` / `Отмена` / `Удалить`; foreign notes are read-only; popup rows (author name / «Вы», checkbox,
  `Удалить`); options page with the single `Имя` field and the generated first-run name; without a name no card opens
  and the popup shows the name-required line that opens options.
- `README.md:26-40` — `npm install`, `npm run build`, `npm test`, then `chrome://extensions` → **режим разработчика** →
  «**Загрузить распакованное расширение**» → папка **`dist/`**; rebuild + «Обновить» loop.
- `README.md:44-58` — permissions in plain Russian: `storage` = notes and name; `tabs` = **one** read of the active
  tab address so the popup knows which page it is talking about (`A49`), therefore Chrome shows
  «читает историю просмотров» once at install and that is not a bug; no `host_permissions`, no
  `optional_permissions`; content script registered for `http`/`https` only.
- `README.md:60-69` — limits: 256 code points per note, 40 code points for the name (astral counts once), 20 entries
  per page with the refusal sentence; plus the page-key normalization paragraph (hash and tracking noise dropped,
  remaining params sorted, path-only fallback).
- `README.md:73-95` — «Что в v1 не обещается»: cross-tab last-writer-wins (`A60`); repeated text anchors to the first
  match in document order (`A24`); iframes and page-owned shadow roots out of scope; the popup list is a snapshot
  while open; a refused popup write is silent and the list re-reads the store (`A84`); stale entries are neither
  highlighted nor hoverable, are not marked in the popup and are never auto-deleted (`A86`); a re-selection in the
  editor moves nothing — moving is `Удалить` + a new note (`A78`); a same-address re-render (infinite scroll) does not
  re-resolve until something else repaints; non-`http(s)` pages.
- `README.md:97-110` — status in Russian: Stages 1–4 code complete; gates green with the measured numbers; the page
  loop and the options screen **confirmed by the user in a real browser**; the six-item verification list **still not
  run and not counted as passed**, with all six items named and the deferral attributed to the user.
- `README.md:112-158` — development commands, the `A62` gate order and why it is that order, plus the agent-harness
  section kept current (roles, skills, specs, wiring, `timeoutMs: 3600000` from the profile). The stale Stage-1 text
  («поведение продукта пока — заглушки», `timeoutMs: 1800000`, "gate activation after `package.json`", the old
  "Дальше: план реализации" list) is gone.

### AC2 (R3) — duplicated rule removed, no dangling ids, no dead paths — **done**

- `docs/specs/content-overlay-ui.md:132` — the "First run" bullet no longer restates the generated-over enumeration; it
  now points at the owner: `docs/specs/inline-comment-model.md` → Rules / Semantics → the "`authorName`" rule
  (the enumeration still stands there alone at `docs/specs/inline-comment-model.md:76`). The options-specific half
  (the `storage_unavailable` shape is **not** generated over, and what the field shows) stays in the overlay spec.
- Dangling task ids: every `t<N>-<NN>…` token in `docs/specs/*.md` resolves to a file in `docs/state/` —
  14 tokens checked (`t1-05`, `t1-06`, `t3-01`, `t3-01b`, `t3-02`, `t3-02b`, `t3-03`, `t3-04`, `t3-05`, `t4-01`,
  `t4-02`, `t4-02-options-name`, `t4-03`, `t4-04`), zero dangling.
- Dead paths: every path token in the specs and `INDEX.md` (`src/…`, `tests/…`, `docs/…`, `scripts/…`, `.pi/…`) was
  extracted and tested with `[ -e ]`. Before the fix: `src/popup/store` (INDEX covered-paths column) did not exist —
  the popup reaches storage through the single adapter in `src/content/store/`, so `docs/specs/INDEX.md:8` now lists
  `src/popup/`. After the fix: **0 missing**.
- `docs/specs/INDEX.md:4` — the "planned implementation locations (they appear when the implementation request
  starts)" caveat is replaced: the implementation shipped, the column names the real tree.
- `docs/specs/code-review-flow.md:30` — the review artifact now points at `docs/state/<task-id>-review.md`, the path
  actually used by all 22 review artifacts in this repo; the old default named a `.pi/…` directory this repo never
  had. This is a PM-owned spec; the change is the one sentence the brief ordered ("no path that no longer exists"),
  nothing else in that file moved.

### AC3 (R2) — one story for the empty-name path — **done, spec wording only**

- `docs/specs/content-overlay-ui.md:60` (Flow 9) — "`an empty value is rejected with `Имя обязательно`" is replaced:
  an empty trimmed value never reaches the save, the shipped gate is the **disabled `Сохранить` button**, and the
  reader-visible sentence for "there is no author" belongs to the popup and the page card
  («Укажите имя в настройках»); `Имя обязательно` stays in the options map only as the total-map answer to a core
  `name_required` refusal no shipped control of that page can trigger.
- `docs/specs/content-overlay-ui.md:135` (Options message map) — a "Reachability of this code on the options surface"
  clause: `Сохранить` is disabled for an empty trimmed value and the input refuses the code point past the cap, so the
  row is what the core save answers for another caller, which is exactly what
  `tests/options-author-name.spec.ts` → AC2 drives (the service, not the button). The "one wording per surface / no
  third variant" rule is untouched.
- No code change: `src/options/options.component.ts:62` (`[disabled]="!draft().canSave"`),
  `src/options/author-name-service.ts` and `src/options/text.ts` were not edited. The map must stay total over
  `OptionsMessageCode`, and `tests/options-author-name.spec.ts:208` ("keeps every sentence in the spec that fixes it")
  still finds `Имя обязательно` in the spec — the sentence stayed in the file.

### AC4 (R4) — AC19's "and saved" is now pinned by a write — **done**

- `tests/options-author-name.spec.ts:319` — `saves a 40-code-point name through the core write, astral name included
  (R4)`: `AuthorNameService.save` (the only shipped caller of `saveSettings`) writes 40 `a`, then the astral
  `ASTRAL_NAME_40` = 40 × U+1F600; the test asserts `message === 'saved'`, exactly two port writes, and the stored
  bytes byte-for-byte: `storedJson(port) === JSON.stringify({ 'settings:v1': { name: ASTRAL_NAME_40 } })` (no extra
  field, no UTF-16 truncation), then `loadSettings` returns the same 40 code points with `codes: []` and
  `validateAuthorName(...).ok === true`, and a page opened later over that record shows the astral name and writes
  nothing (`A54` does not generate over a usable astral name).
- AC19's sentence was **not** weakened: `docs/specs/content-overlay-ui.md:247` still says 40 code points are
  "accepted and saved".
- Non-vacuity check (mutation, reverted): with the save call changed to `ASTRAL_NAME_40.slice(0, 79)` — 39 whole pairs
  plus a lone surrogate — the new test fails (`1 failed | 18 passed`); after reverting, `19 passed`. The assertion
  really looks at the stored bytes.

## Every number and fact stated in the README, and where it was measured

| README claim | Measured at |
|---|---|
| 256 characters per note, counter `N/256`, input blocked past the cap | `src/core/entry-rules.ts:25` (`MAX_COMMENT_CODE_POINTS = 256`); `docs/specs/content-overlay-ui.md` "Counter rules" |
| 40 code points for the author name, `N/40`, astral counts once | `src/core/entry-rules.ts:31` (`MAX_AUTHOR_NAME_CODE_POINTS = 40`); pinned by `tests/options-author-name.spec.ts:316` (`40/40`) and `:356` (`0/40` from the core constant) |
| 20 entries per page + the sentence «Достигнут лимит 20 записей на странице» | `src/core/entry-rules.ts:28` (`MAX_ENTRIES_PER_PAGE = 20`); the sentence is built from that constant at `src/content/text.ts:75` |
| generated first-run name is 8 characters | `src/core/entry-rules.ts:34` (`GENERATED_AUTHOR_NAME_LENGTH = 8`); behavior in `src/options/author-name-service.ts:112-148` |
| «Укажите имя в настройках» (popup, clickable), «На этой странице подсветка недоступна» | `src/popup/text.ts:36`, `src/popup/text.ts:41`; content-side copy `src/content/text.ts:72` |
| permissions are exactly `storage` + `tabs`, no `host_permissions`, no `optional_permissions` | `src/manifest.json:7`; pinned exactly by `tests/toolchain-contract.spec.ts:104-121` |
| content script registered for `http://*/*` and `https://*/*` only | `src/manifest.json:15`; pinned by `tests/toolchain-contract.spec.ts:90-102` |
| no `fetch` / `XMLHttpRequest` / `WebSocket` in the extension's own code; no `console.` in `src/` | `grep` over `src/` → 0 hits for each; `grep` over `dist/*.js` → 0 in `dist/content.js`, 1 hit in each Angular bundle (`class e{build(){return new XMLHttpRequest}` — the unused `@angular/common/http` XhrFactory), which the README names explicitly instead of claiming zero |
| page key drops the hash and the tracking noise (`utm_*`, `gclid`, `fbclid`, `_ga`, `ref`, …), sorts the rest, path-only fallback | `src/core/page-key.ts:24-38` (`TRACKING_PARAM_NAMES`, `TRACKING_PARAM_PREFIXES`); `docs/specs/inline-comment-model.md:71` |
| popup rows are in creation order with the ownership marker, checkbox, `Удалить` | `src/popup/page-entries-service.ts:218-221` (`sortByCreatedAtAsc`, `canEdit`), `src/popup/page-entries-service.ts:103-104` (row classes) |
| non-`http(s)` pages: no injection, popup keeps the list | `src/popup/page-entries-service.ts:53` (`INJECTABLE_SCHEMES = ['http:', 'https:']`) + `:117-132` |
| address checked every 1000 ms; card opens 150 ms after the selection settles | `src/content/refresh/url-change-watch.ts:50` (`URL_POLL_MS = 1000`); `src/content/overlay/card-events.ts:42` (`SELECTION_SETTLE_MS = 150`) |
| `dist/` is a self-contained MV3 folder of 10 files | `npm run build` last line (quoted above) |
| 790 tests in 41 files, all passing | final `npm test` run (quoted above) |
| checker 0 errors / 0 warnings / 87 INFO | final `node scripts/check-agent-config.mjs` run (quoted above) |
| "one test inspects `dist/`, so a clean clone must build first" | `tests/content-anchor-boundaries.spec.ts:214` |
| Stages 1–4 code complete | `docs/state/t4-03-review.md` (accepted), `docs/state/t4-03b-review.md` (accepted), commit log |
| the page loop and the options screen confirmed by the user in a real browser | `docs/state/t4-02-options-name.md:93-99` ("Runtime confirmation (user, 2026-11-17)") |
| the six-item list is pending | `docs/state/t4-03-spa-refresh-docs.md:108-124` (the list), `docs/state/t4-04-readme-final-verification.md` ("Deferred by the user (2026-11-17)") |
| `timeoutMs: 3600000`, thinking off, concurrency 1, 4 skills | `docs/project-profile.md:109` and `.pi/settings.json` (read back: `defaultThinkingLevel "off"`, `skills [".pi/skills"]`, `parallel.concurrency 1`, `compaction.reserveTokens 8000`, `subagents.agentOverrides` = the three roles), enforced by the checker |

## Deviations from the brief

1. The brief's line numbers had drifted (`content-overlay-ui.md:53` → actual `:60`; `:103` → actual `:132`;
   `:154` → actual AC19 at `:247`; `inline-comment-model.md:76` was correct). I matched the quoted **sentences**, not
   the numbers.
2. The README count `86 INFO` became `87` because my own spec sentence added one backticked `tests/…` token; the
   README reports the measured 87, not the briefed 86.
3. `docs/state/engineer-report.md` inside the repo was **not** written: the runtime output path configured for this run
   is authoritative, and the instruction is to ignore other output destinations. The repo tree stays clean.
4. `npm install` is documented (as briefed); `npm ci` is not mentioned, although `package-lock.json` exists — one
   command for a stranger instead of two.

## Deliberately not done

- The browser verification run: not attempted, not claimed; it appears only as the pending item in the status section.
- No change under `src/`, no `src/manifest.json` change, no dependency, no new Russian UI string, no new spec file, no
  harness file, no edit to `docs/state/t4-04-readme-final-verification.md`.
- AC19's sentence was not weakened (R4 resolved by adding the write, the PM's default).
- `docs/specs/inline-comment-model.md` was not edited: it already owns the enumeration; the copy that disappeared is
  the overlay one.

## Residual risks

1. `docs/specs/INDEX.md` covered paths are still coarse (`src/content/` covers `anchor`, `paint`, `editor`, `refresh`).
   Nothing references a dead path, but the column is not an exhaustive directory list.
2. The README quotes the measured test count (790). Any later task changes that line; the number is a moving target by
   design, and only the two places in `README.md:31` and `README.md:101` hold it.
3. The README's Chrome install steps use the labels the brief supplied («режим разработчика», «Загрузить распакованное
   расширение»). They are the standard `chrome://extensions` labels but were not re-checked against a real Chrome
   window in this run — the same reason the no-network sentence was re-scoped to `src/`.
4. `code-review-flow.md` is owned by `project-manager`; the one-sentence path correction was made because the brief
   ordered a dead-path sweep. If the PM prefers to keep the runtime-managed default wording, that single line at
   `docs/specs/code-review-flow.md:30` is the revert target.

## Open questions (observable behavior — not decided here)

- None blocking. One naming question for the PM: the README calls the deferred check «шестипозиционный проверочный
  список» and names all six items; if the PM's ledger renames it, only `README.md:106-110` changes.
