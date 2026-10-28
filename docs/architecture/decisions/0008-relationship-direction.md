# ADR 0008 - A relationship is one row, read from either end

Status: accepted (2026-09-07)

## Context

Lore is full of links: Aragorn rules Gondor, Arwen is married to Aragorn, a house is a
child of another house. Each link has to appear on both entities, and on the target it
has to read the other way round. Gondor's page should say "ruled by Aragorn", not
"rules Aragorn".

Two shapes were available. Store the link twice, once per direction, so each entity owns
its own row. Or store it once and turn it around when reading.

## Decision

One row per link.

`LoreRelationship` holds a source, a target, and a `RelationshipTypeId`. The type is
universe-scoped and authored: `Name` is the forward reading ("rules"), `InverseName` is
the reverse reading ("ruled by"), and `IsSymmetric` marks a type that reads the same
from both ends ("married to"), where a second wording would be meaningless and is
stored as null.

The reverse reading is derived at read time, never persisted. Listing an entity's
relationships resolves the perspective on the server: a row where the entity is the
target comes back with `Perspective = Inverse`, the inverse wording already in `Label`,
and the other end as the related entity. The stored source and target still travel with
each row, so it stays editable in place.

Dates are optional UTC `DateTime` values, matching the rest of the schema. `EndDate` may
not precede `StartDate`. No fantasy calendars.

## Consequences

- A link cannot contradict itself, because there is no second row to disagree with.
- Deleting a relationship removes it from both entities at once. So does deleting either
  entity, which cascades.
- A relationship type cannot be deleted while relationships use it; the API answers 409
  rather than erasing the links it describes.
- Reading an entity's relationships touches both the source and target indexes. That is
  the cost of storing once, and it is paid by an index on each end.
- Turning a type symmetric drops its inverse name. Turning it directional again means
  supplying a new one.
- Relationships carry no custom fields. If they ever need them, the entity field model is
  the shape to copy, not JSON.

## Amendment - a kind may say its links are parent links (2026-09-16)

A relation kind may carry a family meaning - biological or adoptive parent - which is the only thing a family
tree reads (ADR 0035). Nothing in this decision changes. There is still one row per link, the reverse reading
is still derived from `InverseName` at read time, and the stored direction is still the one direction anything
is judged on: the meaning says the source is the parent and the target the child, so no second "child of" kind
is needed to write a link from the child's side - the kind's own inverse name is what reads it back that way.
A symmetric kind may not carry a family meaning, for the reason it may not carry an age order (ADR 0023): it
says neither end is special. The family tree reads these rows and writes none of its own.

## Amendment - one link, stored once (2026-09-22)

Found by using LorEvolve to migrate a real world into it: the same biological parent link could be recorded twice -
once in an entry's Relations, once from the family tree's Add family connection - and the tree then showed the
same child twice. Two rows, one connection, and nothing refused either.

**What makes two links the same link.** The kind between the same two ends the same way round: `UniverseId`,
`RelationshipTypeId`, `SourceEntityId`, `TargetEntityId`. Read from ids alone, never from a kind's wording,
which means nothing here for the reason it means nothing to a family tree or an age order.

Everything else a link carries describes that one link rather than telling it from another. Its Canon status is
how settled it is, and one link cannot be both settled and not. Its notes are what is worth remembering about
it, and the same connection recorded twice with different notes is one connection whose notes were split in
half. Its dates are the span it held, and a link that resumed is an edit to that span rather than a second
edge - which is also why the dates are deliberately out of the key: leaving them in would let the very
duplicate this refuses through, by typing a date into one of them.

Two links between the same pair stay legal whenever anything in that key differs: a second kind ("raised"
beside "bore", "commander of" beside "member of"), two kinds that happen to carry the same family meaning
("mother of" and "father of"), or the other direction for a kind where direction means something. The one place
direction does not mean anything is a symmetric kind, whose two readings are one sentence and which this
decision stores once for exactly that reason - so for one of those, the reversed pair is the same link and is
refused too.

**Where it is enforced, and why not in the database.** On the relationship routes, for creates and for edits
alike: an edit that re-points one end or changes the kind can arrive at a copy of its neighbour just as surely
as a create can. Both answer 409 with the code `relationship_already_exists` and the id of the link that is
already there, so a client can offer to open the one the author meant. That covers every way a relationship is
ever created - an entry's Relations, the family tree's Add family connection, and a request written by hand -
because all three post to the same route.

Not a unique index, and this is the trade. Every database written before this rule may already hold duplicates
that an author authored, and a migration adding the index would fail against exactly those databases. The only
way to make it fit is to delete rows a person wrote, which is not ours to do. A restore is the same argument
from the other side: a backup from v1-v14 may carry duplicates the importer accepted at the time, and it still
restores exactly as it did, because the restore writes rows rather than posting to this route. So the route is
the rule. The cost is bounded and stated: two creates racing each other can both read no duplicate and both
write, on a database SQLite gives one writer and one person is authoring into.

**What already exists is left alone.** No migration, no cleanup, no backup format change - this adds no authored
field. A duplicate already stored is a stored row like any other: both are listed in Relations, both are
editable, and either can be removed, by the author, deliberately. The one thing that changes for them is the
family tree, which collapses links that say the same thing when it derives a family, so a duplicate is drawn
once and a child is listed once. That is a read, decided the same way on every read, and it deletes nothing.

## Amendment (2026-10-24, Issue #18, ADR 0051)

A link may hold during periods (`RelationshipPeriods`): dated spans on the universe's chronology or eras of either end. They
are part of the one row - a link that ended and resumed is a second period, never a second row - so the duplicate refusal
is unchanged. The real-world `StartDate`/`EndDate` keep their meaning and are no longer offered by the client.
