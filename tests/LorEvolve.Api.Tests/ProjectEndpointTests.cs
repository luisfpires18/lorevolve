using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A universe's creative projects (#138, with the universe made required by #171): created inside a universe, saved
/// whole, refused when stale, and invisible to another account. The collaborator cases are the point of the feature: a
/// project is reachable by the people who work in the universe it belongs to.
/// </summary>
public sealed class ProjectEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Projects = "/api/projects";

    private readonly LorEvolveApiFactory _factory = factory;

    private static string Project(Guid id) => $"{Projects}/{id}";

    [Fact]
    public async Task A_project_is_created_in_its_universe_and_read_back_exactly()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projcreate");

        var created = await Create(client, "  The Salt Road  ", ProjectKind.Writing, subtype: "  novel  ", summary: "Three caravans, one winter.", universeId: universe.Id);

        Assert.Equal("The Salt Road", created.Name);
        Assert.Equal("novel", created.Subtype);
        Assert.Equal(ProjectKind.Writing, created.Kind);
        Assert.Equal(ProjectLifecycle.Planning, created.Lifecycle);
        Assert.Equal(universe.Id, created.Universe!.Id);
        Assert.True(created.IsOwned);
        Assert.Equal(1, created.Version);
        Assert.Equal(created.CreatedAt, created.UpdatedAt);
        Assert.Equal(DateTimeKind.Utc, created.UpdatedAt.Kind);

        Assert.Equal(created, await Read(client, created.Id));
    }

    [Fact]
    public async Task A_blank_subtype_is_no_subtype_and_a_name_is_required()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projshape");

        var bare = await Create(client, "Hollow Season", ProjectKind.Game, universeId: universe.Id);
        Assert.Null(bare.Subtype);
        Assert.Equal(string.Empty, bare.Summary);

        var blankSubtype = await Create(client, "Second Season", ProjectKind.Game, subtype: "   ", universeId: universe.Id);
        Assert.Null(blankSubtype.Subtype);

        Assert.Contains("name", await Errors(await Post(client, new ProjectRequest("   ", ProjectKind.Writing, ProjectLifecycle.Planning, null, null, universe.Id, null))), StringComparison.Ordinal);
        Assert.Contains(
            "name",
            await Errors(await Post(client, new ProjectRequest(new string('n', ProjectLimits.NameMaxLength + 1), ProjectKind.Writing, ProjectLifecycle.Planning, null, null, universe.Id, null))),
            StringComparison.Ordinal);
        Assert.Contains(
            "subtype",
            await Errors(await Post(client, new ProjectRequest("Too much subtype", ProjectKind.Comic, ProjectLifecycle.Planning, new string('s', ProjectLimits.SubtypeMaxLength + 1), null, universe.Id, null))),
            StringComparison.Ordinal);
        Assert.Contains(
            "summary",
            await Errors(await Post(client, new ProjectRequest("Too much summary", ProjectKind.Film, ProjectLifecycle.Planning, null, new string('b', ProjectLimits.SummaryMaxLength + 1), universe.Id, null))),
            StringComparison.Ordinal);

        var atBound = await Create(
            client,
            new string('n', ProjectLimits.NameMaxLength),
            ProjectKind.Series,
            summary: new string('b', ProjectLimits.SummaryMaxLength),
            universeId: universe.Id);
        Assert.Equal(ProjectLimits.SummaryMaxLength, (await Read(client, atBound.Id)).Summary.Length);
    }

    /// <summary>
    /// The enums travel as numbers, so a client can send one the API never declared. It is refused rather than stored as
    /// an int nothing can read back.
    /// </summary>
    [Fact]
    public async Task A_kind_or_a_stage_the_api_never_declared_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projenum");

        var badKind = await client.PostAsJsonAsync(
            Projects,
            new { name = "Unknown medium", kind = 99, lifecycle = 0, universeId = universe.Id });
        Assert.Equal(HttpStatusCode.BadRequest, badKind.StatusCode);
        Assert.Contains("kind", await Errors(badKind), StringComparison.Ordinal);

        var badLifecycle = await client.PostAsJsonAsync(
            Projects,
            new { name = "Unknown stage", kind = 0, lifecycle = 42, universeId = universe.Id });
        Assert.Equal(HttpStatusCode.BadRequest, badLifecycle.StatusCode);
        Assert.Contains("lifecycle", await Errors(badLifecycle), StringComparison.Ordinal);

        Assert.Empty(await List(client));
    }

    [Fact]
    public async Task A_project_moves_between_universes_and_a_save_that_changes_nothing_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projmove");
        var second = await CreateUniverse(client, "Second world projmove");

        var created = await Create(client, "The Tide Engine", ProjectKind.Film, universeId: universe.Id);
        Assert.Equal(universe.Id, created.Universe!.Id);
        Assert.Equal(universe.Name, created.Universe.Name);

        var advanced = await Save(client, created with { Lifecycle = ProjectLifecycle.Active });
        Assert.Equal(ProjectLifecycle.Active, advanced.Lifecycle);
        Assert.Equal(2, advanced.Version);
        Assert.True(advanced.UpdatedAt > created.UpdatedAt);
        Assert.Equal(created.CreatedAt, advanced.CreatedAt);

        // A project moves between two universes the author owns; it never moves to no universe at all (#171).
        var moved = await Save(client, advanced with { Universe = advanced.Universe with { Id = second.Id } });
        Assert.Equal(second.Id, moved.Universe!.Id);
        Assert.Equal(3, moved.Version);

        // Nothing changed, so nothing is written: the version and the timestamp both stay where they were.
        var again = await Save(client, moved);
        Assert.Equal(3, again.Version);
        Assert.Equal(moved.UpdatedAt, again.UpdatedAt);

        Assert.Single(await List(client, universeId: second.Id));
        Assert.Empty(await List(client, universeId: universe.Id));
    }

    [Fact]
    public async Task A_save_written_over_a_project_that_changed_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projstale");

        var created = await Create(client, "Winter Light", ProjectKind.Series, universeId: universe.Id);
        var saved = await Save(client, created with { Name = "Winter Light, revised" });

        // The first editor's view is now one version behind.
        var stale = await client.PutAsJsonAsync(Project(created.Id), Request(created with { Name = "Written from a stale tab" }));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var problem = await stale.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.Equal(ProjectEndpoints.ChangedCode, problem!["code"].ToString());
        Assert.Equal(saved.Version, int.Parse(problem["currentVersion"].ToString()!, System.Globalization.CultureInfo.InvariantCulture));

        var unchanged = await Read(client, created.Id);
        Assert.Equal("Winter Light, revised", unchanged.Name);
        Assert.Equal(saved.Version, unchanged.Version);

        // A save that names no version at all is refused the same way: it cannot say what it was written over.
        var versionless = await client.PutAsJsonAsync(
            Project(created.Id),
            new ProjectRequest("No version named", ProjectKind.Series, ProjectLifecycle.Planning, null, null, universe.Id, null));
        Assert.Equal(HttpStatusCode.Conflict, versionless.StatusCode);
    }

    [Fact]
    public async Task Another_accounts_project_answers_as_a_missing_one_does()
    {
        var (mine, myWorld) = await SignedInWithUniverse(_factory, "projmine");
        var (theirs, theirWorld) = await SignedInWithUniverse(_factory, "projtheirs");

        var hidden = await Create(theirs, "Their own project", ProjectKind.Comic, universeId: theirWorld.Id);
        var ours = await Create(mine, "Our own project", ProjectKind.Writing, universeId: myWorld.Id);

        Assert.Equal(HttpStatusCode.NotFound, (await mine.GetAsync(Project(hidden.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await mine.PutAsJsonAsync(Project(hidden.Id), Request(hidden with { Name = "Taken over" }))).StatusCode);

        var listed = await List(mine);
        Assert.Equal([ours.Id], listed.Select(project => project.Id));

        // Untouched, and still theirs.
        Assert.Equal("Their own project", (await Read(theirs, hidden.Id)).Name);
    }

    /// <summary>
    /// The collaborator rule, which is what a project has and an idea does not: reading a linked project needs only to be
    /// able to read the universe, and changing one needs the capability that changes its content.
    /// </summary>
    [Fact]
    public async Task A_universe_collaborator_reads_a_linked_project_and_only_an_editor_may_change_it()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "projshared");
        var project = await Create(owner, "The Shared Chronicle", ProjectKind.Writing, universeId: universe.Id);

        var viewer = await SignedIn(_factory, "user-projviewer");
        var editor = await SignedIn(_factory, "user-projeditor");
        await Join(universe.Id, "user-projviewer", UniverseRole.Viewer);
        await Join(universe.Id, "user-projeditor", UniverseRole.Editor);

        // Both reach it through the universe, and neither owns it.
        foreach (var client in new[] { viewer, editor })
        {
            var read = await Read(client, project.Id);
            Assert.Equal(project.Id, read.Id);
            Assert.False(read.IsOwned);
            Assert.Equal([project.Id], (await List(client)).Select(candidate => candidate.Id));
        }

        var refused = await viewer.PutAsJsonAsync(Project(project.Id), Request(project with { Name = "Renamed by a viewer" }));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("The Shared Chronicle", (await Read(owner, project.Id)).Name);

        var allowed = await Save(editor, project with { Name = "Renamed by an editor" });
        Assert.Equal("Renamed by an editor", allowed.Name);
        Assert.False(allowed.IsOwned);
        Assert.Equal("Renamed by an editor", (await Read(owner, project.Id)).Name);

        // A viewer cannot put a project into someone else's universe either.
        var linked = await viewer.PostAsJsonAsync(
            Projects,
            new ProjectRequest("Mine, in their world", ProjectKind.Game, ProjectLifecycle.Planning, null, null, universe.Id, null));
        Assert.Equal(HttpStatusCode.Forbidden, linked.StatusCode);
    }

    /// <summary>
    /// The invariant #171 establishes: a project without a universe cannot be made, through any field value, and the
    /// refusal names the universe rather than failing on a foreign key later.
    /// </summary>
    [Fact]
    public async Task A_project_cannot_be_made_without_a_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projuniverse");

        foreach (var missing in new Guid?[] { null, Guid.Empty })
        {
            var refused = await Post(
                client,
                new ProjectRequest("No world", ProjectKind.Game, ProjectLifecycle.Planning, null, null, missing, null));

            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("universeId", await Errors(refused), StringComparison.Ordinal);
        }

        // Nor can an existing project be saved out of its universe.
        var project = await Create(client, "Has a world", ProjectKind.Game, universeId: universe.Id);
        var response = await client.PutAsJsonAsync(
            Project(project.Id),
            new ProjectRequest(project.Name, project.Kind, project.Lifecycle, null, project.Summary, null, project.Version));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("universeId", await Errors(response), StringComparison.Ordinal);
        Assert.Equal(universe.Id, (await Read(client, project.Id)).Universe!.Id);

        // And nothing in the database holds a project with no universe.
        await WithDb(_factory, async db =>
            Assert.Equal(0, await db.CreativeProjects.CountAsync(candidate => candidate.UniverseId == Guid.Empty)));
    }

    // ---------- steps ----------

    private static ProjectRequest Request(ProjectDetail project) =>
        new(project.Name, project.Kind, project.Lifecycle, project.Subtype, project.Summary, project.Universe?.Id, project.Version);

    private static Task<HttpResponseMessage> Post(HttpClient client, ProjectRequest request) =>
        client.PostAsJsonAsync(Projects, request);

    private static async Task<ProjectDetail> Create(
        HttpClient client,
        string name,
        ProjectKind kind,
        ProjectLifecycle lifecycle = ProjectLifecycle.Planning,
        string? subtype = null,
        string? summary = null,
        Guid? universeId = null)
    {
        var response = await Post(client, new ProjectRequest(name, kind, lifecycle, subtype, summary, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    /// <summary>Saves the project as the given view describes it, naming that view's version.</summary>
    private static async Task<ProjectDetail> Save(HttpClient client, ProjectDetail project)
    {
        var response = await client.PutAsJsonAsync(Project(project.Id), Request(project));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<ProjectDetail> Read(HttpClient client, Guid id)
    {
        var response = await client.GetAsync(Project(id));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<List<ProjectDetail>> List(HttpClient client, Guid? universeId = null)
    {
        var query = universeId is { } id ? $"?universeId={id}" : string.Empty;
        var response = await client.GetAsync($"{Projects}{query}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<ProjectDetail>>())!;
    }

    /// <summary>
    /// Gives an account a role in a universe by writing the membership row, because no route creates one yet.
    /// </summary>
    private Task Join(Guid universeId, string username, UniverseRole role) =>
        WithDb(_factory, async db =>
        {
            var userId = await db.Users.Where(user => user.UserName == username).Select(user => user.Id).SingleAsync();
            var now = DateTime.UtcNow;

            db.UniverseMemberships.Add(new UniverseMembership
            {
                UniverseId = universeId,
                UserId = userId,
                Role = role,
                CreatedAt = now,
                UpdatedAt = now,
            });

            await db.SaveChangesAsync();
        });
}
