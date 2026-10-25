using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Export;

/// <summary>
/// The whole export format, as records. This file *is* the contract: the restore
/// (<c>Features/Restore</c>, ADR 0032) reads these shapes and nothing else, so a change here is a format
/// change and owes a <see cref="UniverseBackup.FormatVersion"/> bump - and the importer must be taught it.
///
/// Since version 3 a backup is an archive rather than one file, and these records describe
/// the <c>backup.json</c> inside it. The media beside it is addressed by
/// <see cref="BackupEntityImage.MediaPath"/>, which is a path within the same archive and
/// never a URL, a bucket or an object key.
///
/// See <c>docs/architecture/decisions/0014-universe-backup-format.md</c> for what is in a
/// backup, what is deliberately left out, and why.
/// </summary>
public sealed record UniverseBackup(
    string Format,
    int FormatVersion,
    DateTime GeneratedAt,
    UniverseBackupPayload Payload)
{
    /// <summary>Discriminator, so a reader can refuse a file that is merely JSON.</summary>
    public const string FormatName = "lorex.universe.backup";

    /// <summary>
    /// Bumped whenever the payload's shape or meaning changes in a way a reader must notice.
    /// Adding a nullable member that an older reader can ignore does not count; removing,
    /// renaming or re-meaning one does.
    ///
    /// 2 - Phase 019 added <see cref="BackupEntity.DeletedAt"/>. The member itself is nullable
    /// and ignorable, but it re-means the <c>entities</c> collection: membership no longer
    /// implies the entry is live, and a reader that ignored it would restore an author's Trash
    /// into their world as ordinary lore. That is the "re-meaning" case above, so it is a bump.
    /// A version 1 file still means exactly what it always meant - every entry in it is live.
    ///
    /// 3 - A backup became an archive. The download is a ZIP holding this document as
    /// <c>backup.json</c> plus every entry's original image beside it, and
    /// <see cref="BackupEntity.Image"/> names where each one sits. This is the largest kind of
    /// change the version can carry: a reader that only knows versions 1 and 2 is handed a file
    /// it cannot parse at all, which is exactly what a version number is for.
    ///
    /// 4 - A universe may name its eras (ADR 0022). <see cref="UniverseBackupPayload.ChronologyEras"/>
    /// carries them, and <see cref="BackupTimelineEntry.StartEraId"/>,
    /// <see cref="BackupTimelineEntry.EndEraId"/> and <see cref="BackupFieldValue.EraId"/> say
    /// which era a year is counted in. Each member is nullable, but together they re-mean the year
    /// beside them: a start year of 10 in an era that counts down is ten years before that era
    /// ends, not the signed year 10. A reader that ignored them would put every such year on the
    /// wrong line - the re-meaning case above, so it is a bump. A file at versions 1 to 3 names no
    /// eras, and every year in it is a plain signed year.
    ///
    /// 5 - A universe may hold stories (ADR 0024). <see cref="UniverseBackupPayload.Stories"/> carries
    /// every story with its scenes, their narrative order, point of view, chronology and linked lore.
    /// The member is nullable, but it is not the "ignorable" case above: that case is for members a
    /// reader can skip without losing anything an author wrote, which is why relationship constraints -
    /// rules checked against the lore - were added within version 4. A reader that skipped this one
    /// would restore a world with every story silently missing, turning a complete backup into a lossy
    /// one. So it is a bump: a reader that knows only version 4 is told it is holding something it
    /// cannot carry. A file at versions 1 to 4 holds no stories - <c>stories</c> is absent and reads
    /// as null.
    ///
    /// 6 - A story may group its scenes into chapters (ADR 0025). <see cref="BackupStory.Chapters"/>
    /// carries them, and <see cref="BackupScene.ChapterId"/> says which one each scene is told in - null
    /// for Unchaptered. Both fail the "ignorable" test twice over. A chapter's title, summary and notes
    /// are authored, so a reader that skipped them would lose writing. And the chapter id re-means
    /// <see cref="BackupScene.SortOrder"/>: from this version it is a scene's place inside its chapter or
    /// inside Unchaptered, not in the whole story, so every chapter starts again from 0. A version 5
    /// reader would find several scenes claiming each place and flatten the story into a wrong order.
    /// A file at version 5 has no <c>chapters</c> and no <c>chapterId</c>; both read as null, every
    /// scene is Unchaptered, and its story-wide order is exactly its order there.
    ///
    /// 7 - A story may plan its plot as arcs of beats (ADR 0026). <see cref="BackupStory.PlotArcs"/> carries every
    /// arc in order with its beats in order, each beat naming the scenes it plays out in and the entries it concerns
    /// by id. The member is nullable, but it is not the "ignorable" case either: an arc's and a beat's title,
    /// description and notes are authored, and so is every link, so a version 6 reader would restore each story
    /// with its plot silently gone - the loss version 5 was bumped for. A file at version 6 or earlier has no
    /// <c>plotArcs</c>; it reads as null, which means a story with no plot.
    ///
    /// 8 - A scene may hold manuscript prose (ADR 0027). <see cref="BackupScene.Manuscript"/> carries it - the text exactly
    /// as the author wrote it, and when it was last saved. Nullable, and the least ignorable member yet: it is the writing
    /// itself, so a version 7 reader would restore every scene with its prose silently gone. A file at version 7 or earlier
    /// has no <c>manuscript</c>; it reads as null, which means a scene with nothing written.
    ///
    /// 9 - An entry's article moved into a row of its own with a history of its own (ADR 0028).
    /// <see cref="BackupEntity.Content"/> keeps its meaning - the article as it stands - and gains
    /// <see cref="BackupEntity.ArticleUpdatedAt"/> and <see cref="BackupEntity.ArticleRevisions"/>, every saved version of
    /// the article. It fails the "ignorable" test twice. The versions are authored text a version 8 reader would drop
    /// silently, as it would have dropped an entry's history. And <see cref="BackupRevision.Content"/> is re-meant: in
    /// version 8 a null there said the entry had no article at that version, and restoring the version applied that; from
    /// version 9 an entry revision recorded after the move holds no copy of the article at all, so a version 8 reader
    /// restoring one would wipe an article that exists. A file at version 8 or earlier has neither new member; both read as
    /// null, and each revision's <c>content</c> is the article as it read then.
    ///
    /// 10 - A story's content may sit in the Trash, and a scene's manuscript keeps its saved versions (ADR 0029).
    /// <see cref="BackupStory.DeletedAt"/>, <see cref="BackupChapter.DeletedAt"/>, <see cref="BackupScene.DeletedAt"/>,
    /// <see cref="BackupPlotArc.DeletedAt"/> and <see cref="BackupPlotBeat.DeletedAt"/> say what is in it, and
    /// <see cref="BackupSceneManuscript.Revisions"/> carries every saved version of the prose. It fails the "ignorable" test
    /// twice, as versions 2 and 9 did. The markers re-mean <c>stories</c> and every collection inside a story: membership no
    /// longer implies something is live, and the <c>sortOrder</c> of a row in the Trash holds no place - so a version 9 reader
    /// would restore the Trash into the story as ordinary content, with two scenes claiming one place. And the versions are
    /// authored text a version 9 reader would drop silently. A file at version 9 or earlier has none of these members: each
    /// reads as null, everything in it is live, and a manuscript has no versions but its text.
    ///
    /// 11 - An account may keep ideas, and an idea may belong to a universe and reference its content (ADR 0030).
    /// <see cref="UniverseBackupPayload.Ideas"/> carries every idea that belongs to this universe - its title and body, its
    /// deleted marker and its references by kind and id. Nullable, but not ignorable: an idea's text is authored, so a version
    /// 10 reader would parse the file and restore the universe with every idea about it silently gone. An idea that belongs
    /// to no universe is an account's, not a world's, and is in no universe backup. A file at version 10 or earlier has no
    /// <c>ideas</c>; it reads as null, which means none.
    ///
    /// 12 - A universe may state its world rules (ADR 0033). <see cref="UniverseBackupPayload.WorldRules"/> carries every rule -
    /// its title and description exactly as stored, and its Trash marker. Nullable, but not ignorable: a rule's words are
    /// authored, so a version 11 reader would parse the file and restore the universe with every rule silently gone - the loss
    /// versions 5 and 11 were bumped for. A file at version 11 or earlier has no <c>worldRules</c>; it reads as null, which means
    /// none.
    ///
    /// 13 - A world rule may carry one structured check, and a moment structured details for it, both naming the universe's own
    /// event kinds and methods by id (ADR 0034). <see cref="UniverseBackupPayload.ValidationTerms"/> carries that vocabulary,
    /// <see cref="BackupWorldRule.Validation"/> a rule's check and <see cref="BackupTimelineEntry.Validation"/> a moment's details.
    /// Nullable, but not ignorable. A relationship constraint was added within version 4 because a reader that skipped it lost a
    /// check and nothing an author wrote; this is not that case. A term's name is authored, and a moment's details are recorded
    /// facts about the world - what kind of event it was, by what means, and whose - that nothing derives again: a version 12
    /// reader would parse the file and restore the universe with all of them silently gone. A file at version 12 or earlier has
    /// none of these members; each reads as null, which means no terms, no rule checked and no moment described.
    ///
    /// 14 - A relation kind may carry a family meaning (ADR 0035). <see cref="BackupRelationshipType.FamilySemantic"/> says every
    /// link of the kind is a biological or an adoptive parent link, source parent and target child. Not ignorable, and not the
    /// relationship constraint case either: a constraint is a check run against links whose meaning a reader keeps, and this is
    /// that meaning. It is authored, nothing derives it again - and nothing may derive it from the kind's name - so a version 13
    /// reader would restore every link with the family it records silently gone and every family tree in the universe empty. A
    /// file at version 13 or earlier has no <c>familySemantic</c>; it reads as <c>None</c>, whatever a kind is called.
    ///
    /// 15 - A universe may be prepared for the public portal (ADR 0036). <see cref="BackupUniverse.PublicSummary"/>,
    /// <see cref="BackupUniverse.Category"/>, <see cref="BackupUniverse.Genres"/> and <see cref="BackupUniverse.Artwork"/>
    /// carry what its author wrote and chose for it, and the archive gains the artwork's original beside the entries'
    /// pictures. Not ignorable: the summary is authored text and the artwork an authored picture, so a version 14 reader
    /// would lose both silently - and would refuse the archive anyway, over a file it does not know. <b>Whether the universe
    /// is public is deliberately not in the format</b>, and neither is its address or when it was published: publishing is
    /// a decision about one universe in one installation, and a restore makes a new universe that has never been
    /// published. A restored universe is always private. A file at version 14 or earlier has none of these members; each
    /// reads as null, which means none.
    ///
    /// 16 - A story may carry a public summary (Task 011, ADR 0036): <see cref="BackupStory.PublicSummary"/>, what its
    /// author wrote for readers of the portal, separate from its premise. Not ignorable - it is authored text, which a
    /// version 15 reader would lose silently. As in 15, whether the story was published is not in the format, nor its
    /// address or date: every restored story is private. A file at version 15 or earlier has no <c>publicSummary</c> on
    /// a story; it reads as null, and nothing is ever filled from the premise.
    ///
    /// 17 - A universe may say it is based on someone else's work (ADR 0039): <see cref="BackupUniverse.OriginalCreator"/>
    /// and <see cref="BackupUniverse.OriginalWork"/>, the attribution its author wrote. Not ignorable - it is authored text,
    /// and a version 16 reader would restore a fan or reference world as its new owner's own creation, crediting nobody. A
    /// file at version 16 or earlier has neither; each reads as null, an original world. What a story's scenes, manuscripts
    /// and plot arcs were selected for is not in the format either, as for entries and stories: every restored part is
    /// private.
    ///
    /// 18 - A type may be enabled for the Family Tree, and a relation kind may carry a family meaning that is not ancestry
    /// (ADR 0040). <see cref="BackupEntityType.FamilyTreeEligible"/> is the type's authored capability, and
    /// <see cref="BackupRelationshipType.FamilySemantic"/> may now be <c>NonStructuralFamily</c> - "uncle of", "married to".
    /// Not ignorable: a version 17 reader does not know the new meaning and must never read it as a parent link, and the
    /// capability is an authored choice nothing derives again. A file at version 17 or earlier has no
    /// <c>familyTreeEligible</c>; each type reads as eligible only when it is the untouched starter Character, the rule the
    /// migration applied to a live database, and no older file may carry <c>NonStructuralFamily</c> - one that does was not
    /// written by Lorex and is refused.
    ///
    /// 19 - A type may sit beneath another type (ADR 0007 amendment, 2026-10-01). <see cref="BackupEntityType.ParentId"/> names
    /// the type of the same file it is nested in, null for a root, and <see cref="BackupEntityType.DisplayOrder"/> is now its
    /// place among its siblings. Types are listed parent before descendants. Not ignorable: the hierarchy is how the author
    /// organised their lore and how Lore is browsed - choosing a type shows its whole branch - so a version 18 reader would
    /// restore every type flat and the organisation would be silently gone. A file at version 18 or earlier has no
    /// <c>parentId</c>; every type reads as a root in its stored order, and nothing is ever inferred from names.
    ///
    /// 20 - A field that links to an entry may be limited to one type (ADR 0007 amendment, 036).
    /// <see cref="BackupFieldDefinition.TargetEntityTypeId"/> names a type of the same file, null for any type, and only a link
    /// field may carry one. Not ignorable: the limit is the author's statement of what the field means, nothing derives it again
    /// - not from the field's name, not from the entries it already links - so a version 19 reader would restore every limited
    /// field open to any type. A file at version 19 or earlier has no <c>targetEntityTypeId</c>; each link field reads as open
    /// to any type, and one that carries it was not written by Lorex and is refused.
    ///
    /// 21 - A timeline moment may be linked to the stories it matters to (ADR 0009 amendment, 038).
    /// <see cref="BackupTimelineEntry.StoryIds"/> names stories of the same file, sorted, each once; the restore links the moment
    /// to those stories' new ids. The moment stays one moment however many stories it names. Not ignorable: the links are the
    /// author's statement of which stories a moment belongs to, which nothing derives again - so a version 20 reader would
    /// restore every story's timeline empty of its moments. Scenes and birth and death years on the timeline are not in the
    /// format as timeline items: they are read from the scenes and entries, which already travel. A file at version 20 or
    /// earlier has no <c>storyIds</c>; each moment reads as linked to no story, and one that carries them was not written by
    /// Lorex and is refused.
    ///
    /// 22 - A universe may divide its years with a custom calendar (ADR 0022 amendment, 039).
    /// <see cref="UniverseBackupPayload.ChronologyCalendar"/> carries its months in order - id, name, short name, place and
    /// length - and <see cref="BackupTimelineEntry.StartMonthId"/>, <see cref="BackupTimelineEntry.EndMonthId"/> and
    /// <see cref="BackupChronologyValue.MonthId"/> name a month of it in place of a numeric month. The restore gives the
    /// calendar and every month new ids and points each date at its month's new id. Not ignorable: a version 21 reader would
    /// restore every custom date without its month. A file at version 21 or earlier has no calendar and no month ids; every
    /// date restores as the simple date it was, and one that carries them was not written by Lorex and is refused.
    ///
    /// 23 - Lore types may belong to semantic groups (ADR 0007 amendment, Issue #36).
    /// <see cref="UniverseBackupPayload.EntityTypeGroups"/> carries each group - id, name and the ids of its member types of
    /// this file - and <see cref="BackupFieldDefinition.TargetGroupId"/> names the group of this file a link field is limited
    /// to. The restore gives every group a new id and points memberships and targets at it. Not ignorable: a version 22 reader
    /// would restore every group-limited field open to any type. A file at version 22 or earlier has no groups and no
    /// <c>targetGroupId</c>; it restores with no groups and nothing is inferred from names. Groups such a file carries are
    /// ignored, and a group target in it was not written by Lorex and is refused.
    ///
    /// 24 - A group may be enabled for the Family Tree (ADR 0040 amendment, Issue #37). <see cref="BackupEntityTypeGroup.FamilyTreeEnabled"/>
    /// is the author's choice, carried on the group, so a restore that gives the group a new id keeps it with no reference to
    /// remap. Not ignorable: a version 23 reader would restore every enabled group off, and the tree would quietly stop being
    /// offered for the types it covered. A file at version 23 or earlier reads every group as not enabled, even if it carries a
    /// value: nothing is enabled because of a group's name, and a restored universe offers the tree exactly where its file says.
    ///
    /// 25 - A field may be archived (Issue #39). <see cref="BackupFieldDefinition.ArchivedAt"/> is when its author archived it,
    /// null while it is active. An archived field travels whole - its id, options, meaning, target, required flag and every
    /// value an entry holds for it, in Lore and in the Trash - and restores archived. Not ignorable: a version 24 reader would
    /// restore every archived field active, back in every entry form and, if it was required, refusing every save of an entry
    /// without it. A file at version 24 or earlier has no <c>archivedAt</c>; every field restores active, even if it carries a
    /// value.
    ///
    /// 26 - A relationship and a timeline moment may be in the Trash (ADR 0048, Issue #45).
    /// <see cref="BackupRelationship.DeletedAt"/> and <see cref="BackupTimelineEntry.DeletedAt"/> are when each was moved there,
    /// null while live; each travels whole and restores into the Trash, still restorable. Not ignorable: a version 25 reader
    /// would restore every trashed link and moment live, back in Canon and on the timeline. A file at version 25 or earlier
    /// has no <c>deletedAt</c> on either; every link and moment restores live, even if it carries a value.
    ///
    /// 27 - An entry may have eras (Issue #41). <see cref="BackupEntity.Progression"/> carries them in the author's order - each
    /// era's name, description, dated span on the file's chronology, the stories and scenes of this file it covers, and the
    /// fields it overrides or leaves empty - with every saved version of them. Not ignorable: the eras and their overrides are
    /// authored, so a version 26 reader would restore every entry without them. A file at version 26 or earlier has no
    /// <c>progression</c>; every entry restores with no eras, even if it carries one.
    ///
    /// 28 - A relationship may hold during periods (Issue #18). <see cref="BackupRelationship.Periods"/> carries them in order,
    /// each a dated span on the file's chronology or one era of either end, by the era's id in this file. Not ignorable: a
    /// version 27 reader would restore every link timeless, true at every time its author said it was not. A file at version 27
    /// or earlier has no <c>periods</c>; every link restores timeless, even if it carries some.
    ///
    /// 29 - An entry may have forms and abilities (Issue #42). <see cref="BackupProgression.Forms"/> and
    /// <see cref="BackupProgression.Abilities"/> carry them in the author's order - name, description, the first unlock (an era
    /// of the entry, a scene, a moment of this file), the eras each is available in, the scenes it is used in, and an ability's
    /// forms. Not ignorable: they are authored, so a version 28 reader would restore every entry without them. A file at version
    /// 28 or earlier has neither; every entry restores with no forms or abilities, even if it carries some.
    ///
    /// 30 - An entry may have appearances (Issue #43). <see cref="BackupProgression.Appearances"/> carries them in order - label,
    /// notes, the eras, forms and scenes each belongs to - with each one's pictures in gallery order, every original in the
    /// archive under <c>media/entities/{entryId}/appearances/</c>. Not ignorable: a version 29 reader would restore every entry
    /// without its looks. A file at version 29 or earlier has none; every entry restores with no appearances.
    ///
    /// 31 - A type's fields may be organised into sections (Issue #26). <see cref="BackupEntityType.FieldSections"/> carries a
    /// type's sections in order - name and whether each starts collapsed - and <see cref="BackupFieldDefinition.SectionId"/>
    /// names the section of the same type a field is in, archived fields included. The restore gives every section a new id
    /// and points its fields at it. Not ignorable: a version 30 reader would restore every form flat. A file at version 30 or
    /// earlier has no sections; every field restores ungrouped, even if it names one, and nothing is inferred from names.
    ///
    /// 32 - An entry may carry the owner's private note (issue 23, ADR 0056). <see cref="BackupEntity.PrivateNote"/> carries
    /// it - the text exactly as written and when it was last saved - or null for an entry with none. Not ignorable: it is
    /// authored text a version 31 reader would restore silently gone. Only the owner exports, and a restore makes the
    /// restoring account the owner, so the note's one reader is unchanged by the trip. A file at version 31 or earlier
    /// restores every entry without a note, even when it carries the member.
    /// </summary>
    public const int CurrentVersion = 32;

    public static UniverseBackup Of(UniverseBackupPayload payload, DateTime generatedAt) =>
        new(FormatName, CurrentVersion, generatedAt, payload);
}

