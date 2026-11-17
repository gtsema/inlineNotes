# Engineer report — task `t4-03-spa-refresh-docs`, attempt 1

Role: extension-engineer. Slice as briefed: the code and the test-only pins of
`t4-03` AC1 (same-document URL change), AC2 (`chrome.storage.onChanged`, ruling `A60`),
AC3 (settings name picked up by a loaded page) and carried fix CF1 (popup render
contract pins). README work, spec-surface cleanup, browser verification, `src/options/`
and any `src/popup/` behavior beyond CF1 were out of scope and were not touched. The
task state file was not modified.

## Commits (all on `main`, working tree clean)

| Commit | Content |
| --- | --- |
| `adfc8e9` feat(t4-03): the page keeps up with itself — storage watch and url watch | shipped code: `src/core/storage-keys.ts`, `src/content/store/chrome-storage-port.ts`, `src/content/refresh/url-change-watch.ts`, `src/content/refresh/storage-change-watch.ts`, `src/content/paint/page-painter.ts`, `src/content/main.ts`; tests `tests/core-storage-keys.spec.ts`, `tests/content-chrome-storage-port.spec.ts`, `tests/content-cross-tab-refresh.spec.ts` |
| `79acb74` test(t4-03): the same-document navigation watch and the spec lines it pins (AC1) | `tests/content-spa-refresh.spec.ts` (new, 17 tests) + the `docs/specs/content-overlay-ui.md` lines this slice owns |
| `e0ae2ec` test(t4-03): the popup render contract, pinned as order and nesting (CF1) | `tests/toolchain-contract.spec.ts` + the AC22 tail clause of the overlay spec |
| `c2d74ab` test(t4-03): the visibility restore compiles under the strict delete rule | one cast in `tests/content-spa-refresh.spec.ts` so `tsc -p tsconfig.spec.json` accepts the `delete` operand |

## AC1 — a same-document URL change re-resolves the page

Shipped: `src/content/refresh/url-change-watch.ts` — `attachUrlChangeWatch(window,
document, { url, onUrlChange, pollMs? })`. Triggers: `popstate`, `hashchange`,
`visibilitychange` (only while the document reports `visible`) and
`setInterval(check, pollMs)` with the `A59` default `URL_POLL_MS = 1000`. Every trigger
funnels through one `check` that reads `options.url()` once and compares one string;
`teardown` removes the three listeners and clears the interval. Wired in
`src/content/main.ts` as `attachUrlChangeWatch(window, document, { url: pageUrl,
onUrlChange: () => { void painter.refresh(); } })`. The watch owns no resolve, no
`CSS.highlights` write and no storage read: the single `paint pass` in
`src/content/paint/page-painter.ts` is the only thing that repaints.

Tests — `tests/content-spa-refresh.spec.ts` (real `history.pushState` on a real jsdom
document, real `PagePainter` over `MemoryStoragePort` and a recording `PaintSurface`):

- `notices a pushState move on the polling interval, with no event dispatched at all (A59)`
  — the polling half alone catches an isolated-world `pushState`;
- `notices a back/forward move on popstate, with the timer switched off`,
  `notices a fragment move on the hashchange the document itself sends, with the timer
  switched off`, `catches up on visibilitychange, because a hidden document had its
  timer throttled` — each event suffices on its own (`pollMs: 0` disables the timer);
- `answers nothing for a visibility change that is the document going away` — the
  `visibilityState: 'hidden'` half of the rule;
- `stops noticing once the watch is detached`;
- `does nothing for popstate, hashchange, visibilitychange and an arbitrary number of
  ticks`, `does nothing when the site pushed the address it already had` — no repaint,
  and `port.calls` proves no extra core read;
- `paints the new page key and removes the paint of the previous one (A39)` — the held
  paint names go from the page-one entry to the page-two entry, `pageKeyOfPass()` moves;
- `paints a note whose words the site moved into another element (A29)` — the fresh
  stream re-resolves: the painted fragment's `parentElement.id` goes from `p1` to `p3`
  after a `?utm_source=newsletter` move (core drops the noise parameter, so the page key
  and the watched slot key do not move);
- `stops painting a note whose words the page deleted, and stores it on (A24, A36)` —
  nothing painted, the pass reports `{ entryId, reason: 'anchor_not_found' }`, and the
  stored slot still holds the record (not deleted, still listed and deletable);
- `never writes, whatever the page did to itself` — every port call of every repaint is
  a `get`;
