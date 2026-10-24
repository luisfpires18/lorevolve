# ADR 0014 - A backup is one versioned archive holding a universe's authored data

Status: accepted (2026-09-09), amended 2026-09-10 (version 3: the file became an archive),
2026-09-11 (type icon keys, and a short-lived image framing member, both within version 3),
2026-09-13 (version 4: a universe's eras), 2026-09-13 (relationship type Canon constraints,
within version 4), 2026-09-13 (version 5: stories), 2026-09-13 (version 6: chapters), 2026-09-13
(version 7: plot), 2026-09-13 (version 8: scene prose), 2026-09-13 (version 9: entry articles and their
history), 2026-09-14 (version 10: story content in the Trash, and a manuscript's saved versions), 2026-09-14 (version 11:
the ideas that belong to a universe), 2026-09-14 (a backup can be restored - ADR 0032; the format is unchanged), 2026-09-15
(version 12: a universe's world rules - ADR 0033), and 2026-09-15 (version 13: world rule checks, event kinds and methods, and a
moment's validation details - ADR 0034)

## Context

Lorex is private, single-owner and runs on the author's own machine against a SQLite file
(ADR 0002, ADR 0006). The only copy of a world is that file, and nothing in the product has
so far let an author take one away with them.

Copying the database is not a backup of a universe. It carries every universe, every
account, the Identity tables and whatever the installation happened to be configured with,
and it is readable only by the exact schema version that wrote it. What an author wants is
their world, portable, and checkable by eye.

The hard part is not serialising rows. It is deciding which rows are a world.

## Decision

**One file, universe-scoped, JSON at its centre.** JSON is the interchange format here, not
general-purpose storage, so ADR 0007's objection to JSON in the database does not apply. The one
JSON that is already stored as JSON, the Tiptap article, travels as the exact string the column
holds, never re-parsed and re-emitted, so it round-trips byte for byte.

**Version 3 (2026-09-10) makes that file an archive**, because there is now something to put
beside the data. This decision originally read "no archive: there is nothing to put beside the
data - media is not in the product". Entry images made that false (ADR 0019), and the premise
went with it. A backup that named pictures living in a Cloudflare bucket would stop being a
backup the moment the bucket did - which is precisely the moment a backup is for - so the
pictures travel with the lore:

```
backup.json
media/entities/{entityId}/original.{jpg|png|webp}
```

`backup.json` is exactly the document this ADR has always described. Each entry's `image`
carries the identity and shape of its picture and the archive-relative `mediaPath` where the
bytes sit. What it deliberately does not carry is the object key, the bucket, the endpoint or a
URL: those are how *this installation* reaches the file today, they mean nothing on another
machine, and a restore does not need any of them. The download is `application/zip`, named
`lorex-<slug>-<date>.zip`.

**Only the original, never the thumbnail.** A thumbnail is derived - a square cut from the
original, scaled to a fixed size in a fixed format - so a reader regenerates it from the original.
Carrying one would double the media in every backup and add a second copy that has to be trusted
to match. What *is* carried is the one part of it a person chose: `image.crop`, the square the
author framed, as fractions of the displayed original (ADR 0019). With it, the original and the
recipe give back the same thumbnail byte for byte, and a test proves that from the archive alone.
It is nullable - null means a picture stored before framing existed, whose thumbnail is the
centred square - and a reader that ignores it still restores every picture whole, so adding it is
not a version bump.

Version 3 files written on 2026-09-11, while a "Fit full image" thumbnail briefly existed, may also
carry `image.framing` (`Crop`, or `Fit` with a null crop). The mode was withdrawn and the member is
not part of the format: readers ignore it, so such a file reads like any other version 3 file and a
fitted picture regenerates as the centred square. Nothing a person chose is lost - the original is
in the archive and a chosen crop is still in `image.crop` - so this is not a bump either, and a test
reads both shapes.

Entity types carry `icon`, now always one of the built-in icon keys or null (ADR 0020). Every value a
version 3 file could have been given by Lorex itself is still a key, so that is not a bump either.

**A picture that cannot be read fails the backup.** The archive is assembled whole in memory
before a single byte is sent, so a missing object is a 500 carrying the code
`backup_media_missing` and the entry it belongs to - not a 200 with a smaller file. Streaming
could only have reported it by truncating a download that had already claimed to succeed, and an
archive that quietly left a picture out would break the promise at the exact moment it mattered.
A world with no pictures never touches the object store at all, so it exports whether or not
media storage is configured.

**An explicit envelope, and a version on it.** `format` is `lorex.universe.backup` and
`formatVersion` is an integer, so a reader can refuse a file that is merely JSON, and a
future importer can tell which contract it is looking at. The version is bumped when the
payload's shape or meaning changes in a way a reader must notice.

**Version 2 (Phase 019) carries the Trash.** ADR 0015 made an entry the author removes a
row that is marked rather than deleted, so `BackupEntity.deletedAt` is now part of the
format: null while an entry is live, and the moment it was trashed otherwise. A trashed
entry travels whole - values, aliases, tags, history - and so does everything that points at
it, because a backup that omitted recoverable lore would turn a recoverable mistake into a
permanent one the first time the file was read back.

That is a bump rather than the "nullable member an older reader can ignore" case, and the
distinction is worth stating. The member is nullable and ignorable; what is not ignorable is
what it does to the `entities` collection, whose membership no longer implies an entry is
live. A reader that skipped `deletedAt` would restore an author's Trash into their world as
ordinary lore. That is the "re-meaning" clause above, so `formatVersion` is 2. Nothing about
version 1 changes: a version 1 file still means exactly what it always meant, which is that
every entry in it is live - a fact that was previously true by construction and is now
written down.

**Version 3 carries the media.** It is the largest kind of change a version can announce: a
reader that only knows versions 1 and 2 is handed a file it cannot parse at all, rather than one
it parses and misunderstands. That is exactly what a version number is for.

**Version 4 (2026-09-13) carries the chronology.** A universe may name ordered eras (ADR 0022).
`payload.chronologyEras` holds them - id, name, short label, order, direction, label position -
and a timeline entry's `startEraId` and `endEraId`, a stored value's `eraId`, and a revision
value's `eraId` and `eraLabel` say which era a year is counted in. Each member is nullable, but
together they re-mean the year beside them: a start year of 10 in an era that counts down is not
the signed year 10, and a reader that skipped the era would put it on the wrong line. That is the
re-meaning clause, so it is a bump. A file at versions 1 to 3 names no eras - `chronologyEras` is
absent and reads as null - and every year in it is a plain signed year. Nothing derived from the
eras, such as a formatted date or a sort key, is carried.

Relationship types carry their Canon constraints (ADR 0023): `ageOrder` by name,
`minAgeDifferenceYears` and `maxAgeDifferenceYears`, always written, `None` and two nulls on a type
with none. That is not a bump. The constraints are rules checked against the lore, not lore: a reader
that ignores them loses the checks and misreads no year, link or entry. A version 4 file written before
them lacks all three, and means no constraint.

**Version 5 (2026-09-13) carries stories** (ADR 0024). `payload.stories` holds each story - title,
premise, status - with its scenes nested inside it in narrative order: title, summary, notes,
`sortOrder`, `povEntityId`, `chronology` (`eraId`, `year`, `month`, `day`, or null) and
`linkedEntityIds`. References are ids into the same file, never names. The member is nullable, and
that is the case the rule above calls ignorable only when ignoring it loses nothing an author wrote.
The constraints passed that test - rules checked against lore. Stories fail it: a reader that knew
only version 4 would parse the file and restore a world with every story silently gone, turning a
complete backup into a lossy one. So it is a bump. A file at versions 1 to 4 has no `stories`, which
reads as null and means none.

**Version 6 (2026-09-13) carries chapters** (ADR 0025). Each story gains `chapters` - id, `sortOrder`,
title, summary, notes, timestamps, in story order - and each scene gains `chapterId`, null for
Unchaptered. Scenes stay one list per story, in reading order: Unchaptered first, then chapter by
chapter. Whether this could stay within version 5 was the question, and it fails the test twice. A
chapter's title, summary and notes are authored, so a version 5 reader skipping `chapters` would lose
writing, as it would have lost stories. And `chapterId` re-means `sortOrder`: it is now a scene's place
inside its chapter or inside Unchaptered, so every chapter numbers from 0 again, and a version 5 reader
would find several scenes claiming each place and flatten the story into a wrong order. That is the
re-meaning clause, so it is a bump. No chapter number is carried: it is the position. A version 5 file
has neither member; both read as null, every scene is Unchaptered, and its story-wide `sortOrder` is
exactly its order there.

**Version 7 (2026-09-13) carries plot** (ADR 0026). Each story gains `plotArcs` - id, `sortOrder`, title,
description, notes, timestamps, in order - and each arc its `beats`: id, `sortOrder` inside the arc, title,
description, notes, `linkedSceneIds`, `linkedEntityIds` and timestamps. Both link lists are sorted by id, and hold
ids only: a linked scene's title or chapter and a linked entry's name are already in the file, and a scene that
moved chapter is still the id a beat names. The test is the one version 5 failed: an arc's and a beat's text is
authored, and so is each link, so a version 6 reader that skipped `plotArcs` would parse the file and restore every
story with its plot silently gone. So it is a bump. No arc or beat number is carried. A file at version 6 or
earlier has no `plotArcs`; it reads as null and means a story with no plot.

**Version 8 (2026-09-13) carries scene prose** (ADR 0027). Each scene gains `manuscript`: `content`, the text exactly as
stored, and `updatedAt`, or null for a scene nothing has been written for. It travels with its scene rather than in a file
of its own: it is text, the archive already deflates the document, and a reader then never has to join prose back to the
scene it belongs to. It is the least ignorable member any version has added - the writing itself - so a version 7 reader
would parse the file and restore every scene with its prose silently gone. So it is a bump. Nothing derived from the text
is carried: no word count, no rendering, no copy of the scene's planning. A file at version 7 or earlier has no
`manuscript`; it reads as null and means a scene with nothing written.

**Version 9 (2026-09-13) carries entry articles and their history** (ADR 0028). The article moved into a row of its own
with a history of its own. Each entry keeps `content` - the article as it stands, exactly as stored, null for no article or
a cleared one - and gains `articleUpdatedAt`, when it was last saved (null if never), and `articleRevisions`, every saved
version oldest first: `id`, `number`, `kind`, `restoredFromRevisionId` and the whole document (`""` for a clear). The
question was whether that could stay within version 8, and it fails the test twice. The versions are authored text a
version 8 reader would drop silently - the loss an entry's history would be. And each entry revision's `content` is
re-meant: in version 8 a null there said the entry had no article at that version, and restoring the version applied it;
from version 9 a revision recorded after the move holds no copy of the article at all, so a version 8 reader restoring it
would wipe an article that exists. That is the re-meaning clause, so it is a bump. A file at version 8 or earlier has
neither new member; both read as null, and each revision's `content` is the article as it read then.

A future importer restores an article to the entry of the same id, in the universe being restored and owned by the
importing account - ownership is never in the file. It validates each document as a save does, re-creates the versions
with their ids and numbers, writes no entry revision for any of it, and reindexes search. It never applies a revision's
`content` to the article. (The importer of ADR 0032 does all of this, with each id translated to a new one.)

**Version 10 (2026-09-14) carries story content in the Trash and a manuscript's saved versions** (ADR 0029). Story, chapter,
scene, arc and beat gain `deletedAt`, null while live; each scene's `manuscript` gains `revisions`, every saved version oldest
first (`id`, `number`, `kind`, `restoredFromRevisionId`, `createdAt`, the whole text). Inside each ordered collection the live
rows come first in their order, then the marked ones. It fails the test twice, as versions 2 and 9 did: the markers re-mean
every collection in a story - membership no longer implies live, and a marked row's `sortOrder` is the place it had and holds
none, so a version 9 reader would restore the Trash into the story with two scenes claiming one place - and the versions are
authored text a version 9 reader would drop silently. A file at version 9 or earlier has none of these members: everything in
it is live, and a manuscript has no versions but its text. A future importer restores each marker as it is, places no marked
row in a live order, and re-creates the versions with their numbers - under new ids, ADR 0032 - without ever applying one. A browser's recovery copy
of unsaved writing is never in a backup: it was never saved.

**Version 11 (2026-09-14) carries the ideas that belong to the universe** (ADR 0030). `payload.ideas` holds each idea whose
universe is this one - `id`, `title`, `body` exactly as stored, `createdAt`, `updatedAt`, `deletedAt`, and `references` as
`{ kind, id }` sorted by kind then id, pointing at entries, stories, scenes, arcs and beats in the same file - live ideas
first, then deleted ones, each by title then id. It fails the test the way stories did at version 5: an idea's text is
authored, so a version 10 reader would parse the file and restore the universe with every idea about it silently gone. A file
at version 10 or earlier has no `ideas`; it reads as null and means none. **An idea that belongs to no universe is in no
universe backup**: it is the account's, and this file is one world, not an account export - carrying it in one arbitrary
universe's file would be false. A future importer gives each idea to the importing account and the universe being restored,
re-creates the references whose targets are in the file, keeps `deletedAt`, and never turns an idea into lore.

**Version 12 (2026-09-15) carries the universe's world rules** (ADR 0033). `payload.worldRules` holds each rule - `id`, `title`,
`description` exactly as stored, `createdAt`, `updatedAt`, `deletedAt` - live rules first, then those in the Trash, each group by
title then id. It fails the test the way stories and ideas did: a rule's words are authored, so a version 11 reader would parse
the file and restore the universe with every rule silently gone. Nothing derived is carried - no search index row, and no
validation state, since none exists. A file at version 11 or earlier has no `worldRules`; it reads as null and means none. The
importer reads versions 1 to 12 and writes each rule into the new universe under a new id, its marker and moments kept (ADR 0032
amendment).

**Version 13 (2026-09-15) carries world rule checks** (ADR 0034). `payload.validationTerms` holds the universe's event kinds and
methods - `id`, `kind`, `name`, `createdAt`, `updatedAt` - event kinds first, each by name then id; each world rule gains
`validation` (`kind`, `eventKindTermId`, `methodTermId`, `maxOccurrences`, or null), and each timeline entry gains `validation`
(`eventKindTermId`, `methodTermId`, `participantEntityId`, each nullable, or null). It is a bump, and not the case relationship
constraints were within version 4: those were a check a reader could skip losing nothing an author wrote, while a term's name is
authored and a moment's details record what kind of event it was, by what means and whose, which nothing derives again - a version
12 reader would restore the world with all of it silently gone. Nothing derived is carried: no normalized name, no check state, no
pending or resolved finding; a dismissal is carried as ever, and a restore re-applies it to the finding counted again. A file at
version 12 or earlier has none of these members; each reads as null and means none. The importer reads versions 1 to 13 (ADR 0032
amendment).

**Search indexes are never in a backup** (ADR 0016, ADR 0031). They are derived - Lorex produces them again from the
authored rows - so the universe search (2026-09-14) changed no member and no version: version 11 stands. An importer's rows are
indexed as they are written.

**Restoring reads every version, and changes none (2026-09-14, ADR 0032).** A backup is restored as a new universe, never over
one. The importer reads format versions 1 to 11 - versions 1 and 2 as the single JSON file they were, 3 onwards as the archive -
through these same records, taking each file as its own version defines it and normalizing it into the current shape the way
each migration normalized a live database. A version newer than the importer knows is refused as unsupported, not guessed at;
`BackupFormatSupport.MaxVersion` is held equal to `CurrentVersion` by a test, so a future bump must teach the importer too.
Adding the importer changed no member and no version: **version 11 stands.** The importer never writes a file back. What
this ADR said a "future importer" would do, it does, with one deliberate difference recorded below: ids are renumbered.

**Only the authored data.** The test for inclusion is: did a person write this, or would
Lorex produce it again from what a person wrote?

| Carried | Left out |
| --- | --- |
| Universe name, description, accent, archived flag, timestamps | `OwnerId` |
| Entity types with their icon key, field definitions with their declared `Semantic`, options | - |
| Entries: name, summary, canon status, archived flag, `deletedAt` | - |
| Each entry's Tiptap article as it stands, when it was last saved, and every saved version of it | Any extracted text or search excerpt |
| Aliases, tags, stored values including entity references | Alias and value row ids |
| Relationship types with their Canon constraints, and relationships | - |
| The universe's eras: name, short label, order, direction, label position | Formatted dates and sort keys |
| Timeline entries, their date components, era ids and era labels, participants | Derived date precision |
| Stories; their chapters in order with title, summary and notes; their scenes with chapter, place in it, point of view, chronology and linked entry ids; the Trash among all of them, marked | Any name, type or formatted date of what a scene references, and any chapter number |
| Each story's plot arcs in order with title, description and notes; their beats in order with text and linked scene and entry ids | Any arc or beat number, and any scene title, chapter or entry name a beat points at |
| Each scene's manuscript: its plain text exactly as stored, when it was last saved, and every saved version of it | Any word count, rendering or copy of the scene's planning, and any unsaved recovery copy a browser kept |
| Every entry's revision history (ADR 0013); versions recorded since version 9 hold no copy of the article | - |
| The ideas that belong to this universe: title, body, deleted marker, and references by kind and id | Ideas that belong to no universe or to another universe, any owner id, and any unsaved recovery copy |
| The universe's world rules: title, description, deleted marker and moments | The search index's copy of their words, and any validation state |
| Each entry's primary image: the original bytes, its asset id, filename, content type, dimensions, chosen crop and archive path | The generated thumbnail and its id, and every R2 object key, bucket name, endpoint and URL |
| Canon conflicts the author **dismissed** | Pending and resolved conflicts, and all conflict wording |
| | Tag `Slug` |
| | Identity tables, configuration, connection strings, file paths |

Three of those are the decisions worth stating.

**`OwnerId` is not in a backup.** It names an Identity row that means nothing outside the
installation that issued it. Carrying it would make the file a backup of an account rather
than of a world, and would leak an internal user id into a file the author may share.

**Canon conflicts are rebuilt; dismissals are not.** ADR 0010 already establishes that the
conflict table is regenerable from the lore by evaluating again, apart from the author's
dismissals. So the findings themselves - titles, explanations, subjects, pending and
resolved rows - are left out: they are derived, and a backup carrying stale wording could
disagree with the lore in the same file. A dismissal is the opposite. Nobody re-derives "I
have seen this and I am fine with it", and losing it means every suppressed problem comes
back on the first evaluation after a restore. Each one is carried as its rule code,
severity, fingerprint and the moment it was dismissed. The fingerprint is enough to re-apply
it, because it hashes only the rule code and the ids of the records at fault - and this
backup preserves those ids.

**Ids that identify nothing are dropped.** An alias row, a stored value row and a revision's
child rows all have database-generated keys that nothing references; a value row's key is
rewritten on every save, which is exactly why ADR 0010 fingerprints the field definition
instead. They are internal, so they are not preserved. Every id that a reference actually
depends on - universe, type, field, option, entry, tag, relationship, timeline entry,
revision - is preserved exactly, so a future importer can rebuild the graph and the
fingerprints alike. `Tag.Slug` is dropped for the same reason: it is `Name.ToLowerInvariant()`
at the one place a tag is created, so it is a derived index column, not something authored.

**Media is described by identity and by where it sits, never by where it came from.** The asset
id is carried because it is the identity the entry itself uses, so an importer can recognise the
same picture across two backups of the same world. The object key is not, and is marked in the
code as implementation-only: it names a place in one installation's bucket, it is not what the
picture *is*, and a file that carried it would be describing infrastructure rather than lore.
Archive paths are built from ids and a fixed leaf for the same reason the object keys are - a
name is mutable, and a path built from one would change every time an author renamed a
character, so two backups of unchanged lore would stop being comparable.

**The payload is deterministic; only the envelope is not.** Every collection is sorted in
memory with an ordinal comparer - never left in the database's order and never sorted by a
SQLite collation - so two exports of unchanged lore produce a byte-identical `payload` on any
machine. `generatedAt` is genuinely useful and genuinely volatile, so it sits outside the
payload in the envelope, which is what lets the determinism test compare bytes rather than
compare a parsed object with a hole in it. Enums are written as names, not numbers, so a file
stays readable and a renumbered enum cannot silently re-mean an old backup. Nulls are written
rather than omitted, because "never filled in" and "not in this format" are different facts.

**One transaction for the whole read.** Assembling a backup is around two dozen queries, and
without a snapshot boundary each gap is a moment a concurrent write can land in - producing a
file whose entry is from before an edit and whose history is from after it. The read runs
inside one transaction and takes nothing wider: it writes nothing and locks nothing beyond
its own reads.

**One route, and ownership decides it.** `GET /api/universes/{id}/export`, authenticated,
gated by the same `LoreAccess` check as the rest of the lore surface, so a universe someone
else owns answers 404 and stays indistinguishable from one that does not exist. Archiving
changes nothing: an archived universe stays owned and readable, and a backup taken just
before deleting one is when a backup is worth most. The response is `application/json` as an
attachment named for the world and the day, reduced to lowercase ASCII.

## Consequences

- ~~This phase exports only. Nothing reads a backup back in, and the UI says so rather than
  implying a restore exists.~~ Superseded 2026-09-14: a backup is restored as a new universe (ADR 0032), and Settings says
  where.
- The format is the durable commitment, not the code that writes it. `UniverseBackup.cs` is
  the contract; a change there owes a version bump.
- **The archive is deterministic too.** Entries are written in a fixed order - `backup.json`
  first, then the media sorted by archive path with an ordinal comparer - and every entry
  carries a fixed 1980-01-01 stamp rather than the clock, so two exports of unchanged lore and
  unchanged pictures differ only where `generatedAt` lands inside the document. `backup.json`
  is deflated; media is stored rather than deflated, because a JPEG, PNG or WebP is already
  compressed and storing it makes "the original bytes, exactly" the plainest thing to verify.
- A backup is large, and history dominates the document - snapshots grow with the number of
  edits (ADR 0013). The container now compresses the document, which is where the growth is.
- ~~Restoring into a fresh installation will reproduce ids exactly, which is what makes the
  dismissal fingerprints re-apply. An importer that renumbered ids would have to recompute
  them, and should not.~~ Superseded 2026-09-14 (ADR 0032). Preserving ids only works when the
  ids are nowhere else - not when the same backup is restored twice, or beside the universe it
  came from - so the importer gives every object a new id. The preserved ids still do the job
  this consequence wanted: each dismissal is re-applied by fingerprinting each restored finding
  over the ids its records had in the file, which a `CanonFinding` now carries.
- The serialiser uses the relaxed encoder, so `&`, `<` and non-ASCII text stay literal. That
  is safe precisely because this file is never embedded in HTML - it is written to disk and
  read back by a parser - and it is what keeps a world written in a non-Latin script legible
  in its own backup.
- A backup no longer depends on the R2 bucket surviving. It did, briefly, between the arrival of
  entry images and version 3; that gap is closed, and it is why the format moved.
- Two things a backup deliberately does not claim to be: an account export, and a disaster
  recovery mechanism. It is one world, taken by hand, by the person who owns it.

## Amendment - format version 14: family meanings (2026-09-16)

`relationshipTypes[].familySemantic` carries what a relation kind means to a family tree - `None`,
`BiologicalParent` or `AdoptiveParent` - written by name, always present (ADR 0035).

This is a bump, and the line it sits on the far side of is the one ADR 0023 drew. Canon constraints were added
*within* version 4 because a reader that ignored them lost a check and misread no fact. A family meaning is not
a check: it is the meaning of the links themselves, the difference between a stored row and "Mara is Lia's
biological mother". A version 13 reader would restore every link with the family it records silently gone, and
the one thing that must never happen is that a reader guesses it back from what the kind is called. So the
version number refuses the file instead.

A file at version 13 or earlier has no `familySemantic`, and every kind in it reads as `None` whatever its name,
even when the file carries the member - which Lorex never wrote. No derived relative is in a backup: siblings,
grandparents and grandchildren are recomputed from the links, and a backup holds only the authored kinds and
the authored links.

## Amendment: version 15, a universe's public details (2026-09-27)

A universe may be prepared for the public portal (ADR 0036). `payload.universe` gains `publicSummary`, `category` and
`genres` (by name, fixed order) and `artwork` - the original at `media/universe/artwork/original.{ext}` with its
16:10 card frame; the card is derived and not carried. Authored, so a version 14 reader would lose them: a bump.
**Visibility, the public address, the publication date and the author's public name are never in a backup.**
Publishing is a decision about one universe in one installation; a restore makes a new universe that has never been
published. A file at version 14 or earlier has none of these members, and they are ignored if one carries them.

## Amendment: version 16, a story's public summary (2026-09-28)

A story may carry a public summary written for readers of the portal (Task 011, ADR 0036): `payload.stories[].publicSummary`.
Authored, so a version 15 reader would lose it: a bump. As in version 15, whether the story was published, its address and
its date are never in a backup, and every restored story is private. A file at version 15 or earlier has no public summary
on a story, and one it carries is ignored; nothing is ever taken from the premise. An account's author address and its
photo's public choice (ADR 0037) belong to the account and are not in a universe backup.

## Amendment: version 18, Family Tree eligibility and family without ancestry (2026-09-30)

`entityTypes[].familyTreeEligible` carries whether a type's entries are offered by the Family Tree, and
`relationshipTypes[].familySemantic` may now be `NonStructuralFamily` (ADR 0040). A bump: a version 17 reader does not know
the new meaning and must never read it as a parent link, and the capability is an authored choice. A file at version 17 or
earlier reads each type as eligible only when it is the untouched starter Character - the rule the migration applied - even
if the file carries a value, and a file at version 17 or earlier carrying `NonStructuralFamily` is refused, never
reinterpreted.

## Amendment: version 19, nested types (2026-10-01)

`entityTypes[].parentId` names the type of the same file a type sits beneath, null for a root (ADR 0007 amendment), and
`displayOrder` is its place among its siblings. Types are written in preorder - a parent before its descendants, siblings by
place, then name, then id - so a file reads top-down and two exports of unchanged lore are still identical. A bump, not an
ignorable member: the hierarchy is how the author organised their lore and how Lore is browsed, and a version 18 reader would
restore every type flat. A file at version 18 or earlier has no `parentId`: every type is a root, in its stored order, and
nothing is ever inferred from names like "Location" or "Kingdom".

## Amendment: collaboration (2026-10-02, ADR 0041)

Export is the owner's alone: the route asks `UniverseAccess` for `Backup`, so an Editor, Reviewer or Viewer is refused with
403 `universe_permission_denied` and anyone else still gets the 404 of a missing universe. Memberships are account access,
not the world: no membership, collaborator id or name is ever written to an archive. The format stays at version 19.

Invitations (refinement 030) are the same: account access metadata, never in an archive.

## Amendment: version 20, a link field's allowed type (2026-10-05, Product correction 036)

`BackupFieldDefinition.TargetEntityTypeId` names the type of the same file a link field is limited to, null for any type
(ADR 0007 amendment). Not ignorable: the limit is what the author said the field means and nothing derives it again, so a
version 19 reader would restore every limited field open to any type. A restore writes it as that type's restored id, never
the old one. Validation refuses a target that is not a type of the file, one on a field that does not link, one in a file
older than 20, and a value whose linked entry is not of its field's type. A version 19 or older file restores every link
field open to any type, and nothing is inferred from names or values.

## Amendment: version 21, a moment's stories (2026-10-05, refinement 038)

`BackupTimelineEntry.StoryIds` names the stories of the same file a moment is linked to, sorted, each once (ADR 0009
amendment). Not ignorable: the links are the author's statement of which stories a moment belongs to and nothing derives
them, so a version 20 reader would restore every story's timeline without its moments. A restore writes each link to the
restored story's id; the moment stays one moment. Validation refuses a link to a story the file does not hold, the same
story twice, and any link in a file older than 21. A version 20 or older file restores every moment linked to no story.
Scenes and birth and death years are never written as timeline items: they travel as scenes and entries already.

## Amendment: version 22, a custom calendar (2026-10-06, refinement 039)

`UniverseBackupPayload.ChronologyCalendar` carries the universe's custom calendar (ADR 0022 amendment), or null for simple
dates: its id and its months in order, each with id, name, short name, `sortOrder` and `dayCount`.
`BackupTimelineEntry.StartMonthId`/`EndMonthId` and `BackupChronologyValue.MonthId` (a scene's date) name a month of it in
place of a numeric month. Not ignorable: a version 21 reader would restore every custom date without its month. A restore
gives the calendar and each month a new id and points every date at its month's new id; month order and lengths are kept.
Validation refuses a month id the file's calendar does not hold (unknown, another universe's, or no calendar at all, which
covers any month id in a file older than 22), a duplicate id, two months with one name or one place, a length outside 1 to
1000, a day past its month's end, and a date naming its month both by number and by id. A version 21 or older file has no
calendar; every date restores as the simple date it was. Nothing derived (a rank, a formatted date) is carried.

## Amendment: version 23, semantic type groups (2026-10-19, Issue #36)

`UniverseBackupPayload.EntityTypeGroups` carries every group (ADR 0007 amendment, Issue #36): id, name, timestamps and the
ids of its member types of the same file, sorted by id; groups are listed by name then id, so two exports of unchanged lore
are identical. `BackupFieldDefinition.TargetGroupId` names the group of the same file a link field is limited to. Not
ignorable: a version 22 reader would restore every group-limited field open to any type. A restore gives each group a new
id and points memberships and targets at it, so a restored universe never names its source's groups. Validation refuses a
group with a missing or duplicate id or name, a member that is not a type of the file or is listed twice, a group target
that names no group of the file, sits on a non-link field or beside an exact type, and a link outside its field's group. A
version 22 or older file restores with no groups and nothing is inferred from names; groups such a file carries are
ignored, and a group target in it is refused as not written by Lorex.

## Amendment: version 24, a group enabled for the Family Tree (2026-10-20, Issue #37)

`BackupEntityTypeGroup.FamilyTreeEnabled` carries whether the author enabled a group for the Family Tree (ADR 0040
amendment). The choice lives on the group row, so a restore that gives the group a new id keeps it with no reference to
remap, and a restored universe never points at its source's groups. Not ignorable: a version 23 reader would restore every
enabled group off, and the tree would quietly stop being offered for the types it covered. A version 23 or older file reads
every group as not enabled, even when it carries the member: nothing is enabled by a group's name, and a legacy restore
offers the tree exactly where its types' own switches say. Types' own `familyTreeEligible` is unchanged in meaning.

## Amendment: version 25, archived fields (2026-10-20, Issue #39)

`BackupFieldDefinition.ArchivedAt` carries when a field was archived, null for an active one (ADR 0007 amendment). An
archived field travels whole, as an active one does: its id, options, meaning, target, required flag, and every value
entries hold for it, in Lore and in the Trash, including links, which a restore points at the restored entries like any
other. A restore keeps it archived. Not ignorable: a version 24 reader would restore every archived field active, back in
every form and, if it was required, refusing every save of an entry without it. A version 24 or older file restores every
field active, even when it carries the member.

## Amendment (2026-10-23, roadmap 052, ADR 0047)

Pending AI Changes are not in a backup and are never restored: proposals and their changes are review state about
accounts and connections, like comments and suggestions. A restored universe starts with none, so nothing approvable
travels into another universe. The format is unchanged.

## Amendment: version 27, an entry's eras (2026-10-24, Issue #41, ADR 0050)

`BackupEntity.Progression` carries an entry's eras in the author's order - name, description, a span on the file's
chronology, the stories and scenes of the file it covers, and every override row, archived fields' included - with every
saved version of them as the snapshot the save stored. Not ignorable: the eras are authored, so a version 26 reader would
restore every entry without them. A restore gives every era a new id and translates every id inside the snapshots, an id
only a version recorded getting a fresh one of its own. A version 26 or older file restores every entry with no eras, even
when it carries the member.

## Amendment: version 28, relationship periods (2026-10-24, Issue #18, ADR 0051)

`BackupRelationship.Periods` carries when each link holds, in order: a dated span on the file's chronology, or an era of
either end by its id in the file. Not ignorable: a version 27 reader would restore every link timeless. A restore points
each era at its restored id; validation refuses an era of neither end, a period with no bound or with both kinds, and a
span ending before it starts. A version 27 or older file restores every link timeless, even when it carries the member.

## Amendment: version 29, an entry's forms and abilities (2026-10-24, Issue #42, ADR 0052)

`BackupProgression.Forms` and `.Abilities` carry an entry's forms and abilities in order - name, description, first unlock
(an era of the entry, a scene and a timeline moment of the file, each optional), the eras each is available in, the scenes
it is used in and, for an ability, the forms it belongs to. Not ignorable: a version 28 reader would restore every entry
without them. A restore gives each a new id and translates them inside the snapshots; validation refuses an era of another
entry, a scene or moment the file does not hold, a form of another entry and a repeated name. A version 28 or older file
restores every entry with none, even when it carries the members.

## Amendment: version 30, an entry's appearances (2026-10-24, Issue #43, ADR 0053)

`BackupProgression.Appearances` carries an entry's appearances in order - label, notes, the eras and forms of the entry and the
scenes of the file each belongs to - and each one's pictures in gallery order: the original's facts and its path in the archive,
`media/entities/{entryId}/appearances/{imageId}/original.{ext}`. No framing: a gallery thumbnail is the centred square, cut
again on restore. Not ignorable: a version 29 reader would restore every entry without them. Validation decodes every picture
as an upload would and refuses a path Lorex would not write, a label twice, an era or form of another entry and more pictures
than a look holds; a restore holds the owner's storage for them with the entries' own pictures and gives everything new ids.
A version 29 or older file restores every entry with none, even when it carries the member. A saved version's snapshot that
has no `appearances` member, like one with no `forms`, restores leaving them as they are.

## Amendment: version 31, field sections (2026-10-24, Issue #26, ADR 0055)

`BackupEntityType.FieldSections` carries a type's sections in order - id, name, place and whether each starts collapsed - and
`BackupFieldDefinition.SectionId` the section of the same type a field is in, archived fields included. Not ignorable: a
version 30 reader would restore every form flat. Validation refuses a section the field's type does not hold, a repeated name
within a type and more than 50 sections; a restore gives every section a new id and points its fields at it, after every field
exists. A version 30 or older file restores every field ungrouped, even when it carries the members.

## Amendment: version 32, the owner's private notes (2026-10-24, issue 23, ADR 0056)

`BackupEntity.PrivateNote` carries the owner's private note on an entry - the text exactly as saved and when - or null for an
entry with none. Not ignorable: authored text a version 31 reader would restore silently gone. Only the owner may export, and
a restore makes the restoring account the owner of the new universe, so the note's one reader is unchanged by the trip; the
restored note is version 1 again. Validation refuses a note with no text and one over 20,000 characters. A version 31 or
older file restores every entry without a note, even when it carries the member.

## Amendment: version 33, knowledge records (2026-10-25, issue 15, ADR 0057)

`UniverseBackupPayload.KnowledgeRecords` carries every knowledge record of the universe by id - knower, optional subject,
statement, the scene it is learnt in or known from the start, created and updated - by knower name, then creation, then id.
Not ignorable: a version 32 reader would restore a world with every continuity note silently gone. Validation refuses a
knower or scene the file does not hold, a subject that is the knower, both anchors or neither, and a blank or over-long
statement; a restore gives every record a new id pointing at the restored entries and scenes. A version 32 or older file
restores with none, even when it carries the member.