/// <summary>
/// Everything authored inside one universe, and nothing else.
///
/// This object is the deterministic half of the file: two exports of unchanged lore
/// serialise it byte for byte. Only the envelope around it carries anything volatile.
///
/// <paramref name="ChronologyEras"/> is the universe's reckoning, earliest era first. Empty means
/// plain signed years; absent - null, in any file before version 4 - means the same thing.
///
/// <paramref name="Stories"/> is every story told in the universe, by title. Empty means none;
/// absent - null, in any file before version 5 - means the same thing.
///
/// <paramref name="Ideas"/> is every idea that belongs to the universe, live ones first (since version 11). Empty means
/// none; absent - null, in any earlier file - means the same thing. Ideas that belong to no universe are never here.
///
/// <paramref name="WorldRules"/> is every world rule of the universe, live ones first (since version 12). Empty means none;
/// absent - null, in any earlier file - means the same thing.
///
/// <paramref name="ValidationTerms"/> is the universe's event kinds and methods, event kinds first, each by name (since version
/// 13). Empty means none; absent - null, in any earlier file - means the same thing.
///
/// <paramref name="ChronologyCalendar"/> is the universe's custom calendar (since version 22), or null for simple dates.
///
/// <paramref name="EntityTypeGroups"/> is the universe's semantic groups by name (since version 23). Empty means none;
/// absent - null, in any earlier file - means the same thing.
/// </summary>
public sealed record UniverseBackupPayload(
    BackupUniverse Universe,
    IReadOnlyList<BackupChronologyEra>? ChronologyEras,
    IReadOnlyList<BackupEntityType> EntityTypes,
    IReadOnlyList<BackupTag> Tags,
    IReadOnlyList<BackupEntity> Entities,
    IReadOnlyList<BackupRelationshipType> RelationshipTypes,
    IReadOnlyList<BackupRelationship> Relationships,
    IReadOnlyList<BackupTimelineEntry> TimelineEntries,
    IReadOnlyList<BackupStory>? Stories,
    IReadOnlyList<BackupDismissedConflict> DismissedConflicts,
    IReadOnlyList<BackupIdea>? Ideas,
    IReadOnlyList<BackupWorldRule>? WorldRules,
    IReadOnlyList<BackupValidationTerm>? ValidationTerms = null,
    BackupChronologyCalendar? ChronologyCalendar = null,
    IReadOnlyList<BackupEntityTypeGroup>? EntityTypeGroups = null);

