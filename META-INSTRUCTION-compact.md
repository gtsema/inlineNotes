# Meta-instruction: set up a repo for agent work

**Audience:** agent given a repo + task "set up its instruction system".
**Result:** a 5-level system: `AGENTS.md` (constitution) → `docs/specs/` → `.pi/agents/*.md` (roles) → `.pi/skills/` (skills) → `.pi/settings.json` (wiring). All plain markdown/JSON in the repo.
**Invariant** = form (sections, file anatomy, patterns). **Variable** = content (roles, stack, names). Correct replica = same form, different content.

---

## 0. Question phase (BEFORE creating any artifacts)

1. Analyze the repo: README, configs, code structure, migrations, CI. Draft: home subject (1 sentence), actual stack, ASCII flow `source -> store -> transform -> service -> ui`, local runtime (start order, required env, commands).
2. Build a question pool (below). Don't ask what is clearly visible in code — record it as an assumption the user can refute. Sort: critical → secondary.
3. Ask all questions in one numbered block (each with a one-line "why it matters"). Max one follow-up round per topic.
4. Answers → `docs/project-profile.md` (sections: Project, Stack, Documentation, Testing, Process rules, Team roles, Constraints, Language & Runtime Model). This is the source of truth for all artifacts. **Runtime Model must contain the observed runtime (provider/model, quant class) and the concrete adapted `timeoutMs` per §1.4; role frontmatters copy that value from the profile — the profile is the single place the timeout is changed.**
5. Only after user confirms the profile — Step 1. No answer on a critical question → mark open, take the least-risky default, tell the user.

**Question categories:** 1) name, purpose, greenfield/existing; 2) frontend yes/no and which; 3) frontend stack; 4) backend stack (language, DB, API style, realtime); 5) infra/CI/deploy; 6) documentation needed, how much; 7) testing: case descriptions vs automated, levels, framework, "green gates" (check commands, known failing baseline); 8) process: review, branching, forbidden zones; 9) team roles (limits, domain roles); 10) quality constraints (security, licenses, integrations); 11) artifact language (default §1.1); 12) runtime model: one model for all roles (`model: inherit`), thinking support, context limit, model class (§1.1) — class decides role/spec body language; for a slow runtime (§1.4), the adapted `timeoutMs` is settled here, at profile creation, not after a failed delegation.

---

## 1. Key policies

### 1.1. Language
Always English (never translated): paths, file/dir names, role & skill slugs (kebab-case `a-z 0-9 -`), all frontmatter keys/values, section names of §3 templates, code identifiers, commands, fenced blocks.
**Conversation with the user is ALWAYS in Russian**, regardless of artifact language — questions, reports, explanations.
User language (for file prose): role/spec body prose, README.

**Model class → role/spec body language:**
- MoE with low active params (e.g. 180B/6B active), or quant ≤4 bit, or dense <14B → role and spec bodies in English; user language only in PM communication and README; short sentences, one bullet = one thought.
- Full-precision dense ≥30B or flagship cloud → hybrid allowed (EN anchors, body prose in user language).

### 1.2. Thinking
Default: **off everywhere**. Every role: `thinking: off`. Settings: `defaultThinkingLevel: "off"`, `subagents.disableThinking: true`, `subagents.defaultThinking: "off"`, `subagents.maxThinking: "off"`, `agentOverrides.<role>.thinking: "off"` for every role.
Traps: `disableThinking` covers only builtin agents — custom roles need `thinking: off` in their own frontmatter or override. `maxThinking` is a hard cap: set `"off"` only when ALL roles have `thinking: off`, else delegation fails. Re-enable thinking only for models that actually support budgets — then remove `maxThinking: "off"`.

