using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Trash;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RuleValidationTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Deleting from the Trash for good (ADR 0015, 0029, 0033 amended 2026-09-30).
///
/// Four claims. Only something already in the Trash can be erased, on its own typed route, inside its own universe. Erasing
/// removes what the thing owns - including owned rows that sit in the Trash on their own - and nothing it does not own: a
/// chapter's scenes, the lore a scene or beat points at, the idea that mentioned it. What pointed at an erased entry stops
/// pointing, so the live lore left behind saves, reads and backs up cleanly and frees the type and fields it held. And an
/// entry's picture is swept only after the database has let go of it.
///
/// Every assertion is on stored rows or API reads, never on which EF call ran.
/// </summary>
public sealed partial class TrashPermanentDeleteTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Only from the Trash ----------

    [Fact]
    public async Task Nothing_live_can_be_erased_through_the_Trash()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdlive");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Alive");
        var story = await CreateStory(client, u, "Alive story");
        var chapter = await CreateChapter(client, u, story, "Alive chapter");
        var scene = await CreateScene(client, u, story, "Alive scene");
        var arc = await CreateArc(client, u, story, "Alive arc");
        var beat = await CreateBeat(client, u, story, arc.Id, "Alive beat");
        var rule = await WorldRuleTestClient.CreateRule(client, u, "Alive rule");

        foreach (var route in Routes(u, entity, story, chapter, scene, arc.Id, beat.Id, rule.Id))
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(route)).StatusCode);
        }

        await WithDb(_factory, async db =>
        {
            Assert.True(await db.Entities.AnyAsync(row => row.Id == entity && row.DeletedAt == null));
            Assert.True(await db.Stories.AnyAsync(row => row.Id == story && row.DeletedAt == null));
            Assert.True(await db.Chapters.AnyAsync(row => row.Id == chapter && row.DeletedAt == null));
            Assert.True(await db.Scenes.AnyAsync(row => row.Id == scene && row.DeletedAt == null));
            Assert.True(await db.PlotArcs.AnyAsync(row => row.Id == arc.Id && row.DeletedAt == null));
            Assert.True(await db.PlotBeats.AnyAsync(row => row.Id == beat.Id && row.DeletedAt == null));
            Assert.True(await db.WorldRules.AnyAsync(row => row.Id == rule.Id && row.DeletedAt == null));
        });
    }

    [Fact]
    public async Task A_missing_id_is_not_found_on_every_route()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdmissing");

        foreach (var route in Routes(universe.Id, [.. Enumerable.Range(0, 7).Select(_ => Guid.NewGuid())]))
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(route)).StatusCode);
        }
    }

    [Fact]
    public async Task No_route_guesses_what_an_id_is()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdkind");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Only a story");
        await Deleted(client, Story(u, story));

        // A trashed story's id on every other kind's route.
        foreach (var route in Routes(u, story, Guid.NewGuid(), story, story, story, story, story).Where((_, index) => index != 1))
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(route)).StatusCode);
        }

        Assert.Single((await Trash(client, u)).Items);
    }

    [Fact]
    public async Task Another_universes_trashed_item_is_not_found_and_stays()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdcross");
        var other = await CreateUniverse(client, "Other world pdcross");
        var entity = await CreateEntity(client, other.Id, "Elsewhere");
        var story = await CreateStory(client, other.Id, "Elsewhere story");
        await Deleted(client, $"/api/universes/{other.Id}/entities/{entity}");
        await Deleted(client, Story(other.Id, story));

        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(EntryRoute(universe.Id, entity))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{TrashRoute(universe.Id)}/stories/{story}")).StatusCode);
        Assert.Equal(2, (await Trash(client, other.Id)).TotalCount);
    }

    [Fact]
    public async Task Another_account_learns_nothing_and_erases_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "pdowner");
        var entity = await CreateEntity(owner, universe.Id, "Guarded");
        await Deleted(owner, $"/api/universes/{universe.Id}/entities/{entity}");
        var (intruder, _) = await SignedInWithUniverse(_factory, "pdintruder");

        var trashed = await intruder.DeleteAsync(EntryRoute(universe.Id, entity));
        var missing = await intruder.DeleteAsync(EntryRoute(universe.Id, Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.NotFound, trashed.StatusCode);
        Assert.Equal(await missing.Content.ReadAsStringAsync(), await trashed.Content.ReadAsStringAsync());
        Assert.Single((await Trash(owner, universe.Id)).Items);
    }

    // ---------- An entry ----------

    [Fact]
    public async Task An_entry_is_erased_with_everything_it_owns_and_every_reference_to_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdentry");
        var u = universe.Id;
        var character = await TypeId(client, u, "Character");
        var mentor = await AddField(client, u, character, "Mentor", EntityFieldKind.EntityReference);
        var motto = await AddField(client, u, character, "Motto", EntityFieldKind.ShortText);

        // The entry, owning an alias, a tag, a value, an article with two versions and an entry history of two versions.
        var eldric = await CreateEntry(
            client, u, character, "King Eldric", CanonStatus.Idea, aliases: ["The Old King"], tags: ["royalty"],
            fields: [new FieldValueInput(motto, "Hold the gate", null, null, null, null, null)]);
        await WriteArticle(client, u, eldric.Id, Doc("He kept the northern gate."));
        await WriteArticle(client, u, eldric.Id, Doc("He kept the northern gate, and lost it."));
        (await client.PutVersionedAsync(EntityPath(u, eldric.Id), new EntityRequest(
            character, "King Eldric", "The last king.", CanonStatus.Idea, ["The Old King"], ["royalty"],
            [new FieldValueInput(motto, "Hold the gate", null, null, null, null, null)]))).EnsureSuccessStatusCode();

        // Live lore pointing at it: a Canon entry's reference (a Canon finding), a relationship, two moments, a scene, a beat, an idea.
        var aria = await CreateEntry(
            client, u, character, "Aria", CanonStatus.Canon,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, eldric.Id)]);
        var kin = await RelationshipType(client, u);
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(kin, aria.Id, eldric.Id, CanonStatus.Idea, null, null, null))).EnsureSuccessStatusCode();
        var coronation = await CreateMoment(client, u, Moment("Coronation", null, CanonStatus.Idea, [eldric.Id, aria.Id]));
        var witnessed = await CreateMoment(client, u, Moment("Witnessed", Details(null, null, eldric.Id), CanonStatus.Idea));
        var story = await CreateStory(client, u, "The Gate");
        var scene = (await PostJson<Lorex.Api.Features.Stories.SceneResponse>(
            client,
            $"{Story(u, story)}/scenes",
            new Lorex.Api.Features.Stories.SceneRequest("At the gate", null, null, eldric.Id, null, [eldric.Id, aria.Id]))).Id;
        var arc = await CreateArc(client, u, story, "Fall");
        var beat = await CreateBeat(client, u, story, arc.Id, "The gate falls", entities: [eldric.Id, aria.Id]);
        var idea = await CreateIdea(client, "About the king", universeId: u, references: [Ref(IdeaReferenceKind.Entity, eldric.Id)]);

        Assert.Contains(await Conflicts(client, u, null), finding => finding.Subjects.Any(subject => subject.SubjectId == eldric.Id));

        var revisionIds = new List<Guid>();
        await WithDb(_factory, async db =>
        {
            revisionIds = await db.EntityRevisions.Where(row => row.EntityId == eldric.Id).Select(row => row.Id).ToListAsync();
            Assert.Equal(1, await IndexRows(db, "EntitySearchIndex", "EntityId", eldric.Id));
        });
        Assert.True(revisionIds.Count >= 2);

        await Deleted(client, EntityPath(u, eldric.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(EntryRoute(u, eldric.Id))).StatusCode);

        await WithDb(_factory, async db =>
        {
            var id = eldric.Id;
            Assert.False(await db.Entities.AnyAsync(row => row.Id == id));
            Assert.False(await db.EntityAliases.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.EntityTags.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.EntityFieldValues.AnyAsync(row => row.EntityId == id || row.ReferencedEntityId == id));
            Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.EntityArticleRevisions.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.EntityRevisions.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.EntityRevisionAliases.AnyAsync(row => revisionIds.Contains(row.RevisionId)));
            Assert.False(await db.EntityRevisionTags.AnyAsync(row => revisionIds.Contains(row.RevisionId)));
            Assert.False(await db.EntityRevisionFieldValues.AnyAsync(row => revisionIds.Contains(row.RevisionId)));
            Assert.False(await db.Relationships.AnyAsync(row => row.SourceEntityId == id || row.TargetEntityId == id));
            Assert.False(await db.TimelineEntryLinks.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.SceneEntityLinks.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.PlotBeatEntities.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.IdeaEntityReferences.AnyAsync(row => row.EntityId == id));
            Assert.False(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == id));
            Assert.Equal(0, await IndexRows(db, "EntitySearchIndex", "EntityId", id));

            // A moment whose only detail was this participant has no details left, as clearing them on a save does.
            Assert.False(await db.TimelineEntryValidations.AnyAsync(row => row.TimelineEntryId == witnessed.Id));

            // The tag itself is universe vocabulary and stays, as when an edit drops it.
            Assert.True(await db.Tags.AnyAsync(row => row.UniverseId == u && row.Name == "royalty"));
        });

        // Everything that pointed at it is still there, pointing at what is left.
        Assert.Equal([aria.Id], (await ReadMoment(client, u, coronation.Id)).Entities.Select(link => link.EntityId));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{u}/timeline/{witnessed.Id}")).StatusCode);
        var sceneRead = await client.GetFromJsonAsync<Lorex.Api.Features.Stories.SceneResponse>($"{Story(u, story)}/scenes/{scene}");
        Assert.Null(sceneRead!.Pov);
        Assert.Equal([aria.Id], sceneRead.Entities.Select(link => link.EntityId));
        Assert.Equal([aria.Id], (await ReadBeat(client, u, story, beat.Id)).Entities.Select(link => link.EntityId));
        var ideaRead = await ReadIdea(client, idea.Id);
        Assert.Empty(ideaRead.References);

        // The entry that referenced it reads with the field empty, and saves as it stands.
        var ariaRead = (await client.GetFromJsonAsync<EntityDetail>(EntityPath(u, aria.Id)))!;
        Assert.DoesNotContain(ariaRead.Fields, field => field.ReferencedEntityId is not null);
        Assert.Equal(HttpStatusCode.OK, (await Resave(client, u, ariaRead)).StatusCode);

        // Gone from the Trash, from restore, and from what a backup would carry.
        Assert.Empty((await Trash(client, u)).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"{EntryRoute(u, eldric.Id)}/restore", null)).StatusCode);
        var backup = await Backup(client, u);
        Assert.DoesNotContain(backup.Payload.Entities, entry => entry.Id == eldric.Id);
    }

    [Fact]
    public async Task An_entry_erased_reconciles_Canon_and_leaves_no_finding_about_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdcanon");
        var u = universe.Id;
        var character = await TypeId(client, u, "Character");
        var mentor = await AddField(client, u, character, "Mentor", EntityFieldKind.EntityReference);
        var draft = await CreateEntry(client, u, character, "Draft mentor", CanonStatus.Idea);
        await CreateEntry(
            client, u, character, "Canon pupil", CanonStatus.Canon,
            fields: [new FieldValueInput(mentor, null, null, null, null, null, draft.Id)]);

        var pending = Assert.Single(await Conflicts(client, u, CanonConflictStatus.Pending));
        Assert.Contains(pending.Subjects, subject => subject.SubjectId == draft.Id);

        await Deleted(client, EntityPath(u, draft.Id));
        Assert.Contains(await Conflicts(client, u, CanonConflictStatus.Resolved), finding => finding.Id == pending.Id);

        (await client.DeleteAsync(EntryRoute(u, draft.Id))).EnsureSuccessStatusCode();

        Assert.Empty(await Conflicts(client, u, null));
        Assert.Equal(0, (await Evaluate(client, u)).Created);
    }

    [Fact]
    public async Task A_type_held_only_by_a_trashed_entry_is_freed_when_the_entry_is_erased()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdtype");
        var u = universe.Id;
        var location = await TypeId(client, u, "Location");
        var climate = await AddField(client, u, location, "Climate", EntityFieldKind.ShortText);
        var harbour = await CreateEntry(
            client, u, location, "Grey Harbour", CanonStatus.Idea,
            fields: [new FieldValueInput(climate, "Rain", null, null, null, null, null)]);

        await Deleted(client, EntityPath(u, harbour.Id));

        var typeInUse = await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}");
        Assert.Equal(HttpStatusCode.Conflict, typeInUse.StatusCode);
        Assert.Contains("entity_type_in_use", await typeInUse.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}/fields/{climate}")).StatusCode);

        (await client.DeleteAsync(EntryRoute(u, harbour.Id))).EnsureSuccessStatusCode();

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}/fields/{climate}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}/entity-types/{location}")).StatusCode);
    }

    // ---------- An entry's picture ----------

    [Fact]
    public async Task An_entrys_picture_is_swept_after_the_entry_is_gone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdimage");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Portrait");
        var (original, thumbnail) = await Picture(client, u, entity);

        var entityPresentWhenSwept = new List<bool>();
        _factory.Media.FailDelete = key =>
        {
            if (key == original || key == thumbnail)
            {
                using var scope = _factory.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
                entityPresentWhenSwept.Add(db.Entities.Any(row => row.Id == entity));
            }

            return null;
        };

        try
        {
            await Deleted(client, $"/api/universes/{u}/entities/{entity}");
            Assert.True(_factory.Media.Contains(original));
            Assert.True(_factory.Media.Contains(thumbnail));

            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(EntryRoute(u, entity))).StatusCode);
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        Assert.Equal([false, false], entityPresentWhenSwept);
        Assert.False(_factory.Media.Contains(original));
        Assert.False(_factory.Media.Contains(thumbnail));
        await WithDb(_factory, async db => Assert.False(await db.EntityImages.AnyAsync(row => row.EntityId == entity)));
    }

    [Fact]
    public async Task A_sweep_that_fails_leaves_the_entry_erased()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdsweep");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Stubborn portrait");
        var (original, thumbnail) = await Picture(client, u, entity);
        await Deleted(client, $"/api/universes/{u}/entities/{entity}");

        _factory.Media.FailDelete = key => key == original || key == thumbnail ? new IOException("The bucket is away.") : null;
        HttpResponseMessage response;
        try
        {
            response = await client.DeleteAsync(EntryRoute(u, entity));
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty((await Trash(client, u)).Items);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(row => row.Id == entity));
            Assert.False(await db.EntityImages.AnyAsync(row => row.EntityId == entity));
        });

        // Orphaned, logged and left - never a reason to bring the entry back.
        Assert.True(_factory.Media.Contains(original));
        Assert.True(_factory.Media.Contains(thumbnail));
    }

    [Fact]
    public async Task A_failed_database_delete_keeps_the_entry_its_picture_and_its_objects()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdrollback");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Unbreakable");
        var (original, thumbnail) = await Picture(client, u, entity);
        await Deleted(client, $"/api/universes/{u}/entities/{entity}");

        var id = entity.ToString();
        _factory.Commands.FailWhen = command =>
            command.CommandText.Contains("DELETE FROM \"Entities\"", StringComparison.Ordinal)
            && command.Parameters.Cast<DbParameter>().Any(parameter =>
                string.Equals(parameter.Value?.ToString(), id, StringComparison.OrdinalIgnoreCase));

        Exception? failure;
        try
        {
            failure = await Record.ExceptionAsync(() => client.DeleteAsync(EntryRoute(u, entity)));
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        Assert.NotNull(failure);
        Assert.Equal(entity, Assert.Single((await Trash(client, u)).Items).Id);
        await WithDb(_factory, async db => Assert.True(await db.EntityImages.AnyAsync(row => row.EntityId == entity)));
        Assert.True(_factory.Media.Contains(original));
        Assert.True(_factory.Media.Contains(thumbnail));

        // And it still restores whole.
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{EntryRoute(u, entity)}/restore", null)).StatusCode);
    }

    // ---------- A story and what it holds ----------

    [Fact]
    public async Task A_story_is_erased_with_everything_in_it_including_its_own_rows_in_the_Trash()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdstory");
        var u = universe.Id;
        var lore = await CreateEntity(client, u, "Survivor");
        var story = await CreateStory(client, u, "Doomed saga");
        var chapter = await CreateChapter(client, u, story, "Doomed chapter");
        var inChapter = await CreateScene(client, u, story, "Doomed scene", chapter);
        var binnedScene = await CreateScene(client, u, story, "Binned first");
        await WriteManuscript(client, u, story, inChapter, "Quillhaven burned.");
        await WriteManuscript(client, u, story, inChapter, "Quillhaven burned twice.");
        var arc = await CreateArc(client, u, story, "Doomed arc");
        var beat = await CreateBeat(client, u, story, arc.Id, "Doomed beat", scenes: [inChapter], entities: [lore]);
        var binnedBeat = await CreateBeat(client, u, story, arc.Id, "Binned beat");
        var idea = await CreateIdea(
            client, "Notes", universeId: u,
            references: [Ref(IdeaReferenceKind.Story, story), Ref(IdeaReferenceKind.Scene, inChapter), Ref(IdeaReferenceKind.PlotArc, arc.Id), Ref(IdeaReferenceKind.PlotBeat, beat.Id), Ref(IdeaReferenceKind.Entity, lore)]);

        await Deleted(client, $"{Story(u, story)}/scenes/{binnedScene}");
        await Deleted(client, Beat(u, story, binnedBeat.Id));
        await Deleted(client, Story(u, story));
        Assert.Equal(3, (await Trash(client, u)).TotalCount);

        // Answered with every scene that went, live or binned on its own - and only those - so a client can let go of exactly
        // the recovery copies it keeps for them.
        var other = await CreateStory(client, u, "Standing saga");
        var otherScene = await CreateScene(client, u, other, "Standing scene");
        var response = await client.DeleteAsync($"{TrashRoute(u)}/stories/{story}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var erased = (await response.Content.ReadFromJsonAsync<TrashErasedStory>())!;
        Assert.Equal(story, erased.Id);
        Assert.Equal(new[] { inChapter, binnedScene }.Order(), erased.ErasedSceneIds.Order());
        Assert.DoesNotContain(otherScene, erased.ErasedSceneIds);

        Assert.Empty((await Trash(client, u)).Items);
        var scenes = new[] { inChapter, binnedScene };
        var beats = new[] { beat.Id, binnedBeat.Id };
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Stories.AnyAsync(row => row.Id == story));
            Assert.False(await db.Chapters.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.Scenes.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.SceneManuscripts.AnyAsync(row => scenes.Contains(row.SceneId)));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => scenes.Contains(row.SceneId)));
            Assert.False(await db.SceneEntityLinks.AnyAsync(row => scenes.Contains(row.SceneId)));
            Assert.False(await db.PlotArcs.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.PlotBeats.AnyAsync(row => beats.Contains(row.Id)));
            Assert.False(await db.PlotBeatScenes.AnyAsync(row => beats.Contains(row.PlotBeatId)));
            Assert.False(await db.PlotBeatEntities.AnyAsync(row => beats.Contains(row.PlotBeatId)));
            Assert.False(await db.IdeaStoryReferences.AnyAsync(row => row.StoryId == story));
            Assert.False(await db.IdeaSceneReferences.AnyAsync(row => scenes.Contains(row.SceneId)));
            Assert.False(await db.IdeaPlotArcReferences.AnyAsync(row => row.PlotArcId == arc.Id));
            Assert.False(await db.IdeaPlotBeatReferences.AnyAsync(row => beats.Contains(row.PlotBeatId)));
            Assert.Equal(0, await IndexRows(db, "StorySearchIndex", "ItemId", story, chapter, inChapter, binnedScene, arc.Id, beat.Id, binnedBeat.Id));
            Assert.Equal(0, await IndexRows(db, "SceneManuscriptSearchIndex", "SceneId", inChapter));
            Assert.True(await db.Entities.AnyAsync(row => row.Id == lore && row.DeletedAt == null));
        });

        // The idea keeps its own words and the lore it named; only the story's references went.
        Assert.Equal([lore], (await ReadIdea(client, idea.Id)).References.Select(reference => reference.Id));
    }

    [Fact]
    public async Task A_chapter_is_erased_without_the_scenes_it_gave_to_Unchaptered()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdchapter");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Kept saga");
        var chapter = await CreateChapter(client, u, story, "Emptied chapter");
        var first = await CreateScene(client, u, story, "Kept first", chapter);
        var second = await CreateScene(client, u, story, "Kept second", chapter);
        var binned = await CreateScene(client, u, story, "Binned in chapter", chapter);
        await WriteManuscript(client, u, story, first, "Still here.");

        await Deleted(client, $"{Story(u, story)}/scenes/{binned}");
        await Deleted(client, $"{Story(u, story)}/chapters/{chapter}");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{TrashRoute(u)}/chapters/{chapter}")).StatusCode);

        var read = await ReadStory(client, u, story);
        Assert.Empty(read.Chapters);
        Assert.Equal(["Kept first", "Kept second"], read.Scenes.Where(scene => scene.ChapterId == null).Select(scene => scene.Title));
        Assert.Equal("Still here.", (await ReadManuscript(client, u, story, first)).Content);

        // The scene binned while it was in the chapter is still in the Trash, and still comes back.
        Assert.Equal(binned, Assert.Single((await Trash(client, u)).Items).Id);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{TrashRoute(u)}/scenes/{binned}/restore", null)).StatusCode);
    }

    [Fact]
    public async Task A_scene_is_erased_with_its_writing_and_links_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdscene");
        var u = universe.Id;
        var lore = await CreateEntity(client, u, "Watcher");
        var story = await CreateStory(client, u, "Scene saga");
        var scene = (await PostJson<Lorex.Api.Features.Stories.SceneResponse>(
            client,
            $"{Story(u, story)}/scenes",
            new Lorex.Api.Features.Stories.SceneRequest("Doomed scene", null, null, lore, null, [lore]))).Id;
        await WriteManuscript(client, u, story, scene, "Firstdraft words.");
        await WriteManuscript(client, u, story, scene, "Seconddraft words.");
        var arc = await CreateArc(client, u, story, "Kept arc");
        var beat = await CreateBeat(client, u, story, arc.Id, "Kept beat", scenes: [scene], entities: [lore]);
        var idea = await CreateIdea(client, "Scene idea", universeId: u, references: [Ref(IdeaReferenceKind.Scene, scene)]);

        await Deleted(client, $"{Story(u, story)}/scenes/{scene}");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{TrashRoute(u)}/scenes/{scene}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Scenes.AnyAsync(row => row.Id == scene));
            Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.SceneEntityLinks.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.PlotBeatScenes.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.IdeaSceneReferences.AnyAsync(row => row.SceneId == scene));
            Assert.Equal(0, await IndexRows(db, "SceneManuscriptSearchIndex", "SceneId", scene));
            Assert.Equal(0, await IndexRows(db, "StorySearchIndex", "ItemId", scene));
        });

        var beatRead = await ReadBeat(client, u, story, beat.Id);
        Assert.Empty(beatRead.SceneIds);
        Assert.Equal([lore], beatRead.Entities.Select(link => link.EntityId));
        Assert.Empty((await ReadIdea(client, idea.Id)).References);
        Assert.Empty((await Trash(client, u)).Items);
    }

    [Fact]
    public async Task An_arc_is_erased_with_its_beats_including_one_already_in_the_Trash()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdarc");
        var u = universe.Id;
        var lore = await CreateEntity(client, u, "Linked");
        var story = await CreateStory(client, u, "Arc saga");
        var scene = await CreateScene(client, u, story, "Kept scene");
        var arc = await CreateArc(client, u, story, "Doomed arc");
        var live = await CreateBeat(client, u, story, arc.Id, "Live beat", scenes: [scene], entities: [lore]);
        var binned = await CreateBeat(client, u, story, arc.Id, "Binned beat", entities: [lore]);

        await Deleted(client, Beat(u, story, binned.Id));
        await Deleted(client, Arc(u, story, arc.Id));
        Assert.Equal(2, (await Trash(client, u)).TotalCount);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{TrashRoute(u)}/plot-arcs/{arc.Id}")).StatusCode);

        Assert.Empty((await Trash(client, u)).Items);
        var beats = new[] { live.Id, binned.Id };
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.PlotArcs.AnyAsync(row => row.Id == arc.Id));
            Assert.False(await db.PlotBeats.AnyAsync(row => beats.Contains(row.Id)));
            Assert.False(await db.PlotBeatScenes.AnyAsync(row => beats.Contains(row.PlotBeatId)));
            Assert.False(await db.PlotBeatEntities.AnyAsync(row => beats.Contains(row.PlotBeatId)));
            Assert.Equal(0, await IndexRows(db, "StorySearchIndex", "ItemId", arc.Id, live.Id, binned.Id));
            Assert.True(await db.Scenes.AnyAsync(row => row.Id == scene && row.DeletedAt == null));
        });
    }

    [Fact]
    public async Task A_beat_that_cannot_be_restored_can_still_be_erased_alone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pdbeat");
        var u = universe.Id;
        var lore = await CreateEntity(client, u, "Beat lore");
        var story = await CreateStory(client, u, "Beat saga");
        var scene = await CreateScene(client, u, story, "Beat scene");
        var arc = await CreateArc(client, u, story, "Waiting arc");
        var beat = await CreateBeat(client, u, story, arc.Id, "Blocked beat", scenes: [scene], entities: [lore]);

        await Deleted(client, Beat(u, story, beat.Id));
        await Deleted(client, Arc(u, story, arc.Id));
        Assert.Equal(TrashRestoreBlock.ArcInTrash, (await Trash(client, u)).Items.Single(item => item.Id == beat.Id).BlockedBy);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{TrashRoute(u)}/plot-beats/{beat.Id}")).StatusCode);

        Assert.Equal(arc.Id, Assert.Single((await Trash(client, u)).Items).Id);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.PlotBeats.AnyAsync(row => row.Id == beat.Id));
            Assert.False(await db.PlotBeatScenes.AnyAsync(row => row.PlotBeatId == beat.Id));
            Assert.False(await db.PlotBeatEntities.AnyAsync(row => row.PlotBeatId == beat.Id));
            Assert.True(await db.Scenes.AnyAsync(row => row.Id == scene));
            Assert.True(await db.Entities.AnyAsync(row => row.Id == lore));
        });
    }

    // ---------- A world rule ----------

    [Fact]
    public async Task A_world_rule_is_erased_with_its_check_and_every_finding_about_it()
    {
        var world = await NewCheckedWorld(_factory, "pdrule");
        await world.Occurrence("Arlen returns", world.Arlen);
        await world.Occurrence("Arlen returns again", world.Arlen);
        var finding = Assert.Single(await world.Findings());
        Assert.Contains(finding.Subjects, subject => subject.SubjectId == world.Rule.Id);

        await Deleted(world.Client, WorldRuleTestClient.Rule(world.Universe, world.Rule.Id));
        await WithDb(_factory, async db => Assert.Equal(1, await IndexRows(db, "WorldRuleSearchIndex", "WorldRuleId", world.Rule.Id)));

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await world.Client.DeleteAsync($"{TrashRoute(world.Universe)}/world-rules/{world.Rule.Id}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.WorldRules.AnyAsync(row => row.Id == world.Rule.Id));
            Assert.False(await db.WorldRuleValidations.AnyAsync(row => row.WorldRuleId == world.Rule.Id));
            Assert.False(await db.CanonConflictSubjects.AnyAsync(row => row.SubjectId == world.Rule.Id));
            Assert.Equal(0, await IndexRows(db, "WorldRuleSearchIndex", "WorldRuleId", world.Rule.Id));

            // The vocabulary and the moments are the universe's, not the rule's.
            Assert.Equal(3, await db.ValidationTerms.CountAsync(row => row.UniverseId == world.Universe));
            Assert.Equal(2, await db.TimelineEntryValidations.CountAsync(row => row.TimelineEntry!.UniverseId == world.Universe));
        });

        Assert.Empty(await world.Findings(null));
        Assert.Empty((await Trash(world.Client, world.Universe)).Items);
    }

    // ---------- Helpers ----------

    private static string TrashRoute(Guid universeId) => $"/api/universes/{universeId}/trash";

    private static string EntryRoute(Guid universeId, Guid entityId) => $"{TrashRoute(universeId)}/{entityId}";

    private static string EntityPath(Guid universeId, Guid entityId) => $"/api/universes/{universeId}/entities/{entityId}";

    private static string[] Routes(Guid u, params Guid[] ids) =>
    [
        EntryRoute(u, ids[0]),
        $"{TrashRoute(u)}/stories/{ids[1]}",
        $"{TrashRoute(u)}/chapters/{ids[2]}",
        $"{TrashRoute(u)}/scenes/{ids[3]}",
        $"{TrashRoute(u)}/plot-arcs/{ids[4]}",
        $"{TrashRoute(u)}/plot-beats/{ids[5]}",
        $"{TrashRoute(u)}/world-rules/{ids[6]}",
    ];

    private static async Task Deleted(HttpClient client, string path) =>
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path)).StatusCode);

    private static async Task<TrashPage> Trash(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<TrashPage>($"{TrashRoute(universeId)}?pageSize=50"))!;

    /// <summary>Rows an FTS index holds for the given ids, read from the index itself rather than through search.</summary>
    private static Task<int> IndexRows(LorexDbContext db, string table, string column, params Guid[] ids)
    {
        var list = string.Join(", ", ids.Select(id => $"'{id.ToString().ToUpperInvariant()}'"));
#pragma warning disable EF1002 // Table, column and ids are this file's own constants and Guids.
        return db.Database.SqlQueryRaw<int>($"SELECT COUNT(*) AS \"Value\" FROM {table} WHERE upper({column}) IN ({list})").SingleAsync();
#pragma warning restore EF1002
    }

    /// <summary>Every recorded finding of every rule, in one status or in any when <paramref name="status"/> is null.</summary>
    private static async Task<List<CanonConflictResponse>> Conflicts(HttpClient client, Guid universeId, CanonConflictStatus? status)
    {
        var filter = status is { } wanted ? $"&status={(int)wanted}" : "";
        return [.. (await client.GetFromJsonAsync<CanonConflictPage>($"/api/universes/{universeId}/canon-conflicts?pageSize=100{filter}"))!.Items];
    }

    private static async Task<Guid> TypeId(HttpClient client, Guid universeId, string name) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!
            .First(type => type.Name == name).Id;

    private static async Task<Guid> AddField(HttpClient client, Guid universeId, Guid typeId, string name, EntityFieldKind kind)
    {
        var type = await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, null));
        return type.Fields.First(field => field.Name == name).Id;
    }

    private static Task<EntityDetail> CreateEntry(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus status,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null) =>
        PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, status, aliases, tags, fields));

    private static Task<HttpResponseMessage> Resave(HttpClient client, Guid universeId, EntityDetail entity) =>
        client.PutVersionedAsync(
            EntityPath(universeId, entity.Id),
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId, field.Text, field.Number, field.Boolean, field.Date, field.OptionIds, field.ReferencedEntityId))]));

    private static async Task<Guid> RelationshipType(HttpClient client, Guid universeId) =>
        (await PostJson<RelationshipTypeResponse>(
            client,
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest("Pupil of", "Teacher of", false, null, null))).Id;

    /// <summary>Uploads a picture and answers with the two object keys it was stored under.</summary>
    private async Task<(string Original, string Thumbnail)> Picture(HttpClient client, Guid universeId, Guid entityId)
    {
        using var image = new Image<Rgba32>(64, 48, new Rgba32(120, 30, 30));
        using var bytes = new MemoryStream();
        await image.SaveAsPngAsync(bytes);

        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes.ToArray());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "portrait.png");
        (await client.PutAsync($"{EntityPath(universeId, entityId)}/image", form)).EnsureSuccessStatusCode();

        var keys = (Original: string.Empty, Thumbnail: string.Empty);
        await WithDb(_factory, async db =>
        {
            var stored = await db.EntityImages.SingleAsync(row => row.EntityId == entityId);
            keys = (stored.OriginalKey, stored.ThumbnailKey);
        });

        Assert.True(_factory.Media.Contains(keys.Original));
        Assert.True(_factory.Media.Contains(keys.Thumbnail));
        return keys;
    }
}
