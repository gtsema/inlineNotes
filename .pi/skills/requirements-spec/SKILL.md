---
name: requirements-spec
description: |
  Write and interrogate behavior specs before code: fixed checklist template, Terms/Aliases table,
  observable acceptance criteria, Assumption notes for unanswered observable-behavior questions.
  Use when a task needs a spec, when a brief is ambiguous, when limits or empty states or ordering are
  undefined, or when a spec must be updated together with a behavior change.
license: MIT
metadata:
  audience: project-manager, extension-engineer
  domain: requirements-engineering
---

## What I do

- Turn a request into a fixed checklist: Goal / Done-criterion / In scope / Out of scope / Layers / Constraints / Options.
- Ask only about decisions the code and the profile cannot already answer; record the rest as assumptions the user may refute.
- Write specs in the section order used in `docs/specs/`: Purpose / Goal, Scope, Terms / Aliases, Flow / Sequence, Rules / Semantics, Edge Cases, Acceptance Criteria.
- Phrase acceptance criteria as observable statements a reviewer can check without reading the implementation.
- Mark every silent decision as `Assumption:` in the spec and in the task state file.
- Keep the Terms / Aliases table bilingual so Russian UI wording stays greppable from English anchors.

## Observable-behavior checklist

For every feature decide, or ask, these before code:
- Limits and counters: hard cap, what happens at the cap, what the counter shows.
- Empty and invalid input: rejected, disabled control, or default value.
- Identity and permission: who may create, edit, delete; what read-only looks like.
- Persistence: what survives reload, what survives navigation, what is cleared.
- Conflict: overlap, duplicate, concurrent tabs, deleted source text.
- Ordering and state naming: sort key, boolean flag names, message wording.
- Failure surface: which message appears and where.

## Spec writing rules

- One behavior = one spec section; no rule lives in two specs.
- Numbers, IDs and message strings are quoted exactly, so tests can assert them.
- A spec states the storage key shape and the field names when it defines stored data.
- Each acceptance criterion maps to a test or to an explicit manual step in Chrome.
- Never restate another layer's rules "for context"; link to the owning spec instead.

## Not for:

- Implementation design, module decomposition, or choosing libraries — that is engineering work inside the layer.
- Task sizing, stage planning, delegation briefs — see `delivery-planning`.
- Reviewing an existing implementation against a spec — see `code-review-checklist`.

## Output style

- Artifact: `docs/specs/<topic>.md` with the section headings above, English body, Russian UI strings quoted verbatim.
- Unresolved items go to a short `Assumption:` list at the end of the section, each with the chosen least-risky default.
- Acceptance criteria are numbered so a brief and a review can reference them by number.
