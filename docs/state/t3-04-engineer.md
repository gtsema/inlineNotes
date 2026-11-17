# t3-04-content-anchor-hardening — engineer report (attempt 1)

Task: cleanup slice in `src/content/anchor/` and the related scans, per `docs/state/t3-04-content-anchor-hardening.md`
with AC4 widened by rulings `A51`, `A57`, `A58` and `t3-01-settings-read-core` review remarks 2 and 7.

Two commits, as the brief ordered (`A53`):

- `20cf8be` — `fix(t3-04): anchor liveness and table-cell boundaries` (AC1 + AC2 + AC3, spec wording in the same commit)
- `5aaa777` — `test(t3-04): derived purity scan and storage-key ownership` (AC4 + AC5, spec wording in the same commit)

Baseline before the work: `4047102`. Working tree after the second commit: clean (`git status --porcelain` empty).

## Changed paths, per commit

### `20cf8be` — `fix(t3-04): anchor liveness and table-cell boundaries`

- `src/content/anchor/locate-anchor.ts` — AC1. `locateAnchorInStream` no longer filters survivors: it maps the resolved
  range through a new internal `mapRange` (which reports how many covered nodes it refused) and returns
  `{ ok: false, code: 'anchor_stale' }` when any covered node was refused, when nothing mapped, or when any mapped
  fragment is not a live descendant of `root`. `fragmentsForRange` now delegates to `mapRange` and returns fragments
  only, so its contract is unchanged. Header rewritten to state the all-or-nothing rule (`A36`).
- `src/content/anchor/text-stream.ts` — AC2 + AC3. `BLOCK_TAG_NAMES` gains `'TD'` and `'TH'` (ruling `A35`); the module
  header's false equality ("the stream equals `normalizeText` of the raw subtree text") is replaced by the precise
  statement plus the `<div><p>a</p>tail</div>` counterexample; the boundary-list prose in the header names `td`/`th`.
- `docs/specs/inline-comment-model.md` — AC1/AC2/AC3 spec side, same commit: "Normalized text stream" rewritten; new
  rule "No raw-text equality (`N2`)"; "Block boundary" now `A20` + `A35` with the `td`/`th` case; "Anchor locate codes"
  rewritten to all-or-nothing; new rule "Locate is all-or-nothing (`A36`)"; "Staleness" wording now says "not fully
  live"; Terms / Aliases gains the `all-or-nothing locate` grep anchor; Edge Cases gains the one-node-deleted case and
  the table-cell case is resolved instead of "must work or degrade"; AC18 and AC21 rewritten; new AC31 (the rule) and
  AC32 (its unit tests).
- `docs/specs/content-overlay-ui.md` — painting consumes all fragments or none (`A36`); Terms / Aliases gains
  `all-or-nothing locate` pointing at the owning spec.
- `tests/content-anchor-locate.spec.ts` — 21 → 23 tests: two-fragment range with one node removed (asserts the survivor
  is still inside `root`, so the old code returned `ok: true`, and asserts `{ ok: false, code: 'anchor_stale' }` with no
  fragment field); two-fragment range with one node rewritten to a different length (the `mapRange` refusal path).
- `tests/content-anchor-text-stream.spec.ts` — 21 tests, contents changed: the pinned `A20` list now includes `TD`/`TH`;
  three new table cases (`<td>a</td><td>b</td>` → `a b`, `th` header row, mixed head/cell); the false-equality fixture
  replaced by the precise statement (`isNormalizedText`, trimmed at both ends, no double space, no newline or tab) plus
  the counterexample that the old claim was false (`textContent` glues: `atail`).

### `5aaa777` — `test(t3-04): derived purity scan and storage-key ownership`

