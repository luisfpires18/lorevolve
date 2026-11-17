using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Image fields in a backup (format version 48, Issue #238): a field's crop shape and every entry's field pictures travel,
/// Lore and project entries alike, and a restore stores them again under new keys. A version 47 file still restores.
/// </summary>
public sealed class FieldImageBackupTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _api = factory;

    [Fact]
    public async Task Export_then_restore_keeps_both_field_pictures_and_the_shapes()
    {
        var client = await SignedIn(_api, "fimgbackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Pictured world")).Id;
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;

        var portrait = await LoreField(client, u, character, "Portrait", FieldImageShape.Square);
        var sketch = await LoreField(client, u, character, "Sketch", FieldImageShape.Free);
        var entry = await CreateEntity(client, u, "Alenna Vance");
        var portraitPng = Png(500, 500, 21);
        await Upload(client, u, entry, portrait, portraitPng, null);
        await Upload(client, u, entry, sketch, Png(400, 800, 22), new EntityImageCrop(0, 0.25, 1, 0.5));

        // A project entry's picture travels too.
        var project = await PostJson<ProjectDetail>(client, "/api/projects", new ProjectRequest("Game", ProjectKind.Game, ProjectLifecycle.Active, null, null, u, null));
        var unit = await PostJson<ProjectEntityTypeResponse>(client, $"/api/projects/{project.Id}/entity-types", new ProjectEntityTypeRequest("Unit", null, null, null));
        var art = (await PostJson<ProjectEntityTypeResponse>(
                client,
                $"/api/projects/{project.Id}/entity-types/{unit.Id}/fields",
                new ProjectEntityFieldRequest("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.FourByThree)))
            .Fields.Single(field => field.Name == "Art").Id;
        var scout = await PostJson<EntityDetail>(client, $"/api/projects/{project.Id}/entities", new ProjectEntityRequest(unit.Id, "Scout", null));
        await Upload(client, u, scout.Id, art, Png(800, 600, 23), null);

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(50, backup.FormatVersion);

        var fields = backup.Payload.EntityTypes.SelectMany(type => type.Fields).ToDictionary(field => field.Id);
        Assert.Equal(FieldImageShape.Square, fields[portrait].ImageShape);
        Assert.Equal(FieldImageShape.Free, fields[sketch].ImageShape);
        Assert.Equal(FieldImageShape.FourByThree, fields[art].ImageShape);

        var held = backup.Payload.Entities.Single(each => each.Id == entry).FieldImages!;
        Assert.Equal(2, held.Count);
        var portraitImage = held.Single(image => image.FieldDefinitionId == portrait);
        Assert.Equal($"media/entities/{entry:D}/fields/{portrait:D}/original.png", portraitImage.MediaPath);
        Assert.Equal(portraitPng, Entries(archive)[portraitImage.MediaPath]);
        Assert.Equal(new BackupImageCrop(0, 0.25, 1, 0.5), held.Single(image => image.FieldDefinitionId == sketch).Crop);
        Assert.Single(backup.Payload.ProjectEntities!.Single(each => each.Id == scout.Id).FieldImages!);
        Assert.DoesNotContain("universes/", DocumentOf(archive), StringComparison.Ordinal);

        // Restored: new ids and keys, both pictures readable, the shapes kept.
        var restored = await RestoreArchive(client, archive, "Pictured world restored");
        var page = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?page=1&pageSize=50"))!;
        var restoredEntry = page.Items.Single(item => item.Name == "Alenna Vance").Id;
        var detail = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{restored.Id}/entities/{restoredEntry}"))!;
        Assert.Equal(2, detail.FieldImages!.Count);
        Assert.DoesNotContain(detail.FieldImages, image => image.FieldId == portrait || image.FieldId == sketch);

        foreach (var image in detail.FieldImages)
        {
            var route = $"/api/universes/{restored.Id}/entities/{restoredEntry}/field-images/{image.FieldId}/{image.AssetId}";
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{route}/original")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{route}/crop/{image.CropId}")).StatusCode);
        }

        var sketchCrop = detail.FieldImages.Single(image => image.Height == 800).Crop;
        Assert.Equal((0d, 0.25, 1d, 0.5), (sketchCrop.X, sketchCrop.Y, sketchCrop.Width, sketchCrop.Height));

        var restoredFields = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{restored.Id}/entity-types"))!
            .Single(type => type.Name == "Character").Fields
            .ToDictionary(field => field.Name);
        Assert.Equal(FieldImageShape.Square, restoredFields["Portrait"].ImageShape);
        Assert.Equal(FieldImageShape.Free, restoredFields["Sketch"].ImageShape);

        // Three originals and three crops under the restored universe: the project entry's picture came back as well.
        Assert.Equal(6, _api.Media.Keys.Count(key => key.StartsWith($"universes/{restored.Id:D}/", StringComparison.Ordinal) && key.Contains("/fields/", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task A_version_47_backup_still_restores()
    {
        var client = await SignedIn(_api, "fimgbackup47");
        var u = (await PublishingTestClient.CreateUniverse(client, "Older world")).Id;
        await CreateEntity(client, u, "Alenna Vance");

        var archive = Downgrade(await RawArchive(client, u), 47);
        Assert.Equal(47, BackupOf(archive).FormatVersion);

        var restored = await RestoreArchive(client, archive, "Older world restored");
        var page = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?page=1&pageSize=50"))!;
        var entry = page.Items.Single(item => item.Name == "Alenna Vance").Id;
        Assert.Empty((await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{restored.Id}/entities/{entry}"))!.FieldImages!);
    }

    private static async Task<Guid> LoreField(HttpClient client, Guid u, Guid typeId, string name, FieldImageShape shape)
    {
        var type = await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{u}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.Image, false, null, null, null, ImageShape: shape));
        return type.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task Upload(HttpClient client, Guid u, Guid entry, Guid field, byte[] png, EntityImageCrop? crop)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");

        if (crop is not null)
        {
            form.Add(new StringContent(JsonSerializer.Serialize(crop, JsonSerializerOptions.Web)), "crop");
        }

        var response = await client.PutAsync($"/api/universes/{u}/entities/{entry}/field-images/{field}", form);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}
