using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Restore;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Trash;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Restoring a validated backup as a new universe (ADR 0032): always new, always the restoring account's, never touching
/// the universe it came from; every reference rewritten into the new universe; the Trash, history, ideas, pictures, search
/// and Canon reconstructed; and a failure at any point leaving no universe, no row and no picture behind.
/// </summary>
public sealed class BackupRestoreTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- A new universe, every time ----------

    [Fact]
    public async Task A_restore_creates_a_new_universe_for_the_account_and_leaves_the_source_untouched()
    {
        var client = await SignedIn(_factory, "restore-new");
        var world = await BuildRichWorld(client, "Saltmarch new");
        var archive = await RawArchive(client, world.Universe.Id);
        var sourceBefore = PayloadText(DocumentOf(archive));

        var validated = await Validated(client, archive);
        Assert.Equal("Saltmarch new", validated.Preview.UniverseName);
        Assert.False(validated.Preview.NameAvailable);
        Assert.True(validated.ExpiresAt > DateTime.UtcNow);

        var restored = await Restored(client, validated.Token, "  Saltmarch again  ");

        Assert.Equal("Saltmarch again", restored.Name);
        Assert.Equal("A drowned coast, 北の門.", restored.Description);
        Assert.Equal("#1f8f74", restored.AccentColor);
        Assert.False(restored.IsArchived);
        Assert.Contains(await Universes(client), universe => universe.Id == restored.Id);

        // The source exports exactly what it did.
        Assert.Equal(sourceBefore, PayloadText(DocumentOf(await RawArchive(client, world.Universe.Id))));

        // Nobody else can reach it.
        var stranger = await SignedIn(_factory, "restore-new-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/universes/{restored.Id}")).StatusCode);
    }

    [Fact]
    public async Task The_same_backup_restored_twice_is_two_independent_universes()
    {
        var client = await SignedIn(_factory, "restore-twice");
        var world = await BuildRichWorld(client, "Saltmarch twice");
        var archive = await RawArchive(client, world.Universe.Id);

        var one = await RestoreArchive(client, archive, "Twice one");
        var two = await RestoreArchive(client, archive, "Twice two");

        Assert.NotEqual(one.Id, two.Id);

        var oneText = DocumentOf(await RawArchive(client, one.Id));
        var twoText = DocumentOf(await RawArchive(client, two.Id));
        Assert.Empty(GuidsIn(oneText).Intersect(GuidsIn(twoText)));

        // The pictures of the two restores live under different keys, and neither overwrote the source's.
        Assert.Contains(_factory.Media.Keys, key => key.StartsWith($"universes/{world.Universe.Id:D}/", StringComparison.Ordinal));
        var oneKeys = _factory.Media.Keys.Where(key => key.StartsWith($"universes/{one.Id:D}/", StringComparison.Ordinal)).ToList();
        var twoKeys = _factory.Media.Keys.Where(key => key.StartsWith($"universes/{two.Id:D}/", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, oneKeys.Count);
        Assert.Equal(2, twoKeys.Count);

        // Changing one changes nothing in the other.
        var oneWarden = await EntityNamedIn(one.Id, "Alenna Vance");
        var twoWarden = await EntityNamedIn(two.Id, "Alenna Vance");
        (await client.DeleteAsync($"/api/universes/{one.Id}/entities/{oneWarden}")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{two.Id}/entities/{twoWarden}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{two.Id}/entities/{oneWarden}")).StatusCode);
    }

    [Fact]
    public async Task A_backup_from_another_account_becomes_wholly_the_restoring_accounts()
    {
        var author = await SignedIn(_factory, "restore-author");
        var world = await BuildRichWorld(author, "Saltmarch shared");
        var archive = await RawArchive(author, world.Universe.Id);
        var authorIdeasBefore = (await IdeaTestClient.ListIdeas(author)).TotalCount;

        var reader = await SignedIn(_factory, "restore-reader");
        var validated = await Validated(reader, archive);
        Assert.True(validated.Preview.NameAvailable);

        var restored = await Restored(reader, validated.Token, "Saltmarch shared");

        Assert.Contains(await Universes(reader), universe => universe.Id == restored.Id);
        Assert.DoesNotContain(await Universes(author), universe => universe.Id == restored.Id);

        // The ideas came with the universe, to the reader, about the restored universe.
        var ideas = await IdeaTestClient.ListIdeas(reader, $"?universeId={restored.Id}");
        Assert.Equal("Maybe the city floats", Assert.Single(ideas.Items).Title);
        Assert.Equal(restored.Id, ideas.Items[0].Universe!.Id);
        Assert.Equal(authorIdeasBefore, (await IdeaTestClient.ListIdeas(author)).TotalCount);

        // Only what belonged to the universe: the author's unassigned idea is not the reader's now.
        Assert.Empty((await IdeaTestClient.ListIdeas(reader, "?unassigned=true")).Items);

        await WithDb(_factory, async db =>
        {
            var readerId = await db.Users.Where(user => user.UserName == "restore-reader").Select(user => user.Id).SingleAsync();
            Assert.Equal(readerId, await db.Universes.Where(universe => universe.Id == restored.Id).Select(universe => universe.OwnerId).SingleAsync());
            Assert.All(await db.Ideas.Where(idea => idea.UniverseId == restored.Id).ToListAsync(), idea => Assert.Equal(readerId, idea.OwnerId));
        });
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Every_route_needs_a_signed_in_account()
    {
        var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Validate(anonymous, [0x50, 0x4b, 0x05, 0x06])).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Restore(anonymous, new string('a', 64), "Nope")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.DeleteAsync($"{ValidatePath}/{new string('a', 64)}")).StatusCode);
    }

    [Fact]
    public async Task A_token_works_only_for_the_account_that_validated_it_and_tells_nobody_else_anything()
    {
        var owner = await SignedIn(_factory, "restore-token-owner");
        var universe = await CreateUniverse(owner, "Token world");
        await CreateEntity(owner, universe.Id, "Token keeper");
        var validated = await Validated(owner, await RawArchive(owner, universe.Id));

        var other = await SignedIn(_factory, "restore-token-other");
        var stolen = await Refused(await Restore(other, validated.Token, "Stolen"), HttpStatusCode.NotFound);
        var guessed = await Refused(await Restore(other, new string('b', 64), "Guessed"), HttpStatusCode.NotFound);
        var malformed = await Refused(await Restore(other, "../../etc/passwd", "Malformed"), HttpStatusCode.NotFound);

        // Another account's token, a guessed one and a malformed one are one and the same answer, naming no backup.
        Assert.Equal((stolen.Code, stolen.Detail), (guessed.Code, guessed.Detail));
        Assert.Equal((stolen.Code, stolen.Detail), (malformed.Code, malformed.Detail));
        Assert.Equal(BackupRestoreEndpoints.ExpiredCode, stolen.Code);
        Assert.DoesNotContain("Token world", stolen.Raw, StringComparison.Ordinal);

        // Another account cannot discard it either.
        Assert.Equal(HttpStatusCode.NoContent, (await other.DeleteAsync($"{ValidatePath}/{validated.Token}")).StatusCode);
        Assert.DoesNotContain(await Universes(other), candidate => candidate.Name == "Stolen");

        // And the owner's token still works.
        var restored = await Restored(owner, validated.Token, "Token world restored");
        Assert.Equal("Token world restored", restored.Name);
    }

    // ---------- Validation writes nothing ----------

    [Fact]
    public async Task Validating_a_backup_writes_no_row_and_no_picture()
    {
        var client = await SignedIn(_factory, "restore-validate-only");
        var world = await BuildRichWorld(client, "Saltmarch validate");
        var archive = await RawArchive(client, world.Universe.Id);

        var rowsBefore = await RowCounts();
        var keysBefore = _factory.Media.Keys.Order(StringComparer.Ordinal).ToList();

        await Validated(client, archive);
        await Validated(client, archive);

        Assert.Equal(rowsBefore, await RowCounts());
        Assert.Equal(keysBefore, _factory.Media.Keys.Order(StringComparer.Ordinal).ToList());
    }

    // ---------- References ----------

    [Fact]
    public async Task Every_restored_reference_points_inside_the_restored_universe()
    {
        var client = await SignedIn(_factory, "restore-references");
        var world = await BuildRichWorld(client, "Saltmarch references");
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "References restored");
        var r = restored.Id;
        var source = world.Universe.Id;

        await WithDb(_factory, async db =>
        {
            var entities = await db.Entities.Where(entity => entity.UniverseId == r).Select(entity => entity.Id).ToListAsync();
            var sourceIds = await SourceIds(db, source);

            Assert.NotEmpty(entities);
            Assert.Empty(entities.Intersect(sourceIds));

            Assert.All(
                await db.Relationships.Where(link => link.UniverseId == r).ToListAsync(),
                link => Assert.True(entities.Contains(link.SourceEntityId) && entities.Contains(link.TargetEntityId)));
            Assert.All(
                await db.RelationshipTypes.Where(type => type.UniverseId == r).Select(type => type.Id).ToListAsync(),
                id => Assert.DoesNotContain(id, sourceIds));
            Assert.All(
                await db.EntityFieldValues.Where(value => value.Entity!.UniverseId == r).ToListAsync(),
                value =>
                {
                    Assert.True(value.ReferencedEntityId is null || entities.Contains(value.ReferencedEntityId.Value));
                    Assert.DoesNotContain(value.FieldDefinitionId, sourceIds);
                    Assert.True(value.EraId is null || !sourceIds.Contains(value.EraId.Value));
                });
            Assert.All(
                await db.TimelineEntryLinks.Where(link => link.TimelineEntry!.UniverseId == r).ToListAsync(),
                link => Assert.Contains(link.EntityId, entities));
            Assert.All(
                await db.Scenes.Where(scene => scene.Story!.UniverseId == r).ToListAsync(),
                scene => Assert.True(scene.PovEntityId is null || entities.Contains(scene.PovEntityId.Value)));
            Assert.All(
                await db.SceneEntityLinks.Where(link => link.Scene!.Story!.UniverseId == r).ToListAsync(),
                link => Assert.Contains(link.EntityId, entities));
            Assert.Equal(
                await db.PlotBeatScenes.CountAsync(link => link.PlotBeat!.PlotArc!.Story!.UniverseId == r),
                await db.PlotBeatScenes.CountAsync(link => link.PlotBeat!.PlotArc!.Story!.UniverseId == r && link.Scene!.Story!.UniverseId == r));
            Assert.All(
                await db.PlotBeatEntities.Where(link => link.PlotBeat!.PlotArc!.Story!.UniverseId == r).ToListAsync(),
                link => Assert.Contains(link.EntityId, entities));
            // Five references on the live idea and one on the deleted one, every target inside the restored universe.
            Assert.Equal(6, await db.IdeaEntityReferences.CountAsync(reference => reference.Idea!.UniverseId == r && reference.Entity!.UniverseId == r)
                + await db.IdeaStoryReferences.CountAsync(reference => reference.Idea!.UniverseId == r && reference.Story!.UniverseId == r)
                + await db.IdeaSceneReferences.CountAsync(reference => reference.Idea!.UniverseId == r && reference.Scene!.Story!.UniverseId == r)
                + await db.IdeaPlotArcReferences.CountAsync(reference => reference.Idea!.UniverseId == r && reference.PlotArc!.Story!.UniverseId == r)
                + await db.IdeaPlotBeatReferences.CountAsync(reference => reference.Idea!.UniverseId == r && reference.PlotBeat!.PlotArc!.Story!.UniverseId == r));

            // Stored history names new ids too - even for the fields it only recorded.
            var historyIds = await db.EntityRevisionFieldValues
                .Where(value => value.Revision!.Entity!.UniverseId == r)
                .Select(value => new { value.FieldDefinitionId, value.OptionId, value.EraId, value.ReferencedEntityId })
                .ToListAsync();
            Assert.NotEmpty(historyIds);
            Assert.All(historyIds, value =>
            {
                Assert.DoesNotContain(value.FieldDefinitionId, sourceIds);
                Assert.True(value.OptionId is null || !sourceIds.Contains(value.OptionId.Value));
                Assert.True(value.EraId is null || !sourceIds.Contains(value.EraId.Value));
                Assert.True(value.ReferencedEntityId is null || entities.Contains(value.ReferencedEntityId.Value));
            });
        });
    }

    // ---------- The Trash, history and ideas ----------

    [Fact]
    public async Task What_was_in_the_Trash_is_in_the_Trash_and_what_was_live_is_live()
    {
        var client = await SignedIn(_factory, "restore-trash");
        var world = await BuildRichWorld(client, "Saltmarch trash");
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "Trash restored");
        var r = restored.Id;

        var trash = (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{r}/trash?pageSize=100"))!;
        Assert.Equal(
            ["A binned rule", "Abandoned Draft", "Cut Scene", "Departure", "Hides", "Lost Heir"],
            [.. trash.Items.Select(item => item.Name).Order(StringComparer.Ordinal)]);

        var stories = (await client.GetFromJsonAsync<List<StorySummary>>($"/api/universes/{r}/stories"))!;
        var story = Assert.Single(stories);
        Assert.Equal("The Long Winter", story.Title);

        var detail = await ReadStory(client, r, story.Id);
        Assert.Equal(["Arrival"], detail.Chapters.Select(chapter => chapter.Title));
        Assert.Equal(["Cold Open", "The Vote", "The Council"], detail.Scenes.Select(scene => scene.Title));

        // A scene from the Trash comes back with its prose and every saved version, as in the source.
        var cut = trash.Items.First(item => item.Name == "Cut Scene");
        (await client.PostAsync($"/api/universes/{r}/trash/scenes/{cut.Id}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal("Words that did not make the cut.", (await ManuscriptTestClient.ReadManuscript(client, r, story.Id, cut.Id)).Content);

        // The council's prose kept both saved versions and the text as last saved.
        var council = detail.Scenes.First(scene => scene.Title == "The Council");
        var revisions = (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
            $"{ManuscriptTestClient.Manuscript(r, story.Id, council.Id)}/revisions"))!;
        Assert.Equal([2, 1], revisions.Select(revision => revision.Number));
        Assert.StartsWith("The hall was colder", (await ManuscriptTestClient.ReadManuscript(client, r, story.Id, council.Id)).Content, StringComparison.Ordinal);

        // The article kept its three versions and the restored text, and restoring an old version still works.
        var warden = await EntityNamedIn(r, "Alenna Vance");
        var articleVersions = await ArticleTestClient.ArticleRevisions(client, r, warden);
        Assert.Equal([3, 2, 1], articleVersions.Select(version => version.Number));
        var article = await ArticleTestClient.ReadArticle(client, r, warden);
        Assert.Contains("The tide keeps its own ledger.", article.Content, StringComparison.Ordinal);
        var restoreOld = await ArticleTestClient.RestoreArticle(client, r, warden, articleVersions.First(version => version.Number == 2).Id, article.Version);
        restoreOld.EnsureSuccessStatusCode();
        Assert.Contains("The seawall remembers.", (await ArticleTestClient.ReadArticle(client, r, warden)).Content, StringComparison.Ordinal);

        // No history was invented by the restore: the entry has exactly the versions it had.
        await WithDb(_factory, async db =>
        {
            var sourceCount = await db.EntityRevisions.CountAsync(revision => revision.Entity!.UniverseId == world.Universe.Id);
            var restoredCount = await db.EntityRevisions.CountAsync(revision => revision.Entity!.UniverseId == r);
            Assert.Equal(sourceCount, restoredCount);
        });
    }

    [Fact]
    public async Task Ideas_come_back_about_the_restored_universe_with_their_references_and_their_deleted_state()
    {
        var client = await SignedIn(_factory, "restore-ideas");
        var world = await BuildRichWorld(client, "Saltmarch ideas");
        var unassignedBefore = (await IdeaTestClient.ListIdeas(client, "?unassigned=true")).TotalCount;
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "Ideas restored");

        var live = await IdeaTestClient.ListIdeas(client, $"?universeId={restored.Id}");
        var floating = await IdeaTestClient.ReadIdea(client, Assert.Single(live.Items).Id);

        Assert.NotEqual(world.FloatingIdea, floating.Id);
        Assert.Equal("  Nobody below has seen it.\n北の門 & <b>not html</b>  ", floating.Body);
        Assert.Equal(restored.Id, floating.Universe!.Id);
        Assert.Equal(
            [
                (IdeaReferenceKind.Entity, "Alenna Vance"),
                (IdeaReferenceKind.Story, "The Long Winter"),
                (IdeaReferenceKind.Scene, "The Council"),
                (IdeaReferenceKind.PlotArc, "Fall of the King"),
                (IdeaReferenceKind.PlotBeat, "Learns"),
            ],
            floating.References.Select(reference => (reference.Kind, reference.Name)).OrderBy(reference => reference.Kind));

        await WithDb(_factory, async db =>
        {
            var restoredEntities = await db.Entities.Where(entity => entity.UniverseId == restored.Id).Select(entity => entity.Id).ToListAsync();
            Assert.Contains(floating.References.First(reference => reference.Kind == IdeaReferenceKind.Entity).Id, restoredEntities);
        });

        var deleted = await IdeaTestClient.ListIdeas(client, $"?universeId={restored.Id}&deleted=true");
        Assert.Equal("A binned idea", Assert.Single(deleted.Items).Title);

        Assert.Equal(unassignedBefore, (await IdeaTestClient.ListIdeas(client, "?unassigned=true")).TotalCount);
    }

    // ---------- Pictures ----------

    [Fact]
    public async Task A_picture_is_restored_from_its_original_under_new_keys_with_a_fresh_thumbnail()
    {
        var client = await SignedIn(_factory, "restore-picture");
        var world = await BuildRichWorld(client, "Saltmarch picture");
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "Picture restored");

        var source = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{world.Universe.Id}/entities/{world.Warden}"))!.Image!;
        var wardenId = await EntityNamedIn(restored.Id, "Alenna Vance");
        var copy = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{restored.Id}/entities/{wardenId}"))!.Image!;

        Assert.NotEqual(source.AssetId, copy.AssetId);
        Assert.NotEqual(source.ThumbnailId, copy.ThumbnailId);
        Assert.Equal((source.Width, source.Height, source.ContentType, source.FileName, source.ByteSize), (copy.Width, copy.Height, copy.ContentType, copy.FileName, copy.ByteSize));
        Assert.Equal(source.Crop, copy.Crop);

        var original = await client.GetByteArrayAsync($"/api/universes/{restored.Id}/entities/{wardenId}/image/{copy.AssetId}/original");
        Assert.Equal(world.WardenPicture, original);

        // Cut again from the original with the recorded framing: the same square, byte for byte.
        var sourceThumbnail = await client.GetByteArrayAsync($"/api/universes/{world.Universe.Id}/entities/{world.Warden}/image/{source.AssetId}/thumbnail/{source.ThumbnailId}");
        var copyThumbnail = await client.GetByteArrayAsync($"/api/universes/{restored.Id}/entities/{wardenId}/image/{copy.AssetId}/thumbnail/{copy.ThumbnailId}");
        Assert.Equal(sourceThumbnail, copyThumbnail);

        await WithDb(_factory, async db =>
        {
            var image = await db.EntityImages.SingleAsync(candidate => candidate.EntityId == wardenId);
            Assert.StartsWith($"universes/{restored.Id:D}/entities/{wardenId:D}/primary/{copy.AssetId:D}/", image.OriginalKey, StringComparison.Ordinal);
            Assert.StartsWith($"universes/{restored.Id:D}/entities/{wardenId:D}/primary/{copy.AssetId:D}/", image.ThumbnailKey, StringComparison.Ordinal);
            Assert.True(_factory.Media.Contains(image.OriginalKey));
            Assert.True(_factory.Media.Contains(image.ThumbnailKey));
        });
    }

    // ---------- Search and Canon ----------

    [Fact]
    public async Task Restored_content_is_found_by_search_at_once_and_the_Trash_is_not()
    {
        var client = await SignedIn(_factory, "restore-search");
        var world = await BuildRichWorld(client, "Saltmarch search");
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "Search restored");

        async Task<IReadOnlyList<(UniverseSearchKind Kind, string Title)>> Find(string query) =>
            [.. (await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{restored.Id}/search?q={Uri.EscapeDataString(query)}"))!
                .Results.Select(result => (result.Kind, result.Title))];

        Assert.Contains((UniverseSearchKind.Entity, "Alenna Vance"), await Find("ledger"));
        Assert.Contains((UniverseSearchKind.Entity, "Salt Crown"), await Find("Brine Diadem"));
        Assert.Contains((UniverseSearchKind.Story, "The Long Winter"), await Find("Winter"));
        Assert.Contains((UniverseSearchKind.Chapter, "Arrival"), await Find("Arrival"));
        Assert.Contains((UniverseSearchKind.Scene, "Cold Open"), await Find("seawall snow"));
        Assert.Contains((UniverseSearchKind.PlotArc, "Fall of the King"), await Find("crown breaks"));
        Assert.Contains((UniverseSearchKind.PlotBeat, "Learns"), await Find("Learns"));
        Assert.Contains(UniverseSearchKind.Manuscript, (await Find("colder")).Select(result => result.Kind));
        Assert.Contains((UniverseSearchKind.Idea, "Maybe the city floats"), await Find("floats"));

        Assert.Empty(await Find("Cut Scene"));
        Assert.Empty(await Find("nobody kept"));
        Assert.Empty(await Find("Pretender"));
        Assert.Empty(await Find("binned"));

        var lore = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?search=tide"))!;
        Assert.Equal(["Alenna Vance"], lore.Items.Select(item => item.Name));
    }

    [Fact]
    public async Task Canon_conflicts_are_found_again_and_the_dismissed_one_stays_dismissed()
    {
        var client = await SignedIn(_factory, "restore-canon");
        var world = await BuildRichWorld(client, "Saltmarch canon");
        var restored = await RestoreArchive(client, await RawArchive(client, world.Universe.Id), "Canon restored");

        await WithDb(_factory, async db =>
        {
            var before = await db.CanonConflicts.Where(conflict => conflict.UniverseId == world.Universe.Id)
                .Select(conflict => new { conflict.RuleCode, conflict.Status, conflict.UpdatedAt }).ToListAsync();
            var after = await db.CanonConflicts.Where(conflict => conflict.UniverseId == restored.Id)
                .Select(conflict => new { conflict.RuleCode, conflict.Status, conflict.UpdatedAt }).ToListAsync();

            Assert.Equal(
                before.Select(conflict => (conflict.RuleCode, conflict.Status)).Order(),
                after.Select(conflict => (conflict.RuleCode, conflict.Status)).Order());

            // A world rule check's finding is identified by a set of moments whose ids all changed, and is dismissed again too.
            Assert.Equal(
                before.Where(conflict => conflict.Status == CanonConflictStatus.Dismissed).Select(conflict => (conflict.RuleCode, conflict.UpdatedAt)).Order(),
                after.Where(conflict => conflict.Status == CanonConflictStatus.Dismissed).Select(conflict => (conflict.RuleCode, conflict.UpdatedAt)).Order());
            Assert.Equal(
                ["CANON-REL-001", "CANON-WORLD-001"],
                after.Where(conflict => conflict.Status == CanonConflictStatus.Dismissed).Select(conflict => conflict.RuleCode).Order(StringComparer.Ordinal));
            Assert.Contains(after, conflict => conflict.Status == CanonConflictStatus.Pending);
        });
    }

    // ---------- Failures leave nothing ----------

    [Fact]
    public async Task A_failure_late_in_the_restore_leaves_no_universe_no_row_and_no_picture_and_the_backup_waits()
    {
        var client = await SignedIn(_factory, "restore-late-failure");
        var world = await BuildRichWorld(client, "Saltmarch failure");
        var validated = await Validated(client, await RawArchive(client, world.Universe.Id));

        var rowsBefore = await RowCounts();
        var keysBefore = _factory.Media.Keys.Order(StringComparer.Ordinal).ToList();

        // Every row is already written when the lore is indexed; fail there, just before Canon and the commit.
        _factory.Commands.FailWhen = command => command.CommandText.Contains("INSERT INTO EntitySearchIndex", StringComparison.Ordinal);
        HttpResponseMessage failed;
        try
        {
            failed = await Restore(client, validated.Token, "Never kept");
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        var refusal = await Refused(failed, HttpStatusCode.InternalServerError);
        Assert.Equal(BackupRestoreEndpoints.FailedCode, refusal.Code);
        Assert.DoesNotContain("INSERT", refusal.Raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("universes/", refusal.Raw, StringComparison.Ordinal);

        Assert.Equal(rowsBefore, await RowCounts());
        Assert.Equal(keysBefore, _factory.Media.Keys.Order(StringComparer.Ordinal).ToList());
        Assert.DoesNotContain(await Universes(client), universe => universe.Name == "Never kept");

        // Nothing was lost but the attempt: the same upload restores.
        var restored = await Restored(client, validated.Token, "Kept after all");
        Assert.Equal("Kept after all", restored.Name);
    }

    [Fact]
    public async Task A_picture_that_cannot_be_stored_fails_the_restore_and_what_was_stored_is_swept()
    {
        var client = await SignedIn(_factory, "restore-media-failure");
        var world = await BuildRichWorld(client, "Saltmarch media failure");
        var validated = await Validated(client, await RawArchive(client, world.Universe.Id));
        var rowsBefore = await RowCounts();
        var keysBefore = _factory.Media.Keys.Order(StringComparer.Ordinal).ToList();

        // The original lands; the thumbnail beside it does not.
        _factory.Media.FailPut = key => key.Contains("/thumbnail-", StringComparison.Ordinal) && !keysBefore.Contains(key)
            ? new MediaStorageFailedException("Image storage could not complete the request.", new IOException("down"))
            : null;

        HttpResponseMessage failed;
        try
        {
            failed = await Restore(client, validated.Token, "Pictureless");
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        var refusal = await Refused(failed, HttpStatusCode.ServiceUnavailable);
        Assert.Equal(BackupRestoreEndpoints.StorageCode, refusal.Code);
        Assert.DoesNotContain("universes/", refusal.Raw, StringComparison.Ordinal);

        Assert.Equal(rowsBefore, await RowCounts());
        Assert.Equal(keysBefore, _factory.Media.Keys.Order(StringComparer.Ordinal).ToList());
        Assert.Equal(HttpStatusCode.Created, (await Restore(client, validated.Token, "Pictured")).StatusCode);
    }

    // ---------- Names, tokens and waiting uploads ----------

    [Fact]
    public async Task A_name_the_account_already_uses_is_refused_and_the_backup_keeps_waiting()
    {
        var client = await SignedIn(_factory, "restore-name");
        var universe = await CreateUniverse(client, "Named world");
        await CreateEntity(client, universe.Id, "Name keeper");
        var validated = await Validated(client, await RawArchive(client, universe.Id));
        Assert.False(validated.Preview.NameAvailable);

        var taken = await Restore(client, validated.Token, " Named world ");
        Assert.Equal(HttpStatusCode.BadRequest, taken.StatusCode);
        Assert.Contains("already have a universe with that name", await Errors(taken), StringComparison.Ordinal);

        var blank = await Restore(client, validated.Token, "   ");
        Assert.Contains("Give the universe a name.", await Errors(blank), StringComparison.Ordinal);

        var tooLong = await Restore(client, validated.Token, new string('x', UniverseConfiguration.NameMaxLength + 1));
        Assert.Contains("Keep the name under", await Errors(tooLong), StringComparison.Ordinal);

        Assert.Equal(1, (await Universes(client)).Count(candidate => candidate.Name == "Named world"));
        Assert.Equal("Named world (restored)", (await Restored(client, validated.Token, "Named world (restored)")).Name);
    }

    [Fact]
    public async Task An_upload_is_spent_by_its_restore_replaced_by_the_next_upload_discarded_on_request_and_gone_when_it_expires()
    {
        var client = await SignedIn(_factory, "restore-lifecycle");
        var universe = await CreateUniverse(client, "Lifecycle world");
        await CreateEntity(client, universe.Id, "Lifecycle keeper");
        var archive = await RawArchive(client, universe.Id);
        var staging = _factory.Services.GetRequiredService<BackupRestoreStaging>();

        // Spent.
        var spent = await Validated(client, archive);
        await Restored(client, spent.Token, "Lifecycle one");
        Assert.Equal(BackupRestoreEndpoints.ExpiredCode, (await Refused(await Restore(client, spent.Token, "Lifecycle again"), HttpStatusCode.NotFound)).Code);

        // Replaced.
        var first = await Validated(client, archive);
        var second = await Validated(client, archive);
        Assert.Equal(HttpStatusCode.NotFound, (await Restore(client, first.Token, "Lifecycle first")).StatusCode);

        // Discarded.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{ValidatePath}/{second.Token}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Restore(client, second.Token, "Lifecycle second")).StatusCode);

        // Expired.
        var expiring = await Validated(client, archive);
        _factory.Clock.Offset = BackupRestoreLimits.StagedLifetime + TimeSpan.FromMinutes(1);
        try
        {
            Assert.Equal(HttpStatusCode.NotFound, (await Restore(client, expiring.Token, "Lifecycle late")).StatusCode);
        }
        finally
        {
            _factory.Clock.Offset = TimeSpan.Zero;
        }

        Assert.Equal(["Lifecycle one"], (await Universes(client)).Where(candidate => candidate.Name.StartsWith("Lifecycle ", StringComparison.Ordinal) && candidate.Name != "Lifecycle world").Select(candidate => candidate.Name));

        // No upload of this account is left on disk.
        Assert.Equal(staging.Census().Waiting, staging.Census().Files);
    }

    [Fact]
    public async Task A_second_restore_of_an_upload_already_being_restored_is_refused_and_builds_nothing()
    {
        var client = await SignedIn(_factory, "restore-double");
        var world = await BuildRichWorld(client, "Saltmarch double");
        var validated = await Validated(client, await RawArchive(client, world.Universe.Id));

        var writing = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _factory.Media.BeforePut = async key =>
        {
            if (key.Contains("/primary/", StringComparison.Ordinal) && !key.StartsWith($"universes/{world.Universe.Id:D}/", StringComparison.Ordinal))
            {
                writing.TrySetResult();
                await release.Task;
            }
        };

        try
        {
            var first = Restore(client, validated.Token, "Double first");
            await writing.Task.WaitAsync(TimeSpan.FromSeconds(30));

            var second = await Refused(await Restore(client, validated.Token, "Double second"), HttpStatusCode.Conflict);
            Assert.Equal(BackupRestoreEndpoints.InProgressCode, second.Code);

            release.SetResult();
            Assert.Equal(HttpStatusCode.Created, (await first).StatusCode);
        }
        finally
        {
            release.TrySetResult();
            _factory.Media.BeforePut = null;
        }

        var names = (await Universes(client)).Select(universe => universe.Name).ToList();
        Assert.Contains("Double first", names);
        Assert.DoesNotContain("Double second", names);
    }

    [Fact]
    public async Task An_archived_universe_restores_archived()
    {
        var client = await SignedIn(_factory, "restore-archived");
        var universe = await CreateUniverse(client, "Archived world");
        await CreateEntity(client, universe.Id, "Archived keeper");
        (await client.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();

        var validated = await Validated(client, await RawArchive(client, universe.Id));
        Assert.True(validated.Preview.IsArchived);

        var restored = await Restored(client, validated.Token, "Archived world restored");
        Assert.True(restored.IsArchived);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{restored.Id}/entities")).StatusCode);
    }

    // ---------- Helpers ----------

    private async Task<Guid> EntityNamedIn(Guid universeId, string name)
    {
        var id = Guid.Empty;
        await WithDb(_factory, async db =>
            id = await db.Entities.Where(entity => entity.UniverseId == universeId && entity.Name == name).Select(entity => entity.Id).SingleAsync());
        return id;
    }

    /// <summary>Every id a source universe's rows carry, of every kind a restored row could wrongly point at.</summary>
    private static async Task<HashSet<Guid>> SourceIds(LorEvolve.Api.Data.LorEvolveDbContext db, Guid universeId)
    {
        var ids = new HashSet<Guid>();
        ids.UnionWith(await db.Entities.Where(entity => entity.UniverseId == universeId).Select(entity => entity.Id).ToListAsync());
        ids.UnionWith(await db.EntityTypes.Where(type => type.UniverseId == universeId).Select(type => type.Id).ToListAsync());
        ids.UnionWith(await db.EntityFieldDefinitions.Where(field => field.EntityType!.UniverseId == universeId).Select(field => field.Id).ToListAsync());
        ids.UnionWith(await db.EntityFieldOptions.Where(option => option.FieldDefinition!.EntityType!.UniverseId == universeId).Select(option => option.Id).ToListAsync());
        ids.UnionWith(await db.ChronologyEras.Where(era => era.UniverseId == universeId).Select(era => era.Id).ToListAsync());
        ids.UnionWith(await db.RelationshipTypes.Where(type => type.UniverseId == universeId).Select(type => type.Id).ToListAsync());
        ids.UnionWith(await db.Stories.Where(story => story.UniverseId == universeId).Select(story => story.Id).ToListAsync());
        ids.UnionWith(await db.Scenes.Where(scene => scene.Story!.UniverseId == universeId).Select(scene => scene.Id).ToListAsync());
        return ids;
    }

    /// <summary>Rows in every table a restore writes to, in one fixed order.</summary>
    private async Task<IReadOnlyList<int>> RowCounts()
    {
        IReadOnlyList<int> counts = [];
        await WithDb(_factory, async db =>
        {
            counts =
            [
                await db.Universes.CountAsync(), await db.ChronologyEras.CountAsync(), await db.EntityTypes.CountAsync(),
                await db.EntityFieldDefinitions.CountAsync(), await db.EntityFieldOptions.CountAsync(), await db.Tags.CountAsync(),
                await db.Entities.CountAsync(), await db.EntityAliases.CountAsync(), await db.EntityTags.CountAsync(),
                await db.EntityFieldValues.CountAsync(), await db.EntityImages.CountAsync(), await db.EntityArticles.CountAsync(),
                await db.EntityArticleRevisions.CountAsync(), await db.EntityRevisions.CountAsync(), await db.EntityRevisionAliases.CountAsync(),
                await db.EntityRevisionTags.CountAsync(), await db.EntityRevisionFieldValues.CountAsync(), await db.RelationshipTypes.CountAsync(),
                await db.Relationships.CountAsync(), await db.TimelineEntries.CountAsync(), await db.TimelineEntryLinks.CountAsync(),
                await db.CanonConflicts.CountAsync(), await db.CanonConflictSubjects.CountAsync(), await db.Stories.CountAsync(),
                await db.Chapters.CountAsync(), await db.Scenes.CountAsync(), await db.SceneEntityLinks.CountAsync(),
                await db.SceneManuscripts.CountAsync(), await db.SceneManuscriptRevisions.CountAsync(), await db.PlotArcs.CountAsync(),
                await db.PlotBeats.CountAsync(), await db.PlotBeatScenes.CountAsync(), await db.PlotBeatEntities.CountAsync(),
                await db.Ideas.CountAsync(), await db.IdeaEntityReferences.CountAsync(), await db.IdeaStoryReferences.CountAsync(),
                await db.IdeaSceneReferences.CountAsync(), await db.IdeaPlotArcReferences.CountAsync(), await db.IdeaPlotBeatReferences.CountAsync(),
                await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM EntitySearchIndex").SingleAsync(),
                await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM StorySearchIndex").SingleAsync(),
                await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM SceneManuscriptSearchIndex").SingleAsync(),
                await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM IdeaSearchIndex").SingleAsync(),
            ];
        });
        return counts;
    }
}
