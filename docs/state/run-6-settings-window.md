# Run 6 — the settings window in real Chrome (PM-owned, no child)

The workflow's sync step after `t9-01`, `t9-02`, `t9-02b`. Nothing here is inferred from tests: `docs/state/browser-verification-run.md`
is the only place real-Chrome behavior is recorded, and Run 6 is its next block.

**Blocker:** the extension is loaded unpacked in the user's own Chrome, which the `chrome_devtools` MCP does not see (its pages
live in a different profile — the scan of `Default/Secure Preferences` and of `AppData/Local/Temp/inlinenotes-verify/profile*`
found no `inlineNotes`). Run 6 needs either the user's Chrome reloaded by hand, or the profile / `--user-data-dir` it runs with.

## What to observe (each item `passed` / `failed` / `not verified`, written into `browser-verification-run.md`)

1. **The surface is a window.** Extension menu → the settings entry: Chrome opens a **dialog window**, not a tab. Record the
   window's own size. This is the whole point of `A118` and no test can see it.
2. **The dialog box fits.** Inside that window: no horizontal scrollbar, the card is centered, the page background reaches the
   edges of the box. Then narrow the window (drag its edge as far as Chrome allows) and look again. The spec's dialog-box rule
   is pinned only by reading the stylesheet text (`content-overlay-ui.md`, Dialog-box layout rule); this item is its sight.
3. **The mascot.** The cat is visible, **whole, with the lifebuoy**, inside the circular frame; it is not stretched and not cut
   by the frame. The byte-level pin (`t9-02b` AC 5) says no drawn pixel sits outside the clip circle; this item is the sight of
   the same claim, and it is also what `A127` means in practice (80 px image, 84 px painted).
4. **The name loop still works from the window.** Type a name → `Сохранить` becomes enabled → the confirmation line appears in
   the accent color → reload a page, open the popup, the name is in effect. Then set the name to spaces only and record that
   `Сохранить` is disabled and what «disabled» looks like — this is the sight ruling **`A128`** (pending the user's word, see
   `docs/state/stage-9-review-debt.md` D5) needs.
5. **The popup entry still leads here.** With an empty name, the popup line «Укажите имя в настройках» still opens the same
   window (`A122`).
6. **The explanation line reads right.** «Это имя подписывает каждую заметку» — the user's own words on whether it answers the
   question, since it is the only sentence this surface gained.

## Bookkeeping owed by this run

- `README.md:134` «Стадии 1–8 кода готовы» → the stage range after Stage 9 (`t9-02` review R7).
- `README.md:139-140`: the tab-era confirmation of «экран настроек» gets superseded by the window sight (`A116`: old rows stay,
  the new row is added).
- `README.md:133` quotes the checker info count as **135**; measured today: **162**. Correct it here, not in a separate commit.
- The test count in the README status line: 991 over 46 files as of `4c49f8a`.

## Budget

No child. The PM records; the user operates Chrome. If an item fails, it opens a fix task in Stage 10 — a failed browser item is
never closed by rewording a spec.

## Outcome (2026-11-19) — closed

The user ran the checklist in their own Chrome against the unpacked `dist/` of `27eda84` and answered with one statement:
«Я всё проверил - этого достаточно». All six items are recorded as **passed (blanket)** in
`docs/state/browser-verification-run.md` → Run 6, together with what the blanket statement does **not** cover (the dialog's own
size, the disabled-button sight, wording feedback). No screenshot of the real dialog exists; the image in
`docs/state/screenshots/` stays what it is labeled: the options page **in a tab**.

Bookkeeping done in the same commit: README stage range and counts, the window-vs-tab confirmation line, the two spec sentences
that were waiting on this sight (`Dialog-box layout rule`, the mascot circle), and `A128` recorded as **not issued**.
