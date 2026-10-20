using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Suggestions;
using Lorex.Api.Features.Universes;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Editing, archiving, restoring and deleting a Lore type's fields (Issue #39). An edit keeps the field's id and every value;
/// archiving hides a field and keeps all of it, and no write of an entry - a save, a restored version, an accepted suggestion
/// - can drop what it holds; restoring is checked first and never relaxes anything silently; deleting is for an empty field
/// only. Every protection that counts links still counts an archived field's.
/// </summary>
public sealed class EntityFieldLifecycleTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character, Guid Kingdoms, Guid Runes);

    // ---------- Editing ----------

    [Fact]
    public async Task Renaming_and_limiting_Kingdom_to_Kingdoms_keeps_its_id_and_its_values()
    {
        var w = await NewWorld("efl-kingdom");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var rune = await Entry(w, w.Runes, "Nanite Rune");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference, required: true));
        var mara = await Entry(w, w.Character, "Mara", Link(kingdom, erandor));

        // Any Lore type, until the author says otherwise.
        Assert.Null((await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId);

        await UpdateField(w, w.Character, kingdom, Definition("Realm", EntityFieldKind.EntityReference, required: true, target: w.Kingdoms));

        var field = await FieldOf(w, w.Character, kingdom);
        Assert.Equal(("Realm", w.Kingdoms, true, 1), (field.Name, field.TargetEntityTypeId, field.IsRequired, field.EntryCount));
        Assert.Equal(erandor, (await Detail(w, mara.Id)).Fields.Single(value => value.FieldDefinitionId == kingdom).ReferencedEntityId);

        // The limit holds from now on: a rune is refused, a kingdom is fine.
        Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(w, w.Character, "Oren", Link(kingdom, rune))).StatusCode);
        await Entry(w, w.Character, "Tam", Link(kingdom, erandor));
    }

    [Fact]
    public async Task A_field_limited_to_a_group_keeps_its_links_and_an_incompatible_limit_is_refused()
    {
        var w = await NewWorld("efl-group");
        var realms = await NewGroup(w, w.Kingdoms, "Realms");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var rune = await Entry(w, w.Runes, "Nanite Rune");
        var ally = await AddField(w, w.Character, Definition("Ally", EntityFieldKind.EntityReference));
        await Entry(w, w.Character, "Mara", Link(ally, erandor));

        await UpdateField(w, w.Character, ally, Definition("Ally", EntityFieldKind.EntityReference, group: realms));
        Assert.Equal(realms, (await FieldOf(w, w.Character, ally)).TargetGroupId);

        // A rune among the links keeps a second field open to any type.
        var other = await AddField(w, w.Character, Definition("Other", EntityFieldKind.EntityReference));
        await Entry(w, w.Character, "Tam", Link(other, rune));
        var refused = await w.Client.PutFieldAsync(w.U, w.Character, other, Definition("Other", EntityFieldKind.EntityReference, group: realms));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TargetConflictCode, await CodeOf(refused));
        Assert.Null((await FieldOf(w, w.Character, other)).TargetGroupId);
    }

    [Fact]
    public async Task Required_is_refused_while_live_entries_are_missing_a_value_and_allowed_once_they_have_one()
    {
        var w = await NewWorld("efl-required");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        var oren = await Entry(w, w.Character, "Oren", []);
        var trashed = await Entry(w, w.Character, "Tam", []);
        (await w.Client.DeleteAsync(EntryRoute(w, trashed.Id))).EnsureSuccessStatusCode();

        var refused = await w.Client.PutFieldAsync(w.U, w.Character, title, Definition("Title", EntityFieldKind.ShortText, required: true));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.RequiredMissingCode, await CodeOf(refused));
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            // Oren alone: the entry in the Trash is not checked until it is back.
            Assert.Equal(1, problem.RootElement.GetProperty("missingCount").GetInt32());
            Assert.Contains("1 Character entry has no Title yet", problem.RootElement.GetProperty("detail").GetString(), StringComparison.Ordinal);
        }

        Assert.False((await FieldOf(w, w.Character, title)).IsRequired);
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);

        await Save(w, oren.Id, w.Character, "Oren", [Text(title, "Scribe")]);
        await UpdateField(w, w.Character, title, Definition("Title", EntityFieldKind.ShortText, required: true));
        Assert.True((await FieldOf(w, w.Character, title)).IsRequired);
    }

    [Fact]
    public async Task Options_keep_their_ids_and_choices_and_a_chosen_option_cannot_be_removed()
    {
        var w = await NewWorld("efl-options");
        var house = await AddField(w, w.Character, Definition("House", EntityFieldKind.Select, options: ["Ash", "Oak"]));
        var before = await FieldOf(w, w.Character, house);
        var ash = before.Options.Single(option => option.Value == "Ash").Id;
        var mara = await Entry(w, w.Character, "Mara", Choose(house, ash));

        await UpdateField(w, w.Character, house, Definition("House", EntityFieldKind.Select, options: ["Ash", "Oak", "Elm"]));
        var after = await FieldOf(w, w.Character, house);
        Assert.Equal(["Ash", "Oak", "Elm"], after.Options.Select(option => option.Value));
        Assert.Equal(ash, after.Options.Single(option => option.Value == "Ash").Id);
        Assert.Equal([ash], (await Detail(w, mara.Id)).Fields.Single().OptionIds);

        var removing = await w.Client.PutFieldAsync(w.U, w.Character, house, Definition("House", EntityFieldKind.Select, options: ["Oak", "Elm"]));
        Assert.Equal(HttpStatusCode.Conflict, removing.StatusCode);
        Assert.Contains((await FieldOf(w, w.Character, house)).Options, option => option.Id == ash);

        // An unused option goes.
        await UpdateField(w, w.Character, house, Definition("House", EntityFieldKind.Select, options: ["Ash", "Elm"]));
        Assert.Equal(["Ash", "Elm"], (await FieldOf(w, w.Character, house)).Options.Select(option => option.Value));
    }

    [Fact]
    public async Task A_kind_change_with_values_and_a_duplicate_name_are_refused()
    {
        var w = await NewWorld("efl-kind");
        var born = await AddField(w, w.Character, Definition("Born", EntityFieldKind.Number));
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        await Entry(w, w.Character, "Mara", new FieldValueInput(born, null, 12, null, null, null, null));

        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PutFieldAsync(w.U, w.Character, born, Definition("Born", EntityFieldKind.ShortText))).StatusCode);
        Assert.Equal(EntityFieldKind.Number, (await FieldOf(w, w.Character, born)).Kind);

        var twin = await w.Client.PutFieldAsync(w.U, w.Character, title, Definition("Born", EntityFieldKind.ShortText));
        Assert.Equal(HttpStatusCode.BadRequest, twin.StatusCode);
        Assert.Equal("This type already has a field with that name.", await ErrorOf(twin, "name"));

        // An archived field keeps its name, so the clash says where it is.
        await Archive(w, w.Character, born);
        var archivedTwin = await PostField(w, w.Character, Definition("Born", EntityFieldKind.Number));
        Assert.Equal(HttpStatusCode.BadRequest, archivedTwin.StatusCode);
        Assert.Contains("archived field", await ErrorOf(archivedTwin, "name"), StringComparison.Ordinal);
    }

    // ---------- Two editors ----------

    [Fact]
    public async Task A_stale_editor_cannot_widen_a_target_another_editor_narrowed()
    {
        var w = await NewWorld("efl-stale-target");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference));
        await Entry(w, w.Character, "Mara", Link(kingdom, erandor));

        // Both open Kingdom at the same version.
        var opened = (await FieldOf(w, w.Character, kingdom)).Version;

        // A limits it to Kingdoms.
        var narrowed = await w.Client.PutAsJsonAsync(
            FieldRoute(w, w.Character, kingdom),
            Definition("Kingdom", EntityFieldKind.EntityReference, target: w.Kingdoms) with { ExpectedVersion = opened });
        Assert.Equal(HttpStatusCode.OK, narrowed.StatusCode);

        // B, still showing Any Lore type, renames it: that save would have opened the target again. Refused, nothing changed.
        var stale = await w.Client.PutAsJsonAsync(
            FieldRoute(w, w.Character, kingdom),
            Definition("Realm", EntityFieldKind.EntityReference) with { ExpectedVersion = opened });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldChangedCode, await CodeOf(stale));
        using (var problem = JsonDocument.Parse(await stale.Content.ReadAsStringAsync()))
        {
            Assert.Equal(opened + 1, problem.RootElement.GetProperty("currentVersion").GetInt32());
        }

        var kept = await FieldOf(w, w.Character, kingdom);
        Assert.Equal(("Kingdom", w.Kingdoms, opened + 1), (kept.Name, kept.TargetEntityTypeId, kept.Version));

        // B reloads, keeps A's limit, and renames over the version it now reads.
        var retried = await w.Client.PutAsJsonAsync(
            FieldRoute(w, w.Character, kingdom),
            Definition("Realm", EntityFieldKind.EntityReference, target: w.Kingdoms) with { ExpectedVersion = kept.Version });
        Assert.Equal(HttpStatusCode.OK, retried.StatusCode);
        Assert.Equal(("Realm", w.Kingdoms), ((await FieldOf(w, w.Character, kingdom)).Name, (await FieldOf(w, w.Character, kingdom)).TargetEntityTypeId));
    }

    [Fact]
    public async Task Concurrent_edits_to_different_settings_never_silently_overwrite_each_other()
    {
        var w = await NewWorld("efl-two-editors");
        var house = await AddField(w, w.Character, Definition("House", EntityFieldKind.Select, options: ["Ash"]));
        var born = await AddField(w, w.Character, Definition("Born", EntityFieldKind.Number));
        var v1 = (await FieldOf(w, w.Character, house)).Version;
        Assert.Equal(1, v1);

        // A makes it required and adds a choice; B, from the same version, renames it.
        (await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, house),
            Definition("House", EntityFieldKind.Select, required: true, options: ["Ash", "Oak"]) with { ExpectedVersion = v1 })).EnsureSuccessStatusCode();
        var renamed = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, house),
            Definition("Lineage", EntityFieldKind.Select, options: ["Ash"]) with { ExpectedVersion = v1 });
        Assert.Equal(HttpStatusCode.Conflict, renamed.StatusCode);
        var house2 = await FieldOf(w, w.Character, house);
        Assert.Equal(("House", true, 2), (house2.Name, house2.IsRequired, house2.Options.Count));

        // A meaning is protected the same way, and so is a kind change.
        var bornV = (await FieldOf(w, w.Character, born)).Version;
        (await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, born),
            Definition("Born", EntityFieldKind.Number, semantic: EntityFieldSemantic.BirthYear) with { ExpectedVersion = bornV })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, born),
            Definition("Born", EntityFieldKind.ShortText) with { ExpectedVersion = bornV })).StatusCode);
        var born2 = await FieldOf(w, w.Character, born);
        Assert.Equal((EntityFieldKind.Number, EntityFieldSemantic.BirthYear), (born2.Kind, born2.Semantic));

        // An edit that names no version is refused like a stale one: there is no unprotected way in.
        var unnamed = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, born), Definition("Year of birth", EntityFieldKind.Number));
        Assert.Equal(HttpStatusCode.Conflict, unnamed.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldChangedCode, await CodeOf(unnamed));

        // A save that changes nothing leaves the version, and every other open drawer, current.
        (await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, born),
            Definition("Born", EntityFieldKind.Number, semantic: EntityFieldSemantic.BirthYear) with { ExpectedVersion = born2.Version })).EnsureSuccessStatusCode();
        Assert.Equal(born2.Version, (await FieldOf(w, w.Character, born)).Version);
    }

    [Fact]
    public async Task Archiving_and_restoring_move_the_field_version_so_an_old_drawer_cannot_save_over_it()
    {
        var w = await NewWorld("efl-version-archive");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var opened = (await FieldOf(w, w.Character, title)).Version;

        await Archive(w, w.Character, title);
        Assert.Equal(opened + 1, (await ArchivedFieldOf(w, w.Character, title)).Version);
        await Restore(w, w.Character, title);
        var restored = await FieldOf(w, w.Character, title);
        Assert.Equal(opened + 2, restored.Version);

        // A drawer opened before the archive is stale now, even for a change the field would otherwise accept.
        var stale = await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, title),
            Definition("Rank", EntityFieldKind.ShortText) with { ExpectedVersion = opened });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldChangedCode, await CodeOf(stale));
        Assert.Equal("Title", (await FieldOf(w, w.Character, title)).Name);

        // Opened again, it saves.
        (await w.Client.PutAsJsonAsync(FieldRoute(w, w.Character, title),
            Definition("Rank", EntityFieldKind.ShortText) with { ExpectedVersion = restored.Version })).EnsureSuccessStatusCode();
        Assert.Equal(("Rank", restored.Version + 1), ((await FieldOf(w, w.Character, title)).Name, (await FieldOf(w, w.Character, title)).Version));
    }

    // ---------- History ----------

    [Fact]
    public async Task A_field_an_older_version_used_is_not_deleted_once_its_value_is_cleared()
    {
        var w = await NewWorld("efl-history-delete");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));

        // Cleared: no entry holds a value now, but version 1 recorded one.
        await Save(w, mara.Id, w.Character, "Mara");
        var cleared = await FieldOf(w, w.Character, title);
        Assert.Equal((0, true), (cleared.EntryCount, cleared.UsedInHistory));

        var refused = await w.Client.DeleteAsync(FieldRoute(w, w.Character, title));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldInHistoryCode, await CodeOf(refused));
        Assert.Equal(
            "Older versions of 1 entry still use this field, so it can't be deleted. Archive it to hide it and keep that history.",
            await DetailOf(refused));

        // Archived, the same: history keeps it either way, and nothing about it changed.
        await Archive(w, w.Character, title);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.DeleteAsync(FieldRoute(w, w.Character, title))).StatusCode);
        await WithDb(_factory, async db => Assert.Equal(
            "Queen",
            await db.EntityRevisionFieldValues.Where(value => value.FieldDefinitionId == title).Select(value => value.TextValue).SingleAsync()));

        // Restored, version 1 still puts Queen back.
        await Restore(w, w.Character, title);
        var first = (await Revisions(w, mara.Id)).Single(revision => revision.Number == 1);
        (await w.Client.PostAsJsonAsync($"{EntryRoute(w, mara.Id)}/revisions/{first.Id}/restore",
            new EntityRevisionRestoreRequest((await Detail(w, mara.Id)).Version))).EnsureSuccessStatusCode();
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task A_field_no_version_ever_recorded_is_still_deleted()
    {
        var w = await NewWorld("efl-history-free");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", []);
        await Save(w, mara.Id, w.Character, "Mara", summary: "Saved again, still without a title.");

        Assert.False((await FieldOf(w, w.Character, title)).UsedInHistory);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync(FieldRoute(w, w.Character, title))).StatusCode);
    }

    // ---------- Archiving ----------

    [Fact]
    public async Task Archiving_Kingdom_then_saving_the_entry_then_restoring_keeps_Erandor()
    {
        var w = await NewWorld("efl-regression");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference, target: w.Kingdoms));
        var mara = await Entry(w, w.Character, "Mara", Link(kingdom, erandor));

        var archived = await Archive(w, w.Character, kingdom);
        var character = archived.Single(type => type.Id == w.Character);
        Assert.DoesNotContain(character.Fields, field => field.Id == kingdom);
        var kept = Assert.Single(character.ArchivedFields!, field => field.Id == kingdom);
        Assert.Equal((w.Kingdoms, 1), (kept.TargetEntityTypeId, kept.EntryCount));
        Assert.NotNull(kept.ArchivedAt);

        // Out of the entry's read, so out of its form: the description is edited and saved without it.
        var hidden = await Detail(w, mara.Id);
        Assert.Empty(hidden.Fields);
        await Save(w, mara.Id, w.Character, "Mara", summary: "The heir of the drowned coast.");

        var restored = (await Restore(w, w.Character, kingdom)).Single(type => type.Id == w.Character);
        Assert.Contains(restored.Fields, field => field.Id == kingdom);
        Assert.Empty(restored.ArchivedFields!);

        var back = await Detail(w, mara.Id);
        Assert.Equal("The heir of the drowned coast.", back.Summary);
        var value = back.Fields.Single(field => field.FieldDefinitionId == kingdom);
        Assert.Equal((erandor, "Erandor"), (value.ReferencedEntityId, value.ReferencedEntityName));
    }

    [Fact]
    public async Task An_archived_field_is_out_of_forms_filters_and_mass_create_and_its_required_flag_blocks_nothing()
    {
        var w = await NewWorld("efl-hidden");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText, required: true));
        await Archive(w, w.Character, title);

        // A new entry without it, one at a time or many at once.
        await Entry(w, w.Character, "Oren");
        var bulk = await w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entities/bulk",
            new BulkEntityRequest([new BulkEntityRow(w.Character, "Tam", CanonStatus.Draft)]));
        Assert.Equal(HttpStatusCode.Created, bulk.StatusCode);

        // A value sent for it is ignored, like any field the type does not have.
        var sent = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        Assert.Empty(sent.Fields);
        await WithDb(_factory, async db => Assert.False(await db.EntityFieldValues.AnyAsync(value => value.FieldDefinitionId == title)));

        // And a Lore filter on it is refused, never dropped.
        var filtered = await w.Client.GetAsync(
            $"/api/universes/{w.U}/entities?entityTypeId={w.Character}&field={Uri.EscapeDataString($"{title}:eq:Queen")}");
        Assert.Equal(HttpStatusCode.BadRequest, filtered.StatusCode);
        Assert.Equal("This is not a field of the chosen type.", await ErrorOf(filtered, "field[0]"));

        // Its settings wait for a restore.
        var edit = await w.Client.PutFieldAsync(w.U, w.Character, title, Definition("Rank", EntityFieldKind.ShortText));
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldArchivedCode, await CodeOf(edit));

        // The field still says it was required.
        Assert.True((await ArchivedFieldOf(w, w.Character, title)).IsRequired);
    }

    [Fact]
    public async Task A_value_sent_for_an_archived_field_changes_nothing_stored()
    {
        var w = await NewWorld("efl-ignored");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);

        await Save(w, mara.Id, w.Character, "Mara", fields: [Text(title, "Beggar")]);
        await Restore(w, w.Character, title);
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task Archiving_or_restoring_makes_an_open_form_on_an_entry_holding_a_value_stale()
    {
        var w = await NewWorld("efl-stale");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference));
        var mara = await Entry(w, w.Character, "Mara", Link(kingdom, erandor));
        var empty = await Entry(w, w.Character, "Oren", []);

        // A form opened while the field was archived carries no Kingdom. Saving it after the restore would have dropped
        // Erandor; it is refused as stale instead.
        await Archive(w, w.Character, kingdom);
        var openedWhileArchived = await Detail(w, mara.Id);
        await Restore(w, w.Character, kingdom);

        var stale = await w.Client.PutAsJsonAsync(EntryRoute(w, mara.Id), new EntityRequest(
            w.Character, "Mara", "Edited.", CanonStatus.Canon, null, null, [], openedWhileArchived.Version));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(EntityEndpoints.ChangedCode, await CodeOf(stale));
        Assert.Equal(erandor, (await Detail(w, mara.Id)).Fields.Single().ReferencedEntityId);

        // The same on archiving: a form still showing Kingdom is refused rather than half-saved.
        var openedWhileActive = await Detail(w, mara.Id);
        await Archive(w, w.Character, kingdom);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PutAsJsonAsync(EntryRoute(w, mara.Id), new EntityRequest(
            w.Character, "Mara", null, CanonStatus.Canon, null, null, [Link(kingdom, erandor)], openedWhileActive.Version))).StatusCode);

        // An entry with no value for it had nothing to lose, and its form stays current.
        var oren = await Detail(w, empty.Id);
        Assert.Equal(empty.Version, oren.Version);
    }

    [Fact]
    public async Task Archived_values_survive_the_Trash_history_and_a_restored_version()
    {
        var w = await NewWorld("efl-history");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Princess"));
        await Save(w, mara.Id, w.Character, "Mara", fields: [Text(title, "Queen")]);
        var first = (await Revisions(w, mara.Id)).Single(revision => revision.Number == 1);

        await Archive(w, w.Character, title);

        // History still shows what was recorded.
        var recorded = (await w.Client.GetFromJsonAsync<EntityRevisionDetail>($"{EntryRoute(w, mara.Id)}/revisions/{first.Id}"))!;
        Assert.Equal("Princess", recorded.Fields.Single().Text);

        // Through the Trash and back.
        (await w.Client.DeleteAsync(EntryRoute(w, mara.Id))).EnsureSuccessStatusCode();
        Assert.Equal(1, (await ArchivedFieldOf(w, w.Character, title)).TrashedEntryCount);
        (await w.Client.PostAsync($"/api/universes/{w.U}/trash/{mara.Id}/restore", null)).EnsureSuccessStatusCode();

        await Restore(w, w.Character, title);
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task Princess_then_Queen_then_archived_refuses_putting_back_Princess_until_the_field_is_restored()
    {
        var w = await NewWorld("efl-rev-princess");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Princess"));
        await Save(w, mara.Id, w.Character, "Mara", fields: [Text(title, "Queen")]);
        await Archive(w, w.Character, title);
        var before = await Detail(w, mara.Id);
        var history = (await Revisions(w, mara.Id)).Count;

        var refused = await RestoreVersion(w, mara.Id, 1);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(RevisionEndpoints.ArchivedFieldConflictCode, await CodeOf(refused));
        Assert.Contains("\"Title\"", await DetailOf(refused), StringComparison.Ordinal);

        // Nothing moved: the entry, its version, its archived value and its history.
        Assert.Equal(before.Version, (await Detail(w, mara.Id)).Version);
        Assert.Equal(history, (await Revisions(w, mara.Id)).Count);
        await WithDb(_factory, async db => Assert.Equal(
            "Queen", await db.EntityFieldValues.Where(value => value.FieldDefinitionId == title).Select(value => value.TextValue).SingleAsync()));

        // Restored first, the field is an ordinary one again and version 1 applies whole.
        await Restore(w, w.Character, title);
        Assert.Equal(HttpStatusCode.OK, (await RestoreVersion(w, mara.Id, 1)).StatusCode);
        Assert.Equal("Princess", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task A_version_whose_archived_value_matches_what_is_kept_restores()
    {
        var w = await NewWorld("efl-rev-match");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Save(w, mara.Id, w.Character, "Mara", fields: [Text(title, "Queen")], summary: "Later words.");
        await Archive(w, w.Character, title);

        Assert.Equal(HttpStatusCode.OK, (await RestoreVersion(w, mara.Id, 1)).StatusCode);
        Assert.Null((await Detail(w, mara.Id)).Summary);

        await Restore(w, w.Character, title);
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task An_archived_value_on_one_side_only_refuses_the_restore()
    {
        var w = await NewWorld("efl-rev-oneside");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));

        // Only now: version 1 had no title, the entry keeps one.
        var mara = await Entry(w, w.Character, "Mara", []);
        await Save(w, mara.Id, w.Character, "Mara", fields: [Text(title, "Queen")]);

        // Only in the version: version 1 had a title, the entry keeps none.
        var oren = await Entry(w, w.Character, "Oren", Text(title, "Scribe"));
        await Save(w, oren.Id, w.Character, "Oren");

        await Archive(w, w.Character, title);

        foreach (var entry in new[] { mara.Id, oren.Id })
        {
            var version = (await Detail(w, entry)).Version;
            var refused = await RestoreVersion(w, entry, 1);
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal(RevisionEndpoints.ArchivedFieldConflictCode, await CodeOf(refused));
            Assert.Equal(version, (await Detail(w, entry)).Version);
        }

        await Restore(w, w.Character, title);
        Assert.Equal(HttpStatusCode.OK, (await RestoreVersion(w, mara.Id, 1)).StatusCode);
        Assert.Empty((await Detail(w, mara.Id)).Fields);
        Assert.Equal(HttpStatusCode.OK, (await RestoreVersion(w, oren.Id, 1)).StatusCode);
        Assert.Equal("Scribe", (await Detail(w, oren.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task A_kind_change_is_refused_while_only_older_versions_hold_values_and_allowed_when_none_ever_did()
    {
        var w = await NewWorld("efl-kind-history");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Save(w, mara.Id, w.Character, "Mara");
        var cleared = await FieldOf(w, w.Character, title);
        Assert.Equal((0, true), (cleared.EntryCount, cleared.UsedInHistory));

        var refused = await w.Client.PutFieldAsync(w.U, w.Character, title, Definition("Title", EntityFieldKind.Number));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.KindLockedCode, await CodeOf(refused));
        Assert.Contains("Older versions", await DetailOf(refused), StringComparison.Ordinal);
        var kept = await FieldOf(w, w.Character, title);
        Assert.Equal((EntityFieldKind.ShortText, cleared.Version), (kept.Kind, kept.Version));

        // Never held anywhere: the kind may change.
        var spare = await AddField(w, w.Character, Definition("Spare", EntityFieldKind.ShortText));
        await Save(w, mara.Id, w.Character, "Mara", summary: "Saved without it.");
        (await w.Client.PutFieldAsync(w.U, w.Character, spare, Definition("Spare", EntityFieldKind.Number))).EnsureSuccessStatusCode();
        Assert.Equal(EntityFieldKind.Number, (await FieldOf(w, w.Character, spare)).Kind);
    }

    [Fact]
    public async Task An_accepted_suggestion_cannot_discard_an_archived_value()
    {
        var (owner, _) = await PublishingTestClient.Account(_factory, "efl-sugg-owner");
        var (reviewer, reviewerId) = await PublishingTestClient.Account(_factory, "efl-sugg-reviewer");
        var u = (await CreateUniverse(owner, "Suggested world")).Id;
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        var w = new World(owner, u, (await TypesOf(owner, u)).Single(type => type.Name == "Character").Id, Guid.Empty, Guid.Empty);

        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);

        // Proposed while the field is archived, so it carries no Title; accepted, Title is still kept.
        var version = (await Detail(w, mara.Id)).Version;
        var proposed = await reviewer.PostAsJsonAsync($"{EntryRoute(w, mara.Id)}/suggestions",
            new EntityRequest(w.Character, "Mara of the Vale", null, CanonStatus.Canon, null, null, [], version));
        Assert.Equal(HttpStatusCode.Created, proposed.StatusCode);
        var suggestion = (await proposed.Content.ReadFromJsonAsync<SuggestionResponse<EntrySuggestion>>())!;
        Assert.Empty(suggestion.Before.Fields);

        (await owner.PostAsync($"/api/universes/{u}/suggestions/{suggestion.Id}/accept", null)).EnsureSuccessStatusCode();
        await Restore(w, w.Character, title);
        var saved = await Detail(w, mara.Id);
        Assert.Equal(("Mara of the Vale", "Queen"), (saved.Name, saved.Fields.Single().Text));

        // A suggestion made before a restore can no longer be accepted over the field it never showed.
        await Archive(w, w.Character, title);
        var stale = await reviewer.PostAsJsonAsync($"{EntryRoute(w, mara.Id)}/suggestions",
            new EntityRequest(w.Character, "Mara the Second", null, CanonStatus.Canon, null, null, [], (await Detail(w, mara.Id)).Version));
        var staleId = (await stale.Content.ReadFromJsonAsync<SuggestionResponse<EntrySuggestion>>())!.Id;
        await Restore(w, w.Character, title);
        var refused = await owner.PostAsync($"/api/universes/{u}/suggestions/{staleId}/accept", null);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(SuggestionEndpoints.TargetChangedCode, await CodeOf(refused));
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    // ---------- Restoring ----------

    [Fact]
    public async Task A_required_field_missing_on_new_entries_comes_back_only_as_optional_and_only_when_asked()
    {
        var w = await NewWorld("efl-optional");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText, required: true));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);
        await Entry(w, w.Character, "Oren");

        var refused = await w.Client.PostAsJsonAsync($"{FieldRoute(w, w.Character, title)}/restore", new FieldRestoreRequest());
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.RequiredMissingCode, await CodeOf(refused));
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            Assert.True(problem.RootElement.GetProperty("canRestoreOptional").GetBoolean());
            Assert.Equal(1, problem.RootElement.GetProperty("missingCount").GetInt32());
        }

        // Still archived and still required: nothing was relaxed to make it fit.
        Assert.True((await ArchivedFieldOf(w, w.Character, title)).IsRequired);

        var restored = (await Restore(w, w.Character, title, asOptional: true)).Single(type => type.Id == w.Character);
        var field = restored.Fields.Single(one => one.Id == title);
        Assert.False(field.IsRequired);
        Assert.Equal("Queen", (await Detail(w, mara.Id)).Fields.Single().Text);
    }

    [Fact]
    public async Task A_required_field_with_every_live_entry_filled_comes_back_required()
    {
        var w = await NewWorld("efl-still-required");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText, required: true));
        await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);

        Assert.True((await Restore(w, w.Character, title)).Single(type => type.Id == w.Character).Fields.Single(one => one.Id == title).IsRequired);
    }

    [Fact]
    public async Task A_restored_death_year_that_would_open_a_High_conflict_is_refused_by_the_gate()
    {
        var w = await NewWorld("efl-canon");
        var born = await AddField(w, w.Character, Definition("Born", EntityFieldKind.Number, semantic: EntityFieldSemantic.BirthYear));
        var died = await AddField(w, w.Character, Definition("Died", EntityFieldKind.Number, semantic: EntityFieldSemantic.DeathYear));
        var mara = await Entry(w, w.Character, "Mara", Year(born, 100), Year(died, 150));

        // Archived, the death year is read by nothing, so a birth after it is no conflict yet.
        await Archive(w, w.Character, died);
        await Save(w, mara.Id, w.Character, "Mara", fields: [Year(born, 200)]);

        var refused = await w.Client.PostAsJsonAsync($"{FieldRoute(w, w.Character, died)}/restore", new FieldRestoreRequest());
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(CanonPromotionGate.BlockedCode, await CodeOf(refused));
        Assert.NotNull((await ArchivedFieldOf(w, w.Character, died)).ArchivedAt);

        // Once the birth year agrees again the restore goes through, with the death year intact.
        await Save(w, mara.Id, w.Character, "Mara", fields: [Year(born, 120)]);
        await Restore(w, w.Character, died);
        Assert.Equal(150, (await Detail(w, mara.Id)).Fields.Single(value => value.FieldDefinitionId == died).Number);
    }

    [Fact]
    public async Task Archiving_and_restoring_twice_is_the_same_field_and_a_foreign_type_is_not_found()
    {
        var w = await NewWorld("efl-idempotent");
        var other = await NewWorld("efl-idempotent-other");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));

        await Archive(w, w.Character, title);
        var at = (await ArchivedFieldOf(w, w.Character, title)).ArchivedAt;
        await Archive(w, w.Character, title);
        Assert.Equal(at, (await ArchivedFieldOf(w, w.Character, title)).ArchivedAt);
        await Restore(w, w.Character, title);
        await Restore(w, w.Character, title);
        Assert.Null((await FieldOf(w, w.Character, title)).ArchivedAt);

        // Another universe's type, or this field under another type, is not found and changes nothing.
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsync($"/api/universes/{other.U}/entity-types/{other.Character}/fields/{title}/archive", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.PostAsync($"/api/universes/{w.U}/entity-types/{w.Kingdoms}/fields/{title}/archive", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsync($"/api/universes/{w.U}/entity-types/{w.Character}/fields/{title}/archive", null)).StatusCode);
        Assert.Null((await FieldOf(w, w.Character, title)).ArchivedAt);
    }

    // ---------- Dependencies ----------

    [Fact]
    public async Task An_archived_field_s_limit_and_links_still_protect_types_groups_and_entries()
    {
        var w = await NewWorld("efl-protect");
        var realms = await NewGroup(w, w.Kingdoms, "Realms");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference, target: w.Kingdoms));
        var ally = await AddField(w, w.Character, Definition("Ally", EntityFieldKind.EntityReference, group: realms));
        await Entry(w, w.Character, "Mara", Link(kingdom, erandor), Link(ally, erandor));
        await Archive(w, w.Character, kingdom);
        await Archive(w, w.Character, ally);

        // The type it is limited to, even with no entry of it anywhere.
        var homeland = await AddField(w, w.Character, Definition("Homeland", EntityFieldKind.EntityReference, target: w.Runes));
        await Archive(w, w.Character, homeland);
        var typeDelete = await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-types/{w.Runes}");
        Assert.Equal(HttpStatusCode.Conflict, typeDelete.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TypeTargetedCode, await CodeOf(typeDelete));
        Assert.Contains("\"Homeland\" (archived)", await DetailOf(typeDelete), StringComparison.Ordinal);

        // The group it is limited to, and the membership its link relies on.
        var groupDelete = await w.Client.DeleteAsync($"/api/universes/{w.U}/entity-type-groups/{realms}");
        Assert.Equal(HttpStatusCode.Conflict, groupDelete.StatusCode);
        Assert.Contains("(archived)", await DetailOf(groupDelete), StringComparison.Ordinal);
        var leaving = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/entity-types/{w.Kingdoms}",
            new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: []));
        Assert.Equal(HttpStatusCode.Conflict, leaving.StatusCode);

        // The entry it links to cannot change type under it.
        var retype = await w.Client.PutAsJsonAsync(EntryRoute(w, erandor), new EntityRequest(
            w.Runes, "Erandor", null, CanonStatus.Canon, null, null, [], (await Detail(w, erandor)).Version));
        Assert.Equal(HttpStatusCode.Conflict, retype.StatusCode);
        Assert.Equal(EntityEndpoints.TypeChangeLinkedCode, await CodeOf(retype));

        await Restore(w, w.Character, kingdom);
        await Restore(w, w.Character, ally);
    }

    [Fact]
    public async Task An_entry_holding_archived_values_cannot_change_type_until_the_field_is_restored()
    {
        var w = await NewWorld("efl-retype");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);

        var retype = await w.Client.PutAsJsonAsync(EntryRoute(w, mara.Id), new EntityRequest(
            w.Runes, "Mara", null, CanonStatus.Canon, null, null, [], (await Detail(w, mara.Id)).Version));
        Assert.Equal(HttpStatusCode.Conflict, retype.StatusCode);
        Assert.Equal(EntityEndpoints.TypeChangeArchivedCode, await CodeOf(retype));
        Assert.Contains("\"Title\"", await DetailOf(retype), StringComparison.Ordinal);

        await Restore(w, w.Character, title);
        var back = await Detail(w, mara.Id);
        Assert.Equal((w.Character, "Queen"), (back.EntityTypeId, back.Fields.Single().Text));

        // Without archived values, the move is the ordinary one.
        var oren = await Entry(w, w.Character, "Oren", []);
        await Save(w, oren.Id, w.Runes, "Oren");
    }

    // ---------- Deleting ----------

    [Fact]
    public async Task Only_a_field_with_no_value_anywhere_is_deleted_and_nothing_cascades()
    {
        var w = await NewWorld("efl-delete");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        var unused = await AddField(w, w.Character, Definition("Unused", EntityFieldKind.ShortText));
        var mara = await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        var oren = await Entry(w, w.Character, "Oren", Text(title, "Scribe"));
        (await w.Client.DeleteAsync(EntryRoute(w, oren.Id))).EnsureSuccessStatusCode();

        var refused = await w.Client.DeleteAsync(FieldRoute(w, w.Character, title));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeEndpoints.FieldInUseCode, await CodeOf(refused));
        Assert.Equal(
            "This field contains values in 2 entries, 1 of them in the Trash. Archive it to hide it without losing its data.",
            await DetailOf(refused));

        // Archived, it still holds them, so it is still refused.
        await Archive(w, w.Character, title);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.DeleteAsync(FieldRoute(w, w.Character, title))).StatusCode);
        await WithDb(_factory, async db => Assert.Equal(2, await db.EntityFieldValues.CountAsync(value => value.FieldDefinitionId == title)));

        // Empty fields go, active or archived.
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync(FieldRoute(w, w.Character, unused))).StatusCode);
        var empty = await AddField(w, w.Character, Definition("Empty", EntityFieldKind.ShortText));
        await Archive(w, w.Character, empty);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync(FieldRoute(w, w.Character, empty))).StatusCode);

        var types = await TypesOf(w.Client, w.U);
        var character = types.Single(type => type.Id == w.Character);
        Assert.DoesNotContain(character.Fields.Concat(character.ArchivedFields!), field => field.Id == unused || field.Id == empty);
        Assert.Equal(mara.Id, (await Detail(w, mara.Id)).Id);
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_archived_fields_and_their_values_and_restores_them_archived()
    {
        var w = await NewWorld("efl-backup");
        var erandor = await Entry(w, w.Kingdoms, "Erandor");
        var kingdom = await AddField(w, w.Character, Definition("Kingdom", EntityFieldKind.EntityReference, required: true, target: w.Kingdoms));
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        await Entry(w, w.Character, "Mara", Link(kingdom, erandor), Text(title, "Queen"));
        await Archive(w, w.Character, kingdom);

        var archive = await RawArchive(w.Client, w.U);
        var backup = BackupOf(archive);
        Assert.Equal(25, backup.FormatVersion);
        var carried = backup.Payload.EntityTypes.Single(type => type.Id == w.Character).Fields;
        Assert.NotNull(carried.Single(field => field.Id == kingdom).ArchivedAt);
        Assert.Null(carried.Single(field => field.Id == title).ArchivedAt);
        Assert.Contains(backup.Payload.Entities.Single(entity => entity.Name == "Mara").FieldValues, value => value.FieldDefinitionId == kingdom);

        var restored = await RestoreArchive(w.Client, archive, "efl-backup restored");
        var types = await TypesOf(w.Client, restored.Id);
        var character = types.Single(type => type.Name == "Character");
        var restoredKingdoms = types.Single(type => type.Name == "Kingdoms").Id;
        var restoredField = Assert.Single(character.ArchivedFields!);
        Assert.Equal(("Kingdom", restoredKingdoms, true), (restoredField.Name, restoredField.TargetEntityTypeId, restoredField.IsRequired));
        Assert.NotEqual(kingdom, restoredField.Id);
        Assert.Equal(1, restoredField.EntryCount);
        Assert.Equal(["Title"], character.Fields.Select(field => field.Name));

        // Restored in the new universe, the archived link comes back pointing at the new Erandor.
        var rw = new World(w.Client, restored.Id, character.Id, restoredKingdoms, Guid.Empty);
        await Restore(rw, character.Id, restoredField.Id);
        var mara = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?entityTypeId={character.Id}"))!.Items.Single();
        var link = (await Detail(rw, mara.Id)).Fields.Single(value => value.FieldDefinitionId == restoredField.Id);
        Assert.Equal("Erandor", link.ReferencedEntityName);
        Assert.NotEqual(erandor, link.ReferencedEntityId);
    }

    [Fact]
    public async Task A_version_24_backup_restores_every_field_active()
    {
        var w = await NewWorld("efl-v24");
        var title = await AddField(w, w.Character, Definition("Title", EntityFieldKind.ShortText));
        await Entry(w, w.Character, "Mara", Text(title, "Queen"));
        await Archive(w, w.Character, title);

        // Rewritten as version 24 would have written it, and once more claiming archived anyway.
        var older = Downgrade(await RawArchive(w.Client, w.U), 24);
        var claiming = Rewrite(older, document: root =>
        {
            foreach (var field in Payload(root)["entityTypes"]!.AsArray().SelectMany(type => type!["fields"]!.AsArray()))
            {
                field!["archivedAt"] = "2026-10-01T00:00:00Z";
            }
        });

        foreach (var (file, name) in new[] { (older, "efl-v24 restored"), (claiming, "efl-v24 claiming") })
        {
            var restored = await RestoreArchive(w.Client, file, name);
            var character = (await TypesOf(w.Client, restored.Id)).Single(type => type.Name == "Character");
            Assert.Empty(character.ArchivedFields!);
            Assert.Equal(1, character.Fields.Single(field => field.Name == "Title").EntryCount);
        }
    }

    // ---------- Racing ----------

    /// <summary>
    /// Archive, restore and entry saves racing on a real SQLite file, where each request has its own connection and its own
    /// IMMEDIATE transaction. Whatever order they land in, the stored value is never lost.
    /// </summary>
    [Fact]
    public async Task Saves_racing_archive_and_restore_never_lose_the_stored_value()
    {
        var directory = Path.Combine(Path.GetTempPath(), "lorex-field-lifecycle-race", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(directory);
        try
        {
            await using var host = new GroupFileHost(Path.Combine(directory, "lorex.db"));
            var client = await GroupFileHost.Register(host, "user-eflrace", "eflrace@example.test");
            var u = (await CreateUniverse(client, "Race world")).Id;
            var character = (await TypesOf(client, u)).Single(type => type.Name == "Character").Id;
            var w = new World(client, u, character, Guid.Empty, Guid.Empty);
            var title = await AddField(w, character, Definition("Title", EntityFieldKind.ShortText));
            var mara = await Entry(w, character, "Mara", Text(title, "Queen"));

            for (var round = 0; round < 6; round++)
            {
                var opened = await Detail(w, mara.Id);
                var archiving = round % 2 == 0;
                var fields = opened.Fields.Select(value => Text(value.FieldDefinitionId, value.Text!)).ToArray();

                var results = await Task.WhenAll(
                    client.PostAsJsonAsync($"{FieldRoute(w, character, title)}/{(archiving ? "archive" : "restore")}", new FieldRestoreRequest()),
                    client.PutAsJsonAsync(EntryRoute(w, mara.Id), new EntityRequest(
                        character, "Mara", $"Round {round}", CanonStatus.Canon, null, null, fields, opened.Version)));

                Assert.True(results[0].IsSuccessStatusCode, $"round {round}: {await results[0].Content.ReadAsStringAsync()}");
                Assert.True(results[1].IsSuccessStatusCode || results[1].StatusCode == HttpStatusCode.Conflict, $"round {round}: {(int)results[1].StatusCode}");
            }

            SqliteConnection.ClearAllPools();
            await using var db = new LorexDbContext(new DbContextOptionsBuilder<LorexDbContext>()
                .UseSqlite($"Data Source={Path.Combine(directory, "lorex.db")}").Options);
            Assert.Equal("Queen", await db.EntityFieldValues.Where(value => value.FieldDefinitionId == title).Select(value => value.TextValue).SingleAsync());
        }
        finally
        {
            GroupFileHost.Clean(directory);
        }
    }

    // ---------- Helpers ----------

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

    private static async Task<Guid> NewGroup(World w, Guid typeId, string name)
    {
        var type = (await TypesOf(w.Client, w.U)).Single(one => one.Id == typeId);
        (await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/entity-types/{typeId}",
            new EntityTypeRequest(type.Name, null, null, null, null, Groups: [new(null, name)]))).EnsureSuccessStatusCode();
        return (await w.Client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{w.U}/entity-type-groups"))!
            .Single(group => group.Name == name).Id;
    }

    private static async Task<List<EntityTypeResponse>> TypesOf(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<FieldDefinitionResponse> FieldOf(World w, Guid typeId, Guid fieldId) =>
        (await TypesOf(w.Client, w.U)).Single(type => type.Id == typeId).Fields.Single(field => field.Id == fieldId);

    private static async Task<FieldDefinitionResponse> ArchivedFieldOf(World w, Guid typeId, Guid fieldId) =>
        (await TypesOf(w.Client, w.U)).Single(type => type.Id == typeId).ArchivedFields!.Single(field => field.Id == fieldId);

    private static string FieldRoute(World w, Guid typeId, Guid fieldId) =>
        $"/api/universes/{w.U}/entity-types/{typeId}/fields/{fieldId}";

    private static string EntryRoute(World w, Guid entityId) => $"/api/universes/{w.U}/entities/{entityId}";

    private static FieldDefinitionRequest Definition(
        string name,
        EntityFieldKind kind,
        bool required = false,
        Guid? target = null,
        Guid? group = null,
        IReadOnlyList<string>? options = null,
        EntityFieldSemantic? semantic = null) =>
        new(name, kind, required, null, null, options, semantic, target, group);

    private static Task<HttpResponseMessage> PostField(World w, Guid typeId, FieldDefinitionRequest request) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entity-types/{typeId}/fields", request);

    private static async Task<Guid> AddField(World w, Guid typeId, FieldDefinitionRequest request)
    {
        var response = await PostField(w, typeId, request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == request.Name).Id;
    }

    private static async Task UpdateField(World w, Guid typeId, Guid fieldId, FieldDefinitionRequest request)
    {
        var response = await w.Client.PutFieldAsync(w.U, typeId, fieldId, request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static async Task<List<EntityTypeResponse>> Archive(World w, Guid typeId, Guid fieldId)
    {
        var response = await w.Client.PostAsync($"{FieldRoute(w, typeId, fieldId)}/archive", null);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await TypesOf(w.Client, w.U);
    }

    private static async Task<List<EntityTypeResponse>> Restore(World w, Guid typeId, Guid fieldId, bool asOptional = false)
    {
        var response = await w.Client.PostAsJsonAsync($"{FieldRoute(w, typeId, fieldId)}/restore", new FieldRestoreRequest(asOptional));
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await TypesOf(w.Client, w.U);
    }

    private static FieldValueInput Link(Guid fieldId, Guid entityId) => new(fieldId, null, null, null, null, null, entityId);

    private static FieldValueInput Text(Guid fieldId, string text) => new(fieldId, text, null, null, null, null, null);

    private static FieldValueInput Year(Guid fieldId, double year) => new(fieldId, null, year, null, null, null, null);

    private static FieldValueInput Choose(Guid fieldId, Guid optionId) => new(fieldId, null, null, null, null, [optionId], null);

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

    private static async Task<EntityDetail> Detail(World w, Guid entityId) =>
        (await w.Client.GetFromJsonAsync<EntityDetail>(EntryRoute(w, entityId)))!;

    /// <summary>An ordinary save over the entry's current version, sending only <paramref name="fields"/>.</summary>
    private static async Task Save(World w, Guid entityId, Guid typeId, string name, FieldValueInput[]? fields = null, string? summary = null)
    {
        var version = (await Detail(w, entityId)).Version;
        var response = await w.Client.PutAsJsonAsync(EntryRoute(w, entityId), new EntityRequest(
            typeId, name, summary, CanonStatus.Canon, null, null, fields ?? [], version));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    /// <summary>Puts version <paramref name="number"/> of an entry back over its current version.</summary>
    private static async Task<HttpResponseMessage> RestoreVersion(World w, Guid entityId, int number)
    {
        var revision = (await Revisions(w, entityId)).Single(one => one.Number == number);
        return await w.Client.PostAsJsonAsync(
            $"{EntryRoute(w, entityId)}/revisions/{revision.Id}/restore",
            new EntityRevisionRestoreRequest((await Detail(w, entityId)).Version));
    }

    private static async Task<List<EntityRevisionSummary>> Revisions(World w, Guid entityId) =>
        (await w.Client.GetFromJsonAsync<List<EntityRevisionSummary>>($"{EntryRoute(w, entityId)}/revisions"))!;

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
