# World Logic condition specification, version 1

Status: accepted (2026-11-15), ADR 0072. Normative for every M3 implementation.

This document is the machine-readable contract behind a World Logic rule. It is deliberately written without a
single universe, world, game or story term: a condition knows subjects, attributes, relations and events, and
nothing else. The fixtures under `tests/LorEvolve.Api.Tests/Fixtures/WorldLogic/` are instances of this schema,
and `WorldLogicFixtureTests` is the executable statement of what this document says.

## 1. What a condition is, and what it is never

A condition is a bounded tree of typed nodes, stored as JSON, authored part by part through a form. It is data.

- It is never source code, never an expression string, never a template and never evaluated by a scripting host.
  There is no identifier an author can invent: every node kind, every operator and every selectable field in this
  document is a closed set, and anything outside it is rejected on save and refused at evaluation.
- It never reads prose. Titles, descriptions, manuscripts and names carry no meaning, exactly as ADR 0033 set out.
  The only inputs are explicit attribute values, relation rows, event rows and the ids an author chose.
- It never writes. Evaluation is a pure function of the stored rules and the stored facts.

## 2. The evaluation input

An evaluation is given one `facts` document and one rule set. Production builds that document from the database;
fixtures write it by hand. The shape is identical, because the evaluator reads the shape and nothing else.

```json
{
  "subjects": [
    { "id": "s.ingot", "type": "artifact", "attributes": { "purity": 3, "sealed": true, "madeOn": "0145-03-02" } }
  ],
  "relations": [
    { "type": "forgedBy", "fromId": "s.ingot", "toId": "s.smith" }
  ],
  "events": [
    { "id": "e.1", "kind": "forging", "method": "coldPress", "subjectIds": ["s.ingot"], "at": "0145-03-02", "canon": true }
  ]
}
```

| Source | Fields a query or operand may name |
| --- | --- |
| `subjects` | `id`, `type`, `attributes.<name>` |
| `relations` | `type`, `fromId`, `toId` |
| `events` | `id`, `kind`, `method`, `subjectIds`, `at`, `canon` |

No other field exists. A query or operand naming a field outside this table is an `unknown_field` error, not an
empty result: silently reading nothing is how a broken rule comes to look satisfied.

An id is an opaque string in a fixture and a GUID in production. The evaluator compares ids for equality and never
parses, orders or interprets them, but a save requires every stored id to be a GUID, because a stored id names a row
in the database. A fixture is never saved: it is read straight into the evaluator's own fact source.

### 2.1 Types

Five value types, and one absence.

| Type | Written as | Notes |
| --- | --- | --- |
| `boolean` | `true`, `false` | |
| `number` | JSON number | Decimal. No integer/float distinction is exposed. |
| `text` | JSON string | Compared by exact code points after Unicode composition. Never case-folded, never trimmed. |
| `timePoint` | JSON string | A scoped point, section 6. Ordered only inside one scope. |
| `reference` | JSON string | An id. Equality only. |
| *missing* | `null`, or an absent attribute | Not a type. Any operand that resolves to missing makes its node `unknown`. |

A comparison between two different types is an `type_mismatch` error. It is never false. Two rules that disagree
about an attribute's type are a modelling mistake the author must see, not a silent pass.

## 3. Nodes

Every node is an object with a `kind`. Version 1 has exactly nine kinds.

| Kind | Shape | Result |
| --- | --- | --- |
| `all` | `{ "kind": "all", "of": [node, ...] }` | Section 4. Empty `of` is a `node_arity` error. |
| `any` | `{ "kind": "any", "of": [node, ...] }` | Section 4. Empty `of` is a `node_arity` error. |
| `not` | `{ "kind": "not", "of": node }` | Section 4. |
| `compare` | `{ "kind": "compare", "left": operand, "op": op, "right": operand }` | Section 3.1. |
| `exists` | `{ "kind": "exists", "query": query }` | `true` when the query returns at least one row, else `false`. Never `unknown`: a query over a present source answers definitely. |
| `related` | `{ "kind": "related", "relation": text, "from": operand, "to": operand }` | `true` when a relation row of that type joins the two references. `unknown` when either operand is missing. |
| `within` | `{ "kind": "within", "point": operand, "from": operand, "to": operand }` | `true` when `from <= point <= to`. `unknown` when any operand is missing. `scope_mismatch` error when the three points are not all of one scope (section 6). |
| `ruleHolds` | `{ "kind": "ruleHolds", "ruleId": text }` | The referenced rule's own outcome, section 5. |
| `always` | `{ "kind": "always", "value": "true" \| "false" \| "unknown" }` | The named constant. It exists so a rule can be disabled or a fixture can pin a branch without a fake comparison. |

### 3.1 Operators