/// <summary>
/// The universe itself. <c>OwnerId</c> is deliberately absent: it names an Identity row that
/// means nothing outside the installation that issued it, and a backup that carried it would
/// be a backup of an account rather than of a world.
///
/// Since version 15, its public details: <paramref name="PublicSummary"/>, <paramref name="Category"/> and
/// <paramref name="Genres"/> (by name, in their fixed order), and <paramref name="Artwork"/>. Visibility, the
/// public address and the publication date are never here, and neither is the author's public name, which is
/// the account's - see <see cref="UniverseBackup.CurrentVersion"/>. Since version 17, its attribution:
/// <paramref name="OriginalCreator"/> and <paramref name="OriginalWork"/> (ADR 0039).
/// </summary>
public sealed record BackupUniverse(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? PublicSummary = null,
    UniverseCategory? Category = null,
    IReadOnlyList<UniverseGenres>? Genres = null,
    BackupUniverseArtwork? Artwork = null,
    string? OriginalCreator = null,
    string? OriginalWork = null);

/// <summary>
/// The universe's artwork, as <see cref="BackupEntityImage"/> describes an entry's picture: the original's
/// identity and shape and where it sits in this archive (<see cref="BackupArchive.ArtworkPathFor"/>), and the
/// 16:10 frame its card was cut with. The card itself is derived and is not carried; an importer cuts it again
/// from the original and this frame. No object key, no URL.
/// </summary>
public sealed record BackupUniverseArtwork(
    Guid AssetId,
    string? FileName,
    string ContentType,
    int Width,
    int Height,
    long ByteSize,
    string MediaPath,
    BackupImageCrop Crop);

