using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Restore;
using Lorex.Api.Features.Search;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.WorldRules;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;
using static Lorex.Api.Tests.WorldRuleTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// World rules in the backup: format version 12, and restoring it (ADR 0014, ADR 0032, ADR 0033).
///
/// The invariants under test: every rule of the universe travels - words exactly, those in the Trash marked after the live
/// ones - and nothing of another universe or of the search index; unchanged rules write unchanged bytes; a restore writes the
/// rules into the new universe under ids nothing else has, with their markers and moments, searchable at once and never
/// reachable through the source; twice is two sets; a rule the format does not allow is refused before anything is created;
/// and a version 11 file restores with no rules, even one carrying some.
/// </summary>
public sealed class WorldRuleBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task The_rules_of_a_universe_travel_whole_live_ones_first_and_those_in_the_Trash_marked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrbackup");
        var other = await CreateUniverse(client, "Other wrbackup");
        var empty = await CreateUniverse(client, "Empty wrbackup");
        var u = universe.Id;
        const string description = "  Not even the Old Ones.\n\n\tNo exceptions. 北の門 👩‍👩‍👧 & <b>not html</b>  ";

        var veil = await CreateRule(client, u, "Teleportation cannot cross the Veil", description);
        var bond = await CreateRule(client, u, "a bonded dragon dies if its rider dies");
        var binned = await CreateRule(client, u, "Binned rule", "Still recoverable.");
        await DeleteRule(client, u, binned.Id);
        await CreateRule(client, other.Id, "Another world's rule", "Belongs elsewhere.");

        var raw = DocumentText(await RawArchive(client, u));
        var backup = JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;

        Assert.Equal(25, backup.FormatVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        // Live ones by title as written, then the one in the Trash.
        var rules = backup.Payload.WorldRules!;
        Assert.Equal([(veil.Id, false), (bond.Id, false), (binned.Id, true)], rules.Select(rule => (rule.Id, rule.DeletedAt is not null)));

        Assert.Equal(("Teleportation cannot cross the Veil", description), (rules[0].Title, rules[0].Description));
        Assert.Equal((veil.CreatedAt, veil.UpdatedAt), (rules[0].CreatedAt, rules[0].UpdatedAt));
        Assert.Equal(DateTimeKind.Utc, rules[0].UpdatedAt.Kind);
        Assert.Equal(string.Empty, rules[1].Description);
        Assert.Equal("Still recoverable.", rules[2].Description);

        // Written as exactly these members, and nothing derived.
        using (var document = JsonDocument.Parse(raw))
        {
            var written = document.RootElement.GetProperty("payload").GetProperty("worldRules")[0];
            Assert.Equal(["id", "title", "description", "createdAt", "updatedAt", "deletedAt", "validation"], written.EnumerateObject().Select(property => property.Name));
        }

        Assert.DoesNotContain("Another world's rule", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("SearchIndex", raw, StringComparison.OrdinalIgnoreCase);

        // Unchanged rules, unchanged bytes; each universe holds only its own, and none is an empty list.
        Assert.Equal(PayloadText(raw), PayloadText(DocumentText(await RawArchive(client, u))));
        Assert.Equal(["Another world's rule"], (await Backup(client, other.Id)).Payload.WorldRules!.Select(rule => rule.Title));
        Assert.Contains("\"worldRules\":[]", PayloadText(DocumentText(await RawArchive(client, empty.Id))).Replace(" ", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_restore_writes_the_rules_into_the_new_universe_under_new_ids_with_their_Trash_and_twice_is_twice()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrrestore");
        var u = universe.Id;
        var veil = await CreateRule(client, u, "Teleportation cannot cross the Veil", "Not even the Quorrel wardens.");
        veil = await SaveRule(client, u, veil, description: "Not even the Quorrel wardens. 北の門");
        var binned = await CreateRule(client, u, "Binned Harrowgate rule", "Still recoverable.");
        await DeleteRule(client, u, binned.Id);

        var archive = await RawArchive(client, u);
        var source = BackupOf(archive).Payload.WorldRules!;

        var validated = await Validated(client, archive);
        Assert.Equal((25, 1, 1), (validated.Preview.FormatVersion, validated.Preview.Counts.WorldRules, validated.Preview.Counts.WorldRulesInTrash));

        var first = await Restored(client, validated.Token, "Restored wrrestore one");
        var second = await RestoreArchive(client, archive, "Restored wrrestore two");

        var seen = new HashSet<Guid> { veil.Id, binned.Id };

        foreach (var restored in new[] { first, second })
        {
            var copy = BackupOf(await RawArchive(client, restored.Id)).Payload.WorldRules!;

            // The same rules, words, markers and moments...
            Assert.Equal(
                source.Select(rule => (rule.Title, rule.Description, rule.CreatedAt, rule.UpdatedAt, rule.DeletedAt)),
                copy.Select(rule => (rule.Title, rule.Description, rule.CreatedAt, rule.UpdatedAt, rule.DeletedAt)));

            // ...under ids nothing else has.
            Assert.All(copy, rule => Assert.True(seen.Add(rule.Id)));

            // The live rule opens in the new universe and only there.
            var live = copy.Single(rule => rule.DeletedAt is null);
            var read = await ReadRule(client, restored.Id, live.Id);
            Assert.Equal(("Teleportation cannot cross the Veil", "Not even the Quorrel wardens. 北の門"), (read.Title, read.Description));
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Rule(u, live.Id))).StatusCode);

            // The one in the Trash waits in the new universe's Trash, and is not searchable until it comes back.
            var trashed = copy.Single(rule => rule.DeletedAt is not null);
            var trash = (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{restored.Id}/trash"))!;
            Assert.Contains(trash.Items, item => item.Kind == TrashItemKind.WorldRule && item.Id == trashed.Id);

            var found = Assert.Single((await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{restored.Id}/search?q=Quorrel"))!.Results);
            Assert.Equal((UniverseSearchKind.WorldRule, live.Id), (found.Kind, found.Id));
            Assert.Empty((await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{restored.Id}/search?q=Harrowgate"))!.Results);

            await RestoreRule(client, restored.Id, trashed.Id);
            Assert.Single((await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{restored.Id}/search?q=Harrowgate"))!.Results);
        }

        // The source is exactly as it was: its rules, its Trash, its search.
        Assert.Equal(PayloadText(DocumentText(archive)), PayloadText(DocumentText(await RawArchive(client, u))));
        Assert.Equal([veil.Id], (await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{u}/search?q=Quorrel"))!.Results.Select(result => result.Id));
    }

    [Fact]
    public async Task A_rule_the_format_does_not_allow_is_refused_and_nothing_is_created()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrinvalid");
        var u = universe.Id;
        var entity = await CreateEntity(client, u, "Arlen");
        await CreateRule(client, u, "The Veil holds", "Words.");
        var archive = await RawArchive(client, u);
        var before = (await Universes(client)).Count;

        static JsonObject FirstRule(JsonObject root) => Payload(root)["worldRules"]![0]!.AsObject();

        await Refuses(Rewrite(archive, root => FirstRule(root)["title"] = "   "), BackupIssueCodes.MissingMember, "world rule");
        await Refuses(Rewrite(archive, root => FirstRule(root)["title"] = new string('t', WorldRuleLimits.TitleMaxLength + 1)), BackupIssueCodes.TooLong, "title");
        await Refuses(Rewrite(archive, root => FirstRule(root)["description"] = new string('d', WorldRuleLimits.DescriptionMaxLength + 1)), BackupIssueCodes.TooLong, "description");
        await Refuses(Rewrite(archive, root => FirstRule(root)["description"] = null), BackupIssueCodes.MissingMember, "description");
        await Refuses(Rewrite(archive, root => FirstRule(root)["id"] = entity.ToString()), BackupIssueCodes.DuplicateId, "world rule");
        await Refuses(Rewrite(archive, root => Payload(root).Remove("worldRules")), BackupIssueCodes.MissingMember, "world rules");

        Assert.Equal(before, (await Universes(client)).Count);

        async Task Refuses(byte[] file, string code, string fragment)
        {
            var refusal = await Refused(await Validate(client, file));
            Assert.Contains(refusal.Issues, issue => issue.Code == code && issue.Message.Contains(fragment, StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public async Task A_version_11_backup_restores_with_no_rules_even_when_its_file_carries_some()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrversion");
        await CreateRule(client, universe.Id, "The Veil holds");
        var current = await RawArchive(client, universe.Id);

        var eleven = Downgrade(current, 11);
        Assert.DoesNotContain("worldRules", DocumentOf(eleven), StringComparison.Ordinal);

        var validated = await Validated(client, eleven);
        Assert.Equal((11, 0, 0), (validated.Preview.FormatVersion, validated.Preview.Counts.WorldRules, validated.Preview.Counts.WorldRulesInTrash));
        var restored = await Restored(client, validated.Token, "Restored wrversion eleven");
        Assert.Empty(BackupOf(await RawArchive(client, restored.Id)).Payload.WorldRules!);
        Assert.Empty((await ListRules(client, restored.Id)).Items);

        // Lorex never wrote a version 11 file holding rules, so rules in one are not part of what it says.
        var rules = JsonNode.Parse(DocumentOf(current))!["payload"]!["worldRules"]!.DeepClone();
        var carrying = Rewrite(eleven, root => Payload(root)["worldRules"] = rules);
        var projected = await RestoreArchive(client, carrying, "Restored wrversion carrying");
        Assert.Empty((await ListRules(client, projected.Id)).Items);
    }
}
