# World Logic state machine specification, version 1

Status: accepted (2026-11-17), ADR 0073. Normative for #357 to #361.

This document is the contract behind a state machine drawn on a World system. It builds on the condition
specification (`world-logic-condition-spec.md`, ADR 0072) and changes nothing in it. Like that document it names no
universe, world, game or story term: a machine knows subjects, one attribute, states, transitions and guard rules.
The fixtures under `tests/LorEvolve.Api.Tests/Fixtures/WorldLogic/Machines/` are instances of this schema.

## 1. What a machine is, and what it is never

A machine says which values one attribute of one type of subject may hold, and what must be true of a subject that
holds each value. It is data, stored as rows and exchanged as one JSON document.

- It is never code. A guard is an existing rule (condition specification, section 5), named by id. A machine adds no
  node kind, no operator and no second condition format.
- It never reads prose and never writes. A check is a pure function of the stored machine, the stored rules and the
  stored facts.
- It never moves a subject. A machine describes and checks; it does not run. Nothing changes an attribute because a
  transition exists.
- A system has at most one machine, and a system without one behaves exactly as before.

## 2. The machine document

```json
{
  "schemaVersion": 1,
  "binding": { "subjectType": "member", "attribute": "rank" },
  "states": [
    { "id": "st.novice", "name": "Novice", "value": "novice", "initial": true, "x": 0, "y": 0 },
    { "id": "st.master", "name": "Master", "value": "master", "initial": false, "x": 320, "y": 0 }
  ],
  "transitions": [
    { "id": "t.raise", "fromStateId": "st.novice", "toStateId": "st.master", "label": "Raised", "guardRuleId": "rule.masterwork" }
  ]
}
```

| Part | Meaning |
| --- | --- |
| `binding.subjectType` | The `type` of the subjects the machine covers, compared as the facts document gives it. |
| `binding.attribute` | The attribute name whose value is the subject's state. |
| `states[].value` | The attribute value that means "in this state". Type `text`. |
| `states[].name` | What the author calls the state. Carries no meaning, like every title. |
| `states[].initial` | Exactly one state is initial. A subject in it needs no transition. |
| `states[].x`, `y` | Where the author put the state on the canvas. Never read by a check. |
| `transitions[].guardRuleId` | A rule that must hold for a subject to be in `toStateId` by this transition, or null for no requirement. |
| `transitions[].label` | Display only. |

The order of `transitions` is the declared order and is part of the record: it is the evaluation order in section 4.

The binding names a type and an attribute by their text, the same way a condition names `type` and
`attributes.<name>` today. Renaming a type or a field therefore unbinds the machine exactly as it breaks a condition
that named it. That is one behaviour, not two, and section 9 lists it as a limit.

## 3. Saving a machine

A machine is saved whole. A save is refused, with the field-keyed problems the Systems routes already return, when:

| Code | Refused when |
| --- | --- |
| `binding_required` | There are states but no `subjectType` or no `attribute`. |
| `machine_state_limit` | More than 64 states. |
| `machine_transition_limit` | More than 256 transitions. |
| `initial_state_required` | The number of initial states is not exactly one, and there is at least one state. |
| `duplicate_state_value` | Two states share a `value`, compared exactly. |
| `unknown_state` | A transition names a state that is not in the document. |
| `self_transition` | `fromStateId` equals `toStateId`. |
| `guard_rule_not_found` | `guardRuleId` names no live rule in this universe. |
| `guard_scope_mismatch` | The guard is project-scoped and the system is not in that project. |
| `schema_version_unsupported` | `schemaVersion` is not one this build knows. |

Text limits: a state name and a transition label take the existing system name limit (200); a state value takes 200.

Allowed on purpose: a state no transition leads to, two transitions between the same pair of states, a transition
into the initial state, and an empty machine (no states, no binding), which is how a machine is removed.

A rule named as a guard is in use. Deleting it is refused with the existing `system_rule_in_use`. Editing it is
allowed and takes effect on the next check, as it does for a rule in a system.

Saving a machine bumps the system's version, and a stale `ExpectedVersion` is refused with the existing conflict.

## 4. The two checks

A check run is given one machine, the facts and the rule set, and optionally a project. It considers every subject
whose `type` equals `binding.subjectType`, in ascending id order, and reads `binding.attribute` of each.

- A subject with no such attribute is outside the machine. No finding. A subject that has not entered a system is
  not a problem with it.
- A subject whose attribute is not of type `text` produces an `undeclared_state` record with outcome `error` and
  code `type_mismatch`.

**Check `undeclared_state`.** The value equals no state's `value`. Outcome `violation`.

**Check `no_transition_holds`.** The value equals the `value` of a state that is not initial. Each transition whose
`toStateId` is that state is evaluated in declared order, with the subject as the evaluation target (condition
specification, section 7) and the run's project:

| Guard | Counts as |
| --- | --- |
| null | `true` |
| rule outcome `true` | `true` |
| rule outcome `exempt` | `true`. A waived requirement is a met one. |
| rule outcome `false`, `unknown`, `error` | itself |

The incoming transitions combine as `any` does in the condition specification, section 4, with the same precedence
and the same short-circuit: `true` if any is `true`; otherwise `error` if any is `error`; otherwise `unknown` if any
is `unknown`; otherwise `false`. A state with no incoming transition combines to `false`.

