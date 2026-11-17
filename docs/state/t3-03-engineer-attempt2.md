# Engineer report — `t3-03-content-editor`, attempt 2 (narrow fix slice, three items)

Commit: **`4b674ae` — `test(t3-03): pin the Flow 6 selection claim handover`** (parent `baaacd0`;
items 2 and 3 ride along in it, as the brief allows).
Working tree after the commit: clean (`git status --porcelain` → empty, nothing staged).

## The three items, by number

1. **done** — `tests/content-create-card-controller.spec.ts:443-508`
   (new `describe('the Flow 6 selection claim handover (task t3-03 AC1, overlay Flow 6)')`;
   case A `:444-487` hook answers `true`, case B `:488-507` hook answers `false`;
   fixture support: `:107` `ClaimOf`, `:200-206` conditional `cardOptions.claimSelection`,
   `:99-100` + `:180` the recorded `claims`).
2. **done** — `src/content/editor/edit-entry.ts:128-133` (the stale
   `tests/content-editor-edit-path.spec.ts` pointer is gone; the comment now says the `catch`
   is **named, not driven by a throw**, gives the test-only-DOM injection reason, and names the
   driving test `tests/content-editor-controller.spec.ts` with the sibling `span === null` branch
   it actually reaches) and `docs/specs/content-overlay-ui.md:199` (throw-table row for
   `editor/edit-entry.ts` `saveEntryComment`, verification cell now opens
   **"Named, not driven by a throw:"** — the same cell style as `paint/paint-style.ts:206` and
   `paint/page-painter.ts:203`).
   Repo-wide grep after the change: `content-editor-edit-path` → **0 hits** in `src/`, `tests/`,
   `docs/specs/`.
3. **done** — `src/content/editor/edit-entry.ts:28-31` and
   `tests/content-editor-controller.spec.ts:785-791` both now name
   **"Ruling `A78`: what a successful `re-selection` stores"** (the section as the PM renamed it at
   `docs/specs/content-overlay-ui.md:87`); the stale "until the PM rules otherwise / it is not
   resolved in this file" wording is gone. Comment text only, no behavior change.
   Repo-wide grep: `Open question: what a successful` → **0 hits**.

## Load-bearing proof for item 1

Both probes were run against the committed test file, then reverted with
`git checkout -- src/content/overlay/create-card-controller.tsx` (verified: line 266 back,
`git status` showed only the four intended files).

**Probe A — the reviewer's defect: the hook call is deleted** (the whole
`if (options.claimSelection?.(selection, authorName) === true) { … return; }` block removed from
`create-card-controller.tsx:266`):

```
npx vitest run tests/content-create-card-controller.spec.ts -t "claim" --reporter=verbose
× … mounts no card, captures no span and asks core for nothing when the claim answers true (Flow 6, AC1)
  → expected [] to have a length of 1 but got +0
× … opens the card normally when the claim answers false (Flow 6, AC1)
  → expected [] to have a length of 1 but got +0
Tests  2 failed | 28 skipped (30)
```

Failing assertion: `expect(fixture.claims).toHaveLength(1)` — the controller never put the claim,
so **both** new cases go red; the other 28 cases of the file stay green.

**Probe B — the hook is still asked but its `return` is deleted** (the card path continues past a
`true` answer), which shows the card assertions themselves are load-bearing and not just the
hook-call counter:

```
× … when the claim answers true (Flow 6, AC1)
  → expected true to be false // Object.is equality
✓ … opens the card normally when the claim answers false (Flow 6, AC1)
Tests  1 failed | 1 passed | 28 skipped (30)
```

Failing assertion: `expect(fixture.controller.isOpen()).toBe(false)`.

What case A asserts, in the order it fails: one claim with the captured selection object and the
name the `settings gate` answered with → `isOpen() === false`, `cardOf(...) === null`, the single
card wrapper holds no element and was never positioned (`left`/`top` still empty), the overlay host
is still `hidden` → `fixture.measured` is empty (the injected `rangeFor` seam is the only
measurement the open path runs after `captureSpan`, so no span capture happened) → exactly one
`get` (the settings read of `A31`, i.e. **no core entry read**), `writesOtherThanSettings(port)` is
empty, `port.storedKeys()` is `[SETTINGS_KEY]`, `created` is empty.
Case B uses the **same** selection (`selection('p1', 4, 15)`) and the same fixture, differing only
in the hook's answer, and asserts the card opens, the input carries the shipped `aria-label`, the
host is visible, and `measured` is `[{ node: textOf('p1'), start: 4, end: 15 }]` — which is what
makes the empty `measured` list in case A a real assertion rather than a vacuous one.

