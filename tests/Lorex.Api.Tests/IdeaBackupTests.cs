using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Ideas in the backup: format version 11 (ADR 0014, ADR 0030).
///
/// The invariants under test: every idea that belongs to the universe travels - title and body exactly, deleted ones marked
/// after the live ones, references by kind and id resolving inside the same file; an idea that belongs to no universe, or to
/// another universe, is never in it; nothing names the owning account; unchanged ideas write unchanged bytes; and a version 10
/// file still reads, holding no ideas.
/// </summary>
public sealed class IdeaBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task The_ideas_of_a_universe_travel_whole_with_their_references_and_deleted_ones_marked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideabackup");
        var other = await CreateUniverse(client, "Other ideabackup");
        var u = universe.Id;

        var arlen = await CreateEntity(client, u, "Arlen");
        var story = await CreateStory(client, u, "The Long Winter");
        var scene = await CreateScene(client, u, story, "The Council");
        var arc = await CreateArc(client, u, story, "Fall of the King");
        var beat = await CreateBeat(client, u, story, arc.Id, "Learns");
        const string body = "  Maybe the city floats.\n\n\tNobody below has seen it. 北の門 👩‍👩‍👧 & <b>not html</b>  ";

        var floating = await CreateIdea(
            client,
            "Maybe this city floats",
            body,
            u,
            [
                Ref(IdeaReferenceKind.PlotBeat, beat.Id),
                Ref(IdeaReferenceKind.Entity, arlen),
                Ref(IdeaReferenceKind.Scene, scene),
                Ref(IdeaReferenceKind.Story, story),
                Ref(IdeaReferenceKind.PlotArc, arc.Id),
            ]);
        var betrayal = await CreateIdea(client, "Betrayal", universeId: u);
        var binned = await CreateIdea(client, "A binned idea", "Still recoverable.", u, [Ref(IdeaReferenceKind.Entity, arlen)]);
        (await client.DeleteAsync(Idea(binned.Id))).EnsureSuccessStatusCode();

        await CreateIdea(client, "Unassigned idea", "Belongs to the account, not to a world.");
        await CreateIdea(client, "Another world's idea", "Belongs elsewhere.", other.Id);

        var archive = await RawArchive(client, u);
        var raw = DocumentText(archive);
        var backup = JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;

        Assert.Equal(33, backup.FormatVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        var ideas = backup.Payload.Ideas!;

        // Live ones by title, then the deleted one.
        Assert.Equal(
            [(betrayal.Id, false), (floating.Id, false), (binned.Id, true)],
            ideas.Select(idea => (idea.Id, idea.DeletedAt is not null)));

        var floatingBackup = ideas[1];
        Assert.Equal(body, floatingBackup.Body, StringComparer.Ordinal);
        Assert.Equal("Maybe this city floats", floatingBackup.Title);
        Assert.Equal((floating.CreatedAt, floating.UpdatedAt), (floatingBackup.CreatedAt, floatingBackup.UpdatedAt));
        Assert.Equal(DateTimeKind.Utc, floatingBackup.UpdatedAt.Kind);

        // References by kind, then id - explicit kinds, ids only, each resolving to something in the same file.
        Assert.Equal(
            [
                new BackupIdeaReference(IdeaReferenceKind.Entity, arlen),
                new BackupIdeaReference(IdeaReferenceKind.Story, story),
                new BackupIdeaReference(IdeaReferenceKind.Scene, scene),
                new BackupIdeaReference(IdeaReferenceKind.PlotArc, arc.Id),
                new BackupIdeaReference(IdeaReferenceKind.PlotBeat, beat.Id),
            ],
            floatingBackup.References);
        Assert.Contains(backup.Payload.Entities, entity => entity.Id == arlen);
        var storyBackup = Assert.Single(backup.Payload.Stories!);
        Assert.Equal(story, storyBackup.Id);
        Assert.Contains(storyBackup.Scenes, candidate => candidate.Id == scene);
        Assert.Contains(storyBackup.PlotArcs!.SelectMany(candidate => candidate.Beats), candidate => candidate.Id == beat.Id);

        Assert.Empty(ideas[0].References);
        Assert.Equal(string.Empty, ideas[0].Body);
        Assert.Equal(arlen, Assert.Single(ideas[2].References).Id);
        Assert.Equal("Still recoverable.", ideas[2].Body);

        // Written as names, with no name of a target and nothing about the account.
        using (var document = JsonDocument.Parse(raw))
        {
            var written = document.RootElement.GetProperty("payload").GetProperty("ideas")[1];
            Assert.Equal(
                ["id", "title", "body", "createdAt", "updatedAt", "deletedAt", "references"],
                written.EnumerateObject().Select(property => property.Name));
            Assert.Equal("PlotBeat", written.GetProperty("references")[4].GetProperty("kind").GetString());
        }

        Assert.DoesNotContain("Unassigned idea", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("Belongs to the account", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("Another world's idea", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("ownerId", raw, StringComparison.OrdinalIgnoreCase);

        // Unchanged ideas, unchanged bytes.
        Assert.Equal(PayloadText(raw), PayloadText(DocumentText(await RawArchive(client, u))));

        // The other universe's backup holds only its own idea, and the unassigned one is in neither.
        var otherIdeas = (await Backup(client, other.Id)).Payload.Ideas!;
        Assert.Equal(["Another world's idea"], otherIdeas.Select(idea => idea.Title));
    }

    [Fact]
    public async Task A_universe_with_no_ideas_writes_an_empty_list_and_a_released_idea_is_in_no_backup()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideabackupempty");
        var doomed = await CreateUniverse(client, "Doomed ideabackupempty");
        await CreateIdea(client, "About the doomed world", "Words that outlive it.", doomed.Id);

        Assert.Empty((await Backup(client, universe.Id)).Payload.Ideas!);
        Assert.Single((await Backup(client, doomed.Id)).Payload.Ideas!);

        await DeleteUniverse(client, doomed.Id);

        // Unassigned now, so it belongs to no universe backup - and is still the account's.
        Assert.Empty((await Backup(client, universe.Id)).Payload.Ideas!);
        Assert.Equal("Words that outlive it.", Assert.Single((await ListIdeas(client, "?unassigned=true")).Items).Excerpt);
    }

    [Fact]
    public void A_version_10_file_still_reads_and_holds_no_ideas()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 10,
              "generatedAt": "2026-09-14T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7f1c2e3b-4d5e-4f6a-8b7c-9d0e1f2a3b4c", "name": "Old world", "description": null, "accentColor": null,
                  "isArchived": false, "createdAt": "2026-09-14T00:00:00Z", "updatedAt": "2026-09-14T00:00:00Z"
                },
                "chronologyEras": [],
                "entityTypes": [],
                "tags": [],
                "entities": [],
                "relationshipTypes": [],
                "relationships": [],
                "timelineEntries": [],
                "stories": [],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(10, backup.FormatVersion);
        Assert.Null(backup.Payload.Ideas);
        Assert.Empty(backup.Payload.Stories!);
    }
}