`eq`, `ne`, `lt`, `lte`, `gt`, `gte`. `eq` and `ne` apply to all five types. The four orderings apply to `number`
and `timePoint` only; on `boolean`, `text` or `reference` they are an `operator_not_applicable` error, because
"greater than" over text is a collation decision no author asked for.

### 3.2 Operands

| Operand | Shape | Resolves to |
| --- | --- | --- |
| literal | `{ "literal": <json>, "type": <type> }` | The value. `type` is required, so a fixture can state `timePoint` or `reference` rather than leaving a string ambiguous. |
| attribute | `{ "attribute": name, "of": operand }` | The named attribute of the referenced subject. Missing when the subject or the attribute is absent. |
| field | `{ "field": name, "of": operand, "from": source }` | A non-attribute field from the table in section 2. Missing when the row is absent. |
| subject | `{ "subject": "self" \| id }` | A `reference`. `self` is the evaluation target, section 7. |
| count | `{ "count": query }` | A `number`. Never missing: a query that matches nothing counts zero. |

An operand nested more than `maxDepth` deep, or an `of` chain that revisits a node, is a `depth_limit` error.

### 3.3 Queries

A query is a selector, not a language. No joins, no ordering, no projection, no nesting.

```json
{ "from": "events", "where": [ { "field": "kind", "op": "eq", "value": "forging", "type": "text" },
                               { "field": "canon", "op": "eq", "value": true, "type": "boolean" } ] }
```

`where` is an AND of at most eight clauses. A clause's `field` must be in section 2's table for that source, and its
`value` carries its `type`, which it is held to exactly as a literal operand is: a `reference` is an id, a
`timePoint` names a scope from section 6, a `boolean` is `true` or `false`, and anything else is `type_mismatch`
on save rather than at evaluation time. The type also has to be the one the field carries: `id`, `fromId`, `toId`
and `subjectIds` compare a `reference`, `type`, `kind` and `method` a `text`, `at` a `timePoint` and `canon` a
`boolean`. The same holds for an `operandValue` whose type is known before anything is evaluated: a literal
declares its own, a `count` is a number and a `subject` is a reference, while an `attribute` or a `field` is only
settled by the stored facts and is checked at evaluation time instead. `subjectIds` supports only `contains`, whose value is a `reference`. A clause may name
`{ "operandValue": operand }` in place of `value`, which is how a rule compares a row against the evaluation target;
an operand that resolves to missing makes the whole query return zero rows, and `count` therefore returns `0` while
`exists` returns `false`. That is the one place a query is allowed to treat missing as empty, and it is called out
here because it is the one asymmetry in this specification.

A query reads at most `maxQueryRows` rows. Exceeding it is a `query_limit` error, never a truncated answer.

## 4. Three-valued logic, and error as a fourth outcome

An outcome is `true`, `false`, `unknown` or `error`. `unknown` means the stored facts do not settle the question.
It is never coerced to `false`, and a rule that cannot be checked never counts as satisfied.

| Node | Rule |
| --- | --- |
| `all` | `false` if any child is `false`. Otherwise `error` if any child is `error`. Otherwise `unknown` if any child is `unknown`. Otherwise `true`. |
| `any` | `true` if any child is `true`. Otherwise `error` if any child is `error`. Otherwise `unknown` if any child is `unknown`. Otherwise `false`. |
| `not` | `true` becomes `false`, `false` becomes `true`, `unknown` stays `unknown`, `error` stays `error`. |

A definite answer therefore wins over an error, and the two groups are exact mirrors of each other. The definite
answer is the one that settles the group on its own: `false` for `all`, `true` for `any`. So `all` with one `false`
child is `false` even when a sibling failed, and `any` with one `true` child is `true` even when a sibling failed,
because in both cases the group's answer is already settled and the author deserves it rather than a diagnostic.

In every other combination an error dominates `unknown`, because an error is a defect in the rule or the budget and
must be fixed before the `unknown` is worth reading. In particular `any` over a `false` and an error is `error`, not
`false`, and `any` over a `false`, an `unknown` and an error is `error` too. The fixtures pin all four of these
cases, for `all` and for `any`, in `edge-cases.json`.

Evaluation order is the declared order of `of`, left to right, and short-circuits as soon as the table above is
decided. Short-circuiting is observable only in the evidence list, never in the outcome: an implementation that
evaluated every child would reach the same outcome.

## 5. Rules, exceptions and dependencies

```json
{
  "id": "rule.purity",
  "version": 3,
  "scope": { "kind": "universe" },
  "dependsOn": ["rule.sealed"],
  "condition": { "kind": "compare", "left": { "attribute": "purity", "of": { "subject": "self" } },
                 "op": "gte", "right": { "literal": 2, "type": "number" } },
  "exceptions": [
    { "id": "ex.ceremonial", "scope": { "kind": "project", "projectId": "p.1" },
      "when": { "kind": "compare", "left": { "attribute": "ceremonial", "of": { "subject": "self" } },
                "op": "eq", "right": { "literal": true, "type": "boolean" } } }
  ]
}
```

