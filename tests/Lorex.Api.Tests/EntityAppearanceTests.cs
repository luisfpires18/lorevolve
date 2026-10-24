using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's appearances (Issue #43). The invariants under test: an appearance belongs to exactly the eras, forms and scenes
/// ticked; its pictures are stored like the entry's own - members only, counted against the owner - in the order the author
/// sets, and deleted when removed; an appearance holding pictures is never removed by a save or a restore; eras and forms it
/// names must be stripped by the same save; backups carry appearances and their pictures.
/// </summary>
public sealed class EntityAppearanceTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Goku, Guid Frieza, Guid Cell, Guid Form);

    [Fact]
    public async Task An_appearance_belongs_exactly_where_ticked_and_holds_an_ordered_gallery()
    {
        var w = await NewWorld("looks-save");
        var story = await CreateStory(w.Client, w.U, "Dragon Ball Z");
        var namek = await CreateScene(w.Client, w.U, story, "On Namek");

        var saved = await Save(w, Look("Battle armour", eras: [w.Frieza], forms: [w.Form], scenes: [namek]), Look("Gi"));
        var armour = saved.Appearances!.Single(look => look.Label == "Battle armour");
        Assert.Equal(["Frieza Saga"], armour.Eras.Select(era => era.Name));
        Assert.Equal(["Super Saiyan"], armour.Forms.Select(form => form.Name));
        Assert.Equal("On Namek", Assert.Single(armour.Scenes).Title);
        Assert.Empty(saved.Appearances!.Single(look => look.Label == "Gi").Eras);

        var first = await AddPicture(w, armour.Id, Png(40, 20));
        var second = await AddPicture(w, armour.Id, Png(20, 40));
        Assert.Equal([first.Id, second.Id], (await Read(w)).Appearances!.Single(look => look.Id == armour.Id).Images.Select(image => image.Id));

        (await w.Client.PutAsJsonAsync($"{Images(w, armour.Id)}/order", new AppearanceImageOrderRequest([second.Id, first.Id]))).EnsureSuccessStatusCode();
        Assert.Equal([second.Id, first.Id], (await Read(w)).Appearances!.Single(look => look.Id == armour.Id).Images.Select(image => image.Id));

        // An order that is not exactly the gallery is refused.
        var stale = await w.Client.PutAsJsonAsync($"{Images(w, armour.Id)}/order", new AppearanceImageOrderRequest([first.Id]));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var original = await w.Client.GetAsync($"{Images(w, armour.Id)}/{first.Id}/original");
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal("image/png", original.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.OK, (await w.Client.GetAsync($"{Images(w, armour.Id)}/{first.Id}/thumbnail")).StatusCode);

        // The entry's own picture is untouched, and the storage counts the gallery.
        Assert.Null((await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{w.Goku}"))!.Image);
        Assert.True(await StoredBytes(w) > 0);

        (await w.Client.DeleteAsync($"{Images(w, armour.Id)}/{first.Id}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.GetAsync($"{Images(w, armour.Id)}/{first.Id}/original")).StatusCode);
        Assert.Equal([second.Id], (await Read(w)).Appearances!.Single(look => look.Id == armour.Id).Images.Select(image => image.Id));
    }

    [Fact]
    public async Task An_appearance_holding_pictures_is_never_removed_by_a_save_or_a_restore()
    {
        var w = await NewWorld("looks-keep");
        var saved = await Save(w, Look("Battle armour"));
        var armour = saved.Appearances!.Single();
        var picture = await AddPicture(w, armour.Id, Png(10, 10));

        var removal = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(null, saved.Version, Appearances: []));
        Assert.Equal(HttpStatusCode.Conflict, removal.StatusCode);
        Assert.Contains(ProgressionEndpoints.AppearanceHoldsPicturesCode, await removal.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Version 1 had no appearance: putting it back would lose the picture.
        var history = (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"{Route(w)}/revisions"))!;
        var restore = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{history.Single(one => one.Number == 1).Id}/restore",
            new ProgressionRestoreRequest(saved.Version));
        Assert.Equal(HttpStatusCode.Conflict, restore.StatusCode);
        Assert.Single((await Read(w)).Appearances!.Single().Images);

        (await w.Client.DeleteAsync($"{Images(w, armour.Id)}/{picture.Id}")).EnsureSuccessStatusCode();
        var gone = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(null, saved.Version, Appearances: []));
        Assert.True(gone.IsSuccessStatusCode, await gone.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task What_an_appearance_names_must_be_this_entrys_and_left_out_lists_must_still_fit()
    {
        var w = await NewWorld("looks-checks");
        var saved = await Save(w, Look("Battle armour", eras: [w.Frieza], forms: [w.Form]));

        var foreignEra = await Put(w, Look("Gi", eras: [Guid.NewGuid()]));
        Assert.Contains("appearances[0].eraIds", await Errors(foreignEra), StringComparison.Ordinal);
        var foreignForm = await Put(w, Look("Gi", forms: [Guid.NewGuid()]));
        Assert.Contains("appearances[0].formIds", await Errors(foreignForm), StringComparison.Ordinal);
        var twice = await Put(w, Look("Gi"), Look("gi"));
        Assert.Contains("appearances[1].label", await Errors(twice), StringComparison.Ordinal);

        // Removing the form while the appearance (left out) still names it is refused, not done behind the author's back.
        var formGone = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(null, saved.Version, Forms: []));
        Assert.Contains("appearances[0].formIds", await Errors(formGone), StringComparison.Ordinal);

        // A save of eras alone keeps the appearance.
        var erasOnly = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest([.. saved.Eras.Select(Keep).Reverse()], saved.Version));
        Assert.True(erasOnly.IsSuccessStatusCode, await erasOnly.Content.ReadAsStringAsync());
        Assert.Equal("Battle armour", (await erasOnly.Content.ReadFromJsonAsync<ProgressionResponse>())!.Appearances!.Single().Label);
    }

    [Fact]
    public async Task Pictures_are_for_members_and_editors_only()
    {
        var w = await NewWorld("looks-access");
        var armour = (await Save(w, Look("Battle armour"))).Appearances!.Single();
        var picture = await AddPicture(w, armour.Id, Png(10, 10));

        var (stranger, _) = await SignedInWithUniverse(_factory, "looks-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{Images(w, armour.Id)}/{picture.Id}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"{Images(w, armour.Id)}/{picture.Id}")).StatusCode);

        // Not a Lorex image is refused before anything is stored.
        using var junk = new MultipartFormDataContent { { new ByteArrayContent([1, 2, 3, 4]), "file", "junk.png" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PutAsync(Images(w, armour.Id), junk)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_look_or_an_entry_in_the_Trash_is_said_not_done()
    {
        var w = await NewWorld("looks-unknown");
        var armour = (await Save(w, Look("Battle armour"))).Appearances!.Single();
        var picture = await AddPicture(w, armour.Id, Png(10, 10));

        var nowhere = await w.Client.PutAsJsonAsync($"{Images(w, Guid.NewGuid())}/order", new AppearanceImageOrderRequest([]));
        Assert.Equal(HttpStatusCode.NotFound, nowhere.StatusCode);

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{w.Goku}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.DeleteAsync($"{Images(w, armour.Id)}/{picture.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await w.Client.GetAsync($"{Images(w, armour.Id)}/{picture.Id}/thumbnail")).StatusCode);
    }

    [Fact]
    public async Task Erasing_the_entry_for_good_sweeps_its_pictures()
    {
        var w = await NewWorld("looks-erase");
        var armour = (await Save(w, Look("Battle armour"))).Appearances!.Single();
        await AddPicture(w, armour.Id, Png(10, 10));
        var keys = await Keys(w);
        Assert.Equal(2, keys.Count);

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{w.Goku}")).EnsureSuccessStatusCode();
        (await w.Client.DeleteAsync($"/api/universes/{w.U}/trash/{w.Goku}")).EnsureSuccessStatusCode();

        var store = _factory.Services.GetRequiredService<Lorex.Api.Features.Media.IMediaObjectStore>();
        foreach (var key in keys)
        {
            Assert.Null(await store.GetAsync(key, CancellationToken.None));
        }
    }

    [Fact]
    public async Task History_and_backup_carry_appearances_and_their_pictures()
    {
        var w = await NewWorld("looks-backup");
        var armour = (await Save(w, Look("Battle armour", eras: [w.Frieza], forms: [w.Form]))).Appearances!.Single();
        await AddPicture(w, armour.Id, Png(30, 10));

        var backup = await Backup(w.Client, w.U);
        Assert.Equal(32, backup.FormatVersion);
        var look = backup.Payload.Entities.Single(entity => entity.Id == w.Goku).Progression!.Appearances!.Single();
        Assert.Equal("Battle armour", look.Label);
        Assert.Single(look.Images);

        var copy = await RestoreTestClient.RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "Restored looks");
        var goku = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{copy.Id}/entities?search=Goku"))!.Items.Single();
        var read = (await w.Client.GetFromJsonAsync<ProgressionResponse>($"/api/universes/{copy.Id}/entities/{goku.Id}/progression"))!;
        var restored = read.Appearances!.Single();
        Assert.NotEqual(armour.Id, restored.Id);
        Assert.Equal(["Frieza Saga"], restored.Eras.Select(era => era.Name));
        Assert.Equal(read.Forms!.Single().Id, restored.Forms.Single().Id);
        var image = Assert.Single(restored.Images);
        var bytes = await w.Client.GetAsync($"/api/universes/{copy.Id}/entities/{goku.Id}/appearances/{restored.Id}/images/{image.Id}/original");
        Assert.Equal(HttpStatusCode.OK, bytes.StatusCode);
    }

    // ---------- Helpers ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var goku = await CreateEntity(client, universe.Id, "Goku");
        var w = new World(client, universe.Id, goku, default, default, default);
        var eras = await PutJson<ProgressionResponse>(client, Route(w), new ProgressionRequest(
            [new EraInput(null, "Frieza Saga", null, null, null, null, null, null), new EraInput(null, "Cell Saga", null, null, null, null, null, null)], 0));
        var id = eras.Eras.ToDictionary(era => era.Name, era => era.Id);
        var withForm = await PutJson<ProgressionResponse>(client, Route(w), new ProgressionRequest(
            null, eras.Version, [new FormInput(null, "Super Saiyan", null, null, null, null, [], [])]));
        return w with { Frieza = id["Frieza Saga"], Cell = id["Cell Saga"], Form = withForm.Forms!.Single().Id };
    }

    private static string Route(World w) => $"/api/universes/{w.U}/entities/{w.Goku}/progression";

    private static string Images(World w, Guid appearance) => $"/api/universes/{w.U}/entities/{w.Goku}/appearances/{appearance}/images";

    private static async Task<ProgressionResponse> Read(World w) => (await w.Client.GetFromJsonAsync<ProgressionResponse>(Route(w)))!;

    private static EraInput Keep(EraResponse era) => new(era.Id, era.Name, era.Description, era.Start, era.End, [], [], []);

    private static AppearanceInput Look(string label, IReadOnlyList<Guid>? eras = null, IReadOnlyList<Guid>? forms = null, IReadOnlyList<Guid>? scenes = null) =>
        new(null, label, null, eras ?? [], forms ?? [], scenes ?? []);

    private static async Task<HttpResponseMessage> Put(World w, params AppearanceInput[] appearances)
    {
        var current = await Read(w);
        return await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(null, current.Version, Appearances: appearances));
    }

    private static async Task<ProgressionResponse> Save(World w, params AppearanceInput[] appearances)
    {
        var response = await Put(w, appearances);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProgressionResponse>())!;
    }

    private static async Task<AppearanceImageRef> AddPicture(World w, Guid appearance, byte[] png)
    {
        using var content = new MultipartFormDataContent { { new ByteArrayContent(png), "file", "look.png" } };
        var response = await w.Client.PutAsync(Images(w, appearance), content);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<AppearanceImageRef>())!;
    }

    private async Task<long> StoredBytes(World w)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Lorex.Api.Data.LorexDbContext>();
        var owner = db.Universes.Single(universe => universe.Id == w.U).OwnerId;
        return (await Lorex.Api.Features.Storage.AccountStorage.UsageAsync(db, owner, CancellationToken.None))!.LoreImageBytes;
    }

    private async Task<List<string>> Keys(World w)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Lorex.Api.Data.LorexDbContext>();
        return [.. db.EntityAppearanceImages.Where(image => image.Appearance!.EntityId == w.Goku).AsEnumerable()
            .SelectMany(image => new[] { image.OriginalKey, image.ThumbnailKey })];
    }

    private static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height, new Rgba32(200, 40, 40));
        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }
}
