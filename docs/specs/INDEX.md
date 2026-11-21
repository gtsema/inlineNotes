# Spec index

Every spec file in this directory is listed here. `INDEX.md` itself is an index, not a spec.
Owner = the role that must keep the spec current. Covered paths are the real directories and files each spec owns; the implementation shipped, so this column names the tree as it exists, not a plan.

| Spec | Owner role | Covered paths |
|---|---|---|
| `docs/specs/inline-comment-model.md` | `extension-engineer` (rules drafted by `project-manager`) | `src/core/`, `src/content/anchor`, `src/content/capture`, `src/content/create`, `src/content/store`, `src/popup/`, `tests/` |
| `docs/specs/content-overlay-ui.md` | `extension-engineer` | `src/content/`, `src/content/capture`, `src/content/create`, `src/content/overlay`, `src/popup/`, `src/options/`, `src/manifest.json`, `tests/` |
| `docs/specs/code-review-flow.md` | `project-manager` | `docs/state/`, `.pi/agents/code-reviewer.md`, `.pi/skills/code-review-checklist/SKILL.md`, `scripts/check-agent-config.mjs` |
| `docs/specs/sync-server.md` | `extension-engineer` | `server/` |

Rules:
- A code change that alters specified behavior edits its spec in the same commit; the owner role makes the edit.
- A path may be covered by more than one spec when two rule sets live in the same directory: `src/content/capture/` holds the offset-domain rule of `inline-comment-model.md` and the selection-capture rule of `content-overlay-ui.md`, and `src/content/create/` holds the create flow of `inline-comment-model.md` and the save moment of the card.
- Adding a spec requires updating this table and the `Documentation Expectations` section of `AGENTS.md` in the same commit.
- `node scripts/check-agent-config.mjs` verifies this table references real specs and real roles.
