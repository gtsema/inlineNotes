# t28-02 — review of commit `c47104b` (t28-01: the all-notes row link shows its full address on hover, `A206`)

Reviewer: `code-reviewer` (read-only). Task: `t28-02`. Brief: this session's task block.
Spec: `docs/specs/all-notes-page.md` — the `row link` term (`:19`), Flow 3 (`:28`),
ruling `A206` (`:46`–`:48`), AC 2 (`:77`). Stage brief: `docs/state/stage-28-all-notes-hover-link.md`.
Engineer report: `docs/state/t28-01-engineer.md`. Reviewed range: `c47104b` (behavior/spec/plan commit `b89f933`).
Carried-fix checklist: none in the brief; nothing to answer.

## Verdict

**accepted**

The shipped markup agrees with the spec sentence word for word: `[attr.title]="row.pageKey"`
sits beside `[href]="row.pageKey"`, one binding source, so the two can never diverge.
The `t28-01` first-attempt mistake (`text.ts` must not contain the word `pageKey`) is
absent from the shipped pin: the shipped pin never mentions that word at all, and its
replacement asserts a stronger property. All five checked items pass; no blocking finding.
The report's gate quote (`npm run build` / `npm test` 69 files, 1431 tests / `npm run typecheck` /
`node scripts/check-agent-config.mjs` `0 error(s), 0 warning(s)`) is present and complete,
and the re-run in item 5 shows exactly those numbers.

## Item-by-item (brief numbering)

