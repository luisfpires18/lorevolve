using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.ComicCollections;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Restore;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.ComicCollectionTests;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Comic Volumes (#297): a collection of kind <c>volume</c> that belongs to one Comic project and holds its issues or
/// chapters by reference, in reading order. Nothing done to a Volume moves, changes or deletes a node.
/// </summary>
public sealed class ComicVolumeTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_volume_holds_its_own_comics_chapters_in_order_and_stays_out_of_the_arcs_list()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicvolume");
        var u = universe.Id;
        var manga = await Project(client, u, "Manga", ProjectKind.Comic, "manga");
        var other = await Project(client, u, "Other", ProjectKind.Comic, "manga");
        var one = await Node(client, manga.Id, "chapter", "One");
        var two = await Node(client, manga.Id, "chapter", "Two");
        var foreign = await Node(client, other.Id, "chapter", "Foreign");
        var before = await Structure(client, manga.Id);

        var volume = await Volume(client, u, manga.Id, "Volume one");
        var second = await Volume(client, u, manga.Id, "Volume two");
        await Volume(client, u, other.Id, "Other volume");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(one)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(two)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries/{two}/move", new ComicPlaceRequest(0)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{second}/move", new ComicPlaceRequest(0)));

        var refused = await client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(foreign));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("\"nodeId\"", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var listed = await Volumes(client, u, manga.Id);
        Assert.Equal([second, volume], listed.Collections.Select(collection => collection.Id));
        Assert.Equal([0, 1], listed.Collections.Select(collection => collection.SortOrder));
        Assert.All(listed.Collections, collection => Assert.Equal(manga.Id, collection.ProjectId));
        Assert.Equal([two, one], listed.Collections.Single(collection => collection.Id == volume).Entries.Select(entry => entry.NodeId));
        Assert.Equal([one, two], listed.Candidates.Select(node => node.NodeId));

        // The arcs and events list leaves volumes out, and the nodes keep their own order.
        Assert.Empty((await List(client, u)).Collections);
        Assert.Equivalent(before, await Structure(client, manga.Id));

        await Ok(client.DeleteAsync($"{Base(u)}/{volume}"));
        Assert.Equivalent(before, await Structure(client, manga.Id));
        Assert.Equal([0], (await Volumes(client, u, manga.Id)).Collections.Select(collection => collection.SortOrder));
    }

    [Fact]
    public async Task A_volume_needs_one_comic_of_this_universe_and_arcs_need_none()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicvolumerules");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var manga = await Project(client, u, "Manga", ProjectKind.Comic, "manga");
        var film = await Project(client, u, "Film", ProjectKind.Film, "feature-film");
        var far = await Project(client, elsewhere, "Far", ProjectKind.Comic, "manga");

        await AssertField(client.PostAsJsonAsync(Base(u), new ComicCollectionRequest(ComicCollectionKinds.Volume, "X", null)), "projectId");
        await AssertField(client.PostAsJsonAsync(Base(u), new ComicCollectionRequest(ComicCollectionKinds.StoryArc, "X", null, null, manga.Id)), "projectId");
        await AssertField(client.PostAsJsonAsync(Base(u), new ComicCollectionRequest(ComicCollectionKinds.Volume, "X", null, null, film.Id)), "projectId");
        await AssertHidden(await client.PostAsJsonAsync(Base(u), new ComicCollectionRequest(ComicCollectionKinds.Volume, "X", null, null, far.Id)), "a comic of another universe");
    }

    [Fact]
    public async Task A_comic_with_a_volume_cannot_move_or_change_kind_and_its_volumes_go_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicvolumeguard");
        var u = universe.Id;
        var elsewhere = (await PublishingTestClient.CreateUniverse(client, "Elsewhere")).Id;
        var comic = await Project(client, u, "Collected", ProjectKind.Comic, "manga");
        var chapter = await Node(client, comic.Id, "chapter", "Chapter");
        var volume = await Volume(client, u, comic.Id, "Empty volume");

        foreach (var (kind, target) in new[] { (ProjectKind.Comic, elsewhere), (ProjectKind.Game, u) })
        {
            var refused = await client.PutAsJsonAsync(
                $"/api/projects/{comic.Id}",
                new ProjectRequest(comic.Name, kind, ProjectLifecycle.Planning, null, null, target, comic.Version, kind == ProjectKind.Comic ? "manga" : null));
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Contains(ProjectEndpoints.InComicCollectionCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
            await AssertUnchanged(client, comic);
        }

        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(chapter)));
        await WithDb(_factory, async db => await db.CreativeProjects.Where(project => project.Id == comic.Id).ExecuteDeleteAsync());
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.ComicCollections.AnyAsync(collection => collection.Id == volume));
            Assert.False(await db.ComicCollectionEntries.AnyAsync(entry => entry.CollectionId == volume));
        });
    }

    [Fact]
    public async Task A_volume_survives_a_backup_and_restore_and_a_volume_without_its_comic_is_refused()
    {
        var client = await SignedIn(_factory, "comicvolumebackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Volume world")).Id;
        var manga = await Project(client, u, "Manga", ProjectKind.Comic, "manga");
        var other = await Project(client, u, "Other", ProjectKind.Comic, "manga");
        var one = await Node(client, manga.Id, "chapter", "One");
        var two = await Node(client, manga.Id, "chapter", "Two");
        var foreign = await Node(client, other.Id, "chapter", "Foreign");
        var volume = await Volume(client, u, manga.Id, "Kept volume");
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(two)));
        await Ok(client.PostAsJsonAsync($"{Base(u)}/{volume}/entries", new ComicEntryRequest(one)));

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(54, backup.FormatVersion);
        Assert.Equal(manga.Id, backup.Payload.ComicCollections!.Single().ProjectId);

        var restored = await RestoreArchive(client, archive, "Volume world restored");
        var project = Guid.Empty;
        await WithDb(_factory, async db => project = await db.CreativeProjects
            .Where(item => item.UniverseId == restored.Id && item.Name == "Manga").Select(item => item.Id).SingleAsync());
        var kept = Assert.Single((await Volumes(client, restored.Id, project)).Collections);
        Assert.Equal("Kept volume", kept.Name);
        Assert.Equal(["Two", "One"], kept.Entries.Select(entry => entry.Title));

        var withoutComic = Rewrite(archive, root => Payload(root)["comicCollections"]![0]!.AsObject().Remove("projectId"));
        Assert.Contains(BackupIssueCodes.InvalidValue, (await Refused(await Validate(client, withoutComic))).IssueCodes);
        var otherComic = Rewrite(archive, root =>
            Payload(root)["comicCollections"]![0]!["nodeIds"]!.AsArray().Add(JsonValue.Create(foreign)));
        Assert.Contains(BackupIssueCodes.InvalidValue, (await Refused(await Validate(client, otherComic))).IssueCodes);
    }

    private static async Task<Guid> Volume(HttpClient client, Guid universeId, Guid projectId, string name)
    {
        var response = await client.PostAsJsonAsync(
            Base(universeId),
            new ComicCollectionRequest(ComicCollectionKinds.Volume, name, null, null, projectId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ComicCollectionResponse>())!.Id;
    }

    private static async Task<ComicCollectionsResponse> Volumes(HttpClient client, Guid universeId, Guid projectId) =>
        (await client.GetFromJsonAsync<ComicCollectionsResponse>($"{Base(universeId)}?projectId={projectId}"))!;

    private static async Task AssertField(Task<HttpResponseMessage> request, string field)
    {
        var response = await request;
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{field}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }
}
