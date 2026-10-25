using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The entries a manuscript's mentions name, read by id (issue 31, ADR 0058). The editor's mentions list asks for the ids in
/// the prose as it stands on screen - saved or not - and draws each with its current name and type, or as gone. Every member
/// may ask (<c>Read</c>); only entries of this universe answer, trashed ones marked, so an id from another universe or a
/// made-up one is simply not in the answer. One query.
/// </summary>
public static class LoreReferenceEndpoints
{
    /// <summary>The most ids one request may name: far more distinct entries than a scene's prose mentions.</summary>
    public const int MaxIds = 100;

    public static IEndpointRouteBuilder MapLoreReferenceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/universes/{universeId:guid}/lore-references", ListAsync)
            .WithTags("Stories")
            .WithName("ListLoreReferences")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? ids = null)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var parts = (ids ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var wanted = new List<Guid>();
        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["ids"] = ["Name entries by their ids, separated by commas."] });
            }

            if (!wanted.Contains(id))
            {
                wanted.Add(id);
            }
        }

        if (wanted.Count > MaxIds)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["ids"] = [$"Ask for at most {MaxIds} entries at once."] });
        }

        var found = await StoryLoreReferences.LoadAsync(db, universeId, wanted, cancellationToken);
        return Results.Ok(wanted.Where(found.ContainsKey).Select(id => found[id]));
    }
}
