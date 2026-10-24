using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Stories;
using static Lorex.Api.Tests.PublishingTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's or a story's publication never travels in a backup (ADR 0036, Task 010), exactly as a universe's does
/// not. Whether an item was selected, its address and when it was published belong to that item in that installation;
/// a restore is always a new universe (ADR 0032), so every entry and story in it is private, and publishing any of
/// them is its owner's explicit act. No file - current, older or forged - can say otherwise. The format stays at 15:
/// nothing authored was added.
/// </summary>
public sealed class ContentPublicationBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_never_carries_an_items_publication_and_its_restore_publishes_nothing()
    {
        var (client, _) = await Account(_factory, "cpbak-carry");
        var universe = await Ready(client, "Cp backup carry");
        await PublishedItems(client, universe.Id);
        await Published(client, universe.Id);

        var archive = await PlotTestClient.RawArchive(client, universe.Id);
        Assert.Equal(29, BackupOf(archive).FormatVersion);

        var text = DocumentOf(archive);
        foreach (var absent in new[] { "visibility", "publicSlug", "publishedAt", "backed-heir", "backed-tale" })
        {
            Assert.DoesNotContain(absent, text, StringComparison.OrdinalIgnoreCase);
        }

        var restored = await RestoreArchive(client, archive, "Cp backup carry restored");
        await AssertNothingPublished(client, restored.Id, "cp-backup-carry-restored");

        // The original is untouched by any of it.
        var anonymous = Anonymous(_factory);
        Assert.Contains("backed-heir", await anonymous.GetStringAsync($"{PublicRoute}/cp-backup-carry/lore"), StringComparison.Ordinal);
        Assert.Contains("backed-tale", await anonymous.GetStringAsync($"{PublicRoute}/cp-backup-carry/stories"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task No_file_current_older_or_forged_can_restore_an_entry_or_story_as_public()
    {
        var (client, _) = await Account(_factory, "cpbak-forged");
        var universe = await Ready(client, "Cp backup forged");
        await PublishedItems(client, universe.Id);
        var archive = await PlotTestClient.RawArchive(client, universe.Id);

        var forged = Rewrite(archive, root =>
        {
            foreach (var item in new[] { EntityNamed(root, "Backed heir"), StoryTitled(root, "Backed tale") })
            {
                item["visibility"] = "Public";
                item["publicSlug"] = "forged-address";
                item["publishedAt"] = "2020-01-01T00:00:00Z";
            }
        });

        var fromForged = await RestoreArchive(client, forged, "Cp backup forged restored");
        await AssertNothingPublished(client, fromForged.Id, "cp-backup-forged-restored");

        var fromOlder = await RestoreArchive(client, Downgrade(archive, 14), "Cp backup older restored");
        await AssertNothingPublished(client, fromOlder.Id, "cp-backup-older-restored");
    }

    [Fact]
    public async Task A_storys_public_summary_travels_and_comes_back_on_a_private_story_and_an_older_file_has_none()
    {
        var (client, _) = await Account(_factory, "cpbak-summary");
        var universe = await Ready(client, "Cp backup summary");
        await PublishedItems(client, universe.Id);
        var archive = await PlotTestClient.RawArchive(client, universe.Id);

        Assert.Equal("For readers.", Assert.Single(BackupOf(archive).Payload.Stories!).PublicSummary);

        var restored = await RestoreArchive(client, archive, "Cp backup summary restored");
        var story = Assert.Single((await client.GetFromJsonAsync<List<StorySummary>>(PlotTestClient.Stories(restored.Id)))!);
        var state = (await client.GetFromJsonAsync<ContentPublicationState>($"{PlotTestClient.Story(restored.Id, story.Id)}/publication"))!;
        Assert.Equal((ContentVisibility.Private, "For readers."), (state.Visibility, state.PublicSummary));

        var older = await RestoreArchive(client, Downgrade(archive, 15), "Cp backup summary older");
        var olderStory = Assert.Single((await client.GetFromJsonAsync<List<StorySummary>>(PlotTestClient.Stories(older.Id)))!);
        Assert.Null((await client.GetFromJsonAsync<ContentPublicationState>($"{PlotTestClient.Story(older.Id, olderStory.Id)}/publication"))!.PublicSummary);

        // A summary longer than Lorex writes is refused, not cut.
        var overlong = Rewrite(archive, root => StoryTitled(root, "Backed tale")["publicSummary"] = new string('x', PublicationLimits.SummaryMaxLength + 1));
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await Validate(client, overlong)).StatusCode);
    }

    /// <summary>An entry and a story, both selected - the universe itself left as it is.</summary>
    private static async Task PublishedItems(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var entry = (await PlotTestClient.PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types[0].Id, "Backed heir", "Carried in the backup.", CanonStatus.Canon, null, null, null))).Id;
        var story = await PlotTestClient.CreateStory(client, universeId, "Backed tale");

        (await client.PostAsync($"/api/universes/{universeId}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"{PlotTestClient.Story(universeId, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
        (await client.PostAsync($"{PlotTestClient.Story(universeId, story)}/publish", null)).EnsureSuccessStatusCode();
    }

    /// <summary>Every entry and story in the restored universe is private, and publishing the universe lists none.</summary>
    private async Task AssertNothingPublished(HttpClient client, Guid universeId, string slug)
    {
        var entries = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities"))!.Items;
        var stories = (await client.GetFromJsonAsync<List<StorySummary>>(PlotTestClient.Stories(universeId)))!;
        Assert.Equal("Backed heir", Assert.Single(entries).Name);
        Assert.Equal("Backed tale", Assert.Single(stories).Title);

        var entryState = (await client.GetFromJsonAsync<ContentPublicationState>(
            $"/api/universes/{universeId}/entities/{entries[0].Id}/publication"))!;
        var storyState = (await client.GetFromJsonAsync<ContentPublicationState>(
            $"{PlotTestClient.Story(universeId, stories[0].Id)}/publication"))!;
        Assert.Equal((ContentVisibility.Private, null, null), (entryState.Visibility, entryState.PublicSlug, entryState.PublishedAt));
        Assert.Equal((ContentVisibility.Private, null, null), (storyState.Visibility, storyState.PublicSlug, storyState.PublishedAt));

        // An older file has no public details to restore; give it what publishing needs, so the universe can be public.
        await SavedDetails(client, universeId, "Restored.", UniverseCategory.Books, UniverseGenres.Fantasy);
        await UploadedArtwork(client, universeId, Png(800, 500));
        Assert.Equal(slug, (await Published(client, universeId)).PublicSlug);
        var anonymous = Anonymous(_factory);
        Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicLoreEntry>>($"{PublicRoute}/{slug}/lore"))!.TotalCount);
        Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicStory>>($"{PublicRoute}/{slug}/stories"))!.TotalCount);
    }
}
