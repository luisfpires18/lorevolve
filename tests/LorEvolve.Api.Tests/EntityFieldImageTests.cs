using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;

using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Image fields on entry types (Issue #238): one picture per field, cropped to the field's shape, on Lore and project
/// entries alike. The host runs against <see cref="TestMediaObjectStore"/>, so the keys asserted are the keys R2 would hold.
/// </summary>
public sealed class EntityFieldImageTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Field definitions ----------

    [Fact]
    public async Task An_image_field_is_created_on_a_Lore_type_with_each_shape_and_free_by_default()
    {
        var (client, u, character) = await World("fimgdef");

        foreach (var shape in Enum.GetValues<FieldImageShape>())
        {
            var field = await LoreField(client, u, character, $"Picture {shape}", shape);
            Assert.Equal(EntityFieldKind.Image, field.Kind);
            Assert.Equal(shape, field.ImageShape);
        }

        var unshaped = await LoreField(client, u, character, "Unshaped", shape: null);
        Assert.Equal(FieldImageShape.Free, unshaped.ImageShape);

        // On the wire the kind and the shape are numbers, as every other enum of the API is.
        using var types = JsonDocument.Parse(await client.GetStringAsync($"/api/universes/{u}/entity-types"));
        var wire = types.RootElement.EnumerateArray()
            .SelectMany(type => type.GetProperty("fields").EnumerateArray())
            .Single(each => each.GetProperty("name").GetString() == $"Picture {FieldImageShape.SixteenByNine}");
        Assert.Equal(8, wire.GetProperty("kind").GetInt32());
        Assert.Equal(3, wire.GetProperty("imageShape").GetInt32());
    }

    [Fact]
    public async Task A_shape_on_another_kind_and_a_required_image_field_are_refused()
    {
        var (client, u, character) = await World("fimgbad");

        var shaped = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entity-types/{character}/fields",
            new FieldDefinitionRequest("Notes", EntityFieldKind.ShortText, false, null, null, null, ImageShape: FieldImageShape.Square));
        Assert.Equal(HttpStatusCode.BadRequest, shaped.StatusCode);
        Assert.Contains("imageShape", await ErrorKeys(shaped));

        var required = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entity-types/{character}/fields",
            new FieldDefinitionRequest("Portrait", EntityFieldKind.Image, true, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, required.StatusCode);
        Assert.Contains("isRequired", await ErrorKeys(required));
    }

    [Fact]
    public async Task An_image_field_is_created_on_a_project_type_with_each_shape()
    {
        var (client, u, _) = await World("fimgproj");
        var project = await NewProject(client, u);
        var type = await NewProjectType(client, project, "Unit");

        foreach (var shape in Enum.GetValues<FieldImageShape>())
        {
            var response = await client.PostAsJsonAsync(
                $"/api/projects/{project}/entity-types/{type}/fields",
                new ProjectEntityFieldRequest($"Art {shape}", EntityFieldKind.Image, ImageShape: shape));
            response.EnsureSuccessStatusCode();
            var field = (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!.Fields.Single(each => each.Name == $"Art {shape}");
            Assert.Equal(EntityFieldKind.Image, field.Kind);
            Assert.Equal(shape, field.ImageShape);
        }

        var required = await client.PostAsJsonAsync(
            $"/api/projects/{project}/entity-types/{type}/fields",
            new ProjectEntityFieldRequest("Required art", EntityFieldKind.Image, IsRequired: true));
        Assert.Equal(HttpStatusCode.BadRequest, required.StatusCode);
    }

    // ---------- Upload and read ----------

    [Fact]
    public async Task Two_image_fields_hold_two_pictures_and_the_entry_read_returns_both()
    {
        var (client, u, character) = await World("fimgtwo");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var banner = await LoreField(client, u, character, "Banner", FieldImageShape.SixteenByNine);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");

        var first = await Uploaded(client, u, entry, portrait.Id, Png(600, 600), new EntityImageCrop(0, 0, 1, 1), "portrait.png");
        var second = await Uploaded(client, u, entry, banner.Id, Png(1600, 900), new EntityImageCrop(0, 0, 1, 1), "banner.png");

        Assert.NotEqual(first.AssetId, second.AssetId);
        Assert.Equal(portrait.Id, first.FieldId);
        Assert.Equal("portrait.png", first.FileName);
        Assert.Equal(600, first.Width);

        var detail = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!;
        Assert.Equal(
            new[] { portrait.Id, banner.Id }.Order(),
            detail.FieldImages!.Select(image => image.FieldId).Order());
        Assert.Empty(detail.Fields.Where(field => field.Kind == EntityFieldKind.Image));

        // Both pictures are stored apart, under their own keys, and each serves its original and its crop.
        Assert.True(_factory.Media.Contains(OriginalKey(u, entry, first)));
        Assert.True(_factory.Media.Contains(CropKey(u, entry, second)));

        var original = await client.GetAsync(OriginalUrl(u, entry, first));
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal("image/png", original.Content.Headers.ContentType!.MediaType);

        var crop = await client.GetAsync(CropUrl(u, entry, second));
        Assert.Equal(HttpStatusCode.OK, crop.StatusCode);
        Assert.Equal("image/webp", crop.Content.Headers.ContentType!.MediaType);
        Assert.Contains("immutable", crop.Headers.CacheControl!.ToString());

        // The crop of a 16:9 field is cut 16:9 and fitted within the field's long side.
        using var cut = SixLabors.ImageSharp.Image.Load(await crop.Content.ReadAsByteArrayAsync());
        Assert.Equal(ImagePreparation.DisplaySide, cut.Width);
        Assert.Equal(720, cut.Height);

        // The wire carries exactly the contract's members.
        using var json = JsonDocument.Parse(await client.GetStringAsync($"/api/universes/{u}/entities/{entry}"));
        var wire = json.RootElement.GetProperty("fieldImages")[0];
        Assert.Equal(
            ["assetId", "crop", "cropId", "fieldId", "fileName", "height", "width"],
            wire.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));
        Assert.Equal(
            ["height", "width", "x", "y"],
            wire.GetProperty("crop").EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task What_is_not_an_image_and_a_file_over_the_limit_are_refused()
    {
        var (client, u, character) = await World("fimgrefuse");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Free);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");

        var text = await Upload(client, u, entry, portrait.Id, Encoding.UTF8.GetBytes("not a picture"), null, "notes.png");
        Assert.Equal(HttpStatusCode.BadRequest, text.StatusCode);

        var svg = await Upload(
            client, u, entry, portrait.Id,
            Encoding.UTF8.GetBytes("""<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>"""),
            null, "drawing.svg", "image/svg+xml");
        Assert.Equal(HttpStatusCode.BadRequest, svg.StatusCode);

        var huge = await Upload(client, u, entry, portrait.Id, new byte[ImagePreparation.MaxUploadBytes + 1], null, "huge.png");
        Assert.Equal(HttpStatusCode.BadRequest, huge.StatusCode);

        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.FieldImages!);
    }

    [Fact]
    public async Task A_crop_that_breaks_the_fields_shape_is_refused_and_a_free_field_takes_any_ratio()
    {
        var (client, u, character) = await World("fimgshape");
        var wide = await LoreField(client, u, character, "Banner", FieldImageShape.SixteenByNine);
        var free = await LoreField(client, u, character, "Sketch", FieldImageShape.Free);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");

        var square = new EntityImageCrop(0, 0, 0.5, 0.5);
        var refused = await Upload(client, u, entry, wide.Id, Png(800, 800), square, "banner.png");
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains(ImagePreparation.CropField, await ErrorKeys(refused));

        var tall = await Uploaded(client, u, entry, free.Id, Png(800, 800), new EntityImageCrop(0.1, 0, 0.3, 0.9), "sketch.png");
        using var cut = SixLabors.ImageSharp.Image.Load(_factory.Media.Bytes(CropKey(u, entry, tall)));
        Assert.Equal(240, cut.Width);
        Assert.Equal(720, cut.Height);

        // A recrop is held to the shape too.
        var placed = await Uploaded(client, u, entry, wide.Id, Png(1600, 900), new EntityImageCrop(0, 0, 1, 1), "banner.png");
        var recrop = await client.PutAsJsonAsync(
            $"{Route(u, entry, wide.Id)}/crop", new FieldImageCropRequest(placed.AssetId, new EntityImageCrop(0, 0, 0.5, 1)));
        Assert.Equal(HttpStatusCode.BadRequest, recrop.StatusCode);
    }

    [Fact]
    public async Task Replace_and_recrop_write_new_keys_and_sweep_the_old_and_remove_clears_both()
    {
        var (client, u, character) = await World("fimgswap");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");

        var first = await Uploaded(client, u, entry, portrait.Id, Png(600, 400), null, "first.png");

        var recropped = await client.PutAsJsonAsync(
            $"{Route(u, entry, portrait.Id)}/crop",
            new FieldImageCropRequest(first.AssetId, new EntityImageCrop(0.5, 0, 0.5, 0.75)));
        recropped.EnsureSuccessStatusCode();
        var framed = (await recropped.Content.ReadFromJsonAsync<FieldImageRef>())!;

        Assert.Equal(first.AssetId, framed.AssetId);
        Assert.NotEqual(first.CropId, framed.CropId);
        Assert.True(_factory.Media.Contains(OriginalKey(u, entry, first)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, first)));
        Assert.True(_factory.Media.Contains(CropKey(u, entry, framed)));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(CropUrl(u, entry, first))).StatusCode);

        // A recrop that names a picture the field no longer holds is refused.
        var replaced = await Uploaded(client, u, entry, portrait.Id, Png(500, 500), null, "second.png");
        Assert.NotEqual(first.AssetId, replaced.AssetId);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, first)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, framed)));

        var stale = await client.PutAsJsonAsync(
            $"{Route(u, entry, portrait.Id)}/crop",
            new FieldImageCropRequest(first.AssetId, new EntityImageCrop(0, 0, 1, 1)));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route(u, entry, portrait.Id))).StatusCode);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, replaced)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, replaced)));
        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.FieldImages!);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route(u, entry, portrait.Id))).StatusCode);
    }

    // ---------- Who may ----------

    [Fact]
    public async Task A_non_member_gets_404_and_a_Reviewer_gets_403_on_every_write()
    {
        var (owner, u, character) = await World("fimgwho");
        var portrait = await LoreField(owner, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(owner, u, character, "Alenna Vance");
        var stored = await Uploaded(owner, u, entry, portrait.Id, Png(400, 400), null, "portrait.png");

        var (outsider, _) = await Account(_factory, "fimgwho-outsider");
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(outsider, u, entry, portrait.Id, Png(300, 300), null, "x.png")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(OriginalUrl(u, entry, stored))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(CropUrl(u, entry, stored))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync(Route(u, entry, portrait.Id))).StatusCode);

        var (reviewer, reviewerId) = await Account(_factory, "fimgwho-reviewer");
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(reviewer, u, entry, portrait.Id, Png(300, 300), null, "x.png")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await reviewer.PutAsJsonAsync($"{Route(u, entry, portrait.Id)}/crop", new FieldImageCropRequest(stored.AssetId, new EntityImageCrop(0, 0, 1, 1)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reviewer.DeleteAsync(Route(u, entry, portrait.Id))).StatusCode);

        // A Reviewer reads, as every member does.
        Assert.Equal(HttpStatusCode.OK, (await reviewer.GetAsync(CropUrl(u, entry, stored))).StatusCode);
        Assert.True(_factory.Media.Contains(OriginalKey(u, entry, stored)));
    }

    [Fact]
    public async Task A_field_of_another_kind_or_another_type_answers_404()
    {
        var (client, u, character) = await World("fimgwrong");
        var notes = await AddLoreField(client, u, character, new FieldDefinitionRequest("Notes", EntityFieldKind.ShortText, false, null, null, null));
        var entry = await LoreEntry(client, u, character, "Alenna Vance");

        Assert.Equal(HttpStatusCode.NotFound, (await Upload(client, u, entry, notes.Id, Png(300, 300), null, "x.png")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(client, u, entry, Guid.NewGuid(), Png(300, 300), null, "x.png")).StatusCode);
    }

    // ---------- Values, fields and deletion ----------

    [Fact]
    public async Task A_value_sent_for_an_image_field_is_refused_and_an_empty_one_is_not()
    {
        var (client, u, character) = await World("fimgvalue");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);

        var refused = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entities",
            new EntityRequest(character, "Alenna Vance", null, CanonStatus.Idea, null, null,
                [new FieldValueInput(portrait.Id, "a picture", null, null, null, null, null)]));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains(portrait.Id.ToString(), await ErrorKeys(refused));

        var empty = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entities",
            new EntityRequest(character, "Alenna Vance", null, CanonStatus.Idea, null, null,
                [new FieldValueInput(portrait.Id, null, null, null, null, null, null)]));
        Assert.Equal(HttpStatusCode.Created, empty.StatusCode);
    }

    [Fact]
    public async Task Deleting_a_Lore_field_removes_its_pictures_and_sweeps_their_keys()
    {
        var (client, u, character) = await World("fimgfield");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");
        var stored = await Uploaded(client, u, entry, portrait.Id, Png(300, 300), null, "portrait.png");

        // A picture is not a value: it does not hold the field the way a value does.
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        Assert.Equal(0, types.SelectMany(type => type.Fields).Single(field => field.Id == portrait.Id).EntryCount);

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/universes/{u}/entity-types/{character}/fields/{portrait.Id}")).StatusCode);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, stored)));
        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.FieldImages!);
    }

    [Fact]
    public async Task A_Lore_field_that_still_holds_a_value_is_not_deleted()
    {
        var (client, u, character) = await World("fimgfieldvalue");
        var notes = await AddLoreField(client, u, character, new FieldDefinitionRequest("Notes", EntityFieldKind.ShortText, false, null, null, null));
        var created = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entities",
            new EntityRequest(character, "Alenna Vance", null, CanonStatus.Idea, null, null,
                [new FieldValueInput(notes.Id, "kept", null, null, null, null, null)]));
        created.EnsureSuccessStatusCode();

        Assert.Equal(
            HttpStatusCode.Conflict,
            (await client.DeleteAsync($"/api/universes/{u}/entity-types/{character}/fields/{notes.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_Lore_entry_moved_to_a_type_without_the_field_loses_the_picture_and_still_backs_up()
    {
        var (client, u, character) = await World("fimgretype");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");
        var stored = await Uploaded(client, u, entry, portrait.Id, Png(300, 300), null, "portrait.png");

        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var other = types.First(type => type.Id != character && type.ParentId is null).Id;
        var version = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.Version;

        var moved = await client.PutAsJsonAsync(
            $"/api/universes/{u}/entities/{entry}",
            new EntityRequest(other, "Alenna Vance", null, CanonStatus.Idea, null, null, null, version));
        Assert.True(moved.IsSuccessStatusCode, await moved.Content.ReadAsStringAsync());

        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.FieldImages!);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, stored)));

        var restored = await RestoreTestClient.RestoreArchive(client, await PlotTestClient.RawArchive(client, u), "Moved world restored");
        Assert.NotEqual(Guid.Empty, restored.Id);
    }

    [Fact]
    public async Task A_project_entry_moved_to_a_type_without_the_field_loses_the_picture_and_still_backs_up()
    {
        var (client, u, _) = await World("fimgprojretype");
        var (project, _, entry, art) = await ProjectWithImageField(client, u);
        var stored = await Uploaded(client, u, entry, art, Png(400, 300), null, "unit.png");
        var plain = await NewProjectType(client, project, "Terrain");
        var version = (await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project}/entities/{entry}"))!.Version;

        var moved = await client.PutAsJsonAsync(
            $"/api/projects/{project}/entities/{entry}",
            new ProjectEntityRequest(plain, "Scout", null, ExpectedVersion: version));
        Assert.True(moved.IsSuccessStatusCode, await moved.Content.ReadAsStringAsync());

        Assert.Empty((await moved.Content.ReadFromJsonAsync<EntityDetail>())!.FieldImages!);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, stored)));

        var restored = await RestoreTestClient.RestoreArchive(client, await PlotTestClient.RawArchive(client, u), "Moved project restored");
        Assert.NotEqual(Guid.Empty, restored.Id);
    }

    [Fact]
    public async Task The_Trash_keeps_the_pictures_and_a_permanent_delete_sweeps_them()
    {
        var (client, u, character) = await World("fimgtrash");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");
        var stored = await Uploaded(client, u, entry, portrait.Id, Png(300, 300), null, "portrait.png");

        (await client.DeleteAsync($"/api/universes/{u}/entities/{entry}")).EnsureSuccessStatusCode();
        Assert.True(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(client, u, entry, portrait.Id, Png(300, 300), null, "x.png")).StatusCode);

        (await client.DeleteAsync($"/api/universes/{u}/trash/{entry}")).EnsureSuccessStatusCode();
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, stored)));
    }

    [Fact]
    public async Task Deleting_the_universe_sweeps_Lore_and_project_field_pictures()
    {
        var (client, u, character) = await World("fimguniv");
        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var entry = await LoreEntry(client, u, character, "Alenna Vance");
        var lore = await Uploaded(client, u, entry, portrait.Id, Png(300, 300), null, "portrait.png");

        var (_, _, projectEntry, art) = await ProjectWithImageField(client, u);
        var shot = await Uploaded(client, u, projectEntry, art, Png(400, 300), null, "unit.png");

        (await client.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}")).StatusCode);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, lore)));
        Assert.False(_factory.Media.Contains(OriginalKey(u, projectEntry, shot)));
        Assert.False(_factory.Media.Contains(CropKey(u, projectEntry, shot)));
    }

    [Fact]
    public async Task A_project_entry_holds_a_picture_and_its_read_returns_it()
    {
        var (client, u, _) = await World("fimgprojentry");
        var (project, _, entry, art) = await ProjectWithImageField(client, u);

        var stored = await Uploaded(client, u, entry, art, Png(800, 600), new EntityImageCrop(0, 0, 1, 1), "unit.png");

        var detail = (await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project}/entities/{entry}"))!;
        var image = Assert.Single(detail.FieldImages!);
        Assert.Equal(stored.AssetId, image.AssetId);
        Assert.Equal(art, image.FieldId);

        var crop = await client.GetAsync(CropUrl(u, entry, stored));
        Assert.Equal(HttpStatusCode.OK, crop.StatusCode);
        using var cut = SixLabors.ImageSharp.Image.Load(await crop.Content.ReadAsByteArrayAsync());
        Assert.Equal(800, cut.Width);
        Assert.Equal(600, cut.Height);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(OriginalUrl(u, entry, stored))).StatusCode);

        // Deleting the project field removes its picture and sweeps its keys.
        var types = (await client.GetFromJsonAsync<List<ProjectEntityTypeResponse>>($"/api/projects/{project}/entity-types"))!;
        var typeId = types.Single(type => type.Fields.Any(field => field.Id == art)).Id;
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/projects/{project}/entity-types/{typeId}/fields/{art}")).StatusCode);
        Assert.False(_factory.Media.Contains(OriginalKey(u, entry, stored)));
        Assert.False(_factory.Media.Contains(CropKey(u, entry, stored)));
        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project}/entities/{entry}"))!.FieldImages!);
    }

    // ---------- Helpers ----------

    private async Task<(HttpClient Client, Guid U, Guid Character)> World(string tag)
    {
        var (client, _) = await Account(_factory, tag);
        var u = (await CreateUniverse(client, $"World {tag}")).Id;
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        return (client, u, types.First(type => type.Name == "Character").Id);
    }

    private static async Task<FieldDefinitionResponse> AddLoreField(HttpClient client, Guid u, Guid typeId, FieldDefinitionRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/universes/{u}/entity-types/{typeId}/fields", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == request.Name);
    }

    private static Task<FieldDefinitionResponse> LoreField(HttpClient client, Guid u, Guid typeId, string name, FieldImageShape? shape) =>
        AddLoreField(client, u, typeId, new FieldDefinitionRequest(name, EntityFieldKind.Image, false, null, null, null, ImageShape: shape));

    private static async Task<Guid> LoreEntry(HttpClient client, Guid u, Guid typeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{u}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }

    private static async Task<Guid> NewProject(HttpClient client, Guid u)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Field pictures", ProjectKind.Game, ProjectLifecycle.Active, null, null, u, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!.Id;
    }

    private static async Task<Guid> NewProjectType(HttpClient client, Guid project, string name)
    {
        var response = await client.PostAsJsonAsync($"/api/projects/{project}/entity-types", new ProjectEntityTypeRequest(name, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!.Id;
    }

    /// <summary>A project with a type holding one 4:3 image field, and one entry of it.</summary>
    private static async Task<(Guid Project, Guid Type, Guid Entry, Guid Field)> ProjectWithImageField(HttpClient client, Guid u)
    {
        var project = await NewProject(client, u);
        var type = await NewProjectType(client, project, "Unit");
        var added = await client.PostAsJsonAsync(
            $"/api/projects/{project}/entity-types/{type}/fields",
            new ProjectEntityFieldRequest("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.FourByThree));
        added.EnsureSuccessStatusCode();
        var field = (await added.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!.Fields.Single(each => each.Name == "Art").Id;

        var created = await client.PostAsJsonAsync($"/api/projects/{project}/entities", new ProjectEntityRequest(type, "Scout", null));
        created.EnsureSuccessStatusCode();
        return (project, type, (await created.Content.ReadFromJsonAsync<EntityDetail>())!.Id, field);
    }

    private static string Route(Guid u, Guid entry, Guid field) => $"/api/universes/{u}/entities/{entry}/field-images/{field}";

    private static string OriginalUrl(Guid u, Guid entry, FieldImageRef image) =>
        $"{Route(u, entry, image.FieldId)}/{image.AssetId}/original";

    private static string CropUrl(Guid u, Guid entry, FieldImageRef image) =>
        $"{Route(u, entry, image.FieldId)}/{image.AssetId}/crop/{image.CropId}";

    private static string Prefix(Guid u, Guid entry, FieldImageRef image) =>
        $"universes/{u:D}/entities/{entry:D}/fields/{image.FieldId:D}/{image.AssetId:D}";

    private static string OriginalKey(Guid u, Guid entry, FieldImageRef image) => $"{Prefix(u, entry, image)}/original.png";

    private static string CropKey(Guid u, Guid entry, FieldImageRef image) => $"{Prefix(u, entry, image)}/crop-{image.CropId:D}.webp";

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client,
        Guid u,
        Guid entry,
        Guid field,
        byte[] bytes,
        EntityImageCrop? crop,
        string fileName,
        string contentType = "image/png")
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);

        if (crop is not null)
        {
            form.Add(new StringContent(JsonSerializer.Serialize(crop, JsonSerializerOptions.Web)), "crop");
        }

        return await client.PutAsync(Route(u, entry, field), form);
    }

    private static async Task<FieldImageRef> Uploaded(
        HttpClient client,
        Guid u,
        Guid entry,
        Guid field,
        byte[] bytes,
        EntityImageCrop? crop,
        string fileName)
    {
        var response = await Upload(client, u, entry, field, bytes, crop, fileName);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<FieldImageRef>())!;
    }
}
