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
- `A61` **A stale entry stays visible in the popup and stays deletable** (already spec'd); this task adds only the
  Russian wording for the stale state in the popup row, from the popup's own constants module.

## AC (5 substantive + gates)

1. On a same-document URL change (`pushState` or `popstate`) the overlay re-resolves anchors against a **freshly built**
   stream (`A29`) and the highlight set matches the new document; a note whose text moved with the article is painted
   again, a note whose text vanished is not painted but remains in the popup (`A36`, `A24`).
2. `storage.onChanged` handling (`A60`): an edit made in another tab changes what is painted within one repaint, with no
   reload; a change to a **different** page's slot key triggers no work.
3. A name change in options (`settings:v1`) is picked up by an already-loaded page: the card that was previously
   refused now opens, and a foreign entry that became "mine" changes its edit affordance (`A31`, `A25`).
4. README (Russian) covers: build, load-unpacked steps, what `tabs` and `storage` are for (`A49`), the 256/40/20 limits,
   and the accepted v1 limitations (cross-tab race, repeated-text anchoring, iframes/shadow roots out of scope).
5. `docs/specs/INDEX.md` and the specs list no dangling task ids, and the final verification checklist (one run per
   Stage-3/4 observable behavior) is written into this state file with the human result quoted.

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

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 0.

## Verdicts

- engineer report: not started
- reviewer verdict: not started

## Browser verification list owned by this task (smoke-only — jsdom cannot answer)

1. A real **`Tab` key walk** through an open card: textarea → `Сохранить` → `Отмена`. `t3-02b` AC1 pins rendered order,
   focusability and the absence of `tabindex`, which is the jsdom form of the rule, not a key walk
   (`docs/state/t3-02b-review.md` remark 4).
2. An **unthrottled `pointermove`** over a painted range in a long article: cost is invisible on a short page
   (`t3-02` review remark 5).
3. **Select text, let the site replace the node, press `Сохранить`** — the browser case jsdom cannot produce
   (`docs/state/t3-02b-review.md` remark 1, closed in code by `t3-05`, verified here).

## Open questions

- `A59` is worth asking the user (a permanent timer on every page vs. a missed SPA navigation). Default applied.
- `A60`/`A61` are defaults; the cross-tab race is explicitly **not** solved here.
