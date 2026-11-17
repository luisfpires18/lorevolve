using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.ComicCollections;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Restore;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Comic Story Arcs and Events (#296): ordered references to issue-level nodes across a universe's Comic projects.
/// Nothing done to a collection or an entry moves, changes or deletes a node or a project.
/// </summary>
public sealed class ComicCollectionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_event_spans_two_comics_in_an_order_that_persists_without_touching_the_nodes()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicorder");
        var u = universe.Id;
        var western = await Project(client, u, "Western", ProjectKind.Comic, "western-comic");
        var manga = await Project(client, u, "Manga", ProjectKind.Comic, "manga");
        var issue = await Node(client, western.Id, "issue", "Issue one");
        var second = await Node(client, western.Id, "issue", "Issue two");
        var chapter = await Node(client, manga.Id, "chapter", "Chapter one");
        var before = await Structure(client, western.Id);
        var issueBefore = await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{western.Id}/structure/{issue}");

        var list = await List(client, u);
        Assert.Equal([chapter, issue, second], list.Candidates.Select(node => node.NodeId));

        var crossover = await Collection(client, u, ComicCollectionKinds.Event, "Crossover");
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Arc");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{crossover}/entries", new ComicEntryRequest(issue)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{crossover}/entries", new ComicEntryRequest(chapter)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{crossover}/entries", new ComicEntryRequest(second)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{crossover}/entries/{second}/move", new ComicPlaceRequest(0)));

        // The same issue sits in an arc too, but only once per collection.
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(issue)));
        var twice = await client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(issue));
        Assert.Equal(HttpStatusCode.Conflict, twice.StatusCode);
        Assert.Contains(ComicCollectionEndpoints.EntryExistsCode, await twice.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var after = await List(client, u);
        var @event = after.Collections.Single(collection => collection.Id == crossover);
        Assert.Equal([second, issue, chapter], @event.Entries.Select(entry => entry.NodeId));
        Assert.Equal(["Western", "Western", "Manga"], @event.Entries.Select(entry => entry.ProjectName));
        Assert.All(@event.Entries, entry => Assert.True(entry.Available));
        Assert.Equal([issue], after.Collections.Single(collection => collection.Id == arc).Entries.Select(entry => entry.NodeId));

        // The nodes keep their own order, parent, version and time; no project changes.
        await Ok(client.DeleteAsync($"{Base(u)}/{crossover}/entries/{issue}"));
        Assert.Equivalent(before, await Structure(client, western.Id));
        Assert.Equal(issueBefore, await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{western.Id}/structure/{issue}"));
        await AssertUnchanged(client, western);
        await AssertUnchanged(client, manga);
    }

    [Fact]
    public async Task Removing_an_entry_or_a_collection_never_deletes_the_node_and_a_deleted_node_leaves_its_entries()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicremove");
        var u = universe.Id;
        var comic = await Project(client, u, "Comic", ProjectKind.Comic, "western-comic");
        var kept = await Node(client, comic.Id, "issue", "Kept");
        var gone = await Node(client, comic.Id, "issue", "Gone");
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Arc");
        var @event = await Collection(client, u, ComicCollectionKinds.Event, "Event");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(kept)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(gone)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{@event}/entries", new ComicEntryRequest(kept)));

        await Ok(client.DeleteAsync($"{Base(u)}/{@event}/entries/{kept}"));
        await Ok(client.GetAsync($"/api/projects/{comic.Id}/structure/{kept}"));

        await Ok(client.DeleteAsync($"/api/projects/{comic.Id}/structure/{gone}"));
        Assert.Equal([kept], (await List(client, u)).Collections.Single(collection => collection.Id == arc).Entries.Select(entry => entry.NodeId));

        await Ok(client.DeleteAsync($"{Base(u)}/{arc}"));
        await Ok(client.GetAsync($"/api/projects/{comic.Id}/structure/{kept}"));
        Assert.Equal([@event], (await List(client, u)).Collections.Select(collection => collection.Id));
    }

    [Fact]
    public async Task Only_issue_level_parts_of_this_universes_comics_can_be_added()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comiccross");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var foreign = await Node(client, (await Project(client, elsewhere, "Foreign", ProjectKind.Comic, "western-comic")).Id, "issue", null);
        var act = await Node(client, (await Project(client, u, "Film", ProjectKind.Film, "feature-film")).Id, "act", null);
        var comic = await Project(client, u, "Comic", ProjectKind.Comic, "western-comic");
        var issue = await Node(client, comic.Id, "issue", null);
        var page = await Node(client, comic.Id, "page", null, issue);
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Arc");
        var episode = await Node(client, (await Project(client, u, "Webcomic", ProjectKind.Comic, "webcomic")).Id, "episode", null);

        await AssertHidden(await client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(foreign)), "another universe's node");
        foreach (var refusedNode in new[] { act, page, episode })
        {
            var refused = await client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(refusedNode));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("\"nodeId\"", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Base(u), new ComicCollectionRequest("volume-run", "X", null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Base(u), new ComicCollectionRequest("event", "  ", null))).StatusCode);
        await AssertHidden(await client.PutAsJsonAsync($"{Base(elsewhere)}/{arc}", new ComicCollectionRequest(null, "X", null, 1)), "a collection of another universe");

        await Ok(client.PutAsJsonAsync($"{Base(u)}/{arc}", new ComicCollectionRequest(null, "Renamed", "Summary", 1)));
        var stale = await client.PutAsJsonAsync($"{Base(u)}/{arc}", new ComicCollectionRequest(null, "Again", null, 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("Renamed", (await List(client, u)).Collections.Single().Name);
    }

    [Fact]
    public async Task An_entry_whose_project_stopped_being_a_comic_reads_as_unavailable_and_can_still_be_removed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicstale");
        var u = universe.Id;
        var comic = await Project(client, u, "Comic", ProjectKind.Comic, "western-comic");
        var issue = await Node(client, comic.Id, "issue", "Issue");
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Arc");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(issue)));

        await WithDb(_factory, db => db.CreativeProjects.Where(project => project.Id == comic.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(project => project.Kind, ProjectKind.Game)));

        var entry = Assert.Single(Assert.Single((await List(client, u)).Collections).Entries);
        Assert.False(entry.Available);
        await Ok(client.DeleteAsync($"{Base(u)}/{arc}/entries/{issue}"));
        Assert.Empty(Assert.Single((await List(client, u)).Collections).Entries);
    }

    [Fact]
    public async Task A_viewer_reads_collections_but_cannot_change_them_and_an_outsider_sees_nothing()
    {
        var world = await NewSharedWorld(_factory, "comicroles");
        var u = world.U;
        var arc = await Collection(world.Owner, u, ComicCollectionKinds.StoryArc, "Shared arc");

        Assert.Single((await List(world.Client(Who.Viewer), u)).Collections);
        await AssertDenied(await world.Client(Who.Viewer).PostAsJsonAsync(Base(u), new ComicCollectionRequest("event", "No", null)), "viewer creates");
        await AssertDenied(await world.Client(Who.Viewer).DeleteAsync($"{Base(u)}/{arc}"), "viewer deletes");
        await AssertHidden(await world.Client(Who.Outsider).GetAsync(Base(u)), "outsider lists");
        await Ok(world.Client(Who.Editor).PostAsJsonAsync($"{Base(u)}/{arc}/move", new ComicPlaceRequest(0)));
    }

    [Fact]
    public async Task Collections_survive_a_backup_and_restore_and_an_entry_that_does_not_fit_is_refused()
    {
        var client = await SignedIn(_factory, "comicbackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Comic world")).Id;
        var comic = await Project(client, u, "Comic", ProjectKind.Comic, "western-comic");
        var one = await Node(client, comic.Id, "issue", "One");
        var two = await Node(client, comic.Id, "issue", "Two");
        var page = await Node(client, comic.Id, "page", null, one);
        var act = await Node(client, (await Project(client, u, "Film", ProjectKind.Film, "feature-film")).Id, "act", null);
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Kept arc");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(two)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(one)));

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(54, backup.FormatVersion);
        Assert.Equal([two, one], backup.Payload.ComicCollections!.Single().NodeIds);

        var restored = await RestoreArchive(client, archive, "Comic world restored");
        var kept = Assert.Single((await List(client, restored.Id)).Collections);
        Assert.Equal("Kept arc", kept.Name);
        Assert.Equal(["Two", "One"], kept.Entries.Select(entry => entry.Title));
        Assert.DoesNotContain(kept.Entries, entry => entry.NodeId == one);

        foreach (var (node, code) in new[] { (page, BackupIssueCodes.InvalidValue), (act, BackupIssueCodes.InvalidValue), (Guid.NewGuid(), BackupIssueCodes.MissingReference) })
        {
            var tampered = Rewrite(archive, root =>
                Payload(root)["comicCollections"]![0]!["nodeIds"]!.AsArray().Add(JsonValue.Create(node)));
            Assert.Contains(code, (await Refused(await Validate(client, tampered))).IssueCodes);
        }
    }

    [Fact]
    public async Task A_comic_with_a_collected_part_cannot_move_universe_or_stop_being_a_comic()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicguard");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var comic = await Project(client, u, "Collected", ProjectKind.Comic, "western-comic");
        var issue = await Node(client, comic.Id, "issue", "Issue");
        var arc = await Collection(client, u, ComicCollectionKinds.StoryArc, "Arc");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{arc}/entries", new ComicEntryRequest(issue)));

        foreach (var (kind, target) in new[] { (ProjectKind.Comic, elsewhere), (ProjectKind.Game, u) })
        {
            var refused = await client.PutAsJsonAsync(
                $"/api/projects/{comic.Id}",
                new ProjectRequest(comic.Name, kind, ProjectLifecycle.Planning, null, null, target, comic.Version, kind == ProjectKind.Comic ? "western-comic" : null));
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Contains(ProjectEndpoints.InComicCollectionCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
            await AssertUnchanged(client, comic);
            Assert.Equal(issue, Assert.Single(Assert.Single((await List(client, u)).Collections).Entries).NodeId);
        }

        // The source universe's backup still holds the node it lists, so it validates and restores.
        var restored = await RestoreArchive(client, await RawArchive(client, u), "Guarded comic restored");
        Assert.Equal("Issue", Assert.Single(Assert.Single((await List(client, restored.Id)).Collections).Entries).Title);
    }

    private static string Base(Guid universeId) => $"/api/universes/{universeId}/comic-collections";

    private static async Task<ComicCollectionsResponse> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<ComicCollectionsResponse>(Base(universeId)))!;

    private static async Task<Guid> Collection(HttpClient client, Guid universeId, string kind, string name)
    {
        var response = await client.PostAsJsonAsync(Base(universeId), new ComicCollectionRequest(kind, name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ComicCollectionResponse>())!.Id;
    }

    private static async Task<Guid> Node(HttpClient client, Guid projectId, string level, string? title, Guid? parentId = null)
    {
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/structure", new ProjectNodeRequest(level, parentId, title));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!.Id;
    }

    private static async Task<ProjectStructureTree> Structure(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<ProjectStructureTree>($"/api/projects/{projectId}/structure"))!;

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
        Assert.Equal(before.Universe!.Id, now.Universe!.Id);
        Assert.Equal(before.Kind, now.Kind);
        Assert.Equal(before.UpdatedAt, now.UpdatedAt);
        Assert.Equal(before.Version, now.Version);
    }
}
