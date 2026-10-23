using Lorex.Api.Features.Export;
using Lorex.Api.Features.Restore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The strongest claim a restore makes: a world exported, validated and restored as a new universe, then exported again,
/// says exactly what the original said - every entry, value, version, article, picture, relationship, moment, story,
/// chapter, scene, order, prose version, beat, idea, world rule, Trash marker, timestamp and dismissal - under ids that share nothing
/// with the original's (ADR 0032).
/// </summary>
public sealed class BackupRoundTripTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_restored_universe_exports_the_same_world_under_ids_it_shares_with_nothing()
    {
        var client = await SignedIn(_factory, "roundtrip");
        var world = await BuildRichWorld(client, "Tidewatch roundtrip");

        var original = await RawArchive(client, world.Universe.Id);
        var validated = await Validated(client, original);
        var restored = await Restored(client, validated.Token, "Tidewatch restored");

        Assert.NotEqual(world.Universe.Id, restored.Id);

        var copy = await RawArchive(client, restored.Id);
        var before = Describe(BackupOf(original), original);
        var after = Describe(BackupOf(copy), copy);

        // Line by line, so a failure names the first fact that changed.
        Assert.Equal(before.Count, after.Count);
        for (var index = 0; index < before.Count; index++)
        {
            Assert.Equal(before[index], after[index]);
        }

        // Every id in the copy is new: the universe, every object, every version, every picture.
        var originalText = DocumentOf(original);
        var copyText = DocumentOf(copy);
        Assert.Empty(GuidsIn(originalText).Intersect(GuidsIn(copyText)));

        // Only the pictures the document names, at the paths built from the new ids.
        Assert.Equal(
            BackupOf(copy).Payload.Entities.Where(entity => entity.Image is not null).Select(entity => entity.Image!.MediaPath).Order(StringComparer.Ordinal),
            Entries(copy).Keys.Where(path => path != BackupArchive.DocumentPath).Order(StringComparer.Ordinal));

        // And the thing that was described really is a world of this breadth, not an empty one that matched itself.
        var counts = validated.Preview.Counts;
        Assert.Equal(26, validated.Preview.FormatVersion);
        Assert.True(counts.Entries >= 4 && counts.EntriesInTrash == 1 && counts.EntryVersions >= 5);
        Assert.Equal((1, 3, 1), (counts.Images, counts.ArticleVersions, counts.Articles));
        Assert.Equal((2, 3, 2), (counts.Eras, counts.RelationshipTypes, counts.Relationships));
        Assert.Equal((1, 1, 4, 1, 2), (counts.Stories, counts.Chapters, counts.Scenes, counts.PlotArcs, counts.PlotBeats));
        Assert.Equal((2, 3), (counts.Manuscripts, counts.ManuscriptVersions));
        Assert.Equal(4, counts.StoryItemsInTrash);
        Assert.Equal((1, 1, 2), (counts.Ideas, counts.IdeasDeleted, counts.DismissedConflicts));
        Assert.Equal((2, 1), (counts.WorldRules, counts.WorldRulesInTrash));
        Assert.Contains(before, line => line.StartsWith("world rule Teleportation cannot cross the Veil", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("world rule The tide returns no one twice", StringComparison.Ordinal)
            && line.EndsWith("check=MaxOccurrencesPerParticipantAndMethod EventKind:Return from the tide Method:Salt rite 1", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("moment Alenna walks out of the sea again", StringComparison.Ordinal)
            && line.EndsWith("details=EventKind:Return from the tide/Method:Salt rite/Alenna Vance", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("term Method Unused method 北の門", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("dismissed CANON-WORLD-001", StringComparison.Ordinal));
        Assert.DoesNotContain(before, line => line.Contains("Another world's rule", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("relation kind raised", StringComparison.Ordinal)
            && line.Contains("family=AdoptiveParent", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("relation kind rules", StringComparison.Ordinal)
            && line.Contains("family=None", StringComparison.Ordinal));
        Assert.Contains(before, line => line.StartsWith("dismissed CANON-REL-001", StringComparison.Ordinal));
        Assert.DoesNotContain(before, line => line.Contains("Unassigned thought", StringComparison.Ordinal));
    }

    [Fact]
    public void The_importer_reads_exactly_the_versions_the_exporter_has_written()
    {
        // Bumping the export without teaching the importer what the new version means fails here first.
        Assert.Equal(UniverseBackup.CurrentVersion, BackupFormatSupport.MaxVersion);
        Assert.Equal(1, BackupFormatSupport.MinVersion);
    }
}
