I could not write to the briefed artifact path (no write-capable tool is available to this read-only role), so the complete artifact follows.

---

# Review — `t4-03-spa-refresh-docs`, attempt 1 (code slice only)

Range reviewed: `bd238c9..HEAD` → `adfc8e9` (shipped code), `79acb74` (SPA tests + spec lines), `e0ae2ec` (CF1 pins), `c2d74ab` (test-side cast). `a53cdf7` is PM bookkeeping and is not counted. Inputs read: `docs/specs/INDEX.md`, `docs/specs/code-review-flow.md`, `docs/specs/content-overlay-ui.md` (Terms 31–33, Flow 7–8, Rules 84–86, Edge Cases 160–162, AC 22–23), `docs/state/t4-03-spa-refresh-docs.md`, `docs/state/t4-03-engineer.md`, then the code and the tests.

## Verdict

**accepted**

## AC check

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC1 | Same-document URL change (`popstate`, `hashchange`, `A59` 1000 ms poll, `visibilitychange`) re-resolves against a **freshly built** stream (`A29`): moved note painted again, vanished note unpainted but not deleted, previous page key's `paint name`s removed | **pass** | `tests/content-spa-refresh.spec.ts:354` (poll only, no event), `:367` (popstate, `pollMs: 0`), `:379` (hashchange from the document), `:395` (visibilitychange catch-up), `:405` (going hidden answers nothing), `:463` (new page key painted, previous name gone, `A39`), `:482` (moved text re-anchored into `#p3`, `A29`), `:504` (vanished text → `anchor_not_found`, record still stored, `A24`/`A36`), `:525` (every port call is a `get`) |
| AC1 cost | One tick = one `location.href` read + one string compare; no DOM read, no stream rebuild, no storage read | **pass** | `src/content/refresh/url-change-watch.ts:79-88` is the only per-trigger body; `:103` `win.setInterval(check, pollMs)`; module has zero imports (pinned `tests/content-spa-refresh.spec.ts:586`) and the forbidden-token scan `:566-584`; production call site passes no interval (`src/content/main.ts:151`, pinned `tests/content-spa-refresh.spec.ts:547`) |
| AC2 | `chrome.storage.onChanged`: this page's slot or `settings:v1` repaints within one repaint; another page's slot does nothing; `pages:v1` is not a signal; no queue/merge/throttle/lock | **pass** | `tests/content-cross-tab-refresh.spec.ts:272`, `:297`, `:318`, `:326`, `:338`, `:346`, `:352` (3 records → 3 repaints), `:360`; predicate is the core helper — `src/content/refresh/storage-change-watch.ts:38,78` calls `storageChangeConcernsPage`; adapter half `tests/content-chrome-storage-port.spec.ts` (keys handed out, non-`local` areas filtered, teardown); single subscriber pinned at `tests/toolchain-contract.spec.ts:320` → only `src/content/store/chrome-storage-port.ts` names `chrome.storage.onChanged` in code; grep of `src/content/` shows `chrome.storage.*` calls only in that adapter (`:69-75`, `:124-127`) |
| AC3 | A settings-name change reaches an already-loaded page: a previously refused card opens; an entry that became "mine" changes its edit affordance (`A31`, `A25`) | **pass** | `tests/content-cross-tab-refresh.spec.ts:369` (settings key → one repaint, pass re-reads the name), `:384` (ownership comparison flips), `:401` (foreign→own entry now opens the editor on the next selection), `:456` (the card the missing name refused now opens), `:480`, `:492` |
| AC4 | README + final verification half | **moved out of this slice** to `t4-04` by the brief; not covered by tests here, and per the brief their absence is not a finding |
| Gates | `npm test`, `npm run build`, `node scripts/check-agent-config.mjs` green and quoted | **pass** — quoted in `docs/state/t4-03-engineer.md` ("Commands run": 41 files / 778 tests, build 10 files, checker 0/0/86); PM re-ran them personally (`docs/state/t4-03-spa-refresh-docs.md`, "PM gates re-run personally"); I re-ran the checker myself (below) |

## Boundaries checked

