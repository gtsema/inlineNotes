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

---

## Root cause found — the popup asked through the wrong channel

The diagnostic build wrote the three values the PM could not see into `chrome.storage.local`
(through the popup's own port, so the pinned `t4-01` boundary stayed intact). Read out of the
reader's browser with the article active:

```json
{ "url": "https://…/article/7968", "injectable": true,
  "askedRows": [], "storedNames": ["Спонж"], "mergedNames": ["Спонж"] }
```

The popup read the **right** page and got an **empty** answer — while a direct
`chrome.tabs.sendMessage(tabId, …)` from the same context answered the foreign row. That narrowed
the defect to the channel itself, and the cause is one call:

`src/popup/page-notes-channel.ts` sent the question with **`chrome.runtime.sendMessage`**. A
content script's `chrome.runtime.onMessage` answers a message addressed **to its tab**; a
runtime-wide send goes to the extension's own pages and workers instead. The question therefore
reached nobody on the page, the answer never came, and the popup rendered no foreign rows. No test
caught it, because every test replaces the channel with a recorder — the one line that mattered was
the one line no test executed.

### The fix

- the send is `chrome.tabs.sendMessage(tabId, …)`, addressed to the page's tab;
- the tab id comes from `activeTabId()` in `src/popup/active-tab.ts` — the one shipped module that
  names `chrome.tabs`, so the boundary rule is unchanged;
- no tab to address throws, and `send` reads that as "no rows" (`A166`), exactly like a page that
  never booted;
- the pins move with it: the channel's call pin now asserts `chrome.tabs.sendMessage` and forbids
  the runtime-wide spelling from coming back, and the `chrome.tabs` file set grows from one module
  to two, one per concern (the reads, and the send).

### Verified live

```json
{ "askedRows": ["Ефим:1"], "mergedNames": ["Спонж","Ефим"] }
```

and the popup renders `["Вы — 1", "Ефим — 1"]` — the reader's own row and the foreign one.

The diagnostic seam was removed afterwards; `grep diagnose src/popup/*.ts` answers nothing.

---

## Third defect: the two halves fed each other (still open)

After the channel fix the popup rendered the foreign row — and then the reader's two symptoms
returned, now with a measurable cause:

| Measurement (reader's Chrome) | Value |
|---|---|
| questions the page receives, in 3 s | **1637** |
| announcements the popup receives, in 3 s | **1638** |
| announcements the popup itself sends | **0** |
| stack of one question | `…pageState` → `viewOf` → `send` → `chrome.tabs.sendMessage` |

So the page announces once per question, and each announcement makes the popup rebuild its view,
which asks again. The reader sees a checkbox that flips straight back and a deleted row that will not
leave, because the loop re-renders faster than a press can settle.

Two fixes were made towards it and **neither closed it**:

1. `loadOnce` now announces only when the answer moved (`fingerprintOf()`), so a load that changes
   nothing says nothing. Correct, and not sufficient: the page keeps loading on every question.
2. `ensureLoaded` remembers that a load finished, so a second question no longer starts a second
   request. Correct, and still not sufficient.

**What the evidence points at, and what is not yet proven:** the page's own repaint path calls
`painter.refresh()`, and `src/content/main.ts` wires `painter.refresh().then(sync.afterPaint)` — so a
repaint runs `afterPaint`, which loads from the server and (through the channel's load) announces.
The question path calls `repaint()` for the two row operations, and the announcement brings the popup
back for another question. The exact edge that closes the loop is **not** proven yet: the PM could not
wrap `chrome.runtime.sendMessage` inside the content script's isolated world to count its sends
directly.

**Next step, named so it is not another guess:** count the loads inside the content script — the one
number that separates "the page loads on every question" from "the page announces without loading".
The cheapest instrument is a temporary counter on the page's load seam, written to
`chrome.storage.local` through the port the content script already owns, exactly like the diagnostic
that found the channel defect.

## Gates

`npm run build` 0, `npm test` 0 — **1273 / 58**, `npm run typecheck` 0,
`node scripts/check-agent-config.mjs` 0. All green, and the loop is still there.
