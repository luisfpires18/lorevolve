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

    /// <summary>Whether an index or trigger name (or "name on table") predates nested types - and so everything after them.</summary>
    public static bool BeforeNestedTypes(string name) =>
        !NestedTypes.Concat(Memberships).Concat(ReferenceTargets).Concat(TimelineStories).Concat(Calendars).Concat(Storage).Concat(Comments)
            .Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates the link field's allowed type - and so everything after it.</summary>
    public static bool BeforeReferenceTargets(string name) =>
        !ReferenceTargets.Concat(TimelineStories).Concat(Calendars).Concat(Storage).Concat(Comments).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates a moment's stories - and so everything after it.</summary>
    public static bool BeforeTimelineStories(string name) =>
        !TimelineStories.Concat(Calendars).Concat(Storage).Concat(Comments).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates custom calendars - and so everything after them.</summary>
    public static bool BeforeCalendars(string name) =>
        !Calendars.Concat(Storage).Concat(Comments).Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));

    /// <summary>Whether an index or trigger name predates review comments.</summary>
    public static bool BeforeComments(string name) =>
        !Comments.Any(later => name == later || name.StartsWith($"{later} ", StringComparison.Ordinal));
}
