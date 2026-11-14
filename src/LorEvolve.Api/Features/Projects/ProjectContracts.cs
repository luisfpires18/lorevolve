namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// Creating a project, or saving one whole.
///
/// <paramref name="Name"/> is required and trimmed. <paramref name="Kind"/> and <paramref name="Lifecycle"/> must be
/// values the API declares: they travel as numbers, so an unknown one is refused rather than stored.
/// <paramref name="Subtype"/> is trimmed and reads as null when it is empty. <paramref name="Summary"/> is stored as
/// sent; null reads as <c>""</c>. <paramref name="UniverseId"/> is required and must be a universe the caller may
/// edit: every project belongs to exactly one universe (#171). It is declared nullable here so that leaving it out is
/// a field error naming the universe, rather than a model-binding failure with nothing useful in it.
///
/// <paramref name="ExpectedVersion"/> is the <c>version</c> the edit was written over, on an update. When the project has
/// changed since, the save is refused with 409 <c>project_changed</c> and nothing is written. Ignored on create.
/// </summary>
public sealed record ProjectRequest(
    string? Name,
    ProjectKind Kind,
    ProjectLifecycle Lifecycle,
    string? Subtype,
    string? Summary,
    Guid? UniverseId,
    int? ExpectedVersion);

/// <summary>The universe a project is linked to, as much of it as a list or a header draws.</summary>
public sealed record ProjectUniverse(Guid Id, string Name, string? AccentColor, bool IsArchived);

/// <summary>
/// One project. The same shape in a list and on its own, because a project is small: there is no body to leave out.
///
/// <paramref name="IsOwned"/> says the caller's account made it, rather than reaching it through the universe it is in.
/// <paramref name="Universe"/> is never null for a project: every project is inside exactly one (#171).
///
/// <paramref name="StoryId"/> is set when this row is a Story shown as a Writing Project rather than a project of its
/// own (#140). Nothing of the story is copied: the row is read from the story every time, its <c>Id</c> is the story's
/// own id, and the story remains the thing that is opened, saved and published. A client reads it to know that the
/// project's content lives at the story's address, and that the project's own fields are not editable here because
/// they belong to the story.
/// </summary>
public sealed record ProjectDetail(
    Guid Id,
    string Name,
    ProjectKind Kind,
    ProjectLifecycle Lifecycle,
    string? Subtype,
    string Summary,
    ProjectUniverse? Universe,
    bool IsOwned,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version,
    Guid? StoryId = null);
