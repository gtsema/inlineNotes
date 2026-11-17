# engineer report — t3-05 page-boundary throw safety (attempt 1)

## Commits

| # | hash | message | files |
| --- | --- | --- | --- |
| 1 | `14995da` | `fix(t3-05): guard the page-boundary throws at the content call sites` | `src/content/create/create-note.ts`, `src/content/overlay/create-card-controller.tsx`, `src/content/paint/page-painter.ts`, `tests/content-save-throw-safety.spec.ts` (new), `tests/content-paint-throw-safety.spec.ts` (new) |
| 2 | `6865db2` | `docs(t3-05): page-boundary throw rules` | `docs/specs/content-overlay-ui.md`, `src/content/main.ts`, `tests/content-throw-boundaries.spec.ts` (new) |

Order follows `A53` + `A73`: red-then-green tests plus the fix first, spec and rewritten
comments second.

## Red state before the fix (required by the brief)

`npx vitest run --reporter=basic tests/content-save-throw-safety.spec.ts`

```
× …answers Сохранить with selection_lost and leaves the card usable   → expected null to be 'Выделение больше не найдено на страни…'
× …answers a second press the same way, so the card is not one-shot   → expected true to be false
× …opens no card and rejects nothing when the open-time capture throws
Tests  3 failed | 4 passed (7)     Errors  4 (Unhandled Rejection: InvalidAccessError)
```

The unhandled-rejection stack is the defect chain the review named, verbatim:

```
Range.range.intersectsNode  → src/content/capture/selection-span.ts:150
                            → src/content/create/create-note.ts:115
                            → src/content/overlay/create-card-controller.tsx:129 (submit)
                            → src/content/overlay/create-card.tsx:66 (busy=true, Сохранить disabled)
```

`npx vitest run --reporter=basic tests/content-paint-throw-safety.spec.ts`

```
× registration the page refuses …  × teardown that also throws …  × unreadable page address …
× stream root the page refused …   × leaves the stored page untouched through every failing pass
Tests  5 failed | 3 passed (8)
```

The three that were already green before the fix are labelled as pins below.

## Gates (order per `A62`, run after commit 2 on the committed tree)

```
npm run build            → [build] dist/ is a self-contained MV3 folder (10 files)
npm test                 → Test Files  37 passed (37)
                           Tests  672 passed (672)
node scripts/check-agent-config.mjs
                         → 0 error(s), 0 warning(s), 57 info(s)
```

`npm run typecheck` was also run after each edit (`tsc` over
`tsconfig.content.json`, `tsconfig.app.json`, `tsconfig.spec.json`) and is clean.
The checker's `INFO` lines are the pre-existing "planned path not created yet" class that
the specs already produced before this task (36 → 57 lines because the new spec table cites
more paths); 0 errors, 0 warnings.

## Acceptance-criteria self-check

### AC1 — a save over a selection the page took away answers `selection_lost`, writes nothing, leaves the card usable

Implemented at the content call site (`A75`), never in core, never inside the capture module:

- `src/content/create/create-note.ts` — the two page-touching calls (`buildTextStream`,
  `captureSpan`) are wrapped where they are called; a throw returns
  `{ ok: false, code: 'selection_lost' }`. No new code, no new string, nothing written.
- The card keeps **no** `catch` around the create path: the refusal stays a
  `CreateNoteResult`, so the busy / refusal-line machine has one input and `setBusy(false)`
  always runs. Pinned by a grep test (`the card free of a catch around the create path`).

