using System.Security.Claims;
using LorEvolve.Api.Common;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.ComicCollections;

/// <summary>
/// Comic Story Arcs and Events (#296): ordered references to issues and chapters across a universe's Comic projects.
/// Every write here touches only collection and entry rows; a node or project is never moved, copied or changed.
/// </summary>
public static class ComicCollectionEndpoints
{
    public const string CollectionChangedCode = "comic_collection_changed";

    public const string EntryExistsCode = "comic-collection-entry-exists";

    public static IEndpointRouteBuilder MapComicCollectionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/comic-collections")
            .WithTags("Comic collections")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListComicCollections");
        group.MapPost("/", CreateAsync).WithName("CreateComicCollection");
        group.MapPut("/{collectionId:guid}", UpdateAsync).WithName("UpdateComicCollection");
        group.MapDelete("/{collectionId:guid}", DeleteAsync).WithName("DeleteComicCollection");
        group.MapPost("/{collectionId:guid}/move", MoveAsync).WithName("MoveComicCollection");

        group.MapPost("/{collectionId:guid}/entries", AddEntryAsync).WithName("AddComicCollectionEntry");
        group.MapDelete("/{collectionId:guid}/entries/{nodeId:guid}", RemoveEntryAsync).WithName("RemoveComicCollectionEntry");
        group.MapPost("/{collectionId:guid}/entries/{nodeId:guid}/move", MoveEntryAsync).WithName("MoveComicCollectionEntry");

