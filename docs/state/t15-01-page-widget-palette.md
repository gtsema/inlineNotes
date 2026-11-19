# t15-01 — the page widgets take the `A125` palette, and the disabled state stops being an opacity

Stage 15 opening (`docs/state/stage-14-popup-look.md` carries the rulings; the owner's request closed Stage 14's colour work and
opened this one). Owner's words: «Теперь осталось адаптировать цвет карточки редактирования и создания комментария. Там только
изменить цвета», then «1. дефолт» (the tooltip is included) and «2. сделать» (rule the disabled state at last).

## Goal

The page's `selection card`, `editor` and `tooltip` stop being the last surface on a fourth palette: they take the `A125`
colours the settings window and the popup already share. The disabled action state stops being an `opacity` and becomes colours,
closing `D5`/`A128` (open since Stage 9).

## The measured starting point

`src/content/overlay/card-style.ts` shares exactly **one** value with `A125` (`#ffffff`):

| Role | Today | Becomes |
|---|---|---|
| card background | `#ffffff` | `#fdf7ee` |
| ink | `#14171a` | `#1b2a33` |
| card border | `#b9bec4` | `#a6cbdc` |
| input background | `#ffffff` | `#ffffff` |
| input border | `#b9bec4` | `#a6cbdc` |
| counter | `#5b6470` | `#7b6a55` |
| counter at the cap | `#8a4b08` | `#b8480d` |
| button background | `#f3f4f6` | `#eef4f7` |
| button border | `#b9bec4` | `#a6cbdc` |
| primary label / background | `#ffffff` / `#1f6feb` | `#ffffff` / `#b8480d` |
| delete label / border | `#a4262c` / `#d08085` | `#b3261e` / `#a6cbdc` |
| refusal line | `#a4262c` | `#b3261e` |
| **disabled** label / background / border | `#6b7280` / `#e9ecef` / `#c8cdd2` | `#1b2a33` / `#e3c3aa` / `#a6cbdc` |

`src/content/overlay/tooltip-style.ts` (`#ffffff`, `#14171a`, `#b9bec4`, `#444c56`) takes the same mapping: background
`#fdf7ee`, ink `#1b2a33`, border `#a6cbdc`. The settings window's `.save:disabled { opacity: 0.45 }` is **removed** and replaced
by the same disabled colours, so the one state looks the same on both surfaces.

## Acceptance criteria

1. **The two page cards take the `A125` palette** (`A150`). Every colour in `src/content/overlay/card-style.ts` becomes one of
   the `A125` roles as listed above. **No new colour literal is invented**, and none of the retired values (`#ffffff` as a card
   fill, `#14171a`, `#b9bec4`, `#f3f4f6`, `#1f6feb`, `#a4262c`, `#d08085`, `#5b6470`, `#8a4b08`) survives **except** the
   input's `#ffffff` background and the primary button's `#ffffff` label, which are both `A125` roles already.
2. **The tooltip takes the same palette** (`A152`): `src/content/overlay/tooltip-style.ts` background `#fdf7ee`, ink
   `#1b2a33`, border `#a6cbdc`, and no retired grey survives.
3. **The disabled state becomes colours on both surfaces** (`A153`): the page widgets' disabled save uses fill `#e3c3aa`, label
   `#1b2a33` and border `#a6cbdc`; the settings window's `.save:disabled` **drops `opacity`** and uses the same fill, label and
   border. Measured contrast to record in the report: label on fill **8.88:1**, fill against the page/card background `1.56:1`
   (the enabled fill measures `4.97:1`), so the disabled control is visibly washed out without becoming unreadable.
4. **Nothing but colours moves.** No size, padding, radius, position, hit box, shadow, font or animation changes anywhere in
   `src/content/overlay/` or `src/options/`. The geometry is pinned by `t7-01`/`A114`, by the placement rules and by the
   Stage 12–14 layout pins; this task must leave every one of them green **without editing them**.
5. **The highlight slots are untouched** (`A151`): `src/content/paint/paint-palette.ts` keeps its six author slots byte-identical,
   and `tests/content-paint-palette.spec.ts` stays green without edits. Those colours are authorship, not chrome.
6. **The pins follow.** Existing colour pins must be updated to the new literals rather than deleted — `tests/content-card-actions.spec.ts`
   pins `#5b6470`, `#a4262c` and `#b9bec4` today. Say in the report which assertions changed and confirm none was dropped. If a
   look suite for the page widgets does not exist, add the colour pins where the existing ones live rather than inventing a new
   file; if you do create one, say why.
7. **The spec follows in the same commit.** `docs/specs/content-overlay-ui.md`: the card/tooltip colour rules state the `A125`
   roles, the disabled state is stated as colours with its measured contrast, and `A150`–`A153` are referenced. The palette
   bullet that currently describes the widget colours as their own set is corrected; the `A125` bullet is extended to say it now
   covers **every** extension surface, and the one place that must stay outside it (`A151`, the author slots) is named.
8. **Gates green, counts quoted.** `npm run build`, `npm test`, `node scripts/check-agent-config.mjs` (currently **176 info**),
   `npm run typecheck`. `dist/` stays **12 files**. Baseline **1051 tests / 47 files**; the count may only grow. `README.md`
   and `test_img/` are the PM's.

## Out of scope

- The author highlight palette (`A151`).
- Any geometry, and any new UI string.
- `S14-47` (nothing pins the two layers' disabled colours staying in step) — ledgered, not this task.

## Constraints

- Never weaken or delete a pin: update the colour literals, keep every claim. Baseline **1051 tests / 47 files**.
- Restore anything you mutate **from a copy you made with `cp`**, never with `git checkout`, and never end a loop with
  `git checkout -- .`.
- **Order: implement → gates → commit → then write `docs/state/t15-01-engineer.md` in one `write` call → paste the report into
  the final message as well.**
- One commit. `docs/state/` is the PM's except your own report. One writer for this repo.

## Attempts log

| # | Child | Result |
|---|---|---|
| — | not launched | — |

## Delegation count

Expected 2 (engineer, reviewer). Used: 0.

## Verdicts

Pending.
