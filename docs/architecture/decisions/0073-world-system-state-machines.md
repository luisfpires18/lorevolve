# ADR 0073 - A World system may carry one state machine whose guards are existing rules

Status: accepted (2026-11-17)

## Context

A World system is a name, a summary and a set of rules (ADR 0072). A rule's condition is a typed tree that only a
connected AI app or the API can write, and the web app shows a system as text. The owner asked for a visual way to
say how a system works, and chose a state machine (tracker #363).

Three forces shape the decision.

The condition model is new and it works. It has a specification, six fixtures, an evaluator, persisted findings and
MCP tools. A machine that brought its own expression format would double all of that.

A condition reads current facts and no history (ADR 0072, known limitations). A state machine is, in the usual
sense, a statement about history: you may be in B only if you came from A. That cannot be checked today.

The platform is domain-neutral. A machine cannot know what a rank, a phase or a stage is.

## Decision

Full contract: `docs/architecture/world-logic-state-machine-spec.md`. In short:

1. **One machine per system, bound to one subject type and one attribute.** Each state is one `text` value of that
   attribute. The binding is two names, the way a condition already names a type and an attribute.
2. **A transition's guard is an existing rule, by id, or nothing.** No inline condition, no new node kind. The guard
   keeps its versions, revisions, exceptions and evaluation route. A rule used as a guard cannot be deleted.
3. **Two checks, both over current facts.** A subject holds a value that is no declared state. A subject sits in a
   non-initial state and none of the transitions into it has a guard that holds. Incoming transitions combine as
   `any` does in the condition specification; `exempt` counts as met.
4. **A subject without the attribute is outside the machine** and produces nothing.
5. **Records become ordinary World Logic findings**, with the existing statuses, history and review actions.
6. **The machine is saved whole**, with the system's version as its stale-save check.
7. **#210 is not a prerequisite.** A machine reads its attribute directly, and `compare` on an attribute of `self`
   already works in a guard.

## Consequences

- The canvas (#358) draws something the evaluator can already check. The guard builder (#359) is the first
  condition editor in the web app, and what it writes is a plain rule usable anywhere a rule is.
- The sweep (#360) gains two checks and no new outcome, status or list.
- A finding row requires a rule today. A machine finding has none (`undeclared_state`) or several
  (`no_transition_holds`). Recommended for #360: make `WorldLogicFinding.RuleId` nullable and add a side table
  naming the system, the state and the subject. Findings hold the author's dismissals, so the table is migrated, not
  dropped; a SQLite rebuild of it needs its own rollback test. This relaxes the "new tables only" line written on
  #360, and needs the owner's word before #360 starts.
- Backups carry the machine (#357). An older backup restores with no machine.

## Known limitations

- **The From end of a transition is not checked.** The check for a state asks whether any way into it holds now,
  not whether the subject was in the transition's source state before. The drawing shows the intended path; the
  checker proves less than the drawing says. This is the main thing the owner should weigh. Closing it needs facts
  with history, which is a change to ADR 0072's fact model and not to this one.
- No event order, timers, or parallel and nested states.
- A state is a text value. One attribute per machine.
- Renaming the bound type or field unbinds the machine silently, as it breaks a condition that named it.
- Two machines over the same attribute may disagree; both report and nothing reconciles them.

## Alternatives not taken

- **A block builder alone.** A nicer form over the same rules. It adds no meaning, and it is child #359 anyway.
- **A rule dependency graph.** Useful, mostly frontend, and can reuse the canvas later. It shows how rules relate,
  not how a system behaves.
- **Guards as inline conditions on the transition.** A second place a condition lives, with its own versions and
  its own MCP surface, for nothing a rule id does not already give.
- **A state derived from relations or events.** More expressive, and each needs a selector language the condition
  query only partly has. Left for `schemaVersion` 2.
