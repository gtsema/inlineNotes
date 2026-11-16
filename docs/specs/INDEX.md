# Spec index

Every spec file in this directory is listed here. `INDEX.md` itself is an index, not a spec.
Owner = the role that must keep the spec current. Covered paths use `src/` and `tests/` prefixes for planned implementation locations (they appear when the implementation request starts).

| Spec | Owner role | Covered paths |
|---|---|---|
| `docs/specs/inline-comment-model.md` | `extension-engineer` (rules drafted by `project-manager`) | `src/core/`, `src/content/store`, `src/popup/store`, `tests/` |
| `docs/specs/content-overlay-ui.md` | `extension-engineer` | `src/content/`, `src/popup/`, `src/options/`, `src/manifest.json`, `tests/` |
| `docs/specs/code-review-flow.md` | `project-manager` | `docs/state/`, `.pi/agents/code-reviewer.md`, `.pi/skills/code-review-checklist/SKILL.md`, `scripts/check-agent-config.mjs` |

Rules:
- A code change that alters specified behavior edits its spec in the same commit; the owner role makes the edit.
- Adding a spec requires updating this table and the `Documentation Expectations` section of `AGENTS.md` in the same commit.
- `node scripts/check-agent-config.mjs` verifies this table references real specs and real roles.
