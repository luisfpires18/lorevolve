using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Who made each saved version (task 042): every version an entry, article or manuscript records names the account whose
/// write produced it, by username and nothing else of the account. Versions with no recorded account - from before
/// attribution, or from a backup - read and restore as before. Access to history is unchanged (ADR 0041).
/// </summary>
public sealed class RevisionAttributionTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static string Owner(string tag) => $"user-{tag}-owner";

    private static string Editor(string tag) => $"user-{tag}-editor";

    [Fact]
    public async Task Owner_and_editor_versions_each_name_who_made_them()
    {
        const string tag = "attr-both";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";

        // The shared world's history so far is the owner's alone.
        Assert.All(await EntryHistory(w.Owner, w.U, w.Entry), version => Assert.Equal(Owner(tag), version.ActorName));
        Assert.All(await ArticleRevisions(w.Owner, w.U, w.Entry), version => Assert.Equal(Owner(tag), version.ActorName));
        Assert.All(await ManuscriptHistory(w.Owner, w), version => Assert.Equal(Owner(tag), version.ActorName));

        // An Editor's writes are the Editor's.
        await Ok(w.Editor.PutAsJsonAsync(
            $"{u}/entities/{w.Entry}",
            new EntityRequest(w.CharacterType, "Ember Vale", "Edited by an editor.", CanonStatus.Canon, null, null, null)));
        await WriteArticle(w.Editor, w.U, w.Entry, Doc("An editor's words."));
        await ManuscriptTestClient.WriteManuscript(w.Editor, w.U, w.Story, w.Scene, "An editor's prose.");

        var entry = await EntryHistory(w.Editor, w.U, w.Entry);
        Assert.Equal(EntityRevisionChange.Summary, entry[0].Changes);
        Assert.Equal(Editor(tag), entry[0].ActorName);
        Assert.All(entry.Skip(1), version => Assert.Equal(Owner(tag), version.ActorName));

        var article = await ArticleRevisions(w.Editor, w.U, w.Entry);
        Assert.Equal(Editor(tag), article[0].ActorName);
        Assert.All(article.Skip(1), version => Assert.Equal(Owner(tag), version.ActorName));

        var manuscript = await ManuscriptHistory(w.Editor, w);
        Assert.Equal(Editor(tag), manuscript[0].ActorName);
        Assert.All(manuscript.Skip(1), version => Assert.Equal(Owner(tag), version.ActorName));

        // A picture change is a version too, and it is whoever changed the picture.
        await UploadImage(w.Editor, w.U, w.Entry);
        var withImage = await EntryHistory(w.Owner, w.U, w.Entry);
        Assert.Equal(EntityRevisionChange.Image, withImage[0].Changes);
        Assert.Equal(Editor(tag), withImage[0].ActorName);

        // The owner and the Editor read the same names.
        Assert.Equal(
            withImage.Select(version => version.ActorName),
            (await EntryHistory(w.Editor, w.U, w.Entry)).Select(version => version.ActorName));
    }

    [Fact]
    public async Task Created_entries_name_their_author_one_at_a_time_and_in_bulk()
    {
        const string tag = "attr-create";
        var w = await NewSharedWorld(_factory, tag);

        var single = await CreateEntity(w.Editor, w.U, "Editor's foundling");
        var bulk = await PostJson<BulkEntityResponse>(
            w.Editor,
            $"/api/universes/{w.U}/entities/bulk",
            new BulkEntityRequest([new BulkEntityRow(w.CharacterType, "Bulk one", CanonStatus.Draft), new BulkEntityRow(w.CharacterType, "Bulk two", CanonStatus.Draft)]));

        foreach (var id in bulk.Created.Select(created => created.Id).Prepend(single))
        {
            var history = await EntryHistory(w.Owner, w.U, id);
            Assert.Equal(EntityRevisionKind.Created, Assert.Single(history).Kind);
            Assert.Equal(Editor(tag), history[0].ActorName);
        }
    }

    [Fact]
    public async Task A_restored_version_names_whoever_put_it_back()
    {
        const string tag = "attr-restore";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";

        await Ok(w.Editor.PostAsync($"{u}/entities/{w.Entry}/revisions/{w.EntryRevision}/restore", null));
        var entry = await EntryHistory(w.Owner, w.U, w.Entry);
        Assert.Equal(EntityRevisionKind.Restored, entry[0].Kind);
        Assert.Equal(w.EntryRevision, entry[0].RestoredFromRevisionId);
        Assert.Equal(Editor(tag), entry[0].ActorName);
        Assert.Equal(Owner(tag), entry.Single(version => version.Id == w.EntryRevision).ActorName);

        var current = await ReadArticle(w.Editor, w.U, w.Entry);
        await Ok(RestoreArticle(w.Editor, w.U, w.Entry, w.ArticleRevision, current.UpdatedAt));
        var article = await ArticleRevisions(w.Owner, w.U, w.Entry);
        Assert.Equal(EntityRevisionKind.Restored, article[0].Kind);
        Assert.Equal(Editor(tag), article[0].ActorName);
        Assert.Equal(Owner(tag), article.Single(version => version.Id == w.ArticleRevision).ActorName);

        var manuscript = await ManuscriptTestClient.ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        await Ok(w.Editor.PostAsJsonAsync(
            $"{ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene)}/revisions/{w.ManuscriptRevision}/restore",
            new SceneManuscriptRestoreRequest(manuscript.UpdatedAt)));
        var prose = await ManuscriptHistory(w.Owner, w);
        Assert.Equal(SceneManuscriptRevisionKind.Restored, prose[0].Kind);
        Assert.Equal(Editor(tag), prose[0].ActorName);
        Assert.Equal(Owner(tag), prose.Single(version => version.Id == w.ManuscriptRevision).ActorName);

        // Trash and back, by the Editor: the history comes back exactly as it was, names included, and gains nothing.
        var before = await EntryHistory(w.Owner, w.U, w.Entry);
        await Ok(w.Editor.DeleteAsync($"{u}/entities/{w.Entry}"));
        await AssertHidden(await w.Owner.GetAsync($"{u}/entities/{w.Entry}/revisions"), "a trashed entry's history");
        await Ok(w.Editor.PostAsync($"{u}/trash/{w.Entry}/restore", null));
        Assert.Equal(
            before.Select(version => (version.Id, version.ActorName)),
            (await EntryHistory(w.Owner, w.U, w.Entry)).Select(version => (version.Id, version.ActorName)));
    }

    [Fact]
    public async Task Reviewers_and_viewers_gain_no_edit_and_leave_no_version()
    {
        var w = await NewSharedWorld(_factory, "attr-readonly");
        var u = $"/api/universes/{w.U}";
        var scene = ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene);
        var counts = await Counts(w);

        foreach (var who in new[] { w.Reviewer, w.Viewer })
        {
            await AssertDenied(
                await who.PutAsJsonAsync($"{u}/entities/{w.Entry}", new EntityRequest(w.CharacterType, "Taken", null, CanonStatus.Canon, null, null, null)),
                "entry edit");
            await AssertDenied(await PutArticle(who, w.U, w.Entry, Doc("Taken."), null), "article save");
            await AssertDenied(await who.PutAsJsonAsync(scene, new SceneManuscriptRequest("Taken.", null)), "manuscript save");
            await AssertDenied(await who.PostAsync($"{u}/entities/{w.Entry}/revisions/{w.EntryRevision}/restore", null), "entry restore");
            await AssertDenied(await RestoreArticle(who, w.U, w.Entry, w.ArticleRevision, null), "article restore");
            await AssertDenied(await who.PostAsJsonAsync($"{scene}/revisions/{w.ManuscriptRevision}/restore", new SceneManuscriptRestoreRequest(null)), "manuscript restore");

            await AssertDenied(await who.GetAsync($"{u}/entities/{w.Entry}/revisions"), "entry history");
            await AssertDenied(await who.GetAsync($"{ArticlePath(w.U, w.Entry)}/revisions"), "article history");
            await AssertDenied(await who.GetAsync($"{scene}/revisions"), "manuscript history");
        }

        await AssertHidden(await w.Outsider.GetAsync($"{u}/entities/{w.Entry}/revisions"), "outsider entry history");
        await AssertHidden(await w.Outsider.GetAsync($"{ArticlePath(w.U, w.Entry)}/revisions"), "outsider article history");
        await AssertHidden(await w.Outsider.GetAsync($"{scene}/revisions"), "outsider manuscript history");

        Assert.Equal(counts, await Counts(w));
    }

    [Fact]
    public async Task History_never_reaches_across_universes()
    {
        var a = await NewSharedWorld(_factory, "attr-cross-a");
        var b = await NewSharedWorld(_factory, "attr-cross-b");

        // A's Editor holds no role in B: B's history is not there for them, by its own address or through A's.
        foreach (var universe in new[] { b.U, a.U })
        {
            await AssertHidden(await a.Editor.GetAsync($"/api/universes/{universe}/entities/{b.Entry}/revisions"), "entry history");
            await AssertHidden(await a.Editor.GetAsync($"{ArticlePath(universe, b.Entry)}/revisions"), "article history");
            await AssertHidden(await a.Editor.GetAsync($"{ManuscriptTestClient.Manuscript(universe, b.Story, b.Scene)}/revisions"), "manuscript history");
            await AssertHidden(await a.Editor.PostAsync($"/api/universes/{universe}/entities/{b.Entry}/revisions/{b.EntryRevision}/restore", null), "entry restore");
        }

        // Nor is one of B's versions reachable through one of A's entries.
        await AssertHidden(await a.Editor.GetAsync($"/api/universes/{a.U}/entities/{a.Entry}/revisions/{b.EntryRevision}"), "foreign version");
        Assert.DoesNotContain(
            await EntryHistory(a.Editor, a.U, a.Entry),
            version => version.ActorName == Owner("attr-cross-b"));
    }

    [Fact]
    public async Task A_version_with_no_recorded_author_still_reads_and_restores()
    {
        const string tag = "attr-legacy";
        var w = await NewSharedWorld(_factory, tag);

        // As every version recorded before attribution is.
        await WithDb(_factory, async db =>
        {
            await db.EntityRevisions.Where(row => row.EntityId == w.Entry).ExecuteUpdateAsync(set => set.SetProperty(row => row.ActorUserId, (string?)null));
            await db.EntityArticleRevisions.Where(row => row.EntityId == w.Entry).ExecuteUpdateAsync(set => set.SetProperty(row => row.ActorUserId, (string?)null));
            await db.SceneManuscriptRevisions.Where(row => row.SceneId == w.Scene).ExecuteUpdateAsync(set => set.SetProperty(row => row.ActorUserId, (string?)null));
        });

        // So is a version whose account is gone: an id that resolves to no one reads the same.
        await WithDb(_factory, async db =>
            await db.EntityRevisions.Where(row => row.Id == w.EntryRevision)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.ActorUserId, Guid.NewGuid().ToString())));

        Assert.All(await EntryHistory(w.Owner, w.U, w.Entry), version => Assert.Null(version.ActorName));
        Assert.All(await ArticleRevisions(w.Owner, w.U, w.Entry), version => Assert.Null(version.ActorName));
        Assert.All(await ManuscriptHistory(w.Owner, w), version => Assert.Null(version.ActorName));

        Assert.Equal(w.EntryRevision, (await w.Owner.GetFromJsonAsync<EntityRevisionDetail>(
            $"/api/universes/{w.U}/entities/{w.Entry}/revisions/{w.EntryRevision}"))!.Id);
        Assert.Equal(w.ArticleRevision, (await ArticleRevision(w.Owner, w.U, w.Entry, w.ArticleRevision)).Id);

        // Putting one back records a new version, named; the old ones are left as they were.
        await Ok(w.Owner.PostAsync($"/api/universes/{w.U}/entities/{w.Entry}/revisions/{w.EntryRevision}/restore", null));
        var entry = await EntryHistory(w.Owner, w.U, w.Entry);
        Assert.Equal(Owner(tag), entry[0].ActorName);
        Assert.All(entry.Skip(1), version => Assert.Null(version.ActorName));

        var current = await ReadArticle(w.Owner, w.U, w.Entry);
        await Ok(RestoreArticle(w.Owner, w.U, w.Entry, w.ArticleRevision, current.UpdatedAt));
        Assert.Equal(Owner(tag), (await ArticleRevisions(w.Owner, w.U, w.Entry))[0].ActorName);
    }

    [Fact]
    public async Task History_shows_a_username_and_nothing_else_of_the_account()
    {
        var w = await NewSharedWorld(_factory, "attr-private");
        await WriteArticle(w.Editor, w.U, w.Entry, Doc("By the editor."));
        await ManuscriptTestClient.WriteManuscript(w.Editor, w.U, w.Story, w.Scene, "By the editor.");

        var paths = new[]
        {
            $"/api/universes/{w.U}/entities/{w.Entry}/revisions",
            $"/api/universes/{w.U}/entities/{w.Entry}/revisions/{w.EntryRevision}",
            $"{ArticlePath(w.U, w.Entry)}/revisions",
            $"{ArticlePath(w.U, w.Entry)}/revisions/{w.ArticleRevision}",
            $"{ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene)}/revisions",
            $"{ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene)}/revisions/{w.ManuscriptRevision}",
        };

        foreach (var path in paths)
        {
            var text = await w.Editor.GetStringAsync(path);
            foreach (var secret in new[] { w.OwnerId, w.EditorId, "attr-private-owner@", "attr-private-editor@", "actorUserId", "email" })
            {
                Assert.DoesNotContain(secret, text, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task A_backup_carries_no_author_and_its_restore_records_none()
    {
        const string tag = "attr-backup";
        var w = await NewSharedWorld(_factory, tag);
        await Ok(w.Editor.PutAsJsonAsync(
            $"/api/universes/{w.U}/entities/{w.Entry}",
            new EntityRequest(w.CharacterType, "Ember Vale", "The editor was here.", CanonStatus.Canon, null, null, null)));
        await WriteArticle(w.Editor, w.U, w.Entry, Doc("The editor was here."));
        await ManuscriptTestClient.WriteManuscript(w.Editor, w.U, w.Story, w.Scene, "The editor was here.");

        var archive = await RawArchive(w.Owner, w.U);
        var document = DocumentText(archive);
        foreach (var secret in new[] { w.OwnerId, w.EditorId, Owner(tag), Editor(tag), "actorUserId", "actorName" })
        {
            Assert.DoesNotContain(secret, document, StringComparison.OrdinalIgnoreCase);
        }

        // Restored, every version is there and names no one: the restorer did not write them.
        var restored = await RestoreTestClient.RestoreArchive(w.Owner, archive, "Attribution restored");
        Guid entry = default, story = default, scene = default;
        await WithDb(_factory, async db =>
        {
            entry = await db.Entities.Where(row => row.UniverseId == restored.Id && row.Name == "Ember Vale").Select(row => row.Id).SingleAsync();
            story = await db.Stories.Where(row => row.UniverseId == restored.Id && row.Title == "The drowned heir").Select(row => row.Id).SingleAsync();
            scene = await db.Scenes.Where(row => row.StoryId == story && row.Title == "The causeway").Select(row => row.Id).SingleAsync();

            Assert.False(await db.EntityRevisions.AnyAsync(row => row.Entity!.UniverseId == restored.Id && row.ActorUserId != null));
            Assert.False(await db.EntityArticleRevisions.AnyAsync(row => row.Entity!.UniverseId == restored.Id && row.ActorUserId != null));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => row.Scene!.Story!.UniverseId == restored.Id && row.ActorUserId != null));
        });

        var history = await EntryHistory(w.Owner, restored.Id, entry);
        Assert.Equal((await EntryHistory(w.Owner, w.U, w.Entry)).Count, history.Count);
        Assert.All(history, version => Assert.Null(version.ActorName));
        Assert.All(await ArticleRevisions(w.Owner, restored.Id, entry), version => Assert.Null(version.ActorName));
        Assert.All(
            (await w.Owner.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>($"{ManuscriptTestClient.Manuscript(restored.Id, story, scene)}/revisions"))!,
            version => Assert.Null(version.ActorName));
    }

    private static async Task<List<EntityRevisionSummary>> EntryHistory(HttpClient client, Guid u, Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>($"/api/universes/{u}/entities/{entityId}/revisions"))!;

    private static async Task<List<SceneManuscriptRevisionSummary>> ManuscriptHistory(HttpClient client, SharedWorld w) =>
        (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
            $"{ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene)}/revisions"))!;

    private async Task<(int Entry, int Article, int Manuscript)> Counts(SharedWorld w)
    {
        (int, int, int) counts = default;
        await WithDb(_factory, async db => counts = (
            await db.EntityRevisions.CountAsync(row => row.EntityId == w.Entry),
            await db.EntityArticleRevisions.CountAsync(row => row.EntityId == w.Entry),
            await db.SceneManuscriptRevisions.CountAsync(row => row.SceneId == w.Scene)));
        return counts;
    }
}
