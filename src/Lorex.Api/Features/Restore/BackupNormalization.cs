using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// Turns a backup of any supported version into one shape: the current one, with every collection
/// present and every older meaning made explicit. The writer only ever sees this shape, so there is
/// one restore path, not one per version (ADR 0032).
///
/// Two passes, either side of validation.
///
/// <see cref="Project"/> first reads the payload the way its own version defines it. A member that
/// version did not have is taken as absent even if the file carries one: the version number is what
/// says what the file means (ADR 0014), so a version 4 file holding <c>stories</c> was not written by
/// Lorex and its stories are not part of what it claims to be.
///
/// <see cref="Normalize"/> then, on a payload validation has accepted, fills in what an older version
/// left implicit, each exactly as the migration that introduced it did to a live database:
/// <list type="bullet">
/// <item>Version 1: every entry is live.</item>
/// <item>Versions 1-3: a type's icon is kept when it is a known key after trimming and lowercasing, and
/// cleared otherwise (<c>RestrictEntityTypeIconKeys</c>, ADR 0020).</item>
/// <item>Versions 1-3: no eras, so every year is a plain signed year; no relationship constraint.</item>
/// <item>Versions 1-4: no stories. Version 5: every scene is Unchaptered, its story-wide order its order
/// there. Version 6: no plot. Version 7: no prose.</item>
/// <item>Versions 1-8: <c>content</c> is the article, which becomes the article's row with the entry's
/// <c>updatedAt</c> and its version 1 (<c>AddEntityArticles</c>, ADR 0028). Each entry revision's
/// <c>content</c> is the article as it read then, kept as history exactly as the migration kept it.</item>
/// <item>Versions 1-9: nothing is in the Trash, and each manuscript becomes its own version 1
/// (<c>AddContentRecovery</c>, ADR 0029).</item>
/// <item>Versions 1-10: no ideas.</item>
/// <item>Versions 1-11: no world rules (<c>AddWorldRules</c>, ADR 0033).</item>
/// <item>Versions 1-12: no event kinds or methods, no rule checked, no moment described (<c>AddRuleValidation</c>, ADR 0034). In
/// every version, a check of kind <c>None</c> is no check and a moment's details with no part are no details.</item>
/// <item>Versions 1-13: no relation kind has a family meaning, even when the file carries one, and none is ever read from a kind's
/// name (<c>AddRelationshipFamilySemantics</c>, ADR 0035).</item>
/// <item>Versions 1-14: no public summary, category, genre or artwork, even when the file carries them (<c>AddUniversePublication</c>,
/// ADR 0036). In every version the restored universe is private: no version of the format can say otherwise.</item>
/// <item>Versions 1-15: no story has a public summary, even when the file carries one, and none is ever taken from a
/// premise (<c>AddPublicReading</c>, Task 011). In every version every restored entry and story is private.</item>
/// <item>Versions 1-16: the universe is its author's own - no original creator or work, even when the file carries them
/// (<c>AddStoryContentPublication</c>, ADR 0039). In every version every restored scene, manuscript and plot arc is
/// private: no version of the format carries a selection.</item>
/// <item>Versions 1-17: a type is enabled for the Family Tree only when it is the untouched starter Character, even when the file
/// carries a value - the rule <c>AddEntityTypeFamilyTreeEligibility</c> applied to a live database, never a name alone (ADR 0040).
/// A family meaning those versions could not hold is refused by validation, never read as a parent link.</item>
/// <item>Versions 1-21: no custom calendar, even when the file carries one, so every date is a simple date with a numeric
/// month. A month id in such a file names a calendar it does not have, and validation refuses it.</item>
/// <item>Versions 1-22: no type groups, even when the file carries some, and none is ever inferred from type names. A group
/// target in such a file is refused by validation, never read as open to any type.</item>
/// </list>
///
/// One thing is normalized for every version: the live rows of each ordered collection are numbered
/// 0, 1, 2… in the order their stored numbers put them. A backup Lorex wrote is already numbered that
/// way, so this changes nothing in one; it only means a file with a gap still restores in its order
/// rather than leaving the next append to collide. Two live rows claiming one place are refused by
/// validation - which of them comes first cannot be known.
/// </summary>
internal static class BackupNormalization
{
    // ---------- Reading a payload as its version defines it ----------

