#!/usr/bin/env node
/**
 * Mechanical checker for the agent configuration of this repo.
 *
 *   node scripts/check-agent-config.mjs [--project <dir>] [--strict] [--json]
 *
 * Exit code: 1 when any error is found (warnings become errors with --strict), 0 otherwise.
 * No dependencies, Node >= 18.
 *
 * Path-existence policy: paths referenced by specs that belong to the harness
 * (docs/, .pi/, scripts/, AGENTS.md, README.md) must exist. Paths that belong to
 * the not-yet-started implementation (src/, tests/, dist/, package.json) are
 * reported as "planned" and do not fail the check, because this repo currently
 * contains the instruction system only.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';

const args = process.argv.slice(2);
const getOpt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const projectDir = resolve(getOpt('--project') ?? process.cwd());
const strict = args.includes('--strict');
const asJson = args.includes('--json');

const errors = [];
const warnings = [];
const infos = [];
const err = (file, msg) => errors.push({ file, msg });
const warn = (file, msg) => warnings.push({ file, msg });
const info = (file, msg) => infos.push({ file, msg });

const readFile = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};
const rel = (p) => p.replace(projectDir + '/', '').replace(/\\/g, '/');

/* ------------------------- minimal YAML-subset parser ------------------------- */

const LIST_FIELDS = new Set([
  'tools', 'excludeTools', 'allowedAgents', 'defaultReads', 'skill', 'skills',
  'skillPath', 'extensions', 'subagentOnlyExtensions', 'aliases',
]);

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return null;
  if (v === '[]') return [];
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function splitList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((x) => x !== null && x !== undefined);
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Parses frontmatter delimited by --- lines. Returns { data, body, bodyStartLine }. */
function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0].trim() !== '---') return { data: null, body: normalized, bodyStartLine: 0 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { data: 'unterminated', body: '', bodyStartLine: 0 };

  const root = {};
  const stack = [{ indent: -1, obj: root }];
  let i = 1;
  for (; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const entry = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (entry.startsWith('- ')) {
      const key = parent.__listKey;
      if (key) parent[key].push(parseScalar(entry.slice(2)));
      continue;
    }
    const m = entry.match(/^([^:]+):(.*)$/);
    if (!m) return { data: `unparseable line ${i + 1}: ${entry}`, body: '', bodyStartLine: 0 };
    const key = m[1].trim();
    const rest = m[2];

    if (rest.trim() === '|' || rest.trim() === '|-' || rest.trim() === '>' || rest.trim() === '>-') {
      let j = i + 1;
      const collected = [];
      while (j < end) {
        const nl = lines[j];
        const ni = nl.length - nl.trimStart().length;
        if (nl.trim() && ni <= indent) break;
        collected.push(nl.trim());
        j++;
      }
      parent[key] = collected.join(' ');
      i = j - 1;
      continue;
    }
    if (rest.trim() === '') {
      // Look ahead: block list or nested object.
      const next = lines.slice(i + 1, end).find((l) => l.trim());
      if (next && (next.trim().startsWith('- ') || (next.length - next.trimStart().length > indent))) {
        if (next.trim().startsWith('- ')) {
          parent[key] = [];
          parent.__listKey = key;
        } else {
          const child = {};
          parent[key] = child;
          stack.push({ indent, obj: child });
        }
      } else {
        parent[key] = null;
      }
      continue;
    }
    const value = parseScalar(rest);
    if (LIST_FIELDS.has(key) && !Array.isArray(value)) {
      parent[key] = splitList(value);
    } else {
      parent[key] = value;
    }
  }
  delete root.__listKey;
  const body = lines.slice(end + 1).join('\n');
  return { data: root, body, bodyStartLine: end + 1 };
}

/* ------------------------------- discovery -------------------------------- */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const agentsDir = join(projectDir, '.pi', 'agents');
const skillsDir = join(projectDir, '.pi', 'skills');
const specsDir = join(projectDir, 'docs', 'specs');
const settingsPath = join(projectDir, '.pi', 'settings.json');
const constitutionPath = join(projectDir, 'AGENTS.md');
const profilePath = join(projectDir, 'docs', 'project-profile.md');

