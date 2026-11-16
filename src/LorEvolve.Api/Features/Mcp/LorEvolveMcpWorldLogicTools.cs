using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using LorEvolve.Api.Features.Systems;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// The MCP World Logic tools (#154, ADR 0072): a connected AI client reads the universe's rules and Systems,
/// evaluates one deterministically, reads the evidence a finding cited, asks what a rule change would touch, and
/// submits an observation of its own for the author to review.
///
/// <para><b>Two kinds of answer, and they never mix.</b> <c>evaluate_world_logic_rule</c> and
/// <c>list_world_logic_findings</c> return what <see cref="WorldLogicEvaluator"/> computed: a pure function of the
/// stored rules and the stored lore, with no model anywhere near it. <c>submit_semantic_finding</c> records what the
/// model itself claims, in a different table, with a status set that cannot say "violation", waiting for the author.
/// The separation is structural, not a label: there is no code path from a submitted claim to a
/// <see cref="WorldLogicFinding"/>.</para>
///
/// <para><b>Reading is the connection's universe, and nothing wider.</b> As with every other tool here the universe
/// comes from <see cref="McpCaller"/>, set by the gate from the token. None of these tools takes a universe, so a
/// client cannot read another one's rules, findings or evidence, and a claim cannot cite a record this universe does
/// not hold.</para>
///
/// <para><b>Nothing here changes the universe.</b> Six of the seven tools only read. The seventh writes one row of
/// review state and says so: it creates no lore, changes no rule, records no violation and approves nothing. A rule
/// change still goes through <c>get_change_options</c> and <c>propose_changes</c>, which are untouched by this
/// issue.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpWorldLogicTools(LorEvolveDbContext db, McpCaller caller, McpSite site, TimeProvider clock)
{
    public const string ListRulesTool = "list_world_logic_rules";
    public const string GetRuleTool = "get_world_logic_rule";
    public const string ListSystemsTool = "list_systems";
    public const string EvaluateTool = "evaluate_world_logic_rule";
    public const string ListFindingsTool = "list_world_logic_findings";
    public const string GetFindingTool = "get_world_logic_finding";
    public const string ImpactTool = "get_rule_impact";
    public const string SubmitTool = "submit_semantic_finding";

    /// <summary>
    /// The one tool here that writes, so the one gated on the proposal permission (ADR 0047). It is listed beside the
    /// proposal tools in <see cref="LorEvolveMcpProposalTools.Filters"/>, so a read-only connection never sees it and
    /// a call is refused with the same answer.
    /// </summary>
    public static readonly string[] ProposeGated = [SubmitTool];

    /// <summary>What a client is told about these tools, added to the server's instructions.</summary>
    public const string Instructions =
        " World Logic: list_world_logic_rules names this universe's rules - the ones written in words and the ones carrying a "
        + "typed condition - and list_systems names the Systems that group them. get_world_logic_rule reads one with its "
        + "condition, its exceptions and the rules it depends on. evaluate_world_logic_rule runs that condition over the stored "
        + "lore and answers true, false, unknown, error or exempt with the ids its answer depended on and a rationale trace: it "
        + "is computed, not reasoned, so use its answer rather than working the condition out yourself, and never report a "
        + "violation the evaluator did not return. unknown means the lore does not say, which is not false. "
        + "list_world_logic_findings and get_world_logic_finding read the problems the author's own sweeps recorded, with the "
        + "evidence each one cited. get_rule_impact says what a rule change would touch before you propose it. "
        + "submit_semantic_finding is for what you noticed that no condition can express: it records your claim as unverified "
        + "for the author to accept or dismiss, it is never a proven violation, and it must cite the records it is about. To "
        + "change a rule, use get_change_options and propose_changes as for anything else; nothing here edits the universe. "
        + "A rule definition (system_rule) and a System (system) are proposed there too: create or update, never remove, and "
        + "a System's rule list can name a rule the same proposal creates by its ref. A condition may name only records that "
        + "already exist.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    // ---------- Navigating ----------

    [McpServerTool(Name = ListRulesTool, Title = "List the universe's World Logic rules", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("This universe's rules, both kinds in one list: a world rule written in words, and a World Logic rule definition "
        + "that may carry a typed condition. Each row has its id, which kind it is (source), its title, an excerpt, whether it has "
        + "a condition that can be evaluated, its scope (the whole universe or one project) and when it changed. Most recently "
        + "changed first. Only a row with hasCondition can be evaluated.")]
    public async Task<CallToolResult> ListRulesAsync(
        [Description("Optional: only the rules scoped to this project of the universe, plus the universe-wide ones.")] string? projectId = null,
        [Description("Which page, from 1.")] int page = 1,
        [Description("How many rows, up to 100.")] int pageSize = SemanticFindingLimits.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        var (scope, scopeRefusal) = await ScopeAsync(projectId, cancellationToken);
        if (scopeRefusal is not null)
        {
            return scopeRefusal;
        }

        var (wantedPage, wantedSize) = WorldLogicAccess.Paging(page, pageSize);

        // The two kinds live in two tables with two shapes, so they are read separately and merged here, exactly as
        // the universe's own unified rules route does it. Both reads are bounded, so the merge is too.
        var definitions = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.UniverseId == caller.UniverseId)
            .Take(WorldLogicLimits.MaxMergedRules)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                Body = rule.Description,
                HasCondition = rule.ConditionJson != null,
                rule.Scope,
                rule.ProjectId,
                rule.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        // A trashed world rule is not part of the universe a client reads (ADR 0015).
        var worded = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == caller.UniverseId && rule.DeletedAt == null)
            .Take(WorldLogicLimits.MaxMergedRules)
            .Select(rule => new { rule.Id, rule.Title, Body = rule.Description, rule.UpdatedAt })
            .ToListAsync(cancellationToken);

        var all = definitions
            .Select(rule => new Row(
                rule.Id, "system_rule", rule.Title, rule.Body, rule.HasCondition, rule.Scope, rule.ProjectId, rule.UpdatedAt))
            .Concat(worded.Select(rule => new Row(
                rule.Id, "world_rule", rule.Title, rule.Body, false, WorldLogicScope.Universe, null, rule.UpdatedAt)))
            .Where(rule => scope is not { } project || rule.ProjectId is null || rule.ProjectId == project)
            .OrderByDescending(rule => rule.UpdatedAt)
            .ThenBy(rule => rule.Id)
            .ToList();

        var totalCount = all.Count;
        var rows = all.Skip((wantedPage - 1) * wantedSize).Take(wantedSize).ToList();

        return Result(new
        {
            universe = caller.UniverseName,
            page = wantedPage,
            pageSize = wantedSize,
            totalCount,
            totalPages = WorldLogicAccess.TotalPages(totalCount, wantedSize),
            rules = rows.Select(rule =>
            {
                var (excerpt, isShortened) = WorldLogicAccess.Excerpt(rule.Body);
                return new
                {
                    id = rule.Id,
                    source = rule.Source,
                    title = rule.Title,
                    excerpt,
                    isExcerptShortened = isShortened,
                    hasCondition = rule.HasCondition,
                    scope = rule.Scope == WorldLogicScope.Project ? "project" : "universe",
                    projectId = rule.ProjectId,
                    updatedAt = Utc(rule.UpdatedAt),
                };
            }),
        }, Json);
    }

    [McpServerTool(Name = ListSystemsTool, Title = "List the universe's Systems", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("The named sets of rules this universe has - a magic system, a succession law, a trial protocol - each with its id, "
        + "name, summary, how many rule definitions it references and whether it covers the whole universe or one project. A System "
        + "is a set, not a container: one rule may belong to several, and get_world_logic_rule reads a rule whatever set it is in.")]
    public async Task<CallToolResult> ListSystemsAsync(
        [Description("Optional: only the Systems scoped to this project of the universe, plus the universe-wide ones.")] string? projectId = null,
        [Description("Which page, from 1.")] int page = 1,
        [Description("How many rows, up to 100.")] int pageSize = SemanticFindingLimits.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        var (scope, scopeRefusal) = await ScopeAsync(projectId, cancellationToken);
        if (scopeRefusal is not null)
        {
            return scopeRefusal;
        }

        var (wantedPage, wantedSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.LoreSystems.AsNoTracking().Where(system => system.UniverseId == caller.UniverseId);
        if (scope is { } project)
        {
            query = query.Where(system => system.ProjectId == null || system.ProjectId == project);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(system => system.UpdatedAt)
            .ThenBy(system => system.Id)
            .Skip((wantedPage - 1) * wantedSize)
            .Take(wantedSize)
            .Select(system => new
            {
                id = system.Id,
                name = system.Name,
                summary = system.Summary,
                ruleCount = system.Rules.Count,
                scope = system.Scope,
                projectId = system.ProjectId,
                updatedAt = system.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return Result(new
        {
            universe = caller.UniverseName,
            page = wantedPage,
            pageSize = wantedSize,
            totalCount,
            totalPages = WorldLogicAccess.TotalPages(totalCount, wantedSize),
            systems = rows.Select(system => new
            {
                system.id,
                system.name,
                system.summary,
                system.ruleCount,
                scope = system.scope == WorldLogicScope.Project ? "project" : "universe",
                system.projectId,
                updatedAt = Utc(system.updatedAt),
            }),
        }, Json);
    }

    [McpServerTool(Name = GetRuleTool, Title = "Read a World Logic rule", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("One rule of this universe by its id: its title, its full text, its scope, its version, and - for a rule definition "
        + "with a typed condition - the condition itself, its exceptions, the schema version it was written against, the rules it "
        + "depends on and the Systems that reference it. The condition is data, never code: read it to understand what the rule "
        + "checks, and use evaluate_world_logic_rule to find out what it answers.")]
    public async Task<CallToolResult> GetRuleAsync(
        [Description("The rule's id, exactly as list_world_logic_rules gave it.")] string ruleId,
        CancellationToken cancellationToken)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(ruleId, out var id))
        {
            return NotFound();
        }

        var definition = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.Id == id && rule.UniverseId == caller.UniverseId)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                rule.Description,
                rule.Scope,
                rule.ProjectId,
                rule.SchemaVersion,
                rule.ConditionJson,
                rule.ExceptionsJson,
                rule.Version,
                rule.UpdatedAt,
                DependsOn = rule.Dependencies.Select(dependency => dependency.DependsOnRuleId).ToList(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (definition is not null)
        {
            var systems = await db.LoreSystemRules.AsNoTracking()
                .Where(link => link.RuleId == id && link.LoreSystem!.UniverseId == caller.UniverseId)
                .OrderBy(link => link.LoreSystem!.Name)
                .Select(link => new { id = link.SystemId, name = link.LoreSystem!.Name })
                .ToListAsync(cancellationToken);

            return Result(new
            {
                id = definition.Id,
                source = "system_rule",
                title = definition.Title,
                description = definition.Description,
                scope = definition.Scope == WorldLogicScope.Project ? "project" : "universe",
                projectId = definition.ProjectId,
                schemaVersion = definition.SchemaVersion,
                condition = Raw(definition.ConditionJson),
                exceptions = Raw(definition.ExceptionsJson),
                dependsOn = definition.DependsOn,
                systems,
                version = definition.Version,
                updatedAt = Utc(definition.UpdatedAt),
                hasCondition = definition.ConditionJson is not null,
            }, Json);
        }

        // A trashed world rule reads as not found, the same answer as one that was never there (ADR 0015).
        var worded = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.Id == id && rule.UniverseId == caller.UniverseId && rule.DeletedAt == null)
            .Select(rule => new { rule.Id, rule.Title, rule.Description, rule.UpdatedAt })
            .FirstOrDefaultAsync(cancellationToken);

        return worded is null
            ? NotFound()
            : Result(new
            {
                id = worded.Id,
                source = "world_rule",
                title = worded.Title,
                description = worded.Description,
                scope = "universe",
                updatedAt = Utc(worded.UpdatedAt),
                // A world rule is words and its own counting check (ADR 0034); it carries no typed condition, so
                // there is nothing here for evaluate_world_logic_rule to run.
                hasCondition = false,
            }, Json);
    }

    // ---------- Evaluating ----------

    [McpServerTool(Name = EvaluateTool, Title = "Evaluate a World Logic rule", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Run one rule's typed condition over this universe's stored lore and read what it answers: true, false, unknown, "
        + "error or exempt, with the error code or the exemption that applied, the ids the answer depended on (evidence) and a "
        + "rationale trace. The answer is computed by LorEvolve, not reasoned: report it as it came back, and never call something "
        + "a violation unless this returned false for a rule that forbids it. unknown means the lore does not say, which is not the "
        + "same as false, and is the honest answer for a sparsely described universe. Nothing is recorded: this tool stores no "
        + "finding. Give targetId for a rule written about one entry or moment, or the answer will be unknown because the question "
        + "was incomplete.")]
    public async Task<CallToolResult> EvaluateAsync(
        [Description("The rule's id, exactly as list_world_logic_rules gave it. It must be a rule definition with a condition.")] string ruleId,
        [Description("Optional: the lore entry or timeline moment the rule is about, which its condition reads as 'self'.")] string? targetId = null,
        [Description("Optional: the project this evaluation is scoped to, which decides which exceptions apply.")] string? projectId = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(ruleId, out var id)
            || !await db.SystemRules.AsNoTracking()
                .AnyAsync(rule => rule.Id == id && rule.UniverseId == caller.UniverseId, cancellationToken))
        {
            // A world rule's id is a rule id in the list, so say where the condition is rather than only "not found".
            if (Guid.TryParse(ruleId, out var worded)
                && await db.WorldRules.AsNoTracking()
                    .AnyAsync(
                        rule => rule.Id == worded && rule.UniverseId == caller.UniverseId && rule.DeletedAt == null,
                        cancellationToken))
            {
                return Error(
                    "no_condition",
                    "That id is one of this universe's rules written in words, which carries no typed condition, so there is nothing to evaluate. Read it with get_world_logic_rule.");
            }

            return NotFound();
        }

        var (scope, scopeRefusal) = await ScopeAsync(projectId, cancellationToken);
        if (scopeRefusal is not null)
        {
            return scopeRefusal;
        }

        if (targetId is not null && !Guid.TryParse(targetId, out _))
        {
            return Error("not_an_id", "Insert a target id exactly as a read tool gave it, or leave it out.");
        }

        // The whole rule set is loaded, not just this one: a condition may name any rule it declared, and that rule
        // may name others, so a run that loaded one rule could not answer a dependency at all.
        var rules = await WorldLogicRuleSet.LoadAsync(db, caller.UniverseId, cancellationToken);
        var facts = await UniverseConditionFacts.LoadAsync(db, caller.UniverseId, cancellationToken);
        var result = new WorldLogicEvaluator(facts, rules).Evaluate(
            id.ToString(), targetId, scope?.ToString());

        return Result(new
        {
            ruleId = id,
            ruleVersion = result.RuleVersion,
            schemaVersion = result.SchemaVersion,
            outcome = Outcome(result.Outcome),
            errorCode = result.ErrorCode,
            exemptionId = result.ExemptionId,
            evidence = result.Evidence.Select(item => new { source = item.Source, id = item.Id, role = item.Role }),
            rationale = result.Rationale,
            recorded = false,
            note = "Computed from the stored rules and lore. Nothing was recorded: the author's own sweep is what records a finding.",
        }, Json);
    }

    [McpServerTool(Name = ImpactTool, Title = "What a rule change would touch", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Before proposing a change to a rule, read what it is tangled with: the Systems that reference it, the rules that "
        + "declared a dependency on it (those are the ones a change can break), the rules it depends on itself, how many recorded "
        + "findings it has by outcome and status, and whether it carries a condition at all. Read, never a change: propose the "
        + "change itself with propose_changes.")]
    public async Task<CallToolResult> GetImpactAsync(
        [Description("The rule's id, exactly as list_world_logic_rules gave it.")] string ruleId,
        CancellationToken cancellationToken)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(ruleId, out var id))
        {
            return NotFound();
        }

        var rule = await db.SystemRules.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.UniverseId == caller.UniverseId)
            .Select(candidate => new { candidate.Id, candidate.Title, candidate.Version, HasCondition = candidate.ConditionJson != null })
            .FirstOrDefaultAsync(cancellationToken);

        if (rule is null)
        {
            return NotFound();
        }

        var systems = await db.LoreSystemRules.AsNoTracking()
            .Where(link => link.RuleId == id && link.LoreSystem!.UniverseId == caller.UniverseId)
            .OrderBy(link => link.LoreSystem!.Name)
            .Select(link => new { id = link.SystemId, name = link.LoreSystem!.Name })
            .ToListAsync(cancellationToken);

        var dependents = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.DependsOnRuleId == id && dependency.Rule!.UniverseId == caller.UniverseId)
            .OrderBy(dependency => dependency.Rule!.Title)
            .Select(dependency => new { id = dependency.RuleId, title = dependency.Rule!.Title })
            .ToListAsync(cancellationToken);

        var dependsOn = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.RuleId == id && dependency.DependsOnRule!.UniverseId == caller.UniverseId)
            .OrderBy(dependency => dependency.DependsOnRule!.Title)
            .Select(dependency => new { id = dependency.DependsOnRuleId, title = dependency.DependsOnRule!.Title })
            .ToListAsync(cancellationToken);

        var findings = await db.WorldLogicFindings.AsNoTracking()
            .Where(finding => finding.RuleId == id && finding.UniverseId == caller.UniverseId)
            .GroupBy(finding => new { finding.Outcome, finding.Status })
            .Select(group => new { group.Key.Outcome, group.Key.Status, count = group.Count() })
            .ToListAsync(cancellationToken);

        var claims = await db.SemanticFindings.AsNoTracking()
            .CountAsync(
                finding => finding.RuleId == id
                    && finding.UniverseId == caller.UniverseId
                    && finding.Status == SemanticFindingStatus.Unverified,
                cancellationToken);

        return Result(new
        {
            ruleId = rule.Id,
            title = rule.Title,
            version = rule.Version,
            hasCondition = rule.HasCondition,
            systems,
            dependents,
            dependsOn,
            findings = findings.Select(group => new
            {
                outcome = group.Outcome,
                status = group.Status,
                group.count,
            }),
            unverifiedClaims = claims,
            note = dependents.Count > 0
                ? "Changing this rule changes what the rules under dependents answer, because each of them declared a dependency on it."
                : "No other rule declared a dependency on this one, so a change to it is local.",
        }, Json);
    }

    // ---------- The author's recorded findings ----------

    [McpServerTool(Name = ListFindingsTool, Title = "List recorded World Logic findings", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("The problems this universe's own evaluations recorded, each with its rule, outcome (violation, unknown or error), "
        + "severity, status (open, reviewing, resolved or dismissed), the rule and schema versions it was found at, and how many ids "
        + "it cited. These are computed by LorEvolve, so they are findings in the strong sense; what you submit with "
        + "submit_semantic_finding never appears here. Read one with get_world_logic_finding for the ids it cited and its rationale. "
        + "Most in need of attention first.")]
    public async Task<CallToolResult> ListFindingsAsync(
        [Description("Optional: only violation, unknown or error.")] string? outcome = null,
        [Description("Optional: only open, reviewing, resolved or dismissed.")] string? status = null,
        [Description("Optional: only the findings of this rule.")] string? ruleId = null,
        [Description("Which page, from 1.")] int page = 1,
        [Description("How many rows, up to 100.")] int pageSize = WorldLogicFindingLimits.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        if (outcome is not null && OutcomeOf(outcome) is null)
        {
            return Error("unknown_outcome", "Insert one of: violation, unknown, error.");
        }

        if (status is not null && StatusOf(status) is null)
        {
            return Error("unknown_status", "Insert one of: open, reviewing, resolved, dismissed.");
        }

        if (ruleId is not null && !Guid.TryParse(ruleId, out _))
        {
            return Error("not_an_id", "Insert a rule id exactly as list_world_logic_rules gave it, or leave it out.");
        }

        var (wantedPage, wantedSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.WorldLogicFindings.AsNoTracking()
            .Where(finding => finding.UniverseId == caller.UniverseId);

        if (OutcomeOf(outcome) is { } wantedOutcome)
        {
            query = query.Where(finding => finding.Outcome == wantedOutcome);
        }

        if (StatusOf(status) is { } wantedStatus)
        {
            query = query.Where(finding => finding.Status == wantedStatus);
        }

        if (Guid.TryParse(ruleId, out var wantedRule))
        {
            query = query.Where(finding => finding.RuleId == wantedRule);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderBy(finding => finding.Status == WorldLogicFindingStatus.Open ? 0 : 1)
            .ThenBy(finding => finding.Outcome == WorldLogicFindingOutcome.Violation
                ? 0
                : finding.Outcome == WorldLogicFindingOutcome.Error ? 1 : 2)
            .ThenBy(finding => finding.CreatedAt)
            .ThenBy(finding => finding.Id)
            .Skip((wantedPage - 1) * wantedSize)
            .Take(wantedSize)
            .Select(finding => new
            {
                id = finding.Id,
                ruleId = finding.RuleId,
                ruleTitle = finding.Rule!.Title,
                projectId = finding.ProjectId,
                outcome = finding.Outcome,
                status = finding.Status,
                errorCode = finding.ErrorCode,
                ruleVersion = finding.RuleVersion,
                schemaVersion = finding.SchemaVersion,
                evidenceCount = finding.Evidence.Count,
                createdAt = finding.CreatedAt,
                updatedAt = finding.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return Result(new
        {
            page = wantedPage,
            pageSize = wantedSize,
            totalCount,
            totalPages = WorldLogicAccess.TotalPages(totalCount, wantedSize),
            findings = rows.Select(finding => new
            {
                finding.id,
                finding.ruleId,
                finding.ruleTitle,
                finding.projectId,
                outcome = finding.outcome,
                severity = WorldLogicFindingSeverity.Of(finding.outcome),
                status = finding.status,
                finding.errorCode,
                finding.ruleVersion,
                finding.schemaVersion,
                finding.evidenceCount,
                createdAt = Utc(finding.createdAt),
                updatedAt = Utc(finding.updatedAt),
            }),
        }, Json);
    }

    [McpServerTool(Name = GetFindingTool, Title = "Read a recorded finding's evidence", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("One recorded finding by its id, with every id its outcome depended on - the fact source, the record's id and the "
        + "part it played - and the rationale trace the evaluator wrote. This is the cited evidence behind a computed finding. The "
        + "author's own review notes are not here: who decided what about a finding is theirs, not this connection's.")]
    public async Task<CallToolResult> GetFindingAsync(
        [Description("The finding's id, exactly as list_world_logic_findings gave it.")] string findingId,
        CancellationToken cancellationToken)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(findingId, out var id))
        {
            return NotFound();
        }

        var finding = await db.WorldLogicFindings.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.UniverseId == caller.UniverseId)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.RuleId,
                RuleTitle = candidate.Rule!.Title,
                candidate.ProjectId,
                candidate.Outcome,
                candidate.Status,
                candidate.ErrorCode,
                candidate.RuleVersion,
                candidate.SchemaVersion,
                candidate.Rationale,
                candidate.CreatedAt,
                candidate.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (finding is null)
        {
            return NotFound();
        }

        var evidence = await db.WorldLogicFindingEvidence.AsNoTracking()
            .Where(item => item.FindingId == id)
            .OrderBy(item => item.SortOrder)
            .Select(item => new { source = item.Source, id = item.SourceRowId, role = item.Role })
            .ToListAsync(cancellationToken);

        return Result(new
        {
            id = finding.Id,
            ruleId = finding.RuleId,
            ruleTitle = finding.RuleTitle,
            projectId = finding.ProjectId,
            outcome = finding.Outcome,
            severity = WorldLogicFindingSeverity.Of(finding.Outcome),
            status = finding.Status,
            errorCode = finding.ErrorCode,
            ruleVersion = finding.RuleVersion,
            schemaVersion = finding.SchemaVersion,
            evidence,
            rationale = WorldLogicRationale.Read(finding.Rationale),
            createdAt = Utc(finding.CreatedAt),
            updatedAt = Utc(finding.UpdatedAt),
        }, Json);
    }

    // ---------- Submitting a claim of your own ----------

    [McpServerTool(Name = SubmitTool, Title = "Submit an unverified observation for review", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Record something you noticed about this universe's meaning that no typed condition can express - two entries that "
        + "contradict each other, a rule the lore quietly breaks - for the author to accept or dismiss in LorEvolve. "
        + "It is stored as YOUR claim, marked unverified, and it is never a proven violation: nothing checked it, nothing in the "
        + "universe changes, and it never joins the findings list_world_logic_findings reads. Only submit what the person asked you "
        + "to look for, and say in the claim what made you think it, not that it is certain. You must cite the records the claim is "
        + "about - each with its kind, its id, the version you read where it has one, and the character range where the claim is "
        + "about prose - because an uncited claim cannot be checked and is refused. Cite only records you read from this connection. "
        + "To change something rather than report it, use propose_changes.")]
    public async Task<CallToolResult> SubmitSemanticFindingAsync(
        [Description("One line naming what you observed.")] string? title,
        [Description("What you observed and what made you think it, in your own words. Say what is uncertain.")] string? claim,
        [Description("The records this claim is about, in order. Each needs kind (lore_entry, relationship, timeline_moment, scene, "
            + "manuscript, world_rule or system_rule), sourceId, and note saying what it contributes. Add sourceVersion where the "
            + "record has one, and rangeStart with rangeLength for a claim about part of some prose.")]
        IReadOnlyList<SemanticCitationInput>? citations,
        [Description("Optional: the World Logic rule this claim is about, if one covers it.")] string? ruleId = null,
        [Description("Optional: the project this claim is scoped to.")] string? projectId = null,
        CancellationToken cancellationToken = default)
    {
        if (await RoleAsync(db, caller, cancellationToken) is null)
        {
            return NotAllowed();
        }

        var submitted = await SemanticFindingSubmissions.SubmitAsync(
            db,
            clock,
            caller.UniverseId,
            caller.UserId,
            caller.ConnectionId,
            caller.ClientName,
            new SemanticFindingInput(title, claim, ruleId, projectId, citations),
            cancellationToken);

        if (submitted.Finding is not { } finding)
        {
            return new CallToolResult
            {
                IsError = true,
                Content =
                [
                    new TextContentBlock
                    {
                        Text = JsonSerializer.Serialize(new
                        {
                            error = "invalid_finding",
                            message = "Nothing was submitted. Fix these problems and send it again.",
                            problems = submitted.Problems.Select(problem => new
                            {
                                citation = problem.Citation,
                                field = problem.Field,
                                code = problem.Code,
                                problem.Message,
                            }),
                        }, Json),
                    },
                ],
            };
        }

        return Result(new
        {
            findingId = finding.Id,
            status = SemanticFindingReads.Status(finding.Status),
            citationCount = finding.Citations.Count,
            reviewUrl = $"{site.Base}/app/universes/{caller.UniverseId:D}/world-logic",
            message = "Submitted as an unverified observation. Nothing in the universe has changed and no violation was recorded: "
                + "tell the person their observation is waiting for them in LorEvolve's World Logic, where they can accept or dismiss "
                + "it. Do not describe it as a confirmed problem.",
        }, Json);
    }

    // ---------- Shared ----------

    /// <summary>One row of the unified rule list, before its excerpt is made.</summary>
    private sealed record Row(
        Guid Id, string Source, string Title, string Body, bool HasCondition, WorldLogicScope Scope, Guid? ProjectId, DateTime UpdatedAt);

    /// <summary>
    /// The project a tool was asked to scope to, checked against this universe. The second half of the answer is the
    /// refusal to return when the id is not one of this universe's projects, which is how the scope bound holds for a
    /// client that guesses an id.
    /// </summary>
    private async Task<(Guid? Scope, CallToolResult? Refused)> ScopeAsync(string? projectId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(projectId))
        {
            return (null, null);
        }

        if (!Guid.TryParse(projectId, out var id))
        {
            return (null, Error("not_an_id", "Insert a project id exactly as list_projects gave it, or leave it out."));
        }

        return await WorldLogicAccess.IsProjectOfUniverseAsync(db, caller.UniverseId, id, cancellationToken)
            ? (id, null)
            : (null, Error("not_found", "No project with that id is in this universe."));
    }

    /// <summary>The outcome as the specification writes it. Text, so a new outcome never shifts an existing one.</summary>
    private static string Outcome(ConditionOutcome outcome) => outcome switch
    {
        ConditionOutcome.True => "true",
        ConditionOutcome.False => "false",
        ConditionOutcome.Unknown => "unknown",
        ConditionOutcome.Exempt => "exempt",
        _ => "error",
    };

    private static WorldLogicFindingOutcome? OutcomeOf(string? wire) => wire?.Trim().ToLowerInvariant() switch
    {
        "violation" => WorldLogicFindingOutcome.Violation,
        "unknown" => WorldLogicFindingOutcome.Unknown,
        "error" => WorldLogicFindingOutcome.Error,
        _ => null,
    };

    private static WorldLogicFindingStatus? StatusOf(string? wire) => wire?.Trim().ToLowerInvariant() switch
    {
        "open" => WorldLogicFindingStatus.Open,
        "reviewing" => WorldLogicFindingStatus.Reviewing,
        "resolved" => WorldLogicFindingStatus.Resolved,
        "dismissed" => WorldLogicFindingStatus.Dismissed,
        _ => null,
    };

    /// <summary>Stored JSON passed through as JSON, so a condition is not double-encoded as a string.</summary>
    private static JsonElement? Raw(string? json) =>
        json is null ? null : JsonSerializer.Deserialize<JsonElement>(json);

    private static CallToolResult NotAllowed() =>
        Error("not_allowed", "Your role in this universe can only read, or this connection can't submit observations. Nothing was submitted.");

}