    public static UniverseBackupPayload Project(UniverseBackupPayload payload, int version) => payload with
    {
        Universe = payload.Universe is null
            ? payload.Universe!
            : version >= 17
                ? payload.Universe
                : version >= 15
                    ? payload.Universe with { OriginalCreator = null, OriginalWork = null }
                    : payload.Universe with { PublicSummary = null, Category = null, Genres = null, Artwork = null, OriginalCreator = null, OriginalWork = null },
        ChronologyEras = version >= 4 ? payload.ChronologyEras : null,
        // Before 19 there is no hierarchy: every type is a root, in its stored order, whatever it is called.
        EntityTypes = version >= 19 || payload.EntityTypes is null
            ? payload.EntityTypes!
            : [.. payload.EntityTypes.Select(type => type is null
                ? null!
                : version >= 18
                    ? type with { ParentId = null }
                    : type with
                    {
                        ParentId = null,
                        FamilyTreeEligible = type.Name is not null
                            && EntityTypeDefaults.IsUntouchedStarterCharacter(type.Name, type.Description, type.Icon, type.AccentColor),
                    })],
        Entities = payload.Entities is null ? null! : [.. payload.Entities.Select(entity => entity is null ? null! : ProjectEntity(entity, version))],
        RelationshipTypes = version >= 14 || payload.RelationshipTypes is null
            ? payload.RelationshipTypes!
            : [.. payload.RelationshipTypes.Select(type => type is null ? null! : ProjectRelationshipType(type, version))],
        TimelineEntries = version >= 13 || payload.TimelineEntries is null
            ? payload.TimelineEntries!
            : [.. payload.TimelineEntries.Select(entry => entry is null
                ? null!
                : entry with
                {
                    StartEraId = version >= 4 ? entry.StartEraId : null,
                    EndEraId = version >= 4 ? entry.EndEraId : null,
                    Validation = null,
                })],
        Stories = version >= 5 && payload.Stories is not null
            ? [.. payload.Stories.Select(story => story is null ? null! : ProjectStory(story, version))]
            : null,
        Ideas = version >= 11 ? payload.Ideas : null,
        WorldRules = version < 12 || payload.WorldRules is null
            ? null
            : version >= 13
                ? payload.WorldRules
                : [.. payload.WorldRules.Select(rule => rule is null ? null! : rule with { Validation = null })],
        ValidationTerms = version >= 13 ? payload.ValidationTerms : null,
        ChronologyCalendar = version >= 22 ? payload.ChronologyCalendar : null,
        EntityTypeGroups = version >= 23 ? payload.EntityTypeGroups : null,
    };

    /// <summary>Constraints from version 4, a family meaning from version 14 - never taken from what a kind is called.</summary>
    private static BackupRelationshipType ProjectRelationshipType(BackupRelationshipType type, int version) => type with
    {
        AgeOrder = version >= 4 ? type.AgeOrder : RelationshipAgeOrder.None,
        MinAgeDifferenceYears = version >= 4 ? type.MinAgeDifferenceYears : null,
        MaxAgeDifferenceYears = version >= 4 ? type.MaxAgeDifferenceYears : null,
        FamilySemantic = RelationshipFamilySemantic.None,
    };

