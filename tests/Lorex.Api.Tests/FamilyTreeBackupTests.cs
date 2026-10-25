using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Restore;
using static Lorex.Api.Tests.FamilyTreeTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Family meanings in the backup (ADR 0035, ADR 0014, ADR 0032): format version 14 carries the meaning an author configured on
/// each relation kind and nothing a family tree derives from it; a restore keeps every meaning under new ids and derives the
/// same trees; a version 13 file gives every kind no meaning at all, whatever it is called and whatever it carries; and a shape
/// the format does not allow is refused before anything is written.
/// </summary>
public sealed class FamilyTreeBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_family_meaning_is_written_by_name_and_nothing_derived_from_it_is()
    {
        var household = await NewHousehold(_factory, "ftbexport");
        await Kind(household.Family, "rules", inverseName: "ruled by");

        var raw = DocumentText(await RawArchive(household.Client, household.Universe));
        var backup = JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;

        Assert.Equal(Lorex.Api.Features.Export.UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(
            [
                ("bore", RelationshipFamilySemantic.BiologicalParent),
                ("raised", RelationshipFamilySemantic.AdoptiveParent),
                ("rules", RelationshipFamilySemantic.None),
            ],
            backup.Payload.RelationshipTypes.OrderBy(kind => kind.Name, StringComparer.Ordinal)
                .Select(kind => (kind.Name, kind.FamilySemantic)));

        using (var document = JsonDocument.Parse(raw))
        {
            var kinds = document.RootElement.GetProperty("payload").GetProperty("relationshipTypes");

            Assert.Equal(
                ["id", "name", "inverseName", "isSymmetric", "description", "displayOrder", "ageOrder", "minAgeDifferenceYears", "maxAgeDifferenceYears", "familySemantic", "createdAt", "updatedAt"],
                kinds[0].EnumerateObject().Select(property => property.Name));
            Assert.Equal(
                ["BiologicalParent", "AdoptiveParent", "None"],
                kinds.EnumerateArray().Select(kind => kind.GetProperty("familySemantic").GetString()));
        }

        // The authored links, and not one derived position: no sibling, grandparent, grandchild, circle or generation count.
        Assert.Equal(7, backup.Payload.Relationships.Count);
        // "familyTreeEligible" on a type is authored (version 18); a member called "familyTree" would be a derived tree.
        foreach (var derived in new[] { "sibling", "grandparent", "grandchild", "generationsEachWay", "loops", "\"familyTree\"", "connections" })
        {
            Assert.DoesNotContain(derived, raw, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Equal(PayloadText(raw), PayloadText(DocumentText(await RawArchive(household.Client, household.Universe))));
    }

    [Fact]
    public async Task A_restore_keeps_every_meaning_derives_the_same_trees_under_new_ids_and_twice_is_two_worlds()
    {
        var household = await NewHousehold(_factory, "ftbrestore");
        var client = household.Client;

        // A circle as well, dismissed, so the restore has a finding to re-apply over ids it has never seen.
        var arlen = await Person(household.Family, "Arlen");
        var brin = await Person(household.Family, "Brin");
        await Link(household.Family, household.Bore, arlen, brin);
        await Link(household.Family, household.Bore, brin, arlen);
        var circle = Assert.Single(await LoopFindings(household.Family));
        (await client.PostAsync($"/api/universes/{household.Universe}/canon-conflicts/{circle.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        var archive = await RawArchive(client, household.Universe);
        var names = new[] { "Nana", "Mara", "Oren", "Lia", "Tam", "Cai", "Pip", "Arlen", "Brin" };
        var sourceIds = EntityIds(BackupOf(archive));
        var source = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        foreach (var person in names)
        {
            source[person] = Describe(await Tree(client, household.Universe, sourceIds[person]));
        }

        var restored = new List<Guid>();

        foreach (var name in new[] { "Restored ftb one", "Restored ftb two" })
        {
            var universeId = (await RestoreArchive(client, archive, name)).Id;
            restored.Add(universeId);

            Assert.Equal(
                [
                    ("bore", RelationshipFamilySemantic.BiologicalParent),
                    ("raised", RelationshipFamilySemantic.AdoptiveParent),
                ],
                (await ListKinds(await InUniverse(client, universeId))).OrderBy(kind => kind.Name, StringComparer.Ordinal)
                    .Select(kind => (kind.Name, kind.FamilySemantic)));

            // The same family, described by name, under ids the original has never held.
            var copyIds = EntityIds(BackupOf(await RawArchive(client, universeId)));

            foreach (var person in names)
            {
                Assert.Equal(source[person], Describe(await Tree(client, universeId, copyIds[person])));
            }

            Assert.Empty(await LoopFindings(client, universeId));
            var again = Assert.Single(await LoopFindings(client, universeId, CanonConflictStatus.Dismissed));
            Assert.Equal((circle.Title, circle.Explanation), (again.Title, again.Explanation));
        }

        var first = DocumentOf(await RawArchive(client, restored[0]));
        var second = DocumentOf(await RawArchive(client, restored[1]));
        Assert.Empty(GuidsIn(DocumentOf(archive)).Intersect(GuidsIn(first)));
        Assert.Empty(GuidsIn(first).Intersect(GuidsIn(second)));
    }

    [Fact]
    public async Task A_version_13_backup_gives_every_kind_no_family_meaning_even_when_its_file_carries_one()
    {
        var household = await NewHousehold(_factory, "ftbversion");
        var client = household.Client;

        // A kind whose name says family and whose meaning is None: after a version 13 restore every kind is exactly as absent of
        // meaning as this one already was.
        await Kind(household.Family, "mother of", inverseName: "child of");

        var current = await RawArchive(client, household.Universe);
        var thirteen = Downgrade(current, 13);
        Assert.DoesNotContain("familySemantic", DocumentOf(thirteen), StringComparison.Ordinal);

        foreach (var file in new[]
        {
            thirteen,

            // Lorex never wrote a version 13 file carrying a family meaning, so one is not part of what such a file says.
            Rewrite(thirteen, root =>
            {
                foreach (var kind in Payload(root)["relationshipTypes"]!.AsArray())
                {
                    kind!["familySemantic"] = "BiologicalParent";
                }
            }),
        })
        {
            var restored = await RestoreArchive(client, file, $"Restored ftbversion {Guid.NewGuid():n}");
            var family = await InUniverse(client, restored.Id);

            Assert.All(await ListKinds(family), kind => Assert.Equal(RelationshipFamilySemantic.None, kind.FamilySemantic));

            var copy = BackupOf(await RawArchive(client, restored.Id));
            var tree = await Tree(client, restored.Id, EntityIds(copy)["Lia"]);
            Assert.Empty(tree.Links);
            Assert.Empty(tree.Parents);
            Assert.Empty(tree.Siblings);

            // Every link is still there; only the meaning that version could not carry is gone.
            Assert.Equal(7, copy.Payload.Relationships.Count);
        }
    }

    [Fact]
    public async Task A_family_meaning_the_format_does_not_allow_is_refused_and_nothing_is_created()
    {
        var household = await NewHousehold(_factory, "ftbinvalid");
        var client = household.Client;
        var archive = await RawArchive(client, household.Universe);
        var before = (await Universes(client)).Count;

        static JsonObject Bore(JsonObject root) =>
            Payload(root)["relationshipTypes"]!.AsArray().First(kind => (string?)kind!["name"] == "bore")!.AsObject();

        await Refuses(
            Rewrite(archive, root =>
            {
                Bore(root)["isSymmetric"] = true;
                Bore(root)["inverseName"] = null;
            }),
            BackupIssueCodes.InvalidValue,
            "parent side");

        await Refuses(
            Rewrite(archive, root => Bore(root)["familySemantic"] = 99),
            BackupIssueCodes.InvalidValue,
            "family meaning");

        Assert.Equal(before, (await Universes(client)).Count);

        async Task Refuses(byte[] file, string code, string fragment)
        {
            var refusal = await Refused(await Validate(client, file));
            Assert.Contains(
                refusal.Issues,
                issue => issue.Code == code && issue.Message.Contains(fragment, StringComparison.OrdinalIgnoreCase));
        }
    }

    /// <summary>Every entry of a backup by name, so a restored world can be found under ids nothing knew before.</summary>
    private static Dictionary<string, Guid> EntityIds(UniverseBackup backup) =>
        backup.Payload.Entities.ToDictionary(entity => entity.Name, entity => entity.Id, StringComparer.Ordinal);
}
