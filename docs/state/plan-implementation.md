# Stage plan — extension implementation (request: "начинаем реализовывать")

Owner: interactive PM (main session). Renegotiated budget: **4 stages / 15 tasks** (default limit is 3/3;
Stage 1 grew to 6 tasks — the storage-key constraint appeared in review, and two runtime timeouts on 7-AC slices
proved that one attempt cannot carry that much).
Renegotiation reason: the user asked for smaller tasks; one slice = one verifiable behavior.
Child count: ~15 engineer + 15 reviewer (parallelism 1, one writer per worktree).
Slice-size rule adopted after `t1-03`: a `src/core/` slice carries at most 5 substantive ACs (`docs/specs/code-review-flow.md`).
Gates per task: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs` — quoted by the engineer.

## Stage 1 — toolchain + pure domain rules. Done-criterion: `dist/` loads in Chrome; core rules of caps and page identity are unit-tested.

Human confirmation collected: the user loaded `dist/` in `chrome://extensions` with no errors (t1-01 build) and
reloaded after `t1-02`: **no placeholder card in the page corner** (user, 2026-11-16) — the `t1-02` AC6 end-state
is confirmed on a real browser.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t1-01-toolchain-dist` | package.json/tsconfig/Angular apps/esbuild content bundle/manifest → loadable `dist/` | overlay AC2 (no page DOM touched by design), profile gate contract |
| `t1-02-core-pagekey` | `pageKey` normalization + path-only fallback lookup | model AC4 |
| `t1-03-storage-slot-keys` | legal slot-key encoding + `pages:v1` index + trailing-slash identity | model spec Rules/Storage (spec line edited with the code) |
| `t1-04-entry-model-rules` | entry type with `visible`, 256 code points, 20 entries, author identity and edit rights, ordering | model AC2, AC3, AC7, AC8 |
| `t1-05-storage-port-read-index` | `StoragePort` seam + chrome adapter + index write/repair policy + entry decoding | model Rules/Storage, review findings N1–N5 |
| `t1-06-entry-write-path` | create / update / delete / clear / `setVisible` over the port, quota path | model AC1, AC3, AC7, AC10 |

## Stage 2 — anchors and overlap. Done-criterion: a stored anchor resolves to DOM ranges on a real page; overlap rule is testable.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t2-01-core-anchor-text` | text normalization, `anchor` build, string-level resolve + disambiguation | model AC5 (text part), edge cases same-text |
| `t2-02-content-anchor-dom` | normalized match → `Range` fragments across block/inline boundaries | overlay AC2, edge: multi-block frame |
| `t2-03-core-overlap` | range model, intersection vs boundary-touch rejection | model AC6 |

## Stage 3 — content overlay (Preact). Done-criterion: select → card → save → highlight → hover tooltip → edit/delete works on a real article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t3-01-settings-read-core` | `loadSettings(port)` + decode guard + tests + spec line (core only) | model AC9/AC10 storage half |
| `t3-01-content-create-card` | shadow host, selection capture, create card, counter, keyboard (content only) | overlay AC1, AC9, AC11, model AC9 |
| `t3-02-content-highlight-tooltip` | CSS Highlight painting, frame, hover tooltip, mine vs foreign header | overlay AC2, AC3 |
| `t3-03-content-editor` | editor for existing entry, save/cancel/delete, overlap message, re-select | overlay AC4, AC5, AC6, model AC7, AC8, AC11 |

## Stage 4 — extension UI + refresh + docs. Done-criterion: the full loop works offline on an arbitrary article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t4-01-popup-list` | Angular popup: rows, per-entry checkbox, empty/restricted/name-required states | overlay AC7, AC10 |
| `t4-02-options-name` | Angular options: name field, validation, first-run random name | overlay AC9, model AC9 |
| `t4-03-spa-refresh-docs` | SPA/history refresh, `storage.onChanged`, README, final verification | overlay AC8, model AC1 |

## Harness decisions taken by the PM during Stage 1

- `.pi/agents/code-reviewer.md` moved from `acceptance: checked` to `acceptance: { level: none, reason: … }`: the
  runtime rejects a read-only reviewer for not producing a structured acceptance report, although its verdict is the
  review artifact. `docs/specs/code-review-flow.md` records the rule; `node scripts/check-agent-config.mjs` → 0 errors.

## Stage 1 close-out (after `1e91276`)

