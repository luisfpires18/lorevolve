# ADR 0010 - Canon conflicts are derived findings keyed by a fingerprint

Status: accepted (2026-09-08), amended 2026-09-14 (a finding carries the ids its fingerprint hashes - ADR 0032)

## Context

Canon Integrity finds problems in lore: a relationship marked Canon whose endpoint is
still a Draft, a settled moment resting on a character that is not settled. Detection has
to run repeatedly, because the lore it reads changes under it, and each run has to decide
what to do about the problems it already recorded on the last one.

Two things make that awkward. Nothing about a finding is authored, so there is no natural
key to match one run's findings against another's; and a conflict points at heterogeneous
records - an entity, a relationship, a timeline entry, a field - which no single foreign
key can express.

Getting the first wrong duplicates every conflict on every run, or silently loses the one
piece of state the author does own: that they have already seen a problem and chosen to
live with it.

## Decision

**Conflicts are derived, never authoritative.** LorEvolve records that something looks wrong
and changes nothing about the lore it describes. The whole table is regenerable from the
lore by evaluating again, apart from the author's dismissals.

**A fingerprint identifies a problem across runs.** It is a SHA-256 over the rule code and
the ids the finding is about, unique per universe and enforced by the database rather than
by the evaluator looking first. A cryptographic hash, not `GetHashCode`, which is
randomized per process and would give the same problem a different key after a restart.

Only ids go in - never a name, never a wording. So renaming a character rewords its
conflict in place, while a materially different fact opens a new conflict and resolves the
old one.

**One finding per offending fact.** Every rule fingerprints the thing at fault plus the one
record it is at fault over: `(relationship, offending endpoint)`, `(timeline entry,
offending participant)`, `(owning entity, field definition, referenced entity)`. A
relationship with two non-Canon endpoints is two conflicts, because each is separately
fixable and bundling them would put both ids in one key - promoting one endpoint would then
change the fingerprint and throw away whatever the author had decided about the other.
`CANON-FIELD-001` uses the *field definition* rather than the stored value row, whose id is
rewritten every time the entity is saved, and the referenced entity, so repointing a field
from B to C is a new conflict rather than the old one reworded.

**Three statuses, and evaluation owns the transitions that follow the lore.**

| Transition | Who | When |
| --- | --- | --- |
| → `Pending` | evaluation | a finding with no stored conflict |
| `Pending` → `Resolved` | evaluation | no longer found |
| `Dismissed` → `Resolved` | evaluation | no longer found |
| `Resolved` → `Pending` | evaluation | the same fingerprint found again |
| `Pending` → `Dismissed` | the author | explicitly, on a live conflict |
| `Dismissed` → `Pending` | the author | explicitly |

A dismissal suppresses an issue that is *currently there*, and only while it is there. It
is not a permanent mute on the fingerprint. While the issue persists, evaluation leaves a
`Dismissed` conflict alone - reopening it on the next run would undo the decision within
seconds. Once the issue is actually fixed there is nothing left to suppress, so the
conflict resolves like any other; and if the very same issue is reintroduced later it
returns as `Pending` rather than being swallowed by a judgement made about the earlier
occurrence.

The author cannot dismiss or reopen a `Resolved` conflict. Both transitions are about a
live issue, and this one is not: dismissing would suppress nothing and be undone by the
next evaluation anyway, and reopening would claim the issue is live when the last
evaluation found it gone. Both answer 400.

**Subjects are a relational reference table, not JSON and not many nullable keys.**
`CanonConflictSubjects` carries `(ConflictId, SubjectKind, SubjectId, Role)`. The role is
part of the key because one record can appear twice in a conflict - the entity holding a
field and the entity it points at are both entities. There is deliberately no foreign key:
the target lives in one of several tables. Only kinds the current rules produce exist:
`Entity`, `Relationship`, `TimelineEntry`, `EntityField`.

## Consequences

- Evaluation is idempotent. A second run over unchanged lore leaves the table exactly as
  the first left it, `UpdatedAt` included, which is what the tests assert.
- A conflict id is stable across evaluations, so a client can link to one and a later run
  will not have replaced it.
- A dismissal is scoped to one fact. Fixing one endpoint of a relationship, or repointing a
  field somewhere else, leaves any other dismissal on that record standing.
- A subject can dangle: deleting lore leaves its subject rows until the next evaluation,
  and the API returns a null name for one rather than resolving outside the universe. Both
  lookups and rules are universe-scoped, so nothing crosses that boundary either way.
- Subject names cost one small query per kind present, rather than a projection that would
  left-join four tables per row.
- Severity is recorded but wired to nothing. `High` is defined as logically incompatible
  or structurally impossible, and a later promotion-gate phase will use it to refuse the
  action that introduces one. Nothing blocks yet, and no current rule emits `High`.
- Rules stay ordinary C# registered in one readable list. No DSL, no assembly scan: a rule
  is live because it is listed, not because it happens to implement the interface.
- Evaluation is only ever triggered by an explicit request. Nothing runs it on write, so a
  conflict list is as fresh as the last evaluation and no more.
- **A finding carries the ids its fingerprint hashes** (2026-09-14, ADR 0032). `CanonFinding.FingerprintIds` holds them in
  the rule's order and `Fingerprint` is derived from them, byte for byte the hash it always was, so no stored conflict changes.
  A restore gives every record a new id, and re-applies a backup's dismissals by hashing each restored finding's ids translated
  back to the ones the backup used - which needs the ids, not just the hash.
- **A finding may be identified by a set, and a finding may be about a world rule** (2026-09-15, ADR 0034). `CanonFinding.UnorderedFrom`
  says from which position its ids are a set; the hash puts those in one canonical order itself, so the same set is the same key
  under any ids - which is what keeps a dismissal re-applicable after a restore. Null is the ordered hash, byte for byte, so no stored
  conflict changes. `CanonSubjectKind.WorldRule` (4) is the fifth subject kind, named only while the rule is live, as an entry is.
