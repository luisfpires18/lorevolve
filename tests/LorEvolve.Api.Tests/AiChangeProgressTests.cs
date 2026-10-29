using System.Net;
using LorEvolve.Api.Features.AiChanges;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A running approval's count: kept only while it runs, read only by the person who started it, and gone once the
/// approval has answered.
/// </summary>
public sealed class AiChangeProgressTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    [Fact]
    public void The_count_is_the_starters_alone_and_goes_when_finished()
    {
        var progress = new AiChangeProgress();
        var approval = Guid.NewGuid();

        progress.Report(approval, "me", 0, 96);
        progress.Report(approval, "me", 5, 96);

        Assert.Equal(new AiChangeProgress.Entry("me", 5, 96), progress.Read(approval, "me"));
        Assert.Null(progress.Read(approval, "someone else"));

        progress.Finish(approval);
        Assert.Null(progress.Read(approval, "me"));
    }

    [Fact]
    public async Task An_answered_approval_has_no_count_left()
    {
        var (owner, ownerId) = await PublishingTestClient.Account(factory, "aiprogress");
        var u = (await CreateUniverse(owner, "World aiprogress")).Id;
        var character = await TypeId(owner, u, "Character");
        var id = await Staged(factory, u, ownerId, NewLore("arin", character, "Arin"), NewLore("bel", character, "Bel"));
        var proposal = await Read(owner, u, id);
        var approval = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.OK, (await Approve(owner, u, proposal, ["arin", "bel"], approval)).StatusCode);

        var after = await owner.GetAsync($"{Path(u, id)}/approve/{approval}/progress");
        Assert.Equal(HttpStatusCode.NotFound, after.StatusCode);
    }
}