- `src/content/anchor/text-stream.ts` — AC5. The module-scoped `Map<string, boolean>` whitespace decision cache is
  replaced by the exported constant `WHITESPACE_CODE_POINTS` (25 code points, the closed enumeration of spec "Normalized
  text") and a frozen `Set` built from it; `isWhitespaceCodePoint` is a set lookup. No node, offset or stream memo
  remains, so `A29` still holds; header rewritten (`N4`).
- `tests/content-anchor-text-stream.spec.ts` — 21 → 25 tests: the separator set is pinned (size 25, no duplicates, each
  spec-named form present, U+0085 and U+200B absent); the set is compared with `normalizeText` for **every code point of
  the BMP** (65 536 samples of `a` + doubled code point + `b`) and across the astral planes; a mutated-DOM test shows two
  `buildTextStream` calls differ on a code point the module was never asked about (`U+3000` + `U+1F600`), and that a
  third call over the same DOM is equal but freshly built.
- `tests/content-anchor-boundaries.spec.ts` — AC4 (`N3`): the `dist/` half no longer returns when `dist/` is missing. It
  asserts `dist/` exists, asserts at least one built `.js` bundle exists, then asserts no bundle mentions `jsdom`. The
  helper is now `builtBundles` (list) instead of `bundleFilesMentioningJsdom` (filter). File header names `t3-04` / `N3`.
- `docs/specs/INDEX.md` — AC4 (`N5`): the `inline-comment-model.md` row's covered paths are now
  `src/core/`, `src/content/anchor`, `src/content/store`, `src/popup/store`, `tests/`.
- `tests/core-storage-port.spec.ts` — AC4 (`A58`, `A51`): 15 → 17 tests. `MODULES` is derived by walking `src/core/`
  (recursive, `.ts` only, sorted); one test pins the derived list against an independent `readdirSync(..., { recursive:
  true })` read and pins that the six modules the hand list missed (`entry-rules.ts`, `entry.ts`, `page-index.ts`,
  `page-key.ts`, `slot-key.ts`, `storage-keys.ts`) are inside it. The absorbed non-ASCII rule is
  `expect(code).not.toMatch(/[^\x00-\x7F]/)` over `codeOnly()`; a companion test pins the prerequisite: `codeOnly`
  removes both comment forms, `src/core/anchor-build.ts` raw text **does** contain non-ASCII (em-dash, arrow) while its
  `codeOnly()` form does not.
- `tests/core-entry-overlap.spec.ts` — AC4 (`A51`): 22 → 20 tests. The duplicate `describe('purity of the resolved-span
  module (AC5)')` is deleted, together with its private `codeOnly`/`projectRoot` and the now-unused `node:fs`,
  `node:path`, `node:url` imports; the file header points at the single scan.
- `tests/toolchain-contract.spec.ts` — AC4 (`t3-01` remark 2, `A57`): 9 → 11 tests. New helpers `importClauses`,
  `importersOf`, `modulesHoldingLiteral` (comment-stripping before matching). Pins: `importersOf('SETTINGS_KEY')` equals
  exactly `['src/core/settings-store.ts']`; `modulesHoldingLiteral('settings:v1')` equals exactly
  `['src/core/storage-keys.ts']`; `importersOf('settingsValueOf')` and `importersOf('settingsFromStorageValue')` are both
  `[]` in shipped source.
- `docs/specs/inline-comment-model.md` — AC5 spec side, same commit: "Stream ownership (`A29`, bounded by `N4`)" now
  states that nothing under `src/content/anchor/` caches a stream, node, offset or per-character decision, names the
  three module-level constants, and states that the separator set is compared with `normalizeText` across the BMP; AC22
  extended with the mutated-DOM/first-seen-code-point clause and the no-per-page-cache clause.

## Commands run

Work order per the brief: `npm test` first, then code + tests per AC, spec lines in the same commit, `npm test` again
before each commit, all three gates before the final commit.

| Step | Command | Result |
|---|---|---|
| before any edit | `npm test` | passed — `22` files, `429` tests |
| before commit 1 | `npm test` | passed — `22` files, `431` tests |
| after commit 1 code | `npm run typecheck` | passed (no output, `tsc` clean on all three projects) |
| probe of the `dist/` scan fix | `mv dist dist-hidden && npx vitest run tests/content-anchor-boundaries.spec.ts; mv dist-hidden dist` | failed as intended with `dist/` absent — `1 failed | 14 passed`; `dist/` restored and re-listed |
| before commit 2 | `npm test` | passed — `22` files, `437` tests |
| gate 1, on `5aaa777` | `npm test` | passed — `Test Files 22 passed (22)`, `Tests 437 passed (437)`, duration `2.14s` |
| gate 2, on `5aaa777` | `npm run build` | passed — `dist/ is a self-contained MV3 folder (10 files)`, manifest references resolved: `content.js`, `popup/index.html`, `options/index.html` |
| gate 3, on `5aaa777` | `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 23 info(s)`, exit code `0` |
| final | `git status --porcelain` | empty (no staged or unstaged files) |

Test counts: baseline `429` → after commit 1 `431` (+2) → after commit 2 `437` (+6: text-stream +4, storage-port +2,
toolchain +2, entry-overlap −2 deleted duplicates, locate +2 in commit 1).

Checker INFO lines (23, up from 21) are the checker's standing behavior: every backticked token beginning with `src/`
or `tests/` is reported as "planned path not created yet" regardless of existence (`PLAN_PREFIXES` short-circuit at
`scripts/check-agent-config.mjs:365`). Two new INFOs come from the two new spec mentions
(`src/content/anchor/`, `tests/content-anchor-text-stream.spec.ts`). No error or warning was introduced.

## AC self-check

**AC1 — `A36` all-or-nothing liveness: satisfied.**
`locateAnchorInStream` returns `anchor_stale` if **any** mapped node of the resolved range is outside `root`, and also if
any covered node's own code-point map no longer accounts for the stream span (`mapRange.refused > 0`), which is the same
ruling applied to the second failure mode. `ok: true` carries the complete mapped list. Test named in the AC exists:
`reports anchor_stale, never a survivor, when one of two mapped nodes left the subtree (AC3, A36)` — it first asserts the
surviving node is still inside `root` (so the pre-fix code returned `ok: true`) and then asserts
`{ ok: false, code: 'anchor_stale' }` with no fragment. Second test covers the rewritten-node refusal path. Spec rules
"Anchor locate codes", "Locate is all-or-nothing", "Staleness", AC21, AC31/AC32 and the overlay painting line were
changed in the same commit.

**AC2 — `A35` table cells: satisfied.**
`'TD'` and `'TH'` are in `BLOCK_TAG_NAMES`, the pinned list in the test includes them right after `'TR'`, and
`<td>a</td><td>b</td>` streams as `a b` (plus `th` header row and mixed head/cell cases). The spec's boundary rule
("Block boundary (ruling `A20`, table cells added by ruling `A35`)") names the two tags and the `a b` outcome, and the
Edge Cases row that used to say "must work or degrade to the innermost common container" now states the resolution.
Rule, pinned list and tests changed in one commit.

**AC3 — `N2` false equality removed: satisfied.**
The equality clause is gone from the spec rule, from model AC18 and from the `text-stream.ts` header; the fixture that
asserted it (`stream.text === normalizeText(rawNodes.join(' '))`) is deleted. New spec rule "No raw-text equality" states
the truth and gives the counterexample (`<div><p>a</p>tail</div>` → stream `a tail`, `normalizeText(textContent)` →
`atail`); the replacement test pins exactly that pair, so the deleted claim cannot silently return. A repo grep for
`normalizeText of the raw|equals normalizeText|raw subtree text` outside `docs/state/` returns only the three negations
(header, spec rule, model AC18).

**AC4 — scan hygiene bundle: satisfied.**
- `N3`: the `dist/` scan asserts `dist/` exists and that at least one built bundle exists before filtering; proven by
  moving `dist/` aside (`1 failed`) and restoring it (`15 passed`).
- `N5`: `docs/specs/INDEX.md` model row now covers `src/content/anchor`; the model spec already owns those files
  (`src/content/anchor/text-stream.ts`, `src/content/anchor/` rules), so the row now matches the spec's own scope.
- `A58`: the shared `MODULES` list is derived from the directory, and a test pins the derived list against an independent
  recursive read and pins the six previously-uncovered modules.
- `A51`: the stronger non-ASCII rule is absorbed into the shared scan and the duplicate `describe` in
  `tests/core-entry-overlap.spec.ts` is deleted. **Prerequisite checked as instructed**: `codeOnly()` strips both
  `/* … */` and `// …` forms, and with comments stripped the non-ASCII count over all 15 `src/core/` modules is `0`,
  while the raw text of 9 of them (including `anchor-build.ts`) is non-ASCII. Therefore the **full** rule
  `/[^\x00-\x7F]/` was used, not the Cyrillic-only fallback `[\u0400-\u04FF]`. The prerequisite is pinned by a test rather
  than by a comment, so the reasoning cannot rot if a Russian literal ever reaches `src/core/`.
- `t3-01` remark 2 / `A57`: new grep test in the existing `chrome.storage`-ownership pattern pins
  `SETTINGS_KEY` importers to exactly `{src/core/settings-store.ts}`, the `'settings:v1'` literal to
  `src/core/storage-keys.ts`, and zero shipped importers of `settingsValueOf` / `settingsFromStorageValue`.

**AC5 — `N4` bounded cache: satisfied.**
The decision `Map` is gone; the separator test is a lookup in a `Set` built once from the exported constant
`WHITESPACE_CODE_POINTS`. Nothing under `src/content/anchor/` keeps per-page state any more: module-level data is
`BLOCK_TAG_NAMES`, `EXCLUDED_TAG_NAMES` and the separator set, all constants. The stream stays uncached (`A29`) and the
new test pins that two calls over a mutated DOM differ — including a separator (`U+3000`) and an astral character
(`U+1F600`) the module had never been asked about — and that a third call over the unchanged DOM returns an equal string
in fresh objects. Correctness of the constant against core is pinned for every BMP code point and across the astral
planes, so the two views cannot drift.

## Deviations

1. **Commit split vs the state file.** `docs/state/t3-04-content-anchor-hardening.md` ("Work order (mandatory)") still
   names one commit, `fix(t3-04): anchor liveness, table boundaries and scan hygiene`. The brief's ruling `A53` ordered
   two commits with the exact messages used here. I followed the brief and record the conflict instead of picking a
   third option; the state line needs a PM edit.
2. **`mapRange` refusal is slightly wider than the AC sentence.** AC1 names only "any mapped node … no longer inside the
   subtree". The old `clipFragment` also silently dropped nodes whose live text no longer matched the stream, which is
   the second `anchor_stale` mode the spec already listed; leaving that as a silent drop would have kept half of the same
   ruling unenforced. Both modes now report `anchor_stale`. No spec line contradicts this; model "Anchor locate codes"
   already listed both modes and AC21 already named both. Flagged because it is one rule stronger than the AC sentence.
3. **Extra spec rules and ACs beyond the minimum.** AC1 needed a named rule for the all-or-nothing property
   (`all-or-nothing locate`, AC31/AC32) and AC5 needed the bounded-state sentence in "Stream ownership" plus an AC22
   extension, because the brief requires spec lines in the same commit and the previous wording either claimed the
   opposite (AC3) or said nothing (AC1, AC5). No behavior outside the five ACs was touched.
4. **Extra pins inside the required tests.** The BMP-wide separator sweep and the `SETTINGS_KEY` literal-owner pin are
   stronger than the minimum wording ("constant whitespace set", "allowed to import `SETTINGS_KEY`"). They cost ~470 ms
   in one test and add no dependency.

## Open questions

1. `docs/state/t3-04-content-anchor-hardening.md` "Work order" still says one commit; should the PM rewrite that line to
   the `A53` two-commit split (deviation 1)?
2. Three more local core purity scans remain as strict subsets of the now-derived shared scan:
   `tests/core-storage-keys.spec.ts:177`, `tests/entry-rules.spec.ts:450`, `tests/page-key.spec.ts:306`. I verified none
   of them holds a rule the shared scan lacks, so nothing was lost by leaving them, and `A51` scoped the deletion to the
   `core-entry-overlap` duplicate only. Should a follow-up delete them under the same `A58` logic, or is belt-and-braces
   per-task acceptable?
3. `npm test` now requires `dist/` to exist (the `N3` fix), so a clean clone must run `npm run build` before
   `npm test`, or the boundaries file fails. The profile lists the three gates without an order. Should the gate order be
   pinned as build → test in `docs/project-profile.md`, or is the explicit failure the desired signal?
4. Anchors created **before** `A35` on a table page stored glued text (`ab`); under the new stream they report
   `anchor_not_found` and go stale (listed, deletable). Nothing has shipped, so no migration is needed — confirm the PM
   accepts this as a non-issue rather than a spec "Assumption" line.

## Handoff notes for `t3-01-content-create-card`

- **`locateAnchor(root, anchor)` after `A36` — exact contract.** Returns `{ ok: true, fragments }` or
  `{ ok: false, code: 'anchor_not_found' | 'anchor_stale' }`. `ok: true` guarantees **every** fragment in the list is a
  live descendant of the `root` you passed and that each fragment's node still accounts for exactly the code points the
  stream recorded. There is no third shape and no partial list: the caller never has to filter, count or compare lengths.
  `locateAnchorInStream(stream, root, anchor)` is the same rule against a stream you built moments before; the liveness
  check is against `root`, so it catches a DOM that changed between the build and the call.
- **What stale means for painting (for `t3-02`, decided now because the card stores the anchor).** Both codes mean the
  same observable thing: paint **nothing** for that entry, keep it in the popup list, keep it deletable, no auto-removal,
  no throw, no page mutation. Do not paint "the fragments that survived" — after `A36` there are none. A `fragments`
  length of 1 versus 3 is not a staleness signal; the `code` is the only signal.
- **Capture path is unchanged.** The card still builds the stream once per capture with `buildTextStream(root)` and hands
  `buildAnchor` that same `stream.text` with half-open code-point offsets of the trimmed span; `options.fragments` stays a
  real fragment count and a stored hint only. `A36` only affects the read-back direction.
- **Table-cell stream change is user-visible.** `td` and `th` are now block boundaries, so a selection that crosses cells
  captures as `a b` (one U+0020 per boundary), not `ab`, and re-anchors on the cells instead of degrading to the
  innermost common container. Consequences for the card: the counter and the stored `entry.text` see the spaced form; the
  trimmed-span rule is unchanged; a stored anchor written before this change over a table reports `anchor_not_found`
  (accepted, nothing has shipped).
- **Stream stays uncached (`A29` + `N4`).** Rebuild it per capture and per `locateAnchor`; do not memoize across SPA URL
  changes (that is `t4-03`) and do not add a cache inside the card either. `src/content/anchor/` now holds no per-page
  state, and the boundaries scan plus the new mutated-DOM test will fail if that regresses.
- **Do not import `WHITESPACE_CODE_POINTS` in the card or in painting.** It is exported so a test can pin it against
  `normalizeText`; the card normalizes with the core `normalizeText` only (`A26`: the content layer normalizes at capture
  time, core never repairs it).
- `BLOCK_TAG_NAMES` and `EXCLUDED_TAG_NAMES` are exported for the same pinning reason. Treat all three as read-only.
