# Stage 24 — the broker must not send a body on GET (A201)

Opened 2026-11-24 from the reader's report after Stage 23: the Chrome popup says
«Не удалось связаться с сервером синхронизации» while the service-worker console's own
`fetch('http://10.10.80.36:8087/health')` answers OK.

## Root cause (proven)

The broker passed `body` to `fetch` unconditionally
(`src/background/sync-broker.ts` -> `answerOf`: `body: request.body`). A `GET` carries
`body: ''` (the message is built from the `SyncTransport` init), and `fetch` refuses a
body on `GET`/`HEAD`:

```
TypeError: Request with GET / HEAD method cannot have body.
```

The broker caught that as a transport failure and answered `{ ok: false, status: 0,
body: null }`; the page's transport turned it into `{ ok: false }`; core `send` answered
`http`; the automatic load failed; and the popup rendered the `A164` line. The old
content-script adapter never hit this because it omitted the body on `GET`
(`...(init.method === 'GET' ? {} : { body: init.body })`). Verified in Node against the
same Fetch API rule, and the 1-line `dist/service-worker.js` shows `body: init.body`.

The worker-console `fetch('/health')` test passed because it sent no body, and Yandex
showed a request because its build/behavior differed — neither contradicts the diagnosis.

## Spec edit (PM, done)

`docs/specs/sync-integration.md` -> `A201`: the broker runs the request it is handed
**except** that it omits `body` on `GET`/`HEAD`, the rule the page's adapter always
carried; the failure chain above is named.

## Plan (2 tasks)

| Task | Slice | Owner |
|---|---|---|
| `t24-01` | the fix + its regression test | `extension-engineer` |
| `t24-02` | focused re-review | `code-reviewer` |

## t24-01 brief

**Task.** `src/background/sync-broker.ts` must omit `body` on `GET` and `HEAD`.

**Change.** In `answerOf`, build the fetch init as
`{ method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body }) }`. Nothing
else changes; the message contract keeps `body: string` (`''` on a `GET`).

**Tests.** `tests/background-sync-broker.spec.ts`: a `GET` message with `body: ''` reaches
the injected fetch with no `body` key; a `POST`/`DELETE` message carries its body; and a
regression case whose injected fetch throws when a body is present (mirroring the real
`fetch`) still answers `{ ok: true, status, body }` for a `GET`.

**Acceptance.** `npm run build`, `npm test`, `npm run typecheck`,
`node scripts/check-agent-config.mjs` green; one commit
`t24-01: the broker sends no body on GET/HEAD (A201)`.