- `keeps the shipped interval at the value the spec names` — `URL_POLL_MS` is asserted
  against the `url poll interval` Terms row of the spec (value **and** constant name
  read out of the file), the same shape as the `A63` `settle delay` pin;
- `uses the pinned interval at the production call site, where no interval is passed` —
  no repaint at `URL_POLL_MS - 200`, one repaint after;
- cost of a tick (`A59` cost condition), from the text of the module: no
  `querySelector` / `getElementById` / `createRange` / `getBoundingClientRect` /
  `getClientRects` / `textContent` / `innerHTML` / `buildTextStream` / `loadEntries` /
  `CSS.highlights` / `entryStorageKey` / `chrome.`; zero imports, so a tick cannot reach
  another layer; exactly one `setInterval(` and one `clearInterval(`, and the interval
  and both address events all use the same `check`.

## AC2 — `chrome.storage.onChanged` per ruling `A60`

Shipped: the subscription lives in the one storage adapter
(`src/content/store/chrome-storage-port.ts`): `watchChromeStorageLocalChanges(zone,
onChange)` filters every area that is not `local` and reports the changed keys;
`createChromeLocalStorageChangeZone()` wraps live `chrome.storage.onChanged`;
`createChromeLocalStorageChangeSource()` is a function, so importing or constructing
touches no `chrome` global. The policy of which keys concern a page is core:
`storageChangeConcernsPage(storageKey, pageKey)` in `src/core/storage-keys.ts`. The
content watch `src/content/refresh/storage-change-watch.ts` (`attachStorageChangeWatch`)
maps one relevant record to exactly one `onRepaint`, with no queue, no merge, no lock and
no replay of the change payload.

Tests — `tests/content-cross-tab-refresh.spec.ts`:

- AC2: `repaints the entry another tab edited, with the comment that was written`,
  `removes the highlight the popup hid, which is what browser item 6 of t3-02 could not
  see`, `repaints when the slot key alone is reported, as one tab writing looks to Chrome`;
- AC2 negative half: `does nothing for another page slot key`, `does nothing for the page
  index alone, which every write elsewhere touches`, `does nothing for a key this
  extension does not own`, `stops the repaint path once the watch is detached`;
- no batching: `records one repaint per relevant change record: no queue, no merge, no
  lock (A60)` — three relevant records, three repaints;
- core predicate — `tests/core-storage-keys.spec.ts`: `counts the settings record
  whatever the page is`, `counts the entry slot of exactly that page key`, `ignores
  another page slot, the page index and a key this extension does not own`, `refuses a
  near-miss slot instead of matching on a prefix`, `is total: an empty page key answers
  false for entry keys, without the slot guard`;
- adapter half — `tests/content-chrome-storage-port.spec.ts`: `hands the listener the keys
  that changed`, `filters every other storage area out, because this extension has one
  area`, `detaches the listener on teardown, which is what a later task relies on`, `is
  built by a function, so constructing the page subscription touches no chrome global`;
- channel ownership (ruling `A50` pairing) — `tests/toolchain-contract.spec.ts`:
  `keeps the repaint channel on the page side: one chrome.storage.onChanged subscriber
  in src` asserts the only shipped `chrome.storage.onChanged` mention is the adapter, and
  the pre-existing popup pin (`not.toMatch(/chrome\.storage\.onChanged/)`) still holds.

## AC3 — a settings-name change reaches a loaded page

No new shipped rule was needed for the widget half, because ruling `A31` already makes
every capture attempt do one fresh core settings read; what this slice adds is that the
**painted page** follows the name: `SETTINGS_KEY` is in the watched set, so a name change
is one repaint, and `authorNameOfPass()` (the value the tooltip's `ownership header`
compares against) is re-read by that pass.

Tests — `tests/content-cross-tab-refresh.spec.ts`:

- `repaints on the settings key, so the pass reads the new author name`;
- `flips the ownership comparison the tooltip header shows, with no reload`;
- `opens the editor of an entry that became the reader's own on the next selection` — the
  shipped `claimSelection` handover plus the shipped `EditorController.openFor`, with the
  claim pinned as a boolean (`openFor` returns `true` for a foreign claim and opens
  nothing, per ruling `A25`);
- `opens the card the missing name refused, once a name exists` — the previously refused
  card opens on the next capture without needing a repaint;
- `follows the settings key once, and the page key it follows is the pass's own`;
- `the entry the selection points at is the entry the watch repainted` — Flow 6 claims the
  entry as the repaint left it, not as the load found it.

## CF1 — popup render contract pins

