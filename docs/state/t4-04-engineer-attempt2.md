# Engineer report — `t4-04-readme-final-verification`, attempt 2 (`extension-engineer`)

Scope: the five numbered items of "## Carried fixes for attempt 2 (numbered)" in
`docs/state/t4-04-readme-final-verification.md`. Nothing else was touched: no other `src/` file, no `src/manifest.json`,
no tests, no specs, no dependency, no browser run, no task state file.

## Commit

- `70cd3d6` — `docs(readme): t4-04 attempt 2 - the four README claims the review named, plus the A90 comment`
- Files in the commit (`git show --name-only --oneline HEAD`): `README.md`, `src/options/text.ts` — 2 files,
  17 insertions, 11 deletions.
- The commit message cites `A90` and names the one file the exception covers (`src/options/text.ts`), and states that the
  change there is comment text only.
- Working tree after the commit: `git status --porcelain` → empty; nothing staged.

## Gates (`A62` order, run after the edits, quoted)

1. `npm run build` → green. Last lines:
   ```
   [build] built dist/content.js with esbuild
   [build] copied src/manifest.json -> dist/manifest.json
   [build] manifest references resolved: content.js, popup/index.html, options/index.html
   [build] dist/ is a self-contained MV3 folder (10 files)
   ```
2. `npm test` → green.
   ```
    Test Files  41 passed (41)
         Tests  790 passed (790)
   ```
3. `node scripts/check-agent-config.mjs` → green.
   ```
   0 error(s), 0 warning(s), 87 info(s)
   ```
   (87 INFO = `planned path not created yet`; unchanged from attempt 1, so the edits added no new path token.)

Extra read-only corroboration, not a gate: `npm run typecheck` → exit 0 (three tsconfigs, `--noEmit`).

## The five numbers, one per line (`A72`)

1. done — `README.md:57-62` (the false clause «адреса страниц никуда не записываются и не пишутся в консоль» at the old
   `:55` is gone; the paragraph now reads: «данные не покидают `chrome.storage.local`: там лежат заметки, имя автора и
   нормализованный ключ страницы — он является частью каждой сохранённой записи (см. «Лимиты»). Полный адрес страницы
   не сохраняется: `#хэш` и метки отслеживания выбрасываются ещё до записи, а ключи хранилища адрес не содержат»);
   the console half is kept verbatim at `README.md:60` («В консоль расширение ничего не пишет (в `src/` нет ни одного
   `console.`)»), re-checked: `grep -rn "console\." src/ | wc -l` → `0`. The page-key half is pinned by
   `src/core/entry.ts:48` (`pageKey` on the stored record), `src/core/entry-store-write.ts:204` (`pageKey: context.pageKey`),
   `src/core/page-index.ts:20-27` (`pages:v1` holds page keys verbatim) and is consistent with the «Лимиты» paragraph at
   `README.md:72-75`; "storage keys carry no address" is `src/core/storage-keys.ts:7` (`slot-key.ts` encoding).
2. done — `README.md:16-18` — now «В каждой строке — чекбокс без собственной подписи (он показывает или скрывает
   подсветку этой записи), рядом имя автора (свои помечены «Вы») — оно и есть подпись чекбокса — и кнопка `Удалить`.».
   No guillemeted label, and per `A91` **no new string was invented or added anywhere**: `src/popup/text.ts` is untouched
   (no checkbox label constant exists there), and the rendered shape is the unlabeled
   `<input type="checkbox">` inside `<label class="toggle">` with `<span class="author">`:
   `src/popup/popup.component.ts:81-88` (input `:82-86`, author span `:87`, label closes `:88`) — the same block the
   brief cites as `:82-89`, one line of drift.
3. done — `README.md:19-21` — added: «Одно исключение: если хранилище не удалось даже прочитать, поле остаётся пустым
   с сообщением об этом, и расширение ничего не записывает.» Matches `docs/specs/content-overlay-ui.md:131` ("The one
   shape that is **not** generated over is a settings read that failed (`storage_unavailable`) … the field stays empty
   with its message and nothing is written") and the shipped wiring at `src/options/author-name-service.ts:119-122`
   (`return { name: '', message: 'storage_unavailable' }` before `generateOnFirstRun()`).
4. done — `README.md:32` — «`npm run build  # собирает готовую к загрузке папку dist/ (10 файлов: манифест + контент +
   попап + настройки)`». **Measured by me, not copied: `find dist -type f | wc -l` → `10`** after a fresh
   `npm run build` (file list: `dist/content.js`, `dist/manifest.json`,
   `dist/options/{3rdpartylicenses.txt,index.html,main.js,prerendered-routes.json}`,
   `dist/popup/{3rdpartylicenses.txt,index.html,main.js,prerendered-routes.json}`), and the build's own last line prints
   "(10 files)". This now agrees with `README.md:105` — the line the brief cited as `:104`, same sentence, line drift only.
5. done — `src/options/text.ts:12-20` (the `A90` comment-only exception; the old claim sat at `:12-14`). The comment no
   longer says the options page «says `Имя обязательно` for a refused name»; it now reads: «`name_required` is the
   total-map answer to a core refusal no shipped control of this page can produce (overlay spec, "Options message map":
   `Сохранить` is disabled for an empty trimmed value and the input refuses the code point past the cap) …», which is
   `docs/specs/content-overlay-ui.md:135`. `git diff HEAD~1 -- src/options/text.ts` shows comment lines only: no string
   literal, no import, no code, no behavior; the shipped value `name_required: 'Имя обязательно'` at
   `src/options/text.ts:48` is byte-identical, and `tests/toolchain-contract.spec.ts:229-238` reads that file through
   `codeOnly(...)`, i.e. comments are stripped, so the test that forbids a third name-refusal wording is unaffected
   (it still passes).

## Commands run

- `npm run build` → passed (`[build] dist/ is a self-contained MV3 folder (10 files)`)
- `find dist -type f | wc -l` → `10` (the number used for item 4; listed file by file)
- `npm test` → passed (`41` files, `790` tests)
- `node scripts/check-agent-config.mjs` → passed (`0 error(s), 0 warning(s), 87 info(s)`)
- `npm run typecheck` → passed (exit 0; extra corroboration, not a gate)
- `grep -rn "console\." src/ | wc -l` → `0` (the console half of item 1)
- `git status --porcelain` / `git show --name-only --oneline HEAD` → clean tree; commit touches `README.md` and
  `src/options/text.ts` only
- `git diff HEAD~1 -- src/options/text.ts` → comment block only

## Residual risks

- None for behavior: the only `src/` change is comment text, and `dist/content.js` / `dist/popup/main.js` /
  `dist/options/main.js` byte sizes are unchanged by it (`120271` / `125989` / `105463`), which is what a comment-only
  edit should produce under esbuild minification.
- The README sentence in item 2 now describes a shape a reader may find odd (a checkbox with no caption). That is `A91`
  debt, recorded by the PM, not a wording mistake; a future a11y task may overturn it.
- The verification run (six-item browser list) is still open and is claimed nowhere: `README.md:110-114` still names it
  as not run.

## Notes for the reviewer

- The brief cited `README.md:104` for the "10 файлов" sentence; that sentence is at `README.md:105` in the file as
  committed. Same sentence, no content difference — recorded so the line reference is not read as a second claim.
- No spec was edited (the README now follows the spec instead of contradicting it), so the "spec in the same commit"
  rule is not triggered: `docs/specs/content-overlay-ui.md:131` and `:135` already carry the two sentences items 3 and 5
  were aligned to.
- No open observable question. No deviation from the brief: 5 items done, one commit, nothing else touched.
