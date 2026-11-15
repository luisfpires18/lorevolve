---
name: Agent task
about: One approved task for Claude to implement and Codex to review
title: "[<PROJECT>-<NNN>] <short outcome>"
labels: agent-ready
---

**Type:** Implementation | Investigation/plan only
**Tracker:** #<milestone or parent Issue>
**Dependency:** #<issue this one needs first, or "None">
**Expected PRs:** Exactly one implementation PR for this issue, targeting `dev`. Split the work into
more than one PR only when a single diff would be too large to review, and say on this issue how it
was split and why. Never bundle another issue's work into this PR.

## Goal
<one or two sentences: what is true when this is done>

## Context
<repository, the files and docs to follow, what a merge deploys, crosslinks to related issues>

## Current behavior
<what happens today, stated so the gap is checkable>

## Expected behavior
<what happens instead, stated so the gap is checkable>

## Scope
**In scope:**
- <file, folder or behavior this task may change>

**Out of scope (do NOT touch):**
- <what must not change>

## Acceptance criteria
- [ ] <observable, checkable result>
- [ ] <one box per result; no box that only says "it works">
- [ ] Tests added or updated for the touched behavior, with assertions on observable output.

## Constraints
- <existing behavior to preserve; no unsolicited refactor>
- Task branch off `dev`, shared Codex review, no `master` or `demo` deployment.
- Do not claim CI passed locally: targeted tests locally, full suites in CI.

## Hints (optional)
- <where to look first: `SYSTEMS.md` for responsibility boundaries, `docs/architecture/decisions/README.md` before a structural change>

## Verification
Run from the repository root in a dev checkout. Every command here is one that actually runs in this
repository, and its expected result is stated; a command nobody has run is not verification.

```bash
dotnet test tests/LorEvolve.Api.Tests --filter FullyQualifiedName~<TestClass>
npx playwright test <spec>.spec.ts --workers=2 --retries=0
```

<what each command should show, and any evidence to attach: screenshots, video scenarios, or "None">

## Open questions
- <or "None". If a new architectural choice is needed, record it on this issue with a recommendation
  instead of guessing.>
