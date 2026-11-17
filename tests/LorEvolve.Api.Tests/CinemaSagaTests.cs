using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.CinemaSagas;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Restore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Cinema Sagas and Phases (#289): membership records over independent Film and Series projects. Nothing done to a
/// saga, a phase or a membership changes or deletes a project.
/// </summary>
public sealed class CinemaSagaTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Sagas_hold_ordered_phases_with_films_and_series_in_an_order_that_persists()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "sagaorder");
        var u = universe.Id;
        var film = await Project(client, u, "First film", ProjectKind.Film, "feature-film");
        var series = await Project(client, u, "First show", ProjectKind.Series, "tv-show");
        var game = await Project(client, u, "A game", ProjectKind.Game, null);

        var before = await List(client, u);
        Assert.Empty(before.Sagas);
        Assert.Equal(["First film", "First show"], before.Unassigned.Select(project => project.Name));

        var saga = await Saga(client, u, "Saga one");
        await Saga(client, u, "Saga two");
        var phaseA = await Phase(client, u, saga, "Phase A");
        var phaseB = await Phase(client, u, saga, "Phase B");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseB}/move", new CinemaPlaceRequest(0)));

        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseA}/members", new CinemaMemberRequest(film.Id)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseA}/members", new CinemaMemberRequest(series.Id)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseA}/members/{series.Id}/move", new CinemaPlaceRequest(0)));

        var after = await List(client, u);
        Assert.Equal(["Saga one", "Saga two"], after.Sagas.Select(item => item.Name));
        var phases = after.Sagas[0].Phases;
        Assert.Equal(["Phase B", "Phase A"], phases.Select(item => item.Name));
        Assert.Equal([series.Id, film.Id], phases[1].Members.Select(member => member.ProjectId));
        Assert.Equal(["tv-show", "feature-film"], phases[1].Members.Select(member => member.Format));
        Assert.Empty(after.Unassigned);

        // Membership never changes the project it records.
        await AssertUnchanged(client, film);
        await AssertUnchanged(client, series);

        // A game is not Cinema.
        var refused = await client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseB}/members", new CinemaMemberRequest(game.Id));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("\"projectId\"", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // One primary phase: adding an assigned project again is refused, not moved.
        var twice = await client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phaseB}/members", new CinemaMemberRequest(film.Id));
        Assert.Equal(HttpStatusCode.Conflict, twice.StatusCode);
        Assert.Contains(CinemaSagaEndpoints.MembershipExistsCode, await twice.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Removing_a_membership_a_phase_or_a_saga_never_deletes_the_project()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "sagaremove");
        var u = universe.Id;
        var one = await Project(client, u, "One", ProjectKind.Film, null);
        var two = await Project(client, u, "Two", ProjectKind.Film, null);
        var three = await Project(client, u, "Three", ProjectKind.Series, null);
        var saga = await Saga(client, u, "Saga");
        var phase = await Phase(client, u, saga, "Phase");
        var other = await Phase(client, u, saga, "Other");

        foreach (var project in new[] { one, two })
        {
            await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phase}/members", new CinemaMemberRequest(project.Id)));
        }

        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{other}/members", new CinemaMemberRequest(three.Id)));

        await Ok(client.DeleteAsync($"{Base(u)}/{saga}/phases/{phase}/members/{one.Id}"));
        await AssertUnchanged(client, one);
        Assert.Contains((await List(client, u)).Unassigned, project => project.ProjectId == one.Id);

        await Ok(client.DeleteAsync($"{Base(u)}/{saga}/phases/{phase}"));
        await AssertUnchanged(client, two);

        await Ok(client.DeleteAsync($"{Base(u)}/{saga}"));
        await AssertUnchanged(client, three);

        var left = await List(client, u);
        Assert.Empty(left.Sagas);
        Assert.Equal(["One", "Three", "Two"], left.Unassigned.Select(project => project.Name));
    }

    [Fact]
    public async Task Another_universes_project_is_hidden_and_an_edit_over_a_newer_version_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "sagacross");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var foreign = await Project(client, elsewhere, "Foreign film", ProjectKind.Film, null);
        var saga = await Saga(client, u, "Saga");
        var phase = await Phase(client, u, saga, "Phase");

        await AssertHidden(
            await client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phase}/members", new CinemaMemberRequest(foreign.Id)),
            "another universe's project");
        await AssertHidden(await client.PutAsJsonAsync($"{Base(elsewhere)}/{saga}", new CinemaGroupRequest("X", null, 1)), "a saga of another universe");

        await Ok(client.PutAsJsonAsync($"{Base(u)}/{saga}", new CinemaGroupRequest("Renamed", "Summary", 1)));
        var stale = await client.PutAsJsonAsync($"{Base(u)}/{saga}", new CinemaGroupRequest("Again", null, 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("Renamed", (await List(client, u)).Sagas.Single().Name);

        var blank = await client.PostAsJsonAsync(Base(u), new CinemaGroupRequest("  ", null));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
    }

    [Fact]
    public async Task A_viewer_reads_sagas_but_cannot_change_them_and_an_outsider_sees_nothing()
    {
        var world = await NewSharedWorld(_factory, "sagaroles");
        var u = world.U;
        var saga = await Saga(world.Owner, u, "Shared saga");

        Assert.Single((await List(world.Client(Who.Viewer), u)).Sagas);
        await AssertDenied(await world.Client(Who.Viewer).PostAsJsonAsync(Base(u), new CinemaGroupRequest("No", null)), "viewer creates a saga");
        await AssertDenied(await world.Client(Who.Viewer).DeleteAsync($"{Base(u)}/{saga}"), "viewer deletes a saga");
        await AssertHidden(await world.Client(Who.Outsider).GetAsync(Base(u)), "outsider lists sagas");
        await Ok(world.Client(Who.Editor).PostAsJsonAsync($"{Base(u)}/{saga}/phases", new CinemaGroupRequest("Editor phase", null)));
    }

    [Fact]
    public async Task Sagas_survive_a_backup_and_restore_and_a_member_that_is_not_cinema_is_refused()
    {
        var client = await SignedIn(_factory, "sagabackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Saga world")).Id;
        var film = await Project(client, u, "Saga film", ProjectKind.Film, null);
        var series = await Project(client, u, "Saga show", ProjectKind.Series, null);
        var game = await Project(client, u, "Saga game", ProjectKind.Game, null);
        var saga = await Saga(client, u, "Kept saga");
        var phase = await Phase(client, u, saga, "Kept phase");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phase}/members", new CinemaMemberRequest(series.Id)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phase}/members", new CinemaMemberRequest(film.Id)));

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(57, backup.FormatVersion);
        Assert.Equal([series.Id, film.Id], backup.Payload.CinemaSagas!.Single().Phases.Single().ProjectIds);

        var restored = await RestoreArchive(client, archive, "Saga world restored");
        var list = await List(client, restored.Id);
        Assert.Equal("Kept saga", list.Sagas.Single().Name);
        Assert.Equal(["Saga show", "Saga film"], list.Sagas.Single().Phases.Single().Members.Select(member => member.Name));
        Assert.DoesNotContain(list.Sagas.Single().Phases.Single().Members, member => member.ProjectId == film.Id);

        var tampered = Rewrite(archive, root =>
            Payload(root)["cinemaSagas"]![0]!["phases"]![0]!["projectIds"]!.AsArray().Add(JsonValue.Create(game.Id)));
        var refusal = await Refused(await Validate(client, tampered));
        Assert.Contains(BackupIssueCodes.InvalidValue, refusal.IssueCodes);

        var missing = Rewrite(archive, root =>
            Payload(root)["cinemaSagas"]![0]!["phases"]![0]!["projectIds"]!.AsArray().Add(JsonValue.Create(Guid.NewGuid())));
        Assert.Contains(BackupIssueCodes.MissingReference, (await Refused(await Validate(client, missing))).IssueCodes);
    }

    [Fact]
    public async Task A_phased_project_cannot_move_universe_or_stop_being_cinema_until_it_leaves_its_phase()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "sagaguard");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var film = await Project(client, u, "Phased film", ProjectKind.Film, null);
        var saga = await Saga(client, u, "Saga");
        var phase = await Phase(client, u, saga, "Phase");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{saga}/phases/{phase}/members", new CinemaMemberRequest(film.Id)));

        foreach (var (kind, target) in new[] { (ProjectKind.Film, elsewhere), (ProjectKind.Game, u) })
        {
            var refused = await client.PutAsJsonAsync(
                $"/api/projects/{film.Id}",
                new ProjectRequest(film.Name, kind, ProjectLifecycle.Planning, null, null, target, film.Version));
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Contains(ProjectEndpoints.InCinemaPhaseCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
            await AssertUnchanged(client, film);
            var member = Assert.Single(Assert.Single((await List(client, u)).Sagas[0].Phases).Members);
            Assert.Equal(film.Id, member.ProjectId);
        }

        // The source universe's backup still holds the film it lists, so it validates and restores.
        var restored = await RestoreArchive(client, await RawArchive(client, u), "Guarded world restored");
        var kept = Assert.Single(Assert.Single(Assert.Single((await List(client, restored.Id)).Sagas).Phases).Members);
        Assert.Equal("Phased film", kept.Name);

        // A project in no phase still moves and changes kind.
        var free = await Project(client, u, "Free film", ProjectKind.Film, null);
        await Ok(client.PutAsJsonAsync(
            $"/api/projects/{free.Id}",
            new ProjectRequest(free.Name, ProjectKind.Game, ProjectLifecycle.Planning, null, null, elsewhere, free.Version)));
        var moved = (await client.GetFromJsonAsync<ProjectDetail>($"/api/projects/{free.Id}"))!;
        Assert.Equal(elsewhere, moved.Universe!.Id);
        Assert.Equal(ProjectKind.Game, moved.Kind);
    }

    private static string Base(Guid universeId) => $"/api/universes/{universeId}/cinema-sagas";

    private static async Task<CinemaSagasResponse> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<CinemaSagasResponse>(Base(universeId)))!;

    private static async Task<Guid> Saga(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(Base(universeId), new CinemaGroupRequest(name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CinemaSagaResponse>())!.Id;
    }

    private static async Task<Guid> Phase(HttpClient client, Guid universeId, Guid sagaId, string name)
    {
        var response = await client.PostAsJsonAsync($"{Base(universeId)}/{sagaId}/phases", new CinemaGroupRequest(name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CinemaPhaseResponse>())!.Id;
    }

    private static async Task<ProjectDetail> Project(HttpClient client, Guid universeId, string name, ProjectKind kind, string? format)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest(name, kind, ProjectLifecycle.Planning, null, null, universeId, null, format));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task AssertUnchanged(HttpClient client, ProjectDetail before)
    {
        var now = (await client.GetFromJsonAsync<ProjectDetail>($"/api/projects/{before.Id}"))!;
        Assert.Equal(before.Name, now.Name);
        Assert.Equal(before.Universe!.Id, now.Universe!.Id);
        Assert.Equal(before.UpdatedAt, now.UpdatedAt);
        Assert.Equal(before.Version, now.Version);
    }
}
