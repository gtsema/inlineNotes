# t14-04b engineer — prose only (attempt 2 of `t14-04`)

**Verdict:** done in one commit, `be790be`. The blocking finding is closed: the spec no longer narrates the withdrawn `A145` shape half.
Prose only — no behaviour, no style, no test change. Baseline unchanged: **1049 tests / 47 files**, `dist/` **12 files**, checker **176 info**.

---

## 1. What changed and why

### 1.1 The blocking finding (attrib. 1) — the spec still called the document the surface

`docs/specs/content-overlay-ui.md:158` (the `Popup look` sub-bullet) carried the `A145` framing the brief ordered narrowed to the paint. Five clauses were false or misleading once `A146`/`A147`/`A148` landed:

| # | Clause as shipped in `7b30271` | Why it was false after the rulings | Now says |
|---|---|---|---|
| 1 | `**Surface shape (…)**` heading | the document is not the surface; the card is | `**Document paint and shape ownership (…)**` |
| 2 | «…gives `body` … cream … `margin: 0`, and **nothing else** — no width, no `min-height`, …» | read as written, the cream paint looks withdrawn too | «…What the document box keeps is the **paint** — … cream … and `margin: 0`, and **no** declaration of a shape: no width, …» |
| 3 | «What `A145` added beside the paint is **withdrawn**…» (the half) | fine on its own, but the "both halves" framing below was not | «**`A147` kept the paint and withdrew the shape**: the two halves of `A145` did not share a fate.» |
| 4 | «`body` **is** the box the reader sees» | the sight the `A148`-era inversion replaced | «`body` is the box the window is drawn from» + a new sentence: «**Being painted does not make the document box the popup's surface**… the **painted rectangle** is all this box owns, while the **card** is what carries the drawn form.» |
| 5 | «the two controls inside the popup **surface**… not the **surface's** frame» | the surface is the card | «…inside the popup **card**… not the **card's** frame» |
| 6 | «the two **surfaces** share the arc but not the border width» (settings comparison) | both are cards | «the two **cards** share the arc but not the border width» |

`**no roundings is possible in an MV3 popup**` → `**no rounding is possible for the popup window in MV3**` (the exact wording the brief orders; the `A146` finding itself is untouched).

Also one sentence was added for reviewer row 2 (`S14-32`): `no box-sizing` now carries the reason it is pinned absent — «that one was a no-op once no width, padding or border followed it here, so it is pinned absent as an untested declaration rather than a withdrawn shape — ledger row `S14-21`».

### 1.2 reviewer row 5 (`S14-35`) — `src/popup/index.html` header (same defect, same commit)

- `:3-5` paragraph no longer calls `body` «the box the reader sees»: «`body` is the box the window is drawn from, so `body` is what has to carry the `A125` cream … (ruling `A145`, kept by `A147`). Being painted does not make it the surface: the shape is the card's, not this box's.»
- The paragraph under the `A145` list said «Both halves are withdrawn»; narrowed to «Both halves of that added shape are withdrawn — the paint above is kept». Its bullet also stopped calling the collapsed paint «the surface» («collapsed the cream to `100px`»).
- **The `<style>` block is byte-identical** (`diff` of the `<style>…</style>` span against a `cp` copy prints nothing) — no style change slipped in.

### 1.3 What was deliberately **not** touched

