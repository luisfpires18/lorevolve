using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Ideas that belong to a project (#197). A project idea is a universe idea with a narrower home: it takes the project's
/// universe, it is listed by the project, and when the project goes it stays, released, exactly as an idea does from a
/// deleted universe. An idea with no universe and no project is untouched by any of it.
/// </summary>
public sealed class IdeaProjectTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_project_idea_is_created_read_updated_and_deleted_and_takes_the_project_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaproject");
        var project = await NewProject(client, universe.Id, "Salt Road");

        // Created with the project alone: the universe is the project's.
        var created = await Create(client, new IdeaRequest("A boss fight", "On the bridge.", null, null, null, project.Id));
        Assert.Equal((universe.Id, project.Id, project.Name, ProjectKind.Game), (created.Universe!.Id, created.Project!.Id, created.Project.Name, created.Project.Kind));

        var read = await ReadIdea(client, created.Id);
        Assert.Equal(project.Id, read.Project!.Id);

        // Updated, keeping the project.
        var saved = await Put(client, read, new IdeaRequest("Two boss fights", read.Body, universe.Id, [], read.UpdatedAt, project.Id));
        Assert.Equal(("Two boss fights", project.Id), (saved.Title, saved.Project!.Id));

        // Taken off the project, staying in the universe.
        var released = await Put(client, saved, new IdeaRequest(saved.Title, saved.Body, universe.Id, [], saved.UpdatedAt, null));
        Assert.Equal((universe.Id, (IdeaProject?)null), (released.Universe!.Id, released.Project));

        // Back on it, then deleted and restored with it.
        var again = await Put(client, released, new IdeaRequest(released.Title, released.Body, null, [], released.UpdatedAt, project.Id));
        (await client.DeleteAsync(Idea(again.Id))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Idea(again.Id))).StatusCode);
        (await client.PostAsync($"{Idea(again.Id)}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(project.Id, (await ReadIdea(client, again.Id)).Project!.Id);
    }

    [Fact]
    public async Task The_project_list_holds_that_project_ideas_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaprojectlist");
        var first = await NewProject(client, universe.Id, "First");
        var second = await NewProject(client, universe.Id, "Second");

        await Create(client, new IdeaRequest("For the first", null, null, null, null, first.Id));
        await Create(client, new IdeaRequest("For the second", null, null, null, null, second.Id));
        await CreateIdea(client, "For the universe", universeId: universe.Id);
        await CreateIdea(client, "For nothing");

        Assert.Equal(["For the first"], await ListedTitles(client, $"?projectId={first.Id}"));
        Assert.Equal(["For the second"], await ListedTitles(client, $"?projectId={second.Id}"));

        // The universe's list still holds every idea in it, the project ones included, and a row says which project.
        var inUniverse = await ListIdeas(client, $"?universeId={universe.Id}");
        Assert.Equal(3, inUniverse.TotalCount);
        Assert.Equal(first.Id, inUniverse.Items.Single(item => item.Title == "For the first").Project!.Id);
        Assert.Null(inUniverse.Items.Single(item => item.Title == "For the universe").Project);

        // Another account's project lists none of this account's ideas, and its own ideas are never shown here.
        var (stranger, strangerUniverse) = await SignedInWithUniverse(_factory, "ideaprojectlist-other");
        Assert.Empty(await ListedTitles(stranger, $"?projectId={first.Id}"));
        var theirs = await NewProject(stranger, strangerUniverse.Id, "Theirs");
        await Create(stranger, new IdeaRequest("Their note", null, null, null, null, theirs.Id));
        Assert.Empty(await ListedTitles(client, $"?projectId={theirs.Id}"));
    }

    [Fact]
    public async Task A_project_of_another_account_or_a_different_universe_is_refused_and_nothing_is_written()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaprojectrefuse");
        var project = await NewProject(client, universe.Id, "Mine");
        var otherUniverse = await CreateUniverse(client, "Elsewhere");
        var (stranger, strangerUniverse) = await SignedInWithUniverse(_factory, "ideaprojectrefuse-other");
        var theirs = await NewProject(stranger, strangerUniverse.Id, "Theirs");

        var foreign = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Taken", null, null, null, null, theirs.Id));
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);

        var mismatched = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Torn", null, otherUniverse.Id, null, null, project.Id));
        Assert.Equal(HttpStatusCode.BadRequest, mismatched.StatusCode);

        var missing = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Lost", null, null, null, null, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        Assert.Equal(0, (await ListIdeas(client)).TotalCount);

        // And an update cannot move an idea onto a project the account does not own.
        var idea = await CreateIdea(client, "Mine to keep", universeId: universe.Id);
        var moved = await client.PutAsJsonAsync(Idea(idea.Id), new IdeaRequest(idea.Title, idea.Body, null, [], idea.UpdatedAt, theirs.Id));
        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
        Assert.Null((await ReadIdea(client, idea.Id)).Project);
    }

    [Fact]
    public async Task An_idea_with_no_universe_and_no_project_works_as_it_always_has()
    {
        var client = await SignedIn(_factory, "ideaprojectnone");
        var idea = await CreateIdea(client, "Loose", "Nothing yet.");
        Assert.Equal(((IdeaUniverse?)null, (IdeaProject?)null), (idea.Universe, idea.Project));

        var saved = await Save(client, idea, title: "Still loose");
        Assert.Equal(("Still loose", (IdeaProject?)null), (saved.Title, saved.Project));
        Assert.Equal(["Still loose"], await ListedTitles(client, "?unassigned=true"));
    }

    /// <summary>
    /// A project has no delete of its own: it goes only with its universe (#171). So "deleting a project does what deleting
    /// a universe does" is literal here: the idea stays, whole, on no universe and no project, as the universe route has
    /// always left a universe idea.
    /// </summary>
    [Fact]
    public async Task Deleting_the_universe_and_with_it_the_project_keeps_the_idea_released_from_both()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaprojectdelete");
        var project = await NewProject(client, universe.Id, "Gone");
        var idea = await Create(client, new IdeaRequest("Survives", "Still here.", null, null, null, project.Id));
        var universeIdea = await CreateIdea(client, "Also survives", universeId: universe.Id);

        await DeleteUniverse(client, universe.Id);

        foreach (var kept in new[] { await ReadIdea(client, idea.Id), await ReadIdea(client, universeIdea.Id) })
        {
            Assert.Null(kept.Universe);
            Assert.Null(kept.Project);
        }

        Assert.Equal(("Survives", "Still here."), ((await ReadIdea(client, idea.Id)).Title, (await ReadIdea(client, idea.Id)).Body));
    }

    [Fact]
    public async Task A_backup_carries_the_project_link_and_one_written_before_it_still_restores()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaprojectbackup");
        var project = await NewProject(client, universe.Id, "Carried");
        await Create(client, new IdeaRequest("On the project", null, null, null, null, project.Id));
        await CreateIdea(client, "In the universe", universeId: universe.Id);

        var archive = await RawArchive(client, universe.Id);
        Assert.Equal(project.Id, BackupOf(archive).Payload.Ideas!.Single(idea => idea.Title == "On the project").ProjectId);

        // The restored idea is on the restored project, never the original one.
        var restored = await RestoreArchive(client, archive, "Carried restored");
        await WithDb(_factory, async db =>
        {
            var copiedProject = await db.CreativeProjects.AsNoTracking().SingleAsync(each => each.UniverseId == restored.Id);
            var copied = await db.Ideas.AsNoTracking().Where(idea => idea.UniverseId == restored.Id).ToListAsync();
            Assert.Equal(copiedProject.Id, copied.Single(idea => idea.Title == "On the project").ProjectId);
            Assert.Null(copied.Single(idea => idea.Title == "In the universe").ProjectId);
            Assert.NotEqual(project.Id, copiedProject.Id);
        });

        // A version 46 file has no project link, and restores with every idea on no project.
        var older = await RestoreArchive(client, Downgrade(archive, 46), "Carried older");
        await WithDb(_factory, async db =>
        {
            var copied = await db.Ideas.AsNoTracking().Where(idea => idea.UniverseId == older.Id).ToListAsync();
            Assert.Equal(2, copied.Count);
            Assert.All(copied, idea => Assert.Null(idea.ProjectId));
        });
    }

    [Fact]
    public async Task A_backup_naming_a_project_it_does_not_hold_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaprojectbadbackup");
        var project = await NewProject(client, universe.Id, "Held");
        await Create(client, new IdeaRequest("On the project", null, null, null, null, project.Id));

        var archive = Rewrite(await RawArchive(client, universe.Id), root =>
        {
            foreach (var idea in Payload(root)["ideas"]!.AsArray())
            {
                idea!["projectId"] = Guid.NewGuid().ToString();
            }
        });

        var refusal = await Refused(await Validate(client, archive));
        Assert.Contains(refusal.Issues, issue => issue.Message.Contains("project the backup does not hold", StringComparison.Ordinal));
    }

    private static async Task<ProjectDetail> NewProject(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Active, null, null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<IdeaDetail> Create(HttpClient client, IdeaRequest request)
    {
        var response = await client.PostAsJsonAsync(Ideas, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdeaDetail>())!;
    }

    private static async Task<IdeaDetail> Put(HttpClient client, IdeaDetail current, IdeaRequest request)
    {
        var response = await client.PutAsJsonAsync(Idea(current.Id), request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdeaDetail>())!;
    }
}
