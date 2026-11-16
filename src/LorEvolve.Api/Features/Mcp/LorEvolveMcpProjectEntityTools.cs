using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// What a project is made of, for an MCP client (#148): the types it defines, the entries of those types, and the
/// structure a series, a film or a comic is built in.
///
/// <para><b>One set of tools for every kind of project.</b> A game's units, a series' characters, a film's props and a
/// comic's cast are the same rows under different project kinds (#143 to #147), so a client learns one shape and reads
/// any of them. The tools say which kind a project is and what its structure is called, rather than offering four
/// near-identical families a client would have to choose between.</para>
///
/// <para><b>The connection's universe, and nothing wider.</b> Every project belongs to exactly one universe (#171) and
/// the universe is <see cref="McpCaller"/>'s, set by the gate from the token, so these tools never take one. A project
/// id from another universe is not found rather than refused, which is what every other tool here does.</para>
///
/// <para><b>Read-only, and writes go through review.</b> Nothing here changes anything: a project's entries are
/// proposed through <c>propose_changes</c> and applied only when the person approves them in LorEvolve, exactly as a
/// lore entry's changes are. That is the same gate, not a parallel one.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpProjectEntityTools(LorEvolveDbContext db, McpCaller caller)
{
    public const string TypesTool = "get_project_schema";
    public const string ListTool = "list_project_entries";
    public const string GetTool = "get_project_entry";
    public const string StructureTool = "get_project_structure";
    public const string ScriptTool = "get_project_script";

    /// <summary>How many entries one page holds. The same 25 the timeline browses in.</summary>
    public const int PageSize = 25;

    /// <summary>What a client is told about these tools, added to the server's instructions.</summary>
    public const string Instructions =
        "Project contents: a project defines its own types and holds entries of them, separate from the universe's lore. "
        + "get_project_schema lists one project's types with their fields and choices, including the fields a nested type "
        + "inherits. list_project_entries reads that project's entries, 25 to a page, optionally of one type or matching words. "
        + "get_project_entry reads one entry with its field values and the lore entry it stands for, when the author named one. "
        + "get_project_structure reads how a series, a film or a comic is laid out: seasons of episodes, sequences of scenes, or "
        + "volumes of chapters with pages and panels; get_project_script reads one episode's, scene's or chapter's script whole.  To change a project's entries, send propose_changes with projectEntry "
        + "operations. A project's types and their fields are proposed through propose_changes too, as project_type and "
        + "project_field (create and update), in the same proposal as entries that use them: an entry names a new type with "
        + "typeRef and a new field with fieldRef. Nothing is applied until the person approves it in LorEvolve.";

    [McpServerTool(Name = TypesTool, Title = "Read a project's own types", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("The types one project defines for itself, with the fields on each: a game's Map, Unit and Item, a series' or "
        + "film's Character, Location and Prop, a comic's cast and its published unit, or whatever the author made instead. "
        + "Each field says its kind (short text, long text, number, yes or no, date, one choice, several choices, or a link to "
        + "another entry) and its choices where it has them. Fields a type inherits from the type above it are listed "
        + "separately, because they are defined once on that type and not copied down. These types are the project's own and "
        + "are never the universe's lore types.")]
    public async Task<CallToolResult> GetProjectSchemaAsync(
        [Description("The project's id, from list_projects.")] string projectId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (await ProjectAsync(projectId, cancellationToken) is not { } project)
        {
            return NotFound(NoSuchId);
        }

        // IgnoreQueryFilters with the project named: the filter that keeps a project's types out of the lore would
        // otherwise keep them out of this read too (#143).
        var types = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
            .Where(type => type.ProjectId == project.Id)
            .OrderBy(type => type.DisplayOrder).ThenBy(type => type.Name)
            .Select(type => new
            {
                type.Id,
                type.Name,
                type.Description,
                type.ParentId,
                Fields = db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
                    .Where(field => field.EntityTypeId == type.Id && field.ArchivedAt == null)
                    .OrderBy(field => field.DisplayOrder).ThenBy(field => field.Name)
                    .Select(field => new
                    {
                        field.Id,
                        field.Name,
                        field.Kind,
                        field.IsRequired,
                        Choices = field.Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value).ToList(),
                    })
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        var parentOf = types.ToDictionary(type => type.Id, type => type.ParentId);

        return Result(new
        {
            projectId = project.Id,
            project = project.Name,
            kind = project.Kind,
            types = types.Select(type => new
            {
                type.Id,
                type.Name,
                type.Description,
                parentTypeId = type.ParentId,
                fields = type.Fields,
                // The fields this type has from the types above it: defined once there, read here so a client knows
                // what an entry of this type can hold without walking the tree itself.
                inheritedFields = EntityTypeHierarchy.Lineage(parentOf, type.Id)
                    .Where(ancestor => ancestor != type.Id)
                    .SelectMany(ancestor => types.Where(each => each.Id == ancestor).SelectMany(each => each.Fields))
                    .ToList(),
            }),
        });
    }

    [McpServerTool(Name = ListTool, Title = "List a project's entries", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("One project's entries, 25 to a page, most recently changed first: its maps, units, characters, props or "
        + "whatever its types are. Optionally only entries of one type, or only those whose name or summary holds the words "
        + "given. Says the total and whether there is another page. These are the project's entries and never the universe's "
        + "lore entries; an entry that stands for a lore entry says so with canonEntryId.")]
    public async Task<CallToolResult> ListProjectEntriesAsync(
        [Description("The project's id, from list_projects.")] string projectId,
        [Description("Optional type id, from get_project_schema: only entries of that type.")] string? typeId = null,
        [Description("Optional words to find in an entry's name or summary.")] string? search = null,
        [Description("The page, from 1. Default 1.")] int? page = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (await ProjectAsync(projectId, cancellationToken) is not { } project)
        {
            return NotFound(NoSuchId);
        }

        if (!OptionalId(typeId, out var type))
        {
            return NotFound(NoSuchId);
        }

        var words = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var wanted = Math.Clamp(page ?? 1, 1, 1_000);

        var query = db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(entry => entry.ProjectId == project.Id && entry.DeletedAt == null);

        if (type is { } only)
        {
            query = query.Where(entry => entry.EntityTypeId == only);
        }

        if (words is not null)
        {
            query = query.Where(entry => entry.Name.Contains(words) || (entry.Summary != null && entry.Summary.Contains(words)));
        }

        var total = await query.CountAsync(cancellationToken);

        var rows = await query
            .OrderByDescending(entry => entry.UpdatedAt).ThenBy(entry => entry.Id)
            .Skip((wanted - 1) * PageSize)
            .Take(PageSize)
            .Select(entry => new
            {
                entry.Id,
                entry.Name,
                entry.Summary,
                typeId = entry.EntityTypeId,
                type = entry.EntityType!.Name,
                canonEntryId = entry.CanonEntityId,
                canonEntry = db.Entities.IgnoreQueryFilters()
                    .Where(canon => canon.Id == entry.CanonEntityId)
                    .Select(canon => canon.Name)
                    .FirstOrDefault(),
                entry.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return Result(new
        {
            projectId = project.Id,
            project = project.Name,
            kind = project.Kind,
            page = wanted,
            pageSize = PageSize,
            total,
            hasMore = wanted * PageSize < total,
            entries = rows,
        });
    }

    [McpServerTool(Name = GetTool, Title = "Read a project's entry", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("One entry of a project, with every field value the author filled in, the type it is of, and the universe's "
        + "lore entry it stands for when the author named one. A field with no value is left out rather than sent empty.")]
    public async Task<CallToolResult> GetProjectEntryAsync(
        [Description("The project's id, from list_projects.")] string projectId,
        [Description("The entry's id, from list_project_entries.")] string entryId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (await ProjectAsync(projectId, cancellationToken) is not { } project
            || !OptionalId(entryId, out var wanted)
            || wanted is not { } id)
        {
            return NotFound(NoSuchId);
        }

        var entry = await db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(candidate => candidate.Id == id && candidate.ProjectId == project.Id && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Name,
                candidate.Summary,
                typeId = candidate.EntityTypeId,
                type = candidate.EntityType!.Name,
                canonEntryId = candidate.CanonEntityId,
                canonEntry = db.Entities.IgnoreQueryFilters()
                    .Where(canon => canon.Id == candidate.CanonEntityId)
                    .Select(canon => canon.Name)
                    .FirstOrDefault(),
                candidate.CreatedAt,
                candidate.UpdatedAt,
                Values = candidate.FieldValues
                    .Where(value => value.FieldDefinition!.ArchivedAt == null)
                    .OrderBy(value => value.FieldDefinition!.DisplayOrder)
                    .Select(value => new
                    {
                        fieldId = value.FieldDefinitionId,
                        field = value.FieldDefinition!.Name,
                        value.FieldDefinition.Kind,
                        text = value.TextValue,
                        number = value.NumberValue,
                        boolean = value.BooleanValue,
                        date = value.DateValue,
                        choice = value.Option != null ? value.Option.Value : null,
                        linkedEntryId = value.ReferencedEntityId,
                        linkedEntry = value.ReferencedEntity != null ? value.ReferencedEntity.Name : null,
                    })
                    .ToList(),

                // An image field (Issue #238) is named with its picture's size, never its bytes.
                images = db.EntityFieldImages
                    .Where(image => image.EntityId == candidate.Id && image.FieldDefinition!.ArchivedAt == null)
                    .OrderBy(image => image.FieldDefinition!.DisplayOrder)
                    .Select(image => new
                    {
                        fieldId = image.FieldDefinitionId,
                        field = image.FieldDefinition!.Name,
                        kind = "image",
                        width = image.Width,
                        height = image.Height,
                    })
                    .ToList(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return entry is null ? NotFound(NoSuchId) : Result(entry);
    }

    [McpServerTool(Name = StructureTool, Title = "Read a project's structure", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("How a project is laid out, in the author's order: a series' seasons and episodes, a film's sequences and "
        + "scenes, or a comic's volumes and chapters with the pages and panels beneath them. Says whether an episode or scene "
        + "has a script and how long it is, rather than sending the whole script: read one with get_project_script. A project "
        + "of a kind with no such structure, a novel or a game, says so and lists nothing.")]
    public async Task<CallToolResult> GetProjectStructureAsync(
        [Description("The project's id, from list_projects.")] string projectId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (await ProjectAsync(projectId, cancellationToken) is not { } project)
        {
            return NotFound(NoSuchId);
        }

        var bands = await db.ProjectSeasons.AsNoTracking()
            .Where(season => season.ProjectId == project.Id)
            .OrderBy(season => season.SortOrder)
            .Select(season => new
            {
                season.Id,
                season.Name,
                season.Summary,
                Units = season.Episodes
                    .OrderBy(episode => episode.SortOrder)
                    .Select(episode => new
                    {
                        episode.Id,
                        episode.Title,
                        episode.Synopsis,
                        hasScript = episode.Script != null,
                        scriptLength = episode.Script != null ? episode.Script.Length : 0,
                        Pages = db.ProjectPages.AsNoTracking()
                            .Where(page => page.EpisodeId == episode.Id)
                            .OrderBy(page => page.SortOrder)
                            .Select(page => new
                            {
                                page.Id,
                                page.Name,
                                Panels = page.Panels
                                    .OrderBy(panel => panel.SortOrder)
                                    .Select(panel => new
                                    {
                                        panel.Id,
                                        panel.Description,
                                        panel.Dialogue,
                                        showsEntryId = panel.CanonEntityId,
                                    })
                                    .ToList(),
                            })
                            .ToList(),
                    })
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        // The words a client should use back, so it describes the project the way the author's screen does.
        var (band, unit) = project.Kind switch
        {
            ProjectKind.Film => ("sequence", "scene"),
            ProjectKind.Comic => ("volume", "chapter"),
            _ => ("season", "episode"),
        };

        return Result(new
        {
            projectId = project.Id,
            project = project.Name,
            kind = project.Kind,
            bandName = band,
            unitName = unit,
            hasStructure = bands.Count > 0,
            bands,
        });
    }

    [McpServerTool(Name = ScriptTool, Title = "Read a script", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("One episode's, scene's or chapter's script, whole, as the author wrote it. The structure tool says which of "
        + "them have one and how long each is; this reads one. A unit with no script yet answers with none rather than an error.")]
    public async Task<CallToolResult> GetProjectScriptAsync(
        [Description("The project's id, from list_projects.")] string projectId,
        [Description("The episode's, scene's or chapter's id, from get_project_structure.")] string unitId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (await ProjectAsync(projectId, cancellationToken) is not { } project
            || !OptionalId(unitId, out var wanted)
            || wanted is not { } id)
        {
            return NotFound(NoSuchId);
        }

        // Scoped through the season to the project in one read, so a unit of another project is not found.
        var unit = await db.ProjectEpisodes.AsNoTracking()
            .Where(episode => episode.Id == id && episode.Season!.ProjectId == project.Id)
            .Select(episode => new
            {
                episode.Id,
                episode.Title,
                episode.Synopsis,
                episode.Script,
                Band = episode.Season!.Name,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return unit is null
            ? NotFound(NoSuchId)
            : Result(new
            {
                projectId = project.Id,
                kind = project.Kind,
                unitId = unit.Id,
                title = unit.Title,
                unit.Synopsis,
                band = unit.Band,
                hasScript = unit.Script is not null,
                script = unit.Script,
            });
    }

    // ---------- Reading ----------

    /// <summary>
    /// The project when it belongs to the connected universe, otherwise null. A project of another universe is not
    /// found rather than refused, so nothing tells a client that it exists.
    /// </summary>
    private async Task<CreativeProject?> ProjectAsync(string projectId, CancellationToken cancellationToken) =>
        Guid.TryParse(projectId, out var id)
            ? await db.CreativeProjects.AsNoTracking()
                .FirstOrDefaultAsync(project => project.Id == id && project.UniverseId == caller.UniverseId, cancellationToken)
            : null;

    private static bool OptionalId(string? value, out Guid? id)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            id = null;
            return true;
        }

        if (Guid.TryParse(value, out var parsed))
        {
            id = parsed;
            return true;
        }

        id = null;
        return false;
    }

    /// <summary>The refusal every tool here gives when the connection is not allowed to read this universe.</summary>
    private CallToolResult? Guard() =>
        caller.IsAllowed
            ? null
            : Error("not_connected", "This connection is not allowed to read a universe. Reconnect from LorEvolve.");

    private const string NoSuchId = "No project or entry of this universe has that id.";
}
