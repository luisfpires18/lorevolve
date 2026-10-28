using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Publishing;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Seo;

/// <summary>What one page's document head says, before it is written into the shell.</summary>
/// <param name="Title">The whole <c>&lt;title&gt;</c>, brand included.</param>
/// <param name="Description">Public-safe authored text only, or a fixed sentence LorEvolve writes.</param>
/// <param name="Indexable">Whether this page, on its own terms, may be indexed. The site-wide switch can still say no.</param>
/// <param name="FollowLinks">Whether a crawler may follow its links when it is not indexed (Explore's search states).</param>
/// <param name="CanonicalPath">The site-relative canonical address, or null for a page that has none.</param>
/// <param name="ImagePath">A public picture's site-relative address - a derivative the public API already serves.</param>
/// <param name="LargeImage">Whether the picture is a wide card (a large social card) rather than a square.</param>
/// <param name="StatusCode">200, or 404 for a public address that shows nothing.</param>
public sealed record PageMetadata(
    string Title,
    string Description,
    bool Indexable,
    bool FollowLinks,
    string? CanonicalPath,
    string OgType,
    string? ImagePath,
    bool LargeImage,
    int StatusCode);

/// <summary>
/// The document head for a request to the app shell (Task 012, ADR 0038): LorEvolve's home and each public portal page get
/// their own title, description, canonical address and Open Graph picture; everything else - the workspace, sign-in,
/// the profile, any address LorEvolve does not know - is <c>noindex</c> with the product's own generic head.
///
/// <para><b>The public predicates decide, and nothing else.</b> Every lookup starts from
/// <see cref="PublicationRules.Public"/>, <see cref="PublicationRules.PublicLore"/> or
/// <see cref="PublicationRules.PublicStories"/> - the ones the public API reads - so a private, trashed, incomplete or
/// missing item is one 404 with the not-found head, never a head that names it. Only the fields the public API already
/// publishes are read: a universe's name and public summary, an entry's name, type and lead, a story's title and public
/// summary (never its premise), an author's public name and public worlds. No id, account, email or private text.</para>
///
/// <para><b>Pictures are the public derivatives.</b> The universe's 16:10 card, an entry's square thumbnail, and an
/// author's photo only when they chose to show it - the same URLs the public API answers, which stop answering when the
/// thing stops being public. Never an original.</para>
/// </summary>
public static class PageMetadataResolver
{
    public const string Brand = "LorEvolve";
    private const int DescriptionMax = 200;

    public const string ExploreDescription =
        "Explore worlds their authors chose to share on LorEvolve: universes, their lore and their stories.";

    public const string HomeTitle = "LorEvolve | Build connected fictional universes";

    public const string HomeDescription =
        "Build lore, relationships, timelines and stories in one connected workspace for fictional universes.";

    private const string GenericDescription =
        "A workroom for the worlds you keep: their people, places, history and the rules that hold them together.";

    /// <summary>The head for any address that is not a public page: the workspace, sign-in, the profile, unknown paths.</summary>
    public static PageMetadata Private { get; } =
        new(Brand, GenericDescription, Indexable: false, FollowLinks: false, null, "website", null, false, 200);

    private static PageMetadata Missing { get; } =
        new($"Page not available | {Brand}", "This page is not available.", false, false, null, "website", null, false, 404);

    public static async Task<PageMetadata> ResolveAsync(
        PathString path,
        QueryString query,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var segments = (path.Value ?? "/").Trim('/').Split('/');

        switch (segments)
        {
            // LorEvolve's home (031): a page about LorEvolve, so its words are fixed ones LorEvolve writes, and its one address is "/".
            case [""]:
                return new PageMetadata(
                    HomeTitle,
                    HomeDescription,
                    Indexable: !query.HasValue,
                    FollowLinks: true,
                    "/",
                    "website",
                    null,
                    false,
                    200);

            case ["explore"]:
                // One canonical Explore. A search or filter state is a view of it, not a page of its own: its links are
                // worth following, the state itself is not worth indexing.
                return new PageMetadata(
                    $"Explore Worlds | {Brand}",
                    ExploreDescription,
                    Indexable: !query.HasValue,
                    FollowLinks: true,
                    "/explore",
                    "website",
                    null,
                    false,
                    200);

            case ["worlds", var slug] when IsSlug(slug):
                return await UniverseAsync(db, slug, cancellationToken) ?? Missing;

            case ["worlds", var slug, "lore", var loreSlug] when IsSlug(slug) && IsSlug(loreSlug):
                return await LoreAsync(db, slug, loreSlug, cancellationToken) ?? Missing;

            case ["worlds", var slug, "stories", var storySlug] when IsSlug(slug) && IsSlug(storySlug):
                return await StoryAsync(db, slug, storySlug, cancellationToken) ?? Missing;

            case ["authors", var authorSlug] when IsSlug(authorSlug):
                return await AuthorAsync(db, authorSlug, cancellationToken) ?? Missing;

            case ["worlds", ..] or ["authors", ..]:
                return Missing;

            default:
                return Private;
        }
    }

