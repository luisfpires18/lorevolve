using System.Globalization;
using System.Text.Json.Nodes;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// What a public universe's author published inside it (Tasks 010-011): the listings of its published lore entries and
/// stories, each one's own page, and an entry's thumbnail. Mapped on <see cref="PublicUniverseEndpoints"/>' group,
/// so anonymous, read-only and <c>no-cache</c> like the rest of the portal's API.
///
/// <para><b>Both levels, always.</b> Every read starts from <see cref="PublicationRules.PublicLore"/> or
/// <see cref="PublicationRules.PublicStories"/>, which hold the universe predicate inside them: an entry is listed
/// only while it is selected, out of the Trash, and in a public universe. A private, missing or incomplete universe
/// is the same 404 as the universe routes give, whatever it holds; a public one with nothing published is an empty
/// page, never a hint of what is private.</para>
///
/// <para><b>Allow-lists, projected.</b> <see cref="PublicLoreEntry"/> and <see cref="PublicStory"/> are built member
/// by member from the columns they name, and so are <see cref="PublicLoreDetail"/> and <see cref="PublicStoryDetail"/>. No
/// entry, story or workspace response is serialised: no ids, fields, relationships, Canon, history, chapters or notes. An
/// entry's article is on its own page only, with its workspace links removed; a story's published scenes, prose and plot
/// arcs are on its own page only (ADR 0039).</para>
///
/// <para><b>Order.</b> Neither kind has an order an author sets for a whole universe, so both read the way the
/// workspace lists them - by name or title, case aside - with the address breaking ties, so pages never repeat or
/// skip. No popularity, no recency ranking. Paging is clamped as every LorEvolve list is.</para>
/// </summary>
public static class PublicContentEndpoints
{
    public static RouteGroupBuilder MapPublicContentEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/{slug}/lore", ListLoreAsync).WithName("ListPublicLore");
        group.MapGet("/{slug}/lore/{loreSlug}", GetLoreAsync).WithName("GetPublicLore");
        group.MapGet("/{slug}/lore/{loreSlug}/thumbnail/{thumbnailId:guid}", ReadLoreThumbnailAsync)
            .WithName("ReadPublicLoreThumbnail");
        group.MapGet("/{slug}/stories", ListStoriesAsync).WithName("ListPublicStories");
        group.MapGet("/{slug}/stories/{storySlug}", GetStoryAsync).WithName("GetPublicStory");

