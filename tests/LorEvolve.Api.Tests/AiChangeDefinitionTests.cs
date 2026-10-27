using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Phase 2 of issue 59 (ADR 0062): relationship kinds, the reckoning, event kinds and methods proposed as schema, approved,
/// and then used by content in a second proposal - and every change that would reinterpret what is already linked or dated
/// refused with its reason, nothing written.
/// </summary>
public sealed class AiChangeDefinitionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        return (owner, ownerId, (await CreateUniverse(owner, $"World {tag}")).Id);
    }

    private static AiChangeOperationInput Kind(string key, string name, string? inverse = null, bool? symmetric = null) =>
        new(key, "create", "relationship_kind", RelationshipKind: new AiRelationshipKindInput(name, inverse, symmetric));

    private static async Task<ChronologyResponse> Reckoning(HttpClient client, Guid u) =>
        (await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{u}/chronology"))!;

    [Fact]
    public async Task A_new_relationship_kind_is_approved_and_then_used_and_one_in_use_keeps_its_direction()
    {
        var (owner, ownerId, u) = await World("defkind");
        var proposalId = await StagedSchema(_factory, u, ownerId, Kind("sworn", "sworn to", "liege of"), Kind("kin", "kin of", symmetric: true));
        var review = await Read(owner, u, proposalId);
        Assert.Equal("New relationship kind: sworn to", review.Operations[0].Title);
        Assert.Contains(review.Operations[1].Lines, line => line.Label == "Reads back as" && line.After == "The same both ways");
        var made = (await ApproveAll(owner, u, proposalId)).Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);

        // The second stage: a relationship of the new kind.
        var squire = await CreateEntity(owner, u, "Squire");
        var knight = await CreateEntity(owner, u, "Knight");
        var link = await Staged(_factory, u, ownerId, NewLink("oath", made["sworn"], Id(squire), Id(knight)));
        await ApproveAll(owner, u, link);
        await WithDb(_factory, async db => Assert.True(await db.Relationships.AnyAsync(row => row.RelationshipTypeId == made["sworn"] && row.SourceEntityId == squire)));

        // Rewording a kind in use is fine and shown as such; turning it symmetric would reread every link, so it is refused.
        var flip = await StageSchema(_factory, u, ownerId, new AiChangeOperationInput("flip", "update", "relationship_kind", made["sworn"], RelationshipKind: new AiRelationshipKindInput(Symmetric: true)));
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single(flip.Issues).Code);
        var reword = await StagedSchema(_factory, u, ownerId, new AiChangeOperationInput("reword", "update", "relationship_kind", made["sworn"], RelationshipKind: new AiRelationshipKindInput(InverseName: "lord of")));
        Assert.Contains((await Read(owner, u, reword)).Operations.Single().Lines, line => line.Label == "Reads back as" && line.Before == "liege of" && line.After == "lord of");

        // An unused kind may still change direction; names stay unique; nothing is deleted here.
        var refused = await StageSchema(
            _factory,
            u,
            ownerId,
            Kind("again", "sworn to", "liege of"),
            Remove("drop", "relationship_kind", made["kin"]));
        Assert.Contains(refused.Issues, issue => issue.Id == "again" && issue.Code == AiChangeCodes.Duplicate);
        Assert.Contains(refused.Issues, issue => issue.Id == "drop" && issue.Code == AiChangeCodes.Unsupported);
        Assert.NotNull((await StageSchema(_factory, u, ownerId, new AiChangeOperationInput("dir", "update", "relationship_kind", made["kin"], RelationshipKind: new AiRelationshipKindInput(Symmetric: false, InverseName: "kin of")))).Proposal);
    }

    [Fact]
    public async Task A_kinds_family_meaning_and_age_rules_stay_the_authors_through_an_ai_edit()
    {
        var (owner, ownerId, u) = await World("defkindmeaning");
        var parent = await PostJson<RelationshipTypeResponse>(owner, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest(
            "parent of", "child of", false, null, null, new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, null), RelationshipFamilySemantic.BiologicalParent));

        var edit = await StagedSchema(_factory, u, ownerId, new AiChangeOperationInput("rename", "update", "relationship_kind", parent.Id, RelationshipKind: new AiRelationshipKindInput(Name: "father or mother of")));
        await ApproveAll(owner, u, edit);

        var after = (await owner.GetFromJsonAsync<List<RelationshipTypeResponse>>($"/api/universes/{u}/relationship-types"))!.Single(type => type.Id == parent.Id);
        Assert.Equal("father or mother of", after.Name);
        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, after.FamilySemantic);
        Assert.Equal((RelationshipAgeOrder.SourceOlder, 12), (after.CanonConstraints.AgeOrder, after.CanonConstraints.MinAgeDifferenceYears));
    }

    [Fact]
    public async Task Date_periods_are_added_then_used_and_nothing_already_dated_is_moved()
    {
        var (owner, ownerId, u) = await World("deferas");
        var ages = await StagedSchema(_factory, u, ownerId, new AiChangeOperationInput("ages", "update", "chronology", Chronology: new AiChronologyInput(
            [new AiDatePeriodInput(Name: "First Age", Abbreviation: "FA"), new AiDatePeriodInput(Name: "Second Age", Abbreviation: "SA")])));
        Assert.Contains((await Read(owner, u, ages)).Operations.Single().Lines, line => line.Label == "Date periods" && line.Before == null && line.After == "1. First Age (FA) · 2. Second Age (SA)");
        await ApproveAll(owner, u, ages);
        var eras = (await Reckoning(owner, u)).Eras;
        Assert.Equal(["First Age", "Second Age"], eras.Select(era => era.Name));

        // The second stage: a moment dated in the new period.
        var moment = await Staged(_factory, u, ownerId, new AiChangeOperationInput("fall", "create", "timeline_event", Timeline: new AiTimelineInput(
            "The Fall", Date: new AiTimelineDateInput("exact", StartYear: 590, StartEraId: eras[0].Id))));
        await ApproveAll(owner, u, moment);

        AiChangeOperationInput Change(params AiDatePeriodInput[] list) => new("c", "update", "chronology", Chronology: new AiChronologyInput(list));
        var first = new AiDatePeriodInput(eras[0].Id);
        var second = new AiDatePeriodInput(eras[1].Id);

        // Reordering, leaving one out and turning a dated period around are refused; renaming, adding and turning an unused
        // period around are not.
        Assert.Contains((await StageSchema(_factory, u, ownerId, Change(second, first))).Issues, issue => issue.Message.Contains("keep their order", StringComparison.Ordinal));
        Assert.Contains((await StageSchema(_factory, u, ownerId, Change(first))).Issues, issue => issue.Message.Contains("has to stay", StringComparison.Ordinal));
        Assert.Contains((await StageSchema(_factory, u, ownerId, Change(first with { Direction = "descending" }, second))).Issues, issue => issue.Message.Contains("First Age", StringComparison.Ordinal));
        Assert.Contains((await StageSchema(_factory, u, ownerId, Change(first, second, new AiDatePeriodInput(Guid.NewGuid(), "Stray")))).Issues, issue => issue.Code == AiChangeCodes.NotFound);
        var fine = await StagedSchema(_factory, u, ownerId, Change(
            new AiDatePeriodInput(Name: "Years of the Trees", Direction: "descending"),
            first with { Name = "Elder Days" },
            second with { Direction = "descending" },
            new AiDatePeriodInput(Name: "Third Age", Abbreviation: "TA", Label: "after")));
        await ApproveAll(owner, u, fine);
        var now = (await Reckoning(owner, u)).Eras;
        Assert.Equal(["Years of the Trees", "Elder Days", "Second Age", "Third Age"], now.Select(era => era.Name));
        Assert.Equal(eras[0].Id, now[1].Id);
        Assert.Equal(ChronologyEraDirection.Descending, now[2].Direction);
        Assert.Equal(ChronologyLabelPosition.AfterYear, now[3].LabelPosition);
        await WithDb(_factory, async db => Assert.Equal(eras[0].Id, await db.TimelineEntries.Where(entry => entry.UniverseId == u && entry.Title == "The Fall").Select(entry => entry.StartEraId).SingleAsync()));
    }

    [Fact]
    public async Task A_calendar_never_starts_over_month_numbers_already_used_and_its_months_keep_their_order()
    {
        var (owner, ownerId, u) = await World("defcalendar");
        AiChangeOperationInput Months(params AiMonthInput[] months) => new("m", "update", "chronology", Chronology: new AiChronologyInput(Months: months));

        var calendar = await StagedSchema(_factory, u, ownerId, Months(new AiMonthInput(Name: "Afteryule", Days: 30), new AiMonthInput(Name: "Solmath", Days: 30)));
        await ApproveAll(owner, u, calendar);
        var months = (await Reckoning(owner, u)).Calendar!.Months;
        Assert.Equal(["Afteryule", "Solmath"], months.Select(month => month.Name));

        Assert.Contains((await StageSchema(_factory, u, ownerId, Months(new AiMonthInput(months[1].Id), new AiMonthInput(months[0].Id)))).Issues, issue => issue.Message.Contains("keep their order", StringComparison.Ordinal));
        var longer = await StagedSchema(_factory, u, ownerId, Months(new AiMonthInput(months[0].Id), new AiMonthInput(months[1].Id, Days: 31), new AiMonthInput(Name: "Rethe", Days: 30)));
        await ApproveAll(owner, u, longer);
        Assert.Equal([30, 31, 30], (await Reckoning(owner, u)).Calendar!.Months.Select(month => month.DayCount));

        // In another universe, a simple date already uses month 3: no calendar from an AI there.
        var (_, _, plain) = (owner, ownerId, (await CreateUniverse(owner, "Plain dates")).Id);
        await PostJson<TimelineEntryResponse>(owner, $"/api/universes/{plain}/timeline", new TimelineEntryRequest("Harvest", null, LorEvolve.Api.Features.Lore.CanonStatus.Draft, TimelineDateKind.Exact, 10, 3, 1, null, null, null, null, null));
        var refused = await StageSchema(_factory, plain, ownerId, Months(new AiMonthInput(Name: "One", Days: 30), new AiMonthInput(Name: "Two", Days: 30), new AiMonthInput(Name: "Three", Days: 30)));
        Assert.Contains(refused.Issues, issue => issue.Code == AiChangeCodes.Unsupported && issue.Message.Contains("simple month numbers", StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_reckoning_changed_by_hand_after_staging_can_only_be_rejected()
    {
        var (owner, ownerId, u) = await World("defstale");
        var proposalId = await StagedSchema(_factory, u, ownerId, new AiChangeOperationInput("c", "update", "chronology", Chronology: new AiChronologyInput([new AiDatePeriodInput(Name: "Dawn")])));
        (await owner.PutAsJsonAsync($"/api/universes/{u}/chronology", new ChronologyRequest([new ChronologyEraRequest(null, "Dusk", null, ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]))).EnsureSuccessStatusCode();

        var proposal = await Read(owner, u, proposalId);
        Assert.True(proposal.Operations.Single().IsConflict);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(await Approve(owner, u, proposal, ["c"])));
        Assert.Equal(["Dusk"], (await Reckoning(owner, u)).Eras.Select(era => era.Name));
    }

    [Fact]
    public async Task Event_kinds_and_methods_are_approved_then_named_by_a_rule_and_keep_their_kind()
    {
        var (owner, ownerId, u) = await World("defterms");
        var proposalId = await StagedSchema(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("death", "create", "event_kind", Term: new AiTermInput("Death")),
            new AiChangeOperationInput("blade", "create", "method", Term: new AiTermInput("Morgul blade")));
        var review = await Read(owner, u, proposalId);
        Assert.Equal(["New event kind: Death", "New method: Morgul blade"], review.Operations.Select(operation => operation.Title));
        var made = (await ApproveAll(owner, u, proposalId)).Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);

        var rule = await Staged(_factory, u, ownerId, new AiChangeOperationInput("once", "create", "world_rule", WorldRule: new AiWorldRuleInput(
            "One death by the blade", "Nobody dies by a Morgul blade twice.", new AiRuleCheckInput(made["death"], made["blade"], 1))));
        await ApproveAll(owner, u, rule);
        await WithDb(_factory, async db => Assert.True(await db.WorldRules.AnyAsync(row => row.UniverseId == u && row.Validation!.EventKindTermId == made["death"])));

        var refused = await StageSchema(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("twin", "create", "event_kind", Term: new AiTermInput("  death ")),
            new AiChangeOperationInput("swap", "update", "method", made["death"], Term: new AiTermInput("Dying")),
            new AiChangeOperationInput("vague", "create", "term", Term: new AiTermInput("Oath")));
        Assert.Contains(refused.Issues, issue => issue.Id == "twin" && issue.Code == AiChangeCodes.Duplicate);
        Assert.Contains(refused.Issues, issue => issue.Id == "swap" && issue.Code == AiChangeCodes.Unsupported);
        Assert.Contains(refused.Issues, issue => issue.Id == "vague" && issue.Field == "resource");

        var renamed = await StagedSchema(_factory, u, ownerId, new AiChangeOperationInput("r", "update", "event_kind", made["death"], Term: new AiTermInput("Slaying")));
        await ApproveAll(owner, u, renamed);
        var terms = (await owner.GetFromJsonAsync<List<ValidationTermResponse>>($"/api/universes/{u}/validation-terms"))!;
        Assert.Equal((ValidationTermKind.EventKind, 1), terms.Where(term => term.Name == "Slaying").Select(term => (term.Kind, term.RuleCount)).Single());
    }

    [Fact]
    public async Task The_catalog_says_what_the_reckoning_dates_and_offers_only_safe_definition_changes()
    {
        var (_, ownerId, u) = await World("defcatalog");
        AiChangeOptions? options = null;
        await WithDb(_factory, async db => options = await AiChangeCatalog.ReadAsync(db, u, LorEvolve.Api.Features.Universes.UniverseRole.Owner, default, schemaAllowed: true));
        Assert.Contains("update chronology", options!.Allowed);
        Assert.DoesNotContain("create chronology", options.Allowed);
        Assert.Contains("create method", options.Allowed);
        Assert.Contains("create relationship_kind", options.Allowed);
        Assert.DoesNotContain(options.Allowed, allowed => allowed.StartsWith("remove relationship_kind", StringComparison.Ordinal));
        Assert.NotNull(options.Schema!.Chronology);
        Assert.False(options.Schema.Chronology!.SimpleMonthsInUse);
        _ = ownerId;
    }
}
