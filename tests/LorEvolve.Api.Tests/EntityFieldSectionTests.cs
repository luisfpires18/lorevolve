using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Lore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Optional sections for a type's fields (Issue #26). A layout is presentation only: saving one never changes a field's id,
/// values, version, order or required check, and has a version of its own, so a layout save and a field edit never make each
/// other stale. A type with no sections reads as it always did. Backups carry sections from format 31; older files restore
/// ungrouped.
/// </summary>
public sealed class EntityFieldSectionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character);

    // ---------- Layout ----------

    [Fact]
    public async Task A_type_with_no_sections_reads_as_it_did()
    {
        var w = await NewWorld("efs-none");
        await AddField(w, w.Character, "Title");

        var type = await TypeOf(w, w.Character);
        Assert.Empty(type.FieldSections!);
        Assert.Equal(1, type.FieldLayoutVersion);
        Assert.All(type.Fields, field => Assert.Null(field.SectionId));
    }

    [Fact]
    public async Task Sections_are_created_ordered_renamed_and_fields_move_between_them_keeping_everything_else()
    {
        var w = await NewWorld("efs-layout");
        var title = await AddField(w, w.Character, "Title");
        var strength = await AddField(w, w.Character, "Strength", EntityFieldKind.Number);
        var weapon = await AddField(w, w.Character, "Weapon");
        var mara = await Entry(w, "Mara", Text(title, "Queen"), Text(weapon, "Spear"));
        var before = await TypeOf(w, w.Character);

        var saved = await SaveLayout(w, w.Character, before.FieldLayoutVersion,
            Section(null, "Combat", [strength, weapon], collapsed: true),
            Section(null, "Story", []));

        Assert.Equal(["Combat", "Story"], saved.FieldSections!.Select(section => section.Name));
        Assert.Equal([1, 2], saved.FieldSections!.Select(section => section.DisplayOrder));
        Assert.Equal([true, false], saved.FieldSections!.Select(section => section.StartsCollapsed));
        var combat = saved.FieldSections![0].Id;
        var story = saved.FieldSections![1].Id;
        Assert.Equal([null, combat, combat], saved.Fields.Select(field => field.SectionId));
        Assert.Equal(2, saved.FieldLayoutVersion);

        // Nothing about a field changed: id, order, version, values.
        Assert.Equal(before.Fields.Select(field => (field.Id, field.DisplayOrder, field.Version)),
            saved.Fields.Select(field => (field.Id, field.DisplayOrder, field.Version)));
        Assert.Equal(["Queen", "Spear"], (await Detail(w, mara)).Fields.Select(value => value.Text));

        // Reordered, renamed, and Weapon moved: the same section ids, the same fields.
        var moved = await SaveLayout(w, w.Character, saved.FieldLayoutVersion,
            Section(story, "Story and lore", [weapon]),
            Section(combat, "Combat", [strength], collapsed: true));

        Assert.Equal([(story, "Story and lore", 1), (combat, "Combat", 2)],
            moved.FieldSections!.Select(section => (section.Id, section.Name, section.DisplayOrder)));
        // The fields follow the layout: ungrouped Title, then Story's Weapon, then Combat's Strength.
        Assert.Equal([(title, (Guid?)null), (weapon, story), (strength, combat)], moved.Fields.Select(field => (field.Id, field.SectionId)));
        Assert.Equal(["Queen", "Spear"], (await Detail(w, mara)).Fields.Select(value => value.Text));
    }

    [Fact]
    public async Task Removing_a_section_returns_its_fields_to_the_ungrouped_list()
    {
        var w = await NewWorld("efs-remove");
        var title = await AddField(w, w.Character, "Title");
        var strength = await AddField(w, w.Character, "Strength", EntityFieldKind.Number);
        var saved = await SaveLayout(w, w.Character, 1, Section(null, "Combat", [title, strength]), Section(null, "Story", []));

        var removed = await SaveLayout(w, w.Character, saved.FieldLayoutVersion, Section(saved.FieldSections![1].Id, "Story", []));

        Assert.Equal(["Story"], removed.FieldSections!.Select(section => section.Name));
        Assert.All(removed.Fields, field => Assert.Null(field.SectionId));

        var none = await SaveLayout(w, w.Character, removed.FieldLayoutVersion);
        Assert.Empty(none.FieldSections!);
    }

    [Fact]
    public async Task An_unchanged_save_keeps_the_version_and_a_stale_or_missing_one_is_refused()
    {
        var w = await NewWorld("efs-stale");
        var title = await AddField(w, w.Character, "Title");
        var saved = await SaveLayout(w, w.Character, 1, Section(null, "Identity", [title]));
        var same = await SaveLayout(w, w.Character, saved.FieldLayoutVersion, Section(saved.FieldSections![0].Id, "Identity", [title]));
        Assert.Equal(saved.FieldLayoutVersion, same.FieldLayoutVersion);

        foreach (int? version in new int?[] { 1, null })
        {
            var refused = await PutLayout(w, w.Character, new FieldLayoutRequest([], version));
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal(EntityTypeEndpoints.FieldLayoutChangedCode, await CodeOf(refused));
        }

        Assert.Single((await TypeOf(w, w.Character)).FieldSections!);
    }

    [Fact]
    public async Task A_layout_save_and_a_field_edit_never_make_each_other_stale()
    {
        var w = await NewWorld("efs-separate");
        var title = await AddField(w, w.Character, "Title");
        var opened = await FieldOf(w, title);

        // A layout saved after the field drawer opened: the field's version is where it was, and its edit goes through.
        var saved = await SaveLayout(w, w.Character, 1, Section(null, "Identity", [title]));
        Assert.Equal(opened.Version, (await FieldOf(w, title)).Version);
        var edit = await w.Client.PutFieldAsync(w.U, w.Character, title,
            new FieldDefinitionRequest("Rank", EntityFieldKind.ShortText, false, opened.DisplayOrder, null, null, ExpectedVersion: opened.Version));
        Assert.True(edit.IsSuccessStatusCode, await edit.Content.ReadAsStringAsync());

        // The edit kept the field in its section, and the layout opened before the edit still saves.
        var after = await TypeOf(w, w.Character);
        Assert.Equal(saved.FieldSections![0].Id, after.Fields.Single().SectionId);
        Assert.Equal(saved.FieldLayoutVersion, after.FieldLayoutVersion);
        await SaveLayout(w, w.Character, saved.FieldLayoutVersion, Section(saved.FieldSections[0].Id, "Who", [title]));
    }

    [Fact]
    public async Task Fields_and_sections_of_another_type_and_malformed_layouts_are_refused()
    {
        var w = await NewWorld("efs-refused");
        var title = await AddField(w, w.Character, "Title");
        var kingdoms = (await PostJson<EntityTypeResponse>(w.Client, $"/api/universes/{w.U}/entity-types",
            new EntityTypeRequest("Kingdoms", null, null, null, null))).Id;
        var ruler = await AddField(w, kingdoms, "Ruler");
        var theirs = (await SaveLayout(w, kingdoms, 1, Section(null, "Court", [ruler]))).FieldSections![0].Id;

        var cases = new (FieldLayoutRequest Request, string Key)[]
        {
            (Layout(1, Section(null, "Combat", [ruler])), "sections[0].fieldIds"),
            (Layout(1, Section(null, "Combat", [Guid.NewGuid()])), "sections[0].fieldIds"),
            (Layout(1, Section(theirs, "Court", [])), "sections[0].id"),
            (Layout(1, Section(null, "Combat", [title]), Section(null, "Story", [title])), "sections[1].fieldIds"),
            (Layout(1, Section(null, "Combat", [title])) with { UngroupedFieldIds = [title] }, "ungroupedFieldIds"),
            (Layout(1) with { UngroupedFieldIds = [ruler] }, "ungroupedFieldIds"),
            (Layout(1) with { UngroupedFieldIds = [title, title] }, "ungroupedFieldIds"),
            (Layout(1, Section(null, "Combat", []), Section(null, " combat ", [])), "sections[1].name"),
            (Layout(1, Section(null, "  ", [])), "sections[0].name"),
            (Layout(1, Section(null, new string('x', LoreLimits.NameMaxLength + 1), [])), "sections[0].name"),
            (new FieldLayoutRequest(null, 1), "sections"),
            (Layout(1, [.. Enumerable.Range(0, LoreLimits.MaxFieldSections + 1).Select(n => Section(null, $"S{n}", []))]), "sections"),
        };

        foreach (var (request, key) in cases)
        {
            var refused = await PutLayout(w, w.Character, request);
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            using var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync());
            Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty(key, out _), $"{key}: {problem.RootElement}");
        }

        // Nothing was written, here or on the other type.
        var character = await TypeOf(w, w.Character);
        Assert.Empty(character.FieldSections!);
        Assert.Equal(1, character.FieldLayoutVersion);
        Assert.Equal(theirs, (await TypeOf(w, kingdoms)).Fields.Single().SectionId);
    }

    [Fact]
    public async Task A_layout_is_the_universes_editors_alone()
    {
        var w = await NewWorld("efs-owner");
        var stranger = await SignedIn(_factory, "efs-stranger");
        var response = await stranger.PutAsJsonAsync($"/api/universes/{w.U}/entity-types/{w.Character}/field-layout", Layout(1));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_archived_field_keeps_its_section_and_returns_to_it_when_restored()
    {
        var w = await NewWorld("efs-archive");
        var title = await AddField(w, w.Character, "Title");
        var strength = await AddField(w, w.Character, "Strength", EntityFieldKind.Number);
        var combat = (await SaveLayout(w, w.Character, 1, Section(null, "Combat", [strength]))).FieldSections![0].Id;

        (await w.Client.PostAsync($"{FieldRoute(w, strength)}/archive", null)).EnsureSuccessStatusCode();
        var archived = await TypeOf(w, w.Character);
        Assert.Equal(combat, archived.ArchivedFields!.Single().SectionId);

        // A layout saved while it is archived, listing it where it was, keeps it there.
        var saved = await SaveLayout(w, w.Character, archived.FieldLayoutVersion, Section(combat, "Combat", [strength, title]));

        (await w.Client.PostAsJsonAsync($"{FieldRoute(w, strength)}/restore", new FieldRestoreRequest())).EnsureSuccessStatusCode();
        var restored = await TypeOf(w, w.Character);
        Assert.Equal([combat, combat], restored.Fields.Select(field => field.SectionId));
        Assert.Equal(saved.FieldLayoutVersion, restored.FieldLayoutVersion);

        // Removing its section while it is archived ungroups it as well.
        (await w.Client.PostAsync($"{FieldRoute(w, strength)}/archive", null)).EnsureSuccessStatusCode();
        await SaveLayout(w, w.Character, saved.FieldLayoutVersion);
        Assert.Null((await TypeOf(w, w.Character)).ArchivedFields!.Single().SectionId);
    }

    [Fact]
    public async Task A_required_field_in_a_collapsed_section_is_still_required()
    {
        var w = await NewWorld("efs-required");
        var title = await AddField(w, w.Character, "Title", required: true);
        await SaveLayout(w, w.Character, 1, Section(null, "Identity", [title], collapsed: true));

        var refused = await PostEntry(w, "Mara");
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty(title.ToString(), out _));
        }

        var accepted = await PostEntry(w, "Mara", Text(title, "Queen"));
        Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_type_with_sections_is_deleted_with_them()
    {
        var w = await NewWorld("efs-delete");
        var runes = (await PostJson<EntityTypeResponse>(w.Client, $"/api/universes/{w.U}/entity-types",
            new EntityTypeRequest("Runes", null, null, null, null))).Id;
        var power = await AddField(w, runes, "Power");
        await SaveLayout(w, runes, 1, Section(null, "Magic", [power]));

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-types/{runes}")).EnsureSuccessStatusCode();
        Assert.DoesNotContain(await TypesOf(w), type => type.Id == runes);

        // And a universe whose types still have sections goes in its one cascade.
        var title = await AddField(w, w.Character, "Title");
        await SaveLayout(w, w.Character, 1, Section(null, "Identity", [title]));
        (await w.Client.PostAsync($"/api/universes/{w.U}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync($"/api/universes/{w.U}")).StatusCode);
    }

    [Fact]
    public async Task Fields_are_reordered_within_and_across_sections_and_an_edit_keeps_its_place()
    {
        var w = await NewWorld("efs-order");
        var title = await AddField(w, w.Character, "Title");
        var strength = await AddField(w, w.Character, "Strength", EntityFieldKind.Number);
        var weapon = await AddField(w, w.Character, "Weapon");
        var mara = await Entry(w, "Mara", Text(title, "Queen"), Text(weapon, "Spear"));
        var before = await TypeOf(w, w.Character);
        var opened = before.Fields.Single(field => field.Id == title);

        // Within the ungrouped list: Weapon before Title; Strength alone in Combat.
        var saved = await SaveLayout(w, w.Character, 1, [weapon, title], Section(null, "Combat", [strength]));
        Assert.Equal([weapon, title, strength], saved.Fields.Select(field => field.Id));
        Assert.Equal([1, 2, 3], saved.Fields.Select(field => field.DisplayOrder));
        Assert.Equal(2, saved.FieldLayoutVersion);

        // Across sections: Title into Combat, after Strength.
        var combat = saved.FieldSections![0].Id;
        var moved = await SaveLayout(w, w.Character, saved.FieldLayoutVersion, [weapon], Section(combat, "Combat", [strength, title]));
        Assert.Equal([(weapon, (Guid?)null), (strength, combat), (title, combat)], moved.Fields.Select(field => (field.Id, field.SectionId)));

        // Nothing about a field moved but its place: ids, versions, values.
        Assert.Equal(before.Fields.Select(field => (field.Id, field.Version)).OrderBy(pair => pair.Id),
            moved.Fields.Select(field => (field.Id, field.Version)).OrderBy(pair => pair.Id));
        Assert.Equal(["Queen", "Spear"], (await Detail(w, mara)).Fields.Select(value => value.Text).Order());

        // A drawer opened before the reorder sends the old place; the edit keeps the new one.
        var edit = await w.Client.PutFieldAsync(w.U, w.Character, title,
            new FieldDefinitionRequest("Rank", EntityFieldKind.ShortText, false, opened.DisplayOrder, null, null, ExpectedVersion: opened.Version));
        Assert.True(edit.IsSuccessStatusCode, await edit.Content.ReadAsStringAsync());
        Assert.Equal([weapon, strength, title], (await TypeOf(w, w.Character)).Fields.Select(field => field.Id));

        // A field added since the layout was read is not listed by it, and keeps its place at the end of the ungrouped ones.
        var oath = await AddField(w, w.Character, "Oath");
        var kept = await SaveLayout(w, w.Character, moved.FieldLayoutVersion, [weapon], Section(combat, "Combat", [title, strength]));
        Assert.Equal([weapon, oath, title, strength], kept.Fields.Select(field => field.Id));
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_sections_and_assignments_and_restores_them_under_new_ids()
    {
        var w = await NewWorld("efs-backup");
        var title = await AddField(w, w.Character, "Title");
        var strength = await AddField(w, w.Character, "Strength", EntityFieldKind.Number);
        var weapon = await AddField(w, w.Character, "Weapon");
        await SaveLayout(w, w.Character, 1, Section(null, "Story", [title]), Section(null, "Combat", [strength, weapon], collapsed: true));
        (await w.Client.PostAsync($"{FieldRoute(w, weapon)}/archive", null)).EnsureSuccessStatusCode();

        var archive = await RawArchive(w.Client, w.U);
        var file = BackupOf(archive);
        Assert.Equal(LorEvolve.Api.Features.Export.UniverseBackup.CurrentVersion, file.FormatVersion);
        var character = file.Payload.EntityTypes.Single(type => type.Name == "Character");
        Assert.Equal(["Story", "Combat"], character.FieldSections!.Select(section => section.Name));

        var restored = await RestoreArchive(w.Client, archive, "Sections restored");
        var copy = (await TypesOf(w.Client, restored.Id)).Single(type => type.Name == "Character");

        Assert.Equal([("Story", 1, false), ("Combat", 2, true)],
            copy.FieldSections!.Select(section => (section.Name, section.DisplayOrder, section.StartsCollapsed)));
        Assert.DoesNotContain(copy.FieldSections!, section => character.FieldSections!.Any(source => source.Id == section.Id));

        var story = copy.FieldSections![0].Id;
        var combat = copy.FieldSections![1].Id;
        Assert.Equal([("Title", story), ("Strength", combat)], copy.Fields.Select(field => (field.Name, field.SectionId)));
        Assert.Equal(("Weapon", combat), (copy.ArchivedFields!.Single().Name, copy.ArchivedFields!.Single().SectionId));
        Assert.Equal(1, copy.FieldLayoutVersion);
    }

    [Fact]
    public async Task A_version_30_backup_restores_every_field_ungrouped()
    {
        var w = await NewWorld("efs-v30");
        var title = await AddField(w, w.Character, "Title");
        var weapon = await AddField(w, w.Character, "Weapon");
        await SaveLayout(w, w.Character, 1, Section(null, "Combat", [weapon]));
        (await w.Client.PostAsync($"{FieldRoute(w, weapon)}/archive", null)).EnsureSuccessStatusCode();

        var file = Downgrade(await RawArchive(w.Client, w.U), 30);
        var validated = await Validated(w.Client, file);
        Assert.Equal(30, validated.Preview.FormatVersion);

        var restored = await Restored(w.Client, validated.Token, "Sections v30");
        var copy = (await TypesOf(w.Client, restored.Id)).Single(type => type.Name == "Character");
        Assert.Empty(copy.FieldSections!);
        Assert.Null(copy.Fields.Single(field => field.Name == "Title").SectionId);

        // Still archived, as version 25 onward says; only the section is gone.
        Assert.Null(copy.ArchivedFields!.Single(field => field.Name == "Weapon").SectionId);
        Assert.NotEqual(Guid.Empty, title);
    }

    [Fact]
    public async Task A_backup_whose_field_names_another_types_section_is_refused()
    {
        var w = await NewWorld("efs-forged");
        var title = await AddField(w, w.Character, "Title");
        var kingdoms = (await PostJson<EntityTypeResponse>(w.Client, $"/api/universes/{w.U}/entity-types",
            new EntityTypeRequest("Kingdoms", null, null, null, null))).Id;
        var ruler = await AddField(w, kingdoms, "Ruler");
        await SaveLayout(w, kingdoms, 1, Section(null, "Court", [ruler]));

        var file = Rewrite(await RawArchive(w.Client, w.U), root =>
        {
            var types = root["payload"]!["entityTypes"]!.AsArray();
            var court = types.Single(type => (string?)type!["name"] == "Kingdoms")!["fieldSections"]![0]!["id"]!.GetValue<Guid>();
            var character = types.Single(type => (string?)type!["name"] == "Character")!;
            character["fields"]!.AsArray().Single(field => (Guid)field!["id"]! == title)!["sectionId"] = court;
        });

        var refusal = await Refused(await Validate(w.Client, file));
        Assert.Contains(refusal.Issues, issue => issue.Message.Contains("in a field section its type does not hold", StringComparison.Ordinal));
    }

    // ---------- Helpers ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe.Id}/entity-types"))!;
        return new World(client, universe.Id, types.Single(type => type.Name == "Character").Id);
    }

    private static FieldSectionRequest Section(Guid? id, string name, Guid[] fields, bool collapsed = false) =>
        new(id, name, collapsed, fields);

    private static FieldLayoutRequest Layout(int version, params FieldSectionRequest[] sections) => new(sections, version);

    private static Task<HttpResponseMessage> PutLayout(World w, Guid typeId, FieldLayoutRequest request) =>
        w.Client.PutAsJsonAsync($"/api/universes/{w.U}/entity-types/{typeId}/field-layout", request);

    private static Task<EntityTypeResponse> SaveLayout(World w, Guid typeId, int version, params FieldSectionRequest[] sections) =>
        SaveLayout(w, typeId, version, null, sections);

    private static async Task<EntityTypeResponse> SaveLayout(
        World w, Guid typeId, int version, Guid[]? ungrouped, params FieldSectionRequest[] sections)
    {
        var response = await PutLayout(w, typeId, Layout(version, sections) with { UngroupedFieldIds = ungrouped });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<List<EntityTypeResponse>> TypesOf(World w) => await TypesOf(w.Client, w.U);

    private static async Task<List<EntityTypeResponse>> TypesOf(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<EntityTypeResponse> TypeOf(World w, Guid typeId) => (await TypesOf(w)).Single(type => type.Id == typeId);

    private static async Task<FieldDefinitionResponse> FieldOf(World w, Guid fieldId) =>
        (await TypeOf(w, w.Character)).Fields.Single(field => field.Id == fieldId);

    private static string FieldRoute(World w, Guid fieldId) =>
        $"/api/universes/{w.U}/entity-types/{w.Character}/fields/{fieldId}";

    private static async Task<Guid> AddField(World w, Guid typeId, string name, EntityFieldKind kind = EntityFieldKind.ShortText, bool required = false)
    {
        var type = await PostJson<EntityTypeResponse>(w.Client, $"/api/universes/{w.U}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, required, null, null, null));
        return type.Fields.Single(field => field.Name == name).Id;
    }

    private static FieldValueInput Text(Guid fieldId, string text) => new(fieldId, text, null, null, null, null, null);

    private static Task<HttpResponseMessage> PostEntry(World w, string name, params FieldValueInput[] fields) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entities",
            new EntityRequest(w.Character, name, null, CanonStatus.Canon, null, null, fields));

    private static async Task<Guid> Entry(World w, string name, params FieldValueInput[] fields)
    {
        var response = await PostEntry(w, name, fields);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }

    private static async Task<EntityDetail> Detail(World w, Guid entityId) =>
        (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{entityId}"))!;

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }
}
