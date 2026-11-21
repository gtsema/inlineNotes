# Stage 17 — Sync integration in the extension

Status: opened. Owner: PM. Implementer: `extension-engineer`. Reviewer: `code-reviewer`.

## User request

The extension must talk to the sync server built in Stage 16. The user's words, in order:

1. In the popup, in the row of **my own** notes, left of the delete button, there is a **sync button**.
   Same size as delete, with **green circular arrows** inside. Pressing it starts an animation — the
   arrows spin. If something fails, the arrows turn **red**. Spin and stop = success. Red = error.
2. When a page opens, the extension **automatically requests** the server for that page's notes and
   shows the other authors' notes, if there are any.
3. The options page gets a field for the **server IP and port**, and a **"synchronization" checkbox**
   that turns synchronization on and off globally.
4. The user told the PM to bring up a test server in Docker.

## Interview answers (binding)

| # | Question | Answer |
|---|---|---|
| 1 | What does the sync button send? | **Only the current author's notes.** Notes of other authors already loaded are never sent back. |
| 2 | Who is "me"? | `author_id` = the name from settings. Name collisions are a known limitation, recorded in the spec. |
| 3 | Where do foreign notes live? | **In tab memory, not in `chrome.storage.local`.** They live while the page is open and are never written to the local store. |
| 4 | How are foreign notes shown? | Their own author colour from the existing palette, **not editable**, the author name visible in the tooltip. |
| 5 | What does delete do on a foreign note? | Removes it from view on this page **locally**; the server is not touched. |
| 6 | What if the server is unreachable on page open? | **Silently skip**; the page works as before; the popup shows a non-blocking "load failed" notice. |
| 7 | CORS | Default; the server already answers a preflight with `204` and `Access-Control-Allow-Origin: *` (measured). |
| 8 | Manifest permissions | `host_permissions: ["http://*/*", "https://*/*"]` so an arbitrary IP works. |

## Environment measured by the PM

| Fact | Value |
|---|---|
| Test server | `docker compose up -d --build` in `server/` → both services healthy, `/health` → `200` |
| CORS preflight | `OPTIONS /notes/page/test` with `Origin: https://example.com` → `204`, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`, `Access-Control-Max-Age: 600` |
| CORS on GET | `200` with the same headers |
| Settings record | `settings:v1` currently stores **only** `{ name }`; adding server fields changes a pinned contract |
| Popup row | `<li>` with a checkbox + author label, then one delete button with an inline `<svg>` |
| Extension gates | build, test (**1060** / 47), typecheck, checker — all green before this stage |

## Rulings

### A160 — the settings record gains two fields, and the decode stays backward compatible

`settings:v1` becomes `{ name, serverUrl?, syncEnabled? }`. Both new fields are **optional**:

- `serverUrl` — a string like `http://localhost:8080`, empty means "not configured";
- `syncEnabled` — a boolean, default **false**.

A stored record written by the previous version (`{ name }` only) must still load, with
`syncEnabled: false` and `serverUrl: ""`. The extension must not lose the user's name on upgrade.

### A161 — the sync button exists only in the row of the current author

The row whose `authorName` equals the settings name gets the sync button. Foreign rows keep only the
delete button. A row's sync button sends **only that author's entries on this page** — the foreign
entries already loaded in memory are never part of the payload (answer 1).

### A162 — the sync button has three states and they are visual only

| State | Appearance |
|---|---|
| idle | green circular arrows, static |
| running | the same arrows spinning (CSS animation) |
| error | the same arrows in red |

The arrows are an inline `<svg>` with `stroke="currentColor"`, coloured by CSS. Success returns to
idle; failure goes to error and **stays red until the next press**. No text is added to the button;
`aria-label` and `title` carry the Russian wording.

### A163 — foreign entries live in tab memory only

`GET /notes/page/{page_id}` results are held in the content script's memory for the lifetime of the
page. They are **never** written to `chrome.storage.local`, never sent in a `POST`, and disappear on
reload. The popup shows them as a separate author row marked foreign.

### A164 — a failed automatic load never blocks the page

If the server is unreachable, returns an error, or the request times out, the page renders its local
entries as usual and the popup shows a non-blocking notice. No modal, no retry loop, no blocking of
the local feature.

### A165 — the server URL comes from settings and is validated before use

The options field accepts `http://host:port` or `https://host:port`. A value that is not a valid URL
is refused with a visible message and is not saved. The extension never sends a request to a URL it
did not read from settings.

### A166 — no request when synchronization is off or the URL is empty

With the checkbox off, or with no URL configured, the extension makes **no network request at all**:
no automatic load on page open, no sync button action. The sync button is not rendered in that case,
so the user sees the feature as absent rather than broken.

## Acceptance criteria

1. `settings:v1` decodes an old `{ name }` record without loss and yields `syncEnabled: false`,
   `serverUrl: ""` (`A160`).
2. The options page shows a server URL field and a "синхронизация" checkbox, both persisted in
   `settings:v1`, and the Russian strings live in the options text module.
3. An invalid URL is refused with a visible message and is not saved (`A165`).
4. The popup renders the sync button in the row of the current author only, and not at all when
   synchronization is off or the URL is empty (`A161`, `A166`).
5. The sync button sends `POST /notes/page/{page_id}` with **only** the current author's entries, and
   the body's `author_id` is the settings name (`A161`).
6. The button shows the three states of `A162`: idle, spinning while the request runs, red on failure,
   idle again on success. The state is driven by the request outcome, not by a timer.
7. On page open, when synchronization is on and the URL is set, the content script calls
   `GET /notes/page/{page_id}` and shows the returned foreign entries as a foreign author row
   (`A163`).
8. Foreign entries are never written to `chrome.storage.local` and never appear in a sync payload
   (`A163`, `A161`).
9. Foreign entries are not editable, are shown in their author colour, and their tooltip names the
   author (answer 4).
10. Deleting a foreign row removes it from view locally without calling the server (answer 5).
11. A failed automatic load leaves the page working and shows a non-blocking notice (`A164`).
12. `manifest.json` declares `host_permissions` for `http://*/*` and `https://*/*` (answer 8).
13. Every existing gate stays green: build, test, typecheck, checker. The test count only grows.
14. The spec `docs/specs/sync-integration.md` (new) documents the settings fields, the button states,
    the memory-only rule and the failure behaviour; `docs/specs/INDEX.md` gains its row.

## Gates

From the repository root:

```
npm run build
npm test
npm run typecheck
node scripts/check-agent-config.mjs
```

Plus a live check against the running test server: the sync button in a real Chrome, the automatic
load on page open, and the red state against a stopped server. The PM cannot drive the user's Chrome
(the session's `chrome_devtools` manages a different instance), so the live check is the user's Run.

## Constraints

- No new runtime dependency. `fetch` is built in.
- No network call anywhere except the configured server URL.
- The Russian strings live in one text module per UI layer, as the project already requires.
- The extension must keep working with synchronization **off**, exactly as before this stage.
- `docs/state/` is the PM's except the engineer's own report.

## Out of scope

- Editing or deleting foreign notes on the server.
- Conflict resolution beyond the server's upsert.
- Any server change; the server is accepted and frozen for this stage.
