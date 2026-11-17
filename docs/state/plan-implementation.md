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
| `t2-04-core-create-hardening` | `A46` required resolved spans, purity-scan line, `A27`/`A28` spec clauses | closes `t2-03` review remarks 1–4 |

## Stage 3 — content overlay (Preact). Done-criterion: select → card → save → highlight → hover tooltip → edit/delete works on a real article.

| Task | Slice | Owning spec AC |
|---|---|---|
| `t3-01-settings-read-core` | `loadSettings(port)` + decode guard + tests + spec line (core only) | model AC9/AC10 storage half |
| `t3-01-content-create-card` | shadow host, selection capture, create card, counter, keyboard (content only) | overlay AC1, AC9, AC11, model AC9 |
| `t3-04-content-anchor-hardening` | `A36` liveness, `A35` table cells, `N2`–`N5` hygiene in `src/content/anchor/` | closes `t2-02` review remarks |
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

## Carried-fix slices (ruling `A48`) — **confirmed by the user (2026-11-16: "Да, давай")**

`A48`: **more than two carried review findings get their own slice**, never stacked onto the next feature task (the rule
is in `.pi/skills/delivery-planning/SKILL.md`, learned when `t2-03` died with 5 AC + 4 carried fixes). Applying it to
the `t2-02` and `t2-03` reviews adds two small tasks: **`t2-04-core-create-hardening`** (core) and
**`t3-04-content-anchor-hardening`** (content anchor directory). Consequence: **Stage 2 = 4 tasks, Stage 3 = 5 tasks**,
both above the ≤3 budget. Default applied, because leaving the findings unclosed means building UI on top of a known
liveness bug (`N1`) and a silently skippable overlap check (`A46`).

## Stage 3 split (ruling `A34`) — **confirmed by the user (2026-11-16): "оставляем"**

`t2-02` — a two-layer slice (core-adjacent DOM code + a new jsdom harness) — overran even the 60-minute ceiling.
`t3-01` as originally briefed is strictly bigger: shadow host + selection capture + card UI + a new core settings read
+ a message map, i.e. three layers. `A34` splits it into `t3-01-settings-read-core` (pure core, 3 AC) and
`t3-01-content-create-card` (content only, 5 AC). Consequence: Stage 3 becomes 4 tasks, which exceeds the
≤3-tasks-per-stage budget, so it was put to the user as a renegotiation item. **The user approved the split**, so
Stage 3 is 4 tasks by agreement, not by a silent PM override. Order: `t3-01-settings-read-core` →
`t3-01-content-create-card` → `t3-02` → `t3-03`.

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
- `A35` (t2-02 remark `N8`): `td`/`th` join the `A20` block-boundary list, so `<td>a</td><td>b</td>` streams as `"a b"`.
- `A36` (t2-02 remark `N1`): anchor location is all-or-nothing — any mapped node detached ⇒ `anchor_stale`, never a
  half-live fragment set.
- `A37` (t2-03 brief): overlap is computed on resolved half-open code-point ranges from one re-resolve pass; a shared
  block-boundary separator counts as touching, not sharing.
- `A38`–`A40` (t3-02 brief): CSS Highlight API with one named highlight per entry; teardown deletes every
  `inlinenotes-…` name; hidden and stale entries are simply absent from the paint (no dimmed state).
- `A41` **confirmed by the user (2026-11-16: "Да")** (t3-02): the CSS Highlight API cannot be styled from the shadow tree, so the
  paint style must be registered at document level. PM default, in order of preference: append a constructed stylesheet
  to `document.adoptedStyleSheets` (no page element added), and only if the Stage 3 smoke shows that does not apply
  `::highlight()` rules, fall back to exactly one `<style id="inlinenotes-paint">` element — which then forces an edit
  of overlay AC2 ("no page element other than the overlay host"). Rejected for v1: `chrome.scripting.insertCSS`
  (needs a `scripting` permission the manifest does not have).
- `A42`–`A45` (t3-03 brief, defaults applied without an answer): click outside the editor = cancel, not save; `Esc` =
  cancel; `Удалить` deletes immediately with no confirmation and no undo in v1; a re-selection made inside the editor
  may move the entry's range and is overlap-checked excluding the entry itself (`A45`, on top of `A37`).
- `A46` (`t2-03` remark 3): resolved spans become **required** on `createEntryOnPage`, so a caller cannot silently skip
  the overlap and duplicate checks; `CreateAttempt.spans` stays optional for pure rule tests. PM default, one `?` to revert.
- `A47` (`t2-03` remark 5): `duplicate` gets its own Russian message `Такая заметка на этом выделении уже есть`, distinct
  from the overlap message, because the two refusals ask the user for different actions.
- `A48` **confirmed by the user (2026-11-16)**: a review that leaves more than two carried findings produces its own cleanup slice — `t2-04-core-create-hardening`
  and `t3-04-content-anchor-hardening`, which makes Stage 2 4 tasks and Stage 3 5 tasks. Awaiting the user's confirmation.
- `A50` (t4-01): the popup changes visibility through core `setVisible`; the page repaints via `storage.onChanged`
  (`t4-03`), not via a popup→content message. PM default so the two tasks do not both invent a channel.
- `A49` **confirmed by the user (2026-11-16: "берём табс")** (t4-01): the popup needs to know which page is current. Chosen: add the
  `tabs` permission to the manifest (the popup then works on any page, including pages where the content script cannot
  run). Alternative: zero new permissions via a service worker + `chrome.storage.session` page-key map, at the cost of
  a new moving part and a popup that is blind on restricted pages. Install-time warning is the trade-off to decide.
- `A54` (t4-02): first run **generates** the author name (`generateAuthorName(rng)` + `saveSettings`) instead of asking
  the user to invent one; only the options page may generate a name, the content layer only refuses to open the card.
- `A55` (t4-02): the options counter and its refusal measure **code points** via the core helpers, never `String.length`.
- `A56` (t4-02): saving an unchanged name still calls the core save (it is how a damaged record gets repaired) and shows
  a saved state rather than a fake write.
- `A59` **open question for the user** (t4-03): SPA URL change detection. Default: poll `location.href` every 1000 ms
  plus `popstate`/`visibilitychange`; alternative: no timer, but a same-document `pushState` stays invisible until the
  user interacts. Reverting the default is one constant.
- `A60` (t4-03): `storage.onChanged` triggers a re-read and repaint only for this page's slot key and `settings:v1`; it
  is not a merge, the cross-tab race stays a documented v1 limitation.
- `A61` (t4-03): stale entries keep their popup row and stay deletable; only the Russian wording is added here.
