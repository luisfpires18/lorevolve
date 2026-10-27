using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Assistant;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using Xunit.Abstractions;
using static LorEvolve.Api.Tests.ArticleTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Runs only when asked: <c>LOREVOLVE_ASSISTANT_SMOKE_MODEL</c> names the model and <c>OPENAI_API_KEY</c> holds the key, both in
/// the process environment and nowhere else. Otherwise skipped, so CI never needs a key or reaches OpenAI.
/// </summary>
public sealed class OpenAISmokeFactAttribute : FactAttribute
{
    public OpenAISmokeFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LOREVOLVE_ASSISTANT_SMOKE_MODEL"))
            || string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY")))
        {
            Skip = "Real OpenAI smoke: set LOREVOLVE_ASSISTANT_SMOKE_MODEL and OPENAI_API_KEY to run it.";
        }
    }
}

/// <summary>
/// The assistant against the real OpenAI Responses API, on a throwaway in-memory universe of made-up test data (ADR 0045):
/// a direct question, one read, several reads, and a fact deep in a long article - with no write, and the calls, tools,
/// tokens and time written to the test output. Never prints the key or the universe's content.
/// </summary>
public sealed class AssistantOpenAISmokeTests(ITestOutputHelper output)
{
    [OpenAISmokeFact]
    public async Task The_real_model_answers_from_the_universe_through_the_read_tools_and_writes_nothing()
    {
        var model = Environment.GetEnvironmentVariable("LOREVOLVE_ASSISTANT_SMOKE_MODEL")!;
        var metered = new Metered(new OpenAIAssistantProvider(
            OpenAIAssistantProvider.CreateClient(Environment.GetEnvironmentVariable("OPENAI_API_KEY")!),
            model));
        using var api = new LorEvolveApiFactory { Assistant = metered };

        var (client, universe) = await SignedInWithUniverse(api, "assmoke");
        var u = universe.Id;
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;
        var arin = (await PostJson<EntityDetail>(client, $"/api/universes/{u}/entities", new EntityRequest(character, "Arin Vale", "Heir of the Ember Court.", CanonStatus.Canon, null, null, null))).Id;
        var doran = (await PostJson<EntityDetail>(client, $"/api/universes/{u}/entities", new EntityRequest(character, "Doran Vale", "Smith of Ashford.", CanonStatus.Canon, null, null, null))).Id;
        var kind = await PostJson<RelationshipTypeResponse>(client, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest("Father of", "Child of", false, null, null));
        await PostJson<RelationshipDetail>(client, $"/api/universes/{u}/relationships", new RelationshipRequest(kind.Id, doran, arin, CanonStatus.Canon, null, null, null));
        await WriteArticle(client, u, arin, Doc(
            string.Concat(Enumerable.Repeat("The court kept its records in salt-stained ledgers through every season. ", 60)),
            "Arin carries the Ninefold Key, taken from the drowned vault beneath the harbour."));

        using var writes = new CommandCounter(
            [u, arin, doran],
            sql => sql.Contains("INSERT INTO", StringComparison.OrdinalIgnoreCase)
                || sql.Contains("UPDATE \"", StringComparison.OrdinalIgnoreCase)
                || sql.Contains("DELETE FROM", StringComparison.OrdinalIgnoreCase));

        output.WriteLine($"Model: {model}");

        var direct = await Ask("A direct", "What can you help me with in this universe?");
        Assert.NotEmpty(direct.Segments);

        var single = await Ask("B one read", "Who is Arin Vale?");
        Assert.Contains(single.Sources, source => source.Id == arin);
        Assert.Contains(metered.Tools, tool => tool is AssistantTools.SearchUniverse or AssistantTools.GetLore);

        var multi = await Ask("C several reads", "Who is Arin Vale's father?");
        Assert.Contains(multi.Sources, source => source.Id == doran || source.Id == arin);
        Assert.Contains(AssistantTools.GetRelationships, metered.Tools);
        Assert.Contains(multi.Segments, segment => segment.Text.Contains("Doran", StringComparison.Ordinal));

        var deep = await Ask("D deep in an article", "What key does Arin Vale carry?");
        Assert.Contains(deep.Segments, segment => segment.Text.Contains("Ninefold", StringComparison.Ordinal));

        Assert.Equal(0, writes.Count);

        async Task<AssistantAnswer> Ask(string label, string question)
        {
            metered.Reset();
            var clock = Stopwatch.StartNew();
            var response = await client.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest(question, null));
            clock.Stop();

            output.WriteLine(
                $"{label}: HTTP {(int)response.StatusCode}, {clock.ElapsedMilliseconds} ms, {metered.Calls} Responses calls, "
                + $"tools [{string.Join(", ", metered.Tools)}], {metered.InputTokens} input / {metered.OutputTokens} output tokens");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var answer = (await response.Content.ReadFromJsonAsync<AssistantAnswer>())!;
            output.WriteLine(
                $"{label}: parts [{string.Join(", ", answer.Segments.Select(segment => segment.Kind))}], "
                + $"{answer.Sources.Count} sources, incomplete {answer.IsIncomplete}");
            return answer;
        }
    }

    /// <summary>Counts what crosses the provider boundary: calls, the tools asked for, and the tokens reported.</summary>
    private sealed class Metered(IAssistantProvider inner) : IAssistantProvider
    {
        public int Calls { get; private set; }

        public int InputTokens { get; private set; }

        public int OutputTokens { get; private set; }

        public List<string> Tools { get; } = [];

        public bool IsConfigured => inner.IsConfigured;

        public void Reset()
        {
            Calls = InputTokens = OutputTokens = 0;
            Tools.Clear();
        }

        public IAssistantConversation Begin(AssistantBrief brief) => new Conversation(this, inner.Begin(brief));

        private sealed class Conversation(Metered meter, IAssistantConversation inner) : IAssistantConversation
        {
            public async Task<AssistantModelTurn> NextAsync(
                IReadOnlyList<AssistantToolResult> results,
                bool toolsAllowed,
                CancellationToken cancellationToken)
            {
                meter.Calls++;
                var turn = await inner.NextAsync(results, toolsAllowed, cancellationToken);
                meter.InputTokens += turn.InputTokens;
                meter.OutputTokens += turn.OutputTokens;
                meter.Tools.AddRange(turn.ToolCalls.Select(call => call.Name));
                return turn;
            }
        }
    }
}
