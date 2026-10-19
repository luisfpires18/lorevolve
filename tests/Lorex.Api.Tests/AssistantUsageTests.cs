using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Assistant;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.ScriptedAssistantProvider;

namespace Lorex.Api.Tests;

/// <summary>
/// The account's assistant allowance as Settings shows it (ADR 0045): read from the same count that refuses a question, so
/// what the page says and what the assistant does cannot disagree. The model is scripted; nothing reaches a provider.
/// </summary>
public sealed class AssistantUsageTests(AssistantFixture fixture) : IClassFixture<AssistantFixture>
{
    private const string UsagePath = "/api/profile/assistant-usage";

    private readonly LorexApiFactory _api = fixture.Api;
    private readonly ScriptedAssistantProvider _model = fixture.Model;

    [Fact]
    public async Task An_account_that_has_not_asked_has_its_whole_allowance()
    {
        var client = await SignedIn(_api, "usefresh");

        var usage = await Usage(client);

        Assert.Equal(new AssistantUsage(0, 20, 20, 600, null), usage);
    }

    [Fact]
    public async Task Every_question_that_reaches_the_assistant_counts_failed_ones_included()
    {
        var w = await NewSharedWorld(_api, "usefail");
        var owner = w.Owner;

        _model.Use(_ => Answer(("note", "Yes.", [])));
        (await Ask(owner, w.U, "Answered?")).EnsureSuccessStatusCode();

        _model.Use(_ => throw new AssistantProviderException(AssistantFailure.Failed, "synthetic failure"));
        Assert.Equal(HttpStatusCode.BadGateway, (await Ask(owner, w.U, "Failed?")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Ask(owner, w.U, "   ")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Ask(owner, Guid.NewGuid(), "Nowhere?")).StatusCode);

        // Reading whether the assistant is available, or the usage itself, is not a question.
        (await owner.GetAsync(Path(w.U))).EnsureSuccessStatusCode();
        await Usage(owner);

        var usage = await Usage(owner);
        Assert.Equal(4, usage.Used);
        Assert.Equal(16, usage.Remaining);
        Assert.NotNull(usage.ResetsAt);
    }

    [Fact]
    public async Task Usage_matches_the_limit_that_refuses_the_next_question()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "usefull");
        _model.Use(_ => Answer(("note", "Yes.", [])));

        for (var asked = 1; asked <= AssistantSetup.QuestionsPerWindow; asked++)
        {
            (await Ask(client, universe.Id, "Again?")).EnsureSuccessStatusCode();
            Assert.Equal(asked, (await Usage(client)).Used);
        }

        var full = await Usage(client);
        Assert.Equal(0, full.Remaining);

        var refused = await Ask(client, universe.Id, "One more?");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);

        // A refused question is not counted, and the wait it is told matches when the usage says the window ends.
        Assert.Equal(full, await Usage(client));
        var retryAfter = refused.Headers.RetryAfter!.Delta!.Value;
        var untilReset = full.ResetsAt!.Value - _api.Clock.GetUtcNow();
        Assert.InRange(retryAfter.TotalSeconds, untilReset.TotalSeconds - 5, Math.Ceiling(untilReset.TotalSeconds) + 1);
    }

    [Fact]
    public async Task Usage_goes_back_to_zero_when_the_window_ends()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "usewindow");
        _model.Use(_ => Answer(("note", "Yes.", [])));

        for (var asked = 0; asked < AssistantSetup.QuestionsPerWindow; asked++)
        {
            (await Ask(client, universe.Id, "Again?")).EnsureSuccessStatusCode();
        }

        var full = await Usage(client);

        _api.Clock.Offset += full.ResetsAt!.Value - _api.Clock.GetUtcNow() - TimeSpan.FromSeconds(5);
        Assert.Equal(AssistantSetup.QuestionsPerWindow, (await Usage(client)).Used);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Ask(client, universe.Id, "Yet?")).StatusCode);

        _api.Clock.Offset += TimeSpan.FromSeconds(5);
        Assert.Equal(new AssistantUsage(0, 20, 20, 600, null), await Usage(client));

        (await Ask(client, universe.Id, "Now?")).EnsureSuccessStatusCode();
        Assert.Equal(1, (await Usage(client)).Used);
    }

    [Fact]
    public async Task Each_account_sees_only_its_own_usage()
    {
        var w = await NewSharedWorld(_api, "useiso");
        _model.Use(_ => Answer(("note", "Yes.", [])));

        // The same universe, two members: one's questions are never the other's.
        (await Ask(w.Owner, w.U, "Mine?")).EnsureSuccessStatusCode();
        (await Ask(w.Owner, w.U, "Mine again?")).EnsureSuccessStatusCode();
        (await Ask(w.Viewer, w.U, "Yours?")).EnsureSuccessStatusCode();

        Assert.Equal(2, (await Usage(w.Owner)).Used);
        Assert.Equal(1, (await Usage(w.Viewer)).Used);
        Assert.Equal(0, (await Usage(w.Outsider)).Used);

        // No account id is taken from the request, and a signed-out visitor has no usage to read.
        Assert.Equal(1, (await Usage(w.Viewer, $"?accountId={w.OwnerId}")).Used);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync(UsagePath)).StatusCode);
    }

    [Fact]
    public async Task Questions_asked_at_once_never_exceed_the_allowance()
    {
        var allowance = new AssistantAllowance(TimeProvider.System);

        var taken = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => allowance.TryTake("racing") is null)));

        Assert.Equal(AssistantSetup.QuestionsPerWindow, taken.Count(ok => ok));
        Assert.Equal(AssistantSetup.QuestionsPerWindow, allowance.Read("racing").Used);
        Assert.Equal(0, allowance.Read("someone-else").Used);
    }

    private static string Path(Guid universeId) => $"/api/universes/{universeId}/assistant";

    private static Task<HttpResponseMessage> Ask(HttpClient client, Guid universeId, string question) =>
        client.PostAsJsonAsync(Path(universeId), new AssistantRequest(question, null));

    private static async Task<AssistantUsage> Usage(HttpClient client, string query = "")
    {
        var response = await client.GetAsync(UsagePath + query);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Usage answered {(int)response.StatusCode}.");
        return (await response.Content.ReadFromJsonAsync<AssistantUsage>())!;
    }
}