### 1.3. Context isolation
Roles exchange only **file artifacts + a brief**, never retold sessions.
- All roles `defaultContext: fresh`; `context: "fork"` is never used.
- Role input: `defaultReads` + paths from the brief. Output: a file (`output` frontmatter or path from the task). Parent gets pointer + status + blockers, not a wall of text.
- **Output paths must be concrete.** Every path handed to a role (brief Output, `output:` frontmatter) is a real path with the task id/topic already substituted — never a literal template (`docs/specs/<topic>.md`, `docs/state/<task-id>.md`). A role receiving an unsubstituted placeholder stops and reports instead of writing to the literal path. Templates live only in role bodies and this instruction.
- `inheritProjectContext: true` does not break isolation (AGENTS.md is an artifact, not a session).
- Forbidden: pasting another role's output into a task; "role X decided…" without a spec/code link; feeding chat history; asking to read logs of past runs.
- **PM brief (≤10 lines):** Task / Input (paths) / Output (artifact path) / Acceptance criterion / Constraints. No literal commands that depend on runtime — link to commands in the profile instead.

### 1.4. Guarantees via fields, not prose
Everything mandatory goes to frontmatter/settings; a Rules line is only a second line of defense.

| Guarantee | Mechanism | Default |
|---|---|---|
| Analysts/reviewer/PM don't edit code | `tools` without `edit/write` | read-mostly roles |
| Specialists don't delegate | empty `allowedAgents`, no `subagent` in `tools` | all except PM |
| PM delegates | `subagent` in `tools`, `maxSubagentDepth: 2` | mandatory |
| Mechanical acceptance | `acceptance: checked`, `acceptanceRole` | writer for engineers, read-only others |
| Anti-loop | `timeoutMs` ~900000; on slow runtimes (dense ≥14B or quant ≤4 bit, or observed >2 min/request) raise to the observed full-task time ×2, before the first delegation — do not discover it via smoke timeouts | all (adapted per runtime) |
| Parallelism | `parallel.concurrency` | 1–2 for local models |
| Thinking consistent | §1.2 | off everywhere |

### 1.5. Orchestration budgets (→ constitution section Orchestration Budgets)
- ≤3 tasks per stage, ≤3 stages per user request without renegotiation.
- ≤2 attempts per task (2nd with a changed brief); then stop and ask the user. Third retry forbidden.
- Parallelism 1–2 children; one writer per worktree/branch.
- Delegation counter in the state file; expected count exceeded ×2 → stop and report.
- Task state lives in `docs/state/<task-id>.md` (PM memory outside the session context; read after compaction).

### 1.6. Conflict resolution order
1) latest user wording → 2) `docs/project-profile.md` → 3) spec → 4) code/configs → 5) harness defaults → 6) model assumption (last, always explicit as `Assumption:`).
"Spec vs code" is never resolved silently: report to PM. A conflict changing the acceptance criterion is a user question, not a role decision.

---

## 2. Project manager (PM)

