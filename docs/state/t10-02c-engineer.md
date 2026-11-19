# t10-02c — the shipped absence pin reads the widened reader (finish-only slice on `01354da`, AC 9b of `t10-02`)

One defect, the PM's measurement. Tests and `docs/` only; no file under `src/` or `scripts/` changed.
Commit: `7a66202`. Baseline was **1025 tests / 46 files** → **1026 / 46**.

## 1. The defect and what it did

Attempt 2 of `t10-02` widened a **helper** (`carriesInlineStyle`, `tests/options-window-look.spec.ts:301`)
and exercised the four shapes Angular ships an inline style in — `style=`, `[style]`, `[style.x]`,
`[attr.style]` — on **hand-typed strings** (`:880`, `:891`). The assertion over the **shipped**
template (`:864`) stayed the narrow literal:

```ts
expect(mascotElement(template)).not.toMatch(/[\s]style\s*=/i);   // sees `style=` only
```

So `[style.box-sizing]="'border-box'"` on the real mascot element (`src/options/options.component.ts:58`)
moved the 2 px frame inside the 80 px image box (ruling `A127`) with the pin that reads the real element
**green**. The PM measured exactly that: with `:864` routed through the helper the shipped tree stayed
green, and adding the binding to the mascot element turned two cases red.

Why the earlier verification missed it, recorded because it is the second half of the hole: the PM's
`N4` red came from the **neighbouring** case *"renders the mascot in the header, next to the existing
title"* (its exact `toMatch(/<img class="mascot" src="assets\/cat-mascot\.png" alt="" \/>/)`), and the
report's own `M4` row says "`carriesInlineStyle` reduced to the literal `style=` branch" — the **helper**,
not the shipped line. A mutation of the helper and a mutation of the shipped line are different probes,
and only the second one answers for `src/`.

## 2. What changed (three edits, all in `tests/`, plus the claim)

1. **The shipped assertion points at the widened reader** (`tests/options-window-look.spec.ts:857` case,
   *"ships no inline style attribute on the element the stylesheet scan cannot read"*):

   ```ts
   expect(carriesInlineStyle(mascotElement(template)), template).toBe(false);
   ```

   The absence pin itself is now the red for all four shapes against the real
   `src/options/options.component.ts`. The vacuity counterfactual above it was routed through the same
   reader (`expect(carriesInlineStyle(mascotElement(counterfactual)), counterfactual).toBe(true)`) so the
   case makes its claim with one reader and not two; the declaration value it asserts is unchanged.
2. **The decoy the PM's probe used is now a repo test**, not a one-off mutation — new case *"keeps the
   shipped absence pin on the widened reader, not on the literal `style=`"*: a hand-typed mascot element
   carrying `[style.box-sizing]="'border-box'"` is read by **the same helper the shipped assertion uses**
   and must answer `true`, and the shipped element's answer is tied in the same case to the answer for the
   binding-free fixture element (`.toBe(carriesInlineStyle(pinned))`). Narrowing the shipped line back to a
   literal now shows up as a red test in the diff instead of a silently re-tightened line.
3. **The claim is corrected where it is written.** `docs/state/t10-02b-engineer.md` section 4 got a
   clearly marked `> **Correction (`t10-02c`, engineer, 2026-11-19).**` note at the wrong sentence (it said
   the widening was in place while only the fixture helper was widened, and it named the wrong probes),
   plus a `## Correction (t10-02c)` section appended at the end. The report body was **not** rewritten.

Untouched, deliberately: the three binding counterfactuals (`:880` area) and both innocent cases (`:891`
area — reordered attributes, and an attribute **value** containing the word `style`) stay exactly as
accepted. The widened scan still does not fire on either, and all four shapes are each their own red. No
pin was weakened or deleted; the pin set is a strict superset of the accepted one.

## 3. The spec sentence

`docs/specs/content-overlay-ui.md:92` (mascot bullet) reads: the mascot element "is pinned to carry **no
inline style at all** — neither a `style` attribute nor a binding of it (`[style]`, `[style.box-sizing]`,
`[attr.style]`), which are the three shapes such a declaration ships in, each pinned with its own
counterfactual and none of them firing on an element that carries neither (`t10-02` AC9b; row `S10-12`)".

**Left alone.** After this commit the sentence is true of the assertion that reads the shipped element, not
only of the fixture helper: the shipped assertion calls `carriesInlineStyle`, each of the four shapes is a
red against `src/options/options.component.ts`, and the two innocent elements still answer `false`. Per the
brief's item 4, the spec is edited **iff** the sentence were still false; it is not.

## 4. Mutation check (mutation applied, observed, reverted from a `cp` copy — never `git checkout`)

