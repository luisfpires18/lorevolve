# ADR 0034 - A world rule may carry one explicit check, counted against the explicit details of Canon moments

Status: accepted (2026-09-15)

## Context

A world rule is words, and its words mean nothing to LorEvolve (ADR 0033). Phase 4's second step makes the first kind of rule
machine-checkable against the timeline. The owner approved exactly one pattern: *at most N occurrences per participant using a
specified method* - "a person may be resurrected by Method A at most once" - checked against what the timeline records, and
reported through Canon Integrity (ADR 0010).

The hard constraint is the one ADR 0033 set: no meaning may come from prose. A rule titled "One resurrection per person" and a
moment titled "Krillin revived" say nothing computationally. Meaning exists only where an author states it explicitly, on the
rule and on the moments. The tests use invented names for the same reason: nothing in LorEvolve knows any particular world.

The second constraint is honesty about what cannot be known. Canon findings are conflicts, and a missing participant or a
half-described moment is not a conflict - but it is not proof that a rule holds either.

## Decision

### Explicit semantics only

Two things, and nothing else, give a check meaning: a rule's stored check, and a moment's stored details. Nothing reads a rule's
title or description, a moment's title or description, the entries linked to a moment, a relation kind's name, a story, a scene,
a manuscript, plot or an idea. No word is special and no AI is involved.

### The vocabulary: event kinds and methods

`ValidationTerms` belong to a universe (cascading): `Id`, `Kind` (`EventKind` or `Method`, fixed at creation), `Name` (trimmed,
80 characters), `NormalizedName` (trimmed, composed, upper-cased) and the two moments. Names are unique per universe and kind on
the normalized form, by index.

A table rather than free text, because "the same method" has to be an identity, not a string comparison: two moments use the same
method only because they name the same term id. Renaming a term changes no match, and a near-duplicate that would silently split a
count cannot be created. A table rather than an enum, because the vocabulary is the author's. Deliberately flat - no hierarchy, no
description, no method that belongs to one event kind: a rule names the pair.

`/api/universes/{u}/validation-terms`: `GET` (with how many rules and moments name each), `POST`, `PUT /{id}` (rename) and
`DELETE /{id}`, refused with 409 `validation_term_in_use` while any rule - one in the Trash included - or any moment names the term.
Terms are created in place from the rule editor and the moment drawer, and renamed or deleted in a section of the Types screen. No
workspace, no navigation of their own.

### A rule's check

`WorldRuleValidations`, keyed by the rule and cascading from it: `Kind`, `EventKindTermId`, `MethodTermId` (both `NO ACTION`) and
`MaxOccurrences`. At most one per rule; no row is a rule that is words only, and such a rule is never evaluated. The one kind is
`MaxOccurrencesPerParticipantAndMethod`: each participant may have at most `MaxOccurrences` Canon moments of that event kind by
that method.

On the rule's save, `validation` left out keeps the stored check and kind `None` removes it. The check is saved with the words,
under the same stale-save 409 (ADR 0033), and a save changing nothing writes nothing. Both terms must be of this universe and of
their kind; the limit is a whole number from 1 to 10,000; an id from elsewhere and a made-up id are refused in the same words. A
rule's detail carries `validation` (ids, names, limit) and `check` (below); a list row says `hasCheck`.

### A moment's details

`TimelineEntryValidations`, keyed by the moment and cascading from it: `EventKindTermId`, `MethodTermId` (`NO ACTION`) and
`ParticipantEntityId` (`SET NULL`), each optional. A row exists only while some part is set; an ordinary moment needs none, and
the drawer keeps the section folded.

The participant is an entry of the universe chosen on its own. It is not an entry linked to the moment unless the author also
chooses it here, and nothing is taken from the title. A participant already stored and since moved to the Trash is kept through
other edits, and never newly chosen - the idea references' rule (ADR 0030). On a save, `validation` left out keeps the details and
all three parts absent removes them. Read and list responses carry them (null for an ordinary moment), because the drawer edits
from the list. Date, order, links and Canon status are untouched. A moment still has no stale-save protection; the details are
part of the same whole-moment save and do not change that.

### The count

For each live rule with a check, over its universe:

1. Take the moments whose details name the rule's event kind or its method.
2. A moment naming a *different* event kind or method explicitly is another event: not this rule's business.
3. A moment that is not Canon is not counted, as every Canon rule reads Canon only.
4. A Canon moment missing its event kind, its method or its participant, or whose participant is in the Trash, may match but
   cannot be counted.
5. Group the rest by participant id. A participant with more than the limit is over it.

Two queries per universe however many rules exist, reading ids, titles and statuses only. The same count feeds the Canon finding
and a rule's check state, so they cannot disagree (`WorldRuleOccurrences`).

### Three outcomes, and where each is said

Canon findings stay conflicts. No diagnostic category is added and no finding ever says "not enough data" or "all is well".

- **Checked** - every moment that could match was counted. Each participant over the limit is a finding; with none, there is no
  finding and the rule says "Checked."
- **Incomplete** - some could not be counted. A participant over the limit is still a finding: an uncounted moment can only add to
  a count. But the rule never says it holds; it says "Cannot fully check" and names the uncounted moments (the first 20, and the
  total), each with its reason and a link to the moment's editor.
