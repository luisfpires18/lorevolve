using System.Collections.Frozen;
using System.Globalization;
using System.Text.RegularExpressions;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// The public portal's API: anonymous, read-only, and the only routes in LorEvolve that answer without a
/// session (ADR 0036). Three reads of universes - the listing, one universe by its address, and its card
/// picture - and, in <see cref="PublicContentEndpoints"/> on the same group, the published entries and
/// stories inside one and an entry's thumbnail. No route here writes, and no authenticated route is
/// reachable through here.
///
/// <para><b>One query decides.</b> Every route starts from <see cref="PublicationRules.Public"/>, so a
/// private universe - or one that does not exist, or one some future bug left public but incomplete -
/// is the same 404 everywhere, and the body never says which. Nothing is cached in the process: the
/// next read after an unpublish no longer finds the universe. Every response here says
/// <c>no-cache</c>, so a browser or a proxy may keep a copy but must ask again before reusing it -
/// and asking again is what a private universe's picture answers with a 404.</para>
///
/// <para><b>An allow-list, projected.</b> Each response is built member by member from the columns
/// <see cref="PublicUniverse"/> names. No entity is serialised, and nothing inside the universe is read
/// here - only the entries and stories their author selected are, by their own routes and their own
/// allow-lists.</para>
/// </summary>
public static partial class PublicUniverseEndpoints
{
    internal const int DefaultPageSize = 24;
    internal const int MaxPageSize = 48;
    private const int SearchMaxLength = 100;

    /// <summary>
    /// The address-friendly key of each category and genre, from its name: <c>MoviesAndTv</c> is
    /// <c>movies-and-tv</c>. Derived rather than listed, so a new member has a key the moment it exists.
    /// Exact and lower case only - one spelling per value, so a shared address means one thing.
    /// </summary>
    internal static readonly FrozenDictionary<string, UniverseCategory> CategoryKeys =
        Enum.GetValues<UniverseCategory>().ToFrozenDictionary(value => Key(value.ToString()), StringComparer.Ordinal);

    internal static readonly FrozenDictionary<string, UniverseGenres> GenreKeys =
        Enum.GetValues<UniverseGenres>()
            .Where(PublicationRules.IsOneGenre)
            .ToFrozenDictionary(value => Key(value.ToString()), StringComparer.Ordinal);

    private static string Key(string name) => KeyBreak().Replace(name, "-$1").ToLowerInvariant();