A copy was taken first: `cp src/options/options.component.ts` →
`Desktop/inlinenotes-verify/t10-02c-backup/options.component.ts` (beside the same backups for the spec and
the report).

| # | Mutation | Result |
|---|---|---|
| C1 | `src/options/options.component.ts:58` — `[style.box-sizing]="'border-box'"` inserted into the real mascot element | **3 failed / 36 passed** in `tests/options-window-look.spec.ts`: **(a)** *"ships no inline style attribute on the element the stylesheet scan cannot read"* — **the absence pin itself, the named case**; **(b)** *"keeps the shipped absence pin on the widened reader, not on the literal `style=`"* — the new decoy; **(c)** *"renders the mascot in the header, next to the existing title"* — the pre-existing neighbouring exact-tag case. |

Restore: `cp` back, then `cmp` against the pre-mutation copy → byte-identical. `git diff --quiet HEAD --
src/ scripts/ README.md` → clean. `git ls-files --eol` on the touched file: `i/lf w/crlf`, the same shape it
had before (no mixed worktree copy — the `S10-17` lesson).

Green without the mutation: `npx vitest run tests/options-window-look.spec.ts` → **39 passed** (38 cases
before this slice, +1 decoy case).

## 5. Gates, in profile order, on the committed state

| Command | Exit | Output |
|---|---|---|
| `npm run build` | 0 | `[build] dist/ is a self-contained MV3 folder (11 files)`; `find dist -type f \| wc -l` → **11** |
| `npm test` | 0 | **Test Files 46 passed (46) / Tests 1026 passed (1026)** (baseline 1025 / 46; +1 case, +0 files) |
| `node scripts/check-agent-config.mjs` | 0 | `0 error(s), 0 warning(s), 169 info(s)` |
| `npm run typecheck` | 0 | `0` lines matching `error TS` |

`npm test` was re-run after the commit → 1026 / 46, exit 0. No full test log printed. No new dependency, no
network call, `README.md` untouched. Staged files: none (`git diff --cached --name-only` → empty); worktree
`git status --porcelain` → empty.

## 6. Acceptance criterion, line by line

* **Adding `[style.box-sizing]="'border-box'"` to the mascot element at `src/options/options.component.ts:58`
  makes the absence pin itself red.** Satisfied. The red case is named in section 4 row C1(a):
  *"ships no inline style attribute on the element the stylesheet scan cannot read"*, in describe *"no
  shipped rule can move the mascot frame (t10-01 D2, widened by t10-01b AC8 item 1; rulings A127, A129)"*.
* **The shipped tree without that mutation is green.** Satisfied: 1026 / 46, exit 0, plus the single-file
  run at 39 passed.
* **The other three shapes are each a red against `src/`.** Satisfied by construction: the shipped
  assertion is one call to a reader that flags `[style]`, `[style.x]` and `[attr.style]`; they are exercised
  as fixtures in the same case, and the shipped call is the same call. Only `[style.x]` was executed as a
  `src/` mutation (C1) because the brief authorises that one mutation; the other two would need a second
  `[style]`/`[attr.style]` write into `src/`, which the constraints forbid beyond the named probe.
* **No `src/`/`scripts/` change.** Satisfied: `git diff --quiet HEAD -- src/ scripts/ README.md` → clean;
  the only two committed paths are `tests/options-window-look.spec.ts` and `docs/state/t10-02b-engineer.md`.
* **Baseline count only grows.** 1025 → 1026. No pin weakened or deleted.

## 7. Deviations, notes, open questions

1. **One commit, `7a66202`**, exactly two paths. `docs/state/` is the PM's except this report; no other
   state file was touched.
2. **Two paths in the commit are not "tests only"**: `docs/state/t10-02b-engineer.md` is the report the
   brief's item 3 names as the wrong-claim site, so the correction lives there by instruction. The report
   body is preserved; the correction is additive and marked.
3. **The third red (C1c) is not mine.** *"renders the mascot in the header, next to the existing title"*
   fails on the mutation because it pins the mascot tag exactly. That case is the reason the PM's earlier
   `N4` looked like coverage; it is left as is, because weakening it is not this brief's business.
4. **`docs/specs/content-overlay-ui.md` was not touched.** Item 4 of the brief is an if-and-only-if; the
   sentence is now true, so the spec needed no edit. If the PM wants the spec to name that the **shipped**
   assertion is the one carrying the four shapes (rather than the fixture set), that is a one-line wording
   slice, not a behavior change.
5. **Residual risk: none new.** The helper's own limits are unchanged and still stated in its doc comment;
   what this slice removes is the gap between "the helper can see four shapes" and "the shipped element is
   read by the helper".
