Review artifact (written to the briefed output path `docs/state/reviewer-report.md` under the run's artifact root):

# code-review artifact — `t3-05-page-boundary-throw-safety`, attempt 1

Reviewed range: `git log 5375011..HEAD` → `14995da` (fix + `tests/content-save-throw-safety.spec.ts`, `tests/content-paint-throw-safety.spec.ts`), `6865db2` (spec + rewritten comments + `tests/content-throw-boundaries.spec.ts`), `2aaf769` (state bookkeeping). Working tree clean before and after my gates.

## Verdict: `accepted`

## Gate evidence — re-run by the reviewer, `A62` order

```
npm run build            → exit 0 — "[build] dist/ is a self-contained MV3 folder (10 files)"
npm test --reporter=basic→ exit 0 — "Test Files 37 passed (37)" / "Tests 672 passed (672)"
node scripts/check-agent-config.mjs
                         → exit 0 — "0 error(s), 0 warning(s), 57 info(s)"
npm run typecheck        → exit 0 (tsc over content / app / spec)
git status --porcelain   → empty after the gates
```

Test delta accounted for independently: `npx vitest run --reporter=basic` over the three new files → `content-throw-boundaries 7`, `content-paint-throw-safety 8`, `content-save-throw-safety 7` = **+22**, and `650` (`docs/state/t4-02-review.md:17`) + 22 = **672**; 34 + 3 = **37** files; checker INFO 36 → 57. The PM's numbers match my runs.

## 1. Red state is real, not narrated

Verified by reasoning over the two new files against the shipped code (I cannot revert the guard — read-only), and the chain the report quotes is the chain in the code.

- `tests/content-save-throw-safety.spec.ts:245` — with the guard at `src/content/create/create-note.ts:136-142` removed, `captureSpan` (`src/content/capture/selection-span.ts:150`) throws through `submit`, so no refusal line ever renders and the first failing assertion is `expect(line).toBe(REFUSAL_TEXT.selection_lost)` → `expected null to be 'Выделение больше не найдено на странице'` (`:252`). Matches the quoted red line.
- `tests/content-save-throw-safety.spec.ts:269` — same escape leaves `busy` true, so `expect(buttonOf(save).disabled).toBe(false)` → `expected true to be false` (`:276`). Matches.
- `tests/content-save-throw-safety.spec.ts:314` — without `captureFromPage` (`create-card-controller.tsx:227-233`), `await fixture.controller.capture()` rejects with the injected `DOMException` and the test fails before any assertion.
- `tests/content-paint-throw-safety.spec.ts:207 / :236 / :268 / :285 / :338` — with the three `refresh()` guards (`page-painter.ts:172-192`, `:213-232`) and the `clearPaint` guard (`:236-253`) removed, `refresh()` rejects (registration `IndexSizeError`, `heldNames()` throw, `url()` throw, `root()` throw), so `await painter.refresh()` fails the test; `:285` and `:338` additionally need the new `skippedForFailedPass` (`:281-296`) to satisfy their `skipped` shape. That is exactly the 5 red tests the report quotes.
- Green-before-the-fix pins are disclosed by the report itself (`:251` storage-read-throws — core already codes a rejecting area; `:194` fixture proof; `:319` the pre-existing `A66` per-entry rule; and the `Отмена`/`Esc` cases at `:283`/`:295`). None of them is a guard test, so none is a vacuous guard pin: each states an AC-observable answer that stays true after the change. `:346` deliberately pins the *absence* of a guard in the capture module (ruling `A75`), so it is green by design.

No guard-dependent test passes with its guard deleted.

## 2. Acceptance criteria — one line per AC

- **AC1 — pass.** Guard at the save call site `src/content/create/create-note.ts:136-142` answers `{ ok: false, code: 'selection_lost' }` (string `src/content/text.ts:89`), before any write; pinned by `tests/content-save-throw-safety.spec.ts:245` (refusal line, `Сохранить` present + `disabled === false` + label `Сохранить` at `src/content/text.ts:40`, card open, draft `my note` intact, `writesOtherThanSettings === []`, `loadEntries → []`), `:269` (second press identical, still not one-shot), `:283`/`:295` (`Отмена`/`Esc` close and write nothing after the refusal). The open-moment case of the same class is guarded at `src/content/overlay/create-card-controller.tsx:227-233` (call site `:248`) and pinned at `:314`.
- **AC2 — pass.** `createPagePainter.refresh()` cannot reject: page-address stage `page-painter.ts:172-181` → `url_unparsable`; read stage `:183-192` → `storage_unavailable`; resolve-measure-register stage `:213-232` → empty paint + `clearPaint()` + per-entry reasons with `measurement_failed`; teardown `:236-253` swallows a refused registry. Pinned by `tests/content-paint-throw-safety.spec.ts:207, :236, :251, :268, :285, :338`. The comment claim is now a pinned property: interface doc block `page-painter.ts:70-88`, module header `:34-38`, and `src/content/main.ts:44-47` no longer says "documented never to throw" and names the test + spec section; the two `void painter.refresh()` call sites are `main.ts:59-60` and `:80`.
- **AC3 — pass.** One section `docs/specs/content-overlay-ui.md:135-181` (`## Page-boundary throws`, three rules + `### Every catch under src/content/`, table header `:143`), term row `:42`, AC line `:209` (AC21). My own `grep -rnE "\bcatch\s*[({]" src/content/` returns exactly 12 sites in 7 files — `create-note 1`, `create-card-controller 2`, `tooltip-controller 1`, `page-painter 4`, `paint-plan 1`, `paint-style 2`, `chrome-storage-port 1` — every one of those files appears in the table, and the two driven-without-a-throw rows are named with a reason (`content-overlay-ui.md:176`, `:180`). The enumeration is itself pinned by `tests/content-throw-boundaries.spec.ts:68, :75, :84, :94, :113` (pinned set + total 12 + `selection-span.ts` free of `try`/`catch` + `submit` free of `catch`, `:135, :143`).
- **Gates — pass** (reviewer-run, quoted above).

## 3. Guard placement per `A75`, and the untouched set

`git diff --stat 5375011..HEAD -- src/core/` → **empty**; `-- src/manifest.json package.json` → **empty**; `-- src/content/text.ts` → empty, so no Russian string was added or changed (`text.ts:40, :42, :89` are the pre-existing vocabulary). No new refusal code or skip reason: every code the new catches emit (`selection_lost`, `url_unparsable`, `storage_unavailable`, `measurement_failed`) is a pre-existing member of `CreateNoteCode` (`create-note.ts:73`), `PageLoadCode` (`page-painter.ts:131-138`) and `PaintSkipReason`. The two new catches are at content call sites only (`create-note.ts:136`, `create-card-controller.tsx:229`); `src/content/capture/selection-span.ts` still throws (`:150`, no `try`/`catch`) and the card's `submit` still has no `catch`.

## 4. Painting contract — no regression

`paint-plan.ts` and `paint-surface.ts` are not in the range, so `A38` one-stream-per-pass still lives at `paint-plan.ts:121` (`buildTextStream` once) and `A66` per-entry measurement at `paint-plan.ts:180`. In `refresh()` the seam `streamRoot()` and `buildPaintPlan` are each called **once** per pass (`page-painter.ts:215-219`); `skippedForFailedPass` (`:281-296`) walks the already-read `page.entries`, it opens no second stream. Teardown runs on all three new failure paths (`:178`, `:189`, `:223`) in addition to the pre-existing untrustworthy-read path (`:200`); `A39` delete-before-write and name-prefix scope in `registerPlan` (`:298-322`) are unchanged, and `A41` (adopted sheet, no `<style>`) is untouched in `paint-style.ts`. `git diff 5375011..HEAD -- tests/content-page-painter.spec.ts tests/content-create-card-controller.spec.ts` → **empty**: no existing pin was loosened or deleted, and the whole 672-test set is green.

## 5. Boundaries

No `fetch`/`XMLHttpRequest`/`WebSocket` anywhere in the range (`grep` over the three changed source files → no hits); no new dependency (`package.json` untouched); no host-DOM mutation for painting (`page-painter.ts` touches only `CSS.highlights` via `PaintSurface` and the adopted sheet via `paint-style.ts`); no `chrome.*` call in `src/core/` (core untouched); the injected seams (throwing range, `FailingSurface`, throwing `url()`/`root()`/`port.get`) exist only inside `tests/`, and production wiring `main.ts` changed only in a comment. `tests/content-throw-boundaries.spec.ts:14-15` uses `node:fs` in a node-environment test — test-side only.

## Blocking findings

**None.**

## Non-blocking remarks

1. `docs/specs/content-overlay-ui.md:180` — the justification for not driving `paint/paint-style.ts:159`/`:169` is factually wrong about the environment: jsdom 31.0.1 does support constructed sheets, as `tests/content-paint-style.spec.ts:42` (`new CSSStyleSheet()`) and `:119-133` (`document.adoptedStyleSheets` writes) prove. The substantive claim (no test drives either throw) is true and the AC only requires the row to be named, so this does not block; the wording should change to a reason that is true (e.g. `adoptPaintSheet` is module-private and cached per document at `paint-style.ts:120-141`, so a throw cannot be injected through the shipped entry point).
2. `src/content/paint/page-painter.ts:178` and `:189` — the two early failure returns leave `authorName` holding the previous pass's value, so `authorNameOfPass()` (`:257`) can name an author for a pass that read nothing. Not covered by any assertion in the new file; cosmetic today (`t4-03` will own it).
3. `src/content/create/create-note.ts:140` and `src/content/paint/page-painter.ts:222` — a bare `catch {}` maps *any* throw, including a defect in this repository's own code, onto an existing page-state code with no diagnostic. Deliberate per the spec's "Where the guard sits" rule (`content-overlay-ui.md:146-154`); recorded because the next content defect will look like a page state.
4. `docs/state/t3-05-engineer.md` (Carried-fix checklist section) — the report's three lines are labelled `1 = t3-02 remark 4`, `2 = t3-02b remark 1`, `3 = ruling A75`, i.e. a different order and a different third label than the brief's checklist. Every brief number is answered (mapping below), but the numbers themselves are not echoed, which is what `code-review-flow` `A72` bookkeeping wants.
5. Brief/spec tension, recorded not resolved: the brief ordered me to re-run the three green gates, while `docs/specs/code-review-flow.md:126` and `docs/project-profile.md:71` allow the reviewer to re-run only `node scripts/check-agent-config.mjs`. I followed the brief; `dist/` is gitignored (`git status` clean afterwards), so the reviewable tree was not mutated. The PM may want to state which rule wins for future reviews.

## Carried fixes (`A72`), one line per number of the brief's checklist

1. **`t3-02b` remark 1 — detached-node `intersectsNode` throw freezes the card (AC1):** **closed.** Guard at `src/content/create/create-note.ts:136-142`, open-moment twin at `src/content/overlay/create-card-controller.tsx:227-233`; pinned by `tests/content-save-throw-safety.spec.ts:245, :269, :283, :295, :314`; capture module still throws (`:346`).
2. **`t3-02` remark 4 — `refresh()` "never throws" unguarded and unproven (AC2):** **closed.** Four stage guards at `src/content/paint/page-painter.ts:172-192, :213-232, :236-253`; the claim now lives as a contract at `:70-88` and `:34-38`, `src/content/main.ts:44-47` points at the test and the spec section; pinned by `tests/content-paint-throw-safety.spec.ts:207, :236, :268, :285, :338` (red before the fix per the report, red-state chain reproduced by my own reading).
3. **`t3-02` remark 4 family — a doc-comment asserting an unpinned guarantee (AC3):** **closed, with remark 1 above.** Single enumeration at `docs/specs/content-overlay-ui.md:135-181` + AC21 `:209`, mechanically pinned by `tests/content-throw-boundaries.spec.ts:68-152`; the one remaining inaccurate sentence in that table is `:180` (jsdom capability), which does not affect any AC.