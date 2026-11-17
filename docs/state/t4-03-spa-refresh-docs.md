# t4-03-spa-refresh-docs

## Goal

Keep the page honest when it changes under the notes: an SPA that rewrites the URL or the article text must not keep
painting stale highlights, and another tab that edits a note must be reflected without a reload. Then the README and the
final observable-behavior checklist, so the loop is verifiable by a human.

## PM rulings and open questions

- `A59` **How an SPA URL change is detected — open question, default applied.** A content script runs in the isolated
  world, so it cannot observe the page calling `history.pushState` by patching `history` (that object belongs to the main
  world). Options:
  1. **Default:** poll `location.href` on a fixed interval (1000 ms) inside the content script, plus `popstate` and
     `visibilitychange` as immediate triggers; on a change, rebuild the stream and re-resolve. Cost: a timer that runs
     forever on every page; cost per tick is one string compare, which is negligible.
  2. No polling: re-resolve only on `popstate`, `visibilitychange` and user interaction. Cost: a same-document
     `pushState` navigation (Gmail-style) is invisible until the user clicks or switches tabs.
  Applied default: **1**, because the spec promises "a note never disappears because of added parameters" and an
  invisible navigation is the failure mode the promise exists to cover. Reverting is one constant.
- `A60` **Cross-tab refresh is a repaint, not a merge.** The content script listens to `chrome.storage.onChanged` for
  `chrome.storage.local`, and when a key belonging to its own page (slot key) or `settings:v1` changes, it re-reads
  through core and repaints. It does not queue, merge or reconcile writes: the cross-tab read-modify-write race stays a
  v1 limitation (recorded since `t1-06`), and this task documents it rather than pretending to solve it.
- `A61` **corrected by `A86` before delegation.** A stale entry stays visible in the popup and stays deletable — that is
  already spec'd and already shipped by `t4-01`. The old sentence here promised that this task "adds only the Russian wording
  for the stale state in the popup row", and it is **not implementable as written**: staleness is a page-side locate result
  (`anchor_not_found` / `anchor_stale` in the paint pass), while the popup reads only `chrome.storage.local` through core, and
  the two paths that could deliver that knowledge to the popup — message passing and a service worker mapping `tab.id` →
  page key — were deliberately rejected by `A49`/`A50`. Ruling `A86`: **the popup does not label stale entries in v1.** The
  Terms label «запись недоступна» stays where it is true (the page: no highlight, no tooltip). What the user actually gets is
  the specified promise: a stale entry is still listed and still deletable.

## AC (3 substantive for this slice + gates)

1. On a same-document URL change (`pushState` or `popstate`) the overlay re-resolves anchors against a **freshly built**
   stream (`A29`) and the highlight set matches the new document; a note whose text moved with the article is painted
   again, a note whose text vanished is not painted but remains in the popup (`A36`, `A24`).
2. `storage.onChanged` handling (`A60`): an edit made in another tab changes what is painted within one repaint, with no
   reload; a change to a **different** page's slot key triggers no work.
3. A name change in options (`settings:v1`) is picked up by an already-loaded page: the card that was previously
   refused now opens, and a foreign entry that became "mine" changes its edit affordance (`A31`, `A25`).
4. **Moved out (PM scope split, 2026-11-17):** the README half and the final-verification half now belong to
   `t4-04-readme-final-verification`, together with the `t4-02` review remarks R2–R4 and the browser smoke list. Reason
   (`delivery-planning`, the `t3-03` lesson): this slice already carries 3 AC in the content layer **plus** CF1; a slice that
   also owns documentation and a human verification run is the shape that overruns the runtime ceiling.

