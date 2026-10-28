using System.Linq.Expressions;
using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.FamilyTrees;

/// <summary>
/// <c>GET /api/universes/{universeId}/family-tree/{entityId}</c>: one entry's family, read-only (ADR 0035).
///
/// Ownership first, then the focal entry must be live in this universe. Another account's universe, another universe's entry,
/// a guessed id and an entry in the Trash are all the same 404, and nothing about them is read.
///
/// Bounded around the focal entry: at most six queries, whatever the family's size - the universe, the focal entry, the parent
/// links touching it, the parent links one step further out from its parents and children, the authored family links touching
/// anyone drawn (Issue #37), and every entry named, with its type and thumbnail. Only relationships whose type has a family
/// meaning are read, only with both ends live, and never an article, field, alias or date. Nothing is written: no
/// relationship, finding, moment, revision or search row.
/// </summary>
public static class FamilyTreeEndpoints
{
    /// <summary>How far the tree reaches from the focal entry, up and down. Fixed: there is no depth parameter.</summary>
    public const int GenerationsEachWay = 2;

    public static IEndpointRouteBuilder MapFamilyTreeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/universes/{universeId:guid}/family-tree/{entityId:guid}", GetAsync)
            .WithTags("Family tree")
            .WithName("GetFamilyTree")
            .RequireAuthorization();

        endpoints.MapGet("/api/universes/{universeId:guid}/family-tree/families", ListFamiliesAsync)
            .WithTags("Family tree")
            .WithName("ListFamilies")
            .RequireAuthorization();

