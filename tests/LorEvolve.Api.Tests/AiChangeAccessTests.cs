using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.CollaborationTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Who may stage, see and decide AI changes (ADR 0047): the universe's own roles, read again at every step. The owner and
/// Editors stage and approve what their role writes; a Reviewer stages only what Suggested Changes lets them propose and
/// decides nothing; a Viewer stages nothing; nobody outside sees anything, and nothing crosses universes.
/// </summary>
public sealed class AiChangeAccessTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_viewer_stages_nothing_and_a_reviewer_only_edits_of_entries_stories_and_scenes()
    {
        var w = await NewSharedWorld(_factory, "aiviewer");

        var viewer = await Stage(_factory, w.U, w.ViewerId, NewLore("a", w.CharacterType, "No"));
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single(viewer.Issues).Code);

        var create = await Stage(_factory, w.U, w.ReviewerId, NewLore("a", w.CharacterType, "No"));
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single(create.Issues).Code);
        var trash = await Stage(_factory, w.U, w.ReviewerId, Remove("a", "lore_entry", w.Entry));
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single(trash.Issues).Code);

        var suggestion = await Staged(_factory, w.U, w.ReviewerId, EditLore("a", w.Entry, new AiLoreInput(Summary: "A reviewer's idea.")));

        // The Reviewer reads their own proposal but decides nothing; an Editor applies it.
        var mine = await Read(w.Reviewer, w.U, suggestion);
        Assert.False(mine.CanReview);
        await AssertDenied(await Approve(w.Reviewer, w.U, mine, ["a"]), "reviewer approving");
        await ApproveAll(w.Editor, w.U, suggestion);
        Assert.Equal("A reviewer's idea.", (await w.Owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{w.Entry}"))!.Summary);
    }

    [Fact]
    public async Task Members_see_only_what_they_may_and_outsiders_see_nothing()
    {
        var w = await NewSharedWorld(_factory, "aisee");
        var owners = await Staged(_factory, w.U, w.OwnerId, NewLore("a", w.CharacterType, "Owner's"));
        var reviewers = await Staged(_factory, w.U, w.ReviewerId, EditLore("a", w.Other, new AiLoreInput(Summary: "Reviewer's.")));

        await AssertHidden(await w.Reviewer.GetAsync(Path(w.U, owners)), "reviewer reading the owner's proposal");
        await AssertHidden(await w.Viewer.GetAsync(Path(w.U, owners)), "viewer reading the owner's proposal");
        await AssertHidden(await w.Outsider.GetAsync(Path(w.U, owners)), "outsider");
        Assert.Equal(HttpStatusCode.OK, (await w.Editor.GetAsync(Path(w.U, reviewers))).StatusCode);

        var reviewerList = (await w.Reviewer.GetFromJsonAsync<AiChangePage>($"/api/ai-changes?universeId={w.U}"))!;
        Assert.Equal([reviewers], reviewerList.Items.Select(item => item.Id));
        var editorList = (await w.Editor.GetFromJsonAsync<AiChangePage>($"/api/ai-changes?universeId={w.U}"))!;
        Assert.Equal(new[] { owners, reviewers }.Order(), editorList.Items.Select(item => item.Id).Order());
        Assert.Empty((await w.Outsider.GetFromJsonAsync<AiChangePage>("/api/ai-changes"))!.Items);
        Assert.Equal(2, (await w.Owner.GetFromJsonAsync<AiChangeCount>("/api/ai-changes/count"))!.Open);

        // The Reviewer withdraws their own; nobody else's.
        await AssertHidden(await Reject(w.Reviewer, w.U, owners, null, all: true), "reviewer rejecting the owner's");
        Assert.Equal(HttpStatusCode.OK, (await Reject(w.Reviewer, w.U, reviewers, null, all: true)).StatusCode);
    }

    [Fact]
    public async Task Nothing_crosses_universes()
    {
        var w = await NewSharedWorld(_factory, "aicross");
        var (stranger, strangerId) = await PublishingTestClient.Account(_factory, "aicross-stranger");
        var elsewhere = (await PlotTestClient.CreateUniverse(stranger, "Elsewhere")).Id;
        var foreignEntry = await PlotTestClient.CreateEntity(stranger, elsewhere, "Foreign");
        var foreignType = await TypeId(stranger, elsewhere, "Character");

        // Ids of another universe are refused as not found, whichever universe they are named in.
        var staged = await Stage(
            _factory,
            w.U,
            w.OwnerId,
            EditLore("a", foreignEntry, new AiLoreInput(Summary: "x")),
            NewLore("b", foreignType, "Wrong universe's type"),
            NewLore("c", w.CharacterType, "Linked", new AiFieldInput(Guid.NewGuid(), Entry: Id(foreignEntry))));
        Assert.Null(staged.Proposal);
        Assert.Equal(["a", "b", "c"], staged.Issues.Select(issue => issue.Id).Distinct().Order());

        // A proposal is reached only through its own universe.
        var theirs = await Staged(_factory, elsewhere, strangerId, NewLore("a", foreignType, "Theirs"));
        await AssertHidden(await w.Owner.GetAsync(Path(w.U, theirs)), "another universe's proposal under this one");
        var proposal = await Read(stranger, elsewhere, theirs);
        var crossed = await w.Owner.PostAsJsonAsync($"{Path(w.U, theirs)}/approve", new AiChangeApproveRequest(proposal.Revision, [proposal.Operations[0].Id], Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);
    }

    [Fact]
    public async Task A_proposer_who_lost_access_leaves_a_proposal_that_can_only_be_rejected()
    {
        var w = await NewSharedWorld(_factory, "airemoved");
        var id = await Staged(_factory, w.U, w.EditorId, NewLore("a", w.CharacterType, "Orphan"));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            await db.UniverseMemberships.Where(row => row.UniverseId == w.U && row.UserId == w.EditorId).ExecuteDeleteAsync();
        }

        var proposal = await Read(w.Owner, w.U, id);
        Assert.NotNull(proposal.Blocked);
        var approve = await Approve(w.Owner, w.U, proposal, ["a"]);
        Assert.Equal(AiChangeCodes.Blocked, await Code(approve));
        await AssertHidden(await w.Editor.GetAsync(Path(w.U, id)), "former editor");
        Assert.Equal(HttpStatusCode.OK, (await Reject(w.Owner, w.U, id, null, all: true)).StatusCode);
    }

    [Fact]
    public async Task An_approval_id_answers_only_the_same_approval_by_the_same_person()
    {
        var w = await NewSharedWorld(_factory, "aiidem2");
        var id = await Staged(_factory, w.U, w.OwnerId, NewLore("a", w.CharacterType, "Idem A"), NewLore("b", w.CharacterType, "Idem B"), NewLore("c", w.CharacterType, "Idem C"));
        var proposal = await Read(w.Owner, w.U, id);
        var approval = Guid.NewGuid();

        var first = await Approve(w.Owner, w.U, proposal, ["a", "b"], approval);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var receipt = (await first.Content.ReadFromJsonAsync<AiChangeReceipt>())!;
        var before = await Snapshot(w.U, id);

        // The same request again - a lost answer - gets the same receipt and applies nothing.
        var retry = await Approve(w.Owner, w.U, proposal, ["a", "b"], approval);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(
            receipt.Applied.Select(line => (line.Key, line.ResultId)),
            (await retry.Content.ReadFromJsonAsync<AiChangeReceipt>())!.Applied.Select(line => (line.Key, line.ResultId)));

        // A subset, a superset, or another approver reusing the id: refused, and nothing moves.
        foreach (var (client, keys, what) in new[]
        {
            (w.Owner, new[] { "a" }, "subset"),
            (w.Owner, new[] { "a", "b", "c" }, "superset"),
            (w.Editor, new[] { "a", "b" }, "another approver"),
        })
        {
            var refused = await Approve(client, w.U, proposal, keys, approval);
            Assert.True(refused.StatusCode == HttpStatusCode.Conflict, $"{what}: {(int)refused.StatusCode}");
            Assert.Equal(AiChangeCodes.ApprovalMismatch, await Code(refused));
        }

        Assert.Equal(before, await Snapshot(w.U, id));
        var after = await Read(w.Owner, w.U, id);
        Assert.Equal(AiChangeOperationStatus.Pending, after.Operations.Single(operation => operation.Key == "c").Status);
    }

    /// <summary>What an approval could have changed: the entries, their history, and every change's decision and author.</summary>
    private async Task<string> Snapshot(Guid universeId, Guid proposalId)
    {
        var parts = new List<object?>();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        parts.Add(await db.Entities.CountAsync(row => row.UniverseId == universeId));
        parts.Add(await db.EntityRevisions.CountAsync(row => row.Entity!.UniverseId == universeId));
        parts.AddRange((await db.AiChangeOperations.AsNoTracking().Where(row => row.ProposalId == proposalId).OrderBy(row => row.Sequence)
            .Select(row => new { row.Status, row.ResolvedByUserId, row.ResolvedAt, row.ApprovalId, row.ResultId }).ToListAsync()).Cast<object?>());
        return string.Join("|", parts);
    }

    [Fact]
    public async Task A_role_changed_to_viewer_can_no_longer_approve()
    {
        var w = await NewSharedWorld(_factory, "aidemote");
        var id = await Staged(_factory, w.U, w.OwnerId, NewLore("a", w.CharacterType, "Waiting"));
        var proposal = await Read(w.Editor, w.U, id);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            await db.UniverseMemberships.Where(row => row.UniverseId == w.U && row.UserId == w.EditorId)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.Role, UniverseRole.Viewer));
        }

        await AssertDenied(await Approve(w.Editor, w.U, proposal, ["a"]), "demoted editor");
        await AssertHidden(await w.Editor.GetAsync(Path(w.U, id)), "demoted editor reading the owner's proposal");
    }
}
