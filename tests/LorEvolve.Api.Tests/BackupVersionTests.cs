using System.Text.Json.Nodes;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Restore;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Every format version LorEvolve has written restores (ADR 0032, ADR 0014). Each older file is a real export rewritten as that
/// version would have written it, and restores with exactly what that version carried - normalized into the current shape
/// the way the migration that introduced each change normalized a live database: an article on the entry becomes the
/// article's version 1, a manuscript its own version 1, a year before eras a plain year, an icon from before the closed set
/// a key or nothing.
/// </summary>
public sealed class BackupVersionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(8)]
    [InlineData(9)]
    [InlineData(10)]
    [InlineData(11)]
    [InlineData(12)]
    [InlineData(13)]
    [InlineData(14)]
    [InlineData(15)]
    [InlineData(16)]
    [InlineData(17)]
    public async Task A_backup_of_every_version_restores_with_what_that_version_carried(int version)
    {
        var client = await SignedIn(_factory, $"version-{version}");
        var world = await BuildPlainWorld(client, $"Plain v{version}");
        var current = await RawArchive(client, world.Universe.Id);
        var source = BackupOf(current).Payload;
        var file = Downgrade(current, version);

        var validated = await Validated(client, file);
        Assert.Equal(version, validated.Preview.FormatVersion);

        var restored = await Restored(client, validated.Token, $"Plain v{version} restored");
        var copy = BackupOf(await RawArchive(client, restored.Id)).Payload;

        // What every version carried.
        Assert.Equal(source.Entities.Select(entity => entity.Name).Order(StringComparer.Ordinal), copy.Entities.Select(entity => entity.Name).Order(StringComparer.Ordinal));
        var sourceWarden = source.Entities.Single(entity => entity.Name == "Alenna Vance");
        var warden = copy.Entities.Single(entity => entity.Name == "Alenna Vance");
        Assert.Equal(["The Warden"], warden.Aliases);
        Assert.Equal(sourceWarden.Revisions.Count, warden.Revisions.Count);
        Assert.Equal((sourceWarden.CreatedAt, sourceWarden.UpdatedAt), (warden.CreatedAt, warden.UpdatedAt));
        Assert.Single(copy.Relationships);
        Assert.Contains("The seawall remembers.", warden.Content, StringComparison.Ordinal);

        var born = Assert.Single(warden.FieldValues);
        Assert.Equal(40, born.NumberValue);
        var moment = Assert.Single(copy.TimelineEntries);
        Assert.Equal(45, moment.StartYear);

        // Eras and constraints from version 4; before it, plain years and no rule.
        Assert.Equal(version >= 4 ? 1 : 0, copy.ChronologyEras!.Count);
        Assert.Equal(version >= 4, born.EraId is not null);
        Assert.Equal(version >= 4, moment.StartEraId is not null);
        Assert.Equal(version >= 4 ? RelationshipAgeOrder.SourceOlder : RelationshipAgeOrder.None, copy.RelationshipTypes.Single(type => type.Name == "rules").AgeOrder);

        // The picture from version 3, when a backup became an archive.
        Assert.Equal(version >= 3, warden.Image is not null);

        // The article's own history from version 9; before it, the article becomes its version 1, dated as the entry was.
        if (version >= 9)
        {
            Assert.Equal(sourceWarden.ArticleRevisions!.Select(revision => (revision.Number, revision.Kind, revision.CreatedAt, revision.Content)),
                warden.ArticleRevisions!.Select(revision => (revision.Number, revision.Kind, revision.CreatedAt, revision.Content)));
            Assert.Equal(sourceWarden.ArticleUpdatedAt, warden.ArticleUpdatedAt);
        }
        else
        {
            var only = Assert.Single(warden.ArticleRevisions!);
            Assert.Equal((1, EntityRevisionKind.Created, sourceWarden.UpdatedAt, sourceWarden.Content), (only.Number, only.Kind, only.CreatedAt, only.Content));
            Assert.Equal(sourceWarden.UpdatedAt, warden.ArticleUpdatedAt);
        }

        // Stories from 5, plot from 7, prose from 8, its versions from 10.
        if (version < 5)
        {
            Assert.Empty(copy.Stories!);
        }
        else
        {
            var story = Assert.Single(copy.Stories!);
            Assert.Equal(["Cold Open", "The Council"], story.Scenes.Select(scene => scene.Title));
            Assert.Equal([0, 1], story.Scenes.Select(scene => scene.SortOrder));
            Assert.All(story.Scenes, scene => Assert.Null(scene.ChapterId));
            Assert.Equal(version >= 7 ? 1 : 0, story.PlotArcs!.Count);

            var prose = story.Scenes[0].Manuscript;
            if (version < 8)
            {
                Assert.Null(prose);
            }
            else
            {
                Assert.Equal("Snow on the seawall.", prose!.Content);
                Assert.Equal(version >= 10 ? [1, 2] : [1], prose.Revisions!.Select(revision => revision.Number));
                Assert.Equal("Snow on the seawall.", prose.Revisions![^1].Content);

                if (version < 10)
                {
                    Assert.Equal((SceneManuscriptRevisionKind.Created, prose.UpdatedAt), (prose.Revisions![0].Kind, prose.Revisions[0].CreatedAt));
                }
            }
        }

        // Ideas from 11.
        Assert.Equal(version >= 11 ? 1 : 0, copy.Ideas!.Count);

        // World rules from 12.
        Assert.Equal(version >= 12 ? ["Returns once", "The Veil holds"] : [], copy.WorldRules!.Select(rule => rule.Title));

        // Event kinds, methods, a rule's check and a moment's details from 13. Before it, none: no rule is checked and no moment
        // described, and nothing is guessed from the rule called "Returns once" or the moment's participants.
        Assert.Equal(version >= 13 ? ["Return", "Rite"] : [], copy.ValidationTerms!.Select(term => term.Name));
        Assert.Equal(version >= 13, copy.WorldRules!.Any(rule => rule.Validation is not null));
        Assert.Equal(version >= 13 ? warden.Id : (Guid?)null, moment.Validation?.ParticipantEntityId);

        // A relation kind's family meaning from 14. Before it none, and nothing is read from the kind called "bore".
        Assert.Equal(
            version >= 14 ? RelationshipFamilySemantic.BiologicalParent : RelationshipFamilySemantic.None,
            copy.RelationshipTypes.Single(type => type.Name == "bore").FamilySemantic);
        Assert.Equal(RelationshipFamilySemantic.None, copy.RelationshipTypes.Single(type => type.Name == "rules").FamilySemantic);
    }

    [Fact]
    public async Task A_version_2_backup_keeps_its_Trash_and_a_version_1_backup_holds_nothing_trashed()
    {
        var client = await SignedIn(_factory, "version-trash");
        var world = await BuildPlainWorld(client, "Plain trash");
        var heir = await CreateEntity(client, world.Universe.Id, "Lost Heir");
        (await client.DeleteAsync($"/api/universes/{world.Universe.Id}/entities/{heir}")).EnsureSuccessStatusCode();
        var current = await RawArchive(client, world.Universe.Id);

        var two = await RestoreArchive(client, Downgrade(current, 2), "Plain trash two");
        Assert.NotNull(BackupOf(await RawArchive(client, two.Id)).Payload.Entities.Single(entity => entity.Name == "Lost Heir").DeletedAt);

        // Version 1 had no Trash, so a marker in such a file is not part of what it says.
        var one = Downgrade(current, 1);
        var withMarker = System.Text.Encoding.UTF8.GetBytes(Rewritten(one, root => EntityNamed(root, "Lost Heir")["deletedAt"] = "2026-01-01T00:00:00Z"));
        var restored = await RestoreArchive(client, withMarker, "Plain trash one");
        Assert.Null(BackupOf(await RawArchive(client, restored.Id)).Payload.Entities.Single(entity => entity.Name == "Lost Heir").DeletedAt);
    }

    [Fact]
    public async Task A_members_newer_than_the_files_version_are_not_read()
    {
        var client = await SignedIn(_factory, "version-projection");
        var world = await BuildPlainWorld(client, "Plain projection");
        var current = await RawArchive(client, world.Universe.Id);

        // A version 4 file carrying stories was not written by LorEvolve; what version 4 means is what is restored.
        var stories = JsonNode.Parse(DocumentOf(current))!["payload"]!["stories"]!.DeepClone();
        var four = Rewrite(Downgrade(current, 4), root => Payload(root)["stories"] = stories);

        var restored = await RestoreArchive(client, four, "Plain projection restored");
        Assert.Empty(BackupOf(await RawArchive(client, restored.Id)).Payload.Stories!);
    }

    [Fact]
    public async Task An_icon_from_before_the_closed_set_is_kept_as_a_key_or_cleared_as_the_migration_did()
    {
        var client = await SignedIn(_factory, "version-icons");
        var world = await BuildPlainWorld(client, "Plain icons");
        var three = Rewrite(Downgrade(await RawArchive(client, world.Universe.Id), 3), root =>
        {
            var types = Payload(root)["entityTypes"]!.AsArray();
            types.First(type => (string?)type!["name"] == "Character")!["icon"] = "  Character ";
            types.First(type => (string?)type!["name"] == "Location")!["icon"] = "a castle drawn by hand";
        });

        var restored = await RestoreArchive(client, three, "Plain icons restored");
        var types = BackupOf(await RawArchive(client, restored.Id)).Payload.EntityTypes;

        Assert.Equal("character", types.Single(type => type.Name == "Character").Icon);
        Assert.Null(types.Single(type => type.Name == "Location").Icon);
    }

    private static string Rewritten(byte[] document, Action<JsonObject> change)
    {
        var root = JsonNode.Parse(document)!.AsObject();
        change(root);
        return root.ToJsonString();
    }
}