/// <summary>
/// One era of the universe's reckoning. The id is preserved because timeline entries and years on
/// entries reference it; <paramref name="SortOrder"/> and <paramref name="Direction"/> are what
/// place every year counted in it, and <paramref name="Abbreviation"/> and
/// <paramref name="LabelPosition"/> are how it is written. Nothing derived from them - a formatted
/// date, a sort key - is carried.
/// </summary>
public sealed record BackupChronologyEra(
    Guid Id,
    string Name,
    string? Abbreviation,
    int SortOrder,
    ChronologyEraDirection Direction,
    ChronologyLabelPosition LabelPosition);

/// <summary>
/// A custom calendar (since version 22): its months in the order of the year. Ids are preserved because dates name the
/// months; nothing derived - a rank, a formatted date - is carried.
/// </summary>
public sealed record BackupChronologyCalendar(Guid Id, IReadOnlyList<BackupChronologyCalendarMonth> Months);

/// <summary>One month: <paramref name="SortOrder"/> is its place in the year from 0, <paramref name="DayCount"/> its length.</summary>
public sealed record BackupChronologyCalendarMonth(
    Guid Id,
    string Name,
    string? Abbreviation,
    int SortOrder,
    int DayCount);

/// <summary>
/// <paramref name="FamilyTreeEligible"/> was added in version 18, <paramref name="ParentId"/> in version 19 (see
/// <see cref="UniverseBackup.CurrentVersion"/>): the type of this file it sits beneath, or null for a root.
/// <paramref name="FieldSections"/> (version 31) are its fields' sections in order; empty or absent means none.
/// </summary>
public sealed record BackupEntityType(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    bool FamilyTreeEligible,
    int DisplayOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<BackupFieldDefinition> Fields,
    Guid? ParentId = null,
    IReadOnlyList<BackupFieldSection>? FieldSections = null);

/// <summary>One section of a type's fields (since version 31): its id, which its fields name, its name, place and fold.</summary>
public sealed record BackupFieldSection(Guid Id, string Name, int DisplayOrder, bool StartsCollapsed);

