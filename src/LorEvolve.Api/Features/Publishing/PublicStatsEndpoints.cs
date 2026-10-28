using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// Four numbers about LorEvolve as a whole, for its home page (031): how many accounts, universes, published worlds and
/// private worlds exist right now. Counts only - no name, id, owner or anything inside a universe - so nothing here
/// lets a visitor find, name or enumerate a private universe.
/// </summary>
/// <param name="Creators">Registered accounts, each once, however many universes it owns or belongs to.</param>
/// <param name="Universes">Universes that exist, archived ones included; a deleted universe is gone from the table.</param>
/// <param name="PublishedWorlds">Universes public by <see cref="PublicationRules.Public"/>, the portal's own predicate.</param>
/// <param name="PrivateWorlds">Every other universe.</param>
public sealed record PublicStats(int Creators, int Universes, int PublishedWorlds, int PrivateWorlds);

public static class PublicStatsEndpoints
{
    public static IEndpointRouteBuilder MapPublicStatsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        // no-cache like the rest of the public API: three indexed COUNTs are cheap, and a world unpublished a moment
        // ago should not still be counted as published.
        endpoints.MapGet("/api/public/stats", GetAsync)
            .WithTags("Public portal")
            .WithName("GetPublicStats")
            .AllowAnonymous()
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-cache";
                return await next(context);
            });
        return endpoints;
    }

    private static async Task<Ok<PublicStats>> GetAsync(LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        var creators = await db.Users.CountAsync(cancellationToken);
        var universes = await db.Universes.CountAsync(cancellationToken);
        var published = await PublicationRules.Public(db).CountAsync(cancellationToken);
        return TypedResults.Ok(new PublicStats(creators, universes, published, universes - published));
    }
}
