using System.Security.Claims;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// A universe's reusable rule definitions, and the one list that reads them together with the world rules that
/// came before them (ADR 0072).
///
/// <b>A rule definition stands on its own.</b> It may belong to no System, or to several. Creating one does not
/// touch a System, and deleting one is refused while any System references it or any rule depends on it, with 409
/// <c>system_rule_in_use</c> naming what is in the way. There is no Trash for a rule definition: a refused delete
/// tells the author what to unlink, which is more useful than a row that disappeared into a second list.
///
/// <b>The condition is validated, never run, on save.</b> <see cref="ConditionSchema"/> matches every node kind,
/// operator, source, field and type against a closed set and enforces the static budgets, so a stored condition
/// can always be read. A tree the specification does not describe is refused with the specification's own error
/// code. Nothing here evaluates a condition: that is LOREX-018.
///
/// <b>Dependencies are declared, checked and acyclic.</b> A <c>ruleHolds</c> node may only name a rule in the
/// declared set, the set may only name rules of this universe, and a save that would close a cycle is refused.
/// A stored cycle would fail every rule on it at evaluation time with nothing an author could act on.
///
/// <b>Nothing here changes a world rule.</b> <c>/world-logic/rules</c> reads the <c>WorldRules</c> table without
/// writing it, and every world rule keeps its own id, its own routes and its own one check (ADR 0033, ADR 0034).
/// </summary>
public static class SystemRuleEndpoints
{
    /// <summary>The marker on the 409 for a save written over a rule definition that has since changed.</summary>
    public const string ChangedCode = "system_rule_changed";

    /// <summary>The marker on the 409 for a delete refused because something still references the rule.</summary>
    public const string InUseCode = "system_rule_in_use";

    /// <summary>Refused because the author dismissed a finding of this rule; resolving it is how they let it go.</summary>
    private const string HasDismissalsCode = "rule_has_dismissals";

    /// <summary>The marker on the 400 for a condition the specification does not describe. The body carries the code and path.</summary>
    public const string ConditionField = "condition";

    /// <summary>What <see cref="WorldLogicRuleRow.Source"/> says for each kind of rule.</summary>
    public const string WorldRuleSource = "worldRule";

    public const string SystemRuleSource = "systemRule";

