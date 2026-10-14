using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// One private universe and the five people the collaboration rules are about (ADR 0041): its owner, an Editor, a
/// Reviewer, a Viewer - each a member through a row written straight to the database, because no route creates one
/// yet - and an outsider with no access at all. The universe holds something of every family, live and in the Trash.
///
/// Credentials are obviously synthetic.
/// </summary>
internal sealed record SharedWorld(
    LorexApiFactory Factory,
    Guid U,
    HttpClient Owner,
    HttpClient Editor,
    HttpClient Reviewer,
    HttpClient Viewer,
    HttpClient Outsider,
    string OwnerId,
    string EditorId,
    string ReviewerId,
    string ViewerId,
    string OutsiderId,
    Guid CharacterType,
    Guid Entry,
    Guid Other,
    EntityImageRef Image,
    Guid EntryRevision,
    Guid ArticleRevision,
    Guid Kind,
    Guid Relationship,
    Guid Moment,
    Guid Rule,
    Guid Term,
    Guid Story,
    Guid Chapter,
    Guid Scene,
    Guid ManuscriptRevision,
    Guid Arc,
    Guid Beat,
    Trashed Trash)
{
    public HttpClient Client(Who who) => who switch
    {
        Who.Owner => Owner,
        Who.Editor => Editor,
        Who.Reviewer => Reviewer,
        Who.Viewer => Viewer,
        _ => Outsider,
    };
}

/// <summary>One thing of every kind the Trash holds, put there by the owner.</summary>
internal sealed record Trashed(Guid Entry, Guid Story, Guid Chapter, Guid Scene, Guid Arc, Guid Beat, Guid Rule);

internal enum Who
{
    Owner,
    Editor,
    Reviewer,
    Viewer,
    Outsider,
}

internal static class CollaborationTestClient
{
    public static readonly Who[] Members = [Who.Owner, Who.Editor, Who.Reviewer, Who.Viewer];

    public static async Task<SharedWorld> NewSharedWorld(LorexApiFactory factory, string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(factory, $"{tag}-owner");
        var (editor, editorId) = await PublishingTestClient.Account(factory, $"{tag}-editor");
        var (reviewer, reviewerId) = await PublishingTestClient.Account(factory, $"{tag}-reviewer");
        var (viewer, viewerId) = await PublishingTestClient.Account(factory, $"{tag}-viewer");
        var (outsider, outsiderId) = await PublishingTestClient.Account(factory, $"{tag}-outsider");

        var u = (await CreateUniverse(owner, $"Shared {tag}")).Id;
        await Join(factory, u, editorId, UniverseRole.Editor);
        await Join(factory, u, reviewerId, UniverseRole.Reviewer);
        await Join(factory, u, viewerId, UniverseRole.Viewer);

        var types = (await owner.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;
        var entry = await CreateEntity(owner, u, "Ember Vale");
        var other = await CreateEntity(owner, u, "Ash Vale");

        // A second version of the entry, so it has history to read and restore.
        (await owner.PutVersionedAsync(
            $"/api/universes/{u}/entities/{entry}",
            new EntityRequest(character, "Ember Vale", "The heir.", CanonStatus.Canon, null, null, null))).EnsureSuccessStatusCode();
        var entryRevision = (await owner.GetFromJsonAsync<List<EntityRevisionSummary>>($"/api/universes/{u}/entities/{entry}/revisions"))!
            .Last().Id;

        await WriteArticle(owner, u, entry, Doc("First words."));
        await WriteArticle(owner, u, entry, Doc("Second words."));
        var articleRevision = (await ArticleRevisions(owner, u, entry)).Last().Id;

        var image = await UploadImage(owner, u, entry);

        var kind = await PostJson<RelationshipTypeResponse>(
            owner, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest("Sworn to", null, true, null, null));
        var relationship = await PostJson<RelationshipDetail>(
            owner,
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(kind.Id, entry, other, CanonStatus.Canon, null, null, null));
        var moment = await RuleValidationTestClient.CreateMoment(owner, u, RuleValidationTestClient.Moment("The flood", null));
        var rule = await WorldRuleTestClient.CreateRule(owner, u, "Tides keep count");
        var term = await RuleValidationTestClient.EventKind(owner, u, "Coronation");

        var story = await CreateStory(owner, u, "The drowned heir");
        var chapter = await CreateChapter(owner, u, story, "Low water");
        var scene = await CreateScene(owner, u, story, "The causeway", chapter);
        await WriteManuscript(owner, u, story, scene, "She walked.");
        await WriteManuscript(owner, u, story, scene, "She ran.");
        var manuscriptRevision = (await owner.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
            $"{Manuscript(u, story, scene)}/revisions"))!.Last().Id;
        var arc = await CreateArc(owner, u, story, "Inheritance");
        var beat = await CreateBeat(owner, u, story, arc.Id, "The will is read");

        var trash = await FillTrash(owner, u);

        return new SharedWorld(
            factory, u, owner, editor, reviewer, viewer, outsider, ownerId, editorId, reviewerId, viewerId, outsiderId,
            character, entry, other, image, entryRevision, articleRevision, kind.Id, relationship.Id, moment.Id, rule.Id,
            term.Id, story, chapter, scene, manuscriptRevision, arc.Id, beat.Id, trash);
    }