A rule's `condition` states what must hold. `false` is a proven violation; `true` is a pass; `unknown` and `error`
are reported as themselves.

A rule may carry its own `schemaVersion`; left out, it is the one the document or the store records. That is how a
single store holds rules written against different versions, and how a build refuses one it does not implement
without refusing the rest.

### 5.1 Exception precedence

Exceptions are evaluated only when the condition is `false`, and only then, so an exception can never turn a pass
into anything else and never costs budget on the common path.

1. A project-scoped exception outranks a universe-scoped one.
2. Inside one scope, declared order decides.
3. The first exception whose `when` is `true` wins; the outcome becomes `exempt` and that exception's id is the
   evidence. `exempt` is reported separately from `true` and never recorded as a violation.
4. If no exception is `true` but at least one is `unknown`, the outcome is `unknown`, not a violation. An exception
   that might apply is not proof that it does not.
5. If no exception is `true` and at least one is `error`, the outcome is `error`.
6. Otherwise the violation stands.

An exception whose `scope` names a project that is not the evaluation's project is skipped before its `when` runs.

An exception is stored with the rule, as an array of `{ id, scope: { kind, projectId? }, when }` in declared order,
and each `when` is held to every rule in this document exactly as a rule's own condition is: the same closed sets,
the same static budgets and the same error codes. An `id` is unique within its rule, because it is what a finding
records as the reason a violation was excused.

### 5.2 Dependencies

`dependsOn` is the declared set of rules this rule's `ruleHolds` nodes may name. A `ruleHolds` naming a rule outside
`dependsOn` is a `undeclared_dependency` error, so the dependency graph is readable without walking every condition.

The graph is checked before any evaluation. A cycle, including a rule depending on itself, fails every rule on the
cycle with `dependency_cycle` and evaluates none of them; rules off the cycle still evaluate. A `dependsOn` naming a
rule that does not exist, is deleted or belongs to another universe is `missing_rule`. Depth beyond
`maxDependencyDepth` is `dependency_depth_limit`.

A dependency is evaluated once per evaluation per target and memoised, so a diamond costs one evaluation, not two.

### 5.3 Rules that contradict each other

Two rules that cannot both hold are not an error and are not reconciled. Each is evaluated independently against the
same facts, and each reports its own outcome: one `true` and one `false` is the correct, honest answer, and the
author decides which rule is wrong. The evaluator has no notion of rule priority, ordering or override, and version 1
deliberately adds none.

## 6. Time

A `timePoint` is `"<scope>:<value>"`. Three scopes exist in version 1:

- `calendar:<ISO-8601 date>`, a point on a universe calendar.
- `era:<eraId>/<number>`, a number within a named era.
- `year:<signed integer>`, a point on the plain reckoning a universe that has not named its eras keeps (ADR 0022).

Points are ordered only inside one scope and one era. Comparing `calendar:` with `era:` or with `year:`, or two
different eras, is a `scope_mismatch` error rather than a guess, because the relation between them is the author's to
state and version 1 does not store it. This is the known limitation ADR 0072 records.

A missing `at` is missing, not the beginning of time.

## 7. The evaluation target

Every evaluation names a target: the id of one subject or one event, or nothing. `{ "subject": "self" }` resolves to
the target as a `reference`, and is missing when there is none, which makes any node reading it `unknown`. An
`attribute` operand over a target that is an event is missing, because an event has no attributes; a `field` operand
names the source it reads, so a rule over events reads `at`, `kind` or `method` of `self` and a rule over subjects
reads its attributes.

A rule written without `self` is a universe statement, evaluated once; a rule using `self` is evaluated once per
candidate the caller supplies. The evaluator never chooses the candidate set itself.

## 8. Budgets and limits

Static limits are enforced when a rule is saved, so a stored rule can always be evaluated. Dynamic limits are
enforced during evaluation and produce an error outcome for that rule alone, never a partial answer and never a
failure of the whole run.

| Limit | Value | When | Error |
| --- | --- | --- | --- |
| `maxDepth` | 16 | save and evaluation | `depth_limit` |
| `maxNodes` per condition | 256 | save | `node_limit` |
| `maxWhereClauses` | 8 | save | `node_arity` |
| `maxExceptions` per rule | 16 | save | `node_arity` |
| `maxConditionBytes` | 32768 | save | `node_limit` |
| `maxSteps` per rule | 20000 | evaluation | `step_budget` |
| `maxQueryRows` | 2000 | evaluation | `query_limit` |
| `maxDependencyDepth` | 8 | save and evaluation | `dependency_depth_limit` |
| `maxRulesPerEvaluation` | 500 | evaluation | `rule_budget` |
| wall clock per rule | 2 seconds | evaluation | `time_budget` |

