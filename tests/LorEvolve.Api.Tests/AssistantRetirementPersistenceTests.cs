using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What M4 keeps, and why (issue #159). The web assistant is gone, and the audit
/// (<c>docs/architecture/audits/2026-11-15-m4-assistant-retirement-audit.md</c>) found that it owned no table, column or
/// row of its own: its allowance was counted in this process's memory, and it stored no question and no answer. Two
/// things that carry its name are an author's, not the assistant's, so M4 writes no migration and drops nothing:
///
/// <list type="number">
/// <item><c>UniverseAiHelpOff</c> is the author's choice to hide this universe's AI, which after M4 is Connect to AI and
/// Pending AI Changes. Dropping it would turn both back on for every universe whose owner switched them off.</item>
/// <item><c>AiChangeSource.Assistant</c> is stamped on proposals authors reviewed. Its number must stay 1, or every one
/// of those rows reads as something else.</item>
/// </list>
///
/// These tests are that decision written where it fails if someone undoes it. Both items are left out of a backup on
/// purpose (<see cref="BackupInventoryTests"/>), which is checked here too, because that is why the retirement needed no
/// change to the backup format and no new format version.
/// </summary>
public sealed class AssistantRetirementPersistenceTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_AI_help_preference_outlives_the_assistant_as_a_row_of_the_authors_own()
    {
        var (client, _) = await PublishingTestClient.Account(_factory, "aihelpkept");
        var universe = await PostJson<UniverseDetail>(
            client,
            "/api/universes",
            new CreateUniverseRequest("Quiet world", null, null, AiHelp: false));
        Assert.False(universe.AiHelp);

        // The choice is a row beside Universes, as it was before M4, and nothing in M4 removed the table.
        await WithDb(_factory, async db => Assert.True(await db.UniverseAiHelpOff.AnyAsync(off => off.UniverseId == universe.Id)));

        // Turning it back on removes the row again: the author's switch still works both ways.
        var on = await client.PutAsJsonAsync($"/api/universes/{universe.Id}", new UpdateUniverseRequest("Quiet world", null, null, AiHelp: true));
        Assert.Equal(HttpStatusCode.OK, on.StatusCode);
        Assert.True((await on.Content.ReadFromJsonAsync<UniverseDetail>())!.AiHelp);
        await WithDb(_factory, async db => Assert.False(await db.UniverseAiHelpOff.AnyAsync(off => off.UniverseId == universe.Id)));
    }

    [Fact]
    public async Task A_proposal_the_retired_assistant_staged_still_reads_back_as_its_own_source()
    {
        // The number is what those rows hold, so it is asserted as a number and not as the name.
        Assert.Equal(1, (int)AiChangeSource.Assistant);

        var (owner, ownerId) = await PublishingTestClient.Account(_factory, "assistsourcekept");
        var u = (await CreateUniverse(owner, "World with an old proposal")).Id;
        var character = await TypeId(owner, u, "Character");
        var id = await Staged(_factory, u, ownerId, NewLore("left", character, "Left by the assistant"));

        await WithDb(_factory, async db =>
            Assert.Equal(AiChangeSource.Assistant, await db.AiChangeProposals.Where(row => row.Id == id).Select(row => row.Source).SingleAsync()));

        // And the review the author opens still says where it came from.
        Assert.Equal(AiChangeSource.Assistant, (await Read(owner, u, id)).Proposal.Source);
    }

    [Fact]
    public async Task Neither_kept_row_is_carried_into_a_restore_so_the_backup_format_did_not_move()
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, "aikeptbackup");
        var u = (await CreateUniverse(owner, "World backed up after M4")).Id;
        var character = await TypeId(owner, u, "Character");
        await Staged(_factory, u, ownerId, NewLore("waiting", character, "Waiting for review"));
        Assert.Equal(
            HttpStatusCode.OK,
            (await owner.PutAsJsonAsync($"/api/universes/{u}", new UpdateUniverseRequest("World backed up after M4", null, null, AiHelp: false))).StatusCode);

        var archive = await RawArchive(owner, u);
        var validated = await Validated(owner, archive);
        Assert.Equal(UniverseBackup.CurrentVersion, validated.Preview.FormatVersion);
        var restored = await Restored(owner, validated.Token, "Restored after M4");

        // A restored universe starts with AI help on and holds no proposal: both are left out of a backup by design.
        Assert.True((await owner.GetFromJsonAsync<UniverseDetail>($"/api/universes/{restored.Id}"))!.AiHelp);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.UniverseAiHelpOff.AnyAsync(off => off.UniverseId == restored.Id));
            Assert.False(await db.AiChangeProposals.AnyAsync(row => row.UniverseId == restored.Id));
        });
    }
}