- **Cannot check** - the stored check cannot run: an unknown kind, a limit out of range, a term of the wrong kind or universe. None
  can be saved through the API or a restore; a row that got here another way counts nothing, raises nothing and passes nothing,
  and the rule says why.

The check state is derived when the rule is read. It is never stored and never in a backup. Moments that match but are not Canon
are counted separately and said ("not Canon, and not counted").

### The finding: `CANON-WORLD-001`

**Medium**, as a relationship constraint is (ADR 0023): the limit is the author's own configuration, so a moment that breaks it is
saved and reported, never refused by the promotion gate.

One finding per rule and participant over the limit. The title and explanation name the participant, the event kind, the method,
the rule's title, the count, the limit and each counted moment's title - never the rule's description. Subjects: the rule (`rule`,
the new `CanonSubjectKind.WorldRule`, named only while the rule is live), the participant (`participant`) and each counted moment
(`moment`). The Canon screen links the rule to its page, the entry to its page, and each moment to `timeline?moment={id}`, which
opens that moment in the timeline's own editor; moment subjects of the older rules gain the same link.

**Identity.** The fingerprint hashes the rule, its event kind, its method, the participant and the counted moments **as a set**.
`CanonFinding.UnorderedFrom` (new, optional) says from which position the ids are a set; those are hashed in one canonical order,
so the same set is the same key whatever ids its records carry - before a restore and after it, where every id is new and sorts
differently. Null is the ordered hash exactly, so no stored fingerprint changes. A different rule, event kind, method, participant
or set of moments is a different finding: a moment added to an over-limit set opens a new finding and resolves the old one, so a
dismissal made about two moments does not silently cover a third. The limit is not an id, so changing it rewords or resolves the
finding; renaming anything rewords it in place.

### When Canon is reconciled

The existing mechanism, with no second system (ADR 0012). Only saved server state is evaluated.

- Timeline create and update were already gated, and the details are part of that write; delete was already recorded.
- World rule create, update, delete and restore reconcile in the same transaction **only when the rule has or gets a check**; a rule
  that is words only reconciles nothing, exactly as before.
- A term rename is recorded, because findings quote term names. Creating or deleting a term changes no finding.
- Entry trash and restore were already recorded and gated. A restore evaluates the new universe, as ever.

### Trash

A rule in the Trash is not checked: deleting a rule with a check resolves what it found, and restoring it finds it again under the
same fingerprint. Moments have no Trash: deleting one takes its details. A participant in the Trash makes its moments uncounted,
named on the rule and absent from every finding, so nothing about it leaks into Canon; restoring the entry brings the finding back.
A term a rule in the Trash still names cannot be deleted, as a type a trashed entry uses cannot (ADR 0015).

### Backup format version 13

`payload.validationTerms` (id, kind, name, moments; event kinds first, each by name and id), `worldRules[].validation` (kind,
`eventKindTermId`, `methodTermId`, `maxOccurrences`) and `timelineEntries[].validation` (`eventKindTermId`, `methodTermId`,
`participantEntityId`) - ids and numbers only; the normalized name, check states and findings other than dismissals are not
carried. **A bump**, by ADR 0014's test: relationship constraints were added within version 4 because a reader skipping them lost a
check and nothing authored, but term names are authored and a moment's details are recorded facts no one derives again, so a
version 12 reader would restore a world with all of them silently gone. The importer is taught the same version (ADR 0032
amendment). Every version 1-12 file restores holding none.

### Migration

`AddRuleValidation` creates the three tables and their indexes. No existing table is rebuilt and no trigger is touched; every rule
written before it is words only and every moment has no details. Rolling back drops the three tables, discarding terms, checks and
details, because the schema before had no room for them.

### Ownership

Every route proves ownership first and answers another account's universe, another universe's row and a guessed id with the same
404. Every term and participant id is resolved inside the universe and by its kind before it is stored, a restore can only
reference rows of the file it validated, and every count and finding is scoped to one universe.

## Deliberately unsupported, and deferred

- Any second pattern; conditions, operators, comparisons, AND/OR trees, a DSL, scripting or formulas; actions or consequences;
  priorities; dependencies between rules; simulation.
- **The node or tree rule builder the owner floated.** Not decided and not started; the stored check is a closed kind with typed
  columns, so a builder later adds kinds rather than re-meaning this one.
- Reading any words for meaning, AI, and inferring moments from stories, scenes, manuscripts or ideas.
- Term descriptions, hierarchies, merging, scoping a method to an event kind, and bulk-assigning details to many moments.
- A diagnostic "cannot check" category in Canon.
- Stale-save protection for moments; counts of terms and checks in the restore preview.

## Consequences

- Canon Integrity has nine rules. A gated timeline write costs the new rule's two queries twice, and a words-only rule's save costs
  nothing new.
- A finding's identity can now include an unordered set; any future rule identified by a set uses `UnorderedFrom` rather than
  sorting ids itself, or its dismissals will not survive a restore.
- Backup format version 13; the importer reads 1-13.
- A check is only as complete as the details authors record, and the rule says so rather than guessing.