        return endpoints;
    }

    /// <summary>Every collection in order with its entries, plus every node of the universe's Comic projects one can hold.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var collections = await db.ComicCollections.AsNoTracking()
            .Where(collection => collection.UniverseId == universeId)
            .OrderBy(collection => collection.Kind)
            .ThenBy(collection => collection.SortOrder)
            .Select(collection => new
            {
                collection.Id,
                collection.Kind,
                collection.Name,
                collection.Summary,
                collection.SortOrder,
                collection.Version,
                Entries = collection.Entries
                    .OrderBy(entry => entry.SortOrder)
                    .Select(entry => new
                    {
                        entry.NodeId,
                        entry.Node!.ProjectId,
                        ProjectName = entry.Node.Project!.Name,
                        ProjectKind = entry.Node.Project.Kind,
                        ProjectUniverseId = entry.Node.Project.UniverseId,
                        entry.Node.Level,
                        entry.Node.Title,
                    })
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        var levels = ComicCollectionKinds.Levels.Values.SelectMany(level => level).Distinct().ToArray();
        var candidates = await db.ProjectNodes.AsNoTracking()
            .Where(node => node.Project!.UniverseId == universeId
                && node.Project.Kind == ProjectKind.Comic
                && levels.Contains(node.Level))
            .OrderBy(node => node.Project!.Name)
            .ThenBy(node => node.ProjectId)
            .ThenBy(node => node.SortOrder)
            .ThenBy(node => node.CreatedAt)
            .Select(node => new ComicNodeResponse(node.Id, node.ProjectId, node.Project!.Name, node.Level, node.Title))
            .ToListAsync(cancellationToken);

        // Guard on read: an entry whose node no longer fits (project kind, level or universe changed) is flagged, not deleted.
        var response = collections.Select(collection => new ComicCollectionResponse(
                collection.Id,
                collection.Kind,
                collection.Name,
                collection.Summary,
                collection.SortOrder,
                collection.Version,
                collection.Entries.Select(entry => new ComicEntryResponse(
                        entry.NodeId,
                        entry.ProjectId,
                        entry.ProjectName,
                        entry.Level,
                        entry.Title,
                        entry.ProjectKind == ProjectKind.Comic
                            && entry.ProjectUniverseId == universeId
                            && ComicCollectionKinds.Allows(collection.Kind, entry.Level)))
                    .ToList()))
            .ToList();

        return Results.Ok(new ComicCollectionsResponse(response, candidates));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] ComicCollectionRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var errors = Validate(request) ?? [];

        if (request.Kind is null || !ComicCollectionKinds.Levels.ContainsKey(request.Kind))
        {
            errors["kind"] = ["Choose a story arc or an event."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await db.ComicCollections.CountAsync(collection => collection.UniverseId == universeId, cancellationToken)
            >= ComicCollectionLimits.MaxCollectionsPerUniverse)
        {
            return Problems.Field(
                "name",
                $"A universe can have at most {ComicCollectionLimits.MaxCollectionsPerUniverse} story arcs and events.");
        }

        var sameKind = await db.ComicCollections
            .CountAsync(collection => collection.UniverseId == universeId && collection.Kind == request.Kind, cancellationToken);

        var now = DateTime.UtcNow;
        var collection = new ComicCollection
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Kind = request.Kind!,
            Name = request.Name!.Trim(),
            Summary = LoreValidation.Normalize(request.Summary),
            SortOrder = sameKind,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ComicCollections.Add(collection);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created($"/api/universes/{universeId}/comic-collections/{collection.Id}", Describe(collection));
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid collectionId,
        [FromBody] ComicCollectionRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (Validate(request) is { Count: > 0 } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var collection = await Find(db, universeId, collectionId).FirstOrDefaultAsync(cancellationToken);

        if (collection is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(collection.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                CollectionChangedCode,
                "Collection changed",
                "This collection was changed after it was opened here. Nothing was overwritten.",
                collection.Version);
        }

        collection.Name = request.Name!.Trim();
        collection.Summary = LoreValidation.Normalize(request.Summary);
        collection.UpdatedAt = DateTime.UtcNow;
        collection.Version++;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(Describe(collection));
    }

    /// <summary>Deletes the collection and its entries. The issues and chapters stay as they are.</summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid collectionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var collection = await Find(db, universeId, collectionId).FirstOrDefaultAsync(cancellationToken);

        if (collection is null)
        {
            return Results.NotFound();
        }

        db.ComicCollections.Remove(collection);
        await db.SaveChangesAsync(cancellationToken);

        var rest = await SameKind(db, universeId, collection.Kind).ToListAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, rest, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MoveAsync(
        Guid universeId,
        Guid collectionId,
        [FromBody] ComicPlaceRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var kind = await Find(db, universeId, collectionId).Select(collection => collection.Kind).FirstOrDefaultAsync(cancellationToken);

        if (kind is null)
        {
            return Results.NotFound();
        }

        var collections = await SameKind(db, universeId, kind).ToListAsync(cancellationToken);
        await PlaceAsync(db, collections, collection => collection.Id == collectionId, request.Place,
            collection => collection.SortOrder, (collection, order) => collection.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> AddEntryAsync(
        Guid universeId,
        Guid collectionId,
        [FromBody] ComicEntryRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var kind = await Find(db, universeId, collectionId).Select(collection => collection.Kind).FirstOrDefaultAsync(cancellationToken);

        if (kind is null)
        {
            return Results.NotFound();
        }

        // Another universe's node is reported as unknown, so nothing about it leaks.
        var node = await db.ProjectNodes.AsNoTracking()
            .Where(candidate => candidate.Id == request.NodeId && candidate.Project!.UniverseId == universeId)
            .Select(candidate => new { candidate.Level, candidate.Project!.Kind })
            .FirstOrDefaultAsync(cancellationToken);

        if (node is null)
        {
            return Results.NotFound();
        }

        if (node.Kind != ProjectKind.Comic)
        {
            return Problems.Field("nodeId", "Only a part of a comic can be in a story arc or an event.");
        }

        if (!ComicCollectionKinds.Allows(kind, node.Level))
        {
            return Problems.Field("nodeId", "Only an issue or a chapter can be in a story arc or an event.");
        }

        if (await db.ComicCollectionEntries.AnyAsync(
                entry => entry.CollectionId == collectionId && entry.NodeId == request.NodeId, cancellationToken))
        {
            return EntryExists();
        }

        var entries = db.ComicCollectionEntries.Where(entry => entry.CollectionId == collectionId);
        var count = await entries.CountAsync(cancellationToken);

        if (count >= ComicCollectionLimits.MaxEntriesPerCollection)
        {
            return Problems.Field("nodeId", $"A collection can hold at most {ComicCollectionLimits.MaxEntriesPerCollection} entries.");
        }

        db.ComicCollectionEntries.Add(new ComicCollectionEntry
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            NodeId = request.NodeId,
            SortOrder = count == 0 ? 0 : await entries.MaxAsync(entry => entry.SortOrder, cancellationToken) + 1,
        });

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return EntryExists();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Takes the node out of the collection. The node itself is untouched.</summary>
    private static async Task<IResult> RemoveEntryAsync(
        Guid universeId,
        Guid collectionId,
        Guid nodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var entries = await Entries(db, universeId, collectionId).ToListAsync(cancellationToken);
        var leaving = entries.FirstOrDefault(entry => entry.NodeId == nodeId);

        if (leaving is null)
        {
            return Results.NotFound();
        }

        db.ComicCollectionEntries.Remove(leaving);
        entries.Remove(leaving);
        await db.SaveChangesAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, entries, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MoveEntryAsync(
        Guid universeId,
        Guid collectionId,
        Guid nodeId,
        [FromBody] ComicPlaceRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var entries = await Entries(db, universeId, collectionId).ToListAsync(cancellationToken);

        if (!await PlaceAsync(db, entries, entry => entry.NodeId == nodeId, request.Place,
                entry => entry.SortOrder, (entry, order) => entry.SortOrder = order, cancellationToken))
        {
            return Results.NotFound();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static Task<IResult?> WriteDeniedAsync(
        LorEvolveDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

    private static IQueryable<ComicCollection> Find(LorEvolveDbContext db, Guid universeId, Guid collectionId) =>
        db.ComicCollections.Where(collection => collection.Id == collectionId && collection.UniverseId == universeId);

    private static IQueryable<ComicCollection> SameKind(LorEvolveDbContext db, Guid universeId, string kind) =>
        db.ComicCollections.Where(collection => collection.UniverseId == universeId && collection.Kind == kind)
            .OrderBy(collection => collection.SortOrder);

    private static IQueryable<ComicCollectionEntry> Entries(LorEvolveDbContext db, Guid universeId, Guid collectionId) =>
        db.ComicCollectionEntries
            .Where(entry => entry.CollectionId == collectionId && entry.Collection!.UniverseId == universeId)
            .OrderBy(entry => entry.SortOrder);

    /// <summary>Moves one item of an ordered list to a place, clamped as the season moves are; false when it is not there.</summary>
    private static async Task<bool> PlaceAsync<T>(
        LorEvolveDbContext db,
        List<T> ordered,
        Func<T, bool> isMoving,
        int place,
        Func<T, int> read,
        Action<T, int> write,
        CancellationToken cancellationToken)
    {
        var moving = ordered.FirstOrDefault(isMoving);

        if (moving is null)
        {
            return false;
        }

        ordered.Remove(moving);
        ordered.Insert(Math.Clamp(place, 0, ordered.Count), moving);
        await SeriesEndpoints.PlaceAsync(db, ordered, read, write, cancellationToken);

        return true;
    }

    private static Dictionary<string, string[]>? Validate(ComicCollectionRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give it a name."];
        }
        else if (request.Name.Trim().Length > ComicCollectionLimits.NameMaxLength)
        {
            errors["name"] = ["That name is too long."];
        }

        if (request.Summary is { Length: > ComicCollectionLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        return errors;
    }

    private static ComicCollectionResponse Describe(ComicCollection collection) =>
        new(collection.Id, collection.Kind, collection.Name, collection.Summary, collection.SortOrder, collection.Version, []);

    private static IResult EntryExists() =>
        Results.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "Already in this collection",
            detail: "This part is already in this collection.",
            extensions: new Dictionary<string, object?> { ["code"] = EntryExistsCode });
}
