namespace Lorex.Api.Tests;

/// <summary>
/// Schema objects that migrations later than the one a migration test rolls back over add, so a rollback past them is
/// expected to take them too. A migration test compares what it read at the latest schema with what is left after rolling
/// back; these are left out of the first list before comparing. Not a test.
/// </summary>
internal static class LaterSchema
{
    /// <summary>Nested types (AddEntityTypeHierarchy, 2026-10-01): an index and three triggers on <c>EntityTypes</c>.</summary>
    private static readonly string[] NestedTypes =
    [
        "IX_EntityTypes_UniverseId_ParentId",
        "EntityTypes_ParentInUniverse_Insert",
        "EntityTypes_ParentInUniverse_Update",
        "EntityTypes_KeepsChildren_Delete",
    ];

    /// <summary>Memberships (AddUniverseMemberships, 2026-10-02, ADR 0041): a table, its key's index and one index.</summary>
    private static readonly string[] Memberships =
    [
        "sqlite_autoindex_UniverseMemberships_1",
        "IX_UniverseMemberships_UserId",

        // Invitations (AddUniverseInvitations, 2026-10-02, ADR 0041 amendment).
        "sqlite_autoindex_UniverseInvitations_1",
        "IX_UniverseInvitations_TargetUserId",
        "IX_UniverseInvitations_UniverseId_NormalizedEmail",
    ];

    /// <summary>A link field's allowed type (AddEntityReferenceTargetType, 2026-10-05, 036): its key's index.</summary>
    private static readonly string[] ReferenceTargets =
    [
        "IX_EntityFieldDefinitions_TargetEntityTypeId",
    ];

    /// <summary>A moment's stories (AddTimelineEntryStories, 2026-10-05, 038): a table, its key's index and one index.</summary>
    private static readonly string[] TimelineStories =
    [
        "sqlite_autoindex_TimelineEntryStories_1",
        "IX_TimelineEntryStories_StoryId",
    ];

    /// <summary>Custom calendars (AddChronologyCalendars, 2026-10-05, 039): two tables, their keys' and other indexes, and the three month references' indexes.</summary>
    private static readonly string[] Calendars =
    [
        "sqlite_autoindex_ChronologyCalendarMonths_1",
        "sqlite_autoindex_ChronologyCalendars_1",
        "IX_ChronologyCalendarMonths_CalendarId_SortOrder",
        "IX_ChronologyCalendars_UniverseId",
        "IX_Scenes_MonthId",
        "IX_TimelineEntries_EndMonthId",
        "IX_TimelineEntries_StartMonthId",
    ];

    /// <summary>Account storage (AddAccountStorageQuota, 2026-10-06, ADR 0042): the reservations table, its key's index and one index.</summary>
    private static readonly string[] Storage =
    [
        "sqlite_autoindex_StorageReservations_1",
        "IX_StorageReservations_UserId_ExpiresAt",
    ];

    /// <summary>Review comments (AddCommentThreads, 2026-10-13, task 043): two tables, their keys' indexes and four indexes.</summary>
    private static readonly string[] Comments =
    [
        "sqlite_autoindex_CommentThreads_1",
        "sqlite_autoindex_Comments_1",
        "IX_CommentThreads_EntityId",
        "IX_CommentThreads_SceneId",
        "IX_CommentThreads_StoryId",
        "IX_Comments_ThreadId",
    ];

    /// <summary>Suggested changes (AddSuggestedChanges, 2026-10-14, task 045): a table, its key's index and four key indexes.</summary>
    private static readonly string[] Suggestions =
    [
        "sqlite_autoindex_SuggestedChanges_1",
        "IX_SuggestedChanges_EntityId",
        "IX_SuggestedChanges_SceneId",
        "IX_SuggestedChanges_StoryId",
    ];

    /// <summary>MCP (AddMcpConnections, 2026-10-19, ADR 0046): five tables, their keys' indexes and nine indexes.</summary>
    private static readonly string[] Mcp =
    [
        "sqlite_autoindex_McpConnections_1",
        "sqlite_autoindex_OpenIddictApplications_1",
        "sqlite_autoindex_OpenIddictAuthorizations_1",
        "sqlite_autoindex_OpenIddictScopes_1",
        "sqlite_autoindex_OpenIddictTokens_1",
        "IX_McpConnections_AuthorizationId",
        "IX_McpConnections_UniverseId",
        "IX_McpConnections_UserId_UniverseId_ClientId",
        "IX_OpenIddictApplications_ClientId",
        "IX_OpenIddictAuthorizations_ApplicationId_Status_Subject_Type",
        "IX_OpenIddictScopes_Name",
        "IX_OpenIddictTokens_ApplicationId_Status_Subject_Type",
        "IX_OpenIddictTokens_AuthorizationId",
        "IX_OpenIddictTokens_ReferenceId",
    ];