Pinned by `tests/content-save-throw-safety.spec.ts` (jsdom cannot throw from
`intersectsNode` — verified experimentally: jsdom answers `false` for a detached node — so
the range object itself is replaced with one that throws a `DOMException` named
`InvalidAccessError`, the shape the DOM spec names for "node's root is not the range's
root", on top of a real detach):

| assertion | result |
| --- | --- |
| refusal line equals `REFUSAL_TEXT.selection_lost` and not `entry_invalid` | green |
| `Сохранить` is present, enabled, labelled `Сохранить`; card still open; draft `my note` intact | green |
| no port write other than the fixture's own author write; `loadEntries` still returns `[]` | green |
| a second `Сохранить` answers identically (card is not one-shot, not stuck) | green |
| `Отмена` after the refusal closes the card and writes nothing | green |
| `Esc` after the refusal closes the card and writes nothing | green |
| `captureSpan` itself still propagates the `InvalidAccessError` (the guard is not moved into the capture module) | green |

### AC2 — `createPagePainter.refresh()` cannot reject

- Four guarded stages at their call sites in `src/content/paint/page-painter.ts`:
  page-address read (`url_unparsable`), store read (`storage_unavailable`),
  resolve-measure-register stage (empty pass + teardown + per-entry skip reasons),
  and `clearPaint()` itself (a refused teardown is not a second failure).
- A failing pass paints nothing, tears down the names it had already registered, writes
  nothing, and reports the code of the failed stage; the per-entry reasons it had already
  classified are kept, the rest get the existing `measurement_failed` (`A66`) — no new code.
- The misleading comment is gone. `PagePainter.refresh()` now carries the contract as a doc
  block on the interface ("**Cannot reject** … this promise has no caller that can catch
  it … pinned by `tests/content-paint-throw-safety.spec.ts`"), the module header states it,
  and `src/content/main.ts` no longer says "documented never to throw".
- Pinned by `tests/content-paint-throw-safety.spec.ts` (8 tests): registration refused
  (half-registered name is removed again, `heldNames() === []`, style rules empty),
  teardown that also throws, unreadable page address, stream root that throws, the `A66`
  per-entry boundary kept upstream of the pass guard, and "the stored page is untouched
  through every failing pass".

### AC3 — the throw paths are enumerated in one place; every shipped `catch` is tested or named

- `docs/specs/content-overlay-ui.md` gained `## Page-boundary throws` (plus a
  `page-boundary throw` row in Terms / Aliases and AC21): three rules (where the guard
  sits, what the answer may be, which promises must not reject) and one table with a row
  per call site — state that throws, answer, verification.
- All 12 shipped `catch` sites under `src/content/` are in the table. Ten are covered by a
  test; two are named with the reason they are not driven: `paint/paint-style.ts`
  `adoptPaintSheet` (jsdom has no constructed-stylesheet support, so neither
  `new CSSStyleSheet()` nor the `adoptedStyleSheets` write can be made to throw in a unit
  test) and the painter's store-read `catch` (the shipped port adapter codes every storage
  rejection, so no shipped path reaches it; the guard is what makes the no-reject contract
  unconditional).
- `tests/content-throw-boundaries.spec.ts` makes the enumeration mechanical: the section
  exists with its table header, every file that contains a code-level `catch` is named in
  the section, every row ends with a test name or an explicit "named:" statement, the
  pinned set is exactly `{create-note 1, controller 2, tooltip 1, page-painter 4,
  paint-plan 1, paint-style 2, chrome-storage-port 1}` totalling 12, `selection-span.ts`
  contains no `try`/`catch`, and the card's `submit` contains no `catch`. Adding a `catch`
  without updating the spec breaks the build.

## Carried-fix checklist (`A72`), answered by number

1. **`t3-02` review remark 4 — `page-painter.ts` documented `refresh()` as "never throws"
   while `registerPlan` was unguarded and `main.ts` runs `void painter.refresh()`.**
   Fixed. The claim is now a stated contract on `PagePainter.refresh()` and on the module
   header, the registration/measure stage is guarded, and the contract is pinned by injected
   throws per stage (6 of the 8 new painter tests exercise a throw). `main.ts` points at the
   test file and at the spec section instead of at a comment.
2. **`t3-02b` review remark 1 — `Range.intersectsNode` throws `InvalidAccessError` when the
   kept boundary node left the document; `createNote` then rejects and the card stays
   `busy` with a disabled `Сохранить` and no message.** Fixed at both moments of the same
   class: the save moment (`create-note.ts` → `selection_lost`, card stays usable) and the
   open moment (controller `captureFromPage` → Flow 1 answers nothing, no card, no
   rejection reaching `card-events.ts`). Reproduced in a test by injecting the throw on the
   range object, because jsdom answers `false`.
3. **Ruling `A75` — guard the content call sites and enumerate the throw paths.** Done.
   Both guards are at content call sites; `src/core/` was not touched and keeps throwing
   its own errors; `capture/selection-span.ts` keeps no `catch` (pinned by a grep test); the
   enumeration lives in one spec section and is itself pinned by
   `tests/content-throw-boundaries.spec.ts`.

## Deviations and additions (nothing invented silently)

1. **Test files.** The new tests live in three new files
   (`tests/content-save-throw-safety.spec.ts`, `tests/content-paint-throw-safety.spec.ts`,
   `tests/content-throw-boundaries.spec.ts`) instead of being appended to
   `tests/content-create-card-controller.spec.ts` and `tests/content-page-painter.spec.ts`.
   Reason: mid-run steering from the orchestrator after edits to the 1129-line controller
   spec proved unmanageable. The save path is still driven through the real controller with
   an injected throwing range, as the task file requires; the names are not mandated.
2. **Second guard site.** The brief named the save path; I also guarded the open-time
   capture in the controller. Same throw class, same slice, and
   `void controller.capture()` in `card-events.ts` would otherwise leave an unhandled
   rejection in the page — the same failure class AC2 closes. Flagged because it is one call
   site more than the brief listed.
3. **`buildTextStream` shares the guard** with `captureSpan` in `create-note.ts`: it walks
   the same tree the range is tested against, so guarding only `intersectsNode` would leave
   the same escape route.
4. **Pins that were green before the fix** (disclosed so the red-first record is honest):
   `answers a storage read that throws with an empty pass and its code` and `opens no card
   when the settings read throws` — core already converts a rejecting storage area into a
   coded failure, so no shipped throw reaches those guards; they pin the observable answer,
   not a red state. Also green before the fix: the `Отмена` / `Esc` cases (the card closed
   even while `busy`) — they are AC1's "card stays usable" half, and they now run after a
   real refusal instead of after a frozen card.
5. Untouched, per the out-of-scope list: `t3-03` editor work, `t4-01` / `t4-02` popup and
   options, `t4-03` SPA and `storage.onChanged`, `src/manifest.json`, dependencies, the
   refusal-code vocabulary (no new code was added anywhere), Russian strings (`src/content/text.ts`
   unchanged), and `docs/state/*`.

## Residual risks

1. The injected `InvalidAccessError` is a shape, not a byte-for-byte engine object. The
   guard catches **any** throw at that call site and answers with the existing code, so the
   behavior does not depend on the shape; but the reproduction is still synthetic.
2. No `chrome://extensions` load of `dist/` was performed in this environment — no browser
   is available to the role. The build gate proves `dist/` is a self-contained MV3 folder;
   the observable AC1 state (a site that re-renders the selected paragraph between the card
   opening and `Сохранить`) still has to be confirmed by whoever runs the runtime check, and
   it is exactly the state jsdom cannot produce.
3. `createNote` can still reject if an **injected seam** throws (a throwing `onCreated`
   callback, or a test port that rejects with a raw error). With the shipped wiring that
   route is closed — `onCreated` is `void painter.refresh()`, and `refresh()` cannot reject
   now — but the card deliberately keeps no `catch` there, so a future seam that throws
   would freeze the card again. The spec section states this trade-off; if the reviewer
   prefers belt-and-braces, the guard would belong in `submit`, which the current spec line
   explicitly rejects.
4. The painter's store-read guard is unreachable through the shipped port adapter; it is
   named in the enumeration rather than driven, and if the adapter ever stops coding
   rejections the guard is what keeps `refresh()` non-rejecting.
