using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// The MCP project tools (#142): what the connected universe is used to make, and one project read by its id.
///
/// <para><b>The connection's universe, and nothing wider.</b> Like every other tool here, the universe is
/// <see cref="McpCaller"/>'s, set by the gate from the token, so these never take one and never read another. Every
/// project is inside exactly one universe (#171), so a connection to a universe reaches all of its projects and none
/// of anyone else's.</para>
///
/// <para><b>Both kinds of project, told apart.</b> A project of its own is a stored
/// <see cref="CreativeProject"/>. A Story is the Writing Project it already is (#140), derived and never copied, and
/// says so by carrying <c>storyId</c>. A client follows that id into <c>get_story</c>, which is where the structure,
/// scenes and prose have always been, so nothing about the existing Story tools changes.</para>
///
/// <para><b>Read-only.</b> Neither tool writes, and both say so in their annotations. Nothing here creates a project,
/// links one to a universe or changes a story.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpProjectTools(LorEvolveDbContext db, McpCaller caller)
{
    public const string ListTool = "list_projects";
    public const string GetTool = "get_project";

    /// <summary>What a client is told about these tools, added to the server's instructions.</summary>
    public const string Instructions =
        "Projects: list_projects names what the connected universe is used to make - novels, games, series, films and comics - "
        + "each with its id, kind and stage. A project that carries storyId is one of the universe's stories shown as the "
        + "Writing Project it is: read its structure with get_story using that id, not with get_project. get_project reads one "
        + "project of its own by id. Every project belongs to one universe, so this connection sees all of this universe's "
        + "projects.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [McpServerTool(Name = ListTool, Title = "List the universe's projects", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("What the connected universe is used to make: each project with its id, name, kind (Writing, Game, Series, Film "
        + "or Comic), stage, subtype when the author gave one, and a summary. A project carrying storyId is one of the universe's "
        + "stories shown as the Writing Project it is: read it with get_story by that id. Most recently changed first.")]
    public async Task<CallToolResult> ListProjectsAsync(CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        var own = await db.CreativeProjects.AsNoTracking()
            .Where(project => project.UniverseId == caller.UniverseId)
            .OrderByDescending(project => project.UpdatedAt)
            .Select(project => new
            {
                id = project.Id,
                name = project.Name,
                kind = project.Kind,
                stage = project.Lifecycle,
                subtype = project.Subtype,
                summary = project.Summary,
                updatedAt = project.UpdatedAt,
                storyId = (Guid?)null,
            })
            .ToListAsync(cancellationToken);

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == caller.UniverseId && story.DeletedAt == null)
            .OrderByDescending(story => story.UpdatedAt)
            .Select(story => new
            {
                id = story.Id,
                name = story.Title,
                kind = ProjectKind.Writing,
                stage = StoryProjects.LifecycleOf(story.Status),
                subtype = (string?)null,
                summary = story.Premise ?? string.Empty,
                updatedAt = story.UpdatedAt,
                storyId = (Guid?)story.Id,
            })
            .ToListAsync(cancellationToken);

        return Result(new
        {
            universe = caller.UniverseName,
            projects = own.Concat(stories)
                .OrderByDescending(project => project.updatedAt)
                .Select(project => new
                {
                    project.id,
                    project.name,
                    project.kind,
                    project.stage,
                    project.subtype,
                    project.summary,
                    project.storyId,
                }),
        });
    }

    [McpServerTool(Name = GetTool, Title = "Read a project", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one project of the connected universe by its id: its name, kind, stage, subtype, summary and the universe it "
        + "belongs to. A story's id is not a project id here: a story shown as a Writing Project is read with get_story.")]
    public async Task<CallToolResult> GetProjectAsync(
        [Description("The project's id, exactly as list_projects gave it.")] string projectId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(projectId, out var id))
        {
            return NotFound();
        }

        var project = await db.CreativeProjects.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.UniverseId == caller.UniverseId)
            .Select(candidate => new
            {
                id = candidate.Id,
                name = candidate.Name,
                kind = candidate.Kind,
                stage = candidate.Lifecycle,
                subtype = candidate.Subtype,
                summary = candidate.Summary,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (project is null)
        {
            // A story's id is a Writing Project's id in the list, so say where to read it rather than only "not found".
            var isStory = await db.Stories.AsNoTracking()
                .AnyAsync(
                    story => story.Id == id && story.UniverseId == caller.UniverseId && story.DeletedAt == null,
                    cancellationToken);

            return isStory
                ? Error(
                    "is_a_story",
                    "That id is one of this universe's stories, shown as a Writing Project. Read it with get_story.",
                    new { storyId = id })
                : NotFound();
        }

        return Result(new
        {
            project.id,
            project.name,
            project.kind,
            project.stage,
            project.subtype,
            project.summary,
            universe = new { id = caller.UniverseId, name = caller.UniverseName },
        });
    }

    private CallToolResult? Guard() => caller.IsAllowed ? null : Error("not_allowed", "This connection cannot read a universe.");

    private static CallToolResult NotFound() => Error("not_found", "Nothing with that id is in this universe.");

    private static CallToolResult Result<T>(T value) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(value, Json) }],
    };

    private static CallToolResult Error(string code, string message, object? details = null) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message, details }, Json) }],
    };
}
