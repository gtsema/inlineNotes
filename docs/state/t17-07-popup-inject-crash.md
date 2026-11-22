# t17-07 — the popup booted half-built because `inject()` was called in `ngOnInit`

## The defect the reader found

«в попап окне перестал отображать вообще любой текст. Сейчас там только рамка».

## Measured, in the reader's own Chrome

The reader gave the PM a Chrome with remote debugging on `[::1]:9222` (a real Chrome with the
extension loaded; the PM had been talking to a headless Chrome on `127.0.0.1:9222` — a different
process on the same port number, which cost several wrong conclusions).

The popup, read from its own target:

```html
<main class="popup"><h1 class="title"></h1></main>
```

`<h1>` rendered with **no text**, the list with no rows, and the console carried:

```
ERROR E: NG0203
  at Sd (chrome-extension://…/popup/main.js:4:2119)
```

`NG0203` is Angular's "`inject()` must be called from an injection context".

## Root cause

`src/popup/popup.component.ts:527` (as shipped by `t17-06`):

```ts
ngOnInit(): void {
  …
  inject(DestroyRef).onDestroy(stop);   // ← outside the injection context
}
```

A field initializer runs while Angular builds the component, so `inject()` is legal there. An
`ngOnInit` body runs **after** that, so the call throws. The throw happened during the popup's own
boot, before the view settled — which is why the component rendered its shell and nothing else.

The PM wrote this line while finishing `t17-06` after the engineer ran out of tool budget. The four
gates were green: no unit test boots the component through Angular, because the suites exercise it
through a prototype stand-in. **A green gate said nothing about this.**

## The fix

`private readonly destroyRef = inject(DestroyRef);` as a field initializer, and `ngOnInit` only
calls `this.destroyRef.onDestroy(stop)`.

## The pin

`tests/popup-window-look.spec.ts` gains a case that reads the component's text and fails if
`inject(` appears inside `ngOnInit`, `ngOnDestroy` or `ngAfterViewInit`. Proven by mutation:
putting `inject(DestroyRef)` back into `ngOnInit` turns exactly that case red; restoring it turns it
green again.

## Verified live

After the fix and a fresh build, the popup in the reader's Chrome renders:

```
Заметки на этой странице
На этой странице подсветка недоступна
На этой странице нет записей
```

with zero `NG0*` errors in its console.

## Gates

| Gate | Result |
|---|---|
| `npm run build` | exit 0 |
| `npm test` | exit 0 — **1272 tests / 58 files** |
| `npm run typecheck` | exit 0 |
| `node scripts/check-agent-config.mjs` | exit 0 — 207 info |
| live popup in the reader's Chrome | text renders, no Angular error |
