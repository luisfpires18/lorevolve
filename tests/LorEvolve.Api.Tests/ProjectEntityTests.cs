using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Restore;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A project's own schema and entries (#144): a game defines Map, Unit and Item types with fields of its own, holds
/// entries of them, and may point an entry at a lore entry without ever having to.
///
/// <para>Written against what would be silently wrong rather than loudly broken. <b>Isolation:</b> one project's types
/// and entries must not be reachable from another project, nor from the universe's lore, and the engine is shared, so
/// the check has to be that the shared path really scopes itself. <b>Optional lore:</b> a game in a universe with no
/// worldbuilding at all has to work end to end, because that is the case the owner's hierarchy explicitly allows.
/// <b>Starter types:</b> offered and then owned by the author, so renaming and deleting one has to work and applying
/// the template twice must not overwrite what they made.</para>
/// </summary>
public sealed class ProjectEntityTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_starter_types_are_offered_once_and_then_the_authors_to_rename_or_delete()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gametemplate");
        var project = await NewProject(client, universe.Id, "Hollow Season");

        // A project starts with no types at all: nothing is imposed.
        Assert.Empty(await Types(client, project.Id));

        var offer = await client.GetFromJsonAsync<ProjectTemplateResponse>($"/api/projects/{project.Id}/template");
        Assert.Equal("Game", offer!.Name);
        Assert.Equal(["Map", "Unit", "Item"], offer.Types);
        Assert.False(offer.AlreadyApplied);

        var applied = await Apply(client, project.Id);
        Assert.Equal(["Map", "Unit", "Item"], applied.Select(type => type.Name));

        // Applied once. A second attempt is refused rather than duplicating or replacing the author's schema.
        var again = await client.PostAsync($"/api/projects/{project.Id}/template", null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);

        // From here the types are the author's: one renamed, one deleted, one added.
        var map = applied.First(type => type.Name == "Map");
        var item = applied.First(type => type.Name == "Item");

        var renamed = await Put<ProjectEntityTypeResponse>(
            client,
            $"/api/projects/{project.Id}/entity-types/{map.Id}",
            new ProjectEntityTypeRequest("Arena", "Where a match is played.", null, null));
        Assert.Equal("Arena", renamed.Name);

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/projects/{project.Id}/entity-types/{item.Id}")).StatusCode);

        await NewType(client, project.Id, "Encounter");

        Assert.Equal(["Arena", "Unit", "Encounter"], (await Types(client, project.Id)).Select(type => type.Name));
    }

    [Fact]
    public async Task A_map_records_the_player_counts_it_supports_without_fixing_how_many_maps_there_are()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gameplayers");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var types = await Apply(client, project.Id);

        var map = types.First(type => type.Name == "Map");
        var players = map.Fields.First(field => field.Name == "Supported players");

        Assert.Equal(EntityFieldKind.MultiSelect, players.Kind);
        Assert.Equal(["2", "3", "4", "5", "6", "7", "8"], players.Options.Select(option => option.Value));
        Assert.False(players.IsRequired);

        // A map supports a set of counts, not one: two against two plays at 2 and at 4.
        var two = players.Options.First(option => option.Value == "2").Id;
        var four = players.Options.First(option => option.Value == "4").Id;

        var created = await NewEntry(
            client,
            project.Id,
            map.Id,
            "Saltflats",
            fields: [new FieldValueInput(players.Id, null, null, null, null, [two, four], null)]);

        var stored = created.Fields.First(field => field.FieldDefinitionId == players.Id);
        Assert.Equal(["2", "4"], stored.OptionValues.Order(StringComparer.Ordinal));

        // And nothing says how many maps a game has: one is as valid as eight.
        Assert.Single(await Entries(client, project.Id, map.Id));
    }

    [Fact]
    public async Task A_project_s_entry_is_validated_against_its_own_type_s_fields()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gamefields");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var unit = await NewType(client, project.Id, "Unit");

        var cost = await AddField(client, project.Id, unit.Id, new ProjectEntityFieldRequest("Cost", EntityFieldKind.Number));
        var costField = cost.Fields.First(field => field.Name == "Cost");

        var created = await NewEntry(
            client,
            project.Id,
            unit.Id,
            "  Saltbearer  ",
            fields: [new FieldValueInput(costField.Id, null, 35, null, null, null, null)]);

        Assert.Equal("Saltbearer", created.Name);
        Assert.Equal(35, created.Fields.First(field => field.FieldDefinitionId == costField.Id).Number);

        // A type from another project, or from the lore, is not a type of this project.
        var other = await NewProject(client, universe.Id, "Another game");
        var otherType = await NewType(client, other.Id, "Unit");

        var refused = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities",
            new ProjectEntityRequest(otherType.Id, "Smuggled", null));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        Guid loreTypeId = default;
        await WithDb(_factory, async db =>
            loreTypeId = await db.EntityTypes.Where(type => type.UniverseId == universe.Id).Select(type => type.Id).FirstAsync());

        var refusedLore = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities",
            new ProjectEntityRequest(loreTypeId, "Lore typed", null));
        Assert.Equal(HttpStatusCode.BadRequest, refusedLore.StatusCode);
    }

    [Fact]
    public async Task A_field_that_holds_values_keeps_its_kind_and_its_choices()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gamelocks");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var unit = await NewType(client, project.Id, "Unit");

        var withField = await AddField(
            client,
            project.Id,
            unit.Id,
            new ProjectEntityFieldRequest("Role", EntityFieldKind.Select, Options: ["Scout", "Siege"]));
        var role = withField.Fields.First(field => field.Name == "Role");
        var scout = role.Options.First(option => option.Value == "Scout").Id;

        await NewEntry(
            client,
            project.Id,
            unit.Id,
            "Saltbearer",
            fields: [new FieldValueInput(role.Id, null, null, null, null, [scout], null)]);

        var path = $"/api/projects/{project.Id}/entity-types/{unit.Id}/fields/{role.Id}";

        // Reinterpreting a stored choice as a number would not convert the data, it would change what it means.
        var kindChange = await client.PutAsJsonAsync(path, new ProjectEntityFieldRequest("Role", EntityFieldKind.Number));
        Assert.Equal(HttpStatusCode.Conflict, kindChange.StatusCode);

        // And removing a choice an entry has made would clear that entry's value behind the author's back.
        var optionRemoved = await client.PutAsJsonAsync(
            path,
            new ProjectEntityFieldRequest("Role", EntityFieldKind.Select, Options: ["Siege"]));
        Assert.Equal(HttpStatusCode.Conflict, optionRemoved.StatusCode);

        // Deleting the field itself is refused for the same reason, and the type with it.
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(path)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await client.DeleteAsync($"/api/projects/{project.Id}/entity-types/{unit.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_game_in_a_universe_with_no_lore_works_and_the_canon_link_stays_optional()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gamenolore");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var unit = await NewType(client, project.Id, "Unit");

        // The universe's starter types exist, but it holds no lore entries at all: the case the hierarchy allows, where
        // a game's universe carries very little worldbuilding.
        await WithDb(_factory, async db =>
            Assert.Empty(await db.Entities.Where(entry => entry.UniverseId == universe.Id).ToListAsync()));

        var unlinked = await NewEntry(client, project.Id, unit.Id, "Saltbearer");
        Assert.Single(await Entries(client, project.Id));
        _ = unlinked;

        // Now a lore entry exists, and the game may point at it.
        var loreId = await CreateEntity(client, universe.Id, "Alenna Vance");

        var linked = await NewEntry(client, project.Id, unit.Id, "Alenna", canonEntityId: loreId);
        var rows = await Entries(client, project.Id);
        var row = rows.First(each => each.Id == linked.Id);

        Assert.Equal(loreId, row.CanonEntityId);
        Assert.Equal("Alenna Vance", row.CanonEntityName);
        Assert.Equal(loreId, (await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project.Id}/entities/{linked.Id}"))!.CanonEntityId);

        // A link to something that is not a lore entry of this universe is refused by field.
        var refused = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities",
            new ProjectEntityRequest(unit.Id, "Impossible", null, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        // And the database will not let that lore entry be deleted out from under the project entry.
        await WithDb(_factory, async db =>
        {
            db.Entities.Remove(await db.Entities.FirstAsync(entry => entry.Id == loreId));
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        });
    }

    [Fact]
    public async Task A_project_s_types_and_entries_are_not_the_universe_s_lore_nor_another_project_s()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gameisolation");
        var first = await NewProject(client, universe.Id, "First game");
        var second = await NewProject(client, universe.Id, "Second game");

        // Two projects of one universe may each have a type of the same name, which is what the partial unique indexes
        // of #143 allow and a single index over the nullable column would not have.
        var firstUnit = await NewType(client, first.Id, "Unit");
        var secondUnit = await NewType(client, second.Id, "Unit");

        await NewEntry(client, first.Id, firstUnit.Id, "Saltbearer");
        await NewEntry(client, second.Id, secondUnit.Id, "Dune strider");

        // Each project sees its own, and only its own.
        Assert.Equal(["Saltbearer"], (await Entries(client, first.Id)).Select(entry => entry.Name));
        Assert.Equal(["Dune strider"], (await Entries(client, second.Id)).Select(entry => entry.Name));

        // An id from the other project is not found rather than refused, so nothing confirms it exists.
        var crossed = await client.GetAsync($"/api/projects/{first.Id}/entities/{(await Entries(client, second.Id))[0].Id}");
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);

        // The universe's own surfaces show none of it: not the types screen, not the entries, not search.
        var loreTypes = await client.GetStringAsync($"/api/universes/{universe.Id}/entity-types");
        Assert.DoesNotContain("Unit", loreTypes, StringComparison.Ordinal);

        var loreEntries = await client.GetStringAsync($"/api/universes/{universe.Id}/entities");
        Assert.DoesNotContain("Saltbearer", loreEntries, StringComparison.Ordinal);

        var searched = await client.GetStringAsync($"/api/universes/{universe.Id}/search?query=Saltbearer");
        Assert.DoesNotContain("Saltbearer", searched, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_someone_who_may_change_the_universe_may_change_its_projects_schema()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "gameaccess");
        var project = await NewProject(owner, universe.Id, "Hollow Season");
        var unit = await NewType(owner, project.Id, "Unit");

        // A stranger is told nothing: the project answers exactly as a missing one.
        var stranger = await SignedIn(_factory, "gamestranger");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{project.Id}/entity-types")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{project.Id}/entities")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(
                $"/api/projects/{project.Id}/entities",
                new ProjectEntityRequest(unit.Id, "Not theirs", null))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.DeleteAsync($"/api/projects/{project.Id}/entity-types/{unit.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_project_s_entries_come_back_from_a_restore_in_their_own_project()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gamebackup");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var types = await Apply(client, project.Id);
        var map = types.First(type => type.Name == "Map");
        var players = map.Fields.First(field => field.Name == "Supported players");
        var four = players.Options.First(option => option.Value == "4").Id;

        var loreId = await CreateEntity(client, universe.Id, "Saltflats, the place");

        await NewEntry(
            client,
            project.Id,
            map.Id,
            "Saltflats",
            canonEntityId: loreId,
            fields: [new FieldValueInput(players.Id, null, null, null, null, [four], null)]);

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "Hollow Season restored");
        Assert.NotEqual(universe.Id, restored.Id);

        await WithDb(_factory, async db =>
        {
            var copiedProject = await db.CreativeProjects.AsNoTracking()
                .SingleAsync(each => each.UniverseId == restored.Id);

            var entry = await db.Entities.AsNoTracking().IgnoreQueryFilters()
                .Include(each => each.FieldValues)
                .SingleAsync(each => each.UniverseId == restored.Id && each.Name == "Saltflats");

            // In its project, of a type of that project, with its value, and pointing at the restored lore entry.
            Assert.Equal(copiedProject.Id, entry.ProjectId);

            var entryType = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
                .SingleAsync(type => type.Id == entry.EntityTypeId);
            Assert.Equal(copiedProject.Id, entryType.ProjectId);
            Assert.Equal("Map", entryType.Name);

            Assert.Single(entry.FieldValues);

            var canon = await db.Entities.AsNoTracking()
                .SingleAsync(each => each.Id == entry.CanonEntityId!.Value);
            Assert.Equal("Saltflats, the place", canon.Name);
            Assert.Equal(restored.Id, canon.UniverseId);
            Assert.Null(canon.ProjectId);
        });
    }

    /// <summary>
    /// A link field on a project's type reaches that project's own entries, and nothing else.
    ///
    /// <para>This is the criterion's "relationships" as this PR provides them, so it is tested rather than asserted in
    /// prose: a unit may name another unit of the same game, and a link to a lore entry or to another game's entry is
    /// refused. The refusal is the same one an id from another universe gets - the id is not a candidate at all - so it
    /// discloses nothing about what exists elsewhere.</para>
    /// </summary>
    [Fact]
    public async Task A_link_field_on_a_project_s_type_reaches_that_project_s_entries_and_no_others()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "gamelinks");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var other = await NewProject(client, universe.Id, "Another game");

        var unit = await NewType(client, project.Id, "Unit");
        var withField = await AddField(
            client,
            project.Id,
            unit.Id,
            new ProjectEntityFieldRequest("Escorts", EntityFieldKind.EntityReference));
        var escorts = withField.Fields.First(field => field.Name == "Escorts");

        var target = await NewEntry(client, project.Id, unit.Id, "Saltbearer");

        // Its own project's entry: accepted, and read back with the target's name.
        var linked = await NewEntry(
            client,
            project.Id,
            unit.Id,
            "Dune strider",
            fields: [new FieldValueInput(escorts.Id, null, null, null, null, null, target.Id)]);

        var value = linked.Fields.First(field => field.FieldDefinitionId == escorts.Id);
        Assert.Equal(target.Id, value.ReferencedEntityId);
        Assert.Equal("Saltbearer", value.ReferencedEntityName);

        // A lore entry of the same universe: not a candidate, so the link is refused.
        var loreId = await CreateEntity(client, universe.Id, "Alenna Vance");
        await RefusedLink(client, project.Id, unit.Id, escorts.Id, loreId);

        // Another project's entry, in the same universe: refused the same way.
        var otherUnit = await NewType(client, other.Id, "Unit");
        var otherEntry = await NewEntry(client, other.Id, otherUnit.Id, "Theirs");
        await RefusedLink(client, project.Id, unit.Id, escorts.Id, otherEntry.Id);

        // And the project still holds exactly the two entries it made.
        Assert.Equal(2, (await Entries(client, project.Id)).Count);
    }

    private static async Task RefusedLink(
        HttpClient client,
        Guid projectId,
        Guid typeId,
        Guid fieldId,
        Guid targetId)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entities",
            new ProjectEntityRequest(
                typeId,
                "Across scopes",
                null,
                null,
                [new FieldValueInput(fieldId, null, null, null, null, null, targetId)]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>
    /// A Film gets its own starter types and the shared engine under them (#146).
    ///
    /// <para>The first review of PR #179 was right to ask for this: the PR body claimed the criterion was met by the
    /// shared infrastructure without a test saying so for a Film in particular. This is that test: the template is
    /// offered and applied, a field of its own is added, a value is stored, an entry links to another entry of the
    /// same film, and one points at a lore entry.</para>
    ///
    /// <para><b>Revisions are deliberately absent</b>, which is #144's decision and is asserted here rather than left
    /// to be assumed: a lore entry's history is a record of the world's claims, and a film's prop is not one. The
    /// entry's own <c>Version</c> still guards a concurrent save, and an episode's screenplay has the same guard.</para>
    /// </summary>
    [Fact]
    public async Task A_film_gets_its_starter_types_and_the_shared_engine_under_them()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmengine");
        var film = await NewFilm(client, universe.Id);

        // Offered, named for a film, and not yet applied.
        var offer = await client.GetFromJsonAsync<ProjectTemplateResponse>($"/api/projects/{film.Id}/template");
        Assert.Equal("Film", offer!.Name);
        Assert.Equal(["Character", "Location", "Prop"], offer.Types);
        Assert.False(offer.AlreadyApplied);

        var applied = await Apply(client, film.Id);
        Assert.Equal(["Character", "Location", "Prop"], applied.Select(type => type.Name));

        // A film's billing words, which differ from a series' on purpose.
        var billing = applied.First(type => type.Name == "Character").Fields.First(field => field.Name == "Billing");
        Assert.Equal(EntityFieldKind.Select, billing.Kind);
        Assert.Equal(["Lead", "Supporting", "Background"], billing.Options.Select(option => option.Value));

        // A custom field of the author's own, on a starter type, through the shared engine.
        var prop = applied.First(type => type.Name == "Prop");
        var withField = await AddField(
            client,
            film.Id,
            prop.Id,
            new ProjectEntityFieldRequest("Made of", EntityFieldKind.ShortText));
        var madeOf = withField.Fields.First(field => field.Name == "Made of");

        var knife = await NewEntry(
            client,
            film.Id,
            prop.Id,
            "The salt knife",
            fields: [new FieldValueInput(madeOf.Id, "bone", null, null, null, null, null)]);

        Assert.Equal("bone", knife.Fields.First(field => field.FieldDefinitionId == madeOf.Id).Text);

        // A link to another entry of the same film, and an optional link to the lore.
        var carries = await AddField(
            client,
            film.Id,
            applied.First(type => type.Name == "Character").Id,
            new ProjectEntityFieldRequest("Carries", EntityFieldKind.EntityReference));
        var carriesField = carries.Fields.First(field => field.Name == "Carries");

        var loreId = await CreateEntity(client, universe.Id, "Alenna Vance");

        var alenna = await NewEntry(
            client,
            film.Id,
            applied.First(type => type.Name == "Character").Id,
            "Alenna",
            canonEntityId: loreId,
            fields: [new FieldValueInput(carriesField.Id, null, null, null, null, null, knife.Id)]);

        var link = alenna.Fields.First(field => field.FieldDefinitionId == carriesField.Id);
        Assert.Equal(knife.Id, link.ReferencedEntityId);
        Assert.Equal("The salt knife", link.ReferencedEntityName);

        var row = (await Entries(client, film.Id)).First(entry => entry.Id == alenna.Id);
        Assert.Equal(loreId, row.CanonEntityId);
        Assert.Equal("Alenna Vance", row.CanonEntityName);

        // The concurrency guard is the shared one: a save over a stale version is refused, and nothing is overwritten.
        var stale = await client.PutAsJsonAsync(
            $"/api/projects/{film.Id}/entities/{alenna.Id}",
            new ProjectEntityRequest(
                alenna.EntityTypeId,
                "Alenna, rewritten",
                null,
                null,
                null,
                alenna.Version - 1));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("Alenna", (await Entries(client, film.Id)).First(entry => entry.Id == alenna.Id).Name);

        // The entry keeps a history, through the same capture the lore's entries use. The second review round was
        // right to insist on this: "we decided not to" is not the shared infrastructure the criterion asks for.
        var edited = await Put<EntityDetail>(
            client,
            $"/api/projects/{film.Id}/entities/{knife.Id}",
            new ProjectEntityRequest(prop.Id, "The salt knife, notched", null, null, null, knife.Version));

        Assert.Equal("The salt knife, notched", edited.Name);

        var history = await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/projects/{film.Id}/entities/{knife.Id}/revisions");

        // Newest first: the edit, then the version the create left behind.
        Assert.Equal(2, history!.Count);
        Assert.Equal(EntityRevisionKind.Edited, history[0].Kind);
        Assert.Equal("The salt knife, notched", history[0].Name);
        Assert.Equal(EntityRevisionKind.Created, history[1].Kind);
        Assert.Equal("The salt knife", history[1].Name);
    }

    private static async Task<ProjectDetail> NewFilm(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Low Tide", ProjectKind.Film, ProjectLifecycle.Active, "animated", null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    /// <summary>
    /// A project entry's history survives a backup and a restore, and every row of it counts toward the restore's
    /// record limit.
    ///
    /// <para>The third review round of PR #179 asked for both halves, and both were missing. The limit exists so a
    /// crafted archive cannot ask the restore to write an unbounded number of rows; rows it does not count are rows it
    /// does not bound, and until now a project's entries, their versions, their field values and its seasons counted
    /// as nothing at all.</para>
    /// </summary>
    [Fact]
    public async Task A_project_entry_s_history_survives_a_restore_and_counts_toward_the_limit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "filmhistory");
        var film = await NewFilm(client, universe.Id);
        var type = await NewType(client, film.Id, "Prop");
        var entry = await NewEntry(client, film.Id, type.Id, "The salt knife");

        await Put<EntityDetail>(
            client,
            $"/api/projects/{film.Id}/entities/{entry.Id}",
            new ProjectEntityRequest(type.Id, "The salt knife, notched", null, null, null, entry.Version));

        var archive = await RawArchive(client, universe.Id);
        var payload = BackupOf(archive).Payload;

        // The file carries the entry and both its versions.
        var carried = payload.ProjectEntities!.Single(each => each.Id == entry.Id);
        Assert.Equal(["The salt knife", "The salt knife, notched"], carried.Revisions!.OrderBy(each => each.Number).Select(each => each.Name));

        // Every one of those rows is counted. Measured by removing them and watching the count fall by exactly the
        // number of rows they are, rather than by asserting a magic total.
        var counted = BackupValidation.CountRecords(payload);
        var withoutHistory = BackupValidation.CountRecords(payload with
        {
            ProjectEntities = [.. payload.ProjectEntities!.Select(each => each with { Revisions = [] })],
        });

        Assert.Equal(2, counted - withoutHistory);

        var withoutProjects = BackupValidation.CountRecords(payload with
        {
            CreativeProjects = [],
            ProjectEntities = [],
        });

        // The project, its entry and the entry's two versions: four rows the count missed entirely before.
        Assert.Equal(4, counted - withoutProjects);

        // And the history is there after a restore, under new ids, in the same order.
        var restored = await RestoreArchive(client, archive, "Film history restored");

        await WithDb(_factory, async db =>
        {
            var copied = await db.Entities.AsNoTracking().IgnoreQueryFilters()
                .SingleAsync(each => each.UniverseId == restored.Id && each.ProjectId != null);

            var history = await db.EntityRevisions.AsNoTracking()
                .Where(revision => revision.EntityId == copied.Id)
                .OrderBy(revision => revision.Number)
                .ToListAsync();

            Assert.Equal(["The salt knife", "The salt knife, notched"], history.Select(each => each.Name));
            Assert.All(history, revision => Assert.NotEqual(Guid.Empty, revision.Id));
        });
    }

    // ---------- helpers ----------

    internal static async Task<ProjectDetail> NewProject(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Active, null, null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<List<ProjectEntityTypeResponse>> Types(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<List<ProjectEntityTypeResponse>>($"/api/projects/{projectId}/entity-types"))!;

    private static async Task<List<ProjectEntityTypeResponse>> Apply(HttpClient client, Guid projectId)
    {
        var response = await client.PostAsync($"/api/projects/{projectId}/template", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<ProjectEntityTypeResponse>>())!;
    }

    [Fact]
    public async Task The_entry_list_reads_one_type_a_page_at_a_time_across_the_boundary()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrypaging");
        var project = await NewProject(client, universe.Id, "Long Survey");
        var units = await NewType(client, project.Id, "Unit");
        var maps = await NewType(client, project.Id, "Map");

        // More than one page of one type, with two equal names so the order has to break the tie, and an entry of
        // another type that the filter must keep out of every page.
        var names = Enumerable.Range(1, 7).Select(index => $"Unit {index:00}").Append("Unit 07").ToList();
        foreach (var name in names)
        {
            await NewEntry(client, project.Id, units.Id, name);
        }

        await NewEntry(client, project.Id, maps.Id, "Saltflats");

        var first = await Page(client, project.Id, units.Id, skip: 0, take: 3);
        var second = await Page(client, project.Id, units.Id, skip: 3, take: 3);
        var third = await Page(client, project.Id, units.Id, skip: 6, take: 3);
        var past = await Page(client, project.Id, units.Id, skip: 9, take: 3);

        Assert.Equal(3, first.Count);
        Assert.Equal(3, second.Count);
        Assert.Equal(2, third.Count);
        Assert.Empty(past);

        // Every entry once, none twice, none of the other type, in the same order an unpaged read gives.
        var paged = first.Concat(second).Concat(third).ToList();
        Assert.Equal(names.Count, paged.Select(entry => entry.Id).Distinct().Count());
        Assert.All(paged, entry => Assert.Equal(units.Id, entry.EntityTypeId));
        Assert.Equal((await Entries(client, project.Id, units.Id)).Select(entry => entry.Id), paged.Select(entry => entry.Id));

        // No parameters still answers the plain list, bounded; out-of-range parameters are refused rather than clamped.
        Assert.Equal(names.Count + 1, (await Entries(client, project.Id)).Count);
        foreach (var query in new[] { "skip=-1", "take=0", $"take={ProjectEntityEndpoints.ListMaxTake + 1}" })
        {
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await client.GetAsync($"/api/projects/{project.Id}/entities?{query}")).StatusCode);
        }
    }

    [Fact]
    public async Task The_entry_list_answers_the_newest_first_when_the_overview_asks_for_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entryrecent");
        var project = await NewProject(client, universe.Id, "Field Notes");
        var units = await NewType(client, project.Id, "Unit");
        var maps = await NewType(client, project.Id, "Map");

        // Names chosen so that the two orders cannot agree by accident: by name this is Aardvark, Beacon, Cairn.
        var aardvark = await NewEntry(client, project.Id, units.Id, "Aardvark");
        await NewEntry(client, project.Id, units.Id, "Beacon");
        await NewEntry(client, project.Id, maps.Id, "Cairn");

        // Touching the first-by-name entry makes it the newest, so the two orders disagree at the front.
        await Put<EntityDetail>(
            client,
            $"/api/projects/{project.Id}/entities/{aardvark.Id}",
            new ProjectEntityRequest(units.Id, "Aardvark", "Seen again", null, null, aardvark.Version));

        var byName = await Entries(client, project.Id);
        var newest = await Recent(client, project.Id, take: 3);

        Assert.Equal(["Aardvark", "Beacon", "Cairn"], byName.Select(entry => entry.Name));
        Assert.Equal("Aardvark", newest[0].Name);
        Assert.Equal(3, newest.Count);
        Assert.NotEqual(byName.Select(entry => entry.Name), newest.Select(entry => entry.Name));

        // The order is the only thing `recent` changes: the type filter and the page bound still hold.
        var onePage = await Recent(client, project.Id, take: 2);
        Assert.Equal(2, onePage.Count);
        Assert.Equal(newest.Take(2).Select(entry => entry.Id), onePage.Select(entry => entry.Id));

        var ofType = (await client.GetFromJsonAsync<ProjectEntityPage>(
            $"/api/projects/{project.Id}/entities?typeId={maps.Id}&recent=true"))!.Items;
        Assert.Equal(["Cairn"], ofType.Select(entry => entry.Name));
    }

    [Fact]
    public async Task The_entry_list_searches_names_inside_its_own_game_only()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrysearch");
        var first = await NewProject(client, universe.Id, "First Game");
        var second = await NewProject(client, universe.Id, "Second Game");
        var firstUnits = await NewType(client, first.Id, "Unit");
        var secondUnits = await NewType(client, second.Id, "Unit");

        await NewEntry(client, first.Id, firstUnits.Id, "Ember Knight");
        await NewEntry(client, first.Id, firstUnits.Id, "Tall EMBER");
        await NewEntry(client, first.Id, firstUnits.Id, "Frost 100% Mage");
        await NewEntry(client, first.Id, firstUnits.Id, "Frost 100x Mage");
        await NewEntry(client, first.Id, firstUnits.Id, "snake_case");
        await NewEntry(client, first.Id, firstUnits.Id, "snakeXcase");
        await NewEntry(client, second.Id, secondUnits.Id, "Ember Other Game");

        Assert.Equal(["Ember Knight", "Tall EMBER"], await Names(client, first.Id, $"q=ember"));
        Assert.Equal(["Ember Knight"], await Names(client, first.Id, $"typeId={firstUnits.Id}&q=%20knight%20"));
        Assert.Equal(["Frost 100% Mage"], await Names(client, first.Id, "q=" + Uri.EscapeDataString("100%")));
        Assert.Equal(["snake_case"], await Names(client, first.Id, "q=" + Uri.EscapeDataString("e_c")));
        Assert.Equal(6, (await Names(client, first.Id, "q=%20%20")).Count);
        Assert.Empty(await Names(client, first.Id, "q=zzz"));

        // Another game's type id finds nothing here, with or without a search.
        Assert.Empty(await Names(client, first.Id, $"typeId={secondUnits.Id}&q=ember"));
        Assert.Empty(await Names(client, first.Id, $"typeId={secondUnits.Id}"));
        Assert.Equal(["Ember Other Game"], await Names(client, second.Id, "q=ember"));

        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.GetAsync($"/api/projects/{first.Id}/entities?q={new string('a', 201)}")).StatusCode);
    }

    [Fact]
    public async Task The_entry_list_sorts_deterministically_and_pages_through_a_filtered_list_without_gaps()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrysort");
        var project = await NewProject(client, universe.Id, "Sorted");
        var units = await NewType(client, project.Id, "Unit");

        // Equal names differ only in case, so the id has to break the tie; every entry matches "mark".
        foreach (var name in new[] { "mark d", "Mark b", "mark b", "Mark a", "Mark c", "other" })
        {
            await NewEntry(client, project.Id, units.Id, name);
        }

        var byName = await Names(client, project.Id, "q=mark&sort=name");
        Assert.Equal(["mark a", "mark b", "mark b", "mark c", "mark d"], byName.Select(name => name.ToLowerInvariant()));
        Assert.Equal(byName, await Names(client, project.Id, "q=mark"));
        Assert.Equal(byName, await Names(client, project.Id, "q=mark&sort=name"));
        Assert.Equal(5, (await Names(client, project.Id, "q=mark&sort=created")).Count);

        foreach (var sort in new[] { "name", "created", "updated" })
        {
            var all = await Names(client, project.Id, $"q=mark&sort={sort}");
            var paged = new List<string>();
            for (var skip = 0; skip < all.Count; skip += 2)
            {
                paged.AddRange(await Names(client, project.Id, $"q=mark&sort={sort}&skip={skip}&take=2"));
            }

            Assert.Equal(all, paged);
        }

        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.GetAsync($"/api/projects/{project.Id}/entities?sort=status")).StatusCode);
    }

    [Fact]
    public async Task Saving_an_entry_keeps_the_values_of_an_archived_field_until_it_is_restored()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "archivedvalue");
        var project = await NewProject(client, universe.Id, "Hollow Season");
        var unit = await NewType(client, project.Id, "Unit");

        await AddField(client, project.Id, unit.Id, new ProjectEntityFieldRequest("Cost", EntityFieldKind.Number));
        var withBoth = await AddField(client, project.Id, unit.Id, new ProjectEntityFieldRequest("Weight", EntityFieldKind.Number));
        var cost = withBoth.Fields.First(field => field.Name == "Cost");
        var weight = withBoth.Fields.First(field => field.Name == "Weight");

        var entry = await NewEntry(
            client,
            project.Id,
            unit.Id,
            "Saltbearer",
            fields: [new FieldValueInput(cost.Id, null, 35, null, null, null, null), new FieldValueInput(weight.Id, null, 4, null, null, null, null)]);

        async Task SetArchived(DateTime? at) => await WithDb(_factory, async db =>
        {
            var field = await db.EntityFieldDefinitions.IgnoreQueryFilters().SingleAsync(each => each.Id == cost.Id);
            field.ArchivedAt = at;
            await db.SaveChangesAsync();
        });

        await SetArchived(DateTime.UtcNow);

        // The form cannot send an archived field's value back, so this save carries the other field only.
        var saved = await Put<EntityDetail>(
            client,
            $"/api/projects/{project.Id}/entities/{entry.Id}",
            new ProjectEntityRequest(
                unit.Id,
                "Saltbearer",
                null,
                null,
                [new FieldValueInput(weight.Id, null, 9, null, null, null, null)],
                entry.Version));
        Assert.Equal(9, saved.Fields.First(field => field.FieldDefinitionId == weight.Id).Number);

        await SetArchived(null);

        var restored = await client.GetFromJsonAsync<EntityDetail>($"/api/projects/{project.Id}/entities/{entry.Id}");
        Assert.Equal(35, restored!.Fields.First(field => field.FieldDefinitionId == cost.Id).Number);
    }

    [Fact]
    public async Task The_entry_list_includes_nested_types_only_when_asked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrynested");
        var project = await NewProject(client, universe.Id, "Nested");
        var parent = await NewType(client, project.Id, "Creature");
        var child = (await (await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entity-types",
            new ProjectEntityTypeRequest("Beast", null, null, null, parent.Id))).Content
            .ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
        var grandchild = (await (await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entity-types",
            new ProjectEntityTypeRequest("Wolf", null, null, null, child.Id))).Content
            .ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
        var other = await NewType(client, project.Id, "Item");

        await NewEntry(client, project.Id, parent.Id, "A parent");
        await NewEntry(client, project.Id, child.Id, "B child");
        await NewEntry(client, project.Id, grandchild.Id, "C grandchild");
        await NewEntry(client, project.Id, other.Id, "D item");

        Assert.Equal(["A parent"], await Names(client, project.Id, $"typeId={parent.Id}"));
        Assert.Equal(
            ["A parent", "B child", "C grandchild"],
            await Names(client, project.Id, $"typeId={parent.Id}&includeDescendants=true"));
        Assert.Equal(
            ["C grandchild"],
            await Names(client, project.Id, $"typeId={parent.Id}&includeDescendants=true&q=grand"));
        Assert.Equal(
            ["B child", "C grandchild"],
            await Names(client, project.Id, $"typeId={child.Id}&includeDescendants=true"));
    }

    private static async Task<List<string>> Names(HttpClient client, Guid projectId, string query) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>($"/api/projects/{projectId}/entities?{query}"))!
            .Items.Select(entry => entry.Name)
            .ToList();

    private static async Task<List<ProjectEntitySummary>> Recent(HttpClient client, Guid projectId, int take) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>(
            $"/api/projects/{projectId}/entities?recent=true&skip=0&take={take}"))!.Items.ToList();

    internal static async Task<List<ProjectEntitySummary>> Page(
        HttpClient client,
        Guid projectId,
        Guid typeId,
        int skip,
        int take) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>(
            $"/api/projects/{projectId}/entities?typeId={typeId}&skip={skip}&take={take}"))!.Items.ToList();

    internal static async Task<ProjectEntityTypeResponse> NewType(HttpClient client, Guid projectId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entity-types",
            new ProjectEntityTypeRequest(name, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
    }

    private static async Task<ProjectEntityTypeResponse> AddField(
        HttpClient client,
        Guid projectId,
        Guid typeId,
        ProjectEntityFieldRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/entity-types/{typeId}/fields", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
    }

    internal static async Task<EntityDetail> NewEntry(
        HttpClient client,
        Guid projectId,
        Guid typeId,
        string name,
        Guid? canonEntityId = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entities",
            new ProjectEntityRequest(typeId, name, null, canonEntityId, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    internal static async Task<List<ProjectEntitySummary>> Entries(HttpClient client, Guid projectId, Guid? typeId = null) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>(
            typeId is { } id
                ? $"/api/projects/{projectId}/entities?typeId={id}"
                : $"/api/projects/{projectId}/entities"))!.Items.ToList();

    private static async Task<T> Put<T>(HttpClient client, string path, object request)
    {
        var response = await client.PutAsJsonAsync(path, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}
