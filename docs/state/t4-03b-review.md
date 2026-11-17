Review complete. No write-capable tool is available to this role, so the artifact is returned below for the harness to persist at the briefed path (`...\subagent-artifacts\outputs\158c889b-120b-48db-ba9a-619160d5f12d\docs\state\reviewer-report.md`).

---

# `code-reviewer` report — `t4-03b-watch-pins`, attempt 1 (narrow review)

Reviewed range: `4d05bdf..a35e46f` (one commit; `4511646` is PM bookkeeping, not counted). Files: `src/core/storage-keys.ts` (+10/−2), `tests/content-spa-refresh.spec.ts`, `tests/content-page-painter.spec.ts`, `tests/content-cross-tab-refresh.spec.ts`, `tests/core-storage-keys.spec.ts`. Working tree clean at `4511646`.

## Verdict

**accepted** — 0 blocking findings.

## AC check (one line per AC, `A72`)

- **AC1 — the trigger set is closed by a test: `pass`.** `tests/content-spa-refresh.spec.ts:616-620` (exact `addEventListener('…'` list) and `:728-733` (runtime ordered `attachments` `toEqual` + `intervals` `toBe(1)`, captured through wrappers over the real `window`/`document` that call through, `:645-698`) close the set instead of pinning a subset; `:736-754` proves silence for `pagehide`/`pageshow`/`freeze`/`resume`/`beforeunload`/`focus`/`blur`/`online`/`offline` on **both** targets while the address really moved (`:740`, `:750`), and `:757-788` pins the teardown half against comment-stripped `src/content/main.ts` (`codeOnly` at `:127-129`).
  Failing assertion per mutation:
  1. **added `pagehide`/`pageshow` listener** → `tests/content-spa-refresh.spec.ts:616` (`toEqual` list mismatch), `:728` (a 4th attachment), `:751` (`navigations()` non-empty; `pagehide`/`pageshow` are dispatched at `:705-706,742-743`).
  2. **any other extra event listener** → `:728` catches any name or target installed through `addEventListener`; `:616` and the pre-existing `:610-611` counts catch it in the text scan.
  3. **an extra interval** → `:733` (`intervals` `toBe(1)`, counted by the wrapped `window.setInterval` at `:677-680`) plus the pre-existing `:606` count.
  4. **teardown held/called in production** → `:766` (exactly one line-start bare call), `:768` (never the RHS of `const|let|var`), `:770` (never behind `return`), `:786` (`pagehide`/`pageshow`/`beforeunload`/`unload`/`removeEventListener`/`clearInterval`/`clearTimeout`/`Teardown` absent). Verified against code: the only production attach sites are `src/content/main.ts:150` and `:164`, both bare statements, and `main.ts` names no teardown.
- **AC2 — the `null` half of `pageKeyOfPass()` is pinned: `pass`.** Unit half: `tests/content-page-painter.spec.ts:549` (`null` before any pass) with `:552` (`port.calls` empty, so the accessor cannot be guessing from the address seam), `:570` (`null` after the address-throw pass → `src/content/paint/page-painter.ts:192-197`), `:591` (`null` after the read-throw pass → `page-painter.ts:204-209`; the throw is reached honestly, `src/core/entry-store-read.ts:211` calls `entryStorageKey` outside its try and `src/core/page-index.ts:87-90` hands back the hostile index key), `:610` (the boundary: the key survives the `index_malformed` branch, `page-painter.ts:212-221`). End-to-end half, not just the core branch: `tests/content-cross-tab-refresh.spec.ts:388-403` (no key → own slot + index + foreign key produce no repaint, no extra storage read, no paint write), `:405-415` (`settings:v1` alone repaints; the slot becomes a signal only after a pass resolves a key), `:417-429` (after an address-throwing pass the slot is still no work and the state stays `null`).
  A stale-key accessor fails: `:390`, `:400`, `:419`, `:422`, `:428` (end-to-end) and `:549`, `:570`, `:591` (unit) — the report's own mutation table reproduces exactly these five.
