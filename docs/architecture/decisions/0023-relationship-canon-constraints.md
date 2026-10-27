# ADR 0023 - A relationship type may carry explicit Canon constraints, checked on the stored direction

Status: accepted (2026-09-13)

## Context

A relationship type is a pair of authored words (ADR 0008). "Parent of" suggests its source is the
older of the two, and an author wants Canon Integrity to notice a parent born after the child. But
LorEvolve does not read words for meaning anywhere: what a field means is a closed enum the author picks
(ADR 0011), and which way an era counts is configured rather than read from "Before" (ADR 0022).

Three shapes were available. Infer the rule from the type's name - rejected outright: it fails in
any other language, on "Master of" and "Ancient predecessor", and on the author who meant something
else. A general rule language on the type - a DSL, a builder, stored expressions - is a large trust
surface for a handful of useful checks. Or a small closed set of typed constraints the author turns
on, each with one meaning LorEvolve can check deterministically.

## Decision

**The type owns its constraints, as typed columns.** `RelationshipTypes` gains `AgeOrder` (`None`,
`SourceOlder` or `SourceYounger`, stored as an integer), `MinAgeDifferenceYears` and
`MaxAgeDifferenceYears` (nullable integers). The defaults are no rule, so every existing type and
universe behaves exactly as before. Typed columns rather than JSON, for ADR 0007's reason. The API
carries them as one `canonConstraints` group; on an update a missing group leaves them as they are, so
a client that predates constraints cannot wipe them by saving a rename.

**A name has no semantic authority.** Nothing reads a type's name, a field's name or an era's name to
decide whether anything is checked. A type called "parent of" with no constraint is checked against
nothing; one called "banana" with `SourceOlder` is checked exactly as "parent of" would be.

**Direction is the stored direction.** Source, then type, then target, as the row is stored (ADR 0008).
The inverse reading and the entry a link is shown from are presentation, so a link is judged once per
row and cannot produce a second finding for being visible from both ends. A symmetric type says
neither end is special, so it may not carry an age order - that would depend only on which entry the
author happened to pick first - and a request that sets one, or turns a type symmetric beneath one, is
refused. A symmetric type may carry a gap, which has no direction.

**Two rules, both Medium.**

| Rule | Reports | Fingerprint |
| --- | --- | --- |
| `CANON-REL-002` | Under `SourceOlder` the source was born strictly after the target; under `SourceYounger`, strictly before. | Relationship, type, the entry that must be older, the entry that must be younger. |
| `CANON-REL-003` | The gap between the two birth years is below the minimum or above the maximum. | Relationship, type, source, target. |

Ids only, as ADR 0010 requires, so a corrected year rewords or resolves a conflict. Reversing the link
or flipping the order makes a different entry the one at fault, which is a different fact. The gap is
absolute and independent of the order, so a link can break both, as two separately fixable conflicts.

Medium, not High. The lifespan rules are High because dying before being born is impossible in any
world. A constraint is something an author wrote on a type, and LorEvolve cannot tell a law of that world
from a convention of the author's without reading the name - the one thing this decision forbids. So
a breach is a likely inconsistency, reported and never refused.

**Authored contradictions are stored, then reported.** Creating or editing a link that breaks its
type's rule, editing a birth year into a breach, and configuring a rule existing links already break
are all accepted. Relationship and relationship-type writes already reconcile (ADR 0012's
`RecordAsync`), so the conflict appears as the write lands. Configuration validation checks only the
constraints' own shape: a known order, whole years of 0 or more, a minimum not above the maximum -
refused, never swapped, because which number was mistyped is the author's to say - and no order on a
symmetric type. Contrast ADR 0022, where a chronology change re-places dated facts and is gated. A
constraint re-places nothing; it changes the rule being checked.

**Birth years, through the one chronology.** Both rules read declared `BirthYear` values through
`CanonLifespanReader`, placed by `UniverseChronology` - the same points the lifespan rules and the
timeline compare. Order is `ChronologyPoint` comparison. The gap is
`UniverseChronology.YearsBetween`, the chronology domain's own answer:

- the plain reckoning, or two years in one era: the difference of the direction-signed years
  (AF 2 to AF 20 is 18, BF 20 to BF 10 is 10);
- an era counting down into the very next era, when that one counts up: `a + b - 1`, because the
  earlier era ends at its year 1 and the later begins at its year 1 with no year 0 between (ADR 0022),
  so BF 5 to AF 5 is 9;
- anything else: unknown. Eras store an order and a direction and no length, so a span that passes
  the end of an ascending era or the start of a descending one contains a stretch of unrecorded
  length. The gap rule stands down; the order rule needs no distance and still speaks.

Year precision only. "8 years apart" is between birth years and never claims an exact age. It stays
provable: two years 8 apart are less than 12 years apart however the birthdays fall.

**Insufficient data stands down.** A missing birth year on either end, an end that is not Canon or is
in the Trash, a link that is not Canon, a year with no era on a universe that names eras, equal birth
years for an order, an unmeasurable gap - each produces nothing. No "missing birth year" finding is
invented: Canon Integrity reports contradictions, not incomplete metadata.

**Backup: additive within version 4.** `relationshipTypes[]` carries `ageOrder` (by name),
`minAgeDifferenceYears` and `maxAgeDifferenceYears`, always written. A reader that ignores them loses
the checks and misreads no year, link or entry, which is ADR 0014's test for not bumping. Absent, in a
file written before them, means no constraint.

**No history.** Relationship types have no revisions (ADR 0013 covers entries), and this adds none.

## Deferred

- **Life-state constraints** - a source or target alive at the relationship's date. A relationship's
  `StartDate` and `EndDate` are real-world UTC timestamps (ADR 0008), not points on the universe's
  chronology, so there is no deterministic relationship date to compare with a birth or death year.
  They need dated relationships or relationship events first, and are not approximated from today,
  the creation time, timeline order or the entities' own dates.
- **A gap across eras of unrecorded length.** Needs era lengths or anchors in the chronology
  configuration, not arithmetic in Canon.
- Arbitrary rule expressions, a DSL or rule builder, transitive inference ("a parent's parent"),
  species lifespans, and creating or correcting links automatically.

## Consequences

- An existing universe gains no finding from the migration: the columns default to no rule, and
  `RelationshipConstraintMigrationTests` walks it down and back up over real lore on a file.
- One configuration write can open or resolve conflicts on every link of a type at once. That is the
  intent, and the conflict table follows it immediately.
- Each rule costs one relationship query when nothing is constrained, and two more - eras and declared
  years - when something is: per evaluation, never per relationship.
- ADR 0012's table still holds: no High rule reads a relationship or a relationship type, so both stay
  reconciled and ungated. Were a constraint ever made High, relationship create and update would move
  to `RunAsync`, and the type update would first need an answer to whether changing a rule counts as
  introducing a contradiction.

## Amendment - a family meaning sits beside these constraints (2026-09-16)

`RelationshipTypes` now carries a second piece of explicit configuration, `FamilySemantic` (ADR 0035), and the
two are independent. A kind may have an age rule, a family meaning, both or neither; configuring one never
changes the other, and a link of a family kind is checked by `CANON-REL-002` and `CANON-REL-003` exactly as any
other link of a kind that carries those rules. What the two share is this decision's central rule, which now
covers both: **a name has no semantic authority**. "Parent of" orders nothing and is no family link until
someone says so, and a kind called anything at all with either configuration is read exactly as configured.

`CANON-FAMILY-001` joins the two rules above as a third Medium relationship rule, so the conclusion above still
holds: no High rule reads a relationship or a relationship type, and both writes stay reconciled and ungated.
