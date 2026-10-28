using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Every table the model holds has a stated place in a universe backup (ADR 0014): carried, derived again from what is
/// carried, or left out on purpose. <see cref="BackupRoundTripTests"/> compares an export with the export of its own
/// restore, so a table no export ever reads is missing from both sides and passes; this is what fails instead. A new entity
/// type is unclassified until someone decides, here, what a backup does with it - and if the answer is "carried", the
/// export, validation and restore have to be written as well.
/// </summary>
public sealed class BackupInventoryTests
{
    /// <summary>Written to the archive by <c>UniverseBackupBuilder</c> and put back by <c>UniverseRestore</c>.</summary>
    private static readonly string[] Carried =
    [
        "Universes",
        "UniverseArtworks",

        // Lore and its schema.
        "EntityTypes",
        "EntityTypeGroups",
        "EntityTypeGroupMembers",
        "EntityFieldDefinitions",
        "EntityFieldOptions",
        "EntityFieldSections",
        "Entities",
        "EntityAliases",
        "Tags",
        "EntityTags",
        "EntityFieldValues",
        "EntityArticles",
        "EntityArticleRevisions",
        "EntityImages",
        "EntityPrivateNotes",
        "EntityRevisions",
        "EntityRevisionAliases",
        "EntityRevisionFieldValues",
        "EntityRevisionTags",
        "KnowledgeRecords",

        // Progression: eras, forms, abilities, appearances and what each is tied to.
        "EntityProgressions",
        "EntityProgressionRevisions",
        "EntityEras",
        "EntityEraScenes",
        "EntityEraStories",
        "EntityEraFieldValues",
        "EntityForms",
        "EntityFormEras",
        "EntityFormScenes",
        "EntityAbilities",
        "EntityAbilityEras",
        "EntityAbilityForms",
        "EntityAbilityScenes",
        "EntityAppearances",
        "EntityAppearanceEras",
        "EntityAppearanceForms",
        "EntityAppearanceScenes",
        "EntityAppearanceImages",

        // Relationships, chronology, timeline and rules.
        "RelationshipTypes",
        "Relationships",
        "RelationshipPeriods",
        "ChronologyEras",
        "ChronologyCalendars",
        "ChronologyCalendarMonths",
        "TimelineEntries",
        "TimelineEntryLinks",
        "TimelineEntryStories",
        "TimelineEntryValidations",
        "ValidationTerms",
        "WorldRules",
        "WorldRuleValidations",

        // Stories.
        "Stories",
        "Chapters",
        "Scenes",
        "SceneEntityLinks",
        "SceneManuscripts",
        "SceneManuscriptRevisions",
        "PlotArcs",
        "PlotBeats",
        "PlotBeatEntities",
        "PlotBeatScenes",

        // The ideas that belong to this universe (unassigned ideas have no backup: ADR 0030).
        "Ideas",
        "IdeaEntityReferences",
        "IdeaPlotArcReferences",
        "IdeaPlotBeatReferences",
        "IdeaSceneReferences",
        "IdeaStoryReferences",

        // The idea boards that belong to this universe (ADR 0066).
        "IdeaBoards",
        "IdeaBoardCards",
        "IdeaBoardConnections",

        // Maps.
        "UniverseMaps",
        "MapPins",
        "MapCalibrations",

        // Only the dismissals: the author's judgement, which nothing re-derives (ADR 0014).
        "CanonConflicts",
    ];

    /// <summary>Not in the archive because LorEvolve produces it again from what is.</summary>
    private static readonly (string Table, string Why)[] Derived =
    [
        ("CanonConflictSubjects", "a finding's subjects are re-detected by the next evaluation (ADR 0014)"),
        ("McpUniverseAliases", "made the first time Connect to AI is opened for the restored universe (ADR 0062)"),
        ("EntitySearchMatch", "a keyless FTS5 query shape, not a table (ADR 0016)"),
        ("EntitySearchFieldMatch", "a keyless FTS5 query shape, not a table (ADR 0016)"),
        ("UniverseSearchMatch", "a keyless FTS5 query shape, not a table (ADR 0031)"),
    ];

