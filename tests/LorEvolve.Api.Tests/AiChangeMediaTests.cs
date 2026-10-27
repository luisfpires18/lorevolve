using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Progression;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Phase 4 of issue 59 (ADR 0062): an AI asks for a picture; the person hands the file over on the review page, where it is
/// checked by the upload gate and held in quarantine - previewed only there, counted nowhere, attached to nothing - until
/// approval attaches it through the upload's own commit. A rejected, replaced or abandoned picture leaves nothing behind once
/// the sweep runs; a picture never replaces an entry's existing one.
/// </summary>
public sealed class AiChangeMediaTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private static readonly HttpStatusCode[] Refusals = [HttpStatusCode.Forbidden, HttpStatusCode.NotFound];

    private readonly LorEvolveApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U, Guid Bilbo, Guid Cloak)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(owner, $"World {tag}")).Id;
        var bilbo = await CreateEntity(owner, u, "Bilbo Baggins");
        var cloak = (await PutJson<ProgressionResponse>(owner, $"/api/universes/{u}/entities/{bilbo}/progression", new ProgressionRequest(
            [], 0, Appearances: [new AppearanceInput(null, "Travelling cloak", null, [], [], [])]))).Appearances!.Single().Id;
        return (owner, ownerId, u, bilbo, cloak);
    }

    private static AiChangeOperationInput Picture(string key, Guid entry, Guid? appearance = null) =>
        new(key, "create", "image", Image: new AiImageInput(entry, appearance, "Bilbo in his cloak"));

    private static string Media(Guid u, Guid proposal, Guid operation) => $"{Path(u, proposal)}/operations/{operation}/media";

    private static MultipartFormDataContent File(byte[] bytes, string type, string name)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(file, "file", name);
        return form;
    }

    private async Task<int> Sweep()
    {
        var swept = 0;
        await WithDb(_factory, async db => swept = await AiChangeMediaSweep.SweepAsync(db, _factory.Media, NullLogger.Instance, default));
        return swept;
    }

    [Fact]
    public async Task A_picture_is_handed_over_held_in_quarantine_and_attached_only_by_approval()
    {
        var (owner, ownerId, u, bilbo, cloak) = await World("mediaflow");
        var proposalId = await Staged(_factory, u, ownerId, Picture("pic", bilbo, cloak));
        var proposal = await Read(owner, u, proposalId);
        var change = proposal.Operations.Single();
        Assert.Equal("Add a picture to Bilbo Baggins's appearance Travelling cloak", change.Title);
        Assert.False(change.Media!.Uploaded);
        Assert.Contains(change.Issues, issue => issue.Code == AiChangeCodes.AwaitingUpload);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(await Approve(owner, u, proposal, ["pic"])));

        // Only an image the upload gate accepts.
        var refused = await owner.PutAsync(Media(u, proposalId, change.Id), File("not a picture"u8.ToArray(), "image/png", "fake.png"));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        var uploaded = await owner.PutAsync(Media(u, proposalId, change.Id), CollaborationTestClient.PngForm());
        Assert.True(uploaded.IsSuccessStatusCode, await uploaded.Content.ReadAsStringAsync());
        change = (await Read(owner, u, proposalId)).Operations.Single();
        Assert.True(change.Media!.Uploaded);
        Assert.Equal((640, 480), (change.Media.Width, change.Media.Height));
        Assert.DoesNotContain(change.Issues, issue => issue.Code == AiChangeCodes.AwaitingUpload);

        // Held, not attached and not counted: the appearance has no picture and the owner's storage is unchanged.
        var held = await Held(change.Id);
        Assert.True(_factory.Media.Contains(held.OriginalKey));
        Assert.Empty((await Progression(owner, u, bilbo)).Appearances!.Single().Images);
        var before = await Usage(owner);
        var preview = await owner.GetAsync($"{Media(u, proposalId, change.Id)}/thumbnail");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.True(preview.Headers.CacheControl is { NoStore: true, Private: true });

        // A stranger to the universe can't preview it, and nothing reaches it without the session.
        var (stranger, _) = await PublishingTestClient.Account(_factory, "mediaflow-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{Media(u, proposalId, change.Id)}/thumbnail")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"{Media(u, proposalId, change.Id)}/thumbnail")).StatusCode);

        var receipt = await ApproveAll(owner, u, proposalId);
        var look = (await Progression(owner, u, bilbo)).Appearances!.Single();
        Assert.Equal([receipt.Applied.Single().ResultId!.Value], look.Images.Select(image => image.Id));
        Assert.Equal(before + held.ByteSize, await Usage(owner));
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/universes/{u}/entities/{bilbo}/appearances/{cloak}/images/{look.Images[0].Id}/thumbnail")).StatusCode);

        // Ownership moved to the picture: no quarantine row, and the sweep leaves its objects alone.
        await WithDb(_factory, async db => Assert.False(await db.AiChangeMedia.AnyAsync(row => row.OperationId == change.Id)));
        await Sweep();
        Assert.True(_factory.Media.Contains(held.OriginalKey));
    }

    [Fact]
    public async Task A_profile_picture_is_added_only_to_an_entry_without_one_and_recorded_in_its_history()
    {
        var (owner, ownerId, u, bilbo, _) = await World("mediaprofile");
        var proposalId = await Staged(_factory, u, ownerId, Picture("face", bilbo));
        var operation = (await Read(owner, u, proposalId)).Operations.Single().Id;
        await CollaborationTestClient.Ok(owner.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm()));
        await ApproveAll(owner, u, proposalId);

        var entry = (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{bilbo}"))!;
        Assert.NotNull(entry.Image);
        await WithDb(_factory, async db => Assert.True(await db.EntityRevisions.AnyAsync(revision => revision.EntityId == bilbo && revision.ActorUserId == ownerId)));

        // Now it has one: an AI change never replaces it.
        var again = await Stage(_factory, u, ownerId, Picture("again", bilbo));
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single(again.Issues).Code);
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single((await Stage(_factory, u, ownerId, new AiChangeOperationInput("edit", "update", "image", bilbo, Image: new AiImageInput(bilbo)))).Issues).Code);
    }

    [Fact]
    public async Task A_rejected_or_replaced_picture_leaves_nothing_once_swept()
    {
        var (owner, ownerId, u, bilbo, cloak) = await World("mediasweep");
        var proposalId = await Staged(_factory, u, ownerId, Picture("pic", bilbo, cloak));
        var operation = (await Read(owner, u, proposalId)).Operations.Single().Id;

        await CollaborationTestClient.Ok(owner.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm()));
        var first = await Held(operation);
        await CollaborationTestClient.Ok(owner.PutAsync(Media(u, proposalId, operation), File(PublishingTestClient.Png(320, 320), "image/png", "second.png")));
        var second = await Held(operation);
        Assert.False(_factory.Media.Contains(first.OriginalKey));
        Assert.True(_factory.Media.Contains(second.OriginalKey));

        (await Reject(owner, u, proposalId, null, all: true)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm())).StatusCode);
        Assert.Equal(1, await Sweep());
        Assert.False(_factory.Media.Contains(second.OriginalKey));
        Assert.False(_factory.Media.Contains(second.ThumbnailKey));
        await WithDb(_factory, async db => Assert.False(await db.AiChangeMedia.AnyAsync(row => row.OperationId == operation)));
        Assert.Empty((await Progression(owner, u, bilbo)).Appearances!.Single().Images);
    }

    [Fact]
    public async Task Storage_out_of_room_refuses_the_approval_and_keeps_the_picture_in_quarantine()
    {
        var (owner, ownerId, u, bilbo, cloak) = await World("mediaquota");
        var proposalId = await Staged(_factory, u, ownerId, Picture("pic", bilbo, cloak));
        var operation = (await Read(owner, u, proposalId)).Operations.Single().Id;
        await CollaborationTestClient.Ok(owner.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm()));

        await WithDb(_factory, async db => await db.Users.Where(user => user.Id == ownerId).ExecuteUpdateAsync(set => set.SetProperty(user => user.StorageQuotaBytes, 10)));
        var refused = await Approve(owner, u, await Read(owner, u, proposalId), ["pic"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Empty((await Progression(owner, u, bilbo)).Appearances!.Single().Images);
        Assert.True(_factory.Media.Contains((await Held(operation)).OriginalKey));
        await WithDb(_factory, async db => Assert.False(await db.StorageReservations.AnyAsync(hold => hold.UserId == ownerId)));
    }

    [Fact]
    public async Task Only_a_member_who_could_approve_or_the_person_asked_for_hands_a_picture_over_while_they_still_have_access()
    {
        var (owner, _, u, bilbo, cloak) = await World("mediaaccess");
        var (editor, editorId) = await PublishingTestClient.Account(_factory, "mediaaccess-editor");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        var proposalId = await Staged(_factory, u, editorId, Picture("pic", bilbo, cloak));
        var operation = (await Read(owner, u, proposalId)).Operations.Single().Id;

        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, "mediaaccess-viewer");
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);
        Assert.Contains((await viewer.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm())).StatusCode, Refusals);

        // The Editor removed from the universe can no longer hand it over.
        await WithDb(_factory, async db => await db.UniverseMemberships.Where(membership => membership.UserId == editorId && membership.UniverseId == u).ExecuteDeleteAsync());
        Assert.Contains((await editor.PutAsync(Media(u, proposalId, operation), CollaborationTestClient.PngForm())).StatusCode, Refusals);
        await WithDb(_factory, async db => Assert.False(await db.AiChangeMedia.AnyAsync(row => row.OperationId == operation)));
    }

    private async Task<AiChangeMedia> Held(Guid operation)
    {
        AiChangeMedia? media = null;
        await WithDb(_factory, async db => media = await db.AiChangeMedia.AsNoTracking().SingleAsync(row => row.OperationId == operation));
        return media!;
    }

    private static async Task<ProgressionResponse> Progression(HttpClient client, Guid u, Guid entry) =>
        (await client.GetFromJsonAsync<ProgressionResponse>($"/api/universes/{u}/entities/{entry}/progression"))!;

    private static async Task<long> Usage(HttpClient client) =>
        (await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/profile/storage")).GetProperty("usedBytes").GetInt64();
}
