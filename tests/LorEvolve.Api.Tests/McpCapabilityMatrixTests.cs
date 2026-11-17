

using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Mcp;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The MCP capability matrix (issue #155). Every operation a person can perform inside a universe or one of its
/// projects is answered here with either an MCP tool that is tested, or an exception code that says why MCP
/// deliberately does not reach it. The catalog below is written out by hand from the decision - not derived from the
/// routes or from the tool list - so the code is held to the decision, not to itself.
/// <para>Three things are kept honest at once: no API domain is unclassified, no registered MCP tool is unmapped, and
/// no proposable resource is unmapped. The published matrix in <c>docs/testing/mcp-capability-matrix.md</c> is compared
/// against this catalog, so the document cannot drift away from the code.</para>
/// <para>Known limit, stated in the document's "Known gaps" too: a route nested under an existing prefix is claimed by
/// it and answered the same way, so only a new first segment fails the route test. While <c>systems</c>,
/// <c>system-rules</c> and a bare <c>world-logic</c> were one excepted row, #153's and #154's route groups were both
/// claimed by that bare prefix and inherited its answer; what caught them was their unmapped tools. The alternative is
/// a row per endpoint, about 250 of them.</para>
/// </summary>
public sealed class McpCapabilityMatrixTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string ReadAndPropose = "lorevolve.read lorevolve.propose offline_access";

    /// <summary>Where the published matrix lives, relative to the repository root.</summary>
    private static readonly string[] Document = ["docs", "testing", "mcp-capability-matrix.md"];

    private readonly LorEvolveApiFactory _factory = factory;

    /// <summary>Why MCP does not reach an operation. One of these, or a tool, must answer for every domain.</summary>
    private static class Why
    {
        /// <summary>A read exists but writing over MCP is never direct: it is staged for a person (ADR 0046, ADR 0047).</summary>
        public const string ReadOnly = "read-only-by-design";

        /// <summary>Deliberately out of the MCP surface: a person's own decision in LorEvolve, never an app's.</summary>
        public const string PersonOnly = "person-only";

        /// <summary>Bytes, not data: a picture is fetched by its own tool or its address, never as a general route.</summary>
        public const string MediaBytes = "media-bytes";

        /// <summary>History and the Trash are not read over MCP: an app reads what is live (ADR 0046).</summary>
        public const string LiveOnly = "live-only";
    }

    /// <summary>
    /// One domain of the API, named by the route segments that follow the universe or project id, with ids removed.
    /// The longest matching prefix wins, so <c>entities/comments</c> is classified apart from <c>entities</c>.
    /// </summary>
    /// <param name="Name">What the operations are, in the words the matrix uses.</param>
    /// <param name="Prefixes">The normalized route prefixes, without a leading slash. The empty string is the root itself.</param>
    /// <param name="Read">The MCP tools that read it, or empty when an exception answers for reading.</param>
    /// <param name="ReadWhy">The exception code for reading, when <paramref name="Read"/> is empty.</param>
    /// <param name="Write">The proposal resources that write it, or empty when an exception answers for writing.</param>
    /// <param name="WriteWhy">The exception code for writing, when <paramref name="Write"/> is empty.</param>
    private sealed record Domain(
        string Name,
        string[] Prefixes,
        string[] Read,
        string ReadWhy,
        string[] Write,
        string WriteWhy);

    private static Domain Mapped(string name, string[] prefixes, string[] read, string[] write) =>
        new(name, prefixes, read, "", write, "");

    private static Domain ReadOnly(string name, string[] prefixes, string[] read) =>
        new(name, prefixes, read, "", [], Why.ReadOnly);

    private static Domain Excepted(string name, string[] prefixes, string why) =>
        new(name, prefixes, [], why, [], why);

    // ---------- The matrix ----------

    private static readonly Domain[] Universe =
    [
        new("The universe itself", ["", "archive", "unarchive"], ["get_universe_overview"], "", [], Why.PersonOnly),
        Mapped("Lore entries", ["entities"], ["get_lore_entry", "search_universe"], ["LoreEntry"]),
        Mapped("An entry's article", ["entities/article"], ["get_lore_entry"], ["Article"]),
        Mapped("An entry's progression", ["entities/progression"], ["get_lore_entry"], ["Progression"]),
        Mapped("An entry's pictures", ["entities/image", "entities/appearances"], ["list_lore_images", "get_lore_image"], ["Media"]),
        Excepted("An entry's image field pictures", ["entities/field-images"], Why.MediaBytes),
        Excepted("An entry's history", ["entities/revisions"], Why.LiveOnly),
        Excepted("An entry's private note", ["entities/private-note"], Why.PersonOnly),
        ReadOnly("An entry's map pins", ["entities/map-pins"], ["get_map_location"]),
        ReadOnly("Tags", ["tags"], ["get_lore_entry"]),
        Mapped("Lore types and their fields", ["entity-types"], ["get_change_options"], ["LoreType", "LoreField"]),
        Mapped("Semantic groups and the family tree", ["entity-type-groups", "family-tree"], ["get_change_options"], ["LoreGroup"]),
        Mapped("Relationships", ["relationships", "entities/relationships"], ["get_lore_relationships"], ["Relationship"]),
        Mapped("Relationship kinds", ["relationship-types"], ["get_change_options"], ["RelationshipType"]),
        Mapped("The timeline", ["timeline"], ["browse_timeline", "get_timeline_moment"], ["TimelineEvent"]),
        Mapped("The reckoning and its calendar", ["chronology"], ["get_change_options"], ["Chronology"]),
        Mapped("World Rules", ["world-rules"], ["get_change_options"], ["WorldRule"]),
        Mapped(
            "World Logic Systems and rule definitions",
            ["systems", "system-rules", "world-logic/rules"],
            ["list_systems", "list_world_logic_rules", "get_world_logic_rule", "evaluate_world_logic_rule", "get_rule_impact"],
            ["SystemRule", "LoreSystem"]),
        Mapped("A System's state machine", ["systems/machine"], ["get_system_machine", "evaluate_world_logic_rule"], ["SystemState", "SystemTransition"]),
        new(
            "Recorded World Logic findings",
            ["world-logic/findings"],
            ["list_world_logic_findings", "get_world_logic_finding"],
            "",
            [],
            Why.PersonOnly),
        new(
            "An AI client's unverified claim",
            ["world-logic/semantic-findings"],
            [],
            Why.PersonOnly,
            ["submit_semantic_finding"],
            ""),
        Mapped("The rule vocabulary", ["validation-terms"], ["get_change_options"], ["ValidationTerm"]),
        Excepted("Canon findings", ["canon-conflicts"], Why.PersonOnly),
        ReadOnly("Search", ["search"], ["search_universe"]),
        Excepted("Staged AI changes and their review", ["ai-changes"], Why.PersonOnly),
        ReadOnly("Where to connect an app", ["mcp"], ["get_universe_overview"]),
        Mapped("Stories", ["stories"], ["get_story", "list_projects", "get_project"], ["Story"]),
        Mapped("Chapters", ["stories/chapters"], ["get_story"], ["Chapter"]),
        Mapped("Scenes", ["stories/scenes"], ["get_scene"], ["Scene"]),
        Mapped("A scene's prose", ["stories/scenes/manuscript"], ["read_scene_manuscript", "search_scene_manuscript"], ["Manuscript"]),
        Mapped("Plot arcs", ["stories/plot-arcs"], ["get_arc"], ["PlotArc"]),
        Excepted("A story's cover", ["stories/cover"], Why.MediaBytes),
        Excepted("The order of the universe's projects", ["projects"], Why.PersonOnly),
        Excepted(
            "Review comments",
            ["entities/comments", "stories/comments", "stories/scenes/comments", "comment-threads"],
            Why.PersonOnly),
        Excepted(
            "Suggested changes",
            ["entities/suggestions", "stories/suggestions", "stories/scenes/suggestions", "suggestions"],
            Why.PersonOnly),
        Excepted("The Trash", ["trash"], Why.LiveOnly),
        Excepted(
            "Publishing",
            [
                "publication", "publish", "unpublish",
                "entities/publication", "entities/publish", "entities/unpublish",
                "stories/publication", "stories/publish", "stories/unpublish",
                "stories/scenes/publish", "stories/scenes/unpublish",
                "stories/scenes/manuscript/publish", "stories/scenes/manuscript/unpublish",
                "stories/plot-arcs/publish", "stories/plot-arcs/unpublish",
            ],
            Why.PersonOnly),
        Excepted("The universe's artwork", ["artwork"], Why.MediaBytes),
        Excepted("Backups and the readable export", ["export"], Why.PersonOnly),
        ReadOnly("What an entry knows", ["knowledge"], ["get_lore_entry"]),
        ReadOnly("Maps and their pins", ["maps"], ["list_maps", "search_map_locations", "get_map_location", "measure_map_distance"]),
        Excepted("A map's picture", ["maps/image"], Why.MediaBytes),
        Excepted("Collaborators", ["collaborators"], Why.PersonOnly),
        Excepted("Invitations", ["invitations"], Why.PersonOnly),
        ReadOnly("Lore references", ["lore-references"], ["get_lore_entry"]),
        Excepted("Type templates", ["type-templates", "type-templates/fields"], Why.PersonOnly),
        Excepted(
            "Cinema sagas and their phases",
            [
                "cinema-sagas", "cinema-sagas/move", "cinema-sagas/phases", "cinema-sagas/phases/move",
                "cinema-sagas/phases/members", "cinema-sagas/phases/members/move",
            ],
            Why.PersonOnly),
        Excepted(
            "Comic story arcs and events",
            ["comic-collections", "comic-collections/move", "comic-collections/entries", "comic-collections/entries/move"],
            Why.PersonOnly),
    ];

    private static readonly Domain[] Project =
    [
        new("A project itself", ["", "template"], ["list_projects", "get_project", "get_project_script"], "", [], Why.PersonOnly),
        Mapped("A project's entries", ["entities"], ["list_project_entries", "get_project_entry"], ["ProjectEntry"]),
        Excepted("A project entry's history", ["entities/revisions"], Why.LiveOnly),
        Mapped("A project's own types", ["entity-types"], ["get_project_schema"], ["ProjectType", "ProjectField"]),
        ReadOnly("A project's structure", ["seasons", "structure", "structure/move"], ["get_project_structure"]),
        Excepted("A comic page's or panel's picture", ["structure/image"], Why.MediaBytes),
        Excepted("A project's cover", ["cover"], Why.MediaBytes),
    ];

    /// <summary>The proposal tools themselves: the one write path, and how an app finds and follows it.</summary>
    private static readonly string[] ProposalTools =
    [
        LorEvolveMcpProposalTools.OptionsTool,
        LorEvolveMcpProposalTools.ProposeTool,
        LorEvolveMcpProposalTools.ReadTool,
    ];

    /// <summary>Resources a proposal may name that no universe route of its own answers for.</summary>
    private static readonly string[] WriteOnlyResources = ["Idea"];

    /// <summary>
    /// The names a proposal may name. A write cell holds one of these, or the name of a tool that writes the domain
    /// itself - today only <c>submit_semantic_finding</c>, which stages a claim rather than a change.
    /// </summary>
    private static readonly HashSet<string> Resources = [.. Enum.GetNames<AiChangeResource>()];

    private static IEnumerable<string> WrittenByTool(Domain domain) =>
        domain.Write.Where(name => !Resources.Contains(name));

    private static IEnumerable<string> WrittenByProposal(Domain domain) =>
        domain.Write.Where(Resources.Contains);

    // ---------- What the matrix is held to ----------

    [Fact]
    public void Every_universe_and_project_route_falls_under_one_domain_of_the_matrix()
    {
        var universe = Routes("/api/universes/{", 2);
        var project = Routes("/api/projects", 2);

        Assert.True(universe.Count > 60, $"Only {universe.Count} universe route shapes were found registered.");
        Assert.True(project.Count >= 5, $"Only {project.Count} project route shapes were found registered.");

        Nothing("Universe routes no domain of the matrix claims", Unclassified(universe, Universe));
        Nothing("Project routes no domain of the matrix claims", Unclassified(project, Project));

        // A domain no route reaches is a stale row: the matrix would promise coverage of something that is gone.
        Nothing("Universe domains no registered route reaches", Unused(universe, Universe));
        Nothing("Project domains no registered route reaches", Unused(project, Project));
    }

    [Fact]
    public async Task Every_MCP_tool_the_server_offers_is_mapped_by_the_matrix()
    {
        var offered = await ProposingConnectionToolsAsync();

        // A read-only connection sees the reads alone; the proposal tools appear only once a person ticks proposals.
        var mapped = Universe.Concat(Project)
            .SelectMany(domain => domain.Read.Concat(WrittenByTool(domain)))
            .Concat(ProposalTools)
            .ToHashSet(StringComparer.Ordinal);

        Nothing("Tools the server offers that the matrix does not map", [.. offered.Except(mapped).Order(StringComparer.Ordinal)]);
        Nothing("Names the matrix maps that the server does not offer", [.. mapped.Except(offered).Order(StringComparer.Ordinal)]);
        Assert.Equal(36, offered.Count);
    }

    [Fact]
    public async Task Every_MCP_tool_the_server_offers_has_a_status()
    {
        var offered = await ProposingConnectionToolsAsync("mcpmatrixstatus");
        var published = File.ReadAllText(Path.Combine(RepositoryRoot(), Path.Combine(Document)))
            .ReplaceLineEndings("\n");
        var status = published[published.IndexOf("## Tool status", StringComparison.Ordinal)..];
        status = status[..status.IndexOf("\n## ", StringComparison.Ordinal)];

        // The status table names each registered tool in its first cell, so a new tool cannot land without a status.
        Nothing("Tools the server offers that the status table does not list", [.. offered
            .Where(tool => !status.Contains($"| `{tool}` | ", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)]);
    }

    [Fact]
    public void Every_resource_a_proposal_may_name_is_mapped_by_the_matrix()
    {
        var mapped = Universe.Concat(Project)
            .SelectMany(WrittenByProposal)
            .Concat(WriteOnlyResources)
            .ToHashSet(StringComparer.Ordinal);

        // A write cell naming neither a resource nor a tool the server offers fails the tool test, so both directions
        // of a mistyped write cell are caught between the two.
        Nothing("Resources a proposal may name that the matrix does not map", [.. Resources.Except(mapped).Order(StringComparer.Ordinal)]);
        Nothing("Resources the matrix maps that a proposal cannot name", [.. mapped.Except(Resources).Order(StringComparer.Ordinal)]);
    }

    [Fact]
    public void The_published_matrix_says_exactly_what_the_catalog_says()
    {
        var published = File.ReadAllText(Path.Combine(RepositoryRoot(), Path.Combine(Document)))
            .ReplaceLineEndings("\n");

        foreach (var (heading, domains) in new[] { ("universe", Universe), ("project", Project) })
        {
            foreach (var domain in domains)
            {
                var row = Row(domain);
                Assert.Contains(row, published, StringComparison.Ordinal);
            }

            // Every row of that table in the document is a row of the catalog: nothing extra is promised.
            foreach (var line in Table(published, heading))
            {
                Assert.Contains(line, domains.Select(Row), StringComparer.Ordinal);
            }
        }

        foreach (var code in new[] { Why.ReadOnly, Why.PersonOnly, Why.MediaBytes, Why.LiveOnly })
        {
            Assert.Contains($"`{code}`", published, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void A_domain_waiting_on_unfinished_work_is_named_in_the_known_gaps()
    {
        var published = File.ReadAllText(Path.Combine(RepositoryRoot(), Path.Combine(Document)));
        var gaps = published[published.IndexOf("## Known gaps", StringComparison.Ordinal)..];

        // A `pending-...` code says a domain has no tool because work that would give it one has not landed. None carries
        // one since #361 gave a System's state machine its tools. The prose has to name every prefix such a domain
        // covers, or a reader is told of fewer gaps than there are.
        foreach (var domain in Universe.Concat(Project).Where(domain => domain.ReadWhy.StartsWith("pending-", StringComparison.Ordinal)))
        {
            foreach (var prefix in domain.Prefixes)
            {
                Assert.Contains($"`{prefix}`", gaps, StringComparison.Ordinal);
            }
        }
    }

    // ---------- Reading the result ----------

    /// <summary>Names every member of a list that must be empty, so a failure says what to classify.</summary>
    private static void Nothing(string what, List<string> left) =>
        Assert.True(left.Count == 0, $"{what}: {string.Join(", ", left)}");

    /// <summary>A row of the published table, exactly as the document must spell it.</summary>
    private static string Row(Domain domain) =>
        $"| {domain.Name} | {string.Join(", ", domain.Prefixes.Select(prefix => $"`{(prefix.Length == 0 ? "/" : prefix)}`"))} "
        + $"| {Cell(domain.Read, domain.ReadWhy)} | {Cell(domain.Write, domain.WriteWhy)} |";

    private static string Cell(string[] names, string why) =>
        names.Length > 0 ? string.Join(", ", names.Select(name => $"`{name}`")) : $"`{why}`";

    /// <summary>The rows of the table that follows the heading naming that surface.</summary>
    private static List<string> Table(string published, string heading)
    {
        var rows = new List<string>();
        var inside = false;
        foreach (var line in published.Split('\n').Select(line => line.TrimEnd()))
        {
            if (line.StartsWith("## ", StringComparison.Ordinal))
            {
                inside = line.Contains(heading, StringComparison.OrdinalIgnoreCase);
                continue;
            }

            if (inside && line.StartsWith("| ", StringComparison.Ordinal) && !line.StartsWith("| ---", StringComparison.Ordinal)
                && !line.StartsWith("| Operations", StringComparison.Ordinal))
            {
                rows.Add(line);
            }
        }

        Assert.NotEmpty(rows);
        return rows;
    }

    /// <summary>
    /// Every registered route whose template starts with <paramref name="under"/>, reduced to the named segments that
    /// follow <paramref name="skip"/> leading segments, with every id segment dropped. The universe itself and a
    /// project itself both reduce to the empty string.
    /// </summary>
    private List<string> Routes(string under, int skip) =>
        [.. _factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => endpoint.RoutePattern.RawText ?? "")
            .Where(template => template.StartsWith(under, StringComparison.Ordinal))
            .Select(template => string.Join('/', template.Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Skip(skip)
                .Where(segment => !segment.StartsWith('{'))))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>The routes no domain of the matrix claims, each with what it would need classifying as.</summary>
    private static List<string> Unclassified(IEnumerable<string> routes, Domain[] domains) =>
        [.. routes.Where(route => Match(route, domains) is null).Order(StringComparer.Ordinal)];

    /// <summary>The domains no registered route reaches any more.</summary>
    private static List<string> Unused(IEnumerable<string> routes, Domain[] domains)
    {
        var reached = routes.Select(route => Claims(route, domains)).OfType<string>().ToHashSet(StringComparer.Ordinal);
        return
        [
            .. domains.SelectMany(domain => domain.Prefixes)
                .Where(prefix => !reached.Contains(prefix))
                .Select(prefix => prefix.Length == 0 ? "/" : prefix)
                .Order(StringComparer.Ordinal),
        ];
    }

    /// <summary>The prefix of the domain that claims the route: the longest one it starts with, on a segment boundary.</summary>
    private static string? Claims(string route, Domain[] domains) =>
        domains
            .SelectMany(domain => domain.Prefixes)
            .Where(prefix => prefix.Length == 0
                ? route.Length == 0
                : route == prefix || route.StartsWith(prefix + "/", StringComparison.Ordinal))
            .OrderByDescending(prefix => prefix.Length)
            .FirstOrDefault();

    /// <summary>The domain that claims the route, or null when none does.</summary>
    private static Domain? Match(string route, Domain[] domains) =>
        Claims(route, domains) is { } prefix
            ? domains.First(domain => domain.Prefixes.Contains(prefix, StringComparer.Ordinal))
            : null;

    /// <summary>Every tool a connection that may both read and propose is offered.</summary>
    private async Task<HashSet<string>> ProposingConnectionToolsAsync(string tag = "mcpmatrix")
    {
        var (browser, _) = await NewBrowser(_factory, tag);
        var universe = await PlotTestClient.CreateUniverse(browser, "Matrix world");
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(universe.Id), challenge, scope: ReadAndPropose);
        request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        var tokens = await Exchange(_factory.CreateClient(), clientId, approved["code"], verifier, Resource(universe.Id));
        var response = await Post(_factory.CreateClient(), universe.Id, tokens.AccessToken, ListTools());

        return [.. (await Message(response)).GetProperty("result").GetProperty("tools").EnumerateArray()
            .Select(tool => tool.GetProperty("name").GetString()!)];
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "src", "LorEvolve.Web")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory!.FullName;
    }
}