    public static IEndpointRouteBuilder MapSystemRuleEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/system-rules")
            .WithTags("World Logic rules")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListSystemRules");
        group.MapPost("/", CreateAsync).WithName("CreateSystemRule");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetSystemRule");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateSystemRule");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteSystemRule");
        group.MapGet("/{id:guid}/revisions", RevisionsAsync).WithName("ListSystemRuleRevisions");
        group.MapPost("/{id:guid}/evaluate", EvaluateAsync).WithName("EvaluateSystemRule");

        endpoints.MapGet("/api/universes/{universeId:guid}/world-logic/rules", UnifiedAsync)
            .WithTags("World Logic rules")
            .WithName("ListWorldLogicRules")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? projectId = null,
        [FromQuery] bool universeScopeOnly = false,
        [FromQuery] Guid? systemId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorldLogicLimits.DefaultPageSize)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        (page, pageSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.SystemRules.AsNoTracking().Where(rule => rule.UniverseId == universeId);

        if (projectId is { } project)
        {
            query = query.Where(rule => rule.ProjectId == project);
        }
        else if (universeScopeOnly)
        {
            query = query.Where(rule => rule.ProjectId == null);
        }

        if (systemId is { } system)
        {
            query = query.Where(rule => db.LoreSystemRules.Any(link => link.SystemId == system && link.RuleId == rule.Id));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await query
            .OrderBy(rule => rule.Title.ToLower())
            .ThenBy(rule => rule.Title)
            .ThenBy(rule => rule.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(Projection(db))
            .ToListAsync(cancellationToken);

        return Results.Ok(new WorldLogicPage<SystemRuleSummary>(
            rows.Select(Summary).ToList(),
            page,
            pageSize,
            totalCount,
            WorldLogicAccess.TotalPages(totalCount, pageSize)));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var rule = await db.SystemRules.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        return rule is null ? Results.NotFound() : Results.Ok(await DetailAsync(db, rule, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] SystemRuleRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, request, cancellationToken);
    }

    /// <summary>
    /// The create itself, after the caller has decided the person may change World Logic. The route calls it, and so
    /// does an approved AI change (ADR 0047), so a rule proposed through review is written exactly as one typed in.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        SystemRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (request.ProjectId is { } projectId
            && !await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, projectId, cancellationToken))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["projectId"] = ["This universe has no such project."],
            });
        }

        var condition = request.Condition?.GetRawText();
        var exceptions = request.Exceptions?.GetRawText();
        int? schemaVersion = condition is null && exceptions is null
            ? null
            : request.SchemaVersion ?? ConditionSchema.CurrentVersion;

        if (Refuse(condition, exceptions, schemaVersion) is { } refused)
        {
            return refused;
        }

        var dependsOn = (request.DependsOn ?? []).Distinct().ToList();
        if (await DependencyProblemAsync(db, universeId, ruleId: null, dependsOn, condition, exceptions, cancellationToken)
            is { } dependencyErrors)
        {
            return Results.ValidationProblem(dependencyErrors);
        }

        var now = DateTime.UtcNow;
        var rule = new SystemRule
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Scope = request.ProjectId is null ? WorldLogicScope.Universe : WorldLogicScope.Project,
            ProjectId = request.ProjectId,
            Title = request.Title!.Trim(),
            Description = request.Description ?? string.Empty,
            SchemaVersion = schemaVersion,
            ConditionJson = condition,
            ExceptionsJson = exceptions,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.SystemRules.Add(rule);

        foreach (var dependency in dependsOn)
        {
            db.SystemRuleDependencies.Add(new SystemRuleDependency { RuleId = rule.Id, DependsOnRuleId = dependency });
        }

        db.SystemRuleRevisions.Add(Revision(rule, now));

        await db.SaveChangesAsync(cancellationToken);

        return Results.Created(
            $"/api/universes/{universeId}/system-rules/{rule.Id}",
            await DetailAsync(db, rule, cancellationToken));
    }

    /// <summary>
    /// Saves the rule whole: words, condition and declared dependencies together, under one version and one
    /// revision. The scope is fixed at creation, as a System's is.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid id,
        [FromBody] SystemRuleRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, id, request, cancellationToken);
    }

    /// <summary>The update itself, after the caller's change check; shared with an approved AI change, as the create is.</summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid id,
        SystemRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var rule = await db.SystemRules
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (rule is null)
        {
            return Results.NotFound();
        }

        if (request.ExpectedVersion != rule.Version)
        {
            return Changed();
        }

        if (request.ProjectId != rule.ProjectId)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["projectId"] = ["A rule stays in the scope it was created in."],
            });
        }

        var condition = request.Condition?.GetRawText();
        var exceptions = request.Exceptions?.GetRawText();
        int? schemaVersion = condition is null && exceptions is null
            ? null
            : request.SchemaVersion ?? ConditionSchema.CurrentVersion;

        if (Refuse(condition, exceptions, schemaVersion) is { } refusal)
        {
            return refusal;
        }

        var dependsOn = (request.DependsOn ?? []).Distinct().ToList();
        if (await DependencyProblemAsync(db, universeId, rule.Id, dependsOn, condition, exceptions, cancellationToken)
            is { } dependencyErrors)
        {
            return Results.ValidationProblem(dependencyErrors);
        }

        var title = request.Title!.Trim();
        var description = request.Description ?? string.Empty;

        var stored = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.RuleId == rule.Id)
            .Select(dependency => dependency.DependsOnRuleId)
            .ToListAsync(cancellationToken);

        var dependenciesChanged = stored.Count != dependsOn.Count || stored.Except(dependsOn).Any();

        if (rule.Title == title
            && rule.Description == description
            && rule.ConditionJson == condition
            && rule.ExceptionsJson == exceptions
            && rule.SchemaVersion == schemaVersion
            && !dependenciesChanged)
        {
            // A save that changes nothing writes nothing, as a world rule's does.
            return Results.Ok(await DetailAsync(db, rule, cancellationToken));
        }

        if (dependenciesChanged)
        {
            db.SystemRuleDependencies.RemoveRange(
                db.SystemRuleDependencies.Where(dependency => dependency.RuleId == rule.Id));

            foreach (var dependency in dependsOn)
            {
                db.SystemRuleDependencies.Add(new SystemRuleDependency
                {
                    RuleId = rule.Id,
                    DependsOnRuleId = dependency,
                });
            }
        }

        var now = DateTime.UtcNow;
        rule.Title = title;
        rule.Description = description;
        rule.SchemaVersion = schemaVersion;
        rule.ConditionJson = condition;
        rule.ExceptionsJson = exceptions;
        rule.Version++;
        rule.UpdatedAt = now;

        db.SystemRuleRevisions.Add(Revision(rule, now));

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await DetailAsync(db, rule, cancellationToken));
    }

    /// <summary>
    /// Deletes a rule definition, refused while anything still points at it. The message names the Systems and the
    /// rules in the way, because the author's next move is to unlink them.
    ///
    /// <b>A dismissed finding is in the way too</b> (Codex round 1 on #153). Every other finding of the rule is
    /// derived and goes with it, but a dismissal is the author's own decision that a finding needs no action, and
    /// it is the one part of the findings table a backup carries. Deleting the rule would discard that decision
    /// without saying so, so the route refuses and says how many there are; the author's next move is to resolve
    /// them, which is the explicit way to say the decision no longer matters.
    ///
    /// The refusal is this route's, not a foreign key's. The finding cascades from the rule in the database on
    /// purpose, so deleting a universe or a project is never blocked by one: a universe that cannot be deleted is a
    /// worse failure than a dismissal that goes with the project it was about.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var rule = await db.SystemRules
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (rule is null)
        {
            return Results.NotFound();
        }

        var systems = await db.LoreSystemRules.AsNoTracking()
            .Where(link => link.RuleId == id)
            .Select(link => new SystemReference(link.SystemId, link.LoreSystem!.Name))
            .ToListAsync(cancellationToken);

        var dependents = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.DependsOnRuleId == id)
            .Select(dependency => dependency.RuleId)
            .ToListAsync(cancellationToken);

        if (systems.Count > 0 || dependents.Count > 0)
        {
            return Results.Conflict(new
            {
                code = InUseCode,
                message = "This rule is still referenced. Unlink it from its Systems and its dependents first.",
                systems,
                dependentRuleIds = dependents,
            });
        }

        var dismissals = await db.WorldLogicFindings.AsNoTracking()
            .CountAsync(
                finding => finding.RuleId == id && finding.Status == WorldLogicFindingStatus.Dismissed,
                cancellationToken);

        if (dismissals > 0)
        {
            return Results.Conflict(new
            {
                code = HasDismissalsCode,
                message = "This rule has findings you chose to live with. Resolve them first, then delete the rule.",
                dismissedFindings = dismissals,
            });
        }

        db.SystemRules.Remove(rule);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> RevisionsAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.SystemRules.AsNoTracking()
                .AnyAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var rows = await db.SystemRuleRevisions.AsNoTracking()
            .Where(revision => revision.RuleId == id)
            .OrderByDescending(revision => revision.Version)
            .Select(revision => new
            {
                revision.Version,
                revision.SavedAt,
                revision.Title,
                revision.Description,
                HasCondition = revision.ConditionJson != null,
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(rows
            .Select(row => new WorldLogicRevisionRow(
                row.Version, WorldLogicAccess.Utc(row.SavedAt), row.Title, row.Description, row.HasCondition))
            .ToList());
    }

    /// <summary>
    /// Evaluates one rule against one target and answers what it found, storing nothing.
    ///
    /// <b>It reads, so reading is what it needs.</b> Nothing is written: no finding, no revision, no row of any
    /// kind, and the evaluator is a pure function of the universe's stored rules and stored lore. Recording a
    /// finding is LOREX-020, and it is a separate route with a separate capability for that reason.
    ///
    /// <b>The whole rule set is loaded, not just this rule.</b> A condition may name any rule it declared, and that
    /// rule may name others, so a run that loaded one rule could not answer <c>ruleHolds</c> at all.
    ///
    /// <paramref name="targetId"/> is the entry or moment <c>self</c> resolves to. A rule written with <c>self</c>
    /// and asked without a target answers unknown, which is the honest answer: the rule is fine, the question was
    /// incomplete.
    /// </summary>
    private static async Task<IResult> EvaluateAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? targetId = null,
        [FromQuery] Guid? projectId = null)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.SystemRules.AsNoTracking()
                .AnyAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var rules = await WorldLogicRuleSet.LoadAsync(db, universeId, cancellationToken);
        var facts = await UniverseConditionFacts.LoadAsync(db, universeId, cancellationToken);
        var evaluator = new WorldLogicEvaluator(facts, rules);

        var result = evaluator.Evaluate(id.ToString(), targetId?.ToString(), projectId?.ToString());

        return Results.Ok(new ConditionEvaluationResponse(
            id,
            result.RuleVersion,
            result.SchemaVersion,
            Outcome(result.Outcome),
            result.ErrorCode,
            result.ExemptionId,
            [.. result.Evidence.Select(item => new ConditionEvidenceRow(item.Source, item.Id, item.Role))],
            result.Rationale));
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

    /// <summary>
    /// Every rule the universe has, of both kinds, in one list by title: the world rules that came before ADR 0072
    /// and the rule definitions that came with it, each with its own id and the table it came from.
    ///
    /// This is the compatibility surface LOREX-017 promised, and it is read-only. A world rule's own routes are
    /// untouched and still authoritative for a world rule; this list exists so one screen can show both without
    /// either kind being rewritten into the other.
    ///
    /// Both sides are read whole and merged in memory rather than unioned in SQL, because the two shapes have
    /// nothing in common to union on and a universe's rules are counted in tens.
    /// shortcut: both lists are read whole before paging, so a universe with more rules than
    /// <see cref="WorldLogicLimits.MaxMergedRules"/> is reported truncated; page the two routes separately if that
    /// is ever reached.
    /// </summary>
    private static async Task<IResult> UnifiedAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorldLogicLimits.DefaultPageSize)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        (page, pageSize) = WorldLogicAccess.Paging(page, pageSize);

        var worldRules = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null)
            .Take(WorldLogicLimits.MaxMergedRules)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                Body = rule.Description,
                rule.CreatedAt,
                rule.UpdatedAt,
                HasCheck = rule.Validation != null,
            })
            .ToListAsync(cancellationToken);

        var systemRules = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId)
            .Take(WorldLogicLimits.MaxMergedRules)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                Body = rule.Description,
                rule.Scope,
                rule.ProjectId,
                rule.CreatedAt,
                rule.UpdatedAt,
                HasCondition = rule.ConditionJson != null,
            })
            .ToListAsync(cancellationToken);

        var merged = new List<WorldLogicRuleRow>(worldRules.Count + systemRules.Count);

        foreach (var rule in worldRules)
        {
            var (excerpt, shortened) = WorldLogicAccess.Excerpt(rule.Body);
            merged.Add(new WorldLogicRuleRow(
                rule.Id,
                WorldRuleSource,
                rule.Title,
                excerpt,
                shortened,
                rule.HasCheck,
                HasCondition: false,
                WorldLogicScope.Universe,
                ProjectId: null,
                WorldLogicAccess.Utc(rule.CreatedAt),
                WorldLogicAccess.Utc(rule.UpdatedAt)));
        }

        foreach (var rule in systemRules)
        {
            var (excerpt, shortened) = WorldLogicAccess.Excerpt(rule.Body);
            merged.Add(new WorldLogicRuleRow(
                rule.Id,
                SystemRuleSource,
                rule.Title,
                excerpt,
                shortened,
                HasCheck: false,
                rule.HasCondition,
                rule.Scope,
                rule.ProjectId,
                WorldLogicAccess.Utc(rule.CreatedAt),
                WorldLogicAccess.Utc(rule.UpdatedAt)));
        }

        // The same stable order both lists use on their own: case folded, then as written, then by id, so a world
        // rule and a rule definition of the same title never swap places between two reads.
        var ordered = merged
            .OrderBy(row => row.Title.ToLowerInvariant(), StringComparer.Ordinal)
            .ThenBy(row => row.Title, StringComparer.Ordinal)
            .ThenBy(row => row.Id)
            .ToList();

        var totalCount = ordered.Count;
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        return Results.Ok(new WorldLogicPage<WorldLogicRuleRow>(
            ordered.Skip(skip).Take(pageSize).ToList(),
            page,
            pageSize,
            totalCount,
            WorldLogicAccess.TotalPages(totalCount, pageSize)));
    }

    /// <summary>The rule rows one System references, in that System's own order.</summary>
    internal static async Task<IReadOnlyList<SystemRuleSummary>> SummariesOfSystemAsync(
        LorEvolveDbContext db,
        Guid systemId,
        CancellationToken cancellationToken)
    {
        var rows = await db.LoreSystemRules.AsNoTracking()
            .Where(link => link.SystemId == systemId)
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.Rule!.Title)
            .ThenBy(link => link.RuleId)
            .Select(link => new Row(
                link.Rule!.Id,
                link.Rule.Title,
                link.Rule.Description,
                link.Rule.Scope,
                link.Rule.ProjectId,
                link.Rule.ConditionJson != null,
                db.LoreSystemRules.Count(other => other.RuleId == link.RuleId),
                link.Rule.Version,
                link.Rule.CreatedAt,
                link.Rule.UpdatedAt))
            .ToListAsync(cancellationToken);

        return rows.Select(Summary).ToList();
    }

    private static System.Linq.Expressions.Expression<Func<SystemRule, Row>> Projection(LorEvolveDbContext db) =>
        rule => new Row(
            rule.Id,
            rule.Title,
            rule.Description,
            rule.Scope,
            rule.ProjectId,
            rule.ConditionJson != null,
            db.LoreSystemRules.Count(link => link.RuleId == rule.Id),
            rule.Version,
            rule.CreatedAt,
            rule.UpdatedAt);

    private static SystemRuleSummary Summary(Row row)
    {
        var (excerpt, shortened) = WorldLogicAccess.Excerpt(row.Description);
        return new SystemRuleSummary(
            row.Id,
            row.Title,
            excerpt,
            shortened,
            row.Scope,
            row.ProjectId,
            row.HasCondition,
            row.SystemCount,
            row.Version,
            WorldLogicAccess.Utc(row.CreatedAt),
            WorldLogicAccess.Utc(row.UpdatedAt));
    }

    internal static async Task<SystemRuleDetail> DetailAsync(
        LorEvolveDbContext db,
        SystemRule rule,
        CancellationToken cancellationToken)
    {
        var dependsOn = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.RuleId == rule.Id)
            .Select(dependency => dependency.DependsOnRuleId)
            .ToListAsync(cancellationToken);

        var systems = await db.LoreSystemRules.AsNoTracking()
            .Where(link => link.RuleId == rule.Id)
            .OrderBy(link => link.LoreSystem!.Name)
            .Select(link => new SystemReference(link.SystemId, link.LoreSystem!.Name))
            .ToListAsync(cancellationToken);

        JsonElement? condition = null;
        if (rule.ConditionJson is { } json)
        {
            // Parsed back out so a client reads the tree as JSON rather than as a string holding JSON. The stored
            // text is what was validated, so this never changes what the rule says.
            using var document = JsonDocument.Parse(json);
            condition = document.RootElement.Clone();
        }

        JsonElement? exceptions = null;
        if (rule.ExceptionsJson is { } exceptionsJson)
        {
            using var document = JsonDocument.Parse(exceptionsJson);
            exceptions = document.RootElement.Clone();
        }

        return new SystemRuleDetail(
            rule.Id,
            rule.Title,
            rule.Description,
            rule.Scope,
            rule.ProjectId,
            rule.SchemaVersion,
            condition,
            dependsOn,
            systems,
            rule.Version,
            WorldLogicAccess.Utc(rule.CreatedAt),
            WorldLogicAccess.Utc(rule.UpdatedAt),
            exceptions);
    }

    internal static Dictionary<string, string[]>? Validate(SystemRuleRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["title"] = ["Insert a title."];
        }
        else if (request.Title.Trim().Length > WorldLogicLimits.NameMaxLength)
        {
            errors["title"] =
            [
                $"A title is at most {WorldLogicAccess.Number(WorldLogicLimits.NameMaxLength)} characters.",
            ];
        }

        if ((request.Description?.Length ?? 0) > WorldLogicLimits.DescriptionMaxLength)
        {
            errors["description"] =
            [
                $"A description is at most {WorldLogicAccess.Number(WorldLogicLimits.DescriptionMaxLength)} characters.",
            ];
        }

        if (request.Condition is null && request.Exceptions is not null)
        {
            errors[ConditionField] = ["An exception belongs to a condition; this rule has none."];
        }

        if (request.Condition is null && request.Exceptions is null && request.SchemaVersion is not null)
        {
            errors[ConditionField] = ["A schema version belongs to a condition; this rule has none."];
        }

        if ((request.DependsOn?.Count ?? 0) > WorldLogicLimits.MaxDependenciesPerRule)
        {
            errors["dependsOn"] =
            [
                $"A rule declares at most {WorldLogicAccess.Number(WorldLogicLimits.MaxDependenciesPerRule)} dependencies.",
            ];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// The condition and the exceptions, each held to the specification, or null when both are acceptable. The
    /// exceptions are checked with the same closed sets and budgets, because the same evaluator reads them.
    /// </summary>
    internal static IResult? Refuse(string? condition, string? exceptions, int? schemaVersion) =>
        ConditionProblemOf(condition, exceptions, schemaVersion) is { } problem ? ConditionRefused(problem) : null;

    /// <summary>
    /// What <see cref="Refuse"/> refuses, as the specification's own problem: shared with AI Changes staging, which reports
    /// it as an issue on the change rather than as a response.
    /// </summary>
    internal static ConditionProblem? ConditionProblemOf(string? condition, string? exceptions, int? schemaVersion)
    {
        if (schemaVersion is not { } version)
        {
            return null;
        }

        if (condition is not null && ConditionSchema.Validate(condition, version) is { } problem)
        {
            return problem;
        }

        return exceptions is not null ? ConditionSchema.ValidateExceptions(exceptions, version) : null;
    }

    /// <summary>The sentence a refused condition carries, in the route's response and in an AI change's issue alike.</summary>
    internal static string ConditionMessage(ConditionProblem problem) =>
        $"This condition is not one the World Logic specification describes ({problem.Code} at {problem.Path}).";

    /// <summary>
    /// What is wrong with the declared dependencies, or null. Four things are checked, in this order, so the first
    /// message is the most basic mistake: every declared rule exists in this universe; the condition and the
    /// exceptions reference only declared rules; the declared set closes no cycle; and the chain is not deeper than
    /// the specification allows.
    /// </summary>
    internal static async Task<Dictionary<string, string[]>?> DependencyProblemAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? ruleId,
        IReadOnlyList<Guid> dependsOn,
        string? conditionJson,
        string? exceptionsJson,
        CancellationToken cancellationToken)
    {
        if (ruleId is { } self && dependsOn.Contains(self))
        {
            return Error("dependsOn", "A rule cannot depend on itself.");
        }

        if (dependsOn.Count > 0)
        {
            var known = await db.SystemRules.AsNoTracking()
                .Where(rule => rule.UniverseId == universeId && dependsOn.Contains(rule.Id))
                .Select(rule => rule.Id)
                .ToListAsync(cancellationToken);

            if (known.Count != dependsOn.Count)
            {
                return Error("dependsOn", "This universe has no such rule.");
            }
        }

        if (conditionJson is not null || exceptionsJson is not null)
        {
            var declared = dependsOn.Select(id => id.ToString()).ToHashSet(StringComparer.OrdinalIgnoreCase);

            var referencedIds = (conditionJson is null ? [] : ConditionSchema.ReferencedRuleIds(conditionJson))
                .Concat(exceptionsJson is null ? [] : ConditionSchema.ReferencedRuleIdsInExceptions(exceptionsJson));

            foreach (var referenced in referencedIds)
            {
                if (!declared.Contains(referenced))
                {
                    return Error(
                        ConditionField,
                        "A condition may only name a rule it declares as a dependency (undeclared_dependency).");
                }
            }
        }

        if (dependsOn.Count == 0)
        {
            return null;
        }

        // The whole universe's edges, with this rule's replaced by what is being saved. A universe has tens of
        // rules, so reading the edge list is cheaper than walking it a query at a time.
        var edges = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.Rule!.UniverseId == universeId)
            .Select(dependency => new { dependency.RuleId, dependency.DependsOnRuleId })
            .ToListAsync(cancellationToken);

        var graph = new Dictionary<Guid, List<Guid>>();
        foreach (var edge in edges)
        {
            if (ruleId is { } replaced && edge.RuleId == replaced)
            {
                continue;
            }

            if (!graph.TryGetValue(edge.RuleId, out var list))
            {
                graph[edge.RuleId] = list = [];
            }

            list.Add(edge.DependsOnRuleId);
        }

        var proposed = ruleId ?? Guid.NewGuid();
        graph[proposed] = dependsOn.ToList();

        if (ReachesItself(proposed, graph))
        {
            return Error("dependsOn", "These dependencies would close a cycle (dependency_cycle).");
        }

        return Depth(proposed, graph, []) > ConditionSchema.MaxDependencyDepth
            ? Error(
                "dependsOn",
                $"A dependency chain is at most {WorldLogicAccess.Number(ConditionSchema.MaxDependencyDepth)} deep.")
            : null;
    }

    private static bool ReachesItself(Guid start, Dictionary<Guid, List<Guid>> graph)
    {
        var seen = new HashSet<Guid>();
        var queue = new Queue<Guid>(graph.TryGetValue(start, out var first) ? first : []);

        while (queue.Count > 0)
        {
            var next = queue.Dequeue();
            if (next == start)
            {
                return true;
            }

            if (!seen.Add(next) || !graph.TryGetValue(next, out var dependencies))
            {
                continue;
            }

            foreach (var dependency in dependencies)
            {
                queue.Enqueue(dependency);
            }
        }

        return false;
    }

    private static int Depth(Guid start, Dictionary<Guid, List<Guid>> graph, HashSet<Guid> walking)
    {
        if (!walking.Add(start) || !graph.TryGetValue(start, out var dependencies) || dependencies.Count == 0)
        {
            return 0;
        }

        var deepest = dependencies.Max(dependency => Depth(dependency, graph, walking));
        walking.Remove(start);
        return deepest + 1;
    }

    private static SystemRuleRevision Revision(SystemRule rule, DateTime savedAt) => new()
    {
        RuleId = rule.Id,
        Version = rule.Version,
        Title = rule.Title,
        Description = rule.Description,
        SchemaVersion = rule.SchemaVersion,
        ConditionJson = rule.ConditionJson,
        ExceptionsJson = rule.ExceptionsJson,
        SavedAt = savedAt,
    };

    private static Dictionary<string, string[]> Error(string field, string message) => new() { [field] = [message] };

    /// <summary>
    /// A condition the specification does not describe, refused with the specification's own code and the path in
    /// the tree. The code is stable and never localised, so a client can say what is wrong in its own words.
    /// </summary>
    private static IResult ConditionRefused(ConditionProblem problem) =>
        Results.BadRequest(new
        {
            code = problem.Code,
            path = problem.Path,
            message = ConditionMessage(problem),
        });

    private static IResult Changed() => Results.Conflict(new
    {
        code = ChangedCode,
        message = "This rule changed since the edit began. Reload it and apply the change again.",
    });

    /// <summary>The flat shape both list routes project into before a summary is built from it.</summary>
    private sealed record Row(
        Guid Id,
        string Title,
        string Description,
        WorldLogicScope Scope,
        Guid? ProjectId,
        bool HasCondition,
        int SystemCount,
        int Version,
        DateTime CreatedAt,
        DateTime UpdatedAt);
}
