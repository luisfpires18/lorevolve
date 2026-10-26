using System.Net;
using System.Net.Http.Json;
using System.Text;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Issue #11: "you can always retrieve your world". A realistic universe - the rich world every backup test uses, plus
/// every kind of picture LoreX stores (an entry's, an appearance's, a map's, the universe's artwork), a private note, a
/// mention in prose and a formatted article - is taken out both ways and brought back:
///
/// - the backup restores as a new universe whose every picture is the original byte for byte, and which exports the same
///   world again;
/// - the readable export (ADR 0063) holds a Markdown page per live entry, story, scene and map, links them by relative path,
///   and carries exactly the live pictures at the backup's own paths.
/// </summary>
public sealed class UniverseRecoveryTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record FullWorld(
        RichWorld Rich,
        Guid Map,
        Guid Appearance,
        Guid AppearancePicture,
        Guid TrashedRelic,
        byte[] AppearancePng,
        byte[] MapPng,
        byte[] ArtworkPng,
        byte[] RelicPng);

    [Fact]
    public async Task A_restore_drill_brings_back_every_kind_of_picture_byte_for_byte_and_the_same_world()
    {
        var client = await SignedIn(_factory, "recovery-drill");
        var world = await BuildFullWorld(client, "Recovery drill");
        var u = world.Rich.Universe.Id;

        var original = await RawArchive(client, u);
        var validated = await Validated(client, original);
        Assert.Equal(UniverseBackup.CurrentVersion, validated.Preview.FormatVersion);
        Assert.Equal((1, 1), (validated.Preview.Counts.Maps, validated.Preview.Counts.MapPins));
        var restored = await Restored(client, validated.Token, "Recovery drill restored");

        // The same world, fact by fact, under ids it shares with nothing.
        var copy = await RawArchive(client, restored.Id);
        // A mention's id is the one rewrite a restore makes inside prose (ADR 0058); it is checked against the new entry below.
        static List<string> Facts(byte[] archive) =>
            [.. Describe(BackupOf(archive), archive).Select(line => System.Text.RegularExpressions.Regex.Replace(line, @"\(lore:[0-9a-fA-F-]{36}\)", "(lore:id)"))];
        Assert.Equal(Facts(original), Facts(copy));
        Assert.Empty(GuidsIn(DocumentOf(original)).Intersect(GuidsIn(DocumentOf(copy))));

        // Every picture's original through the restored universe's own routes: entry, appearance, map, artwork.
        var payload = BackupOf(copy).Payload;
        var warden = payload.Entities.Single(entity => entity.Name == "Alenna Vance");
        Assert.Equal(world.Rich.WardenPicture, await Bytes(client, $"/api/universes/{restored.Id}/entities/{warden.Id}/image/{warden.Image!.AssetId}/original"));

        var look = warden.Progression!.Appearances!.Single();
        Assert.Equal(world.AppearancePng, await Bytes(client, $"/api/universes/{restored.Id}/entities/{warden.Id}/appearances/{look.Id}/images/{look.Images.Single().Id}/original"));

        var map = payload.Maps!.Single();
        Assert.Equal(world.MapPng, await Bytes(client, $"/api/universes/{restored.Id}/maps/{map.Id}/image/{map.Image.AssetId}/original"));
        Assert.Equal(world.ArtworkPng, await Bytes(client, $"/api/universes/{restored.Id}/artwork/{payload.Universe.Artwork!.AssetId}/original"));

        // The trashed entry's picture came back with it, still in the Trash.
        var relic = payload.Entities.Single(entity => entity.Name == "Drowned Relic");
        Assert.NotNull(relic.DeletedAt);
        Assert.Equal(world.RelicPng, Entries(copy)[relic.Image!.MediaPath]);

        // The owner's note and the mention, now pointing at the restored entry.
        Assert.Equal("Only I know she is the heir.", warden.PrivateNote!.Content);
        var council = payload.Stories!.SelectMany(story => story.Scenes).Single(scene => scene.Title == "The Council");
        Assert.Contains($"@[Alenna Vance](lore:{warden.Id:D})", council.Manuscript!.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_readable_export_is_a_linked_markdown_book_of_the_live_world_with_its_pictures()
    {
        var client = await SignedIn(_factory, "readable-book");
        var world = await BuildFullWorld(client, "Readable book");
        var u = world.Rich.Universe.Id;

        var response = await client.GetAsync($"/api/universes/{u}/export/readable");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/zip", response.Content.Headers.ContentType?.MediaType);
        Assert.Matches(@"^lorex-readable-book-\d{8}-readable\.zip$", response.Content.Headers.ContentDisposition!.FileNameStar ?? response.Content.Headers.ContentDisposition.FileName!.Trim('"'));
        var files = Entries(await response.Content.ReadAsByteArrayAsync());
        string Page(string path) => Encoding.UTF8.GetString(files[path]);

        // The layout is fixed: the universe, the lore index, a page per live entry by its type, the shared pages.
        foreach (var path in new[] { "README.md", "lore/README.md", "relationships.md", "timeline.md", "world-rules.md", "ideas.md" })
        {
            Assert.True(files.ContainsKey(path), path);
        }

        var readme = Page("README.md");
        Assert.StartsWith("# Readable book", readme, StringComparison.Ordinal);
        Assert.Contains("LoreX cannot read it back", readme, StringComparison.Ordinal);
        Assert.Contains("[The Long Winter](stories/the-long-winter/README.md)", readme, StringComparison.Ordinal);
        Assert.Contains("[The Known Coast](maps/the-known-coast.md)", readme, StringComparison.Ordinal);

        // A page per live entry and none for the Trash.
        var wardenPath = "lore/character/alenna-vance.md";
        Assert.Contains("[Alenna Vance](character/alenna-vance.md)", Page("lore/README.md"), StringComparison.Ordinal);
        Assert.DoesNotContain(files.Keys, path => path.Contains("lost-heir", StringComparison.Ordinal) || path.Contains("drowned-relic", StringComparison.Ordinal));
        Assert.DoesNotContain("Lost Heir", Page("lore/README.md"), StringComparison.Ordinal);

        var warden = Page(wardenPath);
        Assert.StartsWith("# Alenna Vance", warden, StringComparison.Ordinal);
        Assert.Contains("**Title:** High Warden", warden, StringComparison.Ordinal);
        Assert.Contains("**Born:** 12 BF", warden, StringComparison.Ordinal);
        Assert.Contains("**Mentor:** [Corin Ash](corin-ash.md)", warden, StringComparison.Ordinal);
        Assert.Contains($"![Alenna Vance](../../media/entities/{world.Rich.Warden:D}/original.png)", warden, StringComparison.Ordinal);
        Assert.Contains("### Origins", warden, StringComparison.Ordinal);
        Assert.Contains("The **salt** tide, [charted](https://example.test/tide).", warden, StringComparison.Ordinal);
        Assert.Contains("- First ledger", warden, StringComparison.Ordinal);
        Assert.Contains("## Private note", warden, StringComparison.Ordinal);
        Assert.Contains("Only I know she is the heir.", warden, StringComparison.Ordinal);
        Assert.Contains("## Appearances", warden, StringComparison.Ordinal);
        Assert.Contains($"(../../media/entities/{world.Rich.Warden:D}/appearances/{world.AppearancePicture:D}/original.png)", warden, StringComparison.Ordinal);
        Assert.Contains("[The Known Coast](../../maps/the-known-coast.md): Seawall", warden, StringComparison.Ordinal);

        // A story page, and each live scene on a numbered page of its own with its prose and its mention as a link.
        var story = Page("stories/the-long-winter/README.md");
        Assert.Contains("### Chapter 1: Arrival", story, StringComparison.Ordinal);
        var councilPath = files.Keys.Single(path => path.StartsWith("stories/the-long-winter/", StringComparison.Ordinal) && path.EndsWith("-the-council.md", StringComparison.Ordinal));
        var council = Page(councilPath);
        Assert.Contains("[Alenna Vance](../../lore/character/alenna-vance.md) stood up.", council, StringComparison.Ordinal);
        Assert.DoesNotContain(files.Keys, path => path.Contains("abandoned-draft", StringComparison.Ordinal));

        var map = Page("maps/the-known-coast.md");
        Assert.Contains($"![The Known Coast](../media/maps/{world.Map:D}/original.png)", map, StringComparison.Ordinal);
        Assert.Contains("| Seawall | [Alenna Vance](../lore/character/alenna-vance.md) | 25% | 50% |", map, StringComparison.Ordinal);

        // Exactly the live pictures, as their originals, at the backup's paths - not the trashed relic's.
        var backup = Entries(await RawArchive(client, u));
        var media = files.Keys.Where(path => path.StartsWith("media/", StringComparison.Ordinal)).Order(StringComparer.Ordinal).ToList();
        Assert.Equal(4, media.Count);
        Assert.All(media, path => Assert.Equal(backup[path], files[path]));
        Assert.Equal(world.Rich.WardenPicture, files[$"media/entities/{world.Rich.Warden:D}/original.png"]);
        Assert.Equal(world.MapPng, files[$"media/maps/{world.Map:D}/original.png"]);
        Assert.Equal(world.ArtworkPng, files["media/universe/artwork/original.png"]);
        Assert.Equal(world.AppearancePng, files[$"media/entities/{world.Rich.Warden:D}/appearances/{world.AppearancePicture:D}/original.png"]);
        Assert.Contains(backup.Keys, path => path == $"media/entities/{world.TrashedRelic:D}/original.png");
        Assert.DoesNotContain(files.Keys, path => path.Contains(world.TrashedRelic.ToString("D"), StringComparison.Ordinal));
    }

    [Fact]
    public async Task The_readable_export_neutralises_unsafe_links_and_markup_written_into_content()
    {
        var client = await SignedIn(_factory, "readable-safe");
        var universe = await CreateUniverse(client, "Unsafe ink");
        var u = universe.Id;
        var entry = await CreateEntity(client, u, "Mallory [x](javascript:alert(1))");
        await ArticleTestClient.WriteArticle(client, u, entry, ArticleTestClient.Doc("Plain words."));

        // A stored article older than link validation, holding a script link and raw HTML text.
        await WithDb(_factory, db => db.EntityArticles.Where(article => article.EntityId == entry).ExecuteUpdateAsync(set => set.SetProperty(
            article => article.Content,
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"click","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]},{"type":"text","text":" <img src=x onerror=alert(1)>"}]}]}""")));

        var story = await CreateStory(client, u, "Tale");
        var scene = await CreateScene(client, u, story, "Scene");
        await ManuscriptTestClient.WriteManuscript(client, u, story, scene, "<script>alert(1)</script> [x](javascript:alert(2)) ![i](javascript:alert(3))");

        // A date period whose label is a link, and a year counted in it.
        var chronology = await client.PutAsJsonAsync($"/api/universes/{u}/chronology", new Lorex.Api.Features.Chronology.ChronologyRequest(
            [new Lorex.Api.Features.Chronology.ChronologyEraRequest(null, "Age [z](javascript:alert(5))", null,
                Lorex.Api.Features.Chronology.ChronologyEraDirection.Ascending, Lorex.Api.Features.Chronology.ChronologyLabelPosition.AfterYear)]));
        Assert.True(chronology.IsSuccessStatusCode, await chronology.Content.ReadAsStringAsync());
        var era = (await chronology.Content.ReadFromJsonAsync<Lorex.Api.Features.Chronology.ChronologyResponse>())!.Eras.Single().Id;
        var type = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!.First(row => row.Name == "Character").Id;
        var field = await client.PostAsJsonAsync($"/api/universes/{u}/entity-types/{type}/fields",
            new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null, null));
        field.EnsureSuccessStatusCode();
        var born = (await field.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.First(row => row.Name == "Born").Id;
        (await client.PostAsJsonAsync($"/api/universes/{u}/entities", new EntityRequest(
            type, "Dated", null, CanonStatus.Draft, null, null, [new FieldValueInput(born, null, 7, null, null, null, null, era)]))).EnsureSuccessStatusCode();

        var files = Entries(await (await client.GetAsync($"/api/universes/{u}/export/readable")).Content.ReadAsByteArrayAsync());
        var page = Encoding.UTF8.GetString(files.Single(file => file.Key.StartsWith("lore/character/mallory", StringComparison.Ordinal)).Value);
        Assert.DoesNotMatch(@"(?<!\\)\]\(\s*javascript:", page);
        Assert.Contains("# Mallory \\[x\\](javascript:alert(1))", page, StringComparison.Ordinal);
        Assert.Contains("click \\<img src=x onerror=alert(1)\\>", page, StringComparison.Ordinal);
        Assert.DoesNotContain("<img", page.Replace("\\<img", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);

        var prose = Encoding.UTF8.GetString(files.Single(file => file.Key.StartsWith("stories/tale/0", StringComparison.Ordinal)).Value);
        Assert.Contains("\\<script\\>alert(1)\\</script\\>", prose, StringComparison.Ordinal);
        Assert.Contains("\\[x\\](javascript:alert(2))", prose, StringComparison.Ordinal);

        // No page anywhere holds a link or image whose target is a script, and no raw tag.
        foreach (var (path, bytes) in files.Where(file => file.Key.EndsWith(".md", StringComparison.Ordinal)))
        {
            var text = Encoding.UTF8.GetString(bytes);
            Assert.DoesNotMatch(@"(?<!\\)\]\(\s*javascript:", text);
            Assert.DoesNotMatch(@"(?<!\\)<(script|img)", text);
        }

        var dated = Encoding.UTF8.GetString(files.Single(file => file.Key.EndsWith("/dated.md", StringComparison.Ordinal)).Value);
        Assert.Contains("**Born:** 7 Age \\[z\\](javascript:alert(5))", dated, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_missing_live_picture_refuses_the_readable_export_and_a_missing_trashed_one_does_not()
    {
        var client = await SignedIn(_factory, "readable-missing");
        var universe = await CreateUniverse(client, "Missing ink");
        var u = universe.Id;
        var live = await CreateEntity(client, u, "Kept");
        var binned = await CreateEntity(client, u, "Binned");
        await CollaborationTestClient.UploadImage(client, u, live);
        await CollaborationTestClient.UploadImage(client, u, binned);
        (await client.DeleteAsync($"/api/universes/{u}/entities/{binned}")).EnsureSuccessStatusCode();

        // The trashed entry's picture is not part of a readable export, so its loss does not block one - the backup still refuses.
        _factory.Media.Evict(OriginalKey(u, binned));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{u}/export/readable")).StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.GetAsync($"/api/universes/{u}/export")).StatusCode);

        _factory.Media.Evict(OriginalKey(u, live));
        var refused = await client.GetAsync($"/api/universes/{u}/export/readable");
        Assert.Equal(HttpStatusCode.InternalServerError, refused.StatusCode);
        Assert.Equal("application/problem+json", refused.Content.Headers.ContentType?.MediaType);
        Assert.Equal(UniverseExportEndpoints.MediaMissingCode, await PublishingTestClient.ProblemCode(refused));

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"/api/universes/{u}/export/readable")).StatusCode);
    }

    // ---------- Helpers ----------

    private string OriginalKey(Guid universeId, Guid entityId) =>
        _factory.Media.Keys.Single(key => key.StartsWith($"universes/{universeId:D}/entities/{entityId:D}/", StringComparison.Ordinal)
            && key.Contains("/original.", StringComparison.Ordinal));

    private static async Task<byte[]> Bytes(HttpClient client, string path)
    {
        var response = await client.GetAsync(path);
        Assert.True(response.IsSuccessStatusCode, $"{path}: {response.StatusCode}");
        return await response.Content.ReadAsByteArrayAsync();
    }

    /// <summary>The rich world, plus every kind of picture, a private note, a mention in prose and a formatted article.</summary>
    private static async Task<FullWorld> BuildFullWorld(HttpClient client, string name)
    {
        var rich = await BuildRichWorld(client, name);
        var u = rich.Universe.Id;

        var artwork = Png(800, 500, 31);
        (await PublishingTestClient.UploadArtwork(client, u, artwork)).EnsureSuccessStatusCode();

        var mapPng = Png(640, 400, 32);
        var map = await MapTestClient.CreateMap(client, u, "The Known Coast", mapPng, "Every harbour.");
        await MapTestClient.AddPin(client, u, map.Id, "Seawall", 0.25, 0.5, rich.Warden, "Where she was sworn.");

        var progression = $"/api/universes/{u}/entities/{rich.Warden}/progression";
        var current = (await client.GetFromJsonAsync<ProgressionResponse>(progression))!;
        var saved = await client.PutAsJsonAsync(progression, new ProgressionRequest(
            null, current.Version, Appearances: [new AppearanceInput(null, "Storm cloak", "Worn at the seawall.", [], [], [])]));
        Assert.True(saved.IsSuccessStatusCode, await saved.Content.ReadAsStringAsync());
        var appearance = (await saved.Content.ReadFromJsonAsync<ProgressionResponse>())!.Appearances!.Single().Id;
        var lookPng = Png(60, 90, 33);
        using (var form = new MultipartFormDataContent { { new ByteArrayContent(lookPng), "file", "cloak.png" } })
        {
            var uploaded = await client.PutAsync($"/api/universes/{u}/entities/{rich.Warden}/appearances/{appearance}/images", form);
            Assert.True(uploaded.IsSuccessStatusCode, await uploaded.Content.ReadAsStringAsync());
        }

        var picture = (await client.GetFromJsonAsync<ProgressionResponse>(progression))!.Appearances!.Single().Images.Single().Id;

        var note = $"/api/universes/{u}/entities/{rich.Warden}/private-note";
        var noteVersion = (await client.GetFromJsonAsync<EntityPrivateNoteResponse>(note))!.Version;
        (await client.PutAsJsonAsync(note, new EntityPrivateNoteRequest("Only I know she is the heir.", noteVersion))).EnsureSuccessStatusCode();

        await ManuscriptTestClient.WriteManuscript(client, u, rich.Story, rich.Council, $"@[Alenna Vance](lore:{rich.Warden:D}) stood up.\n\nThe hall was cold.");

        var article = """
            {"type":"doc","content":[
              {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Origins"}]},
              {"type":"paragraph","content":[{"type":"text","text":"The "},{"type":"text","text":"salt","marks":[{"type":"bold"}]},{"type":"text","text":" tide, "},{"type":"text","text":"charted","marks":[{"type":"link","attrs":{"href":"https://example.test/tide"}}]},{"type":"text","text":"."}]},
              {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"First ledger"}]}]}]}
            ]}
            """;
        await ArticleTestClient.WriteArticle(client, u, rich.Warden, article);

        var relicPng = Png(50, 50, 34);
        var relic = await CreateEntity(client, u, "Drowned Relic");
        using (var form = new MultipartFormDataContent { { new ByteArrayContent(relicPng), "file", "relic.png" } })
        {
            (await client.PutAsync($"/api/universes/{u}/entities/{relic}/image", form)).EnsureSuccessStatusCode();
        }

        (await client.DeleteAsync($"/api/universes/{u}/entities/{relic}")).EnsureSuccessStatusCode();

        return new FullWorld(rich, map.Id, appearance, picture, relic, lookPng, mapPng, artwork, relicPng);
    }
}