    /// <summary>
    /// Semantic type groups (AddEntityTypeGroups, 2026-10-19, Issue #36): two tables, their keys' indexes, three indexes and four
    /// triggers.
    /// </summary>
    private static readonly string[] TypeGroups =
    [
        "sqlite_autoindex_EntityTypeGroupMembers_1",
        "sqlite_autoindex_EntityTypeGroups_1",
        "IX_EntityFieldDefinitions_TargetGroupId",
        "IX_EntityTypeGroupMembers_EntityTypeId",
        "IX_EntityTypeGroups_UniverseId_Name",
        "EntityTypeGroupMembers_SameUniverse_Insert",
        "EntityTypeGroupMembers_SameUniverse_Update",
        "EntityFieldDefinitions_TargetGroup_Insert",
        "EntityFieldDefinitions_TargetGroup_Update",
    ];

    /// <summary>
    /// A field's version and its history checks (AddEntityFieldVersion, 2026-10-20, Issue #39): two indexes on
    /// <c>EntityRevisionFieldValues</c>, by field and by choice.
    /// </summary>
    private static readonly string[] FieldHistory =
    [
        "IX_EntityRevisionFieldValues_FieldDefinitionId",
        "IX_EntityRevisionFieldValues_OptionId",
    ];

    /// <summary>Pending AI Changes (AddAiChangeProposals, 2026-10-23, ADR 0047): two tables, their keys' indexes and four indexes.</summary>
    private static readonly string[] AiChanges =
    [
        "sqlite_autoindex_AiChangeOperations_1",
        "sqlite_autoindex_AiChangeProposals_1",
        "IX_AiChangeOperations_ProposalId_Key",
        "IX_AiChangeOperations_ProposalId_Sequence",
        "IX_AiChangeProposals_ProposedByUserId_Status",
        "IX_AiChangeProposals_UniverseId_Status_CreatedAt",
    ];

    /// <summary>
    /// Relationships and moments in the Trash (AddRelationshipAndTimelineTrash, 2026-10-23, ADR 0048): one index on each table.
    /// </summary>
    private static readonly string[] LinkTrash =
    [
        "IX_Relationships_UniverseId_DeletedAt",
        "IX_TimelineEntries_UniverseId_DeletedAt",
    ];

    /// <summary>
    /// An entry's progression (AddEntityProgression, 2026-10-24, Issue #41): six tables, their keys' indexes and thirteen indexes.
    /// </summary>
    private static readonly string[] Progression =
    [
        "sqlite_autoindex_EntityEraFieldValues_1",
        "sqlite_autoindex_EntityEraScenes_1",
        "sqlite_autoindex_EntityEraStories_1",
        "sqlite_autoindex_EntityEras_1",
        "sqlite_autoindex_EntityProgressionRevisions_1",
        "sqlite_autoindex_EntityProgressions_1",
        "IX_EntityEraFieldValues_EntityEraId_FieldDefinitionId",
        "IX_EntityEraFieldValues_EraId",
        "IX_EntityEraFieldValues_FieldDefinitionId",
        "IX_EntityEraFieldValues_OptionId",
        "IX_EntityEraFieldValues_ReferencedEntityId",
        "IX_EntityEraScenes_SceneId",
        "IX_EntityEraStories_StoryId",
        "IX_EntityEras_EndEraId",
        "IX_EntityEras_EndMonthId",
        "IX_EntityEras_EntityId_SortOrder",
        "IX_EntityEras_StartEraId",
        "IX_EntityEras_StartMonthId",
        "IX_EntityProgressionRevisions_EntityId_Number",
    ];

    /// <summary>Relationship periods (AddRelationshipPeriods, 2026-10-24, Issue #18): a table, its key's index and six indexes.</summary>
    private static readonly string[] Periods =
    [
        "sqlite_autoindex_RelationshipPeriods_1",
        "IX_RelationshipPeriods_EndEraId",
        "IX_RelationshipPeriods_EndMonthId",
        "IX_RelationshipPeriods_EntityEraId",
        "IX_RelationshipPeriods_RelationshipId_SortOrder",
        "IX_RelationshipPeriods_StartEraId",
        "IX_RelationshipPeriods_StartMonthId",
    ];

    /// <summary>Forms and abilities (AddEntityFormsAndAbilities, 2026-10-24, Issue #42): seven tables, their keys' indexes and thirteen indexes.</summary>
    private static readonly string[] Forms =
    [
        "sqlite_autoindex_EntityAbilities_1",
        "sqlite_autoindex_EntityAbilityEras_1",
        "sqlite_autoindex_EntityAbilityForms_1",
        "sqlite_autoindex_EntityAbilityScenes_1",
        "sqlite_autoindex_EntityFormEras_1",
        "sqlite_autoindex_EntityFormScenes_1",
        "sqlite_autoindex_EntityForms_1",
        "IX_EntityAbilities_EntityId_SortOrder",
        "IX_EntityAbilities_UnlockEntityEraId",
        "IX_EntityAbilities_UnlockSceneId",
        "IX_EntityAbilities_UnlockTimelineEntryId",
        "IX_EntityAbilityEras_EntityEraId",
        "IX_EntityAbilityForms_EntityFormId",
        "IX_EntityAbilityScenes_SceneId",
        "IX_EntityFormEras_EntityEraId",
        "IX_EntityFormScenes_SceneId",
        "IX_EntityForms_EntityId_SortOrder",
        "IX_EntityForms_UnlockEntityEraId",
        "IX_EntityForms_UnlockSceneId",
        "IX_EntityForms_UnlockTimelineEntryId",
    ];