- **AC3 — comment honesty: `pass`.** `git diff 4d05bdf..HEAD -- src/` is comment-only, confirmed independently: the only hunk is the doc block above `storageChangeConcernsPage`; the body `src/core/storage-keys.ts:78-86` is untouched, so no guard, no validation, no behavior change. The reworded block `src/core/storage-keys.ts:67-76` is factually true: the lone-surrogate path really throws `entryStorageKey` → `slotKeyFor` (`src/core/slot-key.ts:95-103`) → `escapeCodePoint` (`src/core/slot-key.ts:141-146`, `encodeURIComponent` URIError); it **names the boundary instead of promising a guard** ("this module deliberately does not guard", `:71`), and its scoping sentence "Total over every `pageKey` this extension can produce" is true for the shipped wiring — a hostile index key can never reach `pageKeyOfPass()`, because the throw at `entry-store-read.ts:211` lands in the painter's catch (`page-painter.ts:204-208`) and resets the key. The out-of-scope reference matches `src/core/slot-key.ts:34-36`.
- **No scope creep: `pass`.** No behavior change, no core rule/guard, no throttle/queue/merge in either watch (A60/A88 intact — `src/content/refresh/storage-change-watch.ts` and `url-change-watch.ts` untouched), no `src/manifest.json` / `package.json` / spec / README / UI-string change in the range, no `fetch`/XHR/WebSocket/beacon/`require` in the diff, no `docs/state/` file inside `a35e46f` (the engineer report was committed by the PM in `4511646`).

## Carried fixes (items 2, 4, 5 of `docs/state/t4-03-review.md` → "Non-blocking remarks")

- **Item 2** (`t4-03-review.md:52`, absence of any other listener) — **done**, `tests/content-spa-refresh.spec.ts:616-620, 716-755`.
- **Item 4** (`t4-03-review.md:54`, `pageKeyOfPass` `null` states + the unpinned end-to-end path) — **done**, `tests/content-page-painter.spec.ts:544-611`, `tests/content-cross-tab-refresh.spec.ts:387-430`.
- **Item 5** (`t4-03-review.md:55`, the "pure and total" overstatement) — **done**, `src/core/storage-keys.ts:67-76`.
- Note (PM-side, not a finding): the card `docs/state/t4-03b-watch-pins.md` carries no `Carried-fix checklist:` heading; the three carried numbers are expressed as AC1–AC3 with their provenance line, so nothing is unanswered, but `code-review-flow.md` → Rules wants `Carried-fix checklist: none` written down explicitly.

## Blocking findings

None.

## Non-blocking remarks (for `t4-04` / the PM, not re-brief material)

1. Text-scan residue in the teardown pin: `tests/content-spa-refresh.spec.ts:766` still matches a call placed at a line start inside a collection literal (`const stops = [\n  attachUrlChangeWatch(…),\n]`), and `:768` only rejects an adjacent `const|let|var x =`, so a teardown stored that way and called from a non-unload event (e.g. `visibilitychange`) would survive both `:766-770` and the forbidden-string list at `:776-784`. The natural mutation form is caught (three assertions); a runtime pin of `main.ts` is impossible (it needs `chrome.*`), so this is the inherent ceiling of the technique, recorded per the review-flow rule that a text scan is a legitimate pin when it fails loudly.
2. Trigger pin covers registrations through `window.addEventListener` / `document.addEventListener` and `window.setInterval` only (`tests/content-spa-refresh.spec.ts:675-680`). A property handler (`win.onpagehide = check`) or a listener on another node escapes `:728` and `:616`; it is still caught for the nine lifecycle names at `:741-743`, so only an unlisted event name registered as an on-handler would slip through all three pins.
3. Wording: `src/core/storage-keys.ts:70-73` omits `escapePageKey` from the throw chain and says "no shipped reader produces" the malformed key, while the same commit's fixture (`tests/content-page-painter.spec.ts:584`) shows a shipped reader can *carry* one from `pages:v1` into the encoder. Both statements are true as written; naming the index-carry route would make the boundary harder to misread.
4. `tests/core-storage-keys.spec.ts:197-208` is a file the card did not name; it is a title + comment change with the same three assertions and removes the same overstated claim from the test side. Disclosed in the report, inside the "test-only plus one comment reword" envelope — accepted, not a scope finding.

## Evidence

- `git show --numstat a35e46f`; `git diff --name-only 4d05bdf..a35e46f` (5 files); `git diff 4d05bdf..HEAD -- src/` (doc block only); `git status --porcelain` empty.
- Re-run read-only (`A77`): `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 86 info(s)` — matches the PM's numbers.
- Corroboration: 41 `tests/*.spec.ts` at HEAD; `it(`/`test(` declarations **789** at HEAD vs **778** at `4d05bdf` (+11 = 4 + 4 + 3); **0** hits for `.skip(` / `.only(` / `xit(` / `xdescribe(` under `tests/`.
- PM-quoted gates, not re-run here (read-only role): `npm run build` green (10 files), `npm test` 789/789, `npm run typecheck` exit 0.
- Spec sentences checked: `docs/specs/content-overlay-ui.md:84` (both "`pagehide` / `pageshow` are deliberately not triggers…" and "Neither watch is ever torn down in a content script… the interval lives for the life of the document") — no spec/code conflict, so this is not a `blocked` case; no spec edit was required in this range because no specified behavior changed (the two clauses landed with the PM in `4d05bdf`).