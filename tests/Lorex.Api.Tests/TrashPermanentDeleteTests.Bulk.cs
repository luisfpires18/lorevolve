using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Trash;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RuleValidationTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Deleting a selection from the Trash for good, all at once (ADR 0015, 0029, 0033 amended 2026-10-01).
///
/// Four claims on top of the single routes'. The request is refused whole when its shape is wrong. The selection is resolved
/// whole before anything is written: one row that is not in this universe's Trash as its kind deletes nothing. Any mix of
/// kinds goes in one transaction, a selected parent satisfying its selected children. And what it answers names exactly the
/// entries and scenes that went, so a client can let go of exactly their recovery copies.
/// </summary>
public sealed partial class TrashPermanentDeleteTests
{
    // ---------- The request ----------

    [Fact]
    public async Task Bulk_refuses_a_request_of_the_wrong_shape_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbshape");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Shape kept");
        await Deleted(client, EntityPath(u, entity));

        async Task Refused(object body, string key)
        {
            var response = await client.PostAsJsonAsync(BulkRoute(u), body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        await Refused(new { items = Array.Empty<object>() }, "items");
        await Refused(new { }, "items");
        await Refused(
            new { items = Enumerable.Range(0, 101).Select(_ => new { kind = 0, id = Guid.NewGuid() }).ToArray() }, "items");
        await Refused(new { items = new object[] { new { kind = 0, id = entity }, new { kind = 9, id = Guid.NewGuid() } } }, "items[1].kind");
        await Refused(new { items = new object[] { new { kind = 0, id = entity }, new { kind = 0, id = entity } } }, "items[1]");
        await Refused(new { items = new object[] { new { kind = 1, id = Guid.Empty } } }, "items[0].id");

        // The same id under two kinds is two different selections, not a duplicate - and here one of them does not resolve.
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await Bulk(client, u, new(TrashItemKind.Entry, entity), new(TrashItemKind.Story, entity))).StatusCode);

        Assert.Equal(entity, Assert.Single((await Trash(client, u)).Items).Id);
    }

    [Fact]
    public async Task Bulk_takes_up_to_one_hundred_items()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbmax");
        var u = universe.Id;
        var ids = new List<Guid>();
        for (var index = 0; index < TrashPermanentDelete.BulkDeleteMaxItems; index++)
        {
            ids.Add((await WorldRuleTestClient.CreateRule(client, u, $"Rule {index}")).Id);
            await Deleted(client, WorldRuleTestClient.Rule(u, ids[^1]));
        }

        var response = await Bulk(client, u, [.. ids.Select(id => new TrashSelection(TrashItemKind.WorldRule, id))]);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(100, (await Erased(response)).Deleted);
        Assert.Empty((await Trash(client, u)).Items);
    }

    // ---------- Owner, universe, kind, Trash ----------

    [Fact]
    public async Task Bulk_in_another_accounts_universe_is_not_found_and_erases_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "pdbowner");
        var entity = await CreateEntity(owner, universe.Id, "Guarded in bulk");
        await Deleted(owner, EntityPath(universe.Id, entity));
        var (intruder, _) = await SignedInWithUniverse(_factory, "pdbintruder");

        var trashed = await Bulk(intruder, universe.Id, new TrashSelection(TrashItemKind.Entry, entity));
        var missing = await Bulk(intruder, Guid.NewGuid(), new TrashSelection(TrashItemKind.Entry, entity));

        Assert.Equal(HttpStatusCode.NotFound, trashed.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Single((await Trash(owner, universe.Id)).Items);
    }

    [Fact]
    public async Task Bulk_with_one_row_that_does_not_resolve_deletes_nothing_at_all()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbstale");
        var u = universe.Id;
        var other = await CreateUniverse(client, "Other world pdbstale");

        // Four valid rows of different kinds...
        var entry = await CreateEntity(client, u, "Valid entry");
        var story = await CreateStory(client, u, "Valid story");
        var saga = await CreateStory(client, u, "Standing saga");
        var scene = await CreateScene(client, u, saga, "Valid scene");
        var rule = await WorldRuleTestClient.CreateRule(client, u, "Valid rule");
        await Deleted(client, EntityPath(u, entry));
        await Deleted(client, Story(u, story));
        await Deleted(client, $"{Story(u, saga)}/scenes/{scene}");
        await Deleted(client, WorldRuleTestClient.Rule(u, rule.Id));

        // ...and, in turn, one that is not a row of this universe's Trash as what it is said to be.
        var liveEntry = await CreateEntity(client, u, "Live entry");
        var liveStory = await CreateStory(client, u, "Live story");
        var elsewhere = await CreateEntity(client, other.Id, "Elsewhere entry");
        await Deleted(client, EntityPath(other.Id, elsewhere));
        var restored = await CreateEntity(client, u, "Restored elsewhere");
        await Deleted(client, EntityPath(u, restored));
        await RestoreEntity(client, u, restored);

        TrashSelection[] valid =
        [
            new(TrashItemKind.Entry, entry),
            new(TrashItemKind.Story, story),
            new(TrashItemKind.Scene, scene),
            new(TrashItemKind.WorldRule, rule.Id),
        ];

        TrashSelection[] spoilers =
        [
            new(TrashItemKind.Entry, liveEntry),                // live entry
            new(TrashItemKind.Story, liveStory),                // live story
            new(TrashItemKind.Chapter, story),                  // a trashed story's id as a chapter
            new(TrashItemKind.Entry, Guid.NewGuid()),           // missing, or already erased
            new(TrashItemKind.Entry, elsewhere),                // another universe's trashed entry
            new(TrashItemKind.Entry, restored),                 // restored in another tab
        ];

        foreach (var spoiler in spoilers)
        {
            var response = await Bulk(client, u, [.. valid, spoiler]);

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains(TrashPermanentDelete.SelectionChangedCode, body, StringComparison.Ordinal);
            Assert.DoesNotContain(spoiler.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Equal(4, (await Trash(client, u)).TotalCount);
        Assert.Equal(1, (await Trash(client, other.Id)).TotalCount);
        await WithDb(_factory, async db =>
        {
            Assert.True(await db.Entities.AnyAsync(row => row.Id == liveEntry && row.DeletedAt == null));
            Assert.True(await db.Stories.AnyAsync(row => row.Id == liveStory && row.DeletedAt == null));
            Assert.True(await db.Entities.AnyAsync(row => row.Id == restored && row.DeletedAt == null));
        });
    }

    // ---------- Mixed kinds ----------

    [Fact]
    public async Task Bulk_erases_entries_scenes_and_rules_together_and_names_exactly_what_went()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbmixed");
        var u = universe.Id;
        var first = await CreateEntity(client, u, "First relic");
        var second = await CreateEntity(client, u, "Second relic");
        var kept = await CreateEntity(client, u, "Kept relic");
        var saga = await CreateStory(client, u, "Mixed saga");
        var scene = await CreateScene(client, u, saga, "Binned scene");
        var keptScene = await CreateScene(client, u, saga, "Kept scene");
        await WriteManuscript(client, u, saga, scene, "Gone words.");
        var rule = await WorldRuleTestClient.CreateRule(client, u, "Binned rule");
        foreach (var path in new[]
        {
            EntityPath(u, first), EntityPath(u, second), EntityPath(u, kept), $"{Story(u, saga)}/scenes/{scene}",
            WorldRuleTestClient.Rule(u, rule.Id),
        })
        {
            await Deleted(client, path);
        }

        // Request order is not an order of work.
        var response = await Bulk(
            client, u,
            new(TrashItemKind.WorldRule, rule.Id), new(TrashItemKind.Scene, scene), new(TrashItemKind.Entry, second), new(TrashItemKind.Entry, first));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var erased = await Erased(response);
        Assert.Equal(4, erased.Deleted);
        Assert.Equal(new[] { first, second }.Order(), erased.ErasedEntryIds.Order());
        Assert.Equal([scene], erased.ErasedSceneIds);

        Assert.Equal(kept, Assert.Single((await Trash(client, u)).Items).Id);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(row => row.Id == first || row.Id == second));
            Assert.False(await db.Scenes.AnyAsync(row => row.Id == scene));
            Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.WorldRules.AnyAsync(row => row.Id == rule.Id));
            Assert.True(await db.Scenes.AnyAsync(row => row.Id == keptScene && row.DeletedAt == null));
        });
    }

    // ---------- Overlapping ownership ----------

    [Fact]
    public async Task Bulk_with_a_story_and_its_own_rows_succeeds_and_counts_every_selected_row()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdboverlap");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Overlapping saga");
        var chapter = await CreateChapter(client, u, story, "Binned chapter");
        var binnedScene = await CreateScene(client, u, story, "Binned scene");
        var unbinnedScene = await CreateScene(client, u, story, "Scene inside");
        var arc = await CreateArc(client, u, story, "Binned arc");
        var beat = await CreateBeat(client, u, story, arc.Id, "Binned beat");
        var standing = await CreateStory(client, u, "Standing saga");
        var standingScene = await CreateScene(client, u, standing, "Standing scene");

        await Deleted(client, Beat(u, story, beat.Id));
        await Deleted(client, Arc(u, story, arc.Id));
        await Deleted(client, $"{Story(u, story)}/scenes/{binnedScene}");
        await Deleted(client, $"{Story(u, story)}/chapters/{chapter}");
        await Deleted(client, Story(u, story));
        Assert.Equal(5, (await Trash(client, u)).TotalCount);

        // Children first in the request: the plan, not the order, decides.
        var response = await Bulk(
            client, u,
            new(TrashItemKind.PlotBeat, beat.Id), new(TrashItemKind.Scene, binnedScene), new(TrashItemKind.Chapter, chapter),
            new(TrashItemKind.PlotArc, arc.Id), new(TrashItemKind.Story, story));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var erased = await Erased(response);
        Assert.Equal(5, erased.Deleted);
        Assert.Empty(erased.ErasedEntryIds);

        // Every scene the story held, selected or not; none of another story's.
        Assert.Equal(new[] { binnedScene, unbinnedScene }.Order(), erased.ErasedSceneIds.Order());
        Assert.DoesNotContain(standingScene, erased.ErasedSceneIds);

        Assert.Empty((await Trash(client, u)).Items);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Stories.AnyAsync(row => row.Id == story));
            Assert.False(await db.Chapters.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.Scenes.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.PlotArcs.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.PlotBeats.AnyAsync(row => row.Id == beat.Id));
            Assert.True(await db.Scenes.AnyAsync(row => row.Id == standingScene));
        });
    }

    [Fact]
    public async Task Bulk_with_an_arc_and_its_beat_succeeds_and_takes_its_other_beats()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbarc");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Arc saga");
        var arc = await CreateArc(client, u, story, "Binned arc");
        var selectedBeat = await CreateBeat(client, u, story, arc.Id, "Selected beat");
        var unselectedBinned = await CreateBeat(client, u, story, arc.Id, "Unselected binned beat");
        var liveBeat = await CreateBeat(client, u, story, arc.Id, "Live beat");

        await Deleted(client, Beat(u, story, selectedBeat.Id));
        await Deleted(client, Beat(u, story, unselectedBinned.Id));
        await Deleted(client, Arc(u, story, arc.Id));

        var response = await Bulk(client, u, new(TrashItemKind.PlotBeat, selectedBeat.Id), new(TrashItemKind.PlotArc, arc.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var erased = await Erased(response);
        Assert.Equal(2, erased.Deleted);
        Assert.Empty(erased.ErasedSceneIds);
        Assert.Empty((await Trash(client, u)).Items);
        var beats = new[] { selectedBeat.Id, unselectedBinned.Id, liveBeat.Id };
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.PlotArcs.AnyAsync(row => row.Id == arc.Id));
            Assert.False(await db.PlotBeats.AnyAsync(row => beats.Contains(row.Id)));
            Assert.True(await db.Stories.AnyAsync(row => row.Id == story && row.DeletedAt == null));
        });
    }

    [Fact]
    public async Task Bulk_erasing_a_chapter_leaves_the_scenes_it_gave_to_Unchaptered()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbchapter");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Kept saga");
        var chapter = await CreateChapter(client, u, story, "Emptied chapter");
        var kept = await CreateScene(client, u, story, "Kept scene", chapter);
        var rule = await WorldRuleTestClient.CreateRule(client, u, "Rule beside it");
        await Deleted(client, $"{Story(u, story)}/chapters/{chapter}");
        await Deleted(client, WorldRuleTestClient.Rule(u, rule.Id));

        var response = await Bulk(client, u, new(TrashItemKind.Chapter, chapter), new(TrashItemKind.WorldRule, rule.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var erased = await Erased(response);
        Assert.Equal(2, erased.Deleted);
        Assert.Empty(erased.ErasedSceneIds);
        var read = await ReadStory(client, u, story);
        Assert.Empty(read.Chapters);
        Assert.Equal(kept, Assert.Single(read.Scenes, scene => scene.ChapterId == null).Id);
    }

    // ---------- Entries ----------

    [Fact]
    public async Task Bulk_erases_entries_that_point_at_each_other_and_every_reference_to_any_of_them()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbentries");
        var u = universe.Id;
        var character = await TypeId(client, u, "Character");
        var mentor = await AddField(client, u, character, "Mentor", EntityFieldKind.EntityReference);

        var eldric = await CreateEntry(client, u, character, "Eldric", CanonStatus.Idea);
        var maelis = await CreateEntry(
            client, u, character, "Maelis", CanonStatus.Idea,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, eldric.Id)]);

        // Eldric points back at Maelis: the two selected entries reference each other.
        (await client.PutVersionedAsync(EntityPath(u, eldric.Id), new EntityRequest(
            character, "Eldric", null, CanonStatus.Idea, null, null,
            [new FieldValueInput(mentor, null, null, null, null, null, maelis.Id)]))).EnsureSuccessStatusCode();

        // Live lore pointing at each: two references, a relationship between the two, and moments naming them.
        var aria = await CreateEntry(
            client, u, character, "Aria", CanonStatus.Idea,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, eldric.Id)]);
        var bran = await CreateEntry(
            client, u, character, "Bran", CanonStatus.Idea,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, maelis.Id)]);
        var kin = await RelationshipType(client, u);
        var between = await PostJson<RelationshipDetail>(
            client, $"/api/universes/{u}/relationships",
            new RelationshipRequest(kin, eldric.Id, maelis.Id, CanonStatus.Idea, null, null, null));
        var toAria = await PostJson<RelationshipDetail>(
            client, $"/api/universes/{u}/relationships",
            new RelationshipRequest(kin, aria.Id, maelis.Id, CanonStatus.Idea, null, null, null));
        var resurrection = await EventKind(client, u, "Return");
        var onlyEldric = await CreateMoment(client, u, Moment("Only Eldric", Details(null, null, eldric.Id), CanonStatus.Idea));
        var maelisWithKind = await CreateMoment(client, u, Moment("Maelis returns", Details(resurrection.Id, null, maelis.Id), CanonStatus.Idea));

        await Deleted(client, EntityPath(u, eldric.Id));
        await Deleted(client, EntityPath(u, maelis.Id));

        var response = await Bulk(client, u, new(TrashItemKind.Entry, eldric.Id), new(TrashItemKind.Entry, maelis.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new[] { eldric.Id, maelis.Id }.Order(), (await Erased(response)).ErasedEntryIds.Order());

        var gone = new[] { eldric.Id, maelis.Id };
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(row => gone.Contains(row.Id)));
            Assert.False(await db.EntityFieldValues.AnyAsync(row => row.ReferencedEntityId != null && gone.Contains(row.ReferencedEntityId.Value)));
            Assert.False(await db.Relationships.AnyAsync(row => row.Id == between.Id || row.Id == toAria.Id));

            // A moment whose only detail was an erased participant has none left; one with an event kind keeps it, unnamed.
            Assert.False(await db.TimelineEntryValidations.AnyAsync(row => row.TimelineEntryId == onlyEldric.Id));
            var kept = await db.TimelineEntryValidations.SingleAsync(row => row.TimelineEntryId == maelisWithKind.Id);
            Assert.Equal(resurrection.Id, kept.EventKindTermId);
            Assert.Null(kept.ParticipantEntityId);
        });

        // What pointed at them reads and saves as it stands.
        foreach (var entity in new[] { aria.Id, bran.Id })
        {
            var read = (await client.GetFromJsonAsync<EntityDetail>(EntityPath(u, entity)))!;
            Assert.DoesNotContain(read.Fields, field => field.ReferencedEntityId is not null);
            Assert.Equal(HttpStatusCode.OK, (await Resave(client, u, read)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{u}/timeline/{onlyEldric.Id}")).StatusCode);
        Assert.DoesNotContain((await Backup(client, u)).Payload.Entities, entry => gone.Contains(entry.Id));
    }

    [Fact]
    public async Task Bulk_forgets_findings_about_erased_entries_and_relationships_and_reconciles_the_rest()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbcanon");
        var u = universe.Id;
        var character = await TypeId(client, u, "Character");
        var mentor = await AddField(client, u, character, "Mentor", EntityFieldKind.EntityReference);
        var first = await CreateEntry(client, u, character, "Draft mentor one", CanonStatus.Idea);
        var second = await CreateEntry(client, u, character, "Draft mentor two", CanonStatus.Idea);
        var pupil = await CreateEntry(
            client, u, character, "Canon pupil", CanonStatus.Canon,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, first.Id)]);
        var kin = await RelationshipType(client, u);
        var link = await PostJson<RelationshipDetail>(
            client, $"/api/universes/{u}/relationships",
            new RelationshipRequest(kin, pupil.Id, second.Id, CanonStatus.Canon, null, null, null));

        await WithDb(_factory, async db =>
        {
            Assert.True(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == first.Id));
            Assert.True(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == link.Id));
        });

        await Deleted(client, EntityPath(u, first.Id));
        await Deleted(client, EntityPath(u, second.Id));

        (await Bulk(client, u, new(TrashItemKind.Entry, first.Id), new(TrashItemKind.Entry, second.Id))).EnsureSuccessStatusCode();

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == first.Id || row.SubjectId == second.Id));
            Assert.False(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == link.Id));
        });

        // The conflict table describes the lore that is left: a fresh evaluation finds nothing new to record.
        Assert.Empty(await Conflicts(client, u, null));
        Assert.Equal(0, (await Evaluate(client, u)).Created);
    }

    [Fact]
    public async Task Bulk_frees_a_type_held_only_by_the_erased_entries()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbtype");
        var u = universe.Id;
        var location = await TypeId(client, u, "Location");
        var first = await CreateEntry(client, u, location, "Grey Harbour", CanonStatus.Idea);
        var second = await CreateEntry(client, u, location, "Salt Road", CanonStatus.Idea);
        await Deleted(client, EntityPath(u, first.Id));
        await Deleted(client, EntityPath(u, second.Id));

        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}")).StatusCode);

        (await Bulk(client, u, new(TrashItemKind.Entry, first.Id), new(TrashItemKind.Entry, second.Id))).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}")).StatusCode);
    }

    // ---------- World rules ----------

    [Fact]
    public async Task Bulk_erases_rules_and_every_finding_about_them()
    {
        var world = await NewCheckedWorld(_factory, "pdbrule");
        await world.Occurrence("Arlen returns", world.Arlen);
        await world.Occurrence("Arlen returns again", world.Arlen);
        Assert.Single(await world.Findings());
        var plain = await WorldRuleTestClient.CreateRule(world.Client, world.Universe, "Plain rule");

        await Deleted(world.Client, WorldRuleTestClient.Rule(world.Universe, world.Rule.Id));
        await Deleted(world.Client, WorldRuleTestClient.Rule(world.Universe, plain.Id));

        var response = await Bulk(
            world.Client, world.Universe,
            new(TrashItemKind.WorldRule, world.Rule.Id), new(TrashItemKind.WorldRule, plain.Id));

        Assert.Equal(2, (await Erased(response)).Deleted);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.WorldRules.AnyAsync(row => row.Id == world.Rule.Id || row.Id == plain.Id));
            Assert.False(await db.WorldRuleValidations.AnyAsync(row => row.WorldRuleId == world.Rule.Id));
            Assert.False(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == world.Rule.Id));
        });
        Assert.Empty(await world.Findings(null));
    }

    // ---------- Pictures ----------

    [Fact]
    public async Task Bulk_sweeps_every_erased_entrys_picture_only_after_the_commit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbimage");
        var u = universe.Id;
        var first = await CreateEntity(client, u, "Portrait one");
        var second = await CreateEntity(client, u, "Portrait two");
        var keys = new[] { await Picture(client, u, first), await Picture(client, u, second) }
            .SelectMany(pair => new[] { pair.Original, pair.Thumbnail })
            .ToHashSet();
        await Deleted(client, EntityPath(u, first));
        await Deleted(client, EntityPath(u, second));

        var presentWhenSwept = new System.Collections.Concurrent.ConcurrentQueue<bool>();
        _factory.Media.FailDelete = key =>
        {
            if (keys.Contains(key))
            {
                using var scope = _factory.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
                presentWhenSwept.Enqueue(db.Entities.Any(row => row.Id == first || row.Id == second));
            }

            return null;
        };

        try
        {
            (await Bulk(client, u, new(TrashItemKind.Entry, first), new(TrashItemKind.Entry, second))).EnsureSuccessStatusCode();
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        Assert.Equal([false, false, false, false], presentWhenSwept);
        Assert.All(keys, key => Assert.False(_factory.Media.Contains(key)));
    }

    [Fact]
    public async Task Bulk_sweep_that_fails_leaves_the_entries_erased()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbsweep");
        var u = universe.Id;
        var first = await CreateEntity(client, u, "Stubborn one");
        var second = await CreateEntity(client, u, "Stubborn two");
        var keys = new[] { await Picture(client, u, first), await Picture(client, u, second) }
            .SelectMany(pair => new[] { pair.Original, pair.Thumbnail })
            .ToHashSet();
        await Deleted(client, EntityPath(u, first));
        await Deleted(client, EntityPath(u, second));

        _factory.Media.FailDelete = key => keys.Contains(key) ? new IOException("The bucket is away.") : null;
        HttpResponseMessage response;
        try
        {
            response = await Bulk(client, u, new(TrashItemKind.Entry, first), new(TrashItemKind.Entry, second));
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, (await Erased(response)).Deleted);
        Assert.Empty((await Trash(client, u)).Items);
        await WithDb(_factory, async db => Assert.False(await db.EntityImages.AnyAsync(row => row.EntityId == first || row.EntityId == second)));
        Assert.All(keys, key => Assert.True(_factory.Media.Contains(key)));
    }

    // ---------- All or none ----------

    [Fact]
    public async Task Bulk_database_failure_rolls_back_every_row_and_sweeps_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbrollback");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Unbreakable in bulk");
        var (original, thumbnail) = await Picture(client, u, entity);
        var story = await CreateStory(client, u, "Unbreakable saga");
        var rule = await WorldRuleTestClient.CreateRule(client, u, "Unbreakable rule");
        await Deleted(client, EntityPath(u, entity));
        await Deleted(client, Story(u, story));
        await Deleted(client, WorldRuleTestClient.Rule(u, rule.Id));

        // The last statement of the plan fails, after the entry and the story were already deleted inside the transaction.
        _factory.Commands.FailWhen = command => command.CommandText.Contains("DELETE FROM \"WorldRules\"", StringComparison.Ordinal);

        Exception? failure;
        try
        {
            failure = await Record.ExceptionAsync(async () =>
                (await Bulk(
                    client, u,
                    new(TrashItemKind.Entry, entity), new(TrashItemKind.Story, story), new(TrashItemKind.WorldRule, rule.Id)))
                .EnsureSuccessStatusCode());
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        Assert.NotNull(failure);
        Assert.Equal(3, (await Trash(client, u)).TotalCount);
        await WithDb(_factory, async db => Assert.True(await db.EntityImages.AnyAsync(row => row.EntityId == entity)));
        Assert.True(_factory.Media.Contains(original));
        Assert.True(_factory.Media.Contains(thumbnail));
    }

    // ---------- Helpers ----------

    private static string BulkRoute(Guid universeId) => $"{TrashRoute(universeId)}/bulk-delete";

    private static Task<HttpResponseMessage> Bulk(HttpClient client, Guid universeId, params TrashSelection[] items) =>
        client.PostAsJsonAsync(BulkRoute(universeId), new BulkTrashDeleteRequest(items));

    private static async Task<TrashBulkErased> Erased(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrashBulkErased>())!;
    }
}