    /// <summary>Appearances (AddEntityAppearances, 2026-10-24, Issue #43): five tables, their keys' indexes and five indexes.</summary>
    private static readonly string[] Looks =
    [
        "sqlite_autoindex_EntityAppearanceEras_1",
        "sqlite_autoindex_EntityAppearanceForms_1",
        "sqlite_autoindex_EntityAppearanceImages_1",
        "sqlite_autoindex_EntityAppearanceScenes_1",
        "sqlite_autoindex_EntityAppearances_1",
        "IX_EntityAppearanceEras_EntityEraId",
        "IX_EntityAppearanceForms_EntityFormId",
        "IX_EntityAppearanceImages_EntityAppearanceId_SortOrder",
        "IX_EntityAppearanceScenes_SceneId",
        "IX_EntityAppearances_EntityId_SortOrder",
    ];

    /// <summary>
    /// Field sections (AddEntityFieldSections, 2026-10-24, Issue #26): a table, its key's index, two indexes and three triggers.
    /// </summary>
    private static readonly string[] Sections =
    [
        "sqlite_autoindex_EntityFieldSections_1",
        "IX_EntityFieldDefinitions_SectionId",
        "IX_EntityFieldSections_EntityTypeId",
        "EntityFieldDefinitions_SectionOfType_Insert",
        "EntityFieldDefinitions_SectionOfType_Update",
        "EntityFieldSections_Ungroup_Delete",
    ];

    /// <summary>Private notes (AddEntityPrivateNotes, 2026-10-24, issue 23): a table and its key's index.</summary>
    private static readonly string[] Notes =
    [
        "sqlite_autoindex_EntityPrivateNotes_1",
    ];

    /// <summary>Knowledge records (AddKnowledgeRecords, 2026-10-25, issue 15): a table, its key's index and four key indexes.</summary>
    private static readonly string[] Knowledge =
    [
        "sqlite_autoindex_KnowledgeRecords_1",
        "IX_KnowledgeRecords_UniverseId",
        "IX_KnowledgeRecords_KnowerEntityId",
        "IX_KnowledgeRecords_SubjectEntityId",
        "IX_KnowledgeRecords_SceneId",
    ];

    /// <summary>The Admin workspace (AddPlatformAdmin, 2026-10-25, issue 40, ADR 0059): a table, its key's index and one index.</summary>
    private static readonly string[] Admin =
    [
        "sqlite_autoindex_AdminAuditRecords_1",
        "IX_AdminAuditRecords_TargetUserId_CreatedAt",
    ];

    /// <summary>Whether an index or trigger name predates semantic type groups.</summary>
    public static bool BeforeTypeGroups(string name) =>
        !TypeGroups.Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name (or "name on table") predates nested types - and so everything after them.</summary>
    public static bool BeforeNestedTypes(string name) =>
        !NestedTypes.Concat(Memberships).Concat(ReferenceTargets).Concat(TimelineStories).Concat(Calendars).Concat(Storage).Concat(Comments).Concat(Suggestions).Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin)
            .Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates the link field's allowed type - and so everything after it.</summary>
    public static bool BeforeReferenceTargets(string name) =>
        !ReferenceTargets.Concat(TimelineStories).Concat(Calendars).Concat(Storage).Concat(Comments).Concat(Suggestions).Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates a moment's stories - and so everything after it.</summary>
    public static bool BeforeTimelineStories(string name) =>
        !TimelineStories.Concat(Calendars).Concat(Storage).Concat(Comments).Concat(Suggestions).Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates custom calendars - and so everything after them.</summary>
    public static bool BeforeCalendars(string name) =>
        !Calendars.Concat(Storage).Concat(Comments).Concat(Suggestions).Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates review comments - and so everything after them.</summary>
    public static bool BeforeComments(string name) =>
        !Comments.Concat(Suggestions).Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates suggested changes.</summary>
    public static bool BeforeSuggestions(string name) =>
        !Suggestions.Concat(Mcp).Concat(TypeGroups).Concat(FieldHistory).Concat(AiChanges).Concat(LinkTrash).Concat(Progression).Concat(Periods).Concat(Forms).Concat(Looks).Concat(Sections).Concat(Notes).Concat(Knowledge).Concat(Admin).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));
}