The pins (`tests/popup-window-look.spec.ts`), the shipped stylesheets, any other spec sentence, `README.md`, `test_img/`. Reviewer rows `S14-31`, `S14-33`, `S14-34`, `S14-36` are ledgered, not this task — untouched. Line 162 («Pinned by a look suite…») and the `Popup look` parent bullet (`:156`) already read correctly (`A145`'s **shape half** superseded) and are unchanged.

---

## 2. Proof that no measurement or ruling reference was lost

Every number and ruling reference in the bullets survives. A token inventory of rule/measurement tokens in `docs/specs/content-overlay-ui.md` (attempt 1 `7b30271` vs this commit) changes only upward:

```
      7 A145    ->   9 A145
      6 A146    ->   7 A146
      5 A147    ->   7 A147
                      1 S14-21   (added: the box-sizing no-op clause)
```

Nothing is removed. Individually confirmed present (count ≥ 1): `243×387`, `100 × 264 px`, `66 px`, `(96,72)`, `(195,72)`, `(96,335)`, `(195,335)`, `(97,73)`, `(98,74)`, `(99,75)`, `test_img/…224902.png`, `A125`, `A140`…`A148`, `2px solid #a6cbdc`, `border-radius: 12px`, `320px`, `width: 320px`, `box-sizing: border-box`, `padding: 16px`, `13px/1.45 system-ui`, `#1b2a33`, `360px`, `display: block`, `margin: 0`, `1px`, `3px`.

---

## 3. AC self-check (line by line)

| AC (brief) | Status | Evidence |
|---|---|---|
| No sentence claims the document box is the popup's surface | **met** | heading → «Document paint and shape ownership»; «the two controls inside the popup card»; «the two cards share the arc»; the only surviving `surface`+document adjacency is the new negation «Being painted does not make the document box the popup's surface». Remaining `surface` hits in the file are the `A125` palette role («cream surface `#fdf7ee`»), the settings surface, and «the page surface» — none about the popup document. |
| No sentence claims the cream paint was withdrawn | **met** | «`A147` kept the paint and withdrew the shape»; «What the document box keeps is the **paint**»; grep for `cream…withdrawn` / `paint…withdrawn` finds only that kept-paint sentence. |
| No sentence claims both halves of `A145` were withdrawn | **met** | the phrase «Both halves» survives only twice, both in the unrelated **settings window** section (`:87`, `:95`, about `open_in_tab: false`). The popup bullet says the halves «did not share a fate». |
| Every measurement and ruling reference is still present | **met** | §2 inventory: nothing removed, counts grew; the ten screenshot numbers each present. |
| Fix says once, clearly: `A147` kept the paint and withdrew the shape | **met** | one sentence in the bullet + one parenthetical in the `src/popup/index.html` header. |
| Document is **painted** (cream, `margin: 0`) and **not** the surface | **met** | «the document box keeps is the **paint** — … cream `#fdf7ee` and `margin: 0` … **Being painted does not make the document box the popup's surface**». |
| **Card** carries the `2px` `#a6cbdc` frame with `12px` radius (`A148`) | **met** | «**The card carries the drawn frame again, thicker** (`A148`): `.popup` draws `border: 2px solid #a6cbdc` with `border-radius: 12px`» (unchanged). |
| **Component** owns the `320px` (`A147`) | **met** | «The **component owns the width** (`A147`, restoring `A141`): `.popup` carries `width: 320px`» (unchanged). |
| **No rounding possible for the popup window in MV3** (`A146`) | **met** | «**no rounding is possible for the popup window in MV3** (`A146`)» + the clipped-document explanation. |
| Drop «surface» where it points at the document | **met** | `:158` heading + two control references + settings comparison (§1.1 rows 1, 5, 6). |
| Keep every measurement and ruling ref, do not delete the `A144` history | **met** | §2; the `A141`/`A144`/`A145` chain in the heading is intact. |
| Reviewer rows 2 & 5 fixed only if same defect | **met** | both fixed in this commit (§1.1 `box-sizing`, §1.2 header). |
| `docs/` + that one comment in `src/popup/index.html` only; no behaviour/style/test change | **met** | `git show --stat` = 2 files, 9 insertions / 7 deletions; `<style>` block byte-identical to the `cp` copy. |
| Never weaken or delete a pin | **met** | no `tests/` file touched. |
| Baseline 1049/47, `dist/` 12 files, checker 176 info | **met** | gates below. |
| Gates in profile order, exit codes + counts quoted | **met** | §4. |
| One commit; restore anything mutated from a `cp` copy, never `git checkout` | **met** | `cp` copies at `/tmp/t1404b/` (`content-overlay-ui.md.orig`, `popup-index.html.orig`); no file was reverted because none was wrongly mutated; no `git checkout`. |

---

## 4. Commands run (profile order, `A62`) — with exit codes

```
$ npm run build
  … [build] dist/ is a self-contained MV3 folder (12 files)
  BUILD_EXIT=0

$ npm test
   Test Files  47 passed (47)
        Tests  1049 passed (1049)
  TEST_EXIT=0

$ node scripts/check-agent-config.mjs
  0 error(s), 0 warning(s), 176 info(s)
  CHECK_EXIT=0

$ npm run typecheck
  (tsconfig.content, tsconfig.app, tsconfig.spec — no output)
  TYPECHECK_EXIT=0
```

Also run (read-only verification):

```
$ git show --stat HEAD
 docs/specs/content-overlay-ui.md | 2 +-
 src/popup/index.html             | 14 ++++++++++------
 2 files changed, 9 insertions(+), 7 deletions(-)

$ diff <(sed -n '/<style>/,/<\/style>/p' <cp copy>) <(same from src/popup/index.html)
 STYLE BLOCK IDENTICAL
```

`git status --porcelain` = `?? test_img/` (pre-existing untracked, out of scope). Nothing staged.

---

## 5. Deviations / open questions

1. **Line numbers in the review.** The review cites `:155`, `:158`, `:159`; measured line numbers are `:156` (the `Popup look` parent bullet), `:158` (the `Surface shape` sub-bullet). All factual content the review names is the same; only the offsets differ, and the edits were made against the measured file.
2. **One clause added beyond the literal wording of the brief** — the `S14-21` box-sizing rationale at `:158` — is explicitly ordered by the brief ("Also fix … reviewer rows 2 and 5") and reviewer `S14-32`; it is a clause, not a new requirement.
3. **`Popup look` parent bullet (`:156`) untouched.** It reads «`A146`/`A147`/`A148`, which supersede `A145`'s shape half… the **document box paints** it … and draws **no frame**». That is already correct under the narrowed framing; the brief forbids widening scope, so it stands as is.
4. **No browser sight added.** Consistent with the existing `Assumption:` at the end of the bullet, the look is a source rule; the only owed manual step remains a `chrome://extensions` load for the width column.

---

## 6. Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "One commit be790be touches only docs/specs/content-overlay-ui.md (2 lines changed: the one Popup-look sub-bullet) and src/popup/index.html (comment block, <style> byte-identical to a cp copy). The spec now says 'A147 kept the paint and withdrew the shape', retitles the heading 'Document paint and shape ownership', and the only surviving 'document box ... surface' adjacency is the negation. No behaviour, style, test or pin change."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Gates in profile order, quoted with exit codes: build 0 / dist/ 12 files; test 0 / 1049 tests / 47 files; checker 0 / 176 info; typecheck 0. A token inventory over the spec shows all ruling/measurement tokens only grew (A145 7->9, A146 6->7, A147 5->7, S14-21 added); all ten screenshot numbers and A140..A148 present. The <style> block diff against the cp copy prints nothing."
    }
  ],
  "changedFiles": [
    "docs/specs/content-overlay-ui.md",
    "src/popup/index.html"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "npm run build",
      "result": "passed",
      "summary": "0 errors; dist/ is a self-contained MV3 folder (12 files)"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "47 test files / 1049 tests passed (baseline unchanged)"
    },
    {
      "command": "node scripts/check-agent-config.mjs",
      "result": "passed",
      "summary": "0 error(s), 0 warning(s), 176 info(s) (baseline unchanged)"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc -p tsconfig.content / tsconfig.app / tsconfig.spec --noEmit, 0 errors"
    }
  ],
  "validationOutput": [
    "BUILD_EXIT=0; TEST_EXIT=0 (1049/47); CHECK_EXIT=0 (176 info); TYPECHECK_EXIT=0",
    "git show --stat HEAD: docs/specs/content-overlay-ui.md | 2 +-, src/popup/index.html | 14 ++++++------, 2 files changed, 9 insertions(+), 7 deletions(-)",
    "STYLE BLOCK IDENTICAL (diff of <style> span vs /tmp/t1404b/popup-index.html.orig)",
    "token inventory: A145 7->9, A146 6->7, A147 5->7, S14-21 added; nothing removed",
    "git status --porcelain: only ?? test_img/ (pre-existing, out of scope); no staged files"
  ],
  "residualRisks": [
    "none to the extension; the look is still a source rule with no browser sight, as the bullet's own Assumption states",
    "reviewer ledger rows S14-31..S14-36 remain open by design (not this task)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Prose-only: retitled the Popup-look sub-bullet to 'Document paint and shape ownership' and rewrote its sentences to state A147 kept the paint and withdrew the shape, that the painted document box is not the popup's surface, that the card carries the A148 2px #a6cbdc frame with 12px radius, that the component owns the 320px (A147), and that no rounding is possible for the MV3 popup window (A146); narrowed two remaining 'surface' references that pointed at the document to 'card'; added the S14-21 clause explaining why box-sizing is pinned absent; and in src/popup/index.html narrowed the header paragraph describing body as 'the box the reader sees'. Every screenshot number and every ruling reference preserved.",
  "reviewFindings": [
    "no blockers",
    "the review's :155/:159 offsets differ from the measured :156/:158; content is the same, edits made against the measured file"
  ],
  "manualNotes": "cp backups were taken at /tmp/t1404b/ before editing; nothing needed restoring and no git checkout was used. Only the two briefed files are in the commit; test_img/ stays untracked."
}
```
