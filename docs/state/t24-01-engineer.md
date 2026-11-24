# t24-01 — the broker sends no body on GET/HEAD (A201)

Role: `extension-engineer`. Commit: `0f2951f` — `t24-01: the broker sends no body on GET/HEAD (A201)`.

## Task / Input / Output

- **Task.** `src/background/sync-broker.ts` must omit `body` from the `fetch` init on `GET`
  and `HEAD`, per ruling `A201`, keeping the message contract's `body: string` (empty on
  a `GET`). Regression test for the proven defect.
- **Input.** `docs/state/stage-24-broker-get-body.md`, `docs/specs/sync-integration.md`
  -> `A201`, `src/background/sync-broker.ts`, `tests/background-sync-broker.spec.ts`.
- **Output.** This report.

## Changed files

| Path | Change |
|---|---|
| `src/background/sync-broker.ts` | `answerOf` builds the init as `{ method, headers, ...(method === 'GET' \|\| method === 'HEAD' ? {} : { body }) }`. `SyncFetchImpl`'s `init.body` became optional (`body?: string`) so the type carries the absence. Header comment's "handed to `fetch` as it is" line extended with the `GET`/`HEAD` exception. |
| `src/background/service-worker.ts` | **Deviation, 1 extra line, needed to typecheck.** The wiring forwarded `init.body` unconditionally, so with `exactOptionalPropertyTypes: true` the now-optional `body` produced `error TS2379: Type 'string \| undefined' is not assignable to type 'BodyInit \| null'`. Changed to `...(init.body === undefined ? {} : { body: init.body })` — the wiring's own literal must also keep the key absent, which is the same `A201` rule at the file that names `fetch` literally. No rule added: the worker still owns only the registration and the one `fetch`. |
| `tests/background-sync-broker.spec.ts` | New `describe('the broker sends no body on GET and HEAD (A201)')` (4 cases) plus a `strictFetchOf` helper; `Call.init.body` made optional; file-header claim list updated from three to four claims. |

Not changed: `src/content/` (no touch), `docs/specs/` (PM owns the prose; `A201` already
carries the rule — no conflict found), the message contract in
`src/core/sync-broker-message.ts`, the listener registration model, `src/manifest.json`.

## Tests added

In `tests/background-sync-broker.spec.ts`:

1. **`reaches fetch with no body key at all for a GET message`** — a `GET` message with
   `body: ''` arrives at the injected `fetch` with `body` absent (`'body' in init === false`),
   not empty, and the answer is still `{ ok: true, status: 200, body }`.
2. **`carries the body of a POST and of a DELETE message unchanged`** — `POST` and
   `DELETE` reach `fetch` with their bodies and headers intact.
3. **`still answers ok for a GET against a fetch that refuses a body on GET/HEAD`** — the
   regression case: the injected `fetch` mirrors the real rule and throws
   `TypeError: Request with GET / HEAD method cannot have body.` whenever a `body` key is
   present on a `GET`/`HEAD`; the broker still answers `{ ok: true, status: 200, body }`
   and the listener returns `true`. A broker that forwarded the empty body fails here.
4. **`omits the body on HEAD too`** — the `HEAD` half of the ruling.

## Commands run (in the briefed order)

| Command | Result |
|---|---|
| `npm run build` | passed — `dist/` 17 files; `dist/service-worker.js` now contains `request.method === "GET" \|\| request.method === "HEAD" ? {} : { body: request.body }` |
| `npm test` | passed — 67 files, 1407 tests, 0 failed |
| `npm run typecheck` | passed — all four tsconfigs clean (the TS2379 above fixed before this run) |
| `node scripts/check-agent-config.mjs` | passed — `0 error(s), 0 warning(s), 253 info(s)`, exit 0 (the infos are the pre-existing `planned path not created yet` notes) |

## AC self-check

- **`answerOf` omits the body on `GET`/`HEAD`** — implemented exactly as briefed: spread
  with the `{}` arm for those two methods. Satisfied.
- **Nothing else changes; the message contract keeps `body: string`, empty on a `GET`** —
  `SyncFetchRequest`, `syncFetchRequestOf`, `SYNC_FETCH_MESSAGE`, `SYNC_FETCH_ANSWER`,
  the listener and its `true`/`undefined` model are untouched. Satisfied.
- **`GET` with `body: ''` reaches the injected fetch with no `body` key** — test 1, asserted
  structurally (`'body' in init === false`), not by value. Satisfied.
- **`POST`/`DELETE` carry their body** — test 2. Satisfied.
- **Regression case: an injected fetch that throws on a present `body` still answers
  `{ ok: true, status, body }` for a `GET`** — test 3, plus the `HEAD` variant (test 4).
  Satisfied.
- **Single commit, exact message** — `0f2951f t24-01: the broker sends no body on GET/HEAD (A201)`.
  Satisfied.

## Open questions / deviations

1. **One file beyond the briefed two: `src/background/service-worker.ts`.** Not a rule
   change — the compiler forced it (`exactOptionalPropertyTypes` rejects an explicit
   `undefined` in a `RequestInit` spread) and the semantics are the file's own: the worker
   is where the `fetch` call is written literally, so keeping the key absent is that
   call's concern. If the reviewer prefers the wiring untouched, the alternative is to
   keep `init.body: string` on `SyncFetchImpl` and pass `init.body as string`, which would
   be a lie in the type. Flagging for `t24-02`.
2. **No spec prose edit** — the brief forbids it and `A201` already states the rule
   verbatim. No spec/implementation conflict found.
3. **`npm run build` and `dist/`**: the built artifact was inspected (rule present in
   `dist/service-worker.js`). No `chrome://extensions` load was performed — the defect is a
   `fetch` argument rule, covered end-to-end by the injected-`fetch` regression case, and
   the brief's gate list names no browser step.
