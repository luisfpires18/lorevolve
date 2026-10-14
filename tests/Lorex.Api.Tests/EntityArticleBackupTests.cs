using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Entry articles in the universe backup (format version 9).
///
/// An article is the most authored thing an entry holds, and since it moved into a row of its own it has a history of its
/// own. A backup carries both: the article as it stands, exactly, where <c>content</c> has always been, and every saved
/// version beside it. Entry revisions no longer carry a copy, and that re-meaning is why the format moved - so the version is
/// pinned here, and an older file is read as it always meant.
/// </summary>
public sealed class EntityArticleBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_each_article_exactly_with_every_saved_version_beside_its_entry()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artbackup");
        var world = await BuildArticles(client, universe.Id);

        var backup = await Backup(client, universe.Id);
        Assert.Equal(22, backup.FormatVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        var entities = backup.Payload.Entities.ToDictionary(entity => entity.Id);

        // Written, rewritten and put back: the article as it stands, and all three versions in the order they were saved.
        var warden = entities[world.Warden];
        Assert.Equal(RichDocument, warden.Content, StringComparer.Ordinal);
        SameMoment((await ReadArticle(client, universe.Id, world.Warden)).UpdatedAt, warden.ArticleUpdatedAt);

        var versions = warden.ArticleRevisions!;
        var apiVersions = (await ArticleRevisions(client, universe.Id, world.Warden)).OrderBy(version => version.Number).ToList();
        Assert.Equal(apiVersions.Select(version => version.Id), versions.Select(version => version.Id));
        Assert.Equal([1, 2, 3], versions.Select(version => version.Number));
        Assert.Equal(
            [EntityRevisionKind.Created, EntityRevisionKind.Edited, EntityRevisionKind.Restored],
            versions.Select(version => version.Kind));
        Assert.Equal([RichDocument, Doc("Rewritten in anger."), RichDocument], versions.Select(version => version.Content));
        Assert.Equal(versions[0].Id, versions[2].RestoredFromRevisionId);

        // The entry's own versions hold no copy of it.
        Assert.All(warden.Revisions, revision => Assert.Null(revision.Content));

        // Never written: nothing at all. Written and then cleared: no article, but a moment and a history saying so.
        var coast = entities[world.Coast];
        Assert.Null(coast.Content);
        Assert.Null(coast.ArticleUpdatedAt);
        Assert.Empty(coast.ArticleRevisions!);

        var cleared = entities[world.Cleared];
        Assert.Null(cleared.Content);
        Assert.NotNull(cleared.ArticleUpdatedAt);
        Assert.Equal([Doc("A false start."), string.Empty], cleared.ArticleRevisions!.Select(version => version.Content));

        // In the Trash, and carried whole all the same.
        var ghost = entities[world.Ghost];
        Assert.NotNull(ghost.DeletedAt);
        Assert.Equal(Doc("Thrown away, not erased."), ghost.Content);
        Assert.Single(ghost.ArticleRevisions!);
    }

    [Fact]
    public async Task An_article_travels_as_its_document_and_nothing_derived_travels_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artbackupshape");
        var entity = await CreateEntity(client, universe.Id, "Single");
        const string marker = "ZQXJBACKUPMARK";
        await WriteArticle(client, universe.Id, entity, Doc($"{marker} kept the ledger."));

        var text = DocumentText(await RawArchive(client, universe.Id));
        using var document = JsonDocument.Parse(text);

        var element = document.RootElement.GetProperty("payload").GetProperty("entities").EnumerateArray()
            .Single(candidate => candidate.GetProperty("id").GetGuid() == entity);

        var names = Names(element);
        Assert.Contains("content", names);
        Assert.Contains("articleUpdatedAt", names);
        Assert.Contains("articleRevisions", names);

        var version = Assert.Single(element.GetProperty("articleRevisions").EnumerateArray());
        Assert.Equal(["content", "createdAt", "id", "kind", "number", "restoredFromRevisionId"], Names(version));
        Assert.Equal("Created", version.GetProperty("kind").GetString());

        // The article as it stands and its one version - twice in the file, and never as extracted text or on a revision.
        Assert.Equal(2, Occurrences(text, marker));
        Assert.All(
            element.GetProperty("revisions").EnumerateArray(),
            revision => Assert.Equal(JsonValueKind.Null, revision.GetProperty("content").ValueKind));
    }

    [Fact]
    public async Task An_unchanged_article_produces_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artbackupstable");
        await BuildArticles(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the records make of it. A
    /// version 8 document has no article history and no article moment: both read as null, and each entry revision's
    /// <c>content</c> is still the article as it read at that version.
    /// </summary>
    [Fact]
    public void A_version_eight_document_reads_with_no_article_history_and_revisions_that_hold_their_article()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 8,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "3d6f7a10-2b4c-4d5e-8f60-7a8b9c0d1e01", "name": "A world before articles moved", "description": null,
                  "accentColor": null, "isArchived": false,
                  "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                },
                "chronologyEras": [],
                "entityTypes": [],
                "tags": [],
                "entities": [
                  {
                    "id": "3d6f7a10-2b4c-4d5e-8f60-7a8b9c0d1e02", "entityTypeId": "3d6f7a10-2b4c-4d5e-8f60-7a8b9c0d1e03",
                    "name": "Elendil", "summary": null,
                    "content": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Now.\"}]}]}",
                    "canonStatus": "Canon", "isArchived": false, "deletedAt": null,
                    "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z",
                    "aliases": [], "tagIds": [], "fieldValues": [], "image": null,
                    "revisions": [
                      {
                        "id": "3d6f7a10-2b4c-4d5e-8f60-7a8b9c0d1e04", "number": 1, "kind": "Created", "changes": "None",
                        "restoredFromRevisionId": null, "createdAt": "2026-09-12T00:00:00Z",
                        "entityTypeId": "3d6f7a10-2b4c-4d5e-8f60-7a8b9c0d1e03", "entityTypeName": "Character",
                        "name": "Elendil", "summary": null,
                        "content": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Then.\"}]}]}",
                        "canonStatus": "Canon", "aliases": [], "tags": [], "fieldValues": []
                      }
                    ]
                  }
                ],
                "relationshipTypes": [],
                "relationships": [],
                "timelineEntries": [],
                "stories": [],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(8, backup.FormatVersion);
        var entity = Assert.Single(backup.Payload.Entities);
        Assert.Equal(Doc("Now."), entity.Content);
        Assert.Null(entity.ArticleUpdatedAt);
        Assert.Null(entity.ArticleRevisions);
        Assert.Equal(Doc("Then."), Assert.Single(entity.Revisions).Content);
    }

    // ---------- Building ----------

    private sealed record ArticleWorld(Guid Warden, Guid Coast, Guid Cleared, Guid Ghost);

    /// <summary>
    /// Four entries: the Warden's article written, rewritten and the first version put back; the Coast never written; one
    /// written and then cleared; and one written and then moved to the Trash.
    /// </summary>
    private static async Task<ArticleWorld> BuildArticles(HttpClient client, Guid universeId)
    {
        var warden = await CreateEntity(client, universeId, "Warden");
        var coast = await CreateEntity(client, universeId, "Coast");
        var cleared = await CreateEntity(client, universeId, "Cleared");
        var ghost = await CreateEntity(client, universeId, "Ghost");

        await WriteArticle(client, universeId, warden, RichDocument);
        var rewritten = await WriteArticle(client, universeId, warden, Doc("Rewritten in anger."));
        var first = (await ArticleRevisions(client, universeId, warden)).Single(version => version.Number == 1);
        (await RestoreArticle(client, universeId, warden, first.Id, rewritten.Version)).EnsureSuccessStatusCode();

        await WriteArticle(client, universeId, cleared, Doc("A false start."));
        await WriteArticle(client, universeId, cleared, string.Empty);

        await WriteArticle(client, universeId, ghost, Doc("Thrown away, not erased."));
        (await client.DeleteAsync($"/api/universes/{universeId}/entities/{ghost}")).EnsureSuccessStatusCode();

        return new ArticleWorld(warden, coast, cleared, ghost);
    }

    private static List<string> Names(JsonElement element) =>
        [.. element.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];

    private static int Occurrences(string text, string value)
    {
        var count = 0;
        for (var at = text.IndexOf(value, StringComparison.Ordinal); at >= 0; at = text.IndexOf(value, at + 1, StringComparison.Ordinal))
        {
            count++;
        }

        return count;
    }
}
