using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Comments;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Review comments (task 043): threads and replies on an entry, a story or a scene; who may read, write and resolve them;
/// what the API says about their authors; and how they live and die with what they are about.
/// </summary>
public sealed class CommentTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static string Name(string tag, string who) => $"user-{tag}-{who}";

    // ---------- Who may do what ----------

    [Fact]
    public async Task The_owner_starts_a_thread_on_an_entry_a_story_and_a_scene()
    {
        const string tag = "cm-owner";
        var w = await NewSharedWorld(_factory, tag);
        var before = DateTime.UtcNow.AddSeconds(-5);

        foreach (var path in Subjects(w))
        {
            var thread = await Start(w.Owner, path, "  The tide year is off by one.\nCheck the ledger.  ");
            Assert.False(thread.IsResolved);
            Assert.Null(thread.ResolvedByName);
            Assert.Null(thread.ResolvedAt);

            var comment = Assert.Single(thread.Comments);
            Assert.Equal(Name(tag, "owner"), comment.AuthorName);
            Assert.Equal("The tide year is off by one.\nCheck the ledger.", comment.Body);
            Assert.Equal(DateTimeKind.Utc, comment.CreatedAt.Kind);
            Assert.InRange(comment.CreatedAt, before, DateTime.UtcNow.AddSeconds(5));

            Assert.Equal(thread.Id, Assert.Single(await List(w.Owner, path)).Id);
        }

        // Each subject holds its own threads and nobody else's.
        await WithDb(_factory, async db => Assert.Equal(3, await db.CommentThreads.CountAsync(row =>
            row.EntityId == w.Entry || row.StoryId == w.Story || row.SceneId == w.Scene)));
    }

    [Fact]
    public async Task An_editor_and_a_reviewer_take_part_and_the_reviewer_still_edits_nothing()
    {
        const string tag = "cm-review";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";
        var entry = $"{u}/entities/{w.Entry}/comments";

        var thread = await Start(w.Editor, entry, "Is she the heir or the regent?");
        thread = await Reply(w.Reviewer, w.U, thread.Id, "The heir, per chapter two.");
        thread = await Reply(w.Owner, w.U, thread.Id, "Agreed.");

        Assert.Equal(
            [(Name(tag, "editor"), "Is she the heir or the regent?"), (Name(tag, "reviewer"), "The heir, per chapter two."), (Name(tag, "owner"), "Agreed.")],
            thread.Comments.Select(comment => (comment.AuthorName, comment.Body)));
        Assert.True(thread.Comments.Zip(thread.Comments.Skip(1)).All(pair => pair.First.CreatedAt <= pair.Second.CreatedAt));

        // A Reviewer starts threads on every subject too.
        foreach (var path in Subjects(w))
        {
            Assert.Equal(Name(tag, "reviewer"), Assert.Single((await Start(w.Reviewer, path, "A question.")).Comments).AuthorName);
        }

        // And gains nothing else: no edit, no history, no Trash, no publishing, no collaborators.
        var scene = ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene);
        await AssertDenied(await w.Reviewer.PutVersionedAsync($"{u}/entities/{w.Entry}", new EntityRequest(w.CharacterType, "Taken", null, CanonStatus.Canon, null, null, null)), "entry edit");
        await AssertDenied(await w.Reviewer.PutVersionedAsync(Story(w.U, w.Story), new StoryRequest("Taken", null, StoryStatus.Drafting)), "story edit");
        await AssertDenied(await w.Reviewer.PutAsJsonAsync(scene, new SceneManuscriptRequest("Taken.", null)), "manuscript save");
        await AssertDenied(await w.Reviewer.GetAsync($"{u}/entities/{w.Entry}/revisions"), "history");
        await AssertDenied(await w.Reviewer.DeleteAsync($"{u}/entities/{w.Entry}"), "trash");
        await AssertDenied(await w.Reviewer.PostAsync($"{u}/entities/{w.Entry}/publish", null), "publish");
        await AssertDenied(await w.Reviewer.GetAsync($"{u}/collaborators"), "collaborators");
        await AssertDenied(await w.Reviewer.PostAsync($"{u}/comment-threads/{thread.Id}/resolve", null), "resolve");
        await AssertDenied(await w.Reviewer.PostAsync($"{u}/comment-threads/{thread.Id}/reopen", null), "reopen");
        Assert.Equal("Ember Vale", (await w.Owner.GetFromJsonAsync<EntityDetail>($"{u}/entities/{w.Entry}"))!.Name);
    }

    [Fact]
    public async Task A_viewer_reads_every_thread_and_writes_nothing()
    {
        var w = await NewSharedWorld(_factory, "cm-viewer");
        var u = $"/api/universes/{w.U}";
        var paths = Subjects(w);
        var threads = new List<CommentThreadResponse>();
        foreach (var path in paths)
        {
            threads.Add(await Start(w.Owner, path, "For the record."));
        }

        var counts = await Counts();

        foreach (var (path, thread) in paths.Zip(threads))
        {
            Assert.Equal(thread.Id, Assert.Single(await List(w.Viewer, path)).Id);
            await AssertDenied(await w.Viewer.PostAsJsonAsync(path, new CommentRequest("Mine.")), "start");
            await AssertDenied(await w.Viewer.PostAsJsonAsync($"{u}/comment-threads/{thread.Id}/replies", new CommentRequest("Mine.")), "reply");
            await AssertDenied(await w.Viewer.PostAsync($"{u}/comment-threads/{thread.Id}/resolve", null), "resolve");
            await AssertDenied(await w.Viewer.PostAsync($"{u}/comment-threads/{thread.Id}/reopen", null), "reopen");
        }

        Assert.Equal(counts, await Counts());
    }

    [Fact]
    public async Task The_owner_and_an_editor_resolve_and_reopen_and_nothing_said_is_lost()
    {
        const string tag = "cm-resolve";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";
        var path = $"{u}/stories/{w.Story}/comments";
        var older = await Start(w.Reviewer, path, "The causeway floods twice.");
        older = await Reply(w.Editor, w.U, older.Id, "Fixed in the outline.");
        var newer = await Start(w.Reviewer, path, "Second thought.");

        var resolved = await Post<CommentThreadResponse>(w.Editor, $"{u}/comment-threads/{older.Id}/resolve");
        Assert.True(resolved.IsResolved);
        Assert.Equal(Name(tag, "editor"), resolved.ResolvedByName);
        Assert.Equal(DateTimeKind.Utc, resolved.ResolvedAt!.Value.Kind);
        Assert.Equal(older.Comments.Select(comment => comment.Id), resolved.Comments.Select(comment => comment.Id));

        // Resolving again changes nothing about who did it.
        Assert.Equal(Name(tag, "editor"), (await Post<CommentThreadResponse>(w.Owner, $"{u}/comment-threads/{older.Id}/resolve")).ResolvedByName);

        // Listed beside the open one, newest first, resolution and all.
        var listed = await List(w.Viewer, path);
        Assert.Equal([newer.Id, older.Id], listed.Select(thread => thread.Id));
        Assert.Equal([false, true], listed.Select(thread => thread.IsResolved));
        Assert.Equal(2, listed[1].Comments.Count);

        // A resolved thread takes no reply until it is reopened.
        var refused = await w.Reviewer.PostAsJsonAsync($"{u}/comment-threads/{older.Id}/replies", new CommentRequest("One more."));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(CommentEndpoints.ThreadResolvedCode, await PublishingTestClient.ProblemCode(refused));

        var reopened = await Post<CommentThreadResponse>(w.Owner, $"{u}/comment-threads/{older.Id}/reopen");
        Assert.False(reopened.IsResolved);
        Assert.Null(reopened.ResolvedByName);
        Assert.Null(reopened.ResolvedAt);
        Assert.Equal(3, (await Reply(w.Reviewer, w.U, older.Id, "One more.")).Comments.Count);
    }

    // ---------- Privacy and reach ----------

    [Fact]
    public async Task Outsiders_and_other_universes_reach_nothing()
    {
        var a = await NewSharedWorld(_factory, "cm-cross-a");
        var b = await NewSharedWorld(_factory, "cm-cross-b");
        var theirs = await Start(b.Owner, $"/api/universes/{b.U}/entities/{b.Entry}/comments", "Private to B.");
        var counts = await Counts();

        // An outsider to B, and B's paths asked through A, where the caller is an Editor.
        foreach (var (client, universe) in new[] { (b.Outsider, b.U), (a.Editor, b.U), (a.Editor, a.U) })
        {
            var u = $"/api/universes/{universe}";
            foreach (var path in new[]
            {
                $"{u}/entities/{b.Entry}/comments",
                $"{u}/stories/{b.Story}/comments",
                $"{u}/stories/{b.Story}/scenes/{b.Scene}/comments",
            })
            {
                await AssertHidden(await client.GetAsync(path), $"read {path}");
                await AssertHidden(await client.PostAsJsonAsync(path, new CommentRequest("Forged.")), $"start {path}");
            }

            await AssertHidden(await client.PostAsJsonAsync($"{u}/comment-threads/{theirs.Id}/replies", new CommentRequest("Forged.")), "reply");
            await AssertHidden(await client.PostAsync($"{u}/comment-threads/{theirs.Id}/resolve", null), "resolve");
            await AssertHidden(await client.PostAsync($"{u}/comment-threads/{theirs.Id}/reopen", null), "reopen");
        }

        // A's own scene named under another story, and made-up ids, are not there either.
        var ua = $"/api/universes/{a.U}";
        var other = await CreateStory(a.Owner, a.U, "Another book");
        await AssertHidden(await a.Editor.GetAsync($"{ua}/stories/{other}/scenes/{a.Scene}/comments"), "scene under the wrong story");
        await AssertHidden(await a.Editor.PostAsJsonAsync($"{ua}/entities/{Guid.NewGuid()}/comments", new CommentRequest("Forged.")), "made-up entry");
        await AssertHidden(await a.Editor.PostAsJsonAsync($"{ua}/comment-threads/{Guid.NewGuid()}/replies", new CommentRequest("Forged.")), "made-up thread");

        Assert.Equal(counts, await Counts());
        Assert.Equal("Private to B.", Assert.Single(Assert.Single(await List(b.Owner, $"/api/universes/{b.U}/entities/{b.Entry}/comments")).Comments).Body);
    }

    [Fact]
    public async Task A_comment_must_say_something_and_not_too_much()
    {
        var w = await NewSharedWorld(_factory, "cm-body");
        var path = $"/api/universes/{w.U}/entities/{w.Entry}/comments";
        var counts = await Counts();

        foreach (var body in new string?[] { null, "", "   ", " \n\t ", new string('x', CommentLimits.BodyMaxLength + 1) })
        {
            var response = await w.Owner.PostAsJsonAsync(path, new CommentRequest(body));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("\"body\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        Assert.Equal(counts, await Counts());

        var thread = await Start(w.Owner, path, new string('x', CommentLimits.BodyMaxLength));
        var blank = await w.Reviewer.PostAsJsonAsync($"/api/universes/{w.U}/comment-threads/{thread.Id}/replies", new CommentRequest("  "));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);

        // Text is text: markup is stored and returned as typed, for the client to show as text.
        var markup = await Reply(w.Reviewer, w.U, thread.Id, "<b>bold</b> & <script>x</script>");
        Assert.Equal("<b>bold</b> & <script>x</script>", markup.Comments[^1].Body);
    }

    [Fact]
    public async Task Threads_name_people_by_username_and_nothing_else()
    {
        const string tag = "cm-private";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";
        var path = $"{u}/entities/{w.Entry}/comments";
        var thread = await Start(w.Reviewer, path, "A note.");
        await Reply(w.Editor, w.U, thread.Id, "A reply.");
        await Post<CommentThreadResponse>(w.Owner, $"{u}/comment-threads/{thread.Id}/resolve");

        var text = await w.Viewer.GetStringAsync(path);
        foreach (var secret in new[] { w.OwnerId, w.EditorId, w.ReviewerId, w.ViewerId, $"{tag}-owner@", $"{tag}-editor@", $"{tag}-reviewer@", "email", "userId" })
        {
            Assert.DoesNotContain(secret, text, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Contains(Name(tag, "reviewer"), text, StringComparison.Ordinal);
        Assert.Contains(Name(tag, "owner"), text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task What_a_removed_collaborator_or_a_vanished_account_said_stays_readable()
    {
        const string tag = "cm-removed";
        var w = await NewSharedWorld(_factory, tag);
        var u = $"/api/universes/{w.U}";
        var path = $"{u}/entities/{w.Entry}/comments";
        var thread = await Start(w.Reviewer, path, "Before I go.");
        await Reply(w.Editor, w.U, thread.Id, "Noted.");

        await Ok(w.Owner.DeleteAsync($"{u}/collaborators/{w.ReviewerId}"));
        await AssertHidden(await w.Reviewer.GetAsync(path), "former reviewer");

        var kept = Assert.Single(await List(w.Owner, path));
        Assert.Equal(Name(tag, "reviewer"), kept.Comments[0].AuthorName);
        Assert.Equal("Before I go.", kept.Comments[0].Body);

        // An author no account answers to any more reads as no one, and the thread still reads.
        await WithDb(_factory, async db => await db.Comments.Where(row => row.ThreadId == thread.Id && row.Body == "Noted.")
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.AuthorUserId, Guid.NewGuid().ToString())));
        var orphaned = Assert.Single(await List(w.Owner, path));
        Assert.Equal([Name(tag, "reviewer"), null], orphaned.Comments.Select(comment => comment.AuthorName));
    }

    // ---------- Lifecycle ----------

    [Fact]
    public async Task The_Trash_keeps_a_subjects_threads_and_a_restore_brings_them_back()
    {
        var w = await NewSharedWorld(_factory, "cm-trash");
        var u = $"/api/universes/{w.U}";
        var entry = $"{u}/entities/{w.Entry}/comments";
        var scene = $"{Story(w.U, w.Story)}/scenes/{w.Scene}/comments";
        var onEntry = await Start(w.Reviewer, entry, "About the heir.");
        var onScene = await Start(w.Reviewer, scene, "About the causeway.");

        await Ok(w.Editor.DeleteAsync($"{u}/entities/{w.Entry}"));
        await Ok(w.Editor.DeleteAsync($"{Story(w.U, w.Story)}/scenes/{w.Scene}"));

        await AssertHidden(await w.Owner.GetAsync(entry), "trashed entry's comments");
        await AssertHidden(await w.Owner.GetAsync(scene), "trashed scene's comments");
        await AssertHidden(await w.Reviewer.PostAsJsonAsync($"{u}/comment-threads/{onEntry.Id}/replies", new CommentRequest("Still there?")), "reply in the Trash");
        await AssertHidden(await w.Editor.PostAsync($"{u}/comment-threads/{onScene.Id}/resolve", null), "resolve in the Trash");

        await Ok(w.Editor.PostAsync($"{u}/trash/{w.Entry}/restore", null));
        await Ok(w.Editor.PostAsync($"{u}/trash/scenes/{w.Scene}/restore", null));

        Assert.Equal("About the heir.", Assert.Single(Assert.Single(await List(w.Owner, entry)).Comments).Body);
        Assert.Equal("About the causeway.", Assert.Single(Assert.Single(await List(w.Owner, scene)).Comments).Body);
    }

    [Fact]
    public async Task Erasing_content_or_the_universe_takes_its_threads_with_it()
    {
        var w = await NewSharedWorld(_factory, "cm-erase");
        var u = $"/api/universes/{w.U}";

        var story = await CreateStory(w.Owner, w.U, "Doomed book");
        var scene = await CreateScene(w.Owner, w.U, story, "Doomed scene");
        var entry = await CreateEntity(w.Owner, w.U, "Doomed entry");
        await Reply(w.Editor, w.U, (await Start(w.Reviewer, $"{u}/entities/{entry}/comments", "Doomed.")).Id, "Doomed too.");
        await Start(w.Reviewer, $"{Story(w.U, story)}/comments", "Doomed.");
        await Start(w.Reviewer, $"{Story(w.U, story)}/scenes/{scene}/comments", "Doomed.");
        var kept = await Start(w.Reviewer, $"{u}/entities/{w.Entry}/comments", "Kept.");

        await Ok(w.Owner.DeleteAsync($"{u}/entities/{entry}"));
        await Ok(w.Owner.DeleteAsync($"{u}/trash/{entry}"));
        await Ok(w.Owner.DeleteAsync(Story(w.U, story)));
        await Ok(w.Owner.DeleteAsync($"{u}/trash/stories/{story}"));

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.CommentThreads.AnyAsync(row => row.EntityId == entry || row.StoryId == story || row.SceneId == scene));
            Assert.Equal(0, await db.Comments.CountAsync(row => !db.CommentThreads.Any(thread => thread.Id == row.ThreadId)));
            Assert.True(await db.CommentThreads.AnyAsync(row => row.Id == kept.Id));
        });

        await Ok(w.Owner.PostAsync($"{u}/archive", null));
        await Ok(w.Owner.DeleteAsync(u));
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.CommentThreads.AnyAsync(row => row.Id == kept.Id));
            Assert.False(await db.Comments.AnyAsync(row => row.ThreadId == kept.Id));
        });
    }

    [Fact]
    public async Task A_backup_carries_no_comments_and_restores_without_them()
    {
        var w = await NewSharedWorld(_factory, "cm-backup");
        var u = $"/api/universes/{w.U}";
        var thread = await Start(w.Reviewer, $"{u}/entities/{w.Entry}/comments", "Secret review note.");
        await Reply(w.Editor, w.U, thread.Id, "Secret reply.");

        var archive = await RawArchive(w.Owner, w.U);
        var document = DocumentText(archive);
        foreach (var word in new[] { "Secret review note.", "Secret reply.", "comment", w.ReviewerId, w.EditorId })
        {
            Assert.DoesNotContain(word, document, StringComparison.OrdinalIgnoreCase);
        }

        var restored = await RestoreTestClient.RestoreArchive(w.Owner, archive, "Comments restored");
        Guid entry = default;
        await WithDb(_factory, async db => entry = await db.Entities
            .Where(row => row.UniverseId == restored.Id && row.Name == "Ember Vale").Select(row => row.Id).SingleAsync());
        Assert.Empty(await List(w.Owner, $"/api/universes/{restored.Id}/entities/{entry}/comments"));
    }

    // ---------- Helpers ----------

    private static string[] Subjects(SharedWorld w) =>
    [
        $"/api/universes/{w.U}/entities/{w.Entry}/comments",
        $"/api/universes/{w.U}/stories/{w.Story}/comments",
        $"/api/universes/{w.U}/stories/{w.Story}/scenes/{w.Scene}/comments",
    ];

    private static async Task<CommentThreadResponse> Start(HttpClient client, string path, string body)
    {
        var response = await client.PostAsJsonAsync(path, new CommentRequest(body));
        Assert.True(response.StatusCode == HttpStatusCode.Created, $"{path}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<CommentThreadResponse>())!;
    }

    private static async Task<CommentThreadResponse> Reply(HttpClient client, Guid u, Guid threadId, string body)
    {
        var response = await client.PostAsJsonAsync($"/api/universes/{u}/comment-threads/{threadId}/replies", new CommentRequest(body));
        Assert.True(response.IsSuccessStatusCode, $"reply: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<CommentThreadResponse>())!;
    }

    private static async Task<T> Post<T>(HttpClient client, string path)
    {
        var response = await client.PostAsync(path, null);
        Assert.True(response.IsSuccessStatusCode, $"{path}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<List<CommentThreadResponse>> List(HttpClient client, string path) =>
        (await client.GetFromJsonAsync<List<CommentThreadResponse>>(path))!;

    private async Task<(int Threads, int Comments, int Resolved)> Counts()
    {
        (int, int, int) counts = default;
        await WithDb(_factory, async db => counts = (
            await db.CommentThreads.CountAsync(),
            await db.Comments.CountAsync(),
            await db.CommentThreads.CountAsync(row => row.ResolvedAt != null)));
        return counts;
    }
}
