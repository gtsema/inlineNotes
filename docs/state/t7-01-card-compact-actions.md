# Task `t7-01-card-compact-actions` — the card stops shouting

Stage 8, task 1. Owner: `extension-engineer`. Ruling: **`A114`** (the user's request of 2026-11-18 plus the eight defaults they
accepted with «всё дефолт»). Spec to edit in the same commit: `docs/specs/content-overlay-ui.md` + `README.md`.

## Goal (the user's words)

«убрать кнопку отмена, потому что она дублирует клик мимо карточки. и кнопки сохранить и удалить сделать меньше и без слов, а с
значками. чтобы окно смотрелось не так громоздко».

## Shape (all eight points are the user's accepted defaults, `A114`)

1. The `Отмена` button is **gone from both widgets** — the create card and the editor. Closing stays exactly as it is: a
   `pointerdown` outside the overlay host, `Esc`, and for the editor the same event-driven closes.
2. Save and delete become **icon-only**: inline SVG, painted with `currentColor`, no text node inside the button. Save = a check
   mark, delete = a trash can. No emoji, no font glyph, no image file, no dependency.
3. The word leaves the **visible** text only: each icon button carries `aria-label` **and** `title` with the existing Russian
   string (`Сохранить`, `Удалить` from `src/content/text.ts`).
4. Hit target **24×24 px** minimum for each icon button; the actions row gets tighter padding. Card width, input typography, the
   counter, the refusal line and the frame colors are **unchanged**.
5. The popup and the options page are **untouched**: their buttons keep their words.
6. `src/content/text.ts` loses the `cancel` entry. Every test that quoted `Отмена` as a control is **rewritten** to the surviving
   close path (`Esc`, click outside) — deleting such a pin is a blocking finding.
7. Tab order becomes: card `textarea` → save; editor `textarea` → save → delete. No `tabindex` is introduced anywhere.
8. Unchanged and still pinned: save is disabled while the comment is empty after trim or over the cap; `Ctrl/Cmd+Enter` saves;
   `Esc` closes and writes nothing; the delete button is not rendered for a foreign entry (model AC8 authorship half); overlapping
   and length refusals are the same strings.

## Acceptance criteria (observable)

1. No DOM node of either widget is a cancel control, and the string `Отмена` appears in no rendered output of `src/content/`.
2. Closing both widgets by a `pointerdown` outside the host and by `Esc` still works and writes nothing — the pins that used to
   name `Отмена` now name these paths and still assert the same outcome.
3. The save button contains no text node; it renders an inline `<svg>`; `aria-label` and `title` are exactly `Сохранить`.
4. The delete button is the same shape with `Удалить`, and it is still absent for a foreign entry.
5. Both icon buttons declare a 24×24 minimum hit box in the shipped CSS (pinned by reading the style text).
6. Save stays disabled while the trimmed comment is empty or over 256; `Ctrl/Cmd+Enter` still saves; `Esc` still writes nothing.
7. Tab order per point 7 above, and `grep -rn "tabindex" src/` still finds nothing.
8. `src/popup/**` and `src/options/**` have empty diffs in range; their words survive.
9. The card's visual rules that are **not** the actions row (width, `font-size`, counter colors, refusal text) keep their pins.
10. `docs/specs/content-overlay-ui.md` and `README.md` describe the shipped controls — no sentence left naming `Отмена` as a
    control, and no claim about how an icon "looks" beyond the shape above (`A92` class).

## Carried-fix checklist (`A72`)

1. `src/content/overlay/card-events.ts:156-157` — the comment "Bubble phase, deliberately: the page's own key handling runs first"
   overstates the mechanism; the order-independent guarantee is "we never call `preventDefault()`". Reword the comment.
2. `tests/content-create-card-controller.spec.ts:1408` — the two event-driven closes of a typed card pin the focus restore as a
   call count but not its options; add the `{ preventScroll: true }` assertion.

## Boundaries

- Allowed: `src/content/overlay/**`, `src/content/text.ts`, `tests/**`, `docs/specs/content-overlay-ui.md`, `README.md`.
- Forbidden: `src/core/`, `src/popup/`, `src/options/`, `src/manifest.json`, `package.json`, harness files, the other PM-owned
  specs (`A76`, `A89`), and the task state file `docs/state/t7-01-card-compact-actions.md` (write your report to your own artifact).

## Gate and commit order (`A62`, `A73`, `A101`)

1. Spec + README, commit at green.
2. Icon buttons + the cancel removal + rewritten pins, commit at green.
3. Carried items 1–2 and the dead-pointer sweep, commit at green.
   Each gate with `echo "exit=$?"` on the line **right after** the command, never after a pipe and never inside a `&&` chain
   (`A101`); tails only.

## Delegation count

expected 2 (engineer + reviewer); ceiling (×2) = 4. Used: 0.

## Attempts log

- attempt 1: not started.
