using System.Security.Claims;
using LorEvolve.Api.Common;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Projects;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The authored structure of a project whose format has rules (#290): one ordered tree of <see cref="ProjectNode"/>s,
/// shaped by <see cref="ProjectStructures"/>. A later format plugs in by adding its rule entry; nothing here changes.
///
/// <para>A project without a rule-backed format answers 404 on every route, the same "not here" a season route gives a
/// kind without seasons, and keeps its legacy structure in <see cref="SeriesEndpoints"/>. Access is the project's,
/// through <see cref="ProjectAccess"/>.</para>
/// </summary>
public static class StructureEndpoints
{
    /// <summary>The 409 for a node save written over a version that is no longer current (ADR 0043).</summary>
    public const string NodeChangedCode = "project_node_changed";

    public static IEndpointRouteBuilder MapStructureEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects/{projectId:guid}/structure")
            .WithTags("Project structure")
            .RequireAuthorization();

        group.MapGet("/", TreeAsync).WithName("GetProjectStructure");
        group.MapGet("/{nodeId:guid}", GetNodeAsync).WithName("GetProjectNode");
        group.MapPost("/", CreateNodeAsync).WithName("CreateProjectNode");
        group.MapPut("/{nodeId:guid}", UpdateNodeAsync).WithName("UpdateProjectNode");
        group.MapDelete("/{nodeId:guid}", DeleteNodeAsync).WithName("DeleteProjectNode");
        group.MapPost("/{nodeId:guid}/move", MoveNodeAsync).WithName("MoveProjectNode");

        return endpoints;
    }

    /// <summary>The rules of a project's format when its kind and format allow a node structure, else null.</summary>
    internal static ProjectStructures.Rules? RulesOf(CreativeProject project) =>
        project.Format is { } format && ProjectFormats.Allows(project.Kind, format) ? ProjectStructures.For(format) : null;

    private static async Task<(CreativeProject? Project, ProjectStructures.Rules? Rules, IResult? Denied)> HolderAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        bool write,
        CancellationToken cancellationToken)
    {
        var (project, denied) = write
            ? await WritableAsync(db, projectId, principal, cancellationToken)
            : await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return (null, null, denied);
        }

        return RulesOf(project!) is { } rules ? (project, rules, null) : (null, null, Results.NotFound());
    }

    private static async Task<IResult> TreeAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, rules, denied) = await HolderAsync(db, projectId, principal, write: false, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        // Bodies are left out: a film's scripts are a great deal of text, and one node's body has its own route.
        var nodes = await db.ProjectNodes.AsNoTracking()
            .Where(node => node.ProjectId == projectId)
            .OrderBy(node => node.ParentId)
            .ThenBy(node => node.SortOrder)
            .Select(node => new ProjectNodeSummary(
                node.Id,
                node.ParentId,
                node.Level,
                node.Title,
                node.Summary,
                node.Body != null ? node.Body.Length : 0,
                node.SortOrder,
                node.Version,
                null))
            .ToListAsync(cancellationToken);

        // A page's or panel's picture (#295), never its script: the tree stays small.
        var images = await db.ProjectNodeImages.AsNoTracking()
            .Where(image => image.Node!.ProjectId == projectId)
            .ToDictionaryAsync(image => image.NodeId, cancellationToken);

        nodes = [.. nodes.Select(node => images.TryGetValue(node.Id, out var image)
            ? node with { Image = FieldImageRef.Of(image) }
            : node)];

        return Results.Ok(new ProjectStructureTree(project!.Format!, rules!.Roots, rules.Children, nodes));
    }

    private static async Task<IResult> GetNodeAsync(
        Guid projectId,
        Guid nodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, _, denied) = await HolderAsync(db, projectId, principal, write: false, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var node = await db.ProjectNodes.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == nodeId && candidate.ProjectId == projectId, cancellationToken);

        if (node is null)
        {
            return Results.NotFound();
        }

        var image = await db.ProjectNodeImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.NodeId == nodeId, cancellationToken);

        return Results.Ok(Describe(node, image));
    }

    private static async Task<IResult> CreateNodeAsync(
        Guid projectId,
        [FromBody] ProjectNodeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, rules, denied) = await HolderAsync(db, projectId, principal, write: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateText(request.Title, request.Summary, request.Body) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        string? parentLevel = null;

        if (request.ParentId is { } parentId)
        {
            parentLevel = await db.ProjectNodes
                .Where(node => node.Id == parentId && node.ProjectId == projectId)
                .Select(node => node.Level)
                .FirstOrDefaultAsync(cancellationToken);

            if (parentLevel is null)
            {
                return Problems.Field("parentId", "That parent is not part of this project.");
            }
        }

        var level = request.Level?.Trim() ?? "";

        if (!ProjectStructures.Allows(rules!, parentLevel, level))
        {
            return Problems.Field("level", parentLevel is null
                ? "That level can't sit at the top of this project's structure."
                : "That level can't sit inside this one.");
        }

        if (await db.ProjectNodes.CountAsync(node => node.ProjectId == projectId, cancellationToken)
            >= StructureLimits.MaxNodesPerProject)
        {
            return Problems.Field("level", "This project holds as many items as it can.");
        }

        var siblings = await Siblings(db, projectId, request.ParentId).ToListAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var node = new ProjectNode
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            ParentId = request.ParentId,
            Level = level,
            Title = LoreValidation.Normalize(request.Title),
            Summary = LoreValidation.Normalize(request.Summary),
            Body = LoreValidation.Normalize(request.Body),
            SortOrder = siblings.Count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ProjectNodes.Add(node);
        await db.SaveChangesAsync(cancellationToken);

        if (request.Place is { } place && place < siblings.Count)
        {
            siblings.Insert(Math.Max(place, 0), node);
            await SeriesEndpoints.PlaceAsync(db, siblings, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Created($"/api/projects/{projectId}/structure/{node.Id}", Describe(node, null));
    }

    private static async Task<IResult> UpdateNodeAsync(
        Guid projectId,
        Guid nodeId,
        [FromBody] ProjectNodeUpdate request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, _, denied) = await HolderAsync(db, projectId, principal, write: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateText(request.Title, request.Summary, request.Body) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        (string Field, string? Value)[] script =
        [
            ("dialogue", request.Dialogue),
            ("caption", request.Caption),
            ("sfx", request.Sfx),
            ("notes", request.Notes),
        ];

        if (script.FirstOrDefault(part => part.Value is { Length: > StructureLimits.ScriptFieldMaxLength }) is { Field: { } tooLong })
        {
            return Problems.Field(tooLong, "That text is too long.");
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var node = await db.ProjectNodes
            .FirstOrDefaultAsync(candidate => candidate.Id == nodeId && candidate.ProjectId == projectId, cancellationToken);

        if (node is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(node.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                NodeChangedCode,
                "Item changed",
                "This item was changed after it was opened here. Nothing was overwritten.",
                node.Version);
        }

        if (node.Level != "panel"
            && script.FirstOrDefault(part => LoreValidation.Normalize(part.Value) is not null) is { Field: { } misplaced })
        {
            return Problems.Field(misplaced, "Only a panel holds script text.");
        }

        node.Dialogue = LoreValidation.Normalize(request.Dialogue);
        node.Caption = LoreValidation.Normalize(request.Caption);
        node.Sfx = LoreValidation.Normalize(request.Sfx);
        node.Notes = LoreValidation.Normalize(request.Notes);
        node.Title = LoreValidation.Normalize(request.Title);
        node.Summary = LoreValidation.Normalize(request.Summary);
        node.Body = LoreValidation.Normalize(request.Body);
        node.UpdatedAt = DateTime.UtcNow;
        node.Version++;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var image = await db.ProjectNodeImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.NodeId == nodeId, cancellationToken);

        return Results.Ok(Describe(node, image));
    }

    /// <summary>Deletes the node and its whole subtree (the database cascade), then closes up its siblings.</summary>
    private static async Task<IResult> DeleteNodeAsync(
        Guid projectId,
        Guid nodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (_, _, denied) = await HolderAsync(db, projectId, principal, write: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var node = await db.ProjectNodes
            .FirstOrDefaultAsync(candidate => candidate.Id == nodeId && candidate.ProjectId == projectId, cancellationToken);

        if (node is null)
        {
            return Results.NotFound();
        }

        // The subtree's pictures (#295), read while their rows exist and swept once the cascade has committed.
        var subtree = await SubtreeAsync(db, projectId, nodeId, cancellationToken);
        var pictureKeys = (await db.ProjectNodeImages
                .Where(image => subtree.Contains(image.NodeId))
                .Select(image => new { image.OriginalKey, image.CropKey })
                .ToListAsync(cancellationToken))
            .SelectMany(image => new[] { image.OriginalKey, image.CropKey })
            .ToArray();

        db.ProjectNodes.Remove(node);
        await db.SaveChangesAsync(cancellationToken);

        var siblings = await Siblings(db, projectId, node.ParentId).ToListAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, siblings, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await MediaObjectWrites.SweepAsync(store, loggerFactory.CreateLogger(NodeImageEndpoints.LoggerName), pictureKeys);

        return Results.NoContent();
    }

    /// <summary>
    /// Reorders a node among its siblings, or moves it under another parent when the rules allow its level there. A
    /// node never moves into its own subtree. Both sibling lists are renumbered.
    /// </summary>
    private static async Task<IResult> MoveNodeAsync(
        Guid projectId,
        Guid nodeId,
        [FromBody] ProjectNodeMove request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, rules, denied) = await HolderAsync(db, projectId, principal, write: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var node = await db.ProjectNodes
            .FirstOrDefaultAsync(candidate => candidate.Id == nodeId && candidate.ProjectId == projectId, cancellationToken);

        if (node is null)
        {
            return Results.NotFound();
        }

        var oldParentId = node.ParentId;

        if (request.ParentId != oldParentId)
        {
            string? parentLevel = null;

            if (request.ParentId is { } parentId)
            {
                // The project's tree without bodies, to walk up from the new parent and look for the moving node.
                var tree = await db.ProjectNodes.AsNoTracking()
                    .Where(candidate => candidate.ProjectId == projectId)
                    .Select(candidate => new { candidate.Id, candidate.ParentId, candidate.Level })
                    .ToDictionaryAsync(candidate => candidate.Id, cancellationToken);

                if (!tree.TryGetValue(parentId, out var parent))
                {
                    return Problems.Field("parentId", "That parent is not part of this project.");
                }

                for (Guid? at = parentId; at is { } current; at = tree[current].ParentId)
                {
                    if (current == nodeId)
                    {
                        return Problems.Field("parentId", "An item can't move inside itself.");
                    }
                }

                parentLevel = parent.Level;
            }

            if (!ProjectStructures.Allows(rules!, parentLevel, node.Level))
            {
                return Problems.Field("parentId", "This item can't sit there.");
            }

            node.ParentId = request.ParentId;
        }

        var siblings = await Siblings(db, projectId, request.ParentId)
            .Where(candidate => candidate.Id != nodeId)
            .ToListAsync(cancellationToken);

        siblings.Insert(Math.Clamp(request.Place, 0, siblings.Count), node);
        node.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, siblings, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);

        if (oldParentId != request.ParentId)
        {
            var left = await Siblings(db, projectId, oldParentId).ToListAsync(cancellationToken);
            await SeriesEndpoints.PlaceAsync(db, left, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static IQueryable<ProjectNode> Siblings(LorEvolveDbContext db, Guid projectId, Guid? parentId) =>
        db.ProjectNodes
            .Where(node => node.ProjectId == projectId && node.ParentId == parentId)
            .OrderBy(node => node.SortOrder);

    /// <summary>The node and every node under it, by walking the project's parent links.</summary>
    private static async Task<HashSet<Guid>> SubtreeAsync(
        LorEvolveDbContext db,
        Guid projectId,
        Guid nodeId,
        CancellationToken cancellationToken)
    {
        var links = await db.ProjectNodes.AsNoTracking()
            .Where(node => node.ProjectId == projectId && node.ParentId != null)
            .Select(node => new { node.Id, Parent = node.ParentId!.Value })
            .ToListAsync(cancellationToken);
        var children = links.ToLookup(link => link.Parent, link => link.Id);

        var subtree = new HashSet<Guid> { nodeId };
        var pending = new Stack<Guid>([nodeId]);
        while (pending.TryPop(out var current))
        {
            foreach (var child in children[current].Where(subtree.Add))
            {
                pending.Push(child);
            }
        }

        return subtree;
    }

    private static ProjectNodeDetail Describe(ProjectNode node, ProjectNodeImage? image) => new(
        node.Id,
        node.ParentId,
        node.Level,
        node.Title,
        node.Summary,
        node.Body,
        node.SortOrder,
        node.CreatedAt,
        node.UpdatedAt,
        node.Version,
        node.Dialogue,
        node.Caption,
        node.Sfx,
        node.Notes,
        image is null ? null : FieldImageRef.Of(image));

    private static Dictionary<string, string[]>? ValidateText(string? title, string? summary, string? body)
    {
        var errors = new Dictionary<string, string[]>();

        if (title is not null && title.Trim().Length > SeriesLimits.NameMaxLength)
        {
            errors["title"] = ["That title is too long."];
        }

        if (summary is { Length: > SeriesLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        if (body is { Length: > SeriesLimits.ScriptMaxLength })
        {
            errors["body"] = ["That text is too long to save in one piece."];
        }

        return errors.Count == 0 ? null : errors;
    }
}
