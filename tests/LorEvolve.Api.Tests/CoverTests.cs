using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Story covers (a 2:3 card) and project covers (a 16:10 card), stored as a universe's artwork is; the order of a
/// universe's projects; and both in a backup.
/// </summary>
public sealed class CoverTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Story covers ----------

    [Fact]
    public async Task A_story_cover_is_a_2_3_card_that_can_be_read_reframed_and_removed()
    {
        var (owner, _) = await Account(_factory, "cover-story");
        var u = (await CreateUniverse(owner, "Story covers")).Id;
        var story = await PlotTestClient.CreateStory(owner, u, "The drowned heir");
        var route = $"/api/universes/{u}/stories/{story}/cover";

        Assert.Equal(HttpStatusCode.NoContent, (await owner.GetAsync(route)).StatusCode);

        var png = Png(1200, 1200);
        var stored = await Uploaded(owner, route, png);
        Assert.Equal((1200, 1200), (stored.Width, stored.Height));

        // No crop asked for: the largest centred 2:3 frame, stored 640 wide.
        Assert.Equal(png, await Bytes(owner, $"{route}/{stored.AssetId}/original"));
        using (var card = Image.Load<Rgba32>(await Bytes(owner, $"{route}/{stored.AssetId}/card/{stored.CardId}")))
        {
            Assert.Equal((640, 960), (card.Width, card.Height));
        }

        // The list and the detail carry it.
        var listed = (await owner.GetFromJsonAsync<List<StorySummary>>($"/api/universes/{u}/stories"))!.Single();
        Assert.Equal(stored.CardId, listed.Cover!.CardId);
        Assert.Equal(stored.AssetId, (await owner.GetFromJsonAsync<StoryDetail>($"/api/universes/{u}/stories/{story}"))!.Cover!.AssetId);

        // A 16:10 frame is a project's, not a story's.
        var wide = await owner.PutAsJsonAsync($"{route}/card", new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0.1875, 1, 0.625)));
        Assert.Equal(HttpStatusCode.BadRequest, wide.StatusCode);
        Assert.Contains("2:3", await wide.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var reframed = await owner.PutAsJsonAsync($"{route}/card", new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0, 0.5, 0.75)));
        Assert.Equal(HttpStatusCode.OK, reframed.StatusCode);
        var moved = (await reframed.Content.ReadFromJsonAsync<UniverseArtworkRef>())!;
        Assert.NotEqual(stored.CardId, moved.CardId);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"{route}/{stored.AssetId}/card/{stored.CardId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"{route}/{stored.AssetId}/card/{moved.CardId}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.GetAsync(route)).StatusCode);
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains($"/stories/{story:D}/cover/", StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_viewer_reads_a_story_cover_but_cannot_change_it_and_another_universe_does_not_reach_it()
    {
        var (owner, _) = await Account(_factory, "cover-viewer-owner");
        var (viewer, viewerId) = await Account(_factory, "cover-viewer");
        var u = (await CreateUniverse(owner, "Viewed covers")).Id;
        var other = (await CreateUniverse(owner, "Other world")).Id;
        var story = await PlotTestClient.CreateStory(owner, u, "Seen, not touched");
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);
        var route = $"/api/universes/{u}/stories/{story}/cover";
        var stored = await Uploaded(owner, route, Png(600, 900));

        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"{route}/{stored.AssetId}/card/{stored.CardId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(viewer, route, Png(600, 900))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync(route)).StatusCode);

        // The story is not the other universe's.
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/universes/{other}/stories/{story}/cover")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(owner, $"/api/universes/{other}/stories/{story}/cover", Png(600, 900))).StatusCode);
    }

    // ---------- Project covers ----------

    [Fact]
    public async Task A_project_cover_is_a_16_10_card_on_the_project_and_its_list_row()
    {
        var (owner, _) = await Account(_factory, "cover-project");
        var (viewer, viewerId) = await Account(_factory, "cover-project-viewer");
        var u = (await CreateUniverse(owner, "Project covers")).Id;
        var project = await Project(owner, u, "Tidewalker", ProjectKind.Game);
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);
        var route = $"/api/projects/{project}/cover";

        var png = Png(1600, 1000);
        var stored = await Uploaded(owner, route, png);
        Assert.Equal(png, await Bytes(owner, $"{route}/{stored.AssetId}/original"));
        using (var card = Image.Load<Rgba32>(await Bytes(viewer, $"{route}/{stored.AssetId}/card/{stored.CardId}")))
        {
            Assert.Equal((960, 600), (card.Width, card.Height));
        }

        var row = (await owner.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={u}"))!.Single();
        Assert.Equal(stored.CardId, row.Cover!.CardId);
        Assert.Equal(stored.AssetId, (await owner.GetFromJsonAsync<ProjectDetail>($"/api/projects/{project}"))!.Cover!.AssetId);

        var square = await owner.PutAsJsonAsync($"{route}/card", new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0, 0.75, 1)));
        Assert.Equal(HttpStatusCode.BadRequest, square.StatusCode);
        var reframed = await owner.PutAsJsonAsync($"{route}/card", new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0, 0.5, 0.5)));
        Assert.Equal(HttpStatusCode.OK, reframed.StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(viewer, route, png)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync(route)).StatusCode);

        // Someone with no way into the universe does not learn the project exists.
        var (stranger, _) = await Account(_factory, "cover-project-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(route)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync(route)).StatusCode);
        Assert.Null((await owner.GetFromJsonAsync<ProjectDetail>($"/api/projects/{project}"))!.Cover);
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains($"/projects/{project:D}/cover/", StringComparison.Ordinal));
    }

    // ---------- Project order ----------

    [Fact]
    public async Task ProjectOrder_a_new_project_goes_last_and_one_kind_is_reordered_whole()
    {
        var (owner, _) = await Account(_factory, "project-order");
        var (viewer, viewerId) = await Account(_factory, "project-order-viewer");
        var u = (await CreateUniverse(owner, "Ordered projects")).Id;
        var first = await Project(owner, u, "First", ProjectKind.Game);
        var second = await Project(owner, u, "Second", ProjectKind.Game);
        var film = await Project(owner, u, "A film", ProjectKind.Film);
        var third = await Project(owner, u, "Third", ProjectKind.Game);
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);

        Assert.Equal([first, second, film, third], await Listed(owner, u));

        var route = $"/api/universes/{u}/projects/order";
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(route, new ProjectOrderRequest(ProjectKind.Game, [third, first]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(route, new ProjectOrderRequest(ProjectKind.Game, [third, first, first]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(route, new ProjectOrderRequest(ProjectKind.Film, [third, first, second]))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PutAsJsonAsync(route, new ProjectOrderRequest(ProjectKind.Game, [third, first, second]))).StatusCode);

        var ordered = await owner.PutAsJsonAsync(route, new ProjectOrderRequest(ProjectKind.Game, [third, first, second]));
        Assert.Equal(HttpStatusCode.OK, ordered.StatusCode);
        Assert.Equal([third, first, film, second], (await ordered.Content.ReadFromJsonAsync<List<ProjectDetail>>())!.Select(row => row.Id).ToList());

        // The film kept its place; the list reads the new order.
        Assert.Equal([third, first, film, second], await Listed(owner, u));
    }

    // ---------- Backup ----------

    [Fact]
    public async Task Backup_round_trip_keeps_a_story_cover_a_project_cover_and_the_project_order()
    {
        var (owner, _) = await Account(_factory, "cover-backup");
        var u = (await CreateUniverse(owner, "Covered world")).Id;
        var story = await PlotTestClient.CreateStory(owner, u, "Covered story");
        var first = await Project(owner, u, "Alpha", ProjectKind.Game);
        var second = await Project(owner, u, "Beta", ProjectKind.Game);
        (await owner.PutAsJsonAsync($"/api/universes/{u}/projects/order", new ProjectOrderRequest(ProjectKind.Game, [second, first]))).EnsureSuccessStatusCode();

        var storyPng = RestoreTestClient.Png(600, 900, 31);
        var projectPng = RestoreTestClient.Png(1600, 1000, 32);
        await Uploaded(owner, $"/api/universes/{u}/stories/{story}/cover", storyPng);
        await Uploaded(owner, $"/api/projects/{second}/cover", projectPng);

        var archive = await PlotTestClient.RawArchive(owner, u);
        var backup = RestoreTestClient.BackupOf(archive);
        Assert.Equal(59, backup.FormatVersion);
        Assert.Equal(storyPng, RestoreTestClient.Entries(archive)[backup.Payload.Stories!.Single().Cover!.MediaPath]);
        Assert.Equal(projectPng, RestoreTestClient.Entries(archive)[backup.Payload.CreativeProjects!.Single(project => project.Id == second).Cover!.MediaPath]);

        var restored = await RestoreTestClient.RestoreArchive(owner, archive, "Covered world restored");

        // The story shows as a Writing Project after the stored projects; only the stored ones are ordered.
        var projects = (await owner.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={restored.Id}"))!
            .Where(project => project.StoryId is null)
            .ToList();
        Assert.Equal(["Beta", "Alpha"], projects.Select(project => project.Name).ToList());
        var beta = projects[0];
        Assert.Null(projects[1].Cover);
        Assert.Equal(projectPng, await Bytes(owner, $"/api/projects/{beta.Id}/cover/{beta.Cover!.AssetId}/original"));
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/projects/{beta.Id}/cover/{beta.Cover.AssetId}/card/{beta.Cover.CardId}")).StatusCode);

        var restoredStory = (await owner.GetFromJsonAsync<List<StorySummary>>($"/api/universes/{restored.Id}/stories"))!.Single();
        Assert.Equal(storyPng, await Bytes(owner, $"/api/universes/{restored.Id}/stories/{restoredStory.Id}/cover/{restoredStory.Cover!.AssetId}/original"));

        // An older file has no cover and still restores, its projects in the order it listed them.
        var older = await RestoreTestClient.RestoreArchive(owner, RestoreTestClient.Downgrade(archive, 57), "Covered world older");
        var olderProjects = (await owner.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={older.Id}"))!
            .Where(project => project.StoryId is null)
            .ToList();
        Assert.Equal(2, olderProjects.Count);
        Assert.All(olderProjects, project => Assert.Null(project.Cover));
    }

    [Fact]
    public async Task A_comic_cover_is_a_2_3_issue_cover()
    {
        var (owner, _) = await Account(_factory, "cover-comic");
        var u = (await CreateUniverse(owner, "Comic covers")).Id;
        var project = await Project(owner, u, "Inkfall", ProjectKind.Comic);
        var route = $"/api/projects/{project}/cover";

        var stored = await Uploaded(owner, route, Png(1200, 1200));
        using (var card = Image.Load<Rgba32>(await Bytes(owner, $"{route}/{stored.AssetId}/card/{stored.CardId}")))
        {
            Assert.Equal((640, 960), (card.Width, card.Height));
        }

        var wide = await owner.PutAsJsonAsync($"{route}/card", new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0.1875, 1, 0.625)));
        Assert.Equal(HttpStatusCode.BadRequest, wide.StatusCode);
        Assert.Contains("2:3", await wide.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    // ---------- Helpers ----------

    private static async Task<Guid> Project(HttpClient client, Guid u, string name, ProjectKind kind) =>
        (await PlotTestClient.PostJson<ProjectDetail>(client, "/api/projects", new ProjectRequest(name, kind, ProjectLifecycle.Active, null, null, u, null))).Id;

    private static async Task<List<Guid>> Listed(HttpClient client, Guid u) =>
        [.. (await client.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={u}"))!.Select(row => row.Id)];

    private static async Task<HttpResponseMessage> Upload(HttpClient client, string route, byte[] png, ImageCrop? crop = null)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "cover.png");

        if (crop is not null)
        {
            form.Add(new StringContent(JsonSerializer.Serialize(crop, JsonSerializerOptions.Web)), "crop");
        }

        return await client.PutAsync(route, form);
    }

    private static async Task<UniverseArtworkRef> Uploaded(HttpClient client, string route, byte[] png)
    {
        var response = await Upload(client, route, png);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseArtworkRef>())!;
    }

    private static async Task<byte[]> Bytes(HttpClient client, string route)
    {
        var response = await client.GetAsync(route);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadAsByteArrayAsync();
    }
}
