# Stage 28 — the «Мои заметки» row link shows its full address on hover (A206)

Opened 2026-11-25 by the reader: «На странице показа всех ссылок надо добавить отображение
всей ссылки при наведении на неё мыши».

## Why it is missing

The row's label is the stored `document.title` when the page has one (`A190`), so the
address is not on screen; the label without a title is the page key *without its scheme*
(`pageLabelText`). The `<a class="link" [href]="row.pageKey">` carried no `title`, so
there was no way to see the full URL of a row.

## Spec edits (PM, done)

`docs/specs/all-notes-page.md`: a `row link` term, Flow 3, AC 2, and the new ruling
`A206` — the `<a>` carries `title` = the full `pageKey`, the same value as its `href`;
the label is unchanged and no constants module gains a word (the value is page data).

## Plan (2 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t28-01` | the `title` on the row link + its pin | `extension-engineer` |
| `t28-02` | focused review | `code-reviewer` |

## t28-01 brief

**Task.** The «Мои заметки» row link shows the full address on hover (ruling `A206`).

**Change.** `src/all-notes/all-notes.component.ts`: the row's `<a class="link">` gains
`[attr.title]="row.pageKey"` (the full normalized URL, the same value as its `href`).
Nothing else changes: the label stays `row.label`, the `href` stays `row.pageKey`, the
`target`/`rel` and every other row control are untouched, and `src/all-notes/text.ts`
gains no string (the title is page data).

**Tests.** `tests/all-notes-page.spec.ts`: the row link's `title` attribute equals the full
`pageKey` for a row **with** a stored title (the label stays the title) and for one
**without** it (the label stays the key without its scheme), and `href` still equals the
full key. Existing row/shape pins stay green.

**Constraints.** No other file; no spec prose edit (the PM owns it; report a conflict).
Gates in order: `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs`. One commit:
`t28-01: the all-notes row link shows its full address on hover (A206)`.