// The profile is the single source of truth for timeoutMs; the checker reads the recorded value
// instead of hard-coding it, so raising the ceiling means editing the profile plus the role files.
const profileText = readFile(profilePath) ?? '';
const PROFILE_TIMEOUT_MS = Number(profileText.match(/timeoutMs`?:\s*\*\*(\d+)\*\*/)?.[1] ?? 0);

const THINKING_RANK = { off: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };

/* -------------------------------- settings -------------------------------- */

let settings = null;
const settingsRaw = readFile(settingsPath);
if (settingsRaw == null) {
  err(rel(settingsPath), 'missing .pi/settings.json');
} else {
  try {
    settings = JSON.parse(settingsRaw);
  } catch (e) {
    err(rel(settingsPath), `invalid JSON: ${e.message}`);
  }
}

const sub = settings?.subagents ?? {};
const maxThinking = sub.maxThinking ?? null;
if (settings) {
  if (settings.defaultThinkingLevel !== 'off') err(rel(settingsPath), 'defaultThinkingLevel must be "off"');
  if (settings.defaultModel != null) err(rel(settingsPath), 'defaultModel is forbidden (model pinning)');
  if (settings.defaultProvider != null) err(rel(settingsPath), 'defaultProvider is forbidden (model pinning)');
  if (sub.defaultModel != null) err(rel(settingsPath), 'subagents.defaultModel is forbidden (model pinning)');
  if (sub.defaultProvider != null) err(rel(settingsPath), 'subagents.defaultProvider is forbidden (model pinning)');
  if (sub.disableThinking !== true) err(rel(settingsPath), 'subagents.disableThinking must be true');
  if (sub.defaultThinking !== 'off') err(rel(settingsPath), 'subagents.defaultThinking must be "off"');
  if (maxThinking !== 'off') err(rel(settingsPath), 'subagents.maxThinking must be "off" when every role has thinking: off');
  const concurrency = settings.parallel?.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) {
    err(rel(settingsPath), 'parallel.concurrency must be an integer 1..2');
  }
  if (settings.compaction?.enabled !== true) warn(rel(settingsPath), 'compaction.enabled should be true for a 131k context');
  if (!Number.isInteger(settings.compaction?.reserveTokens)) warn(rel(settingsPath), 'compaction.reserveTokens should be set');
  if (!Array.isArray(settings.skills) || !settings.skills.includes('.pi/skills')) {
    err(rel(settingsPath), 'skills must include ".pi/skills"');
  }
  if (!existsSync(skillsDir)) err(rel(skillsDir), 'skills directory referenced by settings does not exist');
}

/* --------------------------------- agents --------------------------------- */

const agentFiles = walk(agentsDir).filter((f) => f.endsWith('.md') && !f.endsWith('.chain.md'));
if (agentFiles.length === 0) err(rel(agentsDir), 'no role definitions found');

const roles = [];
for (const file of agentFiles) {
  const text = readFile(file);
  const r = rel(file);
  if (text == null) { err(r, 'unreadable'); continue; }
  const { data, body } = parseFrontmatter(text);
  if (data == null) { err(r, 'missing frontmatter'); continue; }
  if (typeof data === 'string') { err(r, `frontmatter error: ${data}`); continue; }

  const name = data.name;
  const expected = basename(file).replace(/\.md$/, '');
  if (!name) err(r, 'frontmatter `name` missing');
  else if (name !== expected) err(r, `name "${name}" != file name "${expected}"`);
  if (!data.description || !String(data.description).trim()) err(r, 'description missing');
  if (data.model !== 'inherit') err(r, 'model must be "inherit"');
  if (data.defaultContext !== 'fresh') err(r, 'defaultContext must be "fresh" (context: fork is never used)');
  if (data.inheritSkills !== false) err(r, 'inheritSkills must be false');
  if (![1, 2].includes(data.maxSubagentDepth)) err(r, 'maxSubagentDepth must be 1 or 2');
  if (data.thinking == null) err(r, 'thinking must be set explicitly');
  else if (typeof data.thinking === 'string' && THINKING_RANK[data.thinking] != null && THINKING_RANK[maxThinking] != null
    && THINKING_RANK[data.thinking] > THINKING_RANK[maxThinking]) {
    err(r, `thinking "${data.thinking}" exceeds subagents.maxThinking "${maxThinking}"`);
  }
  if (!PROFILE_TIMEOUT_MS) warn(r, 'cannot read the adapted timeoutMs value from docs/project-profile.md');
  else if (data.timeoutMs !== PROFILE_TIMEOUT_MS) warn(r, `timeoutMs ${data.timeoutMs} differs from the profile value ${PROFILE_TIMEOUT_MS}`);

  const tools = splitList(data.tools);
  const skills = splitList(data.skills);
  if (skills.length > 2) err(r, `at most 2 skills, got ${skills.length}`);
  for (const s of skills) {
    if (!existsSync(join(skillsDir, s, 'SKILL.md'))) err(r, `skill "${s}" has no .pi/skills/${s}/SKILL.md`);
  }

  const hasWrite = tools.includes('edit') || tools.includes('write');
  const hasDelegation = tools.includes('subagent') || data.allowNestedSubagents === true;
  const allowedAgentsPresent = Object.prototype.hasOwnProperty.call(data, 'allowedAgents');
  const allowedAgents = splitList(data.allowedAgents);

  if (hasDelegation) {
    if (hasWrite) err(r, 'a delegating role must not have edit/write tools');
    if (allowedAgents.length === 0) err(r, 'a delegating role must list allowedAgents');
    if (data.maxSubagentDepth !== 2) err(r, 'a delegating role must set maxSubagentDepth: 2');
    if (data.acceptanceRole !== 'read-only') warn(r, 'a delegating read-only role should set acceptanceRole: read-only');
  } else {
    if (tools.includes('subagent')) err(r, 'specialists must not carry the subagent tool');
    if (!allowedAgentsPresent) err(r, 'specialists must set allowedAgents (empty list to deny delegation)');
    else if (allowedAgents.length > 0) err(r, 'specialists must have an empty allowedAgents list');
  }

  // Pi's frontmatter parser turns a flow-style empty list into the literal entry "[]",
  // which makes the whole agent definition invalid. Require the bare-key form instead.
  const flowEmpty = text.match(/^([A-Za-z]+): *\[\] *$/m);
  if (flowEmpty) err(r, `"${flowEmpty[1]}: []" is parsed by Pi as a literal entry; write "${flowEmpty[1]}:" with no value`);

  const isReviewer = /review/.test(expected);
  if (isReviewer) {
    if (hasWrite) err(r, 'reviewer must be read-only (no edit/write)');
    if (skills.length !== 2) err(r, `reviewer needs exactly 2 skills, got ${skills.length}`);
    if (tools.includes('bash') && !/read-only|read only/i.test(body)) {
      err(r, 'reviewer with bash must state the read-only git restriction in its body');
    }
  }

  const bodyLines = body.replace(/\s+$/, '').split('\n').length;
  if (bodyLines < 30 || bodyLines > 55) err(r, `role body must be 30-55 lines, got ${bodyLines}`);
  if (!/foreign sessions|not retold/i.test(body)) warn(r, 'role body is missing the context-isolation line');

  roles.push({ name: name ?? expected, file: r, data, tools, skills, hasDelegation, isReviewer });
}

const roleNames = roles.map((x) => x.name);

/* --------------------------- settings/roles wiring ------------------------- */

if (settings) {
  const overrideNames = Object.keys(sub.agentOverrides ?? {});
  for (const n of overrideNames) {
    if (!roleNames.includes(n)) err(rel(settingsPath), `agentOverrides entry "${n}" has no role definition`);
    if (sub.agentOverrides[n]?.model != null) err(rel(settingsPath), `agentOverrides.${n}.model is forbidden (model pinning)`);
    if (sub.agentOverrides[n]?.thinking !== 'off') err(rel(settingsPath), `agentOverrides.${n}.thinking must be "off"`);
  }
  for (const n of roleNames) {
    if (!overrideNames.includes(n)) err(rel(settingsPath), `role "${n}" has no agentOverrides entry`);
  }
}

/* ------------------------------ constitution ------------------------------ */

const REQUIRED_SECTIONS = [
  'Primary Goal', 'Interaction Protocol', 'Runtime Model', 'Project Priorities',
  'Expected Repository Structure', 'Architecture Rules', 'Role Routing',
  'Delivery Workflow', 'Orchestration Budgets', 'Documentation Expectations',
];

const constitution = readFile(constitutionPath);
if (constitution == null) {
  err(rel(constitutionPath), 'missing AGENTS.md');
} else {
  const c = rel(constitutionPath);
  if (!/^# \S/m.test(constitution)) err(c, 'missing top-level "# <Project> Project" heading');
  const headings = [...constitution.matchAll(/^## +(.+)$/gm)].map((m) => m[1].trim());
  for (const s of REQUIRED_SECTIONS) {
    if (!headings.includes(s)) err(c, `missing section "## ${s}"`);
  }
  const placeholders = constitution.match(/\{\{[^}]*\}\}/g);
  if (placeholders) err(c, `unfilled placeholders: ${placeholders.slice(0, 5).join(', ')}`);
  if (!/->/.test(constitution)) err(c, 'Data Flow line (source -> store -> ... ) missing in Architecture Rules');

  const routing = constitution.split(/^## +Role Routing$/m)[1]?.split(/^## +/m)[0] ?? '';
  const routed = [...routing.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
  const routedReal = routed.filter((n) => roleNames.includes(n) || /^[a-z0-9-]+$/.test(n));
  for (const n of roleNames) {
    const count = routedReal.filter((x) => x === n).length;
    if (count === 0) err(c, `Role Routing does not mention role "${n}"`);
    if (count > 1) err(c, `Role Routing mentions "${n}" ${count} times`);
  }
  for (const n of routedReal) {
    if (!roleNames.includes(n)) err(c, `Role Routing mentions unknown role "${n}"`);
  }
}

/* --------------------------------- specs ---------------------------------- */

const specFiles = walk(specsDir).filter((f) => f.endsWith('.md') && basename(f) !== 'INDEX.md');
if (specFiles.length < 2 || specFiles.length > 7) err(rel(specsDir), `expected 2-7 spec files, got ${specFiles.length}`);
if (!specFiles.some((f) => basename(f) === 'code-review-flow.md')) err(rel(specsDir), 'code-review-flow.md is mandatory');

const SPEC_SECTIONS = ['Purpose / Goal', 'Scope', 'Terms / Aliases', 'Flow / Sequence', 'Rules / Semantics', 'Edge Cases', 'Acceptance Criteria'];
const PLAN_PREFIXES = ['src/', 'tests/', 'dist/', 'node_modules/', 'package.json', 'plans/'];
const HARNESS_PREFIXES = ['docs/', '.pi/', 'scripts/', 'AGENTS.md', 'README.md'];

const indexRaw = readFile(join(specsDir, 'INDEX.md'));
if (indexRaw == null) {
  err(join(rel(specsDir), 'INDEX.md'), 'missing spec index');
}

for (const file of specFiles) {
  const text = readFile(file);
  const r = rel(file);
  const name = basename(file);
  const headings = text.replace(/\r\n/g, '\n').split('\n').filter((l) => /^## +/.test(l)).map((l) => l.replace(/^#+ +/, '').trim());
  for (const s of SPEC_SECTIONS) {
    if (!headings.includes(s)) err(r, `missing spec section "## ${s}"`);
  }
  if (constitution && !constitution.includes(name)) err(r, `spec "${name}" is not linked from AGENTS.md`);
  if (indexRaw && !indexRaw.includes(name)) err(r, `spec "${name}" is not listed in docs/specs/INDEX.md`);

  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    const token = m[1];
    if (!/[\/.]/.test(token)) continue;
    if (/[<>*]/.test(token) || /^https?:/.test(token)) continue;
    if (!/^([a-z][a-z0-9._-]*\/|AGENTS\.md|README\.md)/i.test(token)) continue;
    if (PLAN_PREFIXES.some((p) => token.startsWith(p))) { info(r, `planned path not created yet: ${token}`); continue; }
    if (HARNESS_PREFIXES.some((p) => token.startsWith(p)) && !existsSync(join(projectDir, token))) {
      err(r, `referenced path does not exist: ${token}`);
    }
  }
}

/* -------------------------------- skills ---------------------------------- */

const skillFiles = walk(skillsDir).filter((f) => basename(f) === 'SKILL.md');
if (skillFiles.length < 3) warn(rel(skillsDir), 'expected at least 3 skills for this roster');
const skillNames = [];
for (const file of skillFiles) {
  const text = readFile(file);
  const r = rel(file);
  const dirName = basename(dirname(file));
  const { data, body } = parseFrontmatter(text);
  if (data == null || typeof data === 'string') { err(r, `frontmatter error: ${data ?? 'missing'}`); continue; }
  if (!data.name) err(r, 'frontmatter `name` missing');
  else if (data.name !== dirName) err(r, `name "${data.name}" != directory "${dirName}"`);
  else skillNames.push(data.name);
  if (!data.description || !String(data.description).trim()) err(r, 'description missing');
  if (String(data.description ?? '').length > 1024) err(r, 'description exceeds 1024 characters');
  if (!data.license) warn(r, 'license missing');
  if (!body.includes('## What I do')) err(r, 'missing "## What I do"');
  if (!body.includes('## Output style')) err(r, 'missing "## Output style"');
  if (!/^#{0,3} *Not for:/m.test(body)) err(r, 'missing a "Not for:" line');
  const bodyLines = body.split('\n').filter((l) => l.trim()).length;
  if (bodyLines < 20 || bodyLines > 110) err(r, `skill body must be 20-110 non-empty lines, got ${bodyLines}`);
  const audience = splitList(data.metadata?.audience);
  if (audience.length === 0) warn(r, 'metadata.audience missing');
  for (const a of audience) {
    if (!roleNames.includes(a)) err(r, `metadata.audience references unknown role "${a}"`);
  }
  if (splitList(data.metadata?.domain).length === 0) warn(r, 'metadata.domain missing');
}

/* --------------------------- profile consistency -------------------------- */

if (readFile(profilePath) == null) {
  err(rel(profilePath), 'missing docs/project-profile.md (source of truth)');
} else {
  const p = rel(profilePath);
  const profile = readFile(profilePath);
  for (const s of ['## Project', '## Stack', '## Documentation', '## Testing', '## Process rules', '## Team roles', '## Constraints', '## Language & Runtime Model']) {
    if (!profile.includes(s)) err(p, `missing profile section "${s}"`);
  }
  if (!PROFILE_TIMEOUT_MS) err(p, 'profile must record the adapted timeoutMs value as **<ms>**');
  for (const role of roles) {
    if (role.data.timeoutMs != null && !profile.includes(String(role.data.timeoutMs))) {
      err(p, `role "${role.name}" timeoutMs ${role.data.timeoutMs} is not the value recorded in the profile`);
    }
  }
}

/* --------------------------------- report --------------------------------- */

const report = {
  project: projectDir,
  roles: roleNames,
  skills: skillNames,
  specs: specFiles.map((f) => basename(f)),
  errors,
  warnings,
  infos,
  ok: errors.length === 0 && (!strict || warnings.length === 0),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`inlineNotes agent config check — ${projectDir}`);
  console.log(`roles: ${roleNames.join(', ') || 'none'}`);
  console.log(`skills: ${skillNames.join(', ') || 'none'}`);
  console.log(`specs: ${report.specs.join(', ') || 'none'}`);
  for (const e of errors) console.log(`ERROR  ${e.file}: ${e.msg}`);
  for (const w of warnings) console.log(`WARN   ${w.file}: ${w.msg}`);
  for (const i of infos) console.log(`INFO   ${i.file}: ${i.msg}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s)`);
}

const failed = errors.length > 0 || (strict && warnings.length > 0);
process.exit(failed ? 1 : 0);
