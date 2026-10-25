using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's eras (Issue #41): one Lore identity read in creator-defined periods, saved apart from the entry on its own route.
///
/// The invariants under test: an entry with none reads exactly as it did; an era holds only its overrides, and every other
/// field reads from the entry - never from an earlier era; an optional field may be left empty for one era, a required one may
/// not; eras keep their ids through edits and reorders; a save names the version it was read at and an unchanged one records
/// nothing; the history restores whole, an era removed since included; the entry's own save never touches any of it; every
/// protection that counts a field's values counts an era's overrides; dates sit on the universe's own chronology; and a backup
/// carries all of it.
/// </summary>
public sealed class EntityProgressionTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character, Guid Title, Guid Power, Guid Rank, Guid Ally, Guid Motto, Guid Entry);

    // ---------- Reading and saving ----------

    [Fact]
    public async Task An_entry_with_no_eras_reads_as_it_always_did()
    {
        var w = await NewWorld("prog-empty");

        var progression = await Read(w);
        Assert.Empty(progression.Eras);
        Assert.Equal(0, progression.Version);
        Assert.Null(progression.UpdatedAt);
        Assert.False((await Detail(w)).HasProgression);
        Assert.Empty(await Revisions(w));
        await WithDb(_factory, async db => Assert.False(await db.EntityProgressions.AnyAsync(row => row.EntityId == w.Entry)));
    }

    [Fact]
    public async Task An_era_holds_only_its_overrides_and_reads_back_with_its_context()
    {
        var w = await NewWorld("prog-save");
        var story = await CreateStory(w.Client, w.U, "The Saiyan Saga");
        var scene = await CreateScene(w.Client, w.U, story, "Arrival");
        var rival = await Entry(w, "Vegeta");
        var rank = (await FieldOf(w, w.Rank)).Options.Single(option => option.Value == "Elite").Id;
        var before = await Detail(w);

        var saved = await Save(w, 0,
            Era("Saiyan Saga", "Arrives on Earth.", start: Year(737), end: Year(762), stories: [story], scenes: [scene],
                fields: [Text(w.Title, "Kakarot"), Number(w.Power, 9000), Choose(w.Rank, rank), Link(w.Ally, rival), Cleared(w.Motto)]),
            Era("Frieza Saga"));

        Assert.Equal(1, saved.Version);
        Assert.Equal(["Saiyan Saga", "Frieza Saga"], saved.Eras.Select(era => era.Name));
        var saiyan = saved.Eras[0];
        Assert.Equal("Arrives on Earth.", saiyan.Description);
        Assert.Equal(737, saiyan.Start!.Year);
        Assert.Equal(762, saiyan.End!.Year);
        Assert.Equal("The Saiyan Saga", Assert.Single(saiyan.Stories).Title);
        Assert.Equal("Arrival", Assert.Single(saiyan.Scenes).Title);

        var fields = saiyan.Fields.ToDictionary(field => field.FieldDefinitionId);
        Assert.Equal("Kakarot", fields[w.Title].Text);
        Assert.Equal(9000, fields[w.Power].Number);
        Assert.Equal(["Elite"], fields[w.Rank].OptionValues);
        Assert.Equal("Vegeta", fields[w.Ally].ReferencedEntityName);
        Assert.True(fields[w.Motto].Cleared);

        // An era that sets nothing inherits everything from the entry; no era is carried into the next.
        Assert.Empty(saved.Eras[1].Fields);

        Same(saved, await Read(w));
        var after = await Detail(w);
        Assert.True(after.HasProgression);
        Assert.Equal(before.Fields, after.Fields);
        Assert.Equal(before.Version, after.Version);
    }

    [Fact]
    public async Task A_required_field_cannot_be_left_empty_in_an_era()
    {
        var w = await NewWorld("prog-required");
        var name = await AddField(w, "True name", EntityFieldKind.ShortText, required: true);
        await SaveEntry(w, [new FieldValueInput(name, "Kakarot", null, null, null, null, null)]);

        var refused = await Put(w, 0, Era("Saiyan Saga", fields: [Cleared(name)]));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains($"eras[0].fields.{name}", await Errors(refused), StringComparison.Ordinal);
        Assert.Empty((await Read(w)).Eras);

        // Setting it for the era is fine; so is inheriting it.
        var saved = await Save(w, 0, Era("Saiyan Saga", fields: [Text(name, "Son Goku")]), Era("Frieza Saga"));
        Assert.Equal("Son Goku", saved.Eras[0].Fields.Single().Text);
    }

    [Fact]
    public async Task Eras_keep_their_ids_through_a_reorder_and_a_removed_era_takes_its_overrides()
    {
        var w = await NewWorld("prog-order");
        var first = await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Title, "Kakarot")]), Era("Frieza Saga", fields: [Text(w.Title, "Goku")]));
        var (saiyan, frieza) = (first.Eras[0].Id, first.Eras[1].Id);

        var reordered = await Save(w, first.Version, Keep(first.Eras[1]), Keep(first.Eras[0]));
        Assert.Equal([frieza, saiyan], reordered.Eras.Select(era => era.Id));
        Assert.Equal([0, 1], reordered.Eras.Select(era => era.SortOrder));

        var removed = await Save(w, reordered.Version, Keep(reordered.Eras[1]));
        Assert.Equal([saiyan], removed.Eras.Select(era => era.Id));
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.EntityEras.AnyAsync(era => era.Id == frieza));
            Assert.False(await db.EntityEraFieldValues.AnyAsync(value => value.EntityEraId == frieza));
        });
    }

    [Fact]
    public async Task A_stale_save_is_refused_and_an_unchanged_one_records_nothing()
    {
        var w = await NewWorld("prog-stale");
        var saved = await Save(w, 0, Era("Saiyan Saga"));

        var stale = await Put(w, 0, Era("Cell Saga"));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(ProgressionEndpoints.ChangedCode, await CodeOf(stale));
        Assert.Equal(["Saiyan Saga"], (await Read(w)).Eras.Select(era => era.Name));

        var again = await Save(w, saved.Version, Keep(saved.Eras[0]));
        Assert.Equal(saved.Version, again.Version);
        Assert.Single(await Revisions(w));
    }

    [Fact]
    public async Task A_save_that_leaves_eras_out_keeps_them()
    {
        var w = await NewWorld("prog-absent");
        var saved = await Save(w, 0, Era("Saiyan Saga"));

        var response = await w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(null, saved.Version));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(["Saiyan Saga"], (await Read(w)).Eras.Select(era => era.Name));
    }

    [Fact]
    public async Task Names_dates_stories_and_ids_are_checked()
    {
        var w = await NewWorld("prog-checks");
        var story = await CreateStory(w.Client, w.U, "Gone soon");
        var other = await NewWorld("prog-checks-other");

        await Refused(w, "eras[1].name", Era("Saga"), Era("saga"));
        await Refused(w, "eras[0].name", Era("  "));
        await Refused(w, "eras[0].end.year", Era("Backwards", start: Year(12), end: Year(10)));
        await Refused(w, "eras[0].id", Era("Stolen") with { Id = Guid.NewGuid() });

        // A bound covers its whole precision: a start in month 5 of year 10 and an end of "year 10" is one year's span.
        var saved = await Save(w, 0, Era("Same year", start: new ChronologyValue(null, 10, 5, null), end: Year(10)), Era("Covered", stories: [story]));

        // A story of another universe is refused; one moved to the Trash is kept on the era that had it, not newly linked.
        var otherStory = await CreateStory(other.Client, other.U, "Elsewhere");
        await Refused(w, "eras[0].storyIds", Era("Away", stories: [otherStory]));
        (await w.Client.DeleteAsync($"{Story(w.U, story)}")).EnsureSuccessStatusCode();

        var kept = await Save(w, saved.Version, Keep(saved.Eras[0]), Keep(saved.Eras[1]) with { Name = "Covered, renamed" });
        Assert.True(Assert.Single(kept.Eras[1].Stories).IsTrashed);
        await Refused(w, "eras[2].storyIds", Keep(kept.Eras[0]), Keep(kept.Eras[1]), Era("New", stories: [story]));
    }

    [Fact]
    public async Task The_entry_save_and_a_restored_entry_version_never_touch_the_eras()
    {
        var w = await NewWorld("prog-entry");
        await SaveEntry(w, [new FieldValueInput(w.Title, "Goku", null, null, null, null, null)]);
        await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Title, "Kakarot")]));

        await SaveEntry(w, [new FieldValueInput(w.Title, "Son Goku", null, null, null, null, null)]);

        var progression = await Read(w);
        Assert.Equal("Kakarot", progression.Eras[0].Fields.Single().Text);
        Assert.Equal("Son Goku", (await Detail(w)).Fields.Single(field => field.FieldDefinitionId == w.Title).Text);

        var first = (await w.Client.GetFromJsonAsync<List<EntityRevisionSummary>>($"{EntryRoute(w)}/revisions"))!.Single(one => one.Number == 1);
        var restored = await w.Client.PostAsJsonAsync($"{EntryRoute(w)}/revisions/{first.Id}/restore", new EntityRevisionRestoreRequest((await Detail(w)).Version));
        Assert.True(restored.IsSuccessStatusCode, await restored.Content.ReadAsStringAsync());
        Same(progression, await Read(w));
    }

    // ---------- History ----------

    [Fact]
    public async Task Every_save_is_a_version_and_a_restore_brings_back_a_removed_era_with_its_id()
    {
        var w = await NewWorld("prog-history");
        var first = await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Title, "Kakarot")]), Era("Frieza Saga"));
        var frieza = first.Eras[1].Id;
        var second = await Save(w, first.Version, Keep(first.Eras[0]) with { Description = "Rewritten." });

        var history = await Revisions(w);
        Assert.Equal([2, 1], history.Select(revision => revision.Number));
        Assert.Equal([EntityRevisionKind.Edited, EntityRevisionKind.Created], history.Select(revision => revision.Kind));
        Assert.All(history, revision => Assert.Equal($"user-prog-history", revision.ActorName));

        var version = (await w.Client.GetFromJsonAsync<ProgressionRevisionDetail>($"{Route(w)}/revisions/{history[1].Id}"))!;
        Assert.Equal(["Saiyan Saga", "Frieza Saga"], version.Eras.Select(era => era.Name));

        var restore = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{history[1].Id}/restore", new ProgressionRestoreRequest(second.Version));
        Assert.True(restore.IsSuccessStatusCode, await restore.Content.ReadAsStringAsync());
        var restored = (await restore.Content.ReadFromJsonAsync<ProgressionResponse>())!;
        Assert.Equal([first.Eras[0].Id, frieza], restored.Eras.Select(era => era.Id));
        Assert.Null(restored.Eras[0].Description);

        var latest = (await Revisions(w))[0];
        Assert.Equal(EntityRevisionKind.Restored, latest.Kind);
        Assert.Equal(history[1].Id, latest.RestoredFromRevisionId);

        // Named over an older version, it is refused like any stale save.
        var stale = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{history[0].Id}/restore", new ProgressionRestoreRequest(second.Version));
        Assert.Equal(ProgressionEndpoints.ChangedCode, await CodeOf(stale));
    }

    [Fact]
    public async Task A_version_naming_a_field_archived_since_is_not_restored_without_it()
    {
        var w = await NewWorld("prog-history-archived");
        var first = await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Motto, "Fight on")]));
        var second = await Save(w, first.Version, Era("Cell Saga"));
        var version = (await Revisions(w)).Single(revision => revision.Number == 1);

        (await w.Client.PostAsync($"{FieldRoute(w, w.Motto)}/archive", null)).EnsureSuccessStatusCode();

        var refused = await w.Client.PostAsJsonAsync($"{Route(w)}/revisions/{version.Id}/restore", new ProgressionRestoreRequest((await Read(w)).Version));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(ProgressionEndpoints.RevisionUnrestorableCode, await CodeOf(refused));
        Assert.Equal(["Cell Saga"], (await Read(w)).Eras.Select(era => era.Name));
        Assert.Equal(second.Eras[0].Id, (await Read(w)).Eras[0].Id);
    }

    [Fact]
    public async Task Set_with_nothing_in_it_is_refused_rather_than_inherited_and_a_date_round_trips()
    {
        var w = await NewWorld("prog-blank");
        var born = await AddField(w, "Day of note", EntityFieldKind.Date);
        var tags = await AddField(w, "Traits", EntityFieldKind.MultiSelect, options: ["Brave", "Kind"]);

        await Refused(w, $"eras[0].fields.{w.Title}", Era("Saiyan Saga", fields: [Text(w.Title, "   ")]));
        await Refused(w, $"eras[0].fields.{tags}", Era("Saiyan Saga", fields: [new EraFieldInput(tags, false, null, null, null, null, [], null)]));

        var date = new DateTime(2024, 5, 3);
        var saved = await Save(w, 0, Era("Saiyan Saga", fields: [new EraFieldInput(born, false, null, null, null, date, null, null)]));
        Assert.Equal(date, saved.Eras[0].Fields.Single().Date);

        // Sent back unchanged, it is the same progression: nothing new is recorded.
        var again = await Save(w, saved.Version, Keep(saved.Eras[0]));
        Assert.Equal(saved.Version, again.Version);
    }

    // ---------- Field protections ----------

    [Fact]
    public async Task A_field_an_era_overrides_cannot_be_deleted_retyped_or_lose_its_option()
    {
        var w = await NewWorld("prog-field");
        var elite = (await FieldOf(w, w.Rank)).Options.Single(option => option.Value == "Elite").Id;
        await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Motto, "Fight on"), Choose(w.Rank, elite)]));

        var deleted = await w.Client.DeleteAsync(FieldRoute(w, w.Motto));
        Assert.Equal(EntityTypeEndpoints.FieldInUseCode, await CodeOf(deleted));
        Assert.Equal(1, (await FieldOf(w, w.Motto)).EntryCount);

        var motto = await FieldOf(w, w.Motto);
        var rekind = await w.Client.PutFieldAsync(w.U, w.Character, w.Motto,
            new FieldDefinitionRequest("Motto", EntityFieldKind.Number, false, null, null, null));
        Assert.Equal(EntityTypeEndpoints.KindLockedCode, await CodeOf(rekind));

        var dropOption = await w.Client.PutFieldAsync(w.U, w.Character, w.Rank,
            new FieldDefinitionRequest("Rank", EntityFieldKind.Select, false, null, null, ["Low-class"]));
        Assert.Equal(HttpStatusCode.Conflict, dropOption.StatusCode);
        Assert.Equal(motto.Version, (await FieldOf(w, w.Motto)).Version);
    }

    [Fact]
    public async Task A_field_an_older_version_of_the_eras_names_cannot_be_deleted()
    {
        var w = await NewWorld("prog-field-history");
        var saved = await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Motto, "Fight on")]));
        await Save(w, saved.Version, Era("Saiyan Saga") with { Id = saved.Eras[0].Id });

        var deleted = await w.Client.DeleteAsync(FieldRoute(w, w.Motto));
        Assert.Equal(EntityTypeEndpoints.FieldInHistoryCode, await CodeOf(deleted));
    }

    [Fact]
    public async Task An_entry_whose_eras_set_its_fields_cannot_change_type()
    {
        var w = await NewWorld("prog-retype");
        await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Title, "Kakarot")]));
        var place = (await TypesOf(w)).Single(type => type.Name == "Location").Id;

        var detail = await Detail(w);
        var moved = await w.Client.PutAsJsonAsync(EntryRoute(w), new EntityRequest(place, detail.Name, null, CanonStatus.Canon, null, null, [], detail.Version));
        Assert.Equal(EntityEndpoints.TypeChangeProgressionCode, await CodeOf(moved));
        Assert.Equal(w.Character, (await Detail(w)).EntityTypeId);
    }

    [Fact]
    public async Task A_field_an_era_leaves_empty_cannot_become_required()
    {
        var w = await NewWorld("prog-required-later");
        await SaveEntry(w, [new FieldValueInput(w.Motto, "Fight on", null, null, null, null, null)]);
        await Save(w, 0, Era("Saiyan Saga", fields: [Cleared(w.Motto)]));

        var response = await w.Client.PutFieldAsync(w.U, w.Character, w.Motto,
            new FieldDefinitionRequest("Motto", EntityFieldKind.ShortText, true, null, null, null));
        Assert.Equal(EntityTypeEndpoints.RequiredClearedCode, await CodeOf(response));
    }

    [Fact]
    public async Task Archiving_a_field_hides_its_overrides_keeps_them_and_moves_the_version_on()
    {
        var w = await NewWorld("prog-archive");
        var saved = await Save(w, 0, Era("Saiyan Saga", fields: [Text(w.Motto, "Fight on"), Text(w.Title, "Kakarot")]));

        (await w.Client.PostAsync($"{FieldRoute(w, w.Motto)}/archive", null)).EnsureSuccessStatusCode();

        var archived = await Read(w);
        Assert.Equal([w.Title], archived.Eras[0].Fields.Select(field => field.FieldDefinitionId));
        Assert.True(archived.Version > saved.Version);

        // A save made now, which cannot carry the archived field, leaves its override alone; removing the era is refused.
        await Save(w, archived.Version, Keep(archived.Eras[0]) with { Description = "Still here." });
        var removal = await Put(w, (await Read(w)).Version);
        Assert.Equal(ProgressionEndpoints.EraArchivedValuesCode, await CodeOf(removal));

        (await w.Client.PostAsJsonAsync($"{FieldRoute(w, w.Motto)}/restore", new FieldRestoreRequest())).EnsureSuccessStatusCode();
        Assert.Contains((await Read(w)).Eras[0].Fields, field => field.FieldDefinitionId == w.Motto && field.Text == "Fight on");
    }

    [Fact]
    public async Task Deleting_a_linked_entry_for_good_removes_the_override_that_named_it()
    {
        var w = await NewWorld("prog-link-gone");
        var rival = await Entry(w, "Raditz");
        await Save(w, 0, Era("Saiyan Saga", fields: [Link(w.Ally, rival), Text(w.Title, "Kakarot")]));

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{rival}")).EnsureSuccessStatusCode();
        Assert.True((await Read(w)).Eras[0].Fields.Single(field => field.FieldDefinitionId == w.Ally).ReferencedEntityIsTrashed);

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/trash/{rival}")).EnsureSuccessStatusCode();
        Assert.Equal([w.Title], (await Read(w)).Eras[0].Fields.Select(field => field.FieldDefinitionId));
    }

    // ---------- Chronology, Trash and access ----------

    [Fact]
    public async Task An_era_is_dated_on_the_universes_own_chronology()
    {
        var w = await NewWorld("prog-chronology");
        var chronology = await PutJson<ChronologyResponse>(w.Client, $"/api/universes/{w.U}/chronology", new ChronologyRequest(
            [new ChronologyEraRequest(null, "Age of Dragons", "AD", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]));
        var age = chronology.Eras.Single().Id;

        await Refused(w, "eras[0].start.eraId", Era("Undated", start: Year(749)));
        var saved = await Save(w, 0, Era("Saiyan Saga", start: new ChronologyValue(age, 749, 5, 7)));
        Assert.Equal(1, (await w.Client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{w.U}/chronology"))!.Eras.Single().EntryEraCount);

        var removal = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/chronology", new ChronologyRequest([]));
        Assert.Equal(HttpStatusCode.Conflict, removal.StatusCode);
        Assert.Contains("1 era of an entry", await removal.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Turning on a custom calendar moves the era's month to the calendar's month at its place, and back again.
        var calendar = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/chronology/calendar", new ChronologyCalendarRequest(
            [.. Enumerable.Range(1, 6).Select(month => new ChronologyCalendarMonthRequest(null, $"Moon {month}", null, 30))]));
        Assert.True(calendar.IsSuccessStatusCode, await calendar.Content.ReadAsStringAsync());
        var monthId = (await Read(w)).Eras[0].Start!.MonthId;
        Assert.NotNull(monthId);
        Assert.Null((await Read(w)).Eras[0].Start!.Month);

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/chronology/calendar")).EnsureSuccessStatusCode();
        Assert.Equal(saved.Eras[0].Start, (await Read(w)).Eras[0].Start);
    }

    [Fact]
    public async Task A_trashed_entry_keeps_its_eras_out_of_reach_until_it_is_restored()
    {
        var w = await NewWorld("prog-trash");
        var saved = await Save(w, 0, Era("Saiyan Saga"));

        (await w.Client.DeleteAsync(EntryRoute(w))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.GetAsync(Route(w))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Put(w, saved.Version, Era("While away"))).StatusCode);

        (await w.Client.PostAsync($"/api/universes/{w.U}/trash/{w.Entry}/restore", null)).EnsureSuccessStatusCode();
        Same(saved, await Read(w));
    }

    [Fact]
    public async Task A_viewer_reads_the_eras_and_cannot_save_them()
    {
        var w = await NewWorld("prog-viewer");
        await Save(w, 0, Era("Saiyan Saga"));
        var viewer = await SignedIn(_factory, "user-prog-viewer-member");
        var viewerId = await WithDbResult(_factory, db => db.Users.Where(user => user.UserName == "user-prog-viewer-member").Select(user => user.Id).SingleAsync());
        await CollaborationTestClient.Join(_factory, w.U, viewerId, Lorex.Api.Features.Universes.UniverseRole.Viewer);

        Assert.Equal(["Saiyan Saga"], (await viewer.GetFromJsonAsync<ProgressionResponse>(Route(w)))!.Eras.Select(era => era.Name));
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PutAsJsonAsync(Route(w), new ProgressionRequest([], 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"{Route(w)}/revisions")).StatusCode);

        var stranger = await SignedIn(_factory, "user-prog-viewer-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Route(w))).StatusCode);
    }

    [Fact]
    public async Task Deleting_the_universe_takes_every_era_with_it()
    {
        var w = await NewWorld("prog-universe-gone");
        var chronology = await PutJson<ChronologyResponse>(w.Client, $"/api/universes/{w.U}/chronology", new ChronologyRequest(
            [new ChronologyEraRequest(null, "Age of Dragons", "AD", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]));
        var story = await CreateStory(w.Client, w.U, "The Saiyan Saga");
        var elite = (await FieldOf(w, w.Rank)).Options.Single(option => option.Value == "Elite").Id;
        await Save(w, 0, Era("Saiyan Saga", start: new ChronologyValue(chronology.Eras[0].Id, 1, null, null), stories: [story],
            fields: [Choose(w.Rank, elite), Number(w.Power, 9000) with { EraId = chronology.Eras[0].Id }, Cleared(w.Motto)]));

        (await w.Client.PostAsync($"/api/universes/{w.U}/archive", null)).EnsureSuccessStatusCode();
        (await w.Client.DeleteAsync($"/api/universes/{w.U}")).EnsureSuccessStatusCode();

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.EntityEras.AnyAsync(era => era.EntityId == w.Entry));
            Assert.False(await db.EntityProgressions.AnyAsync(row => row.EntityId == w.Entry));
            Assert.False(await db.EntityProgressionRevisions.AnyAsync(row => row.EntityId == w.Entry));
        });
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_the_eras_and_their_history_and_a_restore_brings_them_back_under_new_ids()
    {
        var w = await NewWorld("prog-backup");
        var story = await CreateStory(w.Client, w.U, "The Saiyan Saga");
        var rival = await Entry(w, "Vegeta");
        var first = await Save(w, 0, Era("Saiyan Saga", "Arrives.", start: Year(737), end: Year(762), stories: [story],
            fields: [Text(w.Title, "Kakarot"), Link(w.Ally, rival), Cleared(w.Motto)]));
        await Save(w, first.Version, Keep(first.Eras[0]), Era("Frieza Saga"));

        var backup = await Backup(w.Client, w.U);
        Assert.Equal(32, backup.FormatVersion);
        var progression = backup.Payload.Entities.Single(entity => entity.Id == w.Entry).Progression!;
        Assert.Equal(["Saiyan Saga", "Frieza Saga"], progression.Eras.Select(era => era.Name));
        Assert.Equal(3, progression.Eras[0].FieldValues.Count);
        Assert.Equal([1, 2], progression.Revisions.Select(revision => revision.Number));

        var restored = await RestoreTestClient.RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "Restored progression");
        var entry = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?search=Goku"))!.Items.Single();
        var copy = (await w.Client.GetFromJsonAsync<ProgressionResponse>($"/api/universes/{restored.Id}/entities/{entry.Id}/progression"))!;

        Assert.Equal(["Saiyan Saga", "Frieza Saga"], copy.Eras.Select(era => era.Name));
        Assert.DoesNotContain(copy.Eras, era => first.Eras.Any(original => original.Id == era.Id));
        var saiyan = copy.Eras[0];
        Assert.Equal("The Saiyan Saga", Assert.Single(saiyan.Stories).Title);
        Assert.Equal("Vegeta", saiyan.Fields.Single(field => field.ReferencedEntityId is not null).ReferencedEntityName);
        Assert.Contains(saiyan.Fields, field => field.Cleared);

        // The restored history restores: version 1 comes back exactly, under the restored ids.
        var history = (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"/api/universes/{restored.Id}/entities/{entry.Id}/progression/revisions"))!;
        var put = await w.Client.PostAsJsonAsync(
            $"/api/universes/{restored.Id}/entities/{entry.Id}/progression/revisions/{history.Single(one => one.Number == 1).Id}/restore",
            new ProgressionRestoreRequest(copy.Version));
        Assert.True(put.IsSuccessStatusCode, await put.Content.ReadAsStringAsync());
        Assert.Equal(["Saiyan Saga"], (await put.Content.ReadFromJsonAsync<ProgressionResponse>())!.Eras.Select(era => era.Name));
    }

    [Fact]
    public async Task A_backup_whose_era_breaks_what_a_save_allows_is_refused()
    {
        var w = await NewWorld("prog-backup-bad");
        var name = await AddField(w, "True name", EntityFieldKind.ShortText, required: true);
        await SaveEntry(w, [new FieldValueInput(name, "Kakarot", null, null, null, null, null)]);
        await Save(w, 0, Era("Saiyan Saga", start: Year(10), end: Year(12), fields: [Text(name, "Son Goku")]));
        var archive = await RawArchive(w.Client, w.U);

        System.Text.Json.Nodes.JsonObject Era0(System.Text.Json.Nodes.JsonObject root) =>
            root["payload"]!["entities"]!.AsArray().Single(entity => entity!["name"]!.GetValue<string>() == "Goku")!["progression"]!["eras"]![0]!.AsObject();

        var cleared = RestoreTestClient.Rewrite(archive, root =>
        {
            var value = Era0(root)["fieldValues"]![0]!.AsObject();
            value["isCleared"] = true;
            value["textValue"] = null;
        });
        Assert.Contains((await RestoreTestClient.Refused(await RestoreTestClient.Validate(w.Client, cleared))).Issues,
            issue => issue.Message.Contains("leaves a required field empty", StringComparison.Ordinal));

        var empty = RestoreTestClient.Rewrite(archive, root => Era0(root)["fieldValues"]![0]!["textValue"] = null);
        Assert.Contains((await RestoreTestClient.Refused(await RestoreTestClient.Validate(w.Client, empty))).Issues,
            issue => issue.Message.Contains("sets a field to nothing", StringComparison.Ordinal));

        var backwards = RestoreTestClient.Rewrite(archive, root => Era0(root)["end"]!["year"] = 9);
        Assert.Contains((await RestoreTestClient.Refused(await RestoreTestClient.Validate(w.Client, backwards))).Issues,
            issue => issue.Message.Contains("ends before it starts", StringComparison.Ordinal));
    }

    // ---------- Helpers ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var w = new World(client, universe.Id, Guid.Empty, Guid.Empty, Guid.Empty, Guid.Empty, Guid.Empty, Guid.Empty, Guid.Empty);
        var character = (await TypesOf(w)).Single(type => type.Name == "Character").Id;
        w = w with { Character = character };

        w = w with
        {
            Title = await AddField(w, "Title", EntityFieldKind.ShortText),
            Power = await AddField(w, "Power level", EntityFieldKind.Number),
            Rank = await AddField(w, "Rank", EntityFieldKind.Select, options: ["Low-class", "Elite"]),
            Ally = await AddField(w, "Ally", EntityFieldKind.EntityReference),
            Motto = await AddField(w, "Motto", EntityFieldKind.ShortText),
        };

        return w with { Entry = await Entry(w, "Goku") };
    }

    private static async Task<Guid> AddField(World w, string name, EntityFieldKind kind, bool required = false, IReadOnlyList<string>? options = null)
    {
        var response = await w.Client.PostAsJsonAsync(
            $"/api/universes/{w.U}/entity-types/{w.Character}/fields",
            new FieldDefinitionRequest(name, kind, required, null, null, options));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task<List<EntityTypeResponse>> TypesOf(World w) =>
        (await w.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{w.U}/entity-types"))!;

    private static async Task<FieldDefinitionResponse> FieldOf(World w, Guid fieldId) =>
        (await TypesOf(w)).Single(type => type.Id == w.Character).Fields.Single(field => field.Id == fieldId);

    private static string FieldRoute(World w, Guid fieldId) => $"/api/universes/{w.U}/entity-types/{w.Character}/fields/{fieldId}";

    private static async Task<Guid> Entry(World w, string name) =>
        (await PostJson<EntityDetail>(w.Client, $"/api/universes/{w.U}/entities",
            new EntityRequest(w.Character, name, null, CanonStatus.Canon, null, null, null))).Id;

    private static string EntryRoute(World w) => $"/api/universes/{w.U}/entities/{w.Entry}";

    private static string Route(World w) => $"{EntryRoute(w)}/progression";

    private static async Task<EntityDetail> Detail(World w) => (await w.Client.GetFromJsonAsync<EntityDetail>(EntryRoute(w)))!;

    private static async Task SaveEntry(World w, IReadOnlyList<FieldValueInput> fields)
    {
        var detail = await Detail(w);
        var response = await w.Client.PutAsJsonAsync(EntryRoute(w), new EntityRequest(w.Character, detail.Name, null, CanonStatus.Canon, null, null, fields, detail.Version));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static async Task<ProgressionResponse> Read(World w) => (await w.Client.GetFromJsonAsync<ProgressionResponse>(Route(w)))!;

    private static async Task<List<ProgressionRevisionSummary>> Revisions(World w) =>
        (await w.Client.GetFromJsonAsync<List<ProgressionRevisionSummary>>($"{Route(w)}/revisions"))!;

    private static Task<HttpResponseMessage> Put(World w, int version, params EraInput[] eras) =>
        w.Client.PutAsJsonAsync(Route(w), new ProgressionRequest(eras, version));

    private static async Task<ProgressionResponse> Save(World w, int version, params EraInput[] eras)
    {
        var response = await Put(w, version, eras);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProgressionResponse>())!;
    }

    private async Task Refused(World w, string key, params EraInput[] eras)
    {
        var response = await Put(w, (await Read(w)).Version, eras);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await Errors(response), StringComparison.Ordinal);
    }

    private static EraInput Era(
        string name,
        string? description = null,
        ChronologyValue? start = null,
        ChronologyValue? end = null,
        IReadOnlyList<Guid>? stories = null,
        IReadOnlyList<Guid>? scenes = null,
        IReadOnlyList<EraFieldInput>? fields = null) =>
        new(null, name, description, start, end, stories, scenes, fields);

    /// <summary>An era as read, sent back unchanged - what the editor does for every era it did not touch.</summary>
    private static EraInput Keep(EraResponse era) => new(
        era.Id,
        era.Name,
        era.Description,
        era.Start,
        era.End,
        [.. era.Stories.Select(story => story.Id)],
        [.. era.Scenes.Select(scene => scene.Id)],
        [.. era.Fields.Select(field => new EraFieldInput(
            field.FieldDefinitionId, field.Cleared, field.Text, field.Number, field.Boolean, field.Date,
            field.OptionIds, field.ReferencedEntityId, field.EraId))]);

    private static ChronologyValue Year(int year) => new(null, year, null, null);

    private static EraFieldInput Text(Guid field, string text) => new(field, false, text, null, null, null, null, null);

    private static EraFieldInput Number(Guid field, double number) => new(field, false, null, number, null, null, null, null);

    private static EraFieldInput Choose(Guid field, Guid option) => new(field, false, null, null, null, null, [option], null);

    private static EraFieldInput Link(Guid field, Guid entity) => new(field, false, null, null, null, null, null, entity);

    private static EraFieldInput Cleared(Guid field) => new(field, true, null, null, null, null, null, null);

    /// <summary>Two reads compared by what they say: records holding lists compare those by reference otherwise.</summary>
    private static void Same(ProgressionResponse expected, ProgressionResponse actual) =>
        Assert.Equal(JsonSerializer.Serialize(expected), JsonSerializer.Serialize(actual));

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private static async Task<T> WithDbResult<T>(LorexApiFactory factory, Func<Lorex.Api.Data.LorexDbContext, Task<T>> read)
    {
        T result = default!;
        await WithDb(factory, async db => result = await read(db));
        return result;
    }
}