    private static async Task<PageMetadata?> UniverseAsync(LorEvolveDbContext db, string slug, CancellationToken cancellationToken)
    {
        var world = await PublicationRules.Public(db).AsNoTracking()
            .Where(universe => universe.PublicSlug == slug)
            .Select(universe => new
            {
                universe.Name,
                universe.PublicSummary,
                CardId = db.UniverseArtworks.Where(artwork => artwork.UniverseId == universe.Id).Select(artwork => artwork.CardId).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return world is null
            ? null
            : new PageMetadata(
                $"{Clean(world.Name)} | {Brand}",
                Describe(world.PublicSummary),
                true,
                true,
                $"/worlds/{slug}",
                "website",
                PublicUniverseEndpoints.CardUrl(slug, world.CardId),
                LargeImage: true,
                200);
    }

    private static async Task<PageMetadata?> LoreAsync(LorEvolveDbContext db, string slug, string loreSlug, CancellationToken cancellationToken)
    {
        var entry = await PublicationRules.PublicLore(db).AsNoTracking()
            .Where(entity => entity.PublicSlug == loreSlug && entity.Universe!.PublicSlug == slug)
            .Select(entity => new
            {
                entity.Name,
                entity.Summary,
                TypeName = entity.EntityType!.Name,
                World = entity.Universe!.Name,
                ThumbnailId = entity.Image == null ? (Guid?)null : entity.Image.ThumbnailId,
                CardId = db.UniverseArtworks.Where(artwork => artwork.UniverseId == entity.UniverseId).Select(artwork => artwork.CardId).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (entry is null)
        {
            return null;
        }

        // The entry's own lead is published beside its name on the public page; without one, a plain sentence of what
        // it is and where - words the page itself shows.
        var description = string.IsNullOrWhiteSpace(entry.Summary)
            ? $"{Clean(entry.TypeName)} in {Clean(entry.World)}, on {Brand}."
            : Describe(entry.Summary);

        return new PageMetadata(
            $"{Clean(entry.Name)} | {Clean(entry.World)} | {Brand}",
            description,
            true,
            true,
            $"/worlds/{slug}/lore/{loreSlug}",
            "article",
            entry.ThumbnailId is { } thumbnailId
                ? PublicContentEndpoints.ThumbnailUrl(slug, loreSlug, thumbnailId)
                : PublicUniverseEndpoints.CardUrl(slug, entry.CardId),
            LargeImage: entry.ThumbnailId is null,
            200);
    }

    private static async Task<PageMetadata?> StoryAsync(LorEvolveDbContext db, string slug, string storySlug, CancellationToken cancellationToken)
    {
        // The public summary only - the predicate requires it, and the premise is never read here.
        var story = await PublicationRules.PublicStories(db).AsNoTracking()
            .Where(candidate => candidate.PublicSlug == storySlug && candidate.Universe!.PublicSlug == slug)
            .Select(candidate => new
            {
                candidate.Title,
                candidate.PublicSummary,
                World = candidate.Universe!.Name,
                CardId = db.UniverseArtworks.Where(artwork => artwork.UniverseId == candidate.UniverseId).Select(artwork => artwork.CardId).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        // A story has no picture of its own; its page shows its world's public card, so its social card does too.
        return story is null
            ? null
            : new PageMetadata(
                $"{Clean(story.Title)} | {Clean(story.World)} | {Brand}",
                Describe(story.PublicSummary),
                true,
                true,
                $"/worlds/{slug}/stories/{storySlug}",
                "article",
                PublicUniverseEndpoints.CardUrl(slug, story.CardId),
                LargeImage: true,
                200);
    }

    private static async Task<PageMetadata?> AuthorAsync(LorEvolveDbContext db, string authorSlug, CancellationToken cancellationToken)
    {
        var worlds = PublicationRules.Public(db).AsNoTracking().Where(universe => universe.Owner!.PublicAuthorSlug == authorSlug);

        var author = await db.Users.AsNoTracking()
            .Where(user => user.PublicAuthorSlug == authorSlug && worlds.Any())
            .Select(user => new
            {
                user.PublicDisplayName,
                Avatar = db.ProfileImages.Where(image => image.UserId == user.Id && image.IsPublic).Select(image => (Guid?)image.ThumbnailId).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (author?.PublicDisplayName is null)
        {
            return null;
        }

        var names = await worlds
            .OrderBy(universe => EF.Functions.Collate(universe.Name, "NOCASE"))
            .Select(universe => universe.Name)
            .Take(4)
            .ToListAsync(cancellationToken);

        // Only what the author page shows: their public name and their public worlds. No biography is invented.
        var listed = string.Join(", ", names.Take(3).Select(Clean)) + (names.Count > 3 ? " and more" : string.Empty);
        var name = Clean(author.PublicDisplayName);

        return new PageMetadata(
            $"{name} | {Brand}",
            Describe($"{name}, creator on {Brand}. Worlds: {listed}."),
            true,
            true,
            $"/authors/{authorSlug}",
            "profile",
            author.Avatar is { } avatar ? PublicAuthorEndpoints.AvatarUrl(authorSlug, avatar) : null,
            LargeImage: false,
            200);
    }

    private static bool IsSlug(string value) => PublicUniverseEndpoints.SlugShape().IsMatch(value);

    /// <summary>One line: whitespace runs collapsed, control characters dropped.</summary>
    private static string Clean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var builder = new System.Text.StringBuilder(text.Length);
        var space = false;
        foreach (var character in text.Trim())
        {
            if (char.IsWhiteSpace(character) || char.IsControl(character))
            {
                space = true;
                continue;
            }

            if (space && builder.Length > 0)
            {
                builder.Append(' ');
            }

            space = false;
            builder.Append(character);
        }

        return builder.ToString();
    }

    /// <summary>A description of at most <see cref="DescriptionMax"/> characters, cut at a word with an ellipsis.</summary>
    private static string Describe(string? text)
    {
        var line = Clean(text);
        if (line.Length <= DescriptionMax)
        {
            return line;
        }

        var cut = line.LastIndexOf(' ', DescriptionMax - 1);
        return line[..(cut > DescriptionMax / 2 ? cut : DescriptionMax - 1)].TrimEnd(',', ';', ':', '.', ' ') + "…";
    }
}
