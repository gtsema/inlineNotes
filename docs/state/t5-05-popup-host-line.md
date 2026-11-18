# Task `t5-05-popup-host-line` — the popup stops printing the page address

Stage 6, task 2. Owner: `extension-engineer`. Ruling: **`A98`** (`docs/state/improvement-backlog.md`). Spec to edit in the same
commit: the popup contract in `docs/specs/content-overlay-ui.md` (the sentence that makes the page host part of the popup), plus
`README.md` if it describes that line.

## Goal

The popup's first line shows `new URL(tab.url).host`. For an internationalized page the reader sees punycode — the user's word
was «кракозябры». The line is display only: it carries no function, and the popup still needs the address **internally** to pick
the right page key.

## Shape (already ruled, `A98`)

Remove the host line from the popup's rendered output and the `hostOf` derivation with it. **The active-tab address read stays**
(`A49`): the popup still calls `chrome.tabs.query`/`tab.url` to compute the page key, so the `tabs` permission stays and the
manifest does not change. If `hostOf` has no other caller, delete the function rather than leaving it unused.

## Acceptance criteria (observable)

1. The popup renders no page address anywhere — no host, no punycode, no origin — in any state (with entries, empty list,
   not-injectable, no-name notice).
2. The notices still render where they do now: «На этой странице подсветка недоступна» (`A81`) and «Укажите имя в настройках»
   (`A83`) keep their position above the list, and the empty state «На этой странице нет записей» is unchanged.
3. The page-key half is untouched: the popup still resolves the active tab's URL through the core key rules, so a note saved on
   a `?utm_…` variant still appears (the existing pins for that survive).
4. The `tabs` permission and the `chrome.tabs` read are still present in `src/manifest.json` and `src/popup/` — the reviewer
   greps them; removing either is a blocking finding.
5. The spec no longer promises a host line, and `README.md` does not describe one.
6. No new Russian string; no string is removed from `src/popup/text.ts` unless it existed **only** for that line — if one does,
   list it in the report with the grep proof that nothing else references it.

## Boundaries

- Allowed: `src/popup/**`, `tests/popup-*.spec.ts`, and — **only** for the carried items above (names, header comments, new pins,
  never an assertion change) — `tests/content-editor-controller.spec.ts`, `tests/content-tooltip.spec.ts`,
  `tests/content-create-card-controller.spec.ts`; plus `docs/specs/content-overlay-ui.md` and `README.md`.
- Forbidden: `src/core/`, `src/content/**`, `src/options/`, `src/manifest.json` (the permission stays exactly as it is),
  dependencies, harness files, the other PM-owned specs (`A76`, `A89`).
- Do not touch the task state file `docs/state/t5-05-popup-host-line.md`; write your report to your own artifact.

## Carried-fix checklist (`A72`, from the `t5-04` review)

1. `tests/content-editor-controller.spec.ts:575` is named `(t5-03 AC3, AC9, A24, A66)` but pins "an entry the paint pass does not
   hold has no tooltip and no click"; rename to the AC that owns that fact and reconcile it with the file's own coverage header at
   `:5` and `:25`, which still attribute it to AC8. **Names and header comments only, no assertion.**
2. `tests/content-tooltip.spec.ts:460` and `:512` cite `t5-03 AC8` for the click-opens-editor fact, which is AC2. **Names only.**
3. `docs/specs/content-overlay-ui.md:44`, `:131`, `:257` speak of "both focus calls" while the code passes `preventScroll: true` on
   the **restore** call too (`src/content/overlay/focus-handoff.ts:90`). Add the half-clause; **spec text only, no code**.
4. Pin the focus restore on the two close paths that have no pin: outside-`pointerdown` dismissal and scroll dismissal
   (`src/content/overlay/card-events.ts:82,89,98`, `src/content/overlay/editor-events.ts:65,69`). **Test-only** — those two files
   must not change; `close()` is the single unmount path, so a pin proves the construction, not a fix.

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec + README first, commit at green.
2. Component/service change + test updates, commit at green.
3. Report `done` per AC number with `path:line`, the four gates with their own exit status, and the grep lines proving the `tabs`
   read survived. Tails only, never a full log.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
