using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The artwork's current card rides on the universe itself - its list row and its detail - so a card and the
/// workspace draw it without asking for it afterwards. Two ids and nothing else, to the owner alone: a collaborator's
/// role cannot read the artwork (ADR 0041), so for them it is null exactly as it is for a universe without one. And it
/// costs the list and the read no query of its own.
/// </summary>
public sealed class UniverseArtworkIdentityTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_owner_reads_the_current_card_on_the_list_and_the_detail_and_null_without_artwork()
    {
        var (owner, _) = await Account(_factory, "ident-owner");
        var created = await CreateUniverse(owner, "Ident with art");
        var bare = await CreateUniverse(owner, "Ident without art");

        // A new universe has nothing to show yet.
        Assert.Null(created.Artwork);

        var stored = await UploadedArtwork(owner, created.Id, Png(1600, 1000));
        var expected = new UniverseArtworkIdentity(stored.AssetId, stored.CardId);

        var page = await List(owner);
        Assert.Equal(expected, page.Items.Single(item => item.Id == created.Id).Artwork);
        Assert.Null(page.Items.Single(item => item.Id == bare.Id).Artwork);

        Assert.Equal(expected, (await Detail(owner, created.Id)).Artwork);
        Assert.Null((await Detail(owner, bare.Id)).Artwork);

        // Ids, and nothing the artwork's own record holds besides them: no key, no file, no frame.
        var row = await owner.GetStringAsync($"/api/universes/{created.Id}");
        foreach (var absent in new[] { "originalKey", "cardKey", "fileName", "crop", "byteSize", "uploadedAt", "width", "universes/" })
        {
            Assert.DoesNotContain(absent, row, StringComparison.OrdinalIgnoreCase);
        }

        // The ids address the owner's own card.
        var card = await owner.GetAsync($"/api/universes/{created.Id}/artwork/{expected.AssetId}/card/{expected.CardId}");
        Assert.Equal(HttpStatusCode.OK, card.StatusCode);
    }

    [Fact]
    public async Task A_collaborator_of_any_role_is_never_given_the_artwork_and_an_outsider_still_finds_nothing()
    {
        var (owner, _) = await Account(_factory, "ident-share-owner");
        var (editor, editorId) = await Account(_factory, "ident-share-editor");
        var (reviewer, reviewerId) = await Account(_factory, "ident-share-reviewer");
        var (viewer, viewerId) = await Account(_factory, "ident-share-viewer");
        var (outsider, _) = await Account(_factory, "ident-share-outsider");

        var universe = await CreateUniverse(owner, "Ident shared");
        var stored = await UploadedArtwork(owner, universe.Id, Png(1600, 1000));
        await Join(_factory, universe.Id, editorId, UniverseRole.Editor);
        await Join(_factory, universe.Id, reviewerId, UniverseRole.Reviewer);
        await Join(_factory, universe.Id, viewerId, UniverseRole.Viewer);

        Assert.Equal(new UniverseArtworkIdentity(stored.AssetId, stored.CardId), (await Detail(owner, universe.Id)).Artwork);

        foreach (var (client, role) in new[] { (editor, UniverseRole.Editor), (reviewer, UniverseRole.Reviewer), (viewer, UniverseRole.Viewer) })
        {
            var listed = (await List(client)).Items.Single(item => item.Id == universe.Id);
            Assert.Equal(role, listed.AccessRole);
            Assert.Null(listed.Artwork);

            var detail = await Detail(client, universe.Id);
            Assert.Equal(role, detail.AccessRole);
            Assert.Null(detail.Artwork);

            // Not hidden by the client: the ids are not in what the API sent at all.
            foreach (var body in new[] { await client.GetStringAsync("/api/universes"), await client.GetStringAsync($"/api/universes/{universe.Id}") })
            {
                Assert.DoesNotContain(stored.AssetId.ToString(), body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(stored.CardId.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        }

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/universes/{universe.Id}")).StatusCode);
        Assert.DoesNotContain((await List(outsider)).Items, item => item.Id == universe.Id);
    }

    [Fact]
    public async Task The_query_itself_returns_no_artwork_row_for_a_universe_the_caller_does_not_own()
    {
        var (owner, ownerId) = await Account(_factory, "ident-sql-owner");
        var (_, editorId) = await Account(_factory, "ident-sql-editor");
        var universe = await CreateUniverse(owner, "Ident sql");
        await UploadedArtwork(owner, universe.Id, Png(320, 200));
        await Join(_factory, universe.Id, editorId, UniverseRole.Editor);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var one = db.Universes.AsNoTracking().Where(candidate => candidate.Id == universe.Id);

        // What the list and the read are built on, run as they run it. The artwork row is materialized straight from the
        // query's columns - nothing filters it afterwards - so a null here is the database returning no ids for a
        // collaborator, not the application dropping them.
        var asOwner = await UniverseEndpoints.WithOwnedArtwork(db, one, ownerId).SingleAsync();
        var asEditor = await UniverseEndpoints.WithOwnedArtwork(db, one, editorId).SingleAsync();

        Assert.NotNull(asOwner.Artwork);
        Assert.Equal(universe.Id, asEditor.Universe.Id);
        Assert.Null(asEditor.Artwork);
    }

    [Fact]
    public async Task Replacing_moves_both_ids_and_reframing_moves_the_card_and_every_read_follows()
    {
        var (owner, _) = await Account(_factory, "ident-versions");
        var universe = await CreateUniverse(owner, "Ident versions");

        var first = await UploadedArtwork(owner, universe.Id, Png(1600, 1000));
        var replaced = await UploadedArtwork(owner, universe.Id, Png(1200, 750), "second.png");
        Assert.NotEqual(first.AssetId, replaced.AssetId);
        Assert.NotEqual(first.CardId, replaced.CardId);
        await AssertReadsAre(owner, universe.Id, replaced.AssetId, replaced.CardId);

        var reframing = await owner.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/artwork/card",
            new UniverseArtworkCardRequest(replaced.AssetId, new ImageCrop(0.25, 0.25, 0.5, 0.5)));
        Assert.True(reframing.IsSuccessStatusCode, await reframing.Content.ReadAsStringAsync());
        var reframed = (await reframing.Content.ReadFromJsonAsync<UniverseArtworkRef>())!;

        Assert.Equal(replaced.AssetId, reframed.AssetId);
        Assert.NotEqual(replaced.CardId, reframed.CardId);
        await AssertReadsAre(owner, universe.Id, reframed.AssetId, reframed.CardId);

        // The superseded card's address stops resolving, so an old cached picture is never named as current.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.GetAsync($"/api/universes/{universe.Id}/artwork/{replaced.AssetId}/card/{replaced.CardId}")).StatusCode);

        // Removing it leaves null: none, not unknown.
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/universes/{universe.Id}/artwork")).StatusCode);
        Assert.Null((await Detail(owner, universe.Id)).Artwork);
        Assert.Null((await List(owner)).Items.Single(item => item.Id == universe.Id).Artwork);
    }

    [Fact]
    public async Task Every_write_that_answers_with_the_universe_keeps_its_artwork()
    {
        var (owner, _) = await Account(_factory, "ident-writes");
        var universe = await CreateUniverse(owner, "Ident writes");
        var stored = await UploadedArtwork(owner, universe.Id, Png(1600, 1000));
        var expected = new UniverseArtworkIdentity(stored.AssetId, stored.CardId);
        var route = $"/api/universes/{universe.Id}";

        var updated = await Answered(owner.PutAsJsonAsync(route, new UpdateUniverseRequest("Ident writes renamed", "Notes.", "#336699")));
        Assert.Equal(expected, updated.Artwork);

        var archived = await Answered(owner.PostAsync($"{route}/archive", null));
        Assert.True(archived.IsArchived);
        Assert.Equal(expected, archived.Artwork);

        // Archived, it keeps its art wherever it is still listed and read.
        Assert.Equal(expected, (await List(owner, includeArchived: true)).Items.Single(item => item.Id == universe.Id).Artwork);
        Assert.Equal(expected, (await Detail(owner, universe.Id)).Artwork);

        var unarchived = await Answered(owner.PostAsync($"{route}/unarchive", null));
        Assert.False(unarchived.IsArchived);
        Assert.Equal(expected, unarchived.Artwork);

        // Without artwork, the same writes answer null.
        var bare = await CreateUniverse(owner, "Ident writes bare");
        Assert.Null((await Answered(owner.PutAsJsonAsync($"/api/universes/{bare.Id}", new UpdateUniverseRequest("Ident writes bare 2", null, null)))).Artwork);
        Assert.Null((await Answered(owner.PostAsync($"/api/universes/{bare.Id}/archive", null))).Artwork);
    }

    [Fact]
    public async Task A_restore_answers_with_the_artwork_it_has_just_stored()
    {
        var (owner, _) = await Account(_factory, "ident-restore");
        var universe = await CreateUniverse(owner, "Ident restore");
        var source = await UploadedArtwork(owner, universe.Id, Png(1600, 1000));

        var restored = await RestoreArchive(owner, await RawArchive(owner, universe.Id), "Ident restored");

        // The same picture under new ids, and the answer names them.
        var state = (await State(owner, restored.Id)).Artwork!;
        Assert.NotEqual(source.AssetId, state.AssetId);
        Assert.Equal(new UniverseArtworkIdentity(state.AssetId, state.CardId), restored.Artwork);
        Assert.Equal(restored.Artwork, (await Detail(owner, restored.Id)).Artwork);

        // A backup without artwork restores without it.
        var bare = await CreateUniverse(owner, "Ident restore bare");
        Assert.Null((await RestoreArchive(owner, await RawArchive(owner, bare.Id), "Ident restored bare")).Artwork);
    }

    [Fact]
    public async Task The_list_costs_a_count_and_a_page_however_many_universes_have_artwork()
    {
        var (few, fewId) = await Account(_factory, "ident-queries-few");
        var (many, manyId) = await Account(_factory, "ident-queries-many");

        await UploadedArtwork(few, (await CreateUniverse(few, "Ident queries 1")).Id, Png(320, 200));
        for (var index = 1; index <= 12; index++)
        {
            await UploadedArtwork(many, (await CreateUniverse(many, $"Ident queries {index}")).Id, Png(320, 200));
        }

        var (fewQueries, fewPage) = await CountListAsync(few, fewId);
        var (manyQueries, manyPage) = await CountListAsync(many, manyId);

        Assert.Single(fewPage.Items, item => item.Artwork is not null);
        Assert.Equal(12, manyPage.Items.Count(item => item.Artwork is not null));
        Assert.Equal(2, fewQueries);
        Assert.Equal(2, manyQueries);

        // Shared artwork universes on the page add no query either, and carry no ids.
        foreach (var shared in manyPage.Items.Take(5))
        {
            await Join(_factory, shared.Id, fewId, UniverseRole.Viewer);
        }

        var (sharedQueries, sharedPage) = await CountListAsync(few, fewId);
        Assert.Equal(6, sharedPage.Items.Count);
        Assert.Single(sharedPage.Items, item => item.Artwork is not null);
        Assert.Equal(2, sharedQueries);

        // The read: the access check, then the universe with its artwork - no third query for the art.
        var universe = manyPage.Items[0].Id;
        var (readQueries, detail) = await CommandCounter.CountAsync([universe], () => Detail(many, universe));
        Assert.NotNull(detail.Artwork);
        Assert.Equal(2, readQueries);
    }

    [Fact]
    public async Task A_write_that_answers_with_the_universe_pays_one_query_for_its_artwork()
    {
        var (owner, _) = await Account(_factory, "ident-write-queries");
        var universe = await CreateUniverse(owner, "Ident write queries");
        await UploadedArtwork(owner, universe.Id, Png(320, 200));

        // Access check, the tracked universe, the update, and the artwork's two ids, and whether AI help is off.
        var (archiveQueries, archived) = await CommandCounter.CountAsync(
            [universe.Id],
            () => Answered(owner.PostAsync($"/api/universes/{universe.Id}/archive", null)));
        Assert.NotNull(archived.Artwork);
        Assert.Equal(5, archiveQueries);
    }

    private static async Task AssertReadsAre(HttpClient owner, Guid universeId, Guid assetId, Guid cardId)
    {
        var expected = new UniverseArtworkIdentity(assetId, cardId);
        Assert.Equal(expected, (await Detail(owner, universeId)).Artwork);
        Assert.Equal(expected, (await List(owner)).Items.Single(item => item.Id == universeId).Artwork);
    }

    private static async Task<(int Queries, UniversePage Page)> CountListAsync(HttpClient client, string userId)
    {
        using var counter = new CommandCounter([userId]);
        var page = await List(client);
        return (counter.Count, page);
    }

    private static async Task<UniversePage> List(HttpClient client, bool includeArchived = false) =>
        (await client.GetFromJsonAsync<UniversePage>($"/api/universes?pageSize=50&includeArchived={includeArchived}"))!;

    private static async Task<UniverseDetail> Detail(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<UniverseDetail>($"/api/universes/{universeId}"))!;

    private static async Task<UniverseDetail> Answered(Task<HttpResponseMessage> sending)
    {
        var response = await sending;
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
