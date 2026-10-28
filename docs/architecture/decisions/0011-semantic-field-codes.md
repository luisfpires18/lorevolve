# ADR 0011 - A field declares what it means, in a closed enum, on Number only

Status: accepted (2026-09-08), amended 2026-09-13 (a declared year may carry an era: ADR 0022)

## Context

Phase 011's Canon Integrity rules were all structural. They read canon status on records
the model already links - a Canon relationship resting on a Draft endpoint, a Canon moment
with a Draft participant - so they never had to know what any field was *about*, and they
work on types the author invents without knowing a single one of them.

Chronology cannot be found that way. To say that a character dies before it is born, or
that it attends a battle a century after its death, LorEvolve has to know which of an author's
custom fields is the birth year and which is the death year. Nothing in the model said so.

The obvious shortcut is to match display names: look for a field called "Birth Year". It
is wrong in every direction. Authors write "Born", "b.", "Geburtsjahr", "Year of Birth",
or nothing like any of them; a rename would silently switch a rule off, and a coincidental
name would silently switch one on. Fields are the author's, not LorEvolve's, and a matcher
turns every one of them into a guess. Inferring meaning with a model is worse: Canon
Integrity's whole claim is that it is deterministic and provable, and a rule that fires
because a model thought a field looked like a birth year is neither.

## Decision

**Meaning is declared, once, on the field definition.** `EntityFieldDefinition` gains a
nullable `EntityFieldSemantic`. Null is the normal case and the default: an ordinary custom
field means nothing to LorEvolve, and nothing infers otherwise. Nothing about a field's name
reaches a rule except as wording in the explanation shown to the author.

**A scalar column, not JSON.** The value is a nullable integer on the definition row, so
rules join on it in SQL and the database can enforce a constraint over it. This follows
the same rule the rest of the model does - typed columns for anything queryable, JSON only
for the Tiptap article.

**A closed enum, three members, grown one at a time.** `BirthYear`, `DeathYear`, `Age`.
This is deliberately not an ontology and not a taxonomy system: it is the vocabulary the
chronology rules need. A member is added when a rule needs it, not in anticipation.

**Every member is a Number, and the years are years.** The rest of LorEvolve counts fictional
time as signed integer years, not `DateTime` - see ADR 0009. `EntityFieldValue.DateValue`
is a Gregorian `DateTime` and does not compare with a universe's own calendar, so there is
deliberately no `BirthDate` or `DeathDate` member and a year meaning is refused on any
field kind but Number. The narrower vocabulary is the honest one.

**At most one field per type may claim a meaning.** A rule asking for "the birth year"
must not have two answers. Enforced at the edge with a readable validation error and again
by a filtered unique index on `(EntityTypeId, Semantic)`, so a race cannot get past it.
Filtered, because the ordinary case is a type with several semantic-free fields.

**`Age` is declarable but no rule reads it.** An age is a claim about a moment - "89" is
only meaningful alongside when it was true - and nothing in the model says which moment.
A rule that assumed a current year would be inventing a fact. The member exists so the
meaning can be recorded now; the rule waits for a structured reference year to exist
(see Consequences).

## Consequences

Rules that read meaning are as robust as rules that read structure. Renaming a field
rewords a conflict and never changes whether it is found; translating a whole universe's
field names changes nothing at all.

Nothing happens by accident. A universe that has declared no meanings gets exactly the
Phase 011 behaviour, and no universe declares one without being asked to.

The declaration is an author's, made in one place. The Types screen offers a **Canon
meaning** control - None, Birth year, Death year, Age - on the field being added and on each
existing field that can carry one, so declaring, changing and withdrawing a meaning are all
reachable there and nowhere else in the client. It appears only for kinds that may hold a
meaning, so the client cannot assemble a pair the API would refuse; everything the API does
refuse - a second field claiming the same meaning, a declaration the promotion gate blocks -
surfaces as an ordinary error on that screen.

The vocabulary is a commitment. Semantic codes are persisted and rules key off them, so
removing or renumbering a member is a migration, not an edit. Adding one is cheap.

An age rule needs a structured way to say when an age was true - a reference year on the
fact, or an age recorded against a timeline entry rather than against the entity. Neither
exists, and neither should be invented to make one rule possible. Until then LorEvolve records
that a field is an age and reasons about nothing.

Exclusive-relationship overlap was considered for the same phase and dropped.
`RelationshipType` carries a forward name, an inverse name and a symmetric flag, and
`LoreRelationship` carries no interval at all, so there is nothing to overlap and no way to
say a type is exclusive. Detecting it would mean inventing schema for a rule rather than
the other way round.

Era bounds the rules on the plain reckoning. There a declared birth year names no era, so
comparing it to a moment labelled "Second Age" is not sound, and the chronology rules stand
down entirely for a universe whose timeline uses more than one free-text label - correct but
blunt. *Amended 2026-09-13:* a universe that names its eras is no longer bounded this way. A
birth or death year there is still a Number, and carries the era it is counted in as metadata
on the value; the rules place it and the moment on the same ordered line and compare them
(ADR 0022). A year written before the eras existed carries none, and proves nothing until it does.