### 2.1. Entry point
The user talks **only to the PM**. Interactive PM = the main session agent, NOT a subagent (a child can't converse with the user). `.pi/agents/project-manager.md` is still mandatory as the reference body and for background orchestration.

### 2.2. Mandatory question pool before decomposition
Fill a fixed checklist template (the model fills fields, doesn't invent coverage): Goal / Done-criterion / In scope / Out of scope / Layers / Constraints / Options.
- If a task can't be phrased unambiguously verifiable → ask the user.
- Questions in one structured block; don't decompose before answers; no answer → open question + least-risky default.
- Don't re-ask profile open questions unless they block this task.
- **Observable-behavior decisions (command semantics, output format, empty input, exit codes, case sensitivity, ordering)** are never made silently: present "question + proposed default" list and stop. If the user didn't answer or said "decide yourself" — default applies, recorded as `Assumption:` in the spec and state file. Minor within-layer technical choices are decided locally.
- Record goals/criteria in the profile or task spec, not only in chat.

### 2.3. Orchestration cycle
1. **Decompose into stages** (≤3, each with a done-criterion). Fast path: single file + no public contract change → merge spec+implementation into one task; review after the fact.
2. **Stage → tasks** (≤3): one task = one executor = one verifiable slice. Each: goal, input, output, acceptance criterion. Update `docs/state/<task-id>.md`.
3. **Delegate** with §1.3 briefs by role name. Independent tasks may run in parallel.
4. **Accept** against the artifact and code, not a retelling. Not matching → return with concrete remarks (PM never rewrites itself). Green gates: task isn't done until profile check commands pass (adjusted for the known failing baseline).
5. Next stage. Blockers → user immediately.
6. **Report:** what was done, artifacts/commits, risks, DoD.
7. **Retro (3–5 lines in `docs/retro.md`):** what failed and why → each point becomes a fix to a spec/role/skill.

**PM rules:** writes no code; keeps scope narrow; every task has an owner and criterion; results are artifact files; accepts by file+code; briefs per §1.3.

---

## 3. Templates

### 3.1. `AGENTS.md` sections
`# {{PROJECT_NAME}} Project` + one sentence (greenfield/existing, domain, stack in backticks) →
- `## Primary Goal` — one paragraph, end-to-end.
- `## Interaction Protocol` — mandatory: user talks only to PM; PM builds the question pool before decomposition; stages→tasks→delegation→acceptance; PM lives in the main session; task state in `docs/state/`; project answers in `docs/project-profile.md`; role exchange only via artifacts and briefs.
- `## Runtime Model` — all roles run the session model (`model: inherit`); model pinned nowhere; roles differ only by `tools`/`skills`/thinking; thinking is off.
- `## Project Priorities` — 4–6 numbered (requirements before implementation; small reviewable changes; layer separation; deterministic local run; docs near code).
- `## Expected Repository Structure` — top-level dirs with one-line purpose, including `docs/specs/`, `docs/project-profile.md`, `.pi/agents/`, `.pi/skills/`, `.pi/settings.json`, `docs/state/`.
- `## Architecture Rules` — Data Flow (one ASCII line) + Layer Responsibilities (one bullet = one exclusive duty) + Domain Standards (4–8 bullets each).
- `## Role Routing` — for EVERY role: `{{role}}` for {{task types}}; exhaustive, each name exactly once.
- `## Delivery Workflow` — 6–7 steps: clarify → spec → core-slice → facade/ui-slice → test/review → sync-runtime → update-docs.
- `## Orchestration Budgets` — numbers from §1.5 + state-file path.
- `## Documentation Expectations` — durable decisions in specs; artifact language per profile; grep anchors in English.

### 3.2. `.pi/agents/<role>.md` — flat frontmatter
```yaml
name: {{ROLE_SLUG}}            # = file name
description: {{one sentence, 3rd-person verb, with a domain word}}
tools: {{allowlist by archetype}}
model: inherit                 # ALWAYS
thinking: off
systemPromptMode: replace      # append — PM only
inheritProjectContext: true
inheritSkills: false
skills: {{own 0–2}}
output: {{artifact path — mandatory for producer roles}}
defaultReads: {{paths if the role reads others' artifacts}}
defaultContext: fresh          # never fork
allowedAgents:                 # empty for specialists; role list for PM
acceptance: checked
acceptanceRole: writer         # read-only for PM/analysts/reviewer
timeoutMs: 900000
advertise: true
maxSubagentDepth: 1            # PM = 2
```
Body: `You are the {{ROLE_TITLE}}...` → 1-sentence mission → Focus (5–6 bullets) → Rules (4–6) → for PM: "Question pool" and "Orchestration cycle" sections → self-check line: `Before finishing, verify that {{...}}.`
Body rules: engineers — bash guardrails ("ask before `git push*` / `docker compose down*` / `rm -rf *`"); reviewer — bash git-read only, no edits; EVERY role has the isolation line: input from defaultReads/brief/specs/code, output an artifact at a path, foreign sessions not accepted or retold.

### 3.3. `.pi/skills/<name>/SKILL.md`
```yaml
name: {{KEBAB_CASE}}           # = directory name
description: {{≤1024, imperative, 2–3 trigger phrases worded as the PM phrases tasks}}
license: MIT
metadata:
  audience: {{real consumer roles}}
  domain: {{technology/process}}
```
Body: `## What I do` (4–6 verb-first bullets) → 0–3 domain sections (checklist/guardrails referencing real paths/tables/endpoints) → `Not for:` (boundary) → `## Output style` (artifact shape readable by another role via path).
Technical skills: one per significant technology (`{{tech}}-{{noun}}`). Process skills 4–6: `requirements-spec`, `delivery-planning`, `metric-design`, `code-review-checklist`, `git-diff-analysis`, optional `safe-bash`. No semantic overlap (test: which task lands in both? in neither?).

### 3.4. `docs/specs/<topic>.md`
Sections: `Purpose / Goal` → `Scope` → `Terms / Aliases` (mandatory pairs like `auth (авторизация)` for grep findability) → `Flow / Sequence` (numbered) → `Rules / Semantics` → `Edge Cases` → `Acceptance Criteria` (checkable without re-reading code).
`code-review-flow.md` is mandatory. Every spec listed in `docs/specs/INDEX.md` (spec → owner role → covered paths). Code change altering spec behavior → spec edited in the same change.

### 3.5. `.pi/settings.json`
```json
{
  "defaultThinkingLevel": "off",
  "enableSkillCommands": true,
  "skills": [".pi/skills"],
  "parallel": { "maxTasks": 6, "concurrency": 1 },
  "compaction": { "enabled": true, "reserveTokens": 8000 },
  "subagents": {
    "disableThinking": true,
    "defaultThinking": "off",
    "maxThinking": "off",
    "agentOverrides": { "{{ROLE}}": { "thinking": "off" } }
  }
}
```
Forbidden: `defaultModel`, `defaultProvider`, `agentOverrides.<role>.model` — the model inherits from the session. `agentOverrides` 1:1 with roles. Checks: `/subagents-models` (same model for all), `/subagents` (thinking off).

---

## 4. Roles

### Roster (adapt to layers, ≤10 total; core never cut: PM, system-analyst, code-reviewer + one analyst)
| Role | tools | thinking (if enabled) | Mission |
|---|---|---|---|
| `project-manager` | read, grep, find, ls, subagent (no bash/edit/write) | high | entry point: questions → decomposition → delegation → acceptance |
| `system-analyst` | read, grep, find, ls, edit, write | high | specs in `docs/specs/` |
| `analytics-designer` | read, grep, find, ls, edit, write | high | metrics/KPI before implementation |
| `data-engineer` | full (+bash) | low/medium | data, ETL, SQL |
| `infrastructure-engineer` | full (+bash) | low/medium | runtime, env, CI |
| `backend-engineer` | full (+bash) | low/medium | API over storage |
| `frontend-engineer` | full (+bash) | high | UI, state, API integration |
| `code-reviewer` | read, grep, find, ls, bash (git-read only) | high | read-only verification, exactly 2 skills |

**Adaptation:** one engineer per significant layer; no frontend → no `frontend-engineer` role (reflected in PM body). Domain roles (ML, mobile, DevOps) only for an explicit layer, ≤10 total. Rights follow archetype, not name. No per-role model: `model: inherit` everywhere. PM body always contains §2.2–2.3 and the explicit role list for delegation.

**Team size ladder:**
| Project | Roles | Skills |
|---|---|---|
| ≤3k lines, one layer | PM, implementer, code-reviewer | 3–5 |
| ≤15k lines, 2 layers | + system-analyst + second engineer | 5–9 |
| several layers | canonical roster | 9–14 |
| domain layers | + domain roles, ≤10 total | 12–18 |

Don't add a role if its work is one task of an existing role. Add a skill only for a technology/process used ≥2 times.

---

## 5. Procedure

1. **Step 0** — question phase (§0) → `docs/project-profile.md`.
2. **Step 1** — write `AGENTS.md` (§3.1) from the profile. Check: sections filled, Data Flow matches reality, Role Routing = future roles 1:1.
3. **Step 2** — 2–4 specs (§3.4), incl. `code-review-flow.md`; create `INDEX.md`; link from the constitution.
4. **Step 3** — pick team size (§4); create `.pi/agents/<role>.md` (§3.2). PM body includes §2.2–2.3.
5. **Step 4** — create skills (§3.3): N technical + M process.
6. **Step 5** — `.pi/settings.json` (§3.5). Check: constitution↔specs↔roles links, valid frontmatter, Role Routing 1:1, overrides 1:1, no model pinning, thinking consistently off, valid JSON.
7. **Step 6** — update `README.md` (agent config + start commands).
8. **Step 7** — add `scripts/check-agent-config.mjs`, run it: 0 errors mandatory. Then smoke-run every role (§6.2).
9. **Step 8** — self-check §7; a failed item → return to the matching step → rerun Step 7.

---

## 6. Harness verification

### 6.1. Mechanical checker (mandatory)
`scripts/check-agent-config.mjs` (Node ≥18, no deps), run `node scripts/check-agent-config.mjs [--project <dir>] [--strict] [--json]`, exit code 1 on errors. Checks:
- frontmatter parses (incl. CRLF); `name`=file; `description` filled; `model: inherit`; `defaultContext: fresh`; `inheritSkills: false`; `maxSubagentDepth` ∈ {1,2}; thinking ≤ `maxThinking`; `skills` ≤2 and dirs exist;
- rights: PM no `edit`/`write` with delegation grant; specialists no `subagent` and `allowedAgents` set; reviewer read-only with exactly 2 skills;
- settings: valid JSON; overrides ↔ roles 1:1; no model pinning; thinking consistent; `concurrency` ≤2;
- links: Role Routing 1:1 (no holes/duplicates/extra); all constitution sections; no unfilled `{{ }}`; every spec linked from AGENTS.md; `audience` references real roles;
- specs: 2–4 files incl. `code-review-flow.md`; all sections; AC mandatory; referenced paths exist;
- skills: `name`=dir; description; `## What I do`; `## Output style`; length 20–110; `Not for:` line.

### 6.2. Smoke run (mandatory)
One run per role with a trivial task ("write one line to `docs/state/smoke-<role>.md`" — concrete path, no placeholders). Verify: starts; exactly the `tools` allowlist available; own skills loaded; session model; thinking inactive; "what was discussed before you?" → "nothing". Failed → fix config and repeat; a role without a passed smoke run is not part of the harness.

**Slow-runtime exemption:** on a runtime matching §1.4's slow class (dense ≥14B or quant ≤4 bit, or observed >2 min/request), batch the smoke runs into one workflow that launches all roles in parallel (or verify two roles inline and smoke only the remaining ones), and count a run killed by an infrastructure timeout after its log shows correct tool/skill/isolation behavior as PASSED-by-evidence — record the residual risk in `docs/retro.md` instead of burning the second attempt.

### 6.3. Regression
Any change to `.pi/agents/`, `.pi/skills/`, `docs/specs/`, `.pi/settings.json` → rerun the checker.
Any change to the adapted `timeoutMs` → update `docs/project-profile.md` Runtime Model first, then role frontmatters in the same change, then rerun the checker.

---

## 7. Definition of Done (short; full coverage = checker + smoke)

- [ ] Question phase done before artifacts; profile filled; open questions marked; model class and language recorded.
- [ ] Constitution: sections filled, Data Flow real, Role Routing 1:1, Interaction Protocol and Runtime Model present.
- [ ] Roles: valid frontmatter, `model: inherit` everywhere, archetype rights, body 30–55 lines, PM contains §2.2–2.3.
- [ ] Specs: 2–4, Terms/Aliases + AC present, INDEX.md exists, linked from the constitution.
- [ ] Skills: no overlaps, §3.3 form respected.
- [ ] Isolation: `defaultContext: fresh` everywhere, fork nowhere, file-based I/O, isolation line in every role.
- [ ] Wiring: valid JSON, no model pinning, thinking consistent, concurrency ≤2, compaction on small contexts.
- [ ] Budgets §1.5 in the constitution; green gates + baseline in the profile; "spec edited in the same change" rule.
- [ ] README updated.
- [ ] Checker: 0 errors; smoke run passed for every role.

Any failed item → return to the matching step and re-verify.
