using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Assistant;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.ScriptedAssistantProvider;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The account's assistant allowance as the Profile shows it (ADR 0045): read from the same count that refuses a question,
/// so what the page says and what the assistant does cannot disagree. Questions and change requests are counted apart.
/// The model is scripted; nothing reaches a provider.
/// </summary>
public sealed class AssistantUsageTests(AssistantFixture fixture) : IClassFixture<AssistantFixture>
{
    private const string UsagePath = "/api/profile/assistant-usage";

    private readonly LorEvolveApiFactory _api = fixture.Api;
    private readonly ScriptedAssistantProvider _model = fixture.Model;

    private const int AskLimit = AssistantSetup.AskQuestionsPerWindow;
    private const int ProposeLimit = AssistantSetup.ProposeQuestionsPerWindow;

    private static readonly AssistantUsage Unused = new(new(0, AskLimit, AskLimit, null), new(0, ProposeLimit, ProposeLimit, null), 3600);

    [Fact]
    public async Task An_account_that_has_not_asked_has_its_whole_allowance()
    {
        var client = await SignedIn(_api, "usefresh");

        var usage = await Usage(client);

        Assert.Equal(Unused, usage);
    }

    [Fact]
    public async Task Every_question_that_reaches_the_assistant_counts_failed_ones_included_refused_ones_not()
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

