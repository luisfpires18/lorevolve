using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Knowledge;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Reading;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Knowledge records (issue 15, ADR 0057): written in the author's words and anchored to a scene or known from the start;
/// listed in reading order with what the list can read without inferring; every member reads, editors write, nobody else;
/// every id checked against this universe; living and dying with what they name; part of no other read; in the backup.
/// </summary>
public sealed class KnowledgeTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private static string Knowledge(Guid u) => $"/api/universes/{u}/knowledge";

    private static KnowledgeRecordRequest Request(Guid knower, Guid? subject, string statement, Guid? scene, bool fromStart = false) =>
        new(knower, subject, statement, scene, fromStart);

    private static async Task<KnowledgeRecordResponse> Added(HttpClient client, Guid u, KnowledgeRecordRequest request)
    {
        var response = await client.PostAsJsonAsync(Knowledge(u), request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<KnowledgeRecordResponse>())!;
    }

    private static async Task<List<KnowledgeRecordResponse>> Listed(HttpClient client, Guid u, string query = "") =>
        (await client.GetFromJsonAsync<List<KnowledgeRecordResponse>>($"{Knowledge(u)}{query}"))!;

    /// <summary>A story with an unchaptered scene and a chapter of two, and two entries, for reading-order tests.</summary>
    private static async Task<(Guid Story, Guid Chapter, Guid Opening, Guid First, Guid Second, Guid Knower, Guid Subject)> Staged(HttpClient owner, Guid u, string tag)
    {
        var story = await CreateStory(owner, u, $"The Tide {tag}");
        var opening = await CreateScene(owner, u, story, "Opening");
        var chapter = await CreateChapter(owner, u, story, "Arrival");
        var first = await CreateScene(owner, u, story, "The Causeway", chapter);
        var second = await CreateScene(owner, u, story, "The Hall", chapter);
        var knower = await CreateEntity(owner, u, $"Mira {tag}");
        var subject = await CreateEntity(owner, u, $"The heir {tag}");
        return (story, chapter, opening, first, second, knower, subject);
    }

    [Fact]
    public async Task Records_are_listed_in_reading_order_with_what_the_list_can_read_without_inferring()
    {
        var w = await NewSharedWorld(_factory, "kn-order");
        var (story, chapter, opening, first, second, knower, subject) = await Staged(w.Owner, w.U, "order");
        var u = $"/api/universes/{w.U}";

        var atSecond = await Added(w.Owner, w.U, Request(knower, subject, "  The heir survived the causeway.  ", second));
        var fromStart = await Added(w.Owner, w.U, Request(knower, null, "Her own name.", null, fromStart: true));
        var atOpening = await Added(w.Owner, w.U, Request(knower, subject, "The heir exists.", opening));
        var atFirst = await Added(w.Owner, w.U, Request(knower, null, "The tide turns at dusk.", first));

        // Trimmed, and shaped: the knower, the subject, the scene placed in its story.
        Assert.Equal("The heir survived the causeway.", atSecond.Statement);
        Assert.Equal((knower, $"Mira order", "Character", false), (atSecond.Knower.Id, atSecond.Knower.Name, atSecond.Knower.TypeName, atSecond.Knower.IsTrashed));
        Assert.Equal(subject, atSecond.Subject!.Id);
        Assert.Equal(("The Hall", story, "The Tide order", 1, "Arrival", 2, false), (atSecond.Scene!.Title, atSecond.Scene.StoryId, atSecond.Scene.StoryTitle, atSecond.Scene.ChapterNumber, atSecond.Scene.ChapterTitle, atSecond.Scene.Position, atSecond.Scene.IsTrashed));
        Assert.Null(atOpening.Scene!.ChapterNumber);
        Assert.Equal(1, atOpening.Scene.Position);
        Assert.True(fromStart.KnownFromStart);
        Assert.Null(fromStart.Scene);
        Assert.Null(fromStart.Subject);

        // Known from the start first, then the story's order: Unchaptered, then the chapter's scenes in order.
        var listed = await Listed(w.Owner, w.U, $"?knowerId={knower}");
        Assert.Equal([fromStart.Id, atOpening.Id, atFirst.Id, atSecond.Id], listed.Select(record => record.Id));

        // Nothing is inferred: the knower is in none of these scenes yet, and the list says so - and only that.
        Assert.All(listed.Where(record => record.Scene is not null), record => Assert.Equal([KnowledgeIssues.KnowerNotInScene], record.Issues));
        Assert.Empty(fromStart.Issues);

        // In the scene's lore, or its point of view, and the reading goes.
        await Ok(w.Owner.PutVersionedAsync($"{u}/stories/{story}/scenes/{second}", new SceneRequest("The Hall", null, null, null, null, [knower], chapter)));
        await Ok(w.Owner.PutVersionedAsync($"{u}/stories/{story}/scenes/{opening}", new SceneRequest("Opening", null, null, knower, null, [], null)));
        listed = await Listed(w.Owner, w.U, $"?knowerId={knower}");
        Assert.Empty(listed.Single(record => record.Id == atSecond.Id).Issues);
        Assert.Empty(listed.Single(record => record.Id == atOpening.Id).Issues);
        Assert.Equal([KnowledgeIssues.KnowerNotInScene], listed.Single(record => record.Id == atFirst.Id).Issues);

        // By subject, by scene, by story.
        Assert.Equal([atOpening.Id, atSecond.Id], (await Listed(w.Owner, w.U, $"?subjectId={subject}")).Select(record => record.Id));
        Assert.Equal([atFirst.Id], (await Listed(w.Owner, w.U, $"?sceneId={first}")).Select(record => record.Id));
        Assert.Equal([atOpening.Id, atFirst.Id, atSecond.Id], (await Listed(w.Owner, w.U, $"?storyId={story}")).Select(record => record.Id));
        Assert.Empty(await Listed(w.Owner, w.U, $"?knowerId={Guid.NewGuid()}"));
    }

    [Fact]
    public async Task The_trash_marks_a_record_and_a_save_may_keep_what_it_already_names_but_not_newly_choose_it()
    {
        var w = await NewSharedWorld(_factory, "kn-trash");
        var (story, _, _, first, second, knower, subject) = await Staged(w.Owner, w.U, "trash");
        var u = $"/api/universes/{w.U}";
        var record = await Added(w.Owner, w.U, Request(knower, subject, "The heir lives.", second));

        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/entities/{subject}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/stories/{story}/scenes/{second}")).StatusCode);

        var marked = (await Listed(w.Owner, w.U, $"?knowerId={knower}")).Single();
        Assert.Equal([KnowledgeIssues.SubjectTrashed, KnowledgeIssues.SceneTrashed, KnowledgeIssues.KnowerNotInScene], marked.Issues);
        Assert.True(marked.Subject!.IsTrashed);
        Assert.True(marked.Scene!.IsTrashed);

        // Kept through an edit that leaves them; refused as a new choice.
        var kept = await w.Owner.PutAsJsonAsync($"{Knowledge(w.U)}/{record.Id}", Request(knower, subject, "The heir lives still.", second));
        Assert.True(kept.IsSuccessStatusCode, await kept.Content.ReadAsStringAsync());
        var fresh = await w.Owner.PostAsJsonAsync(Knowledge(w.U), Request(knower, subject, "Again.", second));
        Assert.Equal(HttpStatusCode.BadRequest, fresh.StatusCode);
        Assert.Equal(["sceneid", "subjectentityid"], (await ErrorKeys(fresh)).Select(key => key.ToLowerInvariant()).Order());
        var moved = await w.Owner.PutAsJsonAsync($"{Knowledge(w.U)}/{record.Id}", Request(knower, w.Trash.Entry, "Moved.", first));
        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
        Assert.Contains("subjectEntityId", await ErrorKeys(moved));

        // Restored, the marks go.
        (await w.Owner.PostAsync($"{u}/trash/{subject}/restore", null)).EnsureSuccessStatusCode();
        (await w.Owner.PostAsync($"{u}/trash/scenes/{second}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal([KnowledgeIssues.KnowerNotInScene], (await Listed(w.Owner, w.U, $"?knowerId={knower}")).Single().Issues);

        // Erased for good: the subject leaves the record about nobody; the scene, then the knower, take it.
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/entities/{subject}")).StatusCode);
        (await w.Owner.DeleteAsync($"{u}/trash/{subject}")).EnsureSuccessStatusCode();
        Assert.Null((await Listed(w.Owner, w.U, $"?knowerId={knower}")).Single().Subject);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/stories/{story}/scenes/{second}")).StatusCode);
        (await w.Owner.DeleteAsync($"{u}/trash/scenes/{second}")).EnsureSuccessStatusCode();
        Assert.Empty(await Listed(w.Owner, w.U, $"?knowerId={knower}"));

        var again = await Added(w.Owner, w.U, Request(knower, null, "Known.", null, fromStart: true));
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/entities/{knower}")).StatusCode);
        (await w.Owner.DeleteAsync($"{u}/trash/{knower}")).EnsureSuccessStatusCode();
        await WithDb(_factory, async db => Assert.False(await db.KnowledgeRecords.AnyAsync(row => row.Id == again.Id)));
    }

    [Fact]
    public async Task Every_shape_problem_is_named_at_once_and_every_id_must_be_live_in_this_universe()
    {
        var w = await NewSharedWorld(_factory, "kn-shape");
        var (_, _, _, first, _, knower, subject) = await Staged(w.Owner, w.U, "shape");
        var elsewhere = (await CreateUniverse(w.Owner, "Elsewhere kn")).Id;
        var foreignEntry = await CreateEntity(w.Owner, elsewhere, "Stranger");
        var foreignStory = await CreateStory(w.Owner, elsewhere, "Far story");
        var foreignScene = await CreateScene(w.Owner, elsewhere, foreignStory, "Far scene");

        async Task Refused(KnowledgeRecordRequest request, params string[] keys)
        {
            var response = await w.Owner.PostAsJsonAsync(Knowledge(w.U), request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal(keys.Order(), (await ErrorKeys(response)).Order());
        }

        await Refused(new KnowledgeRecordRequest(null, null, " ", null, false), "knowerEntityId", "statement", "sceneId");
        await Refused(Request(knower, knower, "Herself.", first), "subjectEntityId");
        await Refused(Request(knower, null, "Both.", first, fromStart: true), "sceneId");
        await Refused(Request(knower, null, new string('x', KnowledgeLimits.StatementMaxLength + 1), first), "statement");
        await Refused(Request(foreignEntry, null, "Far.", first), "knowerEntityId");
        await Refused(Request(knower, foreignEntry, "Far.", first), "subjectEntityId");
        await Refused(Request(knower, null, "Far.", foreignScene), "sceneId");
        await Refused(Request(knower, null, "Guessed.", Guid.NewGuid()), "sceneId");
        await Refused(Request(Guid.NewGuid(), null, "Guessed.", first), "knowerEntityId");
        await Refused(Request(w.Trash.Entry, null, "Binned.", first), "knowerEntityId");
        await Refused(Request(knower, null, "Binned scene.", w.Trash.Scene), "sceneId");

        // Exactly the bound is kept, trimmed.
        var atBound = new string('y', KnowledgeLimits.StatementMaxLength);
        Assert.Equal(atBound, (await Added(w.Owner, w.U, Request(knower, subject, $" {atBound} ", first))).Statement);
        Assert.Single(await Listed(w.Owner, w.U));
    }

    [Fact]
    public async Task Every_member_reads_and_only_editors_write()
    {
        var w = await NewSharedWorld(_factory, "kn-roles");
        var (_, _, _, first, _, knower, subject) = await Staged(w.Owner, w.U, "roles");
        var record = await Added(w.Owner, w.U, Request(knower, subject, "Owner's.", first));
        var edited = Request(knower, subject, "Edited.", first);

        var byEditor = await Added(w.Editor, w.U, Request(knower, null, "Editor's.", null, fromStart: true));
        Assert.True((await w.Editor.PutAsJsonAsync($"{Knowledge(w.U)}/{record.Id}", edited)).IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Editor.DeleteAsync($"{Knowledge(w.U)}/{byEditor.Id}")).StatusCode);

        foreach (var who in new[] { Who.Reviewer, Who.Viewer })
        {
            Assert.Equal([record.Id], (await Listed(w.Client(who), w.U)).Select(row => row.Id));
            await AssertDenied(await w.Client(who).PostAsJsonAsync(Knowledge(w.U), edited), $"{who} adds");
            await AssertDenied(await w.Client(who).PutAsJsonAsync($"{Knowledge(w.U)}/{record.Id}", edited), $"{who} edits");
            await AssertDenied(await w.Client(who).DeleteAsync($"{Knowledge(w.U)}/{record.Id}"), $"{who} removes");
        }

        await AssertHidden(await w.Outsider.GetAsync(Knowledge(w.U)), "outsider lists");
        await AssertHidden(await w.Outsider.PostAsJsonAsync(Knowledge(w.U), edited), "outsider adds");
        await AssertHidden(await w.Outsider.PutAsJsonAsync($"{Knowledge(w.U)}/{record.Id}", edited), "outsider edits");
        await AssertHidden(await w.Outsider.DeleteAsync($"{Knowledge(w.U)}/{record.Id}"), "outsider removes");

        // A record reached through another universe of the same owner is missing.
        var other = (await CreateUniverse(w.Owner, "Other kn")).Id;
        await AssertHidden(await w.Owner.PutAsJsonAsync($"{Knowledge(other)}/{record.Id}", edited), "another universe edits");
        await AssertHidden(await w.Owner.DeleteAsync($"{Knowledge(other)}/{record.Id}"), "another universe removes");
        Assert.Equal("Edited.", (await Listed(w.Owner, w.U)).Single().Statement);
    }

    [Fact]
    public async Task A_record_reaches_no_other_read_and_changes_nothing_it_names()
    {
        var w = await NewSharedWorld(_factory, "kn-apart");
        var (story, _, _, first, _, knower, subject) = await Staged(w.Owner, w.U, "apart");
        var u = $"/api/universes/{w.U}";
        var secret = $"Vaelorith-{Guid.NewGuid():n}";

        var knowerBefore = await w.Owner.GetStringAsync($"{u}/entities/{knower}");
        var sceneBefore = await w.Owner.GetStringAsync($"{u}/stories/{story}/scenes/{first}");
        await Added(w.Owner, w.U, Request(knower, subject, $"{secret} is the true heir.", first));

        Assert.Equal(knowerBefore, await w.Owner.GetStringAsync($"{u}/entities/{knower}"));
        Assert.Equal(sceneBefore, await w.Owner.GetStringAsync($"{u}/stories/{story}/scenes/{first}"));
        Assert.DoesNotContain(secret, await w.Owner.GetStringAsync($"{u}/entities/{subject}"), StringComparison.Ordinal);
        Assert.DoesNotContain(secret, await w.Owner.GetStringAsync($"{u}/stories/{story}"), StringComparison.Ordinal);
        Assert.Empty((await w.Owner.GetFromJsonAsync<EntityPage>($"{u}/entities?search={secret}"))!.Items);
        Assert.Empty((await w.Owner.GetFromJsonAsync<UniverseSearchResponse>($"{u}/search?q={secret}"))!.Results);

        await WithDb(_factory, async db =>
        {
            Assert.DoesNotContain(secret, JsonSerializer.Serialize(await UniverseReader.GetLoreAsync(db, w.U, knower, CancellationToken.None)), StringComparison.Ordinal);
            Assert.DoesNotContain(secret, JsonSerializer.Serialize(await UniverseReader.GetSceneAsync(db, w.U, first, false, CancellationToken.None)), StringComparison.Ordinal);
            Assert.Empty(await UniverseReader.SearchAsync(db, w.U, secret, CancellationToken.None));
        });
    }

    [Fact]
    public async Task Records_travel_in_the_backup_and_restore_under_new_ids()
    {
        var w = await NewSharedWorld(_factory, "kn-backup");
        var (_, _, _, first, _, knower, subject) = await Staged(w.Owner, w.U, "backup");
        var atFirst = await Added(w.Owner, w.U, Request(knower, subject, "Backed up.", first));
        var fromStart = await Added(w.Owner, w.U, Request(subject, null, "Always known.", null, fromStart: true));

        var backup = await Backup(w.Owner, w.U);
        Assert.Equal(LorEvolve.Api.Features.Export.UniverseBackup.CurrentVersion, backup.FormatVersion);
        var carried = backup.Payload.KnowledgeRecords!;
        Assert.Equal(2, carried.Count);
        var row = carried.Single(record => record.Id == atFirst.Id);
        Assert.Equal((knower, subject, "Backed up.", first, false), (row.KnowerEntityId, row.SubjectEntityId, row.Statement, row.SceneId, row.KnownFromStart));
        var start = carried.Single(record => record.Id == fromStart.Id);
        Assert.Equal((subject, (Guid?)null, (Guid?)null, true), (start.KnowerEntityId, start.SubjectEntityId, start.SceneId, start.KnownFromStart));

        var archive = await RawArchive(w.Owner, w.U);
        var restored = await RestoreArchive(w.Owner, archive, "Knowledge again");
        var copies = await Listed(w.Owner, restored.Id);
        Assert.Equal(
            [("The heir backup", null, "Always known.", null, true), ("Mira backup", "The heir backup", "Backed up.", "The Causeway", false)],
            copies.Select(record => (record.Knower.Name, record.Subject?.Name, record.Statement, record.Scene?.Title, record.KnownFromStart)));
        Assert.All(copies, record => Assert.DoesNotContain(record.Id, new[] { atFirst.Id, fromStart.Id }));
        Assert.All(copies, record => Assert.NotEqual(knower, record.Knower.Id));

        // A version 32 file has none, even when it carries the member.
        var older = await RestoreArchive(w.Owner, Rewrite(archive, root => root["formatVersion"] = 32), "Before knowledge");
        Assert.Empty(await Listed(w.Owner, older.Id));

        // Refused before anything is written: a knower the file does not hold, both anchors, no statement.
        async Task RefusedFile(Action<System.Text.Json.Nodes.JsonObject> change)
        {
            var refused = await Refused(await Validate(w.Owner, Rewrite(archive, root =>
            {
                var record = root["payload"]!["knowledgeRecords"]!.AsArray().Single(candidate => candidate!["id"]!.GetValue<Guid>() == atFirst.Id)!.AsObject();
                change(record);
            })));
            Assert.Contains(refused.Issues, issue => issue.Message.Contains("knowledge", StringComparison.OrdinalIgnoreCase));
        }

        await RefusedFile(record => record["knowerEntityId"] = Guid.NewGuid());
        await RefusedFile(record => record["knownFromStart"] = true);
        await RefusedFile(record => record["statement"] = " ");
        await RefusedFile(record => record["sceneId"] = Guid.NewGuid());
    }
}