- `git diff --numstat bd238c9..HEAD -- src/` → `main.ts 42/3`, `page-painter.ts 24/0`, `storage-change-watch.ts 87/0`, `url-change-watch.ts 113/0`, `chrome-storage-port.ts 88/0`, `storage-keys.ts 31/0`. No other `src/` path touched; `src/manifest.json` diff empty, permissions still `"storage", "tabs"` (`src/manifest.json:6`).
- **No main-world patching, no page-DOM mutation.** Grep over `src/` finds `pushState`/`history` only in comments (`src/content/main.ts:147`, `src/content/refresh/url-change-watch.ts:13,17`); the shipped watch adds listeners only (`url-change-watch.ts:99-101`) plus one interval (`:103`); no `defineProperty`, no `prototype`, no assignment to any page object in the new modules.
- No network call, no message passing (`fetch`/`XHR`/`WebSocket`/`sendMessage`/`connect` absent from all four new/changed modules), no new dependency (`package.json` untouched), no new runtime library.
- No new Russian UI string: the whole `src/` diff contains no Cyrillic line; no stale-entry label anywhere — «запись недоступна» exists only as the Terms row `docs/specs/inline-comment-model.md:34` (`A86` respected).
- No `src/popup/` or `src/options/` file in the range; CF1 is test-only.
- Harness: `.pi/`, `docs/specs/INDEX.md`, `scripts/` untouched → no `timeoutMs`/role-frontmatter question; checker re-run required by the brief and done.

## Carried fixes

- **CF1** — **done.** `tests/toolchain-contract.spec.ts`: (a) empty-state paragraph — `:492-508` asserts `<p class="empty">{{ emptyState }}</p>` and that its only gate is `@if (view().rows.length === 0)`, with the wording held only by `src/popup/text.ts`; (b) document order — `:444-469` asserts both `class="notice notice--name"` and `class="notice notice--not-injectable"` precede `class="rows"`, and that they are the `@if`/`@else` branches of one loop; (c) nesting — `:471-490` asserts `blocksAround('class="rows"') === ['@else']`, the checkbox and `class="delete"` chains are exactly `['@else','@for (row …)']`, no frame on those paths mentions ownership/name/restricted, and the template has no `@if (…own…)` at all. Mutation behaviour verified by static trace of the brace walk against `src/popup/popup.component.ts:65-95`: wrapping `Удалить` in `@if (row.isOwn)` adds a third frame and breaks `toEqual(rowChain)` (`:478-482`); moving the notice loop below the list breaks `toBeLessThan(listAt)` (`:460-461`). Exact-chain `toEqual` (not "contains") is what makes the pin mutation-sensitive; I did not re-run the mutation myself (read-only role), and the report's claim holds under the shipped template. Behaviour half stays pinned at `tests/popup-entry-list.spec.ts:402,443`.

## The `src/core/` change (`A87`) — judgement

`git diff bd238c9..HEAD -- src/core/` is **exactly one appended function plus its doc block** (31 insertions, 0 deletions); no existing function, code path, error or rule altered. `src/core/storage-keys.ts:70-78` is pure and total: its blank guard `pageKey.trim().length === 0` is the *same* predicate as the throw guard in `src/core/slot-key.ts:95-97`, so the helper avoids exactly the one input that would throw, and nothing else. Branch table covered at `tests/core-storage-keys.spec.ts:166-204`: settings key with page/`null`/`''`; own slot; trimmed-page equivalence; other page's slot; the index; a foreign key; a near-miss prefix and a truncated slot; and the empty / whitespace-only / `null` page key against an entry key. **Layering judgement: core vocabulary, not page policy.** The function answers only "can this storage key change what this page shows", i.e. it is a statement about the key layout owned by `docs/specs/inline-comment-model.md` → Storage; the *policy* (repaint, once, no merge) stays in `src/content/refresh/storage-change-watch.ts:75-84`. Moving the slot-key decode into the content layer would have broken the decode invariant (`inline-comment-model.md:56`); `A87` is the correct placement.

## Spec/code agreement

Checked pair by pair: address-based watch ↔ spec `content-overlay-ui.md:84` ("one compare against the address the watch last saw") + Edge Case `:161`, pinned by `tests/content-spa-refresh.spec.ts:451`; one repaint per record ↔ `:85` ("One relevant record is one repaint: no queue, merges nothing, takes no lock, replays no payload"), pinned at `tests/content-cross-tab-refresh.spec.ts:352`; `pages:v1` not a signal ↔ `:85`, pinned at `:338` and `tests/core-storage-keys.spec.ts:184-186`; watches own no resolve / no `CSS.highlights` / no storage read ↔ `:84`, pinned by the text scan; `pagehide`/`pageshow` not triggers ↔ `:84` matches the shipped listener set (no gap between spec and code, but unpinned — see remark 2). No spec sentence contradicts the code, so this is not a `blocked` case.