`tests/toolchain-contract.spec.ts` now scans the popup **template** (extracted from the
component metadata) with a control-flow brace walk, so an anchor is answered with the
blocks that actually enclose it (`@if (…)`, `@for (…)`, `@else`):

- `renders both notice lines above the list, in document order (A81, A83; t4-03 CF1)` —
  both `class="notice notice--name"` and `class="notice notice--not-injectable"` precede
  `class="rows"`, and their nesting is the `@if` / `@else` pair of one loop over
  `view().notices`, so no notice code can lose its branch;
- `renders the list, the checkbox and Удалить outside every notice and outside any
  ownership condition (A25, A83; t4-03 CF1)` — `class="rows"` is enclosed only by the
  `@else` of the empty check; `class="delete"` and `type="checkbox"` only by that pair
  plus the row loop; no frame on those paths mentions ownership/name/restricted; and the
  template contains no `@if (…own…)` at all, because the ownership marker is a class;
- `renders the empty state as the only alternative to the list (t4-03 CF1)` —
  `<p class="empty">{{ emptyState }}</p>` exists, is gated only by
  `@if (view().rows.length === 0)`, is fed by `POPUP_STRINGS.emptyState` as a component
  field, and the Russian sentence is held only by `src/popup/text.ts`. The behavior half
  ("a page with no rows answers `rows: []`", "deleting the last row leaves the empty
  state") is already pinned in `tests/popup-entry-list.spec.ts`.

Mutation-checked, both directions: wrapping `Удалить` in `@if (row.own) { … }` makes the
nesting pin fail; moving the notice loop below the list makes the order pin fail (and the
nesting pin too). The component file was restored byte-for-byte afterwards and `git
status` confirms `src/popup/popup.component.ts` is unmodified.

## Spec edit in the same change (`docs/specs/content-overlay-ui.md`)

- Terms / Aliases: three new rows — `url watch`, `url poll interval` (**1000 ms**,
  `URL_POLL_MS`, "one tick costs one address read and one string compare, and no DOM
  read"), `storage watch`;
- Flow 7: the popup checkbox repaints the page through the storage write, with the
  `storage watch` named as the shipped listener (the "until `t4-03` lands" sentence is
  gone); Flow 8: the `url watch` notices, the pass re-reads the new `pageKey`, resolves
  against a freshly rebuilt stream, drops the old paint names, paints the new set, and
  deletes nothing;
- Rules / Semantics: three new bullets — same-document navigation (`A59` + why polling
  is the only way an isolated-world script sees `pushState`, and why `pagehide`/
  `pageshow` are deliberately not triggers), cross-tab repaint (`A60`, including why
  `pages:v1` is **not** a signal and that the cross-tab last-writer-wins limit is
  unchanged), settings name picked up without a reload (`A31`, `A25`), plus the
  re-worded hover bullet ("the `url watch` of `t4-03`");
- Edge Cases: "two tabs on the same page" now states the shipped answer (the other tab's
  highlights repaint with no reload, the popup on reopen); two new cases — a site that
  never changes the address, and a background tab whose throttled timer is caught by
  `visibilitychange`;
- "Page-boundary throws": the intro now states that the two watch modules ship no
  `catch` and that the only thing they do is read `window.location.href` or the keys of
  the record they were handed, and that the call they make is the non-rejecting
  `PagePainter.refresh()`;
- Acceptance Criteria: new AC 23 for `t4-03` AC1-AC3, and the AC 22 tail now says the
  popup contract is pinned as an order-and-nesting fact (CF1).

## Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed (after `c2d74ab`; earlier it reported one `TS2790` in the new test, fixed there) |
| `npm run build` | passed — `dist/ is a self-contained MV3 folder (10 files)`, `dist/content.js` 120271 bytes, manifest references resolved |
| `npm test` | passed — `Test Files 41 passed (41)`, `Tests 778 passed (778)` |
| `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 86 info(s)` (the 86 info lines are the pre-existing "planned path not created yet" notes in the model spec) |
| `git status --porcelain` | empty — nothing staged, nothing uncommitted |
| `npx vitest run tests/content-spa-refresh.spec.ts`, `… tests/toolchain-contract.spec.ts`, `… tests/core-storage-keys.spec.ts`, `… tests/content-chrome-storage-port.spec.ts`, `… tests/content-cross-tab-refresh.spec.ts` | passed individually while building (17 / 32 / 18 / 11 / 14 tests) |

## Deviations and decisions taken inside the brief

1. **Two shipped symbols beyond the literal AC wording.** `PagePainter.pageKeyOfPass()`
   was added so the storage watch follows the page key the **last pass resolved** (the
   core read can answer under an `origin + pathname` index fallback, and after an SPA
   move the watched key must move with the pass). It is a read accessor: no business rule
   changed. `storageChangeConcernsPage` was put in `src/core/storage-keys.ts` because the
   layer rules forbid the content layer inventing a storage-key policy; the content watch
   only maps a key predicate to a repaint.
2. **`pages:v1` is deliberately not a repaint signal.** Every write anywhere touches the
   index, so treating it as a signal would make every open tab repaint for every note
   stored anywhere — the opposite of `A60`'s "keys belonging to other pages trigger no
   work". This is stated in the spec's cross-tab bullet. It does mean a change that
   touches only the index (no page slot) is not noticed; no shipped write does that.
3. **`pagehide` / `pageshow` are not triggers**; bfcache restore is the reload path,
   which re-runs the pass at load. Recorded in the spec bullet.
4. **The production watch is never torn down.** A content script has no unload step in
   this design, so `attachUrlChangeWatch` / `attachStorageChangeWatch` return a teardown
   that only tests call. The permanent cost is one `setInterval` at 1000 ms whose body is
   one `location.href` read and one string compare.
5. **CF1 is pinned as a template scan, not as an Angular render.** The vitest setup has no
   Angular TestBed/component harness (the popup component's behavior is pinned through
   `PageEntriesService` in `tests/popup-entry-list.spec.ts`, per the `t4-01` shape), so
   "renders" is pinned as document order + nesting in the template, which is exactly the
   shape the `t4-01` review fixed, and it is mutation-checked. A real render test would be
   a toolchain change (Angular test harness in vitest) and was not in the brief.
6. **jsdom limits named, not papered over.** jsdom delivers `hashchange` asynchronously on
   its own (as Chrome does), so that test waits for the browser's own event instead of
   dispatching one — and that also keeps a queued event from landing in the next test.
   `popstate` is dispatched by the test, because jsdom only fires it for a real
   `history.back()`. `document.visibilityState` is shadowed with `Object.defineProperty`
   to exercise the `hidden` branch. Both are test-side only; no production shim.
7. **Comment/doc sync in two lines I touched**: the stale "which is task `t4-03`" comment
   in the A50 popup pin is now present tense and points at the shipped watch; AC22's tail
   clause names the new render pins.

## Deliberately not done

- `chrome://extensions` load of `dist/` and the observable-behavior list (browser
  verification was not in this slice).
- README, `docs/specs/INDEX.md` surface cleanup, `docs/state/` bookkeeping, `docs/retro.md`.
- Any change to `src/manifest.json` (permissions are still exactly `storage` + `tabs`,
  pinned by `tests/toolchain-contract.spec.ts`), to `src/options/`, or to popup behavior.
- No new dependency, no permission, no network call, no message passing, no page-DOM
  mutation for painting, no new Russian UI string.

## Residual risks

1. **No browser run.** AC1/AC2/AC3 are pinned in jsdom against the shipped modules; the
   real `chrome.storage.onChanged` zone and a real SPA's `pushState` storm are only
   covered by the adapter's unit tests. A manual pass in `chrome://extensions` on an SPA
   (Gmail/Docs-style) is still owed by the sync-runtime step of the task.
2. **One repaint per record, unthrottled.** `A60` forbids queueing and merging, so a site
   that writes to its own page slot in a tight loop repaints at that rate. Cost per
   repaint is bounded by ruling `A29` (one stream, one pass) but is not cheap; if a real
   page shows it, the fix is a ruling that changes `A60`, not a local throttle.
3. **The url watch is address-based.** A same-address re-render (infinite scroll, a
   virtual list that keeps the URL) is not a trigger; the entry stays unpainted until the
   next repaint some other event causes. Written into the spec's Edge Cases so it is a
   decision, not an accident.
4. **The `hashchange` test relies on jsdom queueing the event as a task.** If a future
   jsdom stops firing it, that test fails loudly rather than silently.
5. **The CF1 pins read the component's inline template.** If the popup moves to a
   `templateUrl` HTML file, the extractor throws with a named error; the pins then have
   to be re-pointed at that file.

## Open questions for the PM

- None blocking. If the review wants AC2's "the popup of the other tab updates on reopen"
  pinned in the popup layer as well, that is a popup-side test and outside this brief's
  CF1 limit.