1. **Template binding and untouched row — pass.** `src/all-notes/all-notes.component.ts:93` carries `[attr.title]="row.pageKey"` inside the `<a class="link">` that opens at `:90-91`; `[href]="row.pageKey"` is at `:92`, `{{ row.label }}` at `:96`, `target="_blank"` at `:94`, `rel="noreferrer"` at `:95`. The label source is unchanged: `rowOf` still builds `label: row.title ?? pageLabelText(row.pageKey)` (`:308`). The delete control (`:98-117`, `aria-label`/`title` = `deleteLabel`, `(click)="onDelete(row.pageKey)"`) is byte-identical to `c47104b^`. `src/all-notes/text.ts` is unchanged in the whole range (`git diff c47104b^..HEAD -- src/all-notes/text.ts` = 0 lines, `git show c47104b:src/all-notes/text.ts | grep -c pageKey` = 2, same as before; both hits are `pageLabelText(pageKey)`, not a new string). The only other edit is the component's class doc comment (`:59-61`), a comment, no behavior.
2. **The pin is real evidence — pass.** `tests/all-notes-page.spec.ts:264-283` reads the component's inline template and asserts the link fragment contains both `[href]="row.pageKey"` and `[attr.title]="row.pageKey"`, plus `target`/`rel`, and that the template still interpolates `{{ row.label }}` — this is the strongest form available (template text read from source, no jsdom/TestBed) and it fails if the attribute is dropped. The with-title case (`:285-310`) builds a `title: 'Статья'` entry, asserts the `A190` label is `'Статья'` while `pageKey` is the full `https://example.com/a` and the two differ; the without-title case (`:312-324`) asserts `title` is `null`, the label is `'example.com/a'`, `pageKey` is `'https://example.com/a'` and `pageLabelText` drops `://`. Both `href`-carries-the-full-key assertions hold. Targeted run: `npx vitest run tests/all-notes-page.spec.ts` → 14 passed.
3. **The early bad pin is gone and no weaker substitute — pass.** The word `pageKey` does not occur anywhere in `tests/all-notes-page.spec.ts`: the address literals are `https://example.com/...`, so the failing regex `not.toContain('pageKey')` cannot reappear in this file. The replacement (test at `:326-347`) asserts the key set of `ALL_NOTES_STRINGS` is exactly the seven entries, that no value matches `/https?:|\/\//` and that `text.ts` contains no `https?://example` literal — a stronger (still unwritten-literals-only) invariant than "no `pageKey` word". No shipped test in the repo pins "no `pageKey` word" (`grep -n "not.toContain('pageKey')" tests/` → no match). `tests/toolchain-contract.spec.ts:1572` names `src/all-notes/text.ts` only as a `holderPaths('Укажите имя в настройках')` expectation (module path, not the word).
4. **No other behavior, no dependency, no spec/code conflict — pass.** `git show --stat c47104b` → exactly 2 files, 112 insertions, 1 deletion: `src/all-notes/all-notes.component.ts` (-1/+11) and `tests/all-notes-page.spec.ts` (+101). `package.json` is untouched (`git diff b89f933..c47104b --name-only` excludes it), import list of the test is `node:fs`/`node:path`/`node:url`/`vitest` plus project-local source; no `fetch`/XHR/WebSocket is named by the component (the layer's one `fetch` adapter is untouched and `tests/toolchain-contract.spec.ts:1657-1661` still expects exactly the three transports). Spec `A206` (`docs/specs/all-notes-page.md:48`, duplicated in the term `:19`, Flow 3 `:28`, AC 2 `:77`) names `title` = the full `pageKey`, the same value as `href`, label unchanged, no constants module gains a word — that is exactly what shipped. The spec prose landed in the plan commit `b89f933` (`docs/specs/all-notes-page.md`, `docs/state/stage-28-all-notes-hover-link.md`), not in the behavior commit: `git diff b89f933..c47104b -- docs/` = 0 lines. Not a blocking finding — the brief reserved the spec prose for the PM ("no spec prose edit (the PM owns it)") and the range under review contains the edit — but recorded as the remark below, because `AGENTS.md` → Documentation Expectations otherwise reads "same commit".
5. **Gates re-run — pass.** All four run in the briefed order, quoted verbatim in the report and reproduced here.

## Gates (re-run by this reviewer, read-only commands only)

```
$ npm run build
[build] dist/ is a self-contained MV3 folder (17 files)
[build] manifest references resolved: content.js, popup/index.html, options/index.html, service-worker.js, icons/icon-128.png, icons/icon-128.png

$ npm test
 Test Files  69 passed (69)
      Tests  1431 passed (1431)
   Duration  7.36s

$ npm run typecheck
tsc -p tsconfig.content.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.background.json --noEmit && tsc -p tsconfig.spec.json --noEmit
(no output, exit 0)

$ node scripts/check-agent-config.mjs
0 error(s), 0 warning(s), 258 info(s)
```

## Blocking findings

None.

## Non-blocking remarks

- `docs/specs/all-notes-page.md`: the `A206` prose and the `row link` term / Flow 3 / AC 2
  sentences landed in commit `b89f933` (a docs/plan commit), while the behavior landed in
  `c47104b`. The range as a whole carries both artifacts, and the brief explicitly reserved
  the spec prose for the PM, so this is a remark, not a finding. A commit-per-task reader
  looking only at `c47104b` would not see the spec edit; if that matters later, the PM may
  prefer to name the spec commit inside the task state file.
- The pin proves the binding expression in the template source, not a live browser DOM
  attribute (no jsdom/TestBed in this suite). The end-to-end hover is the stage's
  `chrome://extensions` load of `dist/`, outside this task's boundary. Recorded for
  completeness; the repository's convention makes this the strongest available pin.
- Pre-existing unstaged ` D META-INSTRUCTION-compact.md` in the working tree is not part of
  the reviewed commit (`git status --porcelain` shows it, `git show --stat c47104b` does not).

## Evidence path

`git show c47104b`; `git diff b89f933..HEAD --name-only`; `git show c47104b:src/all-notes/text.ts`;
`src/all-notes/all-notes.component.ts:59-61,88-96,307-308`; `src/all-notes/text.ts:12-20,44-46`;
`tests/all-notes-page.spec.ts:28-42,264-347`; `tests/toolchain-contract.spec.ts:1572,1641-1661`;
`docs/specs/all-notes-page.md:19,28,46-48,77`; the four gate commands above.