## Blocking findings

None.

## Non-blocking remarks (each is a finding in the "named, referenced" sense; none blocks)

1. `docs/specs/content-overlay-ui.md:84-85` never states that the two watches are **never torn down** in a content script; the state file (`t4-03-spa-refresh-docs.md`, "Accepted as decisions") claims these decisions are "all recorded in the spec". One clause ("the teardown of both watches exists for tests only; the interval lives for the life of the document") would make that claim true. Code: `src/content/main.ts:150-168` discards both returned teardowns.
2. Spec `content-overlay-ui.md:84` "`pagehide` / `pageshow` are deliberately not triggers" has no test, and `tests/content-spa-refresh.spec.ts:590-599` pins one interval and the two address listeners but not the **absence** of any other listener. Code today is compliant (`src/content/refresh/url-change-watch.ts:99-101`).
3. `A88`'s consequence — a write that touches only `pages:v1` is not noticed — is recorded in the task state file, not in the spec bullet `docs/specs/content-overlay-ui.md:85`. The bullet states the rule and its reason; the consequence sentence is one line short.
4. `PagePainter.pageKeyOfPass()` has no test for its `null` states (`src/content/paint/page-painter.ts:196,208`); the core `null` branch it feeds **is** covered (`tests/core-storage-keys.spec.ts:200-202`). The end-to-end "no page key yet → only the settings key moves me" path is unpinned.
5. `src/core/storage-keys.ts:67-68` calls the helper "pure and total"; a lone-surrogate `pageKey` would still throw through `entryStorageKey` → `slotKeyFor` → `escapeCodePoint`. That case is declared out of scope by `src/core/slot-key.ts:34-36`, so this is a wording remark only.
6. The CF1 pins depend on the popup keeping an **inline** template (`tests/toolchain-contract.spec.ts:373-381` throws a named error otherwise), and the brace walk recognises only `@if (`, `@for (`, `@else`; an `@else if` or `@if(` would surface as a wrong frame chain in `toEqual`, i.e. fail loudly. Acceptable, worth knowing before the popup is refactored.
7. Spec-commit split: code in `adfc8e9`, the spec lines in `79acb74`/`e0ae2ec`. Both inside the reviewed range and the brief names the spec file, so per the `A69` exception in `docs/specs/code-review-flow.md` this is a remark, not a finding.

## Engineer residual risks 1–5

1. No browser run — **acceptable v1 debt for this slice**: AC1–AC3 are pinned against the shipped modules; the browser list is `t4-04`'s deliverable by the brief.
2. One repaint per record, unthrottled — **acceptable**: it is `A60`/`A88` as spec'd (`:85`) and pinned; a local throttle would violate the spec, so the fix is a ruling, exactly as the report says.
3. Address-based watch misses same-address re-renders — **acceptable**: written into the spec Edge Case `:161` and pinned by `tests/content-spa-refresh.spec.ts:451`.
4. `hashchange` relying on jsdom queueing — **acceptable**: the test awaits the document's own event and fails loudly if jsdom stops firing it.
5. CF1 pins read the inline template — **acceptable**: the extractor throws with a named error rather than passing vacuously.

## Evidence

- `git log --oneline bd238c9..HEAD`, `git diff --stat bd238c9..HEAD`, `git show --stat` per commit (file sets above).
- `git diff bd238c9..HEAD -- src/core/`, `-- src/`, `-- docs/specs/content-overlay-ui.md`, `-- tests/toolchain-contract.spec.ts`.
- `node scripts/check-agent-config.mjs` (re-run by me, as the brief instructs) → `0 error(s), 0 warning(s), 86 info(s)`.
- Read-only corroboration: `git ls-files 'tests/*.spec.ts' | wc -l` → **41**; `it(`/`test(` declarations **778** at `HEAD` vs **734** at `bd238c9` (**+44**); `git grep` for `.skip(`/`.only(`/`xit(`/`xdescribe(` → **no matches**; `git status --porcelain` → **empty**.
- Full-suite and build output are quoted in `docs/state/t4-03-engineer.md` ("Commands run") and re-run personally by the PM per `docs/state/t4-03-spa-refresh-docs.md`; I did not re-run them (read-only role).