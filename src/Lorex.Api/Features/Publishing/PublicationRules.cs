using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// What a universe needs before it may be public, and the queries that decide what the public
/// portal may read - the universe predicate, and the entry and story predicates built on it. All
/// live here so they cannot disagree.
/// </summary>
internal static class PublicationRules
{
    // The names a missing requirement is reported under - the same keys a validation problem's
    // errors use, so a client reads either the same way. The order is the order a screen lists them.
    public const string PublicSummary = "publicSummary";
    public const string Category = "category";
    public const string Genres = "genres";
    public const string Artwork = "artwork";
    public const string PublicDisplayName = "publicDisplayName";
    public const string OriginalCreator = "originalCreator";
    public const string OriginalWork = "originalWork";

    /// <summary>
    /// What is still missing for this universe to be published, in words an author acts on, keyed as
    /// above. Empty means it may be. The name and the slug are not here: a universe always has a name,
    /// and publishing mints the slug.
    /// </summary>
    public static Dictionary<string, string[]> Missing(
        string? publicSummary,
        UniverseCategory? category,
        UniverseGenres genres,
        bool hasArtwork,
        string? authorName)
    {
        var missing = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(publicSummary))
        {
            missing[PublicSummary] = ["Write a public summary."];
        }

        if (category is null)
        {
            missing[Category] = ["Choose a category."];
        }

        if (genres == UniverseGenres.None)
        {
            missing[Genres] = ["Choose at least one genre."];
        }

        if (!hasArtwork)
        {
            missing[Artwork] = ["Add the universe's artwork."];
        }

        if (string.IsNullOrWhiteSpace(authorName))
        {
            missing[PublicDisplayName] = ["Choose the public name your universes are published under."];
        }

        return missing;
    }

    /// <summary>
    /// Every universe the public portal may read, and nothing else. Every public route starts here.
    ///
    /// Visibility alone would be enough while every write path holds the requirements - and they do
    /// (ADR 0036). The rest of the predicate is the second lock: a universe that were somehow public
    /// without its summary, category, genres, artwork, author name, author address or address is simply not public,
    /// rather than a record served with holes in it. It is also what lets the public contract promise
    /// that none of those fields is ever null.
    /// </summary>
    public static IQueryable<Universe> Public(LorexDbContext db) =>
        db.Universes
            .Where(universe => universe.Visibility == UniverseVisibility.Public
                && universe.PublicSlug != null
                && universe.PublishedAt != null
                && universe.PublicSummary != null
                && universe.Category != null
                && universe.Genres != UniverseGenres.None
                && universe.Owner!.PublicDisplayName != null
                && universe.Owner.PublicAuthorSlug != null
                && db.UniverseArtworks.Any(artwork => artwork.UniverseId == universe.Id));

    /// <summary>
    /// Every lore entry its author selected for publication: selected, not in the Trash, with the address and date
    /// publishing gives it - whether or not its universe is public yet. <see cref="PublicLore"/> is exactly these inside a
    /// public universe, so what an owner is shown before publishing (Issue #47) is what the portal will then read.
    /// </summary>
    public static IQueryable<LoreEntity> SelectedLore(LorexDbContext db) =>
        db.Entities.Where(entity => entity.Visibility == ContentVisibility.Public
            && entity.DeletedAt == null
            && entity.PublicSlug != null
            && entity.PublishedAt != null);

    /// <summary>
    /// Every lore entry the public portal may read, and nothing else: <see cref="SelectedLore"/> inside a universe
    /// <see cref="Public"/> answers. The parent is part of the predicate rather than a step a caller remembers, so a
    /// private universe overrides every entry in it and no route can ask for one without the other.
    /// </summary>
    public static IQueryable<LoreEntity> PublicLore(LorexDbContext db)
    {
        var universes = Public(db);
        return SelectedLore(db).Where(entity => universes.Any(universe => universe.Id == entity.UniverseId));
    }

    /// <summary>
    /// Every story the public portal may read: the same two levels as <see cref="PublicLore"/>, and a public summary
    /// its author wrote for readers (Task 011). A story selected before that summary existed stays selected and stays
    /// hidden until it has one; nothing ever stands in for it - least of all the premise.
    /// </summary>
    public static IQueryable<Story> PublicStories(LorexDbContext db)
    {
        var universes = Public(db);
        return db.Stories.Where(story => story.Visibility == ContentVisibility.Public
            && story.DeletedAt == null
            && story.PublicSlug != null
            && story.PublishedAt != null
            && story.PublicSummary != null
            && universes.Any(universe => universe.Id == story.UniverseId));
    }

    /// <summary>
    /// Every scene whose outline - title and summary - the public portal may read (ADR 0039): selected by its author, not
    /// in the Trash, inside a story <see cref="PublicStories"/> answers. Three levels in one predicate, so a private story
    /// or universe hides every scene in it and keeps what was selected.
    /// </summary>
    public static IQueryable<Scene> PublicScenes(LorexDbContext db)
    {
        var stories = PublicStories(db);
        return db.Scenes.Where(scene => scene.Visibility == ContentVisibility.Public
            && scene.DeletedAt == null
            && stories.Any(story => story.Id == scene.StoryId));
    }

    /// <summary>
    /// Every scene whose prose the public portal may read (ADR 0039): its manuscript selected, the scene out of the Trash,
    /// inside a public story. Independent of the scene's own outline selection.
    /// </summary>
    public static IQueryable<Scene> PublicManuscripts(LorexDbContext db)
    {
        var stories = PublicStories(db);
        return db.Scenes.Where(scene => scene.ManuscriptVisibility == ContentVisibility.Public
            && scene.DeletedAt == null
            && stories.Any(story => story.Id == scene.StoryId));
    }

    /// <summary>
    /// Every plot arc the public portal may read (ADR 0039): selected by its author on purpose - nothing else publishes
    /// plot - out of the Trash, inside a public story. Its beats follow it, live ones only.
    /// </summary>
    public static IQueryable<PlotArc> PublicPlotArcs(LorexDbContext db)
    {
        var stories = PublicStories(db);
        return db.PlotArcs.Where(arc => arc.Visibility == ContentVisibility.Public
            && arc.DeletedAt == null
            && stories.Any(story => story.Id == arc.StoryId));
    }

    /// <summary>Every genre in <paramref name="genres"/>, in the one order they are always listed in.</summary>
    public static IReadOnlyList<UniverseGenres> List(UniverseGenres genres) =>
        [.. Enum.GetValues<UniverseGenres>().Where(genre => genre != UniverseGenres.None && genres.HasFlag(genre))];

    /// <summary>Whether <paramref name="genre"/> is exactly one genre Lorex knows.</summary>
    public static bool IsOneGenre(UniverseGenres genre) =>
        genre != UniverseGenres.None
        && System.Numerics.BitOperations.IsPow2((int)genre)
        && Enum.IsDefined(genre);
}
