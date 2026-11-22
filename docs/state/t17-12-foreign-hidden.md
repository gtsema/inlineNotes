# t17-12 — unchecking a foreign row must remove its highlight, not dim it

## The reader's report

«снятие чекбокса в попап с чужих записей не убирает их со страницы».

## Measured in the reader's Chrome

| Step | Result |
|---|---|
| uncheck the foreign row's checkbox | the popup sends the `switch` message |
| the page answers | `{rows:[{authorName:"Ефим",count:1,allVisible:false}],syncFailed:false}` |
| the popup re-renders | `row--foreign`, `checked: false` — correct |
| the page's highlights | `inlinenotes-m5gnxrq27zna` is **still registered**, with one range |

So the flag travels correctly and the popup is right; the **page keeps painting** the note.

## Root cause

`src/content/paint/paint-plan.ts` reads the foreign flag into `extraVisible` and then uses it for
**one** thing:

```ts
dimmed: extraVisible.has(entry.id) ? extraVisible.get(entry.id) !== true : false,
```

`dimmed` reaches `paint-style.ts`, where it drops a single declaration:

```ts
const DIMMED_HIDDEN_PROPERTY = 'background-color:';
```

The note therefore keeps its **underline** and loses only its fill — the comment in that file says so
on purpose: «the underline stays, so a hidden note reads as present-but-switched-off rather than as
gone».

**That design contradicts the reader's expectation, and the reader's expectation wins.** The checkbox
is the control that shows or hides a note's highlight; a control that leaves a visible mark has not
done what it says. The reader's own notes already disappear when unchecked (`A40`), so the two halves
of one control behave differently today — which is the real defect.

## Ruling A186 — unchecking hides the note, exactly as it does for the reader's own

A foreign note whose display flag is `false` is **not painted at all**: no rule, no highlight, no
range. It stays in the popup list with its checkbox off, and switching it back on repaints it, because
the note is still in this document's memory (`A163`).

- `buildPaintPlan` skips a foreign note whose flag is `false`, the same way it skips a stored entry
  whose `visible` is `false` (`A40`).
- `dimmed` disappears from the plan and from the stylesheet: one meaning, one implementation. A
  declaration that exists only to render a state nobody wants is a second rule waiting to drift.
- The underline is not a compromise: a note that is off is **absent** from the page.

## Acceptance criteria

1. A foreign note whose flag is `false` produces **no** paint rule and **no** highlight name.
2. The same note is still in the memory and still listed in the popup, with its checkbox off
   (`A163` unchanged).
3. Switching it back on paints it again without a storage write and without a server call.
4. A stored entry with `visible: false` behaves exactly as it does today (`A40`): absent from the
   page, present in the list.
5. The `dimmed` flag and its one-declaration filter are removed, and no test asserts a dimmed note.
6. The popup's foreign row still reports `allVisible: false` after the uncheck, so the checkbox state
   is honest.
7. Every gate stays green: `npm run build`, `npm test`, `npm run typecheck`,
   `node scripts/check-agent-config.mjs`. The test count only grows.
8. The spec states that a hidden foreign note is absent from the page, and the sentence describing a
   dimmed one is corrected wherever it appears.

## What must not change

- `A163`: foreign notes stay in memory and never reach `chrome.storage.local`.
- `A168`: the row's controls act on the page's memory, never on the server.
- `A40` for the reader's own notes.
- The server is not involved at all.

## Verified by the PM after the fix

The reader's Chrome, with the article active: uncheck the foreign row, then read
`CSS.highlights` on the page. Expected: the foreign note's name is **gone** from the registry, the
popup still lists the row with `checked: false`, and checking it again brings the name back.