/// <summary>
/// One custom field, with its declared meaning. <c>Semantic</c> is authored (ADR 0011) and
/// nothing infers it from a name, so losing it would silently disarm the chronology rules.
/// <paramref name="TargetEntityTypeId"/> (version 20) is the type of this file a link field is limited to, or null for any.
/// <paramref name="TargetGroupId"/> (version 23) is the group of this file it is limited to instead, or null.
/// <paramref name="ArchivedAt"/> (version 25) is when the field was archived, or null for an active field.
/// <paramref name="SectionId"/> (version 31) is the section of its own type it is shown in, or null.
/// </summary>
public sealed record BackupFieldDefinition(
    Guid Id,
    string Name,
    EntityFieldKind Kind,
    EntityFieldSemantic? Semantic,
    bool IsRequired,
    int DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<BackupFieldOption> Options,
    Guid? TargetEntityTypeId = null,
    Guid? TargetGroupId = null,
    DateTime? ArchivedAt = null,
    Guid? SectionId = null);

/// <summary>
/// A semantic group (since version 23): its id, which fields and memberships name, its name, and the types of this file in
/// it, sorted by id. Membership is the author's statement and is carried as it is, never derived again from names.
/// <paramref name="FamilyTreeEnabled"/> (since version 24) is whether the author enabled it for the Family Tree; false in an
/// older file, whatever it carries.
/// </summary>
public sealed record BackupEntityTypeGroup(
    Guid Id,
    string Name,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<Guid> TypeIds,
    bool FamilyTreeEnabled = false);

public sealed record BackupFieldOption(Guid Id, string Value, int DisplayOrder);

/// <summary>
/// A tag by name. The stored <c>Slug</c> is not carried: it is
/// <c>Name.ToLowerInvariant()</c> at the one place a tag is ever created, so it is a
/// derived index column rather than something an author wrote.
/// </summary>
public sealed record BackupTag(Guid Id, string Name);

/// <summary>
/// One entry, with its history alongside it so a version never travels apart from the entry
/// it is a version of.
///
/// <paramref name="Content"/> is the article as it stands: the Tiptap document exactly as stored - the same string, not a
/// re-serialised object graph - so it round-trips byte for byte. Null for an entry with no article, and for one whose
/// article was written and then cleared. <paramref name="ArticleUpdatedAt"/> is when the article was last saved, null if
/// it never was, which is what tells those two apart (since version 9).
///
/// <paramref name="ArticleRevisions"/> is every saved version of the article, oldest first; the newest is
/// <paramref name="Content"/>. Each is the whole document, or <c>""</c> for a save that cleared it. Its ids are preserved,
/// and a version's <c>restoredFromRevisionId</c> names another version of the same entry's article (since version 9).
///
/// The importer (ADR 0032) restores the article to the entry it belongs to, in the universe being restored and owned by the
/// importing account - nothing about ownership is in the file. It validates each document as a save does, re-creates the
/// versions with their numbers under new ids, writes no entry revision for any of it, and reindexes search. It never applies a
/// <see cref="BackupRevision.Content"/> to the article.
///
/// <paramref name="DeletedAt"/> is when the entry was moved to the Trash, or null while it is
/// live. Trashed entries are carried in full, with their values, aliases, tags and history:
/// they are authored lore the owner has not thrown away irrecoverably, and a backup that
/// silently omitted them would turn a recoverable mistake into a permanent one. It is why this
/// format is at version 2 - see <see cref="UniverseBackup.CurrentVersion"/> and ADR 0014.
/// </summary>
public sealed record BackupEntity(
    Guid Id,
    Guid EntityTypeId,
    string Name,
    string? Summary,
    string? Content,
    DateTime? ArticleUpdatedAt,
    CanonStatus CanonStatus,
    bool IsArchived,
    DateTime? DeletedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<Guid> TagIds,
    IReadOnlyList<BackupFieldValue> FieldValues,
    BackupEntityImage? Image,
    IReadOnlyList<BackupRevision> Revisions,
    IReadOnlyList<BackupArticleRevision>? ArticleRevisions,
    BackupProgression? Progression = null,
    BackupPrivateNote? PrivateNote = null);

/// <summary>
/// The owner's private note on an entry (since version 32, ADR 0056): the text exactly as saved - <c>""</c> for a note that
/// was emptied - and when. No history and no author: the owner's alone, and the restore makes it version 1 again.
/// </summary>
public sealed record BackupPrivateNote(string Content, DateTime UpdatedAt);

/// <summary>
/// One saved version of an entry's article (since version 9). <paramref name="Content"/> is the whole document exactly as
/// saved, or <c>""</c> for a save that cleared the article. <paramref name="Kind"/> is <c>Created</c> for the first version,
/// <c>Edited</c> for a save and <c>Restored</c> for a version put back, which names it in
/// <paramref name="RestoredFromRevisionId"/>.
/// </summary>
public sealed record BackupArticleRevision(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);

/// <summary>
/// An entry's progression (since version 27): its eras in the author's order, and every saved version of it, oldest first.
/// Null for an entry that never had one. Ids are preserved, because relationships and an older version name an era by id.
/// </summary>
public sealed record BackupProgression(
    DateTime UpdatedAt,
    IReadOnlyList<BackupEntityEra> Eras,
    IReadOnlyList<BackupProgressionRevision> Revisions,
    IReadOnlyList<BackupForm>? Forms = null,
    IReadOnlyList<BackupAbility>? Abilities = null,
    IReadOnlyList<BackupAppearance>? Appearances = null);

/// <summary>
/// One appearance of one entry (since version 30): <paramref name="SortOrder"/> its place; the eras and forms of this entry and
/// the scenes of this file it belongs to, sorted; its pictures in gallery order, each original in the archive.
/// </summary>
public sealed record BackupAppearance(
    Guid Id,
    string Label,
    string? Notes,
    int SortOrder,
    IReadOnlyList<Guid> EraIds,
    IReadOnlyList<Guid> FormIds,
    IReadOnlyList<Guid> SceneIds,
    IReadOnlyList<BackupAppearanceImage> Images);

/// <summary>
/// One picture of an appearance, as <see cref="BackupEntityImage"/> describes an entry's own: the original's facts and where it
/// sits in the archive. No framing - a gallery thumbnail is always the centred square, cut again on restore.
/// </summary>
public sealed record BackupAppearanceImage(
    Guid Id,
    string? FileName,
    string ContentType,
    int Width,
    int Height,
    long ByteSize,
    string MediaPath);

/// <summary>
/// One form of one entry (since version 29): <paramref name="SortOrder"/> its place; the first unlock, each part optional - an
/// era of this entry, a scene, a timeline moment of this file; the eras it is available in and the scenes it is used in, sorted.
/// </summary>
public sealed record BackupForm(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    Guid? UnlockEraId,
    Guid? UnlockSceneId,
    Guid? UnlockMomentId,
    IReadOnlyList<Guid> EraIds,
    IReadOnlyList<Guid> SceneIds);

