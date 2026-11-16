# Stage plan — extension implementation (request: "начинаем реализовывать")

Owner: interactive PM (main session). Renegotiated budget: **4 stages / 14 tasks** (default limit is 3/3;
Stage 1 grew to 5 tasks — the storage-key constraint appeared in review, and the entry slice was split after the
`t1-03` runtime timeout proved that 7 ACs do not fit one attempt on this model).
Renegotiation reason: the user asked for smaller tasks; one slice = one verifiable behavior.
Child count: ~14 engineer + 14 reviewer (parallelism 1, one writer per worktree).
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
| `t1-05-entry-store` | `chrome.storage.local` store: CRUD, `pages:v1` write and compaction policy, quota path | model AC1, AC10, residual risks from the `t1-03` review |

## Stage 2 — anchors and overlap. Done-criterion: a stored anchor resolves to DOM ranges on a real page; overlap rule is testable.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t2-01-core-anchor-text` | text normalization, `anchor` build, string-level resolve + disambiguation | model AC5 (text part), edge cases same-text |
| `t2-02-content-anchor-dom` | normalized match → `Range` fragments across block/inline boundaries | overlay AC2, edge: multi-block frame |
| `t2-03-core-overlap` | range model, intersection vs boundary-touch rejection | model AC6 |

## Stage 3 — content overlay (Preact). Done-criterion: select → card → save → highlight → hover tooltip → edit/delete works on a real article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t3-01-content-create-card` | shadow host, selection capture, create card, counter, keyboard | overlay AC1, AC9, AC11, model AC9 |
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
