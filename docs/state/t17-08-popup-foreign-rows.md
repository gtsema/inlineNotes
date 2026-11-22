# t17-08 — the popup still does not render foreign rows: what is established, and what is not

## The reader's report

«попап отображается, но в нем всё так же нет чужих заметок».

## What the PM established by measurement in the reader's own Chrome

The reader gave a Chrome with remote debugging on `[::1]:9222`. This time the PM connected to the
**right** browser (the earlier confusion was a headless Chrome on `127.0.0.1:9222` — a different
process on the same port number).

| Fact | How it was measured |
|---|---|
| The extension is loaded | target `chrome-extension://lgbbklfjnakenpmjikhdnmcphehiilbp/…` exists |
| The content script runs on the article | five `chrome-extension://… | inlineNotes | type: isolated` execution contexts |
| The server holds a **foreign** note for that page | `GET /notes/page/{pageKey}` → 2 notes, one of them `Ефим` |
| The page **answers the popup with the foreign row** | `chrome.tabs.sendMessage(articleTab, {type:'inlinenotes:page-notes'})` → `{rows:[{authorName:"Ефим",count:1,allVisible:true}],syncFailed:false}` |
| The page **announces** the change and the popup **receives** it | the announcement `{type:"inlinenotes:page-notes-updated",rows:[{authorName:"Ефим",…}]}` was heard inside the popup's own context |
| The popup renders **only the reader's own row** | DOM: `.rows li` → `["row row--own | Вы — 1"]` |
| The popup's settings are correct | `settings:v1` → `{name:"Спонж", serverUrl:"http://localhost:8080", syncEnabled:true}` |
| The popup's active-tab read returns the article | `chrome.tabs.query({active:true,currentWindow:true})` → the article tab |

So every input the popup needs is correct, the page answers correctly, the announcement arrives —
and the view still contains one row. **The defect is inside the popup's own view build**, after the
answer is in hand.

## Two defects found and fixed on the way

### 1. `inject(DestroyRef)` inside `ngOnInit` — the popup booted half-built

Angular's `NG0203`. Fixed in `12b1419`: the hook is a field initializer, and a pin reads the
component text so the call cannot move back into a lifecycle method. Verified live: the popup renders
its text again with zero `NG0*` errors.

### 2. The subscription ran after the first question

`ngOnInit` called `service.open()` **before** `service.watchPage(...)`. The page answers in the same
turn and starts its server load right after, so its announcement could arrive while the first view
was still being built — reaching a popup that had not subscribed yet.

Fixed here: `watchPage` runs first, `open()` second, with a pin that reads the order out of the
component text and a mutation proving the pin goes red when the order is swapped.

**This fix is correct and necessary, but it does not close the reader's defect**: with the order
corrected and the extension rebuilt, the popup still renders only `Вы — 1`.

## What is NOT established

The PM could not instrument the popup's own service in the reader's Chrome: the popup has to be
reloaded for a fresh build, and a reload discards any wrapper installed in its context. The popup the
PM can open through CDP is a **tab**, not the toolbar popup, so the service's own
`activeTabUrl()` path could not be exercised end to end with the article as the active tab of the
same window.

**The next step is a focused diagnosis, not another guess**: the service must be observed from the
inside — which url `activeTabUrl()` answers, what `pageState()` returns, and what `viewOf` merges.
The cheapest way is a temporary diagnostic build that records those three values in
`chrome.storage.local` (which the PM *can* read) rather than in a console the PM cannot attach to.

## Gates after this slice

| Gate | Result |
|---|---|
| `npm run build` | exit 0 |
| `npm test` | exit 0 — **1273 tests / 58 files** |
| `npm run typecheck` | exit 0 |
| `node scripts/check-agent-config.mjs` | exit 0 — 207 info |
