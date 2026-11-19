# t14-04 review

**Artifacts:** slice `7b30271` (four files), report `docs/state/t14-04-engineer.md` (`c124398`), brief `docs/state/t14-04-popup-width-back.md`, stage record `docs/state/stage-14-popup-look.md` (`A146`/`A147`/`A148`), spec `docs/specs/content-overlay-ui.md`.
**Evidence path:** read-only — `git show --stat`, `git diff --stat 504904d 7b30271`, `git status`, and the committed contents of the four files. No mutation, no PNG opened; the `A146` numbers are taken from the stage record.

## Verdict: `changes requested` — one blocking finding

## Acceptance criteria (brief `docs/state/t14-04-popup-width-back.md`), one line each

1. **Width back on the component with `box-sizing: border-box`** — **pass.** `src/popup/popup.component.ts:204-205`.
2. **`body` loses radius/clip/`width: 100%`/`min-height: 100vh`, keeps `margin: 0` + cream** — **pass.** `src/popup/index.html:44-49` is exactly `body { margin: 0; background: #fdf7ee; }`; no geometry remains, so the "say which declaration you kept" clause is answered by "none".
3. **No frame on the document** — **pass.** No `border`/`outline`/`box-shadow` on `body`; pinned absent in both the stripped and the verbatim read (`tests/popup-window-look.spec.ts:568-576`).
4. **Cream rectangle fills the window; `:host` `display: block`** — **pass.** `popup.component.ts:200-202`; a block `body` with `width: auto` fills the panel.
5. **Controls untouched** — **pass.** Row separator, checkbox `3px`/`#b8480d`, icon-only delete `24`/`16`, palette, type scale, `16px` padding all unchanged in the diff.
6. **Pins follow the rule set, none deleted, mutation named** — **pass.** See the finding-by-finding check below; the report names both mutations (§2).
7. **Spec follows in the same commit** — **fail.** `docs/specs/content-overlay-ui.md:155`, `:158`, `:159` still carry the withdrawn `A145` claim that the document box *is the surface*. → blocking finding 1.
8. **Gates green, counts quoted, `dist/` 12 files, baseline may only grow** — **pass (as quoted).** Build 0 / `dist/` 12 files; test 0 / 1049 tests / 47 files; checker 0 / 176 info; typecheck 0. Reviewer verified the quotes are present and complete, not their truthfulness (`code-review-flow.md` → Edge Cases).

## Blocking findings

1. **`docs/specs/content-overlay-ui.md:155`, `:158`, `:159` — the withdrawn `A145` surface claim survives in five places.** Brief AC 7 orders the `Popup look` bullets to state the document **paints**, and `A148`'s record orders «The spec keeps the clause saying so». Five clauses still say otherwise:
   - `:155` — "**Surface shape**" heading and "Now superseded… `A145`".
   - `:158` — "Now withdrawn… the cream half, `margin: 0`, **nothing else** — no width, no `min-height`, no `border-radius`, no `overflow`, no `box-sizing`" — the cream half was **kept**, not withdrawn.
   - `:159` — "**Both** halves are withdrawn" — false; the paint is kept by `A147`.
   - `:159` — "`body` **is** the box the reader sees; a cream card inside it never reached the window edge" — the surface framing the brief and `A148` both order narrowed to the paint, and a *sight* whose replacement is `A146`'s measurement.
   - `:155`/`:158` — "surface"/"carries … the rounded shape" applied to the document — the `A148`-era inversion.
   
   Fix is prose: replace the two misleading clauses at `:158`/`:159`, drop "surface" from the `:155` heading, and state once that `A147` kept the paint and withdrew the shape. No code change, no assertion change.

## Non-blocking findings (debt ledger)

1. `docs/specs/content-overlay-ui.md:158` — "no width, … no `overflow`" is a misleading substring scan: `min-width:` and `max-width:` both contain `width:`, so a reintroduced geometry under those spellings would pass. The test's `WITHDRAWN_DOCUMENT_SHAPE` list is safe only because the document has exactly one rule (`tests/popup-window-look.spec.ts:521-553`). Say "no declaration whose property *is* `width`".
2. `docs/specs/content-overlay-ui.md:158` — "no `box-sizing`" is stated as a rule, but its removal was justified as a no-op declaration (`S14-21`), the same reasoning that applied to `:host`. A spec bullet should not outlive that reasoning; one clause on *why* it is pinned absent would stop the next reader striking the pin as decoration.
3. `tests/popup-window-look.spec.ts:321` — case title says "no colour outside the **five** A125 roles" while the assertion pins **seven** roles plus the refusal. Same looseness as `S14-8`; the number in the title is now the only false part.
4. `docs/state/t14-04-engineer.md` §1.3 — the table claims "**16 cases**, unchanged in count" and lists the `A148` frame pin as a new case, but `tests/popup-window-look.spec.ts` has **17** `it(` cases and the frame presence pins were folded into the pre-existing `draws the 2px A148 frame…` case (`:393-482`), not added. The substance is right; the report's arithmetic is not.
5. `src/popup/index.html:3-5` — the file header still opens "The popup's **paint** … `body` is what has to carry the `A125` cream", which is correct, but the paragraph below still describes `body` as "the box the reader sees"; the same narrowing the spec needs would read better here too. Cosmetic.
6. `src/popup/popup.component.ts:114` — the frame comment says "a width the ruling leaves to the PM's default"; the ruling actually calls `2px` "the PM default for «потолще»". Same fact, and it is already ledgered as `S14-29`; no action beyond keeping it in three places.

## Did the deleted `A144` assertions get fully replaced?

**Yes — fully, and in two places strengthened.** The two deleted popup-side absence pins are replaced by presence twins over the *same two strings* on the *same rule body* (`tests/popup-window-look.spec.ts:404-405`), and the same case now also pins exactly one `border:` and one `border-radius:` (`:412-413`), no `outline:`/`box-shadow:` (`:410-411`), and that the settings card must **not** carry the popup's `2px` (`:481`) — strictly more than the old absence. The document's five withdrawn presence pins became the `WITHDRAWN_DOCUMENT_SHAPE` absence list (`:193-199`, `:554-556`), and the settings half stays load-bearing (`:474-475` reading `src/options/options.component.ts:125-126`: removing the settings frame still turns the case red). No claim that a ruling did **not** reverse quietly disappeared: the only losses are the radius/clip ordering assertion (vacuous once neither declaration exists) and the bogus wrapper `function card(styles)` (whose one-line body would have thrown on a `string`); the one legacy looseness, `not.toMatch(/border(-\w+)?:/)`, is now covered by `outline:`/`box-shadow:` plus the single-`border:` count.

**Honesty line:** nothing in the slice claims the popup *looks* right — every statement is a rule set about the source, and `2px` is recorded as a PM default for «потолще» in the ruling, in the report (§1.1, §5.1) and at the test constant (`:167-170`).