/// <summary>One ability of one entry (since version 29): what a form carries, and the forms of this entry it belongs to.</summary>
public sealed record BackupAbility(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    Guid? UnlockEraId,
    Guid? UnlockSceneId,
    Guid? UnlockMomentId,
    IReadOnlyList<Guid> EraIds,
    IReadOnlyList<Guid> SceneIds,
    IReadOnlyList<Guid> FormIds);

/// <summary>
/// One era of one entry: <paramref name="SortOrder"/> its place, from 0; <paramref name="Start"/> and <paramref name="End"/>
/// its optional bounds, each as precise as written; <paramref name="StoryIds"/> and <paramref name="SceneIds"/> stories and
/// scenes of this file, sorted; <paramref name="FieldValues"/> what it overrides, archived fields' included.
/// </summary>
public sealed record BackupEntityEra(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    BackupChronologyValue? Start,
    BackupChronologyValue? End,
    IReadOnlyList<Guid> StoryIds,
    IReadOnlyList<Guid> SceneIds,
    IReadOnlyList<BackupEraFieldValue> FieldValues);

/// <summary>One override row, in <see cref="BackupFieldValue"/>'s members, or <paramref name="IsCleared"/> with none set.</summary>
public sealed record BackupEraFieldValue(
    Guid FieldDefinitionId,
    bool IsCleared,
    string? TextValue,
    double? NumberValue,
    Guid? EraId,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    Guid? ReferencedEntityId);

/// <summary>One saved version of a progression: the whole of it as that save stored it, ids as they were then.</summary>
public sealed record BackupProgressionRevision(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    ProgressionSnapshot Snapshot);

/// <summary>
/// The entry's primary image, as a reader of the archive needs to see it.
///
/// <paramref name="MediaPath"/> is the whole point: a path inside this same archive, holding
/// the original bytes exactly as the author uploaded them. A backup that only named an object
/// in a bucket would stop being a backup the moment the bucket did, so the picture travels with
/// the lore or the export fails.
///
/// <b>No object key, no bucket, no endpoint, no URL.</b> Those are how this installation happens
/// to store the file today; none of them is the picture's identity, and none of them means
/// anything to a reader on another machine. <paramref name="AssetId"/> is carried because it is
/// the identity the entry itself uses, so a future importer can recognise the same image across
/// two backups of the same world.
///
/// The thumbnail's bytes are deliberately absent. It is derived - the square in
/// <paramref name="Crop"/>, cut from the original and scaled to a fixed size in a fixed format -
/// so an importer regenerates it rather than carrying a second copy of every picture that would
/// have to be trusted to match. What is carried is the one part that is not derivable: which
/// square the author chose. See ADR 0019.
///
/// <paramref name="Width"/> and <paramref name="Height"/> are the picture as displayed, the frame
/// <paramref name="Crop"/>'s fractions are measured against.
///
/// Adding <paramref name="Crop"/> is not a version bump, by the rule on
/// <see cref="UniverseBackup.CurrentVersion"/>: it is nullable, and a reader that ignores it
/// still restores every picture whole - it only loses the framing, and falls back to the centred
/// square every thumbnail had before an author could choose.
///
/// For a short while (2026-09-11) a thumbnail could also fit the whole picture instead of cropping
/// it, and version 3 files written then carry a <c>framing</c> member - <c>"Crop"</c>, or
/// <c>"Fit"</c> with a null crop. That mode was withdrawn and the member is not part of the format:
/// a reader ignores it, so such a file reads exactly like any other version 3 file, and a fitted
/// picture's thumbnail is regenerated as the centred square. Nothing it held is lost: the original
/// is in the archive, and a chosen crop is still in <paramref name="Crop"/>.
/// </summary>
public sealed record BackupEntityImage(
    Guid AssetId,
    string? FileName,
    string ContentType,
    int Width,
    int Height,
    long ByteSize,
    string MediaPath,
    BackupImageCrop? Crop);

/// <summary>
/// The square the entry's thumbnail is cut from, as fractions of the displayed original: X and
/// Width of its width, Y and Height of its height, from the top-left corner.
///
/// To regenerate the thumbnail: orient the original as a browser displays it (EXIF orientation
/// applied for JPEG and PNG, ignored for WebP), round each edge to the nearest pixel, cut that
/// square, and scale it to at most 320 pixels square. Null means the picture predates framing
/// and its thumbnail is the largest centred square.
/// </summary>
public sealed record BackupImageCrop(double X, double Y, double Width, double Height);

/// <summary>
/// One stored value, in the same typed members the live row uses so a null stays a null and
/// never collapses into an empty string or a zero. A multi-select contributes one of these
/// per chosen option, exactly as the table does.
///
/// The value row's own id is absent. It is rewritten every time the entry is saved - which
/// is precisely why ADR 0010 fingerprints the field definition instead - so it identifies
/// nothing worth carrying.
///
/// <paramref name="EraId"/> is the era <paramref name="NumberValue"/> is a year in, or null for
/// a plain number - since version 4.
/// </summary>
public sealed record BackupFieldValue(
    Guid FieldDefinitionId,
    string? TextValue,
    double? NumberValue,
    Guid? EraId,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    Guid? ReferencedEntityId);

/// <summary>
/// One version of one entry, as ADR 0013 recorded it: a full snapshot, carrying both the raw
/// id of everything it references and the text that reference displayed at the time.
///
/// <paramref name="Content"/> is the article as it read then, for a version recorded before articles kept their own
/// history, and null for every version recorded since - which holds no copy of the article and says nothing about it.
/// A reader keeps it as history and never applies it to the article (version 9, ADR 0028).
/// </summary>
public sealed record BackupRevision(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    EntityRevisionChange Changes,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    Guid EntityTypeId,
    string EntityTypeName,
    string Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<BackupRevisionFieldValue> FieldValues);

/// <summary>
/// One value of one version. <paramref name="EraLabel"/> is what was written beside the year at
/// the time, kept with <paramref name="EraId"/> the way every other reference in a version keeps
/// its display text.
/// </summary>
public sealed record BackupRevisionFieldValue(
    Guid FieldDefinitionId,
    string FieldName,
    EntityFieldKind Kind,
    int DisplayOrder,
    string? TextValue,
    double? NumberValue,
    Guid? EraId,
    string? EraLabel,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    string? OptionValue,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName);