Gates green and quoted: `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

Work order (`A53`): code+tests → `npm test` → **commit immediately** → specs/README → gates → second commit.

## Inputs the engineer reads

`docs/specs/content-overlay-ui.md` (AC8, Edge Cases), `docs/specs/inline-comment-model.md` (AC1, staleness, cross-tab
note), `src/content/`, `src/core/settings-store.ts`, `src/core/entry-store-read.ts`, `docs/project-profile.md`
(commands and limits to copy into the README).

## Explicitly out of scope

New permissions (manifest stays at `storage` + `tabs`), iframes and page-owned shadow roots, any merge/lock protocol for
the cross-tab race, Firefox/Edge.

## Attempts log

- attempt 1: brief prepared; delegated last in Stage 4.
- **2026-11-17: delegated as the code slice only** (README / spec surface / verification split to `t4-04`), with CF1 as its
  single carried item and `A61` corrected to `A86` before delegation. Delivered four commits, all green:
  `adfc8e9` (storage watch + url watch, shipped code), `79acb74` (SPA watch tests + the spec lines), `e0ae2ec` (CF1 render
  pins), `c2d74ab` (a test-side cast so `tsconfig.spec` accepts a `delete` operand).

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: **1**. Remaining: 1 (the reviewer).

## Verdicts

- engineer report: delivered, copied to `docs/state/t4-03-engineer.md` — AC1–AC3 + CF1 answered by number, 7 deviations
  declared (including the one `src/core/` addition), 5 residual risks, no blocking open question
- reviewer verdict: not started
- **PM gates re-run personally** (`A77`): `npm run build` green (10 files), `npm test` **778/778** over 41 files (+44),
  `node scripts/check-agent-config.mjs` 0 errors / 0 warnings / 86 INFO, `npm run typecheck` exit 0, tree clean

## PM rulings and acceptances on this task

- `A87`: **the one `src/core/` addition is accepted as key vocabulary, not a rule change.**
  `storageChangeConcernsPage(storageKey, pageKey)` in `src/core/storage-keys.ts` answers only "can this storage key change
  what this page shows" — a pure total function next to the existing `slotKeyFromStorageKey`. The layer rules put storage-key
  vocabulary in core, and letting the content layer decode slot keys itself would have been the actual violation. No existing
  core rule, code path or error changed; the engineer named the deviation instead of hiding it.
- `A88`: **`pages:v1` is not a repaint signal.** Every write anywhere updates the index, so watching it would make every open
  tab repaint for every note stored anywhere — the opposite of `A60`. Consequence accepted: a write that touches only the
  index is not noticed, and no shipped write does that.
- Accepted as decisions, not oversights (all recorded in the spec): the watches are never torn down in a content script
  (teardown exists for tests only); the permanent cost is one `setInterval` at 1000 ms whose body is a `location.href` read
  and one string compare; `pagehide`/`pageshow` are not triggers because bfcache restore re-runs the pass at load; the url
  watch is **address-based**, so a same-address re-render (infinite scroll) is not a trigger and the entry stays unpainted
  until some other event repaints.

## Browser verification list owned by this task (smoke-only — jsdom cannot answer)

1. A real **`Tab` key walk** through an open card: textarea → `Сохранить` → `Отмена`. `t3-02b` AC1 pins rendered order,
   focusability and the absence of `tabindex`, which is the jsdom form of the rule, not a key walk
   (`docs/state/t3-02b-review.md` remark 4).
2. An **unthrottled `pointermove`** over a painted range in a long article: cost is invisible on a short page
   (`t3-02` review remark 5).
3. **Select text, let the site replace the node, press `Сохранить`** — the browser case jsdom cannot produce
   (`docs/state/t3-02b-review.md` remark 1, closed in code by `t3-05`, verified here).
4. **Selecting the text of your own note opens the editor, never a create card** — the `main.ts:78-79` wiring of the
   `claimSelection` hook is deliberately unpinned in jsdom (accepted debt: `docs/state/t3-03-review-attempt2.md` new
   remark 1), so the browser is where this handover is verified.
5. **The popup against a real page** (asked by the `t4-01` engineer, residual risks 2–4): rows render with the author name,
   the checkbox state and the ownership marker; `chrome.tabs.query` really returns `tab.url` with the `tabs` permission
   (`A49`), and the install-time "read browsing history" warning is shown once and explained in the README (Russian) — the
   README line itself is `t4-04`'s deliverable.
6. **A checkbox write repaints the page** — shipped by this task's `storage.onChanged` listener; the popup list itself stays
   a snapshot while open (accepted v1 behavior unless the user rules otherwise).

## Carried fixes for this slice (numbered — the engineer answers each by number, `A72`)

1. **CF1** (`docs/state/t4-01-review.md` → "Carried fixes") — pin the **render** half of the popup's AC4/AC5 in
   `tests/toolchain-contract.spec.ts`: (a) the empty-state paragraph renders (`class="empty">{{ emptyState }}`); (b) document
   order — both notice branches (`notice--name`, `notice--not-injectable`) precede `class="rows"`, i.e. notices render
   **above** the list (`A83`, `A81`); (c) the list block and the `Удалить` button are not hidden behind a notice or ownership
   condition. Test-only; no behavior change expected.

## Carried fixes handed to `t4-04-readme-final-verification` (R2–R4, the docs half)

1. **R2 — the empty-name path contradicts itself across two sources.** The options UI disables `Сохранить` while the value
   is empty after the trim (`src/options/options.component.ts:62`, `author-name-service.ts:154`), so the sentence
   `Имя обязательно` (`src/options/text.ts:46`) is unreachable on that surface, while
   `docs/specs/content-overlay-ui.md:53` still promises it as the empty-value path. Decide one story for v1 — the PM's
   default: the disabled button is the shipped rule, and the spec says the `name_required` sentence belongs to the popup
   and the content layer, not to the options input — then amend the spec line in the same commit.
2. **R3 — one rule copied into two specs**: the "shapes generated over" enumeration exists verbatim in
   `docs/specs/inline-comment-model.md:76` and `docs/specs/content-overlay-ui.md:103`. One of them becomes a
   cross-reference (the model spec owns name rules) before a future edit desynchronizes them.
3. **R4 — a spec clause wider than its tests**: AC19 (`content-overlay-ui.md:154`) promises 40 code points "accepted **and
   saved**"; acceptance and refusal are pinned, but nothing writes a 40-code-point name through `saveSettings`. Either add
   that write (the astral case is the interesting one) or drop "and saved" from the sentence.


## Open questions

- `A59` is worth asking the user (a permanent timer on every page vs. a missed SPA navigation). Default applied.
- `A60`/`A61` are defaults; the cross-tab race is explicitly **not** solved here.