Done: every business rule of `docs/specs/inline-comment-model.md` with no DOM dependency exists in `src/core/` and is
unit-tested against the in-memory port — page identity and slot-key encoding, the entry model, the 256-code-point and
20-entry caps, author identity and edit rights, ordering, the `StoragePort` seam with one adapter, the index
read/write/repair policy, the decode guard, and the whole write path (create / save / delete / `setVisible` / clear,
with refusal codes). 257 tests over 14 files, build green, checker clean.

Still open by design: the overlap rule and Flow-3 step 6 (→ `t2-03`), the anchor codec (→ `t2-01`/`t2-02`), staleness
end-to-end (→ `t2-01`/`t2-02`/`t3-03`), every UI half of the model ACs (→ Stage 3/4), `settings:v1` decode and the
first-run name wiring (`A15` → `t4-02`), the Russian message strings (→ `t3-01`, `t4-01`), and `storage.onChanged`
cross-tab refresh (→ `t4-03`). Known v1 limitation, accepted: a read-modify-write race between two tabs.

## Runtime rulings taken during Stage 1

- `A9` timestamps are UTC ISO-8601 `Z` from an injected clock; `A10` decode defaults live in the core read path;
  `A11` one code `name_required` for v1 (the options page refuses a longer name at input); `A12` `setVisible` is a
  pure core helper, not Angular logic.
- `A13` `timeoutMs` stayed 1800000 after the first two timeouts, with "commit early" added to cross-layer briefs.
- `A14` index repair is per-page on read; `A15` `settings:v1` decode belongs to `t4-02`; `A16` unreadable stored
  records survive every write and die only with `clear page`; `A17` only an absent or valid-empty slot is repaired;
  `A18` no `QuotaError` type — the vocabulary is `StorageFailureError` + `code`.
- `A19` after the third timeout the ceiling became **3600000** (profile first, then the three roles, then the checker
  which now reads the number from the profile).

## Stage 2 pre-issued rulings

- `A20` a block-level boundary contributes exactly one space to the page text stream (`t2-02`).
- `A21` `script`, `style`, `noscript`, `template`, `head` never enter the stream; hidden-but-rendered text does.
- `A22` a hidden entry still blocks overlap (`visible` is painting only).
- `A23` two entries are duplicates when the resolved range and the normalized comment are equal.
- `A24` a stale entry has no range and cannot cause an overlap.

## Stage 3 pre-split (ruling `A34`, awaiting the user)

`t2-02` — a two-layer slice (core-adjacent DOM code + a new jsdom harness) — overran even the 60-minute ceiling.
`t3-01` as originally briefed is strictly bigger: shadow host + selection capture + card UI + a new core settings read
+ a message map, i.e. three layers. `A34` splits it into `t3-01-settings-read-core` (pure core, 3 AC) and
`t3-01-content-create-card` (content only, 5 AC). Consequence: Stage 3 becomes 4 tasks, which exceeds the
≤3-tasks-per-stage budget, so this is a renegotiation item, not a silent change. Default applied if unanswered.

## Open questions asked of the user (least-risky defaults applied if unanswered)

- `A1` `visible` flag: overlay spec persists it in the entry record, model spec entry shape omits it. PM default: `Entry.visible: boolean` (default `true`), `inline-comment-model.md` edited in the same commit as `t1-04`.
- `A2` Anchor tests need a DOM — **user delegated the choice to the PM (2026-11-16), PM decision: approved**.
  `jsdom` is added as a **dev** dependency and used only as the Vitest environment for anchor/DOM tests in
  Stage 2 (`t2-02`). Runtime dependencies stay `@angular/*` + `preact`; `jsdom` must never appear in
  `dependencies`, in `src/manifest.json`, or in any shipped bundle.
- `A3` Build wiring: Angular application builder for popup+options, esbuild for the content/core bundle, one node script assembles `dist/` + copies the manifest. Default accepted (t1-01 review `accepted`).
- `A5` PM ruling on t1-01 remark 2: `content_scripts.matches` is narrowed to `http://*/*` + `https://*/*`; the spec line lands in `content-overlay-ui.md` with the t1-02 commit.
- `A6` PM ruling on t1-01 open question 2: the overlay shadow root mode stays `open` for v1 (dev-tool inspectability during the manual verification loop); `t3-01` owns the widget.
- `A7` PM decision (platform constraint found in the `t1-02` review): `chrome.storage.local` forbids `.` `/` `\` `"` in a key and caps it at 256 characters, so `notes:v1:<url>` was never legal. Layout becomes `notes:v1:<escaped slot key>` plus a `pages:v1` index key; the spec line is edited together with the code.
- `A8` **Confirmed by the user (2026-11-16)**: a trailing slash is not part of page identity — `/a` and `/a/` are the same page.