| Combined | Record |
| --- | --- |
| `true` | None. The subject is where it may be. |
| `false` | outcome `violation` |
| `unknown` | outcome `unknown` |
| `error` | outcome `error`, with the code of the first transition that failed, in declared order |

A subject in the initial state is never checked. `fromStateId` takes no part in either check: section 9 says why.

## 5. Output

Every record a check produces has one shape.

```json
{
  "systemId": "sys.guild",
  "systemVersion": 4,
  "schemaVersion": 1,
  "check": "no_transition_holds",
  "stateId": "st.master",
  "subjectId": "s.pretender",
  "outcome": "violation",
  "errorCode": null,
  "evidence": [ { "source": "subjects", "id": "s.pretender", "role": "self" },
                { "source": "subjects", "id": "s.pretender", "role": "attribute:rank" },
                { "source": "transitions", "id": "t.raise", "role": "guard:false" } ],
  "rationale": [ "state master of self: t.raise guard rule.masterwork -> false" ]
}
```

- `stateId` is null for `undeclared_state`.
- `evidence` starts with the subject and the bound attribute, then one `transitions` row per transition evaluated,
  in order, with role `guard:true`, `guard:false`, `guard:unknown`, `guard:error` or `guard:none`. Each guard's own
  evidence follows its transition row, as the rule evaluation returned it. `transitions` is a new evidence source,
  added the way section 10 of the condition specification allows.
- `rationale` is diagnostic text, never translated and never rendered as prose.
- Two runs over unchanged facts, rules and machine produce byte-identical records.

Severity is derived as it is for a rule finding: violation high, error medium, unknown low.

## 6. Findings

A record becomes a World Logic finding with the existing statuses, history and review actions. No second lifecycle.

The fingerprint is `CanonFingerprint` over the system id, then: the project or empty, the check, the state id or
empty, the outcome, the error code or empty, the subject id, and for `undeclared_state` the value found. Left out:
the system version, the rationale and guard evidence. So redrawing the canvas, rewording a guard or a guard failing
for a different reason refreshes a finding instead of opening a second one, and a violation that becomes an unknown
closes one finding and opens another, as ADR 0072 already has it.

A finding names the system, the state and the subject. How the row stores that is #360's to settle, because a
finding row requires a rule today and a machine finding has none or several: ADR 0073 records the recommendation.

A sweep that could not read every subject of the bound type is truncated, and a truncated sweep closes nothing.

## 7. Budgets and limits

| Limit | Value |
| --- | --- |
| `maxStates` | 64 |
| `maxTransitions` | 256 |
| Machines per system | 1 |
| Subjects read per machine per run | `maxQueryRows` of the condition specification (2,000) |
| Guard evaluations per subject | Bounded by `maxTransitions`; each is one rule evaluation under the condition budgets |

Guard results are memoised per subject and rule within a run, so two transitions sharing a guard evaluate it once.

## 8. Contradictions

Two systems may bind the same type and attribute with different states. Both are checked and both report. Nothing
picks a winner, exactly as contradicting rules are kept (condition specification, section 5.3).

## 9. What version 1 does not do

- **It does not know where a subject came from.** A condition reads current facts only (ADR 0072, known
  limitations), so no check can prove that a subject in state B was in state A before. `fromStateId` is what the
  author drew and what a reader sees; the check for B asks only whether any way into B holds now. A guard should
  therefore state what is true of a subject that arrived by that transition, not what was true before it left.
- It does not check the order of events, timers, or how long a subject stayed in a state.
- No parallel, nested or history states. One attribute, one value, one state.
- A state is a `text` value. A number or a reference is not a state.
- A renamed type or field unbinds the machine silently: its subjects stop matching and their findings close on the
  next complete sweep.

## 10. Extension points

Additive, with no version bump: a new evidence role, a new save refusal, a higher limit. Needing `schemaVersion` 2:
a state read from a relation or an event, more than one initial state, any check that reads `fromStateId`. An older
build refuses a newer document with `schema_version_unsupported`.

## 11. Security

Every id in a machine is resolved inside the universe, and the guard inside the system's project when it has one,
on the same boundary as conditions (condition specification, section 11). The machine routes take the access rule of
the other `/systems` routes.

## 12. Relation to #210

Not a prerequisite. #210 is about a query's `where` clause naming `attributes.<name>`. A machine reads its bound
attribute through the fact source directly, the way an `attribute` operand does, and guards written with `compare`
on an attribute of `self` already save and evaluate. A guard that wants to query other subjects by attribute still
waits for #210.

## 13. Fixtures

`tests/LorEvolve.Api.Tests/Fixtures/WorldLogic/Machines/` holds one document per scenario. It is a subfolder
because `WorldLogicFixtureTests` requires the top of `Fixtures/WorldLogic/` to hold the six condition scenarios and
nothing else, and reads only that level.

| File | Domain | What it is for |
| --- | --- | --- |
| `apprenticeship.json` | Ranks in a craft body | Both checks, two ways into one state, unknown from a missing attribute, a subject outside the machine, a non-text value |
| `case-review.json` | A nonfantasy review workflow | An unguarded transition, a state nothing leads to, `exempt` counting as met, error over false and over unknown, a transition into the initial state |

Each file carries `facts` and `rules` in the condition fixture shape, one `machine` as in section 2, and `cases`.
A case names a subject and the records expected for it, an empty list meaning none. #360 adds the test that runs
them; they are written first so they are evidence about the implementation and not a description of it.
