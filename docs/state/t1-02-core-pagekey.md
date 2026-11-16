# t1-02-core-pagekey

## Goal

`pageKey` normalization and loss-proof lookup exist in `src/core/` as pure functions with Vitest
coverage, and the manifest stops injecting into non-HTTP schemes.

## AC (numbered, copied into the brief)

1. `pageKeyFromUrl(url)` returns `origin + pathname` with the path lowercased, the hash dropped, and query params matching `utm_*`, `gclid`, `gsas`, `fbclid`, `_ga`, `_gl`, `_hs`, `mc_*`, `ref`, `ref_src`, `igshid`, `s_kwcid` dropped; the remaining params are kept and sorted by name. (model spec → Rules, "pageKey normalization")
2. An entry stored for `https://example.com/a?utm_source=x#sec` is found for `https://example.com/a?utm_source=y&fbclid=1` — proven by a unit test that mirrors model spec AC4.
3. Lookup falls back to an `origin + pathname` (path-only) match against stored keys, so a page that later gains or loses a kept parameter still resolves; the exact storage key of the first match is returned so writes do not fork a second list.
4. `pathOnlyKey(url)` and `findPageKey(url, storedKeys)` are pure: no DOM, no `chrome.*`, no `any`; `findPageKey` is deterministic (stable order, no `Date`/`Math.random`).
5. `src/manifest.json` `content_scripts.matches` is `["http://*/*", "https://*/*"]` and `docs/specs/content-overlay-ui.md` gains one line under Rules stating the registered schemes (PM ruling on t1-01 remark 2). Spec edit and code edit in the same commit.
6. The placeholder shadow host is actually hidden: `src/content/overlay/host.ts` no longer lets `all: initial` defeat `[hidden]`, so nothing is painted on the page before t3-01 (t1-01 reviewer remark 1).
7. Gates green and quoted: `npm test` (all existing tests plus the new page-key cases), `npm run build`, `node scripts/check-agent-config.mjs`.

## Stage plan

Stage 1 (toolchain + pure domain rules). Previous: `t1-01` (accepted). Next: `t1-03-core-entry-store`.

## Attempts log

- attempt 1: brief issued, status: delegated.

Brief (attempt 1):
- Task: pure `pageKey` normalization + fallback lookup with tests; plus two carried-over one-line fixes.
- Input paths: `docs/project-profile.md`, `docs/specs/inline-comment-model.md`, `docs/specs/content-overlay-ui.md`, `docs/state/t1-02-core-pagekey.md`, `src/core/storage-keys.ts`.
- Output artifact: `docs/state/t1-02-engineer.md` + code in `src/core/page-key.ts`, `src/manifest.json`, `src/content/overlay/host.ts`, `tests/`.
- Acceptance criterion: AC 1–7 above, each with a self-check line.
- Constraints: `src/core/` stays pure (no DOM, no `chrome.*`, no `any`); no new dependency of any kind; no `fetch`/XHR/WebSocket; Russian stays UI-only; do not touch `.pi/`, `docs/project-profile.md`, `docs/state/plan-implementation.md`; commit after green gates (`feat(t1-02): loss-proof page key and http-only content matches`).
- Report must contain a `Commands run` section quoting `npm test`, `npm run build`, `node scripts/check-agent-config.mjs`.

## Delegation count

expected 1 engineer + 1 reviewer = 2; ceiling (×2) = 4. Used: 1 (engineer).

## Verdicts

- engineer report: pending
- reviewer verdict: pending

## Open questions

- `A4` Assumption: the path-only fallback returns the **first** stored key that shares `origin + pathname`
  (creation-order stable), so a page never forks into two lists; if the user later needs per-parameter
  separation, this rule changes in one spec line.