    /// <summary>A membership written straight to the database: the only way one is made until invitations exist.</summary>
    public static async Task Join(LorexApiFactory factory, Guid universeId, string userId, UniverseRole role)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var now = DateTime.UtcNow;
        db.UniverseMemberships.Add(new UniverseMembership
        {
            UniverseId = universeId,
            UserId = userId,
            Role = role,
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>One of every kind the Trash holds, each in its own story so restoring one never waits on another.</summary>
    public static async Task<Trashed> FillTrash(HttpClient client, Guid u)
    {
        var entry = await CreateEntity(client, u, $"Lost {Guid.NewGuid():n}");
        await Ok(client.DeleteAsync($"/api/universes/{u}/entities/{entry}"));

        var story = await CreateStory(client, u, "Abandoned draft");
        await Ok(client.DeleteAsync(Story(u, story)));

        var holder = await CreateStory(client, u, "Holder");
        var chapter = await CreateChapter(client, u, holder, "Cut chapter");
        await Ok(client.DeleteAsync($"{Story(u, holder)}/chapters/{chapter}"));
        var scene = await CreateScene(client, u, holder, "Cut scene");
        await Ok(client.DeleteAsync($"{Story(u, holder)}/scenes/{scene}"));
        var arc = await CreateArc(client, u, holder, "Cut arc");
        await Ok(client.DeleteAsync(Arc(u, holder, arc.Id)));
        var keptArc = await CreateArc(client, u, holder, "Kept arc");
        var beat = await CreateBeat(client, u, holder, keptArc.Id, "Cut beat");
        await Ok(client.DeleteAsync(Beat(u, holder, beat.Id)));

        var rule = await WorldRuleTestClient.CreateRule(client, u, $"Forgotten rule {Guid.NewGuid():n}");
        await Ok(client.DeleteAsync(WorldRuleTestClient.Rule(u, rule.Id)));

        return new Trashed(entry, story, chapter, scene, arc.Id, beat.Id, rule.Id);
    }

    public static async Task<EntityImageRef> UploadImage(HttpClient client, Guid u, Guid entityId)
    {
        var response = await client.PutAsync($"/api/universes/{u}/entities/{entityId}/image", PngForm());
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    public static MultipartFormDataContent PngForm()
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(PublishingTestClient.Png(640, 480));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        return form;
    }

    public static async Task Ok(Task<HttpResponseMessage> sending)
    {
        var response = await sending;
        Assert.True(response.IsSuccessStatusCode, $"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri} answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
    }

    /// <summary>The single refusal a member gets for something their role does not allow.</summary>
    public static async Task AssertDenied(HttpResponseMessage response, string what)
    {
        Assert.True(
            response.StatusCode == HttpStatusCode.Forbidden,
            $"{what}: expected 403, got {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        Assert.Equal(UniverseAccess.PermissionDeniedCode, await PublishingTestClient.ProblemCode(response));
    }

    public static async Task AssertHidden(HttpResponseMessage response, string what) =>
        Assert.True(
            response.StatusCode == HttpStatusCode.NotFound,
            $"{what}: expected 404, got {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
}