    private static BackupEntity ProjectEntity(BackupEntity entity, int version) => entity with
    {
        DeletedAt = version >= 2 ? entity.DeletedAt : null,
        Image = version >= 3 ? entity.Image : null,
        ArticleUpdatedAt = version >= 9 ? entity.ArticleUpdatedAt : null,
        ArticleRevisions = version >= 9 ? entity.ArticleRevisions : null,
        FieldValues = version >= 4 || entity.FieldValues is null
            ? entity.FieldValues!
            : [.. entity.FieldValues.Select(value => value is null ? null! : value with { EraId = null })],
        Revisions = version >= 4 || entity.Revisions is null
            ? entity.Revisions!
            : [.. entity.Revisions.Select(revision => revision is null || revision.FieldValues is null
                ? revision!
                : revision with
                {
                    FieldValues = [.. revision.FieldValues.Select(value => value is null ? null! : value with { EraId = null, EraLabel = null })],
                })],
    };

    private static BackupStory ProjectStory(BackupStory story, int version) => story with
    {
        DeletedAt = version >= 10 ? story.DeletedAt : null,
        PublicSummary = version >= 16 ? story.PublicSummary : null,
        Chapters = version >= 6 && story.Chapters is not null
            ? [.. story.Chapters.Select(chapter => chapter is null ? null! : chapter with { DeletedAt = version >= 10 ? chapter.DeletedAt : null })]
            : version >= 6 ? null : [],
        Scenes = story.Scenes is null
            ? null!
            : [.. story.Scenes.Select(scene => scene is null
                ? null!
                : scene with
                {
                    ChapterId = version >= 6 ? scene.ChapterId : null,
                    DeletedAt = version >= 10 ? scene.DeletedAt : null,
                    Manuscript = version < 8 || scene.Manuscript is null
                        ? null
                        : scene.Manuscript with { Revisions = version >= 10 ? scene.Manuscript.Revisions : null },
                })],
        PlotArcs = version >= 7 && story.PlotArcs is not null
            ? [.. story.PlotArcs.Select(arc => arc is null
                ? null!
                : arc with
                {
                    DeletedAt = version >= 10 ? arc.DeletedAt : null,
                    Beats = arc.Beats is null
                        ? null!
                        : [.. arc.Beats.Select(beat => beat is null ? null! : beat with { DeletedAt = version >= 10 ? beat.DeletedAt : null })],
                })]
            : version >= 7 ? null : [],
    };

    // ---------- Filling in what an older version left implicit ----------

    public static UniverseBackupPayload Normalize(UniverseBackupPayload payload, int version) => payload with
    {
        ChronologyEras = Renumber(payload.ChronologyEras ?? [], _ => true, era => era.SortOrder, (era, order) => era with { SortOrder = order }),
        ChronologyCalendar = payload.ChronologyCalendar is { } calendar
            ? calendar with { Months = Renumber(calendar.Months, _ => true, month => month.SortOrder, (month, order) => month with { SortOrder = order }) }
            : null,
        EntityTypes = version >= 4
            ? payload.EntityTypes
            : [.. payload.EntityTypes.Select(type => type with { Icon = LegacyIcon(type.Icon) })],
        Entities = [.. payload.Entities.Select(entity => NormalizeEntity(entity, version))],
        Stories = [.. (payload.Stories ?? []).Select(story => NormalizeStory(story, version))],
        Ideas = payload.Ideas ?? [],
        WorldRules = [.. (payload.WorldRules ?? []).Select(rule => rule.Validation is { Kind: WorldRuleValidationKind.None } ? rule with { Validation = null } : rule)],
        ValidationTerms = payload.ValidationTerms ?? [],
        EntityTypeGroups = payload.EntityTypeGroups ?? [],
        TimelineEntries =
        [
            .. payload.TimelineEntries.Select(entry =>
                entry.Validation is { EventKindTermId: null, MethodTermId: null, ParticipantEntityId: null } ? entry with { Validation = null } : entry),
        ],
        DismissedConflicts = [.. payload.DismissedConflicts.DistinctBy(conflict => conflict.Fingerprint, StringComparer.Ordinal)],
    };

