# t9-02b — the spec stops claiming what nobody measured, and three unpinned rules get pins (Stage 9)

Opened by the `t9-01` review (`docs/state/t9-01-review.md`), which produced **four** carried items. The skill's rule is
explicit: more than two carried fixes get their **own slice** instead of stacking onto the next task. The one that belongs
to `t9-02` (the `Terms / Aliases` rows for strings that task introduces) stays there as its carried fix 1; these three come here.

Runs **after** `t9-02` is accepted: the sentence it restates describes the layout `t9-02` ships, and pinning a stylesheet that
is about to be rewritten would be wasted work.

## AC (numbered; the engineer writes the spec changes in the spec's own wording style)

1. **No unmeasured observable is written as shipped fact.** The sentence the `t9-01` review flagged
   (`docs/specs/content-overlay-ui.md:89`, «…never produces a horizontal scrollbar at the dialog's own width») is restated as
   a requirement whose observation is owed by Run 6, in the discipline the same spec already uses for the `action row` hit box
   («no sentence here claims it as something the reader sees»). After this, a grep for the dialog-box rule finds a requirement,
   not a claim.
2. **The layout rule that `t9-02` ships is pinned mechanically.** The test that reads shipped style text now also pins the
   options window's own width rule (the centered card, no fixed narrow column), so AC 1's sentence is backed by a check rather
   than by prose.
3. **R2 of the review: the build-script scan pin proves the rule, not the wording.** The pin in
   `tests/toolchain-contract.spec.ts` must additionally require the reference-existence check and its failure message in
   `scripts/build-extension.mjs`, so «a missing `dist/options/index.html` fails the build» no longer rests on the engineer's
   one-off mutation described in a commit message.
4. **R3 of the review: the two negatives are either pinned or narrowed.** Either `tests/` proves that no `src/` file calls
   `window.close()` / `resizeTo()` and that no `src/content/` module names `openOptionsPage` / `options_ui`, or the AC and spec
   wording drops those claims. One of the two, not neither. The vacuous half of the same pin (the manifest names no `icons`,
   no `action.default_icon`, no `content_scripts[0].css`) is narrowed in the same edit.
5. **The mascot circle gets a byte-level pin (the `t9-02` review's blocking finding 1).** `border-radius: 50%` clips the
   mascot to the circle inscribed in its box, so «the whole artwork, the lifebuoy included, survives the frame» is a property
   of the artwork, and nothing in the repo establishes it. Add an assertion that reads the shipped PNG's pixels (the file is
   8-bit RGBA, 128×128 — decode it in the test the way `IHDR` is already read) and proves every non-transparent pixel lies
   inside the inscribed circle. If the artwork does **not** fit, do not edit the PNG and do not weaken the assertion: report
   it, and the PM rules on the frame instead.
6. **R3 of the `t9-02` review: the spec overstates the contrast mechanism.** `docs/specs/content-overlay-ui.md` says the test
   recomputes the ratio of *every* pair that carries text *from those literals*; the recomputation reads the test's own
   constants and its pair list omits one shipped pair — the field's `#1b2a33` on `#ffffff`. Either add that pair to the list
   or narrow the sentence. Do not do both by silently leaving the sentence wrong.
7. **R9 of the `t9-02` review: replace a count with a rule.** `tests/options-window-look.spec.ts:354` pins
   `template.split('{{').length - 1 === 6`. A count is not a rule: any later correct interpolation trips it. Pin what the
   count was protecting (the template renders the pinned strings through bindings) in a shape that survives an honest edit.
8. **R5 of the `t9-02` review: the message color role is unpinned.** `messageClass()` decides between the confirmation
   `#0f5f7a` and the refusal `#b3261e`; a swapped mapping passes all 976 tests. Pin the mapping.
9. **Gates.** `npm run build` → `npm test` → `node scripts/check-agent-config.mjs` (plus `npm run typecheck`) exit 0, quoted in
   `docs/state/t9-02b-engineer.md` — a repo file written by the engineer's own write tool, not the harness run artifact.

If the slice does not fit the ceiling, **finish AC 1–5, commit them green, and report which of AC 6–8 stayed open** — a
half-closed debt slice is worth more than an unfinished one. The `dist/` file count must not change.

## Brief — t9-02b (to `extension-engineer`)

- **Task.** Close carried findings 2, R2 and R3 of the `t9-01` review: no spec sentence may state an unobserved observable as
  fact, and every rule an AC names must have a pin or be removed from the AC.
- **Input paths.** `docs/project-profile.md`, `docs/state/t9-01-review.md` (findings 1–2, remarks R1–R7),
  `docs/state/t9-01-options-window.md`, `docs/specs/content-overlay-ui.md`, `docs/specs/code-review-flow.md`,
  `scripts/build-extension.mjs`, `tests/toolchain-contract.spec.ts`, `src/options/options.component.ts`.
- **Output artifact.** One commit plus the repo report `docs/state/t9-02b-engineer.md`.
- **Acceptance criterion.** AC 1–5 above.
- **Carried-fix checklist:** 1 = finding 2 of the `t9-01` review (AC 1–2 here), 2 = remark R2 of `t9-01` **and** remark R2 of
  `t9-02` (AC 3 — apply the same treatment to both guards: the `options_ui` reference check and the new asset guard at
  `tests/options-window-look.spec.ts:203-213`), 3 = remark R3 of `t9-01` (AC 4), 4 = blocking finding 1 of `t9-02` (AC 5),
  5 = remarks R3, R9, R5 of `t9-02` (AC 6–8). The report answers each number with `done` + file:line or `skipped` + reason.
- **Constraints.** Docs and tests only: **no** change to any file under `src/` except none — this task ships no behavior. Do not
  restate or re-litigate `A118`–`A124`; do not touch `README.md` numbers owned by `t9-03`. Do not weaken any existing pin: the
  reviewer counted 958 tests over 45 files green, and the count may only grow. The task state file
  `docs/state/t9-02b-spec-test-debt.md` is the PM's; the only other `docs/state/` file you write is your own report.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched yet (after `t9-02` acceptance) | — |

## Explicitly **not** in this slice

The disabled `Сохранить` state (`.save:disabled { opacity: 0.45 }`) puts the label near 1.4:1 against its own button. WCAG
1.4.3 exempts inactive controls, so no rule breaks and no AC fails, but `A125` names no disabled role. Changing it is an
observable-behavior change and needs a ruling (`A127` is pending the user's word), so it stays out of a docs-and-pins slice.

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.

## Open questions

- None behavioral. This slice exists only to keep the evidence chain honest; the user-visible effect is zero.