    /// <summary>Not in the archive on purpose: accounts, access, review state and operational rows, never the world.</summary>
    private static readonly (string Table, string Why)[] LeftOut =
    [
        ("AspNetUsers", "identity tables are not the world (ADR 0014)"),
        ("FeedbackReports", "bug reports and feature requests sent to the Admin, not the world"),
        ("UniverseAiHelpOff", "a workspace display preference; a restored universe starts with AI help on"),

        ("AspNetRoles", "identity tables are not the world (ADR 0014)"),
        ("AspNetRoleClaims", "identity tables are not the world (ADR 0014)"),
        ("AspNetUserClaims", "identity tables are not the world (ADR 0014)"),
        ("AspNetUserLogins", "identity tables are not the world (ADR 0014)"),
        ("AspNetUserRoles", "identity tables are not the world (ADR 0014)"),
        ("AspNetUserTokens", "identity tables are not the world (ADR 0014)"),
        ("ProfileImages", "an account's photo, not a universe's (ADR 0021)"),
        ("StorageReservations", "a short-lived quota hold (ADR 0042)"),
        ("AdminAuditRecords", "platform administration, not a universe (ADR 0059)"),
        ("UniverseMemberships", "account access metadata (ADR 0041)"),
        ("UniverseInvitations", "account access metadata (ADR 0041)"),
        ("CommentThreads", "private collaboration metadata about accounts (ADR 0041)"),
        ("Comments", "private collaboration metadata about accounts (ADR 0041)"),
        ("SuggestedChanges", "private review metadata about accounts (ADR 0044)"),
        ("AiChangeProposals", "review state about accounts and connections (ADR 0047)"),
        ("AiChangeOperations", "review state about accounts and connections (ADR 0047)"),
        ("AiChangeMedia", "quarantined pictures of pending AI changes (ADR 0062)"),
        ("McpConnections", "account-level authorization state (ADR 0046)"),
        ("OpenIddictApplications", "account-level authorization state (ADR 0046)"),
        ("OpenIddictAuthorizations", "account-level authorization state (ADR 0046)"),
        ("OpenIddictScopes", "account-level authorization state (ADR 0046)"),
        ("OpenIddictTokens", "account-level authorization state (ADR 0046)"),
    ];

    [Fact]
    public void Every_table_is_carried_derived_or_left_out_on_purpose()
    {
        var model = ModelTables();
        var classified = Carried.Concat(Derived.Select(row => row.Table)).Concat(LeftOut.Select(row => row.Table)).ToList();

        // Exactly one place each: a table cannot be both carried and left out.
        Assert.Empty(classified.GroupBy(name => name, StringComparer.Ordinal).Where(group => group.Count() > 1).Select(group => group.Key));

        // A new table needs a decision; a dropped one needs its line removed, so the lists never describe a schema that is gone.
        Assert.Empty(model.Except(classified, StringComparer.Ordinal).Order(StringComparer.Ordinal));
        Assert.Empty(classified.Except(model, StringComparer.Ordinal).Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Every_table_kept_out_of_a_backup_says_why()
    {
        Assert.All(Derived.Concat(LeftOut), row => Assert.False(string.IsNullOrWhiteSpace(row.Why), row.Table));
    }

    /// <summary>Each entity type by its table, or by its CLR name when it maps to none (a keyless query shape).</summary>
    private static List<string> ModelTables()
    {
        using var db = new LorEvolveDbContext(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite("Data Source=:memory:").Options);
        return [.. db.Model.GetEntityTypes().Select(entity => entity.GetTableName() ?? entity.ClrType.Name).Distinct(StringComparer.Ordinal)];
    }
}
