using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A link-to-an-entry field may be limited to one type (036, ADR 0007 amendment): exactly that type, by id, or any type when
/// it has none. The API holds the limit everywhere a link is written or compared - an entry's save, a Lore filter, a change
/// to the field itself, a type's deletion and a backup - so a picker that offers the right entries is a convenience, never
/// the rule. Nothing is ever worked out from a name: a field called "Kingdom" knows nothing of a type called "Kingdoms".
/// </summary>
public sealed class EntityReferenceTargetTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character, Guid Kingdoms, Guid Runes);

    // ---------- The field ----------

    [Fact]
    public async Task A_link_field_keeps_its_allowed_type_until_it_is_changed_and_any_type_is_null()
    {
        var w = await NewWorld("ert-define");

        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        Assert.Equal(w.Kingdoms, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);

        // Sent back as it stands, it stays; changed, it moves; cleared, it is any type again.
        await UpdateField(w, w.Character, kingdom, "Kingdom", w.Kingdoms);
        Assert.Equal(w.Kingdoms, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);
        await UpdateField(w, w.Character, kingdom, "Kingdom", w.Runes);
        Assert.Equal(w.Runes, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);
        await UpdateField(w, w.Character, kingdom, "Kingdom", null);
        Assert.Null((await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);

        // A new link field with none says so: any type.
        var anything = await AddField(w, w.Character, "Anything", null);
        Assert.Null((await FieldOf(w, w.Character, anything)).TargetEntityTypeId);
    }

    [Fact]
    public async Task Another_universe_s_type_a_missing_type_and_a_type_on_another_kind_are_refused()
    {
        var w = await NewWorld("ert-refuse");
        var elsewhere = await NewWorld("ert-refuse-other");

        var foreign = await PostField(w, w.Character, new FieldDefinitionRequest(
            "Kingdom", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: elsewhere.Kingdoms));
        var missing = await PostField(w, w.Character, new FieldDefinitionRequest(
            "Kingdom", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: Guid.NewGuid()));

        // The same answer for both, so another universe's type cannot be told from no type at all.
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal(await ErrorOf(foreign, "targetEntityTypeId"), await ErrorOf(missing, "targetEntityTypeId"));

        var onNumber = await PostField(w, w.Character, new FieldDefinitionRequest(
            "Strength", EntityFieldKind.Number, false, null, null, null, TargetEntityTypeId: w.Kingdoms));
        Assert.Equal(HttpStatusCode.BadRequest, onNumber.StatusCode);
        Assert.Contains("link", await ErrorOf(onNumber, "targetEntityTypeId"), StringComparison.Ordinal);

        // And on an edit, the same rules.
        var kingdom = await AddField(w, w.Character, "Kingdom", null);
        var edit = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, kingdom), new FieldDefinitionRequest(
            "Kingdom", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: elsewhere.Runes));
        Assert.Equal(HttpStatusCode.BadRequest, edit.StatusCode);
        Assert.Null((await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);
    }

    [Fact]
    public async Task Names_mean_nothing_and_a_renamed_type_is_still_the_one_chosen()
    {
        var w = await NewWorld("ert-names");

        // A field called after a type is limited to nothing until its author says so.
        var kingdom = await AddField(w, w.Character, "Kingdom", null);
        var wields = await AddField(w, w.Character, "Wields Rune", null);
        Assert.Null((await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);
        Assert.Null((await FieldOf(w, w.Character, wields)).TargetEntityTypeId);

        await UpdateField(w, w.Character, kingdom, "Kingdom", w.Kingdoms);
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");

        (await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entity-types/{w.Kingdoms}",
            new EntityTypeRequest("Realms", null, null, null, null))).EnsureSuccessStatusCode();

        Assert.Equal(w.Kingdoms, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);
        var saved = await Entry(w, w.Character, "Mara", Link(kingdom, arkazia));
        Assert.Equal(arkazia, saved.Fields.Single(value => value.FieldDefinitionId == kingdom).ReferencedEntityId);
    }

    // ---------- Narrowing a field that holds links ----------

    [Fact]
    public async Task A_field_is_narrowed_only_when_every_link_it_holds_already_fits()
    {
        var w = await NewWorld("ert-narrow");
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var nanite = await Entry(w, w.Runes, "Nanite Rune");

        // No values: any change.
        var empty = await AddField(w, w.Character, "Empty", w.Kingdoms);
        await UpdateField(w, w.Character, empty, "Empty", w.Runes);

        // Every link a Kingdom: narrowing to Kingdoms is fine; then to Runes is refused.
        var kingdom = await AddField(w, w.Character, "Kingdom", null);
        await Entry(w, w.Character, "Mara", Link(kingdom, arkazia));
        await UpdateField(w, w.Character, kingdom, "Kingdom", w.Kingdoms);

        var toRunes = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, kingdom), Definition("Kingdom", w.Runes));
        Assert.Equal(HttpStatusCode.Conflict, toRunes.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TargetConflictCode, await CodeOf(toRunes));
        Assert.Equal(w.Kingdoms, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);

        // Widening to any type is always allowed.
        await UpdateField(w, w.Character, kingdom, "Kingdom", null);

        // A rune among the links, even one in the Trash, keeps it open.
        var mixed = await AddField(w, w.Character, "Allegiance", null);
        await Entry(w, w.Character, "Oren", Link(mixed, arkazia));
        await Entry(w, w.Character, "Tam", Link(mixed, nanite));
        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{nanite}")).EnsureSuccessStatusCode();

        var narrowing = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, mixed), Definition("Allegiance", w.Kingdoms));
        Assert.Equal(HttpStatusCode.Conflict, narrowing.StatusCode);
        var detail = await narrowing.Content.ReadAsStringAsync();
        Assert.DoesNotContain(nanite.ToString(), detail, StringComparison.OrdinalIgnoreCase);
        Assert.Null((await FieldOf(w, w.Character, mixed)).TargetEntityTypeId);
    }

    // ---------- Writing an entry ----------

    [Fact]
    public async Task An_entry_saves_only_links_its_fields_allow()
    {
        var w = await NewWorld("ert-write");
        var elsewhere = await NewWorld("ert-write-other");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        var anything = await AddField(w, w.Character, "Anything", null);

        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var rune = await Entry(w, w.Runes, "Magnetism Rune");

        // Two entries called the same thing: the id and its type decide, never the name.
        var runeArkazia = await Entry(w, w.Runes, "Arkazia");

        var good = await Entry(w, w.Character, "Mara", Link(kingdom, arkazia), Link(anything, rune));
        Assert.Equal(arkazia, good.Fields.Single(value => value.FieldDefinitionId == kingdom).ReferencedEntityId);

        foreach (var wrong in new[] { rune, runeArkazia })
        {
            var refused = await PostEntry(w, w.Character, "Oren", Link(kingdom, wrong));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("type it allows", await ErrorOf(refused, kingdom.ToString()), StringComparison.Ordinal);
        }

        // Unrestricted takes any type of this universe.
        (await PostEntry(w, w.Character, "Tam", Link(anything, arkazia))).EnsureSuccessStatusCode();

        // Another universe's entry is refused either way, and nothing about it comes back.
        var foreign = await Entry(elsewhere, elsewhere.Kingdoms, "Secret Realm");
        foreach (var field in new[] { kingdom, anything })
        {
            var refused = await PostEntry(w, w.Character, "Cai", Link(field, foreign));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            var body = await refused.Content.ReadAsStringAsync();
            Assert.DoesNotContain("Secret Realm", body, StringComparison.Ordinal);
            Assert.DoesNotContain(foreign.ToString(), body, StringComparison.OrdinalIgnoreCase);
        }

        // The same answer for a missing entry as for another universe's.
        var missing = await PostEntry(w, w.Character, "Pip", Link(kingdom, Guid.NewGuid()));
        var wrongUniverse = await PostEntry(w, w.Character, "Pip", Link(kingdom, foreign));
        Assert.Equal(await ErrorOf(missing, kingdom.ToString()), await ErrorOf(wrongUniverse, kingdom.ToString()));
    }

    [Fact]
    public async Task A_kept_link_to_an_entry_in_the_Trash_survives_an_unrelated_save()
    {
        var w = await NewWorld("ert-trash");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var mara = await Entry(w, w.Character, "Mara", Link(kingdom, arkazia));

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{arkazia}")).EnsureSuccessStatusCode();

        var renamed = await w.Client.PutVersionedAsync(
            $"/api/universes/{w.U}/entities/{mara.Id}",
            new EntityRequest(w.Character, "Mara the Elder", null, CanonStatus.Canon, null, null, [Link(kingdom, arkazia)]));
        Assert.True(renamed.IsSuccessStatusCode, await renamed.Content.ReadAsStringAsync());
        var saved = (await renamed.Content.ReadFromJsonAsync<EntityDetail>())!;
        Assert.Equal(arkazia, saved.Fields.Single(value => value.FieldDefinitionId == kingdom).ReferencedEntityId);
    }

    [Fact]
    public async Task Every_link_on_an_entry_is_checked_in_one_read()
    {
        var w = await NewWorld("ert-batch");
        var fields = new[]
        {
            await AddField(w, w.Character, "First", w.Kingdoms),
            await AddField(w, w.Character, "Second", w.Kingdoms),
            await AddField(w, w.Character, "Third", null),
        };
        var kingdoms = new[] { await Entry(w, w.Kingdoms, "One"), await Entry(w, w.Kingdoms, "Two"), await Entry(w, w.Kingdoms, "Three") };

        // The reads of entries that carry the linked ids: one for a single link, still one for three - never one per field.
        static bool ReadsEntries(string sql) =>
            sql.StartsWith("SELECT", StringComparison.Ordinal) && sql.Contains("FROM \"Entities\"", StringComparison.Ordinal);

        int one;
        using (var counter = new CommandCounter([kingdoms[0]], ReadsEntries))
        {
            await Entry(w, w.Character, "Solo", Link(fields[0], kingdoms[0]));
            one = counter.Count;
        }

        int three;
        using (var counter = new CommandCounter(kingdoms, ReadsEntries))
        {
            await Entry(w, w.Character, "Trio", Link(fields[0], kingdoms[0]), Link(fields[1], kingdoms[1]), Link(fields[2], kingdoms[2]));
            three = counter.Count;
        }

        Assert.Equal(1, one);
        Assert.Equal(1, three);
    }

    // ---------- Deleting a type ----------

    [Fact]
    public async Task A_type_a_field_is_limited_to_cannot_be_deleted_until_the_field_is_changed()
    {
        var w = await NewWorld("ert-delete");
        var provinces = await NewType(w, "Provinces");
        var province = await AddField(w, w.Character, "Province", provinces);

        var refused = await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-types/{provinces}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TypeTargetedCode, await CodeOf(refused));
        Assert.Contains("\"Province\" on Character", await DetailOf(refused), StringComparison.Ordinal);

        await UpdateField(w, w.Character, province, "Province", null);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-types/{provinces}")).StatusCode);

        // A type whose own field links to its own kind goes with that field.
        var houses = await NewType(w, "Houses");
        await AddField(w, houses, "Overlord", houses);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-types/{houses}")).StatusCode);
    }

    [Fact]
    public async Task A_universe_with_limited_fields_is_deleted_whole()
    {
        var w = await NewWorld("ert-universe");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        await AddField(w, w.Kingdoms, "Rival", w.Kingdoms);
        await Entry(w, w.Character, "Mara", Link(kingdom, await Entry(w, w.Kingdoms, "Arkazia")));

        (await w.Client.PostAsync($"/api/universes/{w.U}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync($"/api/universes/{w.U}")).StatusCode);
    }

    // ---------- Lore filters ----------

    [Fact]
    public async Task A_filter_on_a_limited_field_compares_only_with_an_entry_of_its_type()
    {
        var w = await NewWorld("ert-filter");
        var elsewhere = await NewWorld("ert-filter-other");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        var anything = await AddField(w, w.Character, "Anything", null);
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var zandres = await Entry(w, w.Kingdoms, "Zandres");
        var rune = await Entry(w, w.Runes, "Nanite Rune");
        await Entry(w, w.Character, "Mara", Link(kingdom, arkazia), Link(anything, rune));
        await Entry(w, w.Character, "Oren", Link(kingdom, zandres));

        Assert.Equal(["Mara"], await Filtered(w, $"{kingdom}:is:{arkazia}"));

        var wrongType = await w.Client.GetAsync(LoreRoute(w, $"{kingdom}:is:{rune}"));
        Assert.Equal(HttpStatusCode.BadRequest, wrongType.StatusCode);
        Assert.Contains("type this field allows", await wrongType.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Any type where the field allows any.
        Assert.Equal(["Mara"], await Filtered(w, $"{anything}:is:{rune}"));

        // Another universe's entry: refused, the same way as before.
        var foreign = await Entry(elsewhere, elsewhere.Kingdoms, "Secret Realm");
        var refused = await w.Client.GetAsync(LoreRoute(w, $"{kingdom}:is:{foreign}"));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.DoesNotContain("Secret Realm", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // One read resolves every entry the filters name, however many there are.
        var (single, _) = await CommandCounter.CountAsync([arkazia], () => Filtered(w, $"{kingdom}:is:{arkazia}"));
        var (several, _) = await CommandCounter.CountAsync(
            [arkazia, zandres, rune],
            () => Filtered(w, $"{kingdom}:is:{arkazia}", $"{kingdom}:isNot:{zandres}", $"{anything}:is:{rune}"));
        Assert.Equal(single, several);
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_the_allowed_type_and_a_restore_points_it_at_the_restored_type()
    {
        var w = await NewWorld("ert-backup");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        var anything = await AddField(w, w.Character, "Anything", null);
        await Entry(w, w.Character, "Mara", Link(kingdom, await Entry(w, w.Kingdoms, "Arkazia")));

        var archive = await RawArchive(w.Client, w.U);
        var backup = BackupOf(archive);
        Assert.Equal(25, backup.FormatVersion);
        var carried = backup.Payload.EntityTypes.Single(type => type.Id == w.Character).Fields;
        Assert.Equal(w.Kingdoms, carried.Single(field => field.Id == kingdom).TargetEntityTypeId);
        Assert.Null(carried.Single(field => field.Id == anything).TargetEntityTypeId);

        var restored = await RestoreArchive(w.Client, archive, "ert-backup restored");
        var types = await TypesOf(w.Client, restored.Id);
        var restoredKingdoms = types.Single(type => type.Name == "Kingdoms").Id;
        var restoredField = types.Single(type => type.Name == "Character").Fields.Single(field => field.Name == "Kingdom");

        Assert.NotEqual(w.Kingdoms, restoredKingdoms);
        Assert.Equal(restoredKingdoms, restoredField.TargetEntityTypeId);
        Assert.Null(types.Single(type => type.Name == "Character").Fields.Single(field => field.Name == "Anything").TargetEntityTypeId);

        // And the restored field holds its limit: a rune is refused there too.
        var restoredWorld = w with { U = restored.Id, Character = types.Single(type => type.Name == "Character").Id };
        var rune = await Entry(restoredWorld, types.Single(type => type.Name == "Runes").Id, "Nanite Rune");
        Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(restoredWorld, restoredWorld.Character, "Oren", Link(restoredField.Id, rune))).StatusCode);

        // A second export of the restored world says the same.
        Assert.Equal(25, BackupOf(await RawArchive(w.Client, restored.Id)).FormatVersion);
    }

    [Fact]
    public async Task A_version_19_backup_restores_every_link_field_open_to_any_type()
    {
        var w = await NewWorld("ert-v19");
        await AddField(w, w.Character, "Kingdom", w.Kingdoms);

        var restored = await RestoreArchive(w.Client, Downgrade(await RawArchive(w.Client, w.U), 19), "ert-v19 restored");
        var field = (await TypesOf(w.Client, restored.Id)).Single(type => type.Name == "Character").Fields.Single(one => one.Name == "Kingdom");
        Assert.Null(field.TargetEntityTypeId);
    }

    [Fact]
    public async Task A_backup_whose_limits_do_not_hold_is_refused()
    {
        var w = await NewWorld("ert-malformed");
        var kingdom = await AddField(w, w.Character, "Kingdom", w.Kingdoms);
        var strength = await AddField(w, w.Character, "Strength", null, EntityFieldKind.Number);
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var rune = await Entry(w, w.Runes, "Nanite Rune");
        await Entry(w, w.Character, "Mara", Link(kingdom, arkazia));
        var archive = await RawArchive(w.Client, w.U);

        JsonObject FieldNode(JsonObject root, Guid fieldId) =>
            Payload(root)["entityTypes"]!.AsArray()
                .SelectMany(type => type!["fields"]!.AsArray())
                .Single(field => Guid.Parse(field!["id"]!.GetValue<string>()) == fieldId)!.AsObject();

        var unknownType = Rewrite(archive, root => FieldNode(root, kingdom)["targetEntityTypeId"] = Guid.NewGuid().ToString());
        var onNumber = Rewrite(archive, root => FieldNode(root, strength)["targetEntityTypeId"] = w.Kingdoms.ToString());
        var wrongValue = Rewrite(archive, root =>
        {
            foreach (var value in Payload(root)["entities"]!.AsArray().SelectMany(entity => entity!["fieldValues"]!.AsArray()))
            {
                if (Guid.Parse(value!["fieldDefinitionId"]!.GetValue<string>()) == kingdom)
                {
                    value["referencedEntityId"] = rune.ToString();
                }
            }
        });
        var tooOld = Rewrite(archive, root => root["formatVersion"] = 19);

        foreach (var (file, word) in new[]
        {
            (unknownType, "does not hold"),
            (onNumber, "does not link"),
            (wrongValue, "does not allow"),
            (tooOld, "cannot say"),
        })
        {
            var refusal = await Refused(await Validate(w.Client, file));
            Assert.Contains(refusal.Issues, issue => issue.Message.Contains(word, StringComparison.Ordinal));
        }
    }

    // ---------- Steps ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var types = await TypesOf(client, universe.Id);
        var w = new World(client, universe.Id, types.Single(type => type.Name == "Character").Id, Guid.Empty, Guid.Empty);
        return w with { Kingdoms = await NewType(w, "Kingdoms"), Runes = await NewType(w, "Runes") };
    }

    private static async Task<Guid> NewType(World w, string name) =>
        (await PostJson<EntityTypeResponse>(
            w.Client, $"/api/universes/{w.U}/entity-types", new EntityTypeRequest(name, null, null, null, null))).Id;

    private static async Task<List<EntityTypeResponse>> TypesOf(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<FieldDefinitionResponse> FieldOf(World w, Guid typeId, Guid fieldId) =>
        (await TypesOf(w.Client, w.U)).Single(type => type.Id == typeId).Fields.Single(field => field.Id == fieldId);

    private static string FieldRoute(World w, Guid typeId, Guid fieldId) =>
        $"/api/universes/{w.U}/entity-types/{typeId}/fields/{fieldId}";

    private static FieldDefinitionRequest Definition(string name, Guid? target, EntityFieldKind kind = EntityFieldKind.EntityReference) =>
        new(name, kind, false, null, null, null, TargetEntityTypeId: target);

    private static Task<HttpResponseMessage> PostField(World w, Guid typeId, FieldDefinitionRequest request) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entity-types/{typeId}/fields", request);

    private static async Task<Guid> AddField(
        World w,
        Guid typeId,
        string name,
        Guid? target,
        EntityFieldKind kind = EntityFieldKind.EntityReference)
    {
        var response = await PostField(w, typeId, Definition(name, target, kind));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task UpdateField(World w, Guid typeId, Guid fieldId, string name, Guid? target)
    {
        var response = await w.Client.PutAsJsonAsync(FieldRoute(w, typeId, fieldId), Definition(name, target));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static FieldValueInput Link(Guid fieldId, Guid entityId) => new(fieldId, null, null, null, null, null, entityId);

    private static Task<HttpResponseMessage> PostEntry(World w, Guid typeId, string name, params FieldValueInput[] fields) =>
        w.Client.PostAsJsonAsync(
            $"/api/universes/{w.U}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, fields));

    private static async Task<Guid> Entry(World w, Guid typeId, string name) => (await Entry(w, typeId, name, [])).Id;

    private static async Task<EntityDetail> Entry(World w, Guid typeId, string name, params FieldValueInput[] fields)
    {
        var response = await PostEntry(w, typeId, name, fields);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static string LoreRoute(World w, params string[] filters) =>
        $"/api/universes/{w.U}/entities?entityTypeId={w.Character}&pageSize=50"
            + string.Concat(filters.Select(filter => $"&field={Uri.EscapeDataString(filter)}"));

    private static async Task<List<string>> Filtered(World w, params string[] filters)
    {
        var response = await w.Client.GetAsync(LoreRoute(w, filters));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return [.. (await response.Content.ReadFromJsonAsync<EntityPage>())!.Items.Select(item => item.Name).Order(StringComparer.Ordinal)];
    }

    private static async Task<string> ErrorOf(HttpResponseMessage response, string key)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("errors").GetProperty(key)[0].GetString()!;
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private static async Task<string?> DetailOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("detail", out var detail) ? detail.GetString() : null;
    }
}
