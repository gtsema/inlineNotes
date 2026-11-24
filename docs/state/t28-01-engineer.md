# t28-01 — the «Мои заметки» row link shows its full address on hover (A206)

Owner: extension-engineer. Brief: `docs/state/stage-28-all-notes-hover-link.md`.
Spec: `docs/specs/all-notes-page.md` — the `row link` term, Flow 3, AC 2, ruling `A206`.
Status: done. Commit `c47104b` on `master`.

## Changed paths

| Path | Change |
|---|---|
| `src/all-notes/all-notes.component.ts` | the row's `<a class="link">` gains `[attr.title]="row.pageKey"` (the full normalized URL, the same value as its `href`); the class doc comment gains the `A206` sentence |
| `tests/all-notes-page.spec.ts` | one new `describe` pinning the hover value for a row with a stored title and one without, plus the no-new-string half |

Nothing else. `src/all-notes/text.ts` untouched (the title is page data, not UI wording).
The label stays `row.label` (`row.title ?? pageLabelText(row.pageKey)`), the `href` stays
`row.pageKey`, `target="_blank"` / `rel="noreferrer"` and the delete control untouched.
No spec prose edited (PM owns it) and no new dependency.

## Exact diff of the row markup

Before:

```html
<a class="link" [href]="row.pageKey" target="_blank" rel="noreferrer">{{ row.label }}</a>
```

After:

```html
<a
  class="link"
  [href]="row.pageKey"
  [attr.title]="row.pageKey"
  target="_blank"
  rel="noreferrer"
>{{ row.label }}</a>
```

## Commands run (in the briefed order)

| # | Command | Result |
|---|---|---|
| 1 | `npm run build` | passed — `dist/` 17 files, self-contained MV3 folder, manifest references resolved |
| 2 | `npm test` | passed — 69 files, 1431 tests, 0 failed |
| 3 | `npm run typecheck` | passed — 4 tsconfigs, no output |
| 4 | `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 258 info(s)` |

The first `npm test` run failed on my own new pin: it asserted `text.ts` does not contain
the word `pageKey`, which `pageLabelText(pageKey)` legitimately does. The pin was wrong,
not the code; it now pins the real intent (seven strings, no address literal, the scheme
still dropped). Re-ran `npm test`: green.

## AC self-check (line by line, `docs/specs/all-notes-page.md`)

The briefed slice is AC 2's `A206` half only; the other ACs are untouched and stay
green through the existing pins.

- **`row link` term** (`docs/specs/all-notes-page.md:19`): "its `title` is the **full page key**, the same value the `href` carries (`A206`)". Implemented: `[attr.title]="row.pageKey"` beside `[href]="row.pageKey"` — one binding source, so the two can never diverge. Pin: <code>expect(link).toContain('[attr.title]="row.pageKey"')</code> and the same for the `href`.
- **Flow 3** (`:28`): "The link also carries the full page key as its `title`, so hovering it shows the whole address even when the row reads as an article title". Implemented; the with-title case is the pinned one (label «Статья», `title`/`href` = `https://example.com/a`).
- **Ruling `A206`** (`:46`–`:48`): (a) `<a>` carries `title` = full `pageKey` — yes; (b) same value as `href` — yes, same binding; (c) "The label stays what `A190` decided — the stored title, or the page key without its scheme" — yes, `row.label` and the `{{ row.label }}` interpolation are unchanged, pinned by the two label cases (`Статья` and `example.com/a`); (d) "The value is page data, not a UI string, so no constants … gains a word" — yes, `src/all-notes/text.ts` is byte-identical, pinned by the string-set and address-literal assertions.
- **AC 2** (`:77`): "each row shows the page (stored title, falling back to the page key) … the row's link carries the full `pageKey` as its `title` (`A206`)". Covered by the two new label/title cases plus the existing title-label pin.
- **AC 1, 3–6, 7**: not touched by this slice; all stay green in the full `npm test` run (1431/1431).
- **Test mapping** (`:86`): AC 2 → `tests/all-notes-page.spec.ts` — the `A206` half is now pinned there.
- **Brief constraints**: no other file (verified with `git status`/`git diff`), no spec prose edit, no new dependency, one commit with the briefed message.

## Open questions / deviations

None. No spec-vs-code conflict was found: `A206` and the shipped template now agree
exactly, and `adds no word to a constants module` holds because the title is read from
`row.pageKey`, which the component already holds for the `href`.

## Residual risks

- The row template is pinned by reading the inline template text out of the component
  source (the repository's convention — there is no jsdom and no Angular TestBed in this
  suite), so the pin proves the binding expression, not a live browser DOM attribute.
  The end-to-end visible hover is the `chrome://extensions` load of `dist/` in the
  stage's runtime step, which is outside this task's boundary.
- The `title` attribute is the browser's native tooltip; a very long URL is shown in
  full by the browser, which is the requested behaviour.

## Commit

```
c47104b t28-01: the all-notes row link shows its full address on hover (A206)
 2 files changed, 112 insertions(+), 1 deletion(-)
```

Note: `git status` also shows a pre-existing unstaged deletion
` D META-INSTRUCTION-compact.md` that is **not** mine — it was already in the working
tree before this task and was deliberately left unstaged and out of the commit.