The full set of error codes is: `type_mismatch`, `operator_not_applicable`, `unknown_node_kind`,
`unknown_operator`, `unknown_field`, `unknown_source`, `node_arity`, `depth_limit`, `node_limit`, `step_budget`,
`query_limit`, `time_budget`, `rule_budget`, `scope_mismatch`, `dependency_cycle`, `dependency_depth_limit`,
`undeclared_dependency`, `missing_rule`, `invalid_reference`, `schema_version_unsupported`. Codes are stable
identifiers, written into findings, and never localised.

## 9. Output

Every rule evaluation returns the same record, whatever the outcome.

```json
{
  "ruleId": "rule.purity",
  "ruleVersion": 3,
  "schemaVersion": 1,
  "outcome": "false",
  "errorCode": null,
  "exemptionId": null,
  "evidence": [ { "source": "subjects", "id": "s.ingot", "role": "self" },
                { "source": "subjects", "id": "s.ingot", "role": "attribute:purity" } ],
  "rationale": [ "compare attribute:purity of self (1) gte 2 -> false" ]
}
```

`evidence` is the ids the outcome actually depended on, in evaluation order and deduplicated, so a finding can be
reproduced and shown. `rationale` is a deterministic, unlocalised trace of the decided nodes. Two evaluations over
unchanged facts and an unchanged rule produce byte-identical records, which is what lets a finding be fingerprinted
the way ADR 0010 fingerprints a Canon conflict.

`rationale` is diagnostic text, not a sentence for a reader, and is never translated. The interface renders the
outcome, the rule and the evidence; it never renders `rationale` as prose.

## 10. Extension points, and what breaks

| Extension | How | Compatibility |
| --- | --- | --- |
| A new fact source or field | Add a row to section 2's table and a reader behind it | Additive. No schema bump: an older rule never names it. |
| A new node kind or operator | Add it here and bump `schemaVersion` | A rule stored at the new version is refused by an older build with `schema_version_unsupported`. Never silently skipped. |
| A new time scope | Add it to section 6 | Additive while existing scopes keep their ordering. `year` was added this way, for a universe that has not named its eras. |
| A new error code | Add it to section 8 | Additive. A client that does not know a code shows the code. |
| A domain-specific predicate | Not an extension point | A condition never gains a kind that knows a genre, a mechanic or a world. Domain meaning lives in the author's attributes and terms. |

`schemaVersion` is stored on every condition. A build reads only versions it implements; a higher version is
`schema_version_unsupported`, which is an error outcome and therefore visible, rather than a pass.

## 11. Security

- No evaluation path compiles, interprets or reflects over author input. Every kind, operator, field and source is
  matched against the closed sets above.
- Every id in a condition is resolved inside the evaluation's universe, and inside its project when the rule is
  project-scoped. An id from elsewhere is `invalid_reference`, never a cross-universe read. This is the same
  boundary `CanonRuleContext` already enforces for Canon rules.
- Authorization is the caller's universe access, checked before a rule is read, exactly as World Rules are today.
  Evaluation adds no privilege and exposes no row the caller could not already read.
- Budgets are the denial-of-service boundary: every loop in the evaluator is bounded by a limit in section 8, and a
  rule that exhausts one fails alone.
- `rationale` and `evidence` contain ids and stored values the caller may already read, and never another
  universe's data.

## 12. Fixtures

`tests/LorEvolve.Api.Tests/Fixtures/WorldLogic/` holds one document per scenario:

| File | Domain | What it is for |
| --- | --- | --- |
| `runeforging.json` | Craft with graded materials | Counting, attribute comparison, project-scoped exception |
| `ley-lines.json` | An unrelated magic system | Relation traversal, nested groups, an unknown from a missing attribute |
| `succession.json` | Monarchic succession | Ordering, temporal containment, precedence between two exceptions |
| `quest-unlocks.json` | Software-style unlock gating | Rule dependencies, a diamond, `exists` over events |
| `clinical-trial.json` | A nonfantasy protocol | Numbers, dates, no fantasy term anywhere in the file |
| `edge-cases.json` | None | Missing data, contradictory rules, a cycle, scope mismatch, type mismatch, every budget |

Each file carries `cases`, and each case states the expected outcome and error code. `WorldLogicFixtureTests`
validates every document against this specification, and `WorldLogicEvaluatorTests` runs every case through the
evaluator and asserts the stated outcome, error code, exemption and evidence. The expectations were written before
the evaluator existed, which is what makes them evidence about the evaluator rather than a description of it.