        return group;
    }

    private static async Task<IResult> ListLoreAsync(
        string slug,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PublicUniverseEndpoints.DefaultPageSize)
    {
        if (await PublicUniverseIdAsync(db, slug, cancellationToken) is not { } universeId)
        {
            return Results.NotFound();
        }

        (page, pageSize) = Clamp(page, pageSize);

        var query = PublicationRules.PublicLore(db).AsNoTracking().Where(entity => entity.UniverseId == universeId);
        var totalCount = await query.CountAsync(cancellationToken);

        var rows = await query
            .OrderBy(entity => EF.Functions.Collate(entity.Name, "NOCASE"))
            .ThenBy(entity => entity.PublicSlug)
            .Skip(Skip(page, pageSize))
            .Take(pageSize)
            .Select(entity => new
            {
                Slug = entity.PublicSlug!,
                entity.Name,
                entity.Summary,
                TypeName = entity.EntityType!.Name,
                ThumbnailId = entity.Image == null ? (Guid?)null : entity.Image.ThumbnailId,
                PublishedAt = entity.PublishedAt!.Value,
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(Page(
            [.. rows.Select(row => new PublicLoreEntry(
                row.Slug,
                row.Name,
                row.Summary,
                row.TypeName,
                row.ThumbnailId is { } thumbnailId ? ThumbnailUrl(slug, row.Slug, thumbnailId) : null,
                row.PublishedAt))],
            page,
            pageSize,
            totalCount));
    }

    private static async Task<IResult> ListStoriesAsync(
        string slug,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PublicUniverseEndpoints.DefaultPageSize)
    {
        if (await PublicUniverseIdAsync(db, slug, cancellationToken) is not { } universeId)
        {
            return Results.NotFound();
        }

        (page, pageSize) = Clamp(page, pageSize);

        var query = PublicationRules.PublicStories(db).AsNoTracking().Where(story => story.UniverseId == universeId);
        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(story => EF.Functions.Collate(story.Title, "NOCASE"))
            .ThenBy(story => story.PublicSlug)
            .Skip(Skip(page, pageSize))
            .Take(pageSize)
            .Select(story => new PublicStory(story.PublicSlug!, story.Title, story.PublicSummary!, story.PublishedAt!.Value))
            .ToListAsync(cancellationToken);

        return Results.Ok(Page(items, page, pageSize, totalCount));
    }

    /// <summary>
    /// One published entry's page: the listing's members and its article. Found by both addresses through the lore
    /// predicate, so a private universe, a private or trashed entry and an address nobody holds are the same 404.
    /// </summary>
    private static async Task<IResult> GetLoreAsync(
        string slug,
        string loreSlug,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(loreSlug))
        {
            return Results.NotFound();
        }

        var row = await PublicationRules.PublicLore(db).AsNoTracking()
            .Where(entity => entity.PublicSlug == loreSlug && entity.Universe!.PublicSlug == slug)
            .Select(entity => new
            {
                entity.Name,
                entity.Summary,
                TypeName = entity.EntityType!.Name,
                ThumbnailId = entity.Image == null ? (Guid?)null : entity.Image.ThumbnailId,
                PublishedAt = entity.PublishedAt!.Value,
                Article = db.EntityArticles.Where(article => article.EntityId == entity.Id).Select(article => article.Content).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? Results.NotFound()
            : Results.Ok(new PublicLoreDetail(
                loreSlug,
                row.Name,
                row.Summary,
                row.TypeName,
                row.ThumbnailId is { } thumbnailId ? ThumbnailUrl(slug, loreSlug, thumbnailId) : null,
                ReaderArticle(row.Article),
                row.PublishedAt));
    }

    /// <summary>
    /// One published story's page (ADR 0039): its listing's members, and what its author published inside it - scene prose,
    /// scene outlines and plot arcs, each through its own predicate, which holds the story's inside it. Same 404 as the
    /// listing for a private universe, a private or trashed story and an address nobody holds. Five queries whatever the
    /// story holds, and a sixth when its prose mentions Lore. Reading order is the workspace's: Unchaptered first, then
    /// chapter by chapter, each in its own order; no chapter title or number is read, since no chapter is published.
    /// </summary>
    private static async Task<IResult> GetStoryAsync(
        string slug,
        string storySlug,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(storySlug))
        {
            return Results.NotFound();
        }

        var story = await PublicationRules.PublicStories(db).AsNoTracking()
            .Where(candidate => candidate.PublicSlug == storySlug && candidate.Universe!.PublicSlug == slug)
            .Select(candidate => new { candidate.Id, candidate.UniverseId, Listing = new PublicStory(candidate.PublicSlug!, candidate.Title, candidate.PublicSummary!, candidate.PublishedAt!.Value) })
            .FirstOrDefaultAsync(cancellationToken);

        if (story is null)
        {
            return Results.NotFound();
        }

        var manuscript = await InReadingOrder(PublicationRules.PublicManuscripts(db).AsNoTracking().Where(scene => scene.StoryId == story.Id))
            .Select(scene => new
            {
                scene.Title,
                Text = db.SceneManuscripts.Where(prose => prose.SceneId == scene.Id).Select(prose => prose.Content).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        // A mention links only to an entry that is itself published in this universe; any other reads as its name.
        var prose = manuscript
            .Where(part => !string.IsNullOrWhiteSpace(part.Text))
            .Select(part => (part.Title, Rendered: Stories.ManuscriptMentions.PlainWithMentions(part.Text!)))
            .ToList();
        var mentioned = prose.SelectMany(part => part.Rendered.Mentions).Select(mention => mention.EntityId).Distinct().ToList();
        var publicLore = mentioned.Count == 0
            ? new Dictionary<Guid, string>()
            : await PublicationRules.PublicLore(db).AsNoTracking()
                .Where(entity => entity.UniverseId == story.UniverseId && mentioned.Contains(entity.Id))
                .ToDictionaryAsync(entity => entity.Id, entity => entity.PublicSlug!, cancellationToken);

        var scenes = await InReadingOrder(PublicationRules.PublicScenes(db).AsNoTracking().Where(scene => scene.StoryId == story.Id))
            .Select(scene => new PublicStoryScene(scene.Title, scene.Summary))
            .ToListAsync(cancellationToken);

        var arcs = await PublicationRules.PublicPlotArcs(db).AsNoTracking()
            .Where(arc => arc.StoryId == story.Id)
            .OrderBy(arc => arc.SortOrder)
            .ThenBy(arc => arc.Id)
            .Select(arc => new { arc.Id, arc.Title, arc.Description })
            .ToListAsync(cancellationToken);

        var arcIds = arcs.Select(arc => arc.Id).ToList();
        var beats = arcIds.Count == 0
            ? []
            : (await db.PlotBeats.AsNoTracking()
                .Where(beat => arcIds.Contains(beat.PlotArcId) && beat.DeletedAt == null)
                .OrderBy(beat => beat.SortOrder)
                .ThenBy(beat => beat.Id)
                .Select(beat => new { beat.PlotArcId, beat.Title, beat.Description })
                .ToListAsync(cancellationToken));
        var beatsByArc = beats.ToLookup(beat => beat.PlotArcId);

        var listing = story.Listing;
        return Results.Ok(new PublicStoryDetail(
            listing.Slug,
            listing.Title,
            listing.PublicSummary,
            listing.PublishedAt,
            // Published prose with nothing in it is not a part a reader can read, so it is left out rather than shown empty.
            // A mention is its name as the author wrote it (ADR 0058), linked only when its entry is published.
            [.. prose.Select(part => new PublicManuscriptPart(
                part.Title,
                part.Rendered.Text,
                [.. part.Rendered.Mentions
                    .Where(mention => publicLore.ContainsKey(mention.EntityId))
                    .Select(mention => new PublicMentionLink(mention.Start, mention.Length, publicLore[mention.EntityId]))]))],
            scenes,
            [.. arcs.Select(arc => new PublicPlotArc(
                arc.Title,
                arc.Description,
                [.. beatsByArc[arc.Id].Select(beat => new PublicPlotBeat(beat.Title, beat.Description))]))]));
    }

    /// <summary>The workspace's reading order (<see cref="Stories.SceneEndpoints.LoadScenesAsync"/>): Unchaptered, then each chapter in order.</summary>
    private static IOrderedQueryable<Stories.Scene> InReadingOrder(IQueryable<Stories.Scene> scenes) =>
        scenes
            .OrderBy(scene => scene.ChapterId == null ? -1 : scene.Chapter!.SortOrder)
            .ThenBy(scene => scene.SortOrder)
            .ThenBy(scene => scene.Id);

    /// <summary>
    /// The article as a reader gets it: the stored Tiptap document with every link mark whose address is not an
    /// absolute http, https or mailto one removed - the text stays, the link goes - and its first-level headings read
    /// as second-level ones, under the page's own title. A relative link is the only kind an
    /// article can hold that points into LorEvolve, and inside LorEvolve it points into the workspace, carrying its ids. Null for
    /// no article, a cleared one, or one that cannot be read (written before articles were validated): a reader gets
    /// nothing rather than something broken.
    /// </summary>
    internal static string? ReaderArticle(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        JsonNode? document;
        try
        {
            document = JsonNode.Parse(content);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }

        if (document is not JsonObject root || (string?)root["type"] is not "doc")
        {
            return null;
        }

        Unlink(root);
        return root.ToJsonString();
    }

    private static void Unlink(JsonObject node)
    {
        // The page's title is its one first-level heading: an article's own first-level headings read as the second level.
        if ((string?)node["type"] is "heading" && node["attrs"] is JsonObject attrs && attrs["level"] is JsonValue level
            && level.TryGetValue<int>(out var depth) && depth < 2)
        {
            attrs["level"] = 2;
        }

        if (node["marks"] is JsonArray marks)
        {
            for (var index = marks.Count - 1; index >= 0; index--)
            {
                if (marks[index] is JsonObject mark && (string?)mark["type"] is "link" && !IsReaderHref(mark["attrs"]?["href"]))
                {
                    marks.RemoveAt(index);
                }
            }

            if (marks.Count == 0)
            {
                node.Remove("marks");
            }
        }

        if (node["content"] is JsonArray children)
        {
            foreach (var child in children.OfType<JsonObject>())
            {
                Unlink(child);
            }
        }
    }

    private static bool IsReaderHref(JsonNode? href) =>
        href is JsonValue value
        && value.TryGetValue<string>(out var text)
        && Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri)
        && uri.Scheme is "http" or "https" or "mailto";

    /// <summary>
    /// A published entry's square thumbnail - never its original, which may carry what a camera wrote into it - and
    /// only the one it currently has. Found through <see cref="PublicationRules.PublicLore"/> by both addresses, so
    /// the address stops answering the moment the entry or its universe goes private, the entry goes to the Trash, or
    /// its picture is replaced, reframed or removed. The thumbnail id is an image version, not the entry's id.
    /// </summary>
    private static async Task<IResult> ReadLoreThumbnailAsync(
        string slug,
        string loreSlug,
        Guid thumbnailId,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(loreSlug))
        {
            return Results.NotFound();
        }

        var thumbnailKey = await PublicationRules.PublicLore(db).AsNoTracking()
            .Where(entity => entity.PublicSlug == loreSlug
                && entity.Universe!.PublicSlug == slug
                && entity.Image != null
                && entity.Image.ThumbnailId == thumbnailId)
            .Select(entity => entity.Image!.ThumbnailKey)
            .FirstOrDefaultAsync(cancellationToken);

        return thumbnailKey is null
            ? Results.NotFound()
            : await PublicUniverseEndpoints.ServeWebpAsync(thumbnailKey, thumbnailId, context, store, loggerFactory, cancellationToken);
    }

    internal static string ThumbnailUrl(string universeSlug, string loreSlug, Guid thumbnailId) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/public/universes/{universeSlug}/lore/{loreSlug}/thumbnail/{thumbnailId:D}");

    /// <summary>The universe behind a public address, or null - private, missing and malformed alike. Never returned to anyone.</summary>
    private static async Task<Guid?> PublicUniverseIdAsync(LorEvolveDbContext db, string slug, CancellationToken cancellationToken) =>
        PublicUniverseEndpoints.SlugShape().IsMatch(slug)
            ? await PublicationRules.Public(db).AsNoTracking()
                .Where(universe => universe.PublicSlug == slug)
                .Select(universe => (Guid?)universe.Id)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

    private static (int Page, int PageSize) Clamp(int page, int pageSize) =>
        (Math.Max(page, 1), Math.Clamp(pageSize, 1, PublicUniverseEndpoints.MaxPageSize));

    private static int Skip(int page, int pageSize) => (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

    private static PublicContentPage<T> Page<T>(IReadOnlyList<T> items, int page, int pageSize, int totalCount) =>
        new(items, page, pageSize, totalCount, totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize));
}