    public static IEndpointRouteBuilder MapPublicUniverseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/public/universes")
            .WithTags("Public portal")
            .AllowAnonymous()
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-cache";
                return await next(context);
            });

        group.MapGet("/", ListAsync).WithName("ListPublicUniverses");
        group.MapGet("/{slug}", GetAsync).WithName("GetPublicUniverse");
        group.MapGet("/{slug}/artwork/card/{cardId:guid}", ReadCardAsync).WithName("ReadPublicUniverseCard");
        group.MapPublicContentEndpoints();

        return endpoints;
    }

    /// <summary>
    /// Public universes, filtered and ordered the ways Explore offers. Every filter narrows the one public
    /// query, so nothing private is ever counted, matched or ordered - a search cannot tell a private
    /// universe from one that does not exist.
    ///
    /// <para><c>author</c> is an author's public address (ADR 0037): only their worlds.</para>
    ///
    /// <para><c>category</c> and <c>genre</c> are keys (<c>movies-and-tv</c>, <c>science-fiction</c>),
    /// one of each at most; a genre matches any universe that lists it. <c>q</c> is a substring of the
    /// name, the public summary or the author's public name - the public fields, never the description -
    /// ASCII case aside. <c>sort</c> is <c>recent</c> (first published, most recent first; republishing
    /// does not move a universe) or <c>az</c> (name, case aside). The address breaks every tie, so paging
    /// is stable. There is no popularity to sort by and none is invented.</para>
    ///
    /// <para>An unknown key, sort or an overlong search is refused as a validation problem rather than
    /// read as something else; out-of-range paging is clamped, as every LorEvolve list does.</para>
    /// </summary>
    private static async Task<IResult> ListAsync(
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize,
        [FromQuery] string? category = null,
        [FromQuery] string? genre = null,
        [FromQuery] string? q = null,
        [FromQuery] string? sort = null,
        [FromQuery] string? author = null)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var errors = new Dictionary<string, string[]>();
        UniverseCategory? onlyCategory = null;
        UniverseGenres? onlyGenre = null;

        if (!string.IsNullOrEmpty(category))
        {
            if (CategoryKeys.TryGetValue(category, out var found))
            {
                onlyCategory = found;
            }
            else
            {
                errors["category"] = ["Unknown category."];
            }
        }

        if (!string.IsNullOrEmpty(genre))
        {
            if (GenreKeys.TryGetValue(genre, out var found))
            {
                onlyGenre = found;
            }
            else
            {
                errors["genre"] = ["Unknown genre."];
            }
        }

        var alphabetical = sort switch
        {
            null or "" or "recent" => false,
            "az" => true,
            _ => (bool?)null,
        };

        if (alphabetical is null)
        {
            errors["sort"] = ["Sort by recent or az."];
        }

        if (!string.IsNullOrEmpty(author) && !SlugShape().IsMatch(author))
        {
            errors["author"] = ["Unknown author."];
        }

        var search = q?.Trim();
        if (search is { Length: > SearchMaxLength })
        {
            errors["q"] = [$"Search for at most {SearchMaxLength} characters."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var query = PublicationRules.Public(db).AsNoTracking();

        if (onlyCategory is { } wantedCategory)
        {
            query = query.Where(universe => universe.Category == wantedCategory);
        }

        if (onlyGenre is { } wantedGenre)
        {
            query = query.Where(universe => (universe.Genres & wantedGenre) == wantedGenre);
        }

        if (!string.IsNullOrEmpty(author))
        {
            // One author's public worlds, for their author page (ADR 0037). An author with none matches nothing,
            // exactly as an address no one holds does.
            query = query.Where(universe => universe.Owner!.PublicAuthorSlug == author);
        }

        if (!string.IsNullOrEmpty(search))
        {
            var pattern = $"%{IdeaEndpoints.EscapeLike(search)}%";
            query = query.Where(universe =>
                EF.Functions.Like(universe.Name, pattern, "\\")
                || EF.Functions.Like(universe.PublicSummary!, pattern, "\\")
                || EF.Functions.Like(universe.Owner!.PublicDisplayName!, pattern, "\\")
                || EF.Functions.Like(universe.OriginalCreator!, pattern, "\\")
                || EF.Functions.Like(universe.OriginalWork!, pattern, "\\"));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var ordered = alphabetical == true
            ? query.OrderBy(universe => EF.Functions.Collate(universe.Name, "NOCASE")).ThenBy(universe => universe.PublicSlug)
            : query.OrderByDescending(universe => universe.PublishedAt).ThenBy(universe => universe.PublicSlug);

        var rows = await Project(db, ordered.Skip(skip).Take(pageSize)).ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new PublicUniversePage([.. rows.Select(Public)], page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(string slug, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        if (!SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var row = await Project(db, PublicationRules.Public(db).AsNoTracking().Where(universe => universe.PublicSlug == slug))
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? Results.NotFound() : Results.Ok(Public(row));
    }

    /// <summary>
    /// The card, and only the card - never the original, which may carry what a camera wrote into it.
    /// Answered only while the universe is public and only for the card it currently shows, so an
    /// address stops working the moment the universe goes private or its card is replaced.
    ///
    /// The card id is the entity tag: bytes under one id never change, so a browser holding the
    /// current card is told 304 without the store being asked for anything.
    /// </summary>
    private static async Task<IResult> ReadCardAsync(
        string slug,
        Guid cardId,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var cardKey = await PublicationRules.Public(db).AsNoTracking()
            .Where(universe => universe.PublicSlug == slug)
            .SelectMany(universe => db.UniverseArtworks.Where(artwork => artwork.UniverseId == universe.Id && artwork.CardId == cardId))
            .Select(artwork => artwork.CardKey)
            .FirstOrDefaultAsync(cancellationToken);

        if (cardKey is null)
        {
            return Results.NotFound();
        }

        return await ServeWebpAsync(cardKey, cardId, context, store, loggerFactory, cancellationToken);
    }

    /// <summary>
    /// A public picture the caller has already found through the public predicate: <paramref name="version"/> - an id
    /// that names these bytes and never others - is the entity tag, so a browser holding the current picture is told
    /// 304 without the store being asked for anything. Only ever reached after the visibility check, never before it,
    /// so a revalidation of a picture that stopped being public is a 404 rather than a 304. Always WebP: only cut
    /// derivatives are public, and every one is WebP.
    /// </summary>
    internal static async Task<IResult> ServeWebpAsync(
        string key,
        Guid version,
        HttpContext context,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var tag = new EntityTagHeaderValue($"\"{version:N}\"");
        context.Response.Headers.ETag = tag.ToString();

        if (context.Request.GetTypedHeaders().IfNoneMatch is { Count: > 0 } asked
            && asked.Any(candidate => candidate.Equals(EntityTagHeaderValue.Any) || candidate.Compare(tag, useStrongComparison: false)))
        {
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(key, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger("LorEvolve.PublicPortal"), exception);
            }

            return UniverseArtworkEndpoints.Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.Stream(stored.Content, "image/webp", enableRangeProcessing: false);
    }

    /// <summary>The allow-listed columns and nothing else, straight from the query.</summary>
    private static IQueryable<PublicRow> Project(LorEvolveDbContext db, IQueryable<Universe> universes) =>
        universes.Select(universe => new PublicRow(
            universe.PublicSlug!,
            universe.Name,
            universe.PublicSummary!,
            universe.Category!.Value,
            universe.Genres,
            universe.Owner!.PublicDisplayName!,
            universe.Owner.PublicAuthorSlug!,
            db.UniverseArtworks.Where(artwork => artwork.UniverseId == universe.Id).Select(artwork => artwork.CardId).FirstOrDefault(),
            universe.PublishedAt!.Value,
            universe.OriginalCreator,
            universe.OriginalWork));

    private static PublicUniverse Public(PublicRow row) => new(
        row.Slug,
        row.Name,
        row.PublicSummary,
        row.Category,
        PublicationRules.List(row.Genres),
        row.AuthorDisplayName,
        row.AuthorSlug,
        CardUrl(row.Slug, row.CardId),
        row.PublishedAt,
        row.OriginalCreator,
        row.OriginalCreator is null ? null : row.OriginalWork);

    internal static string CardUrl(string slug, Guid cardId) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/public/universes/{slug}/artwork/card/{cardId:D}");

    private sealed record PublicRow(
        string Slug,
        string Name,
        string PublicSummary,
        UniverseCategory Category,
        UniverseGenres Genres,
        string AuthorDisplayName,
        string AuthorSlug,
        Guid CardId,
        DateTime PublishedAt,
        string? OriginalCreator,
        string? OriginalWork);

    /// <summary>Only what <see cref="PublicSlugs"/> can mint; anything else is not an address and costs no query.</summary>
    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")]
    internal static partial Regex SlugShape();

    [GeneratedRegex("(?<=[a-z])([A-Z])")]
    private static partial Regex KeyBreak();

    [LoggerMessage(Level = LogLevel.Error, Message = "Image storage failed while serving a public picture.")]
    private static partial void LogStorageFailure(ILogger logger, Exception exception);
}