/// <summary>
/// One relationship type, with the Canon constraints its author configured (ADR 0023).
///
/// <paramref name="AgeOrder"/>, <paramref name="MinAgeDifferenceYears"/> and
/// <paramref name="MaxAgeDifferenceYears"/> were added within version 4, not as a bump, by the rule on
/// <see cref="UniverseBackup.CurrentVersion"/>. They are rules checked against the lore, not lore: a
/// reader that ignores them loses the checks and misreads no year, link or entry. A type is written
/// with <c>None</c> and two nulls when it has no constraint, and a file written before they existed -
/// where all three are absent - means exactly that.
///
/// <paramref name="FamilySemantic"/> was added in version 14, as a bump (see <see cref="UniverseBackup.CurrentVersion"/>). Written by
/// name, <c>None</c> for a kind with no family meaning; absent, in any earlier file, it means <c>None</c>. <c>NonStructuralFamily</c>
/// exists from version 18.
/// </summary>
public sealed record BackupRelationshipType(
    Guid Id,
    string Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int DisplayOrder,
    RelationshipAgeOrder AgeOrder,
    int? MinAgeDifferenceYears,
    int? MaxAgeDifferenceYears,
    RelationshipFamilySemantic FamilySemantic,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One link, stored once and read from either end (ADR 0008). <paramref name="DeletedAt"/> is when it went to the Trash, or
/// null while it is live (since version 26). <paramref name="Periods"/> are when it holds (since version 28), in order; empty
/// for a timeless link.
/// </summary>
public sealed record BackupRelationship(
    Guid Id,
    Guid RelationshipTypeId,
    Guid SourceEntityId,
    Guid TargetEntityId,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt = null,
    IReadOnlyList<BackupRelationshipPeriod>? Periods = null);

/// <summary>One period of a link (since version 28): a dated span, or one era of either end by its id in this file. Never both.</summary>
public sealed record BackupRelationshipPeriod(
    Guid? EntityEraId,
    BackupChronologyValue? Start,
    BackupChronologyValue? End);

/// <summary>
/// One moment. The date components stay integers with their eras beside them, so a year survives
/// as the number the author typed (ADR 0009) and is never coerced into a Gregorian date.
///
/// <paramref name="StartEraId"/> and <paramref name="EndEraId"/> name the era each year is counted
/// in, on a universe with eras (version 4). Null means a plain signed year, and then
/// <paramref name="EraLabel"/> is the free-text label that reckoning allows.
///
/// <paramref name="Validation"/> is the moment's structured details for world rule checks, or null for a moment with none (since
/// version 13). <paramref name="StoryIds"/> are the stories of this file it is linked to (since version 21), null in an older
/// file. <paramref name="StartMonthId"/> and <paramref name="EndMonthId"/> are months of the file's custom calendar, in place
/// of the numeric months (since version 22). <paramref name="DeletedAt"/> is when the moment went to the Trash, or null while
/// it is live (since version 26).
/// </summary>
public sealed record BackupTimelineEntry(
    Guid Id,
    string Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDateKind DateKind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    Guid? StartEraId,
    Guid? EndEraId,
    string? EraLabel,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<Guid> ParticipantEntityIds,
    BackupTimelineValidation? Validation = null,
    IReadOnlyList<Guid>? StoryIds = null,
    Guid? StartMonthId = null,
    Guid? EndMonthId = null,
    DateTime? DeletedAt = null);

/// <summary>
/// A moment's structured details for world rule checks (since version 13): an event kind and a method from this file's
/// <see cref="UniverseBackupPayload.ValidationTerms"/>, and a participant from its entries - each by id, each optional. No name is
/// carried, and nothing here is derived from the moment's title or its linked entries: the participant is its own reference.
/// </summary>
public sealed record BackupTimelineValidation(Guid? EventKindTermId, Guid? MethodTermId, Guid? ParticipantEntityId);

/// <summary>
/// One story, with its chapters and scenes alongside it so neither travels apart from the story it is
/// told in (since version 5). Authored narrative, not lore: nothing in it is a fact about the world.
///
/// <paramref name="Chapters"/> are in story order (since version 6). Empty means a story with no
/// chapters; absent - null, in a version 5 file - means the same thing.
///
/// <paramref name="Scenes"/> is every scene of the story in reading order: Unchaptered first, then chapter
/// by chapter, each in its own narrative order.
///
/// <paramref name="PlotArcs"/> is the story's plot, arcs in order (since version 7). Empty means a story with no
/// arcs; absent - null, in any earlier file - means the same thing.
///
/// <paramref name="PublicSummary"/> is what its author wrote for readers of the public portal (since version 16); never
/// its publication, address or date.
///
/// <paramref name="DeletedAt"/> is when the story was moved to the Trash, or null while it is live (since version 10).
/// A story in the Trash travels whole - it is authored work its owner can still restore - and what it holds is exactly
/// what it held: nothing inside it is marked on its account.
///
/// The importer (ADR 0032) restores every row with its marker, and puts nothing in the Trash into a live order: in each
/// collection below, a row carrying <c>deletedAt</c> is listed after the live ones and its <c>sortOrder</c> is the place
/// it had, which it no longer holds.
/// </summary>
public sealed record BackupStory(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    IReadOnlyList<BackupChapter>? Chapters,
    IReadOnlyList<BackupScene> Scenes,
    IReadOnlyList<BackupPlotArc>? PlotArcs,
    string? PublicSummary = null);

/// <summary>
/// One chapter (since version 6): its place in the story, from 0, and the author's title, summary and
/// notes. The number a reader sees - "Chapter 3" - is <paramref name="SortOrder"/> plus one and is not
/// carried; neither is anything the chapter holds, because each scene names its chapter itself.
/// <paramref name="DeletedAt"/> is when it went to the Trash (since version 10); a chapter there holds no scene.
/// </summary>
public sealed record BackupChapter(
    Guid Id,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

/// <summary>
/// One scene, carried with its container and its place in it.
///
/// <paramref name="ChapterId"/> is the chapter of this same story the scene is told in, or null for
/// Unchaptered - and null too in a version 5 file, where every scene was. <paramref name="SortOrder"/> is
/// the scene's place inside that container, from 0 (story-wide before version 6, which is the same thing
/// when every scene is Unchaptered). The number is carried so the order is explicit rather than implied by
/// position.
///
/// <paramref name="PovEntityId"/> and <paramref name="LinkedEntityIds"/> are references to entries in
/// this same file, never copies of them: no name, type or picture is carried here. An entry in the
/// Trash may be among them, and is in the file too. <paramref name="Chronology"/> is where the scene
/// happens in the world, or null; it has no bearing on the order.
///
/// <paramref name="Manuscript"/> is the scene's prose (since version 8), carried with the scene it belongs to rather than
/// in a file of its own, or null when nothing has been written for it.
///
/// <paramref name="DeletedAt"/> is when the scene was moved to the Trash, or null while it is live (since version 10). A
/// scene in the Trash carries its prose, versions and links like any other, and its <paramref name="SortOrder"/> holds no
/// place in its container.
/// </summary>
public sealed record BackupScene(
    Guid Id,
    Guid? ChapterId,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    Guid? PovEntityId,
    BackupChronologyValue? Chronology,
    IReadOnlyList<Guid> LinkedEntityIds,
    BackupSceneManuscript? Manuscript,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

/// <summary>
/// One scene's prose (since version 8), exactly as stored: the text with every line break, blank line and character the
/// author wrote, and when it was last saved. Plain text - never HTML, Markdown or an editor's document - and never read
/// for meaning. A scene saved and then emptied carries an empty <paramref name="Content"/>; a scene never written for
/// carries no manuscript at all, and both read as nothing written.
///
/// <paramref name="Revisions"/> is every saved version of the prose, oldest first, the newest being
/// <paramref name="Content"/> (since version 10). The importer re-creates them with their numbers, under new ids, and never
/// applies one to the prose. A browser's unsaved recovery copy is never in a backup: it was never saved.
/// </summary>
public sealed record BackupSceneManuscript(
    string Content,
    DateTime UpdatedAt,
    IReadOnlyList<BackupManuscriptRevision>? Revisions);

/// <summary>
/// One saved version of a scene's manuscript (since version 10): the whole text exactly as saved, or <c>""</c> for a save
/// that emptied it. <paramref name="Kind"/> is <c>Created</c> for the first version, <c>Edited</c> for a save and
/// <c>Restored</c> for a version put back, which names it in <paramref name="RestoredFromRevisionId"/>.
/// </summary>
public sealed record BackupManuscriptRevision(
    Guid Id,
    int Number,
    SceneManuscriptRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);

/// <summary>
/// One plot arc (since version 7): its place in the story's plot, from 0, the author's title, description and
/// notes, and its beats in order. The number a reader sees - "Arc 2" - is <paramref name="SortOrder"/> plus one and
/// is not carried. <paramref name="DeletedAt"/> is when it went to the Trash (since version 10); its beats are
/// carried as they stood, and come back with it.
/// </summary>
public sealed record BackupPlotArc(
    Guid Id,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    IReadOnlyList<BackupPlotBeat> Beats);

/// <summary>
/// One beat (since version 7): its place in its arc, from 0, its text, and what it points at.
///
/// <paramref name="LinkedSceneIds"/> are scenes of this same story and <paramref name="LinkedEntityIds"/> entries
/// in this same file, each list sorted by id so an unchanged plot writes the same bytes. Ids only: no scene title,
/// chapter, entry name or number is carried, so a scene that moved chapter is still the scene the beat names. A
/// trashed entry may be among them, and is in the file too, and so may a scene in the Trash. The beat's order has no
/// bearing on any scene's. <paramref name="DeletedAt"/> is when the beat went to the Trash (since version 10).
/// </summary>
public sealed record BackupPlotBeat(
    Guid Id,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    IReadOnlyList<Guid> LinkedSceneIds,
    IReadOnlyList<Guid> LinkedEntityIds,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

/// <summary>
/// One idea that belongs to this universe (since version 11): a possibility the author kept, never lore. Nothing in it is a
/// fact about the world, and a reader must never turn it into an entry, a relationship, a moment or Canon.
///
/// <paramref name="Body"/> is plain text exactly as stored, <c>""</c> when there is none. <paramref name="DeletedAt"/> is when
/// it was deleted, or null while it is live; a deleted idea travels whole, because it can still be restored.
///
/// <paramref name="References"/> point at content in this same file by kind and id, sorted by kind and then id; no name is
/// carried. The owning account is not in the file: an importer gives the idea to the importing account and associates it
/// with the universe being restored, re-creates each reference whose target is in the file, and never attaches the idea to
/// any other universe. A browser's unsaved recovery copy of an idea is never in a backup: it was never saved.
/// </summary>
public sealed record BackupIdea(
    Guid Id,
    string Title,
    string Body,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    IReadOnlyList<BackupIdeaReference> References);

/// <summary>One reference of an idea: what the target is, stated explicitly, and its id.</summary>
public sealed record BackupIdeaReference(IdeaReferenceKind Kind, Guid Id);

/// <summary>
/// One world rule of this universe (since version 12): an explicit statement, in the author's words, about how the world works.
/// Text and nothing else - no meaning, status, finding or validation result is carried, because none exists: nothing reads a
/// rule's words.
///
/// <paramref name="Description"/> is plain text exactly as stored, <c>""</c> when there is none. <paramref name="DeletedAt"/> is
/// when the rule was moved to the Trash, or null while it is live; a rule in the Trash travels whole, because it can still be
/// restored. The importer (ADR 0032) gives the rule a new id in the universe being restored, keeps its marker and moments, and
/// its search index is derived again from the row.
///
/// <paramref name="Validation"/> is the rule's structured check, or null for a rule that is words only (since version 13). What the
/// check finds is never carried: it is counted again from the restored moments, and a Canon finding it raised is derived again,
/// with its dismissal re-applied like any other.
/// </summary>
public sealed record BackupWorldRule(
    Guid Id,
    string Title,
    string Description,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    BackupWorldRuleValidation? Validation = null);

/// <summary>
/// A world rule's structured check (since version 13): the one supported pattern, the event kind and method it limits by id from
/// this file's <see cref="UniverseBackupPayload.ValidationTerms"/>, and the limit.
/// </summary>
public sealed record BackupWorldRuleValidation(
    WorldRuleValidationKind Kind,
    Guid EventKindTermId,
    Guid MethodTermId,
    int MaxOccurrences);

/// <summary>
/// One event kind or method of the universe (since version 13). The id is preserved because checks and moments name it; the kind
/// is explicit, and the name is what an author reads. Two terms of one kind never share a name, compared case-insensitively.
/// </summary>
public sealed record BackupValidationTerm(
    Guid Id,
    ValidationTermKind Kind,
    string Name,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// A position on the universe's line: the era the year is counted in - null on the plain reckoning -
/// and the numbers. Nothing formatted is carried; the eras in the same file say how to write it. <paramref name="MonthId"/>
/// is a month of the file's custom calendar, in place of <paramref name="Month"/> (since version 22).
/// </summary>
public sealed record BackupChronologyValue(Guid? EraId, int Year, int? Month, int? Day, Guid? MonthId = null);

/// <summary>
/// The one piece of Canon Integrity that is not rebuildable: the author's decision to live
/// with a problem.
///
/// Conflicts themselves are derived findings and the whole table regenerates from the lore
/// by evaluating again (ADR 0010) - so nothing pending or resolved is carried. A dismissal
/// is not derived, and the fingerprint is enough to re-apply it, because it hashes only the
/// rule code and the ids of the records at fault, all of which this backup preserves.
/// </summary>
public sealed record BackupDismissedConflict(
    string RuleCode,
    CanonConflictSeverity Severity,
    string Fingerprint,
    DateTime DismissedAt);
