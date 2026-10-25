using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Account storage (ADR 0042): what counts, whose it is, when an upload is refused, and that a refusal never takes
/// anything away. Allowances are set straight on the account - the trusted server-side path - and sized against the
/// actual pictures, so "exactly full" and "one byte over" are exact rather than approximate.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StorageQuotaTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static readonly byte[] Small = RestoreTestClient.Png(120, 90, seed: 1);
    private static readonly byte[] Medium = RestoreTestClient.Png(240, 180, seed: 2);
    private static readonly byte[] Large = RestoreTestClient.Png(360, 270, seed: 3);

    // ---------- The allowance ----------

    [Fact]
    public async Task A_new_account_has_one_gibibyte_and_uses_nothing()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-new");

        var storage = await Storage(client);

        Assert.Equal(1_073_741_824, storage.QuotaBytes);
        Assert.Equal(StorageQuota.DefaultBytes, storage.QuotaBytes);
        Assert.Equal(0, storage.UsedBytes);
        Assert.Equal(0, storage.LoreImagesBytes);
        Assert.Equal(1_073_741_824, storage.RemainingBytes);
        Assert.Equal(1_073_741_824, await QuotaOf(userId));
    }

    [Fact]
    public async Task Storage_is_read_signed_in_only_and_cannot_be_changed_over_http()
    {
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(StorageRoute)).StatusCode);

        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-readonly");
        var put = await client.PutAsJsonAsync(StorageRoute, new { quotaBytes = long.MaxValue });
        var post = await client.PostAsJsonAsync(StorageRoute, new { quotaBytes = long.MaxValue });

        Assert.Equal(HttpStatusCode.MethodNotAllowed, put.StatusCode);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, post.StatusCode);
        Assert.Equal(StorageQuota.DefaultBytes, await QuotaOf(userId));
    }

    // ---------- What counts ----------

    [Fact]
    public async Task Pictures_in_every_owned_universe_add_up_to_one_account_total()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "sq-sum");
        var first = (await PublishingTestClient.CreateUniverse(client, "Sum one")).Id;
        var second = (await PublishingTestClient.CreateUniverse(client, "Sum two")).Id;

        var a = await Uploaded(client, first, await PlotTestClient.CreateEntity(client, first, "A"), Small);
        var b = await Uploaded(client, first, await PlotTestClient.CreateEntity(client, first, "B"), Medium);
        var c = await Uploaded(client, second, await PlotTestClient.CreateEntity(client, second, "C"), Large);

        var storage = await Storage(client);

        Assert.Equal(a.ByteSize + b.ByteSize + c.ByteSize, storage.UsedBytes);
        Assert.Equal(storage.UsedBytes, storage.LoreImagesBytes);
        Assert.Equal(StorageQuota.DefaultBytes - storage.UsedBytes, storage.RemainingBytes);

        // The original's size, as the server received it: the thumbnail is never part of it.
        Assert.Equal(Small.Length + Medium.Length + Large.Length, storage.UsedBytes);
    }

    [Fact]
    public async Task An_editors_upload_counts_against_the_owner_and_never_the_editor()
    {
        var (alice, aliceId) = await PublishingTestClient.Account(_factory, "sq-alice");
        var (bob, bobId) = await PublishingTestClient.Account(_factory, "sq-bob");
        var u = (await PublishingTestClient.CreateUniverse(alice, "Alice's world")).Id;
        await CollaborationTestClient.Join(_factory, u, bobId, UniverseRole.Editor);
        var entry = await PlotTestClient.CreateEntity(alice, u, "Shared hero");

        // Bob's own universe and picture, so his total is not trivially zero.
        var own = (await PublishingTestClient.CreateUniverse(bob, "Bob's world")).Id;
        var bobsOwn = await Uploaded(bob, own, await PlotTestClient.CreateEntity(bob, own, "Bob's"), Small);

        var uploaded = await Uploaded(bob, u, entry, Medium);

        Assert.Equal(uploaded.ByteSize, (await Storage(alice)).UsedBytes);
        Assert.Equal(bobsOwn.ByteSize, (await Storage(bob)).UsedBytes);

        // Bob replacing it changes Alice's storage, not his.
        var replaced = await Uploaded(bob, u, entry, Large);
        Assert.Equal(replaced.ByteSize, (await Storage(alice)).UsedBytes);
        Assert.Equal(bobsOwn.ByteSize, (await Storage(bob)).UsedBytes);

        // And Bob removing it frees Alice's.
        await CollaborationTestClient.Ok(bob.DeleteAsync(ImageRoute(u, entry)));
        Assert.Equal(0, (await Storage(alice)).UsedBytes);
        Assert.Equal(bobsOwn.ByteSize, (await Storage(bob)).UsedBytes);

        Assert.NotEqual(aliceId, bobId);
    }

    [Fact]
    public async Task The_trash_keeps_counting_and_only_permanent_deletion_frees_the_space()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "sq-trash");
        var u = (await PublishingTestClient.CreateUniverse(client, "Trash world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Doomed");
        var image = await Uploaded(client, u, entry, Medium);

        Assert.Equal(image.ByteSize, (await Storage(client)).UsedBytes);

        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{u}/entities/{entry}"));
        Assert.Equal(image.ByteSize, (await Storage(client)).UsedBytes);

        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{u}/trash/{entry}/restore", null));
        Assert.Equal(image.ByteSize, (await Storage(client)).UsedBytes);

        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{u}/entities/{entry}"));
        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{u}/trash/{entry}"));
        Assert.Equal(0, (await Storage(client)).UsedBytes);
    }

    [Fact]
    public async Task Removing_a_picture_or_deleting_its_universe_frees_the_space()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "sq-free");
        var kept = (await PublishingTestClient.CreateUniverse(client, "Kept world")).Id;
        var gone = (await PublishingTestClient.CreateUniverse(client, "Gone world")).Id;

        var removed = await PlotTestClient.CreateEntity(client, kept, "Removed");
        await Uploaded(client, kept, removed, Small);
        var stays = await Uploaded(client, kept, await PlotTestClient.CreateEntity(client, kept, "Stays"), Medium);
        await Uploaded(client, gone, await PlotTestClient.CreateEntity(client, gone, "Goes"), Large);

        await CollaborationTestClient.Ok(client.DeleteAsync(ImageRoute(kept, removed)));
        Assert.Equal(Medium.Length + Large.Length, (await Storage(client)).UsedBytes);

        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{gone}/archive", null));
        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{gone}"));
        Assert.Equal(stays.ByteSize, (await Storage(client)).UsedBytes);
    }

    [Fact]
    public async Task A_universe_shared_with_the_account_is_not_part_of_its_storage()
    {
        var (owner, _) = await PublishingTestClient.Account(_factory, "sq-shared-owner");
        var (member, memberId) = await PublishingTestClient.Account(_factory, "sq-shared-member");
        var u = (await PublishingTestClient.CreateUniverse(owner, "Shared world")).Id;
        await CollaborationTestClient.Join(_factory, u, memberId, UniverseRole.Editor);
        await Uploaded(owner, u, await PlotTestClient.CreateEntity(owner, u, "Owned"), Large);

        Assert.Equal(0, (await Storage(member)).UsedBytes);
        Assert.Equal(Large.Length, (await Storage(owner)).UsedBytes);
    }

    // ---------- The limit ----------

    [Fact]
    public async Task An_upload_that_exactly_fills_the_allowance_lands_and_one_byte_more_does_not()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-edge");
        var u = (await PublishingTestClient.CreateUniverse(client, "Edge world")).Id;
        await Uploaded(client, u, await PlotTestClient.CreateEntity(client, u, "First"), Large);

        // "Used 90, quota 100, new 10": exactly full.
        await SetQuota(userId, Large.Length + Small.Length);
        var fits = await PlotTestClient.CreateEntity(client, u, "Fits");
        Assert.Equal(HttpStatusCode.OK, (await Upload(client, u, fits, Small)).StatusCode);
        Assert.Equal(0, (await Storage(client)).RemainingBytes);

        // "Used 90, quota 100, new 11": one byte over.
        await SetQuota(userId, Large.Length + Small.Length + Small.Length - 1);
        var over = await PlotTestClient.CreateEntity(client, u, "Over");
        var refused = await Upload(client, u, over, Small);

        await AssertNoRoom(refused, owner: true);
        Assert.False(await HasImage(over));
        Assert.Equal(Large.Length + Small.Length, (await Storage(client)).UsedBytes);
        Assert.Empty(await Holds(userId));
    }

    [Fact]
    public async Task A_replacement_is_judged_by_what_it_adds_not_by_both_pictures_at_once()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-replace");
        var u = (await PublishingTestClient.CreateUniverse(client, "Replace world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Portrait");
        await Uploaded(client, u, entry, Medium);

        // Room for the growth only - nowhere near room for old and new together.
        await SetQuota(userId, Large.Length);
        Assert.True(Medium.Length + Large.Length > Large.Length);
        Assert.Equal(Large.Length, (await Uploaded(client, u, entry, Large)).ByteSize);
        Assert.Equal(Large.Length, (await Storage(client)).UsedBytes);

        // Full now. The same size again and something smaller both still land.
        Assert.Equal(Large.Length, (await Uploaded(client, u, entry, Large)).ByteSize);
        Assert.Equal(Medium.Length, (await Uploaded(client, u, entry, Medium)).ByteSize);

        // Growth past the allowance does not, and the picture the entry had is still its picture.
        await SetQuota(userId, Large.Length - 1);
        var before = await ImageOf(client, u, entry);
        await AssertNoRoom(await Upload(client, u, entry, Large), owner: true);
        Assert.Equal(before.AssetId, (await ImageOf(client, u, entry)).AssetId);
        Assert.Equal(Medium.Length, (await Storage(client)).UsedBytes);
    }

    [Fact]
    public async Task Over_the_allowance_reductions_still_land_and_growth_never_does()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-over");
        var u = (await PublishingTestClient.CreateUniverse(client, "Over world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Heavy");
        var other = await PlotTestClient.CreateEntity(client, u, "Light");
        await Uploaded(client, u, entry, Large);
        await Uploaded(client, u, other, Small);

        // Stored before the allowance shrank: "used 120, quota 100". Nothing is taken away.
        await SetQuota(userId, Small.Length);
        var storage = await Storage(client);
        Assert.Equal(Large.Length + Small.Length, storage.UsedBytes);
        Assert.Equal(0, storage.RemainingBytes);

        // Reading, framing and removing are untouched by it.
        var image = await ImageOf(client, u, entry);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{ImageRoute(u, entry)}/{image.AssetId}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{ImageRoute(u, entry)}/{image.AssetId}/thumbnail/{image.ThumbnailId}")).StatusCode);
        var reframed = await client.PutAsJsonAsync(
            $"{ImageRoute(u, entry)}/thumbnail", new EntityThumbnailRequest(image.AssetId, new EntityImageCrop(0, 0, 0.75, 1)));
        Assert.Equal(HttpStatusCode.OK, reframed.StatusCode);

        // A replacement that shrinks the total lands, while still over.
        Assert.Equal(Medium.Length, (await Uploaded(client, u, entry, Medium)).ByteSize);
        Assert.True((await Storage(client)).UsedBytes > Small.Length);

        // One that grows it by anything does not.
        await AssertNoRoom(await Upload(client, u, other, Medium), owner: true);
        await AssertNoRoom(await Upload(client, u, await PlotTestClient.CreateEntity(client, u, "New"), Small), owner: true);
        Assert.Equal(Medium.Length + Small.Length, (await Storage(client)).UsedBytes);

        // And removing is how the space comes back.
        await CollaborationTestClient.Ok(client.DeleteAsync(ImageRoute(u, entry)));
        Assert.Equal(Small.Length, (await Storage(client)).UsedBytes);
    }

    // ---------- Who is told what ----------

    [Fact]
    public async Task Members_upload_only_by_role_and_a_full_owners_numbers_never_reach_an_editor()
    {
        var world = await SharedWorldWithEntry("sq-roles");

        // Outsider: the universe is not there. Viewer, Reviewer: not theirs to change.
        await CollaborationTestClient.AssertHidden(await Upload(world.Outsider, world.U, world.Entry, Small), "outsider upload");
        await CollaborationTestClient.AssertDenied(await Upload(world.Viewer, world.U, world.Entry, Small), "viewer upload");
        await CollaborationTestClient.AssertDenied(await Upload(world.Reviewer, world.U, world.Entry, Small), "reviewer upload");

        // An Editor may, against the owner's storage.
        var fresh = await PlotTestClient.CreateEntity(world.Owner, world.U, "Editor's pick");
        Assert.Equal(HttpStatusCode.OK, (await Upload(world.Editor, world.U, fresh, Small)).StatusCode);

        // Full: the Editor is told the universe has no room, and nothing about the owner's account.
        var used = (await Storage(world.Owner)).UsedBytes;
        await SetQuota(world.OwnerId, used);
        var refused = await Upload(world.Editor, world.U, await PlotTestClient.CreateEntity(world.Owner, world.U, "Too much"), Medium);
        var body = await AssertNoRoom(refused, owner: false);

        Assert.DoesNotContain(used.ToString(System.Globalization.CultureInfo.InvariantCulture), body, StringComparison.Ordinal);
        Assert.DoesNotContain("1073741824", body, StringComparison.Ordinal);
        using (var problem = JsonDocument.Parse(body))
        {
            Assert.Equal(
                ["code", "detail", "status", "title", "type"],
                problem.RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());
        }

        // The owner, uploading the same, is told it is their storage.
        await AssertNoRoom(await Upload(world.Owner, world.U, await PlotTestClient.CreateEntity(world.Owner, world.U, "Mine"), Medium), owner: true);

        // And the Editor's own storage says nothing of the owner's.
        Assert.Equal(0, (await Storage(world.Editor)).UsedBytes);
    }

    // ---------- Holds ----------

    [Fact]
    public async Task A_store_that_fails_gives_the_room_back()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-storefail");
        var u = (await PublishingTestClient.CreateUniverse(client, "Store fail")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Unlucky");
        await SetQuota(userId, Medium.Length);

        _factory.Media.FailPut = key => key.Contains(entry.ToString("D"), StringComparison.Ordinal)
            ? new Lorex.Api.Features.Media.MediaStorageFailedException("Image storage could not complete the request.", new InvalidOperationException("synthetic"))
            : null;
        try
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Upload(client, u, entry, Medium)).StatusCode);
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        Assert.Empty(await Holds(userId));
        Assert.Equal(0, (await Storage(client)).UsedBytes);

        // The whole allowance is still there to use.
        Assert.Equal(HttpStatusCode.OK, (await Upload(client, u, entry, Medium)).StatusCode);
        Assert.Empty(await Holds(userId));
    }

    [Fact]
    public async Task A_database_failure_at_the_commit_gives_the_room_back()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-dbfail");
        var u = (await PublishingTestClient.CreateUniverse(client, "Database fail")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Unlucky");
        await SetQuota(userId, Medium.Length);
        var marker = entry.ToString().ToUpperInvariant();

        _factory.Commands.FailWhen = command => command.CommandText.Contains("INSERT INTO \"EntityImages\"", StringComparison.Ordinal)
            && command.Parameters.Cast<System.Data.Common.DbParameter>().Any(parameter =>
                string.Equals(parameter.Value?.ToString(), marker, StringComparison.OrdinalIgnoreCase));
        try
        {
            // The test host hands the server's own exception back rather than a 500.
            await Assert.ThrowsAsync<DbUpdateException>(() => Upload(client, u, entry, Medium));
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }
        Assert.Empty(await Holds(userId));
        Assert.False(await HasImage(entry));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal));

        Assert.Equal(HttpStatusCode.OK, (await Upload(client, u, entry, Medium)).StatusCode);
    }

    [Fact]
    public async Task Live_holds_count_lapsed_ones_and_other_accounts_do_not()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-holds");
        var (_, strangerId) = await PublishingTestClient.Account(_factory, "sq-holds-stranger");
        var u = (await PublishingTestClient.CreateUniverse(client, "Holds world")).Id;
        await SetQuota(userId, Medium.Length);

        var now = _factory.Clock.GetUtcNow().UtcDateTime;
        await Hold(userId, Medium.Length, expiresAt: now.AddSeconds(-1));
        await Hold(strangerId, Medium.Length, expiresAt: now.AddMinutes(10));

        // A lapsed hold of this account and a live one of another's leave the whole allowance free.
        var first = await PlotTestClient.CreateEntity(client, u, "First");
        Assert.Equal(HttpStatusCode.OK, (await Upload(client, u, first, Medium)).StatusCode);

        // Its own lapsed hold was cleared on the way; the stranger's is untouched.
        Assert.Empty(await Holds(userId));
        Assert.Single(await Holds(strangerId));

        // A live hold of this account does count.
        await SetQuota(userId, Medium.Length + Small.Length);
        await Hold(userId, 1, expiresAt: now.AddMinutes(10));
        await AssertNoRoom(await Upload(client, u, await PlotTestClient.CreateEntity(client, u, "Second"), Small), owner: true);
    }

    [Fact]
    public async Task A_replacement_holds_only_its_growth_and_a_landed_upload_holds_nothing()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-growth");
        var u = (await PublishingTestClient.CreateUniverse(client, "Growth world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Growing");
        await Uploaded(client, u, entry, Small);

        var seen = new List<long>();
        _factory.Media.BeforePut = async key =>
        {
            if (key.Contains(entry.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                seen.AddRange((await Holds(userId)).Select(hold => hold.Bytes));
            }
        };
        try
        {
            await Uploaded(client, u, entry, Large);
            await Uploaded(client, u, entry, Medium);
        }
        finally
        {
            _factory.Media.BeforePut = null;
        }

        // While the larger picture was on its way only the difference was held; the smaller one held nothing.
        Assert.Equal([(long)(Large.Length - Small.Length)], seen);
        Assert.Empty(await Holds(userId));
    }

    [Fact]
    public async Task A_hold_that_lapses_mid_upload_is_checked_again_at_the_commit()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-lapse");
        var u = (await PublishingTestClient.CreateUniverse(client, "Lapse world")).Id;
        var slow = await PlotTestClient.CreateEntity(client, u, "Slow");
        var squeezed = await PlotTestClient.CreateEntity(client, u, "Squeezed");
        await SetQuota(userId, Medium.Length + Small.Length);

        // The upload stalls past its hold's lifetime, and meanwhile the room goes to something else.
        _factory.Media.BeforePut = async key =>
        {
            if (key.Contains(slow.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                _factory.Clock.Offset += StorageQuota.ReservationLifetime + TimeSpan.FromSeconds(1);
                await Placed(squeezed, Small.Length + 1);
            }
        };
        HttpResponseMessage late;
        try
        {
            late = await Upload(client, u, slow, Medium);
        }
        finally
        {
            _factory.Media.BeforePut = null;
            _factory.Clock.Offset = TimeSpan.Zero;
        }

        await AssertNoRoom(late, owner: true);
        Assert.False(await HasImage(slow));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(slow.ToString("D"), StringComparison.Ordinal));
        Assert.Empty(await Holds(userId));
        Assert.Equal(Small.Length + 1, (await Storage(client)).UsedBytes);
    }

    [Fact]
    public async Task A_replacement_that_raced_another_change_loses_and_holds_nothing()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-raced");
        var u = (await PublishingTestClient.CreateUniverse(client, "Raced world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Contested");
        var first = await Uploaded(client, u, entry, Small);

        // While the larger replacement is on its way, the picture it was measured against is removed.
        _factory.Media.BeforePut = async key =>
        {
            if (key.Contains(entry.ToString("D"), StringComparison.Ordinal)
                && key.Contains("original", StringComparison.Ordinal)
                && !key.Contains(first.AssetId.ToString("D"), StringComparison.Ordinal))
            {
                await using var scope = _factory.Services.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
                await db.EntityImages.Where(image => image.EntityId == entry).ExecuteDeleteAsync();
            }
        };
        HttpResponseMessage raced;
        try
        {
            raced = await Upload(client, u, entry, Large);
        }
        finally
        {
            _factory.Media.BeforePut = null;
        }

        Assert.Equal(HttpStatusCode.Conflict, raced.StatusCode);
        using (var problem = JsonDocument.Parse(await raced.Content.ReadAsStringAsync()))
        {
            Assert.Equal(EntityImageEndpoints.ImageChangedCode, problem.RootElement.GetProperty("code").GetString());
        }

        Assert.False(await HasImage(entry));
        Assert.Empty(await Holds(userId));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal)
            && !key.Contains(first.AssetId.ToString("D"), StringComparison.Ordinal));
        Assert.Equal(0, (await Storage(client)).UsedBytes);
    }

    // ---------- Deleting a universe ----------

    [Fact]
    public async Task Deleting_a_universe_sweeps_its_pictures_and_artwork_and_frees_their_space()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "sq-delete");
        var (stranger, _) = await PublishingTestClient.Account(_factory, "sq-delete-stranger");
        var gone = (await PublishingTestClient.CreateUniverse(client, "Deleted world")).Id;
        var kept = (await PublishingTestClient.CreateUniverse(client, "Kept world")).Id;
        var theirs = (await PublishingTestClient.CreateUniverse(stranger, "Their world")).Id;

        var first = await PlotTestClient.CreateEntity(client, gone, "First");
        var second = await PlotTestClient.CreateEntity(client, gone, "Second");
        var binned = await PlotTestClient.CreateEntity(client, gone, "Binned");
        await Uploaded(client, gone, first, Small);
        await Uploaded(client, gone, second, Medium);
        await Uploaded(client, gone, binned, Large);
        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{gone}/entities/{binned}"));
        await PublishingTestClient.UploadedArtwork(client, gone, RestoreTestClient.Png(1600, 1000, seed: 4));

        var stays = await Uploaded(client, kept, await PlotTestClient.CreateEntity(client, kept, "Stays"), Medium);
        await PublishingTestClient.UploadedArtwork(client, kept, RestoreTestClient.Png(1600, 1000, seed: 5));
        await Uploaded(stranger, theirs, await PlotTestClient.CreateEntity(stranger, theirs, "Theirs"), Small);

        var doomed = await StoredKeys(gone);
        var unrelated = (await StoredKeys(kept)).Concat(await StoredKeys(theirs)).ToList();
        Assert.Equal(8, doomed.Count);
        Assert.All(doomed.Concat(unrelated), key => Assert.True(_factory.Media.Contains(key), key));
        Assert.Equal(Small.Length + Medium.Length + Large.Length + stays.ByteSize, (await Storage(client)).UsedBytes);

        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{gone}/archive", null));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{gone}")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{gone}")).StatusCode);
        Assert.False(await HasImage(first));
        Assert.False(await HasImage(second));
        Assert.False(await HasImage(binned));
        Assert.Empty(await StoredKeys(gone));
        Assert.Equal(stays.ByteSize, (await Storage(client)).UsedBytes);

        Assert.All(doomed, key => Assert.False(_factory.Media.Contains(key), key));
        Assert.All(unrelated, key => Assert.True(_factory.Media.Contains(key), key));
    }

    [Fact]
    public async Task Space_freed_by_deleting_a_universe_can_be_used_again_and_its_objects_are_gone()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-reuse");
        var old = (await PublishingTestClient.CreateUniverse(client, "Old world")).Id;
        await Uploaded(client, old, await PlotTestClient.CreateEntity(client, old, "A"), Medium);
        await Uploaded(client, old, await PlotTestClient.CreateEntity(client, old, "B"), Large);
        await SetQuota(userId, Medium.Length + Large.Length);

        var replacement = (await PublishingTestClient.CreateUniverse(client, "New world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, replacement, "C");
        await AssertNoRoom(await Upload(client, replacement, entry, Large), owner: true);

        var oldKeys = await StoredKeys(old);
        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{old}/archive", null));
        await CollaborationTestClient.Ok(client.DeleteAsync($"/api/universes/{old}"));

        Assert.Equal(0, (await Storage(client)).UsedBytes);
        Assert.All(oldKeys, key => Assert.False(_factory.Media.Contains(key), key));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(old.ToString("D"), StringComparison.Ordinal));

        Assert.Equal(Large.Length, (await Uploaded(client, replacement, entry, Large)).ByteSize);
        Assert.Equal(Large.Length, (await Storage(client)).UsedBytes);
    }

    [Fact]
    public async Task A_sweep_that_fails_after_the_delete_leaves_the_universe_deleted_and_the_space_free()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "sq-sweepfail");
        var gone = (await PublishingTestClient.CreateUniverse(client, "Litter world")).Id;
        var kept = (await PublishingTestClient.CreateUniverse(client, "Clean world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, gone, "Litter");
        await Uploaded(client, gone, entry, Medium);
        await PublishingTestClient.UploadedArtwork(client, gone, RestoreTestClient.Png(1600, 1000, seed: 6));
        var stays = await Uploaded(client, kept, await PlotTestClient.CreateEntity(client, kept, "Clean"), Small);
        var doomed = await StoredKeys(gone);
        var unrelated = await StoredKeys(kept);
        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{gone}/archive", null));

        _factory.Media.FailDelete = key => key.Contains(gone.ToString("D"), StringComparison.Ordinal)
            ? new Lorex.Api.Features.Media.MediaStorageFailedException("Image storage could not complete the request.", new InvalidOperationException("synthetic"))
            : null;
        HttpResponseMessage deleted;
        try
        {
            deleted = await client.DeleteAsync($"/api/universes/{gone}");
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        // The delete stands: the bucket failing afterwards is litter, logged, never a reason to bring the universe back.
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{gone}")).StatusCode);
        Assert.False(await HasImage(entry));
        Assert.Empty(await StoredKeys(gone));

        // And it is not the author's: nothing names it, so nothing counts it.
        Assert.Equal(stays.ByteSize, (await Storage(client)).UsedBytes);
        Assert.All(doomed, key => Assert.True(_factory.Media.Contains(key), key));
        Assert.All(unrelated, key => Assert.True(_factory.Media.Contains(key), key));

        foreach (var key in doomed)
        {
            _factory.Media.Evict(key);
        }
    }

    [Fact]
    public async Task An_upload_racing_its_universes_deletion_attaches_nothing_and_cleans_up_after_itself()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-deleterace");
        var u = (await PublishingTestClient.CreateUniverse(client, "Vanishing world")).Id;
        var committed = await PlotTestClient.CreateEntity(client, u, "Committed");
        var racing = await PlotTestClient.CreateEntity(client, u, "Racing");
        await Uploaded(client, u, committed, Small);
        var committedKeys = await StoredKeys(u);
        await CollaborationTestClient.Ok(client.PostAsync($"/api/universes/{u}/archive", null));

        // The universe is deleted while the racing upload's bytes are in the bucket and nothing names them yet.
        HttpStatusCode deletion = default;
        _factory.Media.BeforePut = async key =>
        {
            if (key.Contains(racing.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                deletion = (await client.DeleteAsync($"/api/universes/{u}")).StatusCode;
            }
        };
        HttpResponseMessage late;
        try
        {
            late = await Upload(client, u, racing, Medium);
        }
        finally
        {
            _factory.Media.BeforePut = null;
        }

        Assert.Equal(HttpStatusCode.NoContent, deletion);
        Assert.Equal(HttpStatusCode.NotFound, late.StatusCode);
        Assert.False(await HasImage(racing));
        Assert.Empty(await Holds(userId));
        Assert.Equal(0, (await Storage(client)).UsedBytes);

        // The delete swept what had been committed; the upload swept what it had written itself.
        Assert.All(committedKeys, key => Assert.False(_factory.Media.Contains(key), key));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(u.ToString("D"), StringComparison.Ordinal));
    }

    // ---------- Restore ----------

    [Fact]
    public async Task A_restore_brings_its_pictures_into_the_restorers_storage_only_if_they_fit()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-restore");
        var u = (await PublishingTestClient.CreateUniverse(client, "Restore source")).Id;
        await Uploaded(client, u, await PlotTestClient.CreateEntity(client, u, "Pictured"), Medium);
        await Uploaded(client, u, await PlotTestClient.CreateEntity(client, u, "Also pictured"), Small);
        var archive = await (await client.GetAsync($"/api/universes/{u}/export")).Content.ReadAsByteArrayAsync();
        var used = Medium.Length + Small.Length;

        // The backup carries no account storage of any kind.
        var document = RestoreTestClient.DocumentOf(archive);
        Assert.DoesNotContain("quota", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("reservation", document, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(Lorex.Api.Features.Export.UniverseBackup.CurrentVersion, RestoreTestClient.BackupOf(archive).FormatVersion);

        // One byte short of room for both pictures again: refused, nothing made, the upload still waiting.
        await SetQuota(userId, used + used - 1);
        var token = (await RestoreTestClient.Validated(client, archive)).Token;
        await AssertNoRoom(await RestoreTestClient.Restore(client, token, "Restored copy"), owner: true, restore: true);
        Assert.Single(await RestoreTestClient.Universes(client));
        Assert.Equal(used, (await Storage(client)).UsedBytes);
        Assert.Empty(await Holds(userId));

        // Exactly enough: restored, and its pictures count.
        await SetQuota(userId, used + used);
        await RestoreTestClient.Restored(client, token, "Restored copy");
        Assert.Equal(used + used, (await Storage(client)).UsedBytes);
        Assert.Empty(await Holds(userId));
    }

    // ---------- Cost ----------

    [Fact]
    public async Task Reading_storage_is_one_query_at_any_size()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "sq-cost");

        var empty = await CountedStorage(client, userId);

        var first = (await PublishingTestClient.CreateUniverse(client, "Cost one")).Id;
        await Uploaded(client, first, await PlotTestClient.CreateEntity(client, first, "Only"), Small);
        var one = await CountedStorage(client, userId);

        var universes = new List<Guid> { first };
        for (var index = 0; index < 4; index++)
        {
            universes.Add((await PublishingTestClient.CreateUniverse(client, $"Cost more {index}")).Id);
        }

        for (var index = 1; index < 50; index++)
        {
            var target = universes[index % universes.Count];
            await Uploaded(client, target, await PlotTestClient.CreateEntity(client, target, $"Many {index}"), Small);
        }

        var fifty = await CountedStorage(client, userId);

        Assert.Equal(50L * Small.Length, (await Storage(client)).UsedBytes);
        Assert.Equal(1, empty);
        Assert.Equal(1, one);
        Assert.Equal(1, fifty);
    }

    // ---------- Helpers ----------

    private const string StorageRoute = "/api/profile/storage";

    private static string ImageRoute(Guid universeId, Guid entityId) => $"/api/universes/{universeId}/entities/{entityId}/image";

    private static async Task<AccountStorageResponse> Storage(HttpClient client)
    {
        var response = await client.GetAsync(StorageRoute);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<AccountStorageResponse>())!;
    }

    private static async Task<int> CountedStorage(HttpClient client, string userId)
    {
        using var counter = new CommandCounter([userId]);
        await Storage(client);
        return counter.Count;
    }

    private static async Task<HttpResponseMessage> Upload(HttpClient client, Guid universeId, Guid entityId, byte[] bytes)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        return await client.PutAsync(ImageRoute(universeId, entityId), form);
    }

    private static async Task<EntityImageRef> Uploaded(HttpClient client, Guid universeId, Guid entityId, byte[] bytes)
    {
        var response = await Upload(client, universeId, entityId, bytes);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    private static async Task<EntityImageRef> ImageOf(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!.Image!;

    /// <summary>The refusal, whoever is told it. Returns the body for what a test must not find in it.</summary>
    private static async Task<string> AssertNoRoom(HttpResponseMessage response, bool owner, bool restore = false)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Conflict, $"expected 409, got {(int)response.StatusCode} {body}");

        using var problem = JsonDocument.Parse(body);
        Assert.Equal(StorageQuota.ExceededCode, problem.RootElement.GetProperty("code").GetString());

        var detail = problem.RootElement.GetProperty("detail").GetString()!;
        Assert.Contains(owner ? "your storage" : "this universe's storage", detail, StringComparison.Ordinal);
        Assert.DoesNotContain(" — ", detail, StringComparison.Ordinal);
        if (restore)
        {
            Assert.Contains("backup", detail, StringComparison.Ordinal);
        }

        return body;
    }

    private async Task<SharedWorldEntry> SharedWorldWithEntry(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, $"{tag}-owner");
        var (editor, editorId) = await PublishingTestClient.Account(_factory, $"{tag}-editor");
        var (reviewer, reviewerId) = await PublishingTestClient.Account(_factory, $"{tag}-reviewer");
        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, $"{tag}-viewer");
        var (outsider, _) = await PublishingTestClient.Account(_factory, $"{tag}-outsider");
        var u = (await PublishingTestClient.CreateUniverse(owner, $"Shared {tag}")).Id;
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);
        var entry = await PlotTestClient.CreateEntity(owner, u, "Contested");
        return new SharedWorldEntry(u, entry, owner, ownerId, editor, reviewer, viewer, outsider);
    }

    private sealed record SharedWorldEntry(
        Guid U, Guid Entry, HttpClient Owner, string OwnerId, HttpClient Editor, HttpClient Reviewer, HttpClient Viewer, HttpClient Outsider);

    // ---------- The database, as only the server may touch it ----------

    private async Task SetQuota(string userId, long bytes)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        await db.Users.Where(user => user.Id == userId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.StorageQuotaBytes, bytes));
    }

    private async Task<long> QuotaOf(string userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await db.Users.Where(user => user.Id == userId).Select(user => user.StorageQuotaBytes).SingleAsync();
    }

    private async Task<List<StorageReservation>> Holds(string userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await db.StorageReservations.AsNoTracking().Where(hold => hold.UserId == userId).ToListAsync();
    }

    private async Task Hold(string userId, long bytes, DateTime expiresAt)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        db.StorageReservations.Add(new StorageReservation
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Bytes = bytes,
            CreatedAt = expiresAt.AddMinutes(-15),
            ExpiresAt = expiresAt,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Every object key a universe's rows name: its entries' pictures, Trash included, and its artwork.</summary>
    private async Task<List<string>> StoredKeys(Guid universeId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var pictures = await db.EntityImages.AsNoTracking()
            .Where(image => image.Entity!.UniverseId == universeId)
            .Select(image => new[] { image.OriginalKey, image.ThumbnailKey })
            .ToListAsync();
        var artwork = await db.UniverseArtworks.AsNoTracking()
            .Where(row => row.UniverseId == universeId)
            .Select(row => new[] { row.OriginalKey, row.CardKey })
            .ToListAsync();
        return [.. pictures.Concat(artwork).SelectMany(keys => keys)];
    }

    private async Task<bool> HasImage(Guid entityId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return await db.EntityImages.AsNoTracking().AnyAsync(image => image.EntityId == entityId);
    }

    /// <summary>A picture row of a chosen size, as if another upload had just committed - the room going elsewhere.</summary>
    private async Task Placed(Guid entityId, long bytes)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        db.EntityImages.Add(new EntityImage
        {
            EntityId = entityId,
            AssetId = Guid.NewGuid(),
            OriginalKey = $"elsewhere/{entityId:D}/original.png",
            ThumbnailId = Guid.NewGuid(),
            ThumbnailKey = $"elsewhere/{entityId:D}/thumbnail.webp",
            ContentType = "image/png",
            Width = 1,
            Height = 1,
            ByteSize = bytes,
            UploadedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }
}
