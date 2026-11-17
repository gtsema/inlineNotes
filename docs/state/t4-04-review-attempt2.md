I have no write-capable tool (read-only role), so here is the complete artifact for the briefed path `docs/state/reviewer-report.md` under the run's artifact root.

---

# Review — `t4-04-readme-final-verification`, attempt 2 (narrow re-review)

Range: `499cee1..HEAD` → `70cd3d6` (engineer attempt 2) + `b771435` (PM `A92` README clause). Prior verdict: `changes requested` (`docs/state/t4-04-review.md`, 1 blocking + 5 remarks). Checked only previous finding 1, the four touched README passages, the `A90` comment, and the new diff lines.

## Verdict: **accepted** — 0 blocking findings

## Carried-fix checklist, one line per number (`A72`)

1. **Blocking finding 1 (page addresses) — closed, closure honest.** `README.md:57-61`. Sentence by sentence: «данные не покидают `chrome.storage.local`: там лежат заметки, имя автора и нормализованный ключ страницы — он является частью каждой сохранённой записи» → `src/core/entry.ts:48`, `src/core/entry-store-write.ts:204`, `src/core/page-index.ts:20-26`; `chrome.storage.local` is the only area used (14 refs; the single `chrome.storage.sync` token is a comment denying it at `src/content/store/chrome-storage-port.ts:10`); 0 `sendMessage`/port refs in `src/`. «Полный адрес страницы не сохраняется: `#хэш` и метки отслеживания выбрасываются ещё до записи» → `src/core/page-key.ts:55-72,103-105`. **Final sentence**: «а в самих ключах хранилища адрес не встречается в открытом виде — он экранирован побайтово (`%XX`), и именно этот экранированный ключ указывает на список записей страницы» → `src/core/storage-keys.ts:18,25-27` (`notes:v1:` + `slotKeyFor`), `src/core/slot-key.ts:8-11` (`decodeURIComponent(slotKeyFor(pageKey)) === pageKey`), alphabet `[A-Za-z0-9_%-]` (`src/core/slot-key.ts:57`), `SLOT_SAFE_CODE_POINT = /[A-Za-z0-9_-]/` (`:64`) — so `:` `/` `.` are escaped and no raw URL substring survives. The A92 clause is present: it **affirms** the escaped key is the pointer to the page's entry list, i.e. it no longer claims the keys are free of the address. Console half kept verbatim at `README.md:61`; `grep -rn "console\." src/` → 0.
2. **Remark 1 (checkbox label) — done honestly.** `README.md:16-18` describes «чекбокс без собственной подписи … имя автора … оно и есть подпись чекбокса» with no invented label; matches `src/popup/popup.component.ts:81-88` (unlabeled `<input type="checkbox">` inside `<label class="toggle">`, author `<span>` = `ownershipHeaderText`, «Вы» for own rows per `src/popup/text.ts:43,67-69`). `src/popup/text.ts` untouched in range; contains no checkbox-label constant (`:26-46`). `A91` respected — no new string anywhere.
3. **Remark 2 (`storage_unavailable`) — done.** `README.md:19-21` matches `docs/specs/content-overlay-ui.md:131` ("an unreadable storage area shows an empty field plus its message and writes nothing") and the "not generated over" sentence at `:132`, and the shipped wiring `src/options/author-name-service.ts:118-122` (`{ name: '', message: 'storage_unavailable' }` before `generateOnFirstRun()`).
4. **Remark 3 (`dist/` count) — measured, not copied.** `README.md:32` now says 10 файлов and agrees with `README.md:106`. My own read-only `find dist -type f | wc -l` → **10**, file-by-file list identical to the report's.
5. **Remark 5 (`A90` comment) — done, comment-only.** `git diff 499cee1..HEAD -- src/options/text.ts` → the only changed lines are inside the doc block `:12-20`; a filter for non-comment changed lines returned nothing. `name_required: 'Имя обязательно'` at `src/options/text.ts:48` is byte-identical (`md5` of the line identical between `499cee1` and `HEAD`). Test still meaningful: `tests/toolchain-contract.spec.ts:231` pins the literal on the raw file, `:235-237` assert the three forbidden variants on `codeOnly(...)`, and `codeOnly` (`tests/toolchain-contract.spec.ts:53-55`) strips block comments — simulated: stripped code contains no «Укажите имя», raw still contains `'Имя обязательно'`.

