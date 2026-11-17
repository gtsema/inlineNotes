# Engineer report — `t4-03b-watch-pins`, attempt 1

Task: the three non-blocking remarks the accepted `t4-03` review left open (items **2, 4, 5** of
`docs/state/t4-03-review.md`). Test-only plus one comment reword. **No behavior change was made or
needed**; every shipped module under `src/` except one comment block is byte-identical to `4d05bdf`.

## Commit

- `a35e46f` — `test(t4-03b): pin the closed trigger set and the null page key, and name the totality boundary`
  (one commit, on top of the PM's `t4-03` acceptance commit `4d05bdf`).
- Files in the commit (`git show --numstat a35e46f`): `src/core/storage-keys.ts` (+10/−2, comment only),
  `tests/content-spa-refresh.spec.ts` (+191/−2), `tests/content-page-painter.spec.ts` (+79/−1),
  `tests/content-cross-tab-refresh.spec.ts` (+66/−2), `tests/core-storage-keys.spec.ts` (+5/−1).
- `git status --porcelain` after the commit: empty. Nothing staged, nothing modified, `dist/` is gitignored.

## Gates (ruling `A62` order, quoted)

1. `npm run build`

   ```
   [build] manifest references resolved: content.js, popup/index.html, options/index.html
   [build] dist/ is a self-contained MV3 folder (10 files)
   ```

2. `npm test`

   ```
    Test Files  41 passed (41)
         Tests  789 passed (789)
   ```

   778 before the slice → **789**, **+11** new tests (4 + 3 + 4 below). No `.only`, `.skip`, `xit`,
   `xdescribe` in any changed file.

3. `node scripts/check-agent-config.mjs`

   ```
   0 error(s), 0 warning(s), 86 info(s)
   ```

Extra (not a gate): `npm run typecheck` → no output, i.e. all three `tsc` projects clean, which covers
the four changed test files.

## Item 1 (AC1) — the trigger set and the missing teardown are pinned

Spec sentences pinned: `docs/specs/content-overlay-ui.md:84` — "`pagehide` / `pageshow` are deliberately
not triggers: bfcache restore is the reload path…" and "Neither watch is ever torn down in a content
script… the interval lives for the life of the document."

- `tests/content-spa-refresh.spec.ts:614-620` — inside the existing text scan
  (`installs one interval and one compare…`, `:598-621`), an **exact listener list** instead of a per-name
  `toHaveLength(1)`: the `addEventListener('<name>'` occurrences must equal
  `['popstate', 'hashchange', 'visibilitychange']`. An added trigger of any name fails.
- `tests/content-spa-refresh.spec.ts:625-714` — helpers: `WatchAttachment` (`:625`), `AddListenerLike`
  (`:630`), `recordAttachments` (`:645`), `UNTRIGGERED_LIFECYCLE_EVENTS` (`:704`).
  `recordAttachments` temporarily overrides `addEventListener` on the real `window` and `document` and
  `setInterval` on `window` with wrappers that **call through**, so the shipped watch is really attached
  and only the set of triggers becomes observable; the original property descriptors are captured at
  `:669-671` and re-applied in a `finally` at `:686-693`.
- `tests/content-spa-refresh.spec.ts:716-755` — new describe
  `AC1 — the trigger set is exactly the one the spec names (spec Rules)`:
  - `:717` `installs two window listeners, one document listener and one interval, and nothing else` —
    `toEqual` on the ordered `[{window,popstate},{window,hashchange},{document,visibilitychange}]`
    (`:728-732`) plus `intervals === 1` (`:733`). Any extra event, a listener moved to the other target,
    or a second interval fails. The pin calls the returned teardown, so it leaves no live interval or
    listener behind.
  - `:736` `answers nothing to 'pagehide' / 'pageshow' or any lifecycle event, though the address moved`
    — boots the shipped watch with `pollMs: 0` (no timer), moves the address with `history.pushState`,
    dispatches `pagehide`, `pageshow`, `freeze`, `resume`, `beforeunload`, `focus`, `blur`, `online`,
    `offline` on **both** targets, then asserts `navigations() === []` (`:751`), `repaintCount() === 0` (`:752`) and
    that the address really moved (`:750`) so the silence is the trigger set, not a dead fixture.
- `tests/content-spa-refresh.spec.ts:757-789` — new describe
  `AC1 — neither watch is ever torn down in a content script (spec Rules)`, a text scan of
  `src/content/main.ts` (`codeOnly`):
  - `:761` each of `attachUrlChangeWatch` / `attachStorageChangeWatch` appears **exactly once at line
    start** (a bare expression statement, `:766`), never as the right-hand side of a `const`/`let`/`var`
    (`:767-769`) and never behind `return` (`:770`) — no code path ever holds a teardown handle;
  - `:774` `src/content/main.ts` contains none of `pagehide`, `pageshow`, `beforeunload`, `unload`,
    `removeEventListener`, `clearInterval`, `clearTimeout`, `Teardown` (`:776-787`) — there is no unload
    step to tear down from, which is the second half of the spec sentence.

### Load-bearing proof (mutations actually run, then reverted)

| Mutation (temporary) | Assertion that broke |
|---|---|
| Add `win.addEventListener('pagehide', check)` to `src/content/refresh/url-change-watch.ts` (listener only) → **3 failed / 18 passed** | `AC1 — what one tick costs > installs one interval and one compare…` at the new exact-list line (`expected [ …(4) ] to deeply equal [ …(3) ]`, `tests/content-spa-refresh.spec.ts:616`); `AC1 — the trigger set… > installs two window listeners… and nothing else` (`expected [{target:'window',…},…(3)] to deeply equal […(2)]`, `:728`); `… > answers nothing to 'pagehide' / 'pageshow'…` (`navigations` non-empty, `:751`) |
| Same `pagehide` listener **plus** a second `win.setInterval(check, pollMs)` → **4 failed / 17 passed** | the three above, plus the pre-existing `setInterval(` count (`expected ['setInterval(', 'setInterval(' ] to have a length of 1 but got 2`, `:606`) and pre-existing `AC1 — the triggers… > stops noticing once the watch is detached` (the extra interval survives the teardown, so the detached watch keeps noticing) |
| `src/content/main.ts`: bind the url watch teardown (`const stopUrlWatch = attachUrlChangeWatch(…)` + a `pagehide` listener that calls it) → **2 failed / 19 passed** | `AC1 — neither watch is ever torn down… > attaches each watch once, as a statement that drops the returned teardown` (`expected [] to have a length of 1 but got +0`, `:766`); `… > owns no unload step and no teardown call at all` (`expected '…' not to contain 'pagehide'`, `:786`) |

All three mutations were reverted with `git checkout --` before the gates; `git status` was verified empty
of mutations before `git add`.

## Item 2 (AC2) — the `null` half of `PagePainter.pageKeyOfPass()` is pinned

- `tests/content-page-painter.spec.ts:544-612` — new describe
  `the page key of the last pass ('pageKeyOfPass', t4-03 review remark 4)`:
  - `:545` `answers null before any pass has run, having read nothing` — `pageKeyOfPass()` is `null` and
    `port.calls` is empty (`:551`), so the answer is the state of the pass, not a guess from the address
    seam.
  - `:555` `answers null after a pass that could not read the page address` — the `input.url()` seam
    throws; `outcome.readCodes` is exactly `['url_unparsable']` (`page-painter.ts:197`) and the accessor
    answers `null`. Pins `page-painter.ts:196`.
  - `:573` `forgets the page key it had after a pass whose core read threw` — a **good pass first**
    (`pageKeyOfPass() === PAGE_KEY`), then the reset; pins `page-painter.ts:208`. The reachable throw of
    the read stage is seeded at `:584`: the `pages:v1` index lists
    `PAGE_KEY + '?x=\ud800'` (`LONE_SURROGATE`, `:75`), which `resolvePageKey` hands back through the
    `origin + pathname` fallback, so `entryStorageKey` → `slotKeyFor` → `escapeCodePoint` throws out of
    core. Result: `outcome.pageKey === null`, `readCodes === ['storage_unavailable']`,
    `pageKeyOfPass() === null`, and the stored slot is untouched.
  - `:597` `keeps the key of a pass that resolved this page but reported a read it will not paint from` —
    the boundary of the two `null`s: a malformed index is a `storage`-read failure reported as the
    `index_malformed` **code**, which is the untrustworthy-read branch (`page-painter.ts:212-222`), and
    there the key stays, exactly as the pass reports it in `outcome.pageKey`.
- `tests/content-cross-tab-refresh.spec.ts:205-242` — the fixture grew `Boot.firstPass?:
  'run' | 'none' | 'address-throws'` (`:212`) and the matching seams (`:231-236` throwing address,
  `:240` skip the load-time pass). `run` is the shipped boot and is what every pre-existing test uses.
- `tests/content-cross-tab-refresh.spec.ts:387-430` — new describe
  `AC2 — with no page key yet, only the settings key moves the page (review remark 4)`:
  - `:388` with `firstPass: 'none'`, `pageKeyOfPass()` is `null` and firing this page's **own** slot, the
    page index and a foreign key is no work at all: `repaintCount() === 0`, no extra storage read
    (`:399`), no paint written to the surface (`:400`);
  - `:405` firing `settings:v1` alone repaints once, the pass that follows resolves `PAGE_KEY`, and only
    then does the page's own slot become a signal (second repaint);
  - `:417` with `firstPass: 'address-throws'` the own slot is still no work, `settings:v1` repaints once,
    and the repaint of an address-less document leaves `pageKeyOfPass()` `null` — the state is stable.
- Mutation proof: removing **both** `passPageKey = null` resets (`page-painter.ts:196,208`) →
  `forgets the page key it had after a pass whose core read threw` fails
  (`expected 'https://example.test/article' to be null`). Making `pageKeyOfPass()` fall back to
  `pageKeyFromUrl(input.url())` → **5 failed**: `answers null before any pass has run…`,
  `answers null after a pass that could not read the page address` (the injected address throw escapes
  the accessor, i.e. the accessor is pinned not to read the address), `forgets the page key…`, and the
  end-to-end `is no work for any slot, not even this page's own…` and
  `follows no slot after a pass that ended early without an address`.

## Item 3 (AC3) — the overstated comment now names the real boundary

- `src/core/storage-keys.ts:67-76` (the doc block of `storageChangeConcernsPage`, `:78`). Replaced
  `Pure and total: an empty or whitespace-only 'pageKey' answers 'false' …` with a block that states:
  total **over every `pageKey` this extension can produce**, that the blank guard exists so a change
  record is never a throw path for a listener, and that **malformed input is not guarded** — a
  lone-surrogate `pageKey` still throws through `entryStorageKey` → `slotKeyFor` → `escapeCodePoint`,
  exactly the input `src/core/slot-key.ts:34-36` declares out of scope, and a guard here would be a new
  core rule. **Comment text only**: the function body (`:78-86`) is unchanged, no guard, no validation.
- `tests/core-storage-keys.spec.ts:197-208` — the test whose title repeated the retired claim
  (`is total: an empty page key answers false…`) is retitled
  `answers false for an empty page key instead of reaching the slot guard (the totality boundary)`, and
  its comment now names the surrogate boundary and states that nothing is asserted for it on purpose.
  **No assertion changed** (the three `expect`s are the same three as before).

## Deviations (2, both small and test/doc-side only)

1. **One extra file touched**: `tests/core-storage-keys.spec.ts:197-208`. The brief named AC3 as a
   `storage-keys.ts` comment, but the same overstated claim sat in the title of the test that covers that
   guard; leaving "is total" next to a comment that says "not total over malformed input" would have put
   the contradiction into the same commit. Title + comment only, no assertion touched. A one-line revert
   restores it if the PM prefers strict file-minimalism.
2. **Four pins in `tests/content-page-painter.spec.ts` instead of two.** The brief asked for "before any
   pass" and "after an early-failing pass"; I added the address-throw and the read-throw as two separate
   cases (they are two different `catch` blocks, `:192` and `:204`) and the `index_malformed` case at
   `:597` to mark where the `null`s stop, so a later "fix" cannot null the key on every non-painting pass
   and silently un-follow a page whose slot is fine. Test-only, no shipped-code effect.

No acceptance criterion of the card was reinterpreted; nothing was invented.

## Done deliberately / out of scope, respected

- **No guard, no validation, no new core rule** for a lone-surrogate `pageKey`. The card says escalate if
  I believe one is deserved; I do not: `pageKeyFromUrl` never produces one, `slot-key.ts` already declares
  it out of scope, and the AC2 reset fixture at `tests/content-page-painter.spec.ts:573` shows the current
  answer is already safe (the pass ends empty, stores nothing, the entry survives). No escalation needed.
- **No throttle, queue, merge or lock** in either watch (`A60` / `A88`); no change to
  `src/content/refresh/storage-change-watch.ts` or `url-change-watch.ts`.
- **No spec edit.** The two sentences AC1 pins already live in `docs/specs/content-overlay-ui.md:84` (the
  PM added them in `4d05bdf`), no specified behavior changed, and AC 23's pin-file list still names the
  same four files. `docs/specs/INDEX.md` unchanged.
- Untouched: `src/manifest.json` (permissions still `storage`, `tabs`), `src/popup/`, `src/options/`,
  `README.md`, the browser verification list (`t4-04`), `docs/state/t4-03b-watch-pins.md`, `docs/retro.md`,
  `.pi/`, `scripts/`.
- No new dependency; no `vi.spyOn` (hand-rolled descriptor capture, matching this file's existing
  `setVisibility` pattern at `tests/content-spa-refresh.spec.ts:331-352`).
- No browser run: `dist/` builds and is loadable, but the observable-behavior list is `t4-04`'s deliverable.

## Notes for the reviewer

- jsdom owns `addEventListener` / `setInterval` on the `window` and `document` **objects**, not only on the
  prototypes: a `delete`-only restore destroys them for the next test in the file
  (`TypeError: win.addEventListener is not a function`). `recordAttachments` therefore captures and
  re-applies the original descriptors (`tests/content-spa-refresh.spec.ts:669-693`). Hit during
  development, fixed, and worth knowing before anyone else wraps a page API in this suite. The existing
  `setVisibility` helper (`:331-345`, with its own restore at `:352`) documents the same jsdom trait for a
  prototype-owned property.
- A **failing storage read is not an early-failing pass**: core converts it to the `storage_unavailable` /
  `index_malformed` codes (`src/core/page-index-store.ts:113-121`,
  `src/core/entry-store-read.ts:213-215`) and the pass keeps the resolved key. The only reachable route to
  the pass's own read `catch` is a page key the slot encoder refuses, which is why the AC2 reset fixture
  seeds a hostile index element — and it is the very boundary AC3's comment names. The two are the same
  finding, viewed from the comment and from the pass.
- The `main.ts` pins are text scans (the technique this file already uses for the watch module at
  `:578-621`), because booting `main.ts` in a unit test is impossible (it needs `chrome.*`). They fail
  loudly, not vacuously: a reformat that moves an attach call off the line start, or any teardown handle,
  breaks a named assertion.
- `docs/state/t4-03-review.md:39` still asserts "pure and total" for this helper. That file is a frozen
  review artifact and I did not edit it; the code claim it repeats is now corrected.

## Open questions

- None for this slice. One for `t4-04` bookkeeping only: whether the PM wants the reviewer's remark-5
  wording claim in `docs/state/t4-03-review.md:39` annotated, or left as the historical record.
