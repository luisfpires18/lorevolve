using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Ideas;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What an idea may point at (ADR 0030): an entry, story, scene, arc or beat of its own universe, named by an explicit kind,
/// resolved by name on every read, never across a universe or an account, never held by an idea with no universe, and kept
/// - marked, and never newly chosen - while its target is in the Trash. And that none of it, nor anything else an idea does,
/// changes the lore.
/// </summary>
public sealed class IdeaReferenceTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private sealed record World(Guid Universe, Guid Entity, Guid Story, Guid Scene, Guid Arc, Guid Beat)
    {
        public IReadOnlyList<IdeaReferenceInput> All =>
        [
            Ref(IdeaReferenceKind.Entity, Entity),
            Ref(IdeaReferenceKind.Story, Story),
            Ref(IdeaReferenceKind.Scene, Scene),
            Ref(IdeaReferenceKind.PlotArc, Arc),
            Ref(IdeaReferenceKind.PlotBeat, Beat),
        ];
    }

    private static async Task<World> BuildWorld(HttpClient client, Guid universeId, string tag)
    {
        var entity = await CreateEntity(client, universeId, $"Arlen {tag}");
        var story = await CreateStory(client, universeId, $"The Long Winter {tag}");
        var scene = await CreateScene(client, universeId, story, $"The Council {tag}");
        var arc = await CreateArc(client, universeId, story, $"Fall of the King {tag}");
        var beat = await CreateBeat(client, universeId, story, arc.Id, $"Learns {tag}");
        return new World(universeId, entity, story, scene, arc.Id, beat.Id);
    }

    [Fact]
    public async Task Every_kind_of_target_is_referenced_resolved_by_name_and_counted()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefall");
        var world = await BuildWorld(client, universe.Id, "a");

        var idea = await CreateIdea(client, "Everything at once", universeId: universe.Id, references: world.All);

        Assert.Equal(
            [
                (IdeaReferenceKind.Entity, world.Entity, "Arlen a", (Guid?)null),
                (IdeaReferenceKind.Story, world.Story, "The Long Winter a", world.Story),
                (IdeaReferenceKind.Scene, world.Scene, "The Council a", world.Story),
                (IdeaReferenceKind.PlotArc, world.Arc, "Fall of the King a", world.Story),
                (IdeaReferenceKind.PlotBeat, world.Beat, "Learns a", world.Story),
            ],
            idea.References.Select(reference => (reference.Kind, reference.Id, reference.Name, reference.StoryId)));
        Assert.All(idea.References, reference => Assert.False(reference.IsInTrash));
        Assert.Equal("Character", idea.References[0].EntityTypeName);
        Assert.Equal("The Long Winter a", idea.References[2].StoryTitle);
        Assert.Equal("Fall of the King a", idea.References[4].PlotArcTitle);

        Assert.Equal(5, (await ListIdeas(client)).Items.Single().ReferenceCount);

        // Names are read from the targets, never copied: a renamed story is renamed on the idea.
        (await client.PutVersionedAsync(Story(universe.Id, world.Story), new LorEvolve.Api.Features.Stories.StoryRequest(
            "The Longest Winter", null, LorEvolve.Api.Features.Stories.StoryStatus.Planning))).EnsureSuccessStatusCode();
        Assert.Equal(
            "The Longest Winter",
            (await ReadIdea(client, idea.Id)).References.Single(reference => reference.Kind == IdeaReferenceKind.Story).Name);

        // Removing one reference keeps the others.
        var fewer = await Save(client, idea, references: [.. world.All.Where(reference => reference.Kind != IdeaReferenceKind.Scene)]);
        Assert.Equal(4, fewer.References.Count);
        Assert.DoesNotContain(fewer.References, reference => reference.Kind == IdeaReferenceKind.Scene);
    }

    [Fact]
    public async Task A_kind_that_does_not_match_the_id_is_refused_never_inferred()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefkind");
        var world = await BuildWorld(client, universe.Id, "k");

        // A scene's id named as a story is not a story reference.
        var wrongKind = await client.PostAsJsonAsync(
            Ideas, new IdeaRequest("Mismatch", null, universe.Id, [Ref(IdeaReferenceKind.Story, world.Scene)], null));
        Assert.Contains("references", await Errors(wrongKind), StringComparison.Ordinal);

        var unknownKind = await client.PostAsJsonAsync(
            Ideas, new { title = "Unknown", universeId = universe.Id, references = new[] { new { kind = 9, id = world.Entity } } });
        Assert.Contains("references", await Errors(unknownKind), StringComparison.Ordinal);

        var targets = await client.GetAsync($"{Ideas}/reference-targets?universeId={universe.Id}&kind=9");
        Assert.Contains("kind", await Errors(targets), StringComparison.Ordinal);

        Assert.Empty((await ListIdeas(client)).Items);
    }

    [Fact]
    public async Task References_stay_inside_the_ideas_own_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefwrong");
        var other = await CreateUniverse(client, "Other idearefwrong");
        var here = await BuildWorld(client, universe.Id, "here");
        var there = await BuildWorld(client, other.Id, "there");

        foreach (var foreign in there.All)
        {
            var refused = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Across", null, universe.Id, [foreign], null));
            Assert.Contains("references", await Errors(refused), StringComparison.Ordinal);
        }

        // Moving the universe while keeping the old references is one save, refused as one: nothing is dropped quietly.
        var idea = await CreateIdea(client, "Anchored", "Words.", universe.Id, here.All);
        var moved = await TrySave(client, idea, universeId: other.Id);
        Assert.Contains("references", await Errors(moved), StringComparison.Ordinal);
        var unchanged = await ReadIdea(client, idea.Id);
        Assert.Equal((universe.Id, 5), (unchanged.Universe!.Id, unchanged.References.Count));

        // Moving with the references changed in the same save is accepted, whole.
        var relocated = await Save(client, idea, universeId: other.Id, references: [Ref(IdeaReferenceKind.Entity, there.Entity)]);
        Assert.Equal((other.Id, there.Entity), (relocated.Universe!.Id, Assert.Single(relocated.References).Id));
    }

    [Fact]
    public async Task An_unassigned_idea_holds_no_references()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefloose");
        var world = await BuildWorld(client, universe.Id, "l");

        var created = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Loose", null, null, world.All, null));
        Assert.Contains("references", await Errors(created), StringComparison.Ordinal);

        var idea = await CreateIdea(client, "Assigned", universeId: universe.Id, references: world.All);

        // Unassigning while it still references content is refused - the references are not silently dropped.
        var unassigned = await TrySave(client, idea, universeId: null);
        Assert.Contains("references", await Errors(unassigned), StringComparison.Ordinal);
        Assert.Equal(5, (await ReadIdea(client, idea.Id)).References.Count);

        var cleared = await Save(client, idea, universeId: null, references: []);
        Assert.Null(cleared.Universe);
        Assert.Empty(cleared.References);
    }

    [Fact]
    public async Task A_target_in_the_trash_stays_referenced_marked_cannot_be_newly_chosen_and_returns_with_its_restore()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefbin");
        var u = universe.Id;
        var world = await BuildWorld(client, u, "t");
        var spare = await CreateEntity(client, u, "Spare entry");
        var idea = await CreateIdea(client, "Marked", universeId: u, references: [Ref(IdeaReferenceKind.Entity, world.Entity), Ref(IdeaReferenceKind.Scene, world.Scene), Ref(IdeaReferenceKind.PlotBeat, world.Beat)]);

        (await client.DeleteAsync($"/api/universes/{u}/entities/{world.Entity}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}/entities/{spare}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Arc(u, world.Story, world.Arc))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, world.Story))).EnsureSuccessStatusCode();

        // Kept and marked: the entry itself is in the Trash, the scene and beat sit in something that is.
        var marked = await ReadIdea(client, idea.Id);
        Assert.Equal(3, marked.References.Count);
        Assert.All(marked.References, reference => Assert.True(reference.IsInTrash));

        // Sent back whole with an edit, they stay.
        var edited = await Save(client, marked, body: "Edited while its targets are in the Trash.");
        Assert.Equal(3, edited.References.Count);

        // Something in the Trash cannot be newly referenced, and a picker is never offered it.
        var newly = await TrySave(client, edited, references: [.. edited.References.Select(reference => Ref(reference.Kind, reference.Id)), Ref(IdeaReferenceKind.Entity, spare)]);
        Assert.Contains("references", await Errors(newly), StringComparison.Ordinal);
        var story = await TrySave(client, edited, references: [.. edited.References.Select(reference => Ref(reference.Kind, reference.Id)), Ref(IdeaReferenceKind.Story, world.Story)]);
        Assert.Contains("references", await Errors(story), StringComparison.Ordinal);

        foreach (var kind in Enum.GetValues<IdeaReferenceKind>())
        {
            var offered = (await client.GetFromJsonAsync<List<IdeaReferenceView>>(
                $"{Ideas}/reference-targets?universeId={u}&kind={(int)kind}"))!;
            Assert.DoesNotContain(offered, target => target.IsInTrash);
            Assert.Empty(offered);
        }

        // Restored, the targets are live on the idea again without anyone touching it.
        (await client.PostAsync($"/api/universes/{u}/trash/{world.Entity}/restore", content: null)).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/universes/{u}/trash/stories/{world.Story}/restore", content: null)).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/universes/{u}/trash/plot-arcs/{world.Arc}/restore", content: null)).EnsureSuccessStatusCode();

        var live = await ReadIdea(client, idea.Id);
        Assert.Equal(3, live.References.Count);
        Assert.All(live.References, reference => Assert.False(reference.IsInTrash));
        Assert.Equal(edited.UpdatedAt, live.UpdatedAt);

        // Removing a marked reference is an ordinary save.
        (await client.DeleteAsync($"/api/universes/{u}/entities/{world.Entity}")).EnsureSuccessStatusCode();
        var trimmed = await Save(client, await ReadIdea(client, idea.Id), references: [Ref(IdeaReferenceKind.Scene, world.Scene)]);
        Assert.Equal(world.Scene, Assert.Single(trimmed.References).Id);
    }

    [Fact]
    public async Task A_picker_is_offered_live_targets_of_one_kind_in_the_universe_by_name()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idearefpick");
        var other = await CreateUniverse(client, "Other idearefpick");
        var world = await BuildWorld(client, universe.Id, "p");
        await BuildWorld(client, other.Id, "elsewhere");
        await CreateEntity(client, universe.Id, "Brannoch");

        async Task<List<IdeaReferenceView>> Offered(IdeaReferenceKind kind, string search = "") =>
            (await client.GetFromJsonAsync<List<IdeaReferenceView>>(
                $"{Ideas}/reference-targets?universeId={universe.Id}&kind={(int)kind}&search={Uri.EscapeDataString(search)}"))!;

        Assert.Equal(["Arlen p", "Brannoch"], (await Offered(IdeaReferenceKind.Entity)).Select(target => target.Name));
        Assert.Equal(["Brannoch"], (await Offered(IdeaReferenceKind.Entity, "bran")).Select(target => target.Name));
        Assert.Equal([world.Story], (await Offered(IdeaReferenceKind.Story)).Select(target => target.Id));
        var scene = Assert.Single(await Offered(IdeaReferenceKind.Scene));
        Assert.Equal((world.Scene, world.Story, "The Long Winter p"), (scene.Id, scene.StoryId, scene.StoryTitle));
        Assert.Equal([world.Arc], (await Offered(IdeaReferenceKind.PlotArc)).Select(target => target.Id));
        var beat = Assert.Single(await Offered(IdeaReferenceKind.PlotBeat));
        Assert.Equal((world.Beat, "Fall of the King p"), (beat.Id, beat.PlotArcTitle));
    }

    [Fact]
    public async Task Another_account_can_neither_see_nor_touch_an_idea_nor_reach_its_universe_through_one()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "ideaownera");
        var world = await BuildWorld(owner, universe.Id, "own");
        var loose = await CreateIdea(owner, "Unassigned secret", "Only mine.");
        var assigned = await CreateIdea(owner, "Assigned secret", "Also mine.", universe.Id, world.All);
        var binned = await CreateIdea(owner, "Deleted secret", "Mine too.");
        (await owner.DeleteAsync(Idea(binned.Id))).EnsureSuccessStatusCode();

        var (intruder, intruderUniverse) = await SignedInWithUniverse(_factory, "ideaownerb");

        // Lists: nothing, however they are asked for.
        Assert.Empty((await ListIdeas(intruder)).Items);
        Assert.Empty((await ListIdeas(intruder, "?unassigned=true")).Items);
        Assert.Empty((await ListIdeas(intruder, $"?universeId={universe.Id}")).Items);
        Assert.Empty((await ListIdeas(intruder, "?deleted=true")).Items);
        Assert.Empty((await ListIdeas(intruder, "?search=secret")).Items);

        foreach (var idea in new[] { loose, assigned })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await intruder.GetAsync(Idea(idea.Id))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await TrySave(intruder, idea, body: "Overwritten.")).StatusCode);
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await TrySave(intruder, idea, universeId: intruderUniverse.Id, references: [])).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await intruder.DeleteAsync(Idea(idea.Id))).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await intruder.PostAsync($"{Idea(binned.Id)}/restore", content: null)).StatusCode);

        // An intruder's idea cannot be put in the owner's universe, nor point at the owner's content - refused in the words
        // used for a universe or target that does not exist.
        var intoOwners = await intruder.PostAsJsonAsync(Ideas, new IdeaRequest("Squatter", null, universe.Id, null, null));
        var intoNowhere = await intruder.PostAsJsonAsync(Ideas, new IdeaRequest("Squatter", null, Guid.NewGuid(), null, null));
        Assert.Equal(await Errors(intoNowhere), await Errors(intoOwners));

        foreach (var target in world.All)
        {
            var reaching = await intruder.PostAsJsonAsync(Ideas, new IdeaRequest("Reach", null, intruderUniverse.Id, [target], null));
            var missing = await intruder.PostAsJsonAsync(
                Ideas, new IdeaRequest("Reach", null, intruderUniverse.Id, [Ref(target.Kind, Guid.NewGuid())], null));
            Assert.Equal(await Errors(missing), await Errors(reaching));
        }

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await intruder.GetAsync($"{Ideas}/reference-targets?universeId={universe.Id}&kind=0")).StatusCode);

        // The owner's own idea, reassigned by its owner to the intruder's universe, is refused the same way.
        var owned = await TrySave(owner, loose, universeId: intruderUniverse.Id);
        Assert.Contains("universeId", await Errors(owned), StringComparison.Ordinal);

        // Nothing moved.
        Assert.Equal(("Only mine.", (Guid?)null), ((await ReadIdea(owner, loose.Id)).Body, (await ReadIdea(owner, loose.Id)).Universe?.Id));
        Assert.Equal(5, (await ReadIdea(owner, assigned.Id)).References.Count);
        Assert.Empty((await ListIdeas(intruder)).Items);
        Assert.Single((await ListIdeas(owner, "?deleted=true")).Items);
    }

    [Fact]
    public async Task Nothing_an_idea_does_changes_the_lore_or_the_story_it_points_at()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idealoreisolation");
        var u = universe.Id;
        var world = await BuildWorld(client, u, "i");

        async Task<string> Snapshot()
        {
            var text = string.Empty;
            await WithDb(_factory, async db =>
            {
                var entities = await db.Entities.AsNoTracking().Where(e => e.UniverseId == u)
                    .Select(e => e.Id + e.Name + e.CanonStatus + e.UpdatedAt.Ticks + e.DeletedAt).ToListAsync();
                var stories = await db.Stories.AsNoTracking().Where(s => s.UniverseId == u)
                    .Select(s => s.Id + s.Title + s.UpdatedAt.Ticks).ToListAsync();
                var scenes = await db.Scenes.AsNoTracking().Where(s => s.Story!.UniverseId == u)
                    .Select(s => s.Id + s.Title + s.UpdatedAt.Ticks).ToListAsync();
                var arcs = await db.PlotArcs.AsNoTracking().Where(a => a.Story!.UniverseId == u)
                    .Select(a => a.Id + a.Title + a.UpdatedAt.Ticks).ToListAsync();
                var beats = await db.PlotBeats.AsNoTracking().Where(b => b.PlotArc!.Story!.UniverseId == u)
                    .Select(b => b.Id + b.Title + b.UpdatedAt.Ticks).ToListAsync();
                var counts = new[]
                {
                    await db.Entities.CountAsync(),
                    await db.Relationships.CountAsync(),
                    await db.TimelineEntries.CountAsync(),
                    await db.EntityRevisions.CountAsync(),
                    await db.CanonConflicts.CountAsync(),
                    await db.Stories.CountAsync(),
                    await db.Scenes.CountAsync(),
                    await db.PlotBeats.CountAsync(),
                    await db.SceneManuscripts.CountAsync(),
                    await db.EntityArticles.CountAsync(),
                };
                text = string.Join('|', entities.Concat(stories).Concat(scenes).Concat(arcs).Concat(beats).Order(StringComparer.Ordinal))
                    + string.Join(',', counts)
                    + (await db.Universes.AsNoTracking().SingleAsync(candidate => candidate.Id == u)).UpdatedAt.Ticks;
            });
            return text;
        }

        var searchBefore = await client.GetStringAsync($"/api/universes/{u}/entities?search=Arlen");
        var before = await Snapshot();

        // "Arlen is dead" is an idea, never a fact: nothing is inferred from it, and every idea write leaves the world alone.
        var idea = await CreateIdea(client, "Arlen is dead", "Arlen died in year 12. Mira is his sister.", u, world.All);
        idea = await Save(client, idea, body: "Canon: Arlen is dead.");
        (await client.DeleteAsync(Idea(idea.Id))).EnsureSuccessStatusCode();
        (await client.PostAsync($"{Idea(idea.Id)}/restore", content: null)).EnsureSuccessStatusCode();
        await Save(client, await ReadIdea(client, idea.Id), universeId: null, references: []);

        Assert.Equal(before, await Snapshot());
        Assert.Equal(searchBefore, await client.GetStringAsync($"/api/universes/{u}/entities?search=Arlen"));
        Assert.Contains("\"items\":[]", await client.GetStringAsync($"/api/universes/{u}/entities?search=sister"), StringComparison.Ordinal);
    }
}