    /// <summary>A version 1-3 icon, brought inside the closed set the way the migration brought a stored one.</summary>
    internal static string? LegacyIcon(string? icon) =>
        icon?.Trim().ToLowerInvariant() is { Length: > 0 } key && EntityTypeIcons.IsKnown(key) ? key : null;

    private static BackupEntity NormalizeEntity(BackupEntity entity, int version)
    {
        if (version >= 9)
        {
            return entity with { ArticleRevisions = entity.ArticleRevisions ?? [] };
        }

        // Before version 9 the article lived on the entry. A blank one was never an article: the migration moved only
        // text that was not blank, and made what it moved version 1 of the article's own history, dated as the entry was.
        if (string.IsNullOrWhiteSpace(entity.Content))
        {
            return entity with { Content = null, ArticleUpdatedAt = null, ArticleRevisions = [] };
        }

        return entity with
        {
            ArticleUpdatedAt = entity.UpdatedAt,
            ArticleRevisions =
            [
                new BackupArticleRevision(Guid.NewGuid(), 1, EntityRevisionKind.Created, null, entity.UpdatedAt, entity.Content),
            ],
        };
    }

    private static BackupStory NormalizeStory(BackupStory story, int version)
    {
        var chapters = Renumber(
            story.Chapters ?? [],
            chapter => chapter.DeletedAt is null,
            chapter => chapter.SortOrder,
            (chapter, order) => chapter with { SortOrder = order });

        // Scene order is per container: each chapter, and Unchaptered, numbers its live scenes on its own.
        var scenes = story.Scenes
            .Select(scene => version >= 10 || scene.Manuscript is null
                ? scene
                : scene with
                {
                    Manuscript = scene.Manuscript with
                    {
                        Revisions =
                        [
                            new BackupManuscriptRevision(
                                Guid.NewGuid(),
                                1,
                                SceneManuscriptRevisionKind.Created,
                                null,
                                scene.Manuscript.UpdatedAt,
                                scene.Manuscript.Content),
                        ],
                    },
                })
            .ToList();

        foreach (var container in scenes.Where(scene => scene.DeletedAt is null).Select(scene => scene.ChapterId).Distinct().ToList())
        {
            scenes = [.. Renumber(
                scenes,
                scene => scene.DeletedAt is null && scene.ChapterId == container,
                scene => scene.SortOrder,
                (scene, order) => scene with { SortOrder = order })];
        }

        var arcs = Renumber(
            story.PlotArcs ?? [],
            arc => arc.DeletedAt is null,
            arc => arc.SortOrder,
            (arc, order) => arc with { SortOrder = order });

        return story with
        {
            Chapters = chapters,
            Scenes = scenes,
            PlotArcs =
            [
                .. arcs.Select(arc => arc with
                {
                    Beats = Renumber(
                        arc.Beats,
                        beat => beat.DeletedAt is null,
                        beat => beat.SortOrder,
                        (beat, order) => beat with { SortOrder = order }),
                }),
            ],
        };
    }

    /// <summary>
    /// Numbers the rows <paramref name="counts"/> selects 0, 1, 2… in the order their stored numbers put them,
    /// ties broken by where they sit in the file; every other row is left exactly as it was.
    /// </summary>
    private static IReadOnlyList<T> Renumber<T>(
        IReadOnlyList<T> rows,
        Func<T, bool> counts,
        Func<T, int> order,
        Func<T, int, T> renumbered)
    {
        var places = rows
            .Select((row, index) => (Row: row, Index: index))
            .Where(item => counts(item.Row))
            .OrderBy(item => order(item.Row))
            .ThenBy(item => item.Index)
            .Select((item, place) => (item.Index, Place: place))
            .ToDictionary(item => item.Index, item => item.Place);

        return [.. rows.Select((row, index) => places.TryGetValue(index, out var place) && order(row) != place ? renumbered(row, place) : row)];
    }
}