## Acceptance criteria (card AC, unchanged)

- **AC1** (README content + honest limitations): **pass** — the one failing sentence is fixed; `A49` install-warning explanation at `README.md:53-55`, caps at `:66-70`, v1 limitations at `:82-100`.
- **AC2** (no dangling ids / no duplicated rule, R3): **pass** — `docs/specs/` unchanged in range; the cross-reference sentence still stands (`content-overlay-ui.md:132`), `INDEX.md` no longer names `src/popup/store`.
- **AC3** (R2 empty-name wording, spec only): **pass** — `content-overlay-ui.md:60,135` unchanged; the new comment in `src/options/text.ts:13-16` now agrees with `:135` instead of contradicting it.
- **AC4** (R4 astral write pinned): **pass** — `tests/options-author-name.spec.ts:319-332` (unchanged in range).

## Boundaries

Diff `499cee1..HEAD` = `README.md`, `src/options/text.ts`, `docs/state/t4-04-engineer-attempt2.md`, `docs/state/t4-04-readme-final-verification.md`. No `src/manifest.json`, 0 files under `tests/`, 0 under `docs/specs/` (no new spec; no spec edit required — the README follows existing spec lines, not new behavior), no `package.json`/lock change, no new Russian UI string, no network call, no host-DOM change. Status section claims nothing unverified: `README.md:109-110` ↔ `docs/state/t4-02-options-name.md:93-97`; `README.md:111-115` names the six-item browser list as **not run**.

## Gates (`A77`)

Re-run by me, read-only: `node scripts/check-agent-config.mjs` → `0 error(s), 0 warning(s), 87 info(s)` — identical to the quote in `docs/state/t4-04-engineer-attempt2.md` (Gates §3) and to `README.md:107-108`. Read-only corroboration: 41 `*.spec.ts` under `tests/` (42nd file is `tests/support/memory-storage-port.ts`), **790** `it(`/`test(` declarations, 0 `.skip(`/`.only(`/`xit(`/`xdescribe(`. `npm test` and `npm run build` not re-run (reviewer is read-only); both are quoted in the report and were re-run by the PM after the last commit.

## Blocking findings

None.

## Non-blocking remarks

1. `README.md:54-55` («Chrome один раз при установке показывает предупреждение «читает историю просмотров»») is the one sentence in the permissions paragraph I cannot pin to code, a test or `dist/` — it is a claim about Chrome UI. The manifest half is pinned (`src/manifest.json:7`, no `host_permissions`/`optional_permissions`), the sentence is mandated by AC1/`A49`, and it is not phrased as a verification result, so it does not conflict with `README.md:111-115`.
2. `70cd3d6`'s commit message still asserts "storage keys carry no address" — the clause `A92` corrected in the file. History is left as-is by that ruling; the shipped README no longer says it.
3. Pre-existing and untouched by this range: `src/core/slot-key.ts:10` says the decode identity holds "for every page key" while `:18-19` of the same comment says a truncated slot key is not reversible. The README makes no reversibility claim, so nothing propagates; worth a line in a future core-comment pass.

## Evidence

`git log --oneline 499cee1..HEAD`; `git diff --name-only 499cee1..HEAD`; `git diff 499cee1..HEAD -- src/ tests/ docs/specs/`; `git show --name-only 70cd3d6 / b771435`; `find dist -type f | wc -l` → 10; `grep -rn "console\." src/` → 0; `grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon\|EventSource" src/` → 0; `grep -c XMLHttpRequest dist/content.js` → 0, popup/options → 1 each; `grep -rn "chrome.storage" src/`; node simulation of `codeOnly` against `src/options/text.ts`; `node scripts/check-agent-config.mjs`.