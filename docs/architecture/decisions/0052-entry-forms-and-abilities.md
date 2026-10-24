# ADR 0052 - An entry's forms and abilities are available exactly in the eras the author ticks

Status: accepted (2026-10-24). GitHub issue 42, under parent issue 30. Amends ADR 0014 (backup version 29) and ADR 0050 (the
progression carries forms and abilities).

## Context

Characters transform, reach stages and unlock abilities over a story. Issue 42 asks for forms and abilities on the same entry,
with when each was first unlocked and the eras it can be used in, kept apart from eras (ADR 0050) and from relationships
(ADR 0051). The owner settled (2026-10-24): availability is explicit per era - a "this and every later era" shortcut writes
explicit rows; the first unlock (an era, a scene, a timeline moment, each optional) is separate; the scenes it is used in are
separate again and never checked against availability; a form carries no field overrides.

## Decision

**Part of the progression aggregate.** Forms and abilities belong to the entry's progression: saved by the same
`PUT .../entities/{id}/progression` (`forms`, `abilities`; a list left out keeps what is stored), under the same version and
the same snapshot history and restore. No new route, no second identity, no copy of the entry.

**A form** (`EntityForms`) has a name unique within the entry's forms, an optional description, the author's order, a first
unlock and two link sets: the eras it is available in (`EntityFormEras`, eras of this entry) and the scenes it is used in
(`EntityFormScenes`, scenes of the universe). **An ability** (`EntityAbilities`) is the same, plus the forms it belongs to
(`EntityAbilityForms`, none, one or several of this entry's forms). At most 50 forms and 100 abilities an entry.

**Nothing is inferred.** Availability is the eras ticked, no more: not from era order, not from the first unlock, not from a
scene. The first unlock's three parts are independent - an era of this entry, a scene, a timeline moment - and none fills in
another. A scene it is used in may lie outside every era it is available in; nothing says so. The client's shortcut ticks the
unlock era and every later era once, as ordinary ticks.

**A form changes no field.** What an entry's details read in an era is still ADR 0050's rule alone.

## Consequences

- An era read shows the forms and abilities ticked for it, marking the ones first unlocked there.
- Removing an era removes it from every form's and ability's availability and unlock only when the save sends them so; a save
  that leaves them out while they name the era is refused (`forms[i].eraIds`, `forms[i].unlockEraId`), never changed silently.
  The client sends them stripped, after saying so in the confirmation.
- Removing a form takes it out of the abilities that belonged to it the same way.
- Scenes and moments are of the universe and not in the Trash when chosen; one already linked stays linked while in the Trash,
  marked. Deleting one for good drops it from the link sets and clears an unlock naming it.
- Backup version 29 carries forms and abilities with the progression; a restore gives each a new id and translates the
  snapshots. A version 28 or older file restores every entry with none.
- Not public, not searched, not read by the assistant, MCP or AI changes.