        return endpoints;
    }

    /// <summary>
    /// <c>GET .../family-tree/families?q=&amp;page=&amp;pageSize=</c>: the families the universe already holds, as summaries
    /// (<see cref="FamilyDiscovery"/>). Read access, as every reader of the tree has.
    ///
    /// Three queries whatever the size of the universe or of a family: the access check, every live family link's two ends, and
    /// the live entries they name - id, name and whether their type is enabled. The grouping, the search and the order are worked
    /// out from those in memory, so every family link in the universe is inspected on each request, and only one page of
    /// summaries is answered. No tree, article, field, picture or date is read.
    /// </summary>
    private static async Task<IResult> ListFamiliesAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? q = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = FamilyDiscovery.DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, FamilyDiscovery.MaxPageSize);

        var edges = await LiveLinks(db, universeId)
            .Select(relationship => new FamilyDiscovery.Edge(relationship.SourceEntityId, relationship.TargetEntityId))
            .ToListAsync(cancellationToken);

        var ids = edges.SelectMany(edge => new[] { edge.SourceEntityId, edge.TargetEntityId }).Distinct().ToList();

        var eligible = FamilyTreeEligibility.TypeIds(db, universeId);
        var members = ids.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && ids.Contains(entity.Id))
                .Select(entity => new FamilyDiscovery.Member(entity.Id, entity.Name, eligible.Contains(entity.EntityTypeId)))
                .ToListAsync(cancellationToken);

        var families = FamilyDiscovery.Families(edges, members, q);

        // Widened before multiplying, as every page here is.
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);
        var totalPages = families.Count == 0 ? 0 : (int)Math.Ceiling(families.Count / (double)pageSize);

        return Results.Ok(new FamilyDiscoveryPage(
            [.. families.Skip(skip).Take(pageSize)], page, pageSize, families.Count, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.Entities.AnyAsync(
                entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null,
                cancellationToken))
        {
            return Results.NotFound();
        }

        // Every parent link touching the focal entry, in one query.
        var near = await LiveLinks(db, universeId)
            .Where(relationship => RelationshipFamilySemantics.Parent.Contains(relationship.RelationshipType!.FamilySemantic))
            .Where(relationship => relationship.SourceEntityId == entityId || relationship.TargetEntityId == entityId)
            .Select(ToRow)
            .ToListAsync(cancellationToken);

        var parents = near.Where(row => row.ChildEntityId == entityId).Select(row => row.ParentEntityId).Distinct().ToList();
        var children = near.Where(row => row.ParentEntityId == entityId).Select(row => row.ChildEntityId).Distinct().ToList();

        // One step further out, in one query: a parent's parents (grandparents), a parent's children (siblings) and a child's
        // children (grandchildren).
        List<LinkRow> far = parents.Count == 0 && children.Count == 0
            ? []
            : await LiveLinks(db, universeId)
                .Where(relationship => RelationshipFamilySemantics.Parent.Contains(relationship.RelationshipType!.FamilySemantic))
                .Where(relationship => parents.Contains(relationship.TargetEntityId)
                    || parents.Contains(relationship.SourceEntityId)
                    || children.Contains(relationship.SourceEntityId))
                .Select(ToRow)
                .ToListAsync(cancellationToken);

        var rows = near.Concat(far).DistinctBy(row => row.RelationshipId).ToList();
        var family = FamilyTreeDerivation.Relatives(entityId, Links(rows));

        // Out to the side: a grandparent's children (aunts and uncles) and a sibling's children (nieces and nephews), then an
        // aunt or uncle's children (cousins). One query each.
        var grandparentsAndSiblings = family.Grandparents.Concat(family.Siblings).Select(relative => relative.EntityId).ToList();
        if (grandparentsAndSiblings.Count > 0)
        {
            rows = [.. rows.Concat(await ParentLinksFrom(db, universeId, grandparentsAndSiblings, cancellationToken)).DistinctBy(row => row.RelationshipId)];
            family = FamilyTreeDerivation.Relatives(entityId, Links(rows));
        }

        var auntsUncles = family.AuntsUncles.Select(relative => relative.EntityId).ToList();
        if (auntsUncles.Count > 0)
        {
            rows = [.. rows.Concat(await ParentLinksFrom(db, universeId, auntsUncles, cancellationToken)).DistinctBy(row => row.RelationshipId)];
            family = FamilyTreeDerivation.Relatives(entityId, Links(rows));
        }

        var links = Links(rows);

        // Only links a relative's path walks are drawn or checked for a circle, so the tree says nothing about a link it does
        // not show.
        var positions = new[]
        {
            family.Parents, family.Grandparents, family.Siblings, family.Children, family.Grandchildren,
            family.AuntsUncles, family.Cousins, family.NiecesNephews,
        };
        var used = positions
            .SelectMany(relatives => relatives.SelectMany(relative => relative.Paths.SelectMany(path => path)))
            .ToHashSet();
        var shown = rows.Where(row => used.Contains(row.RelationshipId)).ToList();
        var loops = FamilyTreeDerivation.Loops(links.Where(link => used.Contains(link.RelationshipId)));

        // Everyone drawn, and in one query every authored non-structural family link touching any of them, so each member's
        // details can list its own (Issue #37). Listed, never walked: the positions above are already settled.
        var drawn = positions
            .SelectMany(relatives => relatives.Select(relative => relative.EntityId))
            .Append(entityId)
            .ToHashSet();
        var drawnIds = drawn.ToList();
        var authored = await LiveLinks(db, universeId)
            .Where(relationship => relationship.RelationshipType!.FamilySemantic == RelationshipFamilySemantic.NonStructuralFamily)
            .Where(relationship => drawnIds.Contains(relationship.SourceEntityId) || drawnIds.Contains(relationship.TargetEntityId))
            .Select(ToRow)
            .ToListAsync(cancellationToken);

        var nodeIds = shown
            .Concat(authored)
            .SelectMany(row => new[] { row.ParentEntityId, row.ChildEntityId })
            .Append(entityId)
            .Distinct()
            .ToList();

        var nodes = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && nodeIds.Contains(entity.Id))
            .Select(ToNode(FamilyTreeEligibility.TypeIds(db, universeId)))
            .ToListAsync(cancellationToken);

        var names = nodes.ToDictionary(node => node.EntityId, node => node.Name);
        string NameOf(Guid id) => names.GetValueOrDefault(id, string.Empty);

        IReadOnlyList<FamilyTreeRelative> Named(IReadOnlyList<DerivedRelative> relatives) =>
        [
            .. relatives
                .OrderBy(relative => NameOf(relative.EntityId), StringComparer.Ordinal)
                .ThenBy(relative => relative.EntityId)
                .Select(relative => new FamilyTreeRelative(relative.EntityId, relative.Paths)),
        ];

        return Results.Ok(new FamilyTreeResponse(
            entityId,
            GenerationsEachWay,
            [.. nodes.OrderBy(node => node.Name, StringComparer.Ordinal).ThenBy(node => node.EntityId)],
            [
                .. shown
                    .OrderBy(row => NameOf(row.ParentEntityId), StringComparer.Ordinal)
                    .ThenBy(row => NameOf(row.ChildEntityId), StringComparer.Ordinal)
                    .ThenBy(row => row.RelationshipId)
                    .Select(row => new FamilyTreeLink(
                        row.RelationshipId,
                        row.ParentEntityId,
                        row.ChildEntityId,
                        row.Semantic,
                        row.CanonStatus,
                        row.RelationshipTypeId,
                        row.RelationshipTypeName)),
            ],
            Named(family.Parents),
            Named(family.Grandparents),
            Named(family.Siblings),
            Named(family.Children),
            Named(family.Grandchildren),
            [
                .. loops.Select(loop => new FamilyTreeLoop(
                    [.. loop.EntityIds.OrderBy(NameOf, StringComparer.Ordinal).ThenBy(id => id)],
                    loop.RelationshipIds)),
            ],
            [.. Connections(drawn, entityId, authored, NameOf)],
            Named(family.AuntsUncles),
            Named(family.Cousins),
            Named(family.NiecesNephews)));
    }

    private static List<FamilyLink> Links(IEnumerable<LinkRow> rows) =>
    [
        .. rows.Select(row => new FamilyLink(
            row.RelationshipId, row.RelationshipTypeId, row.ParentEntityId, row.ChildEntityId, row.Semantic)),
    ];

    /// <summary>Every live parent link whose parent is one of <paramref name="parentIds"/>.</summary>
    private static Task<List<LinkRow>> ParentLinksFrom(
        LorEvolveDbContext db,
        Guid universeId,
        List<Guid> parentIds,
        CancellationToken cancellationToken) =>
        LiveLinks(db, universeId)
            .Where(relationship => RelationshipFamilySemantics.Parent.Contains(relationship.RelationshipType!.FamilySemantic))
            .Where(relationship => parentIds.Contains(relationship.SourceEntityId))
            .Select(ToRow)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Every drawn member's non-structural family links, each read from that member's side with the kind's own wording - the
    /// same <see cref="RelationshipValidation.LabelFor"/> every relation list uses. A link between two drawn members is listed
    /// once from each side. A link to itself is left to the relation list. The focal entry's come first, then by member name.
    /// </summary>
    private static IEnumerable<FamilyTreeConnection> Connections(
        HashSet<Guid> drawn,
        Guid focalEntityId,
        List<LinkRow> authored,
        Func<Guid, string> nameOf) =>
        authored
            .Where(row => row.ParentEntityId != row.ChildEntityId)
            .SelectMany(row => new[]
                {
                    // For these rows "parent" and "child" are only the stored source and target: nobody is a parent here.
                    (Member: row.ParentEntityId, Perspective: RelationshipPerspective.Forward, Related: row.ChildEntityId),
                    (Member: row.ChildEntityId, Perspective: RelationshipPerspective.Inverse, Related: row.ParentEntityId),
                }
                .Where(side => drawn.Contains(side.Member))
                .Select(side => new FamilyTreeConnection(
                    row.RelationshipId,
                    side.Related,
                    side.Perspective,
                    RelationshipValidation.LabelFor(
                        row.RelationshipTypeName, row.RelationshipTypeInverseName, row.IsSymmetric, side.Perspective),
                    row.CanonStatus,
                    row.RelationshipTypeId,
                    side.Member)))
            .OrderBy(connection => connection.EntityId != focalEntityId)
            .ThenBy(connection => nameOf(connection.EntityId), StringComparer.Ordinal)
            .ThenBy(connection => connection.EntityId)
            .ThenBy(connection => connection.Label, StringComparer.Ordinal)
            .ThenBy(connection => nameOf(connection.RelatedEntityId), StringComparer.Ordinal)
            .ThenBy(connection => connection.RelationshipId);

    /// <summary>
    /// Every live family link of this universe: a relationship whose type has a family meaning, with both ends live. The type and
    /// both ends are held to the universe as well as the row, so nothing another universe holds can be walked into. Only the
    /// parent meanings among them are walked; the caller keeps the rest apart.
    /// </summary>
    private static IQueryable<LoreRelationship> LiveLinks(LorEvolveDbContext db, Guid universeId) =>
        db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId
                && relationship.DeletedAt == null
                && relationship.RelationshipType!.UniverseId == universeId
                && relationship.RelationshipType.FamilySemantic != RelationshipFamilySemantic.None
                && relationship.SourceEntity!.UniverseId == universeId
                && relationship.SourceEntity.DeletedAt == null
                && relationship.TargetEntity!.UniverseId == universeId
                && relationship.TargetEntity.DeletedAt == null);

    /// <summary>The stored direction, read as the family meaning says: source parent, target child.</summary>
    private static readonly Expression<Func<LoreRelationship, LinkRow>> ToRow = relationship => new LinkRow(
        relationship.Id,
        relationship.SourceEntityId,
        relationship.TargetEntityId,
        relationship.RelationshipType!.FamilySemantic,
        relationship.CanonStatus,
        relationship.RelationshipTypeId,
        relationship.RelationshipType.Name,
        relationship.RelationshipType.InverseName,
        relationship.RelationshipType.IsSymmetric);

    /// <summary>A node, with whether its type is eligible by the one rule, <see cref="FamilyTreeEligibility"/>.</summary>
    private static Expression<Func<LoreEntity, FamilyTreeNode>> ToNode(IQueryable<Guid> eligible) => entity => new FamilyTreeNode(
        entity.Id,
        entity.Name,
        entity.EntityTypeId,
        entity.EntityType!.Name,
        entity.EntityType.Icon,
        entity.EntityType.AccentColor,
        entity.CanonStatus,
        entity.Image == null
            ? null
            : new EntityImageRef(
                entity.Image.AssetId,
                entity.Image.ThumbnailId,
                entity.Image.Width,
                entity.Image.Height,
                entity.Image.ContentType,
                entity.Image.FileName,
                entity.Image.ByteSize,
                entity.Image.UploadedAt,
                entity.Image.CropX == null
                    ? null
                    : new EntityImageCrop(
                        entity.Image.CropX.Value,
                        entity.Image.CropY!.Value,
                        entity.Image.CropWidth!.Value,
                        entity.Image.CropHeight!.Value)),
        eligible.Contains(entity.EntityTypeId));

    private sealed record LinkRow(
        Guid RelationshipId,
        Guid ParentEntityId,
        Guid ChildEntityId,
        RelationshipFamilySemantic Semantic,
        CanonStatus CanonStatus,
        Guid RelationshipTypeId,
        string RelationshipTypeName,
        string? RelationshipTypeInverseName,
        bool IsSymmetric);
}
