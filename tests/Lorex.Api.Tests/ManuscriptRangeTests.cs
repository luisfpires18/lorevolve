using System.Net;
using System.Text;
using Lorex.Api.Features.Mcp;
using static Lorex.Api.Tests.McpTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// How a manuscript is cut into chunks for MCP clients (ADR 0046): reading on from each chunk's end covers the text once,
/// in order, never splitting a surrogate pair and never past the bound - and the open registration endpoint's own bound.
/// </summary>
public sealed class ManuscriptRangeTests
{
    [Fact]
    public void Chunks_join_back_to_the_text_exactly_whatever_the_text_and_the_bound()
    {
        var random = new Random(49);
        string[] pieces = ["word ", "longerword ", "\n", "\n\n", "\r\n", "🌊", "é", "ß", "漢字", "\t", "x"];

        for (var round = 0; round < 200; round++)
        {
            var text = new StringBuilder();
            var length = random.Next(0, 40_000);
            while (text.Length < length)
            {
                // Some rounds are one unbroken run, so a chunk must be cut without a break to find.
                text.Append(round % 7 == 0 ? "🌊" : pieces[random.Next(pieces.Length)]);
            }

            var prose = text.ToString();
            var max = random.Next(LorexMcpTools.ManuscriptChunkMinimum, LorexMcpTools.ManuscriptChunkMaximum + 1);
            var joined = new StringBuilder();
            for (var start = 0; start < prose.Length;)
            {
                var end = ManuscriptRanges.End(prose, start, max);
                Assert.InRange(end - start, 1, max);
                Assert.False(end < prose.Length && char.IsLowSurrogate(prose[end]) && char.IsHighSurrogate(prose[end - 1]), "A chunk split a surrogate pair.");
                joined.Append(prose, start, end - start);
                start = end;
            }

            Assert.Equal(prose, joined.ToString());
        }
    }

    [Fact]
    public void A_chunk_ends_after_a_paragraph_break_when_one_is_near_the_bound()
    {
        var prose = new string('a', 7_000) + "\n\n" + new string('b', 5_000);
        Assert.Equal(7_002, ManuscriptRanges.End(prose, 0, 8_000));

        // Too early a break is not worth a short chunk: the cut falls at the bound instead.
        var early = new string('a', 1_000) + "\n\n" + new string('b', 20_000);
        Assert.Equal(8_000, ManuscriptRanges.End(early, 0, 8_000));
    }

    [Fact]
    public async Task Open_registration_is_bounded_per_minute()
    {
        using var api = new LorexApiFactory { RegistrationsPerMinute = 2 };
        var client = api.CreateClient();
        var registration = new { redirect_uris = new[] { Redirect }, token_endpoint_auth_method = "none" };

        Assert.Equal(HttpStatusCode.Created, (await Register(client, registration)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Register(client, registration)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Register(client, registration)).StatusCode);
    }
}
