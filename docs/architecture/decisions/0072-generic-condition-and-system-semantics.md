# ADR 0072 - A World Logic rule carries a versioned, typed condition tree, and a System is a named set of such rules

Status: accepted (2026-11-15)

## Context

A world rule is words (ADR 0033), and one rule may carry one counting check against the explicit details of Canon
moments (ADR 0034). That check is a single hard-coded pattern. Milestone M3 asks for the general case: an author
states how a world works as a composed condition, groups related rules into a System, and gets evidence-backed
findings out of it.

Three forces shape the decision.

The platform is domain-neutral. LorEvolve knows nothing about any particular world, mechanic or genre, and must not
learn. A condition model that needs a concept named after a craft, a magic system or a game loop has already failed.

An author is not a programmer. The condition has to be authorable in a form, reviewable by a reader, and safe to
store in a multi-tenant database. A rule that is an expression string, a script or a template is none of those.

A rule that cannot be checked must say so. Canon findings are conflicts (ADR 0010); half-described lore is not a
conflict, but it is not a pass either. ADR 0034 already took this position for one pattern, and the general case has
to hold it everywhere, through nested groups and across rules that depend on one another.

## Decision

### A condition is bounded, typed data

A rule's condition is a JSON tree of nodes drawn from a closed set, stored with a `schemaVersion`. Version 1 has nine
node kinds, six comparison operators, five value types and one absence, and a query form that is a selector rather
than a language. The full normative contract, field by field, is
[`docs/architecture/world-logic-condition-spec.md`](../world-logic-condition-spec.md); it is the document
implementations and reviews are held to, and it is not repeated here.

Nothing in the path compiles, interprets or reflects over what an author stored. There is no identifier an author can
invent: every kind, operator, source and field is matched against the closed sets in the spec, and anything else is
refused. A condition still reads no prose, exactly as ADR 0033 requires.

### Four outcomes, and `unknown` is never `false`

An evaluation answers `true`, `false`, `unknown` or `error`. `all` is `false` when any child is `false`, `error` when
any child errored, `unknown` when any child is unknown, and `true` otherwise; `any` is its exact mirror, `true` when
any child is `true`, then `error`, then `unknown`, then `false`; `not` maps `true` and `false` and leaves `unknown`
and `error` alone.

The answer that settles a group on its own wins over a sibling's error: `false` for `all`, `true` for `any`, because
the group's answer is already settled and the author deserves it rather than a diagnostic. In every other
combination an error dominates an unknown, because an error is a defect to fix before the unknown is worth reading.
So `any` over a `false` and an error is an error, not `false`.

A rule whose stored `schemaVersion` this build does not implement is `error` with `schema_version_unsupported`, never
a pass. That is the same stance ADR 0034 took for an unrecognised check kind.

### Exceptions are scoped and evaluated last

A rule may carry explicit exceptions. They run only when the condition came out `false`, so an exception can never
change a pass. A project-scoped exception outranks a universe-scoped one; inside one scope, declared order decides;
the first `true` exception makes the outcome `exempt` and is recorded as the evidence. No exception `true` but one
`unknown` gives `unknown`, not a violation: an exception that might apply is not proof that it does not.

### Dependencies are declared, acyclic and memoised

A rule declares the rules its condition may reference. An undeclared reference is an error, so the dependency graph is
readable without walking every condition. The graph is checked before evaluation: every rule on a cycle fails with
`dependency_cycle` and none of them evaluates, while rules off the cycle still run. A dependency is evaluated once per
target and memoised.

Two rules that contradict each other are not an error and are not reconciled. Each reports its own outcome and the
author decides which rule is wrong. Version 1 has no rule priority, ordering or override, deliberately.

### A System is a named set, not a container

A System is a named, described, versioned grouping of rules, scoped to a universe or to one project inside it. A rule
is a definition in its own right: it may stand alone, and two Systems referencing the same rule reference one
versioned definition rather than copies. Deleting a System never deletes a rule.

This is the opposite of making rules children of Systems, and it is chosen because the reuse an author wants is a
rule in several Systems, while the thing an author renames and reorganises is the System.

### Every loop is bounded

Depth 16, 256 nodes, 32 KB, 8 where-clauses, 16 exceptions and dependency depth 8 are enforced when a rule is saved,
so a stored rule can always be evaluated. 20,000 steps, 2,000 query rows, 500 rules and 2 seconds per rule are
enforced during evaluation, and exhausting one fails that rule alone with a stable error code, never the run and
never a partial answer.

### Deterministic evaluation, and AI nowhere near it

Evaluation is a pure function of stored rules and stored facts, returning the rule id, rule version, schema version,
outcome, error code, the evidence ids the outcome depended on and an unlocalised rationale trace. Two runs over
unchanged data produce byte-identical records, which is what lets a finding be fingerprinted the way ADR 0010
fingerprints a Canon conflict.

No model is involved. AI reaches World Logic only through MCP (ADR 0046), proposes through the staged-change path
(ADR 0047), and anything a model asserts is marked unverified and never recorded as a proven violation.

### Fixtures are part of the specification

Six documents under `tests/LorEvolve.Api.Tests/Fixtures/WorldLogic/` state the semantics as data, in five unrelated
domains plus one file of edge cases, with the expected outcome and error code written on every case. They are written
now, before the evaluator, so the evaluator is held to a contract it did not author. None of the five domains is a
LorEvolve demo world, and the nonfantasy file contains no fantasy term at all.

## Consequences

- The existing World Rule and its one counting check keep their table, ids, endpoints and behaviour. M3 adds a second,
  general kind of rule beside them and maps both into one reading surface; it does not rewrite ADR 0034's check, and a
  universe with no System behaves exactly as it does today.
- `unknown` becomes a first-class result an author sees, not an internal state. The interface has to show three
  outcomes and an error, which is more to design than a pass/fail list.
- A condition is only as useful as the attributes an author filled in. A sparsely described universe produces many
  `unknown` findings, and that is the honest answer rather than a defect.
- The budgets are visible limits. A genuinely large condition is refused on save with a code and a number, instead of
  being accepted and timing out later.
- Versioning the schema means a future node kind makes old builds refuse new rules loudly. That is accepted: a silent
  partial evaluation would report a violation that does not exist.

## Known limitations

- Time points are ordered only inside one scope and one era. Comparing a calendar point with an era point, or two
  different eras, is `scope_mismatch`, because the relation between eras is the author's to state and version 1 does
  not store it. This is the same gap ADR 0022 records.
- There is no aggregation beyond `count`: no sum, average, minimum or maximum, and no grouping.
- There is no quantifier over a query result. "Every forging of this ingot was sealed" is written as a count of the
  unsealed ones being zero, which is equivalent but reads less directly.
- A query cannot join. A condition that needs two hops through relations needs two nodes and an intermediate subject
  the author names.
- `rationale` is diagnostic text in one language, never translated, and never rendered as prose to a reader.
- A rule's condition has no notion of the rule's own history: evaluation sees the current facts, not what they were
  when the rule was written.
