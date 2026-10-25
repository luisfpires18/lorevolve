using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Restore;
using Lorex.Api.Features.RuleValidation;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;
using static Lorex.Api.Tests.RuleValidationTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// World rule checks in the backup (ADR 0034, ADR 0014, ADR 0032): format version 13 carries the event kinds and methods, each
/// rule's check and each moment's details by id and nothing a check found; a restore gives them all new ids inside the new
/// universe, counts the same violation again and keeps its dismissal; a version 12 file holds none; a shape the format does not
/// allow is refused before anything is written.
/// </summary>
public sealed class RuleValidationBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task Terms_checks_and_details_travel_by_id_and_nothing_a_check_found_does()
    {
        var world = await NewCheckedWorld(_factory, "rvbexport");
        var client = world.Client;
        var u = world.Universe;
        var first = await world.Occurrence("First", world.Arlen);
        var second = await world.Occurrence("Second", world.Arlen);
        await world.Occurrence("Whose?", null);
        var plain = await CreateMoment(client, u, Moment("An ordinary day", null));
        await WorldRuleTestClient.CreateRule(client, u, "Words only");

        var raw = DocumentText(await RawArchive(client, u));
        var backup = JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;
        var payload = backup.Payload;

        Assert.Equal(33, backup.FormatVersion);
        Assert.Equal(
            [(world.Resurrection, ValidationTermKind.EventKind, "Resurrection"), (world.RiteOfAsh, ValidationTermKind.Method, "Rite of Ash"), (world.SevenStones, ValidationTermKind.Method, "Seven Stones")],
            payload.ValidationTerms!.Select(term => (term.Id, term.Kind, term.Name)));

        var checkedRule = payload.WorldRules!.Single(rule => rule.Id == world.Rule.Id);
        Assert.Equal(new BackupWorldRuleValidation(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, world.Resurrection, world.RiteOfAsh, 1), checkedRule.Validation);
        Assert.Null(payload.WorldRules!.Single(rule => rule.Title == "Words only").Validation);

        Assert.Equal(new BackupTimelineValidation(world.Resurrection, world.RiteOfAsh, world.Arlen), payload.TimelineEntries.Single(entry => entry.Id == second.Id).Validation);
        Assert.Equal(new BackupTimelineValidation(world.Resurrection, world.RiteOfAsh, null), payload.TimelineEntries.Single(entry => entry.Title == "Whose?").Validation);
        Assert.Null(payload.TimelineEntries.Single(entry => entry.Id == plain.Id).Validation);
        Assert.Contains(payload.TimelineEntries, entry => entry.Id == first.Id);

        using (var document = JsonDocument.Parse(raw))
        {
            var root = document.RootElement.GetProperty("payload");
            Assert.Equal(["id", "kind", "name", "createdAt", "updatedAt"], root.GetProperty("validationTerms")[0].EnumerateObject().Select(property => property.Name));
            var check = root.GetProperty("worldRules").EnumerateArray().Single(rule => rule.GetProperty("validation").ValueKind == JsonValueKind.Object).GetProperty("validation");
            Assert.Equal(["kind", "eventKindTermId", "methodTermId", "maxOccurrences"], check.EnumerateObject().Select(property => property.Name));
            Assert.Equal("MaxOccurrencesPerParticipantAndMethod", check.GetProperty("kind").GetString());
        }

        // Nothing derived: no check state, no count, no normalized name, and the pending finding is not carried.
        foreach (var derived in new[] { "outcome", "uncounted", "counted", "normalizedName", "CANON-WORLD-001", "participantsOverLimit" })
        {
            Assert.DoesNotContain(derived, raw, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Equal(PayloadText(raw), PayloadText(DocumentText(await RawArchive(client, u))));
    }

    [Fact]
    public async Task A_restore_gives_every_part_a_new_id_counts_the_same_violation_again_and_keeps_its_dismissal()
    {
        var world = await NewCheckedWorld(_factory, "rvbrestore");
        var client = world.Client;
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        await world.Occurrence("Whose?", null);
        var finding = Assert.Single(await world.Findings());
        (await client.PostAsync($"/api/universes/{world.Universe}/canon-conflicts/{finding.Id}/dismiss", null)).EnsureSuccessStatusCode();

        var archive = await RawArchive(client, world.Universe);
        var restored = await RestoreArchive(client, archive, "Restored rvbrestore");
        var copyArchive = await RawArchive(client, restored.Id);
        var copy = BackupOf(copyArchive).Payload;

        Assert.Empty(GuidsIn(DocumentOf(archive)).Intersect(GuidsIn(DocumentOf(copyArchive))));

        // Every reference resolves inside the restored universe.
        var terms = copy.ValidationTerms!.ToDictionary(term => term.Id, term => term.Name);
        var entities = copy.Entities.ToDictionary(entity => entity.Id, entity => entity.Name);
        var check = copy.WorldRules!.Single().Validation!;
        Assert.Equal(("Resurrection", "Rite of Ash", 1), (terms[check.EventKindTermId], terms[check.MethodTermId], check.MaxOccurrences));
        Assert.All(
            copy.TimelineEntries.Where(entry => entry.Title != "Whose?"),
            entry => Assert.Equal("Arlen", entities[entry.Validation!.ParticipantEntityId!.Value]));

        await WithDb(_factory, async db =>
        {
            var termIds = await db.ValidationTerms.Where(term => term.UniverseId == restored.Id).Select(term => term.Id).ToListAsync();
            Assert.Equal(3, termIds.Count);
            Assert.Empty(await db.WorldRuleValidations.Where(validation => validation.WorldRule!.UniverseId == restored.Id
                && (!termIds.Contains(validation.EventKindTermId) || !termIds.Contains(validation.MethodTermId))).ToListAsync());
            Assert.Empty(await db.TimelineEntryValidations.Where(details => details.TimelineEntry!.UniverseId == restored.Id
                && details.ParticipantEntity != null && details.ParticipantEntity.UniverseId != restored.Id).ToListAsync());
        });

        // The same logical finding, dismissed again as of when it was; the same check state.
        var again = Assert.Single(await Findings(client, restored.Id, CanonConflictStatus.Dismissed));
        Assert.Equal((finding.Title, finding.Explanation), (again.Title, again.Explanation));
        Assert.Empty(await Findings(client, restored.Id));

        var sourceCheck = (await world.ReadRule()).Check!;
        var copyCheck = (await WorldRuleTestClient.ReadRule(client, restored.Id, copy.WorldRules!.Single().Id)).Check!;
        Assert.Equal((sourceCheck.Outcome, sourceCheck.CountedMoments, sourceCheck.ParticipantsOverLimit, sourceCheck.UncountedMoments),
            (copyCheck.Outcome, copyCheck.CountedMoments, copyCheck.ParticipantsOverLimit, copyCheck.UncountedMoments));

        // Export, restore, export: the same world.
        Assert.Equal(Describe(BackupOf(archive), archive), Describe(BackupOf(copyArchive), copyArchive));
    }

    [Fact]
    public async Task A_version_12_backup_restores_with_no_check_and_no_details_even_when_its_file_carries_some()
    {
        var world = await NewCheckedWorld(_factory, "rvbversion");
        var client = world.Client;
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        var current = await RawArchive(client, world.Universe);

        var twelve = Downgrade(current, 12);
        Assert.DoesNotContain("validationTerms", DocumentOf(twelve), StringComparison.Ordinal);
        Assert.DoesNotContain("\"validation\"", DocumentOf(twelve), StringComparison.Ordinal);

        foreach (var file in new[]
        {
            twelve,

            // Lorex never wrote a version 12 file carrying these, so they are not part of what it says.
            Rewrite(twelve, root =>
            {
                var source = JsonNode.Parse(DocumentOf(current))!["payload"]!;
                Payload(root)["validationTerms"] = source["validationTerms"]!.DeepClone();
                Payload(root)["worldRules"]![0]!["validation"] = source["worldRules"]![0]!["validation"]!.DeepClone();
                foreach (var (entry, index) in Payload(root)["timelineEntries"]!.AsArray().Select((entry, index) => (entry, index)))
                {
                    entry!["validation"] = source["timelineEntries"]![index]!["validation"]?.DeepClone();
                }
            }),
        })
        {
            var restored = await RestoreArchive(client, file, $"Restored rvbversion {Guid.NewGuid():n}");
            var copy = BackupOf(await RawArchive(client, restored.Id)).Payload;

            Assert.Empty(copy.ValidationTerms!);
            Assert.Null(Assert.Single(copy.WorldRules!).Validation);
            Assert.All(copy.TimelineEntries, entry => Assert.Null(entry.Validation));
            Assert.Null((await WorldRuleTestClient.ReadRule(client, restored.Id, copy.WorldRules![0].Id)).Check);
            Assert.Empty(await Findings(client, restored.Id, null));
        }
    }

    [Fact]
    public async Task A_term_check_or_details_the_format_does_not_allow_is_refused_and_nothing_is_created()
    {
        var world = await NewCheckedWorld(_factory, "rvbinvalid");
        var client = world.Client;
        await world.Occurrence("First", world.Arlen);
        var archive = await RawArchive(client, world.Universe);
        var before = (await Universes(client)).Count;

        static JsonArray TermList(JsonObject root) => Payload(root)["validationTerms"]!.AsArray();
        static JsonObject Check(JsonObject root) => Payload(root)["worldRules"]![0]!["validation"]!.AsObject();
        static JsonObject MomentDetails(JsonObject root) => Payload(root)["timelineEntries"]![0]!["validation"]!.AsObject();

        var method = world.RiteOfAsh.ToString();
        var eventKind = world.Resurrection.ToString();

        await Refuses(Rewrite(archive, root => TermList(root)[0]!["name"] = "  "), BackupIssueCodes.MissingMember, "event kind or method");
        await Refuses(Rewrite(archive, root => TermList(root)[0]!["name"] = new string('n', RuleValidationLimits.TermNameMaxLength + 1)), BackupIssueCodes.TooLong, "name");
        await Refuses(Rewrite(archive, root => TermList(root)[2]!["name"] = "RITE OF ASH"), BackupIssueCodes.Duplicate, "same name as another method");
        await Refuses(Rewrite(archive, root => TermList(root)[1]!["id"] = world.Arlen.ToString()), BackupIssueCodes.DuplicateId, "event kind or method");
        await Refuses(Rewrite(archive, root => Check(root)["eventKindTermId"] = method), BackupIssueCodes.MissingReference, "limits an event kind");
        await Refuses(Rewrite(archive, root => Check(root)["methodTermId"] = Guid.NewGuid().ToString()), BackupIssueCodes.MissingReference, "limits a method");
        await Refuses(Rewrite(archive, root => Check(root)["maxOccurrences"] = 0), BackupIssueCodes.InvalidValue, "limit");
        await Refuses(Rewrite(archive, root => MomentDetails(root)["methodTermId"] = eventKind), BackupIssueCodes.MissingReference, "described with a method");
        await Refuses(Rewrite(archive, root => MomentDetails(root)["participantEntityId"] = Guid.NewGuid().ToString()), BackupIssueCodes.MissingReference, "described with a participant");
        await Refuses(Rewrite(archive, root => Payload(root).Remove("validationTerms")), BackupIssueCodes.MissingMember, "event kinds and methods");

        Assert.Equal(before, (await Universes(client)).Count);

        async Task Refuses(byte[] file, string code, string fragment)
        {
            var refusal = await Refused(await Validate(client, file));
            Assert.Contains(refusal.Issues, issue => issue.Code == code && issue.Message.Contains(fragment, StringComparison.OrdinalIgnoreCase));
        }
    }
}
