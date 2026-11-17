using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Restore;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The rule-shaped structure of a project with a format (#290): a feature film's acts, sequences, scenes and beats,
/// a short film's or special's root scenes. Checks order, the rules, isolation, access, version, subtree delete,
/// backup and restore.
/// </summary>
public sealed class StructureEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task FeatureFilmActsKeepOrder()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmacts");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");

        var one = await Add(client, film.Id, "act", title: "Act One");
        var two = await Add(client, film.Id, "act", title: "Act Two");
        var three = await Add(client, film.Id, "act", title: "Act Three");

        var tree = await Tree(client, film.Id);
        Assert.Equal("feature-film", tree.Format);
        Assert.Equal(["act"], tree.Roots);
        Assert.Equal(["sequence", "scene"], tree.Children["act"]);
        Assert.Equal(["Act One", "Act Two", "Act Three"], Ordered(tree, null).Select(node => node.Title));

        await Move(client, film.Id, three.Id, new ProjectNodeMove(0));
        await Move(client, film.Id, one.Id, new ProjectNodeMove(99));

        // Read back from a fresh request: the order is stored, and places are 0, 1, 2.
        var moved = Ordered(await Tree(client, film.Id), null);
        Assert.Equal(["Act Three", "Act Two", "Act One"], moved.Select(node => node.Title));
        Assert.Equal([0, 1, 2], moved.Select(node => node.SortOrder));
        Assert.Contains(moved, node => node.Id == two.Id);
    }

    [Fact]
    public async Task An_act_holds_scenes_directly_and_sequences_with_scenes_side_by_side()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmseq");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");

        var act = await Add(client, film.Id, "act");
        var direct = await Add(client, film.Id, "scene", act.Id, "Arrival");
        var sequence = await Add(client, film.Id, "sequence", act.Id, "The Chase");
        var inside = await Add(client, film.Id, "scene", sequence.Id, "Rooftops");

        var tree = await Tree(client, film.Id);
        Assert.Equal([direct.Id, sequence.Id], Ordered(tree, act.Id).Select(node => node.Id));
        Assert.Equal([inside.Id], Ordered(tree, sequence.Id).Select(node => node.Id));

        // The rules refuse a sequence in a sequence, a beat under an act, and an act at the root of nothing but a film.
        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("sequence", sequence.Id)), "level");
        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("beat", act.Id)), "level");
        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("scene")), "level");
        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("chapter")), "level");
    }

    [Fact]
    public async Task Scenes_hold_ordered_beats_that_keep_their_order_after_a_move()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmbeats");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");
        var act = await Add(client, film.Id, "act");
        var scene = await Add(client, film.Id, "scene", act.Id);

        var first = await Add(client, film.Id, "beat", scene.Id, body: "She sees the ship.");
        var second = await Add(client, film.Id, "beat", scene.Id, body: "She runs.");
        var third = await Add(client, film.Id, "beat", scene.Id, body: "The ship is gone.");

        await Move(client, film.Id, third.Id, new ProjectNodeMove(1, scene.Id));

        var beats = Ordered(await Tree(client, film.Id), scene.Id);
        Assert.Equal([first.Id, third.Id, second.Id], beats.Select(node => node.Id));
        Assert.Equal([0, 1, 2], beats.Select(node => node.SortOrder));

        // The tree carries sizes, not bodies.
        Assert.Equal("She runs.".Length, beats.Single(node => node.Id == second.Id).BodyLength);
    }

    [Theory]
    [InlineData("short-film")]
    [InlineData("special")]
    public async Task A_short_film_and_a_special_start_at_scenes_and_refuse_acts(string format)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"root{format}");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, format);

        var scene = await Add(client, film.Id, "scene", title: "Opening");
        await Add(client, film.Id, "beat", scene.Id);

        var tree = await Tree(client, film.Id);
        Assert.Equal(["scene"], tree.Roots);
        Assert.Equal(2, tree.Nodes.Count);

        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("act")), "level");
    }

    [Fact]
    public async Task Content_saves_with_a_version_and_a_stale_save_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmedit");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "short-film");
        var scene = await Add(client, film.Id, "scene");
        Assert.Equal(1, scene.Version);

        var saved = await Put(client, film.Id, scene.Id, new ProjectNodeUpdate("  Arrival  ", "She comes home.", "EXT. SHORE - DAY", 1));
        Assert.Equal(2, saved.Version);
        Assert.Equal("Arrival", saved.Title);

        var read = (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{film.Id}/structure/{scene.Id}"))!;
        Assert.Equal("EXT. SHORE - DAY", read.Body);
        Assert.Equal(2, read.Version);

        var stale = await client.PutAsJsonAsync(
            $"/api/projects/{film.Id}/structure/{scene.Id}",
            new ProjectNodeUpdate("Other", null, null, 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains(StructureEndpoints.NodeChangedCode, await stale.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_parent_from_another_project_and_a_move_into_its_own_subtree_are_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmiso");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");
        var other = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film", "Other film");

        var theirs = await Add(client, other.Id, "act");
        await AssertField(await Post(client, film.Id, new ProjectNodeRequest("sequence", theirs.Id)), "parentId");

        var act = await Add(client, film.Id, "act");
        var sequence = await Add(client, film.Id, "sequence", act.Id);
        var scene = await Add(client, film.Id, "scene", sequence.Id);

        // A sequence under its own scene loops; a scene to the root breaks the rules; a node of another project is unknown.
        await AssertField(await MoveResponse(client, film.Id, sequence.Id, new ProjectNodeMove(0, scene.Id)), "parentId");
        await AssertField(await MoveResponse(client, film.Id, scene.Id, new ProjectNodeMove(0)), "parentId");
        await AssertField(await MoveResponse(client, film.Id, scene.Id, new ProjectNodeMove(0, theirs.Id)), "parentId");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await MoveResponse(client, film.Id, theirs.Id, new ProjectNodeMove(0, act.Id))).StatusCode);

        // A scene may move from the sequence to the act, and the sequence's list closes up.
        await Move(client, film.Id, scene.Id, new ProjectNodeMove(0, act.Id));
        var tree = await Tree(client, film.Id);
        Assert.Equal([scene.Id, sequence.Id], Ordered(tree, act.Id).Select(node => node.Id));
        Assert.Empty(Ordered(tree, sequence.Id));
    }

    [Fact]
    public async Task Deleting_a_node_removes_its_subtree_and_deleting_the_project_removes_every_node()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmdelete");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");

        var first = await Add(client, film.Id, "act");
        var second = await Add(client, film.Id, "act");
        var sequence = await Add(client, film.Id, "sequence", first.Id);
        var scene = await Add(client, film.Id, "scene", sequence.Id);
        await Add(client, film.Id, "beat", scene.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/projects/{film.Id}/structure/{first.Id}")).StatusCode);

        var tree = await Tree(client, film.Id);
        var left = Assert.Single(tree.Nodes);
        Assert.Equal(second.Id, left.Id);
        Assert.Equal(0, left.SortOrder);

        // No route deletes a project on its own (it goes with its universe), so the row is deleted here.
        await WithDb(_factory, async db =>
        {
            Assert.True(await db.ProjectNodes.AnyAsync(node => node.ProjectId == film.Id));
            await db.CreativeProjects.Where(project => project.Id == film.Id).ExecuteDeleteAsync();
            Assert.False(await db.ProjectNodes.AnyAsync(node => node.ProjectId == film.Id));
        });
    }

    [Fact]
    public async Task A_project_without_rules_answers_not_found_and_keeps_its_seasons()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmlegacy");
        var legacy = await NewProject(client, universe.Id, ProjectKind.Film, null);
        var trailer = await NewProject(client, universe.Id, ProjectKind.Film, "trailer", "Teaser");
        var novel = await NewProject(client, universe.Id, ProjectKind.Game, null, "Board");

        foreach (var project in new[] { legacy, trailer, novel })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{project.Id}/structure")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Post(client, project.Id, new ProjectNodeRequest("scene"))).StatusCode);
        }

        // The legacy sequences still work on a film with no format.
        var sequence = await client.PostAsJsonAsync($"/api/projects/{legacy.Id}/seasons", new ProjectSeasonRequest("Opening", null));
        Assert.Equal(HttpStatusCode.Created, sequence.StatusCode);
    }

    [Fact]
    public async Task A_viewer_reads_the_structure_and_cannot_change_it_and_an_outsider_sees_nothing()
    {
        var w = await NewSharedWorld(_factory, "filmroles");
        var film = await NewProject(w.Owner, w.U, ProjectKind.Film, "feature-film");
        var act = await Add(w.Owner, film.Id, "act");

        Assert.Single((await Tree(w.Viewer, film.Id)).Nodes);
        await AssertDenied(await Post(w.Viewer, film.Id, new ProjectNodeRequest("act")), "viewer create");
        await AssertDenied(
            await w.Viewer.PutAsJsonAsync($"/api/projects/{film.Id}/structure/{act.Id}", new ProjectNodeUpdate("x", null, null, 1)),
            "viewer update");
        await AssertDenied(await w.Viewer.DeleteAsync($"/api/projects/{film.Id}/structure/{act.Id}"), "viewer delete");

        await AssertHidden(await w.Outsider.GetAsync($"/api/projects/{film.Id}/structure"), "outsider read");
        await AssertHidden(await Post(w.Outsider, film.Id, new ProjectNodeRequest("act")), "outsider create");

        await Add(w.Editor, film.Id, "act");
    }

    [Fact]
    public async Task A_backup_round_trip_keeps_the_tree_and_a_broken_tree_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmbackup");
        var film = await NewProject(client, universe.Id, ProjectKind.Film, "feature-film");
        var act = await Add(client, film.Id, "act", title: "Act One");
        var sequence = await Add(client, film.Id, "sequence", act.Id, "Chase");
        var scene = await Add(client, film.Id, "scene", sequence.Id, "Rooftops", body: "EXT. ROOF - NIGHT");
        await Add(client, film.Id, "scene", act.Id, "Arrival");
        await Add(client, film.Id, "beat", scene.Id);

        var archive = await RawArchive(client, universe.Id);
        var restored = await RestoreArchive(client, archive, "Film restored");

        await WithDb(_factory, async db =>
        {
            var copy = await db.CreativeProjects.AsNoTracking().SingleAsync(each => each.UniverseId == restored.Id);
            var nodes = await db.ProjectNodes.AsNoTracking().Where(node => node.ProjectId == copy.Id).ToListAsync();

            Assert.Equal(5, nodes.Count);
            Assert.DoesNotContain(nodes, node => node.Id == act.Id);

            var copiedAct = nodes.Single(node => node.ParentId is null);
            Assert.Equal("Act One", copiedAct.Title);
            Assert.Equal(
                ["Chase", "Arrival"],
                nodes.Where(node => node.ParentId == copiedAct.Id).OrderBy(node => node.SortOrder).Select(node => node.Title));
            var copiedScene = nodes.Single(node => node.Title == "Rooftops");
            Assert.Equal("EXT. ROOF - NIGHT", copiedScene.Body);
            Assert.Equal(nodes.Single(node => node.Title == "Chase").Id, copiedScene.ParentId);
            Assert.Single(nodes, node => node.ParentId == copiedScene.Id && node.Level == "beat");
        });

        static JsonObject NodeTitled(JsonObject root, string title) =>
            Payload(root)["projectNodes"]!.AsArray().First(node => (string?)node!["title"] == title)!.AsObject();

        // A cycle: the act sits under its own scene.
        var cycle = await Refused(await Validate(client, Rewrite(archive, root =>
            NodeTitled(root, "Act One")["parentId"] = scene.Id.ToString())));
        Assert.Contains(BackupIssueCodes.InvalidValue, cycle.IssueCodes);

        // A level the format does not allow there: a beat at the root.
        var misplaced = await Refused(await Validate(client, Rewrite(archive, root =>
        {
            NodeTitled(root, "Arrival")["level"] = "beat";
            NodeTitled(root, "Arrival")["parentId"] = null;
        })));
        Assert.Contains(BackupIssueCodes.InvalidValue, misplaced.IssueCodes);

        // A parent the file does not hold.
        var dangling = await Refused(await Validate(client, Rewrite(archive, root =>
            NodeTitled(root, "Arrival")["parentId"] = Guid.NewGuid().ToString())));
        Assert.Contains(BackupIssueCodes.MissingReference, dangling.IssueCodes);

        // An older file carries no nodes and still restores.
        var older = await Validated(client, Downgrade(archive, 50));
        Assert.Equal(50, older.Preview.FormatVersion);
    }

    [Fact]
    public async Task A_tv_show_orders_seasons_and_episodes_and_an_episode_holds_acts_scenes_and_beats()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tvshow");
        var show = await NewProject(client, universe.Id, ProjectKind.Series, "tv-show");
        var other = await NewProject(client, universe.Id, ProjectKind.Series, "tv-show", "Other show");
        var theirs = await Add(client, other.Id, "season", title: "Theirs");

        var one = await Add(client, show.Id, "season", title: "One");
        await Add(client, show.Id, "season", title: "Two");
        var three = await Add(client, show.Id, "season", title: "Three");
        await Move(client, show.Id, three.Id, new ProjectNodeMove(0));

        var tree = await Tree(client, show.Id);
        Assert.Equal(["season"], tree.Roots);
        Assert.Equal(["Three", "One", "Two"], Ordered(tree, null).Select(node => node.Title));

        var episodes = new List<ProjectNodeDetail>();
        foreach (var title in new[] { "Pilot", "Second", "Third" })
            episodes.Add(await Add(client, show.Id, "episode", one.Id, title));
        var elsewhere = await Add(client, show.Id, "episode", three.Id, "Alone");
        await Move(client, show.Id, episodes[2].Id, new ProjectNodeMove(0, one.Id));

        tree = await Tree(client, show.Id);
        Assert.Equal(["Third", "Pilot", "Second"], Ordered(tree, one.Id).Select(node => node.Title));
        Assert.Equal([0, 1, 2], Ordered(tree, one.Id).Select(node => node.SortOrder));
        Assert.Equal([elsewhere.Id], Ordered(tree, three.Id).Select(node => node.Id));
        Assert.All(tree.Nodes.Where(node => node.Level == "episode"), node => Assert.NotNull(node.ParentId));
        Assert.Equal(1, (await Tree(client, other.Id)).Nodes.Count);
        Assert.Equal(theirs.Id, Assert.Single((await Tree(client, other.Id)).Nodes).Id);

        // An act is optional: one episode has an act with a scene, a scene beside it, another has a scene only.
        var pilot = episodes[0];
        var act = await Add(client, show.Id, "act", pilot.Id);
        var inAct = await Add(client, show.Id, "scene", act.Id);
        var direct = await Add(client, show.Id, "scene", pilot.Id, body: "INT. KITCHEN");
        await Add(client, show.Id, "beat", direct.Id);
        await Add(client, show.Id, "scene", episodes[1].Id);
        Assert.Equal([act.Id, direct.Id], Ordered(await Tree(client, show.Id), pilot.Id).Select(node => node.Id));

        await AssertField(await Post(client, show.Id, new ProjectNodeRequest("beat", pilot.Id)), "level");
        await AssertField(await Post(client, show.Id, new ProjectNodeRequest("beat", act.Id)), "level");
        await AssertField(await Post(client, show.Id, new ProjectNodeRequest("episode")), "level");
        await AssertField(await Post(client, show.Id, new ProjectNodeRequest("season", one.Id)), "level");
        await AssertField(await Post(client, show.Id, new ProjectNodeRequest("scene", one.Id)), "level");
        Assert.NotEqual(Guid.Empty, inAct.Id);
    }

    [Fact]
    public async Task A_limited_series_starts_at_episodes_and_refuses_seasons()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "limseries");
        var series = await NewProject(client, universe.Id, ProjectKind.Series, "limited-series");

        var first = await Add(client, series.Id, "episode", title: "Part One");
        await Add(client, series.Id, "episode", title: "Part Two");
        var scene = await Add(client, series.Id, "scene", first.Id);
        await Add(client, series.Id, "beat", scene.Id);

        var tree = await Tree(client, series.Id);
        Assert.Equal(["episode"], tree.Roots);
        Assert.DoesNotContain(tree.Children.Keys, key => key == "season");
        Assert.Equal(["Part One", "Part Two"], Ordered(tree, null).Select(node => node.Title));
        await AssertField(await Post(client, series.Id, new ProjectNodeRequest("season")), "level");
    }

    [Fact]
    public async Task The_film_rules_and_a_series_without_a_format_are_unchanged()
    {
        Assert.Equal(["act"], ProjectStructures.For("feature-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("short-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("special")!.Roots);
        Assert.Equal(["sequence", "scene"], ProjectStructures.For("feature-film")!.Children["act"]);
        Assert.Null(ProjectStructures.For(null));

        var (client, universe) = await SignedInWithUniverse(_factory, "serieslegacy");
        var legacy = await NewProject(client, universe.Id, ProjectKind.Series, null);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{legacy.Id}/structure")).StatusCode);
        var season = await client.PostAsJsonAsync($"/api/projects/{legacy.Id}/seasons", new ProjectSeasonRequest("Season 1", null));
        Assert.Equal(HttpStatusCode.Created, season.StatusCode);
    }

    [Fact]
    public async Task A_tv_show_backup_round_trip_keeps_the_tree_and_a_limited_series_root_season_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tvbackup");
        var show = await NewProject(client, universe.Id, ProjectKind.Series, "tv-show");
        var season = await Add(client, show.Id, "season", title: "S One");
        var episode = await Add(client, show.Id, "episode", season.Id, "Pilot", body: "Cold open");
        await Add(client, show.Id, "scene", episode.Id, "Opening");

        var archive = await RawArchive(client, universe.Id);
        var restored = await RestoreArchive(client, archive, "Show restored");

        await WithDb(_factory, async db =>
        {
            var copy = await db.CreativeProjects.AsNoTracking().SingleAsync(each => each.UniverseId == restored.Id);
            var nodes = await db.ProjectNodes.AsNoTracking().Where(node => node.ProjectId == copy.Id).ToListAsync();
            Assert.Equal(3, nodes.Count);
            var copiedEpisode = nodes.Single(node => node.Level == "episode");
            Assert.Equal("Cold open", copiedEpisode.Body);
            Assert.Equal(nodes.Single(node => node.Level == "season").Id, copiedEpisode.ParentId);
        });

        // The same tree under a limited series has a season at its root, which that format does not allow.
        var refused = await Refused(await Validate(client, Rewrite(archive, root =>
            Payload(root)["creativeProjects"]!.AsArray()[0]!["format"] = "limited-series")));
        Assert.Contains(BackupIssueCodes.InvalidValue, refused.IssueCodes);
    }

    // ---------- helpers ----------

    private static async Task<ProjectDetail> NewProject(
        HttpClient client,
        Guid universeId,
        ProjectKind kind,
        string? format,
        string name = "Salt Acts")
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest(name, kind, ProjectLifecycle.Active, null, null, universeId, null, format));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, Guid projectId, ProjectNodeRequest request) =>
        client.PostAsJsonAsync($"/api/projects/{projectId}/structure", request);

    private static async Task<ProjectNodeDetail> Add(
        HttpClient client,
        Guid projectId,
        string level,
        Guid? parentId = null,
        string? title = null,
        string? body = null)
    {
        var response = await Post(client, projectId, new ProjectNodeRequest(level, parentId, title, null, body));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!;
    }

    private static async Task<ProjectStructureTree> Tree(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<ProjectStructureTree>($"/api/projects/{projectId}/structure"))!;

    private static List<ProjectNodeSummary> Ordered(ProjectStructureTree tree, Guid? parentId) =>
        [.. tree.Nodes.Where(node => node.ParentId == parentId).OrderBy(node => node.SortOrder)];

    private static Task<HttpResponseMessage> MoveResponse(HttpClient client, Guid projectId, Guid nodeId, ProjectNodeMove move) =>
        client.PostAsJsonAsync($"/api/projects/{projectId}/structure/{nodeId}/move", move);

    private static async Task Move(HttpClient client, Guid projectId, Guid nodeId, ProjectNodeMove move)
    {
        var response = await MoveResponse(client, projectId, nodeId, move);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static async Task<ProjectNodeDetail> Put(HttpClient client, Guid projectId, Guid nodeId, ProjectNodeUpdate update)
    {
        var response = await client.PutAsJsonAsync($"/api/projects/{projectId}/structure/{nodeId}", update);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!;
    }

    private static async Task AssertField(HttpResponseMessage response, string field)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {text}");
        Assert.Contains($"\"{field}\"", text);
    }
}
