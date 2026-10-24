using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Restore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.PublishingTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Version 15: a universe's public details and artwork travel in its backup, and publication never does
/// (ADR 0036, ADR 0014). What an author wrote and chose for the portal is authored and comes back; whether
/// the universe was public, its address and when it was published belong to that universe in that
/// installation, so a restore - always a new universe (ADR 0032) - is private, and publishing it is its new
/// owner's explicit act. An older file restores private and bare, whatever it carries.
/// </summary>
public sealed class PublicationBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_the_public_details_and_the_artwork_and_never_the_publication()
    {
        var (client, _) = await Account(_factory, "bak-carry");
        var universe = await Ready(client, "Backup carry", author: "Mara Vell");
        var artwork = (await State(client, universe.Id)).Artwork!;
        await Published(client, universe.Id);

        var archive = await RawArchive(client, universe.Id);
        var backup = BackupOf(archive);
        var carried = backup.Payload.Universe;

        Assert.Equal(29, backup.FormatVersion);
        Assert.Equal("A drowned coast where the tide keeps count.", carried.PublicSummary);
        Assert.Equal(UniverseCategory.Books, carried.Category);
        Assert.Equal([UniverseGenres.Fantasy, UniverseGenres.Adventure], carried.Genres);
        Assert.Equal("media/universe/artwork/original.png", carried.Artwork!.MediaPath);
        Assert.Equal((artwork.Width, artwork.Height, artwork.ByteSize), (carried.Artwork.Width, carried.Artwork.Height, carried.Artwork.ByteSize));
        Assert.Equal(new BackupImageCrop(artwork.Crop.X, artwork.Crop.Y, artwork.Crop.Width, artwork.Crop.Height), carried.Artwork.Crop);
        Assert.Contains("media/universe/artwork/original.png", Entries(archive).Keys);

        // By name, as every enum in the format is.
        var document = JsonNode.Parse(DocumentOf(archive))!["payload"]!["universe"]!.AsObject();
        Assert.Equal("Books", (string?)document["category"]);
        Assert.Equal(["Fantasy", "Adventure"], document["genres"]!.AsArray().Select(genre => (string?)genre));

        // Publication is not in it, under any name, and neither is the author's name - that is the account's.
        var text = DocumentOf(archive);
        foreach (var absent in new[] { "visibility", "publicSlug", "publishedAt", "backup-carry", "Mara Vell", "cardId" })
        {
            Assert.DoesNotContain(absent, text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task A_restore_of_a_public_universe_is_private_with_its_details_and_its_artwork()
    {
        var (client, _) = await Account(_factory, "bak-restore");
        var universe = await Ready(client, "Backup restore");
        var published = await Published(client, universe.Id);
        var archive = await RawArchive(client, universe.Id);

        var restored = await RestoreArchive(client, archive, "Backup restored");
        var state = await State(client, restored.Id);

        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(state.PublicSlug);
        Assert.Null(state.PublishedAt);
        Assert.Equal(published.PublicSummary, state.PublicSummary);
        Assert.Equal(published.Category, state.Category);
        Assert.Equal(published.Genres, state.Genres);
        Assert.Empty(state.Missing);

        // The artwork is the same picture under new ids, with its card cut again from the same frame - byte for byte.
        Assert.NotEqual(published.Artwork!.AssetId, state.Artwork!.AssetId);
        Assert.Equal(published.Artwork.Crop, state.Artwork.Crop);
        Assert.Equal(
            await client.GetByteArrayAsync($"/api/universes/{universe.Id}/artwork/{published.Artwork.AssetId}/original"),
            await client.GetByteArrayAsync($"/api/universes/{restored.Id}/artwork/{state.Artwork.AssetId}/original"));
        Assert.Equal(
            await client.GetByteArrayAsync($"/api/universes/{universe.Id}/artwork/{published.Artwork.AssetId}/card/{published.Artwork.CardId}"),
            await client.GetByteArrayAsync($"/api/universes/{restored.Id}/artwork/{state.Artwork.AssetId}/card/{state.Artwork.CardId}"));

        // Nothing public found it; the original is still the one at its address.
        var anonymous = Anonymous(_factory);
        Assert.DoesNotContain(await PublicListing(anonymous), world => world.Name == "Backup restored");
        Assert.Equal("Backup restore", (await PublicBySlug(anonymous, published.PublicSlug!))!.Name);

        // Publishing the copy is its own act, and mints its own address.
        Assert.Equal("backup-restored", (await Published(client, restored.Id)).PublicSlug);
    }

    [Fact]
    public async Task A_restored_universe_exports_the_same_public_details_and_artwork()
    {
        var (client, _) = await Account(_factory, "bak-roundtrip");
        var universe = await Ready(client, "Backup round trip");

        var original = await RawArchive(client, universe.Id);
        var restored = await RestoreArchive(client, original, "Backup round trip restored");
        var copy = await RawArchive(client, restored.Id);

        var before = Describe(BackupOf(original), original);
        var after = Describe(BackupOf(copy), copy);
        Assert.Equal(before, after);
        Assert.Contains(before, line => line == "universe public summary=A drowned coast where the tide keeps count. category=Books genres=[Fantasy | Adventure]");
        Assert.Contains(before, line => line.StartsWith("  artwork image/png 1600x1000", StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_version_14_file_restores_private_and_without_public_details_even_if_it_carries_them()
    {
        var (client, _) = await Account(_factory, "bak-v14");
        var universe = await Ready(client, "Backup fourteen");
        await Published(client, universe.Id);
        var current = await RawArchive(client, universe.Id);

        // Honest: what a version 14 Lorex wrote.
        var honest = await RestoreArchive(client, Downgrade(current, 14), "Backup fourteen honest");
        var bare = await State(client, honest.Id);
        Assert.Equal(UniverseVisibility.Private, bare.Visibility);
        Assert.Null(bare.PublicSummary);
        Assert.Null(bare.Category);
        Assert.Empty(bare.Genres);
        Assert.Null(bare.Artwork);

        // A version 14 file that carries the members anyway was not written by Lorex; they are not part of what it claims.
        var claimed = Rewrite(current, root => root["formatVersion"] = 14, files => files.Remove("media/universe/artwork/original.png"));
        var carrying = await RestoreArchive(client, claimed, "Backup fourteen carrying");
        var ignored = await State(client, carrying.Id);
        Assert.Null(ignored.PublicSummary);
        Assert.Null(ignored.Category);
        Assert.Empty(ignored.Genres);
    }

    [Fact]
    public async Task No_version_of_the_file_can_restore_a_universe_as_public()
    {
        var (client, _) = await Account(_factory, "bak-forged");
        var universe = await Ready(client, "Backup forged");
        var archive = await RawArchive(client, universe.Id);

        var forged = Rewrite(archive, root =>
        {
            var carried = Payload(root)["universe"]!.AsObject();
            carried["visibility"] = "Public";
            carried["publicSlug"] = "forged-address";
            carried["publishedAt"] = "2020-01-01T00:00:00Z";
        });

        var restored = await RestoreArchive(client, forged, "Backup forged restored");
        var state = await State(client, restored.Id);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(state.PublicSlug);
        Assert.Null(await PublicBySlug(Anonymous(_factory), "forged-address"));
    }

    [Fact]
    public async Task Public_details_and_artwork_of_a_shape_Lorex_does_not_write_are_refused()
    {
        var (client, _) = await Account(_factory, "bak-refused");
        var universe = await Ready(client, "Backup refused");
        var archive = await RawArchive(client, universe.Id);

        JsonObject Universe(JsonObject root) => Payload(root)["universe"]!.AsObject();

        var cases = new (string What, byte[] File, string Code)[]
        {
            ("too many genres", Rewrite(archive, root => Universe(root)["genres"] = new JsonArray("Fantasy", "Horror", "Mystery", "Romance")), BackupIssueCodes.InvalidValue),
            ("a genre twice", Rewrite(archive, root => Universe(root)["genres"] = new JsonArray("Fantasy", "Fantasy")), BackupIssueCodes.InvalidValue),
            ("an unknown category", Rewrite(archive, root => Universe(root)["category"] = 99), BackupIssueCodes.InvalidValue),
            ("a long summary", Rewrite(archive, root => Universe(root)["publicSummary"] = new string('s', PublicationLimits.SummaryMaxLength + 1)), BackupIssueCodes.TooLong),
            ("a square card frame", Rewrite(archive, root => Universe(root)["artwork"]!["crop"] = new JsonObject { ["x"] = 0, ["y"] = 0, ["width"] = 0.625, ["height"] = 1 }), BackupIssueCodes.InvalidImage),
            ("artwork somewhere else", Rewrite(archive, root => Universe(root)["artwork"]!["mediaPath"] = "media/universe/../../elsewhere.png"), BackupIssueCodes.InvalidImage),
            ("artwork missing", Rewrite(archive, files: entries => entries.Remove("media/universe/artwork/original.png")), BackupIssueCodes.MissingMedia),
        };

        foreach (var (what, file, code) in cases)
        {
            var refusal = await Refused(await Validate(client, file));
            Assert.True(refusal.IssueCodes.Contains(code), $"{what}: {refusal.Raw}");
        }
    }
}
