using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The Comic page and panel editor (#295): a panel's script on its node, one picture per page or panel on the image field
/// pipeline, swept with the node and the universe, carried by a backup.
/// </summary>
public sealed class ComicPanelEditorTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Theory]
    [InlineData("one-shot")]
    [InlineData("manga")]
    public async Task Panels_keep_their_order_and_the_script_round_trips_with_a_version_check(string format)
    {
        var (client, u, _) = await World($"cpe{format}");
        var comic = await NewComic(client, u, format);
        var page = await PageIn(client, comic, format);
        var panels = new List<ProjectNodeDetail>();
        for (var index = 0; index < 3; index++)
        {
            panels.Add(await Add(client, comic, "panel", page.Id));
        }

        var tree = await Tree(client, comic);
        Assert.Equal([0, 1, 2], tree.Nodes.Where(node => node.ParentId == page.Id).OrderBy(node => node.SortOrder).Select(node => node.SortOrder));
        Assert.Equal(panels.Select(panel => panel.Id), tree.Nodes.Where(node => node.ParentId == page.Id).OrderBy(node => node.SortOrder).Select(node => node.Id));

        var saved = await Saved(client, comic, panels[1], "Visual", "Line one", "Caption", "Boom", "Note");
        Assert.Equal(panels[1].Version + 1, saved.Version);
        var read = (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{comic}/structure/{panels[1].Id}"))!;
        Assert.Equal(("Visual", "Line one", "Caption", "Boom", "Note"), (read.Body, read.Dialogue, read.Caption, read.Sfx, read.Notes));

        // The tree carries no script text.
        var raw = await client.GetStringAsync($"/api/projects/{comic}/structure");
        Assert.DoesNotContain("Line one", raw);

        var stale = await Save(client, comic, panels[1].Id, new ProjectNodeUpdate(null, null, "Other", panels[1].Version, "Other"));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(StructureEndpoints.NodeChangedCode, await ProblemCode(stale));

        var onPage = await Save(client, comic, page.Id, new ProjectNodeUpdate(null, null, null, page.Version, Dialogue: "Words"));
        Assert.Equal(HttpStatusCode.BadRequest, onPage.StatusCode);
        Assert.Contains("dialogue", await ErrorKeys(onPage));

        var tooLong = await Save(client, comic, panels[0].Id, new ProjectNodeUpdate(null, null, null, panels[0].Version, Sfx: new string('a', StructureLimits.ScriptFieldMaxLength + 1)));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Contains("sfx", await ErrorKeys(tooLong));

        // An empty field is stored as nothing.
        var cleared = await Saved(client, comic, saved, "Visual", "", null, null, null);
        Assert.Null(cleared.Dialogue);
    }

    [Fact]
    public async Task A_move_keeps_the_panels_script_and_picture()
    {
        var (client, u, _) = await World("cpemove");
        var comic = await NewComic(client, u, "one-shot");
        var first = await Add(client, comic, "page");
        var second = await Add(client, comic, "page");
        var panel = await Add(client, comic, "panel", first.Id);
        await Saved(client, comic, panel, "Visual", "Line", null, null, null);
        var art = await Uploaded(client, comic, panel.Id, Png(300, 200), "panel.png");

        var moved = await client.PostAsJsonAsync($"/api/projects/{comic}/structure/{panel.Id}/move", new ProjectNodeMove(0, second.Id));
        Assert.True(moved.IsSuccessStatusCode, await moved.Content.ReadAsStringAsync());

        var read = (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{comic}/structure/{panel.Id}"))!;
        Assert.Equal(second.Id, read.ParentId);
        Assert.Equal("Line", read.Dialogue);
        Assert.Equal(art.AssetId, read.Image!.AssetId);
    }

    [Fact]
    public async Task Art_is_optional_lives_on_pages_and_panels_only_and_leaves_the_script_alone()
    {
        var (client, u, _) = await World("cpeart");
        var comic = await NewComic(client, u, "manga");
        var chapter = await Add(client, comic, "chapter");
        var page = await Add(client, comic, "page", chapter.Id);
        var panel = await Add(client, comic, "panel", page.Id);

        // No art: the script saves.
        var scripted = await Saved(client, comic, panel, "Visual", "Line", "Cap", "Fx", "Note");
        Assert.Null(scripted.Image);

        var onChapter = await Upload(client, comic, chapter.Id, Png(200, 200), "c.png");
        Assert.Equal(HttpStatusCode.BadRequest, onChapter.StatusCode);
        Assert.Contains("level", await ErrorKeys(onChapter));

        var pageArt = await Uploaded(client, comic, page.Id, Png(400, 600), "page.png");
        var panelArt = await Uploaded(client, comic, panel.Id, Png(300, 200), "panel.png");
        Assert.True(_factory.Media.Contains(OriginalKey(u, comic, panelArt)));
        Assert.Equal(scripted.Version, (await Read(client, comic, panel.Id)).Version);

        // Edit the script again after the art: both stay.
        var again = await Saved(client, comic, scripted, "Visual 2", "Line 2", "Cap", "Fx", "Note");
        Assert.Equal(panelArt.AssetId, again.Image!.AssetId);

        var tree = await Tree(client, comic);
        Assert.Equal(pageArt.AssetId, tree.Nodes.Single(node => node.Id == page.Id).Image!.AssetId);

        // Recrop writes a new crop and sweeps the old one.
        var recrop = await client.PutAsJsonAsync($"{Route(comic, panel.Id)}/crop", new FieldImageCropRequest(panelArt.AssetId, new EntityImageCrop(0, 0, 0.5, 0.5)));
        Assert.True(recrop.IsSuccessStatusCode, await recrop.Content.ReadAsStringAsync());
        var recropped = (await recrop.Content.ReadFromJsonAsync<FieldImageRef>())!;
        Assert.False(_factory.Media.Contains(CropKey(u, comic, panelArt)));
        Assert.True(_factory.Media.Contains(CropKey(u, comic, recropped)));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route(comic, panel.Id))).StatusCode);
        var after = await Read(client, comic, panel.Id);
        Assert.Null(after.Image);
        Assert.Equal("Line 2", after.Dialogue);
        Assert.False(_factory.Media.Contains(OriginalKey(u, comic, recropped)));
        Assert.False(_factory.Media.Contains(CropKey(u, comic, recropped)));
    }

    [Fact]
    public async Task Access_follows_the_project_and_bad_files_and_quota_are_refused()
    {
        var (owner, u, ownerId) = await World("cpeaccess");
        var comic = await NewComic(owner, u, "one-shot");
        var page = await Add(owner, comic, "page");
        var stored = await Uploaded(owner, comic, page.Id, Png(300, 300), "page.png");

        var (outsider, _) = await Account(_factory, "cpeaccess-outsider");
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(outsider, comic, page.Id, Png(100, 100), "x.png")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(CropUrl(comic, stored))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(OriginalUrl(comic, stored))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync(Route(comic, page.Id))).StatusCode);

        foreach (var role in new[] { UniverseRole.Viewer, UniverseRole.Reviewer })
        {
            var (member, memberId) = await Account(_factory, $"cpeaccess-{role}");
            await CollaborationTestClient.Join(_factory, u, memberId, role);
            Assert.Equal(HttpStatusCode.Forbidden, (await Upload(member, comic, page.Id, Png(100, 100), "x.png")).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await member.PutAsJsonAsync($"{Route(comic, page.Id)}/crop", new FieldImageCropRequest(stored.AssetId, new EntityImageCrop(0, 0, 1, 1)))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync(Route(comic, page.Id))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await member.GetAsync(CropUrl(comic, stored))).StatusCode);
        }

        var notImage = await Upload(owner, comic, page.Id, "not an image"u8.ToArray(), "x.png");
        Assert.Equal(HttpStatusCode.BadRequest, notImage.StatusCode);
        Assert.Contains(ImagePreparation.FileField, await ErrorKeys(notImage));

        await WithDb(_factory, async db => await db.Users.Where(user => user.Id == ownerId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.StorageQuotaBytes, 10)));
        var full = await Upload(owner, comic, page.Id, Png(600, 600), "big.png");
        Assert.Equal(StorageQuota.ExceededCode, await ProblemCode(full));
        Assert.True(_factory.Media.Contains(OriginalKey(u, comic, stored)));
    }

    [Fact]
    public async Task Deleting_a_page_sweeps_its_and_its_panels_pictures()
    {
        var (client, u, _) = await World("cpedelete");
        var comic = await NewComic(client, u, "one-shot");
        var page = await Add(client, comic, "page");
        var panel = await Add(client, comic, "panel", page.Id);
        var pageArt = await Uploaded(client, comic, page.Id, Png(300, 300), "page.png");
        var panelArt = await Uploaded(client, comic, panel.Id, Png(300, 300), "panel.png");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/projects/{comic}/structure/{page.Id}")).StatusCode);
        foreach (var key in new[] { OriginalKey(u, comic, pageArt), CropKey(u, comic, pageArt), OriginalKey(u, comic, panelArt), CropKey(u, comic, panelArt) })
        {
            Assert.False(_factory.Media.Contains(key));
        }

        await WithDb(_factory, async db => Assert.False(await db.ProjectNodeImages.AnyAsync(image => image.NodeId == panel.Id)));
    }

    [Fact]
    public async Task Deleting_the_universe_sweeps_node_pictures()
    {
        var (client, u, _) = await World("cpeuniverse");
        var comic = await NewComic(client, u, "one-shot");
        var page = await Add(client, comic, "page");
        var art = await Uploaded(client, comic, page.Id, Png(300, 300), "page.png");

        (await client.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}")).StatusCode);
        Assert.False(_factory.Media.Contains(OriginalKey(u, comic, art)));
        Assert.False(_factory.Media.Contains(CropKey(u, comic, art)));
    }

    [Fact]
    public async Task A_backup_carries_the_script_and_the_pictures_and_a_restore_stores_them_again()
    {
        var (client, u, _) = await World("cpebackup");
        var comic = await NewComic(client, u, "one-shot");
        var page = await Add(client, comic, "page");
        var panel = await Add(client, comic, "panel", page.Id);
        await Saved(client, comic, panel, "Visual", "Line", "Cap", "Fx", "Note");
        var png = RestoreTestClient.Png(320, 240, 31);
        var art = await Uploaded(client, comic, panel.Id, png, "panel.png");

        var archive = await RawArchive(client, u);
        var backup = RestoreTestClient.BackupOf(archive);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        var held = backup.Payload.ProjectNodes!.Single(node => node.Id == panel.Id);
        Assert.Equal(("Line", "Cap", "Fx", "Note"), (held.Dialogue, held.Caption, held.Sfx, held.Notes));
        Assert.Equal($"media/nodes/{panel.Id:D}/original.png", held.Image!.MediaPath);
        Assert.Equal(png, RestoreTestClient.Entries(archive)[held.Image.MediaPath]);

        var restored = await RestoreTestClient.RestoreArchive(client, archive, "Copy");
        var copy = (await client.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={restored.Id}"))!.Single();
        var tree = await Tree(client, copy.Id);
        var copyPanel = tree.Nodes.Single(node => node.Level == "panel");
        Assert.NotNull(copyPanel.Image);
        Assert.NotEqual(art.AssetId, copyPanel.Image!.AssetId);
        var read = await Read(client, copy.Id, copyPanel.Id);
        Assert.Equal("Line", read.Dialogue);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(OriginalUrl(copy.Id, read.Image!))).StatusCode);
    }

    [Fact]
    public async Task Validation_refuses_script_off_a_panel_and_a_picture_off_a_page_or_panel()
    {
        var (client, u, _) = await World("cpevalid");
        var comic = await NewComic(client, u, "manga");
        var chapter = await Add(client, comic, "chapter");
        await Add(client, comic, "page", chapter.Id);
        var archive = await RawArchive(client, u);

        var scripted = RestoreTestClient.Rewrite(archive, root =>
        {
            var node = RestoreTestClient.Payload(root)["projectNodes"]!.AsArray().First(each => (string?)each!["level"] == "chapter")!;
            node["dialogue"] = "Words";
        });
        Assert.Equal(HttpStatusCode.BadRequest, (await RestoreTestClient.Validate(client, scripted)).StatusCode);

        var pictured = RestoreTestClient.Rewrite(archive, root =>
        {
            var node = RestoreTestClient.Payload(root)["projectNodes"]!.AsArray().First(each => (string?)each!["level"] == "chapter")!;
            node["image"] = JsonSerializer.SerializeToNode(
                new BackupFieldImage(chapter.Id, "c.png", "image/png", 10, 10, 10, $"media/nodes/{chapter.Id:D}/original.png", new BackupImageCrop(0, 0, 1, 1)),
                JsonSerializerOptions.Web);
        });
        Assert.Equal(HttpStatusCode.BadRequest, (await RestoreTestClient.Validate(client, pictured)).StatusCode);
    }

    // ---------- Helpers ----------

    private async Task<(HttpClient Client, Guid U, string UserId)> World(string tag)
    {
        var (client, userId) = await Account(_factory, tag);
        return (client, (await CreateUniverse(client, $"World {tag}")).Id, userId);
    }

    private static async Task<Guid> NewComic(HttpClient client, Guid u, string format)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Salt Comic", ProjectKind.Comic, ProjectLifecycle.Active, null, null, u, null, format));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!.Id;
    }

    private static async Task<ProjectNodeDetail> PageIn(HttpClient client, Guid comic, string format) =>
        format == "one-shot"
            ? await Add(client, comic, "page")
            : await Add(client, comic, "page", (await Add(client, comic, "chapter")).Id);

    private static async Task<ProjectNodeDetail> Add(HttpClient client, Guid comic, string level, Guid? parentId = null)
    {
        var response = await client.PostAsJsonAsync($"/api/projects/{comic}/structure", new ProjectNodeRequest(level, parentId));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!;
    }

    private static async Task<ProjectStructureTree> Tree(HttpClient client, Guid comic) =>
        (await client.GetFromJsonAsync<ProjectStructureTree>($"/api/projects/{comic}/structure"))!;

    private static async Task<ProjectNodeDetail> Read(HttpClient client, Guid comic, Guid nodeId) =>
        (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{comic}/structure/{nodeId}"))!;

    private static Task<HttpResponseMessage> Save(HttpClient client, Guid comic, Guid nodeId, ProjectNodeUpdate update) =>
        client.PutAsJsonAsync($"/api/projects/{comic}/structure/{nodeId}", update);

    private static async Task<ProjectNodeDetail> Saved(
        HttpClient client,
        Guid comic,
        ProjectNodeDetail node,
        string? body,
        string? dialogue,
        string? caption,
        string? sfx,
        string? notes)
    {
        var response = await Save(client, comic, node.Id, new ProjectNodeUpdate(node.Title, node.Summary, body, node.Version, dialogue, caption, sfx, notes));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!;
    }

    private static string Route(Guid comic, Guid nodeId) => $"/api/projects/{comic}/structure/{nodeId}/image";

    private static string OriginalUrl(Guid comic, FieldImageRef image) => $"{Route(comic, image.FieldId)}/{image.AssetId}/original";

    private static string CropUrl(Guid comic, FieldImageRef image) => $"{Route(comic, image.FieldId)}/{image.AssetId}/crop/{image.CropId}";

    private static string Prefix(Guid u, Guid comic, FieldImageRef image) =>
        $"universes/{u:D}/projects/{comic:D}/nodes/{image.FieldId:D}/{image.AssetId:D}";

    private static string OriginalKey(Guid u, Guid comic, FieldImageRef image) => $"{Prefix(u, comic, image)}/original.png";

    private static string CropKey(Guid u, Guid comic, FieldImageRef image) => $"{Prefix(u, comic, image)}/crop-{image.CropId:D}.webp";

    private static async Task<HttpResponseMessage> Upload(HttpClient client, Guid comic, Guid nodeId, byte[] bytes, string fileName)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", fileName);
        return await client.PutAsync(Route(comic, nodeId), form);
    }

    private static async Task<FieldImageRef> Uploaded(HttpClient client, Guid comic, Guid nodeId, byte[] bytes, string fileName)
    {
        var response = await Upload(client, comic, nodeId, bytes, fileName);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<FieldImageRef>())!;
    }
}
