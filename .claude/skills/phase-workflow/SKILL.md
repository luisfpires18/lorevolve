---
name: phase-workflow
description: How a meaningful LorEvolve change is run end to end - investigate, constrain, plan, challenge, implement, validate, wrap up. Use when starting a feature, refactor, or any change big enough to need a plan, and again when closing one out. Trivial fixes skip it.
---

# Phase workflow

For meaningful work. A typo, a one-line fix or a doc tweak needs none of this ceremony.

## Order

1. **Investigate.** Read only what the task touches. `STATE.md` for current state, `SYSTEMS.md`
   for paths, `docs/architecture/decisions/README.md` for decisions already taken.
2. **Constraints.** Name what may not break: existing ADRs, ownership boundaries, schema,
   response contracts.
3. **Plan.** Steps, files, and the validation that will prove it.
4. **Challenge.** Argue against the plan once. Cheaper option? Does an ADR already settle it?
   What breaks if the assumption is wrong?
5. **Implement.**
6. **Validate.**
7. **Wrap up.**

Architectural or large change: surface the plan and get agreement before step 5. Small
contained change: state it in two lines and keep going.

## Validation

- During: narrowest relevant tests, often. Near the end: full suite for every area touched.
- Release build where the change compiles.
- Schema possibly affected: check for pending model changes, add the migration if one is
  owed. Never assume none is.
- Read the diff before committing, every hunk deliberate. Clean tree at the end.

Report failures with their output. A skipped step is reported as skipped, not omitted.

## Wrap-up

`STATE.md` is current state, not a log. On merge, delete your line under "In flight" or "Committed,
not on `dev`". Add a line only for something a later session must act on: an owner step, an unverified
item, a new risk or blocker. Never test counts, review narratives or shipped detail: git history and
ADRs hold those.

Also update `SYSTEMS.md` when paths or responsibilities moved, and an ADR **only** when a durable
decision was actually taken.

## Report

Concise, caveman style, three headings:

    DONE / WHERE IT IS
    BLOCKED
    OWNER STEPS