        // A blank question and an outsider's 404 never reached the model, so they are not counted.
        var usage = (await Usage(owner)).Ask;
        Assert.Equal(2, usage.Used);
        Assert.Equal(AskLimit - 2, usage.Remaining);
        Assert.NotNull(usage.ResetsAt);
    }

    [Fact]
    public async Task Change_requests_are_counted_apart_from_questions()
    {
        var w = await NewSharedWorld(_api, "usepropose");
        _model.Use(_ => Answer(("note", "Nothing to change.", [])));

        // A body that is not JSON never reaches the model: a 400, counted against neither.
        Assert.Equal(HttpStatusCode.BadRequest, (await AskRaw(w.Owner, w.U, "{\"question\": ")).StatusCode);
        Assert.Equal(Unused, await Usage(w.Owner));

        for (var asked = 1; asked <= ProposeLimit; asked++)
        {
            (await Propose(w.Owner, w.U, "Add a character.")).EnsureSuccessStatusCode();
        }

        var refused = await Propose(w.Owner, w.U, "One more change?");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.InRange(refused.Headers.RetryAfter!.Delta!.Value.TotalSeconds, 1, AssistantSetup.QuestionWindow.TotalSeconds);

        // Change requests used up, questions untouched: the owner may still ask, and another member is counted on their own.
        var usage = await Usage(w.Owner);
        Assert.Equal(ProposeLimit, usage.Propose.Used);
        Assert.Equal(0, usage.Propose.Remaining);
        Assert.Equal(0, usage.Ask.Used);
        (await Ask(w.Owner, w.U, "Still allowed?")).EnsureSuccessStatusCode();
        (await Propose(w.Editor, w.U, "Mine?")).EnsureSuccessStatusCode();
        Assert.Equal(1, (await Usage(w.Owner)).Ask.Used);
        Assert.Equal(1, (await Usage(w.Editor)).Propose.Used);
    }

    [Fact]
    public async Task Usage_matches_the_limit_that_refuses_the_next_question()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "usefull");
        _model.Use(_ => Answer(("note", "Yes.", [])));

        for (var asked = 1; asked <= AskLimit; asked++)
        {
            (await Ask(client, universe.Id, "Again?")).EnsureSuccessStatusCode();
            Assert.Equal(asked, (await Usage(client)).Ask.Used);
        }

        var full = (await Usage(client)).Ask;
        Assert.Equal(0, full.Remaining);

        var refused = await Ask(client, universe.Id, "One more?");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);

        // A refused question is not counted, and the wait it is told matches when the usage says the window ends.
        Assert.Equal(full, (await Usage(client)).Ask);
        var retryAfter = refused.Headers.RetryAfter!.Delta!.Value;
        var untilReset = full.ResetsAt!.Value - _api.Clock.GetUtcNow();
        Assert.InRange(retryAfter.TotalSeconds, untilReset.TotalSeconds - 5, Math.Ceiling(untilReset.TotalSeconds) + 1);
    }

    [Fact]
    public async Task Usage_goes_back_to_zero_when_the_window_ends()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "usewindow");
        _model.Use(_ => Answer(("note", "Yes.", [])));

        for (var asked = 0; asked < AskLimit; asked++)
        {
            (await Ask(client, universe.Id, "Again?")).EnsureSuccessStatusCode();
        }

        var full = (await Usage(client)).Ask;

        _api.Clock.Offset += full.ResetsAt!.Value - _api.Clock.GetUtcNow() - TimeSpan.FromSeconds(5);
        Assert.Equal(AskLimit, (await Usage(client)).Ask.Used);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Ask(client, universe.Id, "Yet?")).StatusCode);

        _api.Clock.Offset += TimeSpan.FromSeconds(5);
        Assert.Equal(Unused, await Usage(client));

        (await Ask(client, universe.Id, "Now?")).EnsureSuccessStatusCode();
        Assert.Equal(1, (await Usage(client)).Ask.Used);
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

        Assert.Equal(2, (await Usage(w.Owner)).Ask.Used);
        Assert.Equal(1, (await Usage(w.Viewer)).Ask.Used);
        Assert.Equal(0, (await Usage(w.Outsider)).Ask.Used);

        // No account id is taken from the request, and a signed-out visitor has no usage to read.
        Assert.Equal(1, (await Usage(w.Viewer, $"?accountId={w.OwnerId}")).Ask.Used);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync(UsagePath)).StatusCode);
    }

    [Fact]
    public async Task Questions_asked_at_once_never_exceed_the_allowance()
    {
        var allowance = new AssistantAllowance(TimeProvider.System);

        var taken = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => Task.Run(() => allowance.TryTake("racing", AssistantQuestionKind.Ask) is null)));

        Assert.Equal(AskLimit, taken.Count(ok => ok));
        Assert.Equal(AskLimit, allowance.Read("racing").Ask.Used);
        Assert.Equal(0, allowance.Read("racing").Propose.Used);
        Assert.Equal(0, allowance.Read("someone-else").Ask.Used);
    }

    [Fact]
    public void A_question_given_back_frees_its_place()
    {
        var allowance = new AssistantAllowance(TimeProvider.System);
        for (var asked = 0; asked < ProposeLimit; asked++)
        {
            Assert.Null(allowance.TryTake("busy", AssistantQuestionKind.Propose));
        }

        Assert.NotNull(allowance.TryTake("busy", AssistantQuestionKind.Propose));
        allowance.GiveBack("busy", AssistantQuestionKind.Propose);
        Assert.Null(allowance.TryTake("busy", AssistantQuestionKind.Propose));
    }

    [Fact]
    public async Task The_line_lets_one_question_through_at_a_time()
    {
        var line = new AssistantLine(1);
        var first = await line.EnterAsync(CancellationToken.None);
        Assert.NotNull(first);

        var second = line.EnterAsync(CancellationToken.None);
        await Task.Delay(200);
        Assert.False(second.IsCompleted);

        first.Dispose();
        first.Dispose(); // Leaving twice frees one place, not two.
        using var entered = await second.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.NotNull(entered);

        using var cancel = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => line.EnterAsync(cancel.Token));
    }

    private static string Path(Guid universeId) => $"/api/universes/{universeId}/assistant";

    private static Task<HttpResponseMessage> Ask(HttpClient client, Guid universeId, string question) =>
        client.PostAsJsonAsync(Path(universeId), new AssistantRequest(question, null));

    private static Task<HttpResponseMessage> Propose(HttpClient client, Guid universeId, string question) =>
        client.PostAsJsonAsync(Path(universeId), new AssistantRequest(question, null, AssistantEndpoints.ProposeMode));

    private static Task<HttpResponseMessage> AskRaw(HttpClient client, Guid universeId, string body) =>
        client.PostAsync(Path(universeId), new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

    private static async Task<AssistantUsage> Usage(HttpClient client, string query = "")
    {
        var response = await client.GetAsync(UsagePath + query);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Usage answered {(int)response.StatusCode}.");
        return (await response.Content.ReadFromJsonAsync<AssistantUsage>())!;
    }
}
