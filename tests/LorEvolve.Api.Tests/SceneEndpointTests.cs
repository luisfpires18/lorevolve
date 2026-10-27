using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The scenes of a story.
///
/// The invariant this file exists for: <b>narrative order is the author's, and chronology is only
/// world metadata.</b> A scene is appended, moved only by the order route, and never reordered or
/// refused because of when it happens in the world. Around that: a scene's chronology is written the
/// way its universe keeps time, its lore references are references into its own universe, the Trash
/// keeps them rather than deleting them, and nothing a scene points at can take the scene with it.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class SceneEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Narrative order ----------

    [Fact]
    public async Task A_new_scene_is_appended_after_every_scene_already_told()
    {
        var (client, universe, story) = await WithStory("sceneappend");

        var first = await Create(client, universe.Id, story.Id, Scene("Arrival"));
        var second = await Create(client, universe.Id, story.Id, Scene("The Council"));
        var third = await Create(client, universe.Id, story.Id, Scene("Departure"));

        Assert.Equal([0, 1, 2], new[] { first, second, third }.Select(scene => scene.SortOrder));
        Assert.Equal(["Arrival", "The Council", "Departure"], await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task Scenes_keep_their_narrative_order_whatever_their_chronology_says()
    {
        var (client, universe, story) = await WithStory("scenenonlinear");

        // Told as aftermath, battle, childhood; lived as childhood, battle, aftermath.
        await Create(client, universe.Id, story.Id, Scene("Aftermath", At(30)));
        await Create(client, universe.Id, story.Id, Scene("The Battle", At(20)));
        await Create(client, universe.Id, story.Id, Scene("Childhood", At(-5)));

        string[] told = ["Aftermath", "The Battle", "Childhood"];
        Assert.Equal(told, await Titles(client, universe.Id, story.Id));

        var listed = (await client.GetFromJsonAsync<List<SceneResponse>>(Scenes(universe.Id, story.Id)))!;
        Assert.Equal(told, listed.Select(scene => scene.Title));
        Assert.Equal([30, 20, -5], listed.Select(scene => scene.Chronology!.Year!.Value));
    }

    [Fact]
    public async Task A_scene_placed_earlier_in_the_world_than_the_scene_before_it_is_not_refused()
    {
        var (client, universe, story) = await WithStory("scenebackwards");
        var eras = await TheFall(client, universe.Id);

        await Create(client, universe.Id, story.Id, Scene("After", new ChronologyValue(eras.After, 12, null, null)));
        var response = await Post(client, universe.Id, story.Id, Scene("Long before", new ChronologyValue(eras.Before, 40, null, null)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(["After", "Long before"], await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task Reordering_replaces_the_whole_order_and_it_persists()
    {
        var (client, universe, story) = await WithStory("scenereorder");
        var a = await Create(client, universe.Id, story.Id, Scene("A"));
        var b = await Create(client, universe.Id, story.Id, Scene("B"));
        var c = await Create(client, universe.Id, story.Id, Scene("C"));

        var response = await Reorder(client, universe.Id, story.Id, c.Id, a.Id, b.Id);
        response.EnsureSuccessStatusCode();

        var returned = (await response.Content.ReadFromJsonAsync<List<SceneResponse>>())!;
        Assert.Equal(["C", "A", "B"], returned.Select(scene => scene.Title));
        Assert.Equal([0, 1, 2], returned.Select(scene => scene.SortOrder));

        Assert.Equal(["C", "A", "B"], await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task Moving_a_scene_one_place_swaps_it_with_its_neighbour()
    {
        var (client, universe, story) = await WithStory("sceneswap");
        var a = await Create(client, universe.Id, story.Id, Scene("A"));
        var b = await Create(client, universe.Id, story.Id, Scene("B"));

        // Each position is unique per story, so a swap is the move that would collide halfway.
        (await Reorder(client, universe.Id, story.Id, b.Id, a.Id)).EnsureSuccessStatusCode();
        Assert.Equal(["B", "A"], await Titles(client, universe.Id, story.Id));

        (await Reorder(client, universe.Id, story.Id, a.Id, b.Id)).EnsureSuccessStatusCode();
        Assert.Equal(["A", "B"], await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task Reordering_refuses_a_repeated_a_missing_or_a_foreign_scene_and_changes_nothing()
    {
        var (client, universe, story) = await WithStory("scenereorderbad");
        var a = await Create(client, universe.Id, story.Id, Scene("A"));
        var b = await Create(client, universe.Id, story.Id, Scene("B"));

        var other = await CreateStory(client, universe.Id, "Another story");
        var foreign = await Create(client, universe.Id, other.Id, Scene("Not yours"));

        await AssertRefused(await Reorder(client, universe.Id, story.Id, a.Id, a.Id), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, b.Id), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, b.Id, foreign.Id), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, b.Id, a.Id, foreign.Id), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, b.Id, Guid.NewGuid()), "sceneIds");
        await AssertRefused(
            await client.PutAsJsonAsync($"{Scenes(universe.Id, story.Id)}/order", new SceneOrderRequest(null)),
            "sceneIds");

        Assert.Equal(["A", "B"], await Titles(client, universe.Id, story.Id));
        Assert.Equal(["Not yours"], await Titles(client, universe.Id, other.Id));
    }

    [Fact]
    public async Task Deleting_a_scene_closes_the_gap_and_the_next_scene_still_lands_last()
    {
        var (client, universe, story) = await WithStory("scenedeletegap");
        await Create(client, universe.Id, story.Id, Scene("A"));
        var b = await Create(client, universe.Id, story.Id, Scene("B"));
        await Create(client, universe.Id, story.Id, Scene("C"));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Scene(universe.Id, story.Id, b.Id))).StatusCode);

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(["A", "C"], detail.Scenes.Select(scene => scene.Title));
        Assert.Equal([0, 1], detail.Scenes.Select(scene => scene.SortOrder));

        var appended = await Create(client, universe.Id, story.Id, Scene("D"));
        Assert.Equal(2, appended.SortOrder);
    }

    [Fact]
    public async Task Updating_a_scene_never_moves_it()
    {
        var (client, universe, story) = await WithStory("sceneupdatestays");
        var a = await Create(client, universe.Id, story.Id, Scene("A"));
        await Create(client, universe.Id, story.Id, Scene("B"));

        var response = await client.PutVersionedAsync(
            Scene(universe.Id, story.Id, a.Id),
            new SceneRequest("A, rewritten", "What happens.", "Planning notes.", null, At(900), null));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
        Assert.Equal(0, updated.SortOrder);
        Assert.Equal("What happens.", updated.Summary);
        Assert.Equal("Planning notes.", updated.Notes);
        Assert.Equal(["A, rewritten", "B"], await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task A_scene_needs_a_title()
    {
        var (client, universe, story) = await WithStory("scenetitle");

        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("  ")), "title");
    }

    // ---------- Chronology ----------

    [Fact]
    public async Task A_scene_with_no_chronology_is_valid()
    {
        var (client, universe, story) = await WithStory("scenenochron");

        var scene = await Create(client, universe.Id, story.Id, Scene("Somewhen"));

        Assert.Null(scene.Chronology);
    }

    [Fact]
    public async Task A_scene_on_the_plain_reckoning_keeps_a_signed_year_month_and_day()
    {
        var (client, universe, story) = await WithStory("sceneplain");

        var scene = await Create(client, universe.Id, story.Id, Scene("Old", new ChronologyValue(null, -42, 3, 4)));

        Assert.Equal(new ChronologyValue(null, -42, 3, 4), scene.Chronology);
        Assert.Equal(new ChronologyValue(null, 0, null, null), (await Create(client, universe.Id, story.Id, Scene("Zero", At(0)))).Chronology);
    }

    [Fact]
    public async Task A_scene_is_placed_in_one_of_the_universe_s_eras()
    {
        var (client, universe, story) = await WithStory("sceneera");
        var eras = await TheFall(client, universe.Id);

        var scene = await Create(client, universe.Id, story.Id, Scene("The Council", new ChronologyValue(eras.After, 12, null, null)));
        Assert.Equal(new ChronologyValue(eras.After, 12, null, null), scene.Chronology);

        // Moved to another era, and back out of time altogether.
        var moved = await Update(client, universe.Id, story.Id, scene.Id, Scene("The Council", new ChronologyValue(eras.Before, 3, 7, 1)));
        Assert.Equal(new ChronologyValue(eras.Before, 3, 7, 1), moved.Chronology);

        var cleared = await Update(client, universe.Id, story.Id, scene.Id, Scene("The Council"));
        Assert.Null(cleared.Chronology);
    }

    [Fact]
    public async Task A_chronology_not_written_the_way_the_universe_keeps_time_is_refused()
    {
        var (client, universe, story) = await WithStory("scenechronbad");

        // The plain reckoning has no eras to name, and a date still needs its parts in order.
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(Guid.NewGuid(), 3, null, null))), "chronology.eraId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(null, 3, 13, null))), "chronology.month");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(null, 3, null, 9))), "chronology.month");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(null, null, null, null))), "chronology.year");

        var eras = await TheFall(client, universe.Id);
        var (otherClient, elsewhere, _) = await WithStory("scenechronbadother");
        var foreignEras = await TheFall(otherClient, elsewhere.Id);

        // Once eras are named: every year needs one of this universe's, counted from 1.
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", At(12))), "chronology.eraId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(eras.After, 0, null, null))), "chronology.year");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", new ChronologyValue(foreignEras.After, 4, null, null))), "chronology.eraId");

        Assert.Empty(await Titles(client, universe.Id, story.Id));
    }

    [Fact]
    public async Task An_era_a_scene_is_placed_in_cannot_be_removed()
    {
        var (client, universe, story) = await WithStory("sceneerainuse");
        var eras = await TheFall(client, universe.Id);
        await Create(client, universe.Id, story.Id, Scene("Before it all", new ChronologyValue(eras.Before, 9, null, null)));

        var described = (await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{universe.Id}/chronology"))!;
        Assert.Equal([1, 0], described.Eras.Select(era => era.SceneCount));

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(eras.After, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(ChronologyEndpoints.EraInUseCode, body, StringComparison.Ordinal);
        Assert.Contains("1 scene", body, StringComparison.Ordinal);
    }

    // ---------- Lore references ----------

    [Fact]
    public async Task A_point_of_view_and_linked_lore_are_read_from_the_lore_every_time()
    {
        var (client, universe, story) = await WithStory("scenerefs");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var council = await CreateEntity(client, universe.Id, "Council of Nine");

        var scene = await Create(
            client, universe.Id, story.Id,
            Scene("The Council", pov: arlen.Id, entities: [tower.Id, arlen.Id, council.Id]));

        Assert.Equal(arlen.Id, scene.Pov!.EntityId);
        Assert.Equal("Arlen", scene.Pov.Name);
        Assert.Equal("Character", scene.Pov.EntityTypeName);
        Assert.False(scene.Pov.IsTrashed);

        // Listed by name, and the point of view may be linked as well without being required to be.
        Assert.Equal(["Arlen", "Council of Nine", "White Tower"], scene.Entities.Select(entity => entity.Name));

        // Renaming the entry renames it in the scene: nothing was copied.
        var renamed = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{arlen.Id}",
            new EntityRequest(arlen.EntityTypeId, "Arlen the Grey", null, CanonStatus.Canon, null, null, null));
        renamed.EnsureSuccessStatusCode();

        var read = (await Detail(client, universe.Id, story.Id)).Scenes.Single();
        Assert.Equal("Arlen the Grey", read.Pov!.Name);
        Assert.Contains(read.Entities, entity => entity.Name == "Arlen the Grey");
    }

    [Fact]
    public async Task Any_entry_may_be_the_point_of_view_whatever_its_type_is_called()
    {
        var (client, universe, story) = await WithStory("scenepovtype");
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe.Id}/entity-types"))!;
        var notCharacter = types.First(type => type.Name != "Character");
        var place = await CreateEntity(client, universe.Id, "The Old Road", notCharacter.Id);

        var scene = await Create(client, universe.Id, story.Id, Scene("The road remembers", pov: place.Id));

        Assert.Equal(place.Id, scene.Pov!.EntityId);
        Assert.Equal(notCharacter.Name, scene.Pov.EntityTypeName);
    }

    [Fact]
    public async Task Linked_lore_is_replaced_whole_on_update_and_a_repeated_entry_is_linked_once()
    {
        var (client, universe, story) = await WithStory("scenelinks");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var gate = await CreateEntity(client, universe.Id, "East Gate");

        var scene = await Create(client, universe.Id, story.Id, Scene("Watch", entities: [arlen.Id, tower.Id, arlen.Id]));
        Assert.Equal(["Arlen", "White Tower"], scene.Entities.Select(entity => entity.Name));

        var updated = await Update(client, universe.Id, story.Id, scene.Id, Scene("Watch", entities: [tower.Id, gate.Id]));
        Assert.Equal(["East Gate", "White Tower"], updated.Entities.Select(entity => entity.Name));

        var emptied = await Update(client, universe.Id, story.Id, scene.Id, Scene("Watch", entities: []));
        Assert.Empty(emptied.Entities);

        await WithDb(async db => Assert.False(await db.SceneEntityLinks.AnyAsync(link => link.SceneId == scene.Id)));
    }

    [Fact]
    public async Task A_point_of_view_or_linked_entry_from_another_universe_is_refused()
    {
        var (client, universe, story) = await WithStory("scenerefforeign");
        var mine = await CreateEntity(client, universe.Id, "Arlen");

        var otherUniverse = await CreateUniverse(client, "World scenerefforeign two");
        var elsewhere = await CreateEntity(client, otherUniverse.Id, "Stranger");

        var (strangerClient, strangerUniverse, _) = await WithStory("scenerefforeignstranger");
        var theirs = await CreateEntity(strangerClient, strangerUniverse.Id, "Theirs");

        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", pov: elsewhere.Id)), "povEntityId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", pov: theirs.Id)), "povEntityId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", pov: Guid.NewGuid())), "povEntityId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", entities: [mine.Id, elsewhere.Id])), "entityIds");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", entities: [theirs.Id])), "entityIds");

        var scene = await Create(client, universe.Id, story.Id, Scene("Kept", pov: mine.Id, entities: [mine.Id]));
        await AssertRefused(
            await client.PutVersionedAsync(Scene(universe.Id, story.Id, scene.Id), Scene("Kept", pov: elsewhere.Id)),
            "povEntityId");

        var read = (await Detail(client, universe.Id, story.Id)).Scenes.Single();
        Assert.Equal(mine.Id, read.Pov!.EntityId);
        Assert.Equal([mine.Id], read.Entities.Select(entity => entity.EntityId));
    }

    // ---------- The Trash ----------

    [Fact]
    public async Task Trashing_a_referenced_entry_keeps_it_on_the_scene_marked_and_restoring_clears_the_mark()
    {
        var (client, universe, story) = await WithStory("scenetrashkeep");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var scene = await Create(client, universe.Id, story.Id, Scene("The Council", pov: arlen.Id, entities: [arlen.Id, tower.Id]));

        await Trash(client, universe.Id, arlen.Id);

        var read = (await Detail(client, universe.Id, story.Id)).Scenes.Single();
        Assert.Equal(scene.Id, read.Id);
        Assert.True(read.Pov!.IsTrashed);
        Assert.True(read.Entities.Single(entity => entity.EntityId == arlen.Id).IsTrashed);
        Assert.False(read.Entities.Single(entity => entity.EntityId == tower.Id).IsTrashed);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{arlen.Id}/restore", content: null))
            .EnsureSuccessStatusCode();

        var restored = (await Detail(client, universe.Id, story.Id)).Scenes.Single();
        Assert.False(restored.Pov!.IsTrashed);
        Assert.All(restored.Entities, entity => Assert.False(entity.IsTrashed));
    }

    [Fact]
    public async Task A_scene_holding_a_trashed_entry_can_still_be_saved_as_it_is()
    {
        var (client, universe, story) = await WithStory("scenetrashsave");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var scene = await Create(client, universe.Id, story.Id, Scene("The Council", pov: arlen.Id, entities: [arlen.Id]));

        await Trash(client, universe.Id, arlen.Id);

        var saved = await Update(client, universe.Id, story.Id, scene.Id, Scene("The Council, retitled", pov: arlen.Id, entities: [arlen.Id]));

        Assert.Equal("The Council, retitled", saved.Title);
        Assert.True(saved.Pov!.IsTrashed);
        Assert.True(Assert.Single(saved.Entities).IsTrashed);
    }

    [Fact]
    public async Task A_trashed_entry_cannot_be_newly_chosen_as_a_point_of_view_or_a_link()
    {
        var (client, universe, story) = await WithStory("scenetrashnew");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var scene = await Create(client, universe.Id, story.Id, Scene("Held", pov: tower.Id, entities: [tower.Id]));

        await Trash(client, universe.Id, arlen.Id);

        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("New", pov: arlen.Id)), "povEntityId");
        await AssertRefused(await Post(client, universe.Id, story.Id, Scene("New", entities: [arlen.Id])), "entityIds");
        await AssertRefused(
            await client.PutVersionedAsync(Scene(universe.Id, story.Id, scene.Id), Scene("Held", pov: arlen.Id, entities: [tower.Id])),
            "povEntityId");
        await AssertRefused(
            await client.PutVersionedAsync(Scene(universe.Id, story.Id, scene.Id), Scene("Held", pov: tower.Id, entities: [tower.Id, arlen.Id])),
            "entityIds");

        Assert.Equal(["Held"], await Titles(client, universe.Id, story.Id));
    }

    // ---------- What deleting takes with it ----------

    [Fact]
    public async Task Deleting_a_scene_moves_it_to_the_trash_with_its_links_and_no_lore()
    {
        var (client, universe, story) = await WithStory("scenedeletelinks");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var scene = await Create(client, universe.Id, story.Id, Scene("Gone", pov: arlen.Id, entities: [arlen.Id]));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Scene(universe.Id, story.Id, scene.Id))).StatusCode);

        // Out of every read, and a second delete finds nothing to delete.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Scene(universe.Id, story.Id, scene.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Scene(universe.Id, story.Id, scene.Id))).StatusCode);
        Assert.Empty((await Detail(client, universe.Id, story.Id)).Scenes);

        // Nothing is erased: the scene and its links wait in the Trash, and the lore is untouched (ADR 0029).
        await WithDb(async db =>
        {
            Assert.True(await db.Scenes.AnyAsync(candidate => candidate.Id == scene.Id && candidate.DeletedAt != null));
            Assert.True(await db.SceneEntityLinks.AnyAsync(link => link.SceneId == scene.Id));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == arlen.Id && entity.DeletedAt == null));
        });
    }

    [Fact]
    public async Task An_entry_removed_from_the_database_for_good_never_takes_a_scene_with_it()
    {
        var (client, universe, story) = await WithStory("scenehardentity");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var scene = await Create(client, universe.Id, story.Id, Scene("Survives", pov: arlen.Id, entities: [arlen.Id, tower.Id]));

        // LorEvolve has no permanent delete for an entry. This is the database's own answer if a row
        // ever does go: the point of view clears, the link goes, and the scene stays where it was.
        await WithDb(async db => await db.Entities.Where(entity => entity.Id == arlen.Id).ExecuteDeleteAsync());

        var read = (await Detail(client, universe.Id, story.Id)).Scenes.Single();
        Assert.Equal(scene.Id, read.Id);
        Assert.Equal(0, read.SortOrder);
        Assert.Null(read.Pov);
        Assert.Equal([tower.Id], read.Entities.Select(entity => entity.EntityId));

        await WithDb(async db =>
        {
            var stored = await db.Scenes.AsNoTracking().SingleAsync(candidate => candidate.Id == scene.Id);
            Assert.Null(stored.PovEntityId);
        });
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task A_scene_id_from_another_story_is_not_found()
    {
        var (client, universe, story) = await WithStory("sceneotherstory");
        var other = await CreateStory(client, universe.Id, "Another");
        var scene = await Create(client, universe.Id, story.Id, Scene("Belongs here"));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Scene(universe.Id, other.Id, scene.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutVersionedAsync(Scene(universe.Id, other.Id, scene.Id), Scene("Moved"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Scene(universe.Id, other.Id, scene.Id))).StatusCode);

        Assert.Equal(["Belongs here"], await Titles(client, universe.Id, story.Id));
        Assert.Empty(await Titles(client, universe.Id, other.Id));
    }

    [Fact]
    public async Task Someone_else_cannot_read_write_reorder_or_delete_a_scene()
    {
        var (owner, universe, story) = await WithStory("scenemine");
        var a = await Create(owner, universe.Id, story.Id, Scene("A"));
        var b = await Create(owner, universe.Id, story.Id, Scene("B"));

        var stranger = await SignedInClient("user-sceneyours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Scenes(universe.Id, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Scene(universe.Id, story.Id, a.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(stranger, universe.Id, story.Id, Scene("Intruder"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PutVersionedAsync(Scene(universe.Id, story.Id, a.Id), Scene("Mine now"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Reorder(stranger, universe.Id, story.Id, b.Id, a.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync(Scene(universe.Id, story.Id, a.Id))).StatusCode);

        Assert.Equal(["A", "B"], await Titles(owner, universe.Id, story.Id));
    }

    // ---------- Helpers ----------

    private sealed record FallEras(Guid Before, Guid After);

    private static ChronologyValue At(int year) => new(null, year, null, null);

    private static SceneRequest Scene(
        string title,
        ChronologyValue? chronology = null,
        Guid? pov = null,
        IReadOnlyList<Guid>? entities = null) =>
        new(title, null, null, pov, chronology, entities);

    private static string Scenes(Guid universeId, Guid storyId) => $"/api/universes/{universeId}/stories/{storyId}/scenes";

    private static string Scene(Guid universeId, Guid storyId, Guid sceneId) => $"{Scenes(universeId, storyId)}/{sceneId}";

    private static Task<HttpResponseMessage> Post(HttpClient client, Guid universeId, Guid storyId, SceneRequest request) =>
        client.PostAsJsonAsync(Scenes(universeId, storyId), request);

    private static async Task<SceneResponse> Create(HttpClient client, Guid universeId, Guid storyId, SceneRequest request)
    {
        var response = await Post(client, universeId, storyId, request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static async Task<SceneResponse> Update(HttpClient client, Guid universeId, Guid storyId, Guid sceneId, SceneRequest request)
    {
        var response = await client.PutVersionedAsync(Scene(universeId, storyId, sceneId), request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static Task<HttpResponseMessage> Reorder(HttpClient client, Guid universeId, Guid storyId, params Guid[] sceneIds) =>
        client.PutAsJsonAsync($"{Scenes(universeId, storyId)}/order", new SceneOrderRequest(sceneIds));

    private static async Task<StoryDetail> Detail(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<StoryDetail>($"/api/universes/{universeId}/stories/{storyId}"))!;

    private static async Task<string[]> Titles(HttpClient client, Guid universeId, Guid storyId) =>
        [.. (await Detail(client, universeId, storyId)).Scenes.Select(scene => scene.Title)];

    private static async Task AssertRefused(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static async Task Trash(HttpClient client, Guid universeId, Guid entityId) =>
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/universes/{universeId}/entities/{entityId}")).StatusCode);

    private static async Task<StoryDetail> CreateStory(HttpClient client, Guid universeId, string title)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/stories",
            new StoryRequest(title, null, StoryStatus.Planning));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StoryDetail>())!;
    }

    private static async Task<EntityDetail> CreateEntity(HttpClient client, Guid universeId, string name, Guid? typeId = null)
    {
        if (typeId is null)
        {
            var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
                $"/api/universes/{universeId}/entity-types"))!;
            typeId = types.First(type => type.Name == "Character").Id;
        }

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId.Value, name, null, CanonStatus.Canon, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<FallEras> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        var eras = (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        return new FallEras(eras[0].Id, eras[1].Id);
    }

    private async Task WithDb(Func<LorEvolveDbContext, Task> work)
    {
        using var scope = _factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }

    private async Task<(HttpClient Client, UniverseDetail Universe, StoryDetail Story)> WithStory(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        return (client, universe, await CreateStory(client, universe.Id, $"Story {tag}"));
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