## Gates (ruling `A62` order, quoted from the final state)

```
$ npm run build
[build] built dist/content.js with esbuild
[build] dist/ is a self-contained MV3 folder (10 files)

$ npm test -- --reporter=basic
 Test Files  38 passed (38)
      Tests  697 passed (697)
   Duration  4.38s

$ node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 67 info(s)
```

Extra (not a gate, run because the reviewer's four-gate list includes it):

```
$ npm run typecheck           # exit 0, no diagnostics
```

Test count moved **695 → 697**: the two new Flow 6 cases are the only additions.

## Changed files (commit `4b674ae`)

- `tests/content-create-card-controller.spec.ts` — +101: the Flow 6 `describe` (2 cases), the
  fixture `claim` parameter / `claims` record / `CreateCardOptions` local, one header bullet naming
  what the new block pins.
- `src/content/editor/edit-entry.ts` — comment only (items 2 and 3).
- `tests/content-editor-controller.spec.ts` — comment only (item 3).
- `docs/specs/content-overlay-ui.md` — one row of the throw table (item 2).

## Notes for the reviewer

- `exactOptionalPropertyTypes: true` in `tsconfig.spec.json`: passing `claimSelection: undefined`
  into `CreateCardOptions` is a type error, so the fixture builds the options object and assigns
  `claimSelection` only when a case asks for it. Without that shape `npm run typecheck` fails with
  `TS2379`; it was the first red the slice produced and it is fixed inside the same commit.
- The word **`jsdom` may not appear anywhere under `src/`** — `tests/content-anchor-boundaries.spec.ts:201`
  ("is never referenced by shipped source", ruling `A2`) scans `src/**` text case-insensitively and
  it did fail once when the `edit-entry.ts` comment was rewritten with the literal word. The code
  comment therefore says "a test-only DOM implementation answers `false`", and the jsdom wording
  lives in the spec row, which is not scanned. Verified empirically before writing it: in jsdom a
  range whose boundary node was removed from the document answers `false` to
  `intersectsNode(foreignNode)` — it does not throw.
- Why the row says "not driven" rather than "cannot be driven": `tests/content-save-throw-safety.spec.ts:109`
  injects `InvalidAccessError` by replacing `intersectsNode` on **one range object**, so the throw is
  injectable in principle; nothing does it on the edit path, and the AC5 case in
  `tests/content-editor-controller.spec.ts` reaches the sibling `span === null` branch. The row and
  the code comment both state that asymmetry instead of claiming an impossibility.
- `tests/content-throw-boundaries.spec.ts:109` requires every throw-table row to end in a test name
  or the "named" marker; the rewritten row keeps both, and the pinned 14-catch set is untouched
  (no `catch` was added or removed).

## Out of scope, respected

No change to `src/core/`, `src/manifest.json`, `src/content/main.ts`, popup/options, SPA wiring,
dependencies, or any Russian UI string. No new option, no new seam in shipped code, no refactor:
`create-card-controller.tsx` is byte-identical to `baaacd0`. Remarks 4–7 of `docs/state/t3-03-review.md`
were left alone as PM decisions. `docs/state/t3-03-content-editor.md` was not touched; the only
`docs/state/` file written for this run is this report.

## Residual risks / open questions

- The pin is at the card-controller boundary (`create-card-controller.tsx`), which is where the
  review asked for it. The `main.ts:78-79` wiring line itself stays unpinned — same accepted shape
  as `onCreated` (review remark 4), and the PM deferred it.
- "The claim refers to the last paint pass across a SPA repaint" remains a `t4-03` risk; this slice
  does not touch it.
- Nothing in the suite would notice a *second* call to the hook per capture beyond the pinned
  `toHaveLength(1)`; that assertion already covers it, so no further pin was added.
