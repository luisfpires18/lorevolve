using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.Search;

/// <summary>
/// What a search result is. Explicit on every result, never inferred from an id or a name (ADR 0031). A manuscript is its
/// own kind, apart from its scene: the scene's planning and the scene's prose open in different places.
/// </summary>
public enum UniverseSearchKind
{
    Entity = 0,
    Story = 1,
    Chapter = 2,
    Scene = 3,
    PlotArc = 4,
    PlotBeat = 5,
    Manuscript = 6,
    Idea = 7,
    WorldRule = 8,
}

/// <summary>
/// Where the searched words were found, in the words of the thing found: an entry's name or alias, a story's premise, an
/// arc's description, an idea's body, an article, a manuscript's prose. The narrowest place that holds every word wins, so
/// a title match reads as a title match even when the words also appear further down.
/// </summary>
public enum UniverseSearchField
{
    Title = 0,
    Alias = 1,
    Summary = 2,
    Premise = 3,
    Description = 4,
    Notes = 5,
    Body = 6,
    Article = 7,
    Prose = 8,
}

/// <summary>
/// One thing in the universe that holds the searched words, with only what a result row needs to be read and opened.
///
/// <paramref name="Id"/> is the thing's own id - for a <see cref="UniverseSearchKind.Manuscript"/>, the scene's. No body,
/// article, prose or notes travel: <paramref name="Excerpt"/> is a few words around the match, as runs of plain text, and only
/// when the match was not in the title. The context members are set where they mean something: the entry's type for an
/// entry; <paramref name="StoryId"/> for everything from a story (a story's own id for a story) and
/// <paramref name="StoryTitle"/> for what sits inside one; the chapter a scene or a manuscript is told in, and a chapter's own
/// number; a beat's arc.
/// </summary>
public sealed record UniverseSearchResult(
    UniverseSearchKind Kind,
    Guid Id,
    string Title,
    UniverseSearchField MatchedIn,
    IReadOnlyList<SearchExcerptPart>? Excerpt,
    string? EntityTypeName,
    Guid? StoryId,
    string? StoryTitle,
    string? ChapterTitle,
    int? ChapterNumber,
    Guid? PlotArcId,
    string? PlotArcTitle);

/// <summary>
/// The results of one search, best first. Bounded per kind; <paramref name="HasMore"/> says at least one kind held more than
/// it shows, so the author knows to add a word rather than to scroll.
/// </summary>
public sealed record UniverseSearchResponse(IReadOnlyList<UniverseSearchResult> Results, bool HasMore);
