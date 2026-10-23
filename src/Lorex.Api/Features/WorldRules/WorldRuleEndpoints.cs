using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.WorldRules;

/// <summary>
/// A universe's world rules: explicit statements, in the author's own words, about how that world works (ADR 0033).
///
/// <b>Universe-scoped and gated, first and always.</b> Every route passes <see cref="UniverseAccess"/> (ADR 0041) before
/// anything is read, and finds a rule only by its id and that universe together - so another
/// account's universe, a rule of another universe and a guessed id all answer the same 404 as one that does not exist.
///
/// <b>A rule's words touch nothing.</b> No route passes the Canon promotion gate, reindexes lore or writes an entry,
/// relationship, moment, story, idea or revision, and a rule's words are never read for meaning. A rule that is words only
/// changes nothing else at all; the only other thing its save changes is the universe search's derived copy of the text, written by
/// a trigger (ADR 0031).
///
/// <b>A structured check is the exception, and only it.</b> A rule may carry one explicitly configured check (ADR 0034). Saving,
/// deleting or restoring a rule that has or gets one reconciles Canon Integrity in the same transaction, so the conflict list says
/// what the check now finds when the write lands. Nothing is refused on its account: the check is Medium.
///
/// <b>No silent overwrite.</b> A save names the <c>updatedAt</c> it was written over; when the rule has moved on since - saved
/// from another tab or device - it is refused with 409 <c>world_rule_changed</c> and nothing is written. The check is part of that
/// save. A save that would change nothing writes nothing.
///
/// <b>Deleted into the Trash, not destroyed.</b> Deleting marks the rule; it leaves every list and route and waits in the
/// universe's Trash, whose restore route (<see cref="RestoreAsync"/>) clears the mark. A rule in the Trash is never checked.
/// </summary>
public static class WorldRuleEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a rule that has since changed.</summary>
    public const string ChangedCode = "world_rule_changed";

    private const int DefaultPageSize = 50;
    private const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapWorldRuleEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/world-rules")
            .WithTags("World rules")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListWorldRules");
        group.MapPost("/", CreateAsync).WithName("CreateWorldRule");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetWorldRule");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateWorldRule");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteWorldRule");

        return endpoints;
    }

    /// <summary>
    /// A page of the universe's live rules, by title - case folded, then as written, then by id - so the order is stable and
    /// says nothing about which rule matters more. A row carries the start of the description, never all of it.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null);

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await query
            .OrderBy(rule => rule.Title.ToLower())
            .ThenBy(rule => rule.Title)
            .ThenBy(rule => rule.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                // SQLite counts characters here, never half of one, so a shortened description cannot end mid-character.
                Excerpt = rule.Description.Substring(0, WorldRuleLimits.ExcerptLength),
                IsShortened = rule.Description.Length > WorldRuleLimits.ExcerptLength,
                rule.CreatedAt,
                rule.UpdatedAt,
                HasCheck = rule.Validation != null,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(row => new WorldRuleSummary(
                row.Id, row.Title, row.Excerpt, row.IsShortened, Utc(row.CreatedAt), Utc(row.UpdatedAt), row.HasCheck))
            .ToList();

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new WorldRulePage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var rule = await db.WorldRules.AsNoTracking().FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
            cancellationToken);

        return rule is null ? Results.NotFound() : Results.Ok(await DetailAsync(db, universeId, rule, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] WorldRuleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonIntegrityEvaluator evaluator,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, evaluator, universeId, request, cancellationToken);
    }

    /// <summary>
    /// The create itself, shared with an approved AI change (ADR 0048). <paramref name="evaluator"/> is null when the caller
    /// reconciles Canon itself - an approval under the promotion gate does, once, for everything it applied. Access is the
    /// caller's.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorexDbContext db,
        CanonIntegrityEvaluator? evaluator,
        Guid universeId,
        WorldRuleRequest request,
        CancellationToken cancellationToken)
    {
        if (await ValidateAsync(db, universeId, request, cancellationToken) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        var rule = new WorldRule
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = request.Title!.Trim(),
            Description = request.Description ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now,
        };

        if (request.Validation is { } check)
        {
            RuleValidationInput.ApplyRule(db, rule, check);
        }

        db.WorldRules.Add(rule);
        await SaveAsync(db, evaluator, universeId, reconcile: rule.Validation is not null, cancellationToken);

        return Results.Created($"/api/universes/{universeId}/world-rules/{rule.Id}", await DetailAsync(db, universeId, rule, cancellationToken));
    }

    /// <summary>
    /// Saves the rule whole: title, description and check together. Refused while the rule has changed since the edit began.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid id,
        [FromBody] WorldRuleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonIntegrityEvaluator evaluator,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, evaluator, universeId, id, request, cancellationToken);
    }

    /// <summary>
    /// The save itself, shared with an approved AI change (ADR 0048), in the caller's transaction when it has one.
    /// <paramref name="evaluator"/> as for <see cref="CreateCoreAsync"/>. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorexDbContext db,
        CanonIntegrityEvaluator? evaluator,
        Guid universeId,
        Guid id,
        WorldRuleRequest request,
        CancellationToken cancellationToken)
    {
        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        // The rule before anything about the request is answered, so a rule of another universe is only ever a 404.
        var rule = await db.WorldRules
            .Include(candidate => candidate.Validation)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
                cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        if (await ValidateAsync(db, universeId, request, cancellationToken) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (!SameMoment(rule.UpdatedAt, request.ExpectedUpdatedAt))
        {
            return Changed(rule.UpdatedAt);
        }

        var title = request.Title!.Trim();
        var description = request.Description ?? string.Empty;
        var hadCheck = rule.Validation is not null;
        var sameCheck = request.Validation is not { } check || RuleValidationInput.SameRule(rule.Validation, check);

        if (!string.Equals(rule.Title, title, StringComparison.Ordinal)
            || !string.Equals(rule.Description, description, StringComparison.Ordinal)
            || !sameCheck)
        {
            rule.Title = title;
            rule.Description = description;

            if (request.Validation is { } changed)
            {
                RuleValidationInput.ApplyRule(db, rule, changed);
            }

            rule.UpdatedAt = DateTime.UtcNow;

            // A finding quotes the rule's title, so even a rename of a checked rule rewords what Canon says.
            await SaveAsync(db, evaluator, universeId, reconcile: hadCheck || rule.Validation is not null, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await DetailAsync(db, universeId, rule, cancellationToken));
    }

    /// <summary>
    /// Moves the rule to the universe's Trash, whole. Deleting a rule that is already there is refused as missing rather than
    /// re-stamped. A rule in the Trash is never checked, so a rule with a check has what it found resolved as it goes.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonIntegrityEvaluator evaluator,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await TrashCoreAsync(db, evaluator, universeId, id, cancellationToken);
    }

    /// <summary>
    /// The rule to the Trash, shared with an approved AI change (ADR 0048). <paramref name="evaluator"/> as for
    /// <see cref="CreateCoreAsync"/>. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> TrashCoreAsync(
        LorexDbContext db,
        CanonIntegrityEvaluator? evaluator,
        Guid universeId,
        Guid id,
        CancellationToken cancellationToken)
    {
        var rule = await db.WorldRules
            .Include(candidate => candidate.Validation)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
                cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        rule.DeletedAt = DateTime.UtcNow;
        await SaveAsync(db, evaluator, universeId, reconcile: rule.Validation is not null, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Brings a rule back from the Trash exactly as it was, check included, mapped by the Trash under its own typed route. Only the
    /// marker moves: titles are not unique, so nothing is renamed. A rule's words contribute no facts, so no Canon gate applies; a
    /// rule with a check is checked again from the moment it is back, and what it finds is reconciled in the same transaction. A
    /// rule of another universe, one not in the Trash, or a guessed id answers as missing.
    /// </summary>
    public static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid worldRuleId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonIntegrityEvaluator evaluator,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        var rule = await db.WorldRules
            .Include(candidate => candidate.Validation)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == worldRuleId && candidate.UniverseId == universeId && candidate.DeletedAt != null,
                cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        rule.DeletedAt = null;
        await SaveAsync(db, evaluator, universeId, reconcile: rule.Validation is not null, cancellationToken);

        return Results.Ok(await DetailAsync(db, universeId, rule, cancellationToken));
    }

    // ---------- Shaping and checks ----------

    /// <summary>
    /// Saves, and - only for a rule whose check is involved - reconciles Canon in the same transaction, joining the caller's when
    /// there is one. A rule that is words only reconciles nothing, exactly as before checks existed (ADR 0033). With no
    /// <paramref name="evaluator"/> the caller reconciles: an approval under the promotion gate (ADR 0048).
    /// </summary>
    private static async Task SaveAsync(
        LorexDbContext db,
        CanonIntegrityEvaluator? evaluator,
        Guid universeId,
        bool reconcile,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);

        if (reconcile && evaluator is not null)
        {
            await evaluator.EvaluateAsync(universeId, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    /// <summary>The rule, with its check and what the check finds now when it has one. A rule that is words only carries neither.</summary>
    private static async Task<WorldRuleDetail> DetailAsync(
        LorexDbContext db,
        Guid universeId,
        WorldRule rule,
        CancellationToken cancellationToken)
    {
        var count = (await WorldRuleOccurrences.CountAsync(db, universeId, rule.Id, cancellationToken)).SingleOrDefault();

        return new WorldRuleDetail(
            rule.Id,
            rule.Title,
            rule.Description,
            Utc(rule.CreatedAt),
            Utc(rule.UpdatedAt),
            count is null
                ? null
                : new WorldRuleValidationResponse(
                    count.Rule.Kind,
                    new ValidationTermReference(count.Rule.EventKindId, count.Rule.EventKindName),
                    new ValidationTermReference(count.Rule.MethodId, count.Rule.MethodName),
                    count.Rule.MaxOccurrences),
            count?.ToCheck());
    }

    /// <summary>
    /// The request's own shape - a title, text within its bounds - and, when a check is sent, that every part of it is there and
    /// belongs to this universe. Nothing about what the words say.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> ValidateAsync(
        LorexDbContext db,
        Guid universeId,
        WorldRuleRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            errors["title"] = ["Give the rule a title, so you can find it again."];
        }
        else if (title.Length > WorldRuleLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title to {WorldRuleLimits.TitleMaxLength} characters or fewer."];
        }

        if (request.Description is { Length: > WorldRuleLimits.DescriptionMaxLength })
        {
            errors["description"] = [$"Keep the description to {WorldRuleLimits.DescriptionMaxLength:N0} characters or fewer."];
        }

        if (request.Validation is { } check
            && await RuleValidationInput.ValidateRuleAsync(db, universeId, check, cancellationToken) is { } checkErrors)
        {
            foreach (var (key, messages) in checkErrors)
            {
                errors[key] = messages;
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>Compared as UTC ticks: SQLite hands a stored moment back with no kind, and JSON may carry it either way.</summary>
    private static bool SameMoment(DateTime stored, DateTime? expected) =>
        expected is { } moment && Utc(stored).Ticks == Utc(moment).Ticks;

    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>
    /// The refusal for a stale save. Carries the stored <c>updatedAt</c>, so a client whose author has seen the warning and
    /// still means to keep their own version can name it and save again - a decision made by a person, never by a retry.
    /// </summary>
    private static IResult Changed(DateTime current) =>
        Results.Problem(
            title: "World rule changed",
            detail: "This rule was saved somewhere else after it was opened here. Nothing was overwritten.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ChangedCode,
                ["updatedAt"] = Utc(current),
            });
}
