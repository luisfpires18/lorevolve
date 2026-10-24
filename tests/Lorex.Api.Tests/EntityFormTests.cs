using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's forms and abilities (Issue #42), inside its progression. The invariants under test: a form is available exactly in
/// the eras ticked and in no other, whatever the order of eras or where it was first unlocked; the first unlock - an era, a scene,
/// a moment - is each optional and explicit; used-in scenes are their own list; an ability may belong to several forms or none;
/// a save that leaves forms or abilities out keeps them, and they must still fit the eras it leaves; history and backup carry them.
/// </summary>
public sealed class EntityFormTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Goku, Guid Saiyan, Guid Frieza, Guid Cell, Guid Buu, int Version);

    [Fact]
    public async Task Forms_are_available_exactly_where_ticked_and_first_unlocked_where_said()
    {
        var w = await NewWorld("forms-save");
        var story = await CreateStory(w.Client, w.U, "Dragon Ball Z");
        var namek = await CreateScene(w.Client, w.U, story, "On Namek");
        var moment = await Moment(w, "Krillin falls");

        var saved = await Save(w,
            Forms:
            [
                Form("Super Saiyan", unlockEra: w.Frieza, unlockScene: namek, unlockMoment: moment, eras: [w.Frieza, w.Cell, w.Buu], scenes: [namek]),
                Form("Super Saiyan 3", unlockEra: w.Buu, eras: [w.Buu]),
            ],
            Abilities:
            [
                Ability("Kamehameha", eras: [w.Saiyan, w.Frieza, w.Cell, w.Buu]),
                Ability("Golden aura", forms: ["Super Saiyan", "Super Saiyan 3"]),
            ]);

        var ss = saved.Forms!.Single(form => form.Name == "Super Saiyan");
        Assert.Equal(["Frieza Saga", "Cell Saga", "Buu Saga"], ss.Eras.Select(era => era.Name));
        Assert.Equal("Frieza Saga", ss.Unlock.Era!.Name);
        Assert.Equal("On Namek", ss.Unlock.Scene!.Title);
        Assert.Equal("Krillin falls", ss.Unlock.Moment!.Title);
        Assert.Equal("On Namek", Assert.Single(ss.Scenes).Title);

        // Super Saiyan 3 is not available in the Frieza Saga: nothing follows from the order of eras.
        var ss3 = saved.Forms!.Single(form => form.Name == "Super Saiyan 3");
        Assert.Equal(["Buu Saga"], ss3.Eras.Select(era => era.Name));

        var aura = saved.Abilities!.Single(ability => ability.Name == "Golden aura");
        Assert.Equal(["Super Saiyan", "Super Saiyan 3"], aura.Forms.Select(form => form.Name));
        Assert.Empty(aura.Eras);
        Assert.Empty(saved.Abilities!.Single(ability => ability.Name == "Kamehameha").Forms);

        Assert.True((await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{w.Goku}"))!.HasProgression);
    }

    [Fact]
    public async Task What_a_form_or_ability_names_must_be_this_entrys_and_this_universes()
    {
        var w = await NewWorld("forms-checks");
        var vegeta = await CreateEntity(w.Client, w.U, "Vegeta");
        var other = await Progression(w with { Goku = vegeta }, "Prince Saga");
        var story = await CreateStory(w.Client, w.U, "Trashed soon");
        var scene = await CreateScene(w.Client, w.U, story, "Gone");
        (await w.Client.DeleteAsync($"{Story(w.U, story)}")).EnsureSuccessStatusCode();

        await Refused(w, "forms[0].unlockEraId", Form("Super Saiyan", unlockEra: other));
        await Refused(w, "forms[0].eraIds", Form("Super Saiyan", eras: [other]));
        await Refused(w, "forms[0].sceneIds", Form("Super Saiyan", scenes: [scene]));
        await Refused(w, "forms[0].unlockMomentId", Form("Super Saiyan", unlockMoment: Guid.NewGuid()));
        await Refused(w, "forms[1].name", Form("Super Saiyan"), Form("super saiyan"));

        var abilityRefused = await Put(w, Abilities: [Ability("Aura", forms: [])] , rawAbilityForms: [Guid.NewGuid()]);
        Assert.Contains("abilities[0].formIds", await Errors(abilityRefused), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_save_of_eras_alone_keeps_the_forms_and_cannot_remove_an_era_they_name()
    {
        var w = await NewWorld("forms-keep");
        var saved = await Save(w, Forms: [Form("Super Saiyan", unlockEra: w.Frieza, eras: [w.Frieza, w.Cell])]);

        var erasOnly = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(
            [.. saved.Eras.Select(Keep).Reverse()], saved.Version));
        Assert.True(erasOnly.IsSuccessStatusCode, await erasOnly.Content.ReadAsStringAsync());
        var reordered = (await erasOnly.Content.ReadFromJsonAsync<ProgressionResponse>())!;
        Assert.Equal("Super Saiyan", Assert.Single(reordered.Forms!).Name);

        var withoutFrieza = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(
            [.. reordered.Eras.Where(era => era.Id != w.Frieza).Select(Keep)], reordered.Version));
        Assert.Contains("forms[0].eraIds", await Errors(withoutFrieza), StringComparison.Ordinal);

        // Sent together with the form no longer naming it, the era goes and the form stays.
        var together = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(
            [.. reordered.Eras.Where(era => era.Id != w.Frieza).Select(Keep)],
            reordered.Version,
            [Form("Super Saiyan", eras: [w.Cell]) with { Id = reordered.Forms![0].Id }]));
        Assert.True(together.IsSuccessStatusCode, await together.Content.ReadAsStringAsync());
        var after = (await together.Content.ReadFromJsonAsync<ProgressionResponse>())!;
        Assert.Equal(["Cell Saga"], after.Forms!.Single().Eras.Select(era => era.Name));
        Assert.Null(after.Forms!.Single().Unlock.Era);
    }

    [Fact]
    public async Task A_scene_deleted_for_good_leaves_the_first_unlock_unknown()
    {
        var w = await NewWorld("forms-scene-gone");
        var story = await CreateStory(w.Client, w.U, "Dragon Ball Z");
        var namek = await CreateScene(w.Client, w.U, story, "On Namek");
        await Save(w, Forms: [Form("Super Saiyan", unlockScene: namek, scenes: [namek])]);

        (await w.Client.DeleteAsync($"{Story(w.U, story)}")).EnsureSuccessStatusCode();
        (await w.Client.DeleteAsync($"/api/universes/{w.U}/trash/stories/{story}")).EnsureSuccessStatusCode();

        var form = (await Read(w)).Forms!.Single();
        Assert.Null(form.Unlock.Scene);
        Assert.Empty(form.Scenes);
    }

    [Fact]
    public async Task History_and_backup_carry_forms_and_abilities()
    {
        var w = await NewWorld("forms-history");
        var first = await Save(w, Forms: [Form("Super Saiyan", unlockEra: w.Frieza, eras: [w.Frieza])], Abilities: [Ability("Aura", forms: ["Super Saiyan"])]);
        var formId = first.Forms!.Single().Id;
        var second = await Save(w, version: first.Version, Forms: [], Abilities: []);
        Assert.Empty(second.Forms!);

        var history = (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"{Route(w)}/revisions"))!;
        var detail = (await w.Client.GetFromJsonAsync<ProgressionRevisionDetail>($"{Route(w)}/revisions/{history.Single(one => one.Number == 3).Id}"))!;
        Assert.Equal("Super Saiyan", detail.Forms!.Single().Name);

        var restore = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{history.Single(one => one.Number == 3).Id}/restore", new ProgressionRestoreRequest(second.Version));
        Assert.True(restore.IsSuccessStatusCode, await restore.Content.ReadAsStringAsync());
        var restored = (await restore.Content.ReadFromJsonAsync<ProgressionResponse>())!;
        Assert.Equal(formId, restored.Forms!.Single().Id);
        Assert.Equal("Super Saiyan", restored.Abilities!.Single().Forms.Single().Name);

        var backup = await Backup(w.Client, w.U);
        Assert.Equal(30, backup.FormatVersion);
        var progression = backup.Payload.Entities.Single(entity => entity.Id == w.Goku).Progression!;
        Assert.Equal("Super Saiyan", progression.Forms!.Single().Name);
        Assert.Equal([formId], progression.Abilities!.Single().FormIds);

        var copy = await RestoreTestClient.RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "Restored forms");
        var goku = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{copy.Id}/entities?search=Goku"))!.Items.Single();
        var read = (await w.Client.GetFromJsonAsync<ProgressionResponse>($"/api/universes/{copy.Id}/entities/{goku.Id}/progression"))!;
        Assert.Equal("Frieza Saga", read.Forms!.Single().Unlock.Era!.Name);
        Assert.NotEqual(formId, read.Forms!.Single().Id);
        Assert.Equal(read.Forms!.Single().Id, read.Abilities!.Single().Forms.Single().Id);
    }

    [Fact]
    public async Task A_version_from_before_forms_keeps_them_and_one_saved_with_none_removes_them()
    {
        var w = await NewWorld("forms-absent");
        var withForms = await Save(w, Forms: [Form("Super Saiyan", eras: [w.Frieza])], Abilities: [Ability("Aura")]);

        // Version 1 holds the four eras only. Stored before forms existed, its JSON has no forms or abilities at all.
        var history = (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"{Route(w)}/revisions"))!;
        var first = history.Single(one => one.Number == 1).Id;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            var revision = await db.EntityProgressionRevisions.SingleAsync(one => one.Id == first);
            var json = System.Text.Json.Nodes.JsonNode.Parse(revision.Snapshot)!.AsObject();
            json.Remove("forms");
            json.Remove("abilities");
            revision.Snapshot = json.ToJsonString();
            await db.SaveChangesAsync();
        }

        var restoreOld = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{first}/restore", new ProgressionRestoreRequest(withForms.Version));
        Assert.True(restoreOld.IsSuccessStatusCode, await restoreOld.Content.ReadAsStringAsync());
        var kept = (await restoreOld.Content.ReadFromJsonAsync<ProgressionResponse>())!;
        Assert.Equal("Super Saiyan", kept.Forms!.Single().Name);
        Assert.Equal("Aura", kept.Abilities!.Single().Name);

        // A version saved with none is "none": putting it back removes them.
        var none = await Save(w, version: kept.Version, Forms: [], Abilities: []);
        var restored = await Save(w, version: none.Version, Forms: [Form("Super Saiyan 3")]);
        var noneId = (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"{Route(w)}/revisions"))!
            .Single(one => one.Number == none.Version).Id;
        var restoreNone = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{noneId}/restore", new ProgressionRestoreRequest(restored.Version));
        Assert.True(restoreNone.IsSuccessStatusCode, await restoreNone.Content.ReadAsStringAsync());
        Assert.Empty((await restoreNone.Content.ReadFromJsonAsync<ProgressionResponse>())!.Forms!);
    }

    [Fact]
    public async Task A_scene_already_linked_stays_linked_through_the_Trash()
    {
        var w = await NewWorld("forms-trashed-kept");
        var story = await CreateStory(w.Client, w.U, "Dragon Ball Z");
        var namek = await CreateScene(w.Client, w.U, story, "On Namek");
        var saved = await Save(w, Forms: [Form("Super Saiyan", unlockScene: namek, scenes: [namek])]);
        (await w.Client.DeleteAsync($"{Story(w.U, story)}")).EnsureSuccessStatusCode();

        var form = (await Read(w)).Forms!.Single();
        Assert.True(form.Unlock.Scene!.IsTrashed);
        var again = await Save(w, version: saved.Version, Forms: [Form("Super Saiyan 2", unlockScene: namek, scenes: [namek]) with { Id = form.Id }]);
        Assert.Equal("Super Saiyan 2", again.Forms!.Single().Name);
        Assert.True(again.Forms!.Single().Scenes.Single().IsTrashed);
    }

    [Fact]
    public async Task A_backup_whose_forms_share_a_place_is_refused()
    {
        var w = await NewWorld("forms-backup-places");
        await Save(w, Forms: [Form("Super Saiyan"), Form("Super Saiyan 3")]);
        var archive = await RawArchive(w.Client, w.U);

        var shared = RestoreTestClient.Rewrite(archive, root =>
            root["payload"]!["entities"]!.AsArray().Single(entity => entity!["name"]!.GetValue<string>() == "Goku")!
                ["progression"]!["forms"]![1]!["sortOrder"] = 0);
        Assert.Contains((await RestoreTestClient.Refused(await RestoreTestClient.Validate(w.Client, shared))).Issues,
            issue => issue.Message.Contains("two forms in one place", StringComparison.Ordinal));
    }

    // ---------- Helpers ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var goku = await CreateEntity(client, universe.Id, "Goku");
        var w = new World(client, universe.Id, goku, default, default, default, default, 0);
        var saved = await PutJson<ProgressionResponse>(client, Route(w), new ProgressionRequest(
            [.. new[] { "Saiyan Saga", "Frieza Saga", "Cell Saga", "Buu Saga" }.Select(name => new EraInput(null, name, null, null, null, null, null, null))], 0));
        var id = saved.Eras.ToDictionary(era => era.Name, era => era.Id);
        return w with { Saiyan = id["Saiyan Saga"], Frieza = id["Frieza Saga"], Cell = id["Cell Saga"], Buu = id["Buu Saga"], Version = saved.Version };
    }

    /// <summary>Gives another entry one era and answers its id.</summary>
    private static async Task<Guid> Progression(World w, string era) =>
        (await PutJson<ProgressionResponse>(w.Client, Route(w), new ProgressionRequest([new EraInput(null, era, null, null, null, null, null, null)], 0))).Eras.Single().Id;

    private static string Route(World w) => $"/api/universes/{w.U}/entities/{w.Goku}/progression";

    private static async Task<Guid> Moment(World w, string title) =>
        (await PostJson<TimelineEntryResponse>(w.Client, $"/api/universes/{w.U}/timeline",
            new TimelineEntryRequest(title, null, CanonStatus.Canon, TimelineDateKind.Unknown, null, null, null, null, null, null, null, null, null, null))).Id;

    private static async Task<ProgressionResponse> Read(World w) => (await w.Client.GetFromJsonAsync<ProgressionResponse>(Route(w)))!;

    private static EraInput Keep(EraResponse era) => new(era.Id, era.Name, era.Description, era.Start, era.End, [], [], []);

    private static FormInput Form(
        string name,
        Guid? unlockEra = null,
        Guid? unlockScene = null,
        Guid? unlockMoment = null,
        IReadOnlyList<Guid>? eras = null,
        IReadOnlyList<Guid>? scenes = null) =>
        new(null, name, null, unlockEra, unlockScene, unlockMoment, eras ?? [], scenes ?? []);

    /// <summary>An ability; <paramref name="forms"/> name forms of the same save, resolved after it to their ids.</summary>
    private static (AbilityInput Ability, IReadOnlyList<string> Forms) Ability(string name, IReadOnlyList<Guid>? eras = null, IReadOnlyList<string>? forms = null) =>
        (new AbilityInput(null, name, null, null, null, null, eras ?? [], [], []), forms ?? []);

    private static async Task<HttpResponseMessage> Put(
        World w,
        IReadOnlyList<FormInput>? Forms = null,
        IReadOnlyList<(AbilityInput Ability, IReadOnlyList<string> Forms)>? Abilities = null,
        int? version = null,
        IReadOnlyList<Guid>? rawAbilityForms = null)
    {
        var current = await Read(w);
        var eras = current.Eras.Select(Keep).ToList();

        // Abilities that belong to forms are saved after the forms, which only then have ids.
        var forms = Forms ?? [];
        if ((Abilities ?? []).Any(ability => ability.Forms.Count > 0))
        {
            var withForms = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(eras, version ?? current.Version, forms, []));
            Assert.True(withForms.IsSuccessStatusCode, await withForms.Content.ReadAsStringAsync());
            var saved = (await withForms.Content.ReadFromJsonAsync<ProgressionResponse>())!;
            var ids = saved.Forms!.ToDictionary(form => form.Name, form => form.Id);
            return await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(
                eras,
                saved.Version,
                [.. saved.Forms!.Select(form => new FormInput(form.Id, form.Name, form.Description, form.Unlock.Era?.Id, form.Unlock.Scene?.Id, form.Unlock.Moment?.Id,
                    [.. form.Eras.Select(era => era.Id)], [.. form.Scenes.Select(scene => scene.Id)]))],
                [.. Abilities!.Select(ability => ability.Ability with { FormIds = [.. ability.Forms.Select(form => ids[form])] })]));
        }

        return await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(
            eras,
            version ?? current.Version,
            forms,
            [.. (Abilities ?? []).Select(ability => rawAbilityForms is null ? ability.Ability : ability.Ability with { FormIds = rawAbilityForms })]));
    }

    private static async Task<ProgressionResponse> Save(
        World w,
        IReadOnlyList<FormInput>? Forms = null,
        IReadOnlyList<(AbilityInput Ability, IReadOnlyList<string> Forms)>? Abilities = null,
        int? version = null)
    {
        var response = await Put(w, Forms, Abilities, version);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProgressionResponse>())!;
    }

    private static async Task Refused(World w, string key, params FormInput[] forms)
    {
        var response = await Put(w, forms);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await Errors(response), StringComparison.Ordinal);
    }
}